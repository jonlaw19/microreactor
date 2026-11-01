// Interactive Microreactor — 3D model
// Three.js (ES modules via importmap). Generic sodium-cooled pool-type microreactor, above grade.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { PARTS, GROUPS, TOUR } from './parts.js';

// ------------------------------------------------------------------ setup
const $ = (s) => document.querySelector(s);
const app = $('#app');
const canvas = $('#c');
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
const qs = new URLSearchParams(location.search);
const TEST = qs.has('test');
let hiQ = !isMobile && qs.get('q') !== 'low';

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const FOG_COLOR = 0x121a26;
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0055);

const camera = new THREE.PerspectiveCamera(45, 1, 0.05, 600);
const portrait = innerHeight > innerWidth;
const HOME_POS = portrait ? new THREE.Vector3(12.5, 7.5, 14.5) : new THREE.Vector3(13.5, 6.8, 15.5);
const HOME_TGT = portrait ? new THREE.Vector3(1.0, 3.6, 0) : new THREE.Vector3(2.8, 3.2, 0);
camera.position.copy(HOME_POS);

const controls = new OrbitControls(camera, canvas);
controls.target.copy(HOME_TGT);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.8;
controls.maxDistance = 120;
controls.maxPolarAngle = Math.PI / 2 + 0.08;
controls.autoRotate = true;
controls.autoRotateSpeed = 0.35;
controls.update();

// CSS2D labels
const labelRenderer = new CSS2DRenderer();
labelRenderer.domElement.style.position = 'absolute';
labelRenderer.domElement.style.top = '0';
labelRenderer.domElement.style.left = '0';
labelRenderer.domElement.style.pointerEvents = 'none';
$('#labels').appendChild(labelRenderer.domElement);

// Environment lighting (image based, generated in code)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.8;
pmrem.dispose();

// Clipping plane for the cutaway (shared by module/building materials)
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
const clipPlanes = [clipPlane];

// Module group: the factory-built reactor module and its silo sit on a pad at grade.
// Module-local y=0 is the deck level; the pad is at local -6.2.
const MOD_Y = 6.2;
const MOD = new THREE.Group(); MOD.position.y = MOD_Y; scene.add(MOD);
const MODULE_PARTS = new Set(['shield', 'skid', 'guard', 'vessel', 'sodium', 'core', 'assemblies', 'pins', 'reflector', 'drums', 'rods', 'pumps', 'ihx', 'head', 'instruments', 'dhr', 'loop']);
const NO_CLIP = new Set(['pcu', 'cooler', 'loop']);

// ------------------------------------------------------------------ procedural textures
function canvasTex(size, draw, { repeat = 1, srgb = false } = {}) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d');
  draw(g, size);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

const texBrushed = canvasTex(512, (g, s) => {
  g.fillStyle = '#b8b8b8'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 9000; i++) {
    const y = rnd() * s, x = rnd() * s, len = 10 + rnd() * 90;
    const v = 140 + Math.floor(rnd() * 110);
    g.strokeStyle = `rgba(${v},${v},${v},${0.25 + rnd() * 0.5})`;
    g.lineWidth = 0.6 + rnd() * 1.2;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + len, y + (rnd() - 0.5) * 1.5); g.stroke();
  }
}, { repeat: 3 });

const texConcrete = canvasTex(512, (g, s) => {
  g.fillStyle = '#8f8a82'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 60; i++) {
    const r = 30 + rnd() * 120;
    const v = 120 + Math.floor(rnd() * 40);
    const cx = rnd() * s, cy = rnd() * s;
    const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grd.addColorStop(0, `rgba(${v},${v - 4},${v - 10},0.35)`); grd.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grd; g.fillRect(0, 0, s, s);
  }
  for (let i = 0; i < 40000; i++) {
    const v = 90 + Math.floor(rnd() * 110);
    g.fillStyle = `rgba(${v},${v},${v},${0.35 + rnd() * 0.5})`;
    g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 1.5, 1 + rnd() * 1.5);
  }
  for (let i = 0; i < 12; i++) {
    g.strokeStyle = 'rgba(40,36,30,0.35)'; g.lineWidth = 0.8;
    let x = rnd() * s, y = rnd() * s; g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 12; k++) { x += (rnd() - 0.5) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); }
    g.stroke();
  }
}, { repeat: 2, srgb: true });
const texConcreteBump = canvasTex(512, (g, s) => {
  g.fillStyle = '#808080'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 50000; i++) { const v = 60 + Math.floor(rnd() * 140); g.fillStyle = `rgba(${v},${v},${v},0.6)`; g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 2); }
}, { repeat: 2 });
const texPanel = canvasTex(512, (g, s) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s);
  for (let x = 0; x < s; x += 64) { g.fillStyle = '#4a4a4a'; g.fillRect(x, 0, 3, s); g.fillStyle = '#d0d0d0'; g.fillRect(x + 3, 0, 2, s); }
  for (let i = 0; i < 6000; i++) { const v = 130 + Math.floor(rnd() * 60); g.fillStyle = `rgba(${v},${v},${v},0.5)`; g.fillRect(rnd() * s, rnd() * s, 1, 1); }
}, { repeat: 2 });
const texSprite = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.35, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const texShadowDisc = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.7)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();

// ------------------------------------------------------------------ materials
const tiled = (t, ru, rv) => { const c = t.clone(); c.repeat.set(ru, rv); c.needsUpdate = true; return c; };
function mat(opts = {}) {
  const m = new THREE.MeshPhysicalMaterial(Object.assign({ side: THREE.DoubleSide }, opts));
  m.clippingPlanes = clipPlanes;
  m.clipShadows = true;
  return m;
}
const M = {
  steel: () => mat({ color: 0xb4b9bf, metalness: 0.95, roughness: 0.42, roughnessMap: texBrushed, bumpMap: texBrushed, bumpScale: 0.003 }),
  steelDark: () => mat({ color: 0x5f666d, metalness: 0.9, roughness: 0.5, roughnessMap: texBrushed }),
  steelPaint: (color = 0x5b6673) => mat({ color, metalness: 0.45, roughness: 0.58, bumpMap: texConcreteBump, bumpScale: 0.002 }),
  concrete: (color = 0x9b958b, ru = 2, rv = 2) => mat({ color, metalness: 0.0, roughness: 0.96, map: ru === 2 && rv === 2 ? texConcrete : tiled(texConcrete, ru, rv), bumpMap: ru === 2 && rv === 2 ? texConcreteBump : tiled(texConcreteBump, ru, rv), bumpScale: 0.02 }),
  panelGhost: () => { const m = mat({ color: 0xcfd6dd, metalness: 0.3, roughness: 0.55, transparent: true, opacity: 0.1, depthWrite: false, bumpMap: texPanel, bumpScale: 0.01 }); m.userData.pickThrough = true; return m; },
  sodium: () => { const m = mat({ color: 0x9fb8cf, metalness: 0.6, roughness: 0.14, transparent: true, opacity: 0.34, depthWrite: false, envMapIntensity: 1.2, emissive: 0x2a1c0c, emissiveIntensity: 0.5 }); m.userData.pickThrough = true; return m; },
  fuel: () => mat({ color: 0x4a4f55, metalness: 0.9, roughness: 0.4, emissive: 0xff3800, emissiveIntensity: 1.0 }),
  duct: () => mat({ color: 0x7a8188, metalness: 0.9, roughness: 0.5, transparent: true, opacity: 0.5, depthWrite: false }),
  ceramic: (color = 0xd8d1c0) => mat({ color, metalness: 0.08, roughness: 0.72, bumpMap: texConcreteBump, bumpScale: 0.004 }),
  absorber: () => mat({ color: 0x1b1e23, metalness: 0.35, roughness: 0.62 }),
  copper: () => mat({ color: 0xb87333, metalness: 1.0, roughness: 0.32, roughnessMap: texBrushed }),
  insul: () => mat({ color: 0xd4d8dc, metalness: 0.9, roughness: 0.38, roughnessMap: texBrushed, bumpMap: texBrushed, bumpScale: 0.004 }),
  skidYellow: () => mat({ color: 0xd19a2a, metalness: 0.4, roughness: 0.55, bumpMap: texConcreteBump, bumpScale: 0.003 }),
  genBlue: () => mat({ color: 0x2c5d8a, metalness: 0.5, roughness: 0.5 }),
  rubber: () => mat({ color: 0x24282c, metalness: 0.1, roughness: 0.9 }),
};

