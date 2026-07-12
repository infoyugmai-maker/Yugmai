document.addEventListener("DOMContentLoaded", function () {
  var nav = document.querySelector(".primary-nav");
  var toggle = document.querySelector(".mobile-toggle");
  var navLinks = document.querySelectorAll(".primary-nav a");
  var currentRaw = window.location.pathname.split("/").pop();
  var currentPage = (currentRaw && currentRaw !== "index.html") ? currentRaw.replace(".html", "") : "index.html";

  navLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    var parts = href.split("#");
    var linkPageRaw = parts[0] || "index.html";
    var linkPage = (linkPageRaw && linkPageRaw !== "/" && linkPageRaw !== "index.html") ? linkPageRaw.replace("/", "").replace(".html", "") : "index.html";
    var hash = parts[1];
    if (linkPage === currentPage && (!hash || hash === "home")) {
      link.classList.add("active");
    }
  });

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var isOpen = nav.classList.toggle("open");
      document.body.classList.toggle("menu-open", isOpen);
      toggle.setAttribute("aria-expanded", String(isOpen));
    });

    navLinks.forEach(function (link) {
      link.addEventListener("click", function () {
        nav.classList.remove("open");
        document.body.classList.remove("menu-open");
        toggle.setAttribute("aria-expanded", "false");
      });
    });
  }

  var revealItems = document.querySelectorAll("[data-reveal]");
  if ("IntersectionObserver" in window) {
    var observer = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.14 }
    );
    revealItems.forEach(function (item) { observer.observe(item); });
  } else {
    revealItems.forEach(function (item) { item.classList.add("is-visible"); });
  }

  buildAssistant();
  buildFloatingShortcuts();
  loadLiveProjects();

  // Initialize header auth state on public pages (shows profile button if logged in)
  if (typeof initHeaderAuthState === "function") {
    initHeaderAuthState();
  }
});

// ---------------------------------------------------------------------------
// Shared text escaping helpers
// ---------------------------------------------------------------------------
function esc(str) {
  return escapeHtml(str);
}

