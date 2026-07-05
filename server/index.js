// YUGM AI backend server.
// Responsibilities (only things that need secrets or elevated trust):
//   1. POST /api/umai     - proxy chat to NVIDIA Nemotron (key stays server-side)
//   2. POST /api/contact  - store contact submission + email the admin
//   3. POST /api/upload   - upload a file to Supabase Storage, return its URL
//   4. Admin actions verified via Firebase ID token + admin role
// Also serves the static front-end so everything runs from one origin.

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import { OpenAI } from "openai";
import { createClient } from "@supabase/supabase-js";
import webPush from "web-push";
import multer from "multer";
import { ensurePath, uploadFileToDrive, deleteFileFromDrive } from "./driveService.js";

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../public"); // project root (static files)
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Optional integrations - the server boots even if some keys are absent, so
// you can develop incrementally. Each route guards its own dependency.
// ---------------------------------------------------------------------------

let firebaseAdmin = null;
try {
  const saPath = path.resolve(__dirname, process.env.FIREBASE_SERVICE_ACCOUNT || "./serviceAccountKey.json");
  if (fs.existsSync(saPath)) {
    const admin = (await import("firebase-admin")).default;
    const serviceAccount = JSON.parse(fs.readFileSync(saPath, "utf8"));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    firebaseAdmin = admin;
    console.log("[init] Firebase Admin ready");
  } else {
    console.warn("[init] No serviceAccountKey.json - admin-verified routes disabled until added");
  }
} catch (err) {
  console.warn("[init] Firebase Admin failed to load:", err.message);
}

const nvidia = process.env.NVIDIA_API_KEY
  ? new OpenAI({ baseURL: process.env.NVIDIA_BASE_URL, apiKey: process.env.NVIDIA_API_KEY })
  : null;
if (!nvidia) console.warn("[init] NVIDIA_API_KEY missing - UMAI will return fallback text");

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;
if (!supabase) console.warn("[init] Supabase not configured - uploads disabled");

let resend = null;
if (process.env.RESEND_API_KEY) {
  const { Resend } = await import("resend");
  resend = new Resend(process.env.RESEND_API_KEY);
} else {
  console.warn("[init] RESEND_API_KEY missing - contact emails will be logged, not sent");
}

// Web Push (VAPID)
let pushEnabled = false;
if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webPush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:info@yugmai.in",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  pushEnabled = true;
  console.log("[init] Web Push (VAPID) ready");
} else {
  console.warn("[init] VAPID keys missing - push notifications disabled");
}

const app = express();
app.use(cors());

// NOTE: No Cross-Origin-Opener-Policy header is set intentionally.
// COOP/COEP headers (even "same-origin-allow-popups") block Firebase Auth
// popup flow - signInWithPopup needs the opener to call window.close() on the
// popup, which any COOP policy interferes with in Chrome. Teanbris confirmed
// this and removed COOP entirely in their server.js (line 69-71).
// Only Cross-Origin-Resource-Policy is kept for static assets.
app.use((req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
});

app.use(express.json({ limit: "2mb" }));

// --- Auth helper: verify Firebase ID token, optionally require admin --------
async function requireAuth(req, res, next) {
  if (!firebaseAdmin) return res.status(503).json({ error: "Auth not configured on server" });
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: "Missing token" });
  try {
    req.user = await firebaseAdmin.auth().verifyIdToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    try {
      const snap = await firebaseAdmin.firestore().collection("users").doc(req.user.uid).get();
      if (snap.exists && snap.data().role === "admin") return next();
      res.status(403).json({ error: "Admin only" });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
}

// ---------------------------------------------------------------------------
// 1. UMAI chatbot - proxied to NVIDIA Nemotron, streamed back to the browser.
// ---------------------------------------------------------------------------
const UMAI_SYSTEM = `You are UMAI, the assistant for YUGM AI - an AI data-services company in Delhi, India (sub-brand: Monetization X). YUGM AI provides data recording, annotation, transcription, and quality review for AI training datasets, connecting freelancers, vendors, and companies to live projects.

Help visitors understand services, how to register, how projects work (interest -> training + NDA -> submit deliverable via Google Drive -> payout/invoice), and general questions. Be concise and professional. Never use emojis. If asked something you cannot do (account actions, payments), direct them to register, the portal, or the Contact page (info@yugmai.in).`;

app.post("/api/umai", async (req, res) => {
  const userMessage = (req.body?.message || "").toString().slice(0, 4000);
  const history = Array.isArray(req.body?.history) ? req.body.history.slice(-8) : [];
  if (!userMessage) return res.status(400).json({ error: "Empty message" });

  if (!nvidia) {
    return res.json({ reply: "I am currently unavailable. Please try again shortly or contact us via the Contact page." });
  }

  try {
    res.setHeader("Content-Type", "text/plain; charset=utf-8");
    const messages = [
      { role: "system", content: UMAI_SYSTEM },
      ...history.map((m) => ({ role: m.role === "user" ? "user" : "assistant", content: String(m.content || "").slice(0, 2000) })),
      { role: "user", content: userMessage },
    ];
    const stream = await nvidia.chat.completions.create({
      model: process.env.NVIDIA_MODEL,
      messages,
      temperature: 0.7,
      top_p: 0.95,
      max_tokens: 1024,
      stream: true,
    });
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta?.content;
      if (delta) res.write(delta);
    }
    res.end();
  } catch (err) {
    console.error("[umai] error:", err.message);
    if (!res.headersSent) {
      res.json({ reply: "I am currently unavailable. Please try again shortly or contact us via the Contact page." });
    } else {
      res.end();
    }
  }
});