// ------------------------------------------------------------------ geometry helpers
const G = {
  cyl: (r, h, seg = 48, rTop = r, open = false) => new THREE.CylinderGeometry(rTop, r, h, seg, 1, open),
  box: (w, h, d) => new THREE.BoxGeometry(w, h, d),
  sphere: (r, seg = 24) => new THREE.SphereGeometry(r, seg, seg),
  torus: (R, r, seg = 64, tseg = 16) => new THREE.TorusGeometry(R, r, tseg, seg),
  annulus: (ri, ro, h, seg = 72) => {
    const shape = new THREE.Shape(); shape.absarc(0, 0, ro, 0, Math.PI * 2, false);
    const hole = new THREE.Path(); hole.absarc(0, 0, ri, 0, Math.PI * 2, true); shape.holes.push(hole);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: seg });
    g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
  },
  halfAnnulus: (ri, ro, h, a0, seg = 48) => {
    const shape = new THREE.Shape(); shape.absarc(0, 0, ro, a0, a0 + Math.PI, false); shape.absarc(0, 0, ri, a0 + Math.PI, a0, true);
    const g = new THREE.ExtrudeGeometry(shape, { depth: h, bevelEnabled: false, curveSegments: seg });
    g.rotateX(-Math.PI / 2); g.computeVertexNormals(); return g;
  },
  dish: (r, depth, seg = 48) => { const g = new THREE.SphereGeometry(r, seg, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); g.scale(1, depth / r, 1); return g; },
};
// Re-map UVs of an extruded ring so textures wrap around the cylinder instead of streaking.
function cylUV(g, ru, rv, h) {
  const pos = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const ang = (Math.atan2(z, x) + Math.PI) / (Math.PI * 2);
    uv.setXY(i, ang * ru, (y / h) * rv);
  }
  uv.needsUpdate = true; return g;
}
function hexPositions(rings, pitch) {
  const pts = [];
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      pts.push([pitch * (q + r / 2), pitch * (Math.sqrt(3) / 2) * r]);
    }
  }
  return pts;
}

// ------------------------------------------------------------------ parts registry
const INTERNAL = new Set(['core', 'assemblies', 'pins', 'reflector', 'drums', 'rods', 'sodium', 'pumps', 'ihx', 'vessel', 'guard', 'skid', 'instruments']);
const R = {};
const pickables = [];
function part(id) {
  if (R[id]) return R[id];
  const def = PARTS.find((p) => p.id === id);
  const root = new THREE.Group(); root.name = id;
  (MODULE_PARTS.has(id) ? MOD : scene).add(root);
  const e = (R[id] = { id, def, root, meshes: [], mats: [], movers: [], label: null, labelEl: null, dyn: null, internal: INTERNAL.has(id) });
  const ex = def.explode || [0, 0, 0];
  if (ex[0] || ex[1] || ex[2]) e.movers.push({ obj: root, dir: new THREE.Vector3(...ex), base: new THREE.Vector3() });
  return e;
}
function sub(id, dir) {
  const e = part(id); const g = new THREE.Group(); e.root.add(g);
  e.movers.push({ obj: g, dir: dir.clone(), base: new THREE.Vector3() });
  return g;
}
function regMat(e, m) {
  if (!e.mats.includes(m)) {
    e.mats.push(m);
    if (NO_CLIP.has(e.id)) m.clippingPlanes = null;
    m.userData.base = { emissive: m.emissive ? m.emissive.getHex() : 0, ei: m.emissiveIntensity ?? 1, opacity: m.opacity, transparent: m.transparent, depthWrite: m.depthWrite };
  }
}
function add(id, geom, material, o = {}) {
  const e = part(id);
  const m = new THREE.Mesh(geom, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
  m.userData.part = id;
  (o.parent || e.root).add(m);
  e.meshes.push(m); regMat(e, material); pickables.push(m);
  return m;
}
function addInstanced(id, geom, material, matrices, o = {}) {
  const e = part(id);
  const im = new THREE.InstancedMesh(geom, material, matrices.length);
  matrices.forEach((mx, i) => im.setMatrixAt(i, mx));
  im.instanceMatrix.needsUpdate = true;
  im.castShadow = o.cast !== false; im.receiveShadow = o.recv !== false;
  im.userData.part = id; (o.parent || e.root).add(im);
  e.meshes.push(im); regMat(e, material); pickables.push(im);
  return im;
}
function pipe(id, pts, r, material, o = {}) {
  const parent = o.parent || part(id).root;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = new THREE.Vector3(...pts[i]), b = new THREE.Vector3(...pts[i + 1]);
    const len = a.distanceTo(b); if (len < 1e-4) continue;
    const m = add(id, G.cyl(r, len, 20), material, { parent });
    m.position.copy(a).add(b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    if (i > 0) add(id, G.sphere(r * 1.02, 16), material, { x: a.x, y: a.y, z: a.z, parent });
  }
}
function labelAt(id, pos, parent) {
  const e = part(id);
  const wrap = document.createElement('div');
  const el = document.createElement('div'); el.className = 'lbl'; el.textContent = e.def.name;
  el.addEventListener('click', (ev) => { ev.stopPropagation(); select(id, { fly: true }); });
  wrap.appendChild(el);
  const obj = new CSS2DObject(wrap);
  obj.position.copy(pos);
  (parent || e.root).add(obj);
  e.label = obj; e.labelEl = el;
  return obj;
}
function dynLabel(id, r, y, offsetDeg) {
  const obj = labelAt(id, new THREE.Vector3(r, y, 0));
  R[id].dyn = { r, y, off: THREE.MathUtils.degToRad(offsetDeg) };
  return obj;
}

// ------------------------------------------------------------------ world: sky, ground
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x0a1220) }, horizon: { value: new THREE.Color(0x1c2735) }, bottom: { value: new THREE.Color(0x07090d) } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 top, horizon, bottom; varying vec3 vW;
    void main(){ float h = normalize(vW).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(-h, 0.4));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));

const groundMat = new THREE.MeshPhysicalMaterial({ color: 0x55534f, roughness: 0.98, metalness: 0, map: tiled(texConcrete, 110, 110), bumpMap: tiled(texConcreteBump, 110, 110), bumpScale: 0.03 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(140, 96), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
const slab = new THREE.Mesh(new THREE.PlaneGeometry(21, 14), new THREE.MeshPhysicalMaterial({ color: 0x6d6a65, roughness: 0.95, map: tiled(texConcrete, 10, 7), bumpMap: tiled(texConcreteBump, 10, 7), bumpScale: 0.02 }));
slab.rotation.x = -Math.PI / 2; slab.position.set(3, 0.003, 0); slab.receiveShadow = true; scene.add(slab);
const line = new THREE.Mesh(new THREE.RingGeometry(3.95, 4.08, 96), new THREE.MeshStandardMaterial({ color: 0xe3b32a, roughness: 0.8 }));
line.rotation.x = -Math.PI / 2; line.position.y = 0.006; scene.add(line);
function shadowDisc(x, y, z, r, sx = 1, sz = 1) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ map: texShadowDisc, transparent: true, depthWrite: false, color: 0x000000 }));
  m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx, sz, 1); scene.add(m); return m;
}
shadowDisc(0, 0.008, 0, 4.4);
shadowDisc(8.6, 0.008, 0, 3.4, 1.3, 0.9);
shadowDisc(16.5, 0.008, 0, 3.2, 1.0, 1.1);

