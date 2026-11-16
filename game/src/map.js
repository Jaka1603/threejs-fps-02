// The Foundry Yard: an original two-site map. This module owns the map's data
// (wall boxes, crates, sites, spawns, the bot waypoint graph) and builds its
// three.js geometry from that same data, so what the player sees, what physics
// collides with and what the bots path through can never drift apart.
import * as THREE from 'three';
import { PALETTE } from './config.js';

// Boxes are { x, z, w, d, h }: centre, footprint, top height. Every box is a
// collider; boxes with h >= 2 also block sight lines between standing fighters.
const WALL_H = 3.4;
function wall(x, z, w, d, h = WALL_H) { return { x, z, w, d, h, kind: 'wall' }; }
function crate(x, z, w, d, h) { return { x, z, w, d, h, kind: 'crate' }; }
function barrel(x, z) { return { x, z, w: 0.95, d: 0.95, h: 1.12, kind: 'barrel' }; }
function silo(x, z) { return { x, z, w: 3.4, d: 3.4, h: 7.5, kind: 'silo' }; }

export const BOXES = [
  // Perimeter
  wall(0, -34.5, 70, 1, 4.2), wall(0, 34.5, 70, 1, 4.2),
  wall(-34.5, 0, 1, 70, 4.2), wall(34.5, 0, 1, 70, 4.2),
  // z = 11 band (spawn plaza -> mid/links): doors at x [-13,-10], [-2,2], [10,13]
  wall(-19, 11, 12, 1), wall(-9.5, 11, 1, 1), wall(-5.5, 11, 7, 1), wall(5.5, 11, 7, 1),
  wall(9.5, 11, 1, 1), wall(19, 11, 12, 1),
  // z = -1 band (mid row -> link row): doors at x [-17,-14], [-2,2], [14,17]
  wall(-21, -1, 8, 1), wall(-11.5, -1, 5, 1), wall(-5.5, -1, 7, 1), wall(5.5, -1, 7, 1),
  wall(11.5, -1, 5, 1), wall(21, -1, 8, 1),
  // z = -13 band (link row -> sites/heaven): site doors x [-19,-15] and [15,19], mid door [-2,2]
  wall(-22, -13, 6, 1), wall(-12, -13, 6, 1), wall(-5.5, -13, 7, 1), wall(5.5, -13, 7, 1),
  wall(12, -13, 6, 1), wall(22, -13, 6, 1),
  // z = -25 band (sites -> CT plaza): solid over the sites, open over heaven
  wall(-17, -25, 16, 1), wall(17, -25, 16, 1),
  // x = -9 / x = 9, mid row: "cat" connector doors at z [3,5]
  wall(-9, 1, 1, 4), wall(-9, 8, 1, 6), wall(9, 1, 1, 4), wall(9, 8, 1, 6),
  // x = -9 / x = 9, site row: heaven doors at z [-20,-17]
  wall(-9, -22.5, 1, 5), wall(-9, -15, 1, 4), wall(9, -22.5, 1, 5), wall(9, -15, 1, 4),
  // x = -9 / x = 9, CT row: solid, seals the plaza
  wall(-9, -29, 1, 8), wall(9, -29, 1, 8),
  // x = -25 / x = 25, link+mid rows: tunnel doors at z [6,8] and [-9,-7]
  wall(-25, -11, 1, 4), wall(-25, -0.5, 1, 13), wall(-25, 9.5, 1, 3),
  wall(25, -11, 1, 4), wall(25, -0.5, 1, 13), wall(25, 9.5, 1, 3),
  // x = -25 / x = 25, site row: site west/east doors at z [-20,-17]
  wall(-25, -22.5, 1, 5), wall(-25, -15, 1, 4), wall(25, -22.5, 1, 5), wall(25, -15, 1, 4),
  // x = -25 / x = 25, CT row: solid
  wall(-25, -29, 1, 8), wall(25, -29, 1, 8),

  // Cover: crates (0.55 single / 1.1 stack), barrels, silos
  crate(13.5, -16, 2.2, 2.2, 1.1), crate(21, -24.5, 1.6, 1.6, 0.55), crate(24, -21, 1.8, 1.8, 1.1),
  crate(-13.5, -16, 2.2, 2.2, 1.1), crate(-21, -24.5, 1.6, 1.6, 0.55), crate(-24, -21, 1.8, 1.8, 1.1),
  barrel(22, -14.3), barrel(-22, -14.3), silo(29.5, -27.5), silo(-29.5, -27.5),
  crate(0, -19, 4.4, 1.2, 1.1), crate(-5, -22, 1.6, 1.6, 0.55), crate(5, -22, 1.6, 1.6, 0.55),
  crate(0, 4, 2.2, 2.2, 1.1), crate(-5, 0, 1.6, 1.6, 0.55), crate(5, 0, 1.6, 1.6, 0.55),
  crate(-7, 17, 2, 2, 1.1), crate(7, 17, 2, 2, 1.1), crate(0, 24, 2.4, 1.4, 0.55),
  crate(-17, -7, 2, 2, 1.1), crate(17, -7, 2, 2, 1.1), crate(-17, 5, 1.6, 1.6, 0.55), crate(17, 5, 1.6, 1.6, 0.55),
  crate(-29, -4, 2, 2, 1.1), crate(29, -4, 2, 2, 1.1), barrel(-29, 12), barrel(29, 12),
  crate(-13, -27.5, 1.8, 1.8, 1.1), crate(13, -27.5, 1.8, 1.8, 1.1),
];

