# COPPERLINE — a three.js tactical FPS

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**COPPERLINE** is a complete round-based tactical shooter in the browser:
5v5, Wardens (teal) vs Jackals (amber), on an original map — **Foundry Yard**,
a dusk industrial yard with two bomb sites, a mid lane, side links and a
connector. Attackers plant **the Charge** (3 s channel, 40 s fuse); defenders
stop the plant or defuse it (8 s, 4 s with a kit). First to 7 rounds wins,
sides swap after round 6, and a full economy drives a buy phase every round.

## What is in the game

- **Full match structure** — buy phase, live round, plant/defuse post-plant,
  round-end and match-end flow, halftime side swap with an economy reset.
- **Economy and buy menu** — start $800, cap $9,000; kill, win and loss-streak
  rewards; four primaries (Raptor SMG, Breacher shotgun, VK-4 rifle, Longbow
  scoped DMR), armour, defuse kit, and frag / flash / smoke grenades.
- **Gunplay with a stance game** — head/chest/leg hit volumes, headshot
  multipliers, distance falloff, armour halving, recoil bloom, and spread
  that grows with movement: stopping to aim genuinely pays. Crouch tightens
  spread and lowers the profile.
- **Bots that play the objective** — a waypoint graph with LOS-checked edges,
  vision cones and sight lines (smoke blocks vision), hearing through noise
  events, team plans (attackers split routes with a mid lurker; defenders
  hold 2-1-2 and rotate on intel), plant and defuse channels, and cover
  behaviour after contact.
- **HUD** — health and armour, ammo and reserve, money, round timer, score,
  round pips for both teams, killfeed, announcements, channel bar, hitmarker,
  damage and flash overlays, a live minimap, and a Tab scoreboard.
- **Presentation** — one dusk palette throughout (warm concrete and rust,
  teal/amber team split), procedural WebAudio for every sound, pooled
  effects (tracers, impacts, muzzle light, smoke) with no per-frame
  allocation in the hot loop.
- **Art direction** — a painted canvas sky dome (sunset gradient, sun disc
  and halo, cloud wisps) over a lit skyline silhouette, ACES filmic tone
  mapping, and fully procedural canvas textures: formwork-streaked walls,
  a worn painted ground with lane lines and site aprons, stencilled
  containers and crates. Yard floodlights and colour-coded site doors
  make both bomb sites readable at a glance; figures wear visors, team
  shoulder pads and chest stripes so friend and foe read instantly.
- **First-person camera fix** — the viewed fighter's own head gear is
  hidden while the camera sits at its eyes (and restored when the view
  moves on), so neither the player's nor a spectated bot's helmet can
  block the top of the frame.

## Architecture

The simulation runs at a fixed 60 Hz, separate from rendering. One module
per job under `game/src/`: `config` (all tuning), `state` (the single match
object), `map` (geometry + waypoint graph), `movement` (shared body
physics), `combat` (the one hitscan/damage path used by player and bots
alike), `player`, `bots`, `rounds` (the director: phases, economy, win
checks), `effects`, `audio`, `hud`, `input`, and `main` (boot + the loop).
No build step, no assets: everything is procedural, and the only dependency
is the kit's vendored three.js 0.187.0.

## Run it

```sh
node serve.ts            # serves game/ for local play
node main.ts             # builds out/ (game copy, screenshots, dossier.json)
```

Open the served page, click **Play**, and use WASD + mouse. `B` opens the
buy menu, `E` plants/defuses, `Shift` walks silently, `Ctrl` crouches,
`Tab` shows the scoreboard. Deterministic screenshot scenes for the
dossier are staged by the game itself via `?shot=play|buy|plant|menu&seed=1`
(see `shots.json`).

## License

MIT — see `LICENSE`. Built on the official threejs-fps-02 starter kit;
the game, map, bots and presentation are original work.

---

<sub>Entered on [make.fun](https://make.fun/?ref=md16tqa0&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
