/**
 * Cursor Magnetism — YUGM AI
 * Makes primary CTA buttons gently pull toward the cursor within a radius.
 */

export function initCursorMagnet() {
  const magneticElements = document.querySelectorAll('.btn-primary, .btn-outline, .btn-ghost, .fab-trigger');

  magneticElements.forEach(btn => {
    // We only apply this on desktop where hover makes sense
    if (window.matchMedia('(pointer: coarse)').matches) return;

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const h = rect.width / 2;
      const w = rect.height / 2;
      
      // Calculate distance from center of element
      const x = e.clientX - rect.left - h;
      const y = e.clientY - rect.top - w;

      // Magnetic pull factor (e.g., max 15px displacement)
      const pullX = x * 0.2;
      const pullY = y * 0.2;

      btn.style.transform = `translate(${pullX}px, ${pullY}px)`;
    });

    btn.addEventListener('mouseleave', () => {
      // Snap back
      btn.style.transform = `translate(0px, 0px)`;
      // Add a tiny transition just for the snap back so it's smooth
      btn.style.transition = 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
      
      setTimeout(() => {
        btn.style.transition = '';
      }, 300);
    });
  });
}
