/**
 * Data Globe Motif — YUGM AI
 * A rotating wireframe globe with pulsing pins.
 */
import { colors } from '../core/colorTokens.js';

export class DataGlobe {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.radius = options.radius || 3;
    
    this.group = new THREE.Group();
    if (options.position) {
      this.group.position.copy(options.position);
    }

    // Globe Sphere
    const sphereGeo = new THREE.SphereGeometry(this.radius, 32, 32);
    // Wireframe looks "data" heavy and clean
    const sphereMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors.royalPurple),
      wireframe: true,
      transparent: true,
      opacity: 0.2
    });
    this.globe = new THREE.Mesh(sphereGeo, sphereMat);
    this.group.add(this.globe);
    
    // Add inner solid sphere for depth occlusion
    const solidMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colors.deepNight),
      roughness: 0.9,
      metalness: 0.1
    });
    const solidGlobe = new THREE.Mesh(
      new THREE.SphereGeometry(this.radius - 0.05, 32, 32),
      solidMat
    );
    this.group.add(solidGlobe);

    // Delhi Pin (Approx: Lat 28.6139, Lon 77.2090)
    this.pins = [];
    this.addPin(28.6139, 77.2090, colors.lavenderGlow, true);

    this.scene.add(this.group);
  }

  addPin(lat, lon, colorHex, isPulse = false) {
    // Convert Lat/Lon to Vector3
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);

    const x = -(this.radius * Math.sin(phi) * Math.cos(theta));
    const z = (this.radius * Math.sin(phi) * Math.sin(theta));
    const y = (this.radius * Math.cos(phi));

    const pos = new THREE.Vector3(x, y, z);

    const pinGeo = new THREE.SphereGeometry(0.08, 16, 16);
    const pinMat = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colorHex),
    });
    const pin = new THREE.Mesh(pinGeo, pinMat);
    pin.position.copy(pos);
    
    this.globe.add(pin); // attach to globe so it rotates with it

    if (isPulse) {
      // Create a glowing ring around it
      const ringGeo = new THREE.RingGeometry(0.1, 0.15, 32);
      const ringMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(colorHex),
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.copy(pos);
      ring.lookAt(0,0,0);
      
      this.globe.add(ring);
      this.pins.push({ mesh: ring, isPulse: true, timeOffset: Math.random() });
    }
  }

  update(elapsed) {
    if (!this.group) return;
    
    // Rotate the globe
    this.globe.rotation.y = elapsed * 0.1;
    
    // Pulse animation
    this.pins.forEach(pinObj => {
      if (pinObj.isPulse) {
        // Expand and fade out
        const t = (elapsed * 1.5 + pinObj.timeOffset) % 1; // 0 to 1
        const scale = 1 + t * 4;
        pinObj.mesh.scale.set(scale, scale, scale);
        pinObj.mesh.material.opacity = (1 - t) * 0.8;
      }
    });
  }
}
