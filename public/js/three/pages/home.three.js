/**
 * Homepage 3D Integrations — YUGM AI
 */
import { SceneManager } from '../core/sceneManager.js';
import { AudioWaveField } from '../motifs/audioWaveField.js';
import { OrbitFlow } from '../motifs/orbitFlow.js';

document.addEventListener('DOMContentLoaded', () => {
  // 1. Audio Waveform Field (Hero)
  const heroContainer = document.createElement('div');
  heroContainer.id = 'three-hero-container';
  heroContainer.style.position = 'absolute';
  heroContainer.style.bottom = '0';
  heroContainer.style.left = '0';
  heroContainer.style.width = '100%';
  heroContainer.style.height = '200px';
  heroContainer.style.zIndex = '0';
  heroContainer.style.pointerEvents = 'none';
  
  const heroSection = document.querySelector('.site-shell > header').nextElementSibling; // main -> section
  if (heroSection) {
    heroSection.style.position = 'relative';
    heroSection.appendChild(heroContainer);
    
    const heroScene = new SceneManager('three-hero-container');
    window.addEventListener('beforeunload', () => heroScene.dispose());
    if (heroScene.active) {
      // Move camera closer so it fits
      heroScene.camera.position.z = 6;
      heroScene.camera.position.y = 2;
      heroScene.camera.lookAt(0, 0, 0);

      const waveField = new AudioWaveField(heroScene.scene, {
        count: 80,
        width: 30
      });
      
      heroScene.onUpdate = (delta, elapsed) => {
        waveField.update(elapsed);
      };
      
      // Add GSAP ScrollTrigger to increase amplitude on scroll
      if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
        gsap.to(heroScene.camera.position, {
          y: -2,
          ease: "none",
          scrollTrigger: {
            trigger: heroSection,
            start: "top top",
            end: "bottom top",
            scrub: true
          }
        });
      }
    }
  }

  // 2. Capabilities Orbit Flow
  const capSection = document.getElementById('capabilities');
  if (capSection) {
    const carouselStage = capSection.querySelector('.carousel-stage');
    if (carouselStage) {
      // Create a container for the orbit flow
      const flowContainer = document.createElement('div');
      flowContainer.id = 'three-capabilities-container';
      flowContainer.style.position = 'absolute';
      flowContainer.style.top = '0';
      flowContainer.style.left = '0';
      flowContainer.style.width = '100%';
      flowContainer.style.height = '100%';
      flowContainer.style.zIndex = '0';
      flowContainer.style.pointerEvents = 'none'; // let clicks pass through to HTML cards if needed
      
      carouselStage.style.position = 'relative';
      carouselStage.insertBefore(flowContainer, carouselStage.firstChild);
      
      window.CAROUSEL_3D_MODE = true;
      const capScene = new SceneManager('three-capabilities-container');
      window.addEventListener('beforeunload', () => capScene.dispose());
      if (capScene.active) {
        capScene.camera.position.z = 8;
        capScene.camera.position.y = 1;
        capScene.camera.lookAt(0, 0, 0);
        
        const orbitFlow = new OrbitFlow(capScene.scene, {
          nodes: 6,
          radius: 4,
          direction: 'out'
        });
        
        // Sync the HTML cards with the 3D nodes
        const cards = Array.from(carouselStage.querySelectorAll('.carousel-card'));
        
        capScene.onUpdate = (delta, elapsed) => {
          const activeIndex = cards.findIndex(c => c.classList.contains('active'));
          if (activeIndex > -1) {
            // Target rotation focuses the active node towards the camera
            orbitFlow.targetRotationY = -(activeIndex / 6) * Math.PI * 2;
          }
          orbitFlow.update(elapsed);
          
          // Project 3D nodes to 2D
          const positions = orbitFlow.getProjectedNodePositions(capScene.camera, capScene.renderer);
          
          cards.forEach((card, i) => {
            if (positions[i] && positions[i].z < 1) { // z < 1 means in front of camera
              // Smoothly transition HTML to follow the 3D node
              const x = positions[i].x - (card.clientWidth / 2);
              const y = positions[i].y - (card.clientHeight / 2);
              card.style.transform = `translate(${x}px, ${y}px)`;
              card.style.position = 'absolute';
              card.style.top = '0';
              card.style.left = '0';
              card.style.margin = '0';
              card.style.opacity = '1';
              card.style.zIndex = '10';
              card.style.transition = 'none';
            }
          });
        };
        
        // Hide the default carousel track styles so absolute positioning takes over
        const track = document.getElementById('carousel-track');
        if (track) {
          track.style.display = 'block';
          track.style.transform = 'none';
        }
        
        // GSAP entrance animation
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
          gsap.from(orbitFlow.group.scale, {
            x: 0, y: 0, z: 0,
            duration: 1.5,
            ease: "power3.out",
            scrollTrigger: {
              trigger: capSection,
              start: "top 70%",
            }
          });
          
          gsap.from(orbitFlow.group.rotation, {
            y: Math.PI,
            duration: 2,
            ease: "power3.out",
            scrollTrigger: {
              trigger: capSection,
              start: "top 70%",
            }
          });
        }
      }
    }
  }
});







