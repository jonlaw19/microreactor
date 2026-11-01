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
if (TEST) document.documentElement.classList.add('nofx'); // test harness: skip backdrop blur (slow in software rendering)
let hiQ = !isMobile && qs.get('q') !== 'low';
const DETAIL = isMobile || qs.get('detail') === 'low' ? 1 : 2; // geometry level of detail

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.localClippingEnabled = true;

const scene = new THREE.Scene();
const FOG_COLOR = 0x1a1510;
scene.fog = new THREE.FogExp2(FOG_COLOR, 0.0032);

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
const NO_CLIP = new Set(['pcu', 'cooler', 'loop', 'switchyard', 'truck', 'crane', 'txline', 'dcsub', 'dchall', 'racks', 'ups', 'bess', 'gens', 'dccool']);

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
const texWire = canvasTex(64, (g, s) => {
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, s, s);
  g.strokeStyle = '#ffffff'; g.lineWidth = 7; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-8, s + 8); g.lineTo(s + 8, -8); g.stroke();
  g.beginPath(); g.moveTo(-8, 8); g.lineTo(8, -8); g.stroke(); g.beginPath(); g.moveTo(s - 8, s + 8); g.lineTo(s + 8, s - 8); g.stroke();
}, { repeat: 1 });
texWire.repeat.set(1, 5);
const texTrefoil = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  g.fillStyle = '#f2c230'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#111'; g.lineWidth = 10; g.strokeRect(5, 5, 246, 246);
  g.fillStyle = '#111'; g.beginPath(); g.arc(128, 128, 18, 0, Math.PI * 2); g.fill();
  for (let k = 0; k < 3; k++) { const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3; g.beginPath(); g.arc(128, 128, 92, a - Math.PI / 6, a + Math.PI / 6); g.arc(128, 128, 32, a + Math.PI / 6, a - Math.PI / 6, true); g.closePath(); g.fill(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
})();
const texChainlink = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128); g.strokeStyle = 'rgba(205,210,215,0.95)'; g.lineWidth = 3;
  for (let i = -128; i < 256; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 128, 128); g.stroke(); g.beginPath(); g.moveTo(i + 128, 0); g.lineTo(i, 128); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
})();
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
  panelGhost: () => { const m = mat({ color: 0xcfd6dd, metalness: 0.3, roughness: 0.55, transparent: true, opacity: 0.1, depthWrite: false, bumpMap: texPanel, bumpScale: 0.01 }); m.userData.pickThrough = true; m.userData.keepDouble = true; return m; },
  sodium: () => { const m = mat({ color: 0x9fb8cf, metalness: 0.6, roughness: 0.14, transparent: true, opacity: 0.34, depthWrite: false, envMapIntensity: 1.2, emissive: 0x2a1c0c, emissiveIntensity: 0.5 }); m.userData.pickThrough = true; return m; },
  fuel: () => mat({ color: 0x4a4f55, metalness: 0.9, roughness: 0.4, emissive: 0xff3800, emissiveIntensity: 0.85, bumpMap: texWire, bumpScale: 0.0015, roughnessMap: texWire }),
  pellet: () => mat({ color: 0x3a3028, metalness: 0.2, roughness: 0.75, emissive: 0xff2a00, emissiveIntensity: 1.6 }),
  rebar: () => mat({ color: 0x5a4636, metalness: 0.6, roughness: 0.72 }),
  hivis: () => mat({ color: 0xff7a1a, metalness: 0.0, roughness: 0.9 }),
  denim: () => mat({ color: 0x2d3e5c, metalness: 0.0, roughness: 0.95 }),
  skin: () => mat({ color: 0xc9a07e, metalness: 0.0, roughness: 0.8 }),
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
  const e = (R[id] = { id, def, root, meshes: [], mats: [], movers: [], label: null, labelEl: null, dyn: null, internal: INTERNAL.has(id), focus: null });
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
    if (NO_CLIP.has(e.id)) { m.clippingPlanes = null; if (m.side === THREE.DoubleSide && !m.userData.keepDouble) m.side = THREE.FrontSide; }
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
function scenery(geom, material, o = {}) {
  const m = new THREE.Mesh(geom, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
  material.clippingPlanes = null;
  if (material.side === THREE.DoubleSide && !material.userData.keepDouble) material.side = THREE.FrontSide;
  (o.parent || scene).add(m); return m;
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
  uniforms: { top: { value: new THREE.Color(0x0a0c14) }, horizon: { value: new THREE.Color(0x3d2a1c) }, bottom: { value: new THREE.Color(0x0d0a05) } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 top, horizon, bottom; varying vec3 vW;
    void main(){ float h = normalize(vW).y; vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.42)) : mix(horizon, bottom, pow(-h, 0.35));
    gl_FragColor = vec4(c, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));

const texGrass = canvasTex(512, (g, s) => {
  g.fillStyle = '#3b4a2a'; g.fillRect(0, 0, s, s);
  for (let i = 0; i < 70; i++) { const r = 40 + rnd() * 140, cx = rnd() * s, cy = rnd() * s; const grd = g.createRadialGradient(cx, cy, 0, cx, cy, r); const v = rnd(); grd.addColorStop(0, v > 0.5 ? 'rgba(78,96,52,0.5)' : 'rgba(58,52,36,0.45)'); grd.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = grd; g.fillRect(0, 0, s, s); }
  for (let i = 0; i < 60000; i++) { const v = 40 + Math.floor(rnd() * 70); g.fillStyle = `rgba(${v + 10},${v + 22},${v - 4},${0.3 + rnd() * 0.5})`; g.fillRect(rnd() * s, rnd() * s, 1 + rnd() * 2, 1 + rnd() * 3); }
}, { repeat: 2, srgb: true });
const groundMat = new THREE.MeshPhysicalMaterial({ color: 0x3f4536, roughness: 1.0, metalness: 0, map: tiled(texGrass, 90, 90), bumpMap: tiled(texConcreteBump, 160, 160), bumpScale: 0.05 });
const ground = new THREE.Mesh(new THREE.CircleGeometry(320, 96), groundMat);
ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);
// distant hills: displaced ring, silhouetted against the horizon glow
{ const hg = new THREE.CylinderGeometry(260, 260, 1, 160, 1, true); const pos = hg.attributes.position;
  for (let i = 0; i < pos.count; i++) { if (pos.getY(i) > 0) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); pos.setY(i, 6 + 9 * Math.abs(Math.sin(a * 3.1 + 0.4)) + 7 * Math.abs(Math.sin(a * 7.3 + 2.1)) + 4 * Math.sin(a * 13.7)); } else pos.setY(i, -2); }
  hg.computeVertexNormals();
  scene.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x110d09, side: THREE.BackSide, fog: true }))); }
// plant slab extended to the campus
const campusSlab = new THREE.Mesh(new THREE.PlaneGeometry(66, 34), new THREE.MeshPhysicalMaterial({ color: 0x66635d, roughness: 0.96, map: tiled(texConcrete, 30, 15), bumpMap: tiled(texConcreteBump, 30, 15), bumpScale: 0.02 }));
campusSlab.rotation.x = -Math.PI / 2; campusSlab.position.set(21, 0.002, -51); campusSlab.receiveShadow = true; scene.add(campusSlab);
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
const buildingPanels = [], spinners = [], fans = [], dcRoof = [], ledStrips = [];
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
    if (DETAIL === 2) {
      // rebar cage, visible on the cut faces
      const bars = [];
      [1.95, 2.9].forEach((r) => { for (let k = 0; k < 28; k++) { const a = a0 + (k + 0.5) * (Math.PI / 28); bars.push(new THREE.Matrix4().makeTranslation(Math.cos(a) * r, -3.0, Math.sin(a) * r)); } });
      addInstanced('shield', G.cyl(0.012, 5.4, 6), M.rebar(), bars, { parent: g, cast: false, recv: false });
      const hoopMat = M.rebar();
      [1.95, 2.9].forEach((r) => { for (let y = -5.4; y <= -0.6; y += 0.6) { const hg = new THREE.TorusGeometry(r, 0.01, 6, 48, Math.PI); hg.rotateX(Math.PI / 2); hg.rotateY(-a0); add('shield', hg, hoopMat, { parent: g, y, cast: false, recv: false }); } });
    }
  });
  // radiation trefoil placards on the silo
  [-20, 160].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: texTrefoil, roughness: 0.6, metalness: 0.1 })); d.position.set(Math.cos(a) * 3.115, -2.4, Math.sin(a) * 3.115); d.rotation.y = -a + Math.PI / 2; d.material.clippingPlanes = clipPlanes; part('shield').root.add(d); });
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
  // redan: conical shell that separates the hot pool (inside) from the cold pool (outside)
  add('vessel', G.cyl(1.33, 1.2, 96, 0.95, true), M.steel(), { y: -2.3 });
  // thermal baffle near the sodium surface
  add('vessel', G.cyl(1.3, 1.25, 96, 1.3, true), mat({ color: 0x8a9096, metalness: 0.9, roughness: 0.5, transparent: true, opacity: 0.55, depthWrite: false }), { y: -1.375, cast: false });
  // core grid plate with flow holes
  { const sh = new THREE.Shape(); sh.absarc(0, 0, 0.9, 0, Math.PI * 2, false);
    hexPositions(4, 0.125).forEach(([x, z]) => { const h = new THREE.Path(); h.absarc(x, -z, 0.034, 0, Math.PI * 2, true); sh.holes.push(h); });
    const g = new THREE.ExtrudeGeometry(sh, { depth: 0.08, bevelEnabled: false, curveSegments: 12 }); g.rotateX(-Math.PI / 2); g.computeVertexNormals();
    add('vessel', g, M.steelDark(), { y: -4.19 }); }
  // upper internal structure: plate above the core with rod guide tubes
  add('vessel', G.cyl(0.72, 0.05, 64), M.steelDark(), { y: -2.45 });
  [90, 210, 330].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); add('vessel', G.cyl(0.075, 0.55, 20, 0.075, true), M.steel(), { x: Math.cos(a) * 0.25, y: -2.75, z: Math.sin(a) * 0.25, cast: false }); });
})();

