// Interactive Microreactor: 3D model
// Three.js (ES modules via importmap). Generic sodium-cooled pool-type microreactor, above grade.

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { PARTS, GROUPS, TOUR } from './parts.js';
import { createSim, P_THERMAL_MW, P_ELECTRIC_MW } from './physics.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import * as BGU from 'three/addons/utils/BufferGeometryUtils.js';
import * as TXG from './textures.js';
import { WORLD, PLAYER, addBox, addCyl, addRing, addSurf, addRamp, addDisc, addLadder, boxesFromMesh, makeDoor, createWalk, buildRig, poseRig } from './walk.js';
import { createAudio } from './audio.js';
import { createAnalytics } from './analytics.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/addons/postprocessing/SMAAPass.js';

// ------------------------------------------------------------------ setup
const $ = (s) => document.querySelector(s);
const app = $('#app');
const canvas = $('#c');
const isMobile = matchMedia('(pointer: coarse)').matches || innerWidth < 820;
const qs = new URLSearchParams(location.search);
const TEST = qs.has('test');
if (TEST) document.documentElement.classList.add('nofx'); // test harness: skip backdrop blur (slow in software rendering)
// remembered settings (sound, weather, labels, flow, quality) and the quality level that decides the render path
const SETTINGS = (() => { try { return JSON.parse(localStorage.getItem('mr.settings') || '{}'); } catch (e) { return {}; } })();
function saveSetting(k, v) { SETTINGS[k] = v; try { localStorage.setItem('mr.settings', JSON.stringify(SETTINGS)); } catch (e) { /* private mode */ } }
const QUALITY_MODE = ['auto', '3', '2', '1'].includes(String(SETTINGS.quality)) ? String(SETTINGS.quality) : 'auto';
let qLevel = QUALITY_MODE === 'auto' ? (Number.isInteger(SETTINGS.qualityAuto) ? SETTINGS.qualityAuto : (isMobile ? 1 : 3)) : +QUALITY_MODE;
if (qs.get('q') === 'low') qLevel = Math.min(qLevel, 1);
const DPR_CAP = [0.75, 1.0, 1.25, 1.5];
let hiQ = !isMobile && qLevel >= 2;
const DETAIL = isMobile || qs.get('detail') === 'low' ? 1 : 2; // geometry level of detail

const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.AgXToneMapping;
renderer.toneMappingExposure = 1.55;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = qLevel >= 2 ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
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
// leader lines: a canvas under the label layer; a hairline runs from each anchor dot up to its label pill
const LEAD_X = 22, LEAD_Y = 16;
const leaders = (() => { const c = document.createElement('canvas'); c.id = 'leaders'; Object.assign(c.style, { position: 'absolute', inset: '0', width: '100%', height: '100%', pointerEvents: 'none' }); $('#labels').appendChild(c); return { c, ctx: c.getContext('2d'), dpr: 1 }; })();
$('#labels').appendChild(labelRenderer.domElement);

// Environment lighting (image based, generated in code)
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; // replaced by the sky environment below once the sky exists
scene.environmentIntensity = 0.8;

// Clipping plane for the cutaway (shared by module/building materials)
const clipPlane = new THREE.Plane(new THREE.Vector3(-1, 0, 0), 1e6);
const clipPlanes = [clipPlane];

// Module group: the factory-built reactor module and its silo sit on a pad at grade.
// Module-local y=0 is the deck level; the pad is at local -6.2.
const MOD_Y = 6.2;
const MOD = new THREE.Group(); MOD.position.y = MOD_Y; scene.add(MOD);
const MODULE_PARTS = new Set(['shield', 'skid', 'guard', 'vessel', 'sodium', 'core', 'assemblies', 'pins', 'reflector', 'drums', 'rods', 'pumps', 'ihx', 'head', 'instruments', 'dhr', 'loop']);
const NO_CLIP = new Set(['pcu', 'cooler', 'loop', 'switchyard', 'truck', 'crane', 'control', 'casks', 'txline', 'dcsub', 'dchall', 'racks', 'ups', 'bess', 'gens', 'dccool', 'hp_canister', 'hp_core', 'hp_pipes', 'hp_drums', 'hp_hx', 'hp_pcu', 'ht_vessel', 'ht_fuel', 'ht_circulator', 'ht_ihx', 'ht_salt', 'ht_turbine', 'ms_vessel', 'ms_pump', 'ms_hx', 'ms_drain', 'ms_offgas', 'ms_turbine']);

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
const texGlow = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.4, 'rgba(255,255,255,0.45)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();
// detail texture: xyz = tileable high-frequency normal from a blurred random heightfield, a = low-frequency wear mask
const texDetail = (() => {
  const N = 128, h = new Float32Array(N * N), tmp = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) h[i] = Math.random();
  const at = (x, y) => h[((y + N) % N) * N + ((x + N) % N)];
  for (let pass = 0; pass < 2; pass++) { for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { let a = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) a += at(x + dx, y + dy); tmp[y * N + x] = a / 9; } h.set(tmp); }
  const lat = 4, grid = new Float32Array(lat * lat); for (let i = 0; i < lat * lat; i++) grid[i] = Math.random();
  const g = (x, y) => grid[((y % lat) + lat) % lat * lat + ((x % lat) + lat) % lat];
  const data = new Uint8Array(N * N * 4);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = (at(x + 1, y) - at(x - 1, y)) * 2.6, dy = (at(x, y + 1) - at(x, y - 1)) * 2.6, l = Math.hypot(dx, dy, 1);
    const i = (y * N + x) * 4; data[i] = (-dx / l * 0.5 + 0.5) * 255; data[i + 1] = (-dy / l * 0.5 + 0.5) * 255; data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
    const u = x / N * lat, v = y / N * lat, x0 = Math.floor(u), y0 = Math.floor(v), fx = u - x0, fy = v - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const n = (g(x0, y0) * (1 - sx) + g(x0 + 1, y0) * sx) * (1 - sy) + (g(x0, y0 + 1) * (1 - sx) + g(x0 + 1, y0 + 1) * sx) * sy;
    data[i + 3] = Math.max(0, Math.min(255, (n * 0.7 + at(x, y) * 0.6 - 0.15) * 255)); }
  const t = new THREE.DataTexture(data, N, N, THREE.RGBAFormat); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true; return t;
})();
const texShadowDisc = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, 'rgba(0,0,0,0.7)'); grd.addColorStop(0.6, 'rgba(0,0,0,0.3)'); grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(c);
})();

// ------------------------------------------------------------------ PBR texture sets (procedural)
const __t0 = performance.now(); window.__MR_T = {};
const TXS = DETAIL === 2 ? 512 : 256;
const loadText = (t, p) => { window.__MR_PROGRESS?.(); const el = document.querySelector('#loading .ltxt'); if (el) el.textContent = t; const st = document.querySelector('#introStep'); if (st) st.textContent = t; if (p !== undefined) { const f = document.querySelector('#introBarFill'); if (f) f.style.width = Math.round(p * 100) + '%'; } };
document.body.classList.add('intro-open');
const tick = () => new Promise((r) => setTimeout(r, 0));
const TX = {};
const TEX_VERSION = 'v6';
const texPlan = [
  ['concrete', () => TXG.concreteSet(TXS)], ['paint', () => TXG.paintedMetalSet(TXS)], ['panel', () => TXG.paintedMetalSet(TXS, 8)],
  ['galv', () => TXG.galvanizedSet(256)], ['brushed', () => TXG.brushedSet(TXS)], ['asphalt', () => TXG.asphaltSet(TXS)], ['grass', () => TXG.grassSet(TXS)],
  ['rubber', () => TXG.rubberSet(256)], ['water', () => TXG.waterNormal(256)], ['hatch', () => TXG.hatchTexture(256)], ['grime', () => TXG.grimeTexture(128)],
  ['stain', () => TXG.stainTexture(256)], ['rust', () => TXG.rustTexture(128)], ['grassCard', () => TXG.grassCardTexture(128)],
  ['bark', () => TXG.barkSet(256)], ['leafBroad', () => TXG.leafClusterTexture(256, 'broad')], ['leafNeedle', () => TXG.leafClusterTexture(256, 'needle')], ['leafFine', () => TXG.leafClusterTexture(256, 'fine')],
];
// cached pixels from an earlier visit skip generation; new sets are stored after the first frame
const texCache = qs.has('nocache') ? { db: null, records: {} } : await TXG.readTextureCache();
const texPending = [];
let texHits = 0;
for (const [k, fn] of texPlan) {
  const key = `${k}|${TEX_VERSION}|${TXS}`, rec = texCache.records[key];
  if (rec) { TX[k] = TXG.deserializeSet(rec); texHits++; continue; }
  loadText(`Weathering materials · ${k}`, 0.05 + 0.5 * (texPlan.indexOf(texPlan.find((e) => e[0] === k)) / texPlan.length)); await tick(); TX[k] = fn(); texPending.push([key, TX[k]]);
}
window.__MR_T.texHits = texHits;
loadText('Assembling the plant', 0.58);
await tick();
window.__MR_T.textures = performance.now() - __t0;
// Apply a texture set to material options with a tiling repeat
function withSet(set, ru = 1, rv = ru, opts = {}) {
  const o = Object.assign({}, opts);
  if (set.map) o.map = tiled(set.map, ru, rv);
  if (set.normalMap) { o.normalMap = tiled(set.normalMap, ru, rv); o.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1); }
  if (set.roughnessMap) { o.roughnessMap = tiled(set.roughnessMap, ru, rv); o.roughness = 1; }
  delete o.normalScaleValue;
  return o;
}

// ------------------------------------------------------------------ materials
const tiled = (t, ru, rv) => { const c = t.clone(); c.repeat.set(ru, rv); c.needsUpdate = true; return c; };
function mat(opts = {}) {
  const m = new THREE.MeshStandardMaterial(Object.assign({ side: THREE.DoubleSide }, opts));
  m.clippingPlanes = clipPlanes;
  m.clipShadows = true;
  return m;
}
/** Tag a material for the detail-normal and edge-wear shader patch (applied after CSM once the scene exists). */
function detail(m, scale, strength, wear) { if (DETAIL === 2) { m.userData.detail = { s: scale, k: strength, w: wear }; detailMats.push(m); } return m; }
const M = {
  steel: (ru = 2, rv = 2) => mat(withSet(TX.brushed, ru, rv, { color: 0xb4b9bf, metalness: 0.95, normalScale: 0.35 })),
  steelDark: (ru = 2, rv = 2) => mat(withSet(TX.brushed, ru, rv, { color: 0x5a6168, metalness: 0.9, normalScale: 0.3 })),
  steelPaint: (color = 0x5b6673, ru = 2, rv = 2) => detail(mat(withSet(TX.paint, ru, rv, { color, metalness: 0.35, normalScale: 0.5 })), 9, 0.3, 0.6),
  galv: (ru = 2, rv = 2) => detail(mat(withSet(TX.galv, ru, rv, { color: 0xb0b6bb, metalness: 0.85, normalScale: 0.5 })), 8, 0.25, 0.4),
  concrete: (color = 0x9b958b, ru = 2, rv = 2) => detail(mat(withSet(TX.concrete, ru, rv, { color, metalness: 0.0, normalScale: 0.9 })), 11, 0.33, 0),
  asphalt: (ru = 4, rv = 4) => detail(mat(withSet(TX.asphalt, ru, rv, { color: 0x6f7072, metalness: 0.0, normalScale: 1.0 })), 7, 0.4, 0),
  panel: (color = 0xb6bbc0, ru = 3, rv = 1.5) => detail(mat(withSet(TX.panel, ru, rv, { color, metalness: 0.5, normalScale: 0.8 })), 6, 0.22, 0.3),
  panelGhost: () => { const m = mat(withSet(TX.panel, 6, 2, { color: 0xc9cfd5, metalness: 0.35, normalScale: 0.6, transparent: true, opacity: 0.1, depthWrite: false })); m.userData.pickThrough = true; m.userData.keepDouble = true; return m; },
  sodium: () => { const m = mat({ color: 0x9fb8cf, metalness: 0.6, roughness: 0.14, transparent: true, opacity: 0.34, depthWrite: false, envMapIntensity: 1.2, emissive: 0x2a1c0c, emissiveIntensity: 0.5, normalMap: TX.water, normalScale: new THREE.Vector2(0.25, 0.25) }); m.userData.pickThrough = true; return m; },
  fuel: () => mat({ color: 0x5a5f66, metalness: 0.9, roughness: 0.42, emissive: 0xff4a10, emissiveIntensity: 0.38, bumpMap: texWire, bumpScale: 0.0015, roughnessMap: texWire }),
  pellet: () => mat({ color: 0x3a3028, metalness: 0.2, roughness: 0.75, emissive: 0xff3a08, emissiveIntensity: 1.2 }),
  rebar: () => mat(withSet(TX.rubber, 2, 2, { color: 0x6a4a34, metalness: 0.5, normalScale: 0.6 })),
  hivis: () => mat({ color: 0xff7a1a, metalness: 0.0, roughness: 0.9 }),
  denim: () => mat({ color: 0x2d3e5c, metalness: 0.0, roughness: 0.95 }),
  skin: () => mat({ color: 0xc9a07e, metalness: 0.0, roughness: 0.8 }),
  shirt: () => mat({ color: 0x4a5560, metalness: 0.0, roughness: 0.9 }),
  reflect: () => mat({ color: 0xd9d9d9, metalness: 0.2, roughness: 0.35, emissive: 0x9a9a9a, emissiveIntensity: 0.35 }),
  boot: () => mat({ color: 0x1e1a16, metalness: 0.05, roughness: 0.85 }),
  carpet: () => mat({ color: 0x2b2d31, metalness: 0.0, roughness: 0.98 }),
  glass: () => { const m = mat({ color: 0x9fb4c8, metalness: 0.1, roughness: 0.05, transparent: true, opacity: 0.28, depthWrite: false }); m.userData.keepDouble = true; return m; },
  duct: () => mat({ color: 0x7a8188, metalness: 0.9, roughness: 0.5, transparent: true, opacity: 0.5, depthWrite: false }),
  ceramic: (color = 0xcfcbc2) => mat(withSet(TX.paint, 2, 2, { color, metalness: 0.05, normalScale: 0.2 })),
  absorber: () => mat({ color: 0x1b1e23, metalness: 0.35, roughness: 0.62 }),
  copper: () => mat(withSet(TX.brushed, 1, 1, { color: 0xb87333, metalness: 1.0, normalScale: 0.4 })),
  insul: () => mat(withSet(TX.paint, 1, 1, { color: 0xcfd3d7, metalness: 0.85, normalScale: 0.4 })),
  skidYellow: () => mat(withSet(TX.paint, 2, 2, { color: 0xd19a2a, metalness: 0.35, normalScale: 0.5 })),
  genBlue: () => mat(withSet(TX.paint, 2, 2, { color: 0x2c5d8a, metalness: 0.4, normalScale: 0.5 })),
  rubber: () => mat(withSet(TX.rubber, 2, 2, { color: 0x24282c, metalness: 0.05, normalScale: 0.5 })),
};

