// Combatants: the ten fighters as data plus their low-poly figures. One job —
// who a fighter is, what they carry, and how their body is posed. Shooting is
// combat.js, decisions are bots.js / player.js; this module keeps the body.
import * as THREE from 'three';
import { CALLSIGNS, ECONOMY, PALETTE, TEAMS, WEAPONS } from './config.js';

export const EYE_STAND = 1.62;
export const EYE_CROUCH = 1.14;
export const HEAD_STAND = 1.60;
export const HEAD_CROUCH = 1.12;

let nextId = 0;

export function createCombatant(team, index, isPlayer) {
  const sidearm = { key: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
  return {
    id: nextId++,
    team,
    callsign: CALLSIGNS[team][index],
    isPlayer,
    alive: true,
    health: 100,
    armorPts: 0,
    money: ECONOMY.start,
    kills: 0,
    deaths: 0,
    pos: { x: 0, y: 0, z: 0 },
    vel: { x: 0, y: 0, z: 0 },
    yaw: 0,
    pitch: 0,
    crouch: false,
    crouchAmt: 0,
    onGround: true,
    weapons: { primary: null, sidearm },
    currentSlot: 'sidearm',
    grenades: { frag: 0, flash: 0, smoke: 0 },
    hasBomb: false,
    hasKit: false,
    nextShotAt: 0,
    reloadUntil: 0,
    reloadSlot: null,
    drawUntil: 0,
    bloom: 0,
    blindUntil: 0,
    blindPeak: 0,
    lastAttackerId: -1,
    lastHurtAt: -99,
    stepPhase: 0,
    stepCycle: 0,
    deathAt: 0,
    hitFlash: 0,
    bot: null,
    group: null,
    parts: null,
  };
}

export function currentWeapon(c) {
  return c.weapons[c.currentSlot];
}

export function eyeHeight(c) {
  return c.pos.y + (c.crouchAmt > 0.5 ? EYE_CROUCH : EYE_STAND - (EYE_STAND - EYE_CROUCH) * c.crouchAmt);
}

export function speedOf(c) {
  return Math.hypot(c.vel.x, c.vel.z);
}

// The three hit volumes of a fighter in its current pose, as min/max arrays
// [minX, minY, minZ, maxX, maxY, maxZ] with their damage zones. combat.js
// tests shot rays against these; heights follow the crouch pose.
export function hitVolumes(c, out) {
  const t = c.crouchAmt;
  const headY = c.pos.y + HEAD_STAND + (HEAD_CROUCH - HEAD_STAND) * t;
  const chestTop = c.pos.y + 1.44 - 0.38 * t;
  const chestBase = c.pos.y + 0.60 - 0.14 * t;
  out[0][0] = c.pos.x - 0.16; out[0][1] = headY - 0.15; out[0][2] = c.pos.z - 0.16;
  out[0][3] = c.pos.x + 0.16; out[0][4] = headY + 0.17; out[0][5] = c.pos.z + 0.16;
  out[1][0] = c.pos.x - 0.31; out[1][1] = chestBase; out[1][2] = c.pos.z - 0.31;
  out[1][3] = c.pos.x + 0.31; out[1][4] = chestTop; out[1][5] = c.pos.z + 0.31;
  out[2][0] = c.pos.x - 0.27; out[2][1] = c.pos.y; out[2][2] = c.pos.z - 0.27;
  out[2][3] = c.pos.x + 0.27; out[2][4] = chestBase; out[2][5] = c.pos.z + 0.27;
  return out;
}
export const HIT_ZONES = ['head', 'chest', 'legs'];
export function newHitVolumes() {
  return [new Float32Array(6), new Float32Array(6), new Float32Array(6)];
}

function nameSprite(callsign, colorHex) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 56;
  const g = canvas.getContext('2d');
  g.font = '600 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 6;
  g.fillStyle = '#ffffff';
  g.fillText(callsign, 128, 28);
  const texture = new THREE.CanvasTexture(canvas);
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(1.5, 0.33, 1);
  sprite.position.y = 2.05;
  return sprite;
}