function fmtDate(ts) {
  if (!ts) return "--";
  try {
    var date = ts.toDate ? ts.toDate() : new Date(ts);
    return date.toLocaleString("en-IN", {
      timeZone: "Asia/Kolkata",
      day: "2-digit", month: "short", year: "numeric",
      hour: "2-digit", minute: "2-digit", hour12: true,
    });
  } catch (e) { return "--"; }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ---------------------------------------------------------------------------
// Custom UI Dialogs (Replacing prompt, confirm, alert)
// ---------------------------------------------------------------------------
window.uiAlert = function(msg) {
  return showCustomModal("Alert", msg, null, false);
};

window.uiHtmlAlert = function(title, htmlContent) {
  return new Promise(function(resolve) {
    var overlay = document.createElement("div");
    overlay.className = "notif-modal-overlay";
    var modal = document.createElement("div");
    modal.className = "notif-modal";
    
    var html = '<div class="notif-modal-header"><h3>' + escapeHtml(title) + '</h3></div>';
    html += '<div class="notif-modal-body" style="padding-bottom:0;">' + htmlContent + '</div>';
    html += '<div class="notif-modal-footer">';
    html += '<button class="btn btn-primary" id="custom-ok">OK</button></div>';
    
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    var okBtn = modal.querySelector("#custom-ok");
    if (okBtn) okBtn.focus();
    
    var resolved = false;
    function cleanup() {
      if (!resolved) {
        resolved = true;
        document.body.removeChild(overlay);
        resolve(true);
      }
    }
    
    if (okBtn) okBtn.onclick = cleanup;
  });
};

window.uiConfirm = function(msg) {
  return showCustomModal("Confirm", msg, null, true);
};

window.uiPrompt = function(msg, defaultText) {
  return showCustomModal("Input Required", msg, defaultText || "", true, true);
};

window.uiAssignCreds = function(currentCreds) {
  return new Promise(function(resolve) {
    var overlay = document.createElement("div");
    overlay.className = "notif-modal-overlay";
    var modal = document.createElement("div");
    modal.className = "notif-modal";
    var cStr = currentCreds || "";
    var existingId = cStr.split(" / ")[0] || cStr;
    var existingPass = cStr.split(" / ")[1] || "";
    
    modal.innerHTML = 
      '<div class="notif-modal-header"><h3>Assign Credentials</h3></div>' +
      '<div class="notif-modal-body">' +
      '<p style="margin-bottom:1rem;">Enter the ID and Password for this freelancer to use on the external platform.</p>' +
      '<div class="field"><label style="margin-bottom:0.5rem;display:block;">User ID / Username</label><input type="text" id="cred-id" value="' + escapeHtml(existingId) + '" style="width:100%;padding:10px;border-radius:4px;border:1px solid var(--line);background:var(--ink-3);color:var(--white);"></div>' +
      '<div class="field" style="margin-top:1rem;"><label style="margin-bottom:0.5rem;display:block;">Password</label><input type="text" id="cred-pass" value="' + escapeHtml(existingPass) + '" style="width:100%;padding:10px;border-radius:4px;border:1px solid var(--line);background:var(--ink-3);color:var(--white);"></div>' +
      '</div>' +
      '<div class="notif-modal-footer">' +
      '<button class="btn btn-ghost" id="cred-cancel" style="margin-right:1rem;">Cancel</button>' +
      '<button class="btn btn-primary" id="cred-save">Save Credentials</button>' +
      '</div>';
    
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    modal.querySelector("#cred-cancel").onclick = function() {
      cleanup();
      resolve(null);
    };
    modal.querySelector("#cred-save").onclick = function() {
      var id = modal.querySelector("#cred-id").value.trim();
      var pass = modal.querySelector("#cred-pass").value.trim();
      cleanup();
      if (!id && !pass) resolve("");
      else resolve(id + (pass ? " / " + pass : ""));
    };

    function cleanup() {
      document.body.removeChild(overlay);
    }
  });
};

function showCustomModal(title, msg, defaultText, showCancel, isPrompt) {
  return new Promise(function(resolve) {
    var overlay = document.createElement("div");
    overlay.className = "notif-modal-overlay";
    var modal = document.createElement("div");
    modal.className = "notif-modal";
    
    var html = '<div class="notif-modal-header"><h3>' + escapeHtml(title) + '</h3></div>';
    html += '<div class="notif-modal-body"><p style="margin-bottom:1rem;">' + escapeHtml(msg).replace(/\n/g, '<br>') + '</p>';
    if (isPrompt) {
      html += '<div class="field"><input type="text" id="custom-prompt-input" value="' + escapeHtml(defaultText) + '" style="width:100%;padding:10px;border-radius:4px;border:1px solid var(--line);background:var(--ink-3);color:var(--white);"></div>';
    }
    html += '</div>';
    
    html += '<div class="notif-modal-footer">';
    if (showCancel) {
      html += '<button class="btn btn-ghost" id="custom-cancel" style="margin-right:1rem;">Cancel</button>';
    }
    html += '<button class="btn btn-primary" id="custom-ok">OK</button></div>';
    
    modal.innerHTML = html;
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    
    var input = modal.querySelector("#custom-prompt-input");
    if (input) {
      setTimeout(function() { input.focus(); }, 100);
    }

    var cancelBtn = modal.querySelector("#custom-cancel");
    if (cancelBtn) {
      cancelBtn.onclick = function() { cleanup(); resolve(isPrompt ? null : false); };
    }
    modal.querySelector("#custom-ok").onclick = function() {
      var val = isPrompt ? (input ? input.value.trim() : "") : true;
      cleanup();
      resolve(val);
    };

    function cleanup() {
      document.body.removeChild(overlay);
    }
  });
}

// ---------------------------------------------------------------------------
// UMAI chatbot - streams from the real NVIDIA Nemotron backend
// ---------------------------------------------------------------------------
function buildAssistant() {
  var launcher = document.createElement("button");
  launcher.className = "chat-launcher";
  launcher.type = "button";
  launcher.setAttribute("aria-label", "Open UMAI assistant");
  launcher.innerHTML =
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M7 16h7l4 4v-4h1a3 3 0 0 0 3-3V7a3 3 0 0 0-3-3H5a3 3 0 0 0-3 3v6a3 3 0 0 0 3 3h2z"></path>' +
    '</svg><span>Ask UMAI</span>';

  var chat = document.createElement("section");
  chat.className = "chat-window";
  chat.setAttribute("aria-label", "UMAI assistant chat");
  chat.innerHTML =
    '<div class="chat-header">' +
    '<div class="chat-title"><span class="status-dot" aria-hidden="true"></span>' +
    '<div><strong>UMAI Assistant</strong><span>YUGM AI service guide</span></div></div>' +
    '<button class="chat-close" type="button" aria-label="Close UMAI assistant">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6 6 18"></path></svg></button></div>' +
    '<div class="chat-body" data-chat-body>' +
    '<div class="chat-message bot">Hello. I can help with YUGM AI services, data workflows, contributor onboarding, and contact details.</div>' +
    '<div class="chat-quick-actions">' +
    '<button class="chat-quick-btn" data-quick="What services does YUGM AI offer?">Services</button>' +
    '<button class="chat-quick-btn" data-quick="How do I join a project as a contributor?">Join Project</button>' +
    '<button class="chat-quick-btn" data-quick="What is the delivery process?">Process</button>' +
    '<button class="chat-quick-btn" data-quick="How can I contact YUGM AI?">Contact</button>' +
    '</div></div>' +
    '<form class="chat-input-row" data-chat-form>' +
    '<input data-chat-input type="text" placeholder="Ask about services or projects" autocomplete="off" aria-label="Message UMAI">' +
    '<button type="submit" aria-label="Send message">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M5 12h14m-6-6 6 6-6 6"></path></svg></button></form>' +
    '<div class="chat-footer">Powered by UMAI</div>';

  document.body.append(launcher, chat);

  var close = chat.querySelector(".chat-close");
  var form = chat.querySelector("[data-chat-form]");
  var input = chat.querySelector("[data-chat-input]");
  var body = chat.querySelector("[data-chat-body]");
  var history = [];

  launcher.addEventListener("click", function () {
    chat.classList.toggle("open");
    if (chat.classList.contains("open")) {
      setTimeout(function () { input.focus(); }, 140);
    }
  });

  close.addEventListener("click", function () {
    chat.classList.remove("open");
    launcher.focus();
  });

  // Quick action buttons (like teanbris)
  var quickBtns = chat.querySelectorAll("[data-quick]");
  quickBtns.forEach(function (btn) {
    btn.addEventListener("click", function () {
      input.value = btn.dataset.quick;
      form.dispatchEvent(new Event("submit"));
      // Hide quick actions after first use
      var actionsDiv = chat.querySelector(".chat-quick-actions");
      if (actionsDiv) actionsDiv.style.display = "none";
    });
  });

  form.addEventListener("submit", async function (event) {
    event.preventDefault();
    var text = input.value.trim();
    if (!text) return;

    // Hide quick actions on first message
    var actionsDiv = chat.querySelector(".chat-quick-actions");
    if (actionsDiv) actionsDiv.style.display = "none";

    addChatMessage(body, text, "user");
    history.push({ role: "user", content: text });
    input.value = "";
    input.disabled = true;

    var bubble = document.createElement("div");
    bubble.className = "chat-message bot typing";
    bubble.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
    body.appendChild(bubble);
    body.scrollTop = body.scrollHeight;

    try {
      var reply = await streamUmai(text, history, bubble, body);
      history.push({ role: "assistant", content: reply });
      if (history.length > 16) history = history.slice(-16);
    } catch (err) {
      bubble.classList.remove("typing");
      bubble.textContent = "I am currently unavailable. Please try again shortly or contact us via the Contact page.";
    } finally {
      input.disabled = false;
      input.focus();
    }
  });
}

async function streamUmai(message, history, bubble, body) {
  // Hardcoded fallback logic as requested by user (instant replies)
  return new Promise(function(resolve) {
    setTimeout(function() {
      var lowerMsg = message.toLowerCase();
      var reply = "I am Umai, the YUGM AI assistant. I can help you understand our data operations, workflows, and annotation services. How can I assist you today?";
      
      if (lowerMsg.includes("pricing") || lowerMsg.includes("cost")) {
        reply = "Our pricing scales based on the volume and complexity of the dataset. For custom quotes, please reach out via our **Contact page**.";
      } else if (lowerMsg.includes("register") || lowerMsg.includes("join") || lowerMsg.includes("freelancer")) {
        reply = "You can join as a freelancer or vendor by clicking the **Register** button at the top. We review all applications within 48 hours.";
      } else if (lowerMsg.includes("service") || lowerMsg.includes("workflow")) {
        reply = "We offer four core services:\n- **Data Recording**\n- **Annotation**\n- **Transcription**\n- **Quality Assurance**\n\nWhich one are you interested in?";
      }
      
      bubble.classList.remove("typing");
      bubble.innerHTML = formatBotMessage(reply);
      body.scrollTop = body.scrollHeight;
      resolve(reply);
    }, 1000);
  });
}

// Simple markdown formatting for bot messages (like teanbris)
function formatBotMessage(text) {
  if (!text) return "";
  return text
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/\n- /g, "<br>- ")
    .replace(/\n/g, "<br>");
}

