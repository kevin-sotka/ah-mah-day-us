// The island's sound, all synthesised on the game's own AudioContext so it shares one master
// with the album track. The surf breathes in time with the water you can see climbing the
// sand; the wind rises in the palms; gulls call when they are near.
export function islandSound(ctx, master) {
  if (!ctx) return null;
  const out = ctx.createGain(); out.gain.value = 0; out.connect(master);
  out.gain.setTargetAtTime(1, ctx.currentTime, 1.2);
  const sr = ctx.sampleRate;
  const noise = (sec, color = 'white') => {
    const n = Math.floor(sr * sec), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    // fade the seam
    const f = Math.min(2048, n >> 3); for (let i = 0; i < f; i++) { const k = i / f; d[i] *= k; d[n - 1 - i] *= k; }
    return b;
  };
  const loop = (buf, filterType, freq, q, gain) => {
    const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = filterType; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = gain;
    s.connect(f); f.connect(g); g.connect(out); s.start(ctx.currentTime + Math.random());
    return { s, f, g };
  };
  const brown = noise(6, 'brown'), white = noise(4);
  const surfLow = loop(brown, 'lowpass', 380, 0.5, 0.0);
  const surfWash = loop(white, 'bandpass', 900, 0.6, 0.0);
  const wind = loop(white, 'bandpass', 520, 0.9, 0.0);
  const leaves = loop(white, 'highpass', 4200, 0.3, 0.0);

  const burst = (gain, freq, len, type = 'bandpass', q = 1, when = 0, dest = out) => {
    const t = ctx.currentTime + when;
    const s = ctx.createBufferSource(); s.buffer = white; s.playbackRate.value = 0.7 + Math.random() * 0.6;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + Math.min(0.01, len * 0.2)); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 2); s.stop(t + len + 0.05);
    return f;
  };
  const tone = (freq, len, type, gain, when = 0, glide = 0) => {
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (glide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * glide), t + len);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    o.connect(g); g.connect(out); o.start(t); o.stop(t + len + 0.05);
  };

  let lastLevel = 0, rising = false;
  return {
    out,
    update(o) {
      // o: { shore (0..1 closeness to the waterline), canopy (0..1), level, gust, gaze }
      const t = ctx.currentTime;
      surfLow.g.gain.setTargetAtTime(0.10 + o.shore * 0.32, t, 0.4);
      // the wash: louder while the water climbs the beach, a long hiss as it slides back
      const climbing = o.level > lastLevel;
      if (climbing !== rising) {
        rising = climbing;
        surfWash.f.frequency.setTargetAtTime(climbing ? 1400 : 650, t, climbing ? 0.5 : 1.2);
      }
      surfWash.g.gain.setTargetAtTime((climbing ? 0.07 : 0.035) + o.shore * (climbing ? 0.26 : 0.12), t, 0.35);
      lastLevel = o.level;
      wind.g.gain.setTargetAtTime(0.025 + o.gust * 0.05, t, 0.6);
      wind.f.frequency.setTargetAtTime(380 + o.gust * 420, t, 0.8);
      leaves.g.gain.setTargetAtTime(o.canopy * (0.012 + o.gust * 0.03), t, 0.5);
    },
    step(kind) {
      if (kind === 'sand' || kind === 'wet') burst(kind === 'wet' ? 0.07 : 0.05, kind === 'wet' ? 1300 : 900, 0.09, 'bandpass', 0.8);
      else if (kind === 'path' || kind === 'grass') burst(0.04, 1700, 0.07, 'bandpass', 1.2);
      else if (kind === 'stone' || kind === 'rock') { burst(0.05, 2600, 0.04, 'bandpass', 2); tone(180 + Math.random() * 40, 0.05, 'triangle', 0.02); }
      else if (kind === 'wood') { tone(140 + Math.random() * 30, 0.09, 'triangle', 0.06); burst(0.03, 900, 0.05); }
      else if (kind === 'water') { burst(0.09, 1800, 0.18, 'bandpass', 0.7); burst(0.05, 600, 0.22, 'lowpass', 0.7, 0.03); }
      // the automaton's own tiny clockwork, under every step
      tone(2400 + Math.random() * 300, 0.025, 'square', 0.004);
    },
    rustle(amount = 1) {
      const n = 3 + Math.floor(Math.random() * 4);
      for (let i = 0; i < n; i++) burst(0.035 * amount * (0.5 + Math.random()), 3000 + Math.random() * 3500, 0.05 + Math.random() * 0.08, 'bandpass', 1.4, i * (0.02 + Math.random() * 0.04));
    },
    jump() { tone(420, 0.16, 'sine', 0.05, 0, 2.2); burst(0.04, 1200, 0.08); },
    land(kind) { tone(90, 0.12, 'sine', 0.09); this.step(kind); },
    roll() { burst(0.06, 700, 0.45, 'bandpass', 0.6); for (let i = 0; i < 3; i++) tone(300 + i * 60, 0.05, 'triangle', 0.02, 0.1 + i * 0.12); },
    kick(water) {
      if (water) { burst(0.22, 1500, 0.5, 'bandpass', 0.5); burst(0.14, 500, 0.6, 'lowpass', 0.6, 0.02); for (let i = 0; i < 6; i++) burst(0.04, 2500 + Math.random() * 2500, 0.06, 'bandpass', 3, 0.15 + Math.random() * 0.4); }
      else { burst(0.1, 900, 0.25, 'bandpass', 0.7); tone(160, 0.08, 'triangle', 0.04); }
    },
    splash(big = 1) { burst(0.12 * big, 1400, 0.35, 'bandpass', 0.6); for (let i = 0; i < 4; i++) burst(0.03 * big, 3000 + Math.random() * 2000, 0.05, 'bandpass', 3, 0.1 + Math.random() * 0.3); },
    bump() {
      // a deep wooden knock, and the machine's chord heard through two hands of oak
      tone(70, 0.5, 'sine', 0.22); tone(105, 0.3, 'triangle', 0.06); burst(0.08, 300, 0.2, 'lowpass', 1);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420; lp.connect(out);
      [261.63, 329.63, 392, 523.25].forEach((f, i) => {
        const t = ctx.currentTime + 0.3 + i * 0.05;
        const os = ctx.createOscillator(); os.type = 'sawtooth'; os.frequency.value = f;
        const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(0.035, t + 0.4); g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
        os.connect(g); g.connect(lp); os.start(t); os.stop(t + 3.3);
      });
    },
    gull(pan = 0, dist = 10) {
      const g = Math.max(0, 0.06 - dist * 0.0025);
      if (g <= 0.004) return;
      const p = ctx.createStereoPanner ? ctx.createStereoPanner() : null;
      const dest = ctx.createGain(); dest.gain.value = g;
      if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); dest.connect(p); p.connect(out); } else dest.connect(out);
      const n = 2 + Math.floor(Math.random() * 3);
      for (let k = 0; k < n; k++) {
        const t = ctx.currentTime + k * 0.28;
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        const base = 1250 + Math.random() * 200;
        o.frequency.setValueAtTime(base * 0.75, t); o.frequency.linearRampToValueAtTime(base, t + 0.06); o.frequency.exponentialRampToValueAtTime(base * 0.55, t + 0.24);
        const v = ctx.createOscillator(); v.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = 40; v.connect(vg); vg.connect(o.frequency);
        const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 2.5;
        const gg = ctx.createGain(); gg.gain.setValueAtTime(0, t); gg.gain.linearRampToValueAtTime(1, t + 0.03); gg.gain.exponentialRampToValueAtTime(0.001, t + 0.26);
        o.connect(f); f.connect(gg); gg.connect(dest); o.start(t); o.stop(t + 0.3); v.start(t); v.stop(t + 0.3);
      }
    },
    crab() { for (let i = 0; i < 5; i++) burst(0.025, 3500, 0.02, 'bandpass', 4, i * 0.035); },
    flap() { for (let i = 0; i < 4; i++) burst(0.05, 500, 0.08, 'bandpass', 0.8, i * 0.11); },
    stop() { out.gain.setTargetAtTime(0, ctx.currentTime, 0.4); setTimeout(() => { try { surfLow.s.stop(); surfWash.s.stop(); wind.s.stop(); leaves.s.stop(); out.disconnect(); } catch (e) {} }, 2500); },
  };
}