// ------------------------------------------------------------------ parts: site & structure
const buildingPanels = [], spinners = [], fans = [];
const BH = 10;
(function buildSite() {
  // Shield silo (module-local): foundation pad, biological shield annulus, top shield ring
  add('shield', G.cyl(3.45, 0.2, 96), M.concrete(0x87837b, 8, 1), { y: -6.1 });
  // the silo splits into two halves in the exploded view
  [[-Math.PI / 2, 1], [Math.PI / 2, -1]].forEach(([a0, sx]) => {
    const g = sub('shield', new THREE.Vector3(sx * 3.6, 0, 0));
    const wall = M.concrete(0xa39d92), top = M.concrete(0xaaa49a), joint = M.concrete(0x6f6a62);
    add('shield', cylUV(G.halfAnnulus(1.75, 3.1, 5.6, a0), 10, 2.5, 5.6), wall, { parent: g, y: -5.8 });
    add('shield', cylUV(G.halfAnnulus(1.5, 3.1, 0.5, a0), 10, 0.3, 0.5), top, { parent: g, y: -0.2 });
    [-4.4, -3.0, -1.6].forEach((y) => add('shield', G.halfAnnulus(3.1, 3.13, 0.04, a0), joint, { parent: g, y, cast: false }));
  });
  dynLabel('shield', 2.35, 0.34, -25);

  // Transport skid
  const sk = M.skidYellow();
  [-1.35, 1.35].forEach((x) => add('skid', G.box(0.28, 0.4, 3.3), sk, { x, y: -5.8 }));
  [-1.35, 1.35].forEach((z) => add('skid', G.box(3.3, 0.4, 0.28), sk, { z, y: -5.8 }));
  [[-1.35, -1.35], [1.35, -1.35], [-1.35, 1.35], [1.35, 1.35]].forEach(([x, z]) => add('skid', G.box(0.36, 0.44, 0.36), M.steelDark(), { x, y: -5.8, z }));
  [-0.9, 0, 0.9].forEach((z) => add('skid', G.box(2.7, 0.3, 0.2), sk, { y: -5.75, z }));
  labelAt('skid', new THREE.Vector3(1.5, -5.8, 1.5));

  // Reactor building (world coords): steel frame + ghosted insulated panels
  const frame = M.steelPaint(0x4f5a66);
  const X0 = -6.5, X1 = 12.5, Z = 6, H = BH;
  const cols = [X0, -2.7, 1.1, 4.9, 8.7, X1];
  cols.forEach((x) => { [-Z, Z].forEach((z) => add('building', G.box(0.26, H, 0.26), frame, { x, y: H / 2, z })); });
  cols.forEach((x) => add('building', G.box(0.3, 0.4, 2 * Z + 0.3), frame, { x, y: H + 0.2 }));
  [-Z, Z].forEach((z) => add('building', G.box(X1 - X0 + 0.3, 0.4, 0.3), frame, { x: (X0 + X1) / 2, y: H + 0.2, z }));
  for (let z = -4.5; z <= 4.5; z += 3) add('building', G.box(X1 - X0, 0.2, 0.15), frame, { x: (X0 + X1) / 2, y: H + 0.5, z });
  [3.3, 6.6].forEach((y) => { [-Z, Z].forEach((z) => add('building', G.box(X1 - X0, 0.15, 0.12), frame, { x: (X0 + X1) / 2, y, z: z + Math.sign(z) * 0.1 })); [X0, X1].forEach((x) => add('building', G.box(0.12, 0.15, 2 * Z), frame, { x: x + Math.sign(x - 3) * 0.1, y })); });
  const ghost = M.panelGhost();
  buildingPanels.push(
    add('building', G.box(X1 - X0 + 0.6, 0.12, 2 * Z + 0.6), ghost, { x: (X0 + X1) / 2, y: H + 0.66, cast: false }),
    add('building', G.box(X1 - X0, H, 0.12), ghost, { x: (X0 + X1) / 2, y: H / 2, z: -Z - 0.25, cast: false }),
    add('building', G.box(X1 - X0, H, 0.12), ghost, { x: (X0 + X1) / 2, y: H / 2, z: Z + 0.25, cast: false }),
    add('building', G.box(0.12, H, 2 * Z + 0.5), ghost, { x: X0 - 0.25, y: H / 2, cast: false }),
    add('building', G.box(0.12, H, 2 * Z + 0.5), ghost, { x: X1 + 0.25, y: H / 2, cast: false }),
  );
  add('building', G.box(0.1, 4.6, 4.6), M.steelPaint(0x6a7480), { x: X1 + 0.12, y: 2.3, z: -2.4, cast: false });
  add('building', G.box(0.1, 2.2, 1.0), M.steelPaint(0x6a7480), { x: X1 + 0.12, y: 1.1, z: 3.2, cast: false });
  labelAt('building', new THREE.Vector3(3.0, H + 0.9, 0));
})();

// ------------------------------------------------------------------ parts: vessels & pool (module-local)
const VES_R = 1.35, VES_BOT = -5.0, VES_TOP = 0.0;
const GRD_R = 1.5, GRD_BOT = -5.15;
const NA_LEVEL = -0.7;
(function buildVessels() {
  const gm = M.steel();
  add('guard', G.cyl(GRD_R, -0.3 - GRD_BOT, 96, GRD_R, true), gm, { y: (GRD_BOT - 0.3) / 2 });
  add('guard', G.dish(GRD_R, 0.4, 96), gm, { y: GRD_BOT });
  dynLabel('guard', GRD_R, -4.6, -40);

  const vm = M.steel();
  add('vessel', G.cyl(VES_R, VES_TOP - VES_BOT, 96, VES_R, true), vm, { y: (VES_TOP + VES_BOT) / 2 });
  add('vessel', G.dish(VES_R, 0.35, 96), vm, { y: VES_BOT });
  add('vessel', G.annulus(VES_R, VES_R + 0.08, 0.25), M.steelDark(), { y: -0.6 });
  dynLabel('vessel', VES_R, -1.7, 40);

  const nm = M.sodium();
  add('sodium', G.cyl(VES_R - 0.01, NA_LEVEL - VES_BOT, 96), nm, { y: (NA_LEVEL + VES_BOT) / 2, cast: false, recv: false });
  add('sodium', G.dish(VES_R - 0.01, 0.34, 96), nm, { y: VES_BOT, cast: false, recv: false });
  dynLabel('sodium', 0.6, NA_LEVEL, 15);

  const barrel = M.steelDark();
  add('vessel', G.cyl(0.9, 2.5, 72, 0.9, true), barrel, { y: -3.15 });
  add('vessel', G.cyl(0.55, 0.7, 64, 0.9, true), barrel, { y: -4.75 });
  add('vessel', G.cyl(0.9, 0.08, 72), M.steelDark(), { y: -4.15 });
})();

// ------------------------------------------------------------------ parts: core (module-local)
const CORE_Y = -3.6, CORE_H = 1.0;
const drumGroups = [];
let fuelMat;
(function buildCore() {
  add('reflector', cylUV(G.annulus(0.58, 0.86, 1.1), 6, 1, 1.1), M.ceramic(0xd9d2bf), { y: CORE_Y - 0.55 });
  add('reflector', G.annulus(0.56, 0.88, 0.05), M.steelDark(), { y: CORE_Y + 0.55 });
  add('reflector', G.annulus(0.56, 0.88, 0.05), M.steelDark(), { y: CORE_Y - 0.6 });
  dynLabel('reflector', 0.72, CORE_Y + 0.6, 70);

  const coreHint = mat({ color: 0xffa040, transparent: true, opacity: 0.06, depthWrite: false, emissive: 0xff6a00, emissiveIntensity: 0.4 });
  coreHint.userData.pickThrough = true;
  add('core', G.cyl(0.575, CORE_H + 0.02, 64, 0.575, true), coreHint, { y: CORE_Y, cast: false, recv: false });
  add('core', G.cyl(0.575, 0.02, 64), M.steelDark(), { y: CORE_Y - CORE_H / 2 - 0.02 });
  labelAt('core', new THREE.Vector3(0, CORE_Y + 0.05, 0.6));

  const pitch = 0.125, gap = 0.012;
  const rc = (pitch - gap) / Math.sqrt(3);
  const asm = hexPositions(4, pitch);
  addInstanced('assemblies', G.cyl(rc, CORE_H, 6, rc, true), M.duct(), asm.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, CORE_Y, z)), { cast: false });
  addInstanced('assemblies', G.cyl(rc * 0.55, 0.12, 6), M.steelDark(), asm.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, CORE_Y + CORE_H / 2 + 0.06, z)));
  labelAt('assemblies', new THREE.Vector3(0.35, CORE_Y + 0.62, -0.3));

  const pinPitch = 0.0215, pinR = 0.0095;
  const pinPos = hexPositions(2, pinPitch);
  const pinMats = [];
  asm.forEach(([x, z]) => pinPos.forEach(([px, pz]) => pinMats.push(new THREE.Matrix4().makeTranslation(x + px, CORE_Y, z + pz))));
  fuelMat = M.fuel();
  addInstanced('pins', G.cyl(pinR, CORE_H - 0.04, 10), fuelMat, pinMats, { cast: false, recv: false });
  labelAt('pins', new THREE.Vector3(-0.1, CORE_Y - 0.35, 0.3));

  const drumR = 0.11, drumRing = 0.72;
  for (let k = 0; k < 12; k++) {
    const a = (k / 12) * Math.PI * 2;
    const g = sub('drums', new THREE.Vector3(Math.cos(a) * 0.45, 6.3, Math.sin(a) * 0.45));
    g.position.set(Math.cos(a) * drumRing, CORE_Y, Math.sin(a) * drumRing);
    R.drums.movers[R.drums.movers.length - 1].base.copy(g.position);
    g.userData.angle = a;
    add('drums', G.cyl(drumR, 1.1, 32), M.ceramic(0xcbc4b1), { parent: g });
    add('drums', new THREE.CylinderGeometry(drumR + 0.004, drumR + 0.004, 1.08, 20, 1, false, -Math.PI / 3, (2 * Math.PI) / 3), M.absorber(), { parent: g });
    add('drums', G.cyl(0.035, 0.3, 16), M.steelDark(), { parent: g, y: 0.7 });
    drumGroups.push(g);
  }
  labelAt('drums', new THREE.Vector3(0, 0.62, 0), drumGroups[0]);

  const rodMat = M.absorber(), lineMat = M.steel();
  [90, 210, 330].forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const x = Math.cos(a) * 0.25, z = Math.sin(a) * 0.25;
    add('rods', G.cyl(0.045, 1.0, 20), rodMat, { x, y: CORE_Y + 1.1, z });
    add('rods', G.cyl(0.02, 2.05, 12), lineMat, { x, y: CORE_Y + 2.625, z });
    if (i === 0) labelAt('rods', new THREE.Vector3(x, CORE_Y + 1.65, z));
  });
})();