// ------------------------------------------------------------------ parts: core (module-local)
const CORE_Y = -3.6, CORE_H = 1.0;
const drumGroups = [];
let fuelMat, pelletMat;
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
  const ductMat = M.duct();
  addInstanced('assemblies', G.cyl(rc, CORE_H, 6, rc, true), ductMat, asm.filter(([x, z]) => Math.abs(x) > 1e-6 || Math.abs(z) > 1e-6).map(([x, z]) => new THREE.Matrix4().makeTranslation(x, CORE_Y, z)), { cast: false });
  add('assemblies', new THREE.CylinderGeometry(rc, rc, CORE_H, 6, 1, true, (2 * Math.PI) / 3, Math.PI), ductMat, { y: CORE_Y, cast: false });
  addInstanced('assemblies', G.cyl(rc * 0.55, 0.12, 6), M.steelDark(), asm.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, CORE_Y + CORE_H / 2 + 0.06, z)));
  labelAt('assemblies', new THREE.Vector3(0.35, CORE_Y + 0.62, -0.3));

  const pinRings = DETAIL === 2 ? 5 : 2;
  const pinPitch = DETAIL === 2 ? 0.0115 : 0.0215, pinR = DETAIL === 2 ? 0.0046 : 0.0095;
  const pinPos = hexPositions(pinRings, pinPitch);
  const centerIdx = asm.findIndex(([x, z]) => Math.abs(x) < 1e-6 && Math.abs(z) < 1e-6);
  const pinMats = [], plugMats = [];
  asm.forEach(([x, z], ai) => pinPos.forEach(([px, pz]) => {
    if (ai === centerIdx && Math.abs(px) < 1e-6 && Math.abs(pz) < 1e-6) return; // replaced by the cut-open pin
    pinMats.push(new THREE.Matrix4().makeTranslation(x + px, CORE_Y, z + pz));
    plugMats.push(new THREE.Matrix4().makeTranslation(x + px, CORE_Y + CORE_H / 2 - 0.005, z + pz));
  }));
  fuelMat = M.fuel(); pelletMat = M.pellet();
  addInstanced('pins', G.cyl(pinR, CORE_H - 0.04, 10), fuelMat, pinMats, { cast: false, recv: false });
  addInstanced('pins', new THREE.CylinderGeometry(pinR * 0.35, pinR, 0.03, 8), M.steelDark(), plugMats, { cast: false, recv: false });
  // duct load pads (two bands per duct) replace grid spacers in a wire-wrapped core
  if (DETAIL === 2) [0.42, -0.42].forEach((dy) => addInstanced('assemblies', G.cyl(rc + 0.004, 0.04, 6, rc + 0.004, true), M.steelDark(), asm.map(([x, z]) => new THREE.Matrix4().makeTranslation(x, CORE_Y + dy, z)), { cast: false, recv: false }));
  // cut-open display pin at the core center: half cladding, pellet stack, plenum spring
  const cutPin = new THREE.Group(); cutPin.position.set(0, CORE_Y, 0); cutPin.rotation.y = Math.PI * 0.75; part('pins').root.add(cutPin);
  add('pins', new THREE.CylinderGeometry(pinR, pinR, CORE_H - 0.04, 12, 1, true, 0, Math.PI), fuelMat, { parent: cutPin, cast: false, recv: false });
  const nPel = 26, pelH = ((CORE_H - 0.04) * 0.82) / nPel;
  addInstanced('pins', G.cyl(pinR * 0.8, pelH * 0.9, 12), pelletMat, Array.from({ length: nPel }, (_, i) => new THREE.Matrix4().makeTranslation(0, -(CORE_H - 0.04) / 2 + 0.02 + pelH * (i + 0.5), 0)), { parent: cutPin, cast: false, recv: false });
  for (let i = 0; i < 6; i++) add('pins', G.torus(pinR * 0.6, pinR * 0.12, 16, 8), M.steel(), { parent: cutPin, y: (CORE_H - 0.04) / 2 - 0.07 + i * 0.011, rx: Math.PI / 2, cast: false, recv: false });
  R.pins.focus = { center: new THREE.Vector3(0, CORE_Y, 0), radius: 0.42 };
  labelAt('pins', new THREE.Vector3(0.02, CORE_Y + 0.56, 0.02));

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
    if (DETAIL === 2) [-1.6, -2.1, -2.6, -3.1].forEach((y, k) => add('ihx', new THREE.CylinderGeometry(IHX_R - 0.012, IHX_R - 0.012, 0.012, 32, 1, false, k % 2 ? Math.PI : 0, Math.PI), M.steelDark(), { parent: g, y, cast: false }));
    [0.1, -0.1].forEach((dx) => { add('ihx', G.cyl(0.13, 0.05, 24), M.steelDark(), { parent: g, x: dx, y: -0.78, cast: false }); add('ihx', G.cyl(0.1, 0.2, 24), M.steel(), { parent: g, x: dx, y: -0.85, cast: false }); });
    if (i === 1) labelAt('ihx', new THREE.Vector3(0, -1.3, 0), g);
  });

  pumpAngles.forEach((deg, i) => {
    const a = THREE.MathUtils.degToRad(deg);
    const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
    const g = sub('pumps', dir.clone().multiplyScalar(part('pumps').def.radial).setY(5.5));
    g.position.set(dir.x * PUMP_RING, 0, dir.z * PUMP_RING);
    R.pumps.movers[R.pumps.movers.length - 1].base.copy(g.position);
    add('pumps', G.cyl(0.16, 1.6, 40), M.steel(), { parent: g, y: -3.2 });
    for (let k = 0; k < 6; k++) add('pumps', G.torus(0.175, 0.03, 48, 12), M.copper(), { parent: g, y: -3.75 + k * 0.22, rx: Math.PI / 2 });
    if (DETAIL === 2) for (let k = 0; k < 10; k++) add('pumps', G.torus(0.2, 0.006, 48, 6), M.steelDark(), { parent: g, y: -3.82 + k * 0.13, rx: Math.PI / 2, cast: false });
    add('pumps', G.cyl(0.2, 0.9, 40, 0.2, true), mat({ color: 0x6a7178, metalness: 0.85, roughness: 0.5, transparent: true, opacity: 0.35, depthWrite: false }), { parent: g, y: -3.2, cast: false });
    add('pumps', G.cyl(0.16, 0.16, 40, 0.23), M.steelDark(), { parent: g, y: -2.32 });
    add('pumps', G.box(0.22, 0.16, 0.22), M.steelPaint(0x3b434c), { parent: g, y: -2.18 });
    [-0.06, 0, 0.06].forEach((dz) => pipe('pumps', [[0.08, -2.2, dz], [0.08, -0.55, dz], [0.08, -0.55, dz], [0.08, 0.02, dz]], 0.018, M.rubber(), { parent: g }));
    pipe('pumps', [[0, -4.0, 0], [0, -4.75, 0], [-dir.x * 0.62, -5.0, -dir.z * 0.62]], 0.07, M.steel(), { parent: g });
    if (i === 0) labelAt('pumps', new THREE.Vector3(0, -2.25, 0), g);
  });

  add('head', G.cyl(1.45, 0.3, 96), M.steel(), { y: 0.15 });
  add('head', G.cyl(1.33, 0.5, 96), M.steelDark(), { y: -0.25 });
  add('head', G.cyl(0.9, 0.12, 96), M.steel(), { y: 0.36 });
  add('head', G.annulus(0.88, 0.92, 0.02), M.absorber(), { y: 0.42 });
  [90, 210, 330].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); add('head', G.cyl(0.09, 1.3, 24), M.steel(), { x: Math.cos(a) * 0.25, y: 1.07, z: Math.sin(a) * 0.25 }); add('head', G.cyl(0.13, 0.18, 24), M.steelDark(), { x: Math.cos(a) * 0.25, y: 1.78, z: Math.sin(a) * 0.25 }); });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; add('head', G.cyl(0.05, 0.7, 16), M.steelDark(), { x: Math.cos(a) * 0.72, y: 0.65, z: Math.sin(a) * 0.72 }); add('head', G.box(0.14, 0.12, 0.14), M.steelPaint(0x3b434c), { x: Math.cos(a) * 0.72, y: 1.05, z: Math.sin(a) * 0.72, ry: -a }); }
  add('head', G.torus(1.2, 0.04, 96, 10), M.steelPaint(0x6a7480), { y: 0.34, rx: Math.PI / 2 });
  // flange bolts, lifting lugs, penetration seals, radial cable tray to the silo edge
  addInstanced('head', G.cyl(0.035, 0.05, 6), M.steelDark(), Array.from({ length: 36 }, (_, k) => { const a = (k / 36) * Math.PI * 2; return new THREE.Matrix4().makeTranslation(Math.cos(a) * 1.38, 0.325, Math.sin(a) * 1.38); }), { cast: false });
  [45, 135, 225, 315].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); add('head', G.box(0.06, 0.3, 0.14), M.steelDark(), { x: Math.cos(a) * 1.3, y: 0.45, z: Math.sin(a) * 1.3, ry: -a }); });
  [90, 210, 330].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); add('head', G.torus(0.11, 0.018, 32, 8), M.steelDark(), { x: Math.cos(a) * 0.25, y: 0.43, z: Math.sin(a) * 0.25, rx: Math.PI / 2, cast: false }); });
  for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2; add('head', G.torus(0.065, 0.014, 24, 8), M.steelDark(), { x: Math.cos(a) * 0.72, y: 0.31, z: Math.sin(a) * 0.72, rx: Math.PI / 2, cast: false }); }
  { const a = THREE.MathUtils.degToRad(200); add('head', G.box(1.9, 0.06, 0.26), M.steelPaint(0x6a7480), { x: Math.cos(a) * 2.15, y: 0.36, z: Math.sin(a) * 2.15, ry: -a, cast: false }); }
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
  { const fm = []; for (let x = 14.6; x <= 18.4; x += 0.19) fm.push(new THREE.Matrix4().makeTranslation(x, 1.9, 0)); addInstanced('cooler', G.box(0.02, 1.02, 4.92), M.steelPaint(0x6b737b), fm, { cast: false }); }
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

