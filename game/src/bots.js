// Bot brains: perception (vision cone, sight lines, smoke, hearing), a
// state machine (advance, hold, engage, plant, defuse, cover), waypoint
// pathing, and human-shaped aiming — reaction delay, aim error that
// shrinks on a held sightline, burst discipline, strafing between bursts.
// Team plans are dealt at round start; defenders spread 2-1-2.
import { HOLD_POINTS, NODES, POST_PLANT, SITES, nearestNode, nextHop } from './map.js';
import { currentWeapon, eyeHeight } from './actors.js';
import { canSee, startReload, throwGrenade, tryShoot } from './combat.js';
import { SPEED_CROUCH, SPEED_RUN, SPEED_WALK, stepBody } from './movement.js';
import { aliveOf, emitNoise, otherTeam, teamRole } from './state.js';

export function createBot(rng, index) {
  const skill = 0.35 + rng.float() * 0.6;
  return {
    skill,
    reaction: 0.55 - skill * 0.28,
    aimError: 0.052 - skill * 0.03,
    state: 'advance',
    goalNode: -1,
    viaNode: -1,
    holdX: 0, holdZ: 0, holdYaw: 0,
    watchNode: -1,
    enemy: null,
    seenAt: 0,
    lastSeenX: 0, lastSeenZ: 0,
    lastSeenAt: -99,
    reactionAt: 0,
    exposure: 0,
    thinkAt: rng.float() * 0.12,
    burstLeft: 0,
    nextBurstAt: 0,
    strafeDir: 1,
    strafeFlipAt: 0,
    retreatUntil: 0,
    retreated: false,
    moveX: 0, moveZ: 0,
    channeling: null,
    usedUtility: false,
    alertX: 0, alertZ: 0, alertAt: -99,
    stuckCheckAt: 0, stuckX: 0, stuckZ: 0,
    jumpAt: 0,
    defuseAssigned: false,
    coverBomb: false,
  };
}

