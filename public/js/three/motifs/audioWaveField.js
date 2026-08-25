/**
 * Audio Waveform Field — YUGM AI
 * A 3D bar field that reacts like a live audio waveform.
 */
import { colors } from '../core/colorTokens.js';

export class AudioWaveField {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.barCount = options.count || 64;
    this.width = options.width || 20;
    
    // Create an InstancedMesh for performance
    const geometry = new THREE.BoxGeometry(this.width / this.barCount, 1, 0.2);
    // Move origin to bottom of the box so it scales upward
    geometry.translate(0, 0.5, 0); 

    const material = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color(colors.royalPurple),
      emissive: new THREE.Color(colors.lavenderGlow),
      emissiveIntensity: 0.2,
      roughness: 0.2,
      metalness: 0.1,
      transparent: true,
      opacity: 0.9,
    });

    this.instancedMesh = new THREE.InstancedMesh(geometry, material, this.barCount);
    
    // Position the bars in a line
    this.dummy = new THREE.Object3D();
    this.timeOffsets = [];
    
    for (let i = 0; i < this.barCount; i++) {
      const x = (i / this.barCount) * this.width - (this.width / 2);
      this.dummy.position.set(x, 0, 0);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
      
      // Random phase offset for the fake amplitude
      this.timeOffsets.push(i * 0.2 + Math.random() * 0.5);
    }
    
    this.instancedMesh.instanceMatrix.needsUpdate = true;
    
    if (options.position) {
      this.instancedMesh.position.copy(options.position);
    }
    
    this.scene.add(this.instancedMesh);
  }

  update(time) {
    if (!this.instancedMesh) return;
    
    // Update the scale of each bar to simulate audio waveform
    for (let i = 0; i < this.barCount; i++) {
      const x = (i / this.barCount) * this.width - (this.width / 2);
      this.dummy.position.set(x, 0, 0);
      
      // Combine multiple sine waves for a complex "audio" look
      const t = time * 2;
      const offset = this.timeOffsets[i];
      
      // Base wave
      let scaleY = Math.sin(t + offset) * 0.5 + 0.5;
      // High frequency noise
      scaleY += (Math.sin(t * 3.4 + offset * 2.1) * 0.3);
      // Envelope to make edges taper off (bell curve)
      const distFromCenter = Math.abs(x) / (this.width / 2);
      const envelope = 1 - Math.pow(distFromCenter, 2); 
      
      scaleY = Math.max(0.05, scaleY * envelope * 2); // min height 0.05, max ~2
      
      this.dummy.scale.set(1, scaleY, 1);
      this.dummy.updateMatrix();
      this.instancedMesh.setMatrixAt(i, this.dummy.matrix);
    }
    
    this.instancedMesh.instanceMatrix.needsUpdate = true;
  }
  
  dispose() {
    this.scene.remove(this.instancedMesh);
    this.instancedMesh.geometry.dispose();
    this.instancedMesh.material.dispose();
  }
}
