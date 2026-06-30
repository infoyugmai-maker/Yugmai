// YUGM AI authentication + session helpers.
// Uses the MODULAR Firebase SDK — all handles come from firebase-config.js
// which must be loaded first as <script type="module">.
//
// IMPORTANT: firebase-config.js uses top-level `await import(...)` which means
// its window globals (_auth, _db, etc.) are NOT available when this defer
// script runs. Every function that needs Firebase must first call or await
// waitForFirebase().

// ---------------------------------------------------------------------------
// Wait for firebase-config.js to populate window globals.
// Module scripts with top-level await do NOT block defer scripts, so we must
// poll or use the _firebaseReady promise.
// ---------------------------------------------------------------------------
function waitForFirebase() {
  // If already ready, resolve immediately
  if (window._auth && window._authModule && window._db && window._firestoreModule && window._storage && window._storageModule) {
    return Promise.resolve();
  }
  // If the module created a ready promise, use it
  if (window._firebaseReady) {
    return window._firebaseReady;
  }
  // Fallback: poll (module hasn't even started yet)
  return new Promise(function (resolve) {
    var check = setInterval(function () {
      if (window._auth && window._authModule && window._db && window._firestoreModule && window._storage && window._storageModule) {
        clearInterval(check);
        resolve();
      }
    }, 50);
  });
}

function getAuth() { return window._auth; }
function getDb() { return window._db; }
function getAuthModule() { return window._authModule; }
function getFirestoreModule() { return window._firestoreModule; }
function getStorageModule() { return window._storageModule; }
function getStorage() { return window._storage; }

// ---------------------------------------------------------------------------
// Admin allow-list. These emails are treated as admin automatically: they skip
// the freelancer/vendor/company question, get role "admin" on their profile,
// and are routed to the admin panel. This is the single source of truth on the
// client; it MUST stay in sync with isAdminEmail() in firestore.rules.
// To add/change an admin, edit this list AND the rules, then re-publish rules.
// ---------------------------------------------------------------------------
const ADMIN_EMAILS = ["info.yugmai@gmail.com"];

