// Login page logic — direct Firebase SDK, no wrapper dependencies.

document.addEventListener("DOMContentLoaded", function () {
  var form = document.querySelector("[data-login-form]");
  if (!form) return;

  var status = document.querySelector("[data-auth-status]");
  var googleBtn = document.querySelector("[data-google-btn]");

  // Wait for Firebase to be ready
  function waitForFirebaseAndInit() {
    if (window._auth && window._authModule && window._db) {
      initLoginPage(form, status, googleBtn);
    } else if (window._firebaseReady) {
      window._firebaseReady.then(function () {
        initLoginPage(form, status, googleBtn);
      }).catch(function () {
        fail(status, "Firebase failed to load. Please refresh.");
      });
    } else {
      setTimeout(waitForFirebaseAndInit, 100);
    }
  }
  waitForFirebaseAndInit();
});

function initLoginPage(form, status, googleBtn) {
  var auth = window._auth;
  var am = window._authModule;
  var fs = window._firestoreModule;
  var db = window._db;

  // DIRECT redirect check — no wrapper dependency
  function doRedirect(user) {
    try {
      var userRef = fs.doc(db, "users", user.uid);
      fs.getDoc(userRef).then(function (snap) {
        var profile = snap.exists() ? snap.data() : null;
        var role = (profile && profile.role) || null;

        // Check admin email list
        if (!role && user.email && user.email.toLowerCase() === "info.yugmai@gmail.com") {
          role = "admin";
        }

        if (role) {
          if (role === "admin") {
            window.location.href = "admin.html";
          } else {
            window.location.href = "portal.html";
          }
        } else {
          window.location.href = "register.html?complete=1";
        }
      }).catch(function (err) {
        console.error("[login] getDoc error:", err);
        window.location.href = "portal.html";
      });
    } catch (err) {
      console.error("[login] doRedirect error:", err);
      window.location.href = "portal.html";
    }
  }

  // Check if already signed in on page load
  if (auth.currentUser) {
    console.log("[login] Already signed in as:", auth.currentUser.email);
    status.style.color = "#85ffaa";
    status.textContent = "Already signed in. Redirecting...";
    doRedirect(auth.currentUser);
    return;
  }

  // Listen for auth state changes (covers redirect return)
  am.onAuthStateChanged(auth, function (user) {
    if (user) {
      console.log("[login] Auth state changed, user:", user.email);
      status.style.color = "#85ffaa";
      status.textContent = "Signed in! Redirecting...";
      doRedirect(user);
    }
  });

  // Email/password sign-in
  form.addEventListener("submit", async function (e) {
    e.preventDefault();
    var email = document.getElementById("email").value.trim();
    var password = document.getElementById("password").value;
    if (!email || !password) { fail(status, "Enter your email and password."); return; }

    form.querySelectorAll("button, input").forEach(function (el) { el.disabled = true; });
    status.textContent = "Signing in...";
    try {
      await am.signInWithEmailAndPassword(auth, email, password);
      status.style.color = "#85ffaa";
      status.textContent = "Signed in! Redirecting...";
    } catch (err) {
      fail(status, authErrorMessage(err.code));
      form.querySelectorAll("button, input").forEach(function (el) { el.disabled = false; });
    }
  });

  // Check for redirect result on page load
  handleRedirectResult().then(function (result) {
    if (result && result.user) {
      status.style.color = "#85ffaa";
      status.textContent = "Signed in! Redirecting...";
      doRedirect(result.user);
    }
  }).catch(function (err) {
    console.error("[login] Redirect error:", err);
    if (err.code !== "auth/redirect-cancelled-by-user") {
      fail(status, "Google sign-in failed: " + (err.message || err.code));
    }
  });

  // Google sign-in
  if (googleBtn) {
    googleBtn.addEventListener("click", async function () {
      status.style.color = "";
      status.textContent = "Opening Google sign-in...";

      try {
        const result = await loginWithGoogle();
        if (result && result.user) {
          status.style.color = "#85ffaa";
          status.textContent = "Signed in! Redirecting...";
          doRedirect(result.user);
        }
      } catch (err) {
        console.error("[login] Google error:", err);
        if (err.code === "auth/unauthorized-domain") {
          fail(status, "This domain is not authorized. Add localhost to Firebase Console > Authentication > Settings.");
        } else if (err.code === "auth/operation-not-allowed") {
          fail(status, "Google sign-in is not enabled in Firebase Console.");
        } else if (err.code === "auth/redirecting") {
          status.style.color = "#85ffaa";
          status.textContent = "Redirecting to Google securely...";
        } else {
          fail(status, authErrorMessage(err.code || err.message));
        }
      }
    });
  }

  // Forgot password
  var forgotLink = document.getElementById("forgot-password-link");
  if (forgotLink) {
    forgotLink.addEventListener("click", async function (e) {
      e.preventDefault();
      var email = document.getElementById("email").value.trim();
      if (!email) { fail(status, "Enter your email above first, then click 'Forgot password?'."); return; }
      try {
        await am.sendPasswordResetEmail(auth, email);
        status.style.color = "#85ffaa";
        status.textContent = "Password reset email sent to " + email + ". Check your inbox.";
      } catch (err) {
        fail(status, authErrorMessage(err.code));
      }
    });
  }
}

function fail(el, msg) {
  if (!el) return;
  el.style.color = "#ff8585";
  el.textContent = msg;
}

function authErrorMessage(code) {
  var map = {
    "auth/invalid-email": "Please enter a valid email address.",
    "auth/wrong-password": "Incorrect email or password.",
    "auth/user-not-found": "Incorrect email or password.",
    "auth/invalid-credential": "Incorrect email or password.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/network-request-failed": "Network error. Check your connection.",
  };
  return map[code] || ("Error: " + code);
}
