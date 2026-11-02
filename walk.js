// walk.js — first- and third-person walk mode.
// Capsule controller against hand-registered colliders, walkable surfaces, animated doors,
// an articulated hi-vis figure, pointer-lock or drag look, touch joystick, interaction reticle.
import * as THREE from 'three';

// ------------------------------------------------------------------ collision world
// box: {x0,x1,y0,y1,z0,z1}   cyl: {x,z,r,y0,y1}   surf: {x0,x1,z0,z1, y:number|fn(x,z)}   door: see makeDoor
export const WORLD = { boxes: [], cyls: [], rings: [], surfs: [], doors: [], ladders: [], solidMeshes: [] };
export const PLAYER = { r: 0.32, h: 1.72, eye: 1.62, step: 0.46, walk: 2.2, run: 6.4, jump: 3.6, climb: 1.8 };

export function addBox(x0, x1, y0, y1, z0, z1, extra) { const b = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), y0: Math.min(y0, y1), y1: Math.max(y0, y1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), ...extra }; WORLD.boxes.push(b); return b; }
export function addCyl(x, z, r, y0, y1) { const c = { x, z, r, y0, y1 }; WORLD.cyls.push(c); return c; }
/** Thin ring wall (guard rail, tank wall) between radii r0 and r1. Never a floor. */
export function addRing(x, z, r0, r1, y0, y1, gap) { const g = { x, z, r0, r1, y0, y1, gap }; WORLD.rings.push(g); return g; }
const inGap = (g, dx, dz) => { if (!g.gap) return false; let a = Math.atan2(dz, dx) - g.gap[0]; a = Math.atan2(Math.sin(a), Math.cos(a)); return Math.abs(a) < g.gap[1]; };
export function addSurf(x0, x1, z0, z1, y) { const s = { x0: Math.min(x0, x1), x1: Math.max(x0, x1), z0: Math.min(z0, z1), z1: Math.max(z0, z1), y }; WORLD.surfs.push(s); return s; }
/** Sloped surface along x or z: y runs from ya at (x0|z0) to yb at (x1|z1). */
export function addRamp(x0, x1, z0, z1, ya, yb, axis = 'x') {
  const s = addSurf(x0, x1, z0, z1, 0);
  s.y = axis === 'x' ? (x) => ya + (yb - ya) * THREE.MathUtils.clamp((x - s.x0) / (s.x1 - s.x0), 0, 1) : (x, z) => ya + (yb - ya) * THREE.MathUtils.clamp((z - s.z0) / (s.z1 - s.z0), 0, 1);
  return s;
}
export function addDisc(x, z, r, y) { const s = { disc: true, x, z, r, y }; WORLD.surfs.push(s); return s; }
/** Fixed ladder on a wall face at (x,z); (nx,nz) points away from the wall; climb from y0 to y1 and step onto the surface behind. */
export function addLadder(x, z, y0, y1, nx, nz, label = 'Ladder') { const l = { x, z, y0, y1, nx, nz, label }; WORLD.ladders.push(l); return l; }

const _b = new THREE.Box3(), _m = new THREE.Matrix4(), _gb = new THREE.Box3();
/** World AABBs for a mesh or instanced mesh; skips thin or transparent pieces unless forced. */
export function boxesFromMesh(mesh, opts = {}) {
  const mat = mesh.material; if (!mat || (!opts.force && mat.transparent && mat.opacity < 0.5)) return [];
  if (!mesh.geometry.boundingBox) mesh.geometry.computeBoundingBox();
  const gb = mesh.geometry.boundingBox, out = [];
  const push = (b) => {
    const w = b.max.x - b.min.x, h = b.max.y - b.min.y, d = b.max.z - b.min.z;
    const minH = (opts.minH ?? 0.18), minV = (opts.minV ?? 0.35), maxD = opts.maxD ?? 70;
    if (!opts.force && (Math.min(w, d) < minH || h < minV || Math.max(w, d) > maxD)) return;
    // pipes, beams and rails are obstacles but never floors
    const slender = Math.min(w, d) < 0.5 || (Math.max(w, d) / Math.min(w, d) > 6 && Math.min(w, d) < 0.8);
    out.push(addBox(b.min.x, b.max.x, b.min.y, b.max.y, b.min.z, b.max.z, slender ? { noFloor: true } : undefined));
  };
  mesh.updateWorldMatrix(true, false);
  if (mesh.isInstancedMesh) {
    for (let i = 0; i < mesh.count; i++) { mesh.getMatrixAt(i, _m); _m.premultiply(mesh.matrixWorld); _gb.copy(gb).applyMatrix4(_m); push(_gb.clone()); }
  } else { _b.copy(gb).applyMatrix4(mesh.matrixWorld); push(_b.clone()); }
  return out;
}