// ------------------------------------------------------------------ geometry helpers
const G = {
  cyl: (r, h, seg = 48, rTop = r, open = false) => {
    if (open || rTop !== r || r < 0.12 || h < 0.2 || DETAIL < 2) return new THREE.CylinderGeometry(rTop, r, h, seg, 1, open);
    const c = Math.min(0.025, r * 0.08, h * 0.08);
    const body = new THREE.CylinderGeometry(r, r, h - 2 * c, seg, 1, true);
    const top = new THREE.CylinderGeometry(r - c, r, c, seg, 1, true); top.translate(0, h / 2 - c / 2, 0);
    const bot = new THREE.CylinderGeometry(r, r - c, c, seg, 1, true); bot.translate(0, -h / 2 + c / 2, 0);
    const capT = new THREE.CircleGeometry(r - c, seg); capT.rotateX(-Math.PI / 2); capT.translate(0, h / 2, 0);
    const capB = new THREE.CircleGeometry(r - c, seg); capB.rotateX(Math.PI / 2); capB.translate(0, -h / 2, 0);
    return BGU.mergeGeometries([body, top, bot, capT, capB], false);
  },
  box: (w, h, d) => { const m = Math.min(w, h, d); return DETAIL === 2 && m >= 0.22 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.03, m * 0.1)) : new THREE.BoxGeometry(w, h, d); },
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
const pickables = [], occluders = [];
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
  const mats = [].concat(material);
  e.meshes.push(m); mats.forEach((mm) => regMat(e, mm)); pickables.push(m);
  if (!mats.some((mm) => mm.transparent)) m.layers.enable(1);
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
  if (!material.transparent) im.layers.enable(1);
  return im;
}
function scenery(geom, material, o = {}) {
  const m = new THREE.Mesh(geom, material);
  m.position.set(o.x || 0, o.y || 0, o.z || 0);
  if (o.rx) m.rotation.x = o.rx; if (o.ry) m.rotation.y = o.ry; if (o.rz) m.rotation.z = o.rz;
  m.castShadow = o.cast !== false; m.receiveShadow = o.recv !== false;
  material.clippingPlanes = null;
  if (material.side === THREE.DoubleSide && !material.userData.keepDouble) material.side = THREE.FrontSide;
  if (!material.transparent) m.layers.enable(1);
  if (!material.transparent && o.cast !== false) occluders.push(m);
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
/**
 * Wall with openings. axis 'x': runs along x at z = c; axis 'z': runs along z at x = c.
 * holes: [{a0, a1, y0, y1}] in wall-axis coordinates. Emits one merged mesh and one collider per solid piece.
 * id null -> scenery. Returns the mesh.
 */
function wallSeg(id, axis, a0, a1, c, thick, y0, y1, holes, material, o = {}) {
  const eps = 1e-4, pts = new Set([a0, a1]);
  holes.forEach((h) => { if (h.a0 > a0 + eps && h.a0 < a1 - eps) pts.add(h.a0); if (h.a1 > a0 + eps && h.a1 < a1 - eps) pts.add(h.a1); });
  const xs = [...pts].sort((p, q) => p - q), geos = [];
  const piece = (pa, pb, ya, yb) => {
    if (pb - pa < eps || yb - ya < eps) return;
    const w = pb - pa, h = yb - ya, g = new THREE.BoxGeometry(axis === 'x' ? w : thick, h, axis === 'x' ? thick : w);
    const cx = axis === 'x' ? (pa + pb) / 2 : c, cz = axis === 'x' ? c : (pa + pb) / 2;
    g.translate(cx, (ya + yb) / 2, cz); geos.push(g);
    if (o.collide !== false) addBox(cx - (axis === 'x' ? w / 2 : thick / 2), cx + (axis === 'x' ? w / 2 : thick / 2), ya, yb, cz - (axis === 'x' ? thick / 2 : w / 2), cz + (axis === 'x' ? thick / 2 : w / 2));
  };
  for (let i = 0; i < xs.length - 1; i++) {
    const pa = xs[i], pb = xs[i + 1];
    const cover = holes.filter((h) => h.a0 <= pa + eps && h.a1 >= pb - eps).map((h) => [Math.max(y0, h.y0), Math.min(y1, h.y1)]).filter(([ya, yb]) => yb > ya).sort((u, v) => u[0] - v[0]);
    let y = y0;
    for (const [ya, yb] of cover) { piece(pa, pb, y, ya); y = Math.max(y, yb); }
    piece(pa, pb, y, y1);
  }
  if (!geos.length) return null;
  const g = BGU.mergeGeometries(geos, false);
  const mesh = id ? add(id, g, material, Object.assign({ cast: o.cast !== false, recv: true }, o)) : scenery(g, material, Object.assign({ cast: o.cast !== false }, o));
  mesh.userData.noColl = true; return mesh;
}
/** A door leaf: panel, frame lip, optional vision window and push bar. Returns a Group; origin at the bottom centre of the leaf. */
function doorLeaf(w, h, material, { window: win = true, bar = true, thick = 0.07, slats = 0 } = {}) {
  const g = new THREE.Group();
  const panel = new THREE.Mesh(G.box(w, h, thick), material); panel.castShadow = true; panel.receiveShadow = true; panel.position.y = 0; g.add(panel);
  if (win) { const wm = M.glass(); const wn = new THREE.Mesh(new THREE.BoxGeometry(w * 0.32, h * 0.22, thick + 0.01), wm); wn.position.set(0, h * 0.22, 0); g.add(wn); }
  if (bar) { const bm = M.steelPaint(0xd8dde2); const b = new THREE.Mesh(G.cyl(0.018, w * 0.7, 10), bm); b.rotation.z = Math.PI / 2; b.position.set(0, -h * 0.02, thick / 2 + 0.04); g.add(b); [-1, 1].forEach((k) => { const s = new THREE.Mesh(G.box(0.04, 0.04, 0.08), bm); s.position.set(k * w * 0.3, -h * 0.02, thick / 2 + 0.02); g.add(s); }); }
  if (slats) { const sm = M.steelPaint(0x3b434c); for (let i = 1; i < slats; i++) { const sl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, thick + 0.012), sm); sl.position.y = -h / 2 + (h / slats) * i; g.add(sl); } }
  g.traverse((o) => { if (o.isMesh) { o.userData.part = undefined; } });
  return g;
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
// Late dusk: a low sun to the east-north-east, warm only around it, blue-grey everywhere else.
const SUN_POS = new THREE.Vector3(26, 12.5, -16).normalize();
const SUN_DIR = SUN_POS.clone().negate();
const MOON_DIR = new THREE.Vector3(-0.72, 0.5, -0.4).normalize();
const skyMat = new THREE.ShaderMaterial({
  side: THREE.BackSide, depthWrite: false, fog: false,
  uniforms: { top: { value: new THREE.Color(0x0b1020) }, horizonCool: { value: new THREE.Color(0x2a2d38) }, horizonWarm: { value: new THREE.Color(0x6a4530) }, sunCol: { value: new THREE.Color(0xffb067) }, bottom: { value: new THREE.Color(0x0d0a05) }, sunDir: { value: SUN_POS }, moonDir: { value: MOON_DIR }, boost: { value: 1.0 }, gloom: { value: 0.0 }, flash: { value: 0.0 }, stars: { value: 1.0 } },
  vertexShader: `varying vec3 vW; void main(){ vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
  fragmentShader: `uniform vec3 top, horizonCool, horizonWarm, sunCol, bottom, sunDir, moonDir; uniform float boost, gloom, flash, stars; varying vec3 vW;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float hash3(vec3 p){ return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
    float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
      float a = mix(mix(hash3(i), hash3(i + vec3(1,0,0)), f.x), mix(hash3(i + vec3(0,1,0)), hash3(i + vec3(1,1,0)), f.x), f.y);
      float b = mix(mix(hash3(i + vec3(0,0,1)), hash3(i + vec3(1,0,1)), f.x), mix(hash3(i + vec3(0,1,1)), hash3(i + vec3(1,1,1)), f.x), f.y);
      return mix(a, b, f.z); }
    void main(){ vec3 d = normalize(vW); float h = d.y;
    float az = max(dot(normalize(vec3(d.x, 0.0, d.z)), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
    vec3 horizon = mix(horizonCool, horizonWarm, pow(az, 2.2) * (1.0 - 0.8 * gloom));
    vec3 c = h > 0.0 ? mix(horizon, top, pow(h, 0.5)) : mix(horizon, bottom, pow(-h, 0.35));
    float s = max(dot(d, sunDir), 0.0);
    c += sunCol * (pow(s, 5.0) * 0.28 + pow(s, 60.0) * 0.9) * smoothstep(-0.08, 0.05, h) * (1.0 - 0.85 * gloom);
    c = mix(c, c * vec3(0.5, 0.52, 0.58), gloom);
    // night sky: a faint Milky Way band, point stars, and a moon with a soft glow. All fade near the horizon, toward the sun, and under storm cloud.
    { float night = smoothstep(0.03, 0.25, h) * (1.0 - 0.95 * gloom) * (1.0 - 0.75 * pow(s, 3.0)) * stars;
      if (night > 0.002) {
      vec3 mwN = normalize(vec3(0.6, 0.15, 0.78)); float band = exp(-pow(dot(d, mwN) * 6.5, 2.0));
      float n1 = vnoise(d * 7.0), n2 = vnoise(d * 15.0 + 3.1), lane = smoothstep(0.25, 0.6, abs(vnoise(d * 4.0 + 7.0) - 0.5) * 2.2);
      c += vec3(0.42, 0.5, 0.68) * band * (0.35 + 0.65 * n1) * (0.6 + 0.4 * n2) * (0.45 + 0.55 * lane) * 0.075 * night;
      vec2 st = vec2(atan(d.z, d.x) * 52.0, d.y * 110.0); vec2 cell = floor(st), f = fract(st); float r = hash(cell);
      vec2 off = vec2(hash(cell + 1.7), hash(cell + 3.1)) * 0.6 + 0.2; float sd = length(f - off);
      float star = smoothstep(0.09, 0.0, sd) * step(0.905, r) * (0.3 + 0.7 * hash(cell + 5.3));
      c += vec3(0.85, 0.9, 1.0) * star * (0.3 + 0.5 * band) * 0.7 * night; }
      float m = max(dot(d, moonDir), 0.0); float disc = smoothstep(0.99972, 0.99986, m);
      float shade = smoothstep(0.99962, 0.99990, dot(d, normalize(moonDir + vec3(0.016, 0.006, 0.0))));
      float moonVis = smoothstep(-0.02, 0.1, h) * (1.0 - 0.92 * gloom);
      c += vec3(1.0, 0.96, 0.88) * disc * (0.32 + 0.68 * (1.0 - 0.8 * shade)) * 1.6 * moonVis;
      c += vec3(0.5, 0.58, 0.74) * (pow(m, 900.0) * 0.5 + pow(m, 120.0) * 0.12 + pow(m, 14.0) * 0.02) * moonVis; }
    c += flash * vec3(0.75, 0.8, 0.95) * (0.4 + 0.6 * smoothstep(-0.1, 0.4, h));
    c += (hash(gl_FragCoord.xy) - 0.5) * 0.004; // dither against banding
    gl_FragColor = vec4(c * boost, 1.0);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }`,
});
scene.add(new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), skyMat));
// Image-based lighting from this sky (brighter copy so metals keep contrast) plus a dark ground
{ const envScene = new THREE.Scene();
  const envSky = skyMat.clone(); envSky.uniforms = THREE.UniformsUtils.clone(skyMat.uniforms); envSky.uniforms.boost.value = 2.2; envSky.uniforms.sunDir.value = SUN_POS; envSky.uniforms.stars.value = 0.0;
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), envSky));
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12), new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.72, 0.46).multiplyScalar(28) }));
  sunDisc.position.copy(SUN_POS).multiplyScalar(90); envScene.add(sunDisc);
  const g = new THREE.Mesh(new THREE.CircleGeometry(100, 32), new THREE.MeshBasicMaterial({ color: 0x1c1b16 })); g.rotation.x = -Math.PI / 2; g.position.y = -0.5; envScene.add(g);
  scene.environment = pmrem.fromScene(envScene, 0.02).texture; scene.environmentIntensity = 1.5; pmrem.dispose(); }

const groundMat = new THREE.MeshPhysicalMaterial(withSet(TX.grass, 120, 120, { color: 0x8a9478, metalness: 0, roughness: 1.0, normalScale: 0.8 }));
// Terrain: gentle noise outside the site, flat under the plant and campus, a shallow pond basin
function vnoise(x, z) { // 2-octave value noise
  const h = (i, j) => { const n = Math.sin(i * 127.1 + j * 311.7) * 43758.5453; return n - Math.floor(n); };
  let v = 0, amp = 1, f = 0.011;
  for (let o = 0; o < 2; o++) { const X = x * f, Z = z * f, i = Math.floor(X), j = Math.floor(Z), fx = X - i, fz = Z - j, sx = fx * fx * (3 - 2 * fx), sz = fz * fz * (3 - 2 * fz);
    v += amp * ((h(i, j) * (1 - sx) + h(i + 1, j) * sx) * (1 - sz) + (h(i, j + 1) * (1 - sx) + h(i + 1, j + 1) * sx) * sz); amp *= 0.5; f *= 2.3; }
  return v / 1.5;
}
const sstep = (a, b, x) => { const t = THREE.MathUtils.clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const POND = { x: -48, z: -26, rx: 17, rz: 11 };
let pondWater = null;
const windMats = [], uvScaleMats = [], wetMats = [], grassTufts = [], detailMats = [], HALOS = [], postPatch = [];
/** Warm fixture material. Brighter than 1.0 so bloom and AgX keep it reading as a light source. */
const LIT_HEX = 0xffe6bf;
function litMat(hex = LIT_HEX, k = 1.9) { return new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k) }); }
/** Register a soft halo billboard at a fixture: position, radius in metres, colour. Drawn as one Points mesh after the world is built. */
function halo(x, y, z, r = 1.6, hex = 0xffd9a4) { HALOS.push([x, y, z, r, hex]); }
// flat pads: [x0, x1, z0, z1, blend]. The plant site, the industrial park across the highway, the farmstead.
const FLATS = [[-24, 74, -78, 30, 26], [172, 250, -24, 86, 14], [-150, -96, 92, 136, 12], [76, 141, -64, 4, 10]];
const NO_GRASS = [[168, 254, -28, 90], [-152, -94, 90, 138], [76, 141, -64, 4], [138, 162, -335, 335], [64, 142, 12, 21], [95, 250, -225, -40], [-250, -120, -210, -110], [-100, -30, 110, 200], [-98, -14, 108, 122]];
function terrainY(x, z) {
  let outside = 1;
  for (const [x0, x1, z0, z1, b] of FLATS) { const dx = Math.max(x0 - x, x - x1, 0), dz = Math.max(z0 - z, z - z1, 0); outside = Math.min(outside, sstep(0, b, Math.hypot(dx, dz))); }
  let y = (vnoise(x, z) * 2 - 1) * 2.6 * outside;
  const pd = Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz);
  const pond = 1 - sstep(0.75, 1.35, pd);
  return y * (1 - pond) - 0.6 * pond;
}
{ const tg = new THREE.PlaneGeometry(640, 640, 160, 160); tg.rotateX(-Math.PI / 2); const pos = tg.attributes.position;
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainY(pos.getX(i), pos.getZ(i)));
  tg.computeVertexNormals();
  const ground = new THREE.Mesh(tg, groundMat); ground.receiveShadow = true; ground.layers.enable(1); scene.add(ground); }
// pond water
{ const wg = new THREE.CircleGeometry(1, 64); wg.scale(POND.rx * 0.92, POND.rz * 0.92, 1);
  const wn = TX.water.clone(); wn.repeat.set(14, 9); wn.needsUpdate = true; const wn2 = TX.water.clone(); wn2.repeat.set(9, 14); wn2.needsUpdate = true;
  const water = new THREE.Mesh(wg, new THREE.MeshPhysicalMaterial({ color: 0x0b1118, metalness: 0.85, roughness: 0.08, envMapIntensity: 1.6, transparent: true, opacity: 0.92, normalMap: wn, normalScale: new THREE.Vector2(0.35, 0.35) }));
  water.rotation.x = -Math.PI / 2; water.position.set(POND.x, -0.12, POND.z); scene.add(water); pondWater = { water, wn }; }
// grass tufts: crossed alpha-tested cards, dense outside the fence, sparse on the site lawn, never on pavement
{ const n = DETAIL === 2 ? 3200 : 1000;
  const a = new THREE.PlaneGeometry(0.8, 0.55), b = new THREE.PlaneGeometry(0.8, 0.55); b.rotateY(Math.PI / 2); const geo = BGU.mergeGeometries([a, b], false); geo.translate(0, 0.26, 0);
  const gm = new THREE.MeshStandardMaterial({ map: TX.grassCard, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1, color: 0xaab594 }); gm.userData.keepDouble = true; gm.userData.wind = { h: 0.5, amp: 0.05 }; windMats.push(gm);
  const im = new THREE.InstancedMesh(geo, gm, n); im.receiveShadow = true;
  const paved = [[-8, 14, -8, 8], [-12, 54, -69, -33], [-5, 67, 13, 19], [58, 66, -45, 20], [51, 69, -68, -42], [7, 15, -14, -7], [-16, -4, -29, -19], [17, 31, 4, 13], [32, 48, 6, 13], [60, 68, 9, 14], [-15, -7, 2, 14], [44, 57, -61, -49]];
  const onSite = (x, z) => x > -24 && x < 74 && z > -78 && z < 30;
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pos = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  let i = 0, guard = 0;
  while (i < n && guard++ < n * 20) {
    const x = -120 + Math.random() * 280, z = -140 + Math.random() * 190;
    if (paved.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1) || NO_GRASS.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1)) continue;
    if (Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) < 1.08) continue;
    if (onSite(x, z) && Math.random() > 0.22) continue;
    const k = 0.7 + Math.random() * 0.8; q.setFromAxisAngle(up, Math.random() * Math.PI); sc.set(k, k * (0.8 + Math.random() * 0.5), k); pos.set(x, terrainY(x, z) - 0.02, z);
    m.compose(pos, q, sc); im.setMatrixAt(i++, m);
  }
  im.count = i; im.userData.full = i; im.instanceMatrix.needsUpdate = true; scene.add(im); grassTufts.push(im); }
// stars
{ const n = 700, p = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, e = 0.12 + Math.random() * 1.3, r = 380; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xcfd6e6, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0.7, fog: false, depthWrite: false }))); }
// sun glow low on the horizon and a few drifting clouds
const texCloud = (() => { const c = document.createElement('canvas'); c.width = 512; c.height = 256; const g = c.getContext('2d'); g.clearRect(0, 0, 512, 256);
  for (let i = 0; i < 26; i++) { const x = 60 + rnd() * 392, y = 90 + rnd() * 80, r = 40 + rnd() * 70; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(255,255,255,0.55)'); grd.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = grd; g.fillRect(0, 0, 512, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
const clouds = [];
{ const sun = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshBasicMaterial({ map: texGlow, color: 0xffb56a, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
  sun.position.copy(SUN_POS).multiplyScalar(330); sun.lookAt(0, 10, 0); scene.add(sun);
  for (let i = 0; i < 9; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(110, 55), new THREE.MeshBasicMaterial({ map: texCloud, color: 0x4a4650, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    const a = Math.random() * Math.PI * 2, r = 170 + Math.random() * 120; m.position.set(Math.cos(a) * r, 55 + Math.random() * 35, Math.sin(a) * r); m.lookAt(0, 30, 0); m.userData.v = 0.25 + Math.random() * 0.3; const tw = Math.max(0, m.position.clone().setY(0).normalize().dot(new THREE.Vector3(SUN_POS.x, 0, SUN_POS.z).normalize())); m.material.color.lerp(new THREE.Color(0x9a6a4a), tw * tw); scene.add(m); clouds.push(m); } }
// distant hills: displaced ring, silhouetted against the horizon glow
{ const hg = new THREE.CylinderGeometry(260, 260, 1, 160, 1, true); const pos = hg.attributes.position;
  for (let i = 0; i < pos.count; i++) { if (pos.getY(i) > 0) { const a = Math.atan2(pos.getZ(i), pos.getX(i)); pos.setY(i, 6 + 9 * Math.abs(Math.sin(a * 3.1 + 0.4)) + 7 * Math.abs(Math.sin(a * 7.3 + 2.1)) + 4 * Math.sin(a * 13.7)); } else pos.setY(i, -2); }
  hg.computeVertexNormals();
  scene.add(new THREE.Mesh(hg, new THREE.MeshBasicMaterial({ color: 0x110d09, side: THREE.BackSide, fog: true }))); }
// plant slab extended to the campus
const campusSlab = new THREE.Mesh(new THREE.PlaneGeometry(66, 34), new THREE.MeshPhysicalMaterial(withSet(TX.concrete, 30, 15, { color: 0x75726b, roughness: 1, normalScale: 0.7 }))); wetMats.push(campusSlab.material, groundMat);
campusSlab.rotation.x = -Math.PI / 2; campusSlab.position.set(21, 0.002, -51); campusSlab.receiveShadow = true; campusSlab.layers.enable(1); scene.add(campusSlab);
const slab = new THREE.Mesh(new THREE.PlaneGeometry(21, 14), new THREE.MeshPhysicalMaterial(withSet(TX.concrete, 10, 7, { color: 0x7d7a74, roughness: 1, normalScale: 0.7 }))); wetMats.push(slab.material);
slab.rotation.x = -Math.PI / 2; slab.position.set(3, 0.003, 0); slab.receiveShadow = true; slab.layers.enable(1); scene.add(slab);
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
    const wall = M.concrete(0xa39d92, 10, 3), top = M.concrete(0xaaa49a, 10, 1), joint = M.concrete(0x6f6a62);
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
    wallSeg('building', 'x', X0, X1, -Z - 0.25, 0.12, 0, H, [], ghost, { cast: false }),
    wallSeg('building', 'x', X0, X1, Z + 0.25, 0.12, 0, H, [{ a0: 2.4, a1: 3.6, y0: 0, y1: 2.3 }], ghost, { cast: false }),
    wallSeg('building', 'z', -Z - 0.25, Z + 0.25, X0 - 0.25, 0.12, 0, H, [], ghost, { cast: false }),
    wallSeg('building', 'z', -Z - 0.25, Z + 0.25, X1 + 0.25, 0.12, 0, H, [{ a0: -4.7, a1: -0.1, y0: 0, y1: 4.6 }], ghost, { cast: false }),
  );
  cols.forEach((x) => { [-Z, Z].forEach((z) => addBox(x - 0.13, x + 0.13, 0, H, z - 0.13, z + 0.13)); });
  // equipment roll-up door on the east wall, personnel door on the south wall
  makeDoor(scene, { kind: 'roll', hinge: [X1 + 0.25, 0, -4.7], axis: 'z', sign: 1, width: 4.6, height: 4.6, thick: 0.08, mesh: doorLeaf(4.6, 4.6, M.steelPaint(0x6a7480), { window: false, bar: false, slats: 12 }), label: 'Equipment door' });
  makeDoor(scene, { kind: 'swing', hinge: [2.4, 0, Z + 0.25], axis: 'x', sign: 1, width: 1.2, height: 2.3, swingSign: 1, mesh: doorLeaf(1.2, 2.3, M.steelPaint(0x6a7480)), label: 'Reactor hall door' });
  // frame around the personnel door
  add('building', G.box(1.5, 0.12, 0.3), frame, { x: 3.0, y: 2.38, z: Z + 0.25, cast: false });
  scenery(G.box(0.5, 0.12, 0.25), new THREE.MeshBasicMaterial({ color: 0xd8c9a8 }), { x: 3.0, y: 2.62, z: Z + 0.42, cast: false });
  add('building', G.box(0.1, 2.2, 1.0), M.steelPaint(0x6a7480), { x: X1 + 0.12, y: 1.1, z: 3.2, cast: false });
  labelAt('building', new THREE.Vector3(3.0, H + 0.9, 0));
})();

// ------------------------------------------------------------------ parts: vessels & pool (module-local)
const VES_R = 1.35, VES_BOT = -5.0, VES_TOP = 0.0;
const GRD_R = 1.5, GRD_BOT = -5.15;
const NA_LEVEL = -0.7;
(function buildVessels() {
  const gm = M.steel(6, 3);
  add('guard', G.cyl(GRD_R, -0.3 - GRD_BOT, 96, GRD_R, true), gm, { y: (GRD_BOT - 0.3) / 2 });
  add('guard', G.dish(GRD_R, 0.4, 96), gm, { y: GRD_BOT });
  dynLabel('guard', GRD_R, -4.6, -40);

  const vm = M.steel(6, 3);
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
const drumGroups = [], rodMeshes = [], rodLines = [];
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
    rodMeshes.push(add('rods', G.cyl(0.045, 1.0, 20), rodMat, { x, y: CORE_Y + 1.1, z }));
    rodLines.push(add('rods', G.cyl(0.02, 2.05, 12), lineMat, { x, y: CORE_Y + 2.625, z }));
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
  const galv = M.galv();
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
  const frame = M.steelPaint(0x4f5a66), galv = M.galv(), safety = M.skidYellow();
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
  add('shield', G.box(2.4, 0.06, 1.1), M.steelPaint(0x8a949e), { parent: st, x: -4.3, y: -0.1, z: 3.1 });
  [[-4.95, 2.6], [-4.95, 3.6], [-3.2, 3.6]].forEach(([x, z]) => add('shield', G.cyl(0.02, 1.0, 8), galv, { parent: st, x, y: 0.4, z, cast: false }));
  add('shield', G.cyl(0.02, 1.05, 8), galv, { parent: st, x: -4.95, y: 0.9, z: 3.1, rx: Math.PI / 2, cast: false });
  add('shield', G.cyl(0.02, 1.75, 8), galv, { parent: st, x: -4.05, y: 0.9, z: 3.6, rz: Math.PI / 2, cast: false });
  [[-4.95, -3.3], [-4.95, 3.6], [-3.3, 3.6]].forEach(([x, z]) => add('shield', G.box(0.12, 6.1, 0.12), galv, { parent: st, x, y: -6.2 + 3.05, z }));

  // Switchyard (world, -z side of the building): pad, transformer, switchgear, conduit from the generator
  const yard = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 5.5), new THREE.MeshPhysicalMaterial(withSet(TX.concrete, 4, 3, { color: 0x8a877f, roughness: 1, normalScale: 0.7 })));
  wetMats.push(yard.material); yard.rotation.x = -Math.PI / 2; yard.position.set(11.0, 0.004, -10.8); yard.receiveShadow = true; scene.add(yard);
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

  person(5.2, -5.3, 2.4); person(8.2, -2.9, -2.2); person(26.8, 13.1, 2.6); person(-3.0, -4.3, 0.4, MOD_Y - 0.1 + 0.03); person(46.5, -47.5, -1.2); person(13.6, -34.2, 0.9); person(2.0, -43.0, 0.2);
})();

// rack front: dark bezel, 1U slots, a status LED per unit (tinted per instance)
const texRackFace = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 512; const g = c.getContext('2d');
  g.fillStyle = '#17191c'; g.fillRect(0, 0, 128, 512);
  for (let i = 0; i < 42; i++) { const y = 6 + i * 12; g.fillStyle = i % 7 === 3 ? '#0f1012' : '#232629'; g.fillRect(8, y, 112, 10); g.fillStyle = '#0c0d0f'; g.fillRect(8, y + 9, 112, 1); if (i % 7 !== 3) { g.fillStyle = '#ffffff'; g.fillRect(14, y + 3, 4, 4); if (i % 3 === 0) g.fillRect(22, y + 3, 4, 4); g.fillStyle = '#3a3e44'; for (let k = 0; k < 6; k++) g.fillRect(40 + k * 12, y + 2, 8, 6); } }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; })();

// ------------------------------------------------------------------ parts: grid connection and data center campus (world coords)
const elecPath = [];
const PX = 12.6; // transmission line x
const HH_W = 9; // data hall height
const walkLightSpecs = [], interiors = {};
const TREE_SPOTS = { oak: [], juniper: [], mesquite: [] };
(function buildCampus() {
  const galv = M.galv(), dark = M.steelPaint(0x30363c), panel = M.panel(0xb6bbc0, 10, 3);
  const ghost = M.panelGhost(); interiors.campusGhost = ghost;
  const lit = litMat();

  // --- Transmission line: three steel monopoles with crossarms, sagging conductors, campus gantry
  const poles = [-14, -21.5, -29];
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
  const sub = new THREE.Mesh(new THREE.PlaneGeometry(12, 9), new THREE.MeshPhysicalMaterial(withSet(TX.concrete, 6, 4, { color: 0x8a877f, roughness: 1, normalScale: 0.7 })));
  wetMats.push(sub.material); sub.rotation.x = -Math.PI / 2; sub.position.set(PX, 0.004, -37.5); sub.receiveShadow = true; scene.add(sub);
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
  const HX0 = -4, HX1 = 44, HZ0 = -66, HZ1 = -44, HH = HH_W;
  const hx = (HX0 + HX1) / 2, hz = (HZ0 + HZ1) / 2;
  const pdoor = { a0: 33.4, a1: 34.6, y0: 0, y1: 2.3 }, docks = [{ a0: hz - 2.2 - 1.6, a1: hz - 2.2 + 1.6, y0: 1.2, y1: 4.8 }, { a0: hz + 2.2 - 1.6, a1: hz + 2.2 + 1.6, y0: 1.2, y1: 4.8 }];
  wallSeg('dchall', 'x', HX0, HX1, HZ1, 0.3, 0, HH, [pdoor], panel);
  wallSeg('dchall', 'x', HX0, HX1, HZ0, 0.3, 0, HH, [], panel);
  wallSeg('dchall', 'z', HZ0, HZ1, HX0, 0.3, 0, HH, docks, panel);
  wallSeg('dchall', 'z', HZ0, HZ1, HX1, 0.3, 0, HH, [{ a0: hz + 4.2, a1: hz + 5.4, y0: 0, y1: 2.3 }], panel);
  // dark base band (four strips so the hall stays hollow) and roof parapet
  wallSeg('dchall', 'x', HX0 - 0.2, HX1 + 0.2, HZ1 + 0.2, 0.1, 0, 1.2, [pdoor], dark, { cast: false, collide: false });
  wallSeg('dchall', 'x', HX0 - 0.2, HX1 + 0.2, HZ0 - 0.2, 0.1, 0, 1.2, [], dark, { cast: false, collide: false });
  wallSeg('dchall', 'z', HZ0 - 0.2, HZ1 + 0.2, HX0 - 0.2, 0.1, 0, 1.2, docks, dark, { cast: false, collide: false });
  wallSeg('dchall', 'z', HZ0 - 0.2, HZ1 + 0.2, HX1 + 0.2, 0.1, 0, 1.2, [], dark, { cast: false, collide: false });
  makeDoor(scene, { kind: 'swing', hinge: [33.4, 0, HZ1], axis: 'x', sign: 1, width: 1.2, height: 2.3, swingSign: 1, mesh: doorLeaf(1.2, 2.3, M.steelPaint(0x6a7480)), label: 'Data hall door' });
  docks.forEach((d) => makeDoor(scene, { kind: 'roll', hinge: [HX0, 1.2, d.a0], axis: 'z', sign: 1, width: 3.2, height: 3.6, mesh: doorLeaf(3.2, 3.6, M.steelPaint(0x8d969e), { window: false, bar: false, slats: 10 }), label: 'Dock door' }));
  scenery(G.box(0.5, 0.12, 0.25), lit, { x: 34, y: 2.62, z: HZ1 + 0.3, cast: false }); halo(34, 2.62 - 0.1, HZ1 + 0.3, 0.95);
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
  addBox(HX0 - 3.0, HX0, 0, 1.2, hz - 5, hz + 5);
  // dock steps and a ramp on the north side so the dock is walkable
  { const rg = new THREE.BoxGeometry(3.0, 0.2, 3.2); rg.translate(0, -0.1, 0); const ramp = scenery(rg, M.concrete(0x8a857c, 2, 2), { x: HX0 - 1.5, y: 1.2, z: hz + 6.6 }); ramp.rotation.x = Math.atan2(1.2, 3.2); ramp.position.z = hz + 5 + 1.6; ramp.position.y = 0.6;
    addRamp(HX0 - 3.0, HX0, hz + 5, hz + 8.2, 1.2, 0, 'z'); }
  add('dchall', G.box(3.6, 0.2, 11), dark, { x: HX0 - 1.8, y: 4.9, z: hz, cast: false });
  { const ox0 = HX1 + 0.15, ox1 = HX1 + 8, oz0 = hz - 3, oz1 = hz + 9, OH = 7; // office annex: hollow, two floors, lobby
    const glassBand = [{ a0: oz0 + 0.6, a1: oz1 - 0.6, y0: 1.5, y1: 2.9 }, { a0: oz0 + 0.6, a1: oz1 - 0.6, y0: 4.3, y1: 5.7 }], glassBandX = [{ a0: ox0 + 0.6, a1: ox1 - 0.6, y0: 1.5, y1: 2.9 }, { a0: ox0 + 0.6, a1: ox1 - 0.6, y0: 4.3, y1: 5.7 }];
    const fdoor = { a0: hz + 4.2, a1: hz + 5.4, y0: 0, y1: 2.3 };
    wallSeg('dchall', 'z', oz0, oz1, ox1, 0.25, 0, OH, glassBand.concat([fdoor]), panel);
    wallSeg('dchall', 'x', ox0, ox1, oz0, 0.25, 0, OH, glassBandX, panel); wallSeg('dchall', 'x', ox0, ox1, oz1, 0.25, 0, OH, glassBandX, panel);
    const gl = mat({ color: 0x0d1a26, metalness: 0.3, roughness: 0.15 });
    glassBand.forEach((b) => add('dchall', G.box(0.05, b.y1 - b.y0, b.a1 - b.a0), gl, { x: ox1, y: (b.y0 + b.y1) / 2, z: (b.a0 + b.a1) / 2, cast: false }));
    glassBandX.forEach((b) => [oz0, oz1].forEach((z) => add('dchall', G.box(b.a1 - b.a0, b.y1 - b.y0, 0.05), gl, { x: (b.a0 + b.a1) / 2, y: (b.y0 + b.y1) / 2, z, cast: false })));
    add('dchall', G.box(ox1 - ox0 + 0.4, 0.5, oz1 - oz0 + 0.4), dark, { x: (ox0 + ox1) / 2, y: OH + 0.2, z: (oz0 + oz1) / 2, cast: false });
    add('dchall', G.box(ox1 - ox0, 0.1, oz1 - oz0), dark, { x: (ox0 + ox1) / 2, y: OH, z: (oz0 + oz1) / 2, cast: false });
    add('dchall', G.box(ox1 - ox0 - 0.3, 0.3, oz1 - oz0 - 0.3), mat(withSet(TX.paint, 8, 8, { color: 0xd9d9d9, metalness: 0, normalScale: 0.25 })), { x: (ox0 + ox1) / 2, y: 3.65, z: (oz0 + oz1) / 2, cast: false }); addBox(ox0, ox1, 3.5, 3.8, oz0, oz1);
    scenery(new THREE.PlaneGeometry(ox1 - ox0 - 0.3, oz1 - oz0 - 0.3), M.carpet(), { x: (ox0 + ox1) / 2, y: 0.03, z: (oz0 + oz1) / 2, rx: -Math.PI / 2, cast: false });
    makeDoor(scene, { kind: 'swing', hinge: [ox1, 0, fdoor.a0], axis: 'z', sign: 1, width: 1.2, height: 2.3, swingSign: 1, mesh: doorLeaf(1.2, 2.3, M.glass(), { window: false, thick: 0.05 }), label: 'Office' });
    makeDoor(scene, { kind: 'swing', hinge: [HX1, 0, hz + 4.2], axis: 'z', sign: 1, width: 1.2, height: 2.3, swingSign: -1, mesh: doorLeaf(1.2, 2.3, M.steelPaint(0x6a7480)), label: 'Electrical room' });
    // lobby: reception desk, two chairs, a plant, a wall screen, lights
    const deskTop = M.steelPaint(0xd9d9d9), deskBody = M.steelPaint(0x3b434c);
    add('dchall', G.box(0.7, 0.05, 2.4), deskTop, { x: ox1 - 2.4, y: 1.05, z: hz + 1.5 }); add('dchall', G.box(0.6, 1.0, 2.3), deskBody, { x: ox1 - 2.4, y: 0.5, z: hz + 1.5 }); addBox(ox1 - 2.75, ox1 - 2.05, 0, 1.05, hz + 0.3, hz + 2.7);
    [[ox1 - 1.3, hz + 6.6], [ox1 - 1.3, hz + 7.6]].forEach(([x, z]) => { add('dchall', G.box(0.55, 0.08, 0.55), M.carpet(), { x, y: 0.48, z }); add('dchall', G.box(0.08, 0.55, 0.53), M.carpet(), { x: x + 0.28, y: 0.78, z }); add('dchall', G.cyl(0.03, 0.45, 8), M.steel(), { x, y: 0.25, z }); addBox(x - 0.3, x + 0.35, 0, 0.9, z - 0.3, z + 0.3); });
    add('dchall', G.cyl(0.3, 0.45, 12, 0.22), M.ceramic(0xa78a5f), { x: ox0 + 1.0, y: 0.25, z: oz0 + 1.0 }); scenery(G.sphere(0.5, 10), new THREE.MeshStandardMaterial({ color: 0x244a2e, roughness: 1 }), { x: ox0 + 1.0, y: 1.05, z: oz0 + 1.0 }); addCyl(ox0 + 1.0, oz0 + 1.0, 0.45, 0, 1.4);
    scenery(G.box(0.04, 1.0, 1.8), M.steelPaint(0x1a1c20), { x: ox0 + 0.2, y: 1.9, z: hz + 3, cast: false });
    scenery(G.box(1.2, 0.04, 0.3), lit, { x: (ox0 + ox1) / 2, y: 3.46, z: hz + 1, cast: false }); scenery(G.box(1.2, 0.04, 0.3), lit, { x: (ox0 + ox1) / 2, y: 3.46, z: hz + 6, cast: false });
    walkLightSpecs.push([(ox0 + ox1) / 2, 2.7, hz + 3, 0xfff1dc, 12, 11]); }
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
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xffffff, map: texRackFace });
  const leds = new THREE.InstancedMesh(G.box(0.46, 1.85, 0.02), ledMat, ledMats.length);
  const palette = [new THREE.Color(0x3fa4ff), new THREE.Color(0x4fe0a8), new THREE.Color(0x9fd4ff), new THREE.Color(0x2a6cff), new THREE.Color(0xffc24a), new THREE.Color(0x163a66)];
  ledMats.forEach((m, i) => { leds.setMatrixAt(i, m); leds.setColorAt(i, palette[(i * 7) % palette.length]); });
  leds.instanceColor.needsUpdate = true; leds.userData.part = 'racks'; part('racks').root.add(leds); ledStrips.push({ im: leds, palette });
  labelAt('racks', new THREE.Vector3(RX0 + 12, 2.7, -53.5));
  R.racks.focus = { center: new THREE.Vector3(RX0 + (NR - 1) * RP / 2, 1.5, -56), radius: 16 };

  // --- UPS & electrical room at the +x end of the hall
  add('ups', G.box(0.15, HH - 0.2, HZ1 - HZ0 - 0.4), ghost, { x: HX1 - 6.5, y: HH / 2, z: hz, cast: false });
  addBox(HX1 - 6.58, HX1 - 6.42, 0, HH, HZ0 + 0.2, hz - 0.8); addBox(HX1 - 6.58, HX1 - 6.42, 0, HH, hz + 0.8, HZ1 - 0.2);
  makeDoor(scene, { kind: 'slide', hinge: [HX1 - 6.5, 0.02, hz - 0.8], axis: 'z', sign: 1, width: 1.6, height: 2.4, thick: 0.05, mesh: doorLeaf(1.6, 2.4, M.glass(), { window: false, bar: false, thick: 0.04 }), label: 'Electrical room', auto: true });
  add('ups', G.box(0.2, 0.12, 1.9), M.steelPaint(0x8d969e), { x: HX1 - 6.5, y: 2.48, z: hz, cast: false });
  { const um = M.steelPaint(0xc9ced3), fm = M.steelPaint(0x30363c), mats = [], fmats = [];
    for (let r = 0; r < 2; r++) for (let i = 0; i < 7; i++) { const x = HX1 - 4.8 + r * 2.6, z = HZ1 - 3 - i * 1.1; mats.push(new THREE.Matrix4().makeTranslation(x, 1.05, z)); fmats.push(new THREE.Matrix4().makeTranslation(x - 0.46, 1.1, z)); }
    addInstanced('ups', G.box(0.9, 2.1, 1.0), um, mats, { cast: false });
    addInstanced('ups', G.box(0.02, 1.7, 0.8), fm, fmats, { cast: false, recv: false });
    for (let i = 0; i < 6; i++) add('ups', G.box(0.9, 2.3, 1.1), M.steelPaint(0x8d969e), { x: HX1 - 0.9, y: 1.15, z: HZ0 + 2 + i * 1.3, cast: false });
  }
  labelAt('ups', new THREE.Vector3(HX1 - 3.5, 3.3, HZ1 - 6));
  R.ups.focus = { center: new THREE.Vector3(HX1 - 3.3, 1.5, hz), radius: 9 };

  // --- Battery storage: three containers with HVAC and a PCS cabinet
  const bm = M.panel(0xe6e9ec, 12, 2);
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
  const lot = new THREE.Mesh(new THREE.PlaneGeometry(16, 24), new THREE.MeshPhysicalMaterial(withSet(TX.asphalt, 6, 9, { color: 0x7a7b7d, roughness: 1, normalScale: 1 })));
  wetMats.push(lot.material); lot.rotation.x = -Math.PI / 2; lot.position.set(60, 0.005, -55); lot.receiveShadow = true; scene.add(lot);
  for (let i = 0; i < 8; i++) [54.5, 65.5].forEach((x) => scenery(new THREE.PlaneGeometry(4.6, 0.12), new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.9 }), { x, y: 0.008, z: -45 - i * 2.8, rx: -Math.PI / 2, cast: false }));
  const spine = new THREE.Mesh(new THREE.PlaneGeometry(6, 62), new THREE.MeshPhysicalMaterial(withSet(TX.asphalt, 2, 20, { color: 0x7a7b7d, roughness: 1, normalScale: 1 })));
  wetMats.push(spine.material); spine.rotation.x = -Math.PI / 2; spine.position.set(62, 0.004, -12); spine.receiveShadow = true; scene.add(spine);
  const road = new THREE.Mesh(new THREE.PlaneGeometry(70, 5.5), new THREE.MeshPhysicalMaterial(withSet(TX.asphalt, 24, 2, { color: 0x7a7b7d, roughness: 1, normalScale: 1 })));
  wetMats.push(road.material); road.rotation.x = -Math.PI / 2; road.position.set(31, 0.005, 16); road.receiveShadow = true; scene.add(road);
  for (let x = -1; x < 66; x += 3) scenery(new THREE.PlaneGeometry(1.4, 0.14), new THREE.MeshStandardMaterial({ color: 0xd7c25a, roughness: 0.9 }), { x, y: 0.008, z: 16, rx: -Math.PI / 2, cast: false });
  // cars
  { const bodies = [], cabins = []; const cols = [0xc8c9cc, 0x1f2429, 0x8a1c1c, 0x2a4a7a, 0xe9e6dd, 0x3c3f44];
    const bodyMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35, clearcoat: 0.8 }), cabMat = new THREE.MeshPhysicalMaterial({ color: 0x0f1a26, metalness: 0.3, roughness: 0.15 });
    const slots = []; for (let i = 0; i < 8; i++) { if (i % 3 !== 1) slots.push([54.5, -46.4 - i * 2.8]); if (i % 2 === 0) slots.push([65.5, -46.4 - i * 2.8]); }
    const bIM = new THREE.InstancedMesh(G.box(4.4, 0.75, 1.85), bodyMat, slots.length), cIM = new THREE.InstancedMesh(G.box(2.3, 0.62, 1.65), cabMat, slots.length);
    slots.forEach(([x, z], i) => { addBox(x - 2.2, x + 2.2, 0, 1.6, z - 0.93, z + 0.93); bIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x, 0.62, z)); bIM.setColorAt(i, new THREE.Color(cols[i % cols.length])); cIM.setMatrixAt(i, new THREE.Matrix4().makeTranslation(x - 0.3, 1.28, z)); });
    bIM.castShadow = cIM.castShadow = true; scene.add(bIM); scene.add(cIM); }
  // light poles with warm heads and ground pools
  { const head = litMat(0xffe3b8); const poolTex = texShadowDisc;
    [[8, 20], [30, 20], [52, 20], [62, -2], [62, -30], [50, -46], [50, -64], [68, -55], [-10, -30], [-10, -60]].forEach(([x, z]) => {
      scenery(G.cyl(0.09, 9, 10, 0.06), galv, { x, y: 4.5, z }); addCyl(x, z, 0.12, 0, 9);
      scenery(G.box(1.2, 0.14, 0.3), galv, { x: x + 0.5, y: 9.0, z, cast: false });
      scenery(G.box(0.6, 0.08, 0.26), head, { x: x + 0.9, y: 8.9, z, cast: false }); halo(x + 0.9, 8.78, z, 1.9);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, depthWrite: false, color: 0x6b4a1e, blending: THREE.AdditiveBlending, opacity: 0.55 }));
      pool.rotation.x = -Math.PI / 2; pool.position.set(x + 0.9, 0.012, z); scene.add(pool);
    }); }
  // tree positions: junipers ring the fence line, oaks and a few mesquites follow the roads (built in buildTrees)
  for (let x = -14; x <= 70; x += 6) { TREE_SPOTS.juniper.push([x + (rnd() - 0.5) * 3, -72 + (rnd() - 0.5) * 4]); TREE_SPOTS[rnd() < 0.7 ? 'juniper' : 'oak'].push([x + (rnd() - 0.5) * 3, 25 + (rnd() - 0.5) * 4]); }
  for (let z = -70; z <= 22; z += 7) { TREE_SPOTS[rnd() < 0.75 ? 'juniper' : 'oak'].push([-20 + (rnd() - 0.5) * 4, z]); TREE_SPOTS[rnd() < 0.75 ? 'juniper' : 'mesquite'].push([74 + (rnd() - 0.5) * 4, z]); }
  [[-9, -52], [-12, -58], [70, -40], [71, -28], [40, 24], [22, 24], [-13, -34]].forEach((p) => TREE_SPOTS.oak.push(p));
  // perimeter fence with a gate at the road
  { const FX0 = -16, FX1 = 68, FZ0 = -70, FZ1 = 20;
    const postMat = M.steelPaint(0x9aa3ab), postMats = [];
    const segs = [[FX0, FZ0, FX1, FZ0], [FX0, FZ1, FX1, FZ1], [FX0, FZ0, FX0, FZ1], [FX1, FZ0, FX1, 13.0], [FX1, 19.0, FX1, FZ1]];
    segs.forEach(([x0, z0, x1, z1]) => { const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)); for (let i = 0; i <= n; i++) { const t = i / n; postMats.push(new THREE.Matrix4().makeTranslation(x0 + (x1 - x0) * t, 1.25, z0 + (z1 - z0) * t)); }
      scenery(G.box(len, 0.05, 0.05), postMat, { x: (x0 + x1) / 2, y: 2.45, z: (z0 + z1) / 2, ry: Math.atan2(-(z1 - z0), x1 - x0), cast: false });
      addBox(Math.min(x0, x1) - 0.04, Math.max(x0, x1) + 0.04, 0, 2.5, Math.min(z0, z1) - 0.04, Math.max(z0, z1) + 0.04);
      if (DETAIL === 2) scenery(new THREE.PlaneGeometry(len, 2.3), Object.assign(new THREE.MeshStandardMaterial({ map: tiled(texChainlink, len / 1.2, 2), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }), { userData: { keepDouble: true } }), { x: (x0 + x1) / 2, y: 1.3, z: (z0 + z1) / 2, ry: Math.atan2(-(z1 - z0), x1 - x0), cast: false });
    });
    const posts = new THREE.InstancedMesh(G.cyl(0.04, 2.5, 8), postMat, postMats.length); postMats.forEach((m, i) => posts.setMatrixAt(i, m)); posts.castShadow = true; scene.add(posts);
    [[FX1, 13.0], [FX1, 19.0]].forEach(([x, z]) => scenery(G.box(0.12, 2.6, 0.12), M.skidYellow(), { x, y: 1.3, z }));
    // cantilever slide gate, open: the leaf rests along the inside of the fence south of the opening
    { const gx = FX1 - 0.5, gz0 = 6.6, gz1 = 12.7, gzc = (gz0 + gz1) / 2, glen = gz1 - gz0, gal = M.galv();
      [0.12, 2.3].forEach((y) => scenery(G.cyl(0.035, glen, 10), gal, { x: gx, y, z: gzc, rx: Math.PI / 2, cast: false }));
      [gz0, gzc, gz1].forEach((z) => scenery(G.cyl(0.035, 2.3, 10), gal, { x: gx, y: 1.2, z, cast: false }));
      scenery(G.box(0.08, 0.12, 0.5), M.skidYellow(), { x: gx, y: 1.2, z: gz0 + 0.25, cast: false });
      [0.5, 1.9].forEach((y) => scenery(G.box(0.1, 0.1, 0.5), M.skidYellow(), { x: gx + 0.3, y, z: gz1 + 0.3, cast: false }));
      scenery(G.box(0.3, 0.6, 0.6), M.steelPaint(0x5a6470), { x: gx + 0.3, y: 1.2, z: gz1 + 0.3, cast: false });
      if (DETAIL === 2) scenery(new THREE.PlaneGeometry(glen, 2.1), Object.assign(new THREE.MeshStandardMaterial({ map: tiled(texChainlink, glen / 1.2, 2), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }), { userData: { keepDouble: true } }), { x: gx, y: 1.2, z: gzc, ry: Math.PI / 2, cast: false });
      addBox(gx - 0.08, gx + 0.08, 0, 2.4, gz0 - 0.1, gz1 + 0.1); } }

  // --- Electricity path: generator → switchyard → line → substation → duct bank → UPS room → busway
  elecPath.push(
    [10.2, 1.6, 0.0, 0.05, 1], [11.2, 0.4, -0.9, 0.05, 1], [11.2, 0.4, -9.3, 0.05, 1], [9.8, 2.4, -10.8, 0.08, 1],
    [9.8, 3.7, -10.8, 0.05, 1], [PX, 13.7, -14, 0.08, 1], [PX, 13.4, -21.5, 0.08, 1], [PX, 13.7, -29, 0.08, 1], [PX, 8.4, GZ, 0.08, 1],
    [PX, 3.9, -36.8, 0.1, 1], [PX, 1.6, -40.6, 0.1, 1], [PX, -0.3, -42.5, 0.06, 1], [HX1 - 3.3, -0.3, -45.5, 0.06, 1],
    [HX1 - 3.3, 1.6, -47.5, 0.12, 1], [HX1 - 6.0, 3.1, -48.5, 0.08, 1], [RX0 + 2, 3.1, -48.5, 0.08, 1],
  );
})();

// ------------------------------------------------------------------ site extras: control building, casks, tank, warehouse, gate, sign, grid tie, life
const movers = { car: null, walker: null, beacon: null, sock: null, cctv: null, radar: null };
(function buildExtras() {
  const galv = M.galv(), dark = M.steelPaint(0x30363c), panel = M.panel(0xb6bbc0, 8, 3);
  const glass = mat({ color: 0x0f1a26, metalness: 0.3, roughness: 0.12 });
  const lit = litMat();
  // --- Control & operations building (north of the reactor building)
  const CX = 40, CZ = 9.6, CW = 14, CD = 5.4, CH = 7.2;
  { const wx0 = CX - CW / 2, wx1 = CX + CW / 2, wz0 = CZ - CD / 2, wz1 = CZ + CD / 2;
    const win = [{ a0: CX - 6.4, a1: CX + 6.4, y0: 1.55, y1: 2.85 }, { a0: CX - 6.4, a1: CX + 6.4, y0: 4.75, y1: 6.05 }];
    const door = { a0: CX - 4.6, a1: CX - 3.4, y0: 0.3, y1: 2.5 };
    wallSeg('control', 'x', wx0, wx1, wz1, 0.25, 0, CH, win.concat([door]), panel);
    wallSeg('control', 'x', wx0, wx1, wz0, 0.25, 0, CH, win, panel);
    wallSeg('control', 'z', wz0, wz1, wx0, 0.25, 0, CH, [], panel);
    wallSeg('control', 'z', wz0, wz1, wx1, 0.25, 0, CH, [], panel);
    // glazing in the openings
    win.forEach((w) => [wz0, wz1].forEach((z) => add('control', G.box(w.a1 - w.a0, w.y1 - w.y0, 0.04), glass, { x: CX, y: (w.y0 + w.y1) / 2, z, cast: false })));
    // mullions
    for (let x = CX - 6.4; x <= CX + 6.4 + 0.01; x += 1.6) [wz0, wz1].forEach((z) => win.forEach((w) => add('control', G.box(0.06, w.y1 - w.y0, 0.1), dark, { x, y: (w.y0 + w.y1) / 2, z, cast: false })));
    add('control', G.box(CW + 0.3, 0.5, CD + 0.3), dark, { x: CX, y: CH + 0.2, z: CZ, cast: false });                  // roof band
    add('control', G.box(CW + 0.2, 0.08, CD + 0.2), dark, { x: CX, y: CH + 0.02, z: CZ, cast: false });                 // roof deck
    wallSeg('control', 'x', wx0 - 0.1, wx1 + 0.1, wz1 + 0.17, 0.1, 0, 0.6, [door], dark, { cast: false, collide: false }); // base band
    wallSeg('control', 'x', wx0 - 0.1, wx1 + 0.1, wz0 - 0.17, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    wallSeg('control', 'z', wz0 - 0.1, wz1 + 0.1, wx0 - 0.17, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    wallSeg('control', 'z', wz0 - 0.1, wz1 + 0.1, wx1 + 0.17, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    // floors: raised ground floor at 0.3, upper floor slab at 3.5
    add('control', G.box(CW - 0.3, 0.3, CD - 0.3), M.carpet(), { x: CX, y: 0.15, z: CZ, cast: false }); addSurf(wx0, wx1, wz0, wz1, 0.3);
    add('control', G.box(CW - 0.3, 0.3, CD - 0.3), mat(withSet(TX.paint, 10, 4, { color: 0xd9d9d9, metalness: 0.0, normalScale: 0.25 })), { x: CX, y: 3.65, z: CZ, cast: false }); addBox(wx0, wx1, 3.5, 3.8, wz0, wz1);
    // entrance: stoop, canopy, door
    scenery(G.box(1.8, 0.3, 1.2), M.concrete(0xa39d92, 2, 1), { x: CX - 4, y: 0.15, z: wz1 + 0.6 }); addBox(CX - 4.9, CX - 3.1, 0, 0.3, wz1, wz1 + 1.2);
    add('control', G.box(2.6, 0.15, 1.6), dark, { x: CX - 4, y: 2.75, z: wz1 + 0.8, cast: false });
    makeDoor(scene, { kind: 'swing', hinge: [CX - 4.6, 0.3, wz1], axis: 'x', sign: 1, width: 1.2, height: 2.2, swingSign: 1, mesh: doorLeaf(1.2, 2.2, M.steelPaint(0x6a7480)), label: 'Control room' });
    scenery(G.box(0.5, 0.12, 0.25), lit, { x: CX - 4, y: 2.55, z: wz1 + 0.3, cast: false }); halo(CX - 4, 2.55 - 0.1, wz1 + 0.3, 0.95);
    // --- control room interior
    const crCanvas = document.createElement('canvas'); crCanvas.width = 1024; crCanvas.height = 448;
    const crTex = new THREE.CanvasTexture(crCanvas); crTex.colorSpace = THREE.SRGBColorSpace; crTex.anisotropy = 8;
    const screen = add('control', new THREE.PlaneGeometry(6.6, 2.9), new THREE.MeshBasicMaterial({ map: crTex, toneMapped: false }), { x: CX, y: 2.0, z: wz0 + 0.22, cast: false, recv: false });
    screen.userData.noColl = true; interiors.crCanvas = crCanvas; interiors.crTex = crTex;
    add('control', G.box(6.9, 3.15, 0.1), M.steelPaint(0x1a1c20), { x: CX, y: 2.0, z: wz0 + 0.14, cast: false });
    // consoles: three desks in a shallow arc facing the wall
    const deskTop = M.steelPaint(0xd9d9d9), deskBody = M.steelPaint(0x3b434c), monMat = new THREE.MeshBasicMaterial({ map: crTex, toneMapped: false });
    [[-2.3, 0.22], [0, 0], [2.3, -0.22]].forEach(([dx, ry], i) => {
      const g = new THREE.Group(); g.position.set(CX + dx, 0.3, CZ - 0.3); g.rotation.y = ry; part('control').root.add(g);
      add('control', G.box(2.0, 0.05, 0.8), deskTop, { parent: g, y: 0.75 });
      [-0.8, 0.8].forEach((x) => add('control', G.box(0.4, 0.72, 0.7), deskBody, { parent: g, x, y: 0.36 }));
      [-0.45, 0.45].forEach((x) => { const m = add('control', new THREE.PlaneGeometry(0.62, 0.36), monMat, { parent: g, x, y: 1.05, z: -0.22, cast: false, recv: false }); m.rotation.x = -0.12; m.userData.noColl = true; add('control', G.box(0.66, 0.4, 0.03), deskBody, { parent: g, x, y: 1.05, z: -0.24, cast: false }); add('control', G.box(0.1, 0.12, 0.1), deskBody, { parent: g, x, y: 0.83, z: -0.26, cast: false }); });
      add('control', G.box(0.45, 0.02, 0.15), deskBody, { parent: g, y: 0.785, z: 0.15, cast: false }); // keyboard
      if (i === 1) { add('control', G.box(0.24, 0.03, 0.24), M.skidYellow(), { parent: g, x: 0.8, y: 0.79, z: 0.12, cast: false }); const sb = add('control', G.cyl(0.075, 0.06, 20), new THREE.MeshStandardMaterial({ color: 0xd62828, roughness: 0.35, emissive: 0x5a0000, emissiveIntensity: 0.8 }), { parent: g, x: 0.8, y: 0.835, z: 0.12, cast: false }); sb.userData.scram = true; interiors.scramBtn = sb; }
      // chair
      add('control', G.cyl(0.3, 0.03, 20), deskBody, { parent: g, y: 0.03, z: 0.75 }); add('control', G.cyl(0.03, 0.42, 8), M.steel(), { parent: g, y: 0.25, z: 0.75 });
      add('control', G.box(0.5, 0.08, 0.5), M.carpet(), { parent: g, y: 0.48, z: 0.75 }); add('control', G.box(0.48, 0.55, 0.07), M.carpet(), { parent: g, y: 0.78, z: 1.0 });
      addBox(CX + dx - 1.05, CX + dx + 1.05, 0.3, 1.1, CZ - 0.75, CZ + 0.95);
      g.traverse((o) => { if (o.isMesh && !o.userData.scram) o.userData.console = true; });
      if (i !== 1) interiors.seats = (interiors.seats || []).concat([g]);
    });
    screen.userData.console = true;
    // ceiling lights, wall clock, status board, plants
    [[-4, 0], [0, 0], [4, 0]].forEach(([dx]) => scenery(G.box(1.2, 0.04, 0.3), lit, { x: CX + dx, y: 3.46, z: CZ + 0.6, cast: false }));
    scenery(G.box(1.8, 1.0, 0.04), M.steelPaint(0xd9d9d9), { x: CX + 5.5, y: 2.0, z: wz0 + 0.15, cast: false });
    scenery(G.box(0.5, 0.5, 0.6), M.steelPaint(0x6a7480), { x: CX + 6.4, y: 0.55, z: wz0 + 0.5 }); scenery(G.sphere(0.45, 10), new THREE.MeshStandardMaterial({ color: 0x244a2e, roughness: 1 }), { x: CX + 6.4, y: 1.25, z: wz0 + 0.5 });
    scenery(G.box(1.4, 2.1, 0.5), M.steelPaint(0x8d969e), { x: CX - 6.2, y: 1.35, z: wz0 + 0.4 }); addBox(CX - 6.9, CX - 5.5, 0.3, 2.4, wz0, wz0 + 0.65); // server cabinet
    walkLightSpecs.push([CX, 2.6, CZ, 0xfff1dc, 12, 12]);
  }
  labelAt('control', new THREE.Vector3(CX, CH + 1.4, CZ));
  { const win = litMat(LIT_HEX, 1.15); for (let i = 0; i < 2; i++) scenery(G.box(1.1, 0.9, 0.04), win, { x: CX + 1.5 + i * 3.3, y: 5.4, z: CZ + CD / 2 + 0.06, cast: false }); }
  [[CX - 2, CZ + 1], [CX + 3.5, CZ - 0.6]].forEach(([x, z]) => { add('control', G.box(1.6, 1.0, 1.3), galv, { x, y: CH + 0.9, z }); add('control', G.cyl(0.42, 0.06, 24), dark, { x, y: CH + 1.42, z, cast: false }); });
  add('control', G.cyl(0.06, 3.5, 8), galv, { x: CX + 6.2, y: CH + 2.1, z: CZ + 1.8 });   // antenna mast
  add('control', G.cyl(0.9, 0.08, 24, 0.0), M.steelPaint(0xd8dde2), { x: CX + 6.2, y: CH + 3.2, z: CZ + 1.8, rx: -0.6, cast: false }); // dish
  // rotating radar bar on the mast top, and a flag on a pole in front of the building
  { add('control', G.cyl(0.05, 0.22, 10), dark, { x: CX + 6.2, y: CH + 3.96, z: CZ + 1.8, cast: false });
    const radar = new THREE.Group(); radar.position.set(CX + 6.2, CH + 4.12, CZ + 1.8); R.control.root.add(radar); movers.radar = radar;
    add('control', G.box(1.3, 0.05, 0.14), M.steelPaint(0xd8dde2), { parent: radar, cast: false }); add('control', G.box(0.06, 0.16, 0.06), dark, { parent: radar, y: 0.1, cast: false }); }
  { const FX = 47.8, FZ = 13.0, FH = 9.0;
    scenery(G.cyl(0.05, FH, 12, 0.035), M.steelPaint(0xd8dde2), { x: FX, y: FH / 2, z: FZ }); addCyl(FX, FZ, 0.08, 0, FH);
    scenery(new THREE.SphereGeometry(0.09, 12, 8), M.steelPaint(0xd8dde2), { x: FX, y: FH + 0.06, z: FZ, cast: false });
    scenery(G.cyl(0.22, 0.12, 16), M.concrete(0x9a958b), { x: FX, y: 0.06, z: FZ, cast: false });
    const c = document.createElement('canvas'); c.width = 384; c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#16213a'; g.fillRect(0, 0, 384, 256); g.fillStyle = '#f4efe4'; g.fillRect(0, 150, 384, 10);
    g.strokeStyle = '#f4efe4'; g.lineWidth = 9; g.beginPath(); g.arc(96, 86, 42, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(96, 86, 10, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(244,239,228,0.55)'; g.lineWidth = 4; g.beginPath(); g.ellipse(96, 86, 64, 22, -0.5, 0, Math.PI * 2); g.stroke();
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    const fm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.92, metalness: 0, side: THREE.DoubleSide }); fm.userData.keepDouble = true;
    const fg = new THREE.PlaneGeometry(1.8, 1.2, 22, 10); fg.translate(0.9 + 0.04, 0, 0);
    scenery(fg, fm, { x: FX, y: FH - 0.7, z: FZ, cast: false }); postPatch.push(() => applyFlagWave(fm, 1.8)); }
  // sidewalks: control building front to the road shoulder; reactor building door to the road
  scenery(new THREE.PlaneGeometry(CW, 1.6), M.concrete(0xa39d92, 7, 1), { x: CX, y: 0.012, z: CZ + CD / 2 + 0.9, rx: -Math.PI / 2, cast: false });
  scenery(new THREE.PlaneGeometry(1.6, 7.0), M.concrete(0xa39d92, 1, 4), { x: 3, y: 0.012, z: 9.7, rx: -Math.PI / 2, cast: false });
  [[1.8, 7.0], [4.2, 7.0]].forEach(([x, z]) => { scenery(G.cyl(0.08, 1.0, 10), M.skidYellow(), { x, y: 0.5, z }); addCyl(x, z, 0.1, 0, 1.0); });

  // --- Fire-water tank and pump house (west of the reactor building)
  scenery(G.cyl(3.3, 7.0, 48), M.steelPaint(0xb3b8bd), { x: -11.2, y: 3.5, z: 10.2 }); addCyl(-11.2, 10.2, 3.36, 0, 7.6); addBox(-12.7, -9.7, 0, 2.6, 4.3, 6.9); addCyl(-7.9, 10.2, 0.14, 0, 7.5);
  scenery(G.cyl(3.3, 0.6, 48, 0.5), M.steelPaint(0x8a949e), { x: -11.2, y: 7.3, z: 10.2 });
  scenery(G.box(3.0, 2.6, 2.6), panel, { x: -11.2, y: 1.3, z: 5.6 });
  scenery(G.cyl(0.08, 7.5, 8), galv, { x: -7.9, y: 3.75, z: 10.2, cast: false });
  for (let i = 0; i < 10; i++) scenery(G.cyl(0.02, 0.5, 6), galv, { x: -7.9, y: 0.6 + i * 0.7, z: 10.2 + 0.25, rx: Math.PI / 2, cast: false });
  pipe('building', [[-11.2, 0.6, 4.3], [-11.2, 0.6, 2.4], [-7.0, 0.6, 2.4]], 0.1, M.steelPaint(0x7a2424)); // fire main stub

  // --- Maintenance warehouse (east of the reactor building, south of the road)
  const WX = 24, WZ = 8.2;
  { const wx0 = WX - 6, wx1 = WX + 6, wz0 = WZ - 3.1, wz1 = WZ + 3.1, WH = 5.2;
    const roll = { a0: WX - 4.5, a1: WX - 0.5, y0: 0, y1: 4.0 }, pdoor = { a0: WX + 3.0, a1: WX + 4.0, y0: 0, y1: 2.2 };
    wallSeg(null, 'x', wx0, wx1, wz1, 0.2, 0, WH, [roll, pdoor], panel);
    wallSeg(null, 'x', wx0, wx1, wz0, 0.2, 0, WH, [], panel);
    wallSeg(null, 'z', wz0, wz1, wx0, 0.2, 0, WH, [], panel);
    wallSeg(null, 'z', wz0, wz1, wx1, 0.2, 0, WH, [], panel);
    scenery(G.box(12.4, 0.4, 6.6), dark, { x: WX, y: WH + 0.2, z: WZ, cast: false }); scenery(G.box(12.2, 0.1, 6.4), dark, { x: WX, y: WH, z: WZ, cast: false });
    scenery(new THREE.PlaneGeometry(11.8, 6.0), M.concrete(0x6f6b64, 6, 3), { x: WX, y: 0.015, z: WZ, rx: -Math.PI / 2, cast: false });
    wallSeg(null, 'x', wx0 - 0.1, wx1 + 0.1, wz1 + 0.15, 0.1, 0, 0.6, [roll, pdoor], dark, { cast: false, collide: false });
    wallSeg(null, 'x', wx0 - 0.1, wx1 + 0.1, wz0 - 0.15, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    wallSeg(null, 'z', wz0 - 0.1, wz1 + 0.1, wx0 - 0.15, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    wallSeg(null, 'z', wz0 - 0.1, wz1 + 0.1, wx1 + 0.15, 0.1, 0, 0.6, [], dark, { cast: false, collide: false });
    makeDoor(scene, { kind: 'roll', hinge: [roll.a0, 0, wz1], axis: 'x', sign: 1, width: 4.0, height: 4.0, mesh: doorLeaf(4.0, 4.0, M.steelPaint(0x6a7480), { window: false, bar: false, slats: 11 }), label: 'Warehouse door' });
    makeDoor(scene, { kind: 'swing', hinge: [pdoor.a0, 0, wz1], axis: 'x', sign: 1, width: 1.0, height: 2.2, swingSign: 1, mesh: doorLeaf(1.0, 2.2, M.steelPaint(0x6a7480)), label: 'Warehouse' });
    scenery(G.box(0.4, 0.25, 0.25), lit, { x: WX - 2.5, y: 4.6, z: wz1 + 0.2, cast: false }); halo(WX - 2.5, 4.6 - 0.1, wz1 + 0.2, 0.95);
    scenery(new THREE.PlaneGeometry(6, 3.2), M.concrete(0x7a766f, 3, 2), { x: WX - 2.5, y: 0.012, z: WZ + 4.9, rx: -Math.PI / 2, cast: false });
    // interior: pallet racking along the north wall, workbench, forklift, drums, strip lights
    const up = M.steelPaint(0x2f6fb5), beam = M.steelPaint(0xe08a1e), crate = M.ceramic(0xa78a5f), box = M.ceramic(0xc9b89a);
    [WX - 4.5, WX - 1.0, WX + 2.5].forEach((x) => {
      [-1.4, 1.4].forEach((dx) => [wz0 + 0.3, wz0 + 1.3].forEach((z) => scenery(G.box(0.08, 4.2, 0.08), up, { x: x + dx, y: 2.1, z })));
      [0.9, 2.2, 3.5].forEach((y) => [wz0 + 0.3, wz0 + 1.3].forEach((z) => scenery(G.box(2.9, 0.1, 0.08), beam, { x, y, z, cast: false })));
      [0.95, 2.25].forEach((y, k) => { scenery(G.box(1.2, 0.14, 1.0), crate, { x: x - 0.7, y: y + 0.07, z: wz0 + 0.8, cast: false }); scenery(G.box(0.9 - k * 0.2, 0.8, 0.8), box, { x: x - 0.7, y: y + 0.55, z: wz0 + 0.8 }); if (k === 0) { scenery(G.box(1.2, 0.14, 1.0), crate, { x: x + 0.7, y: y + 0.07, z: wz0 + 0.8, cast: false }); scenery(G.cyl(0.28, 0.85, 16), M.steelPaint(0x2f5d3a), { x: x + 0.5, y: y + 0.57, z: wz0 + 0.7 }); scenery(G.cyl(0.28, 0.85, 16), M.steelPaint(0x7a2424), { x: x + 0.95, y: y + 0.57, z: wz0 + 0.95 }); } });
      addBox(x - 1.5, x + 1.5, 0, 4.2, wz0, wz0 + 1.4);
    });
    // workbench with vice and shelf
    scenery(G.box(2.4, 0.08, 0.8), M.ceramic(0xb49a72), { x: wx1 - 1.5, y: 0.92, z: wz0 + 0.6 }); [-1.0, 1.0].forEach((dx) => scenery(G.box(0.1, 0.9, 0.7), dark, { x: wx1 - 1.5 + dx, y: 0.45, z: wz0 + 0.6 }));
    scenery(G.box(2.4, 0.04, 0.3), M.steelPaint(0x8d969e), { x: wx1 - 1.5, y: 1.7, z: wz0 + 0.35, cast: false }); scenery(G.box(0.25, 0.2, 0.2), M.steelDark(), { x: wx1 - 0.8, y: 1.06, z: wz0 + 0.6 });
    addBox(wx1 - 2.7, wx1 - 0.3, 0, 1.0, wz0, wz0 + 1.0);
    // forklift
    { const g = new THREE.Group(); g.position.set(WX + 1.5, 0, WZ + 1.2); g.rotation.y = -0.6; scene.add(g);
      scenery(G.box(1.6, 0.9, 1.0), M.skidYellow(), { parent: g, y: 0.75 }); scenery(G.box(0.9, 0.5, 0.9), dark, { parent: g, x: -0.2, y: 1.45 });
      [[-0.6, -0.55], [0.6, -0.55], [-0.6, 0.55], [0.6, 0.55]].forEach(([x, z]) => scenery(G.cyl(0.28, 0.22, 14), M.rubber(), { parent: g, x, y: 0.3, z, rx: Math.PI / 2 }));
      [[-0.3, -0.4], [-0.3, 0.4], [0.3, -0.4], [0.3, 0.4]].forEach(([x, z]) => scenery(G.box(0.06, 1.2, 0.06), dark, { parent: g, x: 0.95 + x * 0.2, y: 1.4, z: z * 0.5 }));
      [-0.25, 0.25].forEach((z) => scenery(G.box(0.9, 0.04, 0.1), M.steelDark(), { parent: g, x: 1.45, y: 0.1, z }));
      scenery(G.box(0.9, 0.08, 0.9), dark, { parent: g, x: -0.2, y: 2.05, cast: false }); [[-0.6, -0.4], [-0.6, 0.4], [0.3, -0.4], [0.3, 0.4]].forEach(([x, z]) => scenery(G.box(0.05, 0.8, 0.05), dark, { parent: g, x: -0.2 + x, y: 1.75, z }));
      addCyl(WX + 1.5, WZ + 1.2, 1.3, 0, 2.1); }
    for (let i = 0; i < 3; i++) scenery(G.cyl(0.28, 0.85, 16), M.steelPaint(i ? 0x2f5d3a : 0x7a2424), { x: wx0 + 0.6 + (i % 2) * 0.62, y: 0.43, z: wz1 - 0.6 - Math.floor(i / 2) * 0.62 }); addBox(wx0 + 0.2, wx0 + 1.6, 0, 0.9, wz1 - 1.3, wz1 - 0.2);
    [WX - 3, WX + 3].forEach((x) => scenery(G.box(2.4, 0.05, 0.2), lit, { x, y: WH - 0.15, z: WZ, cast: false }));
    scenery(G.box(0.8, 1.2, 0.04), new THREE.MeshStandardMaterial({ map: texTrefoil, roughness: 0.7 }), { x: wx1 - 0.12, y: 1.6, z: WZ + 1.5, ry: -Math.PI / 2, cast: false });
    walkLightSpecs.push([WX, WH - 0.4, WZ, 0xfff1dc, 36, 13]);
  }
  // dumpster and pallets
  scenery(G.box(2.2, 1.4, 1.3), M.steelPaint(0x2f5d3a), { x: WX + 7.2, y: 0.7, z: WZ + 1.5 }); addBox(WX + 6.1, WX + 8.3, 0, 1.4, WZ + 0.85, WZ + 2.15);
  for (let i = 0; i < 3; i++) scenery(G.box(1.2, 0.14, 1.0), M.ceramic(0xa78a5f), { x: WX + 6.8, y: 0.07 + i * 0.16, z: WZ - 1.6 + i * 0.05, cast: false });

  // --- Used fuel cask pad (west of the plant, fenced)
  const KX = -10, KZ = -24;
  scenery(G.box(10, 0.3, 8), M.concrete(0x9a958b, 5, 4), { x: KX, y: 0.15, z: KZ, cast: false }); addBox(KX - 5, KX + 5, 0, 0.3, KZ - 4, KZ + 4);
  [[-3, -2], [-1, 2], [1, -2], [3, 2]].forEach(([dx, dz], i) => {
    if (i > 1) return; // two casks in place, two empty positions
    add('casks', G.cyl(1.3, 5.4, 48), M.concrete(0xb5afa4, 6, 3), { x: KX + dx * 1.0, y: 0.3 + 2.7, z: KZ + dz * 1.6 });
    add('casks', G.cyl(1.32, 0.35, 48), M.steelPaint(0x8a949e), { x: KX + dx * 1.0, y: 5.9, z: KZ + dz * 1.6, cast: false });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add('casks', G.box(0.3, 0.42, 0.22), dark, { x: KX + dx * 1.0 + Math.cos(a) * 1.3, y: 0.9, z: KZ + dz * 1.6 + Math.sin(a) * 1.3, ry: -a, cast: false }); }
  });
  [[-3, -2], [-1, 2], [1, -2], [3, 2]].forEach(([dx, dz], i) => { if (i < 2) return; add('casks', G.cyl(1.4, 0.12, 48), M.concrete(0x7f7a72), { x: KX + dx * 1.0, y: 0.36, z: KZ + dz * 1.6, cast: false }); });
  for (let x = KX - 6; x <= KX + 6; x += 3) [KZ - 5, KZ + 5].forEach((z) => add('casks', G.cyl(0.03, 2.4, 6), galv, { x, y: 1.2, z, cast: false }));
  [KZ - 5, KZ - 2, KZ + 2, KZ + 5].forEach((z) => [KX - 6, KX + 6].forEach((x) => add('casks', G.cyl(0.03, 2.4, 6), galv, { x, y: 1.2, z, cast: false })));
  labelAt('casks', new THREE.Vector3(KX - 1, 6.6, KZ));
  R.casks.focus = { center: new THREE.Vector3(KX, 2.5, KZ), radius: 7 };

  // --- Gatehouse, barrier, entrance sign
  const GX = 64.5, GZ2 = 11.4;
  { const gx0 = GX - 1.6, gx1 = GX + 1.6, gz0 = GZ2 - 1.5, gz1 = GZ2 + 1.5, GH = 2.8;
    const win = { a0: GX - 1.2, a1: GX + 1.2, y0: 1.2, y1: 2.2 }, door = { a0: GZ2 - 0.5, a1: GZ2 + 0.5, y0: 0, y1: 2.1 };
    wallSeg(null, 'x', gx0, gx1, gz1, 0.16, 0, GH, [win], panel); wallSeg(null, 'x', gx0, gx1, gz0, 0.16, 0, GH, [], panel);
    wallSeg(null, 'z', gz0, gz1, gx0, 0.16, 0, GH, [door], panel); wallSeg(null, 'z', gz0, gz1, gx1, 0.16, 0, GH, [{ a0: GZ2 - 0.9, a1: GZ2 + 0.9, y0: 1.2, y1: 2.2 }], panel);
    scenery(G.box(gx1 - gx0 - 0.2, 1.0, 0.04), glass, { x: GX, y: 1.7, z: gz1, cast: false }); scenery(G.box(0.04, 1.0, 1.8), glass, { x: gx1, y: 1.7, z: GZ2, cast: false });
    scenery(G.box(3.6, 0.3, 3.4), dark, { x: GX, y: GH + 0.15, z: GZ2, cast: false }); scenery(G.box(3.3, 0.08, 3.1), dark, { x: GX, y: GH, z: GZ2, cast: false });
    scenery(new THREE.PlaneGeometry(3.0, 2.8), M.carpet(), { x: GX, y: 0.015, z: GZ2, rx: -Math.PI / 2, cast: false });
    makeDoor(scene, { kind: 'swing', hinge: [gx0, 0, door.a0], axis: 'z', sign: 1, width: 1.0, height: 2.1, swingSign: -1, mesh: doorLeaf(1.0, 2.1, M.steelPaint(0x6a7480)), label: 'Gatehouse' });
    scenery(G.box(1.6, 0.05, 0.6), M.steelPaint(0xd9d9d9), { x: GX + 0.6, y: 0.78, z: GZ2 + 0.9 }); scenery(G.box(1.4, 0.7, 0.5), M.steelPaint(0x3b434c), { x: GX + 0.6, y: 0.4, z: GZ2 + 0.9 });
    scenery(G.box(0.5, 0.3, 0.03), new THREE.MeshBasicMaterial({ color: 0x9fd4ff }), { x: GX + 0.6, y: 1.0, z: GZ2 + 0.95, cast: false });
    scenery(G.box(0.45, 0.08, 0.45), M.carpet(), { x: GX + 0.6, y: 0.5, z: GZ2 + 0.1 }); scenery(G.box(0.43, 0.5, 0.06), M.carpet(), { x: GX + 0.6, y: 0.8, z: GZ2 - 0.1 }); scenery(G.cyl(0.03, 0.45, 8), M.steel(), { x: GX + 0.6, y: 0.25, z: GZ2 + 0.1 });
    addBox(GX - 0.2, GX + 1.4, 0, 0.9, GZ2 - 0.2, GZ2 + 1.2);
    scenery(G.box(0.9, 0.04, 0.2), lit, { x: GX, y: GH - 0.12, z: GZ2, cast: false });
    walkLightSpecs.push([GX, GH - 0.3, GZ2, 0xfff1dc, 10, 6]);
  }
  // windsock by the gate, and a sweeping camera on the gatehouse roof
  { const SX = 63.0, SZ = 8.4, SH = 3.6;
    scenery(G.cyl(0.03, SH, 8), galv, { x: SX, y: SH / 2, z: SZ }); addCyl(SX, SZ, 0.06, 0, SH);
    const pivot = new THREE.Group(); pivot.position.set(SX, SH, SZ); scene.add(pivot); movers.sock = pivot;
    scenery(G.torus(0.22, 0.012, 16, 6), galv, { parent: pivot, ry: Math.PI / 2, cast: false });
    const c = document.createElement('canvas'); c.width = 16; c.height = 128; const g = c.getContext('2d');
    for (let i = 0; i < 5; i++) { g.fillStyle = i % 2 ? '#f2eee6' : '#f07a1e'; g.fillRect(0, i * 25.6, 16, 25.6); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
    const sg = new THREE.CylinderGeometry(0.08, 0.22, 1.5, 16, 1, true); sg.rotateZ(-Math.PI / 2); sg.translate(0.75, 0, 0);
    const sm = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.9, side: THREE.DoubleSide }); sm.userData.keepDouble = true;
    scenery(sg, sm, { parent: pivot, cast: false }); }
  { const cam = new THREE.Group(); cam.position.set(GX + 1.5, 3.25, GZ2 + 1.35); scene.add(cam); movers.cctv = cam;
    scenery(G.box(0.08, 0.3, 0.08), dark, { x: GX + 1.5, y: 3.05, z: GZ2 + 1.35, cast: false });
    scenery(G.box(0.14, 0.12, 0.32), M.steelPaint(0xd8dde2), { parent: cam, z: 0.1, cast: false });
    scenery(G.cyl(0.05, 0.08, 12), dark, { parent: cam, z: 0.3, rx: Math.PI / 2, cast: false });
    scenery(G.box(0.02, 0.02, 0.02), new THREE.MeshBasicMaterial({ color: 0xff3030 }), { parent: cam, x: 0.05, y: 0.04, z: -0.07, cast: false }); }
  scenery(G.box(0.4, 1.1, 0.4), dark, { x: 66.2, y: 0.55, z: 13.4 }); addBox(66.0, 66.4, 0, 1.1, 13.2, 13.6);
  scenery(G.box(0.08, 0.08, 5.6), M.steelPaint(0xd8dde2), { x: 66.2, y: 1.15, z: 16.2 });
  for (let i = 0; i < 5; i++) scenery(G.box(0.1, 0.1, 0.5), M.steelPaint(0x9b2f2f), { x: 66.2, y: 1.15, z: 13.7 + i * 1.1, cast: false });
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 320; const g = c.getContext('2d');
    g.fillStyle = '#0d0a05'; g.fillRect(0, 0, 1024, 320); g.strokeStyle = 'rgba(255,252,244,0.35)'; g.lineWidth = 3; g.strokeRect(24, 24, 976, 272);
    g.fillStyle = '#fffcf4'; g.font = '600 92px Inter, Aspekta, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('MICROREACTORS.ORG', 64, 140);
    g.fillStyle = '#78797f'; g.font = '500 44px Inter, Aspekta, system-ui, sans-serif'; g.fillText('DEMONSTRATION POWER PLANT  ·  10 MWe', 66, 232);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    scenery(G.box(6.4, 1.3, 0.5), M.concrete(0x6f6a62, 4, 1), { x: 58.5, y: 0.65, z: 11.2 }); addBox(55.3, 61.7, 0, 3.2, 10.95, 11.45);
    scenery(G.box(6.0, 1.9, 0.3), M.steelPaint(0x1a1612), { x: 58.5, y: 2.25, z: 11.2 });
    scenery(new THREE.PlaneGeometry(5.6, 1.75), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.2 }), { x: 58.5, y: 2.25, z: 11.37, cast: false });
    scenery(G.box(5.8, 0.06, 0.22), lit, { x: 58.5, y: 3.26, z: 11.3, cast: false }); halo(58.5, 3.2, 11.45, 1.2, 0xffe9c8); }
  // EV chargers in the campus parking
  [[-46.4], [-52.0]].forEach(([z]) => { scenery(G.box(0.35, 1.5, 0.25), M.steelPaint(0xe9e6dd), { x: 57.6, y: 0.75, z }); addBox(57.4, 57.8, 0, 1.5, z - 0.13, z + 0.13); scenery(G.box(0.3, 0.3, 0.02), new THREE.MeshBasicMaterial({ color: 0x4fe0a8 }), { x: 57.6, y: 1.2, z: z - 0.14, cast: false }); });
  // parking curbs and campus sidewalk
  scenery(G.box(16.4, 0.15, 0.2), M.concrete(0xa39d92, 8, 1), { x: 60, y: 0.075, z: -43.0, cast: false });
  scenery(G.box(16.4, 0.15, 0.2), M.concrete(0xa39d92, 8, 1), { x: 60, y: 0.075, z: -67.0, cast: false });
  scenery(new THREE.PlaneGeometry(2.0, 10), M.concrete(0xa39d92, 1, 5), { x: 51.0, y: 0.012, z: -50, rx: -Math.PI / 2, cast: false });
  // more light poles along the spine and the campus front
  { const head = litMat(0xffe3b8);
    [[62, -16], [62, -40], [40, -40], [20, -40], [0, -40], [-12, -10], [14, 6], [38, 20]].forEach(([x, z]) => {
      scenery(G.cyl(0.09, 9, 10, 0.06), galv, { x, y: 4.5, z }); addCyl(x, z, 0.12, 0, 9); scenery(G.box(1.2, 0.14, 0.3), galv, { x: x + 0.5, y: 9.0, z, cast: false }); scenery(G.box(0.6, 0.08, 0.26), head, { x: x + 0.9, y: 8.9, z, cast: false }); halo(x + 0.9, 8.78, z, 1.9);
      const pool = new THREE.Mesh(new THREE.PlaneGeometry(14, 14), new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, depthWrite: false, color: 0x6b4a1e, blending: THREE.AdditiveBlending, opacity: 0.5 })); pool.rotation.x = -Math.PI / 2; pool.position.set(x + 0.9, 0.012, z); scene.add(pool); }); }
  // road and campus trees
  for (let x = -4; x <= 66; x += 7) TREE_SPOTS[x % 3 === 0 ? 'mesquite' : 'oak'].push([x + (rnd() - 0.5) * 2, 22 + (rnd() - 0.5) * 2]);
  for (let z = -40; z >= -66; z -= 6.5) TREE_SPOTS.oak.push([48.5 + (rnd() - 0.5), z]);
  [[-6, 16.5], [30, -46], [36, -46], [-8, -38], [-14, -46], [52, -70], [60, -70]].forEach((p) => TREE_SPOTS.oak.push(p));
  // reeds around the pond
  { const reed = new THREE.MeshStandardMaterial({ color: 0x3f4a2a, roughness: 1 }); const n = 90, im = new THREE.InstancedMesh(G.cyl(0.05, 1.2, 5, 0.02), reed, n);
    for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, r = 0.95 + Math.random() * 0.12; const x = POND.x + Math.cos(a) * POND.rx * r, z = POND.z + Math.sin(a) * POND.rz * r; const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, terrainY(x, z) + 0.5, z), new THREE.Quaternion(), new THREE.Vector3(1, 0.8 + Math.random() * 0.6, 1)); im.setMatrixAt(i, m); } scene.add(im); }

  // --- Grid tie: lattice towers from the switchyard dead-end eastward to the horizon
  const towers = [[26, -15.5, 22], [52, -36, 24], [84, -72, 25], [124, -84, 26], [168, -92, 27], [216, -98, 28], [268, -104, 28]];
  const legM = [], braceM = [], armM = [];
  const legG = G.box(0.22, 1, 0.22), braceG = G.box(0.1, 1, 0.1), armG = G.box(1, 0.25, 0.25);
  function legMat(x0, y0, z0, x1, y1, z1, g) { const a = new THREE.Vector3(x0, y0, z0), b = new THREE.Vector3(x1, y1, z1), len = a.distanceTo(b); const m = new THREE.Matrix4(); const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize()); m.compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, len, 1)); g.push(m); }
  const tAttach = [];
  towers.forEach(([tx, tz, th]) => {
    const bw = 4.2, tw = 1.4;
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) => legMat(tx + sx * bw / 2, 0, tz + sz * bw / 2, tx + sx * tw / 2, th, tz + sz * tw / 2, legM));
    for (let k = 0; k < 6; k++) { const y0 = k * th / 6, y1 = (k + 1) * th / 6, w0 = bw + (tw - bw) * (k / 6), w1 = bw + (tw - bw) * ((k + 1) / 6);
      [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([fx, fz]) => { const ax = fx ? tx + fx * w0 / 2 : tx - w0 / 2, az = fz ? tz + fz * w0 / 2 : tz - w0 / 2, bx = fx ? tx + fx * w1 / 2 : tx + w1 / 2, bz = fz ? tz + fz * w1 / 2 : tz + w1 / 2; legMat(ax, y0, az, bx, y1, bz, braceM); }); }
    const arm = new THREE.Matrix4(); arm.compose(new THREE.Vector3(tx, th - 2.2, tz), new THREE.Quaternion(), new THREE.Vector3(9, 1, 1)); armM.push(arm);
    const peak = new THREE.Matrix4(); peak.compose(new THREE.Vector3(tx, th + 1.2, tz), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0), new THREE.Vector3(1, 2.4, 1)); legM.push(peak);
    tAttach.push([[tx - 3.6, th - 3.0, tz], [tx, th - 3.0, tz], [tx + 3.6, th - 3.0, tz]]);
  });
  const towerMat = M.steelPaint(0x8a949e);
  [[legG, legM], [braceG, braceM], [armG, armM]].forEach(([g, mats]) => addInstanced('txline', g, towerMat, mats, { cast: false }));
  const wire2 = mat({ color: 0x33363a, metalness: 0.8, roughness: 0.5 });
  const first = [[PX + 1.2, 13.2, -14], [PX + 1.2, 13.4, -14.2], [PX + 1.2, 13.2, -14.4]];
  const chain = [first, ...tAttach];
  for (let k = 0; k < chain.length - 1; k++) for (let ph = 0; ph < 3; ph++) { const A = new THREE.Vector3(...chain[k][ph]), B = new THREE.Vector3(...chain[k + 1][ph]), mid = A.clone().add(B).multiplyScalar(0.5); mid.y -= 0.9 + A.distanceTo(B) * 0.035; add('txline', new THREE.TubeGeometry(new THREE.QuadraticBezierCurve3(A, mid, B), 14, 0.03, 5, false), wire2, { cast: false }); }

  // --- Life: a car that drives the road, a person who walks the sidewalk, an aviation beacon on the stack
  { const g = new THREE.Group(); scene.add(g);
    scenery(G.box(4.4, 0.75, 1.85), new THREE.MeshPhysicalMaterial({ color: 0xe9e6dd, metalness: 0.7, roughness: 0.35, clearcoat: 0.8 }), { parent: g, y: 0.62 });
    scenery(G.box(2.3, 0.62, 1.65), new THREE.MeshPhysicalMaterial({ color: 0x0f1a26, metalness: 0.3, roughness: 0.15 }), { parent: g, x: -0.3, y: 1.28 });
    g.userData.wheels = [[-1.4, -0.95], [1.4, -0.95], [-1.4, 0.95], [1.4, 0.95]].map(([x, z]) => { const w = new THREE.Group(); w.position.set(x, 0.34, z); g.add(w); scenery(G.cyl(0.34, 0.24, 14), M.rubber(), { parent: w, rx: Math.PI / 2 }); scenery(G.cyl(0.2, 0.26, 12), M.steelPaint(0x9aa3ab), { parent: w, rx: Math.PI / 2, cast: false }); return w; });
    [-0.6, 0.6].forEach((z) => scenery(G.box(0.05, 0.18, 0.4), new THREE.MeshBasicMaterial({ color: 0xfff4d6 }), { parent: g, x: 2.22, y: 0.7, z, cast: false }));
    [-0.6, 0.6].forEach((z) => scenery(G.box(0.05, 0.14, 0.34), new THREE.MeshBasicMaterial({ color: 0xff3b2f }), { parent: g, x: -2.22, y: 0.7, z, cast: false }));
    movers.car = g; }
  { const b = new THREE.Mesh(G.sphere(0.16, 12), new THREE.MeshBasicMaterial({ color: 0xff2a2a })); b.position.set(STACK_X, MOD_Y + 10.1, 0); scene.add(b); movers.beacon = b; }

  // --- Wear: grime at wall bases, oil stains, rust streaks
  const grimeMat = (len) => new THREE.MeshStandardMaterial({ map: tiled(TX.grime, len / 2.5, 1), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  function grimeWall(x, z, len, ry, h = 0.9, y = 0.45) { const m = new THREE.Mesh(new THREE.PlaneGeometry(len, h), grimeMat(len)); m.position.set(x, y, z); m.rotation.y = ry; m.renderOrder = 2; scene.add(m); }
  // data hall (faces outward: +z wall normal +z -> ry 0; -z wall -> ry PI; +x -> ry PI/2; -x -> -PI/2)
  grimeWall(20, -44 + 0.17, 48, 0); grimeWall(20, -66 - 0.17, 48, Math.PI); grimeWall(44.17, -55, 22, Math.PI / 2); grimeWall(-4.17, -55, 22, -Math.PI / 2);
  grimeWall(CX, CZ + CD / 2 + 0.02, CW, 0); grimeWall(CX, CZ - CD / 2 - 0.02, CW, Math.PI);
  grimeWall(WX, WZ + 3.12, 12, 0); grimeWall(WX, WZ - 3.12, 12, Math.PI);
  [-34.6, -37.9, -41.2].forEach((z) => { grimeWall(6, z + 1.26, 12.2, 0, 0.6, 0.3); grimeWall(6, z - 1.26, 12.2, Math.PI, 0.6, 0.3); });
  // silo base ring
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(3.125, 3.125, 1.1, 96, 1, true), new THREE.MeshStandardMaterial({ map: tiled(TX.grime, 8, 1), transparent: true, depthWrite: false, roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(0, MOD_Y - 6.0 + 0.55, 0); m.renderOrder = 2; m.material.clippingPlanes = clipPlanes; scene.add(m); }
  // oil stains
  const stainMat = new THREE.MeshStandardMaterial({ map: TX.stain, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  [[8.9, 0.011, 0.4, 3.2], [10.6, 0.011, -1.1, 2.0], [26, 0.011, -39.6, 3.6], [22.6, 0.011, -36.2, 2.4], [56.5, 0.011, -49.6, 2.6], [30.5, 0.011, 16.2, 3.0]].forEach(([x, y, z, r]) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(r, r), stainMat); m.rotation.x = -Math.PI / 2; m.rotation.z = Math.random() * Math.PI; m.position.set(x, y, z); m.renderOrder = 2; scene.add(m); });
  // rust streaks under the switchyard transformer bushings and on the stack base
  const rustMat = new THREE.MeshStandardMaterial({ map: TX.rust, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  { const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.4), rustMat); m.position.set(9.8, 1.5, -10.8 - 0.81); m.rotation.y = Math.PI; m.renderOrder = 2; scene.add(m); }
  { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.505, 0.505, 1.6, 32, 1, true), new THREE.MeshStandardMaterial({ map: tiled(TX.rust, 3, 1), transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 })); m.position.set(STACK_X, MOD_Y + 1.9, 0); m.renderOrder = 2; m.material.clippingPlanes = clipPlanes; scene.add(m); }
})();


// ------------------------------------------------------------------ demonstration park: three sister plants you can walk to
(function buildReactorPark() {
  const galv = M.galv(), dark = M.steelPaint(0x30363c), panel = M.panel(0xb6bbc0, 10, 3), lit = litMat();
  const glass = mat({ color: 0x0f1a26, metalness: 0.3, roughness: 0.12 });
  const pad = (x, z, w, d) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshPhysicalMaterial(withSet(TX.concrete, w / 2.5, d / 2.5, { color: 0x85827a, roughness: 1, normalScale: 0.7 }))); m.rotation.x = -Math.PI / 2; m.position.set(x, 0.02, z); m.receiveShadow = true; m.layers.enable(1); wetMats.push(m.material); scene.add(m); };
  function signBoard(x, z, ry, title, sub, w = 4.2) {
    const c = document.createElement('canvas'); c.width = 1024; c.height = 400; const g = c.getContext('2d');
    g.fillStyle = '#0d0a05'; g.fillRect(0, 0, 1024, 400); g.strokeStyle = 'rgba(255,252,244,0.35)'; g.lineWidth = 3; g.strokeRect(22, 22, 980, 356);
    g.fillStyle = '#fffcf4'; g.font = '600 64px Inter, Aspekta, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText(title, 56, 130);
    g.fillStyle = '#78797f'; g.font = '500 36px Inter, Aspekta, system-ui, sans-serif'; (Array.isArray(sub) ? sub : [sub]).forEach((line, i) => g.fillText(line, 58, 230 + i * 58));
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const grp = new THREE.Group(); grp.position.set(x, 0, z); grp.rotation.y = ry; scene.add(grp);
    [-w / 2 + 0.3, w / 2 - 0.3].forEach((dx) => scenery(G.cyl(0.05, 2.4, 10), galv, { parent: grp, x: dx, y: 1.2 }));
    scenery(G.box(w, w * 0.39, 0.12), M.steelPaint(0x1a1612), { parent: grp, y: 1.95 });
    scenery(new THREE.PlaneGeometry(w - 0.2, w * 0.39 - 0.2), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.25 }), { parent: grp, y: 1.95, z: 0.07, cast: false });
    const bx = Math.cos(ry), bz = -Math.sin(ry); addBox(x - Math.abs(bx) * w / 2 - 0.1, x + Math.abs(bx) * w / 2 + 0.1, 0, 2.8, z - Math.abs(bz) * w / 2 - 0.1, z + Math.abs(bz) * w / 2 + 0.1);
  }
  function fenceRun(x0, z0, x1, z1) {
    const len = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.round(len / 3)), ry = Math.atan2(-(z1 - z0), x1 - x0), mats = [];
    for (let i = 0; i <= n; i++) mats.push(new THREE.Matrix4().makeTranslation(x0 + (x1 - x0) * i / n, 1.2, z0 + (z1 - z0) * i / n));
    const im = new THREE.InstancedMesh(G.cyl(0.035, 2.4, 8), M.steelPaint(0x9aa3ab), mats.length); mats.forEach((mm, i) => im.setMatrixAt(i, mm)); scene.add(im);
    scenery(G.box(len, 0.05, 0.05), M.steelPaint(0x9aa3ab), { x: (x0 + x1) / 2, y: 2.35, z: (z0 + z1) / 2, ry, cast: false });
    if (DETAIL === 2) scenery(new THREE.PlaneGeometry(len, 2.2), Object.assign(new THREE.MeshStandardMaterial({ map: tiled(texChainlink, len / 1.2, 2), transparent: true, alphaTest: 0.3, side: THREE.DoubleSide, roughness: 0.6, metalness: 0.5 }), { userData: { keepDouble: true } }), { x: (x0 + x1) / 2, y: 1.25, z: (z0 + z1) / 2, ry, cast: false });
    addBox(Math.min(x0, x1) - 0.04, Math.max(x0, x1) + 0.04, 0, 2.4, Math.min(z0, z1) - 0.04, Math.max(z0, z1) + 0.04);
  }
  function canopy(x, z, w, d, h, cols = 3) {
    const frame = M.steelPaint(0x4f5a66);
    for (let i = 0; i < cols; i++) [-d / 2, d / 2].forEach((dz) => { const cx = x - w / 2 + (w * i) / (cols - 1); scenery(G.box(0.3, h, 0.3), frame, { x: cx, y: h / 2, z: z + dz }); addBox(cx - 0.15, cx + 0.15, 0, h, z + dz - 0.15, z + dz + 0.15); });
    [-d / 2, d / 2].forEach((dz) => scenery(G.box(w + 0.3, 0.4, 0.3), frame, { x, y: h + 0.2, z: z + dz }));
    for (let i = 0; i < cols; i++) scenery(G.box(0.3, 0.4, d + 0.3), frame, { x: x - w / 2 + (w * i) / (cols - 1), y: h + 0.2, z });
    scenery(G.box(w + 0.8, 0.1, d + 0.8), M.steelPaint(0x5a636c), { x, y: h + 0.45, z, cast: true });
    scenery(G.box(1.2, 0.04, 0.3), lit, { x, y: h - 0.05, z, cast: false });
  }
  // ---- park frame: service road, fence, entrance sign
  const road = new THREE.Mesh(new THREE.PlaneGeometry(6, 78), new THREE.MeshPhysicalMaterial(withSet(TX.asphalt, 2, 26, { color: 0x7a7b7d, roughness: 1, normalScale: 1 }))); road.rotation.x = -Math.PI / 2; road.position.set(106.5, 0.025, -23); road.receiveShadow = true; wetMats.push(road.material); scene.add(road);
  for (let z = 12; z > -62; z -= 3) scenery(new THREE.PlaneGeometry(0.14, 1.4), new THREE.MeshStandardMaterial({ color: 0xd7c25a, roughness: 0.9 }), { x: 106.5, y: 0.03, z, rx: -Math.PI / 2, cast: false });
  fenceRun(77, 3, 103, 3); fenceRun(110, 3, 139.5, 3); fenceRun(77, -63, 139.5, -63); fenceRun(77, 3, 77, -63); fenceRun(139.5, 3, 139.5, -63);
  signBoard(100.5, 6.5, 0, 'MICROREACTOR DEMONSTRATION PARK', ['Three more ways to split the atom.', 'Walk in. Doors open with E.'], 5.2);
  [[106.5 - 4.5, -12], [106.5 + 4.5, -34], [106.5 - 4.5, -56]].forEach(([x, z]) => { scenery(G.cyl(0.09, 9, 10, 0.06), galv, { x, y: 4.5, z }); addCyl(x, z, 0.12, 0, 9); scenery(G.box(1.2, 0.14, 0.3), galv, { x: x + (x < 106.5 ? 0.5 : -0.5), y: 9.0, z, cast: false }); scenery(G.box(0.6, 0.08, 0.26), lit, { x: x + (x < 106.5 ? 0.9 : -0.9), y: 8.9, z, cast: false }); halo(x + (x < 106.5 ? 0.9 : -0.9), 8.78, z, 1.9); });
  TREE_SPOTS.oak.push([103.0, -29.5], [103.0, -62.0], [81.5, 1.2], [99.5, -61.5]);

  // ================= PLOT A: heat-pipe reactor =================
  { const cx = 91, cz = -11; pad(cx, cz, 24, 20);
    canopy(cx, cz, 18, 14, 6.6, 3);
    signBoard(103.4, -6, Math.PI / 2, 'HEAT-PIPE REACTOR', ['No pumps. No coolant loop. Sodium heat pipes', 'carry the heat to an open-air gas turbine.'], 3.8);
    // canister: lower half shell on two saddles, open to the sky
    const shell = new THREE.CylinderGeometry(1.6, 1.6, 10, 48, 1, true, 0, Math.PI); shell.rotateZ(-Math.PI / 2);
    const shellMat = mat(withSet(TX.paint, 6, 2, { color: 0xb3b8bd, metalness: 0.6, normalScale: 0.4 })); shellMat.side = THREE.DoubleSide; shellMat.userData.keepDouble = true;
    add('hp_canister', shell, shellMat, { x: cx, y: 2.0, z: cz });
    [-5, 5].forEach((dx) => { const cap = new THREE.CircleGeometry(1.6, 48, Math.PI, Math.PI); cap.rotateY(dx < 0 ? -Math.PI / 2 : Math.PI / 2); add('hp_canister', cap, shellMat, { x: cx + dx, y: 2.0, z: cz }); add('hp_canister', new THREE.TorusGeometry(1.62, 0.06, 8, 48, Math.PI).rotateZ(Math.PI).rotateY(Math.PI / 2), M.steelPaint(0x6c757e), { x: cx + dx, y: 2.0, z: cz, cast: false }); });
    [-3, 3].forEach((dx) => add('hp_canister', G.box(1.0, 0.5, 3.6), M.concrete(0x8a857c), { x: cx + dx, y: 0.25, z: cz }));
    add('hp_canister', G.box(10.4, 0.12, 0.3), M.steelPaint(0x6c757e), { x: cx, y: 2.0, z: cz - 1.65, cast: false }); add('hp_canister', G.box(10.4, 0.12, 0.3), M.steelPaint(0x6c757e), { x: cx, y: 2.0, z: cz + 1.65, cast: false });
    // the removed lid, leaning on the pad beside the canister
    { const lid = new THREE.CylinderGeometry(1.6, 1.6, 10, 48, 1, true, 0, Math.PI); lid.rotateZ(Math.PI / 2); add('hp_canister', lid, shellMat, { x: cx, y: 1.6, z: cz - 6.6, rx: -0.35 }); addBox(cx - 5, cx + 5, 0, 2.6, cz - 8.2, cz - 5.0); }
    labelAt('hp_canister', new THREE.Vector3(cx, 4.4, cz)); R.hp_canister.focus = { center: new THREE.Vector3(cx + 1, 2, cz), radius: 8 };
    // monolith core: hexagonal block with drilled faces, lying along x
    const hexFace = (() => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); g.fillStyle = '#4a4c50'; g.fillRect(0, 0, 256, 256); for (let r = 0; r < 9; r++) for (let k = 0; k < 10; k++) { const x = 20 + k * 24 + (r % 2) * 12, y = 20 + r * 26; const d = Math.hypot(x - 128, y - 128); if (d > 110) continue; g.fillStyle = (r + k) % 3 === 0 ? '#1a1b1e' : '#8a3a1a'; g.beginPath(); g.arc(x, y, (r + k) % 3 === 0 ? 7 : 5, 0, Math.PI * 2); g.fill(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    const coreSide = mat(withSet(TX.paint, 3, 1, { color: 0x4a4c50, metalness: 0.4, normalScale: 0.3 })), coreCap = new THREE.MeshStandardMaterial({ map: hexFace, roughness: 0.7, metalness: 0.3, emissive: 0x3a1200, emissiveIntensity: 0.6 });
    const coreGeo = new THREE.CylinderGeometry(0.8, 0.8, 2.4, 6); coreGeo.rotateZ(Math.PI / 2);
    const coreMesh = add('hp_core', coreGeo, [coreSide, coreCap, coreCap], { x: cx - 2.4, y: 2.0, z: cz });
    labelAt('hp_core', new THREE.Vector3(cx - 2.4, 3.3, cz)); R.hp_core.focus = { center: new THREE.Vector3(cx - 2.4, 2, cz), radius: 3 };
    // control drums around the core in the reflector ring
    const reflGeo = new THREE.CylinderGeometry(1.4, 1.4, 2.5, 48, 1, true, 0.08, Math.PI - 0.16); reflGeo.rotateZ(-Math.PI / 2);
    add('hp_core', reflGeo, M.ceramic(0xcfcbc2), { x: cx - 2.4, y: 2.0, z: cz });
    for (let k = 0; k < 12; k++) { const a = (k / 12) * Math.PI * 2 + Math.PI / 12, r = 1.08; const dy = Math.sin(a) * r, dz = Math.cos(a) * r; if (dy < -0.25) continue; const dg = G.cyl(0.19, 2.4, 20); dg.rotateZ(Math.PI / 2); add('hp_drums', dg, M.steelPaint(0xd8dde2), { x: cx - 2.4, y: 2.0 + dy, z: cz + dz }); const ab = G.box(2.3, 0.22, 0.1); add('hp_drums', ab, M.absorber(), { x: cx - 2.4, y: 2.0 + dy * 1.1, z: cz + dz * 1.1, cast: false }); }
    labelAt('hp_drums', new THREE.Vector3(cx - 2.4, 3.6, cz + 1.3)); R.hp_drums.focus = { center: new THREE.Vector3(cx - 2.4, 2.4, cz), radius: 3 };
    // heat pipes: 127 sodium pipes from the core face to the heat exchanger block
    { const pm = mat({ color: 0xb4b9bf, metalness: 0.9, roughness: 0.35, emissive: 0x4a1800, emissiveIntensity: 0.35 }); const mats = hexPositions(6, 0.12).map(([u, v]) => new THREE.Matrix4().compose(new THREE.Vector3(cx + 0.9, 2.0 + v, cz + u), new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI / 2), new THREE.Vector3(1, 1, 1)));
      addInstanced('hp_pipes', G.cyl(0.028, 4.4, 8), pm, mats, { cast: false }); }
    labelAt('hp_pipes', new THREE.Vector3(cx + 0.6, 3.3, cz)); R.hp_pipes.focus = { center: new THREE.Vector3(cx + 0.6, 2, cz), radius: 3.2 };
    // heat exchanger block with gas ducts rising out of the canister
    add('hp_hx', G.box(1.4, 2.2, 2.2), M.steelPaint(0x6c757e), { x: cx + 3.7, y: 2.0, z: cz });
    for (let k = 0; k < 9; k++) add('hp_hx', G.box(1.5, 0.02, 2.3), M.steelPaint(0x9aa3ab), { x: cx + 3.7, y: 1.0 + k * 0.25, z: cz, cast: false });
    pipe('hp_hx', [[cx + 3.7, 3.1, cz - 0.6], [cx + 3.7, 4.2, cz - 0.6], [cx + 8.2, 4.2, cz - 0.6], [cx + 8.2, 1.6, cz - 0.6]], 0.34, M.insul());
    pipe('hp_hx', [[cx + 3.7, 3.1, cz + 0.6], [cx + 3.7, 4.6, cz + 0.6], [cx + 8.2, 4.6, cz + 0.6], [cx + 8.2, 1.6, cz + 0.6]], 0.34, M.insul());
    labelAt('hp_hx', new THREE.Vector3(cx + 3.7, 3.5, cz)); R.hp_hx.focus = { center: new THREE.Vector3(cx + 3.7, 2.2, cz), radius: 3 };
    // open-air Brayton skid: filter house, turbine, generator, recuperator, stack, transformer
    const sx = cx + 9.6, sz = cz;
    add('hp_pcu', G.box(5.4, 0.2, 5.6), M.steelPaint(0x30363c), { x: sx + 0.6, y: 0.1, z: sz });
    add('hp_pcu', G.box(1.6, 2.0, 1.6), M.steelPaint(0x8d969e), { x: sx - 1.2, y: 1.2, z: sz + 2.0 }); for (let k = 0; k < 5; k++) add('hp_pcu', G.box(1.4, 0.05, 1.62), M.steelPaint(0x3b434c), { x: sx - 1.2, y: 0.5 + k * 0.35, z: sz + 2.0, cast: false });
    add('hp_pcu', G.cyl(0.5, 2.2, 28), M.steel(), { x: sx + 0.6, y: 1.3, z: sz, rz: Math.PI / 2 }); add('hp_pcu', G.cyl(0.62, 0.5, 28, 0.5), M.steelDark(), { x: sx + 1.8, y: 1.3, z: sz, rz: Math.PI / 2 });
    add('hp_pcu', G.box(1.4, 1.2, 1.2), M.genBlue(), { x: sx + 2.9, y: 0.95, z: sz }); spinners.push(add('hp_pcu', G.cyl(0.22, 0.6, 24), M.steel(), { x: sx + 2.1, y: 1.3, z: sz, rz: Math.PI / 2 }));
    add('hp_pcu', G.box(1.8, 1.8, 1.2), M.steelPaint(0x6c757e), { x: sx + 0.6, y: 1.2, z: sz - 2.1 }); for (let k = 0; k < 7; k++) add('hp_pcu', G.box(1.9, 0.02, 1.3), M.steelPaint(0x9aa3ab), { x: sx + 0.6, y: 0.5 + k * 0.22, z: sz - 2.1, cast: false });
    add('hp_pcu', G.cyl(0.3, 5.5, 24), M.steelPaint(0x9aa4ad), { x: sx + 2.6, y: 3.0, z: sz - 2.2 }); add('hp_pcu', G.cyl(0.36, 0.3, 24), M.steelPaint(0x6c757e), { x: sx + 2.6, y: 5.8, z: sz - 2.2, cast: false });
    transformerUnit('hp_pcu', cx + 9.5, cz + 7.2, 0.7);
    for (let k = 0; k < 3; k++) add('hp_pcu', G.box(0.9, 2.0, 0.6), M.steelPaint(0x8d969e), { x: cx - 8 + k * 1.1, y: 1.0, z: cz + 8.6 });
    labelAt('hp_pcu', new THREE.Vector3(sx + 0.8, 3.4, sz)); R.hp_pcu.focus = { center: new THREE.Vector3(sx + 0.8, 1.5, sz), radius: 5 };
    walkLightSpecs.push([cx, 6.2, cz, 0xfff1dc, 26, 16]);
  }

  // ================= PLOT B: helium-cooled TRISO reactor with salt storage =================
  { const bx0 = 111, bx1 = 125, bz0 = -30, bz1 = -14, BH2 = 11, cx = 118, cz = -22; pad(125, -20, 30, 28);
    signBoard(109.6, -10, -Math.PI / 2, 'GAS-COOLED REACTOR', ['Helium coolant, TRISO fuel, and molten-salt tanks', 'that store heat like a battery.'], 3.8);
    const door = { a0: cz - 0.6, a1: cz + 0.6, y0: 0, y1: 2.3 };
    wallSeg(null, 'z', bz0, bz1, bx0, 0.25, 0, BH2, [door, { a0: cz + 3, a1: cz + 6.4, y0: 3.2, y1: 4.6 }], panel); wallSeg(null, 'z', bz0, bz1, bx1, 0.25, 0, BH2, [{ a0: cz - 1.2, a1: cz + 1.2, y0: 2.4, y1: 5.4 }], panel);
    wallSeg(null, 'x', bx0, bx1, bz0, 0.25, 0, BH2, [], panel); wallSeg(null, 'x', bx0, bx1, bz1, 0.25, 0, BH2, [{ a0: cx - 3, a1: cx + 3, y0: 3.2, y1: 4.6 }], panel);
    scenery(G.box(0.04, 1.4, 3.4), glass, { x: bx0, y: 3.9, z: cz + 4.7, cast: false }); scenery(G.box(6, 1.4, 0.04), glass, { x: cx, y: 3.9, z: bz1, cast: false });
    scenery(G.box(bx1 - bx0 + 0.4, 0.5, bz1 - bz0 + 0.4), dark, { x: cx, y: BH2 + 0.2, z: cz, cast: false }); scenery(G.box(bx1 - bx0, 0.1, bz1 - bz0), dark, { x: cx, y: BH2, z: cz, cast: false });
    scenery(new THREE.PlaneGeometry(bx1 - bx0 - 0.3, bz1 - bz0 - 0.3), M.concrete(0x6f6b64, 6, 6), { x: cx, y: 0.03, z: cz, rx: -Math.PI / 2, cast: false });
    makeDoor(scene, { kind: 'swing', hinge: [bx0, 0, door.a0], axis: 'z', sign: 1, width: 1.2, height: 2.3, swingSign: -1, mesh: doorLeaf(1.2, 2.3, M.steelPaint(0x6a7480)), label: 'Gas-cooled reactor' });
    scenery(G.box(0.5, 0.12, 0.25), lit, { x: bx0 - 0.3, y: 2.6, z: cz, cast: false }); halo(bx0 - 0.3, 2.6 - 0.1, cz, 0.95);
    [[cx - 4, cz], [cx + 4, cz]].forEach(([x, z]) => scenery(G.box(1.2, 0.04, 0.3), lit, { x, y: BH2 - 0.3, z, cast: false }));
    walkLightSpecs.push([cx, BH2 - 2, cz, 0xfff1dc, 40, 16]);
    // the pressure vessel: skirt, shell, dished heads, flange, insulation jacket
    const vm = mat(withSet(TX.paint, 4, 3, { color: 0xb3b8bd, metalness: 0.65, normalScale: 0.4 }));
    add('ht_vessel', G.cyl(1.5, 0.7, 48), M.steelPaint(0x6c757e), { x: cx, y: 0.35, z: cz });
    add('ht_vessel', G.cyl(1.3, 7.4, 48), vm, { x: cx, y: 4.4, z: cz });
    add('ht_vessel', new THREE.SphereGeometry(1.3, 48, 16, 0, Math.PI * 2, 0, Math.PI / 2), vm, { x: cx, y: 8.1, z: cz }); add('ht_vessel', new THREE.SphereGeometry(1.3, 48, 16, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), vm, { x: cx, y: 0.7, z: cz });
    add('ht_vessel', G.cyl(1.45, 0.25, 48), M.steelPaint(0x6c757e), { x: cx, y: 8.2, z: cz, cast: false });
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2; add('ht_vessel', G.cyl(0.05, 0.3, 8), M.steelDark(), { x: cx + Math.cos(a) * 1.38, y: 8.2, z: cz + Math.sin(a) * 1.38, cast: false }); }
    [2.0, 5.0].forEach((y) => add('ht_vessel', G.torus(1.32, 0.05, 48, 8), M.steelPaint(0x6c757e), { x: cx, y, z: cz, rx: Math.PI / 2, cast: false }));
    labelAt('ht_vessel', new THREE.Vector3(cx, 10.4, cz)); R.ht_vessel.focus = { center: new THREE.Vector3(cx + 1, 4.5, cz), radius: 7 };
    // circulator on the head
    add('ht_circulator', G.cyl(0.55, 0.8, 32), M.steelPaint(0x6c757e), { x: cx, y: 9.0, z: cz }); add('ht_circulator', G.cyl(0.7, 1.5, 32), M.genBlue(), { x: cx, y: 10.1, z: cz }); add('ht_circulator', G.cyl(0.5, 0.2, 32), M.steelDark(), { x: cx, y: 10.95, z: cz, cast: false });
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; add('ht_circulator', G.box(0.08, 1.3, 0.3), M.steelPaint(0x5a636c), { x: cx + Math.cos(a) * 0.74, y: 10.1, z: cz + Math.sin(a) * 0.74, ry: -a, cast: false }); }
    labelAt('ht_circulator', new THREE.Vector3(cx + 0.9, 10.6, cz + 0.6)); R.ht_circulator.focus = { center: new THREE.Vector3(cx, 10, cz), radius: 2.2 };
    // cross-duct to the helium-to-salt heat exchanger
    pipe('ht_ihx', [[cx + 1.2, 3.2, cz], [cx + 3.6, 3.2, cz]], 0.55, M.insul());
    add('ht_ihx', G.cyl(0.95, 4.6, 40), M.insul(), { x: cx + 4.6, y: 2.9, z: cz }); add('ht_ihx', new THREE.SphereGeometry(0.95, 40, 14, 0, Math.PI * 2, 0, Math.PI / 2), M.insul(), { x: cx + 4.6, y: 5.2, z: cz }); add('ht_ihx', G.cyl(1.05, 0.5, 40), M.steelPaint(0x6c757e), { x: cx + 4.6, y: 0.3, z: cz });
    labelAt('ht_ihx', new THREE.Vector3(cx + 4.6, 6.4, cz)); R.ht_ihx.focus = { center: new THREE.Vector3(cx + 4.6, 3, cz), radius: 3.5 };
    // TRISO display case by the door: pedestal, glass, a particle cut open at 300x
    const px = bx0 + 1.6, pz = cz + 2.8;
    add('ht_fuel', G.box(0.7, 1.0, 0.7), M.steelPaint(0x1a1c20), { x: px, y: 0.5, z: pz }); add('ht_fuel', G.box(0.74, 0.9, 0.74), M.glass(), { x: px, y: 1.45, z: pz, cast: false });
    [[0.3, 0x2b2b2f], [0.26, 0x8a8e94], [0.21, 0x3a3a3e], [0.16, 0x111113], [0.1, 0x9a4a1a]].forEach(([r, col]) => add('ht_fuel', new THREE.SphereGeometry(r, 28, 18, 0, Math.PI * 1.5), new THREE.MeshStandardMaterial({ color: col, roughness: 0.6, metalness: 0.1, side: THREE.DoubleSide }), { x: px, y: 1.42, z: pz, ry: Math.PI * 0.75, cast: false }));
    add('ht_fuel', G.box(0.02, 0.9, 1.4), M.steelPaint(0xd9d9d9), { x: bx0 + 0.15, y: 1.9, z: cz + 5.2, cast: false });
    labelAt('ht_fuel', new THREE.Vector3(px, 2.2, pz)); R.ht_fuel.focus = { center: new THREE.Vector3(px, 1.4, pz), radius: 1.4 };
    // salt tanks outside, piping, steam plant under a canopy, air-cooled condenser
    [[132, -27], [132, -17]].forEach(([x, z], i) => { add('ht_salt', G.cyl(2.3, 8, 48), M.insul(), { x, y: 4.0, z }); add('ht_salt', G.cyl(2.3, 0.8, 48, 0.3), M.steelPaint(0x8a949e), { x, y: 8.4, z }); add('ht_salt', G.cyl(2.5, 0.4, 48), M.concrete(0x8a857c), { x, y: 0.2, z }); [1.5, 4.5, 7.5].forEach((y) => add('ht_salt', G.torus(2.32, 0.04, 48, 8), M.steelPaint(0x6c757e), { x, y, z, rx: Math.PI / 2, cast: false })); add('ht_salt', G.box(0.5, 0.5, 0.05), new THREE.MeshStandardMaterial({ color: i ? 0x3a6fb5 : 0xd86e4b, roughness: 0.6 }), { x: x - 2.3, y: 6.5, z, ry: -Math.PI / 2, cast: false }); });
    pipe('ht_salt', [[cx + 4.6, 5.0, cz + 0.9], [cx + 6.2, 5.0, cz + 0.9], [bx1 + 1, 5.0, cz + 0.9], [bx1 + 1, 5.0, -17], [129.6, 5.0, -17]], 0.2, M.insul());
    pipe('ht_salt', [[cx + 4.6, 1.2, cz - 0.9], [bx1 + 1, 1.2, cz - 0.9], [bx1 + 1, 1.2, -27], [129.6, 1.2, -27]], 0.2, M.insul());
    pipe('ht_salt', [[132, 7.2, -24.7], [132, 7.2, -19.3]], 0.2, M.insul());
    pipe('ht_turbine', [[132, 3.0, -14.7], [132, 3.0, -11.6]], 0.2, M.insul());
    labelAt('ht_salt', new THREE.Vector3(132, 9.6, -22)); R.ht_salt.focus = { center: new THREE.Vector3(132, 4, -22), radius: 8 };
    canopy(125, -8.5, 16, 7, 5.2, 3);
    add('ht_turbine', G.cyl(1.0, 3.2, 32), M.insul(), { x: 132, y: 1.8, z: -9.6 }); add('ht_turbine', G.cyl(0.6, 2.4, 24), M.steelPaint(0x8a949e), { x: 132, y: 3.9, z: -9.6, rz: Math.PI / 2 });
    pipe('ht_turbine', [[131, 3.9, -9.6], [128.4, 3.9, -9.6], [128.4, 2.0, -9.6]], 0.16, M.steel());
    add('ht_turbine', G.box(5.0, 0.2, 3.0), M.steelPaint(0x30363c), { x: 125.5, y: 0.1, z: -9.6 }); add('ht_turbine', G.cyl(0.6, 2.0, 28, 0.45), M.steel(), { x: 126.8, y: 1.3, z: -9.6, rz: Math.PI / 2 }); add('ht_turbine', G.box(1.6, 1.3, 1.3), M.genBlue(), { x: 124.4, y: 0.95, z: -9.6 }); spinners.push(add('ht_turbine', G.cyl(0.24, 0.5, 24), M.steel(), { x: 125.5, y: 1.3, z: -9.6, rz: Math.PI / 2 }));
    [[119.5, -8.5], [117, -8.5]].forEach(([x, z]) => { add('ht_turbine', G.box(2.4, 0.3, 2.4), M.steelPaint(0x5a636c), { x, y: 2.6, z }); fanUnit('ht_turbine', x, 2.9, z, 0.9); }); [[118.3, -7.4], [118.3, -9.6], [120.6, -7.4], [120.6, -9.6], [116, -7.4], [116, -9.6]].forEach(([x, z]) => add('ht_turbine', G.box(0.16, 2.5, 0.16), galv, { x, y: 1.25, z }));
    transformerUnit('ht_turbine', 134.5, -8, 0.8);
    labelAt('ht_turbine', new THREE.Vector3(126, 4.4, -9.6)); R.ht_turbine.focus = { center: new THREE.Vector3(127, 2, -9.6), radius: 6 };
    for (let k = 0; k < 6; k++) scenery(G.cyl(0.15, 1.5, 12), M.steelPaint(0xb3b8bd), { x: 112 + k * 0.4, y: 0.75, z: bz0 - 1.0 }); scenery(G.box(2.8, 0.1, 0.6), galv, { x: 113, y: 1.5, z: bz0 - 1.0, cast: false }); addBox(111.7, 114.3, 0, 1.6, bz0 - 1.4, bz0 - 0.6);
  }

  // ================= PLOT C: liquid-fuel molten-salt reactor =================
  { const wx0 = 82, wx1 = 94, wz0 = -55, wz1 = -45, CH2 = 8, cx = 88, cz = -50; pad(91, -48, 26, 24);
    signBoard(103.4, -40, Math.PI / 2, 'MOLTEN-SALT REACTOR', ['The fuel is a liquid. If the power fails, a frozen', 'plug melts and the fuel drains itself to safety.'], 3.8);
    const conc = M.concrete(0x9a958b, 6, 3), door = { a0: cz + 1.4, a1: cz + 2.6, y0: 0, y1: 2.3 }, win = { a0: cz - 3.4, a1: cz - 0.4, y0: 1.1, y1: 2.6 };
    wallSeg(null, 'z', wz0, wz1, wx1, 0.6, 0, CH2, [door, win], conc); wallSeg(null, 'z', wz0, wz1, wx0, 0.6, 0, CH2, [], conc);
    wallSeg(null, 'x', wx0, wx1, wz0, 0.6, 0, CH2, [], conc); wallSeg(null, 'x', wx0, wx1, wz1, 0.6, 0, CH2, [], conc);
    scenery(G.box(0.08, win.y1 - win.y0, win.a1 - win.a0), M.glass(), { x: wx1, y: (win.y0 + win.y1) / 2, z: (win.a0 + win.a1) / 2, cast: false });
    scenery(G.box(wx1 - wx0 + 0.6, 0.6, wz1 - wz0 + 0.6), conc, { x: cx, y: CH2 + 0.3, z: cz, cast: false });
    scenery(new THREE.PlaneGeometry(wx1 - wx0 - 0.6, wz1 - wz0 - 0.6), M.concrete(0x6f6b64, 5, 4), { x: cx, y: 0.03, z: cz, rx: -Math.PI / 2, cast: false });
    makeDoor(scene, { kind: 'swing', hinge: [wx1, 0, door.a0], axis: 'z', sign: 1, width: 1.2, height: 2.3, swingSign: 1, mesh: doorLeaf(1.2, 2.3, M.steelPaint(0x6a7480)), label: 'Reactor cell' });
    scenery(G.box(0.5, 0.12, 0.25), lit, { x: wx1 + 0.4, y: 2.6, z: cz + 2, cast: false }); halo(wx1 + 0.4, 2.6 - 0.1, cz + 2, 0.95);
    [[cx - 2.5, cz], [cx + 2.5, cz]].forEach(([x, z]) => scenery(G.box(1.2, 0.04, 0.3), lit, { x, y: CH2 - 0.3, z, cast: false }));
    scenery(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: texTrefoil, roughness: 0.7 }), { x: wx1 + 0.31, y: 1.7, z: cz + 3.6, ry: Math.PI / 2, cast: false });
    walkLightSpecs.push([cx, CH2 - 1.6, cz, 0xfff1dc, 36, 14]);
    // vessel: a 270-degree shell open toward the door, graphite core inside, glowing salt surface, head
    const vx = 86, vz = -51;
    const vshell = new THREE.CylinderGeometry(1.4, 1.4, 4, 48, 1, true, Math.PI * 0.75, Math.PI * 1.5);
    const vmat = mat(withSet(TX.paint, 4, 2, { color: 0x9aa4ad, metalness: 0.7, normalScale: 0.4 })); vmat.side = THREE.DoubleSide; vmat.userData.keepDouble = true;
    add('ms_vessel', vshell, vmat, { x: vx, y: 2.3, z: vz });
    add('ms_vessel', G.cyl(1.5, 0.3, 48), M.steelPaint(0x6c757e), { x: vx, y: 0.3, z: vz }); [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([a, b]) => add('ms_vessel', G.box(0.2, 0.3, 0.2), M.steelDark(), { x: vx + a * 1.0, y: 0.15, z: vz + b * 1.0 }));
    add('ms_vessel', G.cyl(1.5, 0.3, 48), M.steelPaint(0x6c757e), { x: vx, y: 4.45, z: vz });
    const graphite = mat(withSet(TX.concrete, 2, 2, { color: 0x3a3a3c, metalness: 0.05, normalScale: 0.4 }));
    add('ms_vessel', new THREE.CylinderGeometry(1.1, 1.1, 3.2, 6), graphite, { x: vx, y: 2.1, z: vz });
    for (let k = 0; k < 7; k++) { const a = (k / 7) * Math.PI * 2; add('ms_vessel', G.cyl(0.06, 3.3, 8), new THREE.MeshStandardMaterial({ color: 0xffa040, emissive: 0xff7a1a, emissiveIntensity: 1.2, roughness: 0.4 }), { x: vx + Math.cos(a) * 0.7, y: 2.1, z: vz + Math.sin(a) * 0.7, cast: false }); }
    add('ms_vessel', G.cyl(1.36, 0.06, 48), new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff8a2a, emissiveIntensity: 1.6, roughness: 0.2, metalness: 0.2, transparent: true, opacity: 0.85 }), { x: vx, y: 4.0, z: vz, cast: false });
    labelAt('ms_vessel', new THREE.Vector3(vx, 6.6, vz)); R.ms_vessel.focus = { center: new THREE.Vector3(vx + 1, 2.5, vz), radius: 5 };
    // fuel-salt pump on the head
    add('ms_pump', G.cyl(0.35, 0.8, 24), M.steelPaint(0x6c757e), { x: vx, y: 5.0, z: vz }); add('ms_pump', G.cyl(0.5, 1.1, 24), M.genBlue(), { x: vx, y: 5.95, z: vz }); add('ms_pump', G.cyl(0.2, 1.8, 16), M.steel(), { x: vx, y: 3.6, z: vz, cast: false });
    pipe('ms_pump', [[vx + 0.9, 4.1, vz - 0.8], [vx + 2.4, 4.1, vz - 0.8], [vx + 4.4, 4.1, vz - 2.0], [vx + 4.4, 3.6, vz - 2.0]], 0.18, M.insul());
    labelAt('ms_pump', new THREE.Vector3(vx, 7.0, vz + 0.8)); R.ms_pump.focus = { center: new THREE.Vector3(vx, 5.6, vz), radius: 2 };
    // primary heat exchanger and secondary salt out through the wall
    const hx = vx + 4.4, hz2 = vz - 2.0;
    add('ms_hx', G.cyl(0.7, 3.5, 32), M.insul(), { x: hx, y: 1.9, z: hz2 }); add('ms_hx', new THREE.SphereGeometry(0.7, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2), M.insul(), { x: hx, y: 3.65, z: hz2 }); add('ms_hx', G.cyl(0.8, 0.3, 32), M.steelPaint(0x6c757e), { x: hx, y: 0.15, z: hz2 });
    pipe('ms_hx', [[hx, 0.5, hz2 + 0.6], [vx + 1.0, 0.5, vz + 0.3], [vx + 1.0, 0.9, vz + 0.3]], 0.18, M.insul());
    pipe('ms_hx', [[hx + 0.7, 3.0, hz2], [wx1 + 2.0, 3.0, hz2], [wx1 + 2.0, 3.0, -56.2], [97.5, 3.0, -56.2]], 0.16, M.insul());
    pipe('ms_hx', [[hx + 0.7, 1.0, hz2], [wx1 + 2.6, 1.0, hz2], [wx1 + 2.6, 1.0, -55.4], [97.5, 1.0, -55.4]], 0.16, M.insul());
    labelAt('ms_hx', new THREE.Vector3(hx, 4.6, hz2)); R.ms_hx.focus = { center: new THREE.Vector3(hx, 2, hz2), radius: 2.8 };
    // drain line, freeze plug with its blower, finned drain tank
    const dx = vx + 4.2, dz = vz + 2.6;
    pipe('ms_drain', [[vx, 0.3, vz], [vx, 0.26, vz + 1.2], [vx + 1.6, 0.26, vz + 2.6], [dx - 1.4, 0.26, dz]], 0.07, M.steel());
    add('ms_drain', G.cyl(0.11, 0.5, 16), new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.9 }), { x: vx + 2.3, y: 0.26, z: vz + 2.0, rz: Math.PI / 2, ry: -0.6, cast: false });
    add('ms_drain', G.box(0.45, 0.45, 0.45), M.steelPaint(0x8d969e), { x: vx + 2.3, y: 0.7, z: vz + 1.4 }); add('ms_drain', G.cyl(0.14, 0.5, 16), M.steelDark(), { x: vx + 2.3, y: 0.42, z: vz + 1.7, rx: Math.PI / 2, cast: false });
    add('ms_drain', G.box(2.4, 1.0, 1.6), M.steelPaint(0x6c757e), { x: dx, y: 0.5, z: dz }); for (let k = 0; k < 9; k++) add('ms_drain', G.box(0.03, 1.1, 1.8), M.steelPaint(0x9aa3ab), { x: dx - 1.1 + k * 0.27, y: 0.55, z: dz, cast: false });
    labelAt('ms_drain', new THREE.Vector3(dx, 1.9, dz)); R.ms_drain.focus = { center: new THREE.Vector3(dx - 0.8, 0.6, dz - 0.4), radius: 2.6 };
    // off-gas: charcoal beds in a cabinet, sweep line to a stack through the roof
    const ox = wx0 + 1.6, oz = wz1 - 1.4;
    add('ms_offgas', G.box(2.2, 2.2, 1.0), M.steelPaint(0x8d969e), { x: ox, y: 1.1, z: oz }); add('ms_offgas', G.box(2.0, 1.2, 0.03), glass, { x: ox, y: 1.3, z: oz + 0.51, cast: false });
    for (let k = 0; k < 3; k++) add('ms_offgas', G.cyl(0.22, 1.1, 16), M.steelPaint(0x30363c), { x: ox - 0.6 + k * 0.6, y: 1.2, z: oz });
    pipe('ms_offgas', [[vx, 4.6, vz], [vx, 5.4, vz + 0.0], [ox, 5.4, oz], [ox, CH2 + 4.5, oz]], 0.09, M.steel());
    add('ms_offgas', G.cyl(0.16, 0.4, 16, 0.22), M.steelPaint(0x6c757e), { x: ox, y: CH2 + 4.7, z: oz, cast: false });
    labelAt('ms_offgas', new THREE.Vector3(ox, 3.0, oz)); R.ms_offgas.focus = { center: new THREE.Vector3(ox, 1.2, oz), radius: 2.2 };
    // steam plant under a canopy east of the cell; air-cooled condenser
    canopy(99, -51, 8, 12, 5.2, 2);
    add('ms_turbine', G.cyl(0.85, 3.6, 32), M.insul(), { x: 97.5, y: 1.9, z: -55.8 }); add('ms_turbine', G.cyl(0.5, 2.0, 24), M.steelPaint(0x8a949e), { x: 97.5, y: 4.0, z: -55.8, rz: Math.PI / 2 });
    pipe('ms_turbine', [[98.3, 4.0, -55.8], [100, 4.0, -55.8], [100, 2.0, -53.6]], 0.14, M.steel());
    add('ms_turbine', G.box(3.2, 0.2, 5.4), M.steelPaint(0x30363c), { x: 100, y: 0.1, z: -50.6 }); add('ms_turbine', G.cyl(0.55, 1.8, 28, 0.42), M.steel(), { x: 100, y: 1.3, z: -52.4, rx: Math.PI / 2 }); add('ms_turbine', G.box(1.4, 1.3, 1.6), M.genBlue(), { x: 100, y: 0.95, z: -49.6 }); spinners.push(add('ms_turbine', G.cyl(0.22, 0.5, 24), M.steel(), { x: 100, y: 1.3, z: -51.2, rx: Math.PI / 2 }));
    [[99, -44.5], [101.5, -44.5]].forEach(([x, z]) => { add('ms_turbine', G.box(2.4, 0.3, 2.4), M.steelPaint(0x5a636c), { x, y: 2.6, z }); fanUnit('ms_turbine', x, 2.9, z, 0.9); }); [[97.9, -43.4], [97.9, -45.6], [100.2, -43.4], [100.2, -45.6], [102.6, -43.4], [102.6, -45.6]].forEach(([x, z]) => add('ms_turbine', G.box(0.16, 2.5, 0.16), galv, { x, y: 1.25, z }));
    transformerUnit('ms_turbine', 101, -39, 0.8);
    labelAt('ms_turbine', new THREE.Vector3(99.5, 4.6, -51)); R.ms_turbine.focus = { center: new THREE.Vector3(99.5, 2, -51), radius: 6 };
  }
})();

// ------------------------------------------------------------------ outskirts: highway, access road, industrial park, town, farmland, wind farm
// Everything here is instanced or merged, sits beyond the shadow range, and casts no shadows.
const outskirts = { cars: null, rotors: null, beacons: null };
(function buildOutskirts() {
  const up = new THREE.Vector3(0, 1, 0), m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3();
  const far = (mesh) => { mesh.castShadow = false; mesh.receiveShadow = true; const mt = mesh.material; mt.clippingPlanes = null; if (mt.side === THREE.DoubleSide && !mt.userData.keepDouble) mt.side = THREE.FrontSide; scene.add(mesh); return mesh; };

  // ---- ribbons that follow the terrain: roads, lots, fields
  function ribbonGeo(pts, width, { y = 0.03, step = 4, vScale = 1 } = {}) {
    const P = []; for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(len / step)); for (let k = 0; k < n; k++) P.push([ax + (bx - ax) * k / n, az + (bz - az) * k / n]); } P.push(pts[pts.length - 1]);
    const pos = [], uv = [], idx = []; let dist = 0;
    for (let i = 0; i < P.length; i++) {
      const [x, z] = P[i], [px, pz] = P[Math.max(0, i - 1)], [nx, nz] = P[Math.min(P.length - 1, i + 1)];
      let tx = nx - px, tz = nz - pz; const tl = Math.hypot(tx, tz) || 1; tx /= tl; tz /= tl; const lx = -tz, lz = tx;
      if (i) dist += Math.hypot(x - px, z - pz);
      [[-1, 0], [1, 1]].forEach(([s, u]) => { const X = x + lx * s * width / 2, Z = z + lz * s * width / 2; pos.push(X, terrainY(X, Z) + y, Z); uv.push(u, dist / width * vScale); });
      if (i) { const b = i * 2; idx.push(b - 2, b - 1, b, b - 1, b + 1, b); }
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  function dashGeo(pts, spacing, len, width, offset = 0, { y = 0.045 } = {}) {
    const geos = [];
    for (let i = 0; i < pts.length - 1; i++) { const [ax, az] = pts[i], [bx, bz] = pts[i + 1], L = Math.hypot(bx - ax, bz - az), tx = (bx - ax) / L, tz = (bz - az) / L, lx = -tz, lz = tx;
      for (let d = spacing / 2; d < L - len; d += spacing) { const cx = ax + tx * d + lx * offset, cz = az + tz * d + lz * offset; const g = new THREE.PlaneGeometry(width, len); g.rotateX(-Math.PI / 2); g.rotateY(Math.atan2(tx, tz)); g.translate(cx, terrainY(cx, cz) + y, cz); geos.push(g); } }
    return geos.length ? BGU.mergeGeometries(geos, false) : null;
  }
  const asphalt = new THREE.MeshPhysicalMaterial(withSet(TX.asphalt, 1, 1, { color: 0x6f7072, roughness: 1, normalScale: 0.8 })); wetMats.push(asphalt);
  const paint = new THREE.MeshStandardMaterial({ color: 0xd9d9d9, roughness: 0.9 }), paintY = new THREE.MeshStandardMaterial({ color: 0xd7c25a, roughness: 0.9 });
  const galv = M.galv(), dark = M.steelPaint(0x30363c), panel = M.panel(0xb6bbc0, 10, 3), head = new THREE.MeshBasicMaterial({ color: 0xffe3b8 });

  // ---- access road east from the gate to the highway, then the highway itself (two carriageways, median)
  const HX = 150;
  const access = [[66, 16], [120, 16.5], [HX - 9, 17.5]];
  far(new THREE.Mesh(ribbonGeo(access, 7, { vScale: 0.5 }), asphalt));
  { const g = dashGeo(access, 6, 2.4, 0.14); if (g) far(new THREE.Mesh(g, paintY)); }
  const hwPts = (x) => [[x, -330], [x, -200], [x + 1.5, -80], [x, 60], [x - 1.2, 200], [x, 330]];
  [HX - 5.4, HX + 5.4].forEach((x) => {
    far(new THREE.Mesh(ribbonGeo(hwPts(x), 8.2, { vScale: 0.5 }), asphalt));
    [-3.75, 3.75].forEach((o) => { const g = ribbonGeo(hwPts(x + o), 0.16, { y: 0.045 }); far(new THREE.Mesh(g, paint)); });
    const d = dashGeo(hwPts(x), 12, 3, 0.16, 0); if (d) far(new THREE.Mesh(d, paint));
  });
  // highway lights on the median, every 45 m
  { const poles = [], heads = []; for (let z = -320; z <= 320; z += 45) { const x = HX, y = terrainY(x, z); poles.push(new THREE.Matrix4().compose(pv.set(x, y + 6, z), q.identity(), sc.set(1, 1, 1))); [-1, 1].forEach((s) => { heads.push(new THREE.Matrix4().compose(pv.set(x + s * 1.6, y + 11.6, z), q.identity(), sc.set(1, 1, 1))); halo(x + s * 1.6, y + 11.45, z, 2.6, 0xffd090); }); }
    const pg = new THREE.CylinderGeometry(0.1, 0.16, 12, 8); const pim = new THREE.InstancedMesh(pg, galv, poles.length); poles.forEach((mm, i) => pim.setMatrixAt(i, mm)); far(pim);
    const arm = BGU.mergeGeometries([new THREE.BoxGeometry(3.4, 0.12, 0.2).translate(0, 5.6, 0)], false); const aim = new THREE.InstancedMesh(arm, galv, poles.length); poles.forEach((mm, i) => aim.setMatrixAt(i, mm)); far(aim);
    const him = new THREE.InstancedMesh(new THREE.BoxGeometry(0.7, 0.1, 0.3), head, heads.length); heads.forEach((mm, i) => him.setMatrixAt(i, mm)); far(him); }
  // traffic: 16 cars, headlights and taillights
  { const n = 16, body = BGU.mergeGeometries([new THREE.BoxGeometry(4.4, 0.75, 1.85).translate(0, 0.62, 0), new THREE.BoxGeometry(2.3, 0.62, 1.65).translate(-0.3, 1.28, 0)], false);
    const bm = new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.7, roughness: 0.35, clearcoat: 0.8 });
    const im = new THREE.InstancedMesh(body, bm, n); const cols = [0xc8c9cc, 0x1f2429, 0x8a1c1c, 0x2a4a7a, 0xe9e6dd, 0x3c3f44, 0x6b6e73];
    const lamps = (dx, color) => new THREE.InstancedMesh(BGU.mergeGeometries([new THREE.BoxGeometry(0.06, 0.16, 0.38).translate(dx, 0.7, -0.6), new THREE.BoxGeometry(0.06, 0.16, 0.38).translate(dx, 0.7, 0.6)], false), new THREE.MeshBasicMaterial({ color }), n);
    const heads2 = lamps(2.22, 0xfff4d6), tails = lamps(-2.22, 0xff3b2f);
    const states = []; for (let i = 0; i < n; i++) { const dir = i % 2 ? 1 : -1; states.push({ dir, lane: dir > 0 ? HX + 5.4 + (i % 4 < 2 ? -1.9 : 1.9) : HX - 5.4 + (i % 4 < 2 ? -1.9 : 1.9), z: -330 + (i / n) * 660 + rnd() * 30, v: 22 + rnd() * 9 }); im.setColorAt(i, new THREE.Color(cols[i % cols.length])); }
    im.instanceColor.needsUpdate = true; far(im); far(heads2); far(tails);
    outskirts.cars = { im, heads: heads2, tails, states }; }
  // billboard by the access road
  { const c = document.createElement('canvas'); c.width = 1024; c.height = 384; const g = c.getContext('2d'); g.fillStyle = '#0d0a05'; g.fillRect(0, 0, 1024, 384); g.strokeStyle = 'rgba(255,252,244,0.3)'; g.lineWidth = 3; g.strokeRect(22, 22, 980, 340);
    g.fillStyle = '#fffcf4'; g.font = '600 76px Inter, Aspekta, system-ui, sans-serif'; g.textBaseline = 'middle'; g.fillText('ONE 10 MWe MICROREACTOR', 58, 150); g.fillStyle = '#78797f'; g.font = '500 48px Inter, Aspekta, system-ui, sans-serif'; g.fillText('POWERS EVERYTHING YOU SEE HERE  ·  MICROREACTORS.ORG', 60, 262);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    const bx = 112, bz = 26, by = terrainY(bx, bz);
    far(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.36, 7, 10).translate(bx, by + 3.5, bz), galv));
    far(new THREE.Mesh(new THREE.BoxGeometry(12.4, 4.9, 0.4).translate(bx, by + 9.2, bz), M.steelPaint(0x1a1612)));
    const face = new THREE.Mesh(new THREE.PlaneGeometry(12, 4.5), new THREE.MeshStandardMaterial({ map: t, roughness: 0.6, metalness: 0.1, emissive: 0xffffff, emissiveMap: t, emissiveIntensity: 0.35 })); face.position.set(bx, by + 9.2, bz - 0.22); face.rotation.y = Math.PI; far(face);
    [-4, 4].forEach((dx) => far(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.25).translate(bx + dx, by + 11.8, bz - 0.5), head))); }

  // ---- facades: wall + window grid, emissive lit windows
  function facadeTex(cols, rows, { lit = 0.45, wall = '#2a2d33', glass = '#0c1119', warm = '#ffd9a0', band = false } = {}) {
    const S = 512, c = document.createElement('canvas'), e = document.createElement('canvas'); c.width = c.height = e.width = e.height = S; const g = c.getContext('2d'), ge = e.getContext('2d');
    g.fillStyle = wall; g.fillRect(0, 0, S, S); ge.fillStyle = '#000'; ge.fillRect(0, 0, S, S);
    const cw = S / cols, ch = S / rows;
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols; k++) {
      const x = k * cw, y = r * ch; const ww = band ? cw : cw * 0.5, wh = band ? ch * 0.55 : ch * 0.5, ox = band ? 0 : cw * 0.25, oy = ch * 0.22;
      g.fillStyle = glass; g.fillRect(x + ox, y + oy, ww, wh);
      if (!band) { g.fillStyle = 'rgba(255,255,255,0.08)'; g.fillRect(x + ox, y + oy, ww, 2); }
      if (rnd() < lit) { const a = 0.55 + rnd() * 0.45; ge.fillStyle = warm; ge.globalAlpha = a; ge.fillRect(x + ox + 1, y + oy + 1, (band ? cw * (0.3 + rnd() * 0.6) : ww) - 2, wh - 2); ge.globalAlpha = 1; }
      if (band) { g.fillStyle = '#3a3e45'; g.fillRect(x, y + oy + wh, cw, 2); }
    }
    const mk = (cv, srgb) => { const t = new THREE.CanvasTexture(cv); t.wrapS = t.wrapT = THREE.RepeatWrapping; if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    return { map: mk(c, true), emissiveMap: mk(e, true) };
  }
  const facadeMat = (tex, rep, color = 0xffffff, ei = 1.0) => { const map = tex.map.clone(), em = tex.emissiveMap.clone(); map.repeat.set(rep[0], rep[1]); em.repeat.set(rep[0], rep[1]); map.needsUpdate = em.needsUpdate = true; return new THREE.MeshStandardMaterial({ map, color, emissive: 0xffffff, emissiveMap: em, emissiveIntensity: ei, roughness: 0.7, metalness: 0.15 }); };
  const texOffice = facadeTex(6, 6, { lit: 0.55, band: true, wall: '#4a4e55' }), texTown = facadeTex(4, 4, { lit: 0.3, wall: '#3a3630', glass: '#141a22' });

  // ---- industrial park across the highway: warehouses, dock doors, roof units, trailers, lots, office towers
  { const IX0 = 178, IZ0 = -16;
    const whs = [[IX0 + 32, IZ0 + 20, 60, 11, 32], [IX0 + 32, IZ0 + 60, 60, 11, 32], [IX0 + 48, IZ0 + 96, 36, 9, 26], [IX0 + 10, IZ0 + 96, 30, 9, 26]];
    const wgeo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    const wim = new THREE.InstancedMesh(wgeo, panel, whs.length), bim = new THREE.InstancedMesh(wgeo, dark, whs.length);
    const docks = [], units = [], trailers = [], lots = [];
    whs.forEach(([x, z, w, h, d], i) => {
      const y = terrainY(x, z) - 0.3;
      wim.setMatrixAt(i, m.compose(pv.set(x, y, z), q.identity(), sc.set(w, h, d))); bim.setMatrixAt(i, m.compose(pv.set(x, y + h, z), q.identity(), sc.set(w + 0.4, 0.5, d + 0.4)));
      for (let k = 0; k < Math.floor(w / 5); k++) { docks.push(new THREE.Matrix4().compose(pv.set(x - w / 2 + 3 + k * 5, y + 1.8, z + d / 2 + 0.08), q.identity(), sc.set(3, 3.4, 0.1))); if (k % 2 === 0) trailers.push(new THREE.Matrix4().compose(pv.set(x - w / 2 + 3 + k * 5, y + 0.95, z + d / 2 + 7.5), q.identity(), sc.set(2.5, 2.7, 14))); }
      for (let k = 0; k < Math.floor(w / 12); k++) units.push(new THREE.Matrix4().compose(pv.set(x - w / 2 + 6 + k * 12, y + h + 0.9, z + (k % 2 ? 4 : -4)), q.identity(), sc.set(3.2, 1.8, 2.4)));
      lots.push([[x - w / 2 - 2, z + d / 2 + 2], [x + w / 2 + 2, z + d / 2 + 2]]);
      addBox(x - w / 2, x + w / 2, 0, h, z - d / 2, z + d / 2);
    });
    far(wim); far(bim);
    const mk = (mats, geo, mat) => { const im = new THREE.InstancedMesh(geo, mat, mats.length); mats.forEach((mm, i) => im.setMatrixAt(i, mm)); far(im); };
    mk(docks, wgeo, M.steelPaint(0x5a6470)); mk(units, wgeo, galv); mk(trailers, wgeo, M.steelPaint(0xe9e6dd));
    lots.forEach((seg) => far(new THREE.Mesh(ribbonGeo(seg, 26, { y: 0.02, vScale: 0.3 }), asphalt)));
    far(new THREE.Mesh(ribbonGeo([[HX + 9.5, 60], [IX0 - 6, 60], [IX0 - 6, IZ0 + 110]], 7, { vScale: 0.5 }), asphalt));
    // wall packs and lot lights
    { const packs = []; whs.forEach(([x, z, w, h, d]) => { const y = terrainY(x, z); for (let k = 0; k < Math.floor(w / 15); k++) packs.push(new THREE.Matrix4().compose(pv.set(x - w / 2 + 7 + k * 15, y + h - 1.5, z + d / 2 + 0.25), q.identity(), sc.set(1, 1, 1))); });
      mk(packs, new THREE.BoxGeometry(0.4, 0.25, 0.25), head); }
    // office towers: glass-band facades with lit floors
    [[IX0 + 72, IZ0 + 36, 22, 7], [IX0 + 76, IZ0 + 66, 18, 5]].forEach(([x, z, w, floors]) => {
      const h = floors * 3.6, y = terrainY(x, z) - 0.3;
      const bmat = facadeMat(texOffice, [w / 6, floors / 6], 0xffffff, 0.9);
      far(new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.85).translate(x, y + h / 2, z), bmat));
      far(new THREE.Mesh(new THREE.BoxGeometry(w + 0.6, 0.6, w * 0.85 + 0.6).translate(x, y + h + 0.3, z), dark));
      far(new THREE.Mesh(new THREE.BoxGeometry(w * 0.3, 2.4, w * 0.3).translate(x + w * 0.2, y + h + 1.5, z), dark));
      far(new THREE.Mesh(new THREE.BoxGeometry(w + 0.8, 0.9, w * 0.85 + 0.8).translate(x, y + 0.45, z), M.concrete(0x8a857c, 4, 1)));
      addBox(x - w / 2, x + w / 2, 0, h, z - w * 0.42, z + w * 0.42);
    });
    for (let i = 0; i < 14; i++) TREE_SPOTS[i % 3 ? 'oak' : 'mesquite'].push([IX0 - 12 + (rnd() - 0.5) * 4, IZ0 - 6 + i * 8.5]);
  }

  // ---- town to the north-east: a skyline of lit boxes at the foot of the hills, a water tower, two masts
  { const n = 110, geo = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
    // one tile of the facade texture = 4 window bays (12 m) by 4 floors (14 m); the shader scales the UVs by instance size
    const mat = facadeMat(texTown, [1, 1], 0xffffff, 0.8); mat.userData.uvScale = [12, 14]; uvScaleMats.push(mat);
    const im = new THREE.InstancedMesh(geo, mat, n), caps = new THREE.InstancedMesh(geo, dark, n);
    for (let i = 0; i < n; i++) { const a = THREE.MathUtils.degToRad(-62 + rnd() * 50), r = 212 + rnd() * 36; const x = Math.cos(a) * r, z = Math.sin(a) * r; const w = 7 + rnd() * 11, d = 7 + rnd() * 11, h = 3.5 + Math.pow(rnd(), 3) * 26, y = terrainY(x, z) - 0.6; q.setFromAxisAngle(up, (rnd() - 0.5) * 0.3); im.setMatrixAt(i, m.compose(pv.set(x, y, z), q, sc.set(w, h, d))); caps.setMatrixAt(i, m.compose(pv.set(x, y + h, z), q, sc.set(w + 0.3, 0.4, d + 0.3))); im.setColorAt(i, new THREE.Color().setHSL(0.08, 0.1, 0.45 + rnd() * 0.35)); }
    im.instanceColor.needsUpdate = true; far(im); far(caps);
    const tx = 195, tz = -150, ty = terrainY(tx, tz);
    far(new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 22, 8).translate(tx, ty + 11, tz), galv));
    far(new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12).translate(tx, ty + 26, tz), M.steelPaint(0xd8dde2)));
    const beacons = [];
    [[tx, ty + 32, tz], [238, terrainY(238, -118) + 48, -118], [176, terrainY(176, -196) + 40, -196]].forEach(([x, y, z], i) => { if (i) far(new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, i === 1 ? 48 : 40, 6).translate(x, y - (i === 1 ? 24 : 20), z), galv)); beacons.push(new THREE.Matrix4().makeTranslation(x, y, z)); });
    outskirts.beaconMats = beacons;
  }

  // ---- farmland to the west and south-west: crop rows, fence posts, a farmstead
  { const fieldTex = (dark) => { const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d'); for (let y = 0; y < 256; y++) { const v = dark ? 70 + Math.sin(y * 0.8) * 22 + (rnd() - 0.5) * 14 : 92 + Math.sin(y * 0.8) * 26 + (rnd() - 0.5) * 16; g.fillStyle = dark ? `rgb(${v * 1.05},${v * 0.86},${v * 0.6})` : `rgb(${v * 0.72},${v},${v * 0.42})`; g.fillRect(0, y, 256, 1); } const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
    const fields = [[-250, -120, -210, -110, true, 0], [-250, -130, 60, 150, false, Math.PI / 2], [-110, -40, -240, -160, false, 0], [-100, -30, 110, 200, true, Math.PI / 2]];
    fields.forEach(([x0, x1, z0, z1, dark, rot]) => {
      const w = x1 - x0, d = z1 - z0, g = new THREE.PlaneGeometry(w, d, 20, 20); g.rotateX(-Math.PI / 2); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const X = p.getX(i) + (x0 + x1) / 2, Z = p.getZ(i) + (z0 + z1) / 2; p.setXYZ(i, X, terrainY(X, Z) + 0.04, Z); } g.computeVertexNormals();
      const t = fieldTex(dark); t.repeat.set(rot ? d / 10 : w / 10, rot ? w / 10 : d / 10); t.rotation = rot; t.needsUpdate = true;
      far(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: t, roughness: 1 })));
      const posts = []; const edge = (ax, az, bx, bz) => { const L = Math.hypot(bx - ax, bz - az), n = Math.round(L / 4); for (let i = 0; i <= n; i++) { const X = ax + (bx - ax) * i / n, Z = az + (bz - az) * i / n; posts.push(new THREE.Matrix4().makeTranslation(X, terrainY(X, Z) + 0.6, Z)); } };
      edge(x0, z0, x1, z0); edge(x0, z1, x1, z1); edge(x0, z0, x0, z1); edge(x1, z0, x1, z1);
      const im = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.2, 0.14), M.ceramic(0x6b5a44), posts.length); posts.forEach((mm, i) => im.setMatrixAt(i, mm)); far(im);
    });
    // farmstead: barn, two silos, water tower, a pickup
    const fx = -123, fz = 114, fy = terrainY(fx, fz);
    const barnRed = M.steelPaint(0x7a2424);
    far(new THREE.Mesh(new THREE.BoxGeometry(12, 5, 20).translate(fx, fy + 2.5, fz), barnRed));
    { const roof = new THREE.BufferGeometry(); const hw = 6.6, h0 = fy + 5, hh = 3.6, L = 10.6; const v = [ -hw, h0, -L, hw, h0, -L, 0, h0 + hh, -L, -hw, h0, L, hw, h0, L, 0, h0 + hh, L ]; roof.setAttribute('position', new THREE.Float32BufferAttribute(v, 3)); roof.setIndex([0, 2, 1, 3, 4, 5, 0, 3, 5, 0, 5, 2, 1, 2, 5, 1, 5, 4]); roof.computeVertexNormals(); roof.translate(fx, 0, fz); far(new THREE.Mesh(roof, new THREE.MeshStandardMaterial({ color: 0x4a4e55, roughness: 0.8, metalness: 0.3, side: THREE.DoubleSide }))); }
    [[fx + 10, fz - 6], [fx + 10, fz + 1]].forEach(([x, z]) => { far(new THREE.Mesh(new THREE.CylinderGeometry(2.4, 2.4, 12, 20).translate(x, fy + 6, z), M.steelPaint(0xc9ced3))); far(new THREE.Mesh(new THREE.ConeGeometry(2.6, 2.2, 20).translate(x, fy + 13.1, z), M.steelPaint(0x8a949e))); });
    { const wx = fx - 12, wz = fz + 10; [[-1.6, -1.6], [1.6, -1.6], [-1.6, 1.6], [1.6, 1.6]].forEach(([dx, dz]) => far(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.16, 12, 6).translate(wx + dx, fy + 6, wz + dz), galv))); far(new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 3.2, 20).translate(wx, fy + 13.6, wz), M.steelPaint(0xd8dde2))); far(new THREE.Mesh(new THREE.ConeGeometry(2.8, 1.6, 20).translate(wx, fy + 16, wz), M.steelPaint(0x8a949e))); }
    far(new THREE.Mesh(ribbonGeo([[-96, 118], [-60, 118], [-40, 116], [-16, 112]], 5, { vScale: 0.5 }), new THREE.MeshStandardMaterial({ color: 0x8a7f6e, roughness: 1 })));
    addBox(fx - 6, fx + 6, 0, 8, fz - 10, fz + 10);
    for (let i = 0; i < 6; i++) TREE_SPOTS.oak.push([fx - 20 + rnd() * 6, fz - 14 + i * 6]);
  }

  // ---- wind farm on the north-west ridge: six turbines, rotors spin, beacons blink
  { const spots = [[-150, -140], [-186, -108], [-214, -62], [-232, -8], [-120, -190], [-240, 50]];
    const tower = new THREE.CylinderGeometry(1.2, 2.0, 58, 12).translate(0, 29, 0), nacelle = new THREE.BoxGeometry(7, 3.2, 3.4).translate(1.2, 58.8, 0);
    const blade = (k) => { const g = new THREE.BoxGeometry(0.9, 26, 2.2).translate(0, 13.5, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const t = p.getY(i) / 26.5; p.setX(i, p.getX(i) * (1 - t * 0.7)); p.setZ(i, p.getZ(i) * (1 - t * 0.75)); } g.rotateX(k * (Math.PI * 2 / 3)); return g; };
    const rotor = BGU.mergeGeometries([new THREE.CylinderGeometry(1.3, 1.3, 1.6, 12).rotateZ(Math.PI / 2).translate(0, 0, 0), blade(0), blade(1), blade(2)], false);
    const white = M.steelPaint(0xe9ecef);
    const tim = new THREE.InstancedMesh(tower, white, spots.length), nim = new THREE.InstancedMesh(nacelle, white, spots.length), rim = new THREE.InstancedMesh(rotor, white, spots.length);
    const yaw = Math.PI * 0.15; const states = [];
    spots.forEach(([x, z], i) => { const y = terrainY(x, z); q.setFromAxisAngle(up, yaw); tim.setMatrixAt(i, m.compose(pv.set(x, y - 0.5, z), q, sc.set(1, 1, 1))); nim.setMatrixAt(i, m); const hub = new THREE.Vector3(-2.6, 58.8, 0).applyQuaternion(q).add(pv.set(x, y - 0.5, z)); states.push({ hub, ang: rnd() * Math.PI * 2, w: 0.55 + rnd() * 0.15 }); outskirts.beaconMats.push(new THREE.Matrix4().makeTranslation(x, y + 60.8, z)); });
    far(tim); far(nim); far(rim);
    outskirts.rotors = { im: rim, states, yawQ: new THREE.Quaternion().setFromAxisAngle(up, yaw) };
  }
  // aviation beacons shared by masts, water tower, turbines
  { const bm = new THREE.MeshBasicMaterial({ color: 0xff2a2a }); const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.45, 8, 6), bm, outskirts.beaconMats.length); outskirts.beaconMats.forEach((mm, i) => im.setMatrixAt(i, mm)); far(im); outskirts.beacons = im; }
  // cell tower by the highway
  { const x = 166, z = -58, y = terrainY(x, z); far(new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.6, 42, 8).translate(x, y + 21, z), galv)); for (let k = 0; k < 3; k++) { const a = (k / 3) * Math.PI * 2; far(new THREE.Mesh(new THREE.BoxGeometry(0.4, 2.4, 1.6).translate(x + Math.cos(a) * 1.4, y + 40, z + Math.sin(a) * 1.4).rotateY(0), M.steelPaint(0xd8dde2))); } outskirts.beaconMats.push(new THREE.Matrix4().makeTranslation(x, y + 42.6, z)); }
})();

// ------------------------------------------------------------------ trees: leaf-card canopies with baked shading, branched trunks, wind
(function buildTrees() {
  // woodland beyond the fence for depth
  const ring = (n, fn) => { for (let i = 0; i < n; i++) fn(); };
  const farOk = (x, z) => !(x > -26 && x < 76 && z > -80 && z < 32) && Math.hypot((x - POND.x) / POND.rx, (z - POND.z) / POND.rz) > 1.3 && Math.abs(terrainY(x, z)) < 3.5;
  ring(70, () => { const x = -115 + rnd() * 270, z = -135 + rnd() * 195; if (farOk(x, z)) TREE_SPOTS[rnd() < 0.55 ? 'juniper' : rnd() < 0.6 ? 'oak' : 'mesquite'].push([x, z]); });
  const SPECIES = {
    oak: { tex: TX.leafBroad, color: 0x3f6a2a, under: 0x6a8a3c, cards: 78, size: 1.55, shape: 'round', rx: 3.2, ry: 2.3, lift: 2.6, trunk: { h: 2.9, r: 0.34, taper: 0.7, branches: 5, blen: 2.0 } },
    juniper: { tex: TX.leafNeedle, color: 0x2f5026, under: 0x4f6b38, cards: 64, size: 1.15, shape: 'cone', rx: 1.9, ry: 5.2, lift: 0.8, trunk: { h: 1.6, r: 0.22, taper: 0.75, branches: 3, blen: 1.0 } },
    mesquite: { tex: TX.leafFine, color: 0x5f7a32, under: 0x7f9448, cards: 56, size: 1.35, shape: 'flat', rx: 3.0, ry: 1.3, lift: 2.4, trunk: { h: 2.5, r: 0.24, taper: 0.6, branches: 6, blen: 2.2, lean: 0.18 } },
  };
  const _c = new THREE.Color(), _u = new THREE.Color();
  function canopyGeometry(sp) {
    const pos = [], nor = [], uv = [], col = [];
    _c.setHex(sp.color); _u.setHex(sp.under);
    const q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), n = new THREE.Vector3();
    for (let i = 0; i < sp.cards; i++) {
      let px, py, pz, rad;
      if (sp.shape === 'cone') { const t = Math.pow(rnd(), 0.75); const r = sp.rx * (1 - t * 0.92) * Math.sqrt(0.35 + rnd() * 0.65); const a = rnd() * Math.PI * 2; px = Math.cos(a) * r; pz = Math.sin(a) * r; py = t * sp.ry; rad = Math.max(t, r / sp.rx); }
      else { const r = Math.pow(rnd(), 0.45); const th = rnd() * Math.PI * 2, ph = Math.acos(2 * rnd() - 1); px = Math.sin(ph) * Math.cos(th) * r * sp.rx; pz = Math.sin(ph) * Math.sin(th) * r * sp.rx; py = Math.cos(ph) * r * sp.ry * (sp.shape === 'flat' ? (Math.cos(ph) > 0 ? 1 : 0.5) : 1); rad = r; }
      const size = sp.size * (0.75 + rnd() * 0.5);
      // shading: outer cards light, inner cards dark, undersides toward the underside tint
      const shade = 0.55 + 0.45 * Math.min(1, rad) + (rnd() - 0.5) * 0.12;
      const up = sp.shape === 'cone' ? py / sp.ry : (py / sp.ry + 1) * 0.5;
      const tint = _c.clone().lerp(_u, 0.35 * (1 - up)).multiplyScalar(shade);
      n.set(px, py * 0.7 + (sp.shape === 'cone' ? sp.ry * 0.25 : 0.5), pz).normalize();
      for (let k = 0; k < 2; k++) {
        e.set((rnd() - 0.5) * 0.9, rnd() * Math.PI * 2, (rnd() - 0.5) * 0.9); q.setFromEuler(e);
        const half = size / 2, corners = [[-half, -half], [half, -half], [half, half], [-half, half]], idx = [0, 1, 2, 0, 2, 3];
        const flip = rnd() < 0.5;
        idx.forEach((ci) => { const [cx, cy] = corners[ci]; v.set(cx, cy, 0).applyQuaternion(q); pos.push(px + v.x, py + v.y, pz + v.z); nor.push(n.x, n.y, n.z); uv.push(flip ? 1 - (cx / size + 0.5) : cx / size + 0.5, cy / size + 0.5); col.push(tint.r, tint.g, tint.b); });
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.translate(0, sp.lift + (sp.shape === 'cone' ? 0 : sp.ry * 0.9), 0);
    return g;
  }
  function trunkGeometry(sp) {
    const t = sp.trunk, parts = [];
    const stem = new THREE.CylinderGeometry(t.r * t.taper, t.r, t.h, 9, 1); stem.translate(0, t.h / 2, 0); parts.push(stem);
    const flare = new THREE.CylinderGeometry(t.r * 1.05, t.r * 1.7, 0.35, 9, 1); flare.translate(0, 0.17, 0); parts.push(flare);
    for (let i = 0; i < t.branches; i++) {
      const a = (i / t.branches) * Math.PI * 2 + rnd() * 0.6, tilt = 0.55 + rnd() * 0.5, len = t.blen * (0.7 + rnd() * 0.6), r0 = t.r * 0.45;
      const b = new THREE.CylinderGeometry(r0 * 0.35, r0, len, 7, 1); b.translate(0, len / 2, 0);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt * Math.cos(a), 0, -tilt * Math.sin(a), 'XYZ'));
      b.applyQuaternion(q); b.translate(0, t.h * (0.72 + rnd() * 0.25), 0); parts.push(b);
    }
    const g = BGU.mergeGeometries(parts, false);
    if (t.lean) g.applyMatrix4(new THREE.Matrix4().makeRotationZ(t.lean));
    return g;
  }
  const bark = mat(withSet(TX.bark, 1.5, 3, { color: 0x6b5a4a, metalness: 0, normalScale: 0.9 })); bark.side = THREE.FrontSide;
  const litterMat = new THREE.MeshBasicMaterial({ map: texShadowDisc, color: 0x000000, transparent: true, opacity: 0.5, depthWrite: false });
  const litterGeo = new THREE.PlaneGeometry(1, 1); litterGeo.rotateX(-Math.PI / 2);
  const allLitter = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), pv = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  Object.entries(SPECIES).forEach(([name, sp]) => {
    const spots = TREE_SPOTS[name]; if (!spots.length) return;
    const leafMat = new THREE.MeshPhysicalMaterial({ map: sp.tex, alphaTest: 0.42, side: THREE.DoubleSide, vertexColors: true, roughness: 1.0, metalness: 0, specularIntensity: 0.15, envMapIntensity: 0.8 });
    leafMat.userData.keepDouble = true; leafMat.userData.wind = { h: sp.lift + sp.ry * 1.6, amp: name === 'juniper' ? 0.06 : 0.11, noFlip: true }; windMats.push(leafMat);
    const canopy = new THREE.InstancedMesh(canopyGeometry(sp), leafMat, spots.length), trunk = new THREE.InstancedMesh(trunkGeometry(sp), bark, spots.length);
    spots.forEach(([x, z], i) => {
      const k = 0.75 + rnd() * 0.7, y = terrainY(x, z) - 0.05;
      q.setFromAxisAngle(up, rnd() * Math.PI * 2); sc.set(k * (0.9 + rnd() * 0.2), k, k * (0.9 + rnd() * 0.2)); pv.set(x, y, z);
      m.compose(pv, q, sc); canopy.setMatrixAt(i, m); trunk.setMatrixAt(i, m);
      canopy.setColorAt(i, new THREE.Color().setHSL(0.24 + (rnd() - 0.5) * 0.04, 0.35 + rnd() * 0.15, 0.9 + rnd() * 0.2));
      addCyl(x, z, sp.trunk.r * 1.1 * k, 0, sp.trunk.h * k);
      allLitter.push([x, y + 0.012, z, (sp.rx * 1.6) * k]);
    });
    canopy.instanceColor.needsUpdate = true; canopy.castShadow = true; canopy.receiveShadow = false; trunk.castShadow = true; trunk.receiveShadow = true; trunk.layers.enable(1);
    scene.add(canopy); scene.add(trunk);
  });
  { const im = new THREE.InstancedMesh(litterGeo, litterMat, allLitter.length); allLitter.forEach(([x, y, z, d], i) => { m.compose(pv.set(x, y, z), q.identity(), sc.set(d, 1, d)); im.setMatrixAt(i, m); }); im.renderOrder = 1; scene.add(im); }
})();
/** Vertex-shader wind for leaf cards and grass; chained after any existing onBeforeCompile (CSM). */
function applyWind(mt) {
  const prev = mt.onBeforeCompile, w = mt.userData.wind;
  mt.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = windUniforms.uTime; sh.uniforms.uWind = windUniforms.uWind; sh.uniforms.uWindH = { value: w.h }; sh.uniforms.uWindA = { value: w.amp };
    if (w.noFlip) sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''));
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uWindH, uWindA, uWind;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
      { vec2 iw = vec2(0.0);
        #ifdef USE_INSTANCING
        iw = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
        #endif
        float wh = smoothstep(0.0, uWindH, transformed.y);
        float ph = uTime * (0.9 + 0.9 * uWind) + iw.x * 0.23 + iw.y * 0.17; float amp = uWindA * (0.3 + 1.4 * uWind);
        transformed.x += (sin(ph) * 0.6 + sin(ph * 2.3 + 1.0) * 0.4) * amp * wh;
        transformed.z += cos(ph * 0.8 + 0.6) * 0.5 * amp * wh; }`);
  };
  mt.customProgramCacheKey = () => (prev ? prev.toString() : '') + 'wind' + (w.noFlip ? 'nf' : '');
  mt.needsUpdate = true;
}
/** Vertex-shader cloth wave for the flag: two travelling sines that grow from the hoist, plus droop in calm air. Recomputes the normal analytically. */
function applyFlagWave(mt, len) {
  const prev = mt.onBeforeCompile;
  mt.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uTime = windUniforms.uTime; sh.uniforms.uWind = windUniforms.uWind; sh.uniforms.uLen = { value: len };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>
      uniform float uTime, uWind, uLen;
      vec3 flagOff(vec3 p, out vec3 n) { float xr = clamp(p.x / uLen, 0.0, 1.0); float w = 0.25 + uWind;
        float ph1 = p.x * 4.2 - uTime * (2.4 + 5.5 * uWind); float ph2 = p.x * 7.5 + p.y * 3.0 - uTime * (3.8 + 8.0 * uWind);
        float A1 = 0.11 * w, A2 = 0.04 * w; float s1 = sin(ph1) * A1 + sin(ph2) * A2;
        float dzdx = (cos(ph1) * 4.2 * A1 + cos(ph2) * 7.5 * A2) * xr + s1 / uLen; float dzdy = cos(ph2) * 3.0 * A2 * xr;
        n = normalize(vec3(-dzdx, -dzdy, 1.0)); return vec3(0.0, -(1.0 - uWind) * 0.42 * xr * xr, s1 * xr); }`)
      .replace('#include <beginnormal_vertex>', 'vec3 fN; vec3 fO = flagOff(position, fN);\n#include <beginnormal_vertex>\nobjectNormal = fN * (objectNormal.z < 0.0 ? -1.0 : 1.0);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed += fO;');
  };
  mt.customProgramCacheKey = () => (prev ? prev.toString() : '') + 'flag';
  mt.needsUpdate = true;
}
/** Detail normal blended into the tangent-space normal map near the camera, and edge wear on bevels found by the rate of change of the object-space normal. */
function applyDetail(mt) {
  const prev = mt.onBeforeCompile, d = mt.userData.detail, wear = d.w > 0;
  mt.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.uniforms.uDetailN = { value: texDetail }; sh.uniforms.uDetailS = { value: d.s }; sh.uniforms.uDetailK = { value: d.k }; sh.uniforms.uWear = { value: d.w };
    sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vDetailD; varying vec3 vObjN;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvDetailD = -mvPosition.z; vObjN = normal;');
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uDetailN; uniform float uDetailS, uDetailK, uWear; varying float vDetailD; varying vec3 vObjN;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float wearF = 0.0;
        #if defined( USE_MAP )
        if (uWear > 0.0) { float curv = length(fwidth(vObjN)) / max(vDetailD, 0.4); float edge = smoothstep(0.004, 0.014, curv);
          float wn = texture2D(uDetailN, vMapUv * 0.37).a; wearF = edge * smoothstep(0.42, 0.72, wn) * uWear * (1.0 - smoothstep(5.0, 28.0, vDetailD));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.6, 0.62, 0.65), wearF); }
        #endif`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor = mix(roughnessFactor, 0.3, wearF);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor = mix(metalnessFactor, 0.9, wearF);')
      .replace('#include <normal_fragment_maps>', THREE.ShaderChunk.normal_fragment_maps.replace('mapN.xy *= normalScale;', `mapN.xy *= normalScale;
        { vec3 dN = texture2D(uDetailN, vNormalMapUv * uDetailS).xyz * 2.0 - 1.0; float df = uDetailK * (1.0 - smoothstep(4.0, 26.0, vDetailD)); mapN.xy += dN.xy * df; mapN = normalize(mapN); }`));
  };
  mt.customProgramCacheKey = () => (prev ? prev.toString() : '') + 'detail' + (wear ? 'w' : '');
  mt.needsUpdate = true;
}
const windUniforms = { uTime: { value: 0 }, uWind: { value: 0.3 } };
/** Scale a box's facade UVs by the instance size so windows keep a fixed size in metres. */
function applyUvScale(mt) {
  const prev = mt.onBeforeCompile, [sx, sy] = mt.userData.uvScale;
  mt.onBeforeCompile = (sh, r) => {
    if (prev) prev(sh, r);
    sh.vertexShader = sh.vertexShader.replace('#include <uv_vertex>', `#include <uv_vertex>
      #ifdef USE_INSTANCING
      { float isx = length(instanceMatrix[0].xyz), isy = length(instanceMatrix[1].xyz), isz = length(instanceMatrix[2].xyz);
        float horiz = abs(normal.x) > 0.5 ? isz : isx;
        vec2 k = vec2(horiz / ${sx.toFixed(2)}, isy / ${sy.toFixed(2)});
        #ifdef USE_MAP
        vMapUv = uv * k;
        #endif
        #ifdef USE_EMISSIVEMAP
        vEmissiveMapUv = uv * k;
        #endif
      }
      #endif`);
  };
  mt.customProgramCacheKey = () => (prev ? prev.toString() : '') + 'uvs' + sx + sy;
  mt.needsUpdate = true;
}

