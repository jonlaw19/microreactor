// audio.js — synthesized plant soundscape. No audio files: every source is an oscillator or filtered noise.
// Positional sources sit in the scene (transformer hum, turbine whine, cooler fans, data hall, generators,
// highway, pond crickets); wind, rain and thunder are global. Footsteps and doors are one-shots.
import * as THREE from 'three';

export function createAudio({ camera, scene }) {
  const listener = new THREE.AudioListener();
  let ctx = null, master = null, started = false, enabled = false;
  const pos = [], glob = {}, S = { wind: 0.3, rain: 0, walking: false, indoors: 0 };

  function noiseBuffer(seconds = 2, color = 'white') {
    const n = Math.floor(ctx.sampleRate * seconds), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) { const w = Math.random() * 2 - 1; if (color === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w; }
    return b;
  }
  const noiseSrc = (color = 'white') => { const s = ctx.createBufferSource(); s.buffer = noiseBuffer(2 + Math.random(), color); s.loop = true; s.start(); return s; };
  const osc = (type, f) => { const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; o.start(); return o; };
  const filt = (type, f, Q = 1) => { const b = ctx.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = Q; return b; };
  const gain = (v) => { const g = ctx.createGain(); g.gain.value = v; return g; };
  const chain = (...nodes) => { for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]); return nodes[nodes.length - 1]; };

  /** Positional source: node graph ending in `out`, placed at p, heard within `dist` metres. */
  function place(out, p, { ref = 3, dist = 40, roll = 1.6, level = 1 } = {}) {
    const a = new THREE.PositionalAudio(listener);
    a.setNodeSource(out); a.setRefDistance(ref); a.setMaxDistance(dist); a.setRolloffFactor(roll); a.setDistanceModel('inverse'); a.setVolume(level);
    a.userData.level = level; a.position.copy(p); scene.add(a); pos.push(a); return a;
  }

  function build() {
    ctx = listener.context; master = listener.gain; listener.setMasterVolume(0);
    // transformer hum: 60 Hz fundamental, 120/180 harmonics, slow beat
    { const g = gain(1); [[60, 'sine', 0.5], [120, 'sine', 0.9], [180, 'triangle', 0.25], [240, 'sine', 0.12]].forEach(([f, t, v]) => { const o = osc(t, f); o.detune.value = (Math.random() - 0.5) * 6; chain(o, gain(v), g); });
      const lp = filt('lowpass', 900); chain(g, lp); place(lp, new THREE.Vector3(9.8, 1.8, -10.8), { ref: 2.5, dist: 30, level: 0.7 }); glob.hum = g;
      const g2 = gain(1); [[60, 0.5], [120, 0.9], [180, 0.2]].forEach(([f, v]) => chain(osc('sine', f), gain(v), g2)); const lp2 = filt('lowpass', 800); chain(g2, lp2); place(lp2, new THREE.Vector3(12.6, 1.8, -36.8), { ref: 3, dist: 34, level: 0.8 }); }
    // turbine-generator whine: a high tone with a wobble, pitched by electrical output
    { const o = osc('sawtooth', 420), lp = filt('lowpass', 1800, 2), g = gain(0.0); const w = osc('sine', 0.7), wg = gain(6); chain(w, wg, o.frequency); chain(o, lp, g); place(g, new THREE.Vector3(9.1, 1.4, 0), { ref: 2, dist: 26, level: 0.45 }); glob.turbine = { o, g }; }
    // dry cooler fans: broadband rush plus a blade-pass flutter
    { const n = noiseSrc(), bp = filt('bandpass', 520, 0.6), g = gain(0.0); const lfo = osc('sine', 9), lg = gain(0.25); chain(lfo, lg, g.gain); chain(n, bp, g); place(g, new THREE.Vector3(16.5, 2.4, 0), { ref: 3, dist: 30, level: 0.55 }); glob.cooler = { g }; }
    // data hall: deep fan wash and a 120 Hz electrical floor, strongest inside
    { const n = noiseSrc('brown'), lp = filt('lowpass', 700), g = gain(0.9); chain(n, lp, g); const o = osc('sine', 120), og = gain(0.08); chain(o, og, g); place(g, new THREE.Vector3(20, 3, -55), { ref: 14, dist: 70, roll: 1.2, level: 0.9 }); glob.hall = g; }
    // backup generators: diesel rumble when running
    { const n = noiseSrc('brown'), lp = filt('lowpass', 220), g = gain(0); const o = osc('sawtooth', 30), og = gain(0.5), olp = filt('lowpass', 160); chain(o, olp, og, g); chain(n, lp, g); place(g, new THREE.Vector3(27, 2, -37.5), { ref: 5, dist: 60, level: 0.9 }); glob.gens = g; }
    // highway: distant tyre wash
    { const n = noiseSrc(), bp = filt('bandpass', 900, 0.4), g = gain(0.5); const lfo = osc('sine', 0.13), lg = gain(0.2); chain(lfo, lg, g.gain); chain(n, bp, g); place(g, new THREE.Vector3(150, 2, 10), { ref: 30, dist: 260, roll: 1.0, level: 0.5 }); }
    // pond: crickets, a chorus of short chirps
    { const g = gain(0.6); for (let k = 0; k < 3; k++) { const o = osc('sine', 3800 + k * 420), e = gain(0); const lfo = osc('square', 2.2 + k * 0.7), lg = gain(0.5); chain(lfo, lg, e.gain); e.gain.value = 0.5; const hp = filt('highpass', 2500); chain(o, e, hp, g); } place(g, new THREE.Vector3(-48, 0.5, -26), { ref: 8, dist: 60, level: 0.18 }); }
    // wind (global) and rain (global)
    { const n = noiseSrc(), lp = filt('lowpass', 420, 0.5), g = gain(0); const lfo = osc('sine', 0.09), lg = gain(0.35); chain(lfo, lg, g.gain); chain(n, lp, g, master); glob.wind = { g, lp }; }
    { const n = noiseSrc(), hp = filt('highpass', 1800, 0.7), g = gain(0); chain(n, hp, g, master); glob.rain = g; }
    // pickup engine: a low saw with a lowpass that opens with speed, not positional because you are inside it
    { const o = osc('sawtooth', 38), lp = filt('lowpass', 220, 1.2), g = gain(0); const o2 = osc('square', 76), g2 = gain(0.25); chain(o2, g2, lp); chain(o, lp, g, master); glob.engine = { o, o2, lp, g }; }
    started = true;
  }

  /** Short noise burst through a filter: footsteps, latches, thunder. */
  function burst({ dur = 0.08, f = 800, Q = 1, type = 'bandpass', level = 0.3, color = 'white', sweep = 0, at = null, decay = 1 }) {
    if (!started || !enabled) return;
    const t0 = ctx.currentTime, s = ctx.createBufferSource(); s.buffer = noiseBuffer(Math.min(dur + 0.1, 3), color);
    const b = filt(type, f, Q), g = gain(0.0001);
    if (sweep) { b.frequency.setValueAtTime(f, t0); b.frequency.exponentialRampToValueAtTime(Math.max(40, f * sweep), t0 + dur); }
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(level, t0 + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur * decay);
    let out = master;
    if (at) { const a = new THREE.PositionalAudio(listener); a.setRefDistance(3); a.setMaxDistance(40); a.setRolloffFactor(1.5); a.position.copy(at); scene.add(a); a.setNodeSource(g); setTimeout(() => scene.remove(a), (dur + 0.5) * 1000); chain(s, b, g); s.start(); s.stop(t0 + dur + 0.1); return; }
    chain(s, b, g, out); s.start(); s.stop(t0 + dur + 0.1);
  }

  const api = {
    listener, state: S,
    get enabled() { return enabled; },
    async toggle(on = !enabled) {
      enabled = on;
      if (on && !started) { camera.add(listener); build(); }
      if (on && listener.context.state === 'suspended') await listener.context.resume();
      if (started) listener.setMasterVolume(on ? 1 : 0);
      return enabled;
    },
    update(dt, p) {
      if (!started || !enabled) return;
      // plant state → levels
      if (glob.turbine) { glob.turbine.g.gain.value = THREE.MathUtils.lerp(glob.turbine.g.gain.value, 0.2 * Math.min(1.2, p.elec), 0.05); glob.turbine.o.frequency.value = 380 + 160 * Math.min(1.2, p.elec); }
      if (glob.cooler) glob.cooler.g.gain.value = THREE.MathUtils.lerp(glob.cooler.g.gain.value, 0.25 + 0.6 * Math.min(1, p.spin), 0.05);
      if (glob.gens) glob.gens.gain.value = THREE.MathUtils.lerp(glob.gens.gain.value, p.gens ? 0.8 : 0, 0.03);
      if (glob.wind) { glob.wind.g.gain.value = 0.02 + 0.45 * S.wind * S.wind; glob.wind.lp.frequency.value = 300 + 700 * S.wind; }
      if (glob.rain) glob.rain.gain.value = THREE.MathUtils.lerp(glob.rain.gain.value, 0.35 * S.rain, 0.04);
      if (glob.engine) { const k = S.engine || 0; glob.engine.g.gain.value = THREE.MathUtils.lerp(glob.engine.g.gain.value, k > 0 ? 0.08 + 0.12 * k : 0, 0.08); glob.engine.o.frequency.value = 36 + 90 * k; glob.engine.o2.frequency.value = 72 + 180 * k; glob.engine.lp.frequency.value = 200 + 900 * k; }
      // indoors: dull the outdoor sources
      const duck = 1 - 0.55 * S.indoors; pos.forEach((a) => a.setVolume(a.userData.level * duck));
    },
    footstep(hard) { burst({ dur: 0.07, f: hard ? 1400 : 500, Q: 0.8, level: hard ? 0.12 : 0.08, color: 'white', sweep: 0.5 }); },
    door(kind, at, opening) { if (kind === 'roll') burst({ dur: 1.6, f: 160, Q: 2, level: 0.25, color: 'brown', at, decay: 1 }); else { burst({ dur: 0.05, f: 2200, Q: 3, level: 0.2, at }); setTimeout(() => burst({ dur: 0.45, f: opening ? 300 : 180, Q: 6, level: 0.1, at, sweep: opening ? 2.2 : 0.5 }), 60); } },
    thunder(delay = 0) { setTimeout(() => { burst({ dur: 2.8, f: 180, Q: 0.7, type: 'lowpass', level: 0.9, color: 'brown', sweep: 0.35, decay: 1 }); setTimeout(() => burst({ dur: 3.5, f: 90, Q: 0.5, type: 'lowpass', level: 0.6, color: 'brown', decay: 1 }), 400); }, delay); },
    scramAlarm() { if (!started || !enabled) return; const t0 = ctx.currentTime; for (let i = 0; i < 4; i++) { const o = osc('square', 880), g = gain(0.0001); chain(o, filt('lowpass', 2400), g, master); g.gain.setValueAtTime(0.0001, t0 + i * 0.5); g.gain.exponentialRampToValueAtTime(0.08, t0 + i * 0.5 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.5 + 0.3); o.stop(t0 + i * 0.5 + 0.35); } },
    click() { burst({ dur: 0.03, f: 1800, Q: 2, level: 0.08 }); },
    engine(on, k) { S.engine = on ? Math.max(0.001, k) : 0; },
  };
  return api;
}
