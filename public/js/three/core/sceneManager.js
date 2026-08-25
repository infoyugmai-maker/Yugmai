/**
 * Scene Manager — YUGM AI
 * Creates/disposes a Three.js scene per page, handles shared renderer settings.
 * Relies on global `THREE` being available via CDN.
 */

import { colors } from './colorTokens.js';
import { getDeviceTier } from './deviceTier.js';

export class SceneManager {
  constructor(containerId) {
    this.tier = getDeviceTier();
    this.container = document.getElementById(containerId);
    
    if (this.tier === 'off' || !this.container) {
      console.log('[SceneManager] 3D disabled by tier or missing container.');
      this.active = false;
      return;
    }

    this.active = true;
    this.scene = new THREE.Scene();
    
    // Camera
    const aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 100);
    this.camera.position.z = 10;

    // Renderer
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: this.tier === 'high' });
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
    this.renderer.setPixelRatio(this.tier === 'high' ? Math.min(window.devicePixelRatio, 2) : 1);
    this.container.appendChild(this.renderer.domElement);

    // Standard Lighting Rig
    const ambientLight = new THREE.AmbientLight(colors.midnightIndigo, 0.4);
    this.scene.add(ambientLight);

    const keyLight = new THREE.DirectionalLight(colors.lavenderGlow, 1.2);
    keyLight.position.set(-5, 5, 2); // Upper-left rim lighting
    this.scene.add(keyLight);

    // Animation Loop
    this.clock = new THREE.Clock();
    this.renderLoop = this.renderLoop.bind(this);
    this.rafId = requestAnimationFrame(this.renderLoop);

    // Window Resize
    this.onResize = this.onResize.bind(this);
    window.addEventListener('resize', this.onResize);
  }

  onResize() {
    if (!this.active) return;
    this.camera.aspect = this.container.clientWidth / this.container.clientHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(this.container.clientWidth, this.container.clientHeight);
  }

  renderLoop() {
    if (!this.active) return;
    this.rafId = requestAnimationFrame(this.renderLoop);
    // Hook for specific scene updates
    if (this.onUpdate) this.onUpdate(this.clock.getDelta(), this.clock.getElapsedTime());
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    if (!this.active) return;
    window.removeEventListener('resize', this.onResize);
    cancelAnimationFrame(this.rafId);
    
    // Dispose WebGL resources
    this.scene.traverse((object) => {
      if (object.geometry) object.geometry.dispose();
      if (object.material) {
        if (Array.isArray(object.material)) {
          object.material.forEach(m => m.dispose());
        } else {
          object.material.dispose();
        }
      }
    });
    
    this.renderer.dispose();
    if (this.container.contains(this.renderer.domElement)) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
