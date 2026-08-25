import { initDepthCards } from './motifs/depthCard.js';
import { initCursorMagnet } from './core/cursorMagnet.js';

document.addEventListener('DOMContentLoaded', () => {
  // Phase 1: Initialize global 3D interactive motifs (Pure CSS/DOM)
  initDepthCards();
  initCursorMagnet();
});