// Builds the figure: legs that swing as it moves, an upper body that pitches
// with its aim, team-coloured torso, helmet, and a blocky rifle. Posed every
// frame by poseActor from the combatant's physics state.
export function buildFigure(c, scene, showName) {
  const group = new THREE.Group();
  const teamColor = TEAMS[c.team].color;
  const suit = new THREE.MeshStandardMaterial({ color: c.team === 'wardens' ? 0x46565c : 0x5a4636, roughness: 0.9 });
  const teamMat = new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.7 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.6, metalness: 0.35 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xc9a183, roughness: 0.8 });
  const visor = new THREE.MeshStandardMaterial({ color: 0x14181d, roughness: 0.25, metalness: 0.6 });

  const legs = new THREE.Group();
  const legGeo = new THREE.BoxGeometry(0.17, 0.82, 0.2);
  const legL = new THREE.Mesh(legGeo, suit);
  legL.position.set(-0.13, 0.41, 0);
  const legR = new THREE.Mesh(legGeo, suit);
  legR.position.set(0.13, 0.41, 0);
  legs.add(legL, legR);
  group.add(legs);

  const upper = new THREE.Group();
  upper.position.y = 0.82;
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.54, 0.64, 0.3), teamMat);
  torso.position.y = 0.32;
  const vest = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.4, 0.36), dark);
  vest.position.y = 0.28;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.28, 0.26), skin);
  head.position.y = 0.82;
  const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.14, 0.32), teamMat);
  helmet.position.y = 0.95;
  // A dark visor strip across the face and a helmet brim: the head reads
  // as tactical kit, not a bare block, at screenshot distance.
  const visorMesh = new THREE.Mesh(new THREE.BoxGeometry(0.27, 0.09, 0.03), visor);
  visorMesh.position.set(0, 0.86, -0.14);
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.04, 0.38), teamMat);
  brim.position.y = 0.9;
  // Team-colour shoulder pads and a chest stripe over the dark vest, plus
  // a backpack block — the silhouette carries the team colour front, side
  // and back. All inside the chest hit volume's footprint.
  const padGeo = new THREE.BoxGeometry(0.13, 0.1, 0.3);
  const padL = new THREE.Mesh(padGeo, teamMat);
  padL.position.set(-0.24, 0.58, 0);
  const padR = new THREE.Mesh(padGeo, teamMat);
  padR.position.set(0.24, 0.58, 0);
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.09, 0.02), teamMat);
  stripe.position.set(0, 0.42, -0.19);
  const pack = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.46, 0.14), dark);
  pack.position.set(0, 0.32, 0.22);
  const armGeo = new THREE.BoxGeometry(0.13, 0.52, 0.13);
  const armL = new THREE.Mesh(armGeo, suit);
  armL.position.set(-0.36, 0.3, 0.18);
  armL.rotation.x = -1.15;
  const armR = new THREE.Mesh(armGeo, suit);
  armR.position.set(0.36, 0.3, 0.1);
  armR.rotation.x = -1.35;
  const gun = new THREE.Group();
  const gunBody = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.16, 0.66), dark);
  const gunBarrel = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.3), dark);
  gunBarrel.position.set(0, 0.04, -0.45);
  gun.add(gunBody, gunBarrel);
  gun.position.set(0.18, 0.42, -0.3);
  upper.add(torso, vest, head, helmet, visorMesh, brim, padL, padR, stripe, pack, armL, armR, gun);
  group.add(upper);

  group.traverse((m) => { if (m.isMesh) { m.castShadow = true; } });
  if (showName) group.add(nameSprite(c.callsign, teamColor));
  scene.add(group);
  c.group = group;
  c.parts = { legs, legL, legR, upper, torso, teamMat, gun, head, helmet, visorMesh, brim };
  return group;
}