export const SITES = {
  A: { x: 17, z: -19, radius: 4.4, color: PALETTE.siteA },
  B: { x: -17, z: -19, radius: 4.4, color: PALETTE.siteB },
};

export const SPAWNS = {
  attack: [[0, 28], [-3, 27], [3, 27], [-6, 28.5], [6, 28.5]],
  defend: [[0, -29], [-3, -28], [3, -28], [-6, -29.5], [6, -29.5]],
};

// Waypoint graph the bots path through. Nodes sit in open floor; edges are
// validated against the sight-blocking walls when the graph is built, so a
// misplaced node degrades to a missing edge instead of a bot in a wall.
export const NODES = [
  [0, 28], [-14, 17], [14, 17], [0, 17], [-29, 17], [29, 17],
  [0, 5], [-17, 5], [17, 5], [-29, 0], [29, 0],
  [0, -6], [-17, -6], [17, -6], [-29, -8], [29, -8],
  [-17, -19], [17, -19], [-21, -22], [21, -22], [0, -19],
  [-12, -18], [12, -18], [0, -29], [-5, -27], [5, -27],
  [-11.5, 11], [11.5, 11], [0, 11], [-25, 7], [25, 7],
  [-9, 4], [9, 4], [-25, -18.5], [25, -18.5],
];
export const EDGES = [
  [0, 1], [0, 2], [0, 3], [3, 1], [3, 2], [1, 4], [2, 5], [1, 26], [26, 7], [2, 27], [27, 8],
  [3, 28], [28, 6], [4, 9], [5, 10], [4, 29], [29, 7], [29, 9], [5, 30], [30, 8], [30, 10],
  [6, 31], [31, 7], [6, 32], [32, 8], [6, 11], [7, 12], [8, 13], [9, 14], [10, 15],
  [12, 14], [13, 15], [11, 12], [11, 13], [12, 16], [13, 17], [14, 33], [33, 16], [33, 18],
  [15, 34], [34, 17], [34, 19], [16, 18], [17, 19], [16, 21], [18, 21], [17, 22], [19, 22],
  [21, 20], [22, 20], [11, 20], [20, 23], [23, 24], [23, 25], [24, 20], [25, 20],
];

// Hold points: where defenders set up per site, and where attackers watch the
// planted charge from. Chosen for their sightlines over the site doors.
export const HOLD_POINTS = {
  A: [[13, -16.5], [21.5, -24], [12, -18], [23, -13.5], [17, -27]],
  B: [[-13, -16.5], [-21.5, -24], [-12, -18], [-23, -13.5], [-17, -27]],
  mid: [[-2, -6], [2, -10], [-4, 2], [4, 2]],
};
export const POST_PLANT = {
  A: [[12.5, -15], [22, -25], [17, -13.8], [24.5, -19]],
  B: [[-12.5, -15], [-22, -25], [-17, -13.8], [-24.5, -19]],
};

