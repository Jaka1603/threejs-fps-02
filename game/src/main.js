// COPPERLINE — boot and the one loop. A fixed 60 Hz simulation (director,
// player, bots, effects) feeds a render at display rate; the camera, view
// model and HUD are posed from simulation state every frame. The ?shot=
// entry points stage deterministic scenes for the maker's screenshots: they
// set up real match state, settle it, render twice and freeze.
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
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.sky);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.fog), 30, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 220);
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
    spectating: started && !player.alive && (match.phase === 'live' || match.phase === 'planted') ? spectateTarget()?.callsign : null,
  };
}

function spectateTarget() {
  const mates = match.combatants.filter((c) => c.team === player.team && c.alive && !c.isPlayer);
  if (!mates.length) return null;
  return mates[spectateIndex % mates.length];
}

function poseCamera(dt) {
  let view = player;
  if (started && !player.alive && (match.phase === 'live' || match.phase === 'planted' || match.phase === 'roundEnd')) {
    view = spectateTarget() || player;
  }
  const eye = eyeHeight(view);
  camera.position.set(view.pos.x, eye, view.pos.z);
  const kick = view.isPlayer ? (player.viewKick || 0) : 0;
  camera.rotation.set(view.pitch + kick, view.yaw, 0, 'YXZ');

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
// Each shot builds a real match in a named state, settles the simulation so
// poses are natural, then freezes on a composed frame. Deterministic in the
// seed: the same URL always renders the same picture.

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

function stageShot(name) {
  started = true;
  hideOverlay();
  if (name === 'menu') {
    showOverlay('menu', 'COPPERLINE',
      'A round-based tactical shooter. Plant the charge on site A or B — or defend them. Win rounds, earn money, buy rifles, armour and grenades. First to 7 rounds takes the match; sides swap at the half.',
      'Play');
    match.round = 1;
    placeAt(player, 0, 25.5, 0.12);
    // The teams idle at their spawns behind the menu: wardens around the
    // player, jackals far north where the fog eats them.
    const spawnsA = [[-3, 27], [3, 27], [-6, 28.5], [6, 28.5]];
    const spawnsD = [[0, -29], [-3, -28], [3, -28], [-6, -29.5]];
    match.combatants.filter((c) => c.team === 'wardens' && !c.isPlayer)
      .forEach((c, i) => placeAt(c, spawnsA[i][0], spawnsA[i][1], 0.3 - i * 0.2));
    match.combatants.filter((c) => c.team === 'jackals')
      .forEach((c, i) => placeAt(c, spawnsD[i % spawnsD.length][0] + (i > 3 ? 3 : 0), spawnsD[i % spawnsD.length][1], Math.PI));
    settleSteps(24);
    camera.position.set(player.pos.x, eyeHeight(player), player.pos.z);
    camera.rotation.set(0.02, player.yaw, 0, 'YXZ');
    hud.update(match, match.time, { spreadPx: 0, scoped: false, spectating: null });
    return;
  }
  startMatch(match);
  const mates = match.combatants.filter((c) => c.team === 'wardens' && !c.isPlayer);
  const foes = match.combatants.filter((c) => c.team === 'jackals');

  if (name === 'buy') {
    player.money = 4150;
    match.phaseTime = 9;
    placeAt(player, 0, 27.4, 0.1);
    placeAt(mates[0], -2.6, 26.4, 0.5);
    placeAt(mates[1], 2.8, 26.8, -0.4);
    placeAt(mates[2], -5.4, 28.2, 0.9);
    placeAt(mates[3], 5.6, 28.4, -0.8);
    settleSteps(10);
    match.phaseTime = 9;
    hud.setBuyOpen(true);
  } else if (name === 'play') {
    match.phase = 'live';
    match.round = 6;
    match.scores.wardens = 3;
    match.scores.jackals = 2;
    match.roundTimeLeft = 74;
    player.weapons.primary = { key: 'vk', mag: 18, reserve: 60 };
    player.currentSlot = 'primary';
    player.health = 78;
    player.armorPts = 62;
    player.money = 2350;
    player.grenades.frag = 1;
    player.grenades.flash = 1;
    placeAt(player, -2.8, 5.5, yawFacing(-2.8, 5.5, 1.0, -5.0), 0.01);
    placeAt(mates[0], -4.5, 9.5, yawFacing(-4.5, 9.5, 0, -4));
    placeAt(mates[1], 3.4, 10.5, yawFacing(3.4, 10.5, 8, -2));
    placeAt(mates[2], -8.5, 1.5, yawFacing(-8.5, 1.5, -16, -6));
    placeAt(mates[3], 9.5, 4.5, yawFacing(9.5, 4.5, 16, -6));
    const runner = foes[0];
    placeAt(runner, 1.0, -5.0, yawFacing(1.0, -5.0, 9, -7));
    runner.vel.x = 3.0;
    runner.vel.z = -0.6;
    placeAt(foes[1], -0.5, -9.5, yawFacing(-0.5, -9.5, -2.8, 5.5));
    placeAt(foes[2], -13, -15, yawFacing(-13, -15, -17, -19));
    placeAt(foes[3], 21, -22, yawFacing(21, -22, 17, -19));
    foes[4].alive = false;
    foes[4].deathAt = match.time - 2;
    placeAt(foes[4], -20, -20, 0);
    match.killfeed.push({ killer: 'YOU', killerTeam: 'wardens', victim: foes[4].callsign, victimTeam: 'jackals', weapon: 'vk', headshot: true, at: match.time - 1.2 });
    settleSteps(6);
    runner.vel.x = 3.0;
    runner.vel.z = -0.6;
    // Post-settle: drop the stale round banner, then fire one live round at
    // the runner so the frozen frame carries tracer, flash and hitmarker.
    match.announcements.length = 0;
    const dist = Math.hypot(runner.pos.x - player.pos.x, runner.pos.z - player.pos.z);
    placeAt(player, -2.8, 5.5, yawFacing(-2.8, 5.5, runner.pos.x, runner.pos.z),
      Math.atan2(1.25 - eyeHeight(player), dist));
    match.lastHitAt = -10;
    tryShoot(match, fx, audio, player, match.time, match.rng);
    match.lastHitAt = match.time - 0.04;
    // Age the effects past the muzzle flash entirely: in a frozen frame its
    // point light would otherwise hang at low intensity forever (and wash
    // the sky under software rendering). Impact sparks live on.
    fx.update(0.06, match.time + 0.06, () => {});
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
    placeAt(player, 12.3, -14.6, yawFacing(12.3, -14.6, 16.4, -18.2), 0.02);
    const defuser = foes[1];
    placeAt(defuser, 16.9, -17.6, yawFacing(16.9, -17.6, 16.4, -18.2), -0.3);
    defuser.crouch = true;
    defuser.crouchAmt = 1;
    placeAt(foes[0], 22.5, -12.5, yawFacing(22.5, -12.5, 17, -19));
    foes[0].vel.x = -2.6;
    foes[0].vel.z = -1.4;
    placeAt(foes[2], 12.2, -18.2, yawFacing(12.2, -18.2, 17, -19));
    placeAt(mates[0], 13.2, -24.5, yawFacing(13.2, -24.5, 17, -19));
    placeAt(mates[1], 23.5, -23.5, yawFacing(23.5, -23.5, 17, -19));
    mates[2].alive = false;
    mates[2].deathAt = match.time - 3;
    placeAt(mates[2], 18, -10, 0);
    settleSteps(6);
    foes[0].vel.x = -2.6;
    foes[0].vel.z = -1.4;
    defuser.crouchAmt = 1;
    // The director clears an unattended defuse while settling, so the
    // channel state is applied after the settle, banner queue emptied.
    match.bomb.defuserId = defuser.id;
    match.bomb.defuseProgress = 0.35;
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