function isAdminEmail(email) {
  if (!email) return false;
  var e = String(email).toLowerCase();
  return ADMIN_EMAILS.some(function (a) { return a.toLowerCase() === e; });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function authError(code) {
  const map = {
    "auth/email-already-in-use": "An account with this email already exists.",
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/weak-password": "Password is too weak. Use at least 8 characters.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/popup-closed-by-user": "Google sign-in was cancelled.",
    "auth/too-many-requests": "Too many attempts. Please try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
    "auth/unauthorized-domain": "This domain is not authorized. Add localhost to Firebase Console > Authentication > Settings > Authorized domains.",
  };
  return map[code] || ("Something went wrong: " + String(code));
}

function validPassword(pw) {
  return pw.length >= 8 && /[A-Z]/.test(pw) && /[0-9]/.test(pw);
}

// ---------------------------------------------------------------------------
// Firestore user profile helpers (modular SDK)
// ---------------------------------------------------------------------------
async function getUserDoc(uid) {
  await waitForFirebase();
  const fs = getFirestoreModule();
  const snap = await fs.getDoc(fs.doc(getDb(), "users", uid));
  return snap.exists() ? snap.data() : null;
}

async function getUserProfile(uid) {
  await waitForFirebase();
  const fs = getFirestoreModule();
  const snap = await fs.getDoc(fs.doc(getDb(), "users", uid));
  return snap.exists() ? { id: snap.id, ...snap.data() } : null;
}

async function createUserProfile(uid, data) {
  await waitForFirebase();
  const fs = getFirestoreModule();
  return fs.setDoc(
    fs.doc(getDb(), "users", uid),
    {
      ...data,
      createdAt: fs.serverTimestamp(),
      updatedAt: fs.serverTimestamp(),
    },
    { merge: true }
  );
}

async function updateUserProfile(uid, data) {
  await waitForFirebase();
  const fs = getFirestoreModule();
  return fs.updateDoc(
    fs.doc(getDb(), "users", uid),
    { ...data, updatedAt: fs.serverTimestamp() }
  );
}

// ---------------------------------------------------------------------------
// Auth state listener (modular SDK wrapper, matches teanbris onAuthChange)
// Waits for Firebase to be ready before subscribing.
// ---------------------------------------------------------------------------
function onAuthChange(callback) {
  waitForFirebase().then(function () {
    getAuthModule().onAuthStateChanged(getAuth(), callback);
  });
}

// ---------------------------------------------------------------------------
// Sign-in audit log. Records every successful login for the admin Sign-in Logs
// screen. IP is best-effort; failures here must never block the user.
// ---------------------------------------------------------------------------
async function logSignIn(user, method) {
  try {
    await waitForFirebase();
    const fs = getFirestoreModule();
    let profile = null;
    try { profile = await getUserDoc(user.uid); } catch (e) { /* ignore */ }

    let ip = "";
    try {
      const r = await fetch("https://api.ipify.org?format=json");
      if (r.ok) ip = (await r.json()).ip || "";
    } catch (e) { /* offline / blocked - leave blank */ }

    await fs.addDoc(fs.collection(getDb(), "signinLogs"), {
      userId: user.uid,
      name: (profile && profile.name) || user.displayName || "",
      email: user.email || "",
      role: (profile && profile.role) || "",
      method: method,
      ip: ip,
      userAgent: navigator.userAgent || "",
      createdAt: fs.serverTimestamp(),
    });
  } catch (err) {
    console.warn("[auth] could not write sign-in log:", err.message);
  }
}

// Where to send a user after auth based on their role.
function routeForRole(role) {
  return role === "admin" ? "admin.html" : "portal.html";
}

async function redirectAfterAuth(user) {
  const profile = await getUserDoc(user.uid);
  if (!profile) {
    return false;
  }
  window.location.href = routeForRole(profile.role);
  return true;
}

// ---------------------------------------------------------------------------
// Email / password registration (modular SDK)
// ---------------------------------------------------------------------------
async function registerWithEmail({ name, email, phone, companyName, accountType, password }) {
  await waitForFirebase();
  const am = getAuthModule();
  const fs = getFirestoreModule();
  const cred = await am.createUserWithEmailAndPassword(getAuth(), email, password);
  await am.updateProfile(cred.user, { displayName: name });
  await fs.setDoc(fs.doc(getDb(), "users", cred.user.uid), {
    name,
    email,
    phone,
    companyName: companyName || "",
    role: isAdminEmail(email) ? "admin" : accountType,
    registeredVia: "email",
    createdAt: fs.serverTimestamp(),
  });
  return cred.user;
}

// ---------------------------------------------------------------------------
// Email / password login (modular SDK)
// ---------------------------------------------------------------------------
async function loginWithEmail(email, password) {
  await waitForFirebase();
  const am = getAuthModule();
  const cred = await am.signInWithEmailAndPassword(getAuth(), email, password);
  await logSignIn(cred.user, "email");
  return cred.user;
}

// ---------------------------------------------------------------------------
// Google sign-in (modular SDK, matching teanbris pattern).
// Uses popup directly. If popup fails with known codes, falls back to redirect.
// Returns { user, isNew }.
// ---------------------------------------------------------------------------
async function processGoogleUser(user) {
  let existing = await getUserDoc(user.uid);

  // Admin auto-provisioning
  if (isAdminEmail(user.email)) {
    const fs = getFirestoreModule();
    if (!existing || existing.role !== "admin") {
      await fs.setDoc(fs.doc(getDb(), "users", user.uid), {
        name: user.displayName || (existing && existing.name) || "Admin",
        email: user.email || "",
        role: "admin",
        registeredVia: "google",
        createdAt: (existing && existing.createdAt) || fs.serverTimestamp(),
      }, { merge: true });
      existing = await getUserDoc(user.uid);
    }
    await logSignIn(user, "google");
    return { user: user, isNew: false };
  }

  if (existing) await logSignIn(user, "google");
  return { user: user, isNew: !existing };
}

async function loginWithGoogle() {
  await waitForFirebase();
  const am = getAuthModule();
  const provider = new am.GoogleAuthProvider();
  provider.addScope("email");
  provider.addScope("profile");

  try {
    const result = await am.signInWithPopup(getAuth(), provider);
    return await processGoogleUser(result.user);
  } catch (err) {
    // Popup failed - fall back to redirect
    const fallbackCodes = [
      "auth/popup-closed-by-user",
      "auth/popup-blocked",
      "auth/cancelled-popup-request",
      "auth/internal-error",
    ];
    if (fallbackCodes.indexOf(err.code) !== -1) {
      await am.signInWithRedirect(getAuth(), provider);
      const e = new Error("redirecting");
      e.code = "auth/redirecting";
      throw e;
    }
    throw err;
  }
}

// Call on page load. If user just came back from a redirect sign-in, finish it.
async function handleRedirectResult() {
  try {
    await waitForFirebase();
    const am = getAuthModule();
    const result = await am.getRedirectResult(getAuth());
    if (result && result.user) {
      return await processGoogleUser(result.user);
    }
  } catch (err) {
    console.warn("[auth] redirect result error:", err.code, err.message);
  }
  return null;
}

async function completeGoogleProfile(user, { phone, accountType, companyName }) {
  await waitForFirebase();
  const fs = getFirestoreModule();
  await fs.setDoc(fs.doc(getDb(), "users", user.uid), {
    name: user.displayName || "",
    email: user.email || "",
    phone,
    companyName: companyName || "",
    role: isAdminEmail(user.email) ? "admin" : accountType,
    registeredVia: "google",
    createdAt: fs.serverTimestamp(),
  });
  await logSignIn(user, "google");
}

function logout() {
  return waitForFirebase().then(function () {
    return getAuthModule().signOut(getAuth()).then(function () { window.location.href = "index.html"; });
  });
}

// ---------------------------------------------------------------------------
// Route guard - call on protected pages.
//   guardPage("any")   -> any signed-in user, else -> login
//   guardPage("admin") -> admin only, else -> portal/login
// Invokes `onReady(user, profile)` when access is granted.
// ---------------------------------------------------------------------------
function guardPage(requirement, onReady) {
  onAuthChange(async (user) => {
    if (!user) {
      window.location.href = "login.html";
      return;
    }
    const profile = await getUserDoc(user.uid);
    const role = (profile && profile.role) || (isAdminEmail(user.email) ? "admin" : null);
    
    if (!role) {
      // Signed in but no profile or no role (incomplete signup / legacy user
      // who registered before portals existed) — send to complete registration.
      window.location.href = "register.html?complete=1";
      return;
    }
    if (requirement === "admin" && role !== "admin") {
      window.location.href = "portal.html";
      return;
    }
    
    if (requirement === "any" && role === "admin") {
      window.location.href = "admin.html";
      return;
    }
    
    // Auto-provision missing profile object so onReady doesn't fail
    const safeProfile = profile || { role: "admin", email: user.email, name: "Admin" };
    onReady(user, safeProfile);
  });
}

// Get a fresh ID token for authenticated API calls.
async function authHeader() {
  const user = getAuth().currentUser;
  if (!user) return {};
  const token = await user.getIdToken();
  return { Authorization: "Bearer " + token };
}

function fail(el, msg) {
  if (!el) return;
  el.style.color = "#ff8585";
  el.textContent = msg;
}

function setBusy(form, busy) {
  form.querySelectorAll("button, input, select, textarea").forEach(function (el) { el.disabled = busy; });
}

// ---------------------------------------------------------------------------
// Utility: get user initials (matching teanbris getInitials)
// ---------------------------------------------------------------------------
function getInitials(name) {
  if (!name) return "?";
  return name.split(" ").map(function (w) { return w[0]; }).join("").toUpperCase().slice(0, 2);
}

// ---------------------------------------------------------------------------
// Header auth state — show profile button when logged in
// ---------------------------------------------------------------------------
function initHeaderAuthState() {
  onAuthChange(async (user) => {
    var navActions = document.querySelector(".nav-actions");
    if (!navActions) return;

    var loginBtn = navActions.querySelector('a[href="login.html"]');
    var registerBtn = navActions.querySelector('a[href="register.html"]');

    if (user) {
      var profile = null;
      try { profile = await getUserDoc(user.uid); } catch (e) { /* ignore */ }
      var displayName = (profile && profile.name) || user.displayName || user.email.split("@")[0];
      var initials = getInitials(displayName);
      var role = (profile && profile.role) || (isAdminEmail(user.email) ? "admin" : null);
      var destination = role ? routeForRole(role) : "register.html?complete=1";

      // Hide login/register, show profile button
      if (loginBtn) loginBtn.style.display = "none";
      if (registerBtn) registerBtn.style.display = "none";

      // Don't add twice
      if (!navActions.querySelector("[data-profile-btn]")) {
        var profileBtn = document.createElement("a");
        profileBtn.href = destination;
        profileBtn.className = "btn btn-primary header-profile-btn";
        profileBtn.setAttribute("data-profile-btn", "");
        profileBtn.innerHTML =
          '<span class="header-profile-avatar">' + esc(initials) + '</span>' +
          '<span class="header-profile-name">' + esc(displayName) + '</span>';
        // Insert before mobile toggle
        var mobileToggle = navActions.querySelector(".mobile-toggle");
        if (mobileToggle) navActions.insertBefore(profileBtn, mobileToggle);
        else navActions.appendChild(profileBtn);
      }
    } else {
      // Show login/register
      if (loginBtn) loginBtn.style.display = "";
      if (registerBtn) registerBtn.style.display = "";
      var existing = navActions.querySelector("[data-profile-btn]");
      if (existing) existing.remove();
    }
  });
}

// ---------------------------------------------------------------------------
// Web Push - subscribe user, show permission banner, notification bell
// ---------------------------------------------------------------------------
async function initPush(user) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    await navigator.serviceWorker.register("/sw.js");
  } catch (e) { /* already registered or blocked */ }

  var dismissed = localStorage.getItem("yugmai_push_dismissed");
  if (dismissed && Date.now() - parseInt(dismissed, 10) < 7 * 24 * 60 * 60 * 1000) return;

  var permission = Notification.permission;
  if (permission === "granted") {
    subscribePush(user);
    return;
  }
  if (permission === "denied") return;

  showPushBanner(user);
}

