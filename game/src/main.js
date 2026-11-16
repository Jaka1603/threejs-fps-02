// COPPERLINE — boot and the one loop. A fixed 60 Hz simulation (director,
// player, bots, effects) feeds a render at display rate; camera, view
// model and HUD are posed from simulation state every frame. The ?shot=
// entry points stage deterministic scenes for the maker's screenshots.
import * as THREE from 'three';
import { PALETTE, ROUND, WEAPONS } from './config.js';
import { Rng } from './rng.js';
import { createMatch } from './state.js';
import { buildGraph, buildWorld } from './map.js';
import { createAudio } from './audio.js';
import { createEffects } from './effects.js';
import { buildViewModel, currentWeapon, eyeHeight, poseActor, setViewWeapon } from './actors.js';
import { createInput } from './input.js';
import { updatePlayer } from './player.js';
import { updateBot } from './bots.js';
import { buyItem, setupMatch, startMatch, startRound, updateDirector } from './rounds.js';
import { resolveGrenade, spreadFor, tryShoot } from './combat.js';
import { createHud } from './hud.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.outputColorSpace = THREE.SRGBColorSpace;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 42, 135);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 520);
scene.add(camera);

buildWorld(scene);
buildGraph();

const audio = createAudio();
const fx = createEffects(scene);
const match = createMatch(new Rng(seed * 7919 + 17));
setupMatch(match, scene);
const player = match.player;
const viewModel = buildViewModel(camera);

let started = false;
let overlayMode = 'menu'; // menu | hidden | paused | end
let buyDismissed = false;
let lastPhase = match.phase;
let spectateIndex = 0;
const simPresses = [];

const hud = createHud((key) => {
  const refusal = buyItem(match, player, key);
  if (refusal) audio.denied();
  else audio.buy();
});

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayCopy = document.getElementById('overlay-copy');
const playButton = document.getElementById('play');

function showOverlay(mode, title, copy, button) {
  overlayMode = mode;
  overlayTitle.textContent = title;
  overlayCopy.textContent = copy;
  playButton.textContent = button;
  overlay.hidden = false;
}
function hideOverlay() {
  overlayMode = 'hidden';
  overlay.hidden = true;
}

playButton.addEventListener('click', () => {
  audio.unlock();
  if (overlayMode === 'menu' || overlayMode === 'end') {
    started = true;
    startMatch(match);
  }
  input.requestLock();
});

const input = createInput(renderer.domElement, (locked) => {
  if (shot) return;
  if (locked) {
    hideOverlay();
  } else if (started && match.phase !== 'matchEnd') {
    showOverlay('paused', 'PAUSED', 'The round clock keeps the match honest — click to jump back in.', 'Resume');
  }
});
renderer.domElement.addEventListener('mousedown', () => {
  if (!player.alive && started) spectateIndex += 1;
});

// One simulation step. Bots read the noise the player and earlier bots made
// this step; the noise list is cleared at the end of the step.
function step(dt) {
  match.time += dt;
  const now = match.time;
  if (started && !shot) {
    if (player.alive) updatePlayer(match, fx, audio, player, input, simPresses, dt, now);
    for (const c of match.combatants) if (c.bot) updateBot(match, fx, audio, c, dt, now);
  }
  updateDirector(match, fx, audio, input, dt, now);
  fx.update(dt, now, (slot) => resolveGrenade(match, fx, audio, slot, now));
  for (const c of match.combatants) poseActor(c, dt, now);
  match.noises.length = 0;
}