// ------------------------------------------------------------------ walk mode: colliders, stair surfaces, hall interior, figure, controller
const AUTO_COLL = ['pcu', 'cooler', 'loop', 'switchyard', 'truck', 'txline', 'dcsub', 'racks', 'ups', 'bess', 'gens', 'dccool', 'casks', 'dchall', 'control', 'hp_canister', 'hp_core', 'hp_pipes', 'hp_drums', 'hp_hx', 'hp_pcu', 'ht_vessel', 'ht_fuel', 'ht_circulator', 'ht_ihx', 'ht_salt', 'ht_turbine', 'ms_vessel', 'ms_pump', 'ms_hx', 'ms_drain', 'ms_offgas', 'ms_turbine'];
(function buildWalkWorld() {
  scene.updateMatrixWorld(true);
  AUTO_COLL.forEach((id) => { const e = R[id]; if (!e) return; e.meshes.forEach((m) => { if (m.userData.noColl) return; if (m.geometry.type === 'TubeGeometry') return; boxesFromMesh(m); }); });
  // the silo, its top, the head, and the stair tower (world coordinates; see the stair build for the local->world mapping)
  addCyl(0, 0, 3.14, 0, MOD_Y + 0.02); addDisc(0, 0, 3.1, MOD_Y + 0.05); addDisc(0, 0, 1.45, MOD_Y + 0.3); addDisc(0, 0, 0.9, MOD_Y + 0.42);
  addCyl(0, 0, 0.5, MOD_Y + 0.3, MOD_Y + 3); [90, 210, 330].forEach((deg) => { const a = THREE.MathUtils.degToRad(deg); addCyl(Math.cos(a) * 0.25, Math.sin(a) * 0.25, 0.14, MOD_Y + 0.3, MOD_Y + 2.2); });
  addRamp(-2.6, 2.4, -4.55, -3.65, 0, 3.05, 'x');                 // flight 1
  addSurf(2.4, 3.4, -5.45, -3.65, 3.05);                           // landing
  addRamp(-2.6, 2.4, -5.45, -4.55, 6.1, 3.05, 'x');                // flight 2
  addSurf(-3.65, -2.55, -5.5, -3.1, 6.1);                          // top platform
  addSurf(-2.62, -1.75, -3.8, -2.3, 6.15);                         // landing deck from the platform corner onto the silo top
  // rails (invisible colliders that follow the flights; the visible railing is already built)
  const f1 = (x) => 3.05 * THREE.MathUtils.clamp((x + 2.6) / 5.0, 0, 1), f2 = (x) => 6.1 - 3.05 * THREE.MathUtils.clamp((x + 2.6) / 5.0, 0, 1);
  const railX = (xa, xb, z0, z1, lo, hi, n = 10) => { for (let i = 0; i < n; i++) { const x0 = xa + (xb - xa) * i / n, x1 = xa + (xb - xa) * (i + 1) / n, xm = (x0 + x1) / 2; addBox(x0, x1, lo(xm), hi(xm), z0, z1, { noFloor: true }); } };
  railX(-2.6, 2.4, -3.64, -3.58, (x) => f1(x) - 0.3, (x) => f1(x) + 1.15);            // flight 1 outer rail
  railX(-2.6, 2.4, -4.58, -4.52, (x) => f1(x) - 0.3, (x) => f2(x) + 1.15);            // rail between the flights
  railX(-2.6, 2.4, -5.5, -5.44, (x) => f2(x) - 0.3, (x) => f2(x) + 1.15);             // flight 2 outer rail
  addBox(2.4, 3.46, 2.8, 4.3, -3.64, -3.58); addBox(2.4, 3.46, 2.8, 4.3, -5.5, -5.44); addBox(3.4, 3.46, 2.8, 4.3, -5.5, -3.6); // landing rails
  addBox(-3.65, -2.55, 5.9, 7.3, -5.5, -5.44); addBox(-3.7, -3.64, 5.9, 7.3, -5.5, -3.1); addBox(-3.65, -3.1, 5.9, 7.3, -3.1, -3.04); addBox(-2.58, -2.52, 5.9, 7.3, -4.55, -3.8); // platform rails
  addBox(-1.78, -1.72, 5.9, 7.3, -3.8, -2.56); addBox(-2.62, -1.75, 5.9, 7.3, -3.83, -3.77); addBox(-2.65, -2.59, 5.9, 7.3, -3.1, -2.3); // deck rails
  // visible grating deck and its rails, guard rail around the silo top with an opening at the deck
  { const gr = M.steelPaint(0x8a949e), galv = M.galv();
    scenery(G.box(0.87, 0.05, 1.5), gr, { x: -2.185, y: MOD_Y - 0.08, z: -3.05 });
    scenery(G.cyl(0.02, 1.24, 8), galv, { x: -1.75, y: MOD_Y + 0.9, z: -3.18, rx: Math.PI / 2, cast: false }); scenery(G.cyl(0.02, 0.87, 8), galv, { x: -2.185, y: MOD_Y + 0.9, z: -3.8, rz: Math.PI / 2, cast: false });
    [[-1.75, -3.8], [-1.75, -2.56], [-2.62, -3.8], [-2.62, -2.3]].forEach(([x, z]) => scenery(G.cyl(0.018, 1.0, 8), galv, { x, y: MOD_Y + 0.42, z, cast: false }));
    scenery(G.cyl(0.02, 0.8, 8), galv, { x: -2.62, y: MOD_Y + 0.9, z: -2.7, rx: Math.PI / 2, cast: false });
    const ga = -2.24, gw = 0.2, arc = Math.PI * 2 - gw * 2;
    [[MOD_Y + 1.05, 0.025], [MOD_Y + 0.55, 0.02]].forEach(([y, rr]) => { const tg = new THREE.TorusGeometry(3.1, rr, 8, 96, arc); tg.rotateX(Math.PI / 2); tg.rotateY(-(ga + gw)); scenery(tg, galv, { y, cast: false }); });
    for (let k = 0; k < 24; k++) { const a = (k / 24) * Math.PI * 2; let da = a - ga; da = Math.atan2(Math.sin(da), Math.cos(da)); if (Math.abs(da) < gw) continue; scenery(G.cyl(0.018, 1.0, 8), galv, { x: Math.cos(a) * 3.1, y: MOD_Y + 0.55, z: Math.sin(a) * 3.1, cast: false }); }
    addRing(0, 0, 3.08, 3.14, MOD_Y + 0.05, MOD_Y + 1.1, [ga, gw]);
  }
  // reactor hall interior: high-bay fixtures, tool crib, gas bottles, eyewash, signage
  const X0_HALL = -6.5;
  { const lit = litMat(0xfff1dc), dark = M.steelPaint(0x30363c), galv = M.galv();
    [[-3.5, -3], [-3.5, 3], [3, -3], [3, 3], [9, -3], [9, 3]].forEach(([x, z]) => { scenery(G.cyl(0.32, 0.25, 20, 0.5), dark, { x, y: BH - 0.95, z, cast: false }); scenery(G.cyl(0.3, 0.03, 20), lit, { x, y: BH - 1.08, z, cast: false }); scenery(G.cyl(0.03, 0.7, 6), dark, { x, y: BH - 0.5, z, cast: false }); });
    walkLightSpecs.unshift([-3.0, BH - 1.3, 0, 0xfff1dc, 60, 18], [8.0, BH - 1.3, 0, 0xfff1dc, 60, 18]);
    scenery(G.box(2.2, 0.08, 0.8), M.ceramic(0xb49a72), { x: -5.4, y: 0.92, z: -4.2 }); [-0.9, 0.9].forEach((dx) => scenery(G.box(0.1, 0.9, 0.7), dark, { x: -5.4 + dx, y: 0.45, z: -4.2 })); addBox(-6.5, -4.3, 0, 1.0, -4.6, -3.8);
    scenery(G.box(1.0, 2.0, 0.6), M.steelPaint(0x9b2f2f), { x: -5.6, y: 1.0, z: -2.6 }); addBox(-6.1, -5.1, 0, 2.0, -2.9, -2.3);
    [[-5.8, -1.3], [-5.4, -1.3]].forEach(([x, z]) => { scenery(G.cyl(0.12, 1.4, 14), M.steelPaint(0x2f5d3a), { x, y: 0.7, z }); scenery(G.cyl(0.04, 0.12, 8), M.steel(), { x, y: 1.45, z, cast: false }); }); scenery(G.box(0.7, 1.2, 0.05), galv, { x: -5.6, y: 0.8, z: -1.0, cast: false }); addBox(-6.0, -5.2, 0, 1.4, -1.5, -1.0);
    scenery(G.box(0.4, 0.4, 0.3), M.steelPaint(0x2f6fb5), { x: -5.9, y: 1.1, z: 2.0 }); scenery(G.cyl(0.22, 0.03, 16), M.steelPaint(0xd9d9d9), { x: -5.9, y: 1.32, z: 2.0, cast: false }); // eyewash
    scenery(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshStandardMaterial({ map: texTrefoil, roughness: 0.7 }), { x: -6.3, y: 1.8, z: 0, ry: Math.PI / 2, cast: false });
    // lockers, fire extinguisher, rolling tool chest, scaffold tower, pallet of drums, trash can, sign
    for (let k = 0; k < 4; k++) scenery(G.box(0.4, 1.8, 0.5), M.steelPaint(k % 2 ? 0x8a949e : 0x6a7480), { x: -6.0, y: 0.9, z: 2.6 + k * 0.42 }); addBox(-6.25, -5.75, 0, 1.8, 2.4, 4.3);
    scenery(G.box(0.3, 0.7, 0.28), M.steelPaint(0xb01c1c), { x: -6.05, y: 1.25, z: 0.4, cast: false }); scenery(G.cyl(0.08, 0.5, 12), M.steelPaint(0xb01c1c), { x: -5.95, y: 1.2, z: 0.4, cast: false });
    scenery(G.box(0.9, 0.95, 0.5), M.steelPaint(0xb01c1c), { x: -4.4, y: 0.55, z: 2.6 }); [[-4.75, 2.4], [-4.05, 2.4], [-4.75, 2.8], [-4.05, 2.8]].forEach(([x, z]) => scenery(G.cyl(0.06, 0.08, 10), M.rubber(), { x, y: 0.04, z, rx: Math.PI / 2, cast: false })); addBox(-4.9, -3.9, 0, 1.0, 2.3, 2.9);
    { const sx = 11.4, sz = -4.3; [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz]) => scenery(G.cyl(0.025, 2.2, 8), galv, { x: sx + dx, y: 1.1, z: sz + dz })); scenery(G.box(1.2, 0.05, 1.2), M.steelPaint(0x8a949e), { x: sx, y: 1.5, z: sz, cast: false }); [0.6, 1.6].forEach((y) => [-0.5, 0.5].forEach((dx) => scenery(G.cyl(0.015, 1.0, 6), galv, { x: sx + dx, y, z: sz, rx: Math.PI / 2, cast: false }))); [[-0.5, -0.5], [0.5, -0.5], [-0.5, 0.5], [0.5, 0.5]].forEach(([dx, dz]) => scenery(G.cyl(0.07, 0.1, 10), M.rubber(), { x: sx + dx, y: 0.05, z: sz + dz, cast: false })); addBox(sx - 0.6, sx + 0.6, 0, 2.2, sz - 0.6, sz + 0.6); }
    scenery(G.box(1.2, 0.14, 1.0), M.ceramic(0xa78a5f), { x: 11.5, y: 0.07, z: 4.6, cast: false }); [[-0.28, -0.22], [0.28, -0.22], [0, 0.26]].forEach(([dx, dz]) => scenery(G.cyl(0.26, 0.85, 16), M.steelPaint(0x2f5d3a), { x: 11.5 + dx, y: 0.57, z: 4.6 + dz })); addBox(10.9, 12.1, 0, 1.0, 4.1, 5.1);
    scenery(G.cyl(0.25, 0.7, 14, 0.22), M.steelPaint(0x3b434c), { x: 4.4, y: 0.35, z: 5.3 }); addCyl(4.4, 5.3, 0.3, 0, 0.7);
    scenery(G.box(0.02, 0.5, 0.8), M.steelPaint(0xd9d9d9), { x: X0_HALL + 0.4, y: 2.0, z: 1.6, cast: false });
    // painted walkway lines on the hall floor
    const yl = new THREE.MeshStandardMaterial({ color: 0xe3b32a, roughness: 0.8 });
    [[-5.0, 0.0, 0.08, 10.8], [-5.0 + 1.6, 0.0, 0.08, 10.8], [-5.8, 5.3, 1.6, 0.08], [-5.8, -5.3, 1.6, 0.08]].forEach(([x, z, w, d]) => scenery(new THREE.PlaneGeometry(w, d), yl, { x, y: 0.009, z, rx: -Math.PI / 2, cast: false }));
  }
  // data hall interior lights
  walkLightSpecs.push([6, HH_W - 2.4, -55, 0xfff1dc, 70, 24], [20, HH_W - 2.4, -55, 0xfff1dc, 70, 24], [34, HH_W - 2.4, -55, 0xfff1dc, 70, 24]);
  // roof ladders with safety cages: reactor building (west wall) and data hall (south wall)
  function ladder(x, z, y0, y1, nx, nz, label) {
    // built in local space: rails in the x-y plane at z = 0, cage bulging toward +z (away from the wall)
    const galv = M.galv(), g = new THREE.Group(); g.position.set(x + nx * 0.16, 0, z + nz * 0.16); g.rotation.y = Math.atan2(nx, nz); scene.add(g);
    const h = y1 - y0 + 1.1;
    [-0.25, 0.25].forEach((dx) => scenery(G.cyl(0.022, h, 8), galv, { parent: g, x: dx, y: y0 + h / 2 }));
    const rungs = []; for (let y = y0 + 0.3; y < y1 + 0.9; y += 0.3) rungs.push(new THREE.Matrix4().makeTranslation(0, y, 0));
    const im = new THREE.InstancedMesh(G.cyl(0.016, 0.5, 8).rotateZ(Math.PI / 2), galv, rungs.length); rungs.forEach((mm, i) => im.setMatrixAt(i, mm)); im.castShadow = true; g.add(im);
    for (let y = y0 + 2.4; y < y1 + 0.6; y += 1.0) { const hoop = new THREE.TorusGeometry(0.38, 0.015, 6, 20, Math.PI); hoop.rotateX(Math.PI / 2); scenery(hoop, galv, { parent: g, y, cast: false }); }
    const bh = y1 - y0 - 2.2; [[-0.3, 0.24], [0.3, 0.24], [0, 0.38]].forEach(([bx, bz]) => scenery(G.cyl(0.012, bh, 6), galv, { parent: g, x: bx, y: y0 + 2.4 + bh / 2, z: bz, cast: false }));
    addLadder(x, z, y0, y1, nx, nz, label);
  }
  ladder(-6.81, 3.5, 0, BH + 0.72, -1, 0, 'Roof ladder'); addSurf(-6.5, 12.5, -6, 6, BH + 0.72);
  { const ry = BH + 0.72; addBox(-6.8, 12.8, ry, ry + 1.1, -6.8, -6.74); addBox(-6.8, 12.8, ry, ry + 1.1, 6.74, 6.8); addBox(-6.8, -6.74, ry, ry + 1.1, -6.8, 2.9); addBox(-6.8, -6.74, ry, ry + 1.1, 4.1, 6.8); addBox(12.74, 12.8, ry, ry + 1.1, -6.8, 6.8);
    const galv = M.galv(); const rail = (x0, x1, z0, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), ang = Math.atan2(-(z1 - z0), x1 - x0); scenery(G.cyl(0.02, len, 8), galv, { x: (x0 + x1) / 2, y: ry + 1.05, z: (z0 + z1) / 2, rz: Math.PI / 2, ry: ang, cast: false }); scenery(G.cyl(0.016, len, 8), galv, { x: (x0 + x1) / 2, y: ry + 0.55, z: (z0 + z1) / 2, rz: Math.PI / 2, ry: ang, cast: false }); const n = Math.round(len / 2.2); for (let i = 0; i <= n; i++) scenery(G.cyl(0.02, 1.05, 8), galv, { x: x0 + (x1 - x0) * i / n, y: ry + 0.52, z: z0 + (z1 - z0) * i / n, cast: false }); };
    rail(-6.75, 12.75, -6.75, -6.75); rail(-6.75, 12.75, 6.75, 6.75); rail(-6.75, -6.75, -6.75, 2.9); rail(-6.75, -6.75, 4.1, 6.75); rail(12.75, 12.75, -6.75, 6.75);
    [[6.5, -3.2], [6.5, 3.2]].forEach(([x, z]) => addBox(x - 1.0, x + 1.0, ry, ry + 1.3, z - 0.8, z + 0.8)); }
  ladder(2.0, -43.85, 0, HH_W + 0.08, 0, 1, 'Roof ladder'); addSurf(-4, 44, -66, -44, HH_W + 0.08);
})();
const walkLights = walkLightSpecs.slice(0, DETAIL === 2 ? 14 : 5).map(([x, y, z, c, i, d]) => { const l = new THREE.PointLight(c, 0, d, 2); l.position.set(x, y, z); l.userData.on = i; scene.add(l); return l; });
const headlamp = new THREE.SpotLight(0xfff2dc, 0, 20, 0.62, 0.75, 2); headlamp.castShadow = false; scene.add(headlamp); scene.add(headlamp.target);
const rig = buildRig({ hivis: M.hivis(), denim: M.denim(), skin: M.skin(), shirt: M.shirt(), reflect: M.reflect(), boot: M.boot(), hat: M.ceramic(0xf2e9c8), lamp: new THREE.MeshBasicMaterial({ color: 0xfff6e0 }) }, G);
scene.add(rig.root);

