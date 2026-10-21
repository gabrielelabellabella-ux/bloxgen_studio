// Texture procedurali disegnate su canvas: niente file esterni, tutto generato all'avvio.
import * as THREE from 'three';

function noiseCanvas(size, fn) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const d = img.data;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = fn(x, y);
      const k = (y * size + x) * 4;
      d[k] = r;
      d[k + 1] = g;
      d[k + 2] = b;
      d[k + 3] = a === undefined ? 255 : a;
    }
  }
  ctx.putImageData(img, 0, 0);
  return { c, ctx };
}

// rumore di valore periodico (tileable) a più ottave
function makeNoise(size, seed) {
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const layers = [];
  for (const cell of [4, 8, 16, 32, 64]) {
    if (cell > size) continue;
    const n = cell;
    const grid = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) grid[i] = rnd();
    layers.push({ n, grid });
  }
  return (x, y) => {
    let v = 0, amp = 1, tot = 0;
    for (let l = 0; l < layers.length; l++) {
      const { n, grid } = layers[l];
      const fx = (x / size) * n, fy = (y / size) * n;
      const x0 = Math.floor(fx), y0 = Math.floor(fy);
      const tx = fx - x0, ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      const g = (i, j) => grid[((j % n + n) % n) * n + ((i % n + n) % n)];
      const a = g(x0, y0) + (g(x0 + 1, y0) - g(x0, y0)) * sx;
      const b = g(x0, y0 + 1) + (g(x0 + 1, y0 + 1) - g(x0, y0 + 1)) * sx;
      v += (a + (b - a) * sy) * amp;
      tot += amp;
      amp *= 0.55;
    }
    return v / tot;
  };
}

const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

function tint(base, n, amt) {
  return [clamp255(base[0] * (1 - amt + n * amt * 2)), clamp255(base[1] * (1 - amt + n * amt * 2)), clamp255(base[2] * (1 - amt + n * amt * 2))];
}

function toTex(c, aniso, opts = {}) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = opts.linear ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  if (opts.nearest) {
    t.magFilter = THREE.NearestFilter;
  }
  t.needsUpdate = true;
  return t;
}

