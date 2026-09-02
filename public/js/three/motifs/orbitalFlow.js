import { colors } from '../core/colorTokens.js';

export class OrbitalFlow {
  constructor(scene, options = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(options.position || new THREE.Vector3(0, 0, 0));
    
    // 1. Central "AI" Core (The intelligence)
    const coreGroup = new THREE.Group();
    
    // MUCH SMALLER AI Core
    const coreGeometry = new THREE.SphereGeometry(0.25, 32, 32);
    const coreMaterial = new THREE.MeshPhysicalMaterial({
      color: colors.lavender,
      emissive: colors.royal,
      emissiveIntensity: 0.8,
      transparent: true,
      opacity: 0.9,
      roughness: 0.1,
      metalness: 0.8,
    });
    this.core = new THREE.Mesh(coreGeometry, coreMaterial);
    coreGroup.add(this.core);

    // Glowing halo around the core
    const haloGeo = new THREE.SphereGeometry(0.35, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: colors.lavender,
      transparent: true,
      opacity: 0.15,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide
    });
    this.halo = new THREE.Mesh(haloGeo, haloMat);
    coreGroup.add(this.halo);
    
    // Canvas Text "AI" inside the core
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 70px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('AI', 128, 64);
    
    const textTexture = new THREE.CanvasTexture(canvas);
    const textMaterial = new THREE.SpriteMaterial({ map: textTexture, transparent: true, depthTest: false });
    const textSprite = new THREE.Sprite(textMaterial);
    textSprite.scale.set(0.6, 0.3, 1);
    coreGroup.add(textSprite);

    this.group.add(coreGroup);

    // 2. ONE Orbit with YUGMAI Logo
    this.orbits = [];
    
    const orbitRadius = 1.0; // Even tighter orbit to avoid card overlap
    const orbitSpeed = 0.015;
    
    // Create Orbital Path (Ring)
    const ringGeo = new THREE.TorusGeometry(orbitRadius, 0.005, 16, 64);
    const ringMat = new THREE.MeshBasicMaterial({
      color: colors.mist,
      transparent: true,
      opacity: 0.3,
      side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 3; // Tilt the ring
    this.group.add(ring);
    
    // Create Satellite Group (rotates along the ring)
    const satGroup = new THREE.Group();
    satGroup.rotation.x = Math.PI / 3; 
    
    // Load YUGMAI Logo as Sprite
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('logo.png'); 
    
    const spriteMaterial = new THREE.SpriteMaterial({ map: logoTexture, color: 0xffffff, transparent: true });
    const logoSprite = new THREE.Sprite(spriteMaterial);
    logoSprite.scale.set(0.25, 0.25, 1); // Shrunk significantly
    logoSprite.position.set(orbitRadius, 0, 0); 
    
    // Add a small glow behind the logo
    const satGlowGeo = new THREE.SphereGeometry(0.2, 16, 16);
    const satGlowMat = new THREE.MeshBasicMaterial({
      color: colors.royal,
      transparent: true,
      opacity: 0.3,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const satGlow = new THREE.Mesh(satGlowGeo, satGlowMat);
    satGlow.position.set(orbitRadius, 0, -0.05);

    satGroup.add(logoSprite);
    satGroup.add(satGlow);
    this.group.add(satGroup);
    
    this.orbits.push({
      group: satGroup,
      speed: orbitSpeed
    });

    // Floating data particles (Stardust) - Tighter spread
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 40; 
    const posArray = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 4; // Tighter spread
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.02,
      color: colors.royalPurple,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(this.particles);

    // Ambient lighting
    const ambientLight = new THREE.AmbientLight(colors.white, 0.6);
    this.group.add(ambientLight);
    
    const pointLight = new THREE.PointLight(colors.royal, 2, 10);
    pointLight.position.set(0, 0, 0);
    this.group.add(pointLight);

    scene.add(this.group);
  }

  update(elapsed) {
    // Pulse the AI core
    const scale = 1 + Math.sin(elapsed * 2.5) * 0.03;
    this.core.scale.setScalar(scale);
    this.halo.scale.setScalar(scale + Math.sin(elapsed * 4) * 0.02);
    
    this.core.rotation.y = elapsed * 0.3;
    this.core.rotation.x = elapsed * 0.15;

    // Rotate the Yugmai logo along its orbit
    this.orbits.forEach(orbit => {
      orbit.group.rotation.z -= orbit.speed;
    });

    // Slowly rotate the particle cloud
    this.particles.rotation.y = elapsed * 0.05;
    this.particles.rotation.z = elapsed * 0.02;
    
    // Very slow ambient rotation of the whole system
    this.group.rotation.y = Math.sin(elapsed * 0.2) * 0.1;
  }
}

