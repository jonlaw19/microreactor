// Procedural PBR texture generation: albedo, roughness, and normal maps built from layered noise.
// Everything is generated in code so the site ships no image files.
import * as THREE from 'three';

let seed = 1337;
export const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };

// ---- value noise / fBm on a grid (fast enough for 512² at startup)
function makeNoise(size, octaves = 4, base = 8, gain = 0.5, lac = 2.0, s0 = 1) {
  const out = new Float32Array(size * size);
  let amp = 1, freq = base, norm = 0;
  for (let o = 0; o < octaves; o++) {
    const g = freq + 1, grid = new Float32Array(g * g);
    let sd = (s0 * 7919 + o * 104729) % 2147483647 || 1;
    for (let i = 0; i < g * g; i++) { sd = (sd * 16807) % 2147483647; grid[i] = (sd - 1) / 2147483646; }
    // make it tile: wrap edges
    for (let i = 0; i < g; i++) { grid[i * g + g - 1] = grid[i * g]; grid[(g - 1) * g + i] = grid[i]; }
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * freq, iy = Math.floor(fy), ty = fy - iy, sy = ty * ty * (3 - 2 * ty);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * freq, ix = Math.floor(fx), tx = fx - ix, sx = tx * tx * (3 - 2 * tx);
        const a = grid[iy * g + ix], b = grid[iy * g + ix + 1], c = grid[(iy + 1) * g + ix], d = grid[(iy + 1) * g + ix + 1];
        out[y * size + x] += amp * ((a * (1 - sx) + b * sx) * (1 - sy) + (c * (1 - sx) + d * sx) * sy);
      }
    }
    norm += amp; amp *= gain; freq = Math.round(freq * lac);
  }
  for (let i = 0; i < out.length; i++) out[i] /= norm;
  return out;
}
function heightToNormal(h, size, strength = 2) {
  const data = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const xl = h[y * size + ((x - 1 + size) % size)], xr = h[y * size + ((x + 1) % size)];
    const yu = h[((y - 1 + size) % size) * size + x], yd = h[((y + 1) % size) * size + x];
    let nx = (xl - xr) * strength, ny = (yu - yd) * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * size + x) * 4; data[i] = (nx * 0.5 + 0.5) * 255; data[i + 1] = (ny * 0.5 + 0.5) * 255; data[i + 2] = (nz * 0.5 + 0.5) * 255; data[i + 3] = 255;
  }
  return data;
}
function toTexture(data, size, { srgb = false, repeat = 1 } = {}) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const ctx = c.getContext('2d'); const img = ctx.createImageData(size, size); img.data.set(data); ctx.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat, repeat); t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
function fill(size, fn) { const d = new Uint8ClampedArray(size * size * 4); for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = (y * size + x) * 4; const [r, g, b, a = 255] = fn(x, y, y * size + x); d[i] = r; d[i + 1] = g; d[i + 2] = b; d[i + 3] = a; } return d; }