// ------------------------------------------------------------------ doors
/**
 * kind: 'swing' (hinged, rotates ±90°), 'slide' (translates along the wall), 'roll' (lifts up and shortens).
 * hinge: world position of the hinge / closed edge at floor level. axis: 'x' or 'z' = direction the leaf runs along the wall.
 * sign: +1/-1 = which way the leaf extends from the hinge along axis. swingSign: which way a swing door opens (±1, toward -normal/+normal).
 */
export function makeDoor(scene, { kind = 'swing', hinge, axis = 'x', sign = 1, width = 1.0, height = 2.2, thick = 0.08, swingSign = 1, mesh, label = 'door', auto = false }) {
  const g = new THREE.Group(); g.position.set(hinge[0], hinge[1], hinge[2]); scene.add(g);
  const leaf = new THREE.Group(); g.add(leaf);
  mesh.position.set(axis === 'x' ? sign * width / 2 : 0, height / 2, axis === 'z' ? sign * width / 2 : 0);
  leaf.add(mesh);
  const ax0 = hinge[0] + (axis === 'x' ? Math.min(0, sign * width) : -thick / 2 - 0.02), ax1 = hinge[0] + (axis === 'x' ? Math.max(0, sign * width) : thick / 2 + 0.02);
  const az0 = hinge[2] + (axis === 'z' ? Math.min(0, sign * width) : -thick / 2 - 0.02), az1 = hinge[2] + (axis === 'z' ? Math.max(0, sign * width) : thick / 2 + 0.02);
  const block = addBox(ax0, ax1, hinge[1], hinge[1] + height, az0, az1, { door: true });
  const d = { kind, g, leaf, mesh, width, height, axis, sign, swingSign, open: 0, target: 0, block, label, auto, center: new THREE.Vector3(hinge[0] + (axis === 'x' ? sign * width / 2 : 0), hinge[1] + height / 2, hinge[2] + (axis === 'z' ? sign * width / 2 : 0)) };
  mesh.userData.door = d; mesh.traverse((o) => { o.userData.door = d; });
  WORLD.doors.push(d);
  return d;
}
export function updateDoors(dt) {
  for (const d of WORLD.doors) {
    if (Math.abs(d.open - d.target) > 0.001) d.open += (d.target - d.open) * Math.min(1, dt * 3.2); else d.open = d.target;
    const o = THREE.MathUtils.smoothstep(d.open, 0, 1);
    if (d.kind === 'swing') d.leaf.rotation.y = o * Math.PI * 0.52 * d.swingSign * (d.axis === 'x' ? -d.sign : d.sign);
    else if (d.kind === 'slide') d.leaf.position.set(d.axis === 'x' ? d.sign * d.width * 0.95 * o : 0, 0, d.axis === 'z' ? d.sign * d.width * 0.95 * o : 0);
    else { d.leaf.scale.y = 1 - 0.9 * o; d.leaf.position.y = d.height * 0.9 * o; }
    d.block.open = d.open > 0.35;
  }
}

