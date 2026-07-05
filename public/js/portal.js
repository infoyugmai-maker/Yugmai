// ---------------------------------------------------------------------------
// Modular SDK compatibility shim. portal.js was written against the compat SDK
// (db.collection(...), firebase.firestore.FieldValue.serverTimestamp()). Rather
// than rewriting 900+ lines, we build thin wrappers that look like compat API
// but delegate to the modular SDK underneath.
// ---------------------------------------------------------------------------
(function waitForFirebase() {
  if (!window._db || !window._firestoreModule) {
    setTimeout(waitForFirebase, 80);
    return;
  }

  // Build a compat-like "db" wrapper
  var _fs = window._firestoreModule;
  var _realDb = window._db;

  function wrapQuery(q) {
    return {
      where: function (field, op, value) { return wrapQuery(_fs.query(q, _fs.where(field, op, value))); },
      orderBy: function (field, dir) { return wrapQuery(_fs.query(q, _fs.orderBy(field, dir || "asc"))); },
      limit: function (n) { return wrapQuery(_fs.query(q, _fs.limit(n))); },
      limitToLast: function (n) { return wrapQuery(_fs.query(q, _fs.limitToLast(n))); },
      get: function () { return _fs.getDocs(q).then(wrapSnap); },
      onSnapshot: function (cb) { return _fs.onSnapshot(q, function (snap) { cb(wrapSnap(snap)); }); },
    };
  }

  function wrapSnap(snap) {
    var docs = [];
    snap.forEach(function (d) { docs.push(wrapDocSnap(d)); });
    return {
      empty: snap.empty,
      size: snap.size,
      docs: docs,
      forEach: function (cb) { docs.forEach(cb); },
      docChanges: function () {
        if (typeof snap.docChanges === "function") {
          return snap.docChanges().map(function (c) {
            return { type: c.type, doc: wrapDocSnap(c.doc) };
          });
        }
        return [];
      },
    };
  }

  function wrapDocSnap(d) {
    return { id: d.id, exists: d.exists(), data: function () { return d.data(); }, ref: _fs.doc(_realDb, d.ref.path) };
  }

  function wrapDocRef(ref) {
    return {
      get: function () { return _fs.getDoc(ref).then(wrapDocSnap); },
      set: function (data, opts) { return _fs.setDoc(ref, data, opts || {}); },
      update: function (data) { return _fs.updateDoc(ref, data); },
      delete: function () { return _fs.deleteDoc(ref); },
      collection: function (sub) { return wrapCollection(_fs.collection(ref, sub)); },
    };
  }

  function wrapCollection(colRef) {
    var q = wrapQuery(colRef);
    q.doc = function (id) { return wrapDocRef(_fs.doc(colRef, id)); };
    q.add = function (data) { return _fs.addDoc(colRef, data); };
    return q;
  }

  window.db = {
    collection: function (name) { return wrapCollection(_fs.collection(_realDb, name)); },
  };

  // Build firebase.firestore.FieldValue shim
  window.firebase = window.firebase || {};
  window.firebase.firestore = window.firebase.firestore || {};
  window.firebase.firestore.FieldValue = {
    serverTimestamp: function () { return _fs.serverTimestamp(); },
    arrayUnion: function () { return _fs.arrayUnion.apply(null, arguments); },
    arrayRemove: function () { return _fs.arrayRemove.apply(null, arguments); },
    increment: function (n) { return _fs.increment(n); },
    delete: function () { return _fs.deleteField(); },
  };

  // Now init the page
  document.addEventListener("DOMContentLoaded", function () {
    guardPage("any", function (user, profile) {
      initPortal(user, profile);
    });
  });

  // If DOMContentLoaded already fired
  if (document.readyState !== "loading") {
    guardPage("any", function (user, profile) {
      initPortal(user, profile);
    });
  }
})();


