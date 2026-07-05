# YUGM AI — Progress & Handoff

_Last updated: 2026-06-27_

Project root: `C:\Users\Shamad Ansari\Documents\YugmAI-main\YugmAI-main`

## Stack (do NOT change)
Vanilla **HTML + JS + Firebase (compat CDN) + Express**. No build step, no framework. Do not convert to React/Next.js. Absolute rule: **no emojis anywhere** — SVG icons only. Full spec: `YougmAI_Website_Specification.md`.

## Key files
- Pages: `index.html`, `portal.html`, `admin.html`, `login.html`, `register.html`, `contact.html`
- Logic: `js/script.js` (homepage + UMAI chat + floating shortcuts), `js/portal.js`, `js/admin.js`, `js/auth.js` (sign-in logging + push + notif bell), `js/firebase-config.js`
- Styles: `css/style.css` (CSS vars at top; append new rules at end)
- Backend: `server/index.js` (Express, serves static + `/api/*`); secrets in `server/.env`
- Service worker: `sw.js` at root (push + notificationclick)
- DB: Firestore. Rules: `firestore.rules`
- Run locally: double-click `run.bat` → http://localhost:3000
- Admin account: `info.yugmai@gmail.com`

Firestore collections in use: `users`, `projects`, `participations`, `submissions`, `messages`, `contacts`, `notifications`, `signinLogs`, `pushSubscriptions`

---

## DONE (prior sessions)
- **`run.bat`** — installs server deps first run, starts server, opens browser.
- **Sign-in logging** — `js/auth.js` `logSignIn()` writes every email + Google login to `signinLogs`.
- **Admin panel — 9 sections** (`admin.html` + `js/admin.js`): Overview (6 metrics), Projects (search + notify on new active), Participation (approve/reject + notify), Work Tracking (approve/reject/revision + note + notify), Registrations (search/filter), Messages, Contacts (mark read/replied), Sign-in Logs (search), Announcements (compose + history).
- **Portal** (`portal.html` + `js/portal.js`): Overview, Available Projects, My Work (4-step flow), Submit Work + history, Messages (first-message auto-reply), Profile (edit + change password).
- **Web Push (spec §12)** — `sw.js` (push + notificationclick); server routes `/api/vapid-key`, `/api/push/subscribe`, `/api/push` (audience + userId filtering, drops HTTP 410 stale subs), `/api/notify`; VAPID keys in `server/.env`; service worker registered in `js/auth.js` `initPush()`; post-login banner ("Get Notified" / "Not Now" = 7-day localStorage suppress); subscription saved to `pushSubscriptions`; in-app notification bell (`buildNotifBell`) with unread badge, last-20 dropdown, mark-read / mark-all-read, used by both portal and admin.
- **Custom form builder (spec §7.4)** — `js/admin.js` `openProjectEditor`: add / reorder (drag) / delete blocks for all 11 field types, required toggle, saved as `formFields` on the project doc. `js/portal.js` `openJoinFormModal` renders the form on join, stores `formAnswers` on the participation record, File Upload via `POST /api/upload` (Supabase).
- **Floating action shortcuts (spec §10)** — `js/script.js` `buildFloatingShortcuts()`: collapsible "+" FAB expanding to "Request Plan" → `contact.html` and "Work With Us" → `register.html`; SVG icons, no emoji; on `index.html` + `contact.html`; stacked above the UMAI launcher (no overlap).

## DONE (this session — 2026-06-27)
The three features above were already written but the working tree had **build-breaking leftovers from bad edits**. Fixed:
- **`js/admin.js`** — removed an orphaned duplicate project-editor body (was ~L471–563, no function header → `SyntaxError: Unexpected token '}'`) and a dead duplicate form-builder helper set (`initFormBuilder` / `renderFBList` / `collectFormBuilderData` + a second `FB_TYPES`). Kept the live Set-A helpers (`collectFormBuilderFields` etc.). File dropped 1218 → 945 lines.
- **`js/portal.js`** — removed an orphaned duplicate inside the join handler (`SyntaxError: Missing catch or finally`) and a dead shadowed first copy of `openJoinFormModal` (the dead copy treated `f.options` as a string; the live copy correctly treats it as an array). File now 918 lines.
- **`js/admin.js` `addNotification`** — bug fix: per-user triggers (participation/submission approve/reject) passed the target **userId as the `audience`** arg, which the server's `/api/push` could not match (it only filters audience by `"all"`/role), so those browser pushes were silently dropped. Now detects broadcast (`all`/`freelancer`/`vendor`/`company`) vs a userId and routes the latter via the server's `userId` filter. (In-app bell was unaffected.)