// ------------------------------------------------------------------ controller
export function createWalk({ scene, camera, dom, terrainY, rig, onEnter, onExit, onInteract, onStep, onDoor, onKey: onExtraKey, pickables, occluders = [], isTouch = false, hud }) {
  const S = {
    active: false, first: false, pos: new THREE.Vector3(1, 0, 11), vy: 0, grounded: true, yaw: Math.PI, pitch: -0.08,
    keys: new Set(), look: { dx: 0, dy: 0 }, joy: { x: 0, y: 0 }, run: false, moving: 0, phase: 0, bob: 0, camDist: 3.4,
    inside: false, prefFirst: { in: true, out: false }, // indoors defaults to your own eyes, outdoors to the figure
    saved: null, reticle: null, lastPick: 0, jumpReq: false, headYaw: 0, frozen: false, lastStepSign: 1, ladder: null, ladderT: 0,
  };
  const ray = new THREE.Raycaster();
  const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _mv = new THREE.Vector3(), _c = new THREE.Vector3(), _t = new THREE.Vector3(), _q = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  // ---- floor and collision queries
  function floorAt(x, z, feet) {
    let y = terrainY(x, z);
    const lim = feet + PLAYER.step;
    for (const s of WORLD.surfs) {
      let inside, yy;
      if (s.disc) { inside = Math.hypot(x - s.x, z - s.z) <= s.r; yy = s.y; } else { inside = x >= s.x0 && x <= s.x1 && z >= s.z0 && z <= s.z1; yy = typeof s.y === 'function' ? s.y(x, z) : s.y; }
      if (inside && yy <= lim && yy > y) y = yy;
    }
    for (const b of WORLD.boxes) { if (b.open || b.noFloor) continue; if (x >= b.x0 - 0.05 && x <= b.x1 + 0.05 && z >= b.z0 - 0.05 && z <= b.z1 + 0.05 && b.y1 <= lim && b.y1 > y && b.y1 - b.y0 > 0.04) y = b.y1; }
    for (const c of WORLD.cyls) { if (Math.hypot(x - c.x, z - c.z) <= c.r && c.y1 <= lim && c.y1 > y) y = c.y1; }
    return y;
  }
  function resolve(p, feet) {
    const r = PLAYER.r, top = feet + PLAYER.h, lim = feet + PLAYER.step;
    for (let pass = 0; pass < 3; pass++) {
      for (const b of WORLD.boxes) {
        if (b.open || b.y0 >= top || b.y1 <= lim) continue;
        const cx = THREE.MathUtils.clamp(p.x, b.x0, b.x1), cz = THREE.MathUtils.clamp(p.z, b.z0, b.z1);
        const dx = p.x - cx, dz = p.z - cz, d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 < 1e-9) { // inside: push along the smallest penetration
          const px = Math.min(p.x - b.x0, b.x1 - p.x), pz = Math.min(p.z - b.z0, b.z1 - p.z);
          if (px < pz) p.x += (p.x - b.x0 < b.x1 - p.x ? -1 : 1) * (px + r); else p.z += (p.z - b.z0 < b.z1 - p.z ? -1 : 1) * (pz + r);
        } else { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      }
      for (const c of WORLD.cyls) {
        if (c.y0 >= top || c.y1 <= lim) continue;
        const dx = p.x - c.x, dz = p.z - c.z, d = Math.hypot(dx, dz), need = r + c.r;
        if (d < need) { if (d < 1e-6) p.x += need; else { const k = (need - d) / d; p.x += dx * k; p.z += dz * k; } }
      }
      for (const g of WORLD.rings) {
        if (g.y0 >= top || g.y1 <= lim) continue;
        const dx = p.x - g.x, dz = p.z - g.z, d = Math.hypot(dx, dz);
        if (d <= g.r0 - r || d >= g.r1 + r || d < 1e-6 || inGap(g, dx, dz)) continue;
        const target = d < (g.r0 + g.r1) / 2 ? g.r0 - r : g.r1 + r, k = target / d; p.x = g.x + dx * k; p.z = g.z + dz * k;
      }
    }
  }
  function pointBlocked(p, pad = 0.25) {
    for (const b of WORLD.boxes) { if (b.open) continue; if (p.x > b.x0 - pad && p.x < b.x1 + pad && p.y > b.y0 - pad && p.y < b.y1 + pad && p.z > b.z0 - pad && p.z < b.z1 + pad) return true; }
    for (const c of WORLD.cyls) { if (p.y > c.y0 - pad && p.y < c.y1 + pad && Math.hypot(p.x - c.x, p.z - c.z) < c.r + pad) return true; }
    for (const g of WORLD.rings) { const d = Math.hypot(p.x - g.x, p.z - g.z); if (p.y > g.y0 - pad && p.y < g.y1 + pad && d > g.r0 - pad && d < g.r1 + pad && !inGap(g, p.x - g.x, p.z - g.z)) return true; }
    return false;
  }

  // ---- input
  const onKey = (ev, down) => {
    if (!S.active) return;
    const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName); if (typing) return;
    const k = ev.key.toLowerCase();
    if ('wasd'.includes(k) || ['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(k)) { ev.preventDefault(); if (down) S.keys.add(k); else S.keys.delete(k); }
    else if (k === 'shift') S.run = down;
    else if (k === ' ') { ev.preventDefault(); if (down && S.grounded) S.jumpReq = true; }
    else if (down && k === 'v') api.toggleView();
    else if (down && k === 'e') api.interact();
    else if (down && !ev.metaKey && !ev.ctrlKey && !ev.altKey) onExtraKey?.(k, ev);
  };
  addEventListener('keydown', (ev) => onKey(ev, true)); addEventListener('keyup', (ev) => onKey(ev, false));
  addEventListener('blur', () => { S.keys.clear(); S.run = false; });
  // mouse look: pointer lock when available, drag otherwise
  let dragging = false, lastX = 0, lastY = 0, downAt = 0, moved = 0;
  dom.addEventListener('pointerdown', (ev) => { if (!S.active || ev.pointerType === 'touch') return; dragging = true; lastX = ev.clientX; lastY = ev.clientY; downAt = performance.now(); moved = 0; });
  addEventListener('pointerup', (ev) => {
    if (!S.active || ev.pointerType === 'touch') return; dragging = false;
    if (performance.now() - downAt < 260 && moved < 6 && ev.target === dom) { if (document.pointerLockElement !== dom && !isTouch && dom.requestPointerLock) dom.requestPointerLock({ unadjustedMovement: true }).catch?.(() => {}); api.interact(); }
  });
  addEventListener('pointermove', (ev) => {
    if (!S.active || ev.pointerType === 'touch') return;
    if (document.pointerLockElement === dom) { S.look.dx += ev.movementX; S.look.dy += ev.movementY; }
    else if (dragging) { S.look.dx += ev.clientX - lastX; S.look.dy += ev.clientY - lastY; moved += Math.abs(ev.clientX - lastX) + Math.abs(ev.clientY - lastY); lastX = ev.clientX; lastY = ev.clientY; }
  });
  // touch: left half joystick, right half look
  const touches = { joy: null, look: null };
  dom.addEventListener('touchstart', (ev) => {
    if (!S.active) return;
    for (const t of ev.changedTouches) {
      if (t.clientX < innerWidth * 0.45 && !touches.joy) { touches.joy = { id: t.identifier, x0: t.clientX, y0: t.clientY }; if (hud?.joy) { hud.joy.style.left = t.clientX + 'px'; hud.joy.style.top = t.clientY + 'px'; hud.joy.classList.add('show'); } }
      else if (!touches.look) touches.look = { id: t.identifier, x: t.clientX, y: t.clientY, t0: performance.now(), moved: 0 };
    }
    ev.preventDefault();
  }, { passive: false });
  dom.addEventListener('touchmove', (ev) => {
    if (!S.active) return;
    for (const t of ev.changedTouches) {
      if (touches.joy && t.identifier === touches.joy.id) { const dx = t.clientX - touches.joy.x0, dy = t.clientY - touches.joy.y0, m = Math.min(1, Math.hypot(dx, dy) / 60); const a = Math.atan2(dy, dx); S.joy.x = Math.cos(a) * m; S.joy.y = Math.sin(a) * m; if (hud?.knob) hud.knob.style.transform = `translate(${Math.cos(a) * m * 34}px, ${Math.sin(a) * m * 34}px)`; S.run = m > 0.92; }
      else if (touches.look && t.identifier === touches.look.id) { S.look.dx += (t.clientX - touches.look.x) * 1.6; S.look.dy += (t.clientY - touches.look.y) * 1.6; touches.look.moved += Math.abs(t.clientX - touches.look.x) + Math.abs(t.clientY - touches.look.y); touches.look.x = t.clientX; touches.look.y = t.clientY; }
    }
    ev.preventDefault();
  }, { passive: false });
  const endTouch = (ev) => {
    if (!S.active) return;
    for (const t of ev.changedTouches) {
      if (touches.joy && t.identifier === touches.joy.id) { touches.joy = null; S.joy.x = S.joy.y = 0; S.run = false; hud?.joy?.classList.remove('show'); if (hud?.knob) hud.knob.style.transform = ''; }
      else if (touches.look && t.identifier === touches.look.id) { if (performance.now() - touches.look.t0 < 300 && touches.look.moved < 12) api.interact(); touches.look = null; }
    }
  };
  dom.addEventListener('touchend', endTouch); dom.addEventListener('touchcancel', endTouch);

  // ---- rig animation
  function animateRig(dt) {
    if (!rig) return;
    rig.root.position.copy(S.pos);
    // face the movement direction, else the camera yaw
    const targetYaw = S.moving > 0.05 ? S.moveYaw : S.yaw + Math.PI;
    let d = targetYaw - rig.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d));
    rig.root.rotation.y += d * Math.min(1, dt * 10);
    S.phase += dt * (S.run ? 10.5 : 7.2) * S.moving;
    poseRig(rig, S.phase, Math.min(1, S.moving * 3), S.run);
    if (S.ladder) { const p = S.phase; rig.thighL.rotation.x = -0.9 + Math.sin(p) * 0.5; rig.thighR.rotation.x = -0.9 - Math.sin(p) * 0.5; rig.shinL.rotation.x = 0.9; rig.shinR.rotation.x = 0.9; rig.armL.rotation.x = -2.6 - Math.sin(p) * 0.3; rig.armR.rotation.x = -2.6 + Math.sin(p) * 0.3; rig.foreL.rotation.x = rig.foreR.rotation.x = -0.4; }
    else if (!S.grounded) { rig.thighL.rotation.x = -0.4; rig.thighR.rotation.x = 0.25; rig.shinL.rotation.x = 0.9; rig.shinR.rotation.x = 0.5; }
    rig.head.rotation.y = THREE.MathUtils.clamp(Math.atan2(Math.sin(S.yaw + Math.PI - rig.root.rotation.y), Math.cos(S.yaw + Math.PI - rig.root.rotation.y)), -0.9, 0.9);
    rig.root.visible = !S.first;
  }

  // ---- reticle / interaction
  function pick() {
    const origin = _c, dir = _f;
    camera.getWorldDirection(dir);
    if (S.first) origin.copy(camera.position); else origin.copy(S.pos).add(new THREE.Vector3(0, PLAYER.eye, 0));
    ray.set(origin, dir); ray.far = 60; ray.layers.enableAll();
    // ladders: near the base, facing the wall
    if (!S.ladder) for (const L of WORLD.ladders) { const sx = L.x + L.nx * 0.5, sz = L.z + L.nz * 0.5; if (Math.hypot(S.pos.x - sx, S.pos.z - sz) < 0.9 && S.pos.y < L.y1 - 0.5 && S.pos.y > L.y0 - 0.5) { const fx = -Math.sin(S.yaw), fz = -Math.cos(S.yaw); if (fx * -L.nx + fz * -L.nz > 0.5) return { ladder: L, dist: 1 }; } }
    const list = pickables.concat(WORLD.doors.map((d) => d.mesh), occluders);
    const hits = ray.intersectObjects(list, true);
    for (const h of hits) {
      const o = h.object; if (!o.visible) continue;
      let vis = true; o.traverseAncestors((a) => { if (a.visible === false) vis = false; }); if (!vis) continue;
      const m = o.material; if (m && (m.userData?.pickThrough || (m.transparent && m.opacity < 0.15))) continue;
      const door = o.userData.door || (o.parent && o.parent.userData.door);
      if (door) return h.distance < 3.2 ? { door, dist: h.distance } : null;
      if (o.userData.scram) return h.distance < 3.0 ? { scram: true, dist: h.distance } : null;
      if (o.userData.console) return h.distance < 3.6 ? { console: true, dist: h.distance } : null;
      if (o.userData.npc !== undefined) return h.distance < 3.6 ? { npc: o.userData.npc, dist: h.distance } : null;
      if (o.userData.part) return h.distance < 40 ? { part: o.userData.part, dist: h.distance, point: h.point } : null;
      return null;
    }
    return null;
  }

  // ---- public api
  const api = {
    get active() { return S.active; }, get first() { return S.first; }, state: S,
    enter(spawn) {
      if (S.active) return;
      S.active = true; S.inside = false; S.first = S.prefFirst.out;
      S.saved = { pos: camera.position.clone(), quat: camera.quaternion.clone() };
      if (spawn) { S.pos.set(spawn.x, spawn.y ?? 0, spawn.z); S.yaw = spawn.yaw ?? S.yaw; S.pitch = spawn.pitch ?? -0.08; }
      S.pos.y = floorAt(S.pos.x, S.pos.z, S.pos.y + 1); S.vy = 0; S.grounded = true;
      if (rig) { rig.root.visible = true; rig.root.position.copy(S.pos); rig.root.rotation.y = S.yaw + Math.PI; }
      onEnter?.();
      api.update(0.016);
    },
    exit() {
      if (!S.active) return;
      S.active = false; S.keys.clear(); S.run = false; S.joy.x = S.joy.y = 0; S.ladder = null;
      if (document.pointerLockElement === dom) document.exitPointerLock();
      if (rig) rig.root.visible = false;
      hud?.joy?.classList.remove('show');
      onExit?.(S.saved);
    },
    toggleView() { api.setFirst(!S.first); },
    setFirst(v) { S.first = !!v; S.prefFirst[S.inside ? 'in' : 'out'] = S.first; if (rig) rig.root.visible = !S.first; hud?.setView?.(S.first, S.inside); },
    /** Indoors the view follows the indoor preference (first person by default), outdoors the outdoor one. V changes the preference for the zone you are in. */
    setInside(v) { v = !!v; if (v === S.inside) return; S.inside = v; const want = S.prefFirst[v ? 'in' : 'out']; if (want !== S.first) { S.first = want; if (rig) rig.root.visible = !S.first; } hud?.setView?.(S.first, S.inside); },
    /** Is there standing room at (x, z)? Probes from just above the given height (default: the ground), so interiors under a roof count. */
    clear(x, z, y0) { const base = y0 ?? terrainY(x, z); const y = floorAt(x, z, base + 1.6); _t.set(x, y + 0.9, z); return !pointBlocked(_t, PLAYER.r) && Math.abs(y - base) < 1.5; },
    teleport(x, z, yaw, pitch, y = 0) { S.pos.set(x, floorAt(x, z, y + 1), z); if (yaw !== undefined) S.yaw = yaw; if (pitch !== undefined) S.pitch = pitch; S.vy = 0; api.update(0.016); },
    interact() {
      const t = S.reticle;
      if (!t) return;
      if (t.door) { t.door.target = t.door.target > 0.5 ? 0 : 1; t.door.tOpen = performance.now(); onDoor?.(t.door, t.door.target > 0.5); }
      else if (t.ladder) { S.ladder = t.ladder; S.ladderT = 0; }
      else if (t.scram) onInteract?.({ scram: true });
      else if (t.console) onInteract?.({ console: true });
      else if (t.npc !== undefined) onInteract?.({ npc: t.npc });
      else if (t.part) onInteract?.({ part: t.part });
    },
    update(dt) {
      if (!S.active) return;
      // look (frozen while a panel is open: keep the view, drop input)
      const sens = 0.0022;
      if (S.frozen) { S.look.dx = S.look.dy = 0; S.keys.clear(); S.joy.x = S.joy.y = 0; }
      S.yaw -= S.look.dx * sens; S.pitch -= S.look.dy * sens; S.look.dx = S.look.dy = 0;
      S.pitch = THREE.MathUtils.clamp(S.pitch, -1.25, 1.1);
      // move
      _f.set(-Math.sin(S.yaw), 0, -Math.cos(S.yaw)); _r.crossVectors(_f, up);
      _mv.set(0, 0, 0);
      if (S.keys.has('w') || S.keys.has('arrowup')) _mv.add(_f); if (S.keys.has('s') || S.keys.has('arrowdown')) _mv.sub(_f);
      if (S.keys.has('d') || S.keys.has('arrowright')) _mv.add(_r); if (S.keys.has('a') || S.keys.has('arrowleft')) _mv.sub(_r);
      if (Math.abs(S.joy.x) + Math.abs(S.joy.y) > 0.05) { _mv.addScaledVector(_f, -S.joy.y); _mv.addScaledVector(_r, S.joy.x); }
      const mlen = Math.min(1, _mv.length());
      S.moving += (mlen - S.moving) * Math.min(1, dt * 9);
      if (mlen > 0.01) { _mv.normalize(); S.moveYaw = Math.atan2(-_mv.x, -_mv.z) + Math.PI; }
      if (S.ladder) {
        const L = S.ladder; S.ladderT += dt;
        S.pos.x += (L.x + L.nx * 0.42 - S.pos.x) * Math.min(1, dt * 10); S.pos.z += (L.z + L.nz * 0.42 - S.pos.z) * Math.min(1, dt * 10);
        const upK = S.keys.has('w') || S.keys.has('arrowup') || S.joy.y < -0.3, dnK = S.keys.has('s') || S.keys.has('arrowdown') || S.joy.y > 0.3;
        if (upK) S.pos.y += PLAYER.climb * dt; if (dnK) S.pos.y -= PLAYER.climb * dt;
        S.moving += ((upK || dnK ? 1 : 0) - S.moving) * Math.min(1, dt * 9); S.moving = Math.max(S.moving, 0.06); if (upK || dnK) S.phase += dt * 6;
        S.vy = 0; S.grounded = false; S.moveYaw = Math.atan2(L.nx, L.nz) + Math.PI;
        if (S.pos.y >= L.y1 - 0.02) { S.pos.y = L.y1 + 0.02; S.pos.x -= L.nx * 1.0; S.pos.z -= L.nz * 1.0; S.ladder = null; S.grounded = true; }
        else if (S.pos.y <= L.y0 + 0.01 && dnK) { S.pos.y = L.y0; S.ladder = null; S.grounded = true; }
        else if (S.jumpReq) { S.jumpReq = false; S.ladder = null; S.pos.x += L.nx * 0.5; S.pos.z += L.nz * 0.5; S.vy = 1.0; }
        S.jumpReq = false;
      } else {
      const speed = (S.run ? PLAYER.run : PLAYER.walk) * mlen;
      const feet = S.pos.y;
      const nx = S.pos.x + _mv.x * speed * dt, nz = S.pos.z + _mv.z * speed * dt;
      _t.set(nx, feet, nz);
      resolve(_t, feet);
      S.pos.x = _t.x; S.pos.z = _t.z;
      // vertical
      const fl = floorAt(S.pos.x, S.pos.z, feet);
      if (S.jumpReq) { S.vy = PLAYER.jump; S.grounded = false; S.jumpReq = false; }
      if (S.grounded && S.pos.y <= fl + 0.02 && S.vy <= 0) { S.pos.y = fl; S.vy = 0; }
      else {
        S.vy -= 9.81 * dt; S.pos.y += S.vy * dt;
        if (S.pos.y <= fl) { S.pos.y = fl; S.vy = 0; S.grounded = true; } else S.grounded = false;
      }
      if (S.grounded && S.pos.y > fl + 0.02) { S.pos.y -= Math.min(S.pos.y - fl, 6 * dt); if (S.pos.y - fl > 0.6) S.grounded = false; }
      if (S.pos.y < -3) { S.pos.set(1, 0, 11); S.vy = 0; }
      }
      // doors you opened close behind you
      { const now2 = performance.now(); for (const d of WORLD.doors) if (d.target === 1 && !d.auto && d.tOpen && now2 - d.tOpen > 7000 && S.pos.distanceTo(d.center) > 3.0) { d.target = 0; d.tOpen = 0; onDoor?.(d, false); } }
      // footsteps: one per half stride while grounded and moving
      if (S.grounded && S.moving > 0.3) { const sg = Math.sign(Math.sin(S.phase)) || 1; if (sg !== S.lastStepSign) { S.lastStepSign = sg; onStep?.(S.pos, S.run); } }
      // camera
      S.bob += dt * (S.run ? 11 : 7.5) * S.moving;
      const bobY = S.first ? Math.sin(S.bob * 2) * 0.028 * S.moving : 0, bobX = S.first ? Math.cos(S.bob) * 0.018 * S.moving : 0;
      _q.setFromEuler(new THREE.Euler(S.pitch, S.yaw, 0, 'YXZ'));
      if (S.first) {
        camera.position.set(S.pos.x + _r.x * bobX, S.pos.y + PLAYER.eye + bobY, S.pos.z + _r.z * bobX);
        camera.quaternion.copy(_q);
      } else {
        const back = new THREE.Vector3(0, 0, 1).applyQuaternion(_q);
        const head = _c.set(S.pos.x, S.pos.y + 1.45, S.pos.z);
        let dist = S.camDist;
        // pull the camera in until it is clear of colliders and above the floor
        const clearBoom = (d) => { for (let k = 1; k <= 4; k++) { const f = k / 4; _t.copy(head).addScaledVector(back, d * f); _t.x += _r.x * 0.45 * f; _t.z += _r.z * 0.45 * f; if (pointBlocked(_t, k === 4 ? 0.22 : 0.12)) return false; } return _t.y > floorAt(_t.x, _t.z, _t.y + 2) + 0.3; };
        for (let i = 0; i < 16; i++) { if (clearBoom(dist)) break; dist *= 0.84; }
        _t.copy(head).addScaledVector(back, dist); _t.x += _r.x * 0.45; _t.z += _r.z * 0.45;
        if (_t.y < floorAt(_t.x, _t.z, _t.y + 2) + 0.3) _t.y = floorAt(_t.x, _t.z, _t.y + 2) + 0.3;
        camera.position.lerp(_t, Math.min(1, dt * 14));
        camera.lookAt(head.x + _r.x * 0.45, head.y + 0.1, head.z + _r.z * 0.45);
      }
      camera.updateMatrixWorld();
      animateRig(dt);
      updateDoors(dt);
      // auto doors slide open when the player is near
      for (const d of WORLD.doors) if (d.auto) d.target = S.pos.distanceTo(d.center) < 2.6 ? 1 : d.target === 1 && S.pos.distanceTo(d.center) < 3.4 ? 1 : 0;
      // reticle
      const now = performance.now();
      if (now - S.lastPick > 90) { S.lastPick = now; S.reticle = pick(); hud?.setTarget?.(S.reticle); }
    },
  };
  return api;
}