function addChatMessage(body, text, sender) {
  var message = document.createElement("div");
  message.className = "chat-message " + sender;
  message.textContent = text;
  body.appendChild(message);
  body.scrollTop = body.scrollHeight;
}

// ---------------------------------------------------------------------------
// Floating action shortcuts - bottom-right on public pages
// ---------------------------------------------------------------------------
function buildFloatingShortcuts() {
  var currentRaw = window.location.pathname.split("/").pop();
  var page = (currentRaw && currentRaw !== "index.html") ? currentRaw.replace(".html", "") : "index.html";
  var publicPages = ["index.html", "contact", ""];
  if (publicPages.indexOf(page) === -1) return;

  var wrap = document.createElement("div");
  wrap.className = "fab-wrap";
  wrap.innerHTML =
    '<button class="fab-trigger" type="button" aria-label="Quick actions">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M12 4v16m8-8H4"></path></svg>' +
    '</button>' +
    '<div class="fab-actions">' +
    '<a class="fab-pill" href="contact.html">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>' +
    '</svg>Request Plan</a>' +
    '<a class="fab-pill" href="register.html">' +
    '<svg aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">' +
    '<path stroke-linecap="round" stroke-linejoin="round" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"></path>' +
    '</svg>Work With Us</a>' +
    '</div>';

  document.body.appendChild(wrap);

  var trigger = wrap.querySelector(".fab-trigger");
  var actions = wrap.querySelector(".fab-actions");
  trigger.addEventListener("click", function () {
    actions.classList.toggle("open");
  });
  document.addEventListener("click", function (e) {
    if (!wrap.contains(e.target)) actions.classList.remove("open");
  });
}

