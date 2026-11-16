// Procedural sound: every effect is synthesised with WebAudio — filtered noise
// for gunfire and explosions, square blips for the charge, soft taps for steps.
// No audio files, nothing to load, and it all stays silent in screenshot mode
// (no user gesture ever resumes the context there).

export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBuffer(seconds) {
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    return buffer;
  }

  function burst({ at = 0, dur = 0.12, freq = 1800, gain = 0.5, type = 'lowpass', sweepTo = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuffer(dur + 0.05);
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter).connect(amp).connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone({ at = 0, dur = 0.09, freq = 880, gain = 0.16, type = 'square', sweepTo = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, t);
    amp.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(amp).connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  return {
    unlock() { ensure(); },
    shot(kind, distance = 0) {
      const fade = Math.max(0.15, 1 - distance / 70);
      if (kind === 'longbow') burst({ dur: 0.28, freq: 1200, gain: 0.65 * fade, sweepTo: 200 });
      else if (kind === 'breacher') burst({ dur: 0.22, freq: 900, gain: 0.6 * fade, sweepTo: 240 });
      else if (kind === 'raptor') burst({ dur: 0.07, freq: 2400, gain: 0.34 * fade, sweepTo: 700 });
      else burst({ dur: 0.11, freq: 1900, gain: 0.44 * fade, sweepTo: 500 });
    },
    dryFire() { tone({ dur: 0.04, freq: 1400, gain: 0.1, type: 'square' }); },
    reload() { tone({ at: 0, dur: 0.05, freq: 500, gain: 0.12 }); tone({ at: 0.22, dur: 0.05, freq: 700, gain: 0.12 }); tone({ at: 0.45, dur: 0.06, freq: 420, gain: 0.14 }); },
    hit(kill) { tone({ dur: 0.05, freq: kill ? 1560 : 1180, gain: 0.14 }); if (kill) tone({ at: 0.06, dur: 0.07, freq: 1900, gain: 0.14 }); },
    hurt() { burst({ dur: 0.08, freq: 500, gain: 0.2 }); },
    step(run) { burst({ dur: 0.045, freq: 620, gain: run ? 0.05 : 0.02 }); },
    throwPin() { tone({ dur: 0.05, freq: 980, gain: 0.1 }); },
    frag() { burst({ dur: 0.7, freq: 2600, gain: 0.8, sweepTo: 90 }); tone({ dur: 0.5, freq: 120, gain: 0.5, type: 'sine', sweepTo: 38 }); },
    flash() { tone({ dur: 0.35, freq: 3400, gain: 0.2, type: 'sine', sweepTo: 2600 }); },
    smokePop() { burst({ dur: 0.3, freq: 800, gain: 0.22, sweepTo: 300 }); },
    beep(fast) { tone({ dur: 0.05, freq: 1240, gain: 0.13 }); if (fast) tone({ at: 0.09, dur: 0.05, freq: 1240, gain: 0.13 }); },
    plantDone() { tone({ dur: 0.09, freq: 880, gain: 0.16 }); tone({ at: 0.11, dur: 0.12, freq: 1320, gain: 0.16 }); },
    defuseDone() { tone({ dur: 0.09, freq: 1320, gain: 0.16 }); tone({ at: 0.11, dur: 0.12, freq: 880, gain: 0.16 }); },
    explosion() { burst({ dur: 1.4, freq: 3000, gain: 1, sweepTo: 60 }); tone({ dur: 1.1, freq: 96, gain: 0.7, type: 'sine', sweepTo: 30 }); },
    roundWin() { tone({ dur: 0.12, freq: 660, gain: 0.15, type: 'triangle' }); tone({ at: 0.12, dur: 0.2, freq: 990, gain: 0.15, type: 'triangle' }); },
    roundLose() { tone({ dur: 0.12, freq: 520, gain: 0.15, type: 'triangle' }); tone({ at: 0.12, dur: 0.22, freq: 340, gain: 0.15, type: 'triangle' }); },
    buy() { tone({ dur: 0.05, freq: 1040, gain: 0.1 }); tone({ at: 0.05, dur: 0.06, freq: 1480, gain: 0.1 }); },
    denied() { tone({ dur: 0.09, freq: 220, gain: 0.12 }); },
  };
}
