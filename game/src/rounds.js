// The round director: owns the match flow — buy phase, live round, the
// planted charge, round and match results — plus the economy and every
// fighter's purchases. Combat happens elsewhere.
import { ARMOR_PRICE, ECONOMY, GRENADES, KIT_PRICE, ROUND, WEAPONS } from './config.js';
import { SITES, SPAWNS } from './map.js';
import { buildFigure, createCombatant, currentWeapon } from './actors.js';
import { createBot, planRound } from './bots.js';
import { finishReload } from './combat.js';
import { addMoney, aliveOf, announce, otherTeam } from './state.js';

const GRENADE_CAPS = { frag: 1, flash: 2, smoke: 1 };

export function setupMatch(match, scene) {
  match.combatants = [];
  for (let i = 0; i < 5; i += 1) {
    const c = createCombatant('wardens', i, i === 0);
    if (!c.isPlayer) c.bot = createBot(match.rng, i);
    buildFigure(c, scene, !c.isPlayer);
    match.combatants.push(c);
    if (c.isPlayer) match.player = c;
  }
  for (let i = 0; i < 5; i += 1) {
    const c = createCombatant('jackals', i, false);
    c.bot = createBot(match.rng, i + 5);
    buildFigure(c, scene, false);
    match.combatants.push(c);
  }
  match.bomb.state = 'carried';
}

export function startMatch(match) {
  match.scores.wardens = 0;
  match.scores.jackals = 0;
  match.lossStreak.wardens = 0;
  match.lossStreak.jackals = 0;
  match.attackTeam = 'wardens';
  match.round = 0;
  match.matchWinner = null;
  for (const c of match.combatants) {
    c.money = ECONOMY.start;
    c.kills = 0;
    c.deaths = 0;
    resetLoadout(c);
  }
  startRound(match);
}

function resetLoadout(c) {
  c.weapons.primary = null;
  c.weapons.sidearm = { key: 'p9', mag: WEAPONS.p9.mag, reserve: WEAPONS.p9.reserve };
  c.currentSlot = 'sidearm';
  c.grenades = { frag: 0, flash: 0, smoke: 0 };
  c.armorPts = 0;
  c.hasKit = false;
  c.hasBomb = false;
}

export function startRound(match) {
  match.round += 1;
  if (match.round === ROUND.halfAt + 1) {
    match.attackTeam = otherTeam(match.attackTeam);
    for (const c of match.combatants) {
      c.money = ECONOMY.start;
      resetLoadout(c);
    }
    announce(match, 'HALFTIME', 'Sides swap — fresh economy');
  }
  const attackSpawns = SPAWNS[match.attackTeam === 'wardens' ? 'attack' : 'defend'];
  const defendSpawns = SPAWNS[match.attackTeam === 'wardens' ? 'defend' : 'attack'];
  let ai = 0;
  let di = 0;
  for (const c of match.combatants) {
    const attacking = c.team === match.attackTeam;
    const spawn = attacking ? attackSpawns[ai++] : defendSpawns[di++];
    c.alive = true;
    c.health = 100;
    c.pos.x = spawn[0];
    c.pos.z = spawn[1];
    c.pos.y = 0;
    c.vel.x = 0; c.vel.y = 0; c.vel.z = 0;
    c.yaw = attacking ? 0 : Math.PI;
    c.pitch = 0;
    c.crouch = false;
    c.crouchAmt = 0;
    c.bloom = 0;
    c.blindUntil = 0;
    c.reloadUntil = 0;
    c.nextShotAt = 0;
    c.drawUntil = 0;
    if (!c.weapons.primary) c.currentSlot = 'sidearm';
    else c.currentSlot = 'primary';
    // Magazines are topped up from reserve between rounds; the reserve and
    // the armour a survivor kept are theirs to lose next round.
    for (const slot of ['primary', 'sidearm']) {
      const w = c.weapons[slot];
      if (!w) continue;
      const take = Math.min(WEAPONS[w.key].mag - w.mag, w.reserve);
      w.mag += take;
      w.reserve -= take;
    }
    if (c.bot) { c.bot.state = 'advance'; c.bot.enemy = null; }
  }
  // The charge goes to a random attacker; if that is the player, the HUD
  // says so — planting is the round's whole point.
  const attackers = aliveOf(match, match.attackTeam);
  const carrier = attackers[match.rng.int(0, attackers.length - 1)];
  match.bomb.state = 'carried';
  match.bomb.carrierId = carrier.id;
  match.bomb.planted = false;
  match.bomb.site = null;
  match.bomb.timer = 0;
  match.bomb.planterId = -1;
  match.bomb.defuserId = -1;
  match.bomb.defuseProgress = 0;
  match.bomb.plantProgress = 0;
  match.bomb.planterChannelId = -1;
  carrier.hasBomb = true;
  match.roundTimeLeft = ROUND.time;
  match.killfeed.length = 0;
  planRound(match);
  for (const c of match.combatants) if (c.bot) botBuy(match, c);
  match.phase = 'buy';
  match.phaseTime = ROUND.buyTime;
  announce(match, `ROUND ${match.round}`, match.attackTeam === match.player.team ? 'Plant the charge' : 'Defend the sites');
}