/** Limb cycle for any rig: phase in radians, k = 0 (standing) .. 1 (full stride). */
export function poseRig(rig, p, k, run = false) {
  const swing = Math.sin(p) * 0.62 * k * (run ? 1.25 : 1);
  rig.thighL.rotation.x = swing; rig.thighR.rotation.x = -swing;
  rig.shinL.rotation.x = Math.max(0, -Math.sin(p - 0.9)) * 0.9 * k; rig.shinR.rotation.x = Math.max(0, Math.sin(p - 0.9)) * 0.9 * k;
  rig.armL.rotation.x = -swing * 0.8; rig.armR.rotation.x = swing * 0.8;
  rig.foreL.rotation.x = -0.35 - Math.max(0, swing) * 0.4; rig.foreR.rotation.x = -0.35 - Math.max(0, -swing) * 0.4;
  rig.torso.position.y = 0.92 + Math.abs(Math.sin(p * 2)) * 0.025 * k;
  rig.torso.rotation.y = Math.sin(p) * 0.08 * k;
}

// ------------------------------------------------------------------ articulated hi-vis figure
export function buildRig(mats, G, opts = {}) {
  const root = new THREE.Group(); root.visible = false;
  const mk = (geom, mat, parent, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geom, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; };
  const hips = new THREE.Group(); hips.position.y = 0.92; root.add(hips);
  const torso = hips;
  // pelvis + torso + vest
  mk(G.box(0.34, 0.2, 0.22), mats.denim, torso, 0, 0.0);
  mk(G.box(0.4, 0.5, 0.24), mats.shirt, torso, 0, 0.36);
  const vest = mk(G.box(0.44, 0.46, 0.28), mats.hivis, torso, 0, 0.37);
  [0.5, 0.26].forEach((y) => mk(G.box(0.45, 0.035, 0.29), mats.reflect, torso, 0, y));
  [-0.12, 0.12].forEach((x) => mk(G.box(0.035, 0.46, 0.29), mats.reflect, torso, x, 0.37));
  // head group
  const head = new THREE.Group(); head.position.y = 0.64; torso.add(head);
  mk(G.cyl(0.06, 0.1, 10), mats.skin, head, 0, 0.02);
  mk(G.sphere(0.115, 18), mats.skin, head, 0, 0.14);
  if (opts.hat === false) { mk(new THREE.SphereGeometry(0.125, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2 + 0.3), mats.hat, head, 0, 0.15); }
  else { mk(new THREE.SphereGeometry(0.14, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), mats.hat, head, 0, 0.16); mk(G.cyl(0.175, 0.02, 20), mats.hat, head, 0, 0.165); mk(G.box(0.1, 0.05, 0.03), mats.lamp, head, 0, 0.23, 0.14); }
  // legs: thigh pivots at the hip, shins at the knee
  const legs = {};
  [['L', -0.1], ['R', 0.1]].forEach(([s, x]) => {
    const th = new THREE.Group(); th.position.set(x, -0.04, 0); hips.add(th);
    mk(G.cyl(0.085, 0.44, 12), mats.denim, th, 0, -0.22);
    const sh = new THREE.Group(); sh.position.y = -0.44; th.add(sh);
    mk(G.cyl(0.07, 0.42, 12), mats.denim, sh, 0, -0.21);
    mk(G.box(0.12, 0.08, 0.26), mats.boot, sh, 0, -0.44, 0.05);
    legs['thigh' + s] = th; legs['shin' + s] = sh;
  });
  // arms
  const arms = {};
  [['L', -0.27], ['R', 0.27]].forEach(([s, x]) => {
    const up = new THREE.Group(); up.position.set(x, 0.58, 0); torso.add(up);
    mk(G.cyl(0.055, 0.3, 10), mats.hivis, up, 0, -0.15);
    const fo = new THREE.Group(); fo.position.y = -0.3; up.add(fo); fo.rotation.x = -0.35;
    mk(G.cyl(0.048, 0.28, 10), mats.skin, fo, 0, -0.14);
    mk(G.sphere(0.055, 10), mats.skin, fo, 0, -0.3);
    arms['arm' + s] = up; arms['fore' + s] = fo;
  });
  return { root, torso, head, vest, ...legs, ...arms };
}