// ------------------------------------------------------------------ parts: pumps, IHX, head (module-local)
const IHX_R = 0.2, IHX_RING = 1.12, PUMP_RING = 1.12;
const ihxAngles = [90, 270], pumpAngles = [0, 180];
(function buildPrimary() {
  ihxAngles.forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const g = sub('ihx', dir.clone().multiplyScalar(part('ihx').def.radial).setY(7.0));
    g.position.set(dir.x * IHX_RING, 0, dir.z * IHX_RING);
    R.ihx.movers[R.ihx.movers.length - 1].base.copy(g.position);
    const shell = mat({ color: 0xb4b9bf, metalness: 0.95, roughness: 0.4, roughnessMap: texBrushed, transparent: true, opacity: 0.55, depthWrite: false });
    add('ihx', G.cyl(IHX_R, 2.6, 48, IHX_R, true), shell, { parent: g, y: -2.2, cast: false });
    add('ihx', G.cyl(IHX_R + 0.01, 0.06, 48), M.steelDark(), { parent: g, y: -0.92 });
    add('ihx', G.cyl(IHX_R + 0.01, 0.06, 48), M.steelDark(), { parent: g, y: -3.48 });
    addInstanced('ihx', G.cyl(0.006, 2.44, 8), M.steel(), hexPositions(4, 0.036).map(([x, z]) => new THREE.Matrix4().makeTranslation(x, -2.2, z)), { parent: g, cast: false, recv: false });
    for (let k = 0; k < 6; k++) { const b = (k / 6) * Math.PI * 2; add('ihx', G.box(0.03, 0.22, 0.09), M.absorber(), { parent: g, x: Math.cos(b) * IHX_R, y: -1.15, z: Math.sin(b) * IHX_R, ry: -b, cast: false }); add('ihx', G.box(0.03, 0.22, 0.09), M.absorber(), { parent: g, x: Math.cos(b) * IHX_R, y: -3.3, z: Math.sin(b) * IHX_R, ry: -b, cast: false }); }
    if (i === 1) labelAt('ihx', new THREE.Vector3(0, -1.3, 0), g);
  });

  pumpAngles.forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const g = sub('pumps', dir.clone().multiplyScalar(part('pumps').def.radial).setY(5.5));
    g.position.set(dir.x * PUMP_RING, 0, dir.z * PUMP_RING);
    R.pumps.movers[R.pumps.movers.length - 1].base.copy(g.position);
    add('pumps', G.cyl(0.16, 1.6, 40), M.steel(), { parent: g, y: -2.4 });
    for (let k = 0; k < 6; k++) add('pumps', G.torus(0.175, 0.03, 48, 12), M.copper(), { parent: g, y: -2.95 + k * 0.22, rx: Math.PI / 2 });
    add('pumps', G.cyl(0.16, 0.16, 40, 0.23), M.steelDark(), { parent: g, y: -1.52 });
    add('pumps', G.cyl(0.07, 0.4, 16), M.rubber(), { parent: g, y: -1.1 });
    pipe('pumps', [[0, -3.2, 0], [0, -4.75, 0], [-dir.x * 0.62, -5.0, -dir.z * 0.62]], 0.07, M.steel(), { parent: g });
    if (i === 0) labelAt('pumps', new THREE.Vector3(0, -1.45, 0), g);
  });

  add('head', G.cyl(1.45, 0.3, 96), M.steel(), { y: 0.15 });
  add('head', G.cyl(1.33, 0.5, 96), M.steelDark(), { y: -0.25 });
  add('head', G.cyl(0.9, 0.12, 96), M.steel(), { y: 0.36 });
  add('head', G.annulus(0.88, 0.92, 0.02), M.absorber(), { y: 0.42 });
  [90, 210, 330].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); add('head', G.cyl(0.09, 1.3, 24), M.steel(), { x: Math.cos(a) * 0.25, y: 1.07, z: Math.sin(a) * 0.25 }); add('head', G.cyl(0.13, 0.18, 24), M.steelDark(), { x: Math.cos(a) * 0.25, y: 1.78, z: Math.sin(a) * 0.25 }); });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; add('head', G.cyl(0.05, 0.7, 16), M.steelDark(), { x: Math.cos(a) * 0.72, y: 0.65, z: Math.sin(a) * 0.72 }); add('head', G.box(0.14, 0.12, 0.14), M.steelPaint(0x3b434c), { x: Math.cos(a) * 0.72, y: 1.05, z: Math.sin(a) * 0.72, ry: -a }); }
  add('head', G.torus(1.2, 0.04, 96, 10), M.steelPaint(0x6a7480), { y: 0.34, rx: Math.PI / 2 });
  labelAt('head', new THREE.Vector3(1.05, 0.33, -1.0));
})();

// ------------------------------------------------------------------ parts: safety systems (module-local)
const STACK_X = -4.9;
(function buildSafety() {
  const dm = M.steelPaint(0x8a949e);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2 + Math.PI / 8;
    const g = sub('dhr', new THREE.Vector3(Math.cos(a), 0, Math.sin(a)).multiplyScalar(0.8));
    g.position.set(Math.cos(a) * 3.4, 0, Math.sin(a) * 3.4); R.dhr.movers[R.dhr.movers.length - 1].base.copy(g.position);
    add('dhr', G.box(0.26, 5.5, 0.6), dm, { parent: g, y: -2.95, ry: -a });
    for (let j = 0; j < 4; j++) add('dhr', G.box(0.3, 0.04, 0.56), M.steelDark(), { parent: g, y: -5.5 + j * 0.14, ry: -a, cast: false });
  }
  const g2 = sub('dhr', new THREE.Vector3(0, 1.2, 0)); R.dhr.movers[R.dhr.movers.length - 1].base.set(0, 0, 0);
  add('dhr', G.torus(3.4, 0.28, 128, 16), dm, { parent: g2, y: 0.32, rx: Math.PI / 2 });
  pipe('dhr', [[-3.4, 0.32, 0], [STACK_X, 0.32, 0], [STACK_X, 1.4, 0]], 0.3, dm, { parent: g2 });
  add('dhr', G.cyl(0.5, 8.0, 48, 0.5, true), M.steelPaint(0x9aa4ad), { parent: g2, x: STACK_X, y: 5.0 });
  add('dhr', G.cyl(0.5, 0.5, 48, 0.72), M.steelPaint(0x6c757e), { parent: g2, x: STACK_X, y: 9.25 });
  add('dhr', G.cyl(0.9, 0.35, 48), M.steelPaint(0x6c757e), { parent: g2, x: STACK_X, y: 9.8, cast: false });
  for (let k = 0; k < 4; k++) add('dhr', G.box(0.06, 0.35, 0.06), M.steelDark(), { parent: g2, x: STACK_X + Math.cos((k * Math.PI) / 2) * 0.8, y: 9.65, z: Math.sin((k * Math.PI) / 2) * 0.8 });
  labelAt('dhr', new THREE.Vector3(STACK_X, 8.6, 0), g2);

  const det = M.steelPaint(0x2f3740);
  [45, 135, 225, 315].forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const g = sub('instruments', dir.clone().multiplyScalar(part('instruments').def.radial));
    g.position.set(dir.x * 1.62, 0, dir.z * 1.62); R.instruments.movers[R.instruments.movers.length - 1].base.copy(g.position);
    add('instruments', G.cyl(0.08, 0.7, 24), det, { parent: g, y: CORE_Y });
    add('instruments', G.cyl(0.085, 0.05, 24), M.copper(), { parent: g, y: CORE_Y + 0.37 });
    pipe('instruments', [[0, CORE_Y + 0.4, 0], [0, 0.05, 0]], 0.016, M.rubber(), { parent: g });
    if (i === 0) labelAt('instruments', new THREE.Vector3(0, CORE_Y + 0.5, 0), g);
  });
  const g3 = sub('instruments', new THREE.Vector3(0, 1.5, 0)); R.instruments.movers[R.instruments.movers.length - 1].base.set(0, 0, 0);
  add('instruments', G.cyl(0.035, 2.6, 16), M.steel(), { parent: g3, x: 0.55, y: 0.2, z: -0.45 });
  add('instruments', G.box(0.22, 0.2, 0.16), M.steelPaint(0x3b434c), { parent: g3, x: 0.55, y: 1.6, z: -0.45 });
  add('instruments', G.cyl(0.03, 2.2, 16), M.steel(), { parent: g3, x: -0.55, y: 0.0, z: 0.45 });
})();

