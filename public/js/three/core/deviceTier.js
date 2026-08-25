/**
 * Device Tier & Capabilities — YUGM AI
 * Returns "high", "low", or "off" based on hardware concurrency and user preferences.
 */

export function getDeviceTier() {
  // 1. Check for user preference for reduced motion
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    return 'off';
  }

  // 2. Hardware capabilities
  const cores = navigator.hardwareConcurrency || 2;
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  
  // 3. Simple heuristic
  // Desktop with >= 4 cores -> high
  // Mobile with >= 6 cores -> high
  // Otherwise -> low
  if (!isMobile && cores >= 4) {
    return 'high';
  }
  
  if (isMobile && cores >= 6) {
    return 'high';
  }

  return 'low';
}