function showPushBanner(user) {
  var existing = document.querySelector(".push-banner");
  if (existing) return;

  var banner = document.createElement("div");
  banner.className = "push-banner";
  banner.innerHTML =
    '<div class="push-banner-inner">' +
    '<div class="push-banner-copy">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" class="push-banner-icon">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>' +
    '</svg>' +
    '<div><strong>Stay updated with YUGM AI</strong>' +
    '<p>Get notified when new projects launch, your work is reviewed, or important updates are posted.</p></div>' +
    '</div>' +
    '<div class="push-banner-actions">' +
    '<button class="btn btn-primary btn-sm" data-push-allow>Get Notified</button>' +
    '<button class="btn btn-ghost btn-sm" data-push-dismiss>Not Now</button>' +
    '</div>' +
    '</div>';

  document.body.appendChild(banner);

  banner.querySelector("[data-push-allow]").addEventListener("click", async function () {
    var result = await Notification.requestPermission();
    if (result === "granted") {
      subscribePush(user);
      showPushConfirm("You are now subscribed to YUGM AI notifications.");
    }
    banner.remove();
  });

  banner.querySelector("[data-push-dismiss]").addEventListener("click", function () {
    localStorage.setItem("yugmai_push_dismissed", String(Date.now()));
    banner.remove();
  });
}

