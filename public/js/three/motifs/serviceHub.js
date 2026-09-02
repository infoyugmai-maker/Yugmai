import { colors } from '../core/colorTokens.js';

export class ServiceHub {
  constructor(scene, options = {}) {
    this.group = new THREE.Group();
    this.group.position.copy(options.position || new THREE.Vector3(0, 0, 0));
    
    // 1. Central "YUGM AI" Hub (The Logo in a Circle)
    const hubGroup = new THREE.Group();
    
    // Create the circular 3D coin for the logo
    const textureLoader = new THREE.TextureLoader();
    const logoTexture = textureLoader.load('logo.png');
    logoTexture.anisotropy = 16;
    
    const coinGeo = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 64);
    const sideMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 1.0 });
    const faceMat = new THREE.MeshStandardMaterial({ map: logoTexture, emissive: colors.white, emissiveIntensity: 0.1 });
    
    this.logoCoin = new THREE.Mesh(coinGeo, [sideMat, faceMat, faceMat]);
    this.logoCoin.rotation.x = Math.PI / 2; // Face forward
    hubGroup.add(this.logoCoin);
    
    // Add a glowing halo behind the logo
    const haloGeo = new THREE.SphereGeometry(1.0, 32, 32);
    const haloMat = new THREE.MeshBasicMaterial({
      color: colors.lavenderGlow,
      transparent: true,
      opacity: 0.2,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    this.halo = new THREE.Mesh(haloGeo, haloMat);
    hubGroup.add(this.halo);

    this.group.add(hubGroup);

    // 2. The Globe (Connecting the whole world)
    const globeRadius = 4.5;
    const globeGeo = new THREE.SphereGeometry(globeRadius, 32, 32);
    const globeMat = new THREE.MeshBasicMaterial({
      color: colors.royalPurple,
      transparent: true,
      opacity: 0.15,
      wireframe: true
    });
    this.globe = new THREE.Mesh(globeGeo, globeMat);
    this.group.add(this.globe);

    // 3. Small lines going to all over the world
    this.connections = [];
    const numConnections = 30; // 30 points across the globe
    const lineMat = new THREE.LineBasicMaterial({
      color: colors.lavenderGlow,
      transparent: true,
      opacity: 0.3,
      linewidth: 1
    });

    for (let i = 0; i < numConnections; i++) {
      // Calculate a random point on the sphere surface
      const phi = Math.acos(-1 + (2 * i) / numConnections);
      const theta = Math.sqrt(numConnections * Math.PI) * phi;
      
      const targetPos = new THREE.Vector3(
        globeRadius * Math.cos(theta) * Math.sin(phi),
        globeRadius * Math.sin(theta) * Math.sin(phi),
        globeRadius * Math.cos(phi)
      );

      // We only want points that are generally facing the front/sides so lines don't clip through the center ugly
      // But for a wireframe globe, full 3D is fine.
      
      // Connection Line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0,0,0), targetPos]);
      const line = new THREE.Line(lineGeo, lineMat);
      this.group.add(line);
      
      // Moving Data Packet
      const packetGeo = new THREE.SphereGeometry(0.05, 8, 8);
      const packetMat = new THREE.MeshBasicMaterial({ color: colors.lavenderGlow });
      const packet = new THREE.Mesh(packetGeo, packetMat);
      this.group.add(packet);
      
      this.connections.push({
        line: line,
        packet: packet,
        targetPos: targetPos,
        timeOffset: Math.random() * 5.0, // Random start time
        speed: 0.2 + Math.random() * 0.3  // Random speed
      });
      
      // Add a small node at the destination
      const nodeGeo = new THREE.SphereGeometry(0.1, 8, 8);
      const nodeMat = new THREE.MeshBasicMaterial({ color: colors.white, transparent: true, opacity: 0.8 });
      const node = new THREE.Mesh(nodeGeo, nodeMat);
      node.position.copy(targetPos);
      this.globe.add(node); // Attach nodes to the globe so they rotate with it!
    }

    // Floating ambient particles (Stardust)
    const particleGeo = new THREE.BufferGeometry();
    const particleCount = 150;
    const posArray = new Float32Array(particleCount * 3);
    for(let i = 0; i < particleCount * 3; i++) {
      posArray[i] = (Math.random() - 0.5) * 12;
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(posArray, 3));
    const particleMat = new THREE.PointsMaterial({
      size: 0.04,
      color: colors.lavenderGlow,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending
    });
    this.particles = new THREE.Points(particleGeo, particleMat);
    this.group.add(this.particles);

    // Lighting
    const ambientLight = new THREE.AmbientLight(colors.white, 0.8);
    this.group.add(ambientLight);
    
    const dirLight = new THREE.DirectionalLight(colors.white, 1.5);
    dirLight.position.set(5, 5, 5);
    this.group.add(dirLight);

    scene.add(this.group);
  }

  update(elapsed) {
    // Pulse the central logo
    const scale = 1 + Math.sin(elapsed * 2) * 0.03;
    this.logoCoin.scale.set(scale, scale, scale);
    this.halo.scale.setScalar(scale + Math.sin(elapsed * 3) * 0.02);
    
    // Very gentle float of the central hub
    this.logoCoin.position.y = Math.sin(elapsed) * 0.1;

    // Slowly rotate the entire globe
    this.globe.rotation.y = elapsed * 0.15;
    this.globe.rotation.x = elapsed * 0.05;

    // Animate data packets shooting to all over the world
    this.connections.forEach(conn => {
      // Rotate the target position manually to match the globe's rotation so the line stays connected
      const currentTarget = conn.targetPos.clone();
      currentTarget.applyEuler(this.globe.rotation);
      
      // Update line
      const positions = conn.line.geometry.attributes.position.array;
      positions[3] = currentTarget.x;
      positions[4] = currentTarget.y;
      positions[5] = currentTarget.z;
      // Keep center tracking the gentle float of the logo
      positions[1] = this.logoCoin.position.y;
      conn.line.geometry.attributes.position.needsUpdate = true;

      // Animate packet along the line
      // t loops from 0 to 1 repeatedly
      const t = ((elapsed * conn.speed) + conn.timeOffset) % 1.0;
      
      // Add an easing effect so packets shoot out fast and slow down as they reach the edge
      const easeT = 1 - Math.pow(1 - t, 3);
      
      conn.packet.position.lerpVectors(new THREE.Vector3(0, this.logoCoin.position.y, 0), currentTarget, easeT);
      
      // Fade out the packet as it reaches the destination
      if (t > 0.8) {
        conn.packet.material.opacity = (1.0 - t) * 5.0; // 5.0 = 1 / 0.2
        conn.packet.material.transparent = true;
      } else {
        conn.packet.material.opacity = 1.0;
      }
    });

    // Rotate the particle cloud
    this.particles.rotation.y = elapsed * 0.05;
    
    // Gentle drift of the entire scene
    this.group.rotation.y = Math.sin(elapsed * 0.1) * 0.05;
  }
}