let accumulator = 0;
let lastTime = performance.now();
let bobPhase = 0;
let currentFov = 74;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min((nowMs - lastTime) / 1000, 0.1);
  lastTime = nowMs;

  // Per-frame input routing: buy hotkeys first while the menu is up, the
  // rest falls through to the simulation's press queue.
  const presses = input.takePressed();
  if (hud.buyOpen) hud.handleBuyKeys(presses);
  for (const code of presses) {
    if (code === 'KeyB' && match.phase === 'buy') buyDismissed = !buyDismissed;
    simPresses.push(code);
  }
  if (match.phase !== lastPhase) {
    buyDismissed = false;
    lastPhase = match.phase;
    if (match.phase === 'matchEnd' && overlayMode !== 'end') {
      if (document.pointerLockElement) document.exitPointerLock();
      const won = match.matchWinner === player.team;
      showOverlay('end', won ? 'MATCH WON' : 'MATCH LOST',
        `Final score ${match.scores.wardens} — ${match.scores.jackals}. ${won ? 'The yard is yours.' : 'The Jackals take the yard this time.'} Play again to run it back.`,
        'Play again');
    }
  }
  hud.setBuyOpen(started && match.phase === 'buy' && overlayMode === 'hidden' && !buyDismissed && player.alive);
  hud.showScoreboard(input.state.keys.has('Tab') && started);

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP && steps < 5) {
    step(FIXED_STEP);
    accumulator -= FIXED_STEP;
    steps += 1;
  }
  if (accumulator > FIXED_STEP * 5) accumulator = 0;

  poseCamera(dt);
  hud.update(match, match.time, viewState());
  renderer.render(scene, camera);
}

function viewState() {
  const held = currentWeapon(player);
  const scoped = started && player.alive && input.aiming && held && WEAPONS[held.key].scoped;
  return {
    spreadPx: player.alive && held ? spreadFor(player, WEAPONS[held.key]) * 620 : 0,
    scoped: !!scoped,
    camera,
    spectating: started && !player.alive && (match.phase === 'live' || match.phase === 'planted') ? spectateTarget()?.callsign : null,
  };
}

function spectateTarget() {
  const mates = match.combatants.filter((c) => c.team === player.team && c.alive && !c.isPlayer);
  if (!mates.length) return null;
  return mates[spectateIndex % mates.length];
}

let headlessView = null;

// The camera sits inside the viewed fighter's head, so that fighter's
// head gear is hidden while viewed through — otherwise the underside of
// its own helmet fills the top of the frame — and restored afterwards.
function setHeadVisible(c, visible) {
  const p = c.parts;
  if (!p) return;
  for (const part of [p.head, p.helmet, p.visorMesh, p.brim]) {
    if (part) part.visible = visible;
  }
}

function poseCamera(dt) {
  let view = player;
  if (started && !player.alive && (match.phase === 'live' || match.phase === 'planted' || match.phase === 'roundEnd')) {
    view = spectateTarget() || player;
  }
  if (headlessView !== view) {
    if (headlessView) setHeadVisible(headlessView, true);
    setHeadVisible(view, false);
    headlessView = view;
  }
  const eye = eyeHeight(view);
  camera.position.set(view.pos.x, eye, view.pos.z);
  const kick = view.isPlayer ? (player.viewKick || 0) : 0;
  camera.rotation.set(view.pitch + kick, view.yaw, 0, 'YXZ');
  camera.updateMatrixWorld(); // the HUD projects damage numbers with this camera

  const held = currentWeapon(player);
  const wantFov = viewState().scoped ? 27 : input.aiming && player.alive ? 58 : 74;
  currentFov += (wantFov - currentFov) * Math.min(1, dt * 11);
  camera.fov = currentFov;
  camera.updateProjectionMatrix();

  // View model: hidden while scoped or spectating; bobbed by stride and
  // kicked by recoil otherwise.
  const showVm = started && player.alive && view === player && !viewState().scoped;
  viewModel.group.visible = !!showVm;
  if (showVm && held) {
    setViewWeapon(viewModel, held.key);
    const speed = Math.hypot(player.vel.x, player.vel.z);
    if (player.onGround && speed > 0.4) bobPhase += dt * speed * 1.7;
    viewModel.group.position.set(
      0.25 + Math.sin(bobPhase * 0.5) * 0.006 * speed,
      -0.235 + Math.abs(Math.sin(bobPhase)) * 0.011 * Math.min(1, speed / 4),
      -0.52 + (player.viewKick || 0) * 1.5,
    );
    viewModel.group.rotation.x = (player.viewKick || 0) * 1.1;
    if (player.reloadUntil > match.time) {
      viewModel.group.rotation.x -= 0.5;
      viewModel.group.position.y -= 0.05;
    }
  }
}