function showPushConfirm(msg) {
  var el = document.createElement("div");
  el.className = "push-banner";
  el.innerHTML = '<div class="push-banner-inner push-banner-confirm"><p>' + esc(msg) + '</p></div>';
  document.body.appendChild(el);
  setTimeout(function () { el.remove(); }, 4000);
}

async function subscribePush(user) {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;
  try {
    var reg = await navigator.serviceWorker.ready;
    var existing = await reg.pushManager.getSubscription();
    if (existing) {
      await savePushSubscription(existing, user);
      return;
    }
    var res = await fetch("/api/vapid-key");
    var data = await res.json();
    if (!data.publicKey) return;
    var sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(data.publicKey),
    });
    await savePushSubscription(sub, user);
  } catch (e) {
    console.warn("[push] subscribe failed:", e.message);
  }
}

async function savePushSubscription(sub, user) {
  try {
    var token = await user.getIdToken();
    await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify(sub.toJSON()),
    });
  } catch (e) { /* best effort */ }
}

function urlBase64ToUint8Array(base64String) {
  var padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  var base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  var rawData = atob(base64);
  var outputArray = new Uint8Array(rawData.length);
  for (var i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

// ---------------------------------------------------------------------------
// Notification bell (in-app) - loads last 20 notifications, unread count
// ---------------------------------------------------------------------------
function buildNotifBell(user) {
  var navActions = document.querySelector(".nav-actions");
  if (!navActions) return;

  var wrap = document.createElement("div");
  wrap.className = "notif-bell-wrap";
  wrap.innerHTML =
    '<button class="notif-bell" type="button" aria-label="Notifications">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path>' +
    '</svg>' +
    '<span class="notif-count hidden" data-notif-count>0</span>' +
    '</button>' +
    '<div class="notif-dropdown" data-notif-dropdown>' +
    '<div class="notif-dropdown-head">' +
    '<strong>Notifications</strong>' +
    '<button data-notif-mark-all>Mark all read</button>' +
    '</div>' +
    '<div data-notif-list><div class="notif-empty">No notifications yet.</div></div>' +
    '</div>';

  var logoutBtn = navActions.querySelector("[data-logout-btn]");
  if (logoutBtn) navActions.insertBefore(wrap, logoutBtn);
  else navActions.appendChild(wrap);

  var bell = wrap.querySelector(".notif-bell");
  var dropdown = wrap.querySelector("[data-notif-dropdown]");
  var countEl = wrap.querySelector("[data-notif-count]");
  var listEl = wrap.querySelector("[data-notif-list]");
  var markAllBtn = wrap.querySelector("[data-notif-mark-all]");

  bell.addEventListener("click", function (e) {
    e.stopPropagation();
    dropdown.classList.toggle("open");
    if (dropdown.classList.contains("open")) loadNotifs(user, listEl, countEl);
  });

  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) dropdown.classList.remove("open");
  });

  markAllBtn.addEventListener("click", async function () {
    var fs = getFirestoreModule();
    var unread = listEl.querySelectorAll(".notif-item.unread");
    for (var i = 0; i < unread.length; i++) {
      var nid = unread[i].dataset.notifId;
      if (nid) {
        await fs.setDoc(fs.doc(getDb(), "notificationReads", user.uid + "_" + nid), {
          userId: user.uid, notifId: nid,
          readAt: fs.serverTimestamp(),
        });
      }
    }
    loadNotifs(user, listEl, countEl);
  });

  loadNotifCount(user, countEl);
}