function initPortal(user, profile) {
  var welcomeTitle = document.querySelector("[data-welcome-title]");
  var userNameEl = document.querySelector("[data-user-name]");
  if (welcomeTitle) welcomeTitle.textContent = "Welcome, " + (profile.name || user.email);
  if (userNameEl) userNameEl.textContent = profile.name || user.email;
  
  var banner = document.getElementById("profile-completion-banner");
  if (banner) {
    if (!profile.languages || !profile.skills || profile.languages.length === 0) {
      banner.style.display = "block";
    } else {
      banner.style.display = "none";
    }
  }

  var logoutBtn = document.querySelector("[data-logout-btn]");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // Push + notification bell
  initPush(user);
  buildNotifBell(user);

  // Tabs
  var tabs = document.querySelectorAll("[data-portal-tabs] .portal-tab");
  var panels = document.querySelectorAll(".portal-panel");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      panels.forEach(function (p) { p.classList.add("hidden"); });
      tab.classList.add("active");
      var panel = document.querySelector('[data-panel="' + tab.dataset.tab + '"]');
      if (panel) panel.classList.remove("hidden");
    });
  });

  loadAvailableProjects(user, profile);
  loadMyProjects(user, profile);
  loadMessages(user, profile);
  loadPortalOverview(user, profile);
  loadSubmitWork(user, profile);
  loadProfile(user, profile);
  loadPortalPayments(user, profile);

  // Unread messages badge
  var msgTab = document.querySelector('[data-tab="messages"]');
  if (msgTab) {
    db.collection("messages").doc(user.uid).onSnapshot(function(doc) {
      if (doc.exists) {
        var unread = doc.data().unreadUser || 0;
        if (unread > 0) {
          msgTab.innerHTML = 'Messages <span class="badge" style="background:#ff4757;color:#fff;border-radius:12px;padding:2px 6px;font-size:0.75rem;margin-left:4px;">' + unread + '</span>';
        } else {
          msgTab.innerHTML = 'Messages';
        }
      }
    });
  }

  // Global listener for "Read More" buttons on project cards
  document.body.addEventListener("click", async function (e) {
    var btn = e.target.closest("[data-read-more]");
    if (!btn) return;
    
    var originalText = btn.textContent;
    btn.textContent = "Loading...";

    var projectId = btn.dataset.readMore;
    try {
      var pDoc = await db.collection("projects").doc(projectId).get();
      if (!pDoc.exists) throw new Error("Not found");
      var p = pDoc.data();
      
      var overlay = document.createElement("div");
      overlay.className = "full-screen-modal-overlay";
      var content = document.createElement("div");
      content.className = "full-screen-modal-content";
      content.innerHTML = '<h2>' + esc(p.name || "Details") + '</h2>' +
        '<div style="white-space:pre-wrap; margin-top:20px; line-height:1.6;">' + esc(p.description || "") + '</div>' +
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
}

// ---------------------------------------------------------------------------
// Overview - 4 stat cards + recent projects
// ---------------------------------------------------------------------------
async function loadPortalOverview(user, profile) {
  var statsEl = document.querySelector("[data-portal-stats]");
  var recentEl = document.querySelector("[data-portal-recent]");
  if (!statsEl) return;

  try {
    var results = await Promise.all([
      db.collection("projects").where("status", "in", ["active", "upcoming"]).get(),
      db.collection("participations").where("userId", "==", user.uid).get(),
      db.collection("submissions").where("userId", "==", user.uid).get(),
    ]);
    var available = results[0], parts = results[1], subs = results[2];

    var completed = 0;
    parts.forEach(function (d) {
      var s = d.data().status || "";
      if (s === "completed" || s === "invoice-submitted") completed++;
    });
    var pendingReview = 0;
    subs.forEach(function (d) { if ((d.data().status || "") === "pending-review") pendingReview++; });

    var cards = [
      ["Available Projects", available.size],
      ["Projects Joined", parts.size],
      ["Completed Projects", completed],
      ["Pending Review", pendingReview],
    ];
    statsEl.innerHTML = cards.map(function (c) {
      return '<article class="stat-card"><span class="stat-value">' + c[1] +
        '</span><span class="stat-label">' + esc(c[0]) + '</span></article>';
    }).join("");

    // Recent projects
    if (recentEl) {
      if (available.empty) {
        recentEl.innerHTML = '<p class="section-copy">No projects available right now.</p>';
      } else {
        var html = "";
        var count = 0;
        available.forEach(function (doc) {
          if (count >= 4) return;
          count++;
          var p = doc.data();
          var langs = Array.isArray(p.languages) ? p.languages.join(", ") : "";
          html +=
            '<article class="project-card">' +
            '<div><div class="project-meta">' +
            '<span class="project-tag">' + esc(p.workType || "Project") + '</span>' +
            '<span class="status-chip"><span class="status-dot"></span>' + esc((p.status || "active").toUpperCase()) + '</span>' +
            '</div><h3>' + esc(p.name || "Untitled") + '</h3>' +
            '<p class="project-desc" data-desc-id="' + doc.id + '">' + esc(p.description || "") + '</p>' +
            '<a class="read-more-link" data-read-more="' + doc.id + '">Read more</a>' +
            (langs ? '<p class="project-langs">Languages: ' + esc(langs) + '</p>' : '') +
            '</div></article>';
        });
        recentEl.innerHTML = html;
      }
    }
  } catch (err) {
    statsEl.innerHTML = '<p class="section-copy">Could not load overview: ' + esc(err.message) + '</p>';
  }
}

// ---------------------------------------------------------------------------
// Submit Work - dedicated form + history
// ---------------------------------------------------------------------------
async function loadSubmitWork(user, profile) {
  var form = document.querySelector("[data-submitwork-form]");
  if (!form) return;
  var select = document.getElementById("sw-project");
  var status = document.querySelector("[data-submitwork-status]");

  // Populate the project dropdown with projects the user has joined.
  try {
    var partSnap = await db.collection("participations").where("userId", "==", user.uid).get();
    var seen = {};
    var opts = "";
    var ids = [];
    partSnap.forEach(function (d) {
      var pid = d.data().projectId;
      if (pid && !seen[pid]) { seen[pid] = true; ids.push(pid); }
    });
    for (var i = 0; i < ids.length; i++) {
      try {
        var pSnap = await db.collection("projects").doc(ids[i]).get();
        var nm = pSnap.exists ? (pSnap.data().name || "Untitled") : ids[i];
        opts += '<option value="' + esc(ids[i]) + '">' + esc(nm) + '</option>';
      } catch (e) { /* skip */ }
    }
    if (opts) select.innerHTML = '<option value="">Select a joined project</option>' + opts;
    else select.innerHTML = '<option value="">Join a project first</option>';
  } catch (err) { /* leave default */ }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var projectId = select.value;
    var hours = document.getElementById("sw-hours").value;
    var fileInput = document.getElementById("sw-file");
    var label = document.getElementById("sw-label").value.trim();
    var workType = document.getElementById("sw-type").value;
    var notes = document.getElementById("sw-notes").value.trim();

    if (!projectId) { fail(status, "Please select a project you have joined."); return; }
    if (!hours || !fileInput || fileInput.files.length === 0) { fail(status, "Hours and a work file are required."); return; }

    setBusy(form, true);
    status.style.color = "";
    status.textContent = "Uploading file (this may take a moment for large files)...";
    var link = "";
    try {
      var projName = select.options[select.selectedIndex].text;
      var fData = new FormData();
      fData.append("file", fileInput.files[0]);
      fData.append("role", profile.role || "freelancer");
      fData.append("userName", profile.name || user.email);
      fData.append("projectName", projName);
      fData.append("docType", workType || "Work Done");
      
      var tk = await user.getIdToken();
      var uRes = await fetch("/api/drive/upload", { method: "POST", headers: { "Authorization": "Bearer " + tk }, body: fData });
      if (!uRes.ok) throw new Error("File upload failed.");
      var uj = await uRes.json();
      link = uj.link;
      
      status.textContent = "Saving submission...";
      await db.collection("submissions").add({
        userId: user.uid,
        projectId: projectId,
        label: label,
        workType: workType,
        hours: hours,
        driveLink: link,
        notes: notes,
        status: "pending-review",
        submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      status.style.color = "#85ffaa";
      status.textContent = "Submitted for review.";
      form.reset();
      document.getElementById("sw-label").value = "New Session";
      loadSubmitHistory(user);
      loadPortalOverview(user, profile);
    } catch (err) {
      fail(status, err.message);
    } finally {
      setBusy(form, false);
    }
  });

  loadSubmitHistory(user);
}

let unsubSubmitHistory = null;

async function loadSubmitHistory(user) {
  var container = document.querySelector("[data-submitwork-history]");
  if (!container) return;

  if (unsubSubmitHistory) {
    unsubSubmitHistory();
    unsubSubmitHistory = null;
  }

  try {
    unsubSubmitHistory = db.collection("submissions").where("userId", "==", user.uid).onSnapshot(function(snap) {
      if (snap.empty) { container.innerHTML = '<p class="section-copy">No submissions yet.</p>'; return; }
      var items = [];
      snap.forEach(function (d) { items.push(d.data()); });
      items.sort(function (a, b) {
        var ta = a.submittedAt && a.submittedAt.seconds ? a.submittedAt.seconds : 0;
        var tb = b.submittedAt && b.submittedAt.seconds ? b.submittedAt.seconds : 0;
        return tb - ta;
      });
      var rows = items.map(function (s) {
        return '<tr><td>' + fmtDate(s.submittedAt) + '</td><td>' + esc(s.workType || "-") + '</td>' +
          '<td>' + esc(s.hours || "-") + '</td>' +
          '<td><a href="' + esc(s.driveLink || "#") + '" target="_blank" rel="noopener">View</a></td>' +
          '<td>' + statusBadge(s.status) + '</td></tr>';
      }).join("");
      container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>Date</th><th>Work Type</th><th>Hours</th><th>Link</th><th>Status</th>' +
        '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }, function (err) {
      container.innerHTML = '<p class="section-copy">Could not load history: ' + esc(err.message) + '</p>';
    });
  } catch (err) {
    container.innerHTML = '<p class="section-copy">Could not load history: ' + esc(err.message) + '</p>';
  }
}

// ---------------------------------------------------------------------------
// Profile
// ---------------------------------------------------------------------------
function loadProfile(user, profile) {
  var form = document.querySelector("[data-profile-form]");
  if (!form) return;
  var status = document.querySelector("[data-profile-status]");

  document.getElementById("pf-name").value = profile.name || "";
  document.getElementById("pf-phone").value = profile.phone || "";
  document.getElementById("pf-email").value = profile.email || user.email || "";
  document.getElementById("pf-company").value = profile.companyName || "";
  var typeSel = document.getElementById("pf-type");
  if (["freelancer", "vendor", "company"].indexOf(profile.role) !== -1) typeSel.value = profile.role;
  var bioEl = document.getElementById("pf-bio");
  if (bioEl) bioEl.value = profile.bio || "";
  var expEl = document.getElementById("pf-experience");
  if (expEl) expEl.value = profile.experience || "";
  var cvLinkSpan = document.getElementById("pf-cv-link");
  var cvFileEl = document.getElementById("pf-cv");
  if (cvLinkSpan && profile.cvUrl) {
    cvFileEl.style.display = "none";
    var cvName = profile.cvName || "Current CV";
    cvLinkSpan.innerHTML = '<a href="' + esc(profile.cvUrl) + '" target="_blank">' + esc(cvName) + '</a>' +
      ' <button type="button" class="btn btn-ghost btn-sm" id="btn-update-cv" style="margin-left:10px; padding: 2px 8px; font-size: 0.8rem;">Update</button>';
    
    document.getElementById("btn-update-cv").addEventListener("click", function() {
      cvFileEl.style.display = "";
      this.style.display = "none";
    });
  }

  var langEl = document.getElementById("pf-languages");
  if (langEl && profile.languages) langEl.value = profile.languages.join(", ");
  
  var skillCheckboxes = document.querySelectorAll("input[name='pf-skills']");
  if (skillCheckboxes.length > 0 && profile.skills) {
    skillCheckboxes.forEach(function(cb) {
      if (profile.skills.indexOf(cb.value) !== -1) cb.checked = true;
    });
  }

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    setBusy(form, true);
    status.style.color = "";
    status.textContent = "Saving...";
    try {
      var updateData = {
        name: document.getElementById("pf-name").value.trim(),
        phone: document.getElementById("pf-phone").value.trim(),
        companyName: document.getElementById("pf-company").value.trim(),
        role: typeSel.value,
      };
      if (document.getElementById("pf-bio")) updateData.bio = document.getElementById("pf-bio").value.trim();
      if (document.getElementById("pf-experience")) updateData.experience = document.getElementById("pf-experience").value.trim();
      
      if (document.getElementById("pf-languages")) {
        updateData.languages = document.getElementById("pf-languages").value.split(",").map(function(s) { return s.trim(); }).filter(Boolean);
      }
      var checkedSkills = document.querySelectorAll("input[name='pf-skills']:checked");
      if (checkedSkills.length > 0 || document.querySelectorAll("input[name='pf-skills']").length > 0) {
        updateData.skills = Array.from(checkedSkills).map(function(cb) { return cb.value; });
      }
      
      var cvFileEl = document.getElementById("pf-cv");
      if (cvFileEl && cvFileEl.files.length > 0) {
        status.textContent = "Uploading CV...";
        
        // Delete old CV from Drive if it exists
        if (profile.cvUrl) {
          var match = profile.cvUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (match && match[1]) {
            try {
              var token = await user.getIdToken();
              await fetch("/api/drive/delete", {
                method: "POST",
                headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" },
                body: JSON.stringify({ fileId: match[1] })
              });
            } catch (delErr) {
              console.warn("Could not delete old CV", delErr);
            }
          }
        }
        
        var formData = new FormData();
        formData.append("file", cvFileEl.files[0]);
        formData.append("projectName", "Profile CVs");
        formData.append("role", updateData.role);
        formData.append("userName", updateData.name || user.email);
        formData.append("docType", "CVs");

        var token = await user.getIdToken();
        var res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token },
          body: formData
        });
        var result = await res.json();
        if (!result.id) throw new Error(result.error || "CV Upload failed");
        updateData.cvUrl = result.link;
        updateData.cvName = cvFileEl.files[0].name;
        
        // Update profile in local cache for consecutive saves
        profile.cvUrl = result.link;
        profile.cvName = cvFileEl.files[0].name;
        
        if (cvLinkSpan) {
           cvFileEl.style.display = "none";
           cvLinkSpan.innerHTML = '<a href="' + esc(result.link) + '" target="_blank">' + esc(cvFileEl.files[0].name) + '</a>' +
             ' <button type="button" class="btn btn-ghost btn-sm" id="btn-update-cv" style="margin-left:10px; padding: 2px 8px; font-size: 0.8rem;">Update</button>';
           document.getElementById("btn-update-cv").addEventListener("click", function() {
             cvFileEl.style.display = "";
             this.style.display = "none";
           });
        }
      }
      
      await db.collection("users").doc(user.uid).update(updateData);
      status.style.color = "#85ffaa";
      status.textContent = "Profile updated.";
    } catch (err) {
      fail(status, err.message);
    } finally {
      setBusy(form, false);
    }
  });

  var passForm = document.querySelector("[data-password-form]");
  var passStatus = document.querySelector("[data-password-status]");
  if (passForm) {
    passForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      var pw = document.getElementById("pf-pass").value;
      if (pw.length < 8 || !/[A-Z]/.test(pw) || !/[0-9]/.test(pw)) {
        fail(passStatus, "Password needs 8+ characters, one uppercase, one number.");
        return;
      }
      setBusy(passForm, true);
      passStatus.style.color = "";
      passStatus.textContent = "Updating...";
      try {
        await user.updatePassword(pw);
        passStatus.style.color = "#85ffaa";
        passStatus.textContent = "Password updated.";
        passForm.reset();
      } catch (err) {
        if (err.code === "auth/requires-recent-login") {
          fail(passStatus, "Please log out and sign in again before changing your password.");
        } else {
          fail(passStatus, err.message);
        }
      } finally {
        setBusy(passForm, false);
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Shared formatting helpers
// ---------------------------------------------------------------------------
function statusBadge(status) {
  status = (status || "").toLowerCase();
  var map = {
    active: "badge-success", approved: "badge-success", completed: "badge-success",
    upcoming: "badge-warning", "pending-review": "badge-warning", "revision-needed": "badge-warning",
    rejected: "badge-danger", interested: "badge-neutral", training: "badge-neutral",
    "in-progress": "badge-warning", submitted: "badge-warning", "invoice-submitted": "badge-neutral",
  };
  var cls = map[status] || "badge-neutral";
  return '<span class="badge ' + cls + '">' + esc(status || "-") + '</span>';
}

function fmtDate(ts) {
  if (!ts) return "-";
  var d;
  if (ts.toDate) d = ts.toDate();
  else if (typeof ts === "string") d = new Date(ts);
  else if (ts.seconds) d = new Date(ts.seconds * 1000);
  else return "-";
  if (isNaN(d.getTime())) return "-";
  return d.toLocaleString();
}

// ---------------------------------------------------------------------------
// Available projects - show all active/upcoming with an "Interest" button
// ---------------------------------------------------------------------------
let unsubAvailableProjects = null;

async function loadAvailableProjects(user, profile) {
  var container = document.querySelector("[data-portal-projects]");
  if (!container) return;

  if (unsubAvailableProjects) {
    unsubAvailableProjects();
    unsubAvailableProjects = null;
  }

  try {
    unsubAvailableProjects = db.collection("projects").where("status", "in", ["active", "upcoming"]).onSnapshot(async function(snap) {
      if (snap.empty) {
        container.innerHTML = '<p class="section-copy">No projects available right now. Check back soon.</p>';
        return;
      }

      // Get user's participations to know which they've already joined
      var partSnap = await db.collection("participations").where("userId", "==", user.uid).get();
      var joined = {};
      partSnap.forEach(function (d) { 
        var part = d.data();
        var iter = part.iteration || 1;
        if (!joined[part.projectId] || iter > joined[part.projectId].iteration) {
          joined[part.projectId] = { id: d.id, iteration: iter };
        }
      });

      var html = "";
      snap.forEach(function (doc) {
        var p = doc.data();
        var projIteration = p.iteration || 1;
        var isJoined = (joined[doc.id] && joined[doc.id].iteration === projIteration);
        var statusLabel = (p.status || "active").toUpperCase();
        var langs = Array.isArray(p.languages) ? p.languages.join(", ") : "";
        var pay = p.payout || p.pay || "";
        var rate = p.payoutRate || "";
        html +=
          '<article class="project-card portal-project-card">' +
          '<div><div class="project-meta">' +
          '<span class="project-tag">' + esc(p.workType || "Project") + '</span>' +
          '<span class="status-chip"><span class="status-dot"></span>' + esc(statusLabel) + '</span>' +
          '</div><h3>' + esc(p.name || "Untitled") + '</h3>' +
          '<p class="project-desc" data-desc-id="' + doc.id + '">' + esc(p.description || "") + '</p>' +
          '<a class="read-more-link" data-read-more="' + doc.id + '">Read more</a>' +
          (langs ? '<p class="project-langs">Languages: ' + esc(langs) + '</p>' : '') +
          (pay ? '<p class="project-pay">Payout: ' + esc(pay) + (rate ? ' (' + esc(rate) + ')' : '') + '</p>' : '') +
          '</div>' +
          (isJoined
            ? '<button class="btn btn-primary" data-view-project="' + doc.id + '">View Progress</button>'
            : '<button class="btn btn-outline" data-join-project="' + doc.id + '">Show Interest</button>') +
          '</article>';
      });
      container.innerHTML = html;

      // Join buttons
      container.querySelectorAll("[data-join-project]").forEach(function (btn) {
        btn.addEventListener("click", async function () {
          var projectId = btn.dataset.joinProject;
          // Check if project has a custom form
          var pDoc = await db.collection("projects").doc(projectId).get();
          var project = pDoc.exists ? pDoc.data() : {};
          var formFields = Array.isArray(project.formFields) ? project.formFields.filter(function (f) { return f.label; }) : [];

          if (formFields.length > 0) {
            openJoinFormModal(projectId, project, user, profile, btn);
          } else {
            btn.disabled = true;
            btn.textContent = "Joining...";
            try {
              await db.collection("participations").add({
                userId: user.uid,
                projectId: projectId,
                step: 1,
                status: "interest",
                iteration: project.iteration || 1,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
              });
              btn.textContent = "Joined";
              btn.classList.remove("btn-outline");
              btn.classList.add("btn-primary");
            } catch (err) {
              btn.textContent = "Error - try again";
              btn.disabled = false;
            }
          }
        });
      });

      // View buttons
      container.querySelectorAll("[data-view-project]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openProjectModal(btn.dataset.viewProject, user, profile);
        });
      });
    }, function (err) {
      container.innerHTML = '<p class="section-copy">Could not load projects: ' + esc(err.message) + '</p>';
    });
  } catch (err) {
    container.innerHTML = '<p class="section-copy">Could not load projects: ' + esc(err.message) + '</p>';
  }
}

