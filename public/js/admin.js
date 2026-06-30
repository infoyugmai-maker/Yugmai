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
  };

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
  if (Object.keys(userCache).length) return userCache;
  var snap = await db.collection("users").get();
  snap.forEach(function (d) { userCache[d.id] = d.data(); });
  return userCache;
}

async function ensureProjects() {
  if (Object.keys(projectCache).length) return projectCache;
  var snap = await db.collection("projects").get();
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
    var results = await Promise.all([
      db.collection("users").get(),
      db.collection("projects").get(),
      db.collection("participations").get(),
      db.collection("submissions").get(),
      db.collection("contacts").get(),
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
async function loadAdminProjects() {
  var container = document.querySelector("[data-admin-projects]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var search = (document.querySelector("[data-project-search]") || {}).value || "";
  search = search.trim().toLowerCase();

  try {
    var snap = await db.collection("projects").orderBy("createdAt", "desc").get();
    projectCache = {};
    snap.forEach(function (d) { projectCache[d.id] = d.data(); });

    var rows = [];
    snap.forEach(function (doc) {
      var p = doc.data();
      if (search && (p.name || "").toLowerCase().indexOf(search) === -1) return;
      var langs = Array.isArray(p.languages) ? p.languages.join(", ") : "";
      rows.push('<tr>' +
        '<td>' + esc(p.name || "Untitled") + '</td>' +
        '<td>' + esc(p.workType || "") + '</td>' +
        '<td>' + statusBadge(p.status) + '</td>' +
        '<td>' + esc(langs) + '</td>' +
        '<td>' + esc(p.payout || p.pay || "") + '</td>' +
        '<td class="actions-cell">' +
        '<button class="btn btn-ghost btn-sm" data-edit-project="' + doc.id + '">Edit</button>' +
        (p.status === "active" 
          ? '<button class="btn btn-ghost btn-sm" data-end-project="' + doc.id + '">End</button>'
          : '<button class="btn btn-ghost btn-sm" data-restart-project="' + doc.id + '">Restart</button>') +
        '<button class="btn btn-ghost btn-sm btn-danger" data-delete-project="' + doc.id + '">Delete</button>' +
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
        if (!(await uiConfirm("End this project? This will hide it from the active list and notify participants."))) return;
        var pid = btn.dataset.endProject;
        btn.textContent = "Ending...";
        btn.disabled = true;
        try {
          await db.collection("projects").doc(pid).update({ status: "ended" });
          await notifyEnrolledUsers(pid, "Project Ended", "A project you were participating in has officially ended.", "portal.html");
          projectCache = {};
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
        if (!(await uiConfirm("Restart this project? Freelancers who previously completed it will be able to join it again as a new cycle."))) return;
        var pid = btn.dataset.restartProject;
        btn.textContent = "Restarting...";
        btn.disabled = true;
        try {
          var p = projectCache[pid] || {};
          var newIter = (p.iteration || 1) + 1;
          await db.collection("projects").doc(pid).update({ status: "active", iteration: newIter });
          await notifyEnrolledUsers(pid, "Project Restarted", "A project you previously worked on has restarted for a new cycle! You can now join it again.", "portal.html");
          projectCache = {};
          loadAdminProjects();
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
        projectCache = {};
        loadAdminProjects();
      });
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
    '<div class="field"><label for="p-pay">Payout terms</label><input id="p-pay" value="' + esc(project.payout || "") + '"></div>' +
    '<div class="field"><label for="p-video">Training Video URL (YouTube/Drive embed)</label><input id="p-video" value="' + esc(project.trainingVideo || "") + '"></div>' +
    (project.trainingVideo ? '<div class="training-video" style="margin-bottom:12px; pointer-events:none;"><iframe src="' + esc(project.trainingVideo) + '" frameborder="0"></iframe></div>' : '') +

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
      trainingVideo: body.querySelector("#p-video").value.trim(),
      submissionType: body.querySelector("#p-submission-type").value,
      requireCredentials: body.querySelector("#p-require-creds").checked,
      externalLink: body.querySelector("#p-external-link").value.trim(),
      guidelinesLink: body.querySelector("#p-guidelines").value.trim(),
      formFields: collectFormBuilderFields(body),
      updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
    };

    try {
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
async function loadParticipation() {
  var container = document.querySelector("[data-admin-participation]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var filter = (document.querySelector("[data-participation-filter]") || {}).value || "all";

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);
    var snap = await db.collection("participations").get();
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
      
      rows.push(
        '<tr><td>' + esc(u.name || "-") + '</td><td>' + esc(u.phone || "-") + '</td>' +
        '<td>' + esc(u.companyName || "-") + '</td><td>' + esc(u.email || "-") + '</td>' +
        '<td>' + esc(projectName(p.projectId)) + '</td><td>' + statusBadge(status) + '</td>' +
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
        var snap = await db.collection("participations").doc(partId).get();
        var data = snap.exists ? snap.data() : {};
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
        var snap = await db.collection("participations").doc(partId).get();
        var data = snap.exists ? snap.data() : {};
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
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
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
async function loadAdminSubmissions() {
  var container = document.querySelector("[data-admin-submissions]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var filter = (document.querySelector("[data-work-filter]") || {}).value || "all";

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);
    var snap = await db.collection("submissions").orderBy("submittedAt", "desc").get();
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
async function loadAdminUsers() {
  var container = document.querySelector("[data-admin-users]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var search = ((document.querySelector("[data-user-search]") || {}).value || "").trim().toLowerCase();
  var roleFilter = (document.querySelector("[data-user-filter]") || {}).value || "all";

  try {
    var snap = await db.collection("users").orderBy("createdAt", "desc").get();
    userCache = {};
    snap.forEach(function (d) { userCache[d.id] = d.data(); });

    var rows = [];
    snap.forEach(function (d) {
      var u = d.data();
      if (roleFilter !== "all" && u.role !== roleFilter) return;
      if (search) {
        var hay = ((u.name || "") + " " + (u.email || "")).toLowerCase();
        if (hay.indexOf(search) === -1) return;
      }
      rows.push(
        '<tr><td>' + esc(u.name || "-") + '</td><td>' + esc(u.email || "-") + '</td>' +
        '<td>' + esc(u.phone || "-") + '</td><td>' + roleBadge(u.role) + '</td>' +
        '<td>' + esc(u.companyName || "-") + '</td>' +
        '<td>' + (u.cvUrl ? '<a href="' + esc(u.cvUrl) + '" target="_blank">View CV</a>' : '-') + '</td>' +
        '<td><div style="max-height: 4em; overflow-y: auto; font-size: 0.85em;">' +
        '<strong>Bio:</strong> ' + esc(u.bio || "-") + '<br>' +
        '<strong>Exp:</strong> ' + esc(u.experience || "-") + '</div></td>' +
        '<td>' + fmtDate(u.createdAt) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-toggle-role="' + d.id + '" data-current="' + esc(u.role || "") + '">Change Role</button></td></tr>'
      );
    });

    if (!rows.length) { container.innerHTML = "<p>No matching registrations.</p>"; return; }
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Name</th><th>Email</th><th>Phone</th><th>Type</th><th>Company</th><th>CV</th><th>Profile</th><th>Registered</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-toggle-role]").forEach(function (btn) {
      btn.addEventListener("click", async function () {
        var uid = btn.dataset.toggleRole;
        var current = btn.dataset.current;
        var newRole = await uiPrompt("Set role (admin, freelancer, vendor, company):", current);
        if (!newRole || newRole === current) return;
        try {
          await db.collection("users").doc(uid).update({ role: newRole });
          userCache = {};
          loadAdminUsers();
        } catch (err) { uiAlert("Error: " + err.message); }
      });
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------
async function loadAdminContacts() {
  var container = document.querySelector("[data-admin-contacts]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  try {
    var snap = await db.collection("contacts").orderBy("createdAt", "desc").limit(100).get();
    if (snap.empty) { container.innerHTML = "<p>No contacts yet.</p>"; return; }
    var rows = [];
    snap.forEach(function (d) {
      var c = d.data();
      rows.push(
        '<tr><td>' + esc(c.name || "-") + '</td><td>' + esc(c.email || "-") + '</td>' +
        '<td>' + esc(c.phone || "-") + '</td><td>' + esc(c.subject || c.type || "-") + '</td>' +
        '<td>' + esc((c.message || "").slice(0, 80)) + '</td><td>' + fmtDate(c.createdAt) + '</td>' +
        '<td>' + statusBadge(c.status || "new") + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-contact-read="' + d.id + '">Mark Read</button> ' +
        '<button class="btn btn-ghost btn-sm btn-success" data-contact-replied="' + d.id + '">Replied</button></td></tr>'
      );
    });
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>Name</th><th>Email</th><th>Phone</th><th>Subject</th><th>Message</th><th>Submitted</th><th>Status</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-contact-read]").forEach(function (btn) {
      btn.addEventListener("click", function () { setContactStatus(btn.dataset.contactRead, "read"); });
    });
    container.querySelectorAll("[data-contact-replied]").forEach(function (btn) {
      btn.addEventListener("click", function () { setContactStatus(btn.dataset.contactReplied, "replied"); });
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

async function setContactStatus(id, status) {
  try {
    await db.collection("contacts").doc(id).update({ status: status });
    loadAdminContacts();
  } catch (err) { uiAlert("Error: " + err.message); }
}

// ---------------------------------------------------------------------------
// Messages (admin sees all threads)
// ---------------------------------------------------------------------------
async function loadAdminMessages() {
  var container = document.querySelector("[data-admin-messages]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  try {
    var snap = await db.collection("messages").orderBy("lastAt", "desc").limit(50).get();
    if (snap.empty) { container.innerHTML = "<p>No message threads yet.</p>"; return; }
    var rows = [];
    snap.forEach(function (d) {
      var m = d.data();
      rows.push(
        '<tr><td>' + esc(m.userName || d.id) + '</td><td>' + esc((m.lastMessage || "").slice(0, 80)) + '</td>' +
        '<td>' + fmtDate(m.lastAt) + '</td>' +
        '<td><button class="btn btn-ghost btn-sm" data-open-thread="' + d.id + '">Open</button></td></tr>'
      );
    });
    container.innerHTML = '<div class="admin-table-wrap"><table class="admin-table"><thead><tr>' +
      '<th>User</th><th>Last Message</th><th>Updated</th><th>Action</th>' +
      '</tr></thead><tbody>' + rows.join("") + '</tbody></table></div>';

    container.querySelectorAll("[data-open-thread]").forEach(function (btn) {
      btn.addEventListener("click", function () { openThread(btn.dataset.openThread); });
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

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

  db.collection("messages").doc(threadId).collection("items")
    .orderBy("createdAt", "asc").limit(100).get().then(function (snap) {
      if (snap.empty) { thread.innerHTML = "<p>No messages.</p>"; return; }
      var html = "";
      snap.forEach(function (d) {
        var m = d.data();
        // In the admin view, admin replies sit on the right; user on the left.
        var mine = m.sender === "admin";
        var cls = mine ? "msg-user" : "msg-admin";
        var label = mine ? "You" : "User";
        html += '<div class="msg-item ' + cls + '"><strong>' + esc(label) + '</strong><p>' + esc(m.text || "") + '</p></div>';
      });
      thread.innerHTML = html;
      thread.scrollTop = thread.scrollHeight;
    });

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
      }, { merge: true });
      input.value = "";
      openThread(threadId);
    } catch (err) {
      uiAlert("Error: " + err.message);
    } finally {
      input.disabled = false;
    }
  });
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
    var snap = await db.collection("signinLogs").orderBy("createdAt", "desc").limit(200).get();
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
async function loadAdminPayments() {
  var container = document.querySelector("[data-admin-payments]");
  if (!container) return;
  container.innerHTML = "<p>Loading...</p>";

  var filter = (document.querySelector("[data-payment-filter]") || {}).value || "all";

  try {
    await Promise.all([ensureUsers(), ensureProjects()]);
    var snap = await db.collection("participations").get();
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
          loadAdminPayments();
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
          loadAdminPayments();
        } catch(e) { uiAlert(e.message); btn.disabled = false; btn.textContent = "Pay"; }
      });
    });
  } catch (err) {
    container.innerHTML = "<p>Error: " + esc(err.message) + "</p>";
  }
}

var pf = document.querySelector("[data-payment-filter]");
if (pf) pf.addEventListener("change", loadAdminPayments);