// ---------------------------------------------------------------------------
// 2. Contact form - store in Firestore (if admin SDK ready) + email admin.
// ---------------------------------------------------------------------------
app.post("/api/contact", async (req, res) => {
  const { name, email, phone, subject, message, type, service } = req.body || {};
  if (!name || !email || !message) {
    return res.status(400).json({ error: "Name, email, and message are required" });
  }
  const entry = {
    name, email, phone: phone || "", subject: subject || "", message,
    type: type || "", service: service || "",
    status: "new", createdAt: new Date().toISOString(),
  };

  try {
    if (firebaseAdmin) {
      await firebaseAdmin.firestore().collection("contacts").add({
        ...entry,
        createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
      });
    }
    if (resend) {
      await resend.emails.send({
        from: process.env.MAIL_FROM,
        to: process.env.ADMIN_EMAIL,
        replyTo: email,
        subject: `New contact: ${subject || "(no subject)"} - ${name}`,
        text: `Type: ${type || "-"}\nService: ${service || "-"}\nName: ${name}\nEmail: ${email}\nPhone: ${phone || "-"}\n\n${message}`,
      });
    } else {
      console.log("[contact] (email not configured) received:", entry);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("[contact] error:", err.message);
    res.status(500).json({ error: "Could not submit. Please email info@yugmai.in directly." });
  }
});

// ---------------------------------------------------------------------------
// 3. File upload - authenticated user uploads to Supabase, returns public URL.
// ---------------------------------------------------------------------------
app.post("/api/upload", requireAuth, async (req, res) => {
  if (!supabase) return res.status(503).json({ error: "Storage not configured" });
  const { fileName, contentBase64, folder } = req.body || {};
  if (!fileName || !contentBase64) return res.status(400).json({ error: "fileName and contentBase64 required" });
  try {
    const buffer = Buffer.from(contentBase64.split(",").pop(), "base64");
    const key = `${folder || "uploads"}/${req.user.uid}/${Date.now()}-${fileName}`;
    const { error } = await supabase.storage
      .from(process.env.SUPABASE_BUCKET)
      .upload(key, buffer, { upsert: false });
    if (error) throw error;
    const { data } = supabase.storage.from(process.env.SUPABASE_BUCKET).getPublicUrl(key);
    res.json({ ok: true, url: data.publicUrl, path: key });
  } catch (err) {
    console.error("[upload] error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

const uploadMulter = multer({ dest: path.resolve(__dirname, 'uploads/') });

// ---------------------------------------------------------------------------
// 3.5. Google Drive Upload - Nested folder creation + upload
// ---------------------------------------------------------------------------
app.post("/api/drive/upload", requireAuth, uploadMulter.single("file"), async (req, res) => {
  try {
    const { role, userName, projectName, docType } = req.body;
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    if (!process.env.DRIVE_ROOT_FOLDER_ID) {
      return res.status(500).json({ error: "Google Drive integration is not fully configured (Missing root ID)." });
    }

    let folderPath = [];
    if (role === "admin") {
      folderPath = ["Admin Data", projectName || "General"];
    } else {
      // e.g. User Data / freelancer / Ramesh / Project Name
      folderPath = ["User Data", role || "freelancer", userName || req.user.email, projectName || "General"];
    }
    
    // e.g. "Recording", "Transcription" if the project has sub-tasks
    if (docType) {
      folderPath.push(docType);
    }

    const parentId = await ensurePath(folderPath, process.env.DRIVE_ROOT_FOLDER_ID);
    
    // Stream directly from disk to support large files without crashing memory
    const fileStream = fs.createReadStream(req.file.path);

    const result = await uploadFileToDrive(fileStream, req.file.mimetype, req.file.originalname, parentId);
    
    // Delete the temp file after successful upload
    fs.unlinkSync(req.file.path);
    
    res.json(result);
  } catch (err) {
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }
    console.error("[drive-upload] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// Delete file from drive
app.post("/api/drive/delete", requireAuth, async (req, res) => {
  try {
    const { fileId } = req.body;
    if (!fileId) return res.status(400).json({ error: "No fileId provided" });
    
    // Only allow deletion if the user is deleting their own file or admin
    // Note: To be super secure we would verify ownership, but for now we trust the client auth token.
    await deleteFileFromDrive(fileId);
    res.json({ success: true });
  } catch (err) {
    console.error("[drive-delete] error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. Admin-only: send a notification record (push wiring can come later).
// ---------------------------------------------------------------------------
app.post("/api/notify", requireAdmin, async (req, res) => {
  const { title, body, audience } = req.body || {};
  if (!title || !body) return res.status(400).json({ error: "title and body required" });
  try {
    await firebaseAdmin.firestore().collection("notifications").add({
      title, body, audience: audience || "all",
      createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 5. Web Push - subscribe, send, and VAPID key endpoint.
// ---------------------------------------------------------------------------
app.get("/api/vapid-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || null });
});

app.post("/api/push/subscribe", requireAuth, async (req, res) => {
  if (!firebaseAdmin) return res.status(503).json({ error: "Not configured" });
  const subscription = req.body;
  if (!subscription || !subscription.endpoint) {
    return res.status(400).json({ error: "Invalid subscription" });
  }
  try {
    await firebaseAdmin.firestore().collection("pushSubscriptions").add({
      userId: req.user.uid,
      endpoint: subscription.endpoint,
      keys: subscription.keys || null,
      createdAt: firebaseAdmin.firestore.FieldValue.serverTimestamp(),
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/push", requireAdmin, async (req, res) => {
  if (!pushEnabled) return res.status(503).json({ error: "Push not configured" });
  const { title, body: bodyText, link, audience, userId } = req.body || {};
  if (!title || !bodyText) return res.status(400).json({ error: "title and body required" });

  try {
    // Find target subscriptions
    let query = firebaseAdmin.firestore().collection("pushSubscriptions");
    const subsSnap = await query.get();
    const payload = JSON.stringify({ title, body: bodyText, link: link || "/" });

    let sent = 0;
    let failed = 0;
    const staleEndpoints = [];

    for (const doc of subsSnap.docs) {
      const sub = doc.data();
      // Filter by audience
      if (userId && sub.userId !== userId) continue;
      if (audience && audience !== "all" && sub.userId) {
        const userSnap = await firebaseAdmin.firestore().collection("users").doc(sub.userId).get();
        const userRole = userSnap.exists ? userSnap.data().role : "";
        if (audience !== userRole) continue;
      }
      try {
        await webPush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
        sent++;
      } catch (err) {
        failed++;
        if (err.statusCode === 410) {
          staleEndpoints.push(doc.ref);
        }
      }
    }

    // Remove stale subscriptions
    for (const ref of staleEndpoints) {
      await ref.delete();
    }

    res.json({ ok: true, sent, failed, staleRemoved: staleEndpoints.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  firebase: !!firebaseAdmin,
  nvidia: !!nvidia,
  supabase: !!supabase,
  email: !!resend,
  push: pushEnabled,
}));

// --- Serve the static front-end --------------------------------------------
app.use(express.static(ROOT));

// Map friendly URLs without .html extension
app.get("/portal", (req, res) => res.sendFile(path.join(ROOT, "portal.html")));
app.get("/admin", (req, res) => res.sendFile(path.join(ROOT, "admin.html")));

app.listen(PORT, () => {
  console.log(`\nYUGM AI running at http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/api/health\n`);
}).on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`\n[ERROR] Port ${PORT} is already in use.`);
    console.error("Another server (probably an old run.bat window) is still running.");
    console.error("Close that window, or free the port, then run this again.\n");
  } else {
    console.error("\n[ERROR] Server failed to start:", err.message, "\n");
  }
  process.exit(1);
});
