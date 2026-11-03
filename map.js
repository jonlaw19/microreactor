// map.js: a top-down site map drawn from the walk colliders, with a minimap, a compass strip,
// named places you can travel to, and the field checklist. All canvas 2D, no extra geometry.
const INK = '#fffcf4', GREY = '#78797f', BG = '#0d0a05', ACCENT = '#ffb547';

/** Build a static blueprint layer once from the collider world and a few drawn features. */
function buildLayer({ world, features, scale, bounds }) {
  const [X0, X1, Z0, Z1] = bounds, w = Math.ceil((X1 - X0) * scale), h = Math.ceil((Z1 - Z0) * scale);
  const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d');
  const px = (x) => (x - X0) * scale, pz = (z) => (z - Z0) * scale;
  g.fillStyle = 'rgba(255,252,244,0.035)'; g.fillRect(0, 0, w, h);
  // 10 m blueprint grid
  g.strokeStyle = 'rgba(255,252,244,0.06)'; g.lineWidth = 1; g.beginPath();
  for (let x = Math.ceil(X0 / 10) * 10; x <= X1; x += 10) { g.moveTo(px(x) + 0.5, 0); g.lineTo(px(x) + 0.5, h); }
  for (let z = Math.ceil(Z0 / 10) * 10; z <= Z1; z += 10) { g.moveTo(0, pz(z) + 0.5); g.lineTo(w, pz(z) + 0.5); }
  g.stroke();
  // pads and roads
  features.pads?.forEach(([x0, x1, z0, z1]) => { g.fillStyle = 'rgba(255,252,244,0.03)'; g.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale); });
  features.roads?.forEach(([x0, x1, z0, z1]) => { g.fillStyle = 'rgba(255,252,244,0.12)'; g.fillRect(px(x0), pz(z0), (x1 - x0) * scale, (z1 - z0) * scale); });
  features.water?.forEach(([x, z, rx, rz]) => { g.fillStyle = 'rgba(120,150,190,0.35)'; g.beginPath(); g.ellipse(px(x), pz(z), rx * scale, rz * scale, 0, 0, Math.PI * 2); g.fill(); });
  // fences: dashed hairlines
  g.setLineDash([3, 3]); g.lineWidth = 1; g.strokeStyle = 'rgba(255,252,244,0.35)';
  features.fences?.forEach(([x0, z0, x1, z1]) => { g.beginPath(); g.moveTo(px(x0), pz(z0)); g.lineTo(px(x1), pz(z1)); g.stroke(); });
  g.setLineDash([]);
  // colliders: anything wall-height reads as a footprint; low things (curbs, pads) read faint
  for (const b of world.boxes) {
    const hgt = b.y1 - b.y0, fw = b.x1 - b.x0, fd = b.z1 - b.z0;
    if (hgt < 0.6 || fw * fd < 0.2 || b.y0 > 7) continue;
    const a = hgt >= 2.2 ? 0.28 : 0.12;
    g.fillStyle = `rgba(255,252,244,${a})`; g.fillRect(px(b.x0), pz(b.z0), fw * scale, fd * scale);
    if (hgt >= 2.2 && fw * fd > 4) { g.strokeStyle = 'rgba(255,252,244,0.55)'; g.lineWidth = 1; g.strokeRect(px(b.x0) + 0.5, pz(b.z0) + 0.5, fw * scale - 1, fd * scale - 1); }
  }
  for (const cy of world.cyls) {
    if (cy.y1 - cy.y0 < 0.6 || cy.r < 0.25) continue;
    g.fillStyle = `rgba(255,252,244,${cy.r > 1 ? 0.28 : 0.16})`; g.beginPath(); g.arc(px(cy.x), pz(cy.z), cy.r * scale, 0, Math.PI * 2); g.fill();
    if (cy.r > 1) { g.strokeStyle = 'rgba(255,252,244,0.55)'; g.stroke(); }
  }
  return { canvas: c, scale, bounds, px, pz };
}