// What a bot buys, in priority order, keeping a sensible reserve: a rifle
// when rich, an SMG or shotgun on a force buy, armour whenever it survives
// the weapon decision, then role utility.
export function botBuy(match, c) {
  const rng = match.rng;
  const defending = c.team !== match.attackTeam;
  const buyPrimary = (key) => {
    if (c.money < WEAPONS[key].price) return false;
    c.money -= WEAPONS[key].price;
    c.weapons.primary = { key, mag: WEAPONS[key].mag, reserve: WEAPONS[key].reserve };
    c.currentSlot = 'primary';
    return true;
  };
  if (!c.weapons.primary) {
    if (c.money >= 3400 && c.bot.skill > 0.62 && rng.chance(0.3)) buyPrimary('longbow');
    else if (c.money >= 2900) buyPrimary('vk');
    else if (c.money >= 1500) buyPrimary(rng.chance(0.6) ? 'raptor' : 'breacher');
  }
  if (c.armorPts < 50 && c.money >= ARMOR_PRICE + 200) {
    c.money -= ARMOR_PRICE;
    c.armorPts = 100;
  }
  if (defending && !c.hasKit && c.money >= KIT_PRICE + 300 && rng.chance(0.6)) {
    c.money -= KIT_PRICE;
    c.hasKit = true;
  }
  const want = defending
    ? [['smoke', 0.4], ['frag', 0.4], ['flash', 0.3]]
    : [['flash', 0.55], ['smoke', 0.3], ['frag', 0.35]];
  for (const [kind, chance] of want) {
    if (c.grenades[kind] < GRENADE_CAPS[kind] && c.money >= GRENADES[kind].price + 150 && rng.chance(chance)) {
      c.money -= GRENADES[kind].price;
      c.grenades[kind] += 1;
    }
  }
}

// The player's purchase. Returns a refusal reason, or null on success; the
// HUD plays the till sound either way.
export function buyItem(match, c, key) {
  if (match.phase !== 'buy') return 'Buy phase over';
  if (key === 'armor') {
    if (c.armorPts >= 100) return 'Armour already full';
    if (c.money < ARMOR_PRICE) return 'Not enough money';
    c.money -= ARMOR_PRICE;
    c.armorPts = 100;
    return null;
  }
  if (key === 'kit') {
    if (c.hasKit) return 'Kit already carried';
    if (c.money < KIT_PRICE) return 'Not enough money';
    c.money -= KIT_PRICE;
    c.hasKit = true;
    return null;
  }
  if (GRENADES[key]) {
    if (c.grenades[key] >= GRENADE_CAPS[key]) return 'Already carrying the max';
    if (c.money < GRENADES[key].price) return 'Not enough money';
    c.money -= GRENADES[key].price;
    c.grenades[key] += 1;
    return null;
  }
  const def = WEAPONS[key];
  if (!def || def.slot !== 'primary') return 'Unknown item';
  if (c.weapons.primary && c.weapons.primary.key === key) return 'Already owned';
  if (c.money < def.price) return 'Not enough money';
  c.money -= def.price;
  c.weapons.primary = { key, mag: def.mag, reserve: def.reserve };
  c.currentSlot = 'primary';
  return null;
}