// ---- Screenshot staging -----------------------------------------------------
// Each shot builds a real match in a named state, settles the simulation
// so poses are natural, then freezes on a composed frame.

function settleSteps(n) {
  for (let i = 0; i < n; i += 1) step(FIXED_STEP);
}

function placeAt(c, x, z, yaw, pitch = 0) {
  c.pos.x = x;
  c.pos.z = z;
  c.pos.y = 0;
  c.yaw = yaw;
  c.pitch = pitch;
}

function yawFacing(fromX, fromZ, toX, toZ) {
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

// Aim a fighter at a point in the world, chest height by default.
function aimAt(c, x, z, height = 1.15) {
  const dist = Math.hypot(x - c.pos.x, z - c.pos.z);
  c.yaw = yawFacing(c.pos.x, c.pos.z, x, z);
  c.pitch = Math.atan2(height - eyeHeight(c), dist);
}

// Loose one real round from a fighter through the combat path, aimed at a
// world point: tracer, muzzle flash, impact sparks and hit resolution are
// the game's own, frozen mid-flight by the shot's still frame.
function fireAtPoint(c, x, z, height = 1.15) {
  aimAt(c, x, z, height);
  tryShoot(match, fx, audio, c, match.time, match.rng);
}

// A smoke cloud staged for depth: spawned before the settle so the
// effects update ramps its opacity, registered like a real thrown smoke.
function stageSmoke(x, z) {
  fx.spawnSmoke(x, 0, z, 3.4, 30, match.time);
  match.smokes.push({ x, z, radius: 3.4, until: match.time + 30 });
}

function stageShot(name) {
  started = true;
  hideOverlay();
  if (name === 'menu') {
    showOverlay('menu', 'COPPERLINE',
      'A round-based tactical shooter. Plant the charge on site A or B — or defend them. Win rounds, earn money, buy rifles, armour and grenades. First to 7 rounds takes the match; sides swap at the half.',
      'Play');
    match.round = 1;
    // The title camera stands on the z = 11 band wall (top at y = 3.4):
    // the whole yard falls away north behind the panel — mid lane, link
    // row, both site colours, the crane, the silos and the lit skyline.
    player.pos.x = 0;
    player.pos.y = 3.4;
    player.pos.z = 11;
    player.yaw = 0.3;
    player.pitch = -0.04;
    const spawnsA = [[-3, 27], [3, 27], [-6, 28.5], [6, 28.5]];
    const spawnsD = [[0, -29], [-3, -28], [3, -28], [-6, -29.5]];
    match.combatants.filter((c) => c.team === 'wardens' && !c.isPlayer)
      .forEach((c, i) => placeAt(c, spawnsA[i][0], spawnsA[i][1], 0.3 - i * 0.2));
    match.combatants.filter((c) => c.team === 'jackals')
      .forEach((c, i) => placeAt(c, spawnsD[i % spawnsD.length][0] + (i > 3 ? 3 : 0), spawnsD[i % spawnsD.length][1], Math.PI));
    settleSteps(24);
    match.announcements.length = 0;
    viewModel.group.visible = false; // a title screen carries no weapon
    player.group.visible = false; // nor the player's own figure behind it
    camera.fov = 69;
    camera.updateProjectionMatrix();
    camera.position.set(player.pos.x, eyeHeight(player), player.pos.z);
    camera.rotation.set(player.pitch, player.yaw, 0, 'YXZ');
    hud.update(match, match.time, { spreadPx: 0, scoped: false, spectating: null });
    return;
  }
  startMatch(match);
  const mates = match.combatants.filter((c) => c.team === 'wardens' && !c.isPlayer);
  const foes = match.combatants.filter((c) => c.team === 'jackals');

  if (name === 'buy') {
    // A mid-match buy: the rifle and vest are already owned, one frag is
    // in the pouch, and what is left does not stretch to the Longbow —
    // the menu shows owned, counted, affordable and out-of-reach states
    // in a single frame, over the spawn plaza at dusk.
    player.weapons.primary = { key: 'vk', mag: 30, reserve: 90 };
    player.currentSlot = 'primary';
    player.armorPts = 100;
    player.grenades.frag = 1;
    player.money = 2900;
    match.phaseTime = 9;
    placeAt(player, 0, 27.4, 0.06);
    placeAt(mates[0], -2.6, 26.4, 0.5);
    placeAt(mates[1], 2.8, 26.8, -0.4);
    placeAt(mates[2], -5.4, 28.2, 0.9);
    placeAt(mates[3], 5.6, 28.4, -0.8);
    settleSteps(10);
    match.phaseTime = 9;
    match.announcements.length = 0;
    hud.setBuyOpen(true);
  } else if (name === 'play') {
    match.phase = 'live';
    match.round = 6;
    match.scores.wardens = 3;
    match.scores.jackals = 2;
    player.weapons.primary = { key: 'vk', mag: 18, reserve: 60 };
    player.currentSlot = 'primary';
    player.health = 78;
    player.armorPts = 62;
    player.money = 2350;
    player.grenades.frag = 1;
    player.grenades.flash = 1;
    // The cover frame: a mid-lane firefight at six metres. The player
    // holds the south side of the z = -1 door; a Jackal runner crosses
    // the link row through the doorway, a second Jackal north of the
    // door fires back, a Warden mate shoots over the player's shoulder,
    // and the crane's hanging container rides the top of the frame.
    placeAt(player, -2.2, 2.4, yawFacing(-2.2, 2.4, 1.7, -2.3), 0.01);
    mates[0].weapons.primary = { key: 'vk', mag: 24, reserve: 60 };
    mates[0].currentSlot = 'primary';
    placeAt(mates[0], -4.8, 5.6, yawFacing(-4.8, 5.6, 1.7, -2.3));
    placeAt(mates[1], 4.2, 7.5, yawFacing(4.2, 7.5, 8, -2));
    placeAt(mates[2], -16, -6, yawFacing(-16, -6, -17, -19));
    placeAt(mates[3], 14, -8, yawFacing(14, -8, 17, -19));
    const runner = foes[0];
    placeAt(runner, 1.7, -2.3, yawFacing(1.7, -2.3, 9, -7));
    runner.vel.x = 3.0;
    runner.vel.z = -0.6;
    foes[1].weapons.primary = { key: 'raptor', mag: 20, reserve: 60 };
    foes[1].currentSlot = 'primary';
    placeAt(foes[1], 0.5, -7.0, yawFacing(0.5, -7.0, -2.2, 2.4));
    placeAt(foes[2], -13, -15, yawFacing(-13, -15, -17, -19));
    placeAt(foes[3], 21, -22, yawFacing(21, -22, 17, -19));
    foes[4].alive = false;
    foes[4].deathAt = match.time - 2;
    placeAt(foes[4], -20, -20, 0);
    match.killfeed.push({ killer: 'YOU', killerTeam: 'wardens', victim: foes[4].callsign, victimTeam: 'jackals', weapon: 'vk', headshot: true, at: match.time - 1.2 });
    // Smoke east of the door, clear of the sightline: depth for the
    // frame and the game's own sight-block, ramped up during the settle.
    stageSmoke(8.0, 0.5);
    settleSteps(30);
    match.roundTimeLeft = 74;
    runner.vel.x = 3.0;
    runner.vel.z = -0.6;
    // Post-settle: drop the stale round banner, then trade real rounds.
    // The player's two-round burst goes first and ages past its own
    // muzzle flash — a flash sprite half a metre from the lens would
    // swallow the runner whole — while its casings, sparks, dust and
    // damage numbers live on; the mate and the second Jackal fire last,
    // so the frame keeps their tracers and distant flashes instead.
    match.announcements.length = 0;
    fireAtPoint(player, runner.pos.x, runner.pos.z, 1.25);
    fx.update(0.045, match.time + 0.045, () => {});
    match.time += 0.045;
    player.nextShotAt = 0;
    fireAtPoint(player, runner.pos.x, runner.pos.z, 1.3);
    fx.update(0.06, match.time + 0.06, () => {});
    match.time += 0.06;
    fireAtPoint(mates[0], runner.pos.x, runner.pos.z, 1.1);
    fireAtPoint(foes[1], player.pos.x + 2.1, player.pos.z, 1.25);
    for (const c of match.combatants) poseActor(c, 0.15, match.time);
    match.lastHitAt = match.time - 0.02;
    fx.update(0.02, match.time + 0.02, () => {});
  } else if (name === 'plant') {
    match.phase = 'planted';
    match.round = 5;
    match.scores.wardens = 3;
    match.scores.jackals = 1;
    player.weapons.primary = { key: 'vk', mag: 22, reserve: 44 };
    player.currentSlot = 'primary';
    player.health = 64;
    player.armorPts = 40;
    player.money = 3100;
    match.bomb.state = 'planted';
    match.bomb.planted = true;
    match.bomb.site = 'A';
    match.bomb.x = 16.4;
    match.bomb.z = -18.2;
    match.bomb.timer = 23.5;
    // The objective frame, close: the player covers site A's charge from
    // four metres south while a Jackal kneels on it, halfway through a
    // defuse — and shoots him for it: the channel bar, the blinking
    // charge, the defuser flinching under the hit and the site ring all
    // in one frame, a second Jackal pushing the east door behind.
    placeAt(player, 16.9, -21.8, yawFacing(16.9, -21.8, 17.4, -17.3), -0.08);
    const defuser = foes[1];
    placeAt(defuser, 17.4, -17.3, yawFacing(17.4, -17.3, 16.4, -18.2), -0.15);
    defuser.crouch = true;
    defuser.crouchAmt = 1;
    placeAt(foes[0], 22.5, -12.5, yawFacing(22.5, -12.5, 17, -19));
    foes[0].vel.x = -2.6;
    foes[0].vel.z = -1.4;
    placeAt(foes[2], 24.5, -20.5, yawFacing(24.5, -20.5, 17, -19));
    placeAt(mates[0], 12.0, -27.5, yawFacing(12.0, -27.5, 17, -19));
    placeAt(mates[1], 23.5, -23.5, yawFacing(23.5, -23.5, 17, -19));
    mates[2].alive = false;
    mates[2].deathAt = match.time - 3;
    placeAt(mates[2], 18, -10, 0);
    match.killfeed.push({ killer: foes[0].callsign, killerTeam: 'jackals', victim: mates[2].callsign, victimTeam: 'wardens', weapon: 'raptor', headshot: false, at: match.time - 0.8 });
    settleSteps(6);
    foes[0].vel.x = -2.6;
    foes[0].vel.z = -1.4;
    defuser.crouchAmt = 1;
    // Trade fire around the defuse: the player's round lands on the
    // defuser himself first — flinch, sparks, dust, the damage number —
    // and ages past its own muzzle flash; then the mate across the site
    // and the pusher exchange the tracers that stay in the frame.
    fireAtPoint(player, defuser.pos.x, defuser.pos.z, 0.95);
    fx.update(0.06, match.time + 0.06, () => {});
    match.time += 0.06;
    fireAtPoint(mates[1], foes[0].pos.x, foes[0].pos.z, 1.1);
    fireAtPoint(foes[0], player.pos.x + 1.3, player.pos.z, 1.25);
    for (const c of match.combatants) poseActor(c, 0.15, match.time);
    fx.update(0.02, match.time + 0.02, () => {});
    // The steep down-aim would clip the player's own torso into the
    // near plane; the title shot hides the figure for the same reason.
    player.group.visible = false;
    // The director clears an unattended defuse while settling, so the
    // channel state is applied after the settle, banner queue emptied.
    // The player has just taken a hit covering the site: the damage
    // vignette is the game's own, driven by lastHurtAt.
    match.bomb.defuserId = defuser.id;
    match.bomb.defuseProgress = 0.55;
    player.lastHurtAt = match.time - 0.15;
    match.announcements.length = 0;
  }
  poseCamera(0.016);
  hud.update(match, match.time, viewState());
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Hook for automated playtests: the state of the running match, nothing else.
window.__copperline = { match };

if (shot) {
  stageShot(shot);
  let painted = 0;
  const paint = () => {
    requestAnimationFrame(paint);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) window.__shotReady = true;
  };
  requestAnimationFrame(paint);
} else {
  requestAnimationFrame(frame);
}
