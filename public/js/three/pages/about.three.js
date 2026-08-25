/**
 * About Page GSAP Animations — YUGM AI
 */
document.addEventListener('DOMContentLoaded', () => {
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // Fade up headers and paragraphs beautifully
    const fadeUpElements = document.querySelectorAll('.section-eyebrow, .section-title, .section-copy');
    fadeUpElements.forEach((el, i) => {
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

    // Stagger process cards
    const processCards = document.querySelectorAll('.process-card, .feature-card, .ops-card');
    if (processCards.length > 0) {
      gsap.fromTo(processCards, 
        { opacity: 0, y: 40, scale: 0.95 },
        { 
          opacity: 1, 
          y: 0, 
          scale: 1,
          duration: 0.8, 
          stagger: 0.15,
          ease: "back.out(1.2)",
          scrollTrigger: {
            trigger: processCards[0].parentElement, // The grid container
            start: "top 80%",
          }
        }
      );
    }
  }
});
