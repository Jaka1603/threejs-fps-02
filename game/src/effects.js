// Transient visuals, all pooled: tracers, impact particles, muzzle
// flashes, thrown grenades, smoke clouds and the planted charge. Pools
// are allocated once; the update never creates objects mid-frame.
import * as THREE from 'three';
import { PALETTE } from './config.js';
import { groundAt } from './map.js';

const MAX_TRACERS = 48;
const MAX_PARTICLES = 360;
const MAX_GRENADES = 12;

export function createEffects(scene) {
  // Tracers: one stretched additive quad per shot, recycled round-robin.
  const tracerGeo = new THREE.BoxGeometry(0.022, 0.022, 1);
  const tracers = [];
  for (let i = 0; i < MAX_TRACERS; i += 1) {
    const mat = new THREE.MeshBasicMaterial({
      color: 0xffe6b0, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false,
    });
    const mesh = new THREE.Mesh(tracerGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    tracers.push({ mesh, mat, until: 0 });
  }
  let tracerCursor = 0;

  // Muzzle flash: a shared point light plus a small additive sprite per shot.
  const flashLight = new THREE.PointLight(0xffc873, 0, 13, 1.8);
  scene.add(flashLight);
  const flashTex = makeFlashTexture();
  const flashes = [];
  for (let i = 0; i < 12; i += 1) {
    const mat = new THREE.SpriteMaterial({ map: flashTex, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.set(0.72, 0.72, 1);
    sprite.visible = false;
    scene.add(sprite);
    flashes.push({ sprite, mat, until: 0 });
  }
  let flashCursor = 0;

  // Particles: a single Points cloud with per-particle velocity in JS arrays.
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAX_PARTICLES * 3);
  const pVel = new Float32Array(MAX_PARTICLES * 3);
  const pLife = new Float32Array(MAX_PARTICLES);
  const pGrav = new Float32Array(MAX_PARTICLES);
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  const pMat = new THREE.PointsMaterial({ color: 0xd8c9a8, size: 0.09, transparent: true, opacity: 0.9, depthWrite: false });
  const points = new THREE.Points(pGeo, pMat);
  points.frustumCulled = false;
  scene.add(points);
  let pCursor = 0;
  for (let i = 0; i < MAX_PARTICLES; i += 1) pPos[i * 3 + 1] = -50;

  // Grenades in flight and smoke clouds.
  const grenadeGeo = new THREE.SphereGeometry(0.09, 10, 8);
  const grenades = [];
  for (let i = 0; i < MAX_GRENADES; i += 1) {
    const mat = new THREE.MeshStandardMaterial({ color: 0x3c4148, roughness: 0.5, metalness: 0.4 });
    const mesh = new THREE.Mesh(grenadeGeo, mat);
    mesh.visible = false;
    scene.add(mesh);
    grenades.push({ mesh, active: false, kind: null, team: null, thrower: null, vel: new THREE.Vector3(), fuse: 0, x: 0, y: -50, z: 0 });
  }
  const smokeTex = makeSmokeTexture();
  const smokes = []; // { sprites: [], until, x, y, z, radius }

  // The charge: a small case with a blinking light, shown when carried (on the
  // carrier's back) and when planted.
  const bombGroup = new THREE.Group();
  const bombCase = new THREE.Mesh(
    new THREE.BoxGeometry(0.42, 0.16, 0.3),
    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.45, metalness: 0.5 }),
  );
  bombCase.castShadow = true;
  bombGroup.add(bombCase);
  const bombLightMat = new THREE.MeshBasicMaterial({ color: 0xff4030 });
  const bombLight = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.05, 0.07), bombLightMat);
  bombLight.position.set(0.1, 0.1, 0);
  bombGroup.add(bombLight);
  bombGroup.visible = false;
  scene.add(bombGroup);

  const up = new THREE.Vector3(0, 1, 0);
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();

  function makeFlashTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 64; canvas.height = 64;
    const g = canvas.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
    grad.addColorStop(0, 'rgba(255,240,200,1)');
    grad.addColorStop(0.4, 'rgba(255,180,80,0.75)');
    grad.addColorStop(1, 'rgba(255,140,40,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    // A four-point star over the core: a burst, not a round blob.
    g.fillStyle = 'rgba(255,232,185,0.85)';
    g.beginPath();
    g.moveTo(32, 1); g.lineTo(36.5, 27.5); g.lineTo(63, 32); g.lineTo(36.5, 36.5);
    g.lineTo(32, 63); g.lineTo(27.5, 36.5); g.lineTo(1, 32); g.lineTo(27.5, 27.5);
    g.closePath(); g.fill();
    return new THREE.CanvasTexture(canvas);
  }

  function makeSmokeTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const g = canvas.getContext('2d');
    for (let i = 0; i < 26; i += 1) {
      const x = 24 + Math.random() * 80;
      const y = 24 + Math.random() * 80;
      const r = 14 + Math.random() * 26;
      const grad = g.createRadialGradient(x, y, 1, x, y, r);
      grad.addColorStop(0, 'rgba(196,200,204,0.16)');
      grad.addColorStop(1, 'rgba(196,200,204,0)');
      g.fillStyle = grad;
      g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    return new THREE.CanvasTexture(canvas);
  }

  return {
    tracer(from, to, color, now) {
      const slot = tracers[tracerCursor];
      tracerCursor = (tracerCursor + 1) % MAX_TRACERS;
      mid.addVectors(from, to).multiplyScalar(0.5);
      dir.subVectors(to, from);
      const len = dir.length() || 0.001;
      slot.mesh.position.copy(mid);
      slot.mesh.scale.set(1, 1, len);
      slot.mesh.lookAt(to);
      slot.mat.color.setHex(color);
      slot.mat.opacity = 0.95;
      slot.mesh.visible = true;
      slot.until = now + 0.05;
    },
    muzzle(at, now) {
      const slot = flashes[flashCursor];
      flashCursor = (flashCursor + 1) % flashes.length;
      slot.sprite.position.copy(at);
      slot.mat.opacity = 0.95;
      slot.sprite.visible = true;
      slot.until = now + 0.045;
      flashLight.position.copy(at);
      flashLight.intensity = 14;
    },
    impact(at, normal, count, spread, now, color = 0xd8c9a8) {
      pMat.color.setHex(color);
      for (let n = 0; n < count; n += 1) {
        const i = pCursor;
        pCursor = (pCursor + 1) % MAX_PARTICLES;
        pPos[i * 3] = at.x; pPos[i * 3 + 1] = at.y; pPos[i * 3 + 2] = at.z;
        pVel[i * 3] = normal.x * spread + (Math.random() - 0.5) * 1.6;
        pVel[i * 3 + 1] = Math.abs(normal.y) * spread + Math.random() * 1.8;
        pVel[i * 3 + 2] = normal.z * spread + (Math.random() - 0.5) * 1.6;
        pLife[i] = 0.35 + Math.random() * 0.3;
        pGrav[i] = 5.5;
      }
    },
    throwGrenade(kind, from, vel, team, thrower) {
      const slot = grenades.find((g) => !g.active) || grenades[0];
      slot.active = true;
      slot.kind = kind;
      slot.team = team;
      slot.thrower = thrower;
      slot.x = from.x; slot.y = from.y; slot.z = from.z;
      slot.vel.copy(vel);
      slot.fuse = kind === 'smoke' ? 1.1 : 1.6;
      slot.mesh.material.color.setHex(kind === 'frag' ? 0x4a4238 : kind === 'flash' ? 0xb9c0c7 : 0x39505a);
      slot.mesh.visible = true;
      return slot;
    },
    spawnSmoke(x, y, z, radius, duration, now) {
      const sprites = [];
      for (let i = 0; i < 11; i += 1) {
        const mat = new THREE.SpriteMaterial({ map: smokeTex, color: 0xb4b8bc, transparent: true, opacity: 0, depthWrite: false });
        const sprite = new THREE.Sprite(mat);
        const angle = (i / 11) * Math.PI * 2;
        sprite.position.set(x + Math.cos(angle) * radius * 0.45, y + 0.8 + (i % 3) * 0.75, z + Math.sin(angle) * radius * 0.45);
        sprite.scale.set(radius * 1.5, radius * 1.5, 1);
        scene.add(sprite);
        sprites.push({ sprite, mat });
      }
      smokes.push({ sprites, until: now + duration, born: now, x, y, z, radius });
    },
    smokeAt(x, z, now) {
      for (const s of smokes) {
        if (now > s.until) continue;
        const dx = x - s.x;
        const dz = z - s.z;
        if (dx * dx + dz * dz < s.radius * s.radius) return true;
      }
      return false;
    },
    bombMesh: bombGroup,
    bombLightMat,
    // Steps every live effect. `onGrenadeDone(slot)` fires when a grenade's
    // fuse ends; the caller applies its gameplay effect.
    update(dt, now, onGrenadeDone) {
      for (const t of tracers) {
        if (t.mesh.visible && now > t.until) { t.mesh.visible = false; t.mat.opacity = 0; }
      }
      for (const f of flashes) {
        if (f.sprite.visible && now > f.until) { f.sprite.visible = false; f.mat.opacity = 0; }
      }
      if (flashLight.intensity > 0) flashLight.intensity = Math.max(0, flashLight.intensity - dt * 260);
      let anyParticle = false;
      for (let i = 0; i < MAX_PARTICLES; i += 1) {
        if (pLife[i] <= 0) continue;
        anyParticle = true;
        pLife[i] -= dt;
        pVel[i * 3 + 1] -= pGrav[i] * dt;
        pPos[i * 3] += pVel[i * 3] * dt;
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt;
        pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
        if (pLife[i] <= 0) pPos[i * 3 + 1] = -50;
      }
      if (anyParticle) pGeo.attributes.position.needsUpdate = true;
      for (const g of grenades) {
        if (!g.active) continue;
        g.fuse -= dt;
        g.vel.y -= 12.5 * dt;
        g.x += g.vel.x * dt;
        g.y += g.vel.y * dt;
        g.z += g.vel.z * dt;
        const floor = groundAt(g.x, g.z, g.y) + 0.09;
        if (g.y < floor) {
          g.y = floor;
          g.vel.y = Math.abs(g.vel.y) > 1.2 ? -g.vel.y * 0.38 : 0;
          g.vel.x *= 0.7; g.vel.z *= 0.7;
        }
        g.mesh.position.set(g.x, g.y, g.z);
        if (g.fuse <= 0) {
          g.active = false;
          g.mesh.visible = false;
          onGrenadeDone(g);
        }
      }
      for (let i = smokes.length - 1; i >= 0; i -= 1) {
        const s = smokes[i];
        const age = now - s.born;
        const remain = s.until - now;
        const target = age < 1.2 ? 0.88 : remain < 2 ? Math.max(0, remain / 2) * 0.88 : 0.88;
        for (const part of s.sprites) part.mat.opacity += (target - part.mat.opacity) * Math.min(1, dt * 3);
        if (remain <= 0) {
          for (const part of s.sprites) { scene.remove(part.sprite); part.mat.dispose(); }
          smokes.splice(i, 1);
        }
      }
      bombLightMat.color.setHex(Math.floor(now * 2.4) % 2 === 0 ? 0xff4030 : 0x57150f);
    },
  };
}