// ---------------------------------------------------------------------------
// Live projects loader - pulls active projects from Firestore onto homepage
// Uses modular SDK via window globals set by firebase-config.js
// ---------------------------------------------------------------------------
async function loadLiveProjects() {
  var grid = document.querySelector("[data-live-projects]");
  if (!grid) return;

  // Wait for firebase-config.js to be ready
  var attempts = 0;
  while (!window._firestoreModule && attempts < 40) {
    await new Promise(function (r) { setTimeout(r, 100); });
    attempts++;
  }
  if (!window._firestoreModule) return;

  var fs = window._firestoreModule;
  var db = window._db;

  try {
    var q = fs.query(
      fs.collection(db, "projects"),
      fs.where("status", "in", ["active", "upcoming"]),
      fs.limit(6)
    );
    var snap = await fs.getDocs(q);

    if (snap.empty) {
      grid.innerHTML = '<div style="grid-column: 1 / -1; padding: 40px; text-align: center; color: var(--muted); border: 1px dashed var(--line); border-radius: var(--radius-lg);"><p>There are currently no live projects. Check back soon!</p></div>';
      return;
    }

    var cards = [];
    snap.forEach(function (doc) {
      var p = doc.data();
      var langs = Array.isArray(p.languages) ? p.languages.join(", ") : "";
      var statusLabel = (p.status || "active").toUpperCase();
      cards.push(
        '<article class="project-card">' +
        '<div><div class="project-meta">' +
        '<span class="project-tag">' + escapeHtml(p.workType || "Project") + '</span>' +
        '<span class="status-chip"><span class="status-dot"></span>' + escapeHtml(statusLabel) + '</span>' +
        '</div><h3>' + escapeHtml(p.name || "Untitled project") + '</h3>' +
        '<p class="project-desc" data-desc-id="' + doc.id + '">' + escapeHtml(p.description || "") + '</p>' +
        '<a class="read-more-link" data-read-more="' + doc.id + '">Read more</a>' +
        (langs ? '<p class="project-langs">' + escapeHtml(langs) + '</p>' : '') +
        '</div>' +
        '<a class="btn btn-outline" href="register.html">Join Project</a>' +
        '</article>'
      );
    });
    grid.innerHTML = cards.join("");
  } catch (err) {
    console.warn("Could not load live projects:", err.message);
  }
}

