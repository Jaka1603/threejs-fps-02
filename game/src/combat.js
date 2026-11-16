// Combat resolution, shared by the player and every bot so a bullet means the
// same thing in any hands: spread from stance and motion, recoil bloom,
// hitscan rays tested against body volumes (head, chest, legs) and the map,
// distance falloff, armour, and the three grenades' effects.
import * as THREE from 'three';
import { ECONOMY, GRENADES, WEAPONS } from './config.js';
import { currentWeapon, eyeHeight, hitVolumes, newHitVolumes, HIT_ZONES } from './actors.js';
import { rayHitDistance, sightBlocked } from './map.js';
import { addMoney, emitNoise } from './state.js';

export function dirFromYawPitch(yaw, pitch, out) {
  const cp = Math.cos(pitch);
  out.set(-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp);
  return out;
}

// Current cone half-angle for a fighter's weapon: base accuracy, a heavy
// penalty for moving or airborne shots, a bonus for crouching, and bloom that
// builds while the trigger is held and decays when it is not. Standing still
// and crouched is the most accurate stance there is — that is the trade the
// whole gunplay model is built around.
export function spreadFor(c, def) {
  const speed = Math.hypot(c.vel.x, c.vel.z);
  const moveRatio = Math.min(1, speed / 4.6);
  let spread = def.spread + def.moveSpread * moveRatio * moveRatio + c.bloom;
  if (!c.onGround) spread += 0.045;
  if (c.crouchAmt > 0.5) spread *= 0.78;
  return spread;
}

const _origin = new THREE.Vector3();
const _dir = new THREE.Vector3();
const _end = new THREE.Vector3();
const _box = new THREE.Box3();
const _hitPoint = new THREE.Vector3();
const _volumes = newHitVolumes();
const _ray = new THREE.Ray();

function rayVsFighter(origin, dir, fighter, maxDist) {
  hitVolumes(fighter, _volumes);
  _ray.origin.copy(origin);
  _ray.direction.copy(dir);
  let best = maxDist;
  let zone = null;
  for (let i = 0; i < 3; i += 1) {
    const v = _volumes[i];
    _box.min.set(v[0], v[1], v[2]);
    _box.max.set(v[3], v[4], v[5]);
    const hit = _ray.intersectBox(_box, _hitPoint);
    if (hit) {
      const d = _hitPoint.distanceTo(origin);
      if (d < best) { best = d; zone = HIT_ZONES[i]; }
    }
  }
  return zone ? { dist: best, zone } : null;
}

function falloffAt(def, dist) {
  if (dist <= def.falloffStart) return 1;
  if (dist >= def.falloffEnd) return 0.45;
  const t = (dist - def.falloffStart) / (def.falloffEnd - def.falloffStart);
  return 1 - t * 0.55;
}

// Applies damage with armour rules and resolves death: kill credit and money,
// the killfeed entry, and the charge dropping from a dead carrier.
export function applyDamage(match, target, attacker, rawDamage, zone, weaponKey, now) {
  if (!target.alive || rawDamage <= 0) return false;
  let damage = rawDamage;
  if ((zone === 'chest' || zone === 'head') && target.armorPts > 0) {
    const absorbed = damage * 0.5;
    target.armorPts = Math.max(0, target.armorPts - absorbed);
    damage -= absorbed;
  }
  target.health -= damage;
  target.lastAttackerId = attacker ? attacker.id : -1;
  target.lastFromX = attacker ? attacker.pos.x : target.pos.x;
  target.lastFromZ = attacker ? attacker.pos.z : target.pos.z;
  target.lastHurtAt = now;
  target.hitFlash = 1;
  if (target.health > 0) return false;
  target.health = 0;
  target.alive = false;
  target.deaths += 1;
  target.deathAt = now;
  if (attacker && attacker !== target) {
    attacker.kills += 1;
    addMoney(attacker, ECONOMY.kill);
  }
  match.killfeed.push({
    killer: attacker ? attacker.callsign : '—',
    killerTeam: attacker ? attacker.team : null,
    victim: target.callsign,
    victimTeam: target.team,
    weapon: weaponKey,
    headshot: zone === 'head',
    at: now,
  });
  if (match.bomb.carrierId === target.id) {
    match.bomb.carrierId = -1;
    match.bomb.x = target.pos.x;
    match.bomb.z = target.pos.z;
    target.hasBomb = false;
  }
  if (match.bomb.defuserId === target.id) {
    match.bomb.defuserId = -1;
    match.bomb.defuseProgress = 0;
  }
  if (match.bomb.planterChannelId === target.id) {
    match.bomb.planterChannelId = -1;
    match.bomb.plantProgress = 0;
  }
  return true;
}