const colliders = BOXES.map((b) => ({
  minX: b.x - b.w / 2, maxX: b.x + b.w / 2, minZ: b.z - b.d / 2, maxZ: b.z + b.d / 2, top: b.h,
}));
const sightBlockers = colliders.filter((c) => c.top >= 2);

// Highest standable surface under a point, counting only tops a fighter can
// step onto from their current foot height (0.55 m step tolerance).
export function groundAt(x, z, feetY) {
  let ground = 0;
  for (const c of colliders) {
    if (x >= c.minX && x <= c.maxX && z >= c.minZ && z <= c.maxZ && c.top <= feetY + 0.55 && c.top > ground) {
      ground = c.top;
    }
  }
  return ground;
}

// Move a circle (the fighter) by (dx, dz), axis separated, sliding along any
// collider too tall to step onto. Mutates pos {x, z}; feetY is the current
// foot height, height the fighter's standing height (head clearance ignored:
// no collider floats, so anything stepped over is stood upon instead).
export function moveCircle(pos, radius, dx, dz, feetY) {
  pos.x += dx;
  for (const c of colliders) {
    if (c.top <= feetY + 0.55) continue;
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      pos.x = dx > 0 ? c.minX - radius : c.maxX + radius;
    }
  }
  pos.z += dz;
  for (const c of colliders) {
    if (c.top <= feetY + 0.55) continue;
    if (pos.x + radius > c.minX && pos.x - radius < c.maxX && pos.z + radius > c.minZ && pos.z - radius < c.maxZ) {
      pos.z = dz > 0 ? c.minZ - radius : c.maxZ + radius;
    }
  }
}

// 2D segment vs the sight-blocking walls. Eye and target heights only matter
// through the wall height test above: every sight blocker is taller than a
// crouched head, everything else is low enough to see a standing fighter over.
export function sightBlocked(x1, z1, x2, z2) {
  for (const c of sightBlockers) {
    if (segmentHitsBox(x1, z1, x2, z2, c)) return true;
  }
  return false;
}

export function segmentHitsBox(x1, z1, x2, z2, c) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  let tMin = 0;
  let tMax = 1;
  if (Math.abs(dx) < 1e-9) {
    if (x1 < c.minX || x1 > c.maxX) return false;
  } else {
    let t1 = (c.minX - x1) / dx;
    let t2 = (c.maxX - x1) / dx;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  if (Math.abs(dz) < 1e-9) {
    if (z1 < c.minZ || z1 > c.maxZ) return false;
  } else {
    let t1 = (c.minZ - z1) / dz;
    let t2 = (c.maxZ - z1) / dz;
    if (t1 > t2) { const t = t1; t1 = t2; t2 = t; }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return false;
  }
  return true;
}

// Nearest hit of a 3D ray against every collider box, as a distance, or
// Infinity. Used by hitscan fire so bullets stop at walls and crates.
const rayBox = { min: new THREE.Vector3(), max: new THREE.Vector3() };
const rayTmp = new THREE.Ray();
export function rayHitDistance(origin, dir, maxDist) {
  rayTmp.origin.copy(origin);
  rayTmp.direction.copy(dir);
  let best = maxDist;
  for (const c of colliders) {
    rayBox.min.set(c.minX, 0, c.minZ);
    rayBox.max.set(c.maxX, c.top, c.maxZ);
    const hit = rayTmp.intersectBox(rayBox, new THREE.Vector3());
    if (hit) {
      const d = hit.distanceTo(origin);
      if (d < best) best = d;
    }
  }
  // The floor itself.
  if (dir.y < -1e-6) {
    const d = -origin.y / dir.y;
    if (d > 0 && d < best) best = d;
  }
  return best;
}

