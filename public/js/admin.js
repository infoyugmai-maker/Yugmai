// YUGM AI - Admin panel logic.
// Sections: Overview, Projects, Participation, Work Tracking, Registrations,
// Messages, Contacts, Sign-in Logs, Announcements.
// Requires firebase-config.js + auth.js (provides guardPage, logout via window globals).

// ---------------------------------------------------------------------------
// Modular SDK compatibility shim (same as portal.js). Rather than rewriting
// 980+ lines of working compat-style code, we build thin wrappers.
// ---------------------------------------------------------------------------
(function waitForFirebase() {
  if (!window._db || !window._firestoreModule) {
    setTimeout(waitForFirebase, 80);
    return;
  }

  var _fs = window._firestoreModule;
  var _realDb = window._db;

  function wrapQuery(q) {
    return {
      where: function (field, op, value) { return wrapQuery(_fs.query(q, _fs.where(field, op, value))); },
      orderBy: function (field, dir) { return wrapQuery(_fs.query(q, _fs.orderBy(field, dir || "asc"))); },
      limit: function (n) { return wrapQuery(_fs.query(q, _fs.limit(n))); },
      limitToLast: function (n) { return wrapQuery(_fs.query(q, _fs.limitToLast(n))); },
      startAfter: function (val) { return wrapQuery(_fs.query(q, _fs.startAfter(val && val._raw ? val._raw : val))); },
      startAt: function (val) { return wrapQuery(_fs.query(q, _fs.startAt(val && val._raw ? val._raw : val))); },
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
    return { id: d.id, exists: d.exists(), data: function () { return d.data(); }, ref: _fs.doc(_realDb, d.ref.path), _raw: d };
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

  window.db = window.db || {
    collection: function (name) { return wrapCollection(_fs.collection(_realDb, name)); },
  };

  window.firebase = window.firebase || {};
  window.firebase.firestore = window.firebase.firestore || {};
  window.firebase.firestore.FieldValue = window.firebase.firestore.FieldValue || {
    serverTimestamp: function () { return _fs.serverTimestamp(); },
    arrayUnion: function () { return _fs.arrayUnion.apply(null, arguments); },
    arrayRemove: function () { return _fs.arrayRemove.apply(null, arguments); },
    increment: function (n) { return _fs.increment(n); },
    delete: function () { return _fs.deleteField(); },
  };

  document.addEventListener("DOMContentLoaded", function () {
    guardPage("admin", function (user, profile) {
      initAdmin(user, profile);
    });
  });

  if (document.readyState !== "loading") {
    guardPage("admin", function (user, profile) {
      initAdmin(user, profile);
    });
  }
})();


// Simple in-memory caches so we can show names instead of raw IDs.
var userCache = {};
var projectCache = {};

// ---------------------------------------------------------------------------
// Pagination utility — cursor-based "Load More" for any Firestore collection
// ---------------------------------------------------------------------------
function PaginatedLoader(collectionRef, pageSize, renderItem, containerEl, options) {
  this.ref = collectionRef;
  this.pageSize = pageSize || 15;
  this.renderItem = renderItem;
  this.container = containerEl;
  this.options = options || {};
  this.lastDoc = null;
  this.loading = false;
  this.exhausted = false;
  this.items = [];
}

PaginatedLoader.prototype.loadMore = async function () {
  if (this.loading || this.exhausted) return;
  this.loading = true;

  // Show loading indicator
  var loadBtn = this.container.querySelector("[data-load-more]");
  if (loadBtn) { loadBtn.textContent = "Loading..."; loadBtn.disabled = true; }

    try {
      var q = this.ref;
      if (this.lastDoc) {
        q = q.startAfter(this.lastDoc);
      }
      q = q.limit(this.pageSize);
      var snap = await q.get();

    if (snap.empty || snap.size < this.pageSize) {
      this.exhausted = true;
    }

    var newItems = [];
    snap.forEach(function (doc) {
      newItems.push({ id: doc.id, data: doc.data() });
    });

    if (newItems.length > 0) {
      this.lastDoc = snap.docs[snap.docs.length - 1];
      this.items = this.items.concat(newItems);
    }

    // Render new items
    var self = this;
    newItems.forEach(function (item) {
      self.renderItem(item, self.container);
    });

    // Update or remove "Load More" button
    if (loadBtn) loadBtn.remove();
    if (!this.exhausted) {
      var btn = document.createElement("button");
      btn.className = "btn btn-outline";
      btn.setAttribute("data-load-more", "");
      btn.textContent = "Load More";
      btn.style.cssText = "width:100%; margin-top:16px;";
      var self2 = this;
      btn.addEventListener("click", function () { self2.loadMore(); });
      this.container.appendChild(btn);
    }
  } catch (err) {
    console.error("[PaginatedLoader]", err);
    if (loadBtn) { loadBtn.textContent = "Retry"; loadBtn.disabled = false; loadBtn.onclick = () => this.loadMore(); }
  }

  this.loading = false;
};

PaginatedLoader.prototype.reset = function () {
  this.lastDoc = null;
  this.exhausted = false;
  this.items = [];
  this.container.innerHTML = "";
};

function initAdmin(user, profile) {
  var userNameEl = document.querySelector("[data-user-name]");
  if (userNameEl) userNameEl.textContent = profile.name || user.email;

  var logoutBtn = document.querySelector("[data-logout-btn]");
  if (logoutBtn) logoutBtn.addEventListener("click", logout);

  // Push + notification bell
  initPush(user);
  buildNotifBell(user);

  // Tabs - lazy-load each panel the first time it is opened.
  var loaded = {};
  var loaders = {
    overview: loadOverview,
    projects: loadAdminProjects,
    participation: loadParticipation,
    work: loadAdminSubmissions,
    registrations: loadAdminUsers,
    messages: loadAdminMessages,
    contacts: loadAdminContacts,
    logs: loadAdminLogs,
    announce: loadAnnouncements,
    payments: loadAdminPayments,
    files: loadAdminFiles,
    export: loadExportData,
    languages: loadLanguages,
    "admin-access": loadAdminAccess,
  };

  // Show "Admin Access" tab only for the Super Admin
  if (window._isSuperAdmin) {
    var adminAccessTab = document.querySelector('[data-tab="admin-access"]');
    if (adminAccessTab) adminAccessTab.style.display = "";
  }

  var tabs = document.querySelectorAll("[data-admin-tabs] .portal-tab");
  var panels = document.querySelectorAll(".portal-panel");
  tabs.forEach(function (tab) {
    tab.addEventListener("click", function () {
      tabs.forEach(function (t) { t.classList.remove("active"); });
      panels.forEach(function (p) { p.classList.add("hidden"); });
      tab.classList.add("active");
      var key = tab.dataset.tab;
      var panel = document.querySelector('[data-panel="' + key + '"]');
      if (panel) panel.classList.remove("hidden");
      if (!loaded[key] && loaders[key]) { loaders[key](); loaded[key] = true; }
    });
  });

  // Admin unread messages badge
  var msgTab = document.querySelector('[data-admin-tabs] [data-tab="messages"]');
  if (msgTab) {
    db.collection("messages").where("unreadAdmin", ">", 0).onSnapshot(function(snap) {
      var totalUnread = 0;
      snap.forEach(function(doc) {
        totalUnread += (doc.data().unreadAdmin || 0);
      });
      if (totalUnread > 0) {
        msgTab.innerHTML = 'Messages <span class="badge" style="background:#ff4757;color:#fff;border-radius:12px;padding:2px 6px;font-size:0.75rem;margin-left:4px;">' + totalUnread + '</span>';
      } else {
        msgTab.innerHTML = 'Messages';
      }
    });
  }

  // Add project button
  var addBtn = document.querySelector("[data-add-project]");
  if (addBtn) addBtn.addEventListener("click", function () { openProjectEditor(null); });

  // Search / filter wiring
  wireFilter("[data-project-search]", "input", loadAdminProjects);
  wireFilter("[data-participation-filter]", "change", loadParticipation);
  wireFilter("[data-work-filter]", "change", loadAdminSubmissions);
  wireFilter("[data-user-search]", "input", loadAdminUsers);
  wireFilter("[data-user-filter]", "change", loadAdminUsers);
  wireFilter("[data-log-search]", "input", loadAdminLogs);
  wireFilter("[data-lang-search]", "input", loadLanguages);

  var announceForm = document.querySelector("[data-announce-form]");
  if (announceForm) announceForm.addEventListener("submit", sendAnnouncement);

  // Close modal
  var modal = document.querySelector("[data-edit-modal]");
  var closeBtn = modal.querySelector("[data-modal-close]");
  closeBtn.addEventListener("click", function () {
    modal.hidden = true;
    document.body.classList.remove("menu-open");
  });

  // First (default) panel
  loadOverview();
  loaded.overview = true;
}

function wireFilter(selector, evt, fn) {
  var el = document.querySelector(selector);
  if (el) el.addEventListener(evt, debounce(fn, 200));
}

function debounce(fn, ms) {
  var t;
  return function () { clearTimeout(t); t = setTimeout(fn, ms); };
}

// ---------------------------------------------------------------------------
// Caches
// ---------------------------------------------------------------------------
async function ensureUsers() {
  if (Object.keys(userCache).length > 500) return userCache;
  var snap = await db.collection("users").limit(10000).get();
  snap.forEach(function (d) { userCache[d.id] = d.data(); });
  return userCache;
}

async function ensureProjects() {
  if (Object.keys(projectCache).length > 500) return projectCache;
  var snap = await db.collection("projects").limit(10000).get();
  snap.forEach(function (d) { projectCache[d.id] = d.data(); });
  return projectCache;
}

function userName(uid) {
  var u = userCache[uid];
  return u ? (u.name || u.email || uid) : uid;
}

function projectName(pid) {
  var p = projectCache[pid];
  return p ? (p.name || pid) : pid;
}

// ---------------------------------------------------------------------------
// Overview metrics
// ---------------------------------------------------------------------------
async function loadOverview() {
  var container = document.querySelector("[data-admin-stats]");
  if (!container) return;
  container.innerHTML = '<p class="section-copy">Loading metrics...</p>';
  try {
    // Use limit queries — we only need counts, not full documents
    var results = await Promise.all([
      db.collection("users").limit(10000).get(),
      db.collection("projects").limit(10000).get(),
      db.collection("participations").limit(10000).get(),
      db.collection("submissions").limit(10000).get(),
      db.collection("contacts").limit(10000).get(),
    ]);
    var users = results[0], projects = results[1], parts = results[2], subs = results[3], contacts = results[4];

    var vendorCount = 0;
    users.forEach(function (d) {
      var r = d.data().role;
      if (r === "vendor" || r === "company") vendorCount++;
    });

    var activeProjects = 0;
    projects.forEach(function (d) { if (d.data().status === "active") activeProjects++; });

    var speakers = {};
    subs.forEach(function (d) { if (d.data().userId) speakers[d.data().userId] = true; });

    var cards = [
      ["Total Registrations", users.size],
      ["Vendor / Company", vendorCount],
      ["Active Projects", activeProjects],
      ["Total Participation", parts.size],
      ["Total Speakers", Object.keys(speakers).length],
      ["Contact Submissions", contacts.size],
    ];
    container.innerHTML = cards.map(function (c) {
      return '<article class="stat-card"><span class="stat-value">' + c[1] +
        '</span><span class="stat-label">' + esc(c[0]) + '</span></article>';
    }).join("");
  } catch (err) {
    container.innerHTML = '<p class="section-copy">Could not load metrics: ' + esc(err.message) + '</p>';
  }
}

// ---------------------------------------------------------------------------
// Projects CRUD
// ---------------------------------------------------------------------------
let unsubAdminProjects = null;

async function loadAdminProjects() {
  var container = document.querySelector("[data-admin-projects]");
  if (!container) return;

  if (unsubAdminProjects) {
    unsubAdminProjects();
    unsubAdminProjects = null;
  }
  
  container.innerHTML = "<p>Loading...</p>";

  var searchInput = document.querySelector("[data-project-search]");
  
  function renderProjects() {
    var search = (searchInput ? searchInput.value : "").trim().toLowerCase();

    var projList = Object.keys(projectCache).map(k => ({id: k, ...projectCache[k]}));
    projList.sort(function(a, b) {
      var ta = a.createdAt && typeof a.createdAt.toMillis === 'function' ? a.createdAt.toMillis() : 0;
      var tb = b.createdAt && typeof b.createdAt.toMillis === 'function' ? b.createdAt.toMillis() : 0;
      return tb - ta;
    });

    var rows = [];
    projList.forEach(function (p) {
      if (search && (p.name || "").toLowerCase().indexOf(search) === -1) return;
      var langs = Array.isArray(p.languages) ? p.languages.join(", ") : "";
      rows.push('<tr>' +
        '<td>' + esc(p.name || "Untitled") + '</td>' +
        '<td>' + esc(p.workType || "") + '</td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td>' + esc(langs) + '</td>' +
        '<td>' + esc(p.payout || p.pay || "") + '</td>' +
        '<td class="actions-cell">' +
        '<button class="btn btn-ghost btn-sm" data-edit-project="' + p.id + '">Edit</button>' +
        (p.status === "active" 
          ? '<button class="btn btn-ghost btn-sm" data-end-project="' + p.id + '">End</button>'
          : '<button class="btn btn-ghost btn-sm" data-restart-project="' + p.id + '">Restart</button>') +
        '<button class="btn btn-ghost btn-sm" data-upload-validation="' + p.id + '">Validation</button>' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-delete-project="' + p.id + '">Delete</button>' +
        '</td></tr>');
    });

    if (!rows.length) { container.innerHTML = "<p>No projects found.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Name</th><th>Type</th><th>Status</th><th>Languages</th><th>Payout</th><th>Actions</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-edit-project]").forEach(function (btn) {
      btn.addEventListener("click", function () { openProjectEditor(btn.dataset.editProject); });
    });
    
    container.querySelectorAll("[data-end-project]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!(await uiConfirm("End this project? This will automatically submit all in-progress work for review and notify participants."))) return;
        var pid = btn.dataset.endProject;
        btn.textContent = "Ending...";
        btn.disabled = true;
        try {
          await db.collection("projects").doc(pid).update({ status: "ended" });
          
          // Auto-submit all in-progress participations
          var partsSnap = await db.collection("participations").where("projectId", "==", pid).where("status", "==", "in-progress").get();
          var batchUpdates = [];
          partsSnap.forEach(function(doc) {
            batchUpdates.push(db.collection("participations").doc(doc.id).update({ step: 4, status: "submitted" }));
          });
          await Promise.all(batchUpdates);

          await notifyEnrolledUsers(pid, "Project Ended", "The project has ended and your uploaded work has been automatically submitted for review.", "portal.html");
          uiAlert("Project ended and all pending work was auto-submitted.");
          loadAdminProjects();
        } catch (e) {
          uiAlert("Error ending project: " + e.message);
          btn.textContent = "End";
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll("[data-restart-project]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!(await uiConfirm("Restart this project? This will create a completely new copy (Batch 2) of this project so previous data is safely archived."))) return;
        var pid = btn.dataset.restartProject;
        btn.textContent = "Restarting...";
        btn.disabled = true;
        try {
          var p = projectCache[pid] || {};
          var newIter = (p.iteration || 1) + 1;
          
          // Duplicate project with a new ID
          var newProjectData = Object.assign({}, p);
          delete newProjectData.id;
          newProjectData.name = (p.name || "Project") + " (Batch " + newIter + ")";
          newProjectData.iteration = newIter;
          newProjectData.status = "active";
          
          var _fs = window._firestoreModule;
          newProjectData.createdAt = _fs.serverTimestamp();
          
          await db.collection("projects").add(newProjectData);
          
          uiAlert("Success! The project has been duplicated as a new batch.");
          loadAdminProjects(); // reload list
        } catch (e) {
          uiAlert("Error restarting project: " + e.message);
          btn.textContent = "Restart";
          btn.disabled = false;
        }
      });
    });

    container.querySelectorAll("[data-delete-project]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!(await uiConfirm("Delete this project?"))) return;
        await db.collection("projects").doc(btn.dataset.deleteProject).delete();
      });
    });

    // Validation CSV upload
    container.querySelectorAll("[data-upload-validation]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        openValidationUpload(btn.dataset.uploadValidation);
      });
    });
  }

  if (searchInput) {
    var newSearch = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearch, searchInput);
    searchInput = newSearch;
    newSearch.addEventListener("input", renderProjects);
  }

  try {
    unsubAdminProjects = db.collection("projects").orderBy("createdAt", "desc").onSnapshot(function(snap) {
      snap.docChanges().forEach(function(change) {
        if (change.type === "removed") { delete projectCache[change.doc.id]; }
        else { projectCache[change.doc.id] = change.doc.data(); }
      });
      renderProjects();
    }, function(err) {
      container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

async function openProjectEditor(projectId) {
  var modal = document.querySelector("[data-edit-modal]");
  var body = document.querySelector("[data-modal-body]");
  modal.hidden = false;
  document.body.classList.add("menu-open");

  var project = {};
  if (projectId) {
    var snap = await db.collection("projects").doc(projectId).get();
    if (snap.exists) project = snap.data();
  }

  // Build form fields list HTML
  var formFields = Array.isArray(project.formFields) ? project.formFields : [];
  var fbListHtml = buildFormBuilderList(formFields);

  body.innerHTML =
    '<h2>' + (projectId ? "Edit Project" : "New Project") + '</h2>' +
    '<form class="auth-form" data-project-form>' +
    '<div class="field"><label for="p-name">Project Name</label><input id="p-name" value="' + esc(project.name || "") + '" required></div>' +
    '<div class="field-grid">' +
    '<div class="field"><label for="p-type">Work Type</label><select id="p-type">' +
    typeOpt("Recording", project.workType) + typeOpt("Annotation", project.workType) +
    typeOpt("Transcription", project.workType) + typeOpt("Review", project.workType) +
    typeOpt("Other", project.workType) + '</select></div>' +
    '<div class="field"><label for="p-status">Status</label><select id="p-status">' +
    typeOpt("active", project.status) + typeOpt("upcoming", project.status) +
    typeOpt("completed", project.status) + typeOpt("paused", project.status) +
    '</select></div></div>' +
    '<div class="field"><label for="p-submission-type">Submission Platform</label><select id="p-submission-type">' +
    '<option value="internal"' + (project.submissionType !== "external" ? " selected" : "") + '>Internal (Google Drive)</option>' +
    '<option value="external"' + (project.submissionType === "external" ? " selected" : "") + '>External Website</option>' +
    '</select></div>' +
    '<div class="field"><label style="display:flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" id="p-require-creds"' + (project.requireCredentials ? " checked" : "") + '> Require ID/Credentials for Freelancers</label></div>' +
    '</div>' +
    '<div class="field-grid">' +
    '<div class="field"><label for="p-external-link">External Platform Link</label><input id="p-external-link" value="' + esc(project.externalLink || "") + '"></div>' +
    '<div class="field"><label for="p-guidelines">External Guidelines Link</label><input id="p-guidelines" value="' + esc(project.guidelinesLink || "") + '"></div>' +
    '</div>' +
    '<div class="field-grid">' +
    '<div class="field"><label for="p-team">Team Size Needed</label><input id="p-team" type="number" min="0" value="' + esc(project.teamSize || "") + '"></div>' +
    '<div class="field"><label for="p-deadline">Deadline (optional)</label><input id="p-deadline" type="date" value="' + esc(project.deadline || "") + '"></div></div>' +
    '<div class="field"><label for="p-desc">Description</label><textarea id="p-desc" rows="4">' + esc(project.description || "") + '</textarea></div>' +
    '<div class="field"><label for="p-langs">Languages (comma-separated)</label><input id="p-langs" value="' + esc(Array.isArray(project.languages) ? project.languages.join(", ") : "") + '"></div>' +
    '<div class="field-grid">' +
    '<div class="field"><label for="p-pay">Payout terms (e.g. 30 days)</label><input id="p-pay" value="' + esc(project.payout || "") + '"></div>' +
    '<div class="field"><label for="p-pay-rate">Payout Rate (e.g. $10/hour)</label><input id="p-pay-rate" value="' + esc(project.payoutRate || "") + '"></div></div>' +
    '<div class="field-grid">' +
    '<div class="field"><label for="p-video-file">Upload Training Video ' + (project.trainingVideo ? '<a href="' + esc(project.trainingVideo) + '" target="_blank" style="font-size:0.8rem;margin-left:8px;font-weight:normal;">(View Current)</a>' : '') + '</label><input type="file" id="p-video-file" accept="video/*,audio/*"></div>' +
    '<div class="field"><label for="p-nda-file">Upload NDA/Agreement ' + (project.ndaLink ? '<a href="' + esc(project.ndaLink) + '" target="_blank" style="font-size:0.8rem;margin-left:8px;font-weight:normal;">(View Current)</a>' : '') + '</label><input type="file" id="p-nda-file" accept=".pdf,.doc,.docx"></div></div>' +

    // Custom form builder section
    '<div class="form-builder" data-form-builder>' +
    '<h3>Application Form Builder</h3>' +
    '<p style="font-size:0.85rem;margin:0 0 10px">Add custom fields to the join form. Users will fill these when they show interest in this project.</p>' +
    '<div class="form-builder-toolbar" data-fb-toolbar>' +
    '<button type="button" data-fb-add="short-text">Short Text</button>' +
    '<button type="button" data-fb-add="long-text">Long Text</button>' +
    '<button type="button" data-fb-add="number">Number</button>' +
    '<button type="button" data-fb-add="date">Date</button>' +
    '<button type="button" data-fb-add="dropdown">Dropdown</button>' +
    '<button type="button" data-fb-add="multiple-choice">Multiple Choice</button>' +
    '<button type="button" data-fb-add="file-upload">File Upload</button>' +
    '<button type="button" data-fb-add="section">Section</button>' +
    '<button type="button" data-fb-add="header">Header</button>' +
    '<button type="button" data-fb-add="image">Image</button>' +
    '<button type="button" data-fb-add="video">Video</button>' +
    '</div>' +
    '<div class="fb-field-list" data-fb-list>' + fbListHtml + '</div>' +
    '</div>' +

    '<div class="modal-actions"><button class="btn btn-primary" type="submit">Save Project</button> ' +
    '<button class="btn btn-ghost" type="button" data-cancel-edit>Cancel</button></div>' +
    '</form>';

  body.querySelector("[data-cancel-edit]").addEventListener("click", function () {
    modal.hidden = true;
    document.body.classList.remove("menu-open");
  });

  // Wire form builder add buttons
  body.querySelectorAll("[data-fb-add]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var type = btn.dataset.fbAdd;
      addFormBuilderField(body, type);
    });
  });

  // Wire form builder drag/drop reorder + delete
  wireFormBuilder(body);

  body.querySelector("[data-project-form]").addEventListener("submit", async function (e) {
    e.preventDefault();
    var saveBtn = body.querySelector("[type=submit]");
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    var data = {
      name: body.querySelector("#p-name").value.trim(),
      workType: body.querySelector("#p-type").value,
      status: body.querySelector("#p-status").value,
      teamSize: body.querySelector("#p-team").value,
      deadline: body.querySelector("#p-deadline").value,
      description: body.querySelector("#p-desc").value.trim(),
      languages: body.querySelector("#p-langs").value.split(",").map(function (s) { return s.trim(); }).filter(Boolean),
      payout: body.querySelector("#p-pay").value.trim(),
      payoutRate: body.querySelector("#p-pay-rate").value.trim(),
      submissionType: body.querySelector("#p-submission-type").value,
      requireCredentials: body.querySelector("#p-require-creds").checked,
      externalLink: body.querySelector("#p-external-link").value.trim(),
      guidelinesLink: body.querySelector("#p-guidelines").value.trim(),
      formFields: collectFormBuilderFields(body),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
      var projName = data.name || "Untitled";
      var tk = await getAuth().currentUser.getIdToken();
      
      var videoFileEl = body.querySelector("#p-video-file");
      if (videoFileEl && videoFileEl.files.length > 0) {
        saveBtn.textContent = "Uploading Video...";
        if (project.trainingVideo) {
          var oldVMatch = project.trainingVideo.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (oldVMatch && oldVMatch[1]) {
            try { await fetch("/api/drive/delete", { method: "POST", headers: { "Authorization": "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ fileId: oldVMatch[1] }) }); } catch(e){}
          }
        }
        var vData = new FormData();
        vData.append("file", videoFileEl.files[0]);
        vData.append("role", "admin");
        vData.append("projectName", projName);
        vData.append("docType", "Training");
        var vRes = await fetch("/api/drive/upload", { method: "POST", headers: { "Authorization": "Bearer " + tk }, body: vData });
        if(vRes.ok) { var vj = await vRes.json(); data.trainingVideo = vj.link; data.trainingVideoDownload = vj.download; }
      }
      
      var ndaFileEl = body.querySelector("#p-nda-file");
      if (ndaFileEl && ndaFileEl.files.length > 0) {
        saveBtn.textContent = "Uploading NDA...";
        if (project.ndaLink) {
          var oldNMatch = project.ndaLink.match(/\/d\/([a-zA-Z0-9_-]+)/);
          if (oldNMatch && oldNMatch[1]) {
            try { await fetch("/api/drive/delete", { method: "POST", headers: { "Authorization": "Bearer " + tk, "Content-Type": "application/json" }, body: JSON.stringify({ fileId: oldNMatch[1] }) }); } catch(e){}
          }
        }
        var nData = new FormData();
        nData.append("file", ndaFileEl.files[0]);
        nData.append("role", "admin");
        nData.append("projectName", projName);
        nData.append("docType", "NDA");
        var nRes = await fetch("/api/drive/upload", { method: "POST", headers: { "Authorization": "Bearer " + tk }, body: nData });
        if(nRes.ok) { var nj = await nRes.json(); data.ndaLink = nj.link; }
      }
      saveBtn.textContent = "Saving...";

      var newProject = !projectId;
      var prevStatus = project.status; // status before this save (undefined for new)
      if (projectId) {
        await db.collection("projects").doc(projectId).update(data);
      } else {
        data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
        var addRef = await db.collection("projects").add(data);
        projectId = addRef.id;
      }
      // Notify all users when a new active project is published.
      if (newProject && data.status === "active") {
        await addNotification("all", "New Project Live", data.name + " is now open. View it in your portal.", "portal.html");
      }
      // Notify enrolled users when an existing project flips upcoming -> active.
      if (!newProject && prevStatus === "upcoming" && data.status === "active") {
        await notifyEnrolledUsers(projectId, "Project Now Active",
          data.name + " has moved to active. You can start working on it now.", "portal.html");
      }
      modal.hidden = true;
      document.body.classList.remove("menu-open");
      projectCache = {};
      loadAdminProjects();
    } catch (err) {
      uiAlert("Error: " + err.message);
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Project";
    }
  });
}

// ---------------------------------------------------------------------------
// Form Builder helpers
// ---------------------------------------------------------------------------
var FB_TYPES = {
  "short-text": { label: "Short Text", inputType: "text" },
  "long-text": { label: "Long Text", inputType: "textarea" },
  "number": { label: "Number", inputType: "number" },
  "date": { label: "Date", inputType: "date" },
  "dropdown": { label: "Dropdown", inputType: "select" },
  "multiple-choice": { label: "Multiple Choice", inputType: "radio" },
  "file-upload": { label: "File Upload", inputType: "file" },
  "section": { label: "Section", inputType: "section" },
  "header": { label: "Header", inputType: "header" },
  "image": { label: "Image", inputType: "image" },
  "video": { label: "Video", inputType: "video" },
};

function buildFormBuilderList(fields) {
  if (!fields.length) return "";
  return fields.map(function (f, i) {
    return buildFBItemHtml(f, i);
  }).join("");
}

function buildFBItemHtml(field, index) {
  var typeInfo = FB_TYPES[field.type] || { label: field.type };
  var needsInput = ["section", "header", "image", "video"].indexOf(field.type) === -1;
  var hasOptions = ["dropdown", "multiple-choice"].indexOf(field.type) !== -1;

  var html = '<div class="fb-field-item" data-fb-idx="' + index + '" draggable="true">' +
    '<div class="fb-drag-handle" title="Drag to reorder">&#8942;&#8942;</div>' +
    '<div class="fb-field-body">' +
    '<div class="fb-field-row">' +
    '<span class="badge badge-neutral">' + esc(typeInfo.label) + '</span>' +
    (needsInput ? '<label><input type="checkbox" data-fb-required' + (field.required ? " checked" : "") + '> Required</label>' : '') +
    '</div>' +
    '<input type="text" data-fb-label placeholder="Label / heading" value="' + esc(field.label || "") + '" ' + (needsInput ? 'required' : '') + '>';

  if (hasOptions) {
    html += '<input type="text" data-fb-options placeholder="Options (comma-separated)" value="' + esc((field.options || []).join(", ")) + '">';
  }

  if (field.type === "image" || field.type === "video") {
    html += '<input type="url" data-fb-src placeholder="URL of image or video" value="' + esc(field.src || "") + '">';
    if (field.src) {
      if (field.type === "image") {
        html += '<img src="' + esc(field.src) + '" style="max-width:100px; max-height:100px; display:block; margin-top:8px; border-radius:4px;">';
      } else {
        html += '<div class="training-video" style="margin-top:8px; pointer-events:none;"><iframe src="' + esc(field.src) + '" frameborder="0"></iframe></div>';
      }
    }
  }

  html += '</div>' +
    '<div class="fb-field-actions">' +
    '<button type="button" class="fb-delete" data-fb-delete title="Remove field">&#10005;</button>' +
    '</div></div>';
  return html;
}

function addFormBuilderField(body, type) {
  var list = body.querySelector("[data-fb-list]");
  var fields = collectFormBuilderFields(body);
  fields.push({ type: type, label: "", required: false, options: [], src: "" });
  list.innerHTML = buildFormBuilderList(fields);
  wireFormBuilder(body);
}

function wireFormBuilder(body) {
  // Delete buttons
  body.querySelectorAll("[data-fb-delete]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var item = btn.closest(".fb-field-item");
      if (item) item.remove();
    });
  });

  // Drag and drop reorder
  var list = body.querySelector("[data-fb-list]");
  var dragItem = null;
  list.querySelectorAll(".fb-field-item").forEach(function (item) {
    item.addEventListener("dragstart", function (e) {
      dragItem = item;
      item.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    item.addEventListener("dragend", function () {
      item.classList.remove("dragging");
      dragItem = null;
    });
    item.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    });
    item.addEventListener("drop", function (e) {
      e.preventDefault();
      if (dragItem && dragItem !== item) {
        var items = Array.from(list.children);
        var fromIdx = items.indexOf(dragItem);
        var toIdx = items.indexOf(item);
        if (fromIdx < toIdx) {
          list.insertBefore(dragItem, item.nextSibling);
        } else {
          list.insertBefore(dragItem, item);
        }
      }
    });
  });
}

function collectFormBuilderFields(body) {
  var items = body.querySelectorAll("[data-fb-list] .fb-field-item");
  var fields = [];
  items.forEach(function (item) {
    var labelEl = item.querySelector("[data-fb-label]");
    var reqEl = item.querySelector("[data-fb-required]");
    var optsEl = item.querySelector("[data-fb-options]");
    var srcEl = item.querySelector("[data-fb-src]");
    // Derive type from the badge
    var badge = item.querySelector(".badge");
    var typeName = "";
    for (var k in FB_TYPES) {
      if (FB_TYPES[k].label === (badge ? badge.textContent : "")) { typeName = k; break; }
    }
    var f = {
      type: typeName,
      label: labelEl ? labelEl.value.trim() : "",
      required: reqEl ? reqEl.checked : false,
    };
    if (optsEl) {
      f.options = optsEl.value.split(",").map(function (s) { return s.trim(); }).filter(Boolean);
    }
    if (srcEl) {
      f.src = srcEl.value.trim();
    }
    fields.push(f);
  });
  return fields;
}

function typeOpt(value, current) {
  return '<option' + (current === value ? " selected" : "") + '>' + value + '</option>';
}


// ---------------------------------------------------------------------------
// Participation - approve / reject project join requests
// ---------------------------------------------------------------------------
let unsubParticipation = null;

async function loadParticipation() {
  var container = document.querySelector("[data-admin-participation]");
  if (!container) return;

  if (unsubParticipation) {
    unsubParticipation();
    unsubParticipation = null;
  }

  // CSV download button
  if (!container.parentElement.querySelector("[data-download-reg-csv]")) {
    var csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-outline btn-sm";
    csvBtn.setAttribute("data-download-reg-csv", "");
    csvBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Download CSV';
    csvBtn.style.cssText = "float:right; margin-bottom:12px;";
    csvBtn.addEventListener("click", function () { downloadRegistrationsCSV(); });
    container.parentElement.insertBefore(csvBtn, container);
  }

  container.innerHTML = "<p>Loading...</p>";

  var filterSelect = document.querySelector("[data-participation-filter]");

  function renderParticipation(snap) {
    var filter = (filterSelect ? filterSelect.value : "all");

    if (snap.empty) { container.innerHTML = "<p>No participation records yet.</p>"; return; }

    var rows = [];
    snap.forEach(function (d) {
      var p = d.data();
      var status = p.status || "interested";
      if (filter !== "all" && status !== filter) return;
      var u = userCache[p.userId] || {};
      var proj = projectCache[p.projectId] || {};
      var needsCreds = proj.requireCredentials || (proj.submissionType === "external");
      var credBtn = (needsCreds && (status === "approved" || status === "submitted" || status === "in-progress" || status === "revision-needed")) 
        ? '<button class="btn btn-ghost btn-sm" data-assign-cred="' + d.id + '">Assign IDs</button>' : '';
      
      var viewBtn = p.customAnswers ? '<button class="btn btn-ghost btn-sm" data-view-answers="' + d.id + '">View Answers</button> ' : '';
      
      var displayStatus = statusBadge(status);
      if (status === "in-progress" && p.finishedUploading) {
        displayStatus += '<br><span style="font-size:10px; color:var(--green); font-weight:bold;">✓ Uploads Done</span>';
      }
      
      rows.push(
        '<tr><td>' + esc(u.name || "-") + '</td><td>' + esc(u.phone || "-") + '</td>' +
        '<td>' + esc(u.companyName || "-") + '</td><td>' + esc(u.email || "-") + '</td>' +
        '<td>' + esc(projectName(p.projectId)) + '</td><td>' + displayStatus + '</td>' +
        '<td>' + viewBtn +
        (status === "interested" ? '<button class="btn btn-ghost btn-sm btn-success" data-approve-part="' + d.id + '">Approve</button> ' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-reject-part="' + d.id + '">Reject</button>' : '') +
        credBtn + '</td></tr>'
      );
    });

    if (!rows.length) { container.innerHTML = "<p>No matching participation records.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Name</th><th>Phone</th><th>Company</th><th>Email</th><th>Project</th><th>Status</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-approve-part]").forEach(function (btn) {
      btn.addEventListener("click", function () { setParticipationStatus(btn.dataset.approvePart, "approved"); });
    });
    container.querySelectorAll("[data-reject-part]").forEach(function (btn) {
      btn.addEventListener("click", function () { setParticipationStatus(btn.dataset.rejectPart, "rejected"); });
    });
    container.querySelectorAll("[data-view-answers]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var partId = btn.dataset.viewAnswers;
        var partSnap = await db.collection("participations").doc(partId).get();
        var data = partSnap.exists ? partSnap.data() : {};
        if (!data.customAnswers) return;
        
        var html = '<div style="text-align:left; max-height:400px; overflow-y:auto;">';
        for (var key in data.customAnswers) {
          var val = data.customAnswers[key];
          html += '<p><strong>' + esc(key) + ':</strong><br>';
          if (val && val.toString().startsWith("http")) {
            if (val.match(/\.(jpeg|jpg|gif|png)$/i) != null) {
              html += '<img src="' + esc(val) + '" style="max-width:100%; max-height:200px; border-radius:4px; margin-top:4px;">';
            } else if (val.match(/(youtube\.com|youtu\.be|drive\.google\.com\/file\/d\/)/i) != null) {
              html += '<div class="training-video" style="margin-top:8px;"><iframe src="' + esc(val) + '" frameborder="0" allowfullscreen></iframe></div>';
            } else {
              html += '<a href="' + esc(val) + '" target="_blank">' + esc(val) + '</a>';
            }
          } else {
             html += esc(val);
          }
          html += '</p>';
        }
        html += '</div>';
        uiHtmlAlert("Custom Form Answers", html);
      });
    });
    container.querySelectorAll("[data-assign-cred]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var partId = btn.dataset.assignCred;
        var partSnap = await db.collection("participations").doc(partId).get();
        var data = partSnap.exists ? partSnap.data() : {};
        var currentCreds = data.assignedCredentials || "";
        var newCreds = await uiAssignCreds(currentCreds);
        if (newCreds === null) return;
        try {
          await db.collection("participations").doc(partId).update({ assignedCredentials: newCreds });
          if (newCreds && data.userId) {
            await addNotification(data.userId, "Credentials Assigned", "Your login details for an external project have been assigned.", "portal.html");
          }
          uiAlert("Credentials assigned successfully.");
        } catch(e) { uiAlert(e.message); }
      });
    });
  }

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);

    // Paginated loading with Load More
    var lastDoc = null;
    var pageSize = 15;
    var loading = false;
    var exhausted = false;

    async function loadMoreParts() {
      if (loading || exhausted) return;
      loading = true;
      var loadBtn = container.querySelector("[data-load-more]");
      if (loadBtn) { loadBtn.textContent = "Loading..."; loadBtn.disabled = true; }

      try {
        var q = db.collection("participations").orderBy("createdAt", "desc").limit(pageSize);
        if (lastDoc) q = db.collection("participations").orderBy("createdAt", "desc").startAfter(lastDoc).limit(pageSize);
        var snap = await q.get();

        if (snap.empty || snap.size < pageSize) exhausted = true;
        if (snap.docs.length > 0) lastDoc = snap.docs[snap.docs.length - 1];

        if (loadBtn) loadBtn.remove();

        snap.forEach(function (d) {
          var p = d.data();
          var status = p.status || "interested";
          var u = userCache[p.userId] || {};
          var tbody = container.querySelector("tbody");
          if (!tbody) {
            container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
              '<th>Name</th><th>Phone</th><th>Email</th><th>Project</th><th>Status</th><th>Action</th>' +
              '</tr></thead><tbody></tbody></table></div>';
            tbody = container.querySelector("tbody");
          }
          var viewBtn = p.customAnswers ? '<button class="btn btn-ghost btn-sm" data-view-answers="' + d.id + '">View</button> ' : '';
          var tr = document.createElement("tr");
          tr.innerHTML =
            '<td>' + esc(u.name || "-") + '</td>' +
            '<td>' + esc(u.phone || "-") + '</td>' +
            '<td>' + esc(u.email || "-") + '</td>' +
            '<td>' + esc(projectName(p.projectId)) + '</td>' +
            '<td>' + statusBadge(status) + '</td>' +
            '<td>' + viewBtn +
            (status === "interested" ? '<button class="btn btn-ghost btn-sm btn-success" data-approve-part="' + d.id + '">Approve</button> ' +
            '<button class="btn btn-ghost btn-sm btn-danger" data-reject-part="' + d.id + '">Reject</button>' : '') + '</td>';
          tbody.appendChild(tr);

          tr.querySelector("[data-approve-part]")?.addEventListener("click", function () { setParticipationStatus(d.id, "approved"); });
          tr.querySelector("[data-reject-part]")?.addEventListener("click", function () { setParticipationStatus(d.id, "rejected"); });
          tr.querySelector("[data-view-answers]")?.addEventListener("click", function () { viewAnswers(d.id); });
        });

        if (!exhausted) {
          var btn = document.createElement("button");
          btn.className = "btn btn-outline";
          btn.setAttribute("data-load-more", "");
          btn.textContent = "Load More";
          btn.style.cssText = "width:100%; margin-top:16px;";
          btn.addEventListener("click", loadMoreParts);
          container.appendChild(btn);
        }
      } catch (err) {
        container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
      }
      loading = false;
    }

    await loadMoreParts();
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