// ------------------------------------------------------------------ shared builders: transformer, fan unit
function transformerUnit(id, x, z, k = 1, parent) {
  const tank = M.steelPaint(0x6b7f6e);
  add(id, G.box(2.0 * k, 2.2 * k, 1.6 * k), tank, { x, y: 1.1 * k, z, parent });
  for (let i = 0; i < 9; i++) add(id, G.box(0.6 * k, 1.8 * k, 0.05), tank, { x: x + 1.3 * k, y: 1.15 * k, z: z - 0.75 * k + i * 0.19 * k, cast: false, parent });
  add(id, G.cyl(0.3 * k, 1.9 * k, 24), tank, { x, y: 2.75 * k, z, rz: Math.PI / 2, parent });
  [-0.55, 0, 0.55].forEach((dz) => { for (let j = 0; j < 7; j++) add(id, G.cyl((0.09 + (j % 2) * 0.05) * k, 0.1 * k, 16), M.ceramic(0xb9b4a8), { x, y: (2.45 + j * 0.11) * k, z: z + dz * k, cast: false, parent }); add(id, G.cyl(0.035 * k, 0.3 * k, 8), M.steelDark(), { x, y: 3.35 * k, z: z + dz * k, cast: false, parent }); });
  add(id, G.box(2.3 * k, 0.2, 1.9 * k), M.concrete(0x8a857c), { x, y: 0.1, z, parent });
}
function fanUnit(id, x, y, z, r = 0.6, parent) {
  add(id, G.cyl(r, r * 0.8, 40, r, true), M.steelPaint(0x5a636c), { x, y: y - r * 0.1, z, parent });
  const hub = new THREE.Group(); hub.position.set(x, y, z); (parent || part(id).root).add(hub);
  for (let k = 0; k < 5; k++) { const w = new THREE.Group(); w.rotation.y = (k / 5) * Math.PI * 2; hub.add(w); add(id, G.box(r * 0.82, 0.03, r * 0.24), M.steelPaint(0xd8dde2), { parent: w, x: r * 0.5, rx: 0.55, cast: false }); }
  add(id, G.cyl(r * 0.15, 0.16, 16), M.steelDark(), { parent: hub });
  add(id, G.box(r * 2.1, 0.03, 0.05), M.steelDark(), { x, y: y + r * 0.38, z, cast: false, parent });
  add(id, G.box(0.05, 0.03, r * 2.1), M.steelDark(), { x, y: y + r * 0.38, z, cast: false, parent });
  fans.push(hub);
}

// ------------------------------------------------------------------ parts: site context (crane, HVAC, stairs, switchyard, truck, fence, people)
(function buildSiteContext() {
  const frame = M.steelPaint(0x4f5a66), galv = M.steelPaint(0xa7aeb4), safety = M.skidYellow();
  const X0 = -6.5, X1 = 12.5, Z = 6, H = BH;

  // Bridge crane (world): rails on the frame, girder, trolley, hoist, hook over the silo
  const rail = M.steelPaint(0x6a7480);
  [-Z + 0.3, Z - 0.3].forEach((z) => { add('crane', G.box(X1 - X0, 0.18, 0.18), rail, { x: (X0 + X1) / 2, y: H - 0.7, z }); for (let x = X0; x <= X1; x += 3.8) add('crane', G.box(0.3, 0.6, 0.3), frame, { x, y: H - 1.1, z: z + Math.sign(z) * 0.1 }); });
  const cx = -1.4;
  add('crane', G.box(0.5, 0.7, 2 * Z - 0.4), safety, { x: cx, y: H - 0.25 });
  [-Z + 0.3, Z - 0.3].forEach((z) => add('crane', G.box(1.6, 0.4, 0.5), M.steelPaint(0x3b434c), { x: cx, y: H - 0.55, z }));
  add('crane', G.box(1.3, 0.8, 1.1), M.steelPaint(0x3b434c), { x: cx, y: H + 0.5, z: 0.8 });
  add('crane', G.cyl(0.25, 0.9, 24), M.steelDark(), { x: cx, y: H + 0.5, z: 0.8, rz: Math.PI / 2 });
  add('crane', G.cyl(0.015, 2.6, 8), M.steelDark(), { x: cx, y: H - 1.9, z: 0.8, cast: false });
  add('crane', G.box(0.3, 0.5, 0.2), M.steelDark(), { x: cx, y: H - 3.35, z: 0.8 });
  add('crane', G.torus(0.14, 0.035, 32, 10), M.steelDark(), { x: cx, y: H - 3.75, z: 0.8, ry: Math.PI / 2 });
  labelAt('crane', new THREE.Vector3(cx, H + 1.1, 0.8));
  R.crane.focus = { center: new THREE.Vector3(cx, H - 1.2, 0.8), radius: 7.5 };

  // Roof HVAC units (building)
  [-3.2, 3.2].forEach((z) => { add('building', G.box(2.0, 1.3, 1.6), galv, { x: 6.5, y: H + 0.72 + 0.65, z }); add('building', G.cyl(0.5, 0.06, 32), M.steelDark(), { x: 6.5, y: H + 0.72 + 1.33, z, cast: false }); add('building', G.box(0.4, 0.4, 1.2), M.steelDark(), { x: 5.3, y: H + 0.72 + 0.3, z }); });

  // Stair tower + top platform on the -z side of the silo (module-local, attached to the -x silo half).
  // Built along local z inside a group rotated -90°, so local (x, y, z) maps to world (-z, y, x).
  const half = R.shield.movers[1].obj;
  const st = new THREE.Group(); st.rotation.y = -Math.PI / 2; half.add(st);
  function flight(parent, x, z0, z1, y0, y1, w) {
    const len = Math.hypot(z1 - z0, y1 - y0), ang = Math.atan2(y1 - y0, z1 - z0), zm = (z0 + z1) / 2, ym = (y0 + y1) / 2;
    [-w / 2, w / 2].forEach((dx) => add('shield', G.box(0.08, 0.26, len), galv, { parent, x: x + dx, y: ym, z: zm, rx: -ang }));
    const n = 14, mats = [];
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n; mats.push(new THREE.Matrix4().makeTranslation(x, y0 + (y1 - y0) * t - 0.05, z0 + (z1 - z0) * t)); }
    addInstanced('shield', G.box(w - 0.1, 0.04, 0.28), M.steelPaint(0x8a949e), mats, { parent, cast: false });
    [-w / 2, w / 2].forEach((dx) => { add('shield', G.cyl(0.02, len, 8), galv, { parent, x: x + dx, y: ym + 1.0, z: zm, rx: Math.PI / 2 - ang, cast: false }); for (let i = 0; i <= 3; i++) { const t = i / 3; add('shield', G.cyl(0.018, 1.0, 8), galv, { parent, x: x + dx, y: y0 + (y1 - y0) * t + 0.5, z: z0 + (z1 - z0) * t, cast: false }); } });
  }
  flight(st, -4.1, 2.6, -2.4, -6.2, -3.15, 0.9);
  add('shield', G.box(1.8, 0.06, 1.0), M.steelPaint(0x8a949e), { parent: st, x: -4.55, y: -3.15, z: -2.9 });
  flight(st, -5.0, -2.4, 2.6, -3.15, -0.1, 0.9);
  add('shield', G.box(1.9, 0.06, 1.1), M.steelPaint(0x8a949e), { parent: st, x: -4.05, y: -0.1, z: 3.1 });
  [[-4.95, 2.6], [-4.95, 3.6], [-3.2, 3.6]].forEach(([x, z]) => add('shield', G.cyl(0.02, 1.0, 8), galv, { parent: st, x, y: 0.4, z, cast: false }));
  add('shield', G.cyl(0.02, 1.05, 8), galv, { parent: st, x: -4.95, y: 0.9, z: 3.1, rx: Math.PI / 2, cast: false });
  add('shield', G.cyl(0.02, 1.75, 8), galv, { parent: st, x: -4.05, y: 0.9, z: 3.6, rz: Math.PI / 2, cast: false });
  [[-4.95, -3.3], [-4.95, 3.6], [-3.3, 3.6]].forEach(([x, z]) => add('shield', G.box(0.12, 6.1, 0.12), galv, { parent: st, x, y: -6.2 + 3.05, z }));

  // Switchyard (world, -z side of the building): pad, transformer, switchgear, conduit from the generator
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.5), new THREE.MeshPhysicalMaterial({ color: 0x7c7973, roughness: 0.95, map: tiled(texConcrete, 4, 3), bumpMap: tiled(texConcreteBump, 4, 3), bumpScale: 0.02 }));
  yard.rotation.x = -Math.PI / 2; yard.position.set(11.0, 0.004, -10.8); yard.receiveShadow = true; scene.add(yard);
  transformerUnit('switchyard', 9.8, -10.8, 1.0);
  for (let i = 0; i < 3; i++) add('switchyard', G.box(1.0, 2.2, 1.2), M.steelPaint(0x8d969e), { x: 12.8, y: 1.1, z: -9.3 - i * 1.3 });
  for (let i = 0; i < 3; i++) add('switchyard', G.box(0.8, 0.6, 0.02), M.steelPaint(0x30363c), { x: 12.8, y: 1.6, z: -9.3 - i * 1.3 + 0.61, cast: false });
  pipe('switchyard', [[11.2, 0.35, -0.9], [11.2, 0.35, -6.6], [11.2, 0.35, -9.3], [11.2, 1.2, -9.3]], 0.08, M.steelPaint(0x5a6470));
  pipe('switchyard', [[12.3, 1.2, -9.3], [11.6, 1.6, -9.9], [10.9, 2.3, -10.8]], 0.05, M.rubber());
  labelAt('switchyard', new THREE.Vector3(9.8, 3.9, -10.8));
  R.switchyard.focus = { center: new THREE.Vector3(11.2, 1.4, -10.8), radius: 3.6 };

  // Delivery truck (world) on the site road
  const paint = M.steelPaint(0x9b2f2f), chassis = M.steelPaint(0x30363c), tire = M.rubber();
  const TZ = 16, ty = 0.5;
  add('truck', G.box(2.2, 1.3, 2.3), paint, { x: 20.6, y: ty + 1.05, z: TZ });                       // hood
  add('truck', G.box(2.4, 2.5, 2.5), paint, { x: 22.9, y: ty + 1.65, z: TZ });                       // cab
  add('truck', G.box(2.3, 0.9, 2.45), mat({ color: 0x1a2430, metalness: 0.4, roughness: 0.15 }), { x: 22.9, y: ty + 2.2, z: TZ, cast: false }); // glazing band
  add('truck', G.box(0.16, 0.5, 2.0), M.steelDark(), { x: 19.5, y: ty + 0.55, z: TZ });               // bumper
  add('truck', G.box(5.6, 0.35, 1.0), chassis, { x: 22.6, y: ty + 0.25, z: TZ });
  add('truck', G.box(1.6, 0.25, 1.6), chassis, { x: 24.6, y: ty + 0.55, z: TZ });                     // fifth wheel
  [-0.12, 0.12].forEach((dz) => add('truck', G.cyl(0.1, 2.6, 12), M.steel(), { x: 22.1, y: ty + 1.7, z: TZ + 1.25 * Math.sign(dz) * 1.0, cast: false })); // stacks
  add('truck', G.box(9.6, 0.3, 2.6), chassis, { x: 30.4, y: ty + 0.55, z: TZ });                      // lowboy deck
  add('truck', G.box(1.2, 0.5, 2.6), chassis, { x: 25.4, y: ty + 0.9, z: TZ });                        // gooseneck
  [[21.0], [23.6], [25.0], [32.2], [33.4], [34.6]].forEach(([x]) => [-1.15, 1.15].forEach((dz) => add('truck', G.cyl(0.52, 0.42, 24), tire, { x, y: 0.52, z: TZ + dz, rx: Math.PI / 2 })));
  // wrapped module on the deck, lying on two saddles with straps
  const wrap = mat({ color: 0xe8ebee, metalness: 0.05, roughness: 0.45, bumpMap: texConcreteBump, bumpScale: 0.004 });
  add('truck', G.cyl(1.45, 5.4, 48), wrap, { x: 30.4, y: ty + 0.7 + 1.5, z: TZ, rz: Math.PI / 2 });
  [28.0, 32.8].forEach((x) => { add('truck', G.box(0.4, 0.9, 2.5), safety, { x, y: ty + 0.7 + 0.45, z: TZ }); add('truck', G.torus(1.5, 0.03, 48, 8), M.rubber(), { x, y: ty + 0.7 + 1.5, z: TZ, ry: Math.PI / 2, cast: false }); });
  add('truck', G.box(1.6, 0.3, 1.2), safety, { x: 30.4, y: ty + 0.85, z: TZ - 2.0 });
  labelAt('truck', new THREE.Vector3(27.5, ty + 3.5, TZ));

  // People for scale (scenery)
  function person(x, z, ry, y = 0) {
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = ry; scene.add(g);
    const legs = M.denim(), vest = M.hivis(), skin = M.skin(), hat = M.ceramic(0xf2e9c8);
    [-0.1, 0.1].forEach((dx) => scenery(G.cyl(0.085, 0.84, 10), legs, { parent: g, x: dx, y: 0.42 }));
    scenery(G.box(0.42, 0.62, 0.24), vest, { parent: g, y: 1.15 });
    [-0.26, 0.26].forEach((dx) => scenery(G.cyl(0.055, 0.6, 8), skin, { parent: g, x: dx, y: 1.12, rz: dx > 0 ? -0.15 : 0.15 }));
    scenery(G.sphere(0.11, 16), skin, { parent: g, y: 1.6 });
    scenery(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat, { parent: g, y: 1.6 });
    scenery(G.cyl(0.16, 0.02, 16), hat, { parent: g, y: 1.6 });
    return g;
  }
  person(3.3, -5.1, 2.4); person(8.2, -2.9, -2.2); person(26.8, 13.1, 2.6); person(-3.0, -4.3, 0.4, MOD_Y - 0.1 + 0.03); person(46.5, -47.5, -1.2); person(13.6, -34.2, 0.9); person(2.0, -43.0, 0.2);
})();