// ---------------------------------------------------------------------------
// CountUp logic for homepage stats
// ---------------------------------------------------------------------------
function initCountUp() {
  const elements = document.querySelectorAll('.count-up');
  if (elements.length === 0) return;

  const observer = new IntersectionObserver((entries, obs) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const el = entry.target;
        const target = parseInt(el.getAttribute('data-target'), 10);
        const duration = 2000;
        const frameDuration = 1000 / 60;
        const totalFrames = Math.round(duration / frameDuration);
        let frame = 0;
        
        // Easing out cubic
        const easeOut = t => (--t) * t * t + 1;

        const counter = setInterval(() => {
          frame++;
          const progress = easeOut(frame / totalFrames);
          const currentCount = Math.round(target * progress);

          if (parseInt(el.innerHTML, 10) !== currentCount) {
            el.innerHTML = currentCount;
          }

          if (frame === totalFrames) {
            clearInterval(counter);
            el.innerHTML = target;
          }
        }, frameDuration);
        
        obs.unobserve(el);
      }
    });
  }, { threshold: 0.1 });

  elements.forEach(el => observer.observe(el));
}

document.addEventListener('DOMContentLoaded', () => {
  initCountUp();

  // Scroll Reveal Observer
  var reveals = document.querySelectorAll("[data-reveal]");
  if (reveals.length) {
    var revObs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revObs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1 });
    reveals.forEach((r) => revObs.observe(r));
  }

  // Spotlight cards
  var cards = document.querySelectorAll(".card, .ops-card, .service-card, .process-card, .project-card");
  cards.forEach((card) => {
    card.addEventListener("mousemove", (e) => {
      var rect = card.getBoundingClientRect();
      var x = e.clientX - rect.left;
      var y = e.clientY - rect.top;
      card.style.setProperty("--mouse-x", x + "px");
      card.style.setProperty("--mouse-y", y + "px");
    });
  });

  // Global listener for "Read More" links on project cards (Home page)
  document.body.addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-read-more]");
    if (!btn) return;
    
    var originalText = btn.textContent;
    btn.textContent = "Loading...";

    var projectId = btn.dataset.readMore;
    try {
      if (!window._firestoreModule || !window._db) throw new Error("Firestore not initialized");
      var fs = window._firestoreModule;
      var db = window._db;
      
      var pDoc = await fs.getDoc(fs.doc(db, "projects", projectId));
      if (!pDoc.exists()) throw new Error("Not found");
      var p = pDoc.data();
      
      var overlay = document.createElement("div");
      overlay.className = "full-screen-modal-overlay";
      var content = document.createElement("div");
      content.className = "full-screen-modal-content";
      content.innerHTML = '<h2>' + escapeHtml(p.name || "Details") + '</h2>' +
        '<div style="white-space:pre-wrap; margin-top:20px; line-height:1.6;">' + escapeHtml(p.description || "") + '</div>' +
        '<div style="margin-top:30px; text-align:right;"><button class="btn btn-outline" onclick="this.closest(\'.full-screen-modal-overlay\').remove()">Close</button></div>';
      btn.textContent = originalText;
      overlay.appendChild(content);
      document.body.appendChild(overlay);
    } catch (err) {
      console.error(err);
      alert("Could not load project details.");
      btn.textContent = originalText;
    }
  });
});