// ---------------------------------------------------------------------------
// My projects - show joined projects with 4-step progress
// ---------------------------------------------------------------------------
let unsubMyProjects = null;

async function loadMyProjects(user, profile) {
  var container = document.querySelector("[data-my-projects]");
  if (!container) return;

  if (unsubMyProjects) {
    unsubMyProjects();
    unsubMyProjects = null;
  }

  try {
    unsubMyProjects = db.collection("participations").where("userId", "==", user.uid).onSnapshot(async function(snap) {
      if (snap.empty) {
        container.innerHTML = '<p class="section-copy">You have not joined any projects yet. Browse Available Projects to get started.</p>';
        return;
      }

      var html = "";
      var projectIds = [];
      snap.forEach(function (d) {
        var part = d.data();
        part._partId = d.id;
        projectIds.push(part.projectId);
        html += buildMyProjectCard(part);
      });

      container.innerHTML = html;

      // Load project names
      for (var i = 0; i < projectIds.length; i++) {
        try {
          var pSnap = await db.collection("projects").doc(projectIds[i]).get();
          if (pSnap.exists) {
            var nameEl = container.querySelector('[data-pname="' + projectIds[i] + '"]');
            if (nameEl) nameEl.textContent = pSnap.data().name || "Untitled Project";
          }
        } catch (e) { /* skip */ }
      }

      // View buttons
      container.querySelectorAll("[data-view-myproject]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          openProjectModal(btn.dataset.viewMyproject, user, profile);
        });
      });
    }, function(err) {
      container.innerHTML = '<p class="section-copy">Could not load your projects: ' + esc(err.message) + '</p>';
    });
  } catch (err) {
    container.innerHTML = '<p class="section-copy">Could not load your projects: ' + esc(err.message) + '</p>';
  }
}