// Poses a figure from its combatant state: position, facing, aim pitch on the
// upper body, leg swing from distance travelled, crouch compression, the
// death fall, and the white hit flash fading out.
export function poseActor(c, dt, now) {
  const g = c.group;
  if (!g) return;
  g.position.set(c.pos.x, c.pos.y, c.pos.z);
  g.rotation.y = c.yaw;
  const p = c.parts;
  if (!c.alive) {
    const fall = Math.min(1, (now - c.deathAt) / 0.45);
    g.rotation.x = -fall * Math.PI / 2;
    g.position.y = c.pos.y + fall * 0.12;
    return;
  }
  g.rotation.x = 0;
  const speed = speedOf(c);
  c.stepPhase += dt * speed * 2.4;
  const swing = Math.sin(c.stepPhase) * Math.min(1, speed / 4) * 0.55;
  p.legL.rotation.x = swing;
  p.legR.rotation.x = -swing;
  p.upper.position.y = 0.82 - c.crouchAmt * 0.42;
  p.upper.rotation.x = c.pitch * 0.7;
  p.legs.rotation.x = c.crouchAmt * 0.5;
  if (c.hitFlash > 0) {
    c.hitFlash = Math.max(0, c.hitFlash - dt * 5);
    p.teamMat.emissive.setRGB(c.hitFlash * 0.9, c.hitFlash * 0.9, c.hitFlash * 0.9);
  }
}

// The player's own weapon, parented to the camera: a blocky rifle/SMG/pistol
// per weapon key, with a muzzle point for flashes and tracers. Recoil and bob
// are applied by main.js through userData offsets.
const VIEW_SPECS = {
  p9: { len: 0.34, h: 0.13, color: 0x2c2f33 },
  raptor: { len: 0.52, h: 0.17, color: 0x33373d },
  breacher: { len: 0.62, h: 0.15, color: 0x4a3a28 },
  vk: { len: 0.72, h: 0.19, color: 0x2e3237 },
  longbow: { len: 0.9, h: 0.2, color: 0x3a3f45 },
};
export function buildViewModel(camera) {
  const group = new THREE.Group();
  group.position.set(0.24, -0.22, -0.45);
  const models = {};
  for (const key of Object.keys(VIEW_SPECS)) {
    const spec = VIEW_SPECS[key];
    const mat = new THREE.MeshStandardMaterial({ color: 0x3a4046, roughness: 0.38, metalness: 0.55 });
    const accent = new THREE.MeshStandardMaterial({ color: 0x2fd8c8, roughness: 0.45, metalness: 0.3 });
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x22252a, roughness: 0.7 });
    const m = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.075, spec.h, spec.len), mat);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.078, spec.h * 0.3, spec.len * 0.4), accent);
    stripe.position.set(0, spec.h * 0.18, spec.len * 0.12);
    const foregrip = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.09, 0.05), gripMat);
    foregrip.position.set(0, -spec.h * 0.62, -spec.len * 0.28);
    const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, spec.len * 0.4), mat);
    barrel.position.set(0, spec.h * 0.22, -spec.len * 0.62);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.09), mat);
    mag.position.set(0, -spec.h * 0.7, 0.02);
    mag.rotation.x = 0.25;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.06, 0.03), mat);
    sight.position.set(0, spec.h * 0.65, -0.05);
    m.add(body, stripe, barrel, mag, sight, foregrip);
    if (key === 'longbow') {
      const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.16, 10), mat);
      scope.rotation.x = Math.PI / 2;
      scope.position.set(0, spec.h * 0.72, -0.08);
      m.add(scope);
    }
    m.visible = false;
    group.add(m);
    models[key] = m;
  }
  const hands = new THREE.Mesh(
    new THREE.BoxGeometry(0.06, 0.06, 0.11),
    new THREE.MeshStandardMaterial({ color: 0xc9a183, roughness: 0.8 }),
  );
  hands.position.set(0.01, -0.1, 0.04);
  group.add(hands);
  camera.add(group);
  return { group, models, current: null };
}

export function setViewWeapon(vm, key) {
  if (vm.current === key) return;
  vm.current = key;
  for (const k of Object.keys(vm.models)) vm.models[k].visible = k === key;
}

export { PALETTE };
