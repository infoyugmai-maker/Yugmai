/**
 * Depth Card Motif — YUGM AI
 * Pure CSS3D tilt behavior for grid cards (Projects, Services, Jobs).
 * Combines existing --mouse-x / --mouse-y glow with rotateX/rotateY and translateZ parallax.
 */

export function initDepthCards() {
  const CARD_SELECTORS = [
    ".service-card",
    ".project-card",
    ".process-card",
    ".contact-card",
    ".feature-card",
    ".ops-card",
    ".cta-band"
  ].join(",");

  const cards = document.querySelectorAll(CARD_SELECTORS);
  const isTouch = window.matchMedia('(pointer: coarse)').matches;

  cards.forEach(card => {
    // Preserve existing structure but wrap inner content if not already wrapped
    // to apply translateZ for the parallax effect.
    // The existing cards typically have `<div>` holding the content inside the article.
    const innerContent = card.firstElementChild;
    if (innerContent && innerContent.tagName.toLowerCase() === 'div') {
      innerContent.style.transform = 'translateZ(30px)';
      innerContent.style.transition = 'transform 0.3s ease-out';
      // Make sure the card itself has transform-style preserve-3d
      card.style.transformStyle = 'preserve-3d';
    }

    if (isTouch) {
      // Touch devices: tap-scale pulse instead of tilt
      card.addEventListener('pointerdown', () => {
        card.style.transform = 'scale(0.97)';
        card.style.transition = 'transform 0.1s ease-out';
      });
      card.addEventListener('pointerup', () => {
        card.style.transform = 'scale(1)';
        card.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      });
      card.addEventListener('pointercancel', () => {
        card.style.transform = 'scale(1)';
      });
      return; // Skip tilt on touch
    }

    // Mouse tilt effect
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left; // x position within the element
      const y = e.clientY - rect.top;  // y position within the element
      
      // Keep existing glow logic
      card.style.setProperty("--mouse-x", x + "px");
      card.style.setProperty("--mouse-y", y + "px");
      // Add standard glow variables that spotlight.js used
      card.style.setProperty("--glow-x", x + "px");
      card.style.setProperty("--glow-y", y + "px");
      card.style.setProperty("--glow-opacity", "1");

      // Calculate tilt
      const centerX = rect.width / 2;
      const centerY = rect.height / 2;
      
      // max ~8 degrees
      const rotateX = -((y - centerY) / centerY) * 8; 
      const rotateY = ((x - centerX) / centerX) * 8;

      card.style.transform = `perspective(900px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) scale3d(1.02, 1.02, 1.02)`;
      card.style.transition = 'none'; // Instant follow while moving
    });

    card.addEventListener('mouseleave', () => {
      // Reset tilt and glow
      card.style.setProperty("--glow-opacity", "0");
      card.style.transform = `perspective(900px) rotateX(0deg) rotateY(0deg) scale3d(1, 1, 1)`;
      card.style.transition = 'transform 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
    });
  });
}
