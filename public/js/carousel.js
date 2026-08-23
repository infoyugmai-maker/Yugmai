/**
 * Circular Carousel — YUGM AI
 * Vanilla JS implementation of the 3D-arc carousel.
 * Cards are positioned in a circular arc with the active card in front.
 * Auto-rotates every 4 seconds, pauses on hover.
 */

(function () {
  "use strict";

  function initCarousel() {
    var track = document.getElementById("carousel-track");
    if (!track) return;

    var cards = track.querySelectorAll(".carousel-card");
    var total = cards.length;
    if (total === 0) return;

    var prevBtn = document.getElementById("carousel-prev");
    var nextBtn = document.getElementById("carousel-next");
    var dotsWrap = document.getElementById("carousel-dots");
    var currentEl = document.getElementById("carousel-current");
    var totalEl = document.getElementById("carousel-total");

    var activeIndex = 0;
    var autoPlayInterval = null;
    var RADIUS_X = 240;
    var RADIUS_Y = 80;
    var VISIBLE_HALF = 2;

    /* set total label */
    if (totalEl) totalEl.textContent = String(total).padStart(2, "0");

    /* build dot indicators */
    if (dotsWrap) {
      for (var d = 0; d < total; d++) {
        var dot = document.createElement("button");
        dot.className = "carousel-dot" + (d === 0 ? " active" : "");
        dot.setAttribute("aria-label", "Go to item " + (d + 1));
        dot.dataset.index = d;
        dot.addEventListener("click", function () {
          goTo(parseInt(this.dataset.index));
        });
        dotsWrap.appendChild(dot);
      }
    }

    function positionCards() {
      cards.forEach(function (card, i) {
        var offset = i - activeIndex;
        /* wrap around */
        if (offset > total / 2) offset -= total;
        if (offset < -total / 2) offset += total;

        var absOffset = Math.abs(offset);

        if (absOffset > VISIBLE_HALF + 1) {
          card.style.opacity = "0";
          card.style.pointerEvents = "none";
          card.style.zIndex = "0";
          return;
        }

        var angle = (offset / (VISIBLE_HALF + 1)) * (Math.PI * 0.65);
        var x = Math.sin(angle) * RADIUS_X;
        var y = -Math.cos(angle) * RADIUS_Y + RADIUS_Y;

        var scale = Math.max(0.6, 1 - absOffset * 0.15);
        var opacity = Math.max(0.25, 1 - absOffset * 0.3);
        var zIndex = 10 - absOffset;
        var isActive = i === activeIndex;

        card.style.transform =
          "translate(calc(-50% + " + x + "px), calc(-50% + " + y + "px)) scale(" + scale + ")";
        card.style.opacity = String(opacity);
        card.style.zIndex = String(zIndex);
        card.style.pointerEvents = "auto";

        if (isActive) {
          card.classList.add("active");
        } else {
          card.classList.remove("active");
        }
      });

      /* update counter */
      if (currentEl) {
        currentEl.textContent = String(activeIndex + 1).padStart(2, "0");
      }

      /* update dots */
      if (dotsWrap) {
        var dots = dotsWrap.querySelectorAll(".carousel-dot");
        dots.forEach(function (dot, i) {
          dot.classList.toggle("active", i === activeIndex);
        });
      }
    }

    function goTo(index) {
      activeIndex = ((index % total) + total) % total;
      positionCards();
    }

    function next() {
      goTo(activeIndex + 1);
    }

    function prev() {
      goTo(activeIndex - 1);
    }

    /* button listeners */
    if (prevBtn) prevBtn.addEventListener("click", prev);
    if (nextBtn) nextBtn.addEventListener("click", next);

    /* click-to-select on cards */
    cards.forEach(function (card) {
      card.addEventListener("click", function () {
        var idx = parseInt(card.dataset.index);
        if (idx !== activeIndex) goTo(idx);
      });
    });

    /* keyboard navigation */
    var stage = track.closest(".carousel-stage");
    if (stage) {
      stage.setAttribute("tabindex", "0");
      stage.addEventListener("keydown", function (e) {
        if (e.key === "ArrowLeft") { prev(); e.preventDefault(); }
        if (e.key === "ArrowRight") { next(); e.preventDefault(); }
      });
    }

    /* auto-play */
    function startAutoPlay() {
      stopAutoPlay();
      autoPlayInterval = setInterval(next, 4000);
    }

    function stopAutoPlay() {
      if (autoPlayInterval) {
        clearInterval(autoPlayInterval);
        autoPlayInterval = null;
      }
    }

    if (stage) {
      stage.addEventListener("mouseenter", stopAutoPlay);
      stage.addEventListener("mouseleave", startAutoPlay);
      stage.addEventListener("focusin", stopAutoPlay);
      stage.addEventListener("focusout", startAutoPlay);
    }

    /* init */
    positionCards();
    startAutoPlay();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initCarousel);
  } else {
    initCarousel();
  }
})();