// ------------------------------------------------------------------ lights
const glow = new THREE.PointLight(0xff7a2a, 7, 7, 2);
glow.position.set(0, MOD_Y + CORE_Y + 0.8, 0); scene.add(glow);
// soft interior fill so the pool internals and the cut faces read well
const innerA = new THREE.PointLight(0xfff1e0, 2.6, 10, 2); innerA.position.set(0, MOD_Y - 1.2, 0); scene.add(innerA);
const innerB = new THREE.PointLight(0xdfe9ff, 1.2, 8, 2); innerB.position.set(0, MOD_Y - 4.6, 0); scene.add(innerB);
const USE_CSM = DETAIL === 2 && qs.get('csm') !== '0' && qLevel >= 3;
let csm = null, key = null;
if (USE_CSM) {
  csm = new CSM({ maxFar: 140, cascades: 3, mode: 'practical', parent: scene, shadowMapSize: hiQ ? 2048 : 1024, lightDirection: SUN_DIR, lightIntensity: 3.4, lightNear: 1, lightFar: 260, lightMargin: 80, camera, shadowBias: -0.00025 });
  csm.fade = true;
  csm.lights.forEach((l) => { l.color.setHex(0xffd4a8); l.shadow.normalBias = 0.05; });
} else {
  key = new THREE.DirectionalLight(0xffd4a8, 3.4);
  key.position.copy(SUN_POS).multiplyScalar(70).add(new THREE.Vector3(12, 0, -24)); key.target.position.set(12, 0, -24); key.castShadow = true;
  key.shadow.mapSize.set(hiQ ? 2048 : 1024, hiQ ? 2048 : 1024);
  if (qs.get('shadows') === '0') renderer.shadowMap.enabled = false;
  key.shadow.camera.near = 1; key.shadow.camera.far = 140;
  key.shadow.camera.left = key.shadow.camera.bottom = -50; key.shadow.camera.right = key.shadow.camera.top = 50;
  key.shadow.bias = -0.0004; key.shadow.normalBias = 0.03;
  scene.add(key); scene.add(key.target);
}
if (qs.get('shadows') === '0') renderer.shadowMap.enabled = false;
const fill = new THREE.DirectionalLight(0xa9c2ea, 0.9); fill.position.set(-26, 14, 20); scene.add(fill);
const hemi = new THREE.HemisphereLight(0x8ea3c4, 0x3e3a30, 0.75); scene.add(hemi);

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
let power = 1, spin = 1; // visual power and turbine fractions, set from the plant model each frame
const sim = createSim();
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
  const sys = { pts, update(dt, spd = 1, heatK = 1) {
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
let composer = null, bloom = null, gtao = null;
// AO sees opaque geometry only (layer 1), so ghost walls and the pool do not darken what is behind them
const aoCam = camera.clone(); aoCam.layers.set(1);
let hazeRef = null, smaa = null, grade = null, rays = null, qLevelBuilt = qLevel;
// final grade: gentle filmic S-curve, warm shadows and cool highlights, saturation, vignette, fine grain
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.32 }, uGrain: { value: 0.02 }, uTime: { value: 0 }, uSat: { value: 1.06 }, uLift: { value: 0.012 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uVignette, uGrain, uTime, uSat, uLift; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }
    void main(){
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, uSat);                                           // saturation
      c = c * (1.0 - uLift) + uLift;                                       // lifted blacks
      c = c + (0.5 - l) * vec3(0.016, 0.004, -0.018) * (1.0 - l);          // warm shadows
      c = c + (l - 0.5) * vec3(-0.01, 0.0, 0.016) * l;                     // cool highlights
      c = c * c * (3.0 - 2.0 * c) * 0.35 + c * 0.65;                       // soft S-curve
      vec2 q = vUv - 0.5; float v = 1.0 - uVignette * smoothstep(0.25, 0.95, dot(q, q) * 2.2);
      c *= v;
      c += (hash(gl_FragCoord.xy) - 0.5) * uGrain * (1.0 - l * 0.6);
      gl_FragColor = vec4(c, 1.0);
    }` };
// sun shafts: radial blur of the bright sky near the sun's screen position, added back in (runs on the HDR image)
const RaysShader = {
  uniforms: { tDiffuse: { value: null }, uSun: { value: new THREE.Vector2(0.5, 0.5) }, uIntensity: { value: 0.0 }, uAspect: { value: 1.78 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform vec2 uSun; uniform float uIntensity, uAspect; varying vec2 vUv;
    void main(){
      vec4 base = texture2D(tDiffuse, vUv);
      vec2 d = vUv - uSun; d.x *= uAspect; float dist = length(d);
      if (uIntensity < 0.002 || dist > 0.9) { gl_FragColor = base; return; }
      vec2 step = (uSun - vUv) / 28.0 * 0.92;
      vec2 p = vUv; float w = 1.0, acc = 0.0; vec3 col = vec3(0.0);
      for (int i = 0; i < 28; i++) { p += step; vec3 s = texture2D(tDiffuse, p).rgb; float lum = dot(s, vec3(0.3, 0.59, 0.11)); float bright = smoothstep(0.75, 2.2, lum); col += s * bright * w; acc += w; w *= 0.93; }
      col /= acc;
      float fall = 1.0 - smoothstep(0.1, 0.9, dist);
      gl_FragColor = vec4(base.rgb + col * fall * uIntensity, base.a);
    }` };
