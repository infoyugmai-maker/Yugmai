/**
 * Contact Page Animations & 3D — YUGM AI
 */
import { SceneManager } from '../core/sceneManager.js';
import { DataGlobe } from '../motifs/dataGlobe.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. GSAP High-End Scroll Animations ---
  if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
    gsap.registerPlugin(ScrollTrigger);

    // Smooth reveal for headers and text (The "Blend Motions" vibe)
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
            start: "top 85%", // Triggers when element is 85% down the viewport
            toggleActions: "play none none reverse"
          }
        }
      );
    });

    // Stagger in the contact cards
    const contactCards = document.querySelectorAll('.contact-card');
    if (contactCards.length > 0) {
      gsap.fromTo(contactCards, 
        { opacity: 0, y: 40, scale: 0.95 },
        { 
          opacity: 1, 
          y: 0, 
          scale: 1,
          duration: 0.8, 
          stagger: 0.15,
          ease: "back.out(1.2)",
          scrollTrigger: {
            trigger: '.card-grid',
            start: "top 80%",
          }
        }
      );
    }
    
    // Form panel graceful slide-in
    const formPanel = document.querySelector('.form-panel');
    if (formPanel) {
      gsap.fromTo(formPanel, 
        { opacity: 0, x: 30 },
        { 
          opacity: 1, 
          x: 0, 
          duration: 1, 
          ease: "power3.out",
          scrollTrigger: {
            trigger: formPanel,
            start: "top 80%",
          }
        }
      );
    }
  }

  // --- 2. 3D Data Globe ---
  // Create a container right alongside the form or header
  const contactSection = document.querySelector('.section .container');
  if (contactSection) {
    const globeContainer = document.createElement('div');
    globeContainer.id = 'three-contact-globe';
    // Style it to float behind the cards or off to the side cleanly
    globeContainer.style.position = 'absolute';
    globeContainer.style.top = '0';
    globeContainer.style.right = '0';
    globeContainer.style.width = '100%'; // Full width to act as ambient background
    globeContainer.style.height = '100%';
    globeContainer.style.zIndex = '-1';
    globeContainer.style.pointerEvents = 'none';
    
    // Ensure section can contain absolute children
    contactSection.style.position = 'relative';
    contactSection.appendChild(globeContainer);
    
    const contactScene = new SceneManager('three-contact-globe');
    if (contactScene.active) {
      // Position camera so globe sits elegantly on the right side
      contactScene.camera.position.z = 12;
      contactScene.camera.position.x = 4; // Shift camera right so globe appears on the right
      
      const globe = new DataGlobe(contactScene.scene, {
        radius: 4,
        position: new THREE.Vector3(5, 0, 0) // Positioned strictly to the right
      });
      
      contactScene.onUpdate = (delta, elapsed) => {
        globe.update(elapsed);
      };
      
      // GSAP animate the globe in
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(globe.group.scale, 
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 1, duration: 2, ease: "elastic.out(1, 0.7)", delay: 0.2 }
        );
      }
      
      window.addEventListener('beforeunload', () => contactScene.dispose());
    }
  }
});
