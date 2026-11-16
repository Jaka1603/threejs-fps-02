// The HUD: every readout the player fights by — health and armour, money,
// ammunition and grenades, the round clock and score, a live minimap, the
// killfeed, announcements, the buy menu and the scoreboard. It only reads
// match state and writes DOM; all of its elements live in index.html.
import { ARMOR_PRICE, GRENADES, KIT_PRICE, ROUND, WEAPONS } from './config.js';
import { BOXES, SITES } from './map.js';
import { currentWeapon } from './actors.js';

function weaponStat(key) {
  const w = WEAPONS[key];
  return `DMG ${w.damage} · ${w.rpm} RPM · MAG ${w.mag}`;
}

export const BUY_CATALOG = [
  { key: 'raptor', hotkey: 'Digit1', label: 'Raptor SMG', price: WEAPONS.raptor.price, stat: weaponStat('raptor') },
  { key: 'breacher', hotkey: 'Digit2', label: 'Breacher SG', price: WEAPONS.breacher.price, stat: `${weaponStat('breacher')} · 7 PELLETS` },
  { key: 'vk', hotkey: 'Digit3', label: 'VK-4 Rifle', price: WEAPONS.vk.price, stat: weaponStat('vk') },
  { key: 'longbow', hotkey: 'Digit4', label: 'Longbow DMR', price: WEAPONS.longbow.price, stat: `${weaponStat('longbow')} · SCOPED` },
  { key: 'armor', hotkey: 'Digit5', label: 'Vest + Helmet', price: ARMOR_PRICE, stat: 'HALVES CHEST + HEAD DAMAGE' },
  { key: 'kit', hotkey: 'Digit6', label: 'Defuse Kit', price: KIT_PRICE, stat: 'DEFUSE 8S → 4S' },
  { key: 'frag', hotkey: 'Digit7', label: 'Shard Frag', price: GRENADES.frag.price, stat: `UP TO ${GRENADES.frag.damage} DAMAGE` },
  { key: 'flash', hotkey: 'Digit8', label: 'Blind Flash', price: GRENADES.flash.price, stat: 'BLINDS ON SIGHTLINE' },
  { key: 'smoke', hotkey: 'Digit9', label: 'Veil Smoke', price: GRENADES.smoke.price, stat: `${GRENADES.smoke.duration}S SIGHT BLOCK` },
];

const $ = (id) => document.getElementById(id);

