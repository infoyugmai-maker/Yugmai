document.addEventListener("DOMContentLoaded", function () {
  var nav = document.querySelector(".primary-nav");
  var toggle = document.querySelector(".mobile-toggle");
  var navLinks = document.querySelectorAll(".primary-nav a");
  var currentPage = window.location.pathname.split("/").pop() || "index.html";

  navLinks.forEach(function (link) {
    var href = link.getAttribute("href");
    var parts = href.split("#");
    var linkPage = parts[0] || "index.html";
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
  var page = window.location.pathname.split("/").pop() || "index.html";
  var publicPages = ["index.html", "contact.html", ""];
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
        '<p>' + escapeHtml(p.description || "") + '</p>' +
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
});