// ------------------------------------------------------------------ parts: power conversion
const loopPathsLocal = [];
const loopPathsWorld = [];
(function buildPower() {
  const ins = M.insul(), flange = M.steelDark(), rack = M.steelPaint(0x4f5a66);
  const PCU_IN = -MOD_Y + 1.25, PCU_IN_C = -MOD_Y + 0.8;
  ihxAngles.forEach((deg) => {
    const a = THREE.MathUtils.degToRad(deg);
    const zc = Math.sin(a) * IHX_RING;
    const sgn = Math.sign(zc);
    const hot = [[0.1, -0.9, zc], [0.1, 1.75, zc], [6.55, 1.75, zc], [6.55, PCU_IN, zc]];
    const cold = [[-0.1, -0.9, zc], [-0.1, 1.2, zc], [-0.1, 1.2, zc + sgn * 0.3], [6.55, 1.2, zc + sgn * 0.3], [6.55, PCU_IN_C, zc + sgn * 0.3]];
    pipe('loop', hot, 0.085, ins);
    pipe('loop', cold, 0.085, ins);
    [hot, cold].forEach((p) => { add('loop', G.cyl(0.13, 0.08, 24), flange, { x: p[1][0], y: 0.55, z: p[1][2] }); add('loop', G.cyl(0.13, 0.08, 24), flange, { x: p[1][0], y: 0.95, z: p[1][2] }); });
    loopPathsLocal.push({ pts: hot.map((p) => [...p, 0.06, 1.0]), rev: false }, { pts: cold.map((p) => [...p, 0.06, 0.15]), rev: true });
  });
  [3.0, 5.4].forEach((x) => { [-1.6, 1.6].forEach((z) => add('loop', G.box(0.14, 7.6, 0.14), rack, { x, y: -MOD_Y + 3.8, z })); add('loop', G.box(0.16, 0.14, 3.4), rack, { x, y: 1.45 }); add('loop', G.box(0.16, 0.14, 3.4), rack, { x, y: 0.95 }); });
  labelAt('loop', new THREE.Vector3(3.6, 1.95, 1.12));

  // PCU skid (world coords)
  const base = M.skidYellow(), paint = M.steelPaint(0x3e4a57);
  add('pcu', G.box(5.2, 0.25, 3.4), M.steelPaint(0x58636f), { x: 8.6, y: 0.125 });
  [[6.1, -1.6], [6.1, 1.6], [11.1, -1.6], [11.1, 1.6]].forEach(([x, z]) => add('pcu', G.box(0.25, 0.25, 0.25), base, { x, y: 0.125, z }));
  add('pcu', G.box(1.1, 1.7, 3.0), paint, { x: 6.9, y: 1.1 });
  for (let z = -1.2; z <= 1.2; z += 0.4) add('pcu', G.box(1.14, 0.03, 0.06), M.steelDark(), { x: 6.9, y: 1.5, z });
  add('pcu', G.cyl(0.45, 1.3, 48), paint, { x: 8.3, y: 1.1, rz: Math.PI / 2 });
  add('pcu', G.cyl(0.62, 0.35, 48), paint, { x: 7.75, y: 1.1, rz: Math.PI / 2 });
  add('pcu', G.cyl(0.3, 0.9, 32), M.steel(), { x: 9.1, y: 1.1, rz: Math.PI / 2 });
  add('pcu', G.cyl(0.55, 1.7, 48), M.genBlue(), { x: 10.2, y: 1.1, rz: Math.PI / 2 });
  add('pcu', G.box(0.9, 0.5, 0.7), M.genBlue(), { x: 10.2, y: 1.85 });
  add('pcu', G.cyl(0.42, 0.25, 48), M.steelDark(), { x: 11.15, y: 1.1, rz: Math.PI / 2 });
  add('pcu', G.cyl(0.35, 0.8, 40), paint, { x: 8.3, y: 1.1, z: 1.0, rz: Math.PI / 2 });
  [7.7, 8.9, 10.2].forEach((x) => add('pcu', G.box(0.5, 0.6, 1.3), M.steelPaint(0x58636f), { x, y: 0.55 }));
  spinners.push(add('pcu', G.cyl(0.26, 0.08, 40), M.steel(), { x: 9.55, y: 1.1, rz: Math.PI / 2 }));
  add('pcu', G.box(0.8, 2.0, 0.6), M.steelPaint(0x8d969e), { x: 10.6, y: 1.0, z: -1.3 });
  labelAt('pcu', new THREE.Vector3(10.2, 2.25, 0));

  // Gas loop to the cooler (world coords)
  const gas = [[8.6, 0.55, 1.75], [12.4, 0.55, 1.75], [12.4, 2.2, 1.75], [14.4, 2.2, 1.75]];
  const gasR = [[14.4, 2.2, -1.75], [12.4, 2.2, -1.75], [12.4, 0.55, -1.75], [8.6, 0.55, -1.75]];
  pipe('cooler', gas, 0.11, ins); pipe('cooler', gasR, 0.11, ins);
  loopPathsWorld.push({ pts: gas.map((p) => [...p, 0.07, 0.7]), rev: false }, { pts: gasR.map((p) => [...p, 0.07, 0.1]), rev: false });

  // Air cooler (world coords)
  const galv = M.steelPaint(0xa7aeb4);
  [[14.6, -2.3], [14.6, 2.3], [18.4, -2.3], [18.4, 2.3]].forEach(([x, z]) => add('cooler', G.box(0.22, 2.4, 0.22), galv, { x, y: 1.2, z }));
  add('cooler', G.box(4.0, 1.0, 4.9), M.steelPaint(0x3a4047), { x: 16.5, y: 1.9 });
  for (let x = 14.6; x <= 18.4; x += 0.19) add('cooler', G.box(0.02, 1.02, 4.92), M.steelPaint(0x6b737b), { x, y: 1.9, cast: false });
  add('cooler', G.box(4.2, 0.6, 5.1), galv, { x: 16.5, y: 2.7 });
  const fanX = [15.2, 16.5, 17.8], fanZ = [-1.25, 1.25];
  fanX.forEach((x) => fanZ.forEach((z) => {
    add('cooler', G.cyl(0.6, 0.5, 48, 0.6, true), M.steelPaint(0x5a636c), { x, y: 3.25, z });
    const hub = new THREE.Group(); hub.position.set(x, 3.3, z); R.cooler.root.add(hub);
    for (let k = 0; k < 5; k++) { const w = new THREE.Group(); w.rotation.y = (k / 5) * Math.PI * 2; hub.add(w); add('cooler', G.box(0.5, 0.025, 0.14), M.steelPaint(0xd8dde2), { parent: w, x: 0.3, rx: 0.55 }); }
    add('cooler', G.cyl(0.09, 0.14, 20), M.steelDark(), { parent: hub });
    add('cooler', G.box(1.26, 0.03, 0.05), M.steelDark(), { x, y: 3.52, z, cast: false });
    add('cooler', G.box(0.05, 0.03, 1.26), M.steelDark(), { x, y: 3.52, z, cast: false });
    fans.push(hub);
  }));
  labelAt('cooler', new THREE.Vector3(16.5, 3.9, 0));
})();

// ------------------------------------------------------------------ lights
const glow = new THREE.PointLight(0xff7a2a, 7, 7, 2);
glow.position.set(0, MOD_Y + CORE_Y + 0.8, 0); scene.add(glow);
// soft interior fill so the pool internals and the cut faces read well
const innerA = new THREE.PointLight(0xfff1e0, 2.6, 10, 2); innerA.position.set(0, MOD_Y - 1.2, 0); scene.add(innerA);
const innerB = new THREE.PointLight(0xdfe9ff, 1.2, 8, 2); innerB.position.set(0, MOD_Y - 4.6, 0); scene.add(innerB);
const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
key.position.set(20, 30, 10); key.castShadow = true;
key.shadow.mapSize.set(hiQ ? 2048 : 1024, hiQ ? 2048 : 1024);
key.shadow.camera.near = 1; key.shadow.camera.far = 90;
key.shadow.camera.left = key.shadow.camera.bottom = -26; key.shadow.camera.right = key.shadow.camera.top = 26;
key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
scene.add(key); scene.add(key.target);
const fill = new THREE.DirectionalLight(0xbcd4ff, 0.55); fill.position.set(-20, 12, -16); scene.add(fill);
scene.add(new THREE.HemisphereLight(0x8fb0d8, 0x3a3128, 0.35));

