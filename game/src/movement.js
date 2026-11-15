// Body physics shared by the player and the bots: ground friction and
// acceleration in the Source style, gravity, jumping, stepping up onto low
// crates, and sliding collision against the map's boxes. Accuracy depends on
// this module — spreadFor in combat.js reads the velocity it produces.
import { groundAt, moveCircle } from './map.js';

export const SPEED_RUN = 4.6;
export const SPEED_WALK = 2.35;
export const SPEED_CROUCH = 1.55;
const FRICTION = 9.5;
const ACCEL = 11;
const AIR_ACCEL = 0.35;
const GRAVITY = 14.5;
const JUMP_VEL = 4.9;
const RADIUS = 0.42;

// Steps one fighter. wishX/wishZ is the desired travel direction (world
// space, any length), wishSpeed the speed cap for the current stance.
// jump is an edge: true only on the tick the jump key goes down.
export function stepBody(c, wishX, wishZ, wishSpeed, jump, dt) {
  const groundY = groundAt(c.pos.x, c.pos.z, c.pos.y);
  c.onGround = c.pos.y <= groundY + 0.001 && c.vel.y <= 0.01;

  if (c.onGround) {
    // Friction first, then accelerate toward the wish direction.
    const speed = Math.hypot(c.vel.x, c.vel.z);
    if (speed > 0) {
      const drop = speed * FRICTION * dt;
      const scale = Math.max(0, speed - drop) / speed;
      c.vel.x *= scale;
      c.vel.z *= scale;
    }
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      const nx = wishX / wishLen;
      const nz = wishZ / wishLen;
      const proj = c.vel.x * nx + c.vel.z * nz;
      const add = Math.min(ACCEL * wishSpeed * dt, wishSpeed - proj);
      if (add > 0) {
        c.vel.x += nx * add;
        c.vel.z += nz * add;
      }
    }
    if (jump) {
      c.vel.y = JUMP_VEL;
      c.onGround = false;
    } else {
      c.vel.y = 0;
      c.pos.y = groundY;
    }
  } else {
    const wishLen = Math.hypot(wishX, wishZ);
    if (wishLen > 0.001) {
      const nx = wishX / wishLen;
      const nz = wishZ / wishLen;
      const proj = c.vel.x * nx + c.vel.z * nz;
      const add = Math.min(AIR_ACCEL * wishSpeed * dt * 10, wishSpeed - proj);
      if (add > 0) {
        c.vel.x += nx * add;
        c.vel.z += nz * add;
      }
    }
    c.vel.y -= GRAVITY * dt;
  }

  moveCircle(c.pos, RADIUS, c.vel.x * dt, c.vel.z * dt, c.pos.y);
  c.pos.x = Math.max(-33.4, Math.min(33.4, c.pos.x));
  c.pos.z = Math.max(-33.4, Math.min(33.4, c.pos.z));
  if (!c.onGround || c.vel.y > 0) {
    c.pos.y += c.vel.y * dt;
    const floor = groundAt(c.pos.x, c.pos.z, c.pos.y);
    if (c.pos.y <= floor) {
      c.pos.y = floor;
      c.vel.y = 0;
      c.onGround = true;
    }
  }
  // Crouch pose eases toward its target so eye height and hit volumes move
  // smoothly instead of snapping.
  const target = c.crouch ? 1 : 0;
  c.crouchAmt += Math.max(-dt * 7, Math.min(dt * 7, target - c.crouchAmt));
}