Verified: all 10 JS files pass `node --check`; server boots with all integrations green (`firebase/nvidia/supabase/email/push` all true); `admin.html` + `portal.html` serve 200.

## USER MUST DO (not my work)
1. **Deploy rules:** `firebase deploy --only firestore:rules` — required for `signinLogs` writes and profile role edits.
2. Test on localhost via `run.bat` (log in as admin + as freelancer; build a project with custom form fields; join it; approve a participation and confirm both the in-app bell and a browser push arrive).
3. If the Firebase console prompts for a composite index, click the auto-create link.
4. Secrets are committed in `SETUP.md` / `server/.env` (NVIDIA, Supabase, Resend, VAPID) — rotate before going public.

---

## REMAINING / NICE-TO-HAVE
- **FAB/UMAI corner**: both anchor bottom-right with the same `right` offset (FAB `bottom:86px`, launcher `bottom:22px`) — stacked with clearance, no overlap, but fragile if either height changes. Leave unless it visibly collides.
- General hardening: re-run the manual test checklist above after deploying rules.

## DONE (this session — 2026-06-27, part 2)
- **Upcoming→Active push trigger (spec §12.3)** — `js/admin.js`: the project save handler now captures the previous status and, when an existing project flips `upcoming → active`, calls the new `notifyEnrolledUsers()` helper. It queries `participations` for that project and sends one in-app notification + browser push per enrolled user (deduped). New-project add now also captures its id for this path.
- **`run.bat` fixed** — root cause was a **duplicate `web-push` key in `server/package.json`** (invalid → `npm install` failed). Removed the dupe; `npm install` + `npm start` now succeed. Also fixed the browser-opens-before-server race: a detached helper now waits ~4s before opening `http://localhost:3000`.
- **`server/.env` cleaned** — removed a duplicate/dummy VAPID block; kept the single real keypair (verified accepted by `web-push`). `.env` already contained all secrets from `SETUP.md` (NVIDIA, Supabase, Resend, Firebase, VAPID), so nothing was missing.

Verified: `admin.js` passes `node --check`; `package.json` is valid JSON; `npm install` clean; `npm start` boots with `[init] Web Push (VAPID) ready` and health all-true.

## DONE (this session — 2026-06-27, part 3) — run.bat "not opening"
- **Root cause** was NOT the script: **port 3000 was held by a stray `node` process** left over from earlier testing, so the server in `run.bat` crashed instantly with `EADDRINUSE` and the window closed before the error could be read. Killed the stray process; port is free.
- **`run.bat` hardened** so this is self-diagnosing next time:
  - Pre-checks port 3000 with `netstat`; if busy, prints a warning + the PowerShell one-liner to free it before continuing.
  - Uses `call npm start` and a final `pause`, so the window stays open and the error is readable if the server stops or fails to start (previously it vanished silently).
- **`server/index.js`** — added an `.on("error")` handler on `app.listen`: prints a friendly "Port 3000 is already in use" message (or the real error) and exits cleanly, instead of dumping a raw stack trace.
- To free port 3000 manually (PowerShell): `Get-NetTCPConnection -LocalPort 3000 -State Listen | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }`

Verified: `server/index.js` passes `node --check`; boots clean and health all-true; port released after testing.

## DONE (this session — 2026-06-27, part 4) — the REAL "core system" bug (auth/modals broken)
User reported: UI looks fine, but the core flow is broken — Google login "never completes into the portal", and the "Complete registration / freelancer / phone number" screen shows up *before* Google login instead of after. Confirmed served via run.bat (localhost:3000), Google sign-in enabled in Firebase. So it was a code/CSS bug, not config.

