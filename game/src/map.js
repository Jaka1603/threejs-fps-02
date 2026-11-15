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
  canvas.width = 1024;
  canvas.height = 1024;
  const g = canvas.getContext('2d');
  const scale = 1024 / 72;
  const px = (v) => (v + 36) * scale;
  g.fillStyle = '#8a7f6d';
  g.fillRect(0, 0, 1024, 1024);
  // Worn patches and lane shading.
  g.fillStyle = 'rgba(0,0,0,0.08)';
  for (let i = 0; i < 260; i += 1) {
    g.fillRect(Math.random() * 1024, Math.random() * 1024, 20 + Math.random() * 60, 12 + Math.random() * 40);
  }
  g.strokeStyle = 'rgba(60,52,40,0.35)';
  g.lineWidth = 2;
  for (let i = 0; i <= 8; i += 1) {
    g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, 1024); g.stroke();
    g.beginPath(); g.moveTo(0, i * 128); g.lineTo(1024, i * 128); g.stroke();
  }
  // Site aprons.
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    g.fillStyle = key === 'A' ? 'rgba(216,106,58,0.20)' : 'rgba(58,154,216,0.20)';
    g.fillRect(px(s.x - 7), px(s.z - 7), 14 * scale, 14 * scale);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

function crateTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const g = canvas.getContext('2d');
  g.fillStyle = '#a9743f';
  g.fillRect(0, 0, 128, 128);
  g.strokeStyle = 'rgba(70,45,18,0.8)';
  g.lineWidth = 5;
  for (const y of [8, 44, 84, 120]) { g.beginPath(); g.moveTo(0, y); g.lineTo(128, y); g.stroke(); }
  g.strokeRect(4, 4, 120, 120);
  g.beginPath(); g.moveTo(4, 4); g.lineTo(124, 124); g.stroke();
  g.beginPath(); g.moveTo(124, 4); g.lineTo(4, 124); g.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

// Builds the whole yard into the scene. Returns nothing; physics reads the
// data tables above, not the meshes.
export function buildWorld(scene) {
  const sun = new THREE.DirectionalLight(0xffd9a8, 2.6);
  sun.position.set(-28, 38, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -42; sun.shadow.camera.right = 42;
  sun.shadow.camera.top = 42; sun.shadow.camera.bottom = -42;
  sun.shadow.camera.far = 110;
  sun.shadow.bias = -0.0004;
  scene.add(sun);
  scene.add(new THREE.HemisphereLight(0xbdd3e6, 0x5c5142, 0.85));

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(72, 72),
    new THREE.MeshStandardMaterial({ map: groundTexture(), roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const wallMat = new THREE.MeshStandardMaterial({ color: PALETTE.wall, roughness: 0.9 });
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

  // Distant foundry silhouettes for depth beyond the fence line.
  const silhouette = new THREE.MeshStandardMaterial({ color: 0x232d36, roughness: 1 });
  const stacks = [[-52, -40, 6, 26], [48, -46, 8, 32], [-58, 6, 5, 20], [56, 20, 7, 24], [0, -58, 16, 18], [-30, 52, 10, 22], [34, 54, 8, 26]];
  for (const [x, z, w, h] of stacks) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), silhouette);
    m.position.set(x, h / 2, z);
    scene.add(m);
  }
}