// ------------------------------------------------------------------ parts: grid connection and data center campus (world coords)
const elecPath = [];
(function buildCampus() {
  const galv = M.steelPaint(0xa7aeb4), dark = M.steelPaint(0x30363c), panel = mat({ color: 0xb6bbc0, metalness: 0.5, roughness: 0.5, bumpMap: tiled(texPanel, 10, 3), bumpScale: 0.015 });
  const ghost = M.panelGhost();

  // --- Transmission line: three steel monopoles with crossarms, sagging conductors, campus gantry
  const PX = 12.6, poles = [-14, -21.5, -29];
  const attach = []; // [x, y, z] per phase per structure
  poles.forEach((pz, i) => {
    add('txline', G.cyl(0.26, 15, 16, 0.14), galv, { x: PX, y: 7.5, z: pz });
    add('txline', G.box(3.4, 0.22, 0.22), galv, { x: PX, y: 14.2, z: pz });
    add('txline', G.cyl(0.5, 0.3, 24), M.concrete(0x8a857c), { x: PX, y: 0.15, z: pz });
    const ph = [];
    { const im = []; [-1.4, 0, 1.4].forEach((dx) => { for (let j = 0; j < 5; j++) im.push(new THREE.Matrix4().makeTranslation(PX + dx, 14.0 - j * 0.09, pz)); ph.push([PX + dx, 13.55, pz]); }); addInstanced('txline', G.cyl(0.11, 0.07, 12), M.ceramic(0x8f8a84), im, { cast: false }); }
    attach.push(ph);
    if (i === 1) labelAt('txline', new THREE.Vector3(PX, 15.4, pz));
  });
  // gantry at the campus substation
  const GZ = -33;
  [PX - 2.2, PX + 2.2].forEach((x) => add('txline', G.box(0.3, 9, 0.3), galv, { x, y: 4.5, z: GZ }));
  add('txline', G.box(5.0, 0.3, 0.3), galv, { x: PX, y: 9.0, z: GZ });
  const gph = [];
  { const im = []; [-1.4, 0, 1.4].forEach((dx) => { for (let j = 0; j < 5; j++) im.push(new THREE.Matrix4().makeTranslation(PX + dx, 8.75 - j * 0.09, GZ)); gph.push([PX + dx, 8.3, GZ]); }); addInstanced('txline', G.cyl(0.11, 0.07, 12), M.ceramic(0x8f8a84), im, { cast: false }); }
  attach.push(gph);
  // jumpers from the switchyard transformer bushings to pole 1
  const bush = [[9.8, 3.6, -10.8 - 0.55], [9.8, 3.6, -10.8], [9.8, 3.6, -10.8 + 0.55]];
  attach.unshift(bush);
  const wire = mat({ color: 0x33363a, metalness: 0.8, roughness: 0.5 }); wire.clippingPlanes = null;
  function sagWire(a, b, sag) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), mid = A.clone().add(B).multiplyScalar(0.5); mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(A, mid, B);
    add('txline', new THREE.TubeGeometry(curve, 16, 0.028, 6, false), wire, { cast: false });
    return curve;
  }
  for (let k = 0; k < attach.length - 1; k++) for (let ph = 0; ph < 3; ph++) sagWire(attach[k][ph], attach[k + 1][ph], k === 0 ? 0.3 : 0.55);
  R.txline.focus = { center: new THREE.Vector3(PX, 9, -23), radius: 12 };

  // --- Campus substation: pad, two transformers, switch house, bus bars, fence
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshPhysicalMaterial({ color: 0x7c7973, roughness: 0.95, map: tiled(texConcrete, 6, 4), bumpMap: tiled(texConcreteBump, 6, 4), bumpScale: 0.02 }));
  sub.rotation.x = -Math.PI / 2; sub.position.set(PX, 0.004, -37.5); sub.receiveShadow = true; scene.add(sub);
  transformerUnit('dcsub', PX - 2.6, -36.8, 1.15);
  transformerUnit('dcsub', PX + 2.6, -36.8, 1.15);
  // drop leads from the gantry to each transformer
  [[PX - 2.6, -36.8], [PX + 2.6, -36.8]].forEach(([tx, tz]) => [-0.63, 0, 0.63].forEach((dz, i) => sagWire([PX + (i - 1) * 1.4, 8.3, GZ], [tx, 4.1, tz + dz], 0.2)));
  add('dcsub', G.box(4.6, 3.2, 3.0), panel, { x: PX, y: 1.6, z: -40.6 });
  add('dcsub', G.box(4.8, 0.2, 3.2), dark, { x: PX, y: 3.3, z: -40.6, cast: false });
  add('dcsub', G.box(0.9, 2.1, 0.08), dark, { x: PX - 1.2, y: 1.05, z: -39.06, cast: false });
  add('dcsub', G.box(0.9, 2.1, 0.08), dark, { x: PX + 1.2, y: 1.05, z: -39.06, cast: false });
  pipe('dcsub', [[PX - 2.6, 0.3, -37.9], [PX - 2.6, 0.3, -39.0]], 0.1, M.steelPaint(0x5a6470));
  pipe('dcsub', [[PX + 2.6, 0.3, -37.9], [PX + 2.6, 0.3, -39.0]], 0.1, M.steelPaint(0x5a6470));
  // yard fence posts
  for (let x = PX - 6; x <= PX + 6; x += 2) [-33.5, -42].forEach((z) => add('dcsub', G.cyl(0.03, 2.2, 6), galv, { x, y: 1.1, z, cast: false }));
  labelAt('dcsub', new THREE.Vector3(PX, 4.6, -36.8));
  R.dcsub.focus = { center: new THREE.Vector3(PX, 2, -38), radius: 7 };

  // --- Data hall: walls, ghost roof, parapet, loading dock, office annex, wall packs
  const HX0 = -4, HX1 = 44, HZ0 = -66, HZ1 = -44, HH = 9;
  const hx = (HX0 + HX1) / 2, hz = (HZ0 + HZ1) / 2;
  add('dchall', G.box(HX1 - HX0, HH, 0.3), panel, { x: hx, y: HH / 2, z: HZ1 });
  add('dchall', G.box(HX1 - HX0, HH, 0.3), panel, { x: hx, y: HH / 2, z: HZ0 });
  add('dchall', G.box(0.3, HH, HZ1 - HZ0), panel, { x: HX0, y: HH / 2, z: hz });
  add('dchall', G.box(0.3, HH, HZ1 - HZ0), panel, { x: HX1, y: HH / 2, z: hz });
  // dark base band and roof parapet
  add('dchall', G.box(HX1 - HX0 + 0.4, 1.2, HZ1 - HZ0 + 0.4), dark, { x: hx, y: 0.6, z: hz, cast: false });
  add('dchall', G.box(HX1 - HX0 + 0.5, 0.5, 0.4), dark, { x: hx, y: HH + 0.25, z: HZ1 + 0.05, cast: false });
  add('dchall', G.box(HX1 - HX0 + 0.5, 0.5, 0.4), dark, { x: hx, y: HH + 0.25, z: HZ0 - 0.05, cast: false });
  add('dchall', G.box(0.4, 0.5, HZ1 - HZ0), dark, { x: HX0 - 0.05, y: HH + 0.25, z: hz, cast: false });
  add('dchall', G.box(0.4, 0.5, HZ1 - HZ0), dark, { x: HX1 + 0.05, y: HH + 0.25, z: hz, cast: false });
  dcRoof.push(add('dchall', G.box(HX1 - HX0, 0.15, HZ1 - HZ0), ghost, { x: hx, y: HH, z: hz, cast: false }));
  // interior floor (dark epoxy) and ceiling light strips
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX1 - HX0 - 0.3, HZ1 - HZ0 - 0.3), new THREE.MeshPhysicalMaterial({ color: 0x3a3d42, roughness: 0.35, metalness: 0.1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(hx, 0.02, hz); floor.receiveShadow = true; scene.add(floor);
  { const lm = new THREE.MeshBasicMaterial({ color: 0xfff1d6 }); const mats = []; for (let i = 0; i < 9; i++) for (let j = 0; j < 7; j++) mats.push(new THREE.Matrix4().makeTranslation(HX0 + 4 + i * 5, HH - 0.6, HZ1 - 2 - j * 3)); const im = new THREE.InstancedMesh(G.box(3.2, 0.06, 0.18), lm, mats.length); mats.forEach((m, i) => im.setMatrixAt(i, m)); scene.add(im); }
  // loading dock at the -x end, office annex at the +x end
  add('dchall', G.box(3.0, 1.2, 10), M.concrete(0x8a857c), { x: HX0 - 1.5, y: 0.6, z: hz });
  [-2.2, 2.2].forEach((dz) => add('dchall', G.box(0.12, 3.6, 3.2), M.steelPaint(0x6a7480), { x: HX0 - 0.16, y: 3.0, z: hz + dz, cast: false }));
  add('dchall', G.box(3.6, 0.2, 11), dark, { x: HX0 - 1.8, y: 4.9, z: hz, cast: false });
  add('dchall', G.box(8, 7, 12), panel, { x: HX1 + 4, y: 3.5, z: hz + 3 });
  add('dchall', G.box(8.1, 1.4, 12.1), mat({ color: 0x0d1a26, metalness: 0.3, roughness: 0.15 }), { x: HX1 + 4, y: 2.2, z: hz + 3, cast: false });
  add('dchall', G.box(8.1, 1.4, 12.1), mat({ color: 0x0d1a26, metalness: 0.3, roughness: 0.15 }), { x: HX1 + 4, y: 5.0, z: hz + 3, cast: false });
  add('dchall', G.box(4.5, 0.2, 3.0), dark, { x: HX1 + 10.2, y: 3.4, z: hz + 6, cast: false });
  [[HX1 + 8.4, hz + 4.7], [HX1 + 12.2, hz + 4.7], [HX1 + 8.4, hz + 7.3], [HX1 + 12.2, hz + 7.3]].forEach(([x, z]) => add('dchall', G.cyl(0.08, 3.4, 10), galv, { x, y: 1.7, z, cast: false }));
  // wall packs (emissive) along the long walls
  { const wm = new THREE.MeshBasicMaterial({ color: 0xffe2b0 }); for (let x = HX0 + 6; x < HX1; x += 12) [HZ1 + 0.3, HZ0 - 0.3].forEach((z) => scenery(G.box(0.4, 0.25, 0.25), wm, { x, y: 6.5, z, cast: false })); }
  labelAt('dchall', new THREE.Vector3(hx, HH + 1.6, hz));
  R.dchall.focus = { center: new THREE.Vector3(hx, 4, hz), radius: 28 };

  // --- Server racks: 8 rows × 40 racks in 4 hot-aisle pairs, LED fronts, containment, busway
  const rackMat = mat({ color: 0x24272b, metalness: 0.6, roughness: 0.55 }); rackMat.clippingPlanes = null;
  const rackMats = [], ledMats = [];
  const pairs = [-48.5, -53.5, -58.5, -63.5], RX0 = HX0 + 6, NR = 40, RP = 0.7;
  pairs.forEach((zk) => {
    [[-1.2, -1], [1.2, 1]].forEach(([dz, face]) => {
      for (let i = 0; i < NR; i++) {
        const x = RX0 + i * RP, z = zk + dz;
        rackMats.push(new THREE.Matrix4().makeTranslation(x, 1.1, z));
        ledMats.push(new THREE.Matrix4().makeTranslation(x, 1.15, z + face * 0.61));
      }
    });
    // hot-aisle containment roof and end doors
    add('racks', G.box(NR * RP + 0.6, 0.08, 1.3), ghost, { x: RX0 + (NR - 1) * RP / 2, y: 2.3, z: zk, cast: false });
    [RX0 - 0.7, RX0 + (NR - 1) * RP + 0.7].forEach((x) => add('racks', G.box(0.08, 2.3, 1.3), ghost, { x, y: 1.15, z: zk, cast: false }));
    // overhead busway (A and B) and cable tray
    [-1.2, 1.2].forEach((dz) => add('ups', G.box(NR * RP + 2, 0.16, 0.26), M.steelPaint(0x8d969e), { x: RX0 + (NR - 1) * RP / 2 + 1, y: 3.1, z: zk + dz, cast: false }));
    add('ups', G.box(NR * RP + 2, 0.05, 0.45), galv, { x: RX0 + (NR - 1) * RP / 2 + 1, y: 3.5, z: zk, cast: false });
  });
  addInstanced('racks', G.box(0.6, 2.2, 1.2), rackMat, rackMats, { cast: DETAIL === 2, recv: true });
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const leds = new THREE.InstancedMesh(G.box(0.46, 1.85, 0.02), ledMat, ledMats.length);
  const palette = [new THREE.Color(0x3fa4ff), new THREE.Color(0x4fe0a8), new THREE.Color(0x9fd4ff), new THREE.Color(0x2a6cff), new THREE.Color(0xffc24a), new THREE.Color(0x163a66)];
  ledMats.forEach((m, i) => { leds.setMatrixAt(i, m); leds.setColorAt(i, palette[(i * 7) % palette.length]); });
  leds.instanceColor.needsUpdate = true; leds.userData.part = 'racks'; part('racks').root.add(leds); ledStrips.push({ im: leds, palette });
  labelAt('racks', new THREE.Vector3(RX0 + 12, 2.7, -53.5));
  R.racks.focus = { center: new THREE.Vector3(RX0 + (NR - 1) * RP / 2, 1.5, -56), radius: 16 };

  // --- UPS & electrical room at the +x end of the hall
  add('ups', G.box(0.15, HH - 0.2, HZ1 - HZ0 - 0.4), ghost, { x: HX1 - 6.5, y: HH / 2, z: hz, cast: false });
  { const um = M.steelPaint(0xc9ced3), fm = M.steelPaint(0x30363c), mats = [], fmats = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const x = HX1 - 4.8 + r * 2.6, z = HZ1 - 3 - i * 1.1; mats.push(new THREE.Matrix4().makeTranslation(x, 1.05, z)); fmats.push(new THREE.Matrix4().makeTranslation(x - 0.46, 1.1, z)); }
    addInstanced('ups', G.box(0.9, 2.1, 1.0), um, mats, { cast: false });
    addInstanced('ups', G.box(0.02, 1.7, 0.8), fm, fmats, { cast: false, recv: false });
    for (let i = 0; i < 6; i++) add('ups', G.box(0.9, 2.3, 1.1), M.steelPaint(0x8d969e), { x: HX1 - 0.9, y: 1.15, z: HZ0 + 2 + i * 1.3, cast: false });
  }
  labelAt('ups', new THREE.Vector3(HX1 - 3.5, 3.3, HZ1 - 6));
  R.ups.focus = { center: new THREE.Vector3(HX1 - 3.3, 1.5, hz), radius: 9 };

  // --- Battery storage: three containers with HVAC and a PCS cabinet
  const bm = mat({ color: 0xe6e9ec, metalness: 0.4, roughness: 0.5, bumpMap: tiled(texPanel, 12, 2), bumpScale: 0.012 });
  [-34.6, -37.9, -41.2].forEach((z, i) => {
    add('bess', G.box(12.2, 2.9, 2.5), bm, { x: 6, y: 1.55, z });
    add('bess', G.box(12.3, 0.1, 2.6), dark, { x: 6, y: 0.1, z, cast: false });
    for (let k = 0; k < 4; k++) add('bess', G.box(0.9, 1.6, 0.3), M.steelPaint(0x8d969e), { x: 1.6 + k * 3.0, y: 1.6, z: z + 1.4, cast: false });
    for (let k = 0; k < 4; k++) add('bess', G.box(0.7, 0.7, 0.03), dark, { x: 1.6 + k * 3.0, y: 2.0, z: z + 1.56, cast: false });
    add('bess', G.box(1.0, 2.2, 1.1), M.steelPaint(0x8d969e), { x: 12.9, y: 1.1, z });
    if (i === 1) labelAt('bess', new THREE.Vector3(6, 3.5, z));
  });
  pipe('bess', [[13.4, 0.3, -37.9], [15.5, 0.3, -37.9], [15.5, 0.3, -38.6]], 0.08, M.steelPaint(0x5a6470));
  R.bess.focus = { center: new THREE.Vector3(6.5, 1.5, -37.9), radius: 8 };

  // --- Backup generators: two enclosures with stacks and louvers, shared fuel tank
  const gm = M.steelPaint(0x7d8891);
  [18.5, 28.5].forEach((x, i) => {
    add('gens', G.box(8, 3.2, 3.2), gm, { x: x + 4, y: 1.7, z: -37.5 });
    add('gens', G.box(8.2, 0.12, 3.4), dark, { x: x + 4, y: 0.1, z: -37.5, cast: false });
    add('gens', G.cyl(0.28, 2.6, 20), dark, { x: x + 1.2, y: 4.6, z: -37.5 });
    add('gens', G.cyl(0.42, 0.3, 20), dark, { x: x + 1.2, y: 5.95, z: -37.5, cast: false });
    for (let k = 0; k < 6; k++) { add('gens', G.box(1.0, 1.6, 0.04), M.steelPaint(0x3b434c), { x: x + 1.0 + k * 1.2, y: 1.7, z: -35.88, cast: false }); add('gens', G.box(1.0, 1.6, 0.04), M.steelPaint(0x3b434c), { x: x + 1.0 + k * 1.2, y: 1.7, z: -39.12, cast: false }); }
    add('gens', G.box(1.4, 1.6, 0.06), M.steelPaint(0x3b434c), { x: x + 8.03, y: 1.6, z: -37.5, cast: false });
    if (i === 0) labelAt('gens', new THREE.Vector3(x + 4, 4.1, -37.5));
  });
  add('gens', G.cyl(1.25, 8.0, 40), M.steelPaint(0xc9ced3), { x: 27, y: 1.6, z: -42.0, rz: Math.PI / 2 });
  [24.0, 30.0].forEach((x) => add('gens', G.box(0.5, 1.0, 2.8), M.concrete(0x8a857c), { x, y: 0.5, z: -42.0 }));
  pipe('gens', [[27, 2.9, -42.0], [27, 3.4, -42.0], [27, 3.4, -39.4], [27, 1.5, -39.4]], 0.07, M.steelPaint(0x5a6470));
  R.gens.focus = { center: new THREE.Vector3(27, 2, -39), radius: 11 };

  // --- Cooling plant: rooftop dry coolers with spinning fans, roof headers, CRAH units inside
  for (let i = 0; i < 6; i++) {
    const x = HX0 + 6 + i * 7.2, y = HH + 0.15;
    add('dccool', G.box(4.2, 1.4, 2.4), galv, { x, y: y + 0.7, z: hz });
    add('dccool', G.box(4.3, 0.9, 2.5), M.steelPaint(0x3a4047), { x, y: y + 1.1, z: hz, cast: false });
    { const fm = []; for (let xx = -1.9; xx <= 1.9; xx += 0.2) fm.push(new THREE.Matrix4().makeTranslation(x + xx, y + 1.1, hz)); addInstanced('dccool', G.box(0.02, 0.9, 2.52), M.steelPaint(0x6b737b), fm, { cast: false }); }
    [-1.05, 1.05].forEach((dx) => fanUnit('dccool', x + dx, y + 1.75, hz, 0.85));
  }
  [hz - 2.2, hz + 2.2].forEach((z) => add('dccool', G.cyl(0.18, HX1 - HX0 - 10, 20), M.insul(), { x: hx, y: HH + 0.6, z, rz: Math.PI / 2, cast: false }));
  pipe('dccool', [[HX0 + 2, HH + 0.6, hz - 2.2], [HX0 + 2, 3.9, hz - 2.2], [HX0 + 1.0, 3.9, hz - 2.2]], 0.18, M.insul());
  pipe('dccool', [[HX0 + 2, HH + 0.6, hz + 2.2], [HX0 + 2, 3.9, hz + 2.2], [HX0 + 1.0, 3.9, hz + 2.2]], 0.18, M.insul());
  for (let i = 0; i < 6; i++) { add('dccool', G.box(1.1, 2.5, 1.4), M.steelPaint(0xc9ced3), { x: HX0 + 1.0, y: 1.25, z: HZ1 - 2.5 - i * 3.6 }); add('dccool', G.box(0.03, 1.5, 1.0), dark, { x: HX0 + 1.56, y: 1.4, z: HZ1 - 2.5 - i * 3.6, cast: false }); }
  labelAt('dccool', new THREE.Vector3(hx, HH + 3.4, hz));
  R.dccool.focus = { center: new THREE.Vector3(hx, HH + 1.5, hz), radius: 16 };

  // --- Parking, roads, light poles, trees (scenery)
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(16, 24), new THREE.MeshPhysicalMaterial({ color: 0x2b2d30, roughness: 1.0, map: tiled(texConcreteBump, 6, 9), bumpMap: tiled(texConcreteBump, 6, 9), bumpScale: 0.02 }));
  lot.rotation.x = -Math.PI / 2; lot.position.set(60, 0.005, -55); lot.receiveShadow = true; scene.add(lot);
  for (let i = 0; i < 8; i++) [54.5, 65.5].forEach((x) => scenery(new THREE.PlaneGeometry(4.6, 0.12), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.9 }), { x, y: 0.008, z: -45 - i * 2.8, rx: -Math.PI / 2, cast: false }));
  const spine = new THREE.Mesh(new THREE.PlaneGeometry(6, 62), new THREE.MeshPhysicalMaterial({ color: 0x2b2d30, roughness: 1.0, map: tiled(texConcreteBump, 2, 20), bumpMap: tiled(texConcreteBump, 2, 20), bumpScale: 0.02 }));
  spine.rotation.x = -Math.PI / 2; spine.position.set(62, 0.004, -12); spine.receiveShadow = true; scene.add(spine);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(70, 5.5), new THREE.MeshPhysicalMaterial({ color: 0x2b2d30, roughness: 1.0, map: tiled(texConcreteBump, 24, 2), bumpMap: tiled(texConcreteBump, 24, 2), bumpScale: 0.02 }));
  road.rotation.x = -Math.PI / 2; road.position.set(31, 0.005, 16); road.receiveShadow = true; scene.add(road);
  for (let x = -1; x < 66; x += 3) scenery(new THREE.PlaneGeometry(1.4, 0.14), new THREE.MeshStandardMaterial({ color: 0xd7c25a, roughness: 0.9 }), { x, y: 0.008, z: 16, rx: -Math.PI / 2, cast: false });
  // cars
  { const bodies = [], cabins = []; const cols = [0xc8c9cc, 0x1f2429, 0x8a1c1c, 0x2a4a7a, 0xe9e6dd, 0x3c3f44];
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35, clearcoat: 0.8 }), cabMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1a26, metalness: 0.3, roughness: 0.15 });
    const slots = []; for (let i = 0; i < 8; i++) { if (i % 3 !== 1) slots.push([54.5, -46.4 - i * 2.8]); if (i % 2 === 0) slots.push([65.5, -46.4 - i * 2.8]); }
    const bIM = new THREE.InstancedMesh(G.box(4.4, 0.75, 1.85), bodyMat, slots.length), cIM = new THREE.InstancedMesh(G.box(2.3, 0.62, 1.65), cabMat, slots.length);
    slots.forEach(([x, z], i) => { bIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.62, z)); bIM.setColorAt(i, new THREE.Color(cols[i % cols.length])); cIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x - 0.3, 1.28, z)); });
    bIM.castShadow = cIM.castShadow = true; scene.add(bIM); scene.add(cIM); }
  // light poles with warm heads and ground pools
  { const head = new THREE.MeshBasicMaterial({ color: 0xffe3b8 }); const poolTex = texShadowDisc;
    [[8, 20], [30, 20], [52, 20], [62, -2], [62, -30], [50, -46], [50, -64], [68, -55], [-10, -30], [-10, -60]].forEach(([x, z]) => {
      scenery(G.cyl(0.09, 9, 10, 0.06), galv, { x, y: 4.5, z });
      scenery(G.box(1.2, 0.14, 0.3), galv, { x: x + 0.5, y: 9.0, z, cast: false });
      scenery(G.box(0.6, 0.08, 0.26), head, { x: x + 0.9, y: 8.9, z, cast: false });
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, color: 0x6b4a1e, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x + 0.9, 0.012, z); scene.add(pool);
    }); }
  // trees
  { const trunk = new THREE.MeshStandardMaterial({ color: 0x3a2d22, roughness: 0.95 }), leaf = new THREE.MeshStandardMaterial({ color: 0x14261a, roughness: 1.0 });
    const spots = [];
    for (let x = -14; x <= 70; x += 6) { spots.push([x + (rnd() - 0.5) * 3, -72 + (rnd() - 0.5) * 4]); spots.push([x + (rnd() - 0.5) * 3, 25 + (rnd() - 0.5) * 4]); }
    for (let z = -70; z <= 22; z += 7) { spots.push([-20 + (rnd() - 0.5) * 4, z]); spots.push([74 + (rnd() - 0.5) * 4, z]); }
    [[-12, -20], [-11, -26], [-9, -52], [-12, -58], [70, -40], [71, -28], [40, 24], [22, 24]].forEach((p) => spots.push(p));
    const tIM = new THREE.InstancedMesh(G.cyl(0.18, 2.6, 7), trunk, spots.length), c1 = new THREE.InstancedMesh(new THREE.ConeGeometry(2.0, 3.6, 8), leaf, spots.length), c2 = new THREE.InstancedMesh(new THREE.ConeGeometry(1.4, 3.0, 8), leaf, spots.length);
    spots.forEach(([x, z], i) => { const k = 0.8 + rnd() * 0.7; const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, 1.3 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); tIM.setMatrixAt(i, m); m.compose(new THREE.Vector3(x, 4.0 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); c1.setMatrixAt(i, m); m.compose(new THREE.Vector3(x, 6.0 * k, z), new THREE.Quaternion(), new THREE.Vector3(k, k, k)); c2.setMatrixAt(i, m); });
    [tIM, c1, c2].forEach((im) => { im.castShadow = true; scene.add(im); }); }
  // perimeter fence with a gate at the road
  { const FX0 = -16, FX1 = 68, FZ0 = -70, FZ1 = 20;
    const postMat = M.steelPaint(0x9aa3ab), postMats = [];
    const segs = [[FX0, FZ0, FX1, FZ0], [FX0, FZ1, FX1, FZ1], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, 13.0], [FX1, 19.0, FX1, FZ1]];
    segs.forEach(([x0, z0, x1, z1]) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)); for (let i = 0; i <= n; i++) { const t = i / n; postMats.push(new THREE.Matrix4().makeTranslation(x0 + (x1 - x0) * t, 1.25, z0 + (z1 - z0) * t)); }
      scenery(G.box(len, 0.05, 0.05), postMat, { x: (x0 + x1) / 2, y: 2.45, z: (z0 + z1) / 2, ry: Math.atan2(-(z1 - z0), x1 - x0), cast: false });
      if (DETAIL === 2) scenery(new THREE.PlaneGeometry(len, 2.3), Object.assign(new THREE.MeshStandardMaterial({ map: tiled(texChainlink, len / 1.2, 2), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }), { userData: { keepDouble: true } }), { x: (x0 + x1) / 2, y: 1.3, z: (z0 + z1) / 2, ry: Math.atan2(-(z1 - z0), x1 - x0), cast: false });
    });
    const posts = new THREE.InstancedMesh(G.cyl(0.04, 2.5, 8), postMat, postMats.length); postMats.forEach((m, i) => posts.setMatrixAt(i, m)); posts.castShadow = true; scene.add(posts);
    [[FX1, 13.0], [FX1, 19.0]].forEach(([x, z]) => scenery(G.box(0.12, 2.6, 0.12), M.skidYellow(), { x, y: 1.3, z }));
    scenery(G.box(0.06, 1.8, 6.0), new THREE.MeshStandardMaterial({ color: 0xe3b32a, roughness: 0.8, transparent: true, opacity: 0.35, side: THREE.DoubleSide }), { x: FX1 - 0.6, y: 1.2, z: 16.0, ry: 0.35, cast: false }); }

  // --- Electricity path: generator → switchyard → line → substation → duct bank → UPS room → busway
  elecPath.push(
    [10.2, 1.6, 0.0, 0.05, 1], [11.2, 0.4, -0.9, 0.05, 1], [11.2, 0.4, -9.3, 0.05, 1], [9.8, 2.4, -10.8, 0.08, 1],
    [9.8, 3.7, -10.8, 0.05, 1], [PX, 13.7, -14, 0.08, 1], [PX, 13.4, -21.5, 0.08, 1], [PX, 13.7, -29, 0.08, 1], [PX, 8.4, GZ, 0.08, 1],
    [PX, 3.9, -36.8, 0.1, 1], [PX, 1.6, -40.6, 0.1, 1], [PX, -0.3, -42.5, 0.06, 1], [HX1 - 3.3, -0.3, -45.5, 0.06, 1],
    [HX1 - 3.3, 1.6, -47.5, 0.12, 1], [HX1 - 6.0, 3.1, -48.5, 0.08, 1], [RX0 + 2, 3.1, -48.5, 0.08, 1],
  );
})();