// Pathfinding over the waypoint graph: breadth-first next-hop table, built
// once. nextHop(from, to) returns the node index to walk to first.
let nextHopTable = null;
export function buildGraph() {
  const adjacency = NODES.map(() => []);
  for (const [a, b] of EDGES) {
    const [ax, az] = NODES[a];
    const [bx, bz] = NODES[b];
    if (sightBlocked(ax, az, bx, bz)) continue;
    adjacency[a].push(b);
    adjacency[b].push(a);
  }
  nextHopTable = NODES.map((_, from) => {
    const prev = new Array(NODES.length).fill(-1);
    const queue = [from];
    prev[from] = from;
    while (queue.length) {
      const node = queue.shift();
      for (const next of adjacency[node]) {
        if (prev[next] === -1) { prev[next] = node; queue.push(next); }
      }
    }
    return NODES.map((_, to) => {
      if (to === from) return from;
      let node = to;
      while (prev[node] !== -1 && prev[node] !== from) node = prev[node];
      return prev[node] === -1 ? from : node;
    });
  });
  return adjacency;
}
export function nearestNode(x, z) {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < NODES.length; i += 1) {
    const dx = NODES[i][0] - x;
    const dz = NODES[i][1] - z;
    const d = dx * dx + dz * dz;
    if (d < bestDist) { bestDist = d; best = i; }
  }
  return best;
}
export function nextHop(from, to) {
  if (!nextHopTable) buildGraph();
  return nextHopTable[from][to];
}

// ---- Geometry ---------------------------------------------------------------

function groundTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const g = canvas.getContext('2d');
  const scale = 2048 / 72;
  const px = (v) => (v + 36) * scale;
  const rnd = mulberry(1234567);
  g.fillStyle = '#877b67';
  g.fillRect(0, 0, 2048, 2048);
  // Large tonal patches: poured slabs age differently.
  for (let i = 0; i < 90; i += 1) {
    g.fillStyle = `rgba(${40 + rnd() * 40},${34 + rnd() * 30},${22 + rnd() * 22},${0.05 + rnd() * 0.08})`;
    g.fillRect(rnd() * 2048, rnd() * 2048, 140 + rnd() * 420, 100 + rnd() * 300);
  }
  // Fine speckle so the surface never reads as flat colour up close.
  for (let i = 0; i < 5200; i += 1) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,246,225,0.05)' : 'rgba(20,16,10,0.06)';
    g.fillRect(rnd() * 2048, rnd() * 2048, 2 + rnd() * 5, 2 + rnd() * 5);
  }
  // Oil stains and tyre scuffs around the working lanes.
  for (let i = 0; i < 26; i += 1) {
    const x = rnd() * 2048;
    const y = rnd() * 2048;
    const r = 26 + rnd() * 70;
    const grad = g.createRadialGradient(x, y, 2, x, y, r);
    grad.addColorStop(0, 'rgba(24,20,16,0.34)');
    grad.addColorStop(1, 'rgba(24,20,16,0)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }
  g.strokeStyle = 'rgba(30,26,20,0.20)';
  g.lineWidth = 7;
  for (let i = 0; i < 22; i += 1) {
    g.beginPath();
    const x = rnd() * 2048;
    const y = rnd() * 2048;
    g.arc(x, y, 30 + rnd() * 90, rnd() * 3, rnd() * 2 + 0.6);
    g.stroke();
  }
  // Expansion joints on a 9 m grid.
  g.strokeStyle = 'rgba(52,44,34,0.5)';
  g.lineWidth = 3;
  for (let i = 0; i <= 8; i += 1) {
    g.beginPath(); g.moveTo(i * 256, 0); g.lineTo(i * 256, 2048); g.stroke();
    g.beginPath(); g.moveTo(0, i * 256); g.lineTo(2048, i * 256); g.stroke();
  }
  // Painted traffic paint: a worn yellow centre line up the mid lane and
  // white edge lines along the link row — the yard's lanes read at a glance.
  g.strokeStyle = 'rgba(232,178,60,0.55)';
  g.lineWidth = 9;
  g.setLineDash([46, 34]);
  g.beginPath(); g.moveTo(px(0), px(33)); g.lineTo(px(0), px(-24)); g.stroke();
  g.setLineDash([]);
  g.strokeStyle = 'rgba(238,234,222,0.4)';
  g.lineWidth = 7;
  g.beginPath(); g.moveTo(px(-33), px(-7)); g.lineTo(px(33), px(-7)); g.stroke();
  // Site aprons, stronger than before: a tinted slab plus a hazard border.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    g.fillStyle = key === 'A' ? 'rgba(216,106,58,0.26)' : 'rgba(58,154,216,0.26)';
    g.fillRect(px(s.x - 7), px(s.z - 7), 14 * scale, 14 * scale);
    g.strokeStyle = key === 'A' ? 'rgba(232,106,42,0.85)' : 'rgba(42,154,232,0.85)';
    g.lineWidth = 10;
    g.strokeRect(px(s.x - 7), px(s.z - 7), 14 * scale, 14 * scale);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

// Small deterministic PRNG for texture painting: the yard must look the
// same on every load, so Math.random never touches the art.
function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function crateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const rnd = mulberry(4242);
  g.fillStyle = '#a9743f';
  g.fillRect(0, 0, 256, 256);
  // Plank grain: long streaks of lighter and darker timber.
  for (let i = 0; i < 130; i += 1) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,214,150,0.10)' : 'rgba(74,44,14,0.12)';
    g.fillRect(0, rnd() * 256, 256, 1 + rnd() * 3);
  }
  g.strokeStyle = 'rgba(70,45,18,0.85)';
  g.lineWidth = 7;
  for (const y of [10, 88, 168, 246]) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  g.lineWidth = 10;
  g.strokeRect(5, 5, 246, 246);
  g.beginPath(); g.moveTo(5, 5); g.lineTo(251, 251); g.stroke();
  g.beginPath(); g.moveTo(251, 5); g.lineTo(5, 251); g.stroke();
  // Stencilled handling marks, the way real freight is labelled.
  g.fillStyle = 'rgba(46,30,12,0.75)';
  g.font = '700 30px system-ui, sans-serif';
  g.textAlign = 'center';
  g.fillText('FY-7', 128, 140);
  g.font = '600 17px system-ui, sans-serif';
  g.fillText('FOUNDRY YARD', 128, 168);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Cast concrete for the yard walls: formwork seams, tie holes, rain streaks