async function loadNotifCount(user, countEl) {
  try {
    var fs = getFirestoreModule();
    var q = fs.query(
      fs.collection(getDb(), "notifications"),
      fs.orderBy("createdAt", "desc")
    );
    var snap = await fs.getDocs(q);
    if (snap.empty) return;
    var readQ = fs.query(
      fs.collection(getDb(), "notificationReads"),
      fs.where("userId", "==", user.uid)
    );
    var readSnap = await fs.getDocs(readQ);
    var readIds = {};
    readSnap.forEach(function (d) { 
      var rd = d.data();
      readIds[rd.notifId] = rd.dismissed ? "dismissed" : true; 
    });
    var unread = 0;
    snap.forEach(function (d) { 
      var nStatus = readIds[d.id];
      if (nStatus !== "dismissed" && !nStatus) unread++; 
    });
    if (unread > 0) {
      countEl.textContent = unread > 9 ? "9+" : String(unread);
      countEl.classList.remove("hidden");
    } else {
      countEl.classList.add("hidden");
    }
  } catch (e) { /* ignore */ }
}

async function loadNotifs(user, listEl, countEl) {
  try {
    var fs = getFirestoreModule();
    var q = fs.query(
      fs.collection(getDb(), "notifications"),
      fs.orderBy("createdAt", "desc")
    );
    var snap = await fs.getDocs(q);
    var readQ = fs.query(
      fs.collection(getDb(), "notificationReads"),
      fs.where("userId", "==", user.uid)
    );
    var readSnap = await fs.getDocs(readQ);
    var readIds = {};
    readSnap.forEach(function (d) { 
      var rd = d.data();
      readIds[rd.notifId] = rd.dismissed ? "dismissed" : true; 
    });

    if (snap.empty) {
      listEl.innerHTML = '<div class="notif-empty">No notifications yet.</div>';
      countEl.classList.add("hidden");
      return;
    }

    var html = "";
    var unread = 0;
    snap.forEach(function (d) {
      var nStatus = readIds[d.id];
      if (nStatus === "dismissed") return;
      
      var n = d.data();
      var isRead = !!nStatus;
      if (!isRead) unread++;
      var audience = n.audience || "all";
      if (audience !== "all" && audience !== user.role) return;
      var cls = isRead ? "notif-item" : "notif-item unread";
      html += '<div class="' + cls + '" data-notif-id="' + d.id + '" data-notif-link="' + esc(n.link || "") + '">' +
        '<button class="notif-dismiss" data-dismiss-id="' + d.id + '" aria-label="Dismiss">&times;</button>' +
        '<span class="notif-item-title">' + esc(n.title || "") + '</span>' +
        '<span class="notif-item-body">' + esc(n.body || "") + '</span>' +
        '<span class="notif-item-time">' + fmtDate(n.createdAt) + '</span></div>';
    });

    if (!html) {
      listEl.innerHTML = '<div class="notif-empty">No notifications for your account type.</div>';
    } else {
      listEl.innerHTML = html;
      listEl.querySelectorAll(".notif-item").forEach(function (el) {
        el.addEventListener("click", async function () {
          var nid = el.dataset.notifId;
          var link = el.dataset.notifLink;
          var title = el.querySelector(".notif-item-title").textContent;
          var body = el.querySelector(".notif-item-body").textContent;
          var time = el.querySelector(".notif-item-time").textContent;
          
          if (nid && !readIds[nid]) {
            el.classList.remove("unread");
            await fs.setDoc(fs.doc(getDb(), "notificationReads", user.uid + "_" + nid), {
              userId: user.uid, notifId: nid,
              readAt: fs.serverTimestamp(),
            });
          }
          
          showNotificationModal(title, body, time, link);
          loadNotifs(user, listEl, countEl);
        });
      });
      
      listEl.querySelectorAll(".notif-dismiss").forEach(function (btn) {
        btn.addEventListener("click", async function (e) {
          e.stopPropagation();
          var nid = btn.dataset.dismissId;
          await fs.setDoc(fs.doc(getDb(), "notificationReads", user.uid + "_" + nid), {
            userId: user.uid, notifId: nid,
            dismissed: true,
            readAt: fs.serverTimestamp(),
          });
          loadNotifs(user, listEl, countEl);
        });
      });
    }

    if (unread > 0) {
      countEl.textContent = unread > 9 ? "9+" : String(unread);
      countEl.classList.remove("hidden");
    } else {
      countEl.classList.add("hidden");
    }
  } catch (e) {
    listEl.innerHTML = '<div class="notif-empty">Could not load notifications.</div>';
  }
}