// ---------------------------------------------------------------------------
// Follow-Us Announcement Banner — shows once every 24 hours
// ---------------------------------------------------------------------------
(function () {
  var STORAGE_KEY = "yugmai_followus_dismissed";
  var INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours

  var lastDismissed = parseInt(localStorage.getItem(STORAGE_KEY) || "0", 10);
  if (Date.now() - lastDismissed < INTERVAL_MS) return; // Already shown today

  // Wait a few seconds after page load so it doesn't interrupt the user
  setTimeout(function () {
    var banner = document.createElement("div");
    banner.id = "followus-banner";
    banner.innerHTML =
      '<div class="followus-inner">' +
        '<p>🚀 <strong>Stay Updated!</strong> Follow YUGM AI on our socials for the latest projects & opportunities.</p>' +
        '<div class="followus-btns">' +
          '<a href="https://www.linkedin.com/company/yugm-ai/" target="_blank" rel="noopener noreferrer" class="followus-btn followus-linkedin">' +
            '<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/></svg>' +
            ' LinkedIn</a>' +
          '<a href="https://www.instagram.com/yugm_ai/" target="_blank" rel="noopener noreferrer" class="followus-btn followus-instagram">' +
            '<svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>' +
            ' Instagram</a>' +
        '</div>' +
        '<button class="followus-close" aria-label="Dismiss">&times;</button>' +
      '</div>';

    // Inject styles
    var style = document.createElement("style");
    style.textContent =
      '#followus-banner{position:fixed;bottom:0;left:0;right:0;z-index:9999;background:linear-gradient(135deg,#0b1d3a 0%,#0a2e5c 100%);border-top:1px solid rgba(84,163,255,0.3);padding:0;transform:translateY(100%);animation:followus-slidein .5s cubic-bezier(.4,0,.2,1) forwards;animation-delay:.3s;opacity:0}' +
      '@keyframes followus-slidein{to{transform:translateY(0);opacity:1}}' +
      '.followus-inner{max-width:1200px;margin:0 auto;display:flex;align-items:center;justify-content:center;gap:1.25rem;padding:14px 24px;flex-wrap:wrap}' +
      '.followus-inner p{color:#e0e6ed;font-size:.95rem;margin:0;font-family:"Outfit",sans-serif}' +
      '.followus-btns{display:flex;gap:.6rem}' +
      '.followus-btn{display:inline-flex;align-items:center;gap:6px;padding:8px 18px;border-radius:100px;text-decoration:none;font-weight:600;font-size:.8rem;transition:transform .2s,box-shadow .2s;font-family:"Outfit",sans-serif}' +
      '.followus-btn:hover{transform:translateY(-2px)}' +
      '.followus-linkedin{background:#0a66c2;color:#fff;box-shadow:0 2px 12px rgba(10,102,194,.3)}' +
      '.followus-instagram{background:linear-gradient(45deg,#f09433,#e6683c,#dc2743,#cc2366,#bc1888);color:#fff;box-shadow:0 2px 12px rgba(220,39,67,.3)}' +
      '.followus-close{background:none;border:none;color:#8b949e;font-size:1.5rem;cursor:pointer;padding:4px 8px;line-height:1;transition:color .2s}' +
      '.followus-close:hover{color:#fff}' +
      '@media(max-width:600px){.followus-inner{flex-direction:column;text-align:center;gap:.75rem}.followus-btns{justify-content:center}}';
    document.head.appendChild(style);
    document.body.appendChild(banner);

    banner.querySelector(".followus-close").addEventListener("click", function () {
      localStorage.setItem(STORAGE_KEY, String(Date.now()));
      banner.style.animation = "none";
      banner.style.transition = "transform .3s ease, opacity .3s ease";
      banner.style.transform = "translateY(100%)";
      banner.style.opacity = "0";
      setTimeout(function () { banner.remove(); }, 350);
    });
  }, 3000);
})();