// Fires one shot (every pellet) for a fighter. Handles rate limits, magazine,
// dry fire, tracers, muzzle flash, impact particles, noise, recoil and bloom.
// Returns true when a round actually left the barrel.
export function tryShoot(match, fx, audio, c, now, rng) {
  const held = currentWeapon(c);
  if (!held || !c.alive) return false;
  const def = WEAPONS[held.key];
  if (now < c.nextShotAt || now < c.drawUntil || c.reloadUntil > now) return false;
  if (held.mag <= 0) {
    audio.dryFire();
    c.nextShotAt = now + 0.3;
    startReload(c, now, audio);
    return false;
  }
  held.mag -= 1;
  c.nextShotAt = now + 60 / def.rpm;
  const spread = spreadFor(c, def);
  _origin.set(c.pos.x, eyeHeight(c), c.pos.z);
  const muzzle = _end.set(c.pos.x, eyeHeight(c) - 0.12, c.pos.z);
  dirFromYawPitch(c.yaw, c.pitch, _dir);
  muzzle.addScaledVector(_dir, 0.55);
  fx.muzzle(muzzle, now);
  audio.shot(held.key, c.isPlayer ? 0 : Math.hypot(c.pos.x - match.player.pos.x, c.pos.z - match.player.pos.z));
  emitNoise(match, c.pos.x, c.pos.z, def.noise, c.team, 'shot');
  let anyHit = false;
  let anyKill = false;
  for (let pellet = 0; pellet < def.pellets; pellet += 1) {
    dirFromYawPitch(c.yaw, c.pitch, _dir);
    _dir.x += rng.jitter() * spread;
    _dir.y += rng.jitter() * spread;
    _dir.z += rng.jitter() * spread;
    _dir.normalize();
    const wallDist = rayHitDistance(_origin, _dir, def.range);
    let bestDist = wallDist;
    let bestFighter = null;
    let bestZone = null;
    for (const other of match.combatants) {
      if (other === c || !other.alive || other.team === c.team) continue;
      const hit = rayVsFighter(_origin, _dir, other, bestDist);
      if (hit) { bestDist = hit.dist; bestFighter = other; bestZone = hit.zone; }
    }
    _hitPoint.copy(_origin).addScaledVector(_dir, bestDist);
    fx.tracer(muzzle, _hitPoint, def.tracer, now);
    if (bestFighter) {
      const mult = bestZone === 'head' ? def.headMult : bestZone === 'legs' ? 0.75 : 1;
      const damage = def.damage * mult * falloffAt(def, bestDist);
      const died = applyDamage(match, bestFighter, c, damage, bestZone, held.key, now);
      anyHit = true;
      anyKill = anyKill || died;
      fx.impact(_hitPoint, _dir, 5, 1.4, now, 0xb0503c);
      // The shooter's own hits float their damage over the target.
      if (c.isPlayer) {
        match.floaters.push({ x: _hitPoint.x, y: _hitPoint.y + 0.3, z: _hitPoint.z, text: String(Math.round(damage)), kill: died, at: now });
        if (match.floaters.length > 12) match.floaters.shift();
      }
    } else if (wallDist < def.range) {
      fx.impact(_hitPoint, _dir, 4, 1.2, now);
    }
  }
  if (c.isPlayer && anyHit) {
    audio.hit(anyKill);
    match.lastHitAt = now;
    if (anyKill) match.lastKillAt = now;
  }
  // Recoil: the view kicks up and wanders; bloom grows per shot and is paid
  // back by spreadFor until the trigger is released (see decay in main loop).
  c.pitch += def.kick * (0.8 + rng.float() * 0.5);
  c.yaw += (rng.jitter() * def.kick) * 0.35;
  c.bloom = Math.min(def.bloomMax, c.bloom + def.bloomPerShot);
  c.viewKick = Math.min(0.05, (c.viewKick || 0) + def.kick * 1.6);
  return true;
}

export function startReload(c, now, audio) {
  const held = currentWeapon(c);
  if (!held) return false;
  const def = WEAPONS[held.key];
  if (held.mag >= def.mag || held.reserve <= 0 || c.reloadUntil > now) return false;
  c.reloadUntil = now + def.reloadTime;
  c.reloadSlot = c.currentSlot;
  if (c.isPlayer && audio) audio.reload();
  return true;
}