function buildComposer(w, h) {
  if (composer) { composer.dispose?.(); composer = null; gtao = null; bloom = null; smaa = null; grade = null; rays = null; }
  const msaa = qLevel >= 2;
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: msaa ? 4 : 0 });
  composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  if (qs.get('ao') !== '0' && qLevel >= 3) {
    try {
      gtao = new GTAOPass(scene, aoCam, w, h);
      gtao.output = GTAOPass.OUTPUT.Default;
      gtao.blendIntensity = 0.85;
      gtao.updateGtaoMaterial({ radius: 0.45, distanceExponent: 1.2, thickness: 1.0, scale: 1.0, samples: 12, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 4, radiusExponent: 1, rings: 2, samples: 12 });
      composer.addPass(gtao);
    } catch (e) { console.warn('GTAO unavailable', e); gtao = null; }
  }
  if (qLevel >= 2 && qs.get('rays') !== '0') { rays = new ShaderPass(RaysShader); composer.addPass(rays); }
  if (qLevel >= 2) { bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.32, 0.6, 0.7); composer.addPass(bloom); }
  if (hazeRef) composer.addPass(hazeRef.pass);
  composer.addPass(new OutputPass());
  if (!msaa && qs.get('smaa') !== '0') { try { smaa = new SMAAPass(w, h); composer.addPass(smaa); } catch (e) { smaa = null; } }
  if (qs.get('grade') !== '0') { grade = new ShaderPass(GradeShader); composer.addPass(grade); }
}