// running down from the top edge and a grime gradient at the foot. Painted
// mostly in horizontal bands so it stretches gracefully over long walls.
function wallTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const rnd = mulberry(90210);
  g.fillStyle = '#9a8f7c';
  g.fillRect(0, 0, 512, 256);
  for (let i = 0; i < 2400; i += 1) {
    g.fillStyle = rnd() > 0.5 ? 'rgba(255,248,230,0.05)' : 'rgba(24,20,14,0.06)';
    g.fillRect(rnd() * 512, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4);
  }
  // Formwork panel seams and tie holes.
  g.strokeStyle = 'rgba(52,46,38,0.55)';
  g.lineWidth = 3;
  for (const x of [0, 170, 341, 512]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 256); g.stroke(); }
  g.beginPath(); g.moveTo(0, 128); g.lineTo(512, 128); g.stroke();
  g.fillStyle = 'rgba(40,35,28,0.5)';
  for (const x of [85, 255, 426]) {
    for (const y of [64, 192]) { g.beginPath(); g.arc(x, y, 5, 0, Math.PI * 2); g.fill(); }
  }
  // Rain streaks bleeding down from the coping.
  for (let i = 0; i < 34; i += 1) {
    const x = rnd() * 512;
    const len = 40 + rnd() * 130;
    const grad = g.createLinearGradient(0, 0, 0, len);
    grad.addColorStop(0, 'rgba(38,32,24,0.30)');
    grad.addColorStop(1, 'rgba(38,32,24,0)');
    g.fillStyle = grad;
    g.fillRect(x, 0, 3 + rnd() * 7, len);
  }
  // Rust bleed near the base, and the base grime itself.
  for (let i = 0; i < 16; i += 1) {
    g.fillStyle = 'rgba(150,80,40,0.13)';
    g.fillRect(rnd() * 512, 196 + rnd() * 40, 8 + rnd() * 30, 20 + rnd() * 40);
  }
  const base = g.createLinearGradient(0, 190, 0, 256);
  base.addColorStop(0, 'rgba(30,25,18,0)');
  base.addColorStop(1, 'rgba(30,25,18,0.42)');
  g.fillStyle = base;
  g.fillRect(0, 190, 512, 66);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

