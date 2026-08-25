# YUGM AI — 3D Immersive Redesign Specification
**Companion document to:** `WEBSITE_ARCHITECTURE_AND_FULL_SPECIFICATION.md`
**Purpose:** Turn the current site — which has 3D in only two places (the hero robot, the arc carousel) — into a site where almost every page has real, moving, reactive 3D. This document tells the developer exactly what to build, where, and with what.
**Status:** Ready for build. No further clarification needed to start Phase 1.

---

## 0. How to Read This Document

Each page section below has three parts:
1. **What exists today** (pulled from the current spec)
2. **What to add** (the new 3D/reactive element, described concretely — geometry, motion, trigger)
3. **Build notes** (which shared component from Section 4/6 it reuses, and any page-specific logic)

Nothing here requires throwing away the current codebase. The site stays vanilla HTML/CSS/JS + Firebase; we are **adding a real Three.js layer** alongside the existing WebGL shader (`waves.js`) and Spline robot, not replacing the architecture with a framework rewrite. This keeps the developer's existing mental model intact and avoids a multi-month React migration.

---

## 1. Vision & What "3D" Means Here

Right now "3D" on the site means: one Spline robot model, and a carousel that fakes depth with 2D transforms. That's it. Everything else is flat cards with a mouse-glow effect.

The brief is: **every page should feel like it has depth, motion, and things that respond to the visitor** — not decoration, but 3D elements that *communicate what YUGM AI actually does* (collects and processes speech/audio/video data at scale, through a 5-step pipeline, across 100+ languages, via a global contributor network).

So the 3D additions in this document are not random spinning shapes. They fall into four recurring "signature motifs" that get reused across pages, so the site feels like one coherent system rather than a pile of unrelated effects:

| Motif | What it looks like | What it represents | Used on |
|---|---|---|---|
| **Orbit Flow** | A glowing center (logo/text/orb) with animated tube-lines flowing outward to labeled nodes, particles traveling along the tubes | The core "we do X, Y, Z" idea — center = YUGM AI, nodes = services/steps | Homepage capabilities, Portal pipeline, About methodology |
| **Data Globe** | A rotating wireframe/point-cloud globe with pulsing pins and arcs between them | 100+ languages, global contributor network, Delhi HQ → world | Homepage, About, Jobs, Contact |
| **Audio Waveform Field** | A 3D bar/ribbon field that reacts like a live audio waveform, driven by a looping fake amplitude signal (or real mic input where appropriate) | The literal product — speech & audio data | Homepage hero, Portal (work submission step), Job board header |
| **Depth Cards** | Cards that tilt in true 3D (rotateX/rotateY toward cursor, with parallax layers, not just a glow) with soft drop shadows that move with tilt | Every card grid on the site (services, projects, jobs, capabilities) | Homepage, Jobs, Portal, About |

This document specifies each motif once as a reusable component, then tells you which pages use which motif and how.

---

## 2. Technology Additions

### 2.1 What to install
```bash
npm install three gsap
```
That's it for core dependencies. Optional, only if you want easier post-processing glow:
```bash
npm install postprocessing
```

### 2.2 Why these and not a framework rewrite
- **`three` (raw Three.js, not React Three Fiber):** the site is vanilla JS. Introducing React Three Fiber would mean introducing React itself just for the 3D layer, which creates two UI paradigms living side by side and doubles the learning curve for one developer. Raw Three.js scenes are plain JS modules exactly like `waves.js` and `carousel.js` already are — same pattern, same import style, same file location (`public/js/`).
- **`gsap` + `ScrollTrigger` (bundled free with GSAP now):** this is what drives "camera moves as you scroll," "node lights up when it enters view," "step tracker advances." It's the industry-standard tool for exactly the scroll-linked 3D storytelling described in the brief, and it works identically well on plain DOM elements and on Three.js object properties.
- **Spline stays** for the hero robot only. Spline is excellent for a single polished hand-authored scene, but it cannot easily bind to live Firestore data (e.g., "highlight the contributor's current step" or "plot this project's real language list on the globe"). Anything that needs to react to real app state is built in raw Three.js instead. Anything that's a fixed, purely decorative scene can stay in Spline.

