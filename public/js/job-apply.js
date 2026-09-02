(function () {
  var currentJob = null;
  var currentUser = null;
  var currentProfile = null;

  function esc(value) { return String(value || "").replace(/[&<>\"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  function getJobId() { 
    var p = new URLSearchParams(window.location.search);
    return p.get("jobId") || p.get("id"); 
  }
  function renderJob(job) {
    var detail = document.querySelector("[data-job-detail]");
    var intro = document.querySelector("[data-application-intro]");
    if (!detail) return;
    var meta = [];
    if (job.workType) meta.push("Work type: " + job.workType);
    if (Array.isArray(job.languages) && job.languages.length) meta.push("Languages: " + job.languages.join(", "));
    if (job.payout || job.pay) meta.push("Payout: " + (job.payout || job.pay));
    if (job.deadline) meta.push("Deadline: " + job.deadline);
    detail.innerHTML = '<span class="job-tag">' + esc(job.workType || "Project") + '</span><h2>' + esc(job.name || "Untitled job") + '</h2><p>' + esc(job.description || "Project details will be shared during onboarding.") + '</p><div class="job-meta">' + meta.map(function (item) { return '<span>' + esc(item) + '</span>'; }).join("") + '</div>';
    if (intro) intro.textContent = 'Apply for ' + (job.name || 'this job') + '. Your application will appear in your portal as soon as you submit it.';
  }
  function buildField(field, index) {
    var id = 'application-field-' + index;
    var label = esc(field.label || "Question");
    var required = field.required ? " required" : "";
    var input = "";
    if (field.type === "textarea") input = '<textarea id="' + id + '" name="custom-' + index + '"' + required + '></textarea>';
    else if (field.type === "select") {
      var options = Array.isArray(field.options) ? field.options : [];
      input = '<select id="' + id + '" name="custom-' + index + '"' + required + '><option value="">Select an option</option>' + options.map(function (option) { return '<option value="' + esc(option) + '">' + esc(option) + '</option>'; }).join("") + '</select>';
    } else if (field.type === "file-upload") {
      input = '<input id="' + id + '" name="custom-' + index + '" type="file"' + required + '>';
    } else input = '<input id="' + id + '" name="custom-' + index + '" type="' + (field.type === "email" ? "email" : "text") + '"' + required + '>';
    return '<div class="field"><label for="' + id + '">' + label + (field.required ? ' <span aria-hidden="true">*</span>' : '') + '</label>' + input + '</div>';
  }
  function buildForm() {
    var form = document.querySelector("[data-application-form]");
    if (!form || !currentJob) return;
    var custom = Array.isArray(currentJob.formFields) ? currentJob.formFields.filter(function (field) { return field && field.label; }) : [];
    form.innerHTML = '<div class="field"><label for="application-note">Why are you a good fit? <span aria-hidden="true">*</span></label><textarea id="application-note" name="note" required placeholder="Briefly share your relevant experience, skills, availability, or language proficiency."></textarea></div>' + custom.map(buildField).join("") + '<button class="btn btn-primary" type="submit">Submit application</button>';
    form.addEventListener("submit", submitApplication);
  }
  function setStatus(message, isError) { var el = document.querySelector("[data-application-status]"); if (el) { el.textContent = message; el.classList.toggle("error", !!isError); } }
  function renderAuthState() {
    var note = document.querySelector("[data-application-auth-note]");
    var submit = document.querySelector("[data-application-form] button[type=submit]");
    if (!note || !submit) return;
    if (!currentUser) {
      var next = encodeURIComponent('job-apply?jobId=' + encodeURIComponent(getJobId() || ""));
      note.hidden = false;
      note.innerHTML = 'Please <a href="login.html?next=' + next + '">log in</a> or <a href="register.html?next=' + next + '">create an account</a> before submitting your application.';
      submit.textContent = "Log in to apply";
    } else {
      note.hidden = true;
      submit.textContent = "Submit application";
    }
  }
  async function submitApplication(event) {
    event.preventDefault();
    if (!currentUser) { window.location.href = 'login.html?next=' + encodeURIComponent('job-apply?jobId=' + encodeURIComponent(getJobId() || "")); return; }
    var form = event.currentTarget;
    if (!form.reportValidity()) return;
    var fs = getFirestoreModule();
    var jobId = getJobId();
    var existing = await fs.getDocs(fs.query(fs.collection(getDb(), "participations"), fs.where("userId", "==", currentUser.uid), fs.where("projectId", "==", jobId)));
    var alreadyApplied = false;
    existing.forEach(function (doc) { if ((doc.data().iteration || 1) === (currentJob.iteration || 1)) alreadyApplied = true; });
    if (alreadyApplied) { setStatus("You have already applied for this job. You can track it in My Portal.", true); return; }
    var btn = form.querySelector("button[type=submit]");
    btn.disabled = true;
    btn.textContent = "Submitting…";
    try {
      var answers = { "Why are you a good fit?": form.elements.note.value.trim() };
      
      var customFields = (currentJob.formFields || []).filter(function (field) { return field && field.label; });
      for (var index = 0; index < customFields.length; index++) {
        var field = customFields[index];
        if (field.type === "file-upload") {
          var input = form.elements['custom-' + index];
          if (input && input.files.length > 0) {
            var file = input.files[0];
            var formData = new FormData();
            formData.append("file", file);
            var headers = typeof window.authHeader === "function" ? await window.authHeader() : {};
            var res = await fetch("/api/drive/upload", { method: "POST", body: formData, headers: headers });
            var data = await res.json();
            if (data.url) answers[field.label] = data.url;
          }
        } else {
          answers[field.label] = (form.elements['custom-' + index] || {}).value || "";
        }
      }

      await fs.addDoc(fs.collection(getDb(), "participations"), { userId: currentUser.uid, projectId: jobId, step: 1, status: "applied", iteration: currentJob.iteration || 1, applicationNote: form.elements.note.value.trim(), customAnswers: answers, createdAt: fs.serverTimestamp() });
      form.innerHTML = '<div class="application-auth-note">Application sent. You can now follow your onboarding and work progress in <a href="portal.html">My Portal</a>.</div><a class="btn btn-primary" href="portal.html">Go to My Portal</a>';
      setStatus("Your application has been saved.");
    } catch (error) { setStatus(error.message || "We could not submit your application. Please try again.", true); btn.disabled = false; btn.textContent = "Submit application"; }
  }
  async function init() {
    var jobId = getJobId();
    if (!jobId) throw new Error("Missing job ID");
    await waitForFirebase();
    var fs = getFirestoreModule();
    var [jobDoc] = await Promise.all([fs.getDoc(fs.doc(getDb(), "projects", jobId)), new Promise(function (resolve) { onAuthChange(async function (user) { currentUser = user; currentProfile = user ? await getUserDoc(user.uid) : null; resolve(); }); })]);
    if (!jobDoc.exists() || ["active", "upcoming"].indexOf(jobDoc.data().status) === -1) throw new Error("Job unavailable");
    currentJob = jobDoc.data();
    renderJob(currentJob);
    buildForm();
    renderAuthState();
  }
  document.addEventListener("DOMContentLoaded", function () { init().catch(function () { var detail = document.querySelector("[data-job-detail]"); var form = document.querySelector("[data-application-form]"); if (detail) detail.innerHTML = '<h2>Job unavailable</h2><p>This job may have closed or the link is not valid.</p><a class="btn btn-outline" href="jobs.html">Browse open jobs</a>'; if (form) form.innerHTML = ""; }); });
})();