// ---------------------------------------------------------------------------
// Send push via server (called from admin.js after writing notification doc)
// ---------------------------------------------------------------------------
async function sendPushToServer(title, body, link, audience, userId) {
  try {
    var user = getAuth().currentUser;
    if (!user) return;
    var token = await user.getIdToken();
    await fetch("/api/push", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": "Bearer " + token },
      body: JSON.stringify({ title, body, link, audience, userId }),
    });
  } catch (e) { /* best effort */ }
}

function showNotificationModal(title, body, time, link) {
  var overlay = document.createElement("div");
  overlay.className = "notif-modal-overlay";
  
  var modal = document.createElement("div");
  modal.className = "notif-modal";
  
  // Helper to escape HTML safely for the modal
  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }

  var html = '<div class="notif-modal-header">' +
             '<h3>' + escapeHTML(title) + '</h3>' +
             '<button class="notif-modal-close" aria-label="Close">&times;</button>' +
             '</div>' +
             '<div class="notif-modal-body">' +
             '<p class="notif-modal-time">' + escapeHTML(time) + '</p>' +
             '<p class="notif-modal-text">' + escapeHTML(body) + '</p>' +
             '</div>';
             
  if (link && link.trim() !== "") {
    html += '<div class="notif-modal-footer">' +
            '<a href="' + escapeHTML(link) + '" class="btn btn-primary">Open Link</a>' +
            '</div>';
  }
  
  modal.innerHTML = html;
  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  
  overlay.querySelector(".notif-modal-close").addEventListener("click", function() {
    if (document.body.contains(overlay)) document.body.removeChild(overlay);
  });
  
  overlay.addEventListener("click", function(e) {
    if (e.target === overlay) {
      if (document.body.contains(overlay)) document.body.removeChild(overlay);
    }
  });
}
window.showNotificationModal = showNotificationModal;