function buildMyProjectCard(part) {
  var step = part.step || 1;
  var steps = ["Interest", "Training & NDA", "Submit Work", "Validation & Invoice", "Payment"];
  var stepHtml = '<div class="step-track">';
  for (var i = 0; i < steps.length; i++) {
    var cls = "step-item";
    if (i + 1 < step) cls += " completed";
    if (i + 1 === step) cls += " current";
    stepHtml += '<div class="' + cls + '"><span class="step-num">' + (i + 1) + '</span><span class="step-label">' + steps[i] + '</span></div>';
  }
  stepHtml += '</div>';

  var credsHtml = part.assignedCredentials 
    ? '<p class="project-pay" style="color:var(--white);margin-top:10px;"><strong>Credentials:</strong> ' + esc(part.assignedCredentials) + '</p>' 
    : '';

  return (
    '<article class="portal-project-card">' +
    '<div><h3 data-pname="' + part.projectId + '">Loading...</h3>' +
    '<p class="project-status-text">Status: ' + esc(part.status || "interested") + '</p>' +
    credsHtml +
    stepHtml + '</div>' +
    '<button class="btn btn-primary" data-view-myproject="' + part.projectId + '">Open</button>' +
    '</article>'
  );
}

// ---------------------------------------------------------------------------
// Project detail modal with 4-step flow
// ---------------------------------------------------------------------------
async function openProjectModal(projectId, user, profile, viewStep) {
  var modal = document.querySelector("[data-project-modal]");
  var body = document.querySelector("[data-modal-body]");
  if (!modal || !body) return;

  modal.hidden = false;
  document.body.classList.add("menu-open");
  body.innerHTML = '<p class="section-copy">Loading...</p>';

  var closeBtn = modal.querySelector("[data-modal-close]");
  closeBtn.onclick = function () {
    modal.hidden = true;
    document.body.classList.remove("menu-open");
  };

  try {
    var pSnap = await db.collection("projects").doc(projectId).get();
    var project = pSnap.exists ? pSnap.data() : { name: "Project" };

    var partSnap = await db.collection("participations")
      .where("userId", "==", user.uid)
      .where("projectId", "==", projectId)
      .get();

    var part = null;
    var partId = null;
    var maxIter = -1;
    partSnap.forEach(function (d) { 
      let p = d.data();
      let iter = p.iteration || 1;
      if (iter > maxIter) {
        maxIter = iter;
        part = p;
        partId = d.id;
      }
    });

    if (!part) {
      body.innerHTML = '<h2>' + esc(project.name || "Project") + '</h2><p>You have not joined this project yet.</p>';
      return;
    }

    var actualStep = part.step || 1;
    var displayStep = viewStep ? viewStep : actualStep;
    var isViewOnly = displayStep < actualStep;
    var submission = null;
    
    if (isViewOnly && displayStep === 3) {
      var subSnap = await db.collection("submissions")
        .where("participationId", "==", partId)
        .where("userId", "==", user.uid)
        .get();
      if (!subSnap.empty) {
        submission = subSnap.docs[0].data();
      }
    }

    body.innerHTML = buildStepFlow(project, part, displayStep, partId, actualStep, isViewOnly, submission);
    
    if (!isViewOnly) {
      wireStepActions(projectId, partId, displayStep, user, body, project);
    }
    
    var stepItems = body.querySelectorAll("[data-nav-step]");
    stepItems.forEach(function (el) {
      el.addEventListener("click", function() {
        var s = parseInt(el.dataset.navStep, 10);
        if (s <= actualStep) {
          openProjectModal(projectId, user, profile, s);
        }
      });
    });
  } catch (err) {
    body.innerHTML = '<p class="section-copy">Error: ' + esc(err.message) + '</p>';
  }
}