// ------------------------------------------------------------------ coolant flow particles
function primaryLoop(ihxDeg, pumpDeg) {
  const a = THREE.MathUtils.degToRad(ihxDeg), b = THREE.MathUtils.degToRad(pumpDeg);
  const ix = Math.cos(a) * IHX_RING, iz = Math.sin(a) * IHX_RING;
  const px = Math.cos(b) * PUMP_RING, pz = Math.sin(b) * PUMP_RING;
  const mid = (a + b) / 2 + (Math.abs(a - b) > Math.PI ? Math.PI : 0);
  return { pts: [
    [0, -4.95, 0, 0.45, 0.1], [0, -4.1, 0, 0.5, 0.15], [0, -3.1, 0, 0.5, 0.95], [0, -2.2, 0, 0.45, 1.0], [0, -1.25, 0, 0.55, 1.0],
    [ix, -1.1, iz, 0.14, 1.0], [ix, -3.4, iz, 0.14, 0.45],
    [Math.cos(mid) * 1.15, -2.6, Math.sin(mid) * 1.15, 0.18, 0.2],
    [px, -1.55, pz, 0.12, 0.15], [px, -3.25, pz, 0.08, 0.12], [px, -4.75, pz, 0.06, 0.1], [px * 0.4, -5.0, pz * 0.4, 0.1, 0.1], [0, -4.95, 0, 0.45, 0.1],
  ], rev: false };
}
function prepPath(p, yOff) {
  const pts = (p.rev ? [...p.pts].reverse() : p.pts).map((q) => [q[0], q[1] + yOff, q[2], q[3], q[4]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); cum.push(cum[i - 1] + d); }
  return { pts, cum, len: cum[cum.length - 1] };
}
const COLD = new THREE.Color(0x3fa4ff), HOT = new THREE.Color(0xffa23c), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
const ev = { pos: new THREE.Vector3(), spread: 0, heat: 0 };
function evalPath(p, s, out) {
  const d = s * p.len; let i = 1; while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const a = p.pts[i - 1], b = p.pts[i]; const t = (d - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
  out.pos.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  out.spread = a[3] + (b[3] - a[3]) * t; out.heat = a[4] + (b[4] - a[4]) * t;
}
function particleSystem(paths, count, size, clipped) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3);
  const totalLen = paths.reduce((s, p) => s + p.len, 0);
  const st = [];
  for (let i = 0; i < count; i++) {
    let r = Math.random() * totalLen, pi = 0; while (r > paths[pi].len && pi < paths.length - 1) { r -= paths[pi].len; pi++; }
    st.push({ path: pi, s: Math.random(), j: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(2), speed: 0.75 + Math.random() * 0.5 });
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const m = new THREE.PointsMaterial({ size, map: texSprite, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, opacity: 0.9 });
  if (clipped) m.clippingPlanes = clipPlanes;
  const pts = new THREE.Points(geo, m); pts.frustumCulled = false; scene.add(pts);
  const sys = { pts, update(dt) {
    for (let i = 0; i < count; i++) {
      const s0 = st[i], p = paths[s0.path];
      s0.s += (dt * 1.1 * s0.speed) / p.len; if (s0.s > 1) s0.s -= 1;
      evalPath(p, s0.s, ev);
      tmpV.copy(s0.j).multiplyScalar(ev.spread).add(ev.pos);
      pos[i * 3] = tmpV.x; pos[i * 3 + 1] = tmpV.y; pos[i * 3 + 2] = tmpV.z;
      tmpC.copy(COLD).lerp(HOT, ev.heat);
      col[i * 3] = tmpC.r; col[i * 3 + 1] = tmpC.g; col[i * 3 + 2] = tmpC.b;
    }
    geo.attributes.position.needsUpdate = true; geo.attributes.color.needsUpdate = true;
  } };
  sys.update(0);
  return sys;
}
const primaryPaths = [primaryLoop(90, 0), primaryLoop(270, 180)].map((p) => prepPath(p, MOD_Y));
const secondaryPaths = [...loopPathsLocal.map((p) => prepPath(p, MOD_Y)), ...loopPathsWorld.map((p) => prepPath(p, 0))];
const flowA = particleSystem(primaryPaths, isMobile ? 380 : 1100, isMobile ? 0.09 : 0.075, true);
const flowB = particleSystem(secondaryPaths, isMobile ? 180 : 500, isMobile ? 0.1 : 0.085, false);
let flowOn = true;

// ------------------------------------------------------------------ post-processing
let composer = null, bloom = null;
function buildComposer(w, h) {
  if (composer) { composer.dispose?.(); composer = null; }
  if (!hiQ) return;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: 4 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.6, 0.7);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
}

// ------------------------------------------------------------------ sizing
let W = 1, H = 1;
function resize() {
  const r = app.getBoundingClientRect();
  W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
  const dpr = Math.min(devicePixelRatio || 1, hiQ ? 2 : 1.25);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  labelRenderer.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(W, H); }
}
new ResizeObserver(() => resize()).observe(app);
resize();
buildComposer(W, H);
if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }

// ------------------------------------------------------------------ UI: parts list, search, card
const ui = {
  side: $('#side'), partList: $('#partList'), search: $('#search'), results: $('#results'),
  card: $('#card'), cardTitle: $('#cardTitle'), cardDesc: $('#cardDesc'), cardSpecs: $('#cardSpecs'), cardGroup: $('#cardGroup'),
  tip: $('#tip'), cut: $('#cut'), explode: $('#explode'), tourBar: $('#tourBar'), tourText: $('#tourText'), hint: $('#hint'), help: $('#help'), loading: $('#loading'),
};
GROUPS.forEach((g) => {
  const h = document.createElement('div'); h.className = 'grp'; h.textContent = g.name; ui.partList.appendChild(h);
  PARTS.filter((p) => p.group === g.id).forEach((p) => {
    const b = document.createElement('button'); b.className = 'pi'; b.dataset.id = p.id; b.textContent = p.name;
    b.addEventListener('click', () => { select(p.id, { fly: true }); if (isMobile) { ui.side.classList.add('closed'); ui.search.placeholder = 'Search parts…'; } });
    ui.partList.appendChild(b);
  });
});
if (isMobile) { ui.side.classList.add('closed'); ui.search.placeholder = 'Search parts…'; }

let selected = null, hovered = null, xray = false;
function setHighlight(e, on, strength) {
  e.mats.forEach((m) => {
    const b = m.userData.base; if (!b) return;
    if (on && b.ei < 0.5) { m.emissive.setHex(0xffb547); m.emissiveIntensity = strength; }
    else { m.emissive.setHex(b.emissive); m.emissiveIntensity = b.ei; }
  });
}
function applyXray() {
  Object.values(R).forEach((e) => {
    const ghost = xray && selected && e.id !== selected;
    const focus = xray && selected && e.id === selected;
    e.mats.forEach((m) => {
      const b = m.userData.base; if (!b) return;
      if (ghost) { m.transparent = true; m.opacity = Math.min(b.opacity, 0.06); m.depthWrite = false; }
      else { m.transparent = b.transparent; m.opacity = b.opacity; m.depthWrite = b.depthWrite; }
      if (!NO_CLIP.has(e.id)) m.clippingPlanes = focus ? null : clipPlanes;
    });
    if (e.labelEl) e.labelEl.classList.toggle('dim', ghost);
  });
  $('#btnIsolate').classList.toggle('on', xray);
}
function showCard(e) {
  ui.cardGroup.textContent = GROUPS.find((g) => g.id === e.def.group).name;
  ui.cardTitle.textContent = e.def.name;
  ui.cardDesc.textContent = e.def.desc;
  ui.cardSpecs.innerHTML = e.def.specs.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('');
  ui.card.classList.remove('hidden');
}
function select(id, { fly = true } = {}) {
  if (selected && R[selected]) { setHighlight(R[selected], false); R[selected].labelEl?.classList.remove('active'); }
  selected = id;
  const e = R[id]; if (!e) return;
  setHighlight(e, true, 0.22);
  e.labelEl?.classList.add('active');
  document.querySelectorAll('.pi').forEach((b) => b.classList.toggle('active', b.dataset.id === id));
  showCard(e);
  if (e.internal && cutVal < 0.5 && !xray) setCut(55, true);
  if (fly) flyToPart(e);
  applyXray();
  hideHint();
}
function deselect() {
  if (selected && R[selected]) { setHighlight(R[selected], false); R[selected].labelEl?.classList.remove('active'); }
  selected = null; xray = false; applyXray();
  document.querySelectorAll('.pi').forEach((b) => b.classList.remove('active'));
  ui.card.classList.add('hidden');
}
$('#cardClose').addEventListener('click', deselect);
$('#btnFly').addEventListener('click', () => selected && flyToPart(R[selected]));
$('#btnIsolate').addEventListener('click', () => { xray = !xray; applyXray(); });
$('#btnNext').addEventListener('click', () => { const i = TOUR.indexOf(selected); select(TOUR[(i + 1) % TOUR.length], { fly: true }); });

let resIdx = -1;
function doSearch(q) {
  q = q.trim().toLowerCase();
  ui.results.innerHTML = ''; resIdx = -1;
  if (!q) { ui.results.classList.remove('open'); return; }
  const toks = q.split(/\s+/);
  const hits = PARTS.filter((p) => { const hay = (p.name + ' ' + p.keywords + ' ' + GROUPS.find((g) => g.id === p.group).name).toLowerCase(); return toks.every((t) => hay.includes(t)); }).slice(0, 8);
  if (!hits.length) { const d = document.createElement('div'); d.className = 'res none'; d.textContent = 'No matching part'; ui.results.appendChild(d); }
  hits.forEach((p) => {
    const d = document.createElement('div'); d.className = 'res'; d.dataset.id = p.id; d.innerHTML = `<span>${p.name}</span><small>${GROUPS.find((g) => g.id === p.group).name}</small>`;
    d.addEventListener('mousedown', (ev) => { ev.preventDefault(); pickResult(p.id); });
    ui.results.appendChild(d);
  });
  ui.results.classList.add('open');
}
function pickResult(id) { select(id, { fly: true }); ui.results.classList.remove('open'); ui.search.value = R[id].def.name; ui.search.blur(); }
ui.search.addEventListener('input', () => doSearch(ui.search.value));
ui.search.addEventListener('focus', () => { if (ui.search.value) doSearch(ui.search.value); });
ui.search.addEventListener('blur', () => setTimeout(() => ui.results.classList.remove('open'), 120));
ui.search.addEventListener('keydown', (ev) => {
  const items = [...ui.results.querySelectorAll('.res:not(.none)')];
  if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); if (!items.length) return; resIdx = (resIdx + (ev.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length; items.forEach((it, i) => it.classList.toggle('sel', i === resIdx)); }
  else if (ev.key === 'Enter') { ev.preventDefault(); if (!items.length) return; pickResult(items[resIdx >= 0 ? resIdx : 0].dataset.id); }
  else if (ev.key === 'Escape') { ui.search.blur(); ui.results.classList.remove('open'); }
});