function endRound(match, audio, winnerTeam, reason) {
  const loserTeam = otherTeam(winnerTeam);
  match.scores[winnerTeam] += 1;
  const objective = reason === 'detonation' || reason === 'defusal';
  for (const c of match.combatants) {
    if (c.team === winnerTeam) addMoney(c, objective ? ECONOMY.winObjective : ECONOMY.winElimination);
  }
  match.lossStreak[winnerTeam] = 0;
  match.lossStreak[loserTeam] += 1;
  const lossPay = ECONOMY.lossBase + ECONOMY.lossStep * Math.min(match.lossStreak[loserTeam] - 1, ECONOMY.lossStepMax);
  for (const c of match.combatants) if (c.team === loserTeam) addMoney(c, lossPay);
  // The dead lose their gear; survivors keep theirs.
  for (const c of match.combatants) {
    if (!c.alive) {
      c.weapons.primary = null;
      c.armorPts = 0;
      c.grenades = { frag: 0, flash: 0, smoke: 0 };
      c.hasKit = false;
    }
    c.hasBomb = false;
  }
  match.roundResult = { winner: winnerTeam, reason };
  match.phase = 'roundEnd';
  match.phaseTime = ROUND.endTime;
  const playerWon = winnerTeam === match.player.team;
  const labels = {
    elimination: 'ELIMINATION',
    detonation: 'CHARGE DETONATED',
    defusal: 'CHARGE DEFUSED',
    time: 'TIME EXPIRED',
  };
  announce(match, playerWon ? 'ROUND WON' : 'ROUND LOST', labels[reason] || reason);
  if (audio) { if (playerWon) audio.roundWin(); else audio.roundLose(); }
}

function channelActive(match, c, input) {
  if (c.isPlayer) return input && input.state.keys.has('KeyE');
  return c.bot && c.bot.channeling;
}

export function updateDirector(match, fx, audio, input, dt, now) {
  // Housekeeping every phase: reloads finish, bloom and view kick decay,
  // expired smokes leave the vision model, the charge mesh follows its state.
  for (const c of match.combatants) {
    if (c.reloadUntil && now >= c.reloadUntil) finishReload(c);
    c.bloom = Math.max(0, c.bloom - dt * 0.055);
    c.viewKick = Math.max(0, (c.viewKick || 0) - dt * 0.22);
  }
  if (match.smokes.length) match.smokes = match.smokes.filter((s) => now < s.until);
  syncBombMesh(match, fx);

  if (match.phase === 'buy') {
    match.phaseTime -= dt;
    if (match.phaseTime <= 0) {
      match.phase = 'live';
      announce(match, 'ROUND LIVE', '');
    }
    return;
  }
  if (match.phase === 'roundEnd') {
    match.phaseTime -= dt;
    if (match.phaseTime <= 0) {
      const decided = match.scores.wardens >= ROUND.winTarget || match.scores.jackals >= ROUND.winTarget || match.round >= ROUND.maxRounds;
      if (decided) {
        match.phase = 'matchEnd';
        match.matchWinner = match.scores.wardens > match.scores.jackals ? 'wardens' : 'jackals';
        announce(match, match.matchWinner === match.player.team ? 'MATCH WON' : 'MATCH LOST',
          `${match.scores.wardens} — ${match.scores.jackals}`);
      } else {
        startRound(match);
      }
    }
    return;
  }
  if (match.phase !== 'live' && match.phase !== 'planted') return;

  const attackTeam = match.attackTeam;
  const defendTeam = otherTeam(attackTeam);
  const attackersAlive = aliveOf(match, attackTeam).length;
  const defendersAlive = aliveOf(match, defendTeam).length;

  if (match.phase === 'live') {
    match.roundTimeLeft -= dt;
    // Dropped charge pickup.
    if (match.bomb.state === 'dropped') {
      for (const c of aliveOf(match, attackTeam)) {
        if (Math.hypot(c.pos.x - match.bomb.x, c.pos.z - match.bomb.z) < 1.3) {
          match.bomb.state = 'carried';
          match.bomb.carrierId = c.id;
          c.hasBomb = true;
          break;
        }
      }
    }
    // Planting channel.
    const carrier = match.combatants[match.bomb.carrierId];
    if (match.bomb.state === 'carried' && carrier && carrier.alive) {
      const siteKey = siteAt(carrier.pos.x, carrier.pos.z);
      if (siteKey && channelActive(match, carrier, input) === (carrier.isPlayer ? true : 'plant')) {
        match.bomb.planterChannelId = carrier.id;
        match.bomb.plantProgress += dt;
        if (match.bomb.plantProgress >= ROUND.plantTime) {
          plantCharge(match, audio, carrier, siteKey);
        }
      } else {
        match.bomb.planterChannelId = -1;
        match.bomb.plantProgress = 0;
      }
    }
    if (attackersAlive === 0) return endRound(match, audio, defendTeam, 'elimination');
    if (defendersAlive === 0) return endRound(match, audio, attackTeam, 'elimination');
    if (match.roundTimeLeft <= 0) return endRound(match, audio, defendTeam, 'time');
    return;
  }

  // Planted: the clock that matters is the charge's own.
  match.bomb.timer -= dt;
  if (match.bomb.timer <= 0) {
    audio.explosion();
    fx.spawnSmoke(match.bomb.x, 0, match.bomb.z, 4.5, 2.5, now);
    return endRound(match, audio, attackTeam, 'detonation');
  }
  // Defuse channel: one defender, close to the charge, holding the action.
  let defusing = null;
  for (const c of aliveOf(match, defendTeam)) {
    if (Math.hypot(c.pos.x - match.bomb.x, c.pos.z - match.bomb.z) < 1.8 && channelActive(match, c, input) === (c.isPlayer ? true : 'defuse')) {
      defusing = c;
      break;
    }
  }
  if (defusing) {
    if (match.bomb.defuserId !== defusing.id) {
      match.bomb.defuserId = defusing.id;
      match.bomb.defuseProgress = 0;
    }
    match.bomb.defuseProgress += dt / (defusing.hasKit ? ROUND.defuseKitTime : ROUND.defuseTime);
    if (match.bomb.defuseProgress >= 1) {
      audio.defuseDone();
      return endRound(match, audio, defendTeam, 'defusal');
    }
  } else if (match.bomb.defuserId >= 0) {
    match.bomb.defuserId = -1;
    match.bomb.defuseProgress = 0;
  }
  if (defendersAlive === 0) return endRound(match, audio, attackTeam, 'elimination');
  // Attackers all dead with the charge down: the round plays on — the
  // defenders still have to defuse it.
}