function buildStepFlow(project, part, displayStep, partId, actualStep, isViewOnly, submission) {
  var html = '<h2>' + esc(project.name || "Project") + '</h2>';
  html += '<p>' + esc(project.description || "") + '</p>';
  if (project.payout) html += '<p><strong>Payout:</strong> ' + esc(project.payout) + '</p>';

  html += '<div class="step-track modal-steps">';
  var labels = ["Interest", "Training & NDA", "Submit Work", "Validation", "Payment"];
  for (var i = 0; i < 5; i++) {
    var sIdx = i + 1;
    var cls = "step-item";
    if (sIdx < actualStep) cls += " completed";
    if (sIdx === displayStep) cls += " current";
    
    var style = sIdx <= actualStep ? "cursor:pointer;" : "opacity:0.5;";
    html += '<div class="' + cls + '" style="' + style + '" data-nav-step="' + sIdx + '"><span class="step-num">' + sIdx + '</span><span class="step-label">' + labels[i] + '</span></div>';
  }
  html += '</div>';

  html += '<div class="step-content">';

  if (displayStep === 1) {
    html += '<h3>Step 1: Interest Confirmed</h3>';
    if (isViewOnly) {
      html += '<p>You have already confirmed your interest in this project.</p>';
    } else {
      html += '<p>You have expressed interest in this project. The YUGM AI team will review and assign training materials.</p>';
      html += '<button class="btn btn-primary" data-step-action="confirm-interest" data-partid="' + partId + '">Confirm Interest & Proceed</button>';
    }
  } else if (displayStep === 2) {
    html += '<h3>Step 2: Training & Agreement</h3>';
    if (project.trainingVideo) {
      var embedUrl = project.trainingVideo;
      if (embedUrl.includes("drive.google.com") && embedUrl.includes("/view")) {
        embedUrl = embedUrl.replace(/\/view(\?.*)?$/, "/preview$1");
      }
      var dlUrl = project.trainingVideoDownload || project.trainingVideo;
      html += '<div class="training-video"><iframe src="' + esc(embedUrl) + '" frameborder="0" allowfullscreen></iframe></div>';
      html += '<div style="margin-top:10px; margin-bottom:20px;"><a href="' + esc(dlUrl) + '" target="_blank" class="btn btn-outline btn-sm" style="background:#07101d;">Watch / Download Video &nearr;</a></div>';
    } else {
      html += '<p>Training materials will be added by the admin. Check back soon.</p>';
    }
    
    if (project.submissionType === "external") {
      html += '<div class="alert" style="margin-top:16px; margin-bottom:16px; padding:12px; background:var(--ink-2); border-radius:var(--radius); border:1px solid var(--line);">';
      html += '<h4 style="margin-top:0">External Platform Details</h4>';
      if (project.externalLink) html += '<p style="margin-bottom:8px"><strong>Platform Link:</strong> <a href="' + esc(project.externalLink) + '" target="_blank">' + esc(project.externalLink) + '</a></p>';
      if (project.guidelinesLink) html += '<p style="margin-bottom:8px"><strong>Guidelines:</strong> <a href="' + esc(project.guidelinesLink) + '" target="_blank">' + esc(project.guidelinesLink) + '</a></p>';
      if (part.assignedCredentials) html += '<p style="margin-bottom:0"><strong>Your Credentials:</strong> <span style="font-family:monospace; background:var(--ink-3); padding:4px 8px; border-radius:4px; margin-left:8px;">' + esc(part.assignedCredentials) + '</span></p>';
      html += '</div>';
    }

    html += '<div class="nda-section">';
    html += '<p>Download, review, and sign the agreement below:</p>';
    var ndaUrl = project.ndaLink || "docs/VendorAgreement_YugmAI_Draft.docx";
    html += '<a class="btn btn-outline" href="' + esc(ndaUrl) + '" target="_blank">Download NDA / Service Agreement</a>';
    html += '</div>';
    
    if (isViewOnly) {
      html += '<div class="field" style="margin-top:16px"><p><strong>Your Signed NDA:</strong> <a href="' + esc(part.ndaLink || "#") + '" target="_blank">' + esc(part.ndaLink || "View Link") + '</a></p></div>';
    } else {
      html += '<div class="field" style="margin-top:16px"><label for="nda-link">Signed NDA Link (Google Drive)</label>';
      html += '<input id="nda-link" type="url" placeholder="https://drive.google.com/..." data-nda-input></div>';
      html += '<button class="btn btn-primary" data-step-action="complete-training" data-partid="' + partId + '">I have reviewed and signed the materials - Proceed</button>';
    }
  } else if (displayStep === 3) {
    html += '<h3>Step 3: Submit Your Work</h3>';
    
    if (isViewOnly) {
      html += '<p>You have submitted your work for this project.</p>';
      if (submission) {
        if (project.submissionType !== "external") {
          html += '<p><strong>Drive Link:</strong> <a href="' + esc(submission.driveLink || "#") + '" target="_blank">View Submission</a></p>';
        } else {
          html += '<p><strong>Platform:</strong> Completed on external platform.</p>';
        }
        if (submission.notes) html += '<p><strong>Notes:</strong> ' + esc(submission.notes) + '</p>';
      }
    } else {
      if (part.status === "revision-needed" && part.reviewNote) {
        html += '<div class="alert" style="margin-top:16px; margin-bottom:16px; background: rgba(255,100,100,0.2); border: 1px solid red; padding: 10px; border-radius: 4px;">';
        html += '<strong>Revision Requested:</strong> ' + esc(part.reviewNote);
        html += '</div>';
      }
      
      if (project.submissionType === "external") {
        html += '<p>This is an external project. Please confirm when you have completed your work on the external platform.</p>';
        html += '<div class="field"><label for="submit-notes">Notes (optional)</label>';
        html += '<textarea id="submit-notes" rows="2"></textarea></div>';
        html += '<button class="btn btn-primary" data-step-action="submit-external" data-partid="' + partId + '">Mark as Completed</button>';
      } else {
        html += '<p>Upload your completed work. It will automatically be organized into your specific project folder.</p>';
        html += '<div class="field"><label for="submit-file">Upload File</label>';
        html += '<input id="submit-file" type="file"></div>';
        html += '<div class="field"><label for="submit-notes">Additional Notes (optional)</label>';
        html += '<textarea id="submit-notes" rows="2"></textarea></div>';
        html += '<button class="btn btn-primary" id="btn-submit-internal" data-step-action="submit-internal" data-partid="' + partId + '">Submit Work</button>';
      }
    }
  } else if (displayStep === 4) {
    html += '<h3>Step 4: Validation & Invoice</h3>';
    if (part.status !== "approved") {
      html += '<p>Your work has been submitted and is currently pending review by the admin.</p>';
      html += '<p>Once approved, you will be able to review your validation sheet and submit your invoice.</p>';
    } else {
      html += '<p style="color:var(--green)"><strong>Your work has been approved!</strong></p>';
      if (part.validationLink) {
        html += '<p><strong>Validation Sheet:</strong> <a href="' + esc(part.validationLink) + '" target="_blank" rel="noopener">View Validation Sheet</a></p>';
      }
      html += '<p>According to the validation sheet, you can request your payout. Otherwise, if you request incorrect hours, the admin can reject it.</p>';
      html += '<p>Payout terms: ' + esc(project.payout || "As per project agreement") + '</p>';
      html += '<a class="btn btn-outline" href="docs/Yugm_AI_Invoice_.docx" download>Download Invoice Template</a>';
      
      if (isViewOnly) {
        html += '<div class="field" style="margin-top:16px"><p><strong>Your Submitted Invoice:</strong> <a href="' + esc(part.invoiceUrl || "#") + '" target="_blank">View Invoice</a></p></div>';
      } else {
        if (part.invoiceStatus === "rejected") {
          html += '<div class="alert" style="margin-top:16px; background: rgba(255,100,100,0.2); border: 1px solid red; padding: 10px; border-radius: 4px;">';
          html += '<strong>Invoice Rejected:</strong> ' + esc(part.invoiceRejectReason || "Please correct and resubmit.") + '</div>';
        }
        
        html += '<div class="field" style="margin-top:16px"><label for="invoice-file">Upload Invoice</label>';
        html += '<input id="invoice-file" type="file"></div>';
        html += '<button class="btn btn-primary" id="btn-submit-invoice" data-step-action="submit-invoice" data-partid="' + partId + '">' + (part.invoiceStatus === "rejected" ? "Resubmit Invoice" : "Submit Invoice") + '</button>';
      }
    }
  } else if (displayStep === 5) {
    html += '<h3>Step 5: Payment</h3>';
    html += '<p>Your invoice has been submitted successfully.</p>';
    if (part.invoiceUrl) {
      html += '<p class="project-status-text">Invoice Link: <a href="' + esc(part.invoiceUrl) + '" target="_blank" rel="noopener">View Invoice</a></p>';
    }
    html += '<p>We are processing your payment. It usually takes 7 business days.</p>';
    if (part.invoiceStatus === "paid") {
      html += '<p style="color:var(--green)"><strong>Status: Paid!</strong></p>';
    } else {
      html += '<p style="color:var(--orange)"><strong>Status: Processing Payment</strong></p>';
    }
  }

  html += '</div>';
  return html;
}