### 2.3 New file structure (additions only)
```
public/js/three/
├── core/
│   ├── sceneManager.js        # creates/disposes a Three.js scene per page, shared renderer settings
│   ├── deviceTier.js          # detects GPU/CPU tier + prefers-reduced-motion, returns "high" | "low" | "off"
│   ├── colorTokens.js         # exports the brand purple palette as THREE.Color objects (single source of truth)
│   └── cursorMagnet.js        # shared cursor-follow / magnetic-button logic (DOM, no WebGL needed)
├── motifs/
│   ├── orbitFlow.js           # the center + flowing nodes component (Section 4)
│   ├── dataGlobe.js           # rotating globe with pins + arcs
│   ├── audioWaveField.js      # reactive bar/ribbon waveform
│   └── depthCard.js           # true 3D tilt card behavior (vanilla JS, CSS3D — no WebGL needed)
├── pages/
│   ├── home.three.js
│   ├── portal.three.js
│   ├── about.three.js
│   ├── contact.three.js
│   └── jobs.three.js
└── README.md                  # one paragraph per motif explaining its params, for future maintainers
```
Each `pages/*.three.js` file is only imported on its matching HTML page, and calls `sceneManager.dispose()` on `beforeunload` / page navigation so scenes don't leak memory across the site's multi-page (non-SPA) structure.

---

## 3. Global 3D Design System

These rules apply to every 3D element added anywhere on the site, so it all reads as one product:

- **Color:** every material pulls from `colorTokens.js`, which is just the four brand colors already defined in the CSS (`#02010A`, `#04052E`, `#3D2C8D`, `#916BBF`) plus the lavender glow as the universal emissive/accent color. No new colors introduced anywhere in the 3D layer.
- **Lighting rig (reused across every scene):** one soft ambient light (low intensity, deep indigo tint) + one key point light in lavender (`#916BBF`) positioned to rim-light geometry from the upper-left, matching the glassmorphic highlight direction already used in the CSS (`1px solid rgba(145,107,191,0.2)` border highlights imply a light source from upper-left). This is what makes the 3D elements feel like they belong on the same page as the glass cards.
- **Materials:** `MeshPhysicalMaterial` with low roughness (~0.3), slight transmission/clearcoat for a "glass" feel on nodes and cards, `MeshBasicMaterial` with additive blending for particles/glow trails (cheap, no lighting calc needed for hundreds of particles).
- **Motion easing:** every camera move, node reveal, or scroll-triggered transform uses GSAP's `power3.out` or a custom cubic identical to the one already defined for scroll-reveal (`cubic-bezier(0.16, 1, 0.3, 1)`) — so new 3D motion and existing 2D scroll-reveal motion feel like the same hand designed them.
- **Particles:** built once as a shared `THREE.Points` / `InstancedMesh` factory in `orbitFlow.js` and `audioWaveField.js`, not duplicated per page.
- **Cursor reactivity:** every interactive 3D element (node, card, globe pin) does two things on hover — (1) scales up ~6% with a spring ease, (2) brightens its emissive intensity — and on click, does a short "pulse" (scale to 1.12 and back over 200ms). This is the one universal "this thing is alive" language used everywhere.
- **Reduced motion / low power:** `deviceTier.js` checks `navigator.hardwareConcurrency`, a WebGL capability probe, and `prefers-reduced-motion`. On `"low"` or `"off"`, every motif renders its **static fallback** (see Section 7) instead of the animated version. This check happens once per page load, before any Three.js scene is constructed, so low-end devices never even pay the cost of initializing WebGL for a scene they won't animate.

---

## 4. The Signature Component: Orbit Flow

This is the direct build-out of the example in the brief: *"written in the center and the work we do, the flow is going, step by step."*