function siteAt(x, z) {
  for (const key of ['A', 'B']) {
    const s = SITES[key];
    if (Math.hypot(x - s.x, z - s.z) < s.radius + 0.5) return key;
  }
  return null;
}

function plantCharge(match, audio, carrier, siteKey) {
  const site = SITES[siteKey];
  match.bomb.state = 'planted';
  match.bomb.planted = true;
  match.bomb.site = siteKey;
  match.bomb.x = carrier.pos.x;
  match.bomb.z = carrier.pos.z;
  match.bomb.timer = ROUND.bombTime;
  match.bomb.planterId = carrier.id;
  match.bomb.carrierId = -1;
  match.bomb.plantProgress = 0;
  match.bomb.planterChannelId = -1;
  carrier.hasBomb = false;
  addMoney(carrier, ECONOMY.plantPlanter);
  for (const c of match.combatants) if (c.team === match.attackTeam) addMoney(c, ECONOMY.plantTeam);
  match.phase = 'planted';
  announce(match, 'CHARGE PLANTED', `Site ${siteKey}`);
  audio.plantDone();
  // The nearest living defender bot takes the defuse; the rest cover.
  const defenders = aliveOf(match, otherTeam(match.attackTeam)).filter((c) => c.bot);
  defenders.sort((a, b) => Math.hypot(a.pos.x - site.x, a.pos.z - site.z) - Math.hypot(b.pos.x - site.x, b.pos.z - site.z));
  if (defenders[0]) defenders[0].bot.defuseAssigned = true;
}

function syncBombMesh(match, fx) {
  const mesh = fx.bombMesh;
  const bomb = match.bomb;
  if (bomb.state === 'carried') {
    const carrier = match.combatants[bomb.carrierId];
    if (carrier && carrier.alive) {
      mesh.visible = true;
      mesh.position.set(carrier.pos.x, carrier.pos.y + 1.28, carrier.pos.z);
      mesh.rotation.y = carrier.yaw;
      mesh.translateZ(0.24);
      return;
    }
    mesh.visible = false;
    return;
  }
  if (bomb.state === 'dropped' || bomb.state === 'planted') {
    mesh.visible = true;
    mesh.position.set(bomb.x, 0.1, bomb.z);
    mesh.rotation.set(0, 0.6, 0);
  }
}