// ------------------------------------------------------------------ camera: fly-to, tween, WASD
let camTween = null;
const easeIO = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
function flyTo(pos, tgt, dur = 1500) {
  camTween = { p0: camera.position.clone(), p1: pos.clone(), t0: controls.target.clone(), t1: tgt.clone(), start: performance.now(), dur };
  controls.autoRotate = false;
}
const _box = new THREE.Box3(), _sph = new THREE.Sphere();
function flyToPart(e) {
  _box.setFromObject(e.root);
  if (_box.isEmpty()) return;
  _box.getBoundingSphere(_sph);
  const c = _sph.center.clone();
  const vfov = THREE.MathUtils.degToRad(camera.fov);
  const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
  let d = (_sph.radius * 1.15) / Math.sin(Math.min(vfov, hfov) / 2);
  d = THREE.MathUtils.clamp(d, 2.6, 60);
  const cur = camera.position.clone().sub(controls.target); cur.y = 0;
  if (cur.lengthSq() < 1e-4) cur.set(1, 0, 1);
  cur.normalize();
  const elev = e.internal ? 0.3 : 0.42;
  const dir = new THREE.Vector3(cur.x * Math.cos(elev), Math.sin(elev), cur.z * Math.cos(elev)).normalize();
  const pos = c.clone().addScaledVector(dir, d);
  if (pos.y < 0.4) pos.y = 0.4;
  flyTo(pos, c);
}
let idleT = null;
controls.addEventListener('start', () => { camTween = null; controls.autoRotate = false; clearTimeout(idleT); stopTour(); hideHint(); });
controls.addEventListener('end', () => { clearTimeout(idleT); idleT = setTimeout(() => { if (!tour) controls.autoRotate = true; }, 14000); });

const keys = new Set();
addEventListener('keydown', (ev) => {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (ev.key === 'Escape') { ui.results.classList.remove('open'); ui.help.classList.add('hidden'); $('#layersMenu').classList.add('hidden'); if (tour) stopTour(); else deselect(); ui.search.blur(); return; }
  if (typing) return;
  if (ev.key === '/') { ev.preventDefault(); ui.search.focus(); ui.search.select(); return; }
  const k = ev.key.toLowerCase();
  if (k === 'l') toggleLabels();
  else if (k === 't') toggleTour();
  else if (k === 'r') resetView();
  else if (k === 'f') toggleFullscreen();
  else if ('wasdqe'.includes(k) || k === 'shift') { keys.add(k); camTween = null; controls.autoRotate = false; stopTour(); }
});
addEventListener('keyup', (ev) => keys.delete(ev.key.toLowerCase()));
addEventListener('blur', () => keys.clear());
const _f = new THREE.Vector3(), _r = new THREE.Vector3(), _mv = new THREE.Vector3();
function updateFly(dt) {
  if (!keys.size) return;
  camera.getWorldDirection(_f); _f.y = 0; if (_f.lengthSq() < 1e-6) return; _f.normalize();
  _r.crossVectors(_f, camera.up).normalize();
  _mv.set(0, 0, 0);
  if (keys.has('w')) _mv.add(_f); if (keys.has('s')) _mv.sub(_f);
  if (keys.has('d')) _mv.add(_r); if (keys.has('a')) _mv.sub(_r);
  if (keys.has('e')) _mv.y += 1; if (keys.has('q')) _mv.y -= 1;
  if (_mv.lengthSq() === 0) return;
  const dist = camera.position.distanceTo(controls.target);
  const speed = (keys.has('shift') ? 3 : 1) * THREE.MathUtils.clamp(dist * 0.6, 1.5, 12) * dt;
  _mv.normalize().multiplyScalar(speed);
  camera.position.add(_mv); controls.target.add(_mv);
}
function resetView() { deselect(); flyTo(HOME_POS, HOME_TGT, 1600); setCut(55, true); setExplode(0, true); }
$('#btnReset').addEventListener('click', resetView);

// ------------------------------------------------------------------ cutaway & explode
let cutVal = 0, cutTarget = 0, explodeVal = 0, explodeTarget = 0;
function setCut(v, animate = false) { cutTarget = v; if (!animate) cutVal = v; ui.cut.value = String(Math.round(v)); }
function setExplode(v, animate = false) { explodeTarget = v; if (!animate) explodeVal = v; ui.explode.value = String(Math.round(v)); }
ui.cut.addEventListener('input', () => { cutVal = cutTarget = +ui.cut.value; });
let explodeWide = false;
ui.explode.addEventListener('input', () => {
  explodeVal = explodeTarget = +ui.explode.value;
  if (explodeTarget > 25 && !explodeWide) { explodeWide = true; if (camera.position.distanceTo(new THREE.Vector3(0, 8, 0)) < 30) flyTo(new THREE.Vector3(20, 15, 24), new THREE.Vector3(1.5, 8, 0), 1600); }
  if (explodeTarget < 5) explodeWide = false;
});
const _v = new THREE.Vector3();
function updateCut() {
  if (cutVal <= 0.5) { clipPlane.constant = 1e6; return; }
  const s = cutVal;
  const offset = s <= 55 ? 4.6 * (1 - s / 55) : -((s - 55) / 45) * 1.25;
  _v.copy(camera.position); _v.y = 0;
  if (_v.lengthSq() < 1e-4) _v.set(1, 0, 0); _v.normalize();
  clipPlane.normal.copy(_v).negate();
  clipPlane.constant = offset;
}
function updateExplode() {
  const t = explodeVal / 100;
  Object.values(R).forEach((e) => e.movers.forEach((mv) => mv.obj.position.copy(mv.base).addScaledVector(mv.dir, t)));
}

// ------------------------------------------------------------------ layers, labels, quality
document.querySelectorAll('#layersMenu input[data-layer]').forEach((cb) => cb.addEventListener('change', () => {
  Object.values(R).forEach((e) => { if (e.def.layer === cb.dataset.layer) e.root.visible = cb.checked; });
  document.querySelectorAll('.pi').forEach((b) => { const e = R[b.dataset.id]; if (e?.def.layer === cb.dataset.layer) b.classList.toggle('hiddenPart', !cb.checked); });
}));
$('#solidBuilding').addEventListener('change', (ev) => {
  buildingPanels.forEach((m) => { const mt = m.material, b = mt.userData.base; if (ev.target.checked) { b.opacity = 1; b.transparent = false; b.depthWrite = true; mt.userData.pickThrough = false; } else { b.opacity = 0.1; b.transparent = true; b.depthWrite = false; mt.userData.pickThrough = true; } m.castShadow = ev.target.checked; });
  applyXray();
});
$('#hiQ').addEventListener('change', (ev) => { hiQ = ev.target.checked; key.shadow.mapSize.set(hiQ ? 2048 : 1024, hiQ ? 2048 : 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } resize(); buildComposer(W, H); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); } });
$('#layersBtn').addEventListener('click', (ev) => { ev.stopPropagation(); $('#layersMenu').classList.toggle('hidden'); });
addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.dd')) $('#layersMenu').classList.add('hidden'); });

let labelsOn = true;
function toggleLabels() { labelsOn = !labelsOn; $('#tgLabels').classList.toggle('on', labelsOn); labelRenderer.domElement.style.display = labelsOn ? '' : 'none'; }
$('#tgLabels').addEventListener('click', toggleLabels);
$('#tgFlow').addEventListener('click', () => { flowOn = !flowOn; flowA.pts.visible = flowB.pts.visible = flowOn; $('#tgFlow').classList.toggle('on', flowOn); });