// ---- material sets: { map, normalMap, roughnessMap } ready for MeshStandard/Physical
export function concreteSet(size = 512) {
  const big = makeNoise(size, 3, 3, 0.55, 2.2, 11), fine = makeNoise(size, 4, 24, 0.5, 2.1, 12), pores = makeNoise(size, 2, 90, 0.5, 2, 13);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) { const pit = pores[i] > 0.66 ? (pores[i] - 0.66) * 3 : 0; h[i] = fine[i] * 0.5 + big[i] * 0.3 - pit * 0.9; }
  const map = fill(size, (x, y, i) => { const v = 0.55 + (big[i] - 0.5) * 0.22 + (fine[i] - 0.5) * 0.16 - (pores[i] > 0.66 ? 0.18 : 0); const g = clamp01(v) * 255; return [g * 1.0, g * 0.985, g * 0.95]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.82 + (fine[i] - 0.5) * 0.25 + (pores[i] > 0.66 ? 0.15 : 0)) * 255; return [g, g, g]; });
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 3.0), size), roughnessMap: toTexture(rough, size) };
}
export function paintedMetalSet(size = 512, seams = 0) {
  const peel = makeNoise(size, 3, 48, 0.5, 2, 21), dirt = makeNoise(size, 3, 5, 0.6, 2, 22), scuff = makeNoise(size, 2, 70, 0.5, 2, 23);
  const h = new Float32Array(size * size);
  for (let i = 0; i < h.length; i++) h[i] = peel[i] * 0.25;
  if (seams) for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const sx = (x % Math.round(size / seams)); if (sx < 3) h[y * size + x] -= 0.9; }
  const map = fill(size, (x, y, i) => { const v = clamp01(0.92 - (dirt[i] - 0.5) * 0.22 - (scuff[i] > 0.7 ? 0.08 : 0)); const g = v * 255; return [g, g, g]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.5 + (dirt[i] - 0.5) * 0.35 + (scuff[i] > 0.7 ? 0.3 : 0)) * 255; return [g, g, g]; });
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 1.4), size), roughnessMap: toTexture(rough, size) };
}
export function galvanizedSet(size = 512) {
  // spangle: cellular pattern from jittered points
  const pts = []; for (let i = 0; i < 48; i++) pts.push([rnd() * size, rnd() * size, rnd()]);
  const cell = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { let best = 1e9, v = 0; for (const [px, py, pv] of pts) { let dx = Math.abs(x - px), dy = Math.abs(y - py); dx = Math.min(dx, size - dx); dy = Math.min(dy, size - dy); const d = dx * dx + dy * dy; if (d < best) { best = d; v = pv; } } cell[y * size + x] = v; }
  const fine = makeNoise(size, 3, 40, 0.5, 2, 31);
  const map = fill(size, (x, y, i) => { const g = clamp01(0.68 + (cell[i] - 0.5) * 0.18 + (fine[i] - 0.5) * 0.06) * 255; return [g, g, g * 1.02]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.42 + (cell[i] - 0.5) * 0.3) * 255; return [g, g, g]; });
  const h = new Float32Array(size * size); for (let i = 0; i < h.length; i++) h[i] = cell[i] * 0.15 + fine[i] * 0.1;
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 0.8), size), roughnessMap: toTexture(rough, size) };
}
export function brushedSet(size = 512) {
  const h = new Float32Array(size * size);
  const rows = makeNoise(size, 1, 420, 0.5, 2, 41), rows2 = makeNoise(size, 1, 90, 0.5, 2, 42);
  for (let y = 0; y < size; y++) { const v = rows[y * size] * 0.7 + rows2[y * size] * 0.3; for (let x = 0; x < size; x++) h[y * size + x] = clamp01(0.5 + (v - 0.5) * 0.6 + (rnd() - 0.5) * 0.015); }
  const map = fill(size, (x, y, i) => { const g = clamp01(0.92 + (h[i] - 0.5) * 0.03) * 255; return [g, g, g]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.34 + (h[i] - 0.5) * 0.07) * 255; return [g, g, g]; });
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 0.25), size), roughnessMap: toTexture(rough, size) };
}
export function asphaltSet(size = 512) {
  const grain = makeNoise(size, 4, 60, 0.55, 2, 51), patch = makeNoise(size, 3, 4, 0.5, 2, 52);
  const h = new Float32Array(size * size); for (let i = 0; i < h.length; i++) h[i] = grain[i] * 0.6;
  const map = fill(size, (x, y, i) => { const g = clamp01(0.2 + (grain[i] - 0.5) * 0.22 + (patch[i] - 0.5) * 0.1) * 255; return [g, g, g * 1.04]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.9 + (grain[i] - 0.5) * 0.15) * 255; return [g, g, g]; });
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 3.5), size), roughnessMap: toTexture(rough, size) };
}
export function grassSet(size = 512) {
  const big = makeNoise(size, 3, 3, 0.55, 2.2, 61), fine = makeNoise(size, 4, 40, 0.5, 2, 62);
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  const img = g.createImageData(size, size);
  for (let i = 0; i < size * size; i++) { const v = 0.3 + (big[i] - 0.5) * 0.3 + (fine[i] - 0.5) * 0.35; const dry = big[i] > 0.6 ? (big[i] - 0.6) * 1.5 : 0; img.data[i * 4] = clamp01(v * 0.55 + dry * 0.4) * 255; img.data[i * 4 + 1] = clamp01(v * 0.75 + dry * 0.25) * 255; img.data[i * 4 + 2] = clamp01(v * 0.32) * 255; img.data[i * 4 + 3] = 255; }
  g.putImageData(img, 0, 0);
  // blade strokes
  for (let i = 0; i < 14000; i++) { const x = rnd() * size, y = rnd() * size, l = 3 + rnd() * 7; const t = 70 + rnd() * 90; g.strokeStyle = `rgba(${t * 0.6},${t},${t * 0.35},${0.35 + rnd() * 0.4})`; g.lineWidth = 1; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 3, y - l); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  const h = new Float32Array(size * size); for (let i = 0; i < h.length; i++) h[i] = fine[i] * 0.7 + big[i] * 0.3;
  return { map: t, normalMap: toTexture(heightToNormal(h, size, 2.2), size) };
}
export function rubberSet(size = 256) {
  const fine = makeNoise(size, 3, 40, 0.5, 2, 71);
  const h = new Float32Array(size * size); for (let i = 0; i < h.length; i++) h[i] = fine[i] * 0.3;
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.85 + (fine[i] - 0.5) * 0.2) * 255; return [g, g, g]; });
  return { normalMap: toTexture(heightToNormal(h, size, 1.2), size), roughnessMap: toTexture(rough, size) };
}
// water normal (two octaves of ripples; the app scrolls the offset)
export function waterNormal(size = 256) {
  const a = makeNoise(size, 3, 6, 0.5, 2.1, 81);
  return toTexture(heightToNormal(a, size, 1.6), size);
}
// Aalo-style section hatching for cut caps: 45° lines on concrete grey
export function hatchTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  g.fillStyle = '#8e887d'; g.fillRect(0, 0, size, size);
  g.strokeStyle = 'rgba(20,16,10,0.55)'; g.lineWidth = 2.2;
  for (let d = -size; d < size * 2; d += 14) { g.beginPath(); g.moveTo(d, 0); g.lineTo(d + size, size); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
}
// grime gradient for wall bases (alpha falls off upward)
export function grimeTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
  const grd = g.createLinearGradient(0, size, 0, 0); grd.addColorStop(0, 'rgba(18,14,10,0.75)'); grd.addColorStop(0.55, 'rgba(18,14,10,0.25)'); grd.addColorStop(1, 'rgba(18,14,10,0)');
  g.fillStyle = grd; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(10,8,6,${rnd() * 0.25})`; g.fillRect(rnd() * size, size * 0.4 + rnd() * size * 0.6, 1 + rnd() * 3, 1 + rnd() * 8); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// oil stain decal
export function stainTexture(size = 256) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  for (let i = 0; i < 6; i++) { const x = size / 2 + (rnd() - 0.5) * 80, y = size / 2 + (rnd() - 0.5) * 80, r = 40 + rnd() * 70; const grd = g.createRadialGradient(x, y, 0, x, y, r); grd.addColorStop(0, 'rgba(12,10,8,0.7)'); grd.addColorStop(0.6, 'rgba(12,10,8,0.3)'); grd.addColorStop(1, 'rgba(12,10,8,0)'); g.fillStyle = grd; g.fillRect(0, 0, size, size); }
  return new THREE.CanvasTexture(c);
}
// rust streak decal (vertical streaks, transparent background)
export function rustTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = size; c.height = size; const g = c.getContext('2d');
  for (let i = 0; i < 9; i++) { const x = 10 + rnd() * (size - 20), w = 2 + rnd() * 5, h = size * (0.3 + rnd() * 0.7); const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, 'rgba(120,58,28,0.85)'); grd.addColorStop(1, 'rgba(120,58,28,0)'); g.fillStyle = grd; g.fillRect(x, 0, w, h); }
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.RepeatWrapping; t.wrapT = THREE.ClampToEdgeWrapping; return t;
}
// grass clump card (alpha)
export function grassCardTexture(size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d');
  for (let i = 0; i < 60; i++) { const x = size * 0.2 + rnd() * size * 0.6, h = size * (0.45 + rnd() * 0.5), lean = (rnd() - 0.5) * 30; const t = 60 + rnd() * 70; g.strokeStyle = `rgba(${t * 0.55},${t},${t * 0.3},0.95)`; g.lineWidth = 2 + rnd() * 2; g.beginPath(); g.moveTo(x, size); g.quadraticCurveTo(x + lean * 0.3, size - h * 0.6, x + lean, size - h); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// ---- trees
/** Bark: vertical ridges and plates with a strong normal map. */
export function barkSet(size = 256) {
  const ridges = makeNoise(size, 1, 48, 0.5, 2, 81), plates = makeNoise(size, 3, 6, 0.5, 2.1, 82), fine = makeNoise(size, 2, 60, 0.5, 2, 83);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) { const i = y * size + x; const r = ridges[y * size + ((x + Math.floor((plates[i] - 0.5) * 18) + size) % size)]; h[i] = clamp01(r * 0.6 + plates[i] * 0.3 + fine[i] * 0.1); }
  const map = fill(size, (x, y, i) => { const v = 0.22 + (h[i] - 0.5) * 0.5 + (plates[i] - 0.5) * 0.15; return [clamp01(v * 1.1) * 255, clamp01(v * 0.92) * 255, clamp01(v * 0.74) * 255]; });
  const rough = fill(size, (x, y, i) => { const g = clamp01(0.92 - (h[i] - 0.5) * 0.2) * 255; return [g, g, g]; });
  return { map: toTexture(map, size, { srgb: true }), normalMap: toTexture(heightToNormal(h, size, 6), size), roughnessMap: toTexture(rough, size) };
}
/**
 * Leaf cluster card with alpha. kind: 'broad' (oak), 'needle' (juniper sprays), 'fine' (mesquite).
 * Colours stay near neutral grey-green so the material colour sets the species tint.
 */
export function leafClusterTexture(size = 256, kind = 'broad') {
  const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); g.clearRect(0, 0, size, size);
  const cx = size / 2, cy = size / 2, R = size * 0.46;
  const tone = (k) => { const v = 118 + k * 72; return `rgb(${Math.round(v * 0.74)},${Math.round(v)},${Math.round(v * 0.52)})`; };
  if (kind === 'broad') {
    for (let i = 0; i < 110; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R * 0.9, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r;
      const len = size * (0.07 + rnd() * 0.05), wid = len * (0.45 + rnd() * 0.2), rot = rnd() * Math.PI;
      g.save(); g.translate(x, y); g.rotate(rot); g.fillStyle = tone(rnd() * (1 - r / R) + 0.1); g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(70,90,50,0.55)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-len, 0); g.lineTo(len, 0); g.stroke(); g.restore();
    }
  } else if (kind === 'needle') {
    for (let i = 0; i < 70; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R * 0.85, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, dir = rnd() * Math.PI * 2, len = size * (0.09 + rnd() * 0.07);
      g.save(); g.translate(x, y); g.rotate(dir); g.strokeStyle = tone(rnd() * 0.7); g.lineWidth = 2.2; g.beginPath(); g.moveTo(-len * 0.3, 0); g.lineTo(len, 0); g.stroke();
      for (let k = 0; k < 9; k++) { const t = -len * 0.2 + (len * 1.1 * k) / 9, s = size * (0.012 + rnd() * 0.014); g.lineWidth = 1.6; g.strokeStyle = tone(rnd() * 0.9); g.beginPath(); g.moveTo(t, 0); g.lineTo(t + s * 0.6, -s); g.moveTo(t, 0); g.lineTo(t + s * 0.6, s); g.stroke(); }
      g.restore();
    }
  } else {
    for (let i = 0; i < 60; i++) {
      const a = rnd() * Math.PI * 2, r = Math.sqrt(rnd()) * R * 0.9, x = cx + Math.cos(a) * r, y = cy + Math.sin(a) * r, dir = rnd() * Math.PI * 2, len = size * (0.1 + rnd() * 0.06);
      g.save(); g.translate(x, y); g.rotate(dir); g.strokeStyle = 'rgba(120,110,80,0.8)'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(0, 0); g.lineTo(len, 0); g.stroke();
      for (let k = 0; k < 10; k++) { const t = (len * k) / 10, s = size * 0.014; g.fillStyle = tone(0.3 + rnd() * 0.7); [-1, 1].forEach((sg) => { g.beginPath(); g.ellipse(t, sg * s * 0.9, s * 1.3, s * 0.5, 0, 0, Math.PI * 2); g.fill(); }); }
      g.restore();
    }
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; return t;
}
