/**
 * Homepage 3D Animations & Motion Graphics - YUGM AI
 */
import { SceneManager } from '../core/sceneManager.js';
import { ServiceHub } from '../motifs/serviceHub.js';

document.addEventListener('DOMContentLoaded', () => {
  // Initialize the 3D Service Hub (Network of companies) in the interactive-3d section
  const containerId = 'home-globe-container';
  const container = document.getElementById(containerId);
  
  if (container) {
    const homeScene = new SceneManager(containerId);
    if (homeScene.active) {
      // Position camera back so the network fits perfectly
      homeScene.camera.position.z = 14;
      
      const serviceHub = new ServiceHub(homeScene.scene, {
        position: new THREE.Vector3(0, 0, 0)
      });
      
      homeScene.onUpdate = (delta, elapsed) => {
        serviceHub.update(elapsed);
      };
      
      // GSAP animate the network in on scroll
      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.fromTo(serviceHub.group.scale, 
          { x: 0, y: 0, z: 0 },
          { 
            x: 1, y: 1, z: 1, 
            duration: 2.0, 
            ease: "elastic.out(1, 0.7)", 
            scrollTrigger: {
              trigger: container,
              start: "top 80%",
            }
          }
        );
      }
      
      window.addEventListener('beforeunload', () => homeScene.dispose());
    }
  }
});