### 4.1 What it is
A central 3D focal point (the YUGM AI mark, or a page-specific label) with 4–6 tube-shaped paths curving outward to labeled nodes arranged in a ring around it. Particles travel continuously along each tube from center → node (or node → center, depending on the page's meaning — see per-page notes). Nodes glow and lift slightly when hovered or when scroll brings them into focus, and each shows a short label + one-line description on hover/tap.

### 4.2 Technical build
- **Curves:** each connection is a `THREE.CatmullRomCurve3` from the center point to a node position on a ring (radius scales with viewport width), with a slight upward bow so tubes don't overlap visually.
- **Tube geometry:** `THREE.TubeGeometry(curve, 64, radius, 8, false)` — radius ~0.02–0.04 scene units, thin and elegant, not chunky pipes.
- **Tube material:** semi-transparent lavender gradient (vertex-colored: darker near center, brighter near the node, matching the Oklab gradient logic already used in `waves.js` so the palette language is identical).
- **Particles on the flow:** small glowing points, 3–6 per tube, looping along the curve's `t` parameter (0→1) at slightly different speeds/offsets so it reads as continuous flow, not a synced pulse.
- **Center object:** either the animated wordmark ("YUGM AI") extruded as flat 3D text (`TextGeometry` with a subtle bevel) slowly rotating on the Y axis at ~2–3°/sec, or — on pages without a text center — a faceted glass icosahedron with the emissive glow.
- **Nodes:** small glass discs or rounded cards floating at the ring positions, each carrying an HTML label via `CSS2DRenderer` (crisp text, no blurry canvas-texture text) positioned to track the 3D node.
- **Camera:** slow, near-imperceptible orbital drift (a few degrees over 30+ seconds) so the whole thing never looks frozen even when nobody's interacting, but never enough to be distracting while reading.
- **Interaction:** raycasting on pointer move highlights the nearest node; click/tap on a node scrolls the page to (or opens) that section's detail, so this isn't just decoration — it's a navigation element.

### 4.3 Per-page meaning (same component, different data + direction)
| Page | Center | Nodes | Flow direction |
|---|---|---|---|
| Homepage capabilities | "YUGM AI" wordmark | The 6 service capabilities (from the existing arc carousel content) | Center → nodes (we radiate out into these capabilities) |
| Portal pipeline | The contributor's current step number, large | The 5 pipeline steps (Section 5 of the base spec) | Sequential ring, not radial — see 5.2 for the variant |
| About methodology | "Delhi HQ" | Data collection → Annotation → QA → Delivery | Nodes → center (everything flows into one delivered dataset) |

---

## 5. Page-by-Page Specification

### 5.1 Homepage (`public/index.html`)

**Exists today:** Spline robot hero, live projects feed from Firestore, services grid, arc carousel, partner strip, about preview, lead capture footer.

**Add:**
- **Hero:** keep the Spline robot exactly as is (it's the site's best asset). Behind/around it, add a thin **Audio Waveform Field** strip along the bottom edge of the hero section — a low-key animated bar field that idles with a gentle looping "breathing" amplitude pattern, and visibly spikes/reacts on scroll-wheel input and on page load, tying the hero directly to "this is a speech/audio data company" without needing extra copy to say so.
- **Capabilities section:** replace the current 2D arc carousel math (Section 3.4 of the base spec) with the **Orbit Flow** component described in Section 4 above, using the homepage variant from the table in 4.3. Keep the existing `01 of 06` pagination indicator and auto-rotate/pause-on-hover behavior — those UX affordances are good, just re-point them at the new 3D nodes instead of the flat cards.
- **Live projects feed:** apply the **Depth Card** motif (Section 6.1) to each project card — true 3D tilt toward the cursor instead of the current flat spotlight-glow effect. Cards should also have a subtle parallax: the card's inner content (title, tags) sits at a slightly different depth than the card's glass background, so tilting reveals genuine depth, not just a lighting trick.
- **Telemetry counters** (`10,000+ Resources`, `150+ Projects`, `100+ Languages`): keep the existing cubic ease-out count-up, but render the "100+ Languages" stat next to a small inline **Data Globe** (compact, ~120px, no interaction needed here — just a supporting visual proving the number).
- **Partner strip:** no 3D needed here — logos stay flat, this section should stay visually quiet as a breathing point between high-motion sections.

### 5.2 Contributor Portal (`public/portal.html`)

**Exists today:** 5-step pipeline (application → onboarding/NDA → work submission → QA → invoicing), live Firestore-backed status.

**Add:**
- **Pipeline visualizer:** this is the highest-value 3D addition on the whole site, because it turns an abstract status field into something the contributor actually watches move. Build it as a **sequential variant of Orbit Flow**: instead of a radial ring, the 5 steps sit along a single gently curving path (left to right, or top to bottom on mobile). The contributor's actual current step (pulled live from their `participations`/`submissions`/`payouts` documents, exactly as already tracked in Firestore per Section 8 of the base spec) is rendered as a bright glowing marker on the path; completed steps behind it are lit and connected by a solid glowing tube; steps ahead are dim, connected by a faint dashed/unlit tube. When an admin approves a stage (the Firestore listener already used for real-time status in `portal.js` fires), the marker animates smoothly forward to the next step rather than just re-rendering — this is the "step by step, flow going" moment from the brief, directly wired to real backend state instead of being decorative.
- **Work submission step:** while a contributor is on Step 3 (submitting recorded audio/data), show a compact **Audio Waveform Field** next to the upload widget — idle animation while waiting, and if the browser has mic/file access to a sample, drive the bars from real amplitude data as a nice touch (optional, non-blocking — falls back to the idle loop if no audio context is available).
- **Everything else** (invoice download, credential display, chat) stays as functional flat UI — this is a working dashboard, not a showcase; over-animating data-entry screens hurts usability.

### 5.3 Admin Panel (`public/admin.html`)

**Exists today:** 12-tab operational control center (Overview, Projects, Participation, Work Tracking, Registrations, Messages, Contacts, Sign-in Logs, Announcements, Invoicing, Languages, Admin Access).

**Add (deliberately restrained — this is an internal ops tool, not a marketing surface):**
- **Overview tab only:** render the top-line metrics (Total Registrations, Active Workflows, Submissions, Unique Speakers) as small glass **orb counters** — a compact glass sphere per metric with the number floating inside it, gently bobbing, that brightens on hover. This is a light touch of the same visual language as the public site, so the admin doesn't feel like a completely different product, without adding any 3D to the dense data tables in the other 11 tabs (Participation, Work Tracking, Registrations, etc.), where legibility and speed matter far more than atmosphere.
- **Languages Dashboard tab:** this one tab benefits from the **Data Globe** — plot the real aggregated language/speaker counts (already computed for this tab per the base spec) as pins on the globe, sized by contributor count per language, so an admin can see network coverage at a glance instead of only scanning a table.

### 5.4 Job Board (`public/jobs.html`)

**Exists today:** searchable/filterable list of active/upcoming projects with language badges.

**Add:**
- Header strip gets a compact **Audio Waveform Field**, same component as the homepage hero, reinforcing the "this is audio/speech work" framing right where people are browsing jobs.
- Each job card becomes a **Depth Card** (Section 6.1) — tilt-on-hover, with the language badges appearing to sit at a slightly raised depth layer above the card body.
- Filtering (work-type, language) triggers a short GSAP stagger-out/stagger-in on the card grid rather than an instant re-render, so filtering itself feels responsive and physical.

### 5.5 Job Application (`public/job-apply.html`)

**Exists today:** dynamic form renderer for the 11 custom field types.

**Add:**
- A slim **progress ring** rendered as a real 3D torus (not a flat CSS circle) that fills as the contributor completes required fields, sitting in the form header. Subtle, functional, not distracting from form-filling — the goal here is reassurance ("you're 60% done"), not spectacle.
- No 3D on the form fields themselves — inputs, dropdowns, file uploads stay standard for accessibility and mobile usability.

### 5.6 About Us (`public/about.html`)

**Exists today:** founding story, Delhi base, security posture, methodology.

**Add:**
- **Founding story:** a horizontal scroll-linked timeline where 3–4 milestone markers sit along a thin glowing path; as the visitor scrolls, the camera dollies along the path (GSAP ScrollTrigger driving the Three.js camera position) and each milestone's card fades/lifts into view when the camera reaches it.
- **Methodology section:** the About variant of **Orbit Flow** from the table in 4.3 (Data Collection → Annotation → QA → Delivery, flowing *into* the center instead of out of it — visually reinforcing "everything we do converges into one clean delivered dataset").
- **Global reach:** a full-size **Data Globe** with an arc from a Delhi pin to pins representing client/contributor regions, arcs animating in sequence rather than all at once.

### 5.7 Contact (`public/contact.html`)

**Exists today:** enterprise lead intake form.

**Add (this was specifically called out in the brief):**
- A **Data Globe**, centered or side-positioned next to the form, with a single pulsing pin on Delhi and a slow, continuous outward pulse-ring animation from that pin — visually saying "reach us here, we work globally from here" without any extra copy.
- As the visitor fills the form, each completed field sends a small light pulse traveling from the form toward the globe's Delhi pin (a lightweight decorative particle burst along a simple curve) — a small reactive moment that makes submitting the form feel like it's actually "sending" something, tying the interaction to the visual.
- On successful submission, the Delhi pin does a bright confirmation pulse before the usual success-message UI shows.

### 5.8 Login (`public/login.html`) & Register (`public/register.html`)

**Exists today:** authentication forms, multi-role onboarding.

**Add:**
- Ambient-only: a slow, quiet **particle field** (reused straight from the existing `waves.js` shader math, just a sparser point-field variant) drifting behind the glass form panel. No interactive nodes, no camera moves — these are conversion-critical, low-distraction pages. The 3D here should be felt more than seen.
- One small flourish: on successful role selection in Register (Freelancer/Vendor/Company), the selected role's icon does a brief 3D flip/reveal instead of an instant state change.

### 5.9 Privacy Policy & Terms of Service (`public/privacy.html`, `public/terms.html`)

**Add:** nothing beyond the site-wide ambient shader background that already exists. These are long-form legal text pages; any added motion actively hurts readability and trust. Leave as-is.

### 5.10 Prototype Sandbox (`public/prototype.html`)

**Add:** this becomes the living demo page for every motif in Section 3/4/6 in isolation, so the developer (and you) can test/tweak each 3D component on its own before it's wired into a real page. Recommend building every new component here first, then importing it into its real page once approved.

---

## 6. Reusable Interaction & Motion Library

These are small, page-agnostic behaviors, referenced by name throughout Section 5 so they're built once and reused everywhere.

### 6.1 Depth Card (`motifs/depthCard.js`)
Replaces the current 2D `spotlight.js` mouse-glow with true 3D tilt:
- On `mousemove` over a card, compute rotation from cursor position relative to card center (max ~8° on each axis), apply via CSS `transform: perspective(900px) rotateX() rotateY()`.
- Card's inner content layer moves at a different rate than the card background (simple parallax via `translateZ`) so the tilt reveals real depth.
- Retains the existing glow-follows-cursor effect from `spotlight.js` as a highlight *on top of* the tilt, rather than replacing it — the two effects combine.
- On touch devices, tilt is disabled (no hover state) and replaced by a brief tap-scale pulse instead.
- Pure CSS3D — no WebGL required, so this runs everywhere including the lowest-tier devices.

### 6.2 Cursor Magnetism (`core/cursorMagnet.js`)
Primary CTA buttons (Request Plan, Work With Us, Apply, Submit) gently pull toward the cursor within a small radius (~40px) as it approaches, and snap back on mouse-leave. Small, tasteful, makes the site's key actions feel alive without being gimmicky.

### 6.3 Scroll-Linked Reveal, Upgraded
The existing Intersection Observer reveal system (Section 3.5 of the base spec) stays for text/2D content. For 3D scenes, the equivalent is GSAP ScrollTrigger driving actual object properties (camera position, node opacity, particle speed) rather than just fading a DOM element in — so 3D content doesn't just "appear," it animates into its resting state as you scroll to it.

---

## 7. Performance, Fallbacks & Accessibility

This is not optional polish — a site that's "properly 3D" everywhere but slow or broken on a mid-range phone will hurt more than the current, simpler site. Every motif must ship with its fallback from day one, not as a later optimization pass.

- **Tiering:** `deviceTier.js` runs once per page load and returns `high`, `low`, or `off`.
  - `high`: full WebGL scene, all particles, full motion.
  - `low`: same scene, reduced particle count (~30%), lower pixel ratio cap (max 1.5x), no post-processing glow.
  - `off` (or `prefers-reduced-motion`): no WebGL canvas is created at all. Each motif renders a static, pre-styled SVG/PNG equivalent (a still frame of the Orbit Flow ring, a still globe with static pins) so the page still looks intentional, just not animated.
- **One scene per page, disposed on navigation:** because this is a multi-page site (not an SPA), each `pages/*.three.js` module must call `renderer.dispose()`, remove canvas elements, and cancel its animation frame loop on `pagehide`, so navigating Home → Jobs → About doesn't accumulate orphaned WebGL contexts (a real risk with multiple heavy scenes across many pages).
- **Mobile:** touch replaces hover/tilt with tap-triggered equivalents everywhere (see 6.1). Camera drift motions are capped or disabled on small viewports where they'd be more disorienting than pleasant in a single-handed portrait view.
- **SEO/crawlability:** all 3D is additive visual layer only — every page's actual content (headings, project data, form labels) stays in real HTML exactly as it is today. Nothing meaningful is ever rendered only inside a canvas.
- **Load order:** the WebGL layer loads after first paint (deferred script), so text and layout are visible immediately even before Three.js/GSAP finish downloading — protects the site's current sub-second load time mentioned in the base spec.

---

## 8. Build Priority

Suggested order, so there's a working, demo-able improvement at the end of every phase rather than a big-bang launch:

1. **Foundation:** `core/` folder (sceneManager, deviceTier, colorTokens, cursorMagnet) + Depth Card rollout across every existing card grid site-wide. Immediate visible upgrade with the lowest risk.
2. **Homepage centerpiece:** Orbit Flow replacing the capabilities carousel, plus the hero Audio Waveform Field strip. This is the single highest-impact, most-visible change.
3. **Portal pipeline visualizer:** the sequential Orbit Flow wired to real Firestore step data. Highest value for existing contributors.
4. **Contact + About:** Data Globe and the About methodology/timeline treatments.
5. **Job board + job apply:** Depth Cards already covered in Phase 1; add the waveform header strip and 3D progress ring.
6. **Admin overview polish + Languages globe:** lowest priority, internal-only.
7. **Performance pass:** device-tier testing on real low/mid-range Android hardware, fallback verification, final tuning.

---

## 9. Checklist for the Developer

- [ ] Install `three` and `gsap`, no other new dependencies
- [ ] Build `core/` shared modules first — everything else imports from these
- [ ] Build every motif once in `prototype.html` before wiring it into a real page
- [ ] Every motif has a working `off`-tier static fallback before it ships
- [ ] Every new scene is disposed on page navigation (test by navigating between 3+ pages and checking WebGL context count in dev tools)
- [ ] Colors only ever come from `colorTokens.js` — no new hex values introduced anywhere in the 3D layer
- [ ] Portal pipeline visualizer reflects real Firestore state, not mock data, before Phase 3 is considered done
- [ ] Test on one real low/mid-range Android phone, not just desktop Chrome, before calling any phase complete
