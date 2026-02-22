// ParticleVisualizer.tsx
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Props {
  analyserNode?: AnalyserNode | null;
  isSpeaking: boolean;
  height?: number;
  onEnergyChange?: (energy: number) => void;
}

function fade(t: number) {
  return t * t * t * (t * (t * 6 - 15) + 10);
}
function lerp(t: number, a: number, b: number) {
  return a + t * (b - a);
}
function grad(hash: number, x: number, y: number, z: number) {
  const h = hash & 15;
  const u = h < 8 ? x : y;
  const v = h < 4 ? y : h === 12 || h === 14 ? x : z;
  return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
}

const perm = (() => {
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [p[i], p[j]] = [p[j], p[i]];
  }
  const out = new Array<number>(512);
  for (let i = 0; i < 512; i++) out[i] = p[i & 255];
  return out;
})();

function noise3D(x: number, y: number, z: number): number {
  const X = Math.floor(x) & 255,
    Y = Math.floor(y) & 255,
    Z = Math.floor(z) & 255;
  x -= Math.floor(x);
  y -= Math.floor(y);
  z -= Math.floor(z);
  const u = fade(x),
    v = fade(y),
    w = fade(z);
  const A = perm[X] + Y,
    AA = perm[A] + Z,
    AB = perm[A + 1] + Z;
  const B = perm[X + 1] + Y,
    BA = perm[B] + Z,
    BB = perm[B + 1] + Z;
  return lerp(
    w,
    lerp(
      v,
      lerp(u, grad(perm[AA], x, y, z), grad(perm[BA], x - 1, y, z)),
      lerp(u, grad(perm[AB], x, y - 1, z), grad(perm[BB], x - 1, y - 1, z))
    ),
    lerp(
      v,
      lerp(u, grad(perm[AA + 1], x, y, z - 1), grad(perm[BA + 1], x - 1, y, z - 1)),
      lerp(u, grad(perm[AB + 1], x, y - 1, z - 1), grad(perm[BB + 1], x - 1, y - 1, z - 1))
    )
  );
}

const PARTICLE_COUNT = 8000;
const SPHERE_RADIUS = 1.0;
const MIN_ACTIVE_RADIUS = SPHERE_RADIUS * 0.24;
const MAX_ACTIVE_RADIUS = SPHERE_RADIUS * 0.78;
const CENTER_DEAD_ZONE = 0.24;

