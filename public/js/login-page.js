// Login page logic: email/password sign-in + Google sign-in.
// Uses modular Firebase SDK via firebase-config.js + auth.js (both type="module").

document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("[data-login-form]");
  if (!form) return;

  var status = document.querySelector("[data-auth-status]");
  var googleBtn = document.querySelector("[data-google-btn]");

  // Sanity check: wait briefly for firebase-config.js module to populate globals
  if (typeof getAuth !== "function") {
    // firebase-config.js + auth.js load as modules; if DOMContentLoaded fires
    // before the top-level await in firebase-config.js resolves, the globals
    // aren't ready yet. Poll briefly.
    var pollCount = 0;
    var pollTimer = setInterval(function () {
      pollCount++;
      if (typeof getAuth === "function") {
        clearInterval(pollTimer);
        initLoginPage(form, status, googleBtn);
      } else if (pollCount > 40) { // ~4 seconds
        clearInterval(pollTimer);
        fail(status, "Firebase failed to load. Please refresh the page.");
      }
    }, 100);
    return;
  }

  initLoginPage(form, status, googleBtn);
});

function initLoginPage(form, status, googleBtn) {
  // Flag to prevent onAuthStateChanged race condition during Google popup
  // (copied from teanbris auth.html - critical for preventing redirect loop)
  var googleSignInInProgress = false;

  // If already signed in, route the user. A user WITH a profile goes to their
  // workspace; a user signed in via Google but WITHOUT a profile yet (an
  // incomplete signup) is sent to finish registration so they are not stranded.
  onAuthChange(async function (user) {
    // CRITICAL: Don't interfere if Google sign-in popup is active
    if (googleSignInInProgress) {
      console.log("[login] onAuthChange fired but Google sign-in in progress, skipping.");
      return;
    }

    if (user) {
      try {
        var profile = await getUserDoc(user.uid);
        var role = (profile && profile.role) || (isAdminEmail(user.email) ? "admin" : null);
        if (role) {
          status.style.color = "#85ffaa";
          status.textContent = "Already signed in. Redirecting...";
          window.location.href = routeForRole(role);
        } else {
          status.style.color = "#85ffaa";
          status.textContent = "Completing your registration...";
          window.location.href = "register.html?complete=1";
        }
      } catch (err) {
        console.error("[login] onAuthStateChanged error:", err);
      }
    }
  });

  // Also check for redirect result (user coming back from signInWithRedirect)
  handleRedirectResult().then(function (result) {
    if (result && result.user) {
      if (result.isNew) {
        status.style.color = "#85ffaa";
        status.textContent = "New account. Completing registration...";
        window.location.href = "register.html?complete=1";
      } else {
        status.style.color = "#85ffaa";
        status.textContent = "Signed in. Loading your workspace...";
        redirectAfterAuth(result.user);
      }
    }
  });

  // Email/password sign-in
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    status.style.color = "";
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    if (!email || !password) return fail(status, "Enter your email and password.");

    setBusy(form, true);
    status.textContent = "Signing in...";
    try {
      var user = await loginWithEmail(email, password);
      status.style.color = "#85ffaa";
      status.textContent = "Signed in. Loading your workspace...";
      var done = await redirectAfterAuth(user);
      if (!done) window.location.href = "register.html?complete=1";
    } catch (err) {
      console.error("[login] email sign-in error:", err.code, err.message);
      fail(status, authError(err.code));
      setBusy(form, false);
    }
  });

  // Google sign-in with race condition guard
  googleBtn.addEventListener("click", async function () {
    status.style.color = "";
    status.textContent = "Opening Google sign-in...";

    // CRITICAL: Set flag BEFORE the popup so onAuthChange doesn't interfere
    googleSignInInProgress = true;

    try {
      var result = await loginWithGoogle();
      if (result.isNew) {
        status.style.color = "#85ffaa";
        status.textContent = "New account. Completing registration...";
        window.location.href = "register.html?complete=1";
      } else {
        status.style.color = "#85ffaa";
        status.textContent = "Signed in. Loading your workspace...";
        await redirectAfterAuth(result.user);
      }
    } catch (err) {
      googleSignInInProgress = false;
      console.error("[login] Google sign-in error:", err.code, err.message);
      if (err.code === "auth/unauthorized-domain") {
        fail(status, "This domain is not authorized for sign-in. Add localhost to Firebase Console > Authentication > Settings > Authorized domains.");
      } else if (err.code === "auth/operation-not-allowed") {
        fail(status, "Google sign-in is not enabled. Enable it in Firebase Console > Authentication > Sign-in method.");
      } else if (err.code === "auth/configuration-not-found") {
        fail(status, "Firebase Auth is not configured. Go to Firebase Console > Authentication and enable sign-in providers.");
      } else if (err.code === "auth/redirecting") {
        status.style.color = "#85ffaa";
        status.textContent = "Redirecting to Google...";
      } else {
        fail(status, authError(err.code));
      }
    }
  });
}