async function viewAnswers(partId) {
  var partSnap = await db.collection("participations").doc(partId).get();
  var data = partSnap.exists ? partSnap.data() : {};
  if (!data.customAnswers) { uiAlert("No answers found."); return; }
  var html = '<div style="text-align:left; max-height:400px; overflow-y:auto;">';
  for (var key in data.customAnswers) {
    var val = data.customAnswers[key];
    html += '<p><strong>' + esc(key) + ':</strong><br>';
    if (val && val.toString().startsWith("http")) {
      html += '<a href="' + esc(val) + '" target="_blank" style="color:var(--blue);">' + esc(val) + '</a>';
    } else {
      html += esc(String(val));
    }
    html += '</p>';
  }
  html += '</div>';
  var overlay = document.createElement("div");
  overlay.className = "full-screen-modal-overlay";
  overlay.innerHTML = '<div class="full-screen-modal-content" style="max-width:600px;">' +
    '<h2>Application Answers</h2>' + html +
    '<div style="margin-top:20px; text-align:right;"><button class="btn btn-outline" onclick="this.closest(\'.full-screen-modal-overlay\').remove()">Close</button></div></div>';
  document.body.appendChild(overlay);
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
}

async function setParticipationStatus(partId, status) {
  try {
    var ref = db.collection("participations").doc(partId);
    var snap = await ref.get();
    var data = snap.exists ? snap.data() : {};
    await ref.update({ status: status, reviewedAt: firebase.firestore.FieldValue.serverTimestamp() });
    if (data.userId) {
      var verb = status === "approved" ? "approved" : "rejected";
      await addNotification(data.userId, "Participation " + (status === "approved" ? "Approved" : "Update"),
        "Your participation request has been " + verb + ".", "portal.html");
    }
    loadParticipation();
  } catch (err) {
    uiAlert("Error: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Work Tracking - review submissions
// ---------------------------------------------------------------------------
let unsubSubmissions = null;

async function loadAdminSubmissions() {
  var container = document.querySelector("[data-admin-submissions]");
  if (!container) return;

  if (unsubSubmissions) {
    unsubSubmissions();
    unsubSubmissions = null;
  }

  // CSV download button
  if (!container.parentElement.querySelector("[data-download-subs-csv]")) {
    var csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-outline btn-sm";
    csvBtn.setAttribute("data-download-subs-csv", "");
    csvBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Download CSV';
    csvBtn.style.cssText = "float:right; margin-bottom:12px;";
    csvBtn.addEventListener("click", function () { downloadSubmissionsCSV(); });
    container.parentElement.insertBefore(csvBtn, container);
  }

  container.innerHTML = "<p>Loading...</p>";

  var filterSelect = document.querySelector("[data-work-filter]");

  function renderSubmissions(snap) {
    var filter = (filterSelect ? filterSelect.value : "all");

    if (snap.empty) { container.innerHTML = "<p>No submissions yet.</p>"; return; }

    var rows = [];
    snap.forEach(function (d) {
      var s = d.data();
      var status = s.status || "pending-review";
      if (filter !== "all" && status !== filter) return;
      var u = userCache[s.userId] || {};
      rows.push(
        '<tr><td>' + esc(u.name || s.userId || "-") + '<br><span class="cell-sub">' + esc(u.role || "") + '</span></td>' +
        '<td>' + esc(projectName(s.projectId)) + '</td>' +
        '<td>' + esc(s.workType || "-") + '</td>' +
        '<td>' + esc(s.hours || "-") + '</td>' +
        '<td><a href="' + esc(s.driveLink || "#") + '" target="_blank" rel="noopener">View</a></td>' +
        '<td>' + esc((s.notes || "").slice(0, 60)) + '</td>' +
        '<td>' + fmtDate(s.submittedAt) + '</td>' +
        '<td>' + statusBadge(status) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm btn-success" data-sub="' + d.id + '" data-act="approved">Approve</button> ' +
        '<button class="btn btn-ghost btn-sm btn-danger" data-sub="' + d.id + '" data-act="rejected">Reject</button> ' +
        '<button class="btn btn-ghost btn-sm" data-sub="' + d.id + '" data-act="revision-needed">Revision</button></td></tr>'
      );
    });

    if (!rows.length) { container.innerHTML = "<p>No matching submissions.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Submitted By</th><th>Project</th><th>Work Type</th><th>Hours</th><th>Link</th><th>Notes</th><th>Submitted</th><th>Status</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-sub]").forEach(function (btn) {
      btn.addEventListener("click", function () { setSubmissionStatus(btn.dataset.sub, btn.dataset.act); });
    });
  }

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);

    // Paginated loading with Load More
    var lastDoc = null;
    var pageSize = 15;
    var loading = false;
    var exhausted = false;

    async function loadMoreSubmissions() {
      if (loading || exhausted) return;
      loading = true;
      var loadBtn = container.querySelector("[data-load-more]");
      if (loadBtn) { loadBtn.textContent = "Loading..."; loadBtn.disabled = true; }

      try {
        var q = db.collection("submissions").orderBy("submittedAt", "desc").limit(pageSize);
        if (lastDoc) q = db.collection("submissions").orderBy("submittedAt", "desc").startAfter(lastDoc).limit(pageSize);
        var snap = await q.get();

        if (snap.empty || snap.size < pageSize) exhausted = true;
        if (snap.docs.length > 0) lastDoc = snap.docs[snap.docs.length - 1];

        if (loadBtn) loadBtn.remove();

        snap.forEach(function (d) {
          var s = d.data();
          var status = s.status || "pending-review";
          var u = userCache[s.userId] || {};
          var tbody = container.querySelector("tbody");
          if (!tbody) {
            container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
              '<th>Submitted By</th><th>Project</th><th>Work Type</th><th>Hours</th><th>Link</th><th>Notes</th><th>Submitted</th><th>Status</th><th>Action</th>' +
              '</tr></thead><tbody></tbody></table></div>';
            tbody = container.querySelector("tbody");
          }
          var tr = document.createElement("tr");
          tr.innerHTML =
            '<td>' + esc(u.name || s.userId || "-") + '</td>' +
            '<td>' + esc(projectName(s.projectId)) + '</td>' +
            '<td>' + esc(s.workType || "-") + '</td>' +
            '<td>' + esc(String(s.hours || "-")) + '</td>' +
            '<td><a href="' + esc(s.driveLink || "#") + '" target="_blank" rel="noopener">View</a></td>' +
            '<td>' + esc((s.notes || "").slice(0, 40)) + '</td>' +
            '<td>' + fmtDate(s.submittedAt) + '</td>' +
            '<td>' + statusBadge(status) + '</td>' +
            '<td><button class="btn btn-ghost btn-sm btn-success" data-sub="' + d.id + '" data-act="approved">Approve</button> ' +
            '<button class="btn btn-ghost btn-sm btn-danger" data-sub="' + d.id + '" data-act="rejected">Reject</button></td>';
          tbody.appendChild(tr);

          tr.querySelectorAll("[data-sub]").forEach(function (btn) {
            btn.addEventListener("click", function () { setSubmissionStatus(btn.dataset.sub, btn.dataset.act); });
          });
        });

        if (!exhausted) {
          var btn = document.createElement("button");
          btn.className = "btn btn-outline";
          btn.setAttribute("data-load-more", "");
          btn.textContent = "Load More";
          btn.style.cssText = "width:100%; margin-top:16px;";
          btn.addEventListener("click", loadMoreSubmissions);
          container.appendChild(btn);
        }
      } catch (err) {
        container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
      }
      loading = false;
    }

    await loadMoreSubmissions();
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

async function setSubmissionStatus(subId, status) {
  try {
    var ref = db.collection("submissions").doc(subId);
    var snap = await ref.get();
    var data = snap.exists ? snap.data() : {};
    
    var note = "";
    if (status === "rejected" || status === "revision-needed") {
      note = await uiPrompt("Add a note for the contributor (optional):", "") || "";
    } else if (status === "approved") {
      note = await uiPrompt("Provide Validation Sheet Link for the contributor (optional):", "") || "";
    }
    
    var updateData = {
      status: status,
      reviewedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };
    if (status === "approved") {
      updateData.validationLink = note;
    } else {
      updateData.reviewNote = note;
    }
    await ref.update(updateData);
    
    if (data.participationId) {
      if (status === "approved") {
        await db.collection("participations").doc(data.participationId).update({ status: "approved", validationLink: note });
      } else if (status === "rejected" || status === "revision-needed") {
        await db.collection("participations").doc(data.participationId).update({ status: "revision-needed", reviewNote: note });
      }
    }

    if (data.userId) {
      var label = status === "approved" ? "Work Submission Approved"
        : status === "rejected" ? "Work Submission Rejected" : "Revision Requested";
      var msg = status === "approved" ? "Your submission has been approved. Please review your validation sheet and submit your invoice."
        : "Your submission needs attention." + (note ? " Note: " + note : "");
      await addNotification(data.userId, label, msg, "portal.html");
    }
    loadAdminSubmissions();
  } catch (err) {
    uiAlert("Error: " + err.message);
  }
}

// ---------------------------------------------------------------------------
// Registrations - all accounts
// ---------------------------------------------------------------------------
let unsubAdminUsers = null;

async function loadAdminUsers() {
  var container = document.querySelector("[data-admin-users]");
  if (!container) return;

  if (unsubAdminUsers) {
    unsubAdminUsers();
    unsubAdminUsers = null;
  }

  // Add CSV download button
  var existingBtn = container.parentElement.querySelector("[data-download-users-csv]");
  if (!existingBtn) {
    var csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-outline btn-sm";
    csvBtn.setAttribute("data-download-users-csv", "");
    csvBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Download CSV';
    csvBtn.style.cssText = "float:right; margin-bottom:12px;";
    csvBtn.addEventListener("click", function () { downloadUsersCSV(); });
    container.parentElement.insertBefore(csvBtn, container);
  }

  container.innerHTML = "<p>Loading...</p>";

  var searchInput = document.querySelector("[data-user-search]");
  var filterSelect = document.querySelector("[data-user-filter]");

  // Paginated loader for users
  var loader = new PaginatedLoader(
    db.collection("users").orderBy("createdAt", "desc"),
    15,
    function (item, cont) {
      var u = item.data;
      userCache[item.id] = u; // also populate cache
      var tbody = cont.querySelector("tbody");
      if (!tbody) {
        cont.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
          '<th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Company</th><th>Registered</th><th>Action</th>' +
          '</tr></thead><tbody></tbody></table></div>';
        tbody = cont.querySelector("tbody");
      }
      var tr = document.createElement("tr");
      tr.innerHTML =
        '<td><a href="#" class="admin-user-link" data-user-card="' + item.id + '" style="color:var(--blue); font-weight:500;">' + esc(u.name || "Unknown") + '</a></td>' +
        '<td>' + esc(u.email || "-") + '</td>' +
        '<td>' + esc(u.phone || "-") + '</td>' +
        '<td>' + roleBadge(u.role) + '</td>' +
        '<td>' + esc(u.companyName || "-") + '</td>' +
        '<td>' + fmtDate(u.createdAt) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-toggle-role="' + item.id + '" data-current="' + esc(u.role || "") + '">Change Role</button></td>';
      tbody.appendChild(tr);
    },
    container
  );

  await loader.loadMore();

  // Event delegation for role changes and user cards
  container.addEventListener("click", async function (e) {
    var roleBtn = e.target.closest("[data-toggle-role]");
    if (roleBtn) {
      var uid = roleBtn.dataset.toggleRole;
      var current = roleBtn.dataset.current;
      if (current === "admin" && !window._isSuperAdmin) {
        uiAlert("Only the Super Admin can change an admin's role.");
        return;
      }
      var options = ["freelancer", "vendor", "company"];
      if (window._isSuperAdmin) options.push("admin");
      var optionsStr = options.join(", ");
      var newRole = await uiPrompt("Set role (" + optionsStr + "):", current);
      if (!newRole || newRole === current) return;
      if (options.indexOf(newRole) === -1) {
        uiAlert("Invalid role. Choose from: " + optionsStr);
        return;
      }
      try {
        var updateData = { role: newRole };
        if (newRole === "admin") {
          updateData.adminGrantedBy = getAuth().currentUser.email;
          updateData.adminGrantedAt = firebase.firestore.FieldValue.serverTimestamp();
        } else if (current === "admin") {
          updateData.adminRevokedBy = getAuth().currentUser.email;
          updateData.adminRevokedAt = firebase.firestore.FieldValue.serverTimestamp();
        }
        await db.collection("users").doc(uid).update(updateData);
        userCache[uid] = Object.assign(userCache[uid] || {}, updateData);
        uiAlert("Role updated to " + newRole);
      } catch (err) { uiAlert("Error: " + err.message); }
      return;
    }

    var cardBtn = e.target.closest("[data-user-card]");
    if (cardBtn) {
      e.preventDefault();
      openUserCard(cardBtn.dataset.userCard);
    }
  });
}

function openUserCard(uid) {
  var u = userCache[uid];
  if (!u) return;

  var modal = document.querySelector("[data-edit-modal]");
  var body = document.querySelector("[data-modal-body]");
  modal.hidden = false;
  document.body.classList.add("menu-open");

  var cvLink = u.cvUrl ? '<a href="' + esc(u.cvUrl) + '" target="_blank" class="btn btn-outline btn-sm">View CV</a>' : 'No CV Uploaded';
  
  var html = '<h2>User Profile</h2>' +
    '<div style="margin-bottom: 20px;">' +
    '<p><strong>Name:</strong> ' + esc(u.name || "-") + '</p>' +
    '<p><strong>Email:</strong> ' + esc(u.email || "-") + '</p>' +
    '<p><strong>Phone:</strong> ' + esc(u.phone || "-") + '</p>' +
    '<p><strong>Role:</strong> ' + roleBadge(u.role) + '</p>' +
    '<p><strong>Company:</strong> ' + esc(u.companyName || "-") + '</p>' +
    '<p><strong>Registered:</strong> ' + fmtDate(u.createdAt) + '</p>' +
    '</div>' +
    '<hr style="margin: 20px 0; border: 0; border-top: 1px solid var(--line);">' +
    '<h3>Details</h3>' +
    '<p><strong>Bio:</strong><br>' + esc(u.bio || "Not provided") + '</p>' +
    '<p><strong>Experience:</strong><br>' + esc(u.experience || "Not provided") + '</p>' +
    '<p><strong>Languages:</strong> ' + (u.languages && u.languages.length ? esc(u.languages.join(", ")) : "None") + '</p>' +
    '<p><strong>Skills:</strong> ' + (u.skills && u.skills.length ? esc(u.skills.join(", ")) : "None") + '</p>' +
    '<div style="margin-top: 20px;">' + cvLink + '</div>';

  body.innerHTML = html;
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
let unsubAdminContacts = null;

async function loadAdminContacts() {
  var container = document.querySelector("[data-admin-contacts]");
  if (!container) return;

  if (unsubAdminContacts) {
    unsubAdminContacts();
    unsubAdminContacts = null;
  }

  // CSV download button
  if (!container.parentElement.querySelector("[data-download-contacts-csv]")) {
    var csvBtn = document.createElement("button");
    csvBtn.className = "btn btn-outline btn-sm";
    csvBtn.setAttribute("data-download-contacts-csv", "");
    csvBtn.innerHTML = '<svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" style="vertical-align:middle;margin-right:4px;"><path stroke-linecap="round" stroke-linejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg> Download CSV';
    csvBtn.style.cssText = "float:right; margin-bottom:12px;";
    csvBtn.addEventListener("click", function () { downloadContactsCSV(); });
    container.parentElement.insertBefore(csvBtn, container);
  }

  container.innerHTML = "<p>Loading...</p>";

  try {
    unsubAdminContacts = db.collection("contacts").orderBy("createdAt", "desc").limit(100).onSnapshot(function(snap) {
      if (snap.empty) { container.innerHTML = "<p>No contacts yet.</p>"; return; }
      var rows = [];
      snap.forEach(function (d) {
        var c = d.data();
        rows.push(
          '<tr><td>' + esc(c.name || "-") + '</td><td>' + esc(c.email || "-") + '</td>' +
          '<td>' + esc(c.phone || "-") + '</td><td>' + esc(c.subject || c.type || "-") + '</td>' +
          '<td>' + esc((c.message || "").slice(0, 60)) + (c.message && c.message.length > 60 ? '...' : '') + '</td><td>' + fmtDate(c.createdAt) + '</td>' +
          '<td>' + statusBadge(c.status || "new") + '</td>' +
          '<td><button class="btn btn-ghost btn-sm" data-contact-view="' + d.id + '">View</button> ' +
          '<button class="btn btn-ghost btn-sm" data-contact-read="' + d.id + '">Read</button> ' +
          '<button class="btn btn-ghost btn-sm btn-success" data-contact-replied="' + d.id + '">Replied</button></td></tr>'
        );
      });
      container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
        '<th>Name</th><th>Email</th><th>Phone</th><th>Subject</th><th>Message</th><th>Submitted</th><th>Status</th><th>Action</th>' +
        '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

      // View button — opens full message in modal
      container.querySelectorAll("[data-contact-view]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var contactId = btn.dataset.contactView;
          var contactDoc = null;
          snap.forEach(function (d) { if (d.id === contactId) contactDoc = d.data(); });
          if (!contactDoc) return;

          var overlay = document.createElement("div");
          overlay.className = "full-screen-modal-overlay";
          overlay.innerHTML = '<div class="full-screen-modal-content" style="max-width:600px;">' +
            '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">' +
            '<h2 style="margin:0;">Contact Message</h2>' +
            '<button class="btn btn-ghost" onclick="this.closest(\'.full-screen-modal-overlay\').remove()" style="font-size:20px;">&times;</button></div>' +
            '<p><strong>Name:</strong> ' + esc(contactDoc.name || "-") + '</p>' +
            '<p><strong>Email:</strong> ' + esc(contactDoc.email || "-") + '</p>' +
            '<p><strong>Phone:</strong> ' + esc(contactDoc.phone || "-") + '</p>' +
            '<p><strong>Subject:</strong> ' + esc(contactDoc.subject || contactDoc.type || "-") + '</p>' +
            '<p><strong>Submitted:</strong> ' + fmtDate(contactDoc.createdAt) + '</p>' +
            '<p><strong>Status:</strong> ' + statusBadge(contactDoc.status || "new") + '</p>' +
            '<div style="margin-top:16px; padding:16px; background:var(--ink-3); border-radius:8px; border:1px solid var(--line); white-space:pre-wrap; line-height:1.6;">' +
            esc(contactDoc.message || "No message") + '</div>' +
            '</div>';
          document.body.appendChild(overlay);
          overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });
        });
      });

      container.querySelectorAll("[data-contact-read]").forEach(function (btn) {
        btn.addEventListener("click", function () { setContactStatus(btn.dataset.contactRead, "read"); });
      });
      container.querySelectorAll("[data-contact-replied]").forEach(function (btn) {
        btn.addEventListener("click", function () { setContactStatus(btn.dataset.contactReplied, "replied"); });
      });
    }, function(err) {
      container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

async function setContactStatus(id, status) {
  try {
    await db.collection("contacts").doc(id).update({ status: status });
  } catch (err) { uiAlert("Error: " + err.message); }
}

// ---------------------------------------------------------------------------
// Messages (admin sees all threads)
// ---------------------------------------------------------------------------
let unsubAdminMessages = null;
let unsubAdminMessagesUsers = null;
let _adminMessagesCache = { users: {}, threads: {} };

async function loadAdminMessages() {
  var container = document.querySelector("[data-admin-messages]");
  if (!container) return;

  // Add search box
  container.innerHTML = '<div class="admin-toolbar" style="margin-bottom:16px;">' +
    '<input class="admin-search" type="search" placeholder="Search users by name or email to start a chat..." data-msg-search style="flex:1;">' +
    '</div><div data-msg-list><p>Loading...</p></div>';
  var listContainer = container.querySelector("[data-msg-list]");
  var searchInput = container.querySelector("[data-msg-search]");

  function renderList(filter) {
    var searchTerm = (filter || "").toLowerCase().trim();
    var rowData = [];
    for (var uid in _adminMessagesCache.users) {
      var u = _adminMessagesCache.users[uid];
      if (u.role === "admin") continue;
      var t = _adminMessagesCache.threads[uid] || {};
      var hasMessages = !!t.lastMessage;

      // Filter: if searching, show matching users; if not searching, only show users with messages
      if (searchTerm) {
        var hay = ((u.name || "") + " " + (u.email || "")).toLowerCase();
        if (hay.indexOf(searchTerm) === -1) continue;
      } else {
        if (!hasMessages) continue; // Only show users who have messaged
      }

      rowData.push({
        id: uid,
        name: u.name || u.email || "Unknown",
        email: u.email || "",
        lastMessage: t.lastMessage || "No messages yet",
        lastAt: t.lastAt || u.createdAt || null,
        unreadAdmin: t.unreadAdmin || 0,
        hasMessages: hasMessages
      });
    }

    // Sort: unread first, then by lastAt descending
    rowData.sort(function(a, b) {
      if (a.unreadAdmin > 0 && b.unreadAdmin === 0) return -1;
      if (b.unreadAdmin > 0 && a.unreadAdmin === 0) return 1;
      var ta = a.lastAt && typeof a.lastAt.toMillis === 'function' ? a.lastAt.toMillis() : 0;
      var tb = b.lastAt && typeof b.lastAt.toMillis === 'function' ? b.lastAt.toMillis() : 0;
      return tb - ta;
    });

    if (rowData.length === 0) {
      listContainer.innerHTML = searchTerm
        ? '<p>No users matching "' + esc(searchTerm) + '"</p>'
        : '<p>No messages yet. Search for a user above to start a conversation.</p>';
      return;
    }

    var rows = [];
    rowData.forEach(function (m) {
      var badge = m.unreadAdmin > 0 ? ' <span class="badge" style="background:#ff4757;color:#fff;border-radius:12px;padding:2px 6px;font-size:0.75rem;margin-left:8px;">' + m.unreadAdmin + ' new</span>' : '';
      var statusDot = m.hasMessages ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:6px;"></span>' : '';
      rows.push(
        '<tr><td>' + statusDot + esc(m.name) + '<br><span style="font-size:11px;color:var(--muted);">' + esc(m.email) + '</span>' + badge + '</td><td>' + esc(m.lastMessage.slice(0, 60)) + '</td>' +
        '<td>' + (m.lastAt ? fmtDate(m.lastAt) : '-') + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-open-thread="' + m.id + '">Chat</button></td></tr>'
      );
    });

    listContainer.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>User</th><th>Last Message</th><th>Updated</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    listContainer.querySelectorAll("[data-open-thread]").forEach(function (btn) {
      btn.addEventListener("click", function () { openThread(btn.dataset.openThread); });
    });
  }

  if (unsubAdminMessages) { unsubAdminMessages(); unsubAdminMessages = null; }
  if (unsubAdminMessagesUsers) { unsubAdminMessagesUsers(); unsubAdminMessagesUsers = null; }

  // Search input listener
  if (searchInput) {
    searchInput.addEventListener("input", function () { renderList(searchInput.value); });
  }

  try {
    unsubAdminMessagesUsers = db.collection("users").limit(200).onSnapshot(function(snap) {
      snap.forEach(function(d) {
        _adminMessagesCache.users[d.id] = Object.assign({ id: d.id }, d.data());
      });
      renderList(searchInput ? searchInput.value : "");
    }, function(err) {
      listContainer.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });

    unsubAdminMessages = db.collection("messages").onSnapshot(function(snap) {
      snap.forEach(function(d) {
        _adminMessagesCache.threads[d.id] = d.data();
      });
      renderList(searchInput ? searchInput.value : "");
    }, function(err) {
      container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

let unsubAdminThread = null;

function openThread(threadId) {
  var modal = document.querySelector("[data-edit-modal]");
  var body = document.querySelector("[data-modal-body]");
  modal.hidden = false;
  document.body.classList.add("menu-open");

  body.innerHTML = '<h2>Conversation</h2><div class="message-thread" id="admin-thread"></div>' +
    '<form class="message-compose" data-admin-reply-form>' +
    '<textarea data-admin-reply-input rows="3" placeholder="Type your reply..." required></textarea>' +
    '<button class="btn btn-primary" type="submit">Send Reply</button></form>';

  var thread = body.querySelector("#admin-thread");

  if (unsubAdminThread) {
    unsubAdminThread();
    unsubAdminThread = null;
  }

  unsubAdminThread = db.collection("messages").doc(threadId).collection("items")
    .orderBy("createdAt", "asc").limit(100).onSnapshot(function (snap) {
      if (snap.empty) { thread.innerHTML = "<p>No messages.</p>"; return; }
      var html = "";
      snap.forEach(function (d) {
        var m = d.data();
        // In the admin view, admin replies sit on the right; user on the left.
        var mine = m.sender === "admin";
        var cls = mine ? "msg-user" : "msg-admin"; // using existing reversed class names
        var label = mine ? "You" : "User";
        html += '<div class="msg-item ' + cls + '"><strong>' + esc(label) + '</strong><p>' + esc(m.text || "") + '</p></div>';
      });
      thread.innerHTML = html;
      thread.scrollTop = thread.scrollHeight;
    });

  // Clear unreadAdmin count when opening the thread
  db.collection("messages").doc(threadId).set({ unreadAdmin: 0 }, { merge: true }).catch(function(){});

  var replyForm = body.querySelector("[data-admin-reply-form]");
  replyForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    var input = replyForm.querySelector("[data-admin-reply-input]");
    var text = input.value.trim();
    if (!text) return;
    input.disabled = true;
    try {
      await db.collection("messages").doc(threadId).collection("items").add({
        sender: "admin",
        text: text,
        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      });
      await db.collection("messages").doc(threadId).set({
        lastMessage: text,
        lastAt: firebase.firestore.FieldValue.serverTimestamp(),
        unreadUser: firebase.firestore.FieldValue.increment(1)
      }, { merge: true });
      input.value = "";
    } catch (err) {
      uiAlert("Error: " + err.message);
    } finally {
      input.disabled = false;
      input.focus();
    }
  });

  // Ensure unsubscribe when modal closes
  var closeBtn = modal.querySelector(".modal-close");
  if (closeBtn) {
    // Need to cleanly replace or add listener, but modal close is usually handled globally in script.js. 
    // We can just rely on the next openThread calling unsubAdminThread, or attach a one-time listener.
    var origClose = closeBtn.onclick;
    closeBtn.onclick = function(e) {
      if (unsubAdminThread) { unsubAdminThread(); unsubAdminThread = null; }
      if (origClose) origClose.call(this, e);
    };
  }
}

// ---------------------------------------------------------------------------
// Sign-in Logs
// ---------------------------------------------------------------------------
async function loadAdminLogs() {
  var container = document.querySelector("[data-admin-logs]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var search = ((document.querySelector("[data-log-search]") || {}).value || "").trim().toLowerCase();

  try {
    var snap = await db.collection("signinLogs").orderBy("createdAt", "desc").limit(50).get();
    if (snap.empty) { container.innerHTML = "<p>No sign-in activity recorded yet.</p>"; return; }
    var rows = [];
    snap.forEach(function (d) {
      var l = d.data();
      if (search) {
        var hay = ((l.name || "") + " " + (l.email || "")).toLowerCase();
        if (hay.indexOf(search) === -1) return;
      }
      rows.push(
        '<tr><td>' + esc(l.name || "-") + '</td><td>' + esc(l.email || "-") + '</td>' +
        '<td>' + esc(l.role || "-") + '</td><td>' + esc(l.method || "-") + '</td>' +
        '<td>' + esc(l.ip || "-") + '</td>' +
        '<td class="cell-ua">' + esc((l.userAgent || "-").slice(0, 60)) + '</td>' +
        '<td>' + fmtDate(l.createdAt) + '</td></tr>'
      );
    });
    if (!rows.length) { container.innerHTML = "<p>No matching sign-in records.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>User</th><th>Email</th><th>Role</th><th>Method</th><th>IP</th><th>Device</th><th>Date &amp; Time</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

// ---------------------------------------------------------------------------
// Announcements / notifications
// ---------------------------------------------------------------------------
async function sendAnnouncement(e) {
  e.preventDefault();
  var status = document.querySelector("[data-announce-status]");
  var form = e.target;
  var title = document.getElementById("a-title").value.trim();
  var bodyText = document.getElementById("a-body").value.trim();
  var link = document.getElementById("a-link").value.trim();
  var audience = document.getElementById("a-audience").value;
  if (!title || !bodyText) return;

  if (!(await uiConfirm("Send this notification to: " + audience + "?"))) return;
  setBusy(form, true);
  status.style.color = "";
  status.textContent = "Sending...";
  try {
    await addNotification(audience, title, bodyText, link || "portal.html");
    status.style.color = "#85ffaa";
    status.textContent = "Notification sent.";
    form.reset();
    loadAnnouncements();
  } catch (err) {
    status.style.color = "#ff8585";
    status.textContent = "Error: " + err.message;
  } finally {
    setBusy(form, false);
  }
}

async function addNotification(audience, title, body, link) {
  var docRef = await db.collection("notifications").add({
    audience: audience || "all", // "all" | role | a userId
    title: title,
    body: body,
    link: link || "",
    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
  });
  // Send browser push if user has subscribed. The first arg is either a
  // broadcast audience ("all"/role) or a specific userId; the push route
  // filters by audience OR userId, so route per-user targets accordingly.
  var aud = audience || "all";
  var broadcast = ["all", "freelancer", "vendor", "company"].indexOf(aud) !== -1;
  if (broadcast) {
    sendPushToServer(title, body, link || "", aud, null);
  } else {
    sendPushToServer(title, body, link || "", "all", aud); // aud is a userId
  }
  return docRef;
}

// Notify every user enrolled in a given project (one in-app + push per user).
// Used when a project transitions upcoming -> active (spec Section 12.3).
async function notifyEnrolledUsers(projectId, title, body, link) {
  try {
    var snap = await db.collection("participations").where("projectId", "==", projectId).get();
    var seen = {};
    var sends = [];
    snap.forEach(function (d) {
      var uid = d.data().userId;
      if (uid && !seen[uid]) {
        seen[uid] = true;
        sends.push(addNotification(uid, title, body, link));
      }
    });
    await Promise.all(sends);
  } catch (err) {
    console.warn("notifyEnrolledUsers failed:", err.message);
  }
}

async function loadAnnouncements() {
  var container = document.querySelector("[data-announce-list]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";
  try {
    var snap = await db.collection("notifications").orderBy("createdAt", "desc").limit(30).get();
    if (snap.empty) { container.innerHTML = "<p>No notifications sent yet.</p>"; return; }
    var rows = [];
    snap.forEach(function (d) {
      var n = d.data();
      rows.push(
        '<article class="announce-item"><div class="announce-item-head">' +
        '<strong>' + esc(n.title || "") + '</strong>' +
        '<span class="badge badge-neutral">' + esc(n.audience || "all") + '</span></div>' +
        '<p>' + esc(n.body || "") + '</p>' +
        '<span class="cell-sub">' + fmtDate(n.createdAt) + '</span></article>'
      );
    });
    container.innerHTML = rows.join("");
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------
function statusBadge(status) {
  status = (status || "").toLowerCase();
  var map = {
    active: "badge-success", approved: "badge-success", replied: "badge-success",
    upcoming: "badge-warning", pending: "badge-warning", "pending-review": "badge-warning",
    "revision-needed": "badge-warning", interested: "badge-neutral", new: "badge-warning",
    rejected: "badge-danger", paused: "badge-neutral", completed: "badge-neutral",
    read: "badge-neutral", training: "badge-neutral", "in-progress": "badge-warning",
    submitted: "badge-warning", "invoice-submitted": "badge-neutral",
  };
  var cls = map[status] || "badge-neutral";
  return '<span class="badge ' + cls + '">' + esc(status || "-") + '</span>';
}

function roleBadge(role) {
  return '<span class="badge badge-neutral">' + esc(role || "-") + '</span>';
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

function esc(str) {
  return String(str).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// ---------------------------------------------------------------------------
// Payments & Invoicing
// ---------------------------------------------------------------------------
let unsubAdminPayments = null;

async function loadAdminPayments() {
  var container = document.querySelector("[data-admin-payments]");
  if (!container) return;

  if (unsubAdminPayments) {
    unsubAdminPayments();
    unsubAdminPayments = null;
  }
  container.innerHTML = "<p>Loading...</p>";

  var filterSelect = document.querySelector("[data-payment-filter]");

  function renderPayments(snap) {
    var filter = (filterSelect ? filterSelect.value : "all");

    if (snap.empty) { container.innerHTML = "<p>No project participations found.</p>"; return; }

    var rows = [];
    snap.forEach(function (d) {
      var p = d.data();
      var proj = projectCache[p.projectId] || {};
      
      if (proj.status !== "ended") return;
      
      var invStatus = p.invoiceStatus || "pending";
      if (invStatus === "pending") return; // We only care once they submit
      
      if (filter !== "all" && invStatus !== filter) return;
      
      var u = userCache[p.userId] || {};
      var statusText = invStatus === "submitted" ? "Submitted" :
                       invStatus === "rejected" ? "Rejected" :
                       invStatus === "paid" ? "Paid" : invStatus;
                       
      var actions = "";
      if (invStatus === "submitted") {
        actions = '<a href="' + esc(p.invoiceUrl || "#") + '" target="_blank" class="btn btn-ghost btn-sm">View Invoice</a> ' +
                  '<button class="btn btn-ghost btn-sm btn-success" data-mark-paid="' + d.id + '">Pay</button> ' +
                  '<button class="btn btn-ghost btn-sm btn-danger" data-reject-inv="' + d.id + '">Reject</button>';
      }

      rows.push(
        '<tr><td>' + esc(u.name || p.userId || "-") + '<br><span class="cell-sub">' + esc(u.role || "") + '</span></td>' +
        '<td>' + esc(proj.name || p.projectId || "-") + '</td>' +
        '<td><span class="badge badge-neutral">' + statusText + '</span></td>' +
        '<td>' + actions + '</td></tr>'
      );
    });

    if (!rows.length) { container.innerHTML = "<p>No records matching this filter.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>User</th><th>Project</th><th>Invoice Status</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-reject-inv]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var reason = await uiPrompt("Enter reason for rejecting this invoice (e.g., hours mismatch):");
        if (!reason) return;
        btn.disabled = true;
        btn.textContent = "Rejecting...";
        try {
          var docId = btn.dataset.rejectInv;
          var docSnap = await db.collection("participations").doc(docId).get();
          var pData = docSnap.data();
          await db.collection("participations").doc(docId).update({ invoiceStatus: "rejected", invoiceRejectReason: reason, step: 4 });
          var projName = projectCache[pData.projectId] ? projectCache[pData.projectId].name : "a project";
          await addNotification(pData.userId, "Invoice Rejected", "Your invoice for " + esc(projName) + " was rejected: " + reason + ". Please resubmit.", "portal.html");
        } catch(e) { uiAlert(e.message); btn.disabled = false; btn.textContent = "Reject"; }
      });
    });

    container.querySelectorAll("[data-mark-paid]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        if (!(await uiConfirm("Mark this invoice as paid?"))) return;
        btn.disabled = true;
        btn.textContent = "Processing...";
        try {
          var docId = btn.dataset.markPaid;
          var docSnap = await db.collection("participations").doc(docId).get();
          var pData = docSnap.data();
          await db.collection("participations").doc(docId).update({ invoiceStatus: "paid", step: 5 });
          var projName = projectCache[pData.projectId] ? projectCache[pData.projectId].name : "a project";
          await addNotification(pData.userId, "Payment Processed", "Your payment for " + esc(projName) + " has been processed.", "portal.html");
        } catch(e) { uiAlert(e.message); btn.disabled = false; btn.textContent = "Pay"; }
      });
    });
  }

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);
    
    if (filterSelect) {
      var newSelect = filterSelect.cloneNode(true);
      filterSelect.parentNode.replaceChild(newSelect, filterSelect);
      filterSelect = newSelect;
    }

    unsubAdminPayments = db.collection("participations").onSnapshot(function(snap) {
      if (filterSelect) {
        filterSelect.onchange = function() { renderPayments(snap); };
      }
      renderPayments(snap);
    }, function(err) {
      container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

var pf = document.querySelector("[data-payment-filter]");
if (pf) pf.addEventListener("change", loadAdminPayments);

// ---------------------------------------------------------------------------
// Languages Verification Dashboard
// ---------------------------------------------------------------------------
var _langUsersCache = null;

async function loadLanguages() {
  var gridEl = document.querySelector("[data-lang-grid]");
  var detailEl = document.querySelector("[data-lang-detail]");
  if (!gridEl) return;
  detailEl.hidden = true;
  gridEl.style.display = "";
  gridEl.innerHTML = '<p class="section-copy">Loading language data...</p>';

  try {
    var snap = await db.collection("users").limit(200).get();
    var users = [];
    snap.forEach(function(doc) {
      var d = doc.data();
      d._id = doc.id;
      users.push(d);
    });
    _langUsersCache = users;
    renderLanguageGrid(users, gridEl, detailEl);
  } catch (err) {
    gridEl.innerHTML = '<p class="section-copy">Error loading languages: ' + esc(err.message) + '</p>';
  }
}

function renderLanguageGrid(users, gridEl, detailEl) {
  var searchEl = document.querySelector("[data-lang-search]");
  var searchTerm = searchEl ? searchEl.value.toLowerCase().trim() : "";

  // Aggregate language data
  var langMap = {}; // { langName: { total: N, companies: [{user, count}], vendors: [{user, count}], freelancers: [{user}] } }

  users.forEach(function(u) {
    if (u.role === "admin") return;

    var langEntries = [];

    // Check for languageResources first (vendors/companies with explicit counts)
    if ((u.role === "vendor" || u.role === "company") && u.languageResources && u.languageResources.length > 0) {
      u.languageResources.forEach(function(lr) {
        if (lr.language && lr.language.trim()) {
          langEntries.push({ language: lr.language.trim(), count: parseInt(lr.count) || 1 });
        }
      });
    }
    // Fallback to languages array
    else if (u.languages && u.languages.length > 0) {
      u.languages.forEach(function(lang) {
        if (lang && lang.trim()) {
          langEntries.push({ language: lang.trim(), count: 1 });
        }
      });
    }

    langEntries.forEach(function(entry) {
      var key = entry.language.toLowerCase();
      if (!langMap[key]) {
        langMap[key] = { name: entry.language, total: 0, companies: [], vendors: [], freelancers: [] };
      }
      // Use the casing from the first encounter
      langMap[key].total += entry.count;
      var userEntry = { user: u, count: entry.count };
      if (u.role === "company") langMap[key].companies.push(userEntry);
      else if (u.role === "vendor") langMap[key].vendors.push(userEntry);
      else langMap[key].freelancers.push(userEntry);
    });
  });

  // Convert to sorted array
  var langList = Object.values(langMap).sort(function(a, b) { return b.total - a.total; });

  // Apply search filter
  if (searchTerm) {
    langList = langList.filter(function(l) { return l.name.toLowerCase().indexOf(searchTerm) !== -1; });
  }

  if (langList.length === 0) {
    gridEl.innerHTML = '<div class="lang-empty">' + (searchTerm ? 'No languages matching "' + esc(searchTerm) + '"' : 'No language data found. Users need to add languages to their profiles.') + '</div>';
    return;
  }

  gridEl.innerHTML = langList.map(function(lang) {
    var initial = lang.name.charAt(0).toUpperCase();
    var badges = [];
    if (lang.companies.length > 0) badges.push('<span class="lang-badge">' + lang.companies.length + ' Compan' + (lang.companies.length === 1 ? 'y' : 'ies') + '</span>');
    if (lang.vendors.length > 0) badges.push('<span class="lang-badge">' + lang.vendors.length + ' Vendor' + (lang.vendors.length === 1 ? '' : 's') + '</span>');
    if (lang.freelancers.length > 0) badges.push('<span class="lang-badge">' + lang.freelancers.length + ' Individual' + (lang.freelancers.length === 1 ? '' : 's') + '</span>');

    return '<div class="lang-card" data-lang-key="' + esc(lang.name.toLowerCase()) + '">' +
      '<div class="lang-card-name"><span class="lang-icon">' + esc(initial) + '</span>' + esc(lang.name) + '</div>' +
      '<div class="lang-card-count">' + lang.total + '<span>resource' + (lang.total === 1 ? '' : 's') + '</span></div>' +
      '<div class="lang-card-breakdown">' + badges.join('') + '</div>' +
    '</div>';
  }).join('');

  // Click handlers
  gridEl.querySelectorAll(".lang-card").forEach(function(card) {
    card.addEventListener("click", function() {
      var key = card.getAttribute("data-lang-key");
      var lang = langMap[key];
      if (lang) showLanguageDetail(lang, gridEl, detailEl);
    });
  });
}

function showLanguageDetail(lang, gridEl, detailEl) {
  gridEl.style.display = "none";
  detailEl.hidden = false;

  var titleEl = document.querySelector("[data-lang-detail-title]");
  var bodyEl = document.querySelector("[data-lang-detail-body]");
  var backBtn = document.querySelector("[data-lang-back]");

  titleEl.textContent = lang.name + " — " + lang.total + " Resource" + (lang.total === 1 ? '' : 's');

  var html = '';

  function buildTable(entries, roleClass) {
    if (entries.length === 0) return '';
    var t = '<table class="lang-detail-table">';
    t += '<thead><tr><th>Name</th><th>Type</th><th>Company</th><th>Resources</th><th>Email</th><th>Phone</th></tr></thead>';
    t += '<tbody>';
    entries.forEach(function(e) {
      t += '<tr>';
      t += '<td>' + esc(e.user.name || '—') + '</td>';
      t += '<td><span class="role-pill ' + roleClass + '">' + (e.user.role || 'freelancer') + '</span></td>';
      t += '<td>' + esc(e.user.companyName || '—') + '</td>';
      t += '<td class="lang-resource-count">' + e.count + '</td>';
      t += '<td><a href="mailto:' + esc(e.user.email || '') + '" style="color:var(--blue);">' + esc(e.user.email || '—') + '</a></td>';
      t += '<td>' + esc(e.user.phone || '—') + '</td>';
      t += '</tr>';
    });
    t += '</tbody></table>';
    return t;
  }

  if (lang.companies.length > 0) {
    html += '<div class="lang-detail-group"><h3>Companies (' + lang.companies.length + ')</h3>' + buildTable(lang.companies, 'company') + '</div>';
  }
  if (lang.vendors.length > 0) {
    html += '<div class="lang-detail-group"><h3>Vendors (' + lang.vendors.length + ')</h3>' + buildTable(lang.vendors, 'vendor') + '</div>';
  }
  if (lang.freelancers.length > 0) {
    html += '<div class="lang-detail-group"><h3>Individuals (' + lang.freelancers.length + ')</h3>' + buildTable(lang.freelancers, 'freelancer') + '</div>';
  }

  bodyEl.innerHTML = html;

  // Back button
  backBtn.onclick = function() {
    detailEl.hidden = true;
    gridEl.style.display = "";
  };
}

// ---------------------------------------------------------------------------
// Admin Access Management (Super Admin only)
// Lists all admins, allows granting / revoking admin access with audit trail.
// ---------------------------------------------------------------------------
var _adminAccessUnsub = null;

function loadAdminAccess() {
  var container = document.querySelector("[data-admin-access-list]");
  if (!container) return;

  // Only super admin should see this
  if (!window._isSuperAdmin) {
    container.innerHTML = '<p class="section-copy">Access denied. Only the Super Admin can manage admin access.</p>';
    return;
  }

  // Real-time listener for all admin users
  if (_adminAccessUnsub) _adminAccessUnsub();
  _adminAccessUnsub = db.collection("users").where("role", "==", "admin").onSnapshot(function (snap) {
    renderAdminAccessList(snap, container);
  }, function (err) {
    container.innerHTML = '<p class="section-copy">Error: ' + esc(err.message) + '</p>';
  });

  // Grant Admin button
  var grantBtn = document.querySelector("[data-grant-admin-btn]");
  if (grantBtn) {
    // Remove old listener if re-loaded
    var newBtn = grantBtn.cloneNode(true);
    grantBtn.parentNode.replaceChild(newBtn, grantBtn);
    newBtn.addEventListener("click", grantAdminAccess);
  }

  // Search filter
  var searchEl = document.querySelector("[data-admin-access-search]");
  if (searchEl) {
    searchEl.addEventListener("input", function () {
      // Trigger a re-render by re-reading the last snapshot
      if (_adminAccessUnsub) { _adminAccessUnsub(); _adminAccessUnsub = null; }
      _adminAccessUnsub = db.collection("users").where("role", "==", "admin").onSnapshot(function (snap) {
        renderAdminAccessList(snap, container);
      });
    });
  }
}

function renderAdminAccessList(snap, container) {
  if (snap.empty) {
    container.innerHTML = '<p class="section-copy">No admins found.</p>';
    return;
  }

  var searchEl = document.querySelector("[data-admin-access-search]");
  var search = searchEl ? searchEl.value.toLowerCase().trim() : "";

  var admins = [];
  snap.forEach(function (doc) {
    var d = doc.data();
    d._id = doc.id;
    admins.push(d);
  });

  // Filter by search
  if (search) {
    admins = admins.filter(function (a) {
      return (a.name || "").toLowerCase().indexOf(search) !== -1 ||
             (a.email || "").toLowerCase().indexOf(search) !== -1;
    });
  }

  // Sort: super admin first, then by name
  admins.sort(function (a, b) {
    var aIsSuper = isSuperAdminEmail(a.email) ? 0 : 1;
    var bIsSuper = isSuperAdminEmail(b.email) ? 0 : 1;
    if (aIsSuper !== bIsSuper) return aIsSuper - bIsSuper;
    return (a.name || "").localeCompare(b.name || "");
  });

  var rows = admins.map(function (a) {
    var isSuper = isSuperAdminEmail(a.email);
    var badge = isSuper
      ? '<span class="role-pill" style="background:#916BBF;color:#fff;">Super Admin</span>'
      : '<span class="role-pill" style="background:#3D2C8D;color:#fff;">Admin</span>';
    var grantedInfo = "";
    if (a.adminGrantedBy) {
      grantedInfo = '<br><small style="color:var(--muted);">Granted by ' + esc(a.adminGrantedBy) +
        (a.adminGrantedAt ? ' on ' + fmtDate(a.adminGrantedAt) : '') + '</small>';
    }
    var actions = isSuper
      ? '<span style="color:var(--muted);font-size:0.85rem;">Cannot revoke</span>'
      : '<button class="btn btn-ghost btn-sm" style="color:#ff4757;" data-revoke-admin="' + esc(a._id) + '" data-revoke-name="' + esc(a.name || a.email) + '">Revoke Admin</button>';

    return '<tr>' +
      '<td>' + esc(a.name || "—") + '</td>' +
      '<td>' + esc(a.email || "—") + '</td>' +
      '<td>' + badge + grantedInfo + '</td>' +
      '<td>' + fmtDate(a.createdAt) + '</td>' +
      '<td>' + actions + '</td>' +
    '</tr>';
  });

  container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
    '<th>Name</th><th>Email</th><th>Status</th><th>Registered</th><th>Action</th>' +
    '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

  // Wire revoke buttons
  container.querySelectorAll("[data-revoke-admin]").forEach(function (btn) {
    btn.addEventListener("click", async function () {
      var uid = btn.dataset.revokeAdmin;
      var name = btn.dataset.revokeName;
      var confirmed = await uiConfirm("Revoke admin access from " + name + "?\nThey will be set back to 'freelancer'.");
      if (!confirmed) return;
      try {
        await db.collection("users").doc(uid).update({
          role: "freelancer",
          adminRevokedBy: getAuth().currentUser.email,
          adminRevokedAt: firebase.firestore.FieldValue.serverTimestamp(),
        });
        uiAlert("Admin access revoked from " + name + ".");
      } catch (err) { uiAlert("Error: " + err.message); }
    });
  });
}

async function grantAdminAccess() {
  var emailOrName = await uiPrompt("Enter the email address of the user to grant admin access:", "");
  if (!emailOrName || !emailOrName.trim()) return;
  emailOrName = emailOrName.trim().toLowerCase();

  // Prevent granting to self (super admin already has access)
  if (isSuperAdminEmail(emailOrName)) {
    uiAlert("You already have Super Admin access.");
    return;
  }

  try {
    // Search for user by email
    var snap = await db.collection("users").where("email", "==", emailOrName).get();
    if (snap.empty) {
      uiAlert("No user found with email: " + emailOrName + "\n\nMake sure the user has registered first.");
      return;
    }

    var userDoc = snap.docs[0];
    var userData = userDoc.data();

    if (userData.role === "admin") {
      uiAlert(esc(userData.name || userData.email) + " is already an admin.");
      return;
    }

    var confirmed = await uiConfirm(
      "Grant admin access to:\n\n" +
      "Name: " + (userData.name || "—") + "\n" +
      "Email: " + (userData.email || "—") + "\n" +
      "Current role: " + (userData.role || "—") + "\n\n" +
      "They will get FULL admin panel access (projects, users, messages, etc.).\n" +
      "They will NOT be able to grant admin to others — only you can do that."
    );
    if (!confirmed) return;

    await db.collection("users").doc(userDoc.id).update({
      role: "admin",
      previousRole: userData.role || "freelancer",
      adminGrantedBy: getAuth().currentUser.email,
      adminGrantedAt: firebase.firestore.FieldValue.serverTimestamp(),
    });

    uiAlert("Admin access granted to " + (userData.name || userData.email) + ".");
  } catch (err) {
    uiAlert("Error: " + err.message);
  }
}

// uiConfirm helper (if not already defined)
if (typeof uiConfirm === "undefined") {
  window.uiConfirm = function (msg) {
    return Promise.resolve(confirm(msg));
  };
}

// ---------------------------------------------------------------------------
// CSV Download — exports user data, registrations, or any collection
// ---------------------------------------------------------------------------
function downloadUsersCSV() {
  ensureUsers().then(function () {
    var headers = ["Name", "Email", "Phone", "Role", "Company", "Registered", "CV URL"];
    var rows = [headers.join(",")];
    var count = 0;

    Object.keys(userCache).forEach(function (uid) {
      var u = userCache[uid];
      if (!isInDateRange(u.createdAt)) return;
      rows.push([
        csvEscape(u.name || ""),
        csvEscape(u.email || ""),
        csvEscape(u.phone || ""),
        csvEscape(u.role || ""),
        csvEscape(u.companyName || ""),
        csvEscape(fmtDate(u.createdAt)),
        csvEscape(u.cvUrl || ""),
      ].join(","));
      count++;
    });

    if (count === 0) { uiAlert("No users found for the selected filters."); return; }
    downloadCSV(rows.join("\n"), "yugm_users_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + count + " users as CSV.");
  });
}

function downloadRegistrationsCSV() {
  ensureUsers().then(function () {
    var projectId = getSelectedProjectId();
    var query = db.collection("participations").limit(10000);
    if (projectId) query = query.where("projectId", "==", projectId);
    query.get().then(function (snap) {
      var headers = ["User ID", "Name", "Email", "Phone", "Project", "Status", "Step", "Applied At"];
      var rows = [headers.join(",")];
      var count = 0;

      snap.forEach(function (doc) {
        var p = doc.data();
        if (!isInDateRange(p.appliedAt)) return;
        var u = userCache[p.userId] || {};
        rows.push([
          csvEscape(p.userId || ""),
          csvEscape(u.name || ""),
          csvEscape(u.email || ""),
          csvEscape(u.phone || ""),
          csvEscape(projectName(p.projectId)),
          csvEscape(p.status || ""),
          csvEscape(String(p.step || "")),
          csvEscape(fmtDate(p.appliedAt)),
        ].join(","));
        count++;
      });

      if (count === 0) { uiAlert("No participation records found for the selected filters."); return; }
      downloadCSV(rows.join("\n"), "yugm_participation_" + new Date().toISOString().slice(0, 10) + ".csv");
      uiAlert("Downloaded " + count + " participation records as CSV.");
    });
  });
}

function downloadSubmissionsCSV() {
  ensureUsers().then(function () {
    var projectId = getSelectedProjectId();
    var query = db.collection("submissions").limit(10000);
    if (projectId) query = query.where("projectId", "==", projectId);
    query.get().then(function (snap) {
      var headers = ["User ID", "Name", "Project", "Work Type", "Hours", "Status", "Drive Link", "Submitted At"];
      var rows = [headers.join(",")];
      var count = 0;

      snap.forEach(function (doc) {
        var s = doc.data();
        if (!isInDateRange(s.submittedAt)) return;
        var u = userCache[s.userId] || {};
        rows.push([
          csvEscape(s.userId || ""),
          csvEscape(u.name || ""),
          csvEscape(projectName(s.projectId)),
          csvEscape(s.workType || ""),
          csvEscape(String(s.hours || "")),
          csvEscape(s.status || ""),
          csvEscape(s.driveLink || ""),
          csvEscape(fmtDate(s.submittedAt)),
        ].join(","));
        count++;
      });

      if (count === 0) { uiAlert("No submissions found for the selected filters."); return; }
      downloadCSV(rows.join("\n"), "yugm_submissions_" + new Date().toISOString().slice(0, 10) + ".csv");
      uiAlert("Downloaded " + count + " submissions as CSV.");
    });
  });
}

function csvEscape(val) {
  var str = String(val);
  if (str.indexOf(",") !== -1 || str.indexOf('"') !== -1 || str.indexOf("\n") !== -1) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

function downloadCSV(csvContent, filename) {
  var blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
  var url = URL.createObjectURL(blob);
  var a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Admin Files — shows all uploaded files across the platform
// ---------------------------------------------------------------------------
async function loadAdminFiles() {
  var container = document.querySelector("[data-admin-files]");
  if (!container) return;
  container.innerHTML = '<p class="section-copy">Loading all files...</p>';

  try {
    // Get all users, participations, and submissions
    var results = await Promise.all([
      db.collection("users").limit(200).get(),
      db.collection("participations").limit(200).get(),
      db.collection("submissions").limit(200).get(),
    ]);

    var allUsers = {};
    results[0].forEach(function (d) { allUsers[d.id] = d.data(); });

    var files = [];

    // CVs from user profiles
    Object.keys(allUsers).forEach(function (uid) {
      var u = allUsers[uid];
      if (u.cvUrl) {
        files.push({ type: "CV", name: u.cvName || "CV", user: u.name || u.email || uid, url: u.cvUrl, date: u.updatedAt });
      }
    });

    // Invoices and NDAs from participations
    results[1].forEach(function (d) {
      var p = d.data();
      var userName = allUsers[p.userId]?.name || allUsers[p.userId]?.email || p.userId;
      if (p.invoiceUrl) {
        files.push({ type: "Invoice", name: "Invoice", user: userName, url: p.invoiceUrl, date: p.invoiceSubmittedAt });
      }
      if (p.ndaUrl) {
        files.push({ type: "NDA", name: "Signed NDA", user: userName, url: p.ndaUrl, date: p.ndaSubmittedAt });
      }
    });

    // Submission files
    results[2].forEach(function (d) {
      var s = d.data();
      var userName = allUsers[s.userId]?.name || allUsers[s.userId]?.email || s.userId;
      if (s.driveLink) {
        files.push({ type: "Submission", name: s.workType || "Work", user: userName, url: s.driveLink, date: s.submittedAt });
      }
    });

    if (files.length === 0) {
      container.innerHTML = '<p class="section-copy">No files uploaded yet.</p>';
      return;
    }

    var html = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Type</th><th>User</th><th>File</th><th>Uploaded</th><th>Action</th>' +
      '</tr></thead><tbody>';

    files.forEach(function (f) {
      var typeBadge = {
        "CV": "background:rgba(59,130,246,0.15);color:#3B82F6;",
        "Invoice": "background:rgba(16,185,129,0.15);color:#10B981;",
        "NDA": "background:rgba(245,158,11,0.15);color:#F59E0B;",
        "Submission": "background:rgba(139,92,246,0.15);color:#8B5CF6;",
      }[f.type] || "background:rgba(255,255,255,0.1);color:#fff;";

      html += '<tr>' +
        '<td><span style="padding:3px 10px; border-radius:20px; font-size:11px; font-weight:600; ' + typeBadge + '">' + esc(f.type) + '</span></td>' +
        '<td>' + esc(f.user) + '</td>' +
        '<td>' + esc(f.name) + '</td>' +
        '<td>' + fmtDate(f.date) + '</td>' +
        '<td><a href="' + esc(f.url) + '" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">View</a></td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

  } catch (err) {
    container.innerHTML = '<p class="section-copy" style="color:#ff8585;">Error: ' + esc(err.message) + '</p>';
  }
}

// Contacts CSV download
function downloadContactsCSV() {
  db.collection("contacts").limit(500).get().then(function (snap) {
    var headers = ["Name", "Email", "Phone", "Subject", "Message", "Status", "Submitted"];
    var rows = [headers.join(",")];
    snap.forEach(function (d) {
      var c = d.data();
      rows.push([
        csvEscape(c.name || ""),
        csvEscape(c.email || ""),
        csvEscape(c.phone || ""),
        csvEscape(c.subject || c.type || ""),
        csvEscape(c.message || ""),
        csvEscape(c.status || "new"),
        csvEscape(fmtDate(c.createdAt)),
      ].join(","));
    });
    downloadCSV(rows.join("\n"), "yugm_contacts_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + (rows.length - 1) + " contacts as CSV.");
  });
}

// Sign-in Logs CSV
function downloadLogsCSV() {
  db.collection("signinLogs").orderBy("createdAt", "desc").limit(10000).get().then(function (snap) {
    var headers = ["Name", "Email", "Role", "Method", "IP", "User Agent", "Time"];
    var rows = [headers.join(",")];
    snap.forEach(function (d) {
      var l = d.data();
      rows.push([
        csvEscape(l.name || ""),
        csvEscape(l.email || ""),
        csvEscape(l.role || ""),
        csvEscape(l.method || ""),
        csvEscape(l.ip || ""),
        csvEscape((l.userAgent || "").slice(0, 80)),
        csvEscape(fmtDate(l.createdAt)),
      ].join(","));
    });
    downloadCSV(rows.join("\n"), "yugm_signin_logs_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + (rows.length - 1) + " sign-in logs as CSV.");
  });
}

// Announcements CSV
function downloadAnnouncementsCSV() {
  db.collection("notifications").orderBy("createdAt", "desc").limit(10000).get().then(function (snap) {
    var headers = ["Title", "Body", "Link", "Audience", "Sent At"];
    var rows = [headers.join(",")];
    snap.forEach(function (d) {
      var n = d.data();
      rows.push([
        csvEscape(n.title || ""),
        csvEscape(n.body || ""),
        csvEscape(n.link || ""),
        csvEscape(n.audience || "all"),
        csvEscape(fmtDate(n.createdAt)),
      ].join(","));
    });
    downloadCSV(rows.join("\n"), "yugm_announcements_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + (rows.length - 1) + " announcements as CSV.");
  });
}

// Projects CSV
function downloadProjectsCSV() {
  db.collection("projects").limit(10000).get().then(function (snap) {
    var headers = ["Name", "Modality", "Status", "Payout", "Languages", "Created"];
    var rows = [headers.join(",")];
    snap.forEach(function (d) {
      var p = d.data();
      rows.push([
        csvEscape(p.name || ""),
        csvEscape(p.modality || ""),
        csvEscape(p.status || ""),
        csvEscape(p.payout || ""),
        csvEscape(Array.isArray(p.languages) ? p.languages.join("; ") : ""),
        csvEscape(fmtDate(p.createdAt)),
      ].join(","));
    });
    downloadCSV(rows.join("\n"), "yugm_projects_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + (rows.length - 1) + " projects as CSV.");
  });
}

// Languages CSV
function downloadLanguagesCSV() {
  ensureUsers().then(function () {
    var langMap = {};
    Object.keys(userCache).forEach(function (uid) {
      var u = userCache[uid];
      if (u.role === "admin") return;
      var langs = u.languages || u.languageResources || [];
      if (Array.isArray(langs)) {
        langs.forEach(function (l) {
          var lang = typeof l === "string" ? l : l.language;
          var count = typeof l === "object" ? (l.count || 1) : 1;
          if (lang) {
            if (!langMap[lang]) langMap[lang] = { total: 0, users: 0 };
            langMap[lang].total += count;
            langMap[lang].users++;
          }
        });
      }
    });

    var headers = ["Language", "Total Resources", "Contributors"];
    var rows = [headers.join(",")];
    Object.keys(langMap).sort().forEach(function (lang) {
      rows.push([csvEscape(lang), langMap[lang].total, langMap[lang].users].join(","));
    });
    downloadCSV(rows.join("\n"), "yugm_languages_" + new Date().toISOString().slice(0, 10) + ".csv");
    uiAlert("Downloaded " + (rows.length - 1) + " languages as CSV.");
  });
}

// ---------------------------------------------------------------------------
// Export Data tab — populate project filter + show record counts
// ---------------------------------------------------------------------------
async function loadExportData() {
  // Populate project filter dropdown
  var projectSelect = document.getElementById("export-project-filter");
  if (projectSelect) {
    await ensureProjects();
    Object.keys(projectCache).forEach(function (pid) {
      var p = projectCache[pid];
      var opt = document.createElement("option");
      opt.value = pid;
      opt.textContent = p.name || pid;
      projectSelect.appendChild(opt);
    });
  }

  // Show record counts
  try {
    await ensureUsers();
    var usersCount = document.querySelector("[data-export-count-users]");
    if (usersCount) usersCount.textContent = Object.keys(userCache).length + " records";

    var partsCount = document.querySelector("[data-export-count-parts]");
    if (partsCount) {
      var partsSnap = await db.collection("participations").limit(10000).get();
      partsCount.textContent = partsSnap.size + " records";
    }

    var subsCount = document.querySelector("[data-export-count-subs]");
    if (subsCount) {
      var subsSnap = await db.collection("submissions").limit(10000).get();
      subsCount.textContent = subsSnap.size + " records";
    }

    var contactsCount = document.querySelector("[data-export-count-contacts]");
    if (contactsCount) {
      var contactsSnap = await db.collection("contacts").limit(10000).get();
      contactsCount.textContent = contactsSnap.size + " records";
    }

    var logsCount = document.querySelector("[data-export-count-logs]");
    if (logsCount) {
      var logsSnap = await db.collection("signinLogs").limit(10000).get();
      logsCount.textContent = logsSnap.size + " records";
    }

    var announceCount = document.querySelector("[data-export-count-announce]");
    if (announceCount) {
      var announceSnap = await db.collection("notifications").limit(10000).get();
      announceCount.textContent = announceSnap.size + " records";
    }

    var projectsCount = document.querySelector("[data-export-count-projects]");
    if (projectsCount) projectsCount.textContent = Object.keys(projectCache).length + " records";

    var langsCount = document.querySelector("[data-export-count-langs]");
    if (langsCount) {
      var langSet = {};
      Object.keys(userCache).forEach(function (uid) {
        var u = userCache[uid];
        var langs = u.languages || u.languageResources || [];
        if (Array.isArray(langs)) {
          langs.forEach(function (l) {
            var lang = typeof l === "string" ? l : l.language;
            if (lang) langSet[lang] = true;
          });
        }
      });
      langsCount.textContent = Object.keys(langSet).length + " languages";
    }
  } catch (err) {
    console.error("[export] count error:", err);
  }
}

// Date filter helper — returns true if timestamp is within the selected date range
function isInDateRange(ts) {
  if (!ts) return true;
  var fromEl = document.getElementById("export-date-from");
  var toEl = document.getElementById("export-date-to");
  var fromVal = fromEl ? fromEl.value : "";
  var toVal = toEl ? toEl.value : "";
  if (!fromVal && !toVal) return true;

  var date;
  if (ts && typeof ts.toDate === "function") {
    date = ts.toDate();
  } else if (ts && typeof ts.toMillis === "function") {
    date = new Date(ts.toMillis());
  } else {
    date = new Date(ts);
  }
  if (isNaN(date.getTime())) return true;

  if (fromVal && date < new Date(fromVal)) return false;
  if (toVal && date > new Date(toVal + "T23:59:59")) return false;
  return true;
}

// Project filter helper
function getSelectedProjectId() {
  var el = document.getElementById("export-project-filter");
  return el ? el.value : "";
}

// ---------------------------------------------------------------------------
// Validation CSV Upload — admin uploads scores/feedback per contributor
// CSV format: email,name,score,feedback
// ---------------------------------------------------------------------------
function openValidationUpload(projectId) {
  var overlay = document.createElement("div");
  overlay.className = "full-screen-modal-overlay";
  overlay.innerHTML = '<div class="full-screen-modal-content" style="max-width:600px;">' +
    '<div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">' +
    '<h2 style="margin:0;">Upload Validation CSV</h2>' +
    '<button class="btn btn-ghost" id="close-validation-modal" style="font-size:20px;">&times;</button></div>' +
    '<p style="font-size:13px; color:var(--muted); margin-bottom:16px;">Upload a CSV file with validation scores for contributors. ' +
    'Format: <code>email,name,score,feedback</code> — one row per contributor.</p>' +
    '<div class="field"><label>Select CSV File</label>' +
    '<input type="file" id="validation-csv-file" accept=".csv,.txt"></div>' +
    '<div id="validation-preview" style="margin-top:16px;"></div>' +
    '<div style="margin-top:16px; display:flex; gap:10px;">' +
    '<button class="btn btn-primary" id="btn-upload-validation" disabled>Upload Validation Data</button>' +
    '<button class="btn btn-ghost" id="btn-cancel-validation">Cancel</button></div>' +
    '</div>';
  document.body.appendChild(overlay);

  overlay.querySelector("#close-validation-modal").addEventListener("click", function () { overlay.remove(); });
  overlay.querySelector("#btn-cancel-validation").addEventListener("click", function () { overlay.remove(); });
  overlay.addEventListener("click", function (e) { if (e.target === overlay) overlay.remove(); });

  var fileInput = overlay.querySelector("#validation-csv-file");
  var preview = overlay.querySelector("#validation-preview");
  var uploadBtn = overlay.querySelector("#btn-upload-validation");
  var parsedData = [];

  fileInput.addEventListener("change", function () {
    var file = fileInput.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function (e) {
      var lines = e.target.result.split("\n").filter(function (l) { return l.trim(); });
      if (lines.length < 2) { preview.innerHTML = '<p style="color:#ff8585;">CSV must have a header row and at least one data row.</p>'; return; }

      // Parse header
      var header = lines[0].split(",").map(function (h) { return h.trim().toLowerCase(); });
      var emailIdx = header.indexOf("email");
      var nameIdx = header.indexOf("name");
      var scoreIdx = header.indexOf("score");
      var feedbackIdx = header.indexOf("feedback");

      if (emailIdx === -1) { preview.innerHTML = '<p style="color:#ff8585;">CSV must have an "email" column.</p>'; return; }

      parsedData = [];
      for (var i = 1; i < lines.length; i++) {
        var cols = lines[i].split(",").map(function (c) { return c.trim(); });
        if (cols.length < 2) continue;
        parsedData.push({
          email: cols[emailIdx] || "",
          name: nameIdx >= 0 ? cols[nameIdx] || "" : "",
          score: scoreIdx >= 0 ? parseInt(cols[scoreIdx]) || 0 : 0,
          feedback: feedbackIdx >= 0 ? cols.slice(feedbackIdx).join(",").trim() : "",
        });
      }

      if (parsedData.length === 0) { preview.innerHTML = '<p style="color:#ff8585;">No valid rows found.</p>'; return; }

      var html = '<p style="font-size:13px; margin-bottom:8px;">Preview (' + parsedData.length + ' contributors):</p>';
      html += '<div style="max-height:200px; overflow-y:auto; background:var(--ink-3); border:1px solid var(--line); border-radius:8px; padding:12px;">';
      parsedData.slice(0, 10).forEach(function (row) {
        html += '<div style="display:flex; gap:12px; padding:4px 0; font-size:12px; border-bottom:1px solid var(--line);">' +
          '<span style="flex:1;">' + esc(row.email) + '</span>' +
          '<span style="flex:1;">' + esc(row.name) + '</span>' +
          '<span style="width:50px; text-align:right; font-weight:600;">' + row.score + '</span>' +
          '<span style="flex:2; color:var(--muted);">' + esc(row.feedback.slice(0, 40)) + '</span></div>';
      });
      if (parsedData.length > 10) html += '<p style="font-size:11px; color:var(--muted); margin-top:8px;">...and ' + (parsedData.length - 10) + ' more</p>';
      html += '</div>';
      preview.innerHTML = html;
      uploadBtn.disabled = false;
    };
    reader.readAsText(file);
  });

  uploadBtn.addEventListener("click", async function () {
    if (parsedData.length === 0) return;
    uploadBtn.disabled = true;
    uploadBtn.textContent = "Uploading...";

    try {
      var batch = db.batch();
      parsedData.forEach(function (row) {
        var ref = db.collection("validations").doc(projectId + "_" + row.email.replace(/[^a-zA-Z0-9]/g, "_"));
        batch.set(ref, {
          projectId: projectId,
          email: row.email,
          name: row.name,
          score: row.score,
          feedback: row.feedback,
          uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
      });
      await batch.commit();
      uiAlert("Validation data uploaded for " + parsedData.length + " contributors.");
      overlay.remove();
    } catch (err) {
      uiAlert("Upload error: " + err.message);
      uploadBtn.disabled = false;
      uploadBtn.textContent = "Upload Validation Data";
    }
  });
}