function wireStepActions(projectId, partId, step, user, body, project) {
  // Confirm interest -> step 2
  var interestBtn = body.querySelector("[data-step-action='confirm-interest']");
  if (interestBtn) {
    interestBtn.addEventListener("click", async function () {
      interestBtn.disabled = true;
      interestBtn.textContent = "Updating...";
      try {
        await db.collection("participations").doc(partId).update({ step: 2, status: "training" });
        openProjectModal(projectId, user, {});
      } catch (err) {
        interestBtn.textContent = "Error - try again";
        interestBtn.disabled = false;
      }
    });
  }

  // Complete training -> step 3
  var trainBtn = body.querySelector("[data-step-action='complete-training']");
  if (trainBtn) {
    trainBtn.addEventListener("click", async function () {
      var ndaInput = body.querySelector("[data-nda-input]");
      var ndaLink = ndaInput ? ndaInput.value.trim() : "";
      if (!ndaLink) { uiAlert("Please provide the link to your signed NDA."); return; }
      trainBtn.disabled = true;
      trainBtn.textContent = "Updating...";
      try {
        await db.collection("participations").doc(partId).update({ step: 3, status: "in-progress", ndaLink: ndaLink });
        openProjectModal(projectId, user, {});
      } catch (err) {
        trainBtn.textContent = "Error - try again";
        trainBtn.disabled = false;
      }
    });
  }

  // Submit external work -> step 4
  var submitExtBtn = body.querySelector("[data-step-action='submit-external']");
  if (submitExtBtn) {
    submitExtBtn.addEventListener("click", async function () {
      var notes = body.querySelector("#submit-notes") ? body.querySelector("#submit-notes").value.trim() : "";
      submitExtBtn.disabled = true;
      submitExtBtn.textContent = "Submitting...";
      try {
        await db.collection("submissions").add({
          userId: user.uid, projectId: projectId, participationId: partId,
          driveLink: "", notes: notes, status: "pending-review",
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection("participations").doc(partId).update({ step: 4, status: "submitted" });
        openProjectModal(projectId, user, {});
      } catch (err) {
        submitExtBtn.textContent = "Error - try again";
        submitExtBtn.disabled = false;
      }
    });
  }

  // Submit internal work (file upload) -> step 4
  var submitIntBtn = body.querySelector("[data-step-action='submit-internal']");
  if (submitIntBtn) {
    submitIntBtn.addEventListener("click", async function () {
      var fileInput = body.querySelector("#submit-file");
      if (!fileInput || !fileInput.files.length) {
        uiAlert("Please select a file to upload."); return;
      }
      var notes = body.querySelector("#submit-notes") ? body.querySelector("#submit-notes").value.trim() : "";
      submitIntBtn.disabled = true;
      submitIntBtn.textContent = "Uploading...";
      
      try {
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append("file", file);
        formData.append("projectName", project.name || "General");
        
        var pDoc = await db.collection("users").doc(user.uid).get();
        var role = pDoc.exists ? pDoc.data().role : "freelancer";
        var userName = pDoc.exists ? pDoc.data().name : user.email;
        
        formData.append("role", role);
        formData.append("userName", userName);
        formData.append("docType", "Submissions");

        var currentUser = getAuth().currentUser;
        var token = await currentUser.getIdToken();
        
        var res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token },
          body: formData
        });
        
        var result = await res.json();
        if (!result.ok) throw new Error(result.error || "Upload failed");
        
        await db.collection("submissions").add({
          userId: user.uid, projectId: projectId, participationId: partId,
          driveLink: result.url, notes: notes, status: "pending-review",
          submittedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        await db.collection("participations").doc(partId).update({ step: 4, status: "submitted" });
        openProjectModal(projectId, user, {});
      } catch (err) {
        uiAlert("Upload Error: " + err.message);
        submitIntBtn.textContent = "Error - try again";
        submitIntBtn.disabled = false;
      }
    });
  }

  // Submit invoice
  var invoiceBtn = body.querySelector("[data-step-action='submit-invoice']");
  if (invoiceBtn) {
    invoiceBtn.addEventListener("click", async function () {
      var fileInput = body.querySelector("#invoice-file");
      if (!fileInput || !fileInput.files.length) {
        uiAlert("Please select your invoice file to upload."); return;
      }
      invoiceBtn.disabled = true;
      invoiceBtn.textContent = "Uploading...";
      try {
        var file = fileInput.files[0];
        var formData = new FormData();
        formData.append("file", file);
        formData.append("projectName", project.name || "General");
        
        var pDoc = await db.collection("users").doc(user.uid).get();
        var role = pDoc.exists ? pDoc.data().role : "freelancer";
        var userName = pDoc.exists ? pDoc.data().name : user.email;
        
        formData.append("role", role);
        formData.append("userName", userName);
        formData.append("docType", "Invoices");

        var currentUser = getAuth().currentUser;
        var token = await currentUser.getIdToken();
        
        var res = await fetch("/api/drive/upload", {
          method: "POST",
          headers: { "Authorization": "Bearer " + token },
          body: formData
        });
        
        var result = await res.json();
        if (!result.ok) throw new Error(result.error || "Upload failed");

        await db.collection("participations").doc(partId).update({
          invoiceUrl: result.url,
          invoiceStatus: "submitted",
          step: 5,
          invoiceSubmittedAt: firebase.firestore.FieldValue.serverTimestamp(),
          status: "invoice-submitted",
        });
        openProjectModal(projectId, user, {});
      } catch (err) {
        uiAlert("Upload Error: " + err.message);
        invoiceBtn.textContent = "Error - try again";
        invoiceBtn.disabled = false;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------
let unsubUserMessages = null;

async function loadMessages(user, profile) {
  var thread = document.querySelector("[data-message-thread]");
  var form = document.querySelector("[data-message-form]");
  if (!thread) return;

  if (unsubUserMessages) {
    unsubUserMessages();
    unsubUserMessages = null;
  }

  try {
    // Reset unreadUser count
    await db.collection("messages").doc(user.uid).set({ unreadUser: 0 }, { merge: true }).catch(function(){});

    unsubUserMessages = db.collection("messages").doc(user.uid).collection("items")
      .orderBy("createdAt", "asc").limit(100).onSnapshot(function (snap) {
        if (snap.empty) {
          thread.innerHTML = '<p class="section-copy">No messages yet. Use the form below to contact the YUGM AI team.</p>';
          return;
        }
        var html = "";
        snap.forEach(function (d) {
          var m = d.data();
          var sender = m.sender === "admin" ? "YUGM AI" : "You";
          var cls = m.sender === "admin" ? "msg-admin" : "msg-user";
          html += '<div class="msg-item ' + cls + '"><strong>' + esc(sender) + '</strong><p>' + esc(m.text || "") + '</p></div>';
        });
        thread.innerHTML = html;
        thread.scrollTop = thread.scrollHeight;
      }, function (err) {
        thread.innerHTML = '<p class="section-copy">Error loading messages: ' + esc(err.message) + '</p>';
      });
  } catch (err) {
    thread.innerHTML = '<p class="section-copy">Error loading messages: ' + esc(err.message) + '</p>';
  }

  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      var input = form.querySelector("[data-message-input]");
      var text = input.value.trim();
      if (!text) return;
      input.disabled = true;
      try {
        var threadRef = db.collection("messages").doc(user.uid);

        // Is this the user's first-ever message? If so, send the auto-reply.
        var existing = await threadRef.collection("items").limit(1).get();
        var isFirst = existing.empty;

        await threadRef.collection("items").add({
          sender: "user",
          userId: user.uid,
          text: text,
          createdAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        // Also ensure the thread doc exists for admin visibility
        await threadRef.set({
          userId: user.uid,
          userName: profile.name || user.email,
          lastMessage: text,
          lastAt: firebase.firestore.FieldValue.serverTimestamp(),
          unreadAdmin: firebase.firestore.FieldValue.increment(1)
        }, { merge: true });

        if (isFirst) {
          await threadRef.collection("items").add({
            sender: "admin",
            auto: true,
            text: "Thank you for reaching out. Our team will respond to you as soon as possible.",
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
          });
        }
        input.value = "";
      } catch (err) {
        uiAlert("Could not send message: " + err.message);
      } finally {
        input.disabled = false;
      }
    });
  }
}

// ---------------------------------------------------------------------------
// Join form modal with custom fields
// ---------------------------------------------------------------------------
function openJoinFormModal(projectId, project, user, profile, btn) {
  var modal = document.querySelector("[data-project-modal]");
  var body = document.querySelector("[data-modal-body]");
  if (!modal || !body) return;
  modal.hidden = false;
  document.body.classList.add("menu-open");

  var closeBtn = modal.querySelector("[data-modal-close]");
  closeBtn.onclick = function () {
    modal.hidden = true;
    document.body.classList.remove("menu-open");
  };

  var fields = project.formFields.filter(function (f) { return f.label; });
  var html = '<h2>Join: ' + esc(project.name || "Project") + '</h2>';
  html += '<p>Please fill in the following details to show your interest.</p>';
  html += '<form class="auth-form join-custom-form" data-join-form>';

  fields.forEach(function (f, i) {
    var id = "jf-" + i;
    if (f.type === "section") {
      html += '<h4>' + esc(f.label) + '</h4>';
      return;
    }
    if (f.type === "header") {
      html += '<h4>' + esc(f.label) + '</h4>';
      return;
    }
    if (f.type === "image" && f.src) {
      html += '<p><strong>' + esc(f.label) + '</strong></p><img src="' + esc(f.src) + '" alt="' + esc(f.label) + '" style="max-width:100%;border-radius:var(--radius);margin-bottom:12px">';
      return;
    }
    if (f.type === "video" && f.src) {
      html += '<p><strong>' + esc(f.label) + '</strong></p><div class="training-video" style="margin-bottom:12px"><iframe src="' + esc(f.src) + '" frameborder="0" allowfullscreen></iframe></div>';
      return;
    }

    html += '<div class="field"><label for="' + id + '">' + esc(f.label) + (f.required ? ' <span style="color:#ff8585">*</span>' : '') + '</label>';

    if (f.type === "short-text") {
      html += '<input id="' + id + '" type="text" data-jf="' + i + '"' + (f.required ? ' required' : '') + '>';
    } else if (f.type === "long-text") {
      html += '<textarea id="' + id + '" rows="3" data-jf="' + i + '"' + (f.required ? ' required' : '') + '></textarea>';
    } else if (f.type === "number") {
      html += '<input id="' + id + '" type="number" data-jf="' + i + '"' + (f.required ? ' required' : '') + '>';
    } else if (f.type === "date") {
      html += '<input id="' + id + '" type="date" data-jf="' + i + '"' + (f.required ? ' required' : '') + '>';
    } else if (f.type === "dropdown") {
      html += '<select id="' + id + '" data-jf="' + i + '"' + (f.required ? ' required' : '') + '>';
      html += '<option value="">Select...</option>';
      (f.options || []).forEach(function (opt) {
        html += '<option value="' + esc(opt) + '">' + esc(opt) + '</option>';
      });
      html += '</select>';
    } else if (f.type === "multiple-choice") {
      (f.options || []).forEach(function (opt, oi) {
        var cid = id + "-" + oi;
        html += '<label style="display:flex;gap:6px;align-items:center;margin:4px 0;color:var(--muted);font-weight:400;font-size:0.9rem">' +
          '<input type="radio" name="' + id + '" value="' + esc(opt) + '" data-jf="' + i + '"' + (f.required && oi === 0 ? ' required' : '') + '> ' + esc(opt) + '</label>';
      });
    } else if (f.type === "file-upload") {
      html += '<input id="' + id + '" type="file" data-jf="' + i + '"' + (f.required ? ' required' : '') + '>';
    }
    html += '</div>';
  });

  html += '<button class="btn btn-primary" type="submit">Submit Interest</button>';
  html += '<p class="auth-status" data-join-status aria-live="polite"></p>';
  html += '</form>';

  body.innerHTML = html;

  var form = body.querySelector("[data-join-form]");
  var status = body.querySelector("[data-join-status]");

  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var answers = {};
    var valid = true;
    fields.forEach(function (f, i) {
      if (["section", "header", "image", "video"].indexOf(f.type) !== -1) return;
      if (f.type === "file-upload") {
        // File uploads are handled separately
        return;
      }
      var val = "";
      if (f.type === "multiple-choice") {
        var checked = body.querySelector('input[name="jf-' + i + '"]:checked');
        if (checked) val = checked.value;
      } else {
        var input = body.querySelector('[data-jf="' + i + '"]');
        if (input) val = input.value.trim();
      }
      if (f.required && !val) valid = false;
      answers[f.label] = val;
    });

    if (!valid) {
      fail(status, "Please fill out all required fields.");
      return;
    }

    setBusy(form, true);
    status.style.color = "";
    status.textContent = "Submitting...";

    // Handle file uploads
    try {
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.type === "file-upload") {
          var input = body.querySelector('[data-jf="' + i + '"]');
          if (input && input.files.length > 0) {
            var file = input.files[0];
            var formData = new FormData();
            formData.append("file", file);
            var res = await fetch("/api/upload", { method: "POST", body: formData });
            var data = await res.json();
            if (data.url) answers[f.label] = data.url;
          } else if (f.required) {
            throw new Error("File for '" + f.label + "' is required.");
          }
        }
      }

      await db.collection("participations").add({
        userId: user.uid,
        projectId: projectId,
        step: 1,
        status: "interest",
        iteration: project.iteration || 1,
        customAnswers: answers,
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      btn.textContent = "Joined";
      btn.classList.remove("btn-outline");
      btn.classList.add("btn-primary");
      modal.hidden = true;
      document.body.classList.remove("menu-open");
      loadMyProjects(user, profile);
    } catch (err) {
      fail(status, err.message);
    } finally {
      setBusy(form, false);
    }
  });
}

// ---------------------------------------------------------------------------
// Portal Payments
// ---------------------------------------------------------------------------
let unsubPortalPayments = null;

async function loadPortalPayments(user, profile) {
  var container = document.querySelector("[data-portal-payments]");
  if (!container) return;
  
  if (unsubPortalPayments) {
    unsubPortalPayments();
    unsubPortalPayments = null;
  }
  container.innerHTML = "<p>Loading...</p>";
  
  try {
    var pSnap = await db.collection("projects").get();
    var projects = {};
    pSnap.forEach(function(d) { projects[d.id] = d.data(); });
    
    unsubPortalPayments = db.collection("participations").where("userId", "==", user.uid).onSnapshot(function(snap) {
      if (snap.empty) { container.innerHTML = "<p>No payment information found.</p>"; return; }
      
      var rows = [];
      
      snap.forEach(function (d) {
        var pData = d.data();
        var proj = projects[pData.projectId] || {};
        
        var isEnded = proj.status === "ended";
        var invStatus = pData.invoiceStatus || (isEnded ? "pending_request" : "waiting_project_end");
        
        var statusBadgeStr = "";
        if (invStatus === "waiting_project_end") statusBadgeStr = '<span class="badge badge-warning">Waiting for completion</span>';
        else if (invStatus === "pending_request") statusBadgeStr = '<span class="badge badge-neutral">Ready for Request</span>';
        else if (invStatus === "requested") statusBadgeStr = '<span class="badge badge-danger">Action Required</span>';
        else if (invStatus === "submitted") statusBadgeStr = '<span class="badge badge-success">Processing (ETA: 7 Days)</span>';
        else if (invStatus === "paid") statusBadgeStr = '<span class="badge badge-success">Paid</span>';
        
        var actions = "";
        if (invStatus === "requested") {
          actions = `
            <a href="#" class="btn btn-ghost btn-sm" style="display:block; margin-bottom:0.5rem;" onclick="uiAlert('Template will be downloaded.')">Download Template</a>
            <button class="btn btn-primary btn-sm" style="display:block; width:100%; text-align:center;" onclick="submitInvoiceLink('${d.id}')">Submit Invoice Link</button>
          `;
        } else if (invStatus === "submitted" || invStatus === "paid") {
          actions = '<a href="' + esc(pData.invoiceDocUrl) + '" target="_blank" class="btn btn-ghost btn-sm" style="display:block; text-align:center;">View Invoice Link</a>';
        } else if (invStatus === "pending_request") {
          actions = '<p class="cell-sub" style="text-align:center; font-size:0.9rem;">The admin will request your invoice soon.</p>';
        } else if (invStatus === "waiting_project_end") {
          actions = '<p class="cell-sub" style="text-align:center; font-size:0.9rem;">Invoice processing begins after project ends.</p>';
        }
        
        rows.push(`
          <div class="card">
            <div class="card-content">
              <h4>${esc(proj.name || pData.projectId)}</h4>
              <p style="margin-top:0.5rem; margin-bottom:0.5rem;"><strong>Status:</strong> ${statusBadgeStr}</p>
            </div>
            <div class="card-footer" style="flex-direction:column; align-items:stretch;">
              ${actions}
            </div>
          </div>
        `);
      });
      
      if (!rows.length) { container.innerHTML = "<p>No payment information found.</p>"; return; }
      container.innerHTML = '<div class="card-grid">' + rows.join("") + '</div>';
    }, function(err) {
      container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });
    
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

window.submitInvoiceLink = async function(docId) {
  var link = await uiPrompt("Please paste your Google Drive or Dropbox link to the invoice PDF:\n(Make sure the link is set to 'Anyone with the link can view')");
  if (!link) return;
  
  if (!link.startsWith("http")) {
    uiAlert("Please provide a valid URL starting with http:// or https://");
    return;
  }
  
  var container = document.querySelector("[data-portal-payments]");
  if (container) container.innerHTML = "<p>Submitting invoice link, please wait...</p>";
  
  try {
    await db.collection("participations").doc(docId).update({ 
      invoiceStatus: "submitted",
      invoiceDocUrl: link,
      invoiceSubmittedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    
    await uiAlert("Invoice link submitted successfully. Expected payout in 7-8 days.");
  } catch(e) {
    uiAlert("Error submitting invoice: " + e.message);
  }
}
