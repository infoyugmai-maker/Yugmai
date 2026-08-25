/**
 * Orbit Flow Motif — YUGM AI
 * Center object with flowing particles along curved tubes.
 */
import { colors } from '../core/colorTokens.js';

export class OrbitFlow {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.nodesCount = options.nodes || 6;
    this.radius = options.radius || 4;
    this.flowDirection = options.direction || 'out'; // 'out' or 'in'
    
    this.group = new THREE.Group();
    if (options.position) {
      this.group.position.copy(options.position);
    }
    
    // 1. Center Object (Faceted Icosahedron)
    const centerGeo = new THREE.IcosahedronGeometry(0.8, 0);
    const centerMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colors.deepNight),
      emissive: new THREE.Color(colors.royalPurple),
      emissiveIntensity: 0.5,
      roughness: 0.1,
      metalness: 0.8,
      transmission: 0.5, // glass like
      thickness: 0.5
    });
    this.centerMesh = new THREE.Mesh(centerGeo, centerMat);
    this.group.add(this.centerMesh);
    
    // 2. Tubes & Particles
    this.tubes = [];
    this.particleMaterial = new THREE.MeshBasicMaterial({
      color: new THREE.Color(colors.white),
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending
    });
    
    // Node positions
    this.nodePositions = [];
    
    const tubeMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colors.lavenderGlow),
      transparent: true,
      opacity: 0.15,
      roughness: 0.4,
      transmission: 0.9
    });

    for (let i = 0; i < this.nodesCount; i++) {
      const angle = (i / this.nodesCount) * Math.PI * 2;
      const x = Math.cos(angle) * this.radius;
      const z = Math.sin(angle) * this.radius;
      // Add a bit of varying height
      const y = Math.sin(i * 1.5) * 0.5;
      
      const nodePos = new THREE.Vector3(x, y, z);
      this.nodePositions.push(nodePos);
      
      // Create curve (bowed upwards slightly)
      const midPoint = new THREE.Vector3(x/2, y/2 + 1.5, z/2);
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(0, 0, 0), // center
        midPoint,
        nodePos
      ]);
      
      const tubeGeo = new THREE.TubeGeometry(curve, 32, 0.03, 8, false);
      const tubeMesh = new THREE.Mesh(tubeGeo, tubeMat);
      this.group.add(tubeMesh);
      
      // Setup particles for this tube
      const particleCount = 4;
      const particleGroup = new THREE.Group();
      
      for(let p = 0; p < particleCount; p++) {
        const pGeo = new THREE.SphereGeometry(0.06, 8, 8);
        const pMesh = new THREE.Mesh(pGeo, this.particleMaterial);
        // Store the random offset
        pMesh.userData = { t: p / particleCount + Math.random() * 0.1 };
        particleGroup.add(pMesh);
      }
      
      this.tubes.push({
        curve: curve,
        mesh: tubeMesh,
        particles: particleGroup
      });
      
      this.group.add(particleGroup);
      
      // Add a visual node end
      const nodeGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.05, 16);
      const nodeMesh = new THREE.Mesh(nodeGeo, centerMat.clone());
      nodeMesh.material.emissiveIntensity = 0.2;
      nodeMesh.position.copy(nodePos);
      nodeMesh.lookAt(0,0,0);
      nodeMesh.rotateX(Math.PI / 2);
      this.group.add(nodeMesh);
    }
    
    this.scene.add(this.group);
  }

  update(time) {
    if (!this.group) return;
    
    // Slow rotation of the whole group
    if (this.targetRotationY !== undefined) {
      this.group.rotation.y += (this.targetRotationY - this.group.rotation.y) * 0.05;
    } else {
      this.group.rotation.y = time * 0.05;
    }
    
    // Spin center
    this.centerMesh.rotation.x = time * 0.2;
    this.centerMesh.rotation.y = time * 0.3;
    
    // Move particles
    this.tubes.forEach(tube => {
      const curve = tube.curve;
      tube.particles.children.forEach(p => {
        let t = p.userData.t;
        // Advance time
        if (this.flowDirection === 'out') {
          t += 0.005;
          if (t > 1) t = 0;
        } else {
          t -= 0.005;
          if (t < 0) t = 1;
        }
        p.userData.t = t;
        
        // Get position on curve
        const pos = curve.getPointAt(t);
        p.position.copy(pos);
      });
    });
  }

  // Helper to project 3D node positions to 2D screen space for HTML overlays
  getProjectedNodePositions(camera, renderer) {
    const positions = [];
    const widthHalf = renderer.domElement.clientWidth / 2;
    const heightHalf = renderer.domElement.clientHeight / 2;
    
    for (let i = 0; i < this.nodePositions.length; i++) {
      const pos = this.nodePositions[i].clone();
      // Apply group transformations
      pos.applyMatrix4(this.group.matrixWorld);
      
      pos.project(camera);
      
      positions.push({
        x: ( pos.x * widthHalf ) + widthHalf,
        y: - ( pos.y * heightHalf ) + heightHalf,
        z: pos.z // to check if behind camera
      });
    }
    return positions;
  }
}