// ------------------------------------------------------------------ lights
const glow = new THREE.PointLight(0xff7a2a, 7, 7, 2);
glow.position.set(0, MOD_Y + CORE_Y + 0.8, 0); scene.add(glow);
// soft interior fill so the pool internals and the cut faces read well
const innerA = new THREE.PointLight(0xfff1e0, 2.6, 10, 2); innerA.position.set(0, MOD_Y - 1.2, 0); scene.add(innerA);
const innerB = new THREE.PointLight(0xdfe9ff, 1.2, 8, 2); innerB.position.set(0, MOD_Y - 4.6, 0); scene.add(innerB);
const key = new THREE.DirectionalLight(0xfff1dc, 2.4);
key.position.set(38, 42, -8); key.target.position.set(12, 0, -24); key.castShadow = true;
key.shadow.mapSize.set(hiQ ? 2048 : 1024, hiQ ? 2048 : 1024);
if (qs.get('shadows') === '0') renderer.shadowMap.enabled = false;
key.shadow.camera.near = 1; key.shadow.camera.far = 140;
key.shadow.camera.left = key.shadow.camera.bottom = -50; key.shadow.camera.right = key.shadow.camera.top = 50;
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
    [Math.cos(mid) * 1.2, -3.2, Math.sin(mid) * 1.2, 0.14, 0.2],
    [px, -2.35, pz, 0.12, 0.15], [px, -3.95, pz, 0.08, 0.12], [px, -4.75, pz, 0.06, 0.1], [px * 0.4, -5.0, pz * 0.4, 0.1, 0.1], [0, -4.95, 0, 0.45, 0.1],
  ], rev: false };
}
function prepPath(p, yOff) {
  const pts = (p.rev ? [...p.pts].reverse() : p.pts).map((q) => [q[0], q[1] + yOff, q[2], q[3], q[4]]);
  const cum = [0];
  for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1], pts[i][2] - pts[i - 1][2]); cum.push(cum[i - 1] + d); }
  return { pts, cum, len: cum[cum.length - 1] };
}
const COLD = new THREE.Color(0x3fa4ff), HOT = new THREE.Color(0xffa23c), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
let power = 1, spin = 1; // reactor power fraction and turbine speed fraction (driven by the start-up sequence)
const ev = { pos: new THREE.Vector3(), spread: 0, heat: 0 };
function evalPath(p, s, out) {
  const d = s * p.len; let i = 1; while (i < p.cum.length - 1 && p.cum[i] < d) i++;
  const a = p.pts[i - 1], b = p.pts[i]; const t = (d - p.cum[i - 1]) / Math.max(1e-6, p.cum[i] - p.cum[i - 1]);
  out.pos.set(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
  out.spread = a[3] + (b[3] - a[3]) * t; out.heat = a[4] + (b[4] - a[4]) * t;
}
function particleSystem(paths, count, size, clipped, colA = COLD, colB = HOT, speedK = 1) {
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
    const spd = 0.12 + 0.88 * power, heatK = 0.1 + 0.9 * power;
    for (let i = 0; i < count; i++) {
      const s0 = st[i], p = paths[s0.path];
      s0.s += (dt * 1.1 * spd * speedK * s0.speed) / p.len; if (s0.s > 1) s0.s -= 1;
      evalPath(p, s0.s, ev);
      tmpV.copy(s0.j).multiplyScalar(ev.spread).add(ev.pos);
      pos[i * 3] = tmpV.x; pos[i * 3 + 1] = tmpV.y; pos[i * 3 + 2] = tmpV.z;
      tmpC.copy(colA).lerp(colB, ev.heat * heatK);
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
const flowE = particleSystem([prepPath({ pts: elecPath, rev: false }, 0)], isMobile ? 160 : 420, 0.11, false, new THREE.Color(0xffd27a), new THREE.Color(0xfff6dc), 4.5);
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
  const dpr = Math.min(devicePixelRatio || 1, hiQ ? 1.5 : 1.0);
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
  partList: $('#partList'), partsMenu: $('#partsMenu'), search: $('#search'), results: $('#results'),
  card: $('#card'), cardTitle: $('#cardTitle'), cardDesc: $('#cardDesc'), cardSpecs: $('#cardSpecs'), cardGroup: $('#cardGroup'),
  tip: $('#tip'), cut: $('#cut'), explode: $('#explode'), tourBar: $('#tourBar'), tourText: $('#tourText'), hint: $('#hint'), help: $('#help'), loading: $('#loading'),
};
GROUPS.forEach((g) => {
  const col = document.createElement('div'); col.className = 'pgroup';
  const h = document.createElement('h4'); h.textContent = g.name; col.appendChild(h);
  PARTS.filter((p) => p.group === g.id).forEach((p) => {
    const b = document.createElement('button'); b.className = 'pi'; b.dataset.id = p.id; b.textContent = p.name;
    b.addEventListener('click', () => { select(p.id, { fly: true }); ui.partsMenu.classList.add('hidden'); });
    col.appendChild(b);
  });
  ui.partList.appendChild(col);
});
const closeMenus = () => document.querySelectorAll('.menu').forEach((m) => m.classList.add('hidden'));
$('#partsBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !ui.partsMenu.classList.contains('hidden'); closeMenus(); if (!open) ui.partsMenu.classList.remove('hidden'); });

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
  if ((id === 'racks' || id === 'ups') && dcRoof[0] && dcRoof[0].visible) { dcRoof.forEach((m) => (m.visible = false)); const cb = $('#dcRoofCb'); if (cb) cb.checked = false; }
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
  if (e.focus) { _sph.center.copy(e.focus.center); if (MODULE_PARTS.has(e.id)) _sph.center.y += MOD_Y; _sph.radius = e.focus.radius; }
  else { _box.setFromObject(e.root); if (_box.isEmpty()) return; _box.getBoundingSphere(_sph); }
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
controls.addEventListener('start', () => { camTween = null; controls.autoRotate = false; clearTimeout(idleT); stopTour(); hideHint(); startupCamFree = true; });
controls.addEventListener('end', () => { clearTimeout(idleT); idleT = setTimeout(() => { if (!tour) controls.autoRotate = true; }, 14000); });

const keys = new Set();
addEventListener('keydown', (ev) => {
  const typing = document.activeElement && ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName);
  if (ev.key === 'Escape') { ui.results.classList.remove('open'); ui.help.classList.add('hidden'); closeMenus(); if (tour) stopTour(); else if (startup) stopStartup(); else deselect(); ui.search.blur(); return; }
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
  if (cb.dataset.layer === 'dcroof') { dcRoof.forEach((m) => (m.visible = cb.checked)); return; }
  Object.values(R).forEach((e) => { if (e.def.layer === cb.dataset.layer) e.root.visible = cb.checked; });
  document.querySelectorAll('.pi').forEach((b) => { const e = R[b.dataset.id]; if (e?.def.layer === cb.dataset.layer) b.classList.toggle('hiddenPart', !cb.checked); });
}));
$('#solidBuilding').addEventListener('change', (ev) => {
  buildingPanels.forEach((m) => { const mt = m.material, b = mt.userData.base; if (ev.target.checked) { b.opacity = 1; b.transparent = false; b.depthWrite = true; mt.userData.pickThrough = false; } else { b.opacity = 0.1; b.transparent = true; b.depthWrite = false; mt.userData.pickThrough = true; } m.castShadow = ev.target.checked; });
  applyXray();
});
$('#hiQ').addEventListener('change', (ev) => { hiQ = ev.target.checked; key.shadow.mapSize.set(hiQ ? 2048 : 1024, hiQ ? 2048 : 1024); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } resize(); buildComposer(W, H); if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); } });
$('#layersBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !$('#layersMenu').classList.contains('hidden'); closeMenus(); if (!open) $('#layersMenu').classList.remove('hidden'); });
addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.dd')) closeMenus(); });

let labelsOn = true;
function toggleLabels() { labelsOn = !labelsOn; $('#tgLabels').classList.toggle('on', labelsOn); labelRenderer.domElement.style.display = labelsOn ? '' : 'none'; }
$('#tgLabels').addEventListener('click', toggleLabels);
$('#tgFlow').addEventListener('click', () => { flowOn = !flowOn; flowA.pts.visible = flowB.pts.visible = flowE.pts.visible = flowOn; $('#tgFlow').classList.toggle('on', flowOn); });

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
    if (pri === 3 && dist > (e.def.labelDist || 9.5)) { e.labelEl.classList.add('off'); return; }
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
const MAJOR = new Set(['building', 'shield', 'vessel', 'head', 'dhr', 'pcu', 'cooler', 'loop', 'skid', 'sodium', 'switchyard', 'txline', 'dcsub', 'dchall', 'bess', 'gens', 'dccool', 'crane', 'truck']);
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
  $('#tgTour').classList.add('tourOn'); $('#tgTour').textContent = 'Stop';
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
  $('#tgTour').classList.remove('tourOn'); $('#tgTour').textContent = 'Tour';
  ui.tourBar.classList.add('hidden');
}
$('#tgTour').addEventListener('click', toggleTour);
$('#tourStop').addEventListener('click', stopTour);
canvas.addEventListener('wheel', () => { stopTour(); hideHint(); }, { passive: true });