function angleWrap(a) {
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
function yawTo(from, x, z) {
  return Math.atan2(-(x - from.pos.x), -(z - from.pos.z));
}
function rotateToward(c, targetYaw, targetPitch, dt, rate = 3.4) {
  const dy = angleWrap(targetYaw - c.yaw);
  const maxStep = rate * dt;
  c.yaw += Math.max(-maxStep, Math.min(maxStep, dy));
  const dp = targetPitch - c.pitch;
  c.pitch += Math.max(-maxStep * 0.7, Math.min(maxStep * 0.7, dp));
}
function dist2d(ax, az, bx, bz) {
  return Math.hypot(ax - bx, az - bz);
}

// Deals the round's plans. Attackers: a main hit on one site split across two
// routes, plus a lurker through mid. Defenders: two per site, one mid, each
// with a hold point and a watch direction.
export function planRound(match) {
  const rng = match.rng;
  const attackers = aliveOf(match, match.attackTeam);
  const defenders = aliveOf(match, otherTeam(match.attackTeam));
  const site = rng.chance(0.5) ? 'A' : 'B';
  match.planSite = site;
  match.intel = null;
  const siteNode = site === 'A' ? 17 : 16;
  const routes = site === 'A' ? [13, 15, 11] : [12, 14, 11]; // short, long, mid
  attackers.forEach((c, i) => {
    if (c.isPlayer || !c.bot) return;
    const b = c.bot;
    b.state = 'advance';
    b.usedUtility = false;
    b.defuseAssigned = false;
    b.coverBomb = false;
    if (i % 3 === 2) { b.goalNode = routes[2]; b.viaNode = -1; }        // lurker via mid
    else if (i % 2 === 0) { b.goalNode = siteNode; b.viaNode = routes[0]; }
    else { b.goalNode = siteNode; b.viaNode = routes[1]; }
    b.holdX = SITES[site].x;
    b.holdZ = SITES[site].z;
  });
  const holds = { A: HOLD_POINTS.A, B: HOLD_POINTS.B, mid: HOLD_POINTS.mid };
  defenders.forEach((c, i) => {
    if (c.isPlayer || !c.bot) return;
    const b = c.bot;
    b.state = 'advance';
    b.usedUtility = false;
    b.defuseAssigned = false;
    const assignment = ['A', 'B', 'A', 'B', 'mid'][i % 5];
    const points = holds[assignment];
    const point = points[Math.floor(i / 2) % points.length];
    b.holdX = point[0];
    b.holdZ = point[1];
    b.goalNode = nearestNode(point[0], point[1]);
    b.viaNode = -1;
    b.watchNode = assignment === 'A' ? 17 : assignment === 'B' ? 16 : 11;
    b.assignment = assignment;
  });
}

// What a bot can currently perceive: the nearest visible enemy, refreshed
// on a staggered think tick. Blinded bots perceive nothing; gunfire and
// footsteps arrive through match.noises.
function perceive(match, c, now) {
  const b = c.bot;
  if (now < b.thinkAt) return;
  b.thinkAt = now + 0.12;
  const blind = c.blindUntil > now;
  let best = null;
  let bestDist = 60;
  if (!blind) {
    const eyeY = eyeHeight(c);
    for (const e of match.combatants) {
      if (!e.alive || e.team === c.team) continue;
      const d = dist2d(c.pos.x, c.pos.z, e.pos.x, e.pos.z);
      if (d > bestDist) continue;
      const dy = angleWrap(yawTo(c, e.pos.x, e.pos.z) - c.yaw);
      if (Math.abs(dy) > 1.35 && d > 3) continue;
      if (!canSee(match, c.pos.x, eyeY, c.pos.z, e.pos.x, e.pos.y + 1.2, e.pos.z)) continue;
      best = e;
      bestDist = d;
    }
  }
  if (best) {
    if (b.enemy !== best) {
      b.enemy = best;
      b.reactionAt = now + b.reaction;
      b.exposure = 0;
      b.retreated = false; // a fresh contact may be broken off from, once
    }
    b.lastSeenX = best.pos.x;
    b.lastSeenZ = best.pos.z;
    b.lastSeenAt = now;
    // Defenders who see the charge carrier name the site for the rotation.
    if (teamRole(match, c.team) === 'defend' && match.bomb.carrierId === best.id && !match.intel) {
      match.intel = { at: now };
    }
  } else if (b.enemy && now - b.lastSeenAt > 0.4) {
    b.enemy = null;
  }
  // Hearing: fresh noise from the other team becomes a place to check.
  for (const n of match.noises) {
    if (n.team === c.team) continue;
    if (dist2d(c.pos.x, c.pos.z, n.x, n.z) <= n.radius) {
      b.alertX = n.x;
      b.alertZ = n.z;
      b.alertAt = now;
    }
  }
}

function pathWish(c, dt) {
  const b = c.bot;
  const from = nearestNode(c.pos.x, c.pos.z);
  let targetNode = b.goalNode;
  if (b.viaNode >= 0 && from !== b.viaNode && b.viaNode !== b.goalNode) targetNode = b.viaNode;
  else if (b.viaNode >= 0) b.viaNode = -1;
  if (targetNode < 0) return { x: b.holdX, z: b.holdZ, arrived: dist2d(c.pos.x, c.pos.z, b.holdX, b.holdZ) < 1.1 };
  if (from === targetNode) {
    return { x: b.holdX, z: b.holdZ, arrived: dist2d(c.pos.x, c.pos.z, b.holdX, b.holdZ) < 1.1 };
  }
  const hop = nextHop(from, targetNode);
  const [hx, hz] = NODES[hop];
  return { x: hx, z: hz, arrived: false };
}

function moveToward(c, x, z, speed, dt, now) {
  const dx = x - c.pos.x;
  const dz = z - c.pos.z;
  const d = Math.hypot(dx, dz);
  if (d < 0.25) { stepBody(c, 0, 0, speed, false, dt); return true; }
  rotateToward(c, yawTo(c, x, z), 0, dt, 3.8);
  // Unstick: if commanded to move but barely travelling, hop and sidestep.
  const b = c.bot;
  if (now > b.stuckCheckAt) {
    if (dist2d(c.pos.x, c.pos.z, b.stuckX, b.stuckZ) < 0.35 && d > 1.5) b.jumpAt = now;
    b.stuckX = c.pos.x;
    b.stuckZ = c.pos.z;
    b.stuckCheckAt = now + 1.4;
  }
  stepBody(c, dx / d, dz / d, speed, now <= b.jumpAt + 0.05, dt);
  return false;
}

function aimAndFire(match, fx, audio, c, dt, now) {
  const b = c.bot;
  const e = b.enemy;
  b.exposure = Math.min(1, b.exposure + dt / 0.85);
  // Aim point wanders around the chest by an error that shrinks the longer
  // the target has been visible; skilled bots drift toward the head.
  const err = b.aimError * (1 - b.exposure * 0.72);
  const wobble = Math.sin(now * 2.1 + c.id * 7) * err;
  const aimY = e.pos.y + (b.skill > 0.72 && dist2d(c.pos.x, c.pos.z, e.pos.x, e.pos.z) < 16 ? 1.52 : 1.22);
  const targetYaw = yawTo(c, e.pos.x + wobble * 6, e.pos.z) ;
  const dy = aimY - eyeHeight(c);
  const dxz = dist2d(c.pos.x, c.pos.z, e.pos.x, e.pos.z);
  const targetPitch = Math.atan2(dy, dxz) + Math.cos(now * 1.7 + c.id * 3) * err * 0.6;
  rotateToward(c, targetYaw, targetPitch, dt, 3.1);
  if (now < b.reactionAt) return;
  const held = currentWeapon(c);
  if (!held) return;
  if (held.mag === 0) { startReload(c, now, audio); return; }
  if (b.burstLeft <= 0) {
    if (now < b.nextBurstAt) return;
    b.burstLeft = match.rng.int(2, 5);
  }
  if (tryShoot(match, fx, audio, c, now, match.rng)) {
    b.burstLeft -= 1;
    if (b.burstLeft <= 0) b.nextBurstAt = now + match.rng.range(0.24, 0.55);
  }
}

export function updateBot(match, fx, audio, c, dt, now) {
  const b = c.bot;
  if (!b || !c.alive) return;
  b.channeling = null;
  perceive(match, c, now);
  const role = teamRole(match, c.team);
  const phase = match.phase;
  c.crouch = false;

  if (phase !== 'live' && phase !== 'planted') { stepBody(c, 0, 0, SPEED_RUN, false, dt); return; }

  // A visible enemy interrupts everything but a channel.
  if (b.enemy && match.bomb.planterChannelId !== c.id && match.bomb.defuserId !== c.id) {
    b.state = 'engage';
  }

  if (b.state === 'engage' && b.enemy) {
    // Wounded and still taking fire, a bot breaks off instead of trading
    // to the death: it backpedals from the threat for a breath — gun up,
    // reloading if dry — then re-engages from where the retreat left it.
    if (c.health <= 30 && !b.retreated) { b.retreated = true; b.retreatUntil = now + 1.5; }
    if (now < b.retreatUntil) {
      const dx = c.pos.x - b.enemy.pos.x;
      const dz = c.pos.z - b.enemy.pos.z;
      const dl = Math.hypot(dx, dz) || 1;
      stepBody(c, dx / dl, dz / dl, SPEED_RUN * 0.9, false, dt);
      const heldNow = currentWeapon(c);
      if (heldNow && heldNow.mag < 6) startReload(c, now, audio);
      aimAndFire(match, fx, audio, c, dt, now);
      return;
    }
    aimAndFire(match, fx, audio, c, dt, now);
    // Strafe between bursts, hold ground while firing.
    if (now > b.strafeFlipAt) { b.strafeDir = -b.strafeDir; b.strafeFlipAt = now + match.rng.range(0.55, 1.1); }
    const firing = b.burstLeft > 0;
    const side = b.strafeDir * (firing ? 0.45 : 1);
    const px = Math.cos(c.yaw) * side;
    const pz = -Math.sin(c.yaw) * side;
    const back = dist2d(c.pos.x, c.pos.z, b.enemy.pos.x, b.enemy.pos.z) < 6 ? 0.4 : 0;
    stepBody(c, px + Math.sin(c.yaw) * back, pz + Math.cos(c.yaw) * back, SPEED_RUN * 0.85, false, dt);
    // Entry flash: the first attacker through a site door flashes it, once.
    return;
  }
  if (b.state === 'engage' && !b.enemy) {
    b.state = 'advance';
    if (now - b.lastSeenAt < 3) {
      // Push the last known position before giving the angle up.
      moveToward(c, b.lastSeenX, b.lastSeenZ, SPEED_WALK, dt, now);
      return;
    }
  }

  // The charge is down: its carrier plants, the rest cover; defenders
  // converge and one defuses under cover.
  if (phase === 'planted') {
    const bombSite = match.bomb.site;
    if (role === 'attack') {
      const points = POST_PLANT[bombSite];
      const point = points[c.id % points.length];
      if (dist2d(c.pos.x, c.pos.z, point[0], point[1]) > 1.2) {
        b.goalNode = nearestNode(point[0], point[1]);
        b.holdX = point[0]; b.holdZ = point[1];
        const wish = pathWish(c, dt);
        moveToward(c, wish.x, wish.z, SPEED_RUN, dt, now);
      } else {
        stepBody(c, 0, 0, SPEED_RUN, false, dt);
        rotateToward(c, yawTo(c, match.bomb.x, match.bomb.z), 0, dt);
        c.crouch = c.id % 2 === 0;
        if (match.bomb.defuserId >= 0 && c.grenades.frag > 0 && dist2d(c.pos.x, c.pos.z, match.bomb.x, match.bomb.z) < 15) {
          c.yaw = yawTo(c, match.bomb.x, match.bomb.z);
          throwGrenade(match, fx, audio, c, 'frag', now);
        }
      }
      return;
    }
    // Defenders retake.
    if (b.defuseAssigned || aliveOf(match, c.team).every((t) => t === c || !t.bot || t.bot.defuseAssigned)) {
      if (dist2d(c.pos.x, c.pos.z, match.bomb.x, match.bomb.z) > 1.5) {
        b.goalNode = nearestNode(match.bomb.x, match.bomb.z);
        b.holdX = match.bomb.x; b.holdZ = match.bomb.z;
        const wish = pathWish(c, dt);
        moveToward(c, wish.x, wish.z, SPEED_RUN, dt, now);
      } else {
        stepBody(c, 0, 0, SPEED_RUN, false, dt);
        rotateToward(c, yawTo(c, match.bomb.x, match.bomb.z), -0.4, dt);
        b.channeling = 'defuse';
      }
    } else {
      // Cover the defuser from the site's edge.
      const cover = POST_PLANT[bombSite][(c.id + 1) % POST_PLANT[bombSite].length];
      if (dist2d(c.pos.x, c.pos.z, cover[0], cover[1]) > 1.4) {
        b.goalNode = nearestNode(cover[0], cover[1]);
        b.holdX = cover[0]; b.holdZ = cover[1];
        const wish = pathWish(c, dt);
        moveToward(c, wish.x, wish.z, SPEED_RUN, dt, now);
      } else {
        stepBody(c, 0, 0, SPEED_RUN, false, dt);
        rotateToward(c, yawTo(c, match.bomb.x, match.bomb.z), 0, dt);
      }
    }
    return;
  }

  // Live phase, no contact: work the plan.
  if (role === 'attack') {
    const isCarrier = match.bomb.carrierId === c.id;
    const site = SITES[match.planSite];
    if (isCarrier) {
      b.goalNode = match.planSite === 'A' ? 17 : 16;
      b.holdX = site.x; b.holdZ = site.z;
    }
    const wish = pathWish(c, dt);
    const atSite = dist2d(c.pos.x, c.pos.z, site.x, site.z) < site.radius + 0.6;
    if (isCarrier && atSite) {
      stepBody(c, 0, 0, SPEED_RUN, false, dt);
      b.channeling = 'plant';
      return;
    }
    if (!isCarrier && atSite && match.bomb.carrierId >= 0) {
      // Set up a crossfire and wait for the plant.
      const points = POST_PLANT[match.planSite];
      const point = points[c.id % points.length];
      b.holdX = point[0]; b.holdZ = point[1];
      if (dist2d(c.pos.x, c.pos.z, point[0], point[1]) > 1.2) moveToward(c, point[0], point[1], SPEED_RUN, dt, now);
      else { stepBody(c, 0, 0, SPEED_RUN, false, dt); rotateToward(c, yawTo(c, site.x, site.z), 0, dt); }
      return;
    }
    // Flash the site entry on the way in, once per round.
    if (!b.usedUtility && c.grenades.flash > 0 && dist2d(c.pos.x, c.pos.z, site.x, site.z) < 13) {
      b.usedUtility = true;
      c.yaw = yawTo(c, site.x, site.z);
      c.pitch = 0.15;
      throwGrenade(match, fx, audio, c, 'flash', now);
    }
    moveToward(c, wish.x, wish.z, SPEED_RUN, dt, now);
    return;
  }

  // Defenders: get to the hold point, then hold it; rotate when the other
  // site is confirmed hot (intel from a sighting, or two teammates down
  // there, or the charge heard planting — handled by the planted phase).
  const wish = pathWish(c, dt);
  if (!wish.arrived) {
    moveToward(c, wish.x, wish.z, SPEED_RUN, dt, now);
    return;
  }
  stepBody(c, 0, 0, SPEED_RUN, false, dt);
  const watch = b.watchNode >= 0 ? NODES[b.watchNode] : [b.holdX, b.holdZ];
  rotateToward(c, yawTo(c, watch[0], watch[1]), 0, dt, 1.6);
  c.crouch = c.id % 3 === 0;
  // On a fresh alert near the other site, one holding defender rotates.
  if (match.intel && b.assignment !== 'mid' && now - b.alertAt < 4 && c.id % 2 === 0) {
    const other = b.assignment === 'A' ? 'B' : 'A';
    const alertNearOther = dist2d(b.alertX, b.alertZ, SITES[other].x, SITES[other].z) < 12;
    if (alertNearOther) {
      b.assignment = other;
      const point = HOLD_POINTS[other][c.id % HOLD_POINTS[other].length];
      b.holdX = point[0]; b.holdZ = point[1];
      b.goalNode = nearestNode(point[0], point[1]);
      b.watchNode = other === 'A' ? 17 : 16;
    }
  }
}
