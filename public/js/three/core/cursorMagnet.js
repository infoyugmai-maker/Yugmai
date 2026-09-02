/**
 * Cursor Magnetism — YUGM AI
 * Makes primary CTA buttons gently pull toward the cursor within a radius.
 * Uses CSS custom properties to avoid overriding existing transforms.
 */

export function initCursorMagnet() {
  const magneticElements = document.querySelectorAll('.btn-primary, .btn-outline, .btn-ghost, .fab-trigger');

  magneticElements.forEach(btn => {
    if (window.matchMedia('(pointer: coarse)').matches) return;

    btn.style.setProperty('--magnet-x', '0px');
    btn.style.setProperty('--magnet-y', '0px');

    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const cx = rect.width / 2;
      const cy = rect.height / 2;
      const x = (e.clientX - rect.left - cx) * 0.15;
      const y = (e.clientY - rect.top - cy) * 0.15;
      btn.style.setProperty('--magnet-x', x + 'px');
      btn.style.setProperty('--magnet-y', y + 'px');
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.setProperty('--magnet-x', '0px');
      btn.style.setProperty('--magnet-y', '0px');
    });
  });
}
