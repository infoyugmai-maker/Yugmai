/**
 * Contact Page Animations & 3D — YUGM AI
 */
import { SceneManager } from '../core/sceneManager.js';
import { OrbitalFlow } from '../motifs/orbitalFlow.js';

document.addEventListener('DOMContentLoaded', () => {
  // --- 1. GSAP High-End Scroll Animations ---
  // (GSAP animations are now handled globally in global.js, but we keep this here if any specific overrides are needed)

  // --- 2. 3D Orbital Flow (AI Core + Yugmai Satellites) ---
  // Create a container right alongside the form or header
  const contactSection = document.querySelector('.page-main');
  if (contactSection) {
    const orbitalContainer = document.createElement('div');
    orbitalContainer.id = 'three-contact-orbital';
    // Style it to float behind the cards or off to the side cleanly
    orbitalContainer.style.position = 'absolute';
    orbitalContainer.style.top = '0';
    orbitalContainer.style.right = '0';
    orbitalContainer.style.width = '100%'; 
    orbitalContainer.style.height = '100%';
    orbitalContainer.style.minHeight = '100vh';
    orbitalContainer.style.zIndex = '0';
    orbitalContainer.style.pointerEvents = 'none';
    
    // Ensure section can contain absolute children
    contactSection.style.position = 'relative';
    contactSection.insertBefore(orbitalContainer, contactSection.firstChild);
    
    const contactScene = new SceneManager('three-contact-orbital');
    if (contactScene.active) {
      // Position camera back so the entire orbital system fits on screen
      contactScene.camera.position.z = 7;
      contactScene.camera.position.x = 0; 
      contactScene.camera.position.y = -0.5; // Shift camera down to elevate object
      
      const orbital = new OrbitalFlow(contactScene.scene, {
        position: new THREE.Vector3(1.5, 1.8, 0) // Positioned directly in the empty space above the email card as requested
      });
      
      contactScene.onUpdate = (delta, elapsed) => {
        orbital.update(elapsed);
      };
      
      // GSAP animate the orbital system in
      if (typeof gsap !== 'undefined') {
        gsap.fromTo(orbital.group.scale, 
          { x: 0, y: 0, z: 0 },
          { x: 1, y: 1, z: 1, duration: 2.5, ease: "elastic.out(1, 0.7)", delay: 0.2 }
        );
      }
      
      window.addEventListener('beforeunload', () => contactScene.dispose());
    }
  }
});