// ------------------------------------------------------------------ sizing
let W = 1, H = 1;
function resize() {
  const r = app.getBoundingClientRect();
  W = Math.max(1, Math.floor(r.width)); H = Math.max(1, Math.floor(r.height));
  const dpr = Math.min(devicePixelRatio || 1, DPR_CAP[qLevel] ?? 1.0);
  renderer.setPixelRatio(dpr);
  renderer.setSize(W, H, false);
  labelRenderer.setSize(W, H);
  leaders.dpr = Math.min(devicePixelRatio || 1, 2); leaders.c.width = Math.round(W * leaders.dpr); leaders.c.height = Math.round(H * leaders.dpr);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  aoCam.aspect = camera.aspect; aoCam.fov = camera.fov; aoCam.near = camera.near; aoCam.far = camera.far; aoCam.updateProjectionMatrix();
  if (composer) { composer.setPixelRatio(dpr); composer.setSize(W, H); }
}
new ResizeObserver(() => resize()).observe(app);
resize();
{ const tb = document.getElementById('tools'); if (tb) new ResizeObserver(() => document.documentElement.style.setProperty('--barH', tb.offsetHeight + 'px')).observe(tb); }
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
    const b = m.userData.base; if (!b || !m.emissive) return;
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
  if (e.internal && cutVal < 0.5 && !xray && !walk.active) setCut(55, true);
  if ((id === 'racks' || id === 'ups') && dcRoof[0] && dcRoof[0].visible) { dcRoof.forEach((m) => (m.visible = false)); const cb = $('#dcRoofCb'); if (cb) cb.checked = false; }
  if (fly && walk.active) walkToPart(e); else if (fly) flyToPart(e);
  applyXray();
  hideHint();
  if (location.hash !== '#' + id) history.replaceState(null, '', '#' + id);
  analytics.event('part/' + id);
}
function deselect() {
  if (selected && R[selected]) { setHighlight(R[selected], false); R[selected].labelEl?.classList.remove('active'); }
  selected = null; xray = false; applyXray();
  document.querySelectorAll('.pi').forEach((b) => b.classList.remove('active'));
  ui.card.classList.add('hidden');
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
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
  if (ev.key === 'Escape' && walk.active) { ui.results.classList.remove('open'); ui.help.classList.add('hidden'); closeMenus(); if (walk.state.frozen) { walk.state.frozen = false; if (!ph.panel.classList.contains('hidden')) $('#btnPhysics').click(); } else if (!ui.card.classList.contains('hidden')) deselect(); else if (document.pointerLockElement !== canvas) exitWalk(); return; }
  if (ev.key === 'Escape') { ui.results.classList.remove('open'); ui.help.classList.add('hidden'); closeMenus(); if (tour) stopTour(); else if (startup) stopStartup(); else deselect(); ui.search.blur(); return; }
  if (typing || walk.active) return;
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

// ------------------------------------------------------------------ cut caps: the silo reads as solid concrete where the plane slices it
const caps = [];
for (let i = 0; i < 6; i++) { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshStandardMaterial({ map: tiled(TX.hatch, 1, 1), roughness: 1, metalness: 0, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 })); m.visible = false; m.renderOrder = 1; m.layers.enable(1); scene.add(m); caps.push(m); }
const _cv = new THREE.Vector3(), _cu = new THREE.Vector3(), _pz = new THREE.Vector3(0, 0, 1);
function updateCaps() {
  caps.forEach((m) => (m.visible = false));
  if (cutVal <= 0.5 || explodeVal > 0.5 || !R.shield.root.visible) return;
  _cv.copy(clipPlane.normal).negate(); const c = clipPlane.constant; _cu.set(-_cv.z, 0, _cv.x);
  let k = 0;
  const ring = (ri, ro, y0, y1) => {
    if (Math.abs(c) >= ro) return;
    const b = Math.sqrt(ro * ro - c * c);
    const segs = Math.abs(c) < ri ? [[Math.sqrt(ri * ri - c * c), b], [-b, -Math.sqrt(ri * ri - c * c)]] : [[-b, b]];
    for (const [s1, s2] of segs) {
      const m = caps[k++]; if (!m) return; const sm = (s1 + s2) / 2, w = Math.abs(s2 - s1), h = y1 - y0;
      m.position.set(_cv.x * c + _cu.x * sm, (y0 + y1) / 2, _cv.z * c + _cu.z * sm);
      m.scale.set(w, h, 1); m.quaternion.setFromUnitVectors(_pz, _cv); m.material.map.repeat.set(w / 0.7, h / 0.7); m.visible = true;
    }
  };
  ring(1.75, 3.1, MOD_Y - 5.8, MOD_Y - 0.2);
  ring(1.5, 3.1, MOD_Y - 0.2, MOD_Y + 0.3);
  ring(0, 3.45, MOD_Y - 6.2, MOD_Y - 6.0);
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
// ---- quality: four levels, applied live where possible; CSM and AO need a reload and follow the saved level on the next visit
function applyQuality(level, { save = true } = {}) {
  level = THREE.MathUtils.clamp(level | 0, 0, 3); qLevel = level;
  hiQ = !isMobile && level >= 2;
  const ms = [512, 1024, 1024, 2048][level];
  const rebuild = (level >= 2) !== (qLevelBuilt >= 2) || (level >= 3) !== (qLevelBuilt >= 3); qLevelBuilt = level;
  if (csm) csm.lights.forEach((l) => { if (l.shadow.mapSize.x !== ms) { l.shadow.mapSize.set(ms, ms); if (l.shadow.map) { l.shadow.map.dispose(); l.shadow.map = null; } } });
  if (key) { key.shadow.mapSize.set(ms, ms); if (key.shadow.map) { key.shadow.map.dispose(); key.shadow.map = null; } }
  resize();
  if (rebuild || !composer) buildComposer(W, H);
  if (composer) { composer.setPixelRatio(renderer.getPixelRatio()); composer.setSize(W, H); }
  grassTufts.forEach((im) => { im.count = Math.round(im.userData.full * [0.3, 0.6, 1, 1][level]); });
  if (QUALITY_MODE === 'auto' && save) saveSetting('qualityAuto', level);
  document.querySelectorAll('.qbtn').forEach((b) => b.classList.toggle('on', b.dataset.q === QUALITY_MODE));
  const lab = $('#qualityLabel'); if (lab) lab.textContent = ['Low', 'Medium', 'High', 'Max'][level];
}
document.querySelectorAll('.qbtn').forEach((b) => b.addEventListener('click', () => {
  saveSetting('quality', b.dataset.q);
  if (b.dataset.q !== 'auto') { applyQuality(+b.dataset.q, { save: false }); }
  document.querySelectorAll('.qbtn').forEach((x) => x.classList.toggle('on', x === b));
  if (+b.dataset.q >= 3 && !csm) say('Full shadows and ambient occlusion turn on after a reload.');
}));
{ const lab = $('#qualityLabel'); if (lab) lab.textContent = ['Low', 'Medium', 'High', 'Max'][qLevel]; document.querySelectorAll('.qbtn').forEach((b) => b.classList.toggle('on', b.dataset.q === QUALITY_MODE)); }
// frame-time watchdog: steps the level down when frames run long, back up when there is room
const perf = { acc: 0, n: 0, slow: 0, fast: 0, t0: performance.now(), cap: 3, lastUp: 0 };
function watchFrame(dt, now) {
  if (QUALITY_MODE !== 'auto' || TEST || document.visibilityState !== 'visible' || now - perf.t0 < 8000 || dt > 0.25) return;
  perf.acc += dt; perf.n++;
  if (perf.n < 90) return;
  const avg = perf.acc / perf.n; perf.acc = 0; perf.n = 0;
  if (avg > 0.034) { perf.slow++; perf.fast = 0; } else if (avg < 0.014) { perf.fast++; perf.slow = 0; } else { perf.slow = 0; perf.fast = 0; }
  if (perf.slow >= 2 && qLevel > 0) { if (now - perf.lastUp < 30000) perf.cap = Math.min(perf.cap, qLevel - 1); applyQuality(qLevel - 1); perf.slow = 0; }
  else if (perf.fast >= 6 && qLevel < perf.cap) { applyQuality(qLevel + 1); perf.fast = 0; perf.lastUp = now; }
}
$('#layersBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !$('#layersMenu').classList.contains('hidden'); closeMenus(); if (!open) $('#layersMenu').classList.remove('hidden'); });
addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.dd')) closeMenus(); });

let labelsOn = true;
function toggleLabels() { labelsOn = !labelsOn; $('#tgLabels').classList.toggle('on', labelsOn); labelRenderer.domElement.style.display = labelsOn ? '' : 'none'; saveSetting('labels', labelsOn); }
$('#tgLabels').addEventListener('click', toggleLabels);
$('#tgFlow').addEventListener('click', () => { flowOn = !flowOn; flowA.pts.visible = flowB.pts.visible = flowE.pts.visible = flowOn; $('#tgFlow').classList.toggle('on', flowOn); saveSetting('flow', flowOn); });
if (SETTINGS.labels === false) toggleLabels(); if (SETTINGS.flow === false) $('#tgFlow').click();

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
    const x = (_sp.x * 0.5 + 0.5) * W + LEAD_X, y = (-_sp.y * 0.5 + 0.5) * H - LEAD_Y - 12;
    cands.push({ e, pri, dist, x, y, w: e.labelEl.offsetWidth || e.def.name.length * 7 + 30, h: 26 });
  });
  cands.sort((a, b) => a.pri - b.pri || a.dist - b.dist);
  // open UI surfaces (card, physics panel, guide, parts menu) count as placed blockers
  const placed = [];
  document.querySelectorAll('#card, #physics, #guide, .menu.panel').forEach((el) => {
    if (el.classList.contains('hidden') || el.offsetParent === null) return;
    const r = el.getBoundingClientRect(); if (r.width < 2) return;
    placed.push({ x: r.left - 6, y: r.top + r.height / 2, w: r.width + 12, h: r.height + 12, ui: true });
  });
  cands.forEach((c) => {
    const hit = placed.some((p) => c.x < p.x + p.w && c.x + c.w > p.x && Math.abs(c.y - p.y) < (c.h + p.h) / 2);
    const underUi = hit && placed.some((p) => p.ui && c.x < p.x + p.w && c.x + c.w > p.x && Math.abs(c.y - p.y) < (c.h + p.h) / 2);
    if (hit && (c.pri >= 2 || (underUi && c.pri === 1))) { c.e.labelEl.classList.add('off'); return; }
    c.e.labelEl.classList.remove('off'); placed.push(c);
  });
}
/** Draw the anchor dots and leader hairlines for every label that is currently shown. Runs every frame so lines stay glued while the camera moves. */
function drawLeaders(t) {
  const { ctx, c, dpr } = leaders; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  if (!labelsOn || walk.active) return;
  ctx.lineWidth = 1; ctx.lineCap = 'round';
  Object.values(R).forEach((e) => {
    if (!e.label || !e.labelEl) return;
    const el = e.labelEl, want = el.classList.contains('off') || !e.root.visible ? 0 : el.classList.contains('dim') ? 0.25 : 1;
    e.lead = (e.lead ?? want) + (want - (e.lead ?? want)) * 0.22; if (e.lead < 0.02) return;
    e.label.getWorldPosition(_lp); _sp.copy(_lp).project(camera); if (_sp.z > 1 || _sp.z < -1) return;
    const x = (_sp.x * 0.5 + 0.5) * W, y = (-_sp.y * 0.5 + 0.5) * H, active = e.id === selected, a = e.lead * (active ? 0.95 : 0.6);
    ctx.strokeStyle = `rgba(255,252,244,${a})`; ctx.fillStyle = `rgba(255,252,244,${a})`;
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + LEAD_X, y - LEAD_Y); ctx.lineTo(x + LEAD_X + 12, y - LEAD_Y); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, active ? 3 : 2.4, 0, Math.PI * 2); ctx.fill();
    if (active) { ctx.save(); ctx.setLineDash([3, 3]); ctx.lineDashOffset = -t * 6; ctx.beginPath(); ctx.arc(x, y, 7.5, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  });
}
const MAJOR = new Set(['building', 'shield', 'vessel', 'head', 'dhr', 'pcu', 'cooler', 'loop', 'skid', 'sodium', 'switchyard', 'txline', 'dcsub', 'dchall', 'bess', 'gens', 'dccool', 'crane', 'truck', 'control', 'casks', 'hp_canister', 'ht_vessel', 'ht_salt', 'ms_vessel']);
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
  analytics.event('tour');
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
  power: { pos: new THREE.Vector3(21, 6.5, 12.5), tgt: new THREE.Vector3(10.5, 1.5, 0), cut: 0 },
  datacenter: { pos: new THREE.Vector3(66, 34, -14), tgt: new THREE.Vector3(20, 2, -52), cut: 0 },
  site: { pos: new THREE.Vector3(82, 46, 40), tgt: new THREE.Vector3(24, 0, -20), cut: 0 },
  park: { pos: new THREE.Vector3(142, 30, 24), tgt: new THREE.Vector3(103, 2, -30), cut: 0 },
};
function goView(name) {
  const v = VIEWS[name]; if (!v) return;
  stopTour(); flyTo(v.pos, v.tgt, 1700); setCut(v.cut, true); analytics.event('view/' + name);
}
$('#viewsBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !$('#viewsMenu').classList.contains('hidden'); closeMenus(); if (!open) $('#viewsMenu').classList.remove('hidden'); });
document.querySelectorAll('#viewsMenu .mi').forEach((b) => b.addEventListener('click', () => { goView(b.dataset.view); $('#viewsMenu').classList.add('hidden'); }));

// Start-up: pre-checks → drums rotate out → power ascension → turbine roll → full power.
let startup = null, startupCamFree = false;
const STEPS = [
  [0, 'Pre-start checks · sodium at 400 °C · pumps running · time-lapse ×2'],
  [3, 'Control drums rotate out · the core goes critical'],
  [8, 'Power ascension · fuel and sodium heat up · feedback steadies the rise'],
  [12, 'Turbine roll · generator synchronizes · heat now has a path'],
  [20, 'At full power · 30 MWt thermal · 10 MWe electric · outlet 550 °C'],
];
function runStartup() {
  analytics.event('startup');
  stopTour(); deselect(); startupCamFree = false;
  startup = { t: 0, step: -1, flewPower: false };
  sim.cold(); sim.Pf = 0.02; syncPhysicsUI();
  ui.tourBar.classList.remove('hidden'); ui.tourBar.classList.add('startup');
  $('#btnStartup').classList.add('on');
  flyTo(VIEWS.section.pos, VIEWS.section.tgt, 1700); setCut(55, true);
}
function stopStartup() {
  if (!startup) return;
  startup = null;
  if (sim.P < 0.9 || !sim.gen) { sim.reset(); syncPhysicsUI(); }
  ui.tourBar.classList.add('hidden'); ui.tourBar.classList.remove('startup');
  $('#btnStartup').classList.remove('on');
}
function updateStartup(dt) {
  if (!startup) return;
  startup.t += dt;
  const t = startup.t;
  sim.drum = 0.6 * THREE.MathUtils.clamp((t - 3) / 8, 0, 1);
  if (t > 12) sim.gen = true;
  let step = 0; for (let i = 0; i < STEPS.length; i++) if (t >= STEPS[i][0]) step = i;
  if (step !== startup.step) { startup.step = step; ui.tourText.textContent = `Start-up · ${STEPS[step][1]}`; syncPhysicsUI(); }
  if (t >= 12.5 && !startup.flewPower && !startupCamFree) { startup.flewPower = true; flyTo(VIEWS.power.pos, VIEWS.power.tgt, 2200); setCut(0, true); }
  if (t > 27) stopStartup();
}
$('#btnStartup').addEventListener('click', () => (startup ? stopStartup() : runStartup()));
$('#tourStop').addEventListener('click', stopStartup);

// ------------------------------------------------------------------ physics panel
const ph = {
  panel: $('#physics'), status: $('#phStatus'), drums: $('#phDrums'), drumsVal: $('#phDrumsVal'), pumps: $('#phPumps'), gen: $('#phGen'), scram: $('#phScram'), reset: $('#phReset'),
  chart: $('#phChart'), rP: $('#rP'), rE: $('#rE'), rT: $('#rT'), rF: $('#rF'), rR: $('#rR'), rD: $('#rD'), rB: $('#rB'), rG: $('#rG'),
};
const hist = { P: [], T: [], t: 0 };
let statusLock = 0;
function say(msg, hold = 6) { ph.status.textContent = msg; statusLock = hold; }
function setToggle(btn, on, onText, offText) { btn.classList.toggle('on', on); btn.classList.toggle('off', !on); btn.querySelector('em').textContent = on ? onText : offText; }
function syncPhysicsUI() {
  ph.drums.value = String(Math.round(sim.drum * 100)); ph.drumsVal.textContent = `${Math.round(sim.drum * 100)}% out`;
  setToggle(ph.pumps, sim.pumps, 'on', 'off'); setToggle(ph.gen, sim.gen, 'online', 'tripped');
  ph.scram.classList.toggle('on', sim.scram); ph.scram.querySelector('span').nextSibling.textContent = sim.scram ? 'SCRAM: rods are in' : 'SCRAM: drop the rods';
}
ph.drums.addEventListener('input', () => {
  const v = +ph.drums.value / 100; const out = v > sim.drum; sim.drum = v; ph.drumsVal.textContent = `${Math.round(v * 100)}% out`;
  if (sim.scram) say('The rods are in, so the drums change nothing. Reset to pull the rods.');
  else if (out) say('Drums out adds reactivity. Power climbs until hotter fuel and sodium remove that reactivity again.');
  else say('Drums in removes reactivity. Power falls until cooler fuel and sodium balance it. Fully in, the core shuts down.');
  stopStartup();
});
ph.pumps.addEventListener('click', () => { sim.pumps = !sim.pumps; syncPhysicsUI(); stopStartup(); say(sim.pumps ? 'Pumps back on. Flow returns, the outlet cools, and power recovers by itself.' : 'Pumps off. Flow coasts down to natural circulation. The hotter core lowers its own power to match the cooling it has. No valve, no operator.'); });
ph.gen.addEventListener('click', () => { sim.gen = !sim.gen; syncPhysicsUI(); stopStartup(); say(sim.gen ? 'Generator back online. Heat has a path again, power follows the load, and the batteries recharge.' : 'Generator tripped. Heat has no path to the turbine, so the core throttles back on its own. Batteries carry the data hall now. Backup generators start in 10 seconds.'); });
ph.scram.addEventListener('click', () => { if (sim.scram) return; sim.scram = true; sim.trip = 'manual'; syncPhysicsUI(); stopStartup(); say('Rods dropped. Fission stops in about two seconds. Decay heat stays at a few percent, and passive air cooling carries it away.'); });
ph.reset.addEventListener('click', () => { sim.reset(); syncPhysicsUI(); stopStartup(); say('Steady at full power. The drums hold reactivity at zero.'); });
$('#physics .pClose').addEventListener('click', () => { ph.panel.classList.add('hidden'); $('#btnPhysics').classList.remove('on'); document.body.classList.remove('panel-open'); });
$('#btnPhysics').addEventListener('click', () => { const open = ph.panel.classList.contains('hidden'); ph.panel.classList.toggle('hidden', !open); $('#btnPhysics').classList.toggle('on', open); document.body.classList.toggle('panel-open', open); if (!open && walk.active) walk.state.frozen = false; if (open) { $('#guide').classList.add('hidden'); $('#btnGuide').classList.remove('on'); if (isMobile) deselect(); } });
let lastTrip = null;
function updatePhysicsUI(dt) {
  if (statusLock > 0) statusLock -= dt;
  if (sim.trip && sim.trip !== lastTrip && sim.trip !== 'manual') { lastTrip = sim.trip; syncPhysicsUI(); say(sim.trip === 'overpower' ? 'Protection trip at 130% power. The system dropped the rods on its own. Drums out that far outruns the feedback.' : 'High outlet temperature trip. The system dropped the rods on its own.', 10); }
  if (!sim.trip) lastTrip = null;
  if (statusLock <= 0 && sim.gens && sim.hallSupply() === 'Backup generators' && ph.status.dataset.k !== 'gens') { ph.status.dataset.k = 'gens'; say('Backup generators carry the data hall. The reactor idles at part power with heat going to the air.', 8); }
  if (sim.gen) ph.status.dataset.k = '';
  // readouts
  const P = sim.P, pct = Math.round(P * 100);
  ph.rP.textContent = `${pct}% · ${(P * P_THERMAL_MW).toFixed(1)} MWt${sim.scram ? ' · decay heat' : ''}`;
  ph.rE.textContent = `${(sim.elec * P_ELECTRIC_MW).toFixed(1)} MWe${sim.gen ? '' : ' · generator tripped'}`;
  ph.rT.textContent = `${Math.round(sim.T)} °C`;
  ph.rF.textContent = `${Math.round(sim.flow * 100)}% · ${sim.pumps ? 'pumped' : 'natural circulation'}`;
  ph.rR.textContent = `${sim.passiveMW().toFixed(1)} MWt to air`;
  ph.rD.textContent = sim.hallSupply();
  ph.rB.textContent = `${Math.round(sim.soc * 100)}%${!sim.gen && !sim.gens ? ' · discharging' : sim.gen && sim.soc < 0.999 ? ' · charging' : ''}`;
  ph.rG.textContent = sim.gens ? 'Running' : !sim.gen && sim.tTrip > 0 ? `Starting in ${Math.max(0, 10 - sim.tTrip).toFixed(0)} s` : 'Standby';
  // chart history at 4 Hz, 90 s
  hist.t += dt; if (hist.t >= 0.25) { hist.t = 0; hist.P.push(P); hist.T.push(sim.T); if (hist.P.length > 360) { hist.P.shift(); hist.T.shift(); } drawChart(); }
}
function drawChart() {
  const c = ph.chart, g = c.getContext('2d'), W2 = c.width, H2 = c.height; g.clearRect(0, 0, W2, H2);
  g.strokeStyle = 'rgba(255,252,244,0.14)'; g.lineWidth = 1; [0.25, 0.5, 0.75].forEach((f) => { g.beginPath(); g.moveTo(0, H2 * f); g.lineTo(W2, H2 * f); g.stroke(); });
  const n = hist.P.length; if (n < 2) return;
  const line = (arr, lo, hi, color) => { g.strokeStyle = color; g.lineWidth = 1.5; g.beginPath(); arr.forEach((v, i) => { const x = (i / 359) * W2, y = H2 - 4 - THREE.MathUtils.clamp((v - lo) / (hi - lo), 0, 1) * (H2 - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  line(hist.T, 380, 760, '#ffb347'); line(hist.P, 0, 1.4, '#fffcf4');
}
for (let i = 0; i < 360; i++) { hist.P.push(1); hist.T.push(550); }
syncPhysicsUI(); drawChart();

// Generator exhaust when the backup units run
// steam wisps: faint vapour off the roof coolers and the dry cooler fans, drifting downwind
const puffs = (() => {
  const em = [];
  for (let i = 0; i < 6; i++) { const x = 2 + i * 7.2; [-1.05, 1.05].forEach((dx) => em.push([x + dx, HH_W + 2.35, -55, () => 0.7])); }
  [15.2, 16.5, 17.8].forEach((x) => [-1.25, 1.25].forEach((z) => em.push([x, 3.8, z, () => 0.45 * Math.min(1, spin)])));
  const per = DETAIL === 2 ? 4 : 3, n = em.length * per, pos = new Float32Array(n * 3), asz = new Float32Array(n), aal = new Float32Array(n), st = [];
  for (let i = 0; i < n; i++) st.push({ life: -Math.random() * 3, max: 1, x: 0, y: -5, z: 0, j: Math.random() * 6.3 });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSize', new THREE.BufferAttribute(asz, 1)); g.setAttribute('aAlpha', new THREE.BufferAttribute(aal, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, uniforms: { uTex: { value: texSprite }, uScale: { value: 500 }, uColor: { value: new THREE.Color(0xc9d0d8) } },
    vertexShader: `attribute float aSize, aAlpha; uniform float uScale; varying float vA; void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(length(mv.xyz), 0.01); vA = aAlpha * (1.0 - smoothstep(60.0, 160.0, d)); gl_PointSize = min(aSize * uScale / d, 300.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform vec3 uColor; varying float vA; void main(){ float a = texture2D(uTex, gl_PointCoord).a * vA; if (a < 0.003) discard; gl_FragColor = vec4(uColor, a); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 3; scene.add(pts);
  return { pts, update(dt) {
    mat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * Math.tan(camera.fov * Math.PI / 360));
    const drift = (0.12 + weather.wind * 2.0) * dt, t = windUniforms.uTime.value;
    for (let i = 0; i < n; i++) { const p = st[i]; p.life -= dt;
      if (p.life <= 0) { const e = em[Math.floor(i / per)]; if (Math.random() > e[3]()) { p.life = 0.4; p.y = -5; aal[i] = 0; continue; } p.max = 2.2 + Math.random() * 1.6; p.life = p.max; p.x = e[0] + (Math.random() - 0.5) * 0.5; p.y = e[1]; p.z = e[2] + (Math.random() - 0.5) * 0.5; }
      const a = 1 - p.life / p.max; p.y += (1.1 - a * 0.5) * dt; p.x += drift + Math.sin(t * 0.9 + p.j) * 0.12 * dt; p.z += Math.cos(t * 0.7 + p.j) * 0.12 * dt;
      pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; asz[i] = 0.3 + a * 1.1; aal[i] = Math.sin(Math.PI * a) * 0.07 * (1 - 0.5 * weather.rain); }
    g.attributes.position.needsUpdate = g.attributes.aSize.needsUpdate = g.attributes.aAlpha.needsUpdate = true; } };
})();
const smoke = (() => {
  const n = 60, pos = new Float32Array(n * 3), st = [];
  for (let i = 0; i < n; i++) st.push({ x: 0, y: -1, z: 0, vx: 0, vy: 0, vz: 0, life: Math.random() * 3 });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: 0x8a8378, size: 0.9, map: texSprite, transparent: true, opacity: 0.35, depthWrite: false, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  const stacks = [[19.7, 6.1, -37.5], [29.7, 6.1, -37.5]];
  return { pts, update(dt, on) { pts.visible = on || st.some((p) => p.life > 0 && p.y > 0); for (let i = 0; i < n; i++) { const p = st[i]; p.life -= dt; if (p.life <= 0) { if (!on) { p.y = -1; continue; } const sk = stacks[i % 2]; p.x = sk[0] + (Math.random() - 0.5) * 0.3; p.y = sk[1]; p.z = sk[2] + (Math.random() - 0.5) * 0.3; p.vx = (Math.random() - 0.5) * 0.3 + 0.15 + weather.wind * 1.8; p.vy = 1.2 + Math.random() * 0.8; p.vz = (Math.random() - 0.5) * 0.3; p.life = 3 + Math.random() * 2; } p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vy *= 0.995; pos[i * 3] = p.x; pos[i * 3 + 1] = p.y; pos[i * 3 + 2] = p.z; } g.attributes.position.needsUpdate = true; } };
})();

// ------------------------------------------------------------------ weather: wind, rain, storm gloom, lightning
const weather = { preset: 'calm', wind: 0.25, windT: 0.25, rain: 0, rainT: 0, gloom: 0, gloomT: 0, flash: 0, nextFlash: 6, pulse: 0 };
const WEATHER = { calm: { wind: 0.25, rain: 0, gloom: 0 }, breezy: { wind: 0.75, rain: 0, gloom: 0.12 }, storm: { wind: 1.0, rain: 1, gloom: 1 } };
function setWeather(name) {
  const w = WEATHER[name]; if (!w) return; weather.preset = name; weather.windT = w.wind; weather.rainT = w.rain; weather.gloomT = w.gloom; weather.nextFlash = 2.5;
  document.querySelectorAll('#weatherMenu .mi').forEach((b) => b.classList.toggle('on', b.dataset.weather === name));
  saveSetting('weather', name); if (typeof analytics !== 'undefined') analytics.event('weather/' + name);
}
wetMats.forEach((m) => { m.userData.dry = { r: m.roughness, c: m.color.clone() }; });
const texRain = (() => { const c = document.createElement('canvas'); c.width = 8; c.height = 64; const g = c.getContext('2d'); const gr = g.createLinearGradient(0, 0, 0, 64); gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.9)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(3, 0, 2, 64); const t = new THREE.CanvasTexture(c); return t; })();
const rain = (() => {
  const n = DETAIL === 2 ? 2800 : 1200, pos = new Float32Array(n * 3), spd = new Float32Array(n);
  for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 56; pos[i * 3 + 1] = -6 + Math.random() * 30; pos[i * 3 + 2] = (Math.random() - 0.5) * 56; spd[i] = 11 + Math.random() * 5; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ map: texRain, size: 0.55, transparent: true, opacity: 0, depthWrite: false, color: 0xcfd8e6, sizeAttenuation: true });
  const pts = new THREE.Points(g, m); pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 3; scene.add(pts);
  return { pts, update(dt) { const r = weather.rain; pts.visible = r > 0.01; m.opacity = 0.5 * r; if (!pts.visible) return; pts.position.copy(camera.position); const drift = weather.wind * 4.5 * dt; for (let i = 0; i < n; i++) { let y = pos[i * 3 + 1] - spd[i] * dt, x = pos[i * 3] + drift; if (y < -8) { y += 30; } if (x > 28) x -= 56; pos[i * 3] = x; pos[i * 3 + 1] = y; } g.attributes.position.needsUpdate = true; } };
})();
const KEY_I = 3.4, ENV_I = 1.5, HEMI_I = 0.75, FILL_I = 0.9, FOG_D = 0.0032;
function updateWeather(dt) {
  const k = Math.min(1, dt * 0.45);
  weather.wind += (weather.windT - weather.wind) * k; weather.rain += (weather.rainT - weather.rain) * k; weather.gloom += (weather.gloomT - weather.gloom) * k;
  const g = weather.gloom;
  // lightning: a double pulse, then thunder a moment later
  if (g > 0.5) { weather.nextFlash -= dt; if (weather.nextFlash <= 0) { weather.flash = 1; weather.pulse = 0.12 + Math.random() * 0.1; weather.nextFlash = 3.5 + Math.random() * 9; audio.thunder((0.5 + Math.random() * 2.2) * 1000); } }
  if (weather.pulse > 0) { weather.pulse -= dt; if (weather.pulse <= 0) weather.flash = Math.max(weather.flash, 0.8); }
  weather.flash *= Math.exp(-dt * 10);
  skyMat.uniforms.gloom.value = g; skyMat.uniforms.flash.value = weather.flash;
  scene.environmentIntensity = ENV_I * (1 - 0.6 * g);
  if (csm) csm.lights.forEach((l) => (l.intensity = KEY_I * (1 - 0.72 * g))); else if (key) key.intensity = KEY_I * (1 - 0.72 * g);
  hemi.intensity = HEMI_I * (1 - 0.2 * g) + weather.flash * 6; fill.intensity = FILL_I * (1 - 0.4 * g) + weather.flash * 3;
  scene.fog.density = FOG_D + 0.0022 * g;
  clouds.forEach((c) => { c.material.opacity = 0.5 + 0.38 * g; c.material.color.lerpColors(c.userData.c0 || (c.userData.c0 = c.material.color.clone()), _storm, g); });
  windUniforms.uWind.value = weather.wind;
  wetMats.forEach((m) => { const d = m.userData.dry; if (!d) return; m.roughness = d.r * (1 - 0.6 * weather.rain); m.color.copy(d.c).multiplyScalar(1 - 0.3 * weather.rain); });
  rain.update(dt);
  audio.state.wind = weather.wind; audio.state.rain = weather.rain;
}
const _storm = new THREE.Color(0x2a2a32);
if (SETTINGS.weather && WEATHER[SETTINGS.weather]) { setWeather(SETTINGS.weather); weather.wind = weather.windT; weather.gloom = weather.gloomT; }
$('#weatherBtn').addEventListener('click', (ev) => { ev.stopPropagation(); const open = !$('#weatherMenu').classList.contains('hidden'); closeMenus(); if (!open) $('#weatherMenu').classList.remove('hidden'); });
document.querySelectorAll('#weatherMenu .mi').forEach((b) => b.addEventListener('click', () => { setWeather(b.dataset.weather); $('#weatherMenu').classList.add('hidden'); }));

// ------------------------------------------------------------------ sound
const audio = createAudio({ camera, scene });
const analytics = createAnalytics(window.MR_ANALYTICS || {});
analytics.pageview();
$('#soundBtn').addEventListener('click', async () => { const on = await audio.toggle(); $('#soundBtn').classList.toggle('on', on); saveSetting('sound', on); if (on) analytics.event('sound'); });
const HARD = [[-8, 14, -8, 8], [-5, 67, 13, 19], [-12, 54, -69, -33], [33, 47, 6.9, 12.5], [18, 30, 5, 11.5], [62.5, 66.5, 9.5, 13.5], [-16, -4, -29, -19], [50, 70, -68, -42], [58, 66, -45, 20], [79, 103, -22, 0], [110, 140, -34, -6], [78, 104, -60, -36], [103.5, 109.5, -62, 16], [44, 52, -58, -46]];
const INDOORS = [[-6.5, 12.5, -6, 6], [33, 47, 6.9, 12.3], [-4, 44, -66, -44], [18, 30, 5.1, 11.3], [62.9, 66.1, 9.9, 12.9], [111, 125, -30, -14], [82, 94, -55, -45], [44, 52, -58, -46]];
const inRect = (list, x, z) => list.some(([x0, x1, z0, z1]) => x > x0 && x < x1 && z > z0 && z < z1);
let indoorsF = 0, prevScram = false;

// ------------------------------------------------------------------ life: workers on routes, seated operators, birds, moths
const rigMats = () => ({ hivis: M.hivis(), denim: M.denim(), skin: M.skin(), shirt: M.shirt(), reflect: M.reflect(), boot: M.boot(), hat: M.ceramic(0xf2e9c8), lamp: new THREE.MeshBasicMaterial({ color: 0x555555 }) });
const npcs = [];
(function buildLife() {
  const mats = rigMats();
  const routes = [
    { path: [[3, 8.6], [3, 13.6], [20, 13.6], [36, 13.6], [36, 12.9]], speed: 1.25, wait: [2, 7] },
    { path: [[36, 13.8], [31, 13.8], [27.5, 12.6]], speed: 1.1, wait: [4, 10] },
    { path: [[34, -43.6], [34, -40.5], [46, -40.5], [50, -46.5]], speed: 1.2, wait: [3, 8] },
    { path: [[62.4, 13.2], [65.4, 14.3]], speed: 0.9, wait: [8, 18] },
    { path: [[-12, -22], [-12, -15], [-4, -12], [8, -8.2]], speed: 1.2, wait: [5, 12] },
    { path: [[110.6, -22.4], [107.5, -22.4], [107.5, -11], [103.6, -11]], speed: 1.2, wait: [4, 10] },
  ];
  routes.forEach((r, k) => { const rig = buildRig(mats, G); rig.root.visible = true; const p0 = r.path[0]; rig.root.position.set(p0[0], terrainY(p0[0], p0[1]), p0[1]); scene.add(rig.root); npcs.push({ rig, path: r.path, i: 1, dir: 1, speed: r.speed, waitR: r.wait, wait: k * 1.7, phase: Math.random() * 6 }); });
  // seated operators at the outer two console desks
  (interiors.seats || []).forEach((g) => { const r = buildRig({ ...mats, hat: new THREE.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.9 }), hivis: M.shirt() }, G, { hat: false }); r.root.visible = true; r.root.position.set(0, -0.3, 0.72); r.root.rotation.y = Math.PI; r.thighL.rotation.x = r.thighR.rotation.x = -Math.PI / 2 + 0.12; r.shinL.rotation.x = r.shinR.rotation.x = Math.PI / 2 - 0.2; r.armL.rotation.x = r.armR.rotation.x = -0.85; r.foreL.rotation.x = r.foreR.rotation.x = -0.75; r.head.rotation.x = 0.12; g.add(r.root); r.root.traverse((o) => { if (o.isMesh) o.userData.console = true; }); });
})();
// birds over the pond: two wings per bird, flapping about the body axis
const birds = (() => {
  const n = 18, mat = new THREE.MeshStandardMaterial({ color: 0x1a1816, roughness: 1, side: THREE.DoubleSide }); mat.userData.keepDouble = true;
  const wing = (sgn) => { const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0.1, sgn * 0.52, 0, -0.04, 0, 0, -0.2], 3)); g.computeVertexNormals(); return g; };
  const L = new THREE.InstancedMesh(wing(-1), mat, n), R = new THREE.InstancedMesh(wing(1), mat, n); L.frustumCulled = R.frustumCulled = false; scene.add(L); scene.add(R);
  const st = []; for (let i = 0; i < n; i++) st.push({ cx: POND.x + (Math.random() - 0.5) * 20, cz: POND.z + (Math.random() - 0.5) * 14, r: 9 + Math.random() * 16, h: 7 + Math.random() * 12, a: Math.random() * Math.PI * 2, w: (0.12 + Math.random() * 0.1) * (Math.random() < 0.5 ? 1 : -1), f: Math.random() * 6, fs: 6 + Math.random() * 3 });
  const p = new THREE.Vector3(), q = new THREE.Quaternion(), e = new THREE.Euler(), m = new THREE.Matrix4(), one = new THREE.Vector3(1, 1, 1);
  return { update(dt, t) { st.forEach((b, i) => { b.a += b.w * dt; const x = b.cx + Math.cos(b.a) * b.r, z = b.cz + Math.sin(b.a) * b.r, y = b.h + Math.sin(t * 0.5 + b.f) * 1.2; const heading = Math.atan2(-Math.sin(b.a) * b.w, Math.cos(b.a) * b.w); const flap = Math.sin(t * b.fs + b.f) * 0.7; p.set(x, y, z); e.set(0, heading, flap, 'YXZ'); q.setFromEuler(e); m.compose(p, q, one); L.setMatrixAt(i, m); e.set(0, heading, -flap, 'YXZ'); q.setFromEuler(e); m.compose(p, q, one); R.setMatrixAt(i, m); }); L.instanceMatrix.needsUpdate = R.instanceMatrix.needsUpdate = true; } };
})();
// moths around the nearest lamp heads
const moths = (() => {
  const lamps = [[8.9, 8.6, 20], [30.9, 8.6, 20], [38.9, 8.6, 20], [14.9, 8.6, 6], [-11.1, 8.6, -10], [0.9, 8.6, -40], [20.9, 8.6, -40], [52.9, 8.6, 20]], per = 16, n = lamps.length * per;
  const pos = new Float32Array(n * 3), st = []; for (let i = 0; i < n; i++) st.push({ r: 0.25 + Math.random() * 0.9, a: Math.random() * 6.3, w: (1.5 + Math.random() * 3) * (Math.random() < 0.5 ? 1 : -1), h: (Math.random() - 0.5) * 0.8, j: Math.random() * 9 });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: texSprite, size: 0.09, color: 0xffe3b0, transparent: true, opacity: 0.85, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })); pts.frustumCulled = false; scene.add(pts);
  return { update(dt, t) { for (let i = 0; i < n; i++) { const L = lamps[Math.floor(i / per)], s = st[i]; s.a += s.w * dt; const r = s.r * (0.7 + 0.3 * Math.sin(t * 2.1 + s.j)); pos[i * 3] = L[0] + Math.cos(s.a) * r; pos[i * 3 + 1] = L[1] + s.h + Math.sin(t * 3.3 + s.j) * 0.25; pos[i * 3 + 2] = L[2] + Math.sin(s.a) * r; } g.attributes.position.needsUpdate = true; } };
})();
function updateLife(dt, t) {
  npcs.forEach((n) => {
    if (n.wait > 0) { n.wait -= dt; poseRig(n.rig, n.phase, 0); return; }
    const tgt = n.path[n.i], dx = tgt[0] - n.rig.root.position.x, dz = tgt[1] - n.rig.root.position.z, dist = Math.hypot(dx, dz);
    if (walk.active) { // yield to the visitor: stop, look at them, step aside a little
      const px = walk.state.pos.x - n.rig.root.position.x, pz = walk.state.pos.z - n.rig.root.position.z, pd = Math.hypot(px, pz);
      if (pd < 1.5 && (px * dx + pz * dz) / (pd * dist + 1e-6) > 0.2) { n.wait = 0.6; n.sideT = 0.5; const sx = -dz / dist, sz = dx / dist, sgn = (px * sx + pz * sz) > 0 ? -1 : 1; n.rig.root.position.x += sx * sgn * 0.6 * dt; n.rig.root.position.z += sz * sgn * 0.6 * dt; const want = Math.atan2(px, pz); let d = want - n.rig.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); n.rig.root.rotation.y += d * Math.min(1, dt * 6); poseRig(n.rig, n.phase, 0); return; }
    }
    if (dist < 0.12) { if (n.i + n.dir < 0 || n.i + n.dir >= n.path.length) n.dir *= -1; n.i += n.dir; n.wait = n.waitR[0] + Math.random() * (n.waitR[1] - n.waitR[0]); return; }
    const step = Math.min(dist, n.speed * dt); n.rig.root.position.x += dx / dist * step; n.rig.root.position.z += dz / dist * step; n.rig.root.position.y = terrainY(n.rig.root.position.x, n.rig.root.position.z);
    const want = Math.atan2(dx, dz); let d = want - n.rig.root.rotation.y; d = Math.atan2(Math.sin(d), Math.cos(d)); n.rig.root.rotation.y += d * Math.min(1, dt * 8);
    n.phase += dt * 7; poseRig(n.rig, n.phase, 1);
  });
  birds.update(dt, t); moths.update(dt, t);
}

// ------------------------------------------------------------------ light: fixture cones, dust motes, heat haze, lightning
const coneUniforms = { uI: { value: 0 } };
const lightCones = (() => {
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, uniforms: { uI: coneUniforms.uI, uColor: { value: new THREE.Color(0xffe9c8) } },
    vertexShader: `varying vec2 vUv; varying vec3 vN, vV; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vD = length(mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uI; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN, vV; varying float vD; void main(){ float rim = pow(abs(dot(normalize(vN), normalize(vV))), 1.6); float a = pow(vUv.y, 2.2) * (0.15 + 0.85 * rim) * uI * smoothstep(0.8, 4.0, vD); gl_FragColor = vec4(uColor * a * 0.16, a * 0.12); }` });
  const geos = [];
  const cone = (x, y, z, r, h) => { const g = new THREE.ConeGeometry(r, h, 24, 1, true); g.translate(x, y - h / 2, z); geos.push(g); };
  [[-3.5, -3], [-3.5, 3], [3, -3], [3, 3], [9, -3], [9, 3]].forEach(([x, z]) => cone(x, BH - 1.1, z, 3.4, 8.2));
  [[36, 10.2], [40, 10.2], [44, 10.2]].forEach(([x, z]) => cone(x, 3.44, z, 1.6, 3.0));
  [[21, 8.2], [27, 8.2]].forEach(([x, z]) => cone(x, 5.0, z, 2.6, 4.8));
  [[6, -55], [20, -55], [34, -55]].forEach(([x, z]) => cone(x, 8.3, z, 4.0, 7.6));
  const mesh = new THREE.Mesh(BGU.mergeGeometries(geos, false), mat); mesh.renderOrder = 4; mesh.frustumCulled = false; mesh.visible = false; scene.add(mesh); return mesh;
})();
// lamp halos: one additive point sprite per registered fixture. They swell in humid storm air and fade when the camera is right under them.
const halos = (() => {
  const n = HALOS.length; if (!n) return null;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), siz = new Float32Array(n), c = new THREE.Color();
  HALOS.forEach(([x, y, z, r, hex], i) => { pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; c.setHex(hex); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; siz[i] = r; });
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('hcol', new THREE.BufferAttribute(col, 3)); g.setAttribute('hsize', new THREE.BufferAttribute(siz, 1));
  const mat = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, fog: false,
    uniforms: { uTex: { value: texGlow }, uI: { value: 1 }, uScale: { value: 500 }, uGloom: { value: 0 } },
    vertexShader: `attribute vec3 hcol; attribute float hsize; uniform float uScale, uGloom; varying vec3 vC; varying float vA;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); float d = max(length(mv.xyz), 0.01); vC = hcol;
        vA = smoothstep(1.2, 6.0, d) * (0.5 + 0.5 * uGloom) * (1.0 - smoothstep(90.0, 260.0, d));
        gl_PointSize = min(hsize * (1.0 + 0.7 * uGloom) * uScale / d, 480.0); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform sampler2D uTex; uniform float uI; varying vec3 vC; varying float vA;
      void main(){ float a = texture2D(uTex, gl_PointCoord).a; a = pow(a, 1.7) * vA * uI; if (a < 0.002) discard; gl_FragColor = vec4(vC * a * 0.6, a * 0.4); }` });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
  return { pts, mat, update() { mat.uniforms.uScale.value = (H * renderer.getPixelRatio()) / (2 * Math.tan(camera.fov * Math.PI / 360)); mat.uniforms.uGloom.value = weather.gloom; mat.uniforms.uI.value = 1 - 0.85 * weather.flash; } };
})();
const motes = (() => {
  const n = 420, pos = new Float32Array(n * 3), seed = [];
  for (let i = 0; i < n; i++) { pos[i * 3] = -6 + Math.random() * 18; pos[i * 3 + 1] = 0.4 + Math.random() * 9; pos[i * 3 + 2] = -5.5 + Math.random() * 11; seed.push(Math.random() * 10); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const pts = new THREE.Points(g, new THREE.PointsMaterial({ map: texSprite, size: 0.045, color: 0xffe9c8, transparent: true, opacity: 0.0, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true })); pts.frustumCulled = false; pts.visible = false; scene.add(pts);
  return { pts, update(dt, t, on) { pts.material.opacity += ((on ? 0.55 : 0) - pts.material.opacity) * Math.min(1, dt * 2); pts.visible = pts.material.opacity > 0.01; if (!pts.visible) return; for (let i = 0; i < n; i++) { pos[i * 3] += Math.sin(t * 0.3 + seed[i]) * 0.08 * dt + weather.wind * 0.02 * dt; pos[i * 3 + 1] += (Math.cos(t * 0.21 + seed[i] * 1.3) * 0.05 - 0.015) * dt; pos[i * 3 + 2] += Math.sin(t * 0.27 + seed[i] * 0.7) * 0.07 * dt; if (pos[i * 3 + 1] < 0.3) pos[i * 3 + 1] = 9.2; if (pos[i * 3] > 12) pos[i * 3] = -6; } g.attributes.position.needsUpdate = true; } };
})();
// heat haze: emitters render into a small mask; a post pass warps the image under the mask
const haze = (() => {
  const rt = new THREE.WebGLRenderTarget(256, 144, { depthBuffer: false });
  const texNoise = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const img = g.createImageData(128, 128); for (let i = 0; i < 128 * 128; i++) { img.data[i * 4] = Math.random() * 255; img.data[i * 4 + 1] = Math.random() * 255; img.data[i * 4 + 2] = 128; img.data[i * 4 + 3] = 255; } g.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.minFilter = t.magFilter = THREE.LinearFilter; t.generateMipmaps = false; return t; })();
  const emitters = [];
  const emit = (x, y, z, w, h, get) => { const mat = new THREE.MeshBasicMaterial({ map: texGlow, transparent: true, depthWrite: false, depthTest: false, color: 0xffffff, opacity: 0 }); const g = BGU.mergeGeometries([new THREE.PlaneGeometry(w, h), new THREE.PlaneGeometry(w, h).rotateY(Math.PI / 2)], false); const m = new THREE.Mesh(g, mat); m.position.set(x, y, z); m.layers.set(3); m.frustumCulled = false; scene.add(m); emitters.push({ m, get }); };
  emit(19.7, 9.0, -37.5, 3.2, 6.5, () => (sim.gens ? 1 : 0)); emit(29.7, 9.0, -37.5, 3.2, 6.5, () => (sim.gens ? 1 : 0));
  emit(STACK_X, MOD_Y + 12.6, 0, 2.6, 5.5, () => 0.35 + 0.65 * Math.min(1, sim.decay / 0.065));
  emit(16.5, 4.6, 0, 5.0, 3.2, () => 0.9 * Math.min(1, spin));
  const pass = new ShaderPass({ uniforms: { tDiffuse: { value: null }, tMask: { value: rt.texture }, tNoise: { value: texNoise }, uTime: { value: 0 }, uStrength: { value: 0.016 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `uniform sampler2D tDiffuse, tMask, tNoise; uniform float uTime, uStrength; varying vec2 vUv;
      void main(){ float m = texture2D(tMask, vUv).r; if (m < 0.004) { gl_FragColor = texture2D(tDiffuse, vUv); return; }
        vec2 n1 = texture2D(tNoise, vUv * vec2(6.0, 3.0) + vec2(0.0, uTime * 0.55)).rg, n2 = texture2D(tNoise, vUv * vec2(11.0, 5.0) + vec2(0.3, uTime * 0.9)).rg;
        vec2 d = ((n1 + n2) - 1.0) * uStrength * m; gl_FragColor = texture2D(tDiffuse, vUv + d); }` });
  pass.uniforms.tMask.value = rt.texture; // ShaderPass clones uniforms and drops render-target textures
  const _cc = new THREE.Color();
  return { rt, pass, emitters, render(t) {
    let any = false; emitters.forEach((e) => { const v = e.get(); e.m.material.opacity += (v - e.m.material.opacity) * 0.05; if (e.m.material.opacity > 0.02) any = true; });
    pass.enabled = any; if (!any) return;
    pass.uniforms.uTime.value = t;
    renderer.getClearColor(_cc); const ca = renderer.getClearAlpha();
    renderer.setRenderTarget(rt); renderer.setClearColor(0x000000, 1); renderer.clear(); camera.layers.set(3); renderer.render(scene, camera); camera.layers.set(0);
    renderer.setRenderTarget(null); renderer.setClearColor(_cc, ca);
  } };
})();
hazeRef = haze; if (composer) { const i = composer.passes.findIndex((p) => p instanceof OutputPass); composer.insertPass(haze.pass, i < 0 ? composer.passes.length : i); }
function updateLight(dt, t) {
  const inside = walk.active ? (indoorsF > 0.5 ? 1 : 0) : 0;
  coneUniforms.uI.value += ((walk.active ? 1 : 0) - coneUniforms.uI.value) * Math.min(1, dt * 2); lightCones.visible = coneUniforms.uI.value > 0.01;
  motes.update(dt, t, walk.active && inRect([[-6.5, 12.5, -6, 6]], walk.state.pos.x, walk.state.pos.z));
  if (halos) halos.update();
  if (interiors.scramBtn) interiors.scramBtn.material.emissiveIntensity = sim.scram ? 1.5 + Math.sin(t * 8) * 1.2 : 0.8;
}

// ------------------------------------------------------------------ walk mode: UI glue, control-room screen
const _hl = new THREE.Vector3(), _crPos = new THREE.Vector3(40, 2, 9.6); let crT = 0;
const hudEl = { root: $('#walkHud'), prompt: $('#wPrompt'), target: $('#wTarget'), reticle: $('#wReticle'), joy: $('#wJoy'), knob: $('#wKnob'), view: $('#wView') };
const hud = {
  joy: hudEl.joy, knob: hudEl.knob,
  setTarget(t) {
    if (!t) { hudEl.target.textContent = ''; hudEl.prompt.textContent = ''; hudEl.reticle.classList.remove('hot'); return; }
    hudEl.reticle.classList.add('hot');
    if (t.door) { hudEl.target.textContent = t.door.label; hudEl.prompt.textContent = (t.door.target > 0.5 ? 'Close' : 'Open') + (isTouch ? ' · tap' : ' · E'); }
    else if (t.ladder) { hudEl.target.textContent = t.ladder.label; hudEl.prompt.textContent = 'Climb' + (isTouch ? ' · tap' : ' · E'); }
    else if (t.scram) { hudEl.target.textContent = 'Emergency shutdown'; hudEl.prompt.textContent = (sim.scram ? 'Already tripped' : 'Press' + (isTouch ? ' · tap' : ' · E')); }
    else if (t.console) { hudEl.target.textContent = 'Operator console'; hudEl.prompt.textContent = walk.state.frozen ? 'Esc · leave console' : 'Operate' + (isTouch ? ' · tap' : ' · E'); }
    else if (t.part && R[t.part]) { hudEl.target.textContent = R[t.part].def.name; hudEl.prompt.textContent = 'Inspect' + (isTouch ? ' · tap' : ' · E'); }
  },
  setView(first) { hudEl.view.textContent = first ? 'First person' : 'Third person'; document.body.classList.toggle('firstPerson', first); },
  flash() {},
};
const isTouch = matchMedia('(pointer: coarse)').matches;
const walk = createWalk({ scene, camera, dom: canvas, terrainY, rig, pickables, occluders, isTouch, hud,
  onEnter() {
    walkSaved = { pos: camera.position.clone(), tgt: controls.target.clone(), cut: cutTarget, explode: explodeTarget, solid: $('#solidBuilding').checked, labels: labelsOn, roof: dcRoof[0]?.visible ?? true, fov: camera.fov };
    camTween = null; controls.enabled = false; controls.autoRotate = false; stopTour(); stopStartup(); clearTimeout(idleT); walk.state.camDist = portrait ? 4.6 : 3.4;
    setCut(0, false); setExplode(0, false); if (!walkSaved.solid) { $('#solidBuilding').checked = true; $('#solidBuilding').dispatchEvent(new Event('change')); }
    dcRoof.forEach((m) => (m.visible = true)); setGhostSolid(interiors.campusGhost, true);
    labelRenderer.domElement.style.display = 'none';
    walkLights.forEach((l) => (l.intensity = l.userData.on)); headlamp.intensity = 3;
    camera.fov = 68; camera.updateProjectionMatrix(); aoCam.fov = 68; aoCam.updateProjectionMatrix();
    document.body.classList.add('walking'); $('#btnWalk').classList.add('on'); hudEl.root.classList.remove('hidden'); hud.setView(false); hideHint();
    if (location.hash !== '#walk') history.replaceState(null, '', '#walk');
    analytics.event('walk');
  },
  onExit() {
    controls.enabled = true; walk.state.frozen = false;
    const sv = walkSaved; if (sv) { camera.position.copy(sv.pos); controls.target.copy(sv.tgt); setCut(sv.cut, false); setExplode(sv.explode, false); if (!sv.solid) { $('#solidBuilding').checked = false; $('#solidBuilding').dispatchEvent(new Event('change')); } dcRoof.forEach((m) => (m.visible = sv.roof)); setGhostSolid(interiors.campusGhost, false); camera.fov = sv.fov; camera.updateProjectionMatrix(); aoCam.fov = sv.fov; aoCam.updateProjectionMatrix(); }
    labelRenderer.domElement.style.display = labelsOn ? '' : 'none';
    walkLights.forEach((l) => (l.intensity = 0)); headlamp.intensity = 0;
    document.body.classList.remove('walking', 'firstPerson'); $('#btnWalk').classList.remove('on'); hudEl.root.classList.add('hidden');
    if (location.hash === '#walk') history.replaceState(null, '', location.pathname + location.search);
  },
  onInteract(t) {
    if (t.part) { if (selected === t.part) deselect(); else select(t.part, { fly: false }); return; }
    if (t.scram) { if (!sim.scram) { ph.scram.click(); audio.click(); } return; }
    if (t.console) { if (document.pointerLockElement === canvas) document.exitPointerLock(); if (ph.panel.classList.contains('hidden')) $('#btnPhysics').click(); walk.state.frozen = true; audio.click(); hudEl.prompt.textContent = 'Esc · leave console'; }
  },
  onStep(p, run) { audio.footstep(inRect(HARD, p.x, p.z)); },
  onDoor(d, opening) { audio.door(d.kind, d.center, opening); },
});
let walkSaved = null;
function setGhostSolid(mt, on) { if (!mt) return; const b = mt.userData.base; if (!b) return; if (on) { b.opacity = 1; b.transparent = false; b.depthWrite = true; mt.userData.pickThrough = false; } else { b.opacity = 0.1; b.transparent = true; b.depthWrite = false; mt.userData.pickThrough = true; } mt.opacity = b.opacity; mt.transparent = b.transparent; mt.depthWrite = b.depthWrite; mt.needsUpdate = true; }
const WALK_SPAWN = { x: 3.0, z: 12.5, yaw: 0, pitch: -0.05 };
function enterWalk(spawn) { deselect(); walk.enter(spawn || WALK_SPAWN); }
function exitWalk() { walk.exit(); }
$('#btnWalk').addEventListener('click', () => (walk.active ? exitWalk() : enterWalk()));
$('#wExit').addEventListener('click', exitWalk);
$('#wViewBtn').addEventListener('click', () => walk.toggleView());
$('#wUse').addEventListener('click', () => walk.interact());
$('#wJump').addEventListener('click', () => { if (walk.state.grounded) walk.state.jumpReq = true; });
/** Drop the walker on open ground near a part and face it. */
function walkToPart(e) {
  const c = new THREE.Vector3(); if (e.focus) c.copy(e.focus.center); else if (e.label) e.label.getWorldPosition(c); else new THREE.Box3().setFromObject(e.root).getCenter(c);
  const r0 = e.focus ? Math.max(2.5, e.focus.radius * 0.9) : 4;
  const from = new THREE.Vector3(walk.state.pos.x, 0, walk.state.pos.z);
  let best = null;
  for (let ring = 0; ring < 4 && !best; ring++) { const r = r0 + ring * 2;
    for (let k = 0; k < 16; k++) { const a = Math.atan2(from.z - c.z, from.x - c.x) + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 8); const x = c.x + Math.cos(a) * r, z = c.z + Math.sin(a) * r; if (Math.abs(terrainY(x, z)) > 0.6) continue; if (walk.clear(x, z)) { best = { x, z }; break; } } }
  if (!best) return;
  walk.teleport(best.x, best.z, Math.atan2(-(c.x - best.x), -(c.z - best.z)), -0.1);
}
function drawControlRoom() {
  const c = interiors.crCanvas, g = c.getContext('2d'), W2 = c.width, H2 = c.height;
  g.fillStyle = '#0d0a05'; g.fillRect(0, 0, W2, H2);
  g.strokeStyle = 'rgba(255,252,244,0.12)'; g.lineWidth = 1; for (let x = 0; x < W2; x += 64) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H2); g.stroke(); } for (let y = 0; y < H2; y += 64) { g.beginPath(); g.moveTo(0, y); g.lineTo(W2, y); g.stroke(); }
  g.fillStyle = '#78797f'; g.font = '500 22px Inter, Aspekta, system-ui, sans-serif'; g.fillText('UNIT 1  ·  PLANT OVERVIEW', 32, 44);
  const st = sim.scram ? (sim.trip ? 'TRIP · ' + sim.trip.toUpperCase() : 'SCRAM') : sim.P > 1.05 ? 'HIGH POWER' : 'NORMAL';
  g.fillStyle = sim.scram ? '#d86e4b' : sim.P > 1.05 ? '#e3b32a' : '#4fe0a8'; g.beginPath(); g.arc(W2 - 230, 36, 7, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#fffcf4'; g.textAlign = 'right'; g.fillText(st, W2 - 32, 44); g.textAlign = 'left';
  const tiles = [['THERMAL POWER', (sim.P * 30).toFixed(1), 'MWt'], ['NET ELECTRIC', (sim.elec * 10).toFixed(1), 'MWe'], ['CORE OUTLET', Math.round(sim.T) + '', '°C'], ['PRIMARY FLOW', Math.round(sim.flow * 100) + '', '%'], ['DRUM POSITION', Math.round(sim.drum * 100) + '', '%'], ['BATTERY SOC', Math.round(sim.soc * 100) + '', '%']];
  tiles.forEach(([lab, val, unit], i) => { const x = 32 + i * 160, y = 80; g.fillStyle = 'rgba(255,252,244,0.06)'; g.fillRect(x, y, 148, 110); g.fillStyle = '#78797f'; g.font = '500 15px Inter, system-ui, sans-serif'; g.fillText(lab, x + 12, y + 26); g.fillStyle = '#fffcf4'; g.font = '600 40px Inter, system-ui, sans-serif'; g.fillText(val, x + 12, y + 76); g.fillStyle = '#78797f'; g.font = '500 15px Inter, system-ui, sans-serif'; g.fillText(unit, x + 14 + g.measureText(val).width * 2.65, y + 76); });
  // trend
  const x0 = 32, y0 = 216, w = W2 - 64, h = H2 - 216 - 28;
  g.fillStyle = 'rgba(255,252,244,0.04)'; g.fillRect(x0, y0, w, h);
  g.strokeStyle = 'rgba(255,252,244,0.14)'; [0.25, 0.5, 0.75].forEach((f) => { g.beginPath(); g.moveTo(x0, y0 + h * f); g.lineTo(x0 + w, y0 + h * f); g.stroke(); });
  const line = (arr, lo, hi, color) => { g.strokeStyle = color; g.lineWidth = 2; g.beginPath(); arr.forEach((v, i) => { const x = x0 + (i / 359) * w, y = y0 + h - 4 - THREE.MathUtils.clamp((v - lo) / (hi - lo), 0, 1) * (h - 8); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke(); };
  line(hist.T, 380, 760, '#ffb347'); line(hist.P, 0, 1.4, '#fffcf4');
  g.fillStyle = '#78797f'; g.font = '500 14px Inter, system-ui, sans-serif'; g.fillText('POWER (white) · CORE OUTLET TEMPERATURE (amber) · LAST 90 s', x0 + 12, y0 + h - 10);
  interiors.crTex.needsUpdate = true;
}

// ------------------------------------------------------------------ guide drawer & deep links
const guide = $('#guide');
$('#btnGuide').addEventListener('click', () => { const open = guide.classList.contains('hidden'); guide.classList.toggle('hidden', !open); $('#btnGuide').classList.toggle('on', open); if (open) { ph.panel.classList.add('hidden'); $('#btnPhysics').classList.remove('on'); ui.card.classList.add('hidden'); } });
$('#guide .gClose').addEventListener('click', () => { guide.classList.add('hidden'); $('#btnGuide').classList.remove('on'); });
document.querySelectorAll('#guide .gShow').forEach((a) => a.addEventListener('click', (ev) => { ev.preventDefault(); select(a.dataset.part, { fly: true }); if (isMobile) { guide.classList.add('hidden'); $('#btnGuide').classList.remove('on'); } }));
function applyHash() {
  const h = decodeURIComponent(location.hash.replace('#', ''));
  if (!h) return false;
  if (h === 'walk') { if (!walk.active) enterWalk(); return true; }
  if (h.startsWith('view-') && VIEWS[h.slice(5)]) { goView(h.slice(5)); return true; }
  if (R[h]) { select(h, { fly: true }); return true; }
  return false;
}
addEventListener('hashchange', applyHash);

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

// ------------------------------------------------------------------ cascaded shadows: patch every lit material once the scene exists
if (csm) {
  const seen = new Set();
  scene.traverse((o) => { if (!o.material) return; [].concat(o.material).forEach((m) => { if ((m.isMeshStandardMaterial || m.isMeshPhysicalMaterial) && !seen.has(m)) { seen.add(m); csm.setupMaterial(m); } }); });
  caps.forEach((m) => { if (!seen.has(m.material)) { seen.add(m.material); csm.setupMaterial(m.material); } });
}
windMats.forEach(applyWind);
uvScaleMats.forEach(applyUvScale);
if (qLevel >= 2) detailMats.forEach(applyDetail);
postPatch.forEach((f) => f());

window.__MR_T.build = performance.now() - __t0;
loadText('Compiling shaders', 0.8); await tick();
try { camera.updateMatrixWorld(); if (csm) csm.update(); await Promise.race([renderer.compileAsync(scene, camera), new Promise((r) => setTimeout(r, 20000))]); } catch (e) { /* fall back to lazy compile */ }
// warm the post-processing passes while the title page still covers the canvas, so the first visible frame does not stall on shader links
loadText('Compiling shaders', 0.9); await tick();
try { if (composer) { aoCam.position.copy(camera.position); aoCam.quaternion.copy(camera.quaternion); aoCam.updateMatrixWorld(); composer.render(); } } catch (e) { /* first frame compiles instead */ }
window.__MR_T.compiled = performance.now() - __t0;
// ------------------------------------------------------------------ main loop
setCut(55); updateCut();
const SKIP_INTRO = TEST || qs.get('intro') === '0' || qs.get('ui') === 'min';
if (!location.hash) { camera.position.copy(VIEWS.site.pos); controls.target.copy(VIEWS.site.tgt); controls.update(); }
let entered = false;
function enterSite() {
  if (entered) return; entered = true;
  const intro = $('#intro'); if (intro) intro.classList.add('out'); document.body.classList.remove('intro-open');
  if (!location.hash) setTimeout(() => flyTo(HOME_POS, HOME_TGT, 4200), 150); else setTimeout(applyHash, 200);
  if (SETTINGS.sound) audio.toggle(true).then((on) => $('#soundBtn').classList.toggle('on', on));
  analytics.event('enter');
}
$('#enterBtn').addEventListener('click', () => { if (window.__MR_READY) enterSite(); else { $('#enterBtn .enterTxt').textContent = 'Loading'; $('#enterBtn').dataset.wanted = '1'; } });
if (SKIP_INTRO) { const intro = $('#intro'); if (intro) intro.remove(); document.body.classList.remove('intro-open'); if (!TEST) { entered = true; if (!location.hash) setTimeout(() => flyTo(HOME_POS, HOME_TGT, 4200), 400); else setTimeout(applyHash, 300); } }
const clock = new THREE.Clock();
let ledT = 0, rodDrop = 0, carT = 0;
const _rq = new THREE.Quaternion(), _rm = new THREE.Matrix4(), _rp = new THREE.Vector3(), _one = new THREE.Vector3(1, 1, 1), _rx = new THREE.Vector3(1, 0, 0), _up = new THREE.Vector3(0, 1, 0), _sunNdc = new THREE.Vector3();
function animate() {
  if (!TEST) requestAnimationFrame(animate);
  const dt = Math.min(0.05, clock.getDelta());
  const now = performance.now();
  const t = clock.elapsedTime;

  if (walk.active) {
    walk.update(dt);
    const ws = walk.state;
    if (walk.first) { headlamp.position.copy(camera.position); _hl.set(0, 0, -1).applyQuaternion(camera.quaternion); }
    else { headlamp.position.set(ws.pos.x, ws.pos.y + 1.7, ws.pos.z); _hl.set(-Math.sin(ws.yaw), Math.sin(ws.pitch) * 0.6, -Math.cos(ws.yaw)).normalize(); }
    headlamp.target.position.copy(headlamp.position).addScaledVector(_hl, 6); headlamp.intensity = 3 * (1 - 0.85 * indoorsF);
  } else {
    if (camTween) {
      const k = Math.min(1, (now - camTween.start) / camTween.dur), e = easeIO(k);
      camera.position.lerpVectors(camTween.p0, camTween.p1, e);
      controls.target.lerpVectors(camTween.t0, camTween.t1, e);
      if (k >= 1) camTween = null;
    }
    updateFly(dt);
    controls.update();
    if (camera.position.y < 0.25) camera.position.y = 0.25;
    camera.updateMatrixWorld();
  }
  if (interiors.crTex && now - crT > 500 && (walk.active || camera.position.distanceTo(_crPos) < 45)) { crT = now; drawControlRoom(); }
  if (csm) csm.update();

  if (Math.abs(cutVal - cutTarget) > 0.05) { cutVal += (cutTarget - cutVal) * Math.min(1, dt * 5); ui.cut.value = String(Math.round(cutVal)); } else cutVal = cutTarget;
  if (Math.abs(explodeVal - explodeTarget) > 0.05) { explodeVal += (explodeTarget - explodeVal) * Math.min(1, dt * 5); ui.explode.value = String(Math.round(explodeVal)); } else explodeVal = explodeTarget;
  updateCut(); updateExplode(); updateCaps();

  updateWeather(dt);
  updateStartup(dt);
  sim.step(dt * (startup ? 2 : 1));
  power = THREE.MathUtils.clamp(sim.P, 0, 1.3); spin = sim.elec;
  updatePhysicsUI(dt);
  const pk = 0.06 + 0.94 * power;
  drumGroups.forEach((g, i) => { g.rotation.y = Math.PI / 2 - g.userData.angle + (1 - sim.drum) * Math.PI + Math.sin(t * 0.25 + i * 0.7) * 0.08; });
  rodDrop += ((sim.scram ? 1 : 0) - rodDrop) * Math.min(1, dt * (sim.scram ? 4 : 1.2));
  rodMeshes.forEach((m) => { m.position.y = CORE_Y + 1.1 - rodDrop * 1.0; }); rodLines.forEach((m) => { m.position.y = CORE_Y + 2.625 - rodDrop * 1.0; });
  smoke.update(dt, sim.gens);
  const fuelPulse = (0.42 + Math.sin(t * 1.6) * 0.08) * pk;
  if (fuelMat && fuelMat.userData.base) { fuelMat.userData.base.ei = fuelPulse; fuelMat.emissiveIntensity = fuelPulse; }
  if (pelletMat && pelletMat.userData.base) { pelletMat.userData.base.ei = 1.2 * pk; pelletMat.emissiveIntensity = 1.2 * pk; }
  glow.intensity = (6.5 + Math.sin(t * 1.6) * 1.2) * pk;
  spinners.forEach((s) => (s.rotation.x += dt * 28 * spin));
  fans.forEach((f) => (f.rotation.y += dt * 7 * (0.1 + 0.9 * spin)));
  if (flowOn) { flowA.update(dt, 0.1 + 0.9 * sim.flow, THREE.MathUtils.clamp((sim.T - 400) / 150, 0, 1.2)); flowB.update(dt, 0.1 + 0.9 * sim.elec, THREE.MathUtils.clamp(power, 0, 1)); flowE.update(dt, Math.max(0.05, sim.elec), 1); flowE.pts.material.opacity = 0.9 * THREE.MathUtils.clamp(sim.elec * 1.5, 0, 1); }
  if (movers.car) { const u = (t * 0.045) % 1; const x = -4 + u * 70; movers.car.position.set(x, terrainY(x, 16.9) + 0.0, 16.9); movers.car.rotation.y = 0; movers.car.visible = u <= 0.985; movers.car.userData.wheels.forEach((w) => (w.rotation.z = -(x / 0.34))); }
  if (movers.beacon) movers.beacon.material.color.setHex(Math.floor(t * 1.2) % 2 ? 0xff2a2a : 0x3a0a0a);
  if (movers.sock) { const w = weather.wind; movers.sock.rotation.z = -(1 - w) * 1.25 + Math.sin(t * 5.3) * 0.06 * w; movers.sock.rotation.y = Math.sin(t * 1.7) * 0.12 * w; }
  if (movers.cctv) movers.cctv.rotation.y = 0.35 + 0.6 * Math.sin(t * 0.38);
  if (movers.radar) movers.radar.rotation.y += dt * 2.6;
  puffs.update(dt);
  if (outskirts.beacons) outskirts.beacons.material.color.setHex(Math.floor(t * 0.9) % 2 ? 0xff2a2a : 0x3a0a0a);
  if (outskirts.rotors) { const { im, states, yawQ } = outskirts.rotors; const wf = 0.25 + 1.3 * weather.wind; states.forEach((st, i) => { st.ang += dt * st.w * wf; _rq.setFromAxisAngle(_rx, st.ang).premultiply(yawQ); _rm.compose(st.hub, _rq, _one); im.setMatrixAt(i, _rm); }); im.instanceMatrix.needsUpdate = true; }
  if (outskirts.cars && (now - carT > 40)) { carT = now; const { im, heads, tails, states } = outskirts.cars; states.forEach((st, i) => { st.z += st.dir * st.v * dt * 1.0; if (st.z > 335) st.z = -335; if (st.z < -335) st.z = 335; _rq.setFromAxisAngle(_up, st.dir > 0 ? -Math.PI / 2 : Math.PI / 2); _rm.compose(_rp.set(st.lane, terrainY(st.lane, st.z) + 0.03, st.z), _rq, _one); im.setMatrixAt(i, _rm); heads.setMatrixAt(i, _rm); tails.setMatrixAt(i, _rm); }); im.instanceMatrix.needsUpdate = heads.instanceMatrix.needsUpdate = tails.instanceMatrix.needsUpdate = true; }
  clouds.forEach((c) => { c.position.x += c.userData.v * dt * (0.4 + 2.2 * weather.wind); if (c.position.x > 330) c.position.x = -330; });
  if (pondWater) { pondWater.wn.offset.set(t * 0.012, t * 0.007); }
  windUniforms.uTime.value = t;
  // server LEDs flicker
  if (now - ledT > 220) { ledT = now; ledStrips.forEach(({ im, palette }) => { for (let k = 0; k < 24; k++) { const i = Math.floor(Math.random() * im.count); im.setColorAt(i, palette[Math.floor(Math.random() * palette.length)]); } im.instanceColor.needsUpdate = true; }); }

  updateLife(dt, t); updateLight(dt, t);
  { const inside = walk.active && inRect(INDOORS, walk.state.pos.x, walk.state.pos.z); indoorsF += ((inside ? 1 : 0) - indoorsF) * Math.min(1, dt * 3); audio.state.indoors = indoorsF; }
  if (sim.scram && !prevScram) audio.scramAlarm(); prevScram = sim.scram;
  audio.update(dt, { elec: sim.elec, spin, gens: sim.gens });
  if (composer && haze) haze.render(t);
  if (grade) grade.uniforms.uTime.value = t;
  if (rays) { _sunNdc.copy(SUN_POS).multiplyScalar(330).project(camera); const on = _sunNdc.z < 1 && Math.abs(_sunNdc.x) < 1.6 && Math.abs(_sunNdc.y) < 1.6; const edge = on ? (1 - THREE.MathUtils.smoothstep(Math.max(Math.abs(_sunNdc.x), Math.abs(_sunNdc.y)), 1.0, 1.6)) : 0; rays.uniforms.uSun.value.set(_sunNdc.x * 0.5 + 0.5, _sunNdc.y * 0.5 + 0.5); rays.uniforms.uAspect.value = camera.aspect; rays.uniforms.uIntensity.value = 0.55 * edge * (1 - 0.9 * weather.gloom) * (walk.active && indoorsF > 0.5 ? 0.2 : 1); rays.enabled = rays.uniforms.uIntensity.value > 0.002; }
  watchFrame(dt, now);
  if (!walk.active) { updateHover(now); updateLabels(now); }

  if (composer) { aoCam.position.copy(camera.position); aoCam.quaternion.copy(camera.quaternion); aoCam.updateMatrixWorld(); composer.render(); } else renderer.render(scene, camera);
  labelRenderer.render(scene, camera);
  drawLeaders(t);
}
animate();
window.__MR_T.firstFrame = performance.now() - __t0;

requestAnimationFrame(() => requestAnimationFrame(() => { ui.loading.classList.add('out'); window.__MR_READY = true; loadText('Ready', 1); $('#introFail')?.classList.add('hidden'); const b = $('#enterBtn'); if (b) { b.style.display = ''; b.disabled = false; b.classList.add('ready'); $('#enterBtn .enterTxt').textContent = 'Enter'; if (b.dataset.wanted) enterSite(); } }));
if (texPending.length) setTimeout(() => { try { texPending.forEach(([key, set]) => TXG.writeTextureCache(texCache.db, key, TXG.serializeSet(set))); } catch (e) { /* ignore */ } }, 600);
window.MR = { sim, renderer, walk, enterWalk, exitWalk, WORLD, setWeather, weather, audio, haze, npcs, cones: coneUniforms, jump: () => { if (camTween) { camera.position.copy(camTween.p1); controls.target.copy(camTween.t1); camTween = null; } cutVal = cutTarget; explodeVal = explodeTarget; }, frame: () => animate(), select, deselect, resetView, setCut, setExplode, startTour, stopTour, runStartup, stopStartup, goView, parts: PARTS.map((p) => p.id), camera, controls, scene };