export default function ParticleVisualizer({
  analyserNode = null,
  isSpeaking,
  height = 285,
  onEnergyChange,
}: Props) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const analyserNodeRef = useRef(analyserNode);
  const isSpeakingRef = useRef(isSpeaking);
  const onEnergyChangeRef = useRef(onEnergyChange);

  useEffect(() => {
    analyserNodeRef.current = analyserNode;
  }, [analyserNode]);

  useEffect(() => {
    isSpeakingRef.current = isSpeaking;
  }, [isSpeaking]);

  useEffect(() => {
    onEnergyChangeRef.current = onEnergyChange;
  }, [onEnergyChange]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const w = mount.clientWidth || 400;
    const h = mount.clientHeight || height;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    mount.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.1, 100);
    camera.position.z = 2.8;

    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    const basePositions = new Float32Array(PARTICLE_COUNT * 3);
    const velocities = new Float32Array(PARTICLE_COUNT * 3);
    const lifetimes = new Float32Array(PARTICLE_COUNT);
    const maxLifetimes = new Float32Array(PARTICLE_COUNT);
    const orbitPhase = new Float32Array(PARTICLE_COUNT);
    const orbitRadius = new Float32Array(PARTICLE_COUNT);

    const colorA = new THREE.Color('#ffffff');
    const colorB = new THREE.Color('#a0c4ff');

    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const r = Math.cbrt(Math.random()) * SPHERE_RADIUS * 0.3;
      const x = r * Math.sin(phi) * Math.cos(theta);
      const y = r * Math.sin(phi) * Math.sin(theta);
      const z = r * Math.cos(phi);

      positions[i3] = basePositions[i3] = x;
      positions[i3 + 1] = basePositions[i3 + 1] = y;
      positions[i3 + 2] = basePositions[i3 + 2] = z;

      const t = i / PARTICLE_COUNT;
      colors[i3] = colorA.r * (1 - t) + colorB.r * t;
      colors[i3 + 1] = colorA.g * (1 - t) + colorB.g * t;
      colors[i3 + 2] = colorA.b * (1 - t) + colorB.b * t;

      const lt = Math.random() * 3;
      lifetimes[i] = lt;
      maxLifetimes[i] = lt;

      orbitPhase[i] = (i / PARTICLE_COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.08;
      orbitRadius[i] = CENTER_DEAD_ZONE + 0.12 + Math.random() * 0.2;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const material = new THREE.PointsMaterial({
      size: 0.004,
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    const particles = new THREE.Points(geometry, material);
    scene.add(particles);

    let animId = 0;
    let lastTime = 0;
    let energySmooth = 0;
    let silenceDriveSmooth = 1;
    let radiusDriveSmooth = 0.35;
    let noiseScale = 1.5;

    function animate(now: number) {
      animId = requestAnimationFrame(animate);

      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      const t = now * 0.001;

      let energy = 0;
      const currentAnalyser = analyserNodeRef.current;
      if (currentAnalyser) {
        const freqData = new Uint8Array(currentAnalyser.frequencyBinCount);
        currentAnalyser.getByteFrequencyData(freqData);
        const sampleRate = currentAnalyser.context.sampleRate;
        const fftSize = currentAnalyser.fftSize;
        let sum = 0;

        const binStart = Math.floor(300 / (sampleRate / fftSize));
        const binEnd = Math.floor(3000 / (sampleRate / fftSize));

        for (let i = binStart; i < binEnd; i++) sum += freqData[i];
        energy = sum / ((binEnd - binStart) * 255);
      }

      const energyFollow = energy > 0.01 ? 0.12 : 0.3;
      energySmooth += (energy - energySmooth) * energyFollow;
      onEnergyChangeRef.current?.(energySmooth);

      const speakingSignal = isSpeakingRef.current ? 1 : 0;
      const quietMode = speakingSignal < 0.5;

      // quiet-mode ramps up when NOT speaking
      silenceDriveSmooth += ((1 - speakingSignal) - silenceDriveSmooth) * 0.06;
      const silenceDrive = THREE.MathUtils.clamp(silenceDriveSmooth, 0, 1);

      // Tighter radius in silence so it "surrounds" the logo more closely
      const targetRadiusDrive =
        speakingSignal > 0.5 ? THREE.MathUtils.clamp(energySmooth * 2.2, 0, 1) : 0.22;

      radiusDriveSmooth += (targetRadiusDrive - radiusDriveSmooth) * 0.08;
      const activeRadius = THREE.MathUtils.lerp(MIN_ACTIVE_RADIUS, MAX_ACTIVE_RADIUS, radiusDriveSmooth);

      // Calm + ringy when quiet, lively when speaking
      noiseScale = THREE.MathUtils.lerp(
        noiseScale,
        speakingSignal > 0.5 ? 1.5 + energySmooth * 8 : 1.35,
        0.08
      );

      const turbulence = speakingSignal > 0.5 ? 0.004 + energySmooth * 0.04 : 0.0012;
      const speed = speakingSignal > 0.5 ? 0.06 + energySmooth * 0.35 : 0.02;

      const orbitStrength = 0.0065 * silenceDrive;
      const orbitRingRadius = CENTER_DEAD_ZONE + (activeRadius - CENTER_DEAD_ZONE) * 0.5;

      const radialRestore = 0.018 * silenceDrive;
      const zFlatten = 0.03 * silenceDrive;

      const velocityDamping = speakingSignal > 0.5 ? 0.97 : 0.90;
      const orbitAngularSpeed = speakingSignal > 0.5 ? 0.65 + energySmooth * 0.9 : 0.35;

      for (let i = 0; i < PARTICLE_COUNT; i++) {
        const i3 = i * 3;
        let x = positions[i3],
          y = positions[i3 + 1],
          z = positions[i3 + 2];
        let vx = velocities[i3],
          vy = velocities[i3 + 1],
          vz = velocities[i3 + 2];
        let lt = lifetimes[i];

        if (quietMode) {
          // Return to the original page-load position when muted / not speaking.
          const homeX = basePositions[i3];
          const homeY = basePositions[i3 + 1];
          const homeZ = basePositions[i3 + 2];

          vx += (homeX - x) * 0.03;
          vy += (homeY - y) * 0.03;
          vz += (homeZ - z) * 0.03;

          x += vx;
          y += vy;
          z += vz;

          vx *= 0.92;
          vy *= 0.92;
          vz *= 0.92;

          const homeError = Math.abs(homeX - x) + Math.abs(homeY - y) + Math.abs(homeZ - z);
          if (homeError < 0.0006) {
            x = homeX;
            y = homeY;
            z = homeZ;
            vx = 0;
            vy = 0;
            vz = 0;
          }

          positions[i3] = x;
          positions[i3 + 1] = y;
          positions[i3 + 2] = z;
          velocities[i3] = vx;
          velocities[i3 + 1] = vy;
          velocities[i3 + 2] = vz;
          lifetimes[i] = lt;
          continue;
        }

        lt -= dt;

        const ns = noiseScale;
        const nx = noise3D(x * ns + t * speed, y * ns, z * ns);
        const ny = noise3D(x * ns, y * ns + t * speed, z * ns);
        const nz = noise3D(x * ns, y * ns, z * ns + t * speed);

        vx += nx * turbulence;
        vy += ny * turbulence;
        vz += nz * turbulence;

        // Quiet: guide to rotating orbit slot for full 360 ring
        const radialXY = Math.sqrt(x * x + y * y) || 0.0001;
        const targetTheta = orbitPhase[i] + t * orbitAngularSpeed;
        const targetR = THREE.MathUtils.clamp(orbitRadius[i], CENTER_DEAD_ZONE + 0.02, orbitRingRadius + 0.18);
        const targetX = Math.cos(targetTheta) * targetR;
        const targetY = Math.sin(targetTheta) * targetR;

        vx += (targetX - x) * orbitStrength * 0.9;
        vy += (targetY - y) * orbitStrength * 0.9;

        // little tangential push keeps it flowing smoothly
        const tx = -y / radialXY;
        const ty = x / radialXY;
        vx += tx * orbitStrength * 0.55;
        vy += ty * orbitStrength * 0.55;

        // pull toward ring radius + flatten Z for a halo look
        const radialError = orbitRingRadius - radialXY;
        vx += (x / radialXY) * radialError * radialRestore;
        vy += (y / radialXY) * radialError * radialRestore;
        vz += -z * zFlatten;

        x += vx;
        y += vy;
        z += vz;
        vx *= velocityDamping;
        vy *= velocityDamping;
        vz *= velocityDamping;

        // Center dead zone — repel away from logo core
        const centerDistXY = Math.sqrt(x * x + y * y);
        if (centerDistXY < CENTER_DEAD_ZONE) {
          const safe = centerDistXY || 0.0001;
          const repel = (CENTER_DEAD_ZONE - safe) * 0.24;
          x += (x / safe) * repel;
          y += (y / safe) * repel;
          vx *= 0.92;
          vy *= 0.92;
        }

        // Constrain to active sphere
        const dist = Math.sqrt(x * x + y * y + z * z);
        if (dist > activeRadius) {
          const pull = (dist - activeRadius) * 0.12;
          x -= (x / dist) * pull;
          y -= (y / dist) * pull;
          z -= (z / dist) * pull;
          vx *= 0.88;
          vy *= 0.88;
          vz *= 0.88;
        }

        // Respawn dead particles
        if (lt <= 0) {
          const theta = Math.random() * Math.PI * 2;
          const radial = CENTER_DEAD_ZONE + Math.random() * Math.max(activeRadius - CENTER_DEAD_ZONE, 0.02);

          x = radial * Math.cos(theta);
          y = radial * Math.sin(theta);

          const zSpan = Math.sqrt(Math.max(activeRadius * activeRadius - radial * radial, 0));
          z = (Math.random() * 2 - 1) * zSpan;

          vx = vy = vz = 0;
          lt = 2 + Math.random() * 3;
          maxLifetimes[i] = lt;

          orbitPhase[i] = theta + (Math.random() - 0.5) * 0.2;
          orbitRadius[i] = THREE.MathUtils.clamp(radial, CENTER_DEAD_ZONE + 0.03, MAX_ACTIVE_RADIUS - 0.03);
        }

        const finalDistXY = Math.sqrt(x * x + y * y);
        if (finalDistXY < CENTER_DEAD_ZONE) {
          const safe = finalDistXY || 0.0001;
          const scale = CENTER_DEAD_ZONE / safe;
          x *= scale;
          y *= scale;
        }

        positions[i3] = x;
        positions[i3 + 1] = y;
        positions[i3 + 2] = z;

        velocities[i3] = vx;
        velocities[i3 + 1] = vy;
        velocities[i3 + 2] = vz;

        lifetimes[i] = lt;
      }

      geometry.attributes.position.needsUpdate = true;
      particles.rotation.y += 0.0002 + energySmooth * 0.018;
      particles.rotation.x += energySmooth * 0.005;

      material.opacity = 0.55 + energySmooth * 0.45;

      renderer.render(scene, camera);
    }

    animate(0);

    const ro = new ResizeObserver(() => {
      if (!mount) return;
      const nw = mount.clientWidth;
      const nh = mount.clientHeight;
      renderer.setSize(nw, nh);
      camera.aspect = nw / nh;
      camera.updateProjectionMatrix();
    });
    ro.observe(mount);

    return () => {
      cancelAnimationFrame(animId);
      ro.disconnect();
      renderer.dispose();
      geometry.dispose();
      material.dispose();
      onEnergyChangeRef.current?.(0);
      mount.removeChild(renderer.domElement);
    };
  }, [height]);

  return (
    <div
      ref={mountRef}
      style={{
        width: '100%',
        height: '100%',
        display: 'block',
        overflow: 'hidden',
      }}
    />
  );
}
