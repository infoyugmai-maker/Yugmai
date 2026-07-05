// Register page logic: account-type selection, email signup, Google signup
// with completion modal. Uses modular Firebase SDK via firebase-config.js + auth.js.

document.addEventListener("DOMContentLoaded", function () {
  const form = document.querySelector("[data-register-form]");
  if (!form) return;

  const status = document.querySelector("[data-auth-status]");
  const googleBtn = document.querySelector("[data-google-btn]");
  const modal = document.querySelector("[data-google-modal]");
  const modalStatus = document.querySelector("[data-modal-status]");

  // Wait for firebase-config.js module to populate globals
  if (typeof getAuth !== "function") {
    var pollCount = 0;
    var pollTimer = setInterval(function () {
      pollCount++;
      if (typeof getAuth === "function") {
        clearInterval(pollTimer);
        initRegisterPage(form, status, googleBtn, modal, modalStatus);
      } else if (pollCount > 40) {
        clearInterval(pollTimer);
        fail(status, "Firebase failed to load. Please refresh the page.");
      }
    }, 100);
    return;
  }

  initRegisterPage(form, status, googleBtn, modal, modalStatus);
});

function initRegisterPage(form, status, googleBtn, modal, modalStatus) {
  // Flag to prevent onAuthStateChanged race condition
  var googleSignInInProgress = false;

  // account type selector (main form)
  let accountType = "freelancer";
  setupTypeGrid(form.closest(".auth-panel").querySelector(".type-grid"), function (t) { accountType = t; });

  // account type selector (modal)
  let modalType = "freelancer";
  setupTypeGrid(modal.querySelector("[data-modal-types]"), function (t) { modalType = t; });

  // If redirected here to complete a Google signup, open the modal directly.
  if (new URLSearchParams(location.search).get("complete") === "1") {
    onAuthChange(function (u) {
      if (u && !googleSignInInProgress) openModal();
    });
  }

  // Also check for redirect result
  handleRedirectResult().then(function (result) {
    if (result && result.user) {
      if (result.isNew) {
        status.style.color = "#85ffaa";
        status.textContent = "Please complete your profile...";
        openModal();
      } else {
        status.textContent = "Account found. Signing in...";
        if (!result.user.languages) { // rudimentary check
          status.textContent = "Please complete your profile...";
          openModal(result.user, false); // isGoogle = false for normal, but it's a redirect so we might not know. Let's pass true.
        } else {
          redirectAfterAuth(result.user);
        }
      }
    }
  });

  // email/password registration
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.style.color = "";
    const name = form.name.value.trim();
    const phone = form.phone.value.trim();
    const email = form.email.value.trim();
    const companyName = form.company.value.trim();
    const password = form.password.value;
    const confirm = form.confirm.value;

    if (password !== confirm) return fail(status, "Passwords do not match.");
    if (!validPassword(password)) return fail(status, "Password needs 8+ characters, one uppercase, one number.");

    setBusy(form, true);
    status.textContent = "Creating your account...";
    try {
      const cred = await registerWithEmail({ name, email, phone, companyName, accountType, password });
      status.style.color = "#85ffaa";
      status.textContent = "Registration successful. Please complete your profile...";
      openModal(cred, false);
    } catch (err) {
      console.error("[register] email sign-up error:", err.code, err.message);
      fail(status, authError(err.code));
      setBusy(form, false);
    }
  });

  // Google signup
  googleBtn.addEventListener("click", async function () {
    status.style.color = "";
    status.textContent = "Opening Google sign-in...";
    googleSignInInProgress = true;

    try {
      const result = await loginWithGoogle();
      if (result.isNew) {
        status.style.color = "#85ffaa";
        status.textContent = "Please complete your profile...";
        openModal();
      } else {
        status.textContent = "Account found. Signing in...";
        await redirectAfterAuth(result.user);
      }
    } catch (err) {
      googleSignInInProgress = false;
      console.error("[register] Google sign-in error:", err.code, err.message);
      if (err.code === "auth/unauthorized-domain") {
        fail(status, "This domain is not authorized. Add localhost to Firebase Console > Authentication > Settings.");
      } else if (err.code === "auth/operation-not-allowed") {
        fail(status, "Google sign-in is not enabled in Firebase Console.");
      } else if (err.code === "auth/redirecting") {
        status.style.color = "#85ffaa";
        status.textContent = "Redirecting to Google...";
      } else {
        fail(status, authError(err.code));
      }
    }
  });

  // modal completion submit
  const modalForm = modal.querySelector("[data-google-complete-form]");
  
  modal.querySelector("[data-skip-profile]").addEventListener("click", function() {
    window.location.href = "portal.html";
  });

  modalForm.addEventListener("submit", async function (e) {
    e.preventDefault();
    const user = getAuth().currentUser;
    if (!user) return fail(modalStatus, "Session expired. Please sign in again.");
    
    // We might have phone/company hidden if it's an email registration (they already provided it)
    const phoneEl = document.getElementById("g-phone");
    const companyEl = document.getElementById("g-company");
    const phone = phoneEl ? phoneEl.value.trim() : "";
    const companyName = companyEl ? companyEl.value.trim() : "";
    
    if (phoneEl && phoneEl.closest("#g-basic-info").style.display !== "none" && !phone) {
      return fail(modalStatus, "Phone number is required.");
    }

    const languages = document.getElementById("g-languages").value.split(",").map(s => s.trim()).filter(Boolean);
    const skills = Array.from(modal.querySelectorAll("input[name='skills']:checked")).map(cb => cb.value);

    setBusy(modalForm, true);
    modalStatus.style.color = "";
    modalStatus.textContent = "Saving profile...";
    
    try {
      // Get current profile
      const fs = getFirestoreModule();
      const existing = await getUserDoc(user.uid) || {};
      
      const updateData = {
        languages: languages,
        skills: skills,
      };
      
      if (phoneEl && phoneEl.closest("#g-basic-info").style.display !== "none") {
         updateData.phone = phone;
         updateData.companyName = companyName;
         updateData.role = modalType;
      }

      await fs.setDoc(fs.doc(getDb(), "users", user.uid), updateData, { merge: true });
      
      modalStatus.style.color = "#85ffaa";
      modalStatus.textContent = "Done! Redirecting...";
      window.location.href = "portal.html";
    } catch (err) {
      console.error("[register] profile completion error:", err);
      fail(modalStatus, err.message);
      setBusy(modalForm, false);
    }
  });

  function openModal(userObj, isGoogle) {
    modal.hidden = false;
    document.body.classList.add("menu-open");
    
    // If it's an email user, they already gave Phone and Company. Hide that section.
    const basicInfo = document.getElementById("g-basic-info");
    const typeGrid = modal.querySelector("[data-modal-types]");
    const title = document.getElementById("gm-title");
    
    if (isGoogle === false) {
      if (basicInfo) basicInfo.style.display = "none";
      if (typeGrid) typeGrid.style.display = "none";
      if (title) title.textContent = "Add your Skills & Languages";
      const desc = title.nextElementSibling;
      if (desc && desc.tagName === "P") desc.textContent = "Let clients know what services you can provide.";
    } else {
      if (basicInfo) basicInfo.style.display = "block";
      if (typeGrid) typeGrid.style.display = "flex";
      if (title) title.textContent = "Complete your registration";
    }
  }
}

// Shared: wire a .type-grid of .type-card buttons to a single selection.
function setupTypeGrid(grid, onSelect) {
  if (!grid) return;
  const cards = grid.querySelectorAll(".type-card");
  cards.forEach(function (card) {
    card.addEventListener("click", function () {
      cards.forEach(function (c) {
        c.classList.remove("is-selected");
        c.setAttribute("aria-checked", "false");
      });
      card.classList.add("is-selected");
      card.setAttribute("aria-checked", "true");
      onSelect(card.dataset.type);
    });
  });
}