// Corrugated shipping-container skin in one colour: vertical ribs, door
// seams, rust at the corners and a stencilled unit number.
function containerTexture(hex, label) {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  const col = new THREE.Color(hex);
  g.fillStyle = `#${col.getHexString()}`;
  g.fillRect(0, 0, 256, 128);
  for (let x = 0; x < 256; x += 16) {
    g.fillStyle = 'rgba(0,0,0,0.20)';
    g.fillRect(x, 0, 5, 128);
    g.fillStyle = 'rgba(255,255,255,0.10)';
    g.fillRect(x + 6, 0, 3, 128);
  }
  g.strokeStyle = 'rgba(0,0,0,0.4)';
  g.lineWidth = 4;
  g.strokeRect(3, 3, 250, 122);
  g.beginPath(); g.moveTo(128, 0); g.lineTo(128, 128); g.stroke();
  g.fillStyle = 'rgba(20,14,8,0.28)';
  g.fillRect(0, 104, 256, 24);
  g.fillStyle = 'rgba(255,246,230,0.85)';
  g.font = '700 21px system-ui, sans-serif';
  g.fillText(label, 14, 32);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// The dusk sky, painted once: indigo zenith, a copper sun band on the
// horizon, the sun's own glow low in the west, thin cloud streaks catching
// the last light, and the first stars up top. Drawn equirect-style so it
// wraps the dome without a seam showing.
function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 512;
  const g = canvas.getContext('2d');
  const grad = g.createLinearGradient(0, 0, 0, 512);
  grad.addColorStop(0.0, '#2e4a63');
  grad.addColorStop(0.26, '#52708c');
  grad.addColorStop(0.40, '#97755e');
  grad.addColorStop(0.50, '#eda058');
  grad.addColorStop(0.565, '#c07a48');
  grad.addColorStop(0.68, '#5c4a3e');
  grad.addColorStop(1.0, '#33291f');
  g.fillStyle = grad;
  g.fillRect(0, 0, 1024, 512);
  // The sun: a bright core with a warm halo, sitting on the horizon.
  const sunX = 250;
  const sunY = 276;
  const halo = g.createRadialGradient(sunX, sunY, 4, sunX, sunY, 120);
  halo.addColorStop(0, 'rgba(255,214,150,0.9)');
  halo.addColorStop(0.15, 'rgba(255,176,102,0.45)');
  halo.addColorStop(1, 'rgba(255,150,80,0)');
  g.fillStyle = halo;
  g.fillRect(0, 0, 1024, 512);
  g.fillStyle = '#ffe9c4';
  g.beginPath(); g.arc(sunX, sunY, 13, 0, Math.PI * 2); g.fill();
  // Cloud streaks: a few thin wisps low over the horizon, dark bellies
  // with lit rims. Kept small, faint and below the zenith — on a sky
  // dome anything big or high smears into rings around the pole.
  const rnd = mulberry(777);
  for (let i = 0; i < 9; i += 1) {
    const x = rnd() * 1024;
    const y = 185 + rnd() * 60;
    const w = 55 + rnd() * 95;
    const h = 3 + rnd() * 3.5;
    g.fillStyle = 'rgba(24,26,36,0.20)';
    g.beginPath(); g.ellipse(x, y, w, h, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = 'rgba(255,170,110,0.16)';
    g.beginPath(); g.ellipse(x, y + h * 0.8, w * 0.92, h * 0.4, 0, 0, Math.PI * 2); g.fill();
  }
  // First stars in the zenith.
  g.fillStyle = 'rgba(230,238,248,0.7)';
  for (let i = 0; i < 130; i += 1) {
    const y = rnd() * 130;
    g.globalAlpha = 0.25 + rnd() * 0.5 * (1 - y / 150);
    g.fillRect(rnd() * 1024, y, 1.6, 1.6);
  }
  g.globalAlpha = 1;
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Distant blocks with lit windows: the foundry's neighbours at dusk.
function skylineTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  const rnd = mulberry(31337);
  g.fillStyle = '#1c242d';
  g.fillRect(0, 0, 128, 256);
  for (let y = 12; y < 244; y += 16) {
    for (let x = 10; x < 118; x += 14) {
      if (rnd() > 0.42) continue;
      g.fillStyle = rnd() > 0.25 ? 'rgba(255,196,110,0.9)' : 'rgba(190,220,235,0.75)';
      g.fillRect(x, y, 7, 9);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// A soft round glow sprite, shared by every lamp head in the yard.
function glowTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const g = canvas.getContext('2d');
  const grad = g.createRadialGradient(32, 32, 2, 32, 32, 30);
  grad.addColorStop(0, 'rgba(255,196,120,0.9)');
  grad.addColorStop(0.4, 'rgba(255,166,80,0.35)');
  grad.addColorStop(1, 'rgba(255,150,60,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(canvas);
}

// Builds the whole yard into the scene. Returns nothing; physics reads the
// data tables above, not the meshes.
export function buildWorld(scene) {
  // The sky dome: a painted dusk, far outside the fence, untouched by fog.
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(240, 32, 18),
    new THREE.MeshBasicMaterial({ map: skyTexture(), side: THREE.BackSide, fog: false, depthWrite: false }),
  );
  dome.renderOrder = -1;
  // Turn the painted sun into the west, where the light comes from.
  dome.rotation.y = -0.95;
  scene.add(dome);

  // A low, warm sun from the west so every wall rakes a long shadow east.
  const sun = new THREE.DirectionalLight(0xffc98f, 3.1);
  sun.position.set(-34, 26, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 120;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0x93aed0, 0x5c4a38, 0.8));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 72),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.92 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.wallTrim, roughness: 0.85 });
  const crateMat = new THREE.MeshStandardMaterial({ map: crateTexture(), roughness: 0.8 });
  const metalMat = new THREE.MeshStandardMaterial({ color: PALETTE.metal, roughness: 0.55, metalness: 0.55 });
  const rustMat = new THREE.MeshStandardMaterial({ color: PALETTE.rust, roughness: 0.7, metalness: 0.3 });

  for (const b of BOXES) {
    let mesh;
    if (b.kind === 'barrel') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, b.h, 14), rustMat);
    } else if (b.kind === 'silo') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, b.h, 20), metalMat);
    } else {
      mesh = new THREE.Mesh(new THREE.BoxGeometry(b.w, b.h, b.d), b.kind === 'crate' ? crateMat : wallMat);
    }
    mesh.position.set(b.x, b.h / 2, b.z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    if (b.kind === 'wall') {
      const trim = new THREE.Mesh(new THREE.BoxGeometry(b.w + 0.12, 0.18, b.d + 0.12), trimMat);
      trim.position.set(b.x, b.h + 0.09, b.z);
      trim.castShadow = true;
      scene.add(trim);
    }
  }

  // Site rings and letters, flat on the ground.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(s.radius - 0.35, s.radius, 40),
      new THREE.MeshBasicMaterial({ color: s.color, transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(s.x, 0.02, s.z);
    scene.add(ring);
    const canvas = document.createElement('canvas');
    canvas.width = 128; canvas.height = 128;
    const g = canvas.getContext('2d');
    g.font = '700 96px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = key === 'A' ? '#d86a3a' : '#3a9ad8';
    g.fillText(key, 64, 70);
    const letterTex = new THREE.CanvasTexture(canvas);
    const letter = new THREE.Mesh(
      new THREE.PlaneGeometry(3.4, 3.4),
      new THREE.MeshBasicMaterial({ map: letterTex, transparent: true, opacity: 0.9 }),
    );
    letter.rotation.x = -Math.PI / 2;
    letter.position.set(s.x, 0.03, s.z);
    scene.add(letter);
  }

  // Distant foundry silhouettes for depth beyond the fence line, their
  // windows lit for the night shift.
  const silhouette = new THREE.MeshStandardMaterial({ map: skylineTexture(), roughness: 1 });
  const stacks = [[-52, -40, 6, 26], [48, -46, 8, 32], [-58, 6, 5, 20], [56, 20, 7, 24], [0, -58, 16, 18], [-30, 52, 10, 22], [34, 54, 8, 26]];
  for (const [x, z, w, h] of stacks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), silhouette);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }
  // Aircraft beacons on the two tallest stacks.
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0xff3524 });
  for (const [x, z, , h] of [stacks[1], stacks[6]]) {
    const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.32, 8, 8), beaconMat);
    beacon.position.set(x, h + 0.4, z);
    scene.add(beacon);
  }

  // Freight stacked outside the fence: container piles tall enough to read
  // over the perimeter wall, pure dressing — no collider ever reaches them.
  const containerMats = [
    new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerRed, 'FYCU 2041'), roughness: 0.62, metalness: 0.35 }),
    new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerTeal, 'FYCU 7780'), roughness: 0.62, metalness: 0.35 }),
    new THREE.MeshStandardMaterial({ map: containerTexture(PALETTE.containerBlue, 'FYCU 0917'), roughness: 0.62, metalness: 0.35 }),
  ];
  const containerGeo = new THREE.BoxGeometry(6.1, 2.6, 2.44);
  const piles = [
    [-41, -18, 0, 2], [-41, -11.5, 0, 1], [41, -20, 0, 3], [41, -13.5, 0, 1],
    [-14, 41.5, 1, 2], [20, -41.5, 1, 2], [-24, -41.5, 1, 1], [8, 41.5, 1, 3],
  ];
  let pileIndex = 0;
  for (const [x, z, alongX, high] of piles) {
    for (let level = 0; level < high; level += 1) {
      const m = new THREE.Mesh(containerGeo, containerMats[pileIndex % containerMats.length]);
      if (alongX) m.rotation.y = Math.PI / 2;
      m.position.set(x + (level % 2) * 0.3, 1.3 + level * 2.62, z);
      m.castShadow = true;
      scene.add(m);
      pileIndex += 1;
    }
  }

  // Yard lamps on the band walls: the dusk shift works under its own light.
  // A dark stem, an emissive head and a soft glow sprite; no real light
  // sources, so the render loop pays nothing for them.
  const glowTex = glowTexture();
  const lampStem = new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.5, metalness: 0.5 });
  const lampHead = new THREE.MeshBasicMaterial({ color: PALETTE.lamp });
  const lampAt = (x, z, wallTop) => {
    const stem = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.7, 0.09), lampStem);
    stem.position.set(x, wallTop + 0.35, z);
    scene.add(stem);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.09, 0.3), lampHead);
    head.position.set(x, wallTop + 0.72, z);
    scene.add(head);
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({
      map: glowTex, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    glow.scale.set(2.6, 2.6, 1);
    glow.position.set(x, wallTop + 0.72, z);
    scene.add(glow);
  };
  for (const x of [-24, -12, -2.4, 2.4, 12, 24]) lampAt(x, 11, WALL_H);
  for (const x of [-24, -12, 12, 24]) lampAt(x, -13, WALL_H);
  for (const x of [-18, 18]) lampAt(x, -1, WALL_H);
  lampAt(-29.5, -27.5, 7.5);
  lampAt(29.5, -27.5, 7.5);

  // Site door light strips: twin verticals in the site's own colour flank
  // each site entrance on the z = -13 band, so A and B read from mid.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    const stripMat = new THREE.MeshBasicMaterial({ color: s.color });
    for (const dx of [-2.3, 2.3]) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(0.22, 3.0, 0.1), stripMat);
      strip.position.set(s.x + dx, 1.7, -12.42);
      scene.add(strip);
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.22, 0.1), stripMat);
    lintel.position.set(s.x, 3.28, -12.42);
    scene.add(lintel);
  }
}