// ------------------------------------------------------------------ preset views & start-up sequence
const VIEWS = {
  overview: { pos: HOME_POS, tgt: HOME_TGT, cut: 55 },
  section: { pos: new THREE.Vector3(3.4, MOD_Y + CORE_Y + 1.1, 3.0), tgt: new THREE.Vector3(0, MOD_Y + CORE_Y + 0.1, 0), cut: 55 },
  top: { pos: new THREE.Vector3(0.6, 24, 0.8), tgt: new THREE.Vector3(0.5, 4, 0), cut: 0 },
  power: { pos: new THREE.Vector3(16.5, 5.5, 9.5), tgt: new THREE.Vector3(12.0, 1.4, 0.5), cut: 0 },
  datacenter: { pos: new THREE.Vector3(66, 34, -14), tgt: new THREE.Vector3(20, 2, -52), cut: 0 },
  site: { pos: new THREE.Vector3(96, 58, 44), tgt: new THREE.Vector3(22, 0, -22), cut: 0 },
};
function goView(name) {
  const v = VIEWS[name]; if (!v) return;
  stopTour(); flyTo(v.pos, v.tgt, 1700); setCut(v.cut, true);
}
$('#viewsBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !$('#viewsMenu').classList.contains('hidden'); closeMenus(); if (!open) $('#viewsMenu').classList.remove('hidden'); });
document.querySelectorAll('#viewsMenu .mi').forEach((b) => b.addEventListener('click', () => { goView(b.dataset.view); $('#viewsMenu').classList.add('hidden'); }));

// Start-up: pre-checks → drums rotate out → power ascension → turbine roll → full power.
let startup = null, startupCamFree = false;
const STEPS = [
  [0, 'Pre-start checks · sodium at 400 °C · pumps on natural circulation'],
  [2, 'Control drums rotate out · reactor goes critical'],
  [6, 'Power ascension · core heats to 550 °C outlet'],
  [10, 'Turbine roll · generator synchronizes to the grid'],
  [14, 'At full power · 30 MWt thermal · 10 MWe electric'],
];
function runStartup() {
  stopTour(); deselect(); startupCamFree = false;
  startup = { t0: performance.now(), step: -1, flewPower: false };
  power = 0; spin = 0;
  ui.tourBar.classList.remove('hidden'); ui.tourBar.classList.add('startup');
  $('#btnStartup').classList.add('on');
  flyTo(VIEWS.section.pos, VIEWS.section.tgt, 1700); setCut(55, true);
}
function stopStartup() {
  if (!startup) return;
  startup = null; power = 1; spin = 1;
  ui.tourBar.classList.add('hidden'); ui.tourBar.classList.remove('startup');
  $('#btnStartup').classList.remove('on');
}
function updateStartup(now) {
  if (!startup) return;
  const t = (now - startup.t0) / 1000;
  const ramp = (a, b) => THREE.MathUtils.clamp((t - a) / (b - a), 0, 1);
  power = 0.3 * ramp(2, 6) + 0.7 * ramp(6, 10);
  spin = ramp(10, 13);
  let step = 0; for (let i = 0; i < STEPS.length; i++) if (t >= STEPS[i][0]) step = i;
  if (step !== startup.step) { startup.step = step; ui.tourText.textContent = `Start-up · ${STEPS[step][1]}`; }
  if (t >= 9.5 && !startup.flewPower && !startupCamFree) { startup.flewPower = true; flyTo(VIEWS.power.pos, VIEWS.power.tgt, 2200); setCut(0, true); }
  if (t > 18) stopStartup();
}
$('#btnStartup').addEventListener('click', () => (startup ? stopStartup() : runStartup()));
$('#tourStop').addEventListener('click', stopStartup);

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
let hintHidden = false;
function hideHint() { if (hintHidden) return; hintHidden = true; ui.hint.classList.add('out'); }
setTimeout(hideHint, 9000);

// ------------------------------------------------------------------ main loop
setCut(55); updateCut();
if (!TEST) { camera.position.copy(VIEWS.site.pos); controls.target.copy(VIEWS.site.tgt); controls.update(); setTimeout(() => flyTo(HOME_POS, HOME_TGT, 4200), 400); }
const clock = new THREE.Clock();
let ledT = 0;
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

  updateStartup(now);
  const pk = 0.06 + 0.94 * power;
  drumGroups.forEach((g, i) => { g.rotation.y = Math.PI / 2 - g.userData.angle + 0.9 + (1 - power) * (Math.PI - 0.9) + Math.sin(t * 0.25 + i * 0.7) * 0.6 * power; });
  const fuelPulse = (0.85 + Math.sin(t * 1.6) * 0.15) * pk;
  if (fuelMat && fuelMat.userData.base) { fuelMat.userData.base.ei = fuelPulse; fuelMat.emissiveIntensity = fuelPulse; }
  if (pelletMat && pelletMat.userData.base) { pelletMat.userData.base.ei = 1.6 * pk; pelletMat.emissiveIntensity = 1.6 * pk; }
  glow.intensity = (6.5 + Math.sin(t * 1.6) * 1.2) * pk;
  spinners.forEach((s) => (s.rotation.x += dt * 28 * spin));
  fans.forEach((f) => (f.rotation.y += dt * 7 * (0.1 + 0.9 * spin)));
  if (flowOn) { flowA.update(dt); flowB.update(dt); flowE.update(dt); }
  // server LEDs flicker
  if (now - ledT > 220) { ledT = now; ledStrips.forEach(({ im, palette }) => { for (let k = 0; k < 24; k++) { const i = Math.floor(Math.random() * im.count); im.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]); } im.instanceColor.needsUpdate = true; }); }

  updateHover(now);
  updateLabels(now);

  if (composer) composer.render(); else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
}
animate();

requestAnimationFrame(() => requestAnimationFrame(() => { ui.loading.classList.add('out'); window.__MR_READY = true; }));
window.MR = { renderer, jump: () => { if (camTween) { camera.position.copy(camTween.p1); controls.target.copy(camTween.t1); camTween = null; } cutVal = cutTarget; explodeVal = explodeTarget; }, frame: () => animate(), select, deselect, resetView, setCut, setExplode, startTour, stopTour, runStartup, stopStartup, goView, parts: PARTS.map((p) => p.id), camera, controls, scene };
