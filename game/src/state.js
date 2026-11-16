// The match state: one object, created once, mutated by the round director and
// read by everyone else. No module keeps its own copy of match facts.
import { ECONOMY, ROUND } from './config.js';

export function createMatch(rng) {
  return {
    rng,
    phase: 'menu', // menu | buy | live | planted | roundEnd | matchEnd
    phaseTime: 0,
    round: 0,
    scores: { wardens: 0, jackals: 0 },
    lossStreak: { wardens: 0, jackals: 0 },
    attackTeam: 'wardens', // flips at the half
    combatants: [],
    player: null,
    bomb: {
      carrierId: -1, planted: false, site: null, x: 0, z: 0,
      timer: 0, planterId: -1, defuserId: -1, defuseProgress: 0, plantProgress: 0, planterChannelId: -1,
    },
    noises: [],       // { x, z, radius, team, kind } heard this tick, cleared per tick
    killfeed: [],     // { killer, victim, weapon, headshot, at }
    floaters: [],     // { x, y, z, text, kill, at } damage numbers the HUD projects
    announcements: [],// { text, sub, at } for the HUD banner queue
    roundResult: null,
    matchWinner: null,
    time: 0,          // match clock, seconds of simulation
    roundTimeLeft: ROUND.time,
    smokes: [],       // live smoke clouds { x, y, z, radius, until }
  };
}

export function otherTeam(team) {
  return team === 'wardens' ? 'jackals' : 'wardens';
}

export function teamRole(match, team) {
  return match.attackTeam === team ? 'attack' : 'defend';
}

export function aliveOf(match, team) {
  return match.combatants.filter((c) => c.team === team && c.alive);
}

export function addMoney(combatant, amount) {
  combatant.money = Math.max(0, Math.min(ECONOMY.cap, combatant.money + amount));
}

export function announce(match, text, sub = '') {
  match.announcements.push({ text, sub, at: match.time });
  if (match.announcements.length > 3) match.announcements.shift();
}

export function emitNoise(match, x, z, radius, team, kind) {
  match.noises.push({ x, z, radius, team, kind });
}
