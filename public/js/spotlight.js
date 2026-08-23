/**
 * Spotlight & Card Glow Effects — YUGM AI
 *
 * 1. Hero spotlight — soft radial ambient light that drifts slowly
 * 2. Card mouse-glow — each card gets a purple radial highlight under the cursor
 * 3. Section parallax — subtle translateY on section headers during scroll
 */

(function () {
  "use strict";

  /* ══════════════════════════════════════════════════════════════
   *  1. CARD MOUSE-TRACKING GLOW
   *  Each .service-card, .project-card, .process-card, .feature-card
   *  gets a ::before pseudo-element glow driven by CSS custom props.
   * ══════════════════════════════════════════════════════════════ */

  var CARD_SELECTORS = [
    ".service-card",
    ".project-card",
    ".process-card",
    ".contact-card",
    ".feature-card",
    ".ops-card",
    ".cta-band"
  ].join(",");

  function initCardGlow() {
    var cards = document.querySelectorAll(CARD_SELECTORS);
    if (!cards.length) return;

    cards.forEach(function (card) {
      card.addEventListener("mousemove", function (e) {
        var rect = card.getBoundingClientRect();
        var x = e.clientX - rect.left;
        var y = e.clientY - rect.top;
        card.style.setProperty("--glow-x", x + "px");
        card.style.setProperty("--glow-y", y + "px");
        card.style.setProperty("--glow-opacity", "1");
      });

      card.addEventListener("mouseleave", function () {
        card.style.setProperty("--glow-opacity", "0");
      });
    });
  }

  /* ══════════════════════════════════════════════════════════════
   *  2. HERO AMBIENT SPOTLIGHT
   *  A large soft gradient that follows the mouse across the hero,
   *  providing a warm purple wash effect.
   * ══════════════════════════════════════════════════════════════ */

  function initHeroSpotlight() {
    var hero = document.querySelector(".hero");
    if (!hero) return;

    var spot = document.createElement("div");
    spot.className = "hero-spotlight";
    spot.setAttribute("aria-hidden", "true");
    hero.appendChild(spot);

    var mx = 0, my = 0, cx = 0, cy = 0;
    var active = false;

    hero.addEventListener("mousemove", function (e) {
      var rect = hero.getBoundingClientRect();
      mx = e.clientX - rect.left;
      my = e.clientY - rect.top;
      if (!active) {
        cx = mx;
        cy = my;
        active = true;
      }
    });

    hero.addEventListener("mouseleave", function () {
      spot.style.opacity = "0";
      active = false;
    });

    hero.addEventListener("mouseenter", function () {
      spot.style.opacity = "1";
    });

    /* smooth follow with lerp */
    function tick() {
      if (active) {
        cx += (mx - cx) * 0.08;
        cy += (my - cy) * 0.08;
        spot.style.left = cx + "px";
        spot.style.top = cy + "px";
      }
      requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  /* ══════════════════════════════════════════════════════════════
   *  3. SECTION HEADER PARALLAX
   *  Subtle vertical shift on section headers as the user scrolls.
   * ══════════════════════════════════════════════════════════════ */

  function initParallax() {
    var headers = document.querySelectorAll(".section-header, .about-copy");
    if (!headers.length) return;

    var ticking = false;

    function update() {
      var scrollY = window.scrollY;
      headers.forEach(function (el) {
        var rect = el.getBoundingClientRect();
        var center = rect.top + rect.height / 2;
        var viewH = window.innerHeight;
        /* ratio from -1 (top of viewport) to +1 (bottom of viewport) */
        var ratio = (center - viewH / 2) / (viewH / 2);
        /* clamp and apply a subtle shift */
        ratio = Math.max(-1, Math.min(1, ratio));
        el.style.transform = "translateY(" + (ratio * -12) + "px)";
      });
      ticking = false;
    }

    window.addEventListener("scroll", function () {
      if (!ticking) {
        requestAnimationFrame(update);
        ticking = true;
      }
    }, { passive: true });
  }

  /* ══════════════════════════════════════════════════════════════
   *  4. HERO PANEL GLOW BORDER
   *  Animated gradient border on the hero operations panel.
   * ══════════════════════════════════════════════════════════════ */

  function initPanelGlow() {
    var panel = document.querySelector(".hero-panel");
    if (!panel) return;

    panel.addEventListener("mousemove", function (e) {
      var rect = panel.getBoundingClientRect();
      var x = ((e.clientX - rect.left) / rect.width) * 100;
      var y = ((e.clientY - rect.top) / rect.height) * 100;
      panel.style.setProperty("--panel-glow-x", x + "%");
      panel.style.setProperty("--panel-glow-y", y + "%");
    });
  }

  /* ── Init all ───────────────────────────────────────────────── */
  function init() {
    initCardGlow();
    initHeroSpotlight();
    initParallax();
    initPanelGlow();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