const ray = new THREE.Raycaster();
const _lp = new THREE.Vector3(), _cd = new THREE.Vector3();
let occT = 0;
function updateLabels(now) {
  _cd.copy(camera.position); _cd.y = 0; const phi = Math.atan2(_cd.z, _cd.x);
  const cut = cutVal > 0.5;
  Object.values(R).forEach((e) => {
    if (!e.dyn || !e.label) return;
    const ang = phi + (cut ? Math.PI : 0) + e.dyn.off;
    e.label.position.set(Math.cos(ang) * e.dyn.r, e.dyn.y, Math.sin(ang) * e.dyn.r);
  });
  if (now - occT < 130) return; occT = now;
  // Gather candidates with screen positions, then place by priority and reject overlaps.
  const cands = [];
  Object.values(R).forEach((e) => {
    if (!e.label || !e.labelEl) return;
    if (!e.root.visible) { e.labelEl.classList.add('off'); return; }
    e.label.getWorldPosition(_lp);
    const dist = camera.position.distanceTo(_lp);
    const pri = e.id === selected ? 0 : e.id === hovered ? 1 : MAJOR.has(e.id) ? 2 : 3;
    _sp.copy(_lp).project(camera);
    if (_sp.z > 1 || _sp.z < -1) { e.labelEl.classList.add('off'); return; }
    // detail labels only when the camera is close enough to read them
    if (pri === 3 && dist > 9.5) { e.labelEl.classList.add('off'); return; }
    if (pri >= 2) {
      ray.set(camera.position, _lp.clone().sub(camera.position).normalize());
      ray.far = dist - 0.12;
      const hits = ray.intersectObjects(pickables, false);
      let occluded = false;
      for (const h of hits) {
        const o = h.object; if (!o.visible || o.userData.part === e.id) continue;
        let vis = true; o.traverseAncestors((a) => { if (a.visible === false) vis = false; }); if (!vis) continue;
        const m = o.material; if (m.userData.pickThrough || (m.transparent && m.opacity < 0.3)) continue;
        if (cut && m.clippingPlanes && clipPlane.distanceToPoint(h.point) < 0) continue;
        occluded = true; break;
      }
      if (occluded) { e.labelEl.classList.add('off'); return; }
    }
    const x = (_sp.x * 0.5 + 0.5) * W + 10, y = (-_sp.y * 0.5 + 0.5) * H;
    cands.push({ e, pri, dist, x, y, w: e.labelEl.offsetWidth || e.def.name.length * 7 + 30, h: 26 });
  });
  cands.sort((a, b) => a.pri - b.pri || a.dist - b.dist);
  const placed = [];
  cands.forEach((c) => {
    const hit = placed.some((p) => c.x < p.x + p.w && c.x + c.w > p.x && Math.abs(c.y - p.y) < (c.h + p.h) / 2);
    if (hit && c.pri >= 2) { c.e.labelEl.classList.add('off'); return; }
    c.e.labelEl.classList.remove('off'); placed.push(c);
  });
}
const MAJOR = new Set(['building', 'shield', 'vessel', 'head', 'dhr', 'pcu', 'cooler', 'loop', 'skid', 'sodium']);
const _sp = new THREE.Vector3();

// ------------------------------------------------------------------ picking
const pointer = new THREE.Vector2(), ndc = new THREE.Vector2(); let pointerIn = false, downPos = null, downT = 0;
function pickAt(cx, cy) {
  ndc.set((cx / W) * 2 - 1, -(cy / H) * 2 + 1);
  ray.setFromCamera(ndc, camera); ray.far = Infinity;
  const hits = ray.intersectObjects(pickables, false);
  const cut = cutVal > 0.5;
  for (const h of hits) {
    const o = h.object; if (!o.visible) continue;
    let vis = true; o.traverseAncestors((a) => { if (a.visible === false) vis = false; }); if (!vis) continue;
    const m = o.material; if (m.userData.pickThrough || (m.transparent && m.opacity < 0.15)) continue;
    if (cut && m.clippingPlanes && clipPlane.distanceToPoint(h.point) < 0) continue;
    return o.userData.part;
  }
  return null;
}
canvas.addEventListener('pointermove', (ev) => { const r = canvas.getBoundingClientRect(); pointer.x = ev.clientX - r.left; pointer.y = ev.clientY - r.top; pointerIn = true; ui.tip.style.left = pointer.x + 'px'; ui.tip.style.top = pointer.y + 'px'; });
canvas.addEventListener('pointerleave', () => { pointerIn = false; setHover(null); });
canvas.addEventListener('pointerdown', (ev) => { downPos = [ev.clientX, ev.clientY]; downT = performance.now(); });
canvas.addEventListener('pointerup', (ev) => {
  if (!downPos) return;
  const moved = Math.hypot(ev.clientX - downPos[0], ev.clientY - downPos[1]);
  downPos = null;
  if (moved > 6 || performance.now() - downT > 450) return;
  const r = canvas.getBoundingClientRect();
  const id = pickAt(ev.clientX - r.left, ev.clientY - r.top);
  if (id) select(id, { fly: false }); else deselect();
});
function setHover(id) {
  if (hovered === id) return;
  if (hovered && R[hovered] && hovered !== selected) setHighlight(R[hovered], false);
  hovered = id;
  if (hovered && R[hovered]) { if (hovered !== selected) setHighlight(R[hovered], true, 0.14); ui.tip.textContent = R[hovered].def.name; ui.tip.classList.remove('hidden'); canvas.style.cursor = 'pointer'; }
  else { ui.tip.classList.add('hidden'); canvas.style.cursor = ''; }
}
let hoverT = 0;
function updateHover(now) {
  if (isMobile || !pointerIn || now - hoverT < 60) return; hoverT = now;
  setHover(pickAt(pointer.x, pointer.y));
}

// ------------------------------------------------------------------ tour
let tour = null;
function toggleTour() { tour ? stopTour() : startTour(); }
function startTour() {
  tour = { i: 0, t: null };
  $('#tgTour').classList.add('tourOn'); $('#tgTour').textContent = '■ Stop';
  ui.tourBar.classList.remove('hidden');
  controls.autoRotate = false;
  tourStep();
}
function tourStep() {
  if (!tour) return;
  const id = TOUR[tour.i];
  ui.tourText.textContent = `Tour ${tour.i + 1}/${TOUR.length} · ${R[id].def.name}`;
  select(id, { fly: true });
  tour.t = setTimeout(() => { if (!tour) return; tour.i = (tour.i + 1) % TOUR.length; tourStep(); }, 7500);
}
function stopTour() {
  if (!tour) return;
  clearTimeout(tour.t); tour = null;
  $('#tgTour').classList.remove('tourOn'); $('#tgTour').textContent = '▶ Tour';
  ui.tourBar.classList.add('hidden');
}
$('#tgTour').addEventListener('click', toggleTour);
$('#tourStop').addEventListener('click', stopTour);
canvas.addEventListener('wheel', () => { stopTour(); hideHint(); }, { passive: true });

// ------------------------------------------------------------------ misc UI
function toggleFullscreen() {
  const inFrame = window.self !== window.top;
  const openTab = () => { const a = document.createElement('a'); a.href = location.href; a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove(); };
  if (document.fullscreenElement) { document.exitFullscreen?.(); return; }
  if (!document.fullscreenEnabled) { openTab(); return; }
  const p = document.documentElement.requestFullscreen?.();
  if (p && p.catch) p.catch(() => { if (inFrame) openTab(); });
}
$('#fsBtn').addEventListener('click', toggleFullscreen);
$('#helpBtn').addEventListener('click', () => ui.help.classList.remove('hidden'));
$('#helpClose').addEventListener('click', () => ui.help.classList.add('hidden'));
ui.help.addEventListener('click', (ev) => { if (ev.target === ui.help) ui.help.classList.add('hidden'); });
$('#menuBtn').addEventListener('click', () => ui.side.classList.toggle('closed'));
$('#sideClose').addEventListener('click', () => ui.side.classList.add('closed'));
let hintHidden = false;
function hideHint() { if (hintHidden) return; hintHidden = true; ui.hint.classList.add('out'); }
setTimeout(hideHint, 9000);

// ------------------------------------------------------------------ main loop
setCut(55); updateCut();
const clock = new THREE.Clock();
function animate() {
  if (!TEST) requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  const t = clock.elapsedTime;

  if (camTween) {
    const k = Math.min(1, (now - camTween.start) / camTween.dur), e = easeIO(k);
    camera.position.lerpVectors(camTween.p0, camTween.p1, e);
    controls.target.lerpVectors(camTween.t0, camTween.t1, e);
    if (k >= 1) camTween = null;
  }
  updateFly(dt);
  controls.update();
  if (camera.position.y < 0.25) camera.position.y = 0.25;

  if (Math.abs(cutVal - cutTarget) > 0.05) { cutVal += (cutTarget - cutVal) * Math.min(1, dt * 5); ui.cut.value = String(Math.round(cutVal)); } else cutVal = cutTarget;
  if (Math.abs(explodeVal - explodeTarget) > 0.05) { explodeVal += (explodeTarget - explodeVal) * Math.min(1, dt * 5); ui.explode.value = String(Math.round(explodeVal)); } else explodeVal = explodeTarget;
  updateCut(); updateExplode();

  drumGroups.forEach((g, i) => { g.rotation.y = Math.PI / 2 - g.userData.angle + 0.9 + Math.sin(t * 0.25 + i * 0.7) * 0.6; });
  const fuelPulse = 1.0 + Math.sin(t * 1.6) * 0.18;
  if (fuelMat && fuelMat.userData.base) { fuelMat.userData.base.ei = fuelPulse; if (hovered !== 'pins' && selected !== 'pins') fuelMat.emissiveIntensity = fuelPulse; }
  glow.intensity = 6.5 + Math.sin(t * 1.6) * 1.2;
  spinners.forEach((s) => (s.rotation.x += dt * 28));
  fans.forEach((f) => (f.rotation.y += dt * 7));
  if (flowOn) { flowA.update(dt); flowB.update(dt); }

  updateHover(now);
  updateLabels(now);

  if (composer) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

requestAnimationFrame(() => requestAnimationFrame(() => { ui.loading.classList.add('out'); window.__MR_READY = true; }));
window.MR = { frame: () => animate(), select, deselect, resetView, setCut, setExplode, startTour, stopTour, parts: PARTS.map((p) => p.id), camera, controls, scene };
