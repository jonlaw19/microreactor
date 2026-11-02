// cine.js: a shot-list camera driver for the 60-second intro tour.
// Each shot moves the camera from one pose to another over a fixed time, shows a caption, and runs
// optional enter/leave hooks. Cuts dip to black. The whole list is also exported as text for the guide.
const EASE = {
  io: (k) => k * k * (3 - 2 * k),
  in: (k) => k * k,
  out: (k) => 1 - (1 - k) * (1 - k),
  lin: (k) => k,
  soft: (k) => k * k * k * (k * (k * 6 - 15) + 10),
};
const FADE = 0.4; // seconds of dip at each cut

export function createCine({ camera, controls, ui }) {
  const st = { active: false, shots: [], i: -1, t: 0, total: 0, elapsed: 0, onEnd: null, reason: '' };
  const v = (a) => (a.isVector3 ? a.clone() : camera.position.clone().set(a[0], a[1], a[2])); // no three import: Node reads INTRO_SCRIPT from this file
  const pad = (n) => String(n).padStart(2, '0');

  function caption(s, i, n) {
    ui.step.textContent = `${pad(i + 1)} / ${pad(n)} · ${s.label}`;
    ui.title.textContent = s.title; ui.text.textContent = s.text;
  }
  function enter(i) {
    const s = st.shots[i]; st.i = i; st.t = 0;
    s.p0 = v(s.from[0]); s.t0 = v(s.from[1]); s.p1 = v(s.to[0]); s.t1 = v(s.to[1]);
    caption(s, i, st.shots.length); ui.cap.classList.remove('show');
    s.enter?.();
    place(0);
  }
  function leave(i) { const s = st.shots[i]; if (s) s.leave?.(); }
  function place(k) {
    const s = st.shots[st.i]; if (!s) return;
    const e = (EASE[s.ease] || EASE.io)(Math.min(1, Math.max(0, k)));
    camera.position.lerpVectors(s.p0, s.p1, e); controls.target.lerpVectors(s.t0, s.t1, e);
    if (s.onFrame) s.onFrame(e, k);
  }
  function start(shots, { onEnd } = {}) {
    st.shots = shots; st.total = shots.reduce((a, s) => a + s.dur, 0); st.elapsed = 0; st.onEnd = onEnd || null; st.active = true; st.reason = '';
    ui.root.classList.remove('hidden'); document.body.classList.add('cine'); ui.fade.style.opacity = '1'; ui.prog.style.width = '0%';
    controls.enabled = false; controls.autoRotate = false;
    enter(0);
  }
  function finish(reason) {
    if (!st.active) return; st.active = false; st.reason = reason;
    leave(st.i); st.i = -1;
    ui.root.classList.add('hidden'); document.body.classList.remove('cine'); ui.cap.classList.remove('show');
    controls.enabled = true;
    st.onEnd?.(reason);
  }
  function update(dt) {
    if (!st.active) return;
    const s = st.shots[st.i]; if (!s) return finish('end');
    st.t += dt; st.elapsed += dt;
    place(st.t / s.dur);
    const edge = Math.min(st.t / FADE, (s.dur - st.t) / FADE);
    ui.fade.style.opacity = String(Math.max(0, Math.min(1, 1 - edge)));
    const capOn = st.t > 0.55 && st.t < s.dur - 0.5;
    ui.cap.classList.toggle('show', capOn);
    ui.prog.style.width = Math.min(100, (st.elapsed / st.total) * 100).toFixed(2) + '%';
    if (st.t >= s.dur) { leave(st.i); if (st.i + 1 >= st.shots.length) finish('end'); else enter(st.i + 1); }
  }
  /** Jump to an absolute time in seconds (for tests and screenshots). */
  function seek(T) {
    if (!st.active) return;
    let acc = 0;
    for (let i = 0; i < st.shots.length; i++) {
      const d = st.shots[i].dur;
      if (T < acc + d || i === st.shots.length - 1) { if (st.i !== i) { leave(st.i); enter(i); } st.t = Math.max(0, Math.min(d - 0.01, T - acc)); st.elapsed = T; place(st.t / d); ui.cap.classList.toggle('show', st.t > 0.55 && st.t < d - 0.5); ui.fade.style.opacity = '0'; return; }
      acc += d;
    }
  }
  return { start, update, skip: () => finish('skip'), seek, state: st, get active() { return st.active; } };
}

/** The tour as text, for the crawlable guide and the llms files. Keep in step with the shot list in app.js. */
export const INTRO_SCRIPT = [
  { label: 'What it is', title: 'What is a microreactor?', text: 'A nuclear power plant small enough to build in a factory and deliver on a truck.' },
  { label: 'Output', title: 'Ten megawatts of electricity', text: 'That is enough for about 8,000 homes, or for one data hall.' },
  { label: 'The module', title: 'One module, one truck', text: 'The reactor sits in a steel vessel inside a concrete silo. The whole module arrives on one truck.' },
  { label: 'The core', title: 'Fuel pins and control drums', text: 'Uranium fuel pins heat up. Twelve rotating drums set the power level.' },
  { label: 'The coolant', title: 'Liquid sodium carries the heat', text: 'Sodium moves heat out of the core. It stays liquid without pressure.' },
  { label: 'Power', title: 'Heat becomes electricity', text: 'A turbine turns the heat into power. Fans reject the waste heat, so the plant needs no cooling water.' },
  { label: 'The load', title: 'A data center next door', text: 'A short line carries the power to the data hall. Batteries and generators keep the servers up.' },
  { label: 'Safety', title: 'It shuts itself down', text: 'Rods drop by gravity and stop the reaction. Air alone carries away the leftover heat.' },
  { label: 'Other designs', title: 'Heat pipes, helium, and molten salt', text: 'Other microreactors use different coolants. Three of them stand in the park down the road.' },
  { label: 'Explore', title: 'Now it is yours', text: 'Cut it open. Run the physics. Walk the site.' },
];
