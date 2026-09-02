(function () {
  var jobs = [];
  var filter = "all";
  var search = "";

  function esc(value) { return String(value || "").replace(/[&<>\"']/g, function (c) { return { "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]; }); }
  function jobSearchText(job) { return [job.name, job.description, job.workType, job.languages && job.languages.join(" "), job.skills && job.skills.join(" ")].join(" ").toLowerCase(); }
  function meta(job) {
    var parts = [];
    if (Array.isArray(job.languages) && job.languages.length) parts.push(job.languages.join(", "));
    if (job.payout || job.pay) parts.push(job.payout || job.pay);
    if (job.workMode) parts.push(job.workMode);
    else parts.push("Remote");
    return parts.map(function (item) { return '<span>' + esc(item) + '</span>'; }).join("");
  }
  function render() {
    var list = document.querySelector("[data-jobs-list]");
    var count = document.querySelector("[data-jobs-count]");
    if (!list) return;
    var visible = jobs.filter(function (job) {
      return (filter === "all" || job.workType === filter) && (!search || jobSearchText(job).indexOf(search) !== -1);
    });
    if (count) count.textContent = visible.length + " open " + (visible.length === 1 ? "job" : "jobs");
    if (!visible.length) {
      list.innerHTML = '<div class="jobs-empty"><strong>No matching jobs found.</strong><br>Try another search or filter.</div>';
      return;
    }
    list.innerHTML = visible.map(function (job) {
      return '<article class="job-row"><div class="job-row-main"><div class="job-kickers"><span class="job-tag">' + esc(job.workType || "Project") + '</span><span class="job-status">' + esc(job.status || "open") + '</span></div><h3><a href="job-apply?jobId=' + encodeURIComponent(job.id) + '">' + esc(job.name || "Untitled job") + '</a></h3><p class="job-summary">' + esc(job.description || "Project details will be shared during onboarding.") + '</p><div class="job-meta">' + meta(job) + '</div></div><a class="btn btn-primary job-action" href="job-apply?jobId=' + encodeURIComponent(job.id) + '">View & apply</a></article>';
    }).join("");
  }
  async function init() {
    await waitForFirebase();
    var fs = getFirestoreModule();
    var snap = await fs.getDocs(fs.query(fs.collection(getDb(), "projects"), fs.where("status", "in", ["active", "upcoming"]), fs.limit(15)));
    jobs = [];
    snap.forEach(function (doc) { jobs.push(Object.assign({ id: doc.id }, doc.data())); });
    jobs.sort(function (a, b) { return (a.name || "").localeCompare(b.name || ""); });
    render();

    // Load More button
    if (snap.size >= 15) {
      var container = document.getElementById("jobs-grid") || document.querySelector(".jobs-grid");
      if (container) {
        var btn = document.createElement("button");
        btn.className = "btn btn-outline";
        btn.textContent = "Load More Jobs";
        btn.style.cssText = "width:100%; margin-top:24px; grid-column:1/-1;";
        btn.addEventListener("click", async function () {
          btn.textContent = "Loading...";
          btn.disabled = true;
          var lastDoc = snap.docs[snap.docs.length - 1];
          var next = await fs.getDocs(fs.query(fs.collection(getDb(), "projects"), fs.where("status", "in", ["active", "upcoming"]), fs.startAfter(lastDoc), fs.limit(15)));
          next.forEach(function (doc) { jobs.push(Object.assign({ id: doc.id }, doc.data())); });
          render();
          btn.remove();
        });
        container.parentElement.appendChild(btn);
      }
    }
  }
  document.addEventListener("DOMContentLoaded", function () {
    var input = document.getElementById("jobs-search");
    if (input) input.addEventListener("input", function () { search = input.value.trim().toLowerCase(); render(); });
    document.querySelectorAll("[data-filter]").forEach(function (button) {
      button.addEventListener("click", function () { filter = button.dataset.filter; document.querySelectorAll("[data-filter]").forEach(function (item) { var selected = item === button; item.classList.toggle("active", selected); item.setAttribute("aria-pressed", selected ? "true" : "false"); }); render(); });
    });
    init().catch(function () { var list = document.querySelector("[data-jobs-list]"); if (list) list.innerHTML = '<div class="jobs-empty">We could not load jobs right now. Please refresh and try again.</div>'; });
  });
})();
