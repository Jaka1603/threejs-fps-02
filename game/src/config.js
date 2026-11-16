// COPPERLINE — shared tuning: palette, weapons, grenades, economy, round timings.
// Every number the rest of the game balances against lives here, in one place.

// Dusk foundry palette: a low amber sun against deep blue shadow, warm
// concrete and rust in the yard, and a saturated teal/amber team split that
// still reads at screenshot distance.
export const PALETTE = {
  sky: 0x2e3d4d,        // fallback clear colour behind the sky dome
  fog: 0x77624f,        // warm dusk haze the yard fades into
  horizon: 0xe08a4e,    // the sun band the sky dome is painted around
  ground: 0x8a7f6d,     // worn concrete-sand
  groundDark: 0x6f6455,
  wall: 0x9c9181,       // concrete block
  wallTrim: 0x5d564c,
  crate: 0xa9743f,      // timber crates
  crateDark: 0x7d5527,
  metal: 0x707880,      // containers and pipework
  rust: 0xb0562f,       // rust accent on site A side
  lamp: 0xffb45e,       // yard lamp glow at dusk
  containerRed: 0x9c4030,
  containerTeal: 0x2a6f6a,
  containerBlue: 0x3d5a74,
  teal: 0x2fd8c8,       // Wardens (player team)
  tealDark: 0x1d6f6a,
  amber: 0xf59a2e,      // Jackals (enemy team)
  amberDark: 0x9c5c1c,
  siteA: 0xe86a2a,
  siteB: 0x2a9ae8,
  white: 0xf2ede2,
};

// Weapon table. damage is per bullet (per pellet for the breacher) at point blank;
// falloffStart/falloffEnd scale it down to 45% at long range. spread is in radians
// of cone half-angle at rest; moveSpread is added in full at run speed.
export const WEAPONS = {
  p9: {
    name: 'P9 Sidearm', slot: 'sidearm', price: 0, auto: false,
    damage: 26, headMult: 4, rpm: 380, mag: 12, reserve: 48,
    reloadTime: 1.5, drawTime: 0.35, pellets: 1,
    spread: 0.010, moveSpread: 0.030, bloomPerShot: 0.004, bloomMax: 0.030,
    falloffStart: 16, falloffEnd: 42, range: 90, noise: 26,
    kick: 0.010, tracer: 0xffe6b0,
  },
  raptor: {
    name: 'Raptor SMG', slot: 'primary', price: 1000, auto: true,
    damage: 21, headMult: 3.2, rpm: 800, mag: 30, reserve: 90,
    reloadTime: 2.0, drawTime: 0.5, pellets: 1,
    spread: 0.016, moveSpread: 0.026, bloomPerShot: 0.005, bloomMax: 0.045,
    falloffStart: 10, falloffEnd: 30, range: 80, noise: 27,
    kick: 0.008, tracer: 0xffd9a0,
  },
  breacher: {
    name: 'Breacher SG', slot: 'primary', price: 1100, auto: false,
    damage: 11, headMult: 2.4, rpm: 68, mag: 6, reserve: 24,
    reloadTime: 2.6, drawTime: 0.55, pellets: 7,
    spread: 0.045, moveSpread: 0.030, bloomPerShot: 0.010, bloomMax: 0.060,
    falloffStart: 5, falloffEnd: 18, range: 45, noise: 30,
    kick: 0.030, tracer: 0xffc890,
  },
  vk: {
    name: 'VK-4 Rifle', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 4, rpm: 640, mag: 30, reserve: 90,
    reloadTime: 2.3, drawTime: 0.6, pellets: 1,
    spread: 0.007, moveSpread: 0.034, bloomPerShot: 0.006, bloomMax: 0.040,
    falloffStart: 24, falloffEnd: 60, range: 110, noise: 30,
    kick: 0.013, tracer: 0xfff0c0,
  },
  longbow: {
    name: 'Longbow DMR', slot: 'primary', price: 3100, auto: false,
    damage: 72, headMult: 3, rpm: 150, mag: 10, reserve: 30,
    reloadTime: 2.6, drawTime: 0.7, pellets: 1,
    spread: 0.002, moveSpread: 0.060, bloomPerShot: 0.012, bloomMax: 0.030,
    falloffStart: 40, falloffEnd: 95, range: 140, noise: 32,
    kick: 0.034, tracer: 0xfff6d8, scoped: true,
  },
};

export const GRENADES = {
  frag: { name: 'Shard Frag', price: 300, radius: 6.5, damage: 92 },
  flash: { name: 'Blind Flash', price: 200, radius: 22 },
  smoke: { name: 'Veil Smoke', price: 300, radius: 3.4, duration: 15 },
};

export const ARMOR_PRICE = 650;
export const KIT_PRICE = 200;

export const ECONOMY = {
  start: 800,
  cap: 9000,
  kill: 300,
  plantPlanter: 300,
  plantTeam: 800,       // paid to the attacking team when the charge is planted, win or lose
  winElimination: 2400,
  winObjective: 2900,   // detonation for attackers, defusal for defenders
  lossBase: 1400,
  lossStep: 500,        // added per consecutive loss, capped at lossStepMax steps
  lossStepMax: 3,
};

export const ROUND = {
  buyTime: 12,          // freeze + buy phase at each round start
  time: 100,            // live round clock
  bombTime: 40,         // charge countdown once planted
  plantTime: 3,
  defuseTime: 8,
  defuseKitTime: 4,
  endTime: 5,           // pause on the round result before the next buy phase
  winTarget: 7,         // first to 7 takes the match
  maxRounds: 13,
  halfAt: 6,            // after 6 rounds the teams swap sides
};

export const TEAMS = {
  wardens: { name: 'WARDENS', color: PALETTE.teal },
  jackals: { name: 'JACKALS', color: PALETTE.amber },
};

// Bot callsigns, five per team; the player is always Warden "YOU".
export const CALLSIGNS = {
  wardens: ['YOU', 'Havoc', 'Mira', 'Talon', 'Bricks'],
  jackals: ['Vex', 'Onyx', 'Rook', 'Sable', 'Grin'],
};
