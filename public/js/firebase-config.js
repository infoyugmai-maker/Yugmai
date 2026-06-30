// Firebase web configuration — MODULAR SDK (ES module imports from CDN).
// The compat SDK's WebChannel transport gets blocked in some environments,
// causing "Failed to get document because the client is offline." The modular
// SDK (used by teanbris) does not have this issue.
//
// This file MUST be loaded as <script type="module"> in every HTML page.
// It exposes all Firebase handles on `window` so non-module scripts can use
// them after awaiting `window._firebaseReady`.

// Create the ready promise SYNCHRONOUSLY before any await, so defer scripts
// can immediately grab it even though the module hasn't finished yet.
let _resolveReady;
window._firebaseReady = new Promise(function (resolve) { _resolveReady = resolve; });

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCwoEXL2ow41crNUnjnzMofvgWaqNc8TXQ",
  authDomain: "yugmai.firebaseapp.com",
  projectId: "yugmai",
  storageBucket: "yugmai.firebasestorage.app",
  messagingSenderId: "718033571268",
  appId: "1:718033571268:web:86ef1fef9887e878f9e891",
  measurementId: "G-F1KR2CP23Q",
};

// Import modular SDK from CDN (same version as before, just modular not compat)
const { initializeApp, getApps } = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js");
const _authModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js");
const _firestoreModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js");
const _storageModule = await import("https://www.gstatic.com/firebasejs/10.12.2/firebase-storage.js");

// Initialize (idempotent)
const apps = getApps();
const _app = apps.length > 0 ? apps[0] : initializeApp(FIREBASE_CONFIG);
const _auth = _authModule.getAuth(_app);
const _db = _firestoreModule.getFirestore(_app);
const _storage = _storageModule.getStorage(_app);

// ---------------------------------------------------------------------------
// Expose on window so auth.js, login-page.js etc. can use them.
// These are the raw modular SDK module objects + initialized instances.
// ---------------------------------------------------------------------------
window._authModule = _authModule;
window._firestoreModule = _firestoreModule;
window._storageModule = _storageModule;
window._auth = _auth;
window._db = _db;
window._storage = _storage;
window._app = _app;

// Signal that Firebase is fully initialized
_resolveReady();

// Also export for ES module imports within the same page
export { _authModule, _firestoreModule, _storageModule, _auth, _db, _storage, _app };
