// Synthesised sound: no audio files, no network. A shared noise buffer and a
// few oscillators make every effect the game needs, and every call is a no-op
// until the player first clicks, so headless captures stay silent and safe.
export function createAudio() {
  let ctx = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) return ctx;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return ctx;
  }

  function noise(duration, filterFreq, gainValue, when = 0) {
    const c = ensure();
    if (!c || !noiseBuf) return;
    const t = c.currentTime + when;
    const src = c.createBufferSource();
    src.buffer = noiseBuf;
    const filter = c.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(gain).connect(c.destination);
    src.start(t, Math.random() * 0.2, duration);
    src.stop(t + duration);
  }

  function tone(freq, duration, type, gainValue, slideTo = 0, when = 0) {
    const c = ensure();
    if (!c) return;
    const t = c.currentTime + when;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + duration);
    const gain = c.createGain();
    gain.gain.setValueAtTime(gainValue, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(gain).connect(c.destination);
    osc.start(t);
    osc.stop(t + duration);
  }

  return {
    unlock() { ensure(); },
    shot(kind) {
      if (kind === 'sniper') { noise(0.28, 900, 0.5); tone(140, 0.2, 'sine', 0.4, 50); }
      else if (kind === 'smg') { noise(0.09, 2400, 0.32); tone(220, 0.07, 'square', 0.12, 110); }
      else if (kind === 'pistol') { noise(0.12, 1800, 0.4); tone(180, 0.09, 'square', 0.16, 90); }
      else { noise(0.14, 1600, 0.42); tone(160, 0.1, 'square', 0.18, 70); }
    },
    enemyShot() { noise(0.1, 1200, 0.16); },
    hit() { tone(1200, 0.06, 'sine', 0.2); },
    kill() { tone(660, 0.09, 'sine', 0.25); tone(990, 0.12, 'sine', 0.25, 0, 0.09); },
    reload() { tone(500, 0.05, 'square', 0.1); tone(380, 0.05, 'square', 0.1, 0, 0.35); },
    plantBeep(final) { tone(final ? 1400 : 880, 0.12, 'sine', 0.25); },
    defuseBeep() { tone(520, 0.1, 'sine', 0.2); },
    win() { tone(523, 0.14, 'sine', 0.25); tone(659, 0.14, 'sine', 0.25, 0, 0.13); tone(784, 0.22, 'sine', 0.28, 0, 0.26); },
    lose() { tone(392, 0.16, 'sine', 0.22); tone(311, 0.24, 'sine', 0.22, 0, 0.15); },
    grenade() { noise(0.5, 500, 0.5); tone(90, 0.4, 'sine', 0.5, 40); },
    click() { tone(700, 0.04, 'square', 0.1); },
    hurt() { tone(110, 0.15, 'sawtooth', 0.2, 60); },
  };
}
