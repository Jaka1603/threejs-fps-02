// The human's controller: mouse look, WASD movement with walk and crouch
// stances, firing (full-auto while held, semi-auto per click), reload, weapon
// slots, grenade keys and footsteps. Round rules — when any of this is
// allowed — are the director's call; this module only turns keys into intent.
import { WEAPONS } from './config.js';
import { currentWeapon } from './actors.js';
import { startReload, throwGrenade, tryShoot } from './combat.js';
import { SPEED_CROUCH, SPEED_RUN, SPEED_WALK, stepBody } from './movement.js';
import { emitNoise } from './state.js';

const SENS = 0.0021;

// `presses` is the shared one-shot key queue for this frame; the controller
// always drains it, but only acts on it while fighting is allowed, so a key
// hit during the buy phase never leaks into the round.
export function updatePlayer(match, fx, audio, c, input, presses, dt, now) {
  const look = input.takeLook();
  c.yaw -= look.x * SENS;
  c.pitch -= look.y * SENS;
  c.pitch = Math.max(-1.45, Math.min(1.45, c.pitch));
  const pressedNow = presses.splice(0, presses.length);

  const keys = input.state.keys;
  const phase = match.phase;
  const canMove = phase === 'live' || phase === 'planted' || phase === 'roundEnd';
  const canFight = phase === 'live' || phase === 'planted';

  let wishX = 0;
  let wishZ = 0;
  let speed = SPEED_RUN;
  c.crouch = keys.has('ControlLeft') || keys.has('KeyC');
  if (c.crouch) speed = SPEED_CROUCH;
  else if (keys.has('ShiftLeft')) speed = SPEED_WALK;

  if (canMove && c.alive) {
    const fwd = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
    const strafe = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
    const sin = Math.sin(c.yaw);
    const cos = Math.cos(c.yaw);
    // Forward is (-sin, -cos); right is (cos, -sin).
    wishX = -sin * fwd + cos * strafe;
    wishZ = -cos * fwd - sin * strafe;
  }
  const jump = canMove && c.alive && keys.has('Space') && !c.jumpHeld;
  c.jumpHeld = keys.has('Space');
  stepBody(c, wishX, wishZ, c.alive ? speed : 0, jump && !c.crouch, dt);

  // Footsteps: running is loud, walking and crouching are silent.
  const dist = Math.hypot(c.vel.x, c.vel.z) * dt;
  c.stepCycle += dist;
  if (c.stepCycle > 2.3) {
    c.stepCycle = 0;
    if (speed === SPEED_RUN && c.onGround && c.alive) {
      emitNoise(match, c.pos.x, c.pos.z, 10, c.team, 'steps');
      audio.step(true);
    }
  }

  if (!canFight || !c.alive) { c.firingHeld = false; return; }

  for (const code of pressedNow) {
    if (code === 'KeyR') startReload(c, now, audio);
    else if (code === 'Digit1') switchSlot(c, 'primary', now);
    else if (code === 'Digit2') switchSlot(c, 'sidearm', now);
    else if (code === 'KeyQ') switchSlot(c, c.currentSlot === 'primary' ? 'sidearm' : 'primary', now);
    else if (code === 'Digit3') throwGrenade(match, fx, audio, c, 'frag', now);
    else if (code === 'Digit4') throwGrenade(match, fx, audio, c, 'flash', now);
    else if (code === 'Digit5') throwGrenade(match, fx, audio, c, 'smoke', now);
  }

  const held = currentWeapon(c);
  if (!held) return;
  const def = WEAPONS[held.key];
  if (input.firing && (def.auto || !c.firingHeld)) {
    tryShoot(match, fx, audio, c, now, match.rng);
  }
  c.firingHeld = input.firing;
}

export function switchSlot(c, slot, now) {
  if (c.currentSlot === slot || !c.weapons[slot]) return false;
  c.currentSlot = slot;
  c.reloadUntil = 0;
  c.reloadSlot = null;
  c.bloom = 0;
  c.drawUntil = now + WEAPONS[c.weapons[slot].key].drawTime * 0.6;
  return true;
}