export function finishReload(c) {
  const held = c.weapons[c.reloadSlot];
  if (!held) { c.reloadUntil = 0; return; }
  const def = WEAPONS[held.key];
  const take = Math.min(def.mag - held.mag, held.reserve);
  held.mag += take;
  held.reserve -= take;
  c.reloadUntil = 0;
  c.reloadSlot = null;
}

// Throws a grenade from a fighter's hand along their aim. The fuse and the
// effect resolve in resolveGrenade when the effects pool reports it done.
export function throwGrenade(match, fx, audio, c, kind, now) {
  if (c.grenades[kind] <= 0 || !c.alive) return false;
  c.grenades[kind] -= 1;
  _origin.set(c.pos.x, eyeHeight(c) - 0.1, c.pos.z);
  dirFromYawPitch(c.yaw, c.pitch + 0.12, _dir);
  _dir.multiplyScalar(13.5);
  _dir.y += 2.6;
  fx.throwGrenade(kind, _origin, _dir, c.team, c);
  audio.throwPin();
  emitNoise(match, c.pos.x, c.pos.z, 6, c.team, 'throw');
  c.nextShotAt = Math.max(c.nextShotAt, now + 0.45);
  return true;
}

// Can `eye` see point (x, y, z)? Walls block, and so does any live smoke
// cloud the sight line passes through — smokes are how crossings are covered.
export function canSee(match, eyeX, eyeY, eyeZ, x, y, z) {
  if (sightBlocked(eyeX, eyeZ, x, z)) return false;
  for (const s of match.smokes) {
    if (match.time > s.until) continue;
    if (segmentNearPoint(eyeX, eyeZ, x, z, s.x, s.z, s.radius * 0.95)) return false;
  }
  return true;
}

function segmentNearPoint(x1, z1, x2, z2, px, pz, radius) {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const lenSq = dx * dx + dz * dz || 1;
  let t = ((px - x1) * dx + (pz - z1) * dz) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const cx = x1 + dx * t - px;
  const cz = z1 + dz * t - pz;
  return cx * cx + cz * cz < radius * radius;
}

// A grenade's fuse ended: apply its effect to the world.
export function resolveGrenade(match, fx, audio, slot, now) {
  const { kind, x, y, z } = slot;
  if (kind === 'frag') {
    const def = GRENADES.frag;
    fx.impact(new THREE.Vector3(x, y + 0.2, z), new THREE.Vector3(0, 1, 0), 26, 3.2, now, 0xffa050);
    fx.muzzle(new THREE.Vector3(x, y + 0.45, z), now); // the burst lights the yard for a frame
    audio.frag();
    emitNoise(match, x, z, 34, slot.team, 'explosion');
    for (const c of match.combatants) {
      if (!c.alive || c.team === slot.team) continue;
      const dist = Math.hypot(c.pos.x - x, c.pos.z - z);
      if (dist > def.radius) continue;
      if (!canSee(match, x, y + 0.6, z, c.pos.x, c.pos.y + 0.9, c.pos.z)) continue;
      const damage = def.damage * (1 - dist / (def.radius * 1.25));
      applyDamage(match, c, slot.thrower, damage, 'chest', 'frag', now);
    }
  } else if (kind === 'flash') {
    audio.flash();
    fx.impact(new THREE.Vector3(x, y + 0.3, z), new THREE.Vector3(0, 1, 0), 10, 1.5, now, 0xffffff);
    for (const c of match.combatants) {
      if (!c.alive || c.team === slot.team) continue;
      const dx = c.pos.x - x;
      const dz = c.pos.z - z;
      const dist = Math.hypot(dx, dz);
      if (dist > GRENADES.flash.radius) continue;
      // Looking at the burst costs the full blind; looking away, a glance.
      dirFromYawPitch(c.yaw, 0, _dir);
      const facing = (_dir.x * dx + _dir.z * dz) / (dist || 1);
      const los = canSee(match, x, y + 0.4, z, c.pos.x, eyeHeight(c), c.pos.z);
      if (!los) continue;
      const strength = facing > 0.35 ? 1 : facing > -0.2 ? 0.45 : 0.18;
      const duration = (2.6 - dist / GRENADES.flash.radius * 1.4) * strength;
      if (duration > 0.25) {
        c.blindUntil = Math.max(c.blindUntil, now + duration);
        c.blindPeak = Math.max(c.blindPeak, Math.min(1, duration / 2.2));
      }
    }
  } else if (kind === 'smoke') {
    audio.smokePop();
    fx.spawnSmoke(x, 0, z, GRENADES.smoke.radius, GRENADES.smoke.duration, now);
    match.smokes.push({ x, z, radius: GRENADES.smoke.radius, until: now + GRENADES.smoke.duration });
  }
}