export function createHud(onBuy) {
  const el = {
    timer: $('timer'), scoreLine: $('score-line'), roundLabel: $('round-label'),
    aliveL: $('alive-left'), aliveR: $('alive-right'),
    banner: $('banner'), bannerText: $('banner-text'), bannerSub: $('banner-sub'),
    healthBar: $('health-bar'), healthNum: $('health-num'), armorBar: $('armor-bar'), armorWrap: $('armor-wrap'),
    money: $('money'), weaponName: $('weapon-name'), ammoMag: $('ammo-mag'), ammoReserve: $('ammo-reserve'),
    grenades: $('grenades'), tags: $('tags'),
    killfeed: $('killfeed'),
    channel: $('channel'), channelLabel: $('channel-label'), channelBar: $('channel-bar'),
    hint: $('hint'),
    crosshair: $('crosshair'), hitmarker: $('hitmarker'),
    vignette: $('damage-vignette'), flash: $('flash-overlay'), scope: $('scope-overlay'),
    buyMenu: $('buy-menu'), buyItems: $('buy-items'), buyMoney: $('buy-money'), buyTimer: $('buy-timer'),
    scoreboard: $('scoreboard'), sbBody: $('scoreboard-body'),
    spectate: $('spectate'), bombTag: $('bomb-tag'),
    minimap: $('minimap'),
  };
  const mapCtx = el.minimap.getContext('2d');
  let lastBannerAt = -99;
  let buyOpen = false;
  const buyButtons = new Map();

  for (const item of BUY_CATALOG) {
    const button = document.createElement('button');
    button.className = 'buy-item';
    button.type = 'button';
    button.innerHTML = `<span class="buy-key">${item.hotkey.slice(-1)}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span><span class="buy-stat">${item.stat}</span><span class="buy-state"></span>`;
    button.addEventListener('click', () => onBuy(item.key));
    el.buyItems.appendChild(button);
    buyButtons.set(item.key, button);
  }

  function fmtTime(seconds) {
    const s = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function drawMinimap(match, now) {
    const g = mapCtx;
    const S = el.minimap.width;
    const px = (v) => ((v + 36) / 72) * S;
    g.fillStyle = 'rgba(16,20,24,0.82)';
    g.fillRect(0, 0, S, S);
    g.fillStyle = 'rgba(210,200,180,0.30)';
    for (const b of BOXES) {
      if (b.kind !== 'wall') continue;
      g.fillRect(px(b.x - b.w / 2), px(b.z - b.d / 2), (b.w / 72) * S, (b.d / 72) * S);
    }
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      g.strokeStyle = key === 'A' ? '#d86a3a' : '#3a9ad8';
      g.lineWidth = 2;
      g.beginPath(); g.arc(px(s.x), px(s.z), (s.radius / 72) * S, 0, Math.PI * 2); g.stroke();
      g.fillStyle = g.strokeStyle;
      g.font = `700 ${S * 0.075}px system-ui`;
      g.textAlign = 'center';
      g.fillText(key, px(s.x), px(s.z) + S * 0.026);
    }
    g.fillStyle = 'rgba(200,205,210,0.5)';
    for (const s of match.smokes) {
      if (now > s.until) continue;
      g.beginPath(); g.arc(px(s.x), px(s.z), (s.radius / 72) * S, 0, Math.PI * 2); g.fill();
    }
    if (match.bomb.state !== 'carried') {
      g.fillStyle = Math.floor(now * 3) % 2 ? '#ff5040' : '#ffb0a0';
      g.fillRect(px(match.bomb.x) - 3, px(match.bomb.z) - 3, 6, 6);
    }
    const player = match.player;
    for (const c of match.combatants) {
      if (!c.alive) continue;
      if (c.team === player.team) {
        g.fillStyle = c.isPlayer ? '#ffffff' : '#39d8cd';
        g.beginPath(); g.arc(px(c.pos.x), px(c.pos.z), c.isPlayer ? 4 : 3, 0, Math.PI * 2); g.fill();
        if (c.isPlayer) {
          g.strokeStyle = 'rgba(255,255,255,0.75)';
          g.beginPath();
          g.moveTo(px(c.pos.x), px(c.pos.z));
          g.lineTo(px(c.pos.x - Math.sin(c.yaw) * 4), px(c.pos.z - Math.cos(c.yaw) * 4));
          g.stroke();
        }
      } else {
        // Enemies appear only at a teammate's last sighting, fading out.
        let seen = null;
        for (const t of match.combatants) {
          if (t.team === player.team && t.bot && t.bot.enemy === c) seen = t.bot;
        }
        if (seen) {
          g.fillStyle = 'rgba(255,84,60,0.95)';
          g.beginPath(); g.arc(px(c.pos.x), px(c.pos.z), 3.4, 0, Math.PI * 2); g.fill();
        }
      }
    }
  }

  return {
    setBuyOpen(open) {
      buyOpen = open;
      el.buyMenu.hidden = !open;
    },
    get buyOpen() { return buyOpen; },
    handleBuyKeys(presses) {
      if (!buyOpen) return;
      for (const code of presses) {
        const item = BUY_CATALOG.find((i) => i.hotkey === code);
        if (item) onBuy(item.key);
      }
    },
    showScoreboard(show) { el.scoreboard.hidden = !show; },

    update(match, now, view) {
      const p = match.player;
      // Clock and score.
      if (match.phase === 'buy') el.timer.textContent = fmtTime(match.phaseTime);
      else if (match.phase === 'planted') el.timer.textContent = fmtTime(match.bomb.timer);
      else el.timer.textContent = fmtTime(match.roundTimeLeft);
      el.timer.classList.toggle('danger', match.phase === 'planted' || (match.phase === 'live' && match.roundTimeLeft < 11));
      el.scoreLine.innerHTML = `<span class="wardens">${match.scores.wardens}</span> — <span class="jackals">${match.scores.jackals}</span>`;
      el.roundLabel.textContent = `ROUND ${match.round} · ${match.attackTeam === p.team ? 'ATTACK' : 'DEFEND'}`;
      const allies = match.combatants.filter((c) => c.team === p.team && c.alive).length;
      const foes = match.combatants.filter((c) => c.team !== p.team && c.alive).length;
      el.aliveL.textContent = '●'.repeat(allies);
      el.aliveR.textContent = '●'.repeat(foes);

      // Banner: the newest announcement, held for a few seconds.
      const latest = match.announcements[match.announcements.length - 1];
      if (latest && latest.at !== lastBannerAt) lastBannerAt = latest.at;
      if (latest && now - latest.at < 3.0) {
        el.banner.hidden = false;
        el.bannerText.textContent = latest.text;
        el.bannerSub.textContent = latest.sub;
      } else el.banner.hidden = true;

      // Vitals and loadout.
      el.healthBar.style.width = `${Math.max(0, p.health)}%`;
      el.healthNum.textContent = Math.ceil(Math.max(0, p.health));
      el.armorWrap.style.visibility = p.armorPts > 0 ? 'visible' : 'hidden';
      el.armorBar.style.width = `${p.armorPts}%`;
      el.money.textContent = `$${p.money}`;
      const held = currentWeapon(p);
      el.weaponName.textContent = held ? WEAPONS[held.key].name : '—';
      el.ammoMag.textContent = held ? held.mag : '–';
      el.ammoReserve.textContent = held ? `/ ${held.reserve}` : '';
      el.ammoMag.classList.toggle('low', !!held && held.mag <= WEAPONS[held.key].mag * 0.25);
      el.grenades.innerHTML =
        `<span class="${p.grenades.frag ? '' : 'spent'}">3 Frag ×${p.grenades.frag}</span>` +
        `<span class="${p.grenades.flash ? '' : 'spent'}">4 Flash ×${p.grenades.flash}</span>` +
        `<span class="${p.grenades.smoke ? '' : 'spent'}">5 Smoke ×${p.grenades.smoke}</span>`;
      el.tags.innerHTML =
        (p.hasKit ? '<span>DEFUSE KIT</span>' : '') + (p.armorPts > 0 ? '<span>ARMOURED</span>' : '');
      el.bombTag.hidden = !p.hasBomb;
      el.crosshair.style.setProperty('--gap', `${6 + view.spreadPx}px`);
      el.crosshair.style.opacity = p.alive ? 1 : 0;
      const hitAge = now - (match.lastHitAt ?? -99);
      const killAge = now - (match.lastKillAt ?? -99);
      el.hitmarker.style.opacity = hitAge < 0.13 ? 1 : 0;
      el.hitmarker.classList.toggle('kill', killAge < 0.2);

      // Feedback overlays.
      const hurtAge = now - p.lastHurtAt;
      el.vignette.style.opacity = p.alive ? Math.max(hurtAge < 0.4 ? 0.55 : 0, p.health < 35 ? 0.3 : 0) : 0;
      if (p.blindUntil > now) {
        el.flash.style.opacity = Math.min(1, p.blindPeak * Math.min(1, (p.blindUntil - now) / 0.9 + 0.25));
      } else el.flash.style.opacity = 0;
      el.scope.style.opacity = view.scoped ? 1 : 0;
      el.spectate.hidden = !view.spectating;
      if (view.spectating) el.spectate.textContent = `SPECTATING ${view.spectating} — click for next`;

      // Killfeed: entries younger than five seconds.
      const fresh = match.killfeed.filter((k) => now - k.at < 5).slice(-5);
      el.killfeed.innerHTML = fresh.map((k) =>
        `<div class="kf"><b class="${k.killerTeam || ''}">${k.killer}</b> <i>${WEAPONS[k.weapon] ? WEAPONS[k.weapon].name : k.weapon}${k.headshot ? ' ⌖' : ''}</i> <b class="${k.victimTeam || ''}">${k.victim}</b></div>`,
      ).join('');

      // Channel progress and contextual hints.
      let channel = null;
      if (match.bomb.plantProgress > 0 && match.bomb.planterChannelId === p.id) {
        channel = { label: 'PLANTING THE CHARGE', frac: match.bomb.plantProgress / ROUND.plantTime };
      } else if (match.bomb.defuserId === p.id && match.bomb.defuseProgress > 0) {
        channel = { label: 'DEFUSING', frac: match.bomb.defuseProgress };
      } else if (match.bomb.defuserId >= 0) {
        channel = { label: 'CHARGE BEING DEFUSED', frac: match.bomb.defuseProgress };
      }
      el.channel.hidden = !channel;
      if (channel) {
        el.channelLabel.textContent = channel.label;
        el.channelBar.style.width = `${Math.round(channel.frac * 100)}%`;
      }
      el.hint.textContent = hintFor(match, p);
      el.hint.style.opacity = el.hint.textContent ? 1 : 0;

      // Buy menu state.
      if (buyOpen) {
        el.buyMoney.textContent = `$${p.money}`;
        el.buyTimer.textContent = fmtTime(match.phaseTime);
        for (const item of BUY_CATALOG) {
          const button = buyButtons.get(item.key);
          const state = button.querySelector('.buy-state');
          let label = '';
          let owned = false;
          if (item.key === 'armor') { owned = p.armorPts >= 100; label = owned ? 'OWNED' : ''; }
          else if (item.key === 'kit') { owned = p.hasKit; label = owned ? 'OWNED' : ''; }
          else if (GRENADES[item.key]) { label = `×${p.grenades[item.key]}`; }
          else { owned = !!(p.weapons.primary && p.weapons.primary.key === item.key); label = owned ? 'OWNED' : ''; }
          state.textContent = label;
          button.classList.toggle('owned', owned);
          button.classList.toggle('broke', !owned && p.money < item.price);
        }
      }

      // Scoreboard rows are rebuilt only while it is on screen.
      if (!el.scoreboard.hidden) {
        const rows = [...match.combatants].sort((a, b) => (a.team === p.team ? -1 : 1) - (b.team === p.team ? -1 : 1) || b.kills - a.kills);
        el.sbBody.innerHTML = rows.map((c) =>
          `<tr class="${c.team} ${c.alive ? '' : 'dead'}"><td>${c.callsign}${c.isPlayer ? ' (you)' : ''}</td><td>${c.kills}</td><td>${c.deaths}</td><td>$${c.money}</td><td>${c.weapons.primary ? WEAPONS[c.weapons.primary.key].name : 'P9 Sidearm'}</td></tr>`,
        ).join('');
      }

      drawMinimap(match, now);
    },
  };
}

function hintFor(match, p) {
  if (!p.alive) return '';
  if (match.phase === 'buy') return 'Buy phase — press B or click to equip';
  if (match.phase === 'live' && p.hasBomb) {
    for (const key of ['A', 'B']) {
      const s = SITES[key];
      if (Math.hypot(p.pos.x - s.x, p.pos.z - s.z) < s.radius + 0.5) return `Hold E to plant the charge on site ${key}`;
    }
    return 'You carry the charge — reach site A or B';
  }
  if (match.phase === 'planted' && p.team !== match.attackTeam) {
    if (Math.hypot(p.pos.x - match.bomb.x, p.pos.z - match.bomb.z) < 2.2) return 'Hold E to defuse the charge';
    return 'The charge is planted — retake and defuse';
  }
  if (match.phase === 'live' && match.bomb.state === 'dropped' && p.team === match.attackTeam) return 'The charge is down — recover it';
  return '';
}