export function buildTextures(aniso = 2) {
  const T = {};
  const S = 128;
  let seed = 7;
  const N = () => makeNoise(S, seed++ * 7919);

  {
    const n = N(), m = N();
    T.grass = noiseCanvas(S, (x, y) => {
      const v = n(x, y), w = m(x * 3 % S, y * 3 % S);
      const base = [78, 96, 52];
      const c = tint(base, v * 0.7 + w * 0.3, 0.35);
      return [c[0] + (w > 0.7 ? 12 : 0), c[1] + (w > 0.7 ? 10 : 0), c[2]];
    }).c;
  }
  {
    const n = N();
    T.dirt = noiseCanvas(S, (x, y) => tint([104, 84, 60], n(x, y), 0.3)).c;
  }
  {
    const n = N(), m = N();
    T.forest = noiseCanvas(S, (x, y) => {
      const v = n(x, y);
      return tint(m(x, y) > 0.55 ? [74, 58, 38] : [46, 58, 34], v, 0.35);
    }).c;
  }
  {
    const n = N(), m = N();
    T.asphalt = noiseCanvas(S, (x, y) => {
      const v = n(x, y) * 0.6 + m((x * 5) % S, (y * 5) % S) * 0.4;
      const speck = ((x * 73856093) ^ (y * 19349663)) % 97 === 0 ? 30 : 0;
      const c = tint([62, 63, 64], v, 0.25);
      return [c[0] + speck, c[1] + speck, c[2] + speck];
    });
    // crepe
    const ctx = T.asphalt.ctx;
    ctx.strokeStyle = 'rgba(25,25,25,0.55)';
    ctx.lineWidth = 1;
    for (let k = 0; k < 5; k++) {
      ctx.beginPath();
      let x = (k * 37) % S, y = (k * 59) % S;
      ctx.moveTo(x, y);
      for (let s = 0; s < 8; s++) {
        x += (Math.sin(k * 3 + s) * 9) | 0;
        y += (Math.cos(k * 5 + s * 2) * 9) | 0;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    T.asphalt = T.asphalt.c;
  }
  {
    const n = N();
    T.sidewalk = noiseCanvas(S, (x, y) => {
      const line = x % 64 < 2 || y % 64 < 2;
      const c = tint([150, 146, 138], n(x, y), 0.18);
      return line ? [c[0] * 0.7, c[1] * 0.7, c[2] * 0.7] : c;
    }).c;
  }
  {
    const n = N(), m = N();
    T.gravel = noiseCanvas(S, (x, y) => {
      const v = m((x * 7) % S, (y * 7) % S);
      return tint([122, 112, 98], v * 0.8 + n(x, y) * 0.2, 0.45);
    }).c;
  }
  {
    const n = N();
    T.field = noiseCanvas(S, (x, y) => {
      const row = Math.sin((x / S) * Math.PI * 8) * 0.5 + 0.5;
      return tint([96, 74, 50], n(x, y) * 0.5 + row * 0.5, 0.35);
    }).c;
  }
  {
    const n = N(), m = N();
    T.concrete = noiseCanvas(S, (x, y) => {
      const stain = m(x, y) > 0.68 ? -14 : 0;
      const c = tint([138, 136, 130], n(x, y), 0.16);
      return [c[0] + stain, c[1] + stain, c[2] + stain];
    }).c;
  }
  {
    const n = N();
    T.court = noiseCanvas(S, (x, y) => tint([150, 88, 64], n(x, y), 0.15)).c;
  }
  {
    const n = N();
    T.wood = noiseCanvas(S, (x, y) => {
      const plank = Math.floor(y / 16);
      const seam = y % 16 < 1 || ((x + plank * 37) % 96) < 1;
      const grain = Math.sin((x / S) * Math.PI * 2 * 6 + n(x, y) * 6 + plank) * 0.5 + 0.5;
      const c = tint([150, 108, 70], grain * 0.5 + n(x, y) * 0.5 + (plank % 3) * 0.06, 0.25);
      return seam ? [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55] : c;
    }).c;
  }
  {
    const n = N();
    T.planks = noiseCanvas(S, (x, y) => {
      const grain = Math.sin((y / S) * Math.PI * 2 * 3 + n(x, y) * 5) * 0.5 + 0.5;
      const c = tint([168, 132, 92], grain * 0.6 + n(x, y) * 0.4, 0.22);
      const edge = x % 32 < 1;
      return edge ? [c[0] * 0.6, c[1] * 0.6, c[2] * 0.6] : c;
    }).c;
  }
  {
    const n = N();
    T.tile = noiseCanvas(S, (x, y) => {
      const g = x % 32 < 2 || y % 32 < 2;
      const c = tint([220, 218, 210], n(x, y), 0.06);
      return g ? [150, 150, 146] : c;
    }).c;
  }
  {
    const n = N(), m = N();
    T.carpet = noiseCanvas(S, (x, y) => tint([200, 190, 176], n(x, y) * 0.5 + m((x * 9) % S, (y * 9) % S) * 0.5, 0.2)).c;
  }
  {
    const n = N();
    T.lino = noiseCanvas(S, (x, y) => {
      const g = x % 64 < 1 || y % 64 < 1;
      const c = tint([196, 198, 188], n(x, y), 0.08);
      return g ? [c[0] * 0.85, c[1] * 0.85, c[2] * 0.85] : c;
    }).c;
  }
  {
    const n = N();
    T.shop = noiseCanvas(S, (x, y) => {
      const chk = (Math.floor(x / 32) + Math.floor(y / 32)) % 2;
      const c = tint(chk ? [196, 194, 188] : [170, 168, 160], n(x, y), 0.06);
      return c;
    }).c;
  }
  {
    const n = N(), m = N();
    T.plaster = noiseCanvas(S, (x, y) => {
      const v = n(x, y) * 0.7 + m((x * 4) % S, (y * 4) % S) * 0.3;
      const g = 210 + (v - 0.5) * 30;
      return [g, g, g];
    }).c;
  }
  {
    const n = N();
    T.brick = noiseCanvas(S, (x, y) => {
      const row = Math.floor(y / 10);
      const off = (row % 2) * 12;
      const mortar = y % 10 < 2 || (x + off) % 24 < 2;
      const bv = n(x, y) * 0.6 + (((Math.floor((x + off) / 24) * 13 + row * 7) % 5) / 5) * 0.4;
      if (mortar) return [196, 190, 180];
      const g = 170 + (bv - 0.5) * 70;
      return [g, g * 0.92, g * 0.86];
    }).c;
  }
  {
    const n = N();
    T.stone = noiseCanvas(S, (x, y) => {
      const v = n(x, y);
      const g = 180 + (v - 0.5) * 80;
      const cell = ((Math.floor(x / 21) * 7 + Math.floor((y + (Math.floor(x / 21) % 2) * 9) / 18) * 3) % 4) * 10;
      const edge = (x % 21 < 2) || ((y + (Math.floor(x / 21) % 2) * 9) % 18 < 2);
      return edge ? [110, 108, 104] : [g + cell, g + cell, g + cell - 4];
    }).c;
  }
  {
    const n = N();
    T.panel = noiseCanvas(S, (x, y) => {
      const rib = x % 16 < 3 ? 0.82 : 1;
      const g = (200 + (n(x, y) - 0.5) * 30) * rib;
      return [g, g, g];
    }).c;
  }
  {
    const n = N();
    T.roof = noiseCanvas(S, (x, y) => {
      const row = Math.floor(y / 16);
      const off = (row % 2) * 8;
      const edge = y % 16 > 13 || (x + off) % 16 < 1;
      const g = 190 + (n(x, y) - 0.5) * 60;
      return edge ? [g * 0.55, g * 0.55, g * 0.55] : [g, g, g];
    }).c;
  }
  {
    const n = N(), m = N();
    T.roof_flat = noiseCanvas(S, (x, y) => tint([92, 92, 90], n(x, y) * 0.5 + m((x * 6) % S, (y * 6) % S) * 0.5, 0.3)).c;
  }
  {
    const n = N();
    T.metal = noiseCanvas(S, (x, y) => {
      const g = 170 + (n(x, (y * 8) % S) - 0.5) * 40;
      return [g, g + 4, g + 8];
    }).c;
  }
  {
    const n = N();
    T.hedge = noiseCanvas(S, (x, y) => {
      const v = n(x, y), w = n((x * 5) % S, (y * 5) % S);
      return tint([52, 82, 40], v * 0.4 + w * 0.6, 0.5);
    }).c;
  }
  {
    // rete metallica con trasparenza
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.clearRect(0, 0, 64, 64);
    ctx.strokeStyle = 'rgba(160,166,170,0.95)';
    ctx.lineWidth = 2;
    for (let k = -64; k < 128; k += 16) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + 64, 64);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(k + 64, 0);
      ctx.lineTo(k, 64);
      ctx.stroke();
    }
    T.chain = c;
  }
  {
    // ciuffi d'erba (alpha)
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    for (let k = 0; k < 26; k++) {
      const x = 4 + Math.random() * 56;
      const h = 22 + Math.random() * 40;
      ctx.strokeStyle = `rgba(${70 + Math.random() * 40},${90 + Math.random() * 50},${40 + Math.random() * 20},1)`;
      ctx.lineWidth = 1.5 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, 64);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 12, 64 - h * 0.6, x + (Math.random() - 0.5) * 18, 64 - h);
      ctx.stroke();
    }
    T.tuft = c;
  }
  {
    // macchie generiche per mobili e zombie
    const n = N();
    T.grime = noiseCanvas(S, (x, y) => {
      const v = n(x, y);
      const g = 205 + (v - 0.5) * 70;
      return [g, g, g];
    }).c;
  }
  {
    // sangue / sporco per gli zombie
    const n = N(), m = N();
    T.zombie = noiseCanvas(S, (x, y) => {
      const v = n(x, y), b = m(x, y);
      if (b > 0.66) return [120, 40, 36];
      const g = 200 + (v - 0.5) * 80;
      return [g, g * 0.97, g * 0.92];
    }).c;
  }

  const out = {};
  for (const k in T) {
    out[k] = toTex(T[k], aniso, { linear: k === 'chain' || k === 'tuft' ? false : false });
  }
  return out;
}

// texture con testo per insegne e cartelli
export function textTexture(text, opts = {}) {
  const w = opts.w || 512, h = opts.h || 128;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = opts.bg || '#202422';
  ctx.fillRect(0, 0, w, h);
  if (opts.border) {
    ctx.strokeStyle = opts.border;
    ctx.lineWidth = 8;
    ctx.strokeRect(6, 6, w - 12, h - 12);
  }
  ctx.fillStyle = opts.fg || '#f0ece0';
  const lines = String(text).split('\n');
  const size = opts.size || Math.min(h * 0.62, (w * 1.6) / Math.max(...lines.map((l) => l.length)));
  ctx.font = `${opts.weight || 800} ${size}px ${opts.font || '"Big Shoulders Stencil Display", "Arial Narrow", Impact, sans-serif'}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => {
    ctx.fillText(l, w / 2, h / 2 + (i - (lines.length - 1) / 2) * size * 1.05);
  });
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