- **Root cause — one CSS bug.** `css/style.css` `.modal-overlay { display: grid }` had no rule letting the HTML `hidden` attribute win, and a class `display` value beats the UA `[hidden] { display:none }`. So **`element.hidden` did nothing** and *every* `.modal-overlay` modal was permanently visible and could not be closed. This single bug produced all the symptoms:
  - the Google **completion modal** (`register.html` — phone + Freelancer/Vendor/Company) showed immediately instead of only after Google sign-in;
  - after Google sign-in, `openModal()`/`closeModal()` (= `modal.hidden = false/true`) were no-ops, so the flow appeared stuck = "never completes into the portal";
  - portal modals (project join `portal.html`, 4-step flow) were stuck open / un-closeable, so flows "never finished".
  - **Fix:** added `.modal-overlay[hidden] { display: none; }` right after the `.modal-overlay` rule. Restores show/hide on every modal app-wide with zero JS changes. Matches the existing `.portal-panel.hidden { display:none }` pattern.
- **`js/login-page.js` — stranded-user gap.** The `onAuthStateChanged` listener only redirected a signed-in user *if they had a profile*; a new Google user landing back on `login.html` with no profile yet was stuck. Now: signed-in + no profile → redirect to `register.html?complete=1` (same rule `guardPage` already uses), so the flow self-heals.

Note: the auth **logic** (Google-first → completion modal asks phone + role → write `users/{uid}` → portal; `guardPage`; `routeForRole`) was already correct and matches the desired flow — only the modal show/hide was broken. The `teanbris-studio-main` project was used as read-only reference and confirmed the same flow shape; no files were copied from it.

Verified: `js/login-page.js`, `js/register-page.js`, `js/auth.js` all pass `node --check`; portal/register modals all use the `hidden` attribute that now works.

Keep consistent with existing patterns: `esc()` helper, `data-*` hooks, `guardPage`, status badges. No emojis.

## DONE (this session — 2026-06-28) — Google login REALLY fixed (COOP + Firestore offline)
The modal CSS fix (part 4) was necessary but not the whole story. Captured the real browser console error this time:
- `Cross-Origin-Opener-Policy policy would block the window.close call` (popup.ts) — repeated
- `FirebaseError: Failed to get document because the client is offline.`

Root causes (both server/config, confirmed against the `teanbris-studio-main` reference which had solved the identical problem):
- **COOP blocked the Google popup.** `signInWithPopup` needs the opener page to call `window.close()/window.closed` on the popup window. A strict `same-origin` COOP (browser default behaviour here) blocks that, so sign-in hangs and never resolves — exactly "popup opens, pick account, nothing happens." teanbris encodes the fix in `firebase.json` (`Cross-Origin-Opener-Policy: same-origin-allow-popups`), `netlify.toml` (`# COOP must be allow-popups for Firebase Auth to work`), and a comment in `server.js` (strict COOP "block Firebase Auth popup flow").
  - **Fix:** `server/index.js` now sends `Cross-Origin-Opener-Policy: same-origin-allow-popups` + `Cross-Origin-Resource-Policy: cross-origin` on every response (Express middleware right after `app.use(cors())`). Deliberately did NOT set COEP (it also breaks the popup).
- **Firestore "client is offline".** The compat SDK's default WebChannel transport can be blocked by network/proxy/VPN/ad-block/strict-COOP, surfacing as the offline error even when online.
  - **Fix:** `js/firebase-config.js` calls `db.settings({ experimentalAutoDetectLongPolling: true, merge: true })` before any read/write, so it falls back to plain HTTP long-polling.

Verified: `server/index.js` passes `node --check`; booted and `curl -D -` confirms the COOP/CORP headers are present on `login.html`; health all-true; port 3000 freed after testing.

NOTE — did NOT copy teanbris HTML/JS files wholesale. YugmAI's auth flow, portal, and admin are already complete and structurally identical to teanbris; the only things missing were these two headers/settings, which are the parts of teanbris's "core system" that actually differed. Copying its `.js`/`.html` would have pointed at the wrong Firebase project (`teanbris-studio` vs `yugmai`) and broken more than it fixed.

## USER MUST DO (re-confirm for this fix)
1. **Restart the server** — close any old `run.bat` window and double-click `run.bat` again so the new COOP header takes effect (headers are set at boot).
2. **Hard refresh** the login page (Ctrl+F5) to drop cached CSS/JS.
3. Test Google login: login.html -> Continue with Google -> pick account -> completion modal (phone + role) appears -> portal. Console should no longer show the COOP/"offline" errors.
4. If Firestore reads still error, deploy rules: `firebase deploy --only firestore:rules` (still task #1 from before).