export function createMap({ world, features, places, labels, getPlayer, getNpcs, isClear, onTravel, el, objectives }) {
  const bounds = features.bounds || [-80, 160, -90, 40];
  const layer = buildLayer({ world, features, scale: 4, bounds });
  const view = { cx: 40, cz: -20, scale: 3.2 }; // px per metre on the full map
  let open = false, drag = null, dpr = 1;

  // ---- drawing helpers shared by the full map and the minimap
  function drawWorld(g, w, h, cx, cz, scale, { showLabels = true, showPlaces = true, placeNames = true, labelMin = 5.5 } = {}) {
    g.save(); g.fillStyle = BG; g.fillRect(0, 0, w, h);
    const sx = scale / layer.scale, ox = w / 2 - (cx - bounds[0]) * scale, oz = h / 2 - (cz - bounds[2]) * scale;
    g.imageSmoothingEnabled = scale < layer.scale;
    g.drawImage(layer.canvas, ox, oz, layer.canvas.width * sx, layer.canvas.height * sx);
    const toX = (x) => w / 2 + (x - cx) * scale, toZ = (z) => h / 2 + (z - cz) * scale;
    // north arrow
    g.fillStyle = GREY; g.font = '500 10px Inter, system-ui, sans-serif'; g.textAlign = 'center';
    // labels
    if (showLabels && scale >= labelMin) {
      g.font = `500 ${Math.max(10, Math.min(13, scale * 3.2))}px Inter, system-ui, sans-serif`; g.textAlign = 'left'; g.textBaseline = 'middle';
      for (const L of labels) { const x = toX(L.x), z = toZ(L.z); if (x < -40 || z < -10 || x > w + 40 || z > h + 10) continue; g.fillStyle = INK; g.beginPath(); g.arc(x, z, 2, 0, Math.PI * 2); g.fill(); g.fillStyle = 'rgba(255,252,244,0.82)'; g.fillText(L.name, x + 6, z); }
    }
    if (showPlaces) {
      g.font = '500 10px Inter, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'top';
      // place names: below the marker, else above, else to the right; a name that would still overlap another is left off (the list beside the map has them all)
      const taken = [];
      const free = (r) => !taken.some((t) => r.x0 < t.x1 && r.x1 > t.x0 && r.y0 < t.y1 && r.y1 > t.y0);
      for (const P of places) { const x = toX(P.x), z = toZ(P.z); if (x < -20 || z < -20 || x > w + 20 || z > h + 20) continue; g.strokeStyle = ACCENT; g.lineWidth = 1.5; g.beginPath(); g.moveTo(x, z - 6); g.lineTo(x + 5, z); g.lineTo(x, z + 6); g.lineTo(x - 5, z); g.closePath(); g.stroke(); taken.push({ x0: x - 7, x1: x + 7, y0: z - 7, y1: z + 7 });
        if (placeNames && scale >= 3.2) { const name = P.name.toUpperCase(), tw = g.measureText(name).width + 6, th = 12;
          const spots = [[x - tw / 2, z + 9, 'center'], [x - tw / 2, z - 9 - th, 'center'], [x + 9, z - th / 2, 'left'], [x - 9 - tw, z - th / 2, 'right']];
          for (const [rx, ry, align] of spots) { const r = { x0: rx, x1: rx + tw, y0: ry, y1: ry + th }; if (!free(r)) continue; taken.push(r); g.fillStyle = ACCENT; g.textAlign = align; g.fillText(name, align === 'center' ? x : align === 'left' ? x + 12 : x - 12, ry); break; } g.textAlign = 'center'; } }
    }
    // workers
    const npcs = getNpcs?.() || [];
    g.fillStyle = '#ff7a1a'; for (const n of npcs) { g.beginPath(); g.arc(toX(n.x), toZ(n.z), 2.5, 0, Math.PI * 2); g.fill(); }
    // you
    const p = getPlayer(); if (p) {
      const x = toX(p.x), z = toZ(p.z), hx = Math.sin(p.heading), hz = -Math.cos(p.heading); // heading 0 = north (-z)
      g.fillStyle = 'rgba(255,252,244,0.18)'; g.beginPath(); g.moveTo(x, z); g.arc(x, z, Math.max(16, scale * 6), Math.atan2(hz, hx) - 0.5, Math.atan2(hz, hx) + 0.5); g.closePath(); g.fill();
      g.fillStyle = INK; g.beginPath(); g.arc(x, z, 4.5, 0, Math.PI * 2); g.fill(); g.strokeStyle = BG; g.lineWidth = 1.5; g.stroke();
    }
    g.restore();
    return { toX, toZ };
  }

  // ---- full map
  const canvas = el.canvas, g = canvas.getContext('2d');
  function size() { dpr = Math.min(devicePixelRatio || 1, 2); const r = canvas.getBoundingClientRect(); canvas.width = Math.round(r.width * dpr); canvas.height = Math.round(r.height * dpr); }
  function render() {
    if (!open) return; const w = canvas.width / dpr, h = canvas.height / dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawWorld(g, w, h, view.cx, view.cz, view.scale);
    // scale bar
    const m = view.scale >= 6 ? 10 : view.scale >= 2.5 ? 25 : 50, bw = m * view.scale; g.strokeStyle = INK; g.lineWidth = 1; g.beginPath(); g.moveTo(w - 24 - bw, h - 22); g.lineTo(w - 24, h - 22); g.stroke(); g.fillStyle = GREY; g.font = '500 10px Inter, system-ui, sans-serif'; g.textAlign = 'right'; g.textBaseline = 'bottom'; g.fillText(`${m} m`, w - 24, h - 26);
    g.textAlign = 'left'; g.fillText('N ↑', 24, h - 26);
  }
  function toWorld(clientX, clientY) { const r = canvas.getBoundingClientRect(); const w = r.width, h = r.height; return { x: view.cx + (clientX - r.left - w / 2) / view.scale, z: view.cz + (clientY - r.top - h / 2) / view.scale }; }
  canvas.addEventListener('wheel', (ev) => { ev.preventDefault(); const before = toWorld(ev.clientX, ev.clientY); view.scale = Math.max(0.9, Math.min(14, view.scale * (ev.deltaY < 0 ? 1.15 : 1 / 1.15))); const after = toWorld(ev.clientX, ev.clientY); view.cx += before.x - after.x; view.cz += before.z - after.z; render(); }, { passive: false });
  canvas.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, cx: view.cx, cz: view.cz, moved: 0 }; canvas.setPointerCapture(ev.pointerId); });
  canvas.addEventListener('pointermove', (ev) => { if (!drag) return; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy)); view.cx = drag.cx - dx / view.scale; view.cz = drag.cz - dy / view.scale; render(); });
  canvas.addEventListener('pointerup', (ev) => { if (!drag) return; const moved = drag.moved; drag = null; if (moved > 5) return; const p = toWorld(ev.clientX, ev.clientY); const place = places.find((P) => Math.hypot(P.x - p.x, P.z - p.z) * view.scale < 14); if (place) { onTravel(place); return; } if (isClear(p.x, p.z)) onTravel({ x: p.x, z: p.z }); else el.hint.textContent = 'That spot is inside a structure. Click open ground or a marker.'; });
  canvas.addEventListener('pointercancel', () => { drag = null; });

  function renderList() {
    el.places.innerHTML = places.map((P) => `<button class="mi" data-place="${P.id}"><b>${P.name}</b><span>${P.hint || ''}</span></button>`).join('');
    el.places.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => onTravel(places.find((P) => P.id === b.dataset.place))));
  }
  function renderChecklist() {
    if (!objectives || !el.check) return;
    const list = objectives.list(), done = list.filter((o) => o.done).length;
    el.checkHead.textContent = `Field checklist · ${done} / ${list.length}`;
    el.check.innerHTML = list.map((o) => `<li class="${o.done ? 'done' : ''}"><span class="tick"></span>${o.name}</li>`).join('');
  }
  function show(v) {
    open = v; el.root.classList.toggle('hidden', !v); document.body.classList.toggle('mapOpen', v);
    if (v) { size(); const w = canvas.width / dpr, h = canvas.height / dpr; const fit = features.fit || [-20, 146, -72, 24];
      view.scale = Math.max(1.2, Math.min((w - 40) / (fit[1] - fit[0]), (h - 40) / (fit[3] - fit[2]))); view.cx = (fit[0] + fit[1]) / 2; view.cz = (fit[2] + fit[3]) / 2;
      renderList(); renderChecklist(); render(); el.hint.textContent = 'Click open ground or a marker to travel there. Scroll to zoom, drag to pan.'; }
  }
  el.close.addEventListener('click', () => show(false));
  el.root.addEventListener('click', (ev) => { if (ev.target === el.root) show(false); });
  addEventListener('resize', () => { if (open) { size(); render(); } });

  // ---- minimap and compass
  const mini = el.mini, mg = mini.getContext('2d'), comp = el.compass, cg = comp.getContext('2d');
  let miniT = 0;
  function tick(now) {
    if (open) { if (now - miniT > 120) { miniT = now; render(); renderChecklist(); } return; }
    if (!el.mini.offsetParent) return; // hidden
    if (now - miniT < 80) return; miniT = now;
    const d = Math.min(devicePixelRatio || 1, 2), mw = mini.clientWidth || 180, mh = mini.clientHeight || 180;
    if (mini.width !== Math.round(mw * d)) { mini.width = Math.round(mw * d); mini.height = Math.round(mh * d); }
    mg.setTransform(d, 0, 0, d, 0, 0);
    const p = getPlayer(); if (!p) return;
    drawWorld(mg, mw, mh, p.x, p.z, 3.0, { showLabels: false, showPlaces: true, placeNames: false });
    // compass strip: heading in degrees, 0 = north
    const cw = comp.clientWidth || 260, ch = comp.clientHeight || 26;
    if (comp.width !== Math.round(cw * d)) { comp.width = Math.round(cw * d); comp.height = Math.round(ch * d); }
    cg.setTransform(d, 0, 0, d, 0, 0); cg.clearRect(0, 0, cw, ch);
    const deg = ((p.heading * 180) / Math.PI + 360) % 360, pxPerDeg = cw / 120;
    cg.font = '500 11px Inter, system-ui, sans-serif'; cg.textAlign = 'center'; cg.textBaseline = 'middle';
    for (let a = -75; a <= 75; a += 15) {
      let hd = Math.round((deg + a) / 15) * 15; const off = hd - deg; let x = cw / 2 + ((off + 540) % 360 - 180) * pxPerDeg; if (x < 0 || x > cw) continue;
      hd = ((hd % 360) + 360) % 360; const major = hd % 90 === 0;
      cg.strokeStyle = major ? INK : 'rgba(255,252,244,0.4)'; cg.lineWidth = 1; cg.beginPath(); cg.moveTo(x, ch - (major ? 10 : 6)); cg.lineTo(x, ch); cg.stroke();
      if (major) { cg.fillStyle = INK; cg.fillText(['N', 'E', 'S', 'W'][hd / 90], x, 7); }
    }
    // place markers by bearing
    for (const P of places) { const dx = P.x - p.x, dz = P.z - p.z, dist = Math.hypot(dx, dz); if (dist < 4 || dist > 220) continue; const bearing = ((Math.atan2(dx, -dz) * 180) / Math.PI + 360) % 360; let off = ((bearing - deg + 540) % 360) - 180; if (Math.abs(off) > 60) continue; const x = cw / 2 + off * pxPerDeg; cg.fillStyle = ACCENT; cg.beginPath(); cg.moveTo(x, ch - 14); cg.lineTo(x + 3.5, ch - 8); cg.lineTo(x - 3.5, ch - 8); cg.closePath(); cg.fill(); }
    cg.strokeStyle = INK; cg.lineWidth = 1.5; cg.beginPath(); cg.moveTo(cw / 2, 0); cg.lineTo(cw / 2, ch); cg.stroke();
  }
  return { show, toggle: () => show(!open), get open() { return open; }, tick, renderChecklist, render };
}

/** Objectives: small tests against the walker's position plus events the host fires. Progress persists through the host's save hook. */
export function createObjectives({ list, done = [], onDone, save }) {
  const state = new Set(done);
  const items = list.map((o) => ({ ...o }));
  function complete(id) { if (state.has(id)) return false; const o = items.find((x) => x.id === id); if (!o) return false; state.add(id); save?.([...state]); onDone?.(o, state.size, items.length); return true; }
  return {
    list: () => items.map((o) => ({ ...o, done: state.has(o.id) })),
    complete,
    check(p) { for (const o of items) if (!state.has(o.id) && o.test && o.test(p)) complete(o.id); },
    get count() { return state.size; }, get total() { return items.length; },
  };
}
