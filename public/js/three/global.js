import { initDepthCards } from './motifs/depthCard.js';
import { initCursorMagnet } from './core/cursorMagnet.js';

document.addEventListener('DOMContentLoaded', () => {
  // Phase 1: Initialize global 3D interactive motifs (Pure CSS/DOM)
  initDepthCards();
  initCursorMagnet();

  // Initialize Global GSAP Scroll Animations if GSAP is available
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // Global fade-up for section headers and text
    const fadeUpElements = document.querySelectorAll('.section-eyebrow, .section-title, .section-copy');
    fadeUpElements.forEach((el) => {
      gsap.fromTo(el, 
        { opacity: 0, y: 30 },
        { 
          opacity: 1, 
          y: 0, 
          duration: 1, 
          ease: "power3.out",
          scrollTrigger: {
            trigger: el,
            start: "top 85%",
            toggleActions: "play none none reverse"
          }
        }
      );
    });

    // Global stagger for cards (projects, services, features, ops)
    const cardContainers = document.querySelectorAll('.card-grid, .grid, .process-steps');
    cardContainers.forEach((container) => {
      const cards = container.querySelectorAll('.project-card, .service-card, .feature-card, .ops-card, .process-card');
      if (cards.length > 0) {
        gsap.fromTo(cards, 
          { opacity: 0, y: 40, scale: 0.95 },
          { 
            opacity: 1, 
            y: 0, 
            scale: 1,
            duration: 0.8, 
            stagger: 0.15,
            ease: "back.out(1.2)",
            scrollTrigger: {
              trigger: container,
              start: "top 80%",
            }
          }
        );
      }
    });
  }
});
