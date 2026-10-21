// Modelli procedurali dei mobili, degli oggetti a terra e delle auto, fatti di scatole con colori per vertice.
// Coordinate locali: impronta da (0,0) a (w,d) in metri, il fronte guarda +z, il retro tocca il muro a z=0.
import { GeoBuilder, lin, shadeCol } from './geom.js';
import { ITEMS } from '../data/items.js';

const C = (h) => lin(h);
const WOOD = [0x8a6242, 0x6e4c32, 0xa07a52, 0x5a3e2a, 0xb08a62];
const FABRIC = [0x5a6a7a, 0x7a4a3a, 0x4a5a4a, 0x8a7a5a, 0x6a5a7a, 0x3a4a5a];

function pickBy(arr, n) {
  return arr[Math.abs(Math.floor(n)) % arr.length];
}

// b: GeoBuilder, w,d dimensioni locali, f oggetto mobile (per varianti)
export const FURN_MODELS = {
  bed(b, w, d, f) {
    const fr = C(pickBy(WOOD, f.id)), sh = C(pickBy([0xd8d4c8, 0xc8d4dc, 0xdcc8c8, 0xd0d8c0], f.id + 1));
    b.box('k', 0.05, 0, 0.08, w - 0.05, 0.32, d - 0.08, fr);
    b.box('k', 0.1, 0.32, 0.12, w - 0.1, 0.52, d - 0.12, C(0xe8e4dc));
    b.box('k', 0.55, 0.52, 0.1, w - 0.08, 0.58, d - 0.1, sh);
    b.box('k', 0.12, 0.52, 0.2, 0.5, 0.64, d - 0.2, C(0xf0ece4));
    b.box('k', 0.0, 0, 0.05, 0.08, 1.0, d - 0.05, fr);
  },
  sofa(b, w, d, f) {
    const c = C(pickBy(FABRIC, f.id));
    b.box('k', 0.05, 0.1, 0.05, w - 0.05, 0.45, d - 0.1, c);
    b.box('k', 0.05, 0.45, 0.05, w - 0.05, 0.9, 0.3, shadeCol(c, 0.9));
    b.box('k', 0.0, 0.1, 0.05, 0.18, 0.65, d - 0.1, shadeCol(c, 0.85));
    b.box('k', w - 0.18, 0.1, 0.05, w, 0.65, d - 0.1, shadeCol(c, 0.85));
    b.box('k', 0.2, 0.45, 0.3, w / 2 - 0.02, 0.55, d - 0.15, shadeCol(c, 1.08));
    b.box('k', w / 2 + 0.02, 0.45, 0.3, w - 0.2, 0.55, d - 0.15, shadeCol(c, 1.08));
  },
  armchair(b, w, d, f) {
    const c = C(pickBy(FABRIC, f.id + 2));
    b.box('k', 0.1, 0.1, 0.1, w - 0.1, 0.45, d - 0.15, c);
    b.box('k', 0.1, 0.45, 0.1, w - 0.1, 0.9, 0.3, shadeCol(c, 0.9));
    b.box('k', 0.05, 0.1, 0.1, 0.22, 0.65, d - 0.15, shadeCol(c, 0.85));
    b.box('k', w - 0.22, 0.1, 0.1, w - 0.05, 0.65, d - 0.15, shadeCol(c, 0.85));
  },
  wardrobe(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id));
    b.box('k', 0.04, 0, 0.02, w - 0.04, 2.0, d - 0.4, c);
    b.box('k', w / 2 - 0.01, 0.1, d - 0.41, w / 2 + 0.01, 1.9, d - 0.39, shadeCol(c, 0.5));
    b.box('k', w / 2 - 0.12, 1.0, d - 0.4, w / 2 - 0.08, 1.15, d - 0.36, C(0xc8c0a0));
    b.box('k', w / 2 + 0.08, 1.0, d - 0.4, w / 2 + 0.12, 1.15, d - 0.36, C(0xc8c0a0));
  },
  dresser(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id + 1));
    b.box('k', 0.08, 0, 0.02, w - 0.08, 0.95, d - 0.45, c);
    for (let k = 0; k < 3; k++) b.box('k', 0.12, 0.1 + k * 0.28, d - 0.46, w - 0.12, 0.33 + k * 0.28, d - 0.44, shadeCol(c, 1.1));
  },
  nightstand(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id + 3));
    b.box('k', 0.25, 0, 0.05, w - 0.25, 0.55, d - 0.5, c);
    b.box('k', 0.32, 0.6, 0.15, 0.48, 0.62, 0.3, C(0xd8c890));
    b.box('k', 0.36, 0.62, 0.19, 0.44, 0.8, 0.26, C(0xe8e0c0));
  },
  bookshelf(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id));
    b.box('k', 0.05, 0, 0.02, w - 0.05, 1.9, 0.05, shadeCol(c, 0.8));
    b.box('k', 0.05, 0, 0.02, 0.1, 1.9, 0.4, c);
    b.box('k', w - 0.1, 0, 0.02, w - 0.05, 1.9, 0.4, c);
    for (let k = 0; k < 5; k++) {
      const y = 0.05 + k * 0.45;
      b.box('k', 0.1, y, 0.05, w - 0.1, y + 0.04, 0.4, c);
      if (k < 4) {
        let x = 0.12;
        let n = f.id * 7 + k * 3;
        while (x < w - 0.18) {
          const bw = 0.04 + ((n * 13) % 5) * 0.012;
          const bh = 0.24 + ((n * 7) % 5) * 0.03;
          b.box('k', x, y + 0.04, 0.08, x + bw, y + 0.04 + bh, 0.36, C([0x8a3a2a, 0x2a4a6a, 0x3a5a3a, 0xc8a050, 0x5a3a5a, 0xd8d0b8][n % 6]));
          x += bw + 0.005;
          n++;
        }
      }
    }
  },
  desk(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id + 2));
    b.box('k', 0.05, 0.72, 0.05, w - 0.05, 0.78, d - 0.25, c);
    b.box('k', 0.05, 0, 0.05, 0.4, 0.72, d - 0.3, shadeCol(c, 0.9));
    b.box('k', w - 0.1, 0, 0.05, w - 0.05, 0.72, d - 0.3, shadeCol(c, 0.9));
    b.box('k', 0.5, 0.78, 0.15, 0.8, 0.8, 0.4, C(0xe8e4da));
  },
  table(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id));
    b.box('k', 0.1, 0.72, 0.1, w - 0.1, 0.78, d - 0.1, c);
    for (const [x, z] of [[0.15, 0.15], [w - 0.21, 0.15], [0.15, d - 0.21], [w - 0.21, d - 0.21]]) b.box('k', x, 0, z, x + 0.06, 0.72, z + 0.06, shadeCol(c, 0.8));
  },
  chair(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id + 1));
    b.box('k', 0.3, 0.44, 0.3, 0.7, 0.48, 0.7, c);
    for (const [x, z] of [[0.3, 0.3], [0.66, 0.3], [0.3, 0.66], [0.66, 0.66]]) b.box('k', x, 0, z, x + 0.04, 0.44, z + 0.04, shadeCol(c, 0.8));
    b.box('k', 0.3, 0.48, 0.3, 0.7, 0.95, 0.34, c);
  },
  counter(b, w, d, f) {
    const c = C(pickBy([0xd8d0c0, 0x8a6a4a, 0xc8ccc8, 0x6a7a6a], f.bld + 1));
    b.box('k', 0.0, 0.08, 0.02, w, 0.88, d - 0.4, c);
    b.box('k', 0.0, 0.88, 0.0, w, 0.93, d - 0.36, C(0x8a8a86));
    b.box('k', 0.05, 0.12, d - 0.41, w / 2 - 0.02, 0.84, d - 0.39, shadeCol(c, 1.06));
    b.box('k', w / 2 + 0.02, 0.12, d - 0.41, w - 0.05, 0.84, d - 0.39, shadeCol(c, 1.06));
    b.box('k', 0.0, 1.45, 0.0, w, 2.1, 0.35, shadeCol(c, 0.95));
  },
  stove(b, w, d) {
    b.box('k', 0.02, 0.05, 0.02, w - 0.02, 0.88, d - 0.38, C(0xe8e8e2));
    b.box('k', 0.0, 0.88, 0.0, w, 0.93, d - 0.36, C(0x2a2a2a));
    b.box('k', 0.15, 0.2, d - 0.39, w - 0.15, 0.7, d - 0.37, C(0x1a1a1a));
    for (const [x, z] of [[0.25, 0.15], [0.65, 0.15], [0.25, 0.45], [0.65, 0.45]]) b.box('k', x - 0.08, 0.93, z - 0.08, x + 0.08, 0.95, z + 0.08, C(0x555555));
  },
  fridge(b, w, d) {
    b.box('k', 0.08, 0.02, 0.02, w - 0.08, 1.82, d - 0.3, C(0xe8eae6));
    b.box('k', 0.1, 1.2, d - 0.31, w - 0.1, 1.22, d - 0.29, C(0xb8bab6));
    b.box('k', w - 0.22, 0.8, d - 0.31, w - 0.18, 1.1, d - 0.27, C(0x9a9a96));
  },
  sink_k(b, w, d) {
    b.box('k', 0.0, 0.08, 0.02, w, 0.88, d - 0.4, C(0xd8d0c0));
    b.box('k', 0.0, 0.88, 0.0, w, 0.93, d - 0.36, C(0x9aa0a0));
    b.box('k', 0.2, 0.93, 0.12, w - 0.2, 0.95, d - 0.48, C(0x5a6064));
    b.box('k', w / 2 - 0.03, 0.93, 0.05, w / 2 + 0.03, 1.2, 0.1, C(0xc8ccd0));
  },
  sink_b(b, w, d) {
    b.box('k', 0.25, 0.0, 0.05, w - 0.25, 0.8, 0.35, C(0xe8eaea));
    b.box('k', 0.2, 0.8, 0.02, w - 0.2, 0.9, 0.5, C(0xf0f2f2));
    b.box('k', 0.15, 1.1, 0.0, w - 0.15, 1.75, 0.04, C(0xa8c0c8));
  },
  toilet(b, w, d) {
    b.box('k', 0.3, 0.0, 0.25, 0.7, 0.42, 0.75, C(0xf0f2f2));
    b.box('k', 0.28, 0.42, 0.25, 0.72, 0.45, 0.78, C(0xe0e2e2));
    b.box('k', 0.28, 0.4, 0.02, 0.72, 0.85, 0.24, C(0xf0f2f2));
  },
  tub(b, w, d) {
    b.box('k', 0.05, 0.0, 0.05, w - 0.05, 0.58, d - 0.05, C(0xf0f2f2));
    b.box('k', 0.15, 0.4, 0.15, w - 0.15, 0.59, d - 0.15, C(0xb8d0d8));
  },
  med_cabinet(b, w, d) {
    b.box('k', 0.2, 1.0, 0.02, w - 0.2, 1.65, 0.22, C(0xe8e8e2));
    b.box('k', 0.22, 1.02, 0.22, w - 0.22, 1.63, 0.23, C(0xa8c0c8));
    b.box('k', 0.42, 1.25, 0.23, 0.58, 1.4, 0.24, C(0xc0392b));
  },
  tv(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id + 4));
    b.box('k', 0.05, 0, 0.05, w - 0.05, 0.5, d - 0.5, c);
    b.box('k', 0.1, 0.5, 0.15, w - 0.1, 1.05, 0.22, C(0x111214));
    b.box('k', 0.4, 0.5, 0.12, 0.6, 0.55, 0.3, C(0x222222));
  },
  lamp(b, w, d, f) {
    b.box('k', 0.42, 0, 0.42, 0.58, 0.04, 0.58, C(0x3a3a3a));
    b.box('k', 0.48, 0.04, 0.48, 0.52, 1.35, 0.52, C(0x5a5a5a));
    b.box('k', 0.32, 1.3, 0.32, 0.68, 1.6, 0.68, C(f.state && f.state.on ? 0xfff0c0 : 0xd8c8a0));
  },
  shoe_rack(b, w, d, f) {
    const c = C(pickBy(WOOD, f.id));
    b.box('k', 0.1, 0, 0.05, w - 0.1, 0.9, d - 0.6, c);
  },
  workbench(b, w, d, f) {
    const c = C(0x9a7a52);
    b.box('k', 0.05, 0.85, 0.05, w - 0.05, 0.92, d - 0.1, c);
    for (const [x, z] of [[0.08, 0.08], [w - 0.16, 0.08], [0.08, d - 0.2], [w - 0.16, d - 0.2]]) b.box('k', x, 0, z, x + 0.08, 0.85, z + 0.08, shadeCol(c, 0.8));
    b.box('k', 0.1, 0.25, 0.1, w - 0.1, 0.3, d - 0.15, shadeCol(c, 0.85));
    b.box('k', 0.05, 0.92, 0.02, w - 0.05, 1.7, 0.05, C(0x6a5a3a));
    b.box('k', 0.3, 0.92, 0.3, 0.6, 1.0, 0.45, C(0xc0392b));
    b.box('k', w - 0.7, 0.92, 0.25, w - 0.3, 0.97, 0.5, C(0x7d8a90));
    if (f.type === 'bench_mech') b.box('k', w / 2 - 0.15, 0.92, 0.2, w / 2 + 0.15, 1.15, 0.45, C(0x3a6ea5));
  },
  shelf(b, w, d, f) {
    const c = C(0x7d8a90);
    for (const x of [0.05, w - 0.09]) for (const z of [0.05, d - 0.55]) b.box('k', x, 0, z, x + 0.04, 1.9, z + 0.04, c);
    for (let k = 0; k < 4; k++) {
      const y = 0.15 + k * 0.55;
      b.box('k', 0.05, y, 0.05, w - 0.05, y + 0.03, d - 0.5, shadeCol(c, 1.1));
      let x = 0.1, n = f.id * 5 + k;
      while (x < w - 0.3) {
        const bw = 0.12 + ((n * 7) % 4) * 0.06;
        if ((n * 11) % 3 !== 0) b.box('k', x, y + 0.03, 0.1, x + bw, y + 0.03 + 0.15 + ((n * 3) % 4) * 0.06, d - 0.6, C([0xb08a5a, 0x8a3a2a, 0x3a5a8a, 0xc8b070, 0x5a6a5a][n % 5]));
        x += bw + 0.06;
        n++;
      }
    }
  },
  crate(b, w, d) {
    const c = C(0xa8885a);
    b.box('k', 0.12, 0, 0.12, w - 0.12, 0.75, d - 0.12, c, { uv: 0.5 });
    b.box('k', 0.1, 0.32, 0.1, w - 0.1, 0.4, d - 0.1, shadeCol(c, 0.8));
  },
  pallet(b, w, d, f) {
    const c = C(0xa0805a);
    b.box('k', 0.05, 0, 0.05, w - 0.05, 0.14, d - 0.05, c);
    const cc = C(pickBy([0xb8a080, 0xc8b898, 0x8a6a4a], f.id));
    b.box('k', 0.1, 0.14, 0.1, w - 0.1, 1.05, d - 0.1, cc);
    b.box('k', 0.08, 0.5, 0.08, w - 0.08, 0.56, d - 0.08, C(0x6a5a3a));
  },
  locker(b, w, d, f) {
    const c = C(pickBy([0x5a6a7a, 0x6a7a5a, 0x7a5a4a], f.id));
    b.box('k', 0.15, 0, 0.02, w - 0.15, 1.9, d - 0.5, c);
    b.box('k', w / 2 - 0.01, 0.05, d - 0.51, w / 2 + 0.01, 1.85, d - 0.49, shadeCol(c, 0.6));
    for (let k = 0; k < 4; k++) b.box('k', 0.22, 1.5 + k * 0.05, d - 0.51, w / 2 - 0.05, 1.52 + k * 0.05, d - 0.49, shadeCol(c, 0.6));
  },
  school_desk(b, w, d) {
    b.box('k', 0.2, 0.7, 0.25, 0.8, 0.74, 0.65, C(0xc8a878));
    b.box('k', 0.22, 0, 0.3, 0.26, 0.7, 0.34, C(0x5a5a5a));
    b.box('k', 0.74, 0, 0.3, 0.78, 0.7, 0.34, C(0x5a5a5a));
    b.box('k', 0.3, 0.42, 0.72, 0.7, 0.46, 0.98, C(0xc8a878));
    b.box('k', 0.3, 0.46, 0.94, 0.7, 0.8, 0.98, C(0xc8a878));
  },
  teacher_desk(b, w, d, f) {
    FURN_MODELS.desk(b, w, d, f);
  },
  exam_bed(b, w, d) {
    b.box('k', 0.1, 0.0, 0.15, w - 0.1, 0.65, d - 0.15, C(0xb8bcbc));
    b.box('k', 0.1, 0.65, 0.15, w - 0.1, 0.78, d - 0.15, C(0x5a8a8a));
    b.box('k', 0.1, 0.78, 0.2, 0.5, 0.86, d - 0.2, C(0xe8eaea));
  },
  med_shelf(b, w, d) {
    b.box('k', 0.05, 0, 0.02, w - 0.05, 1.9, d - 0.5, C(0xe0e4e2));
    b.box('k', 0.08, 0.95, d - 0.51, w - 0.08, 1.85, d - 0.49, C(0xa8c0c8));
    b.box('k', 0.08, 0.05, d - 0.51, w - 0.08, 0.9, d - 0.49, C(0xd8dcda));
    b.box('k', 0.42, 1.45, d - 0.49, 0.58, 1.6, d - 0.48, C(0x2f9e5a));
  },
  pharma_shelf(b, w, d, f) {
    FURN_MODELS.shelf(b, w, d, f);
    b.box('k', 0.05, 1.92, 0.0, w - 0.05, 2.1, 0.08, C(0x2f9e5a));
  },
  counter_shop(b, w, d, f) {
    const c = C(pickBy([0x8a6a4a, 0x5a6a7a, 0xc8c0b0], f.bld + 2));
    b.box('k', 0.05, 0, 0.1, w - 0.05, 1.0, d - 0.15, c);
    b.box('k', 0.0, 1.0, 0.05, w, 1.06, d - 0.1, C(0x3a3a3a));
    if (f.loot === 'electro_counter' || f.loot === 'gas_shop') b.box('k', 0.3, 1.06, 0.3, 0.7, 1.3, 0.55, C(0x222222));
  },
  clothes_rack(b, w, d, f) {
    b.box('k', 0.1, 0, 0.45, 0.15, 1.5, 0.55, C(0x9aa0a0));
    b.box('k', w - 0.15, 0, 0.45, w - 0.1, 1.5, 0.55, C(0x9aa0a0));
    b.box('k', 0.1, 1.45, 0.47, w - 0.1, 1.5, 0.53, C(0x9aa0a0));
    for (let k = 0; k < 9; k++) {
      const x = 0.2 + k * ((w - 0.4) / 9);
      b.box('k', x, 0.6, 0.3, x + 0.14, 1.42, 0.7, C(pickBy(FABRIC.concat([0xc0392b, 0xe6c13a, 0xd8d8d0]), f.id + k)));
    }
  },
  trash_bin(b, w, d) {
    b.box('k', 0.2, 0, 0.2, 0.8, 1.05, 0.8, C(0x3a5a3a));
    b.box('k', 0.18, 1.05, 0.18, 0.82, 1.12, 0.82, C(0x2a4a2a));
  },
  park_bench(b, w, d) {
    const c = C(0x8a6a42);
    b.box('k', 0.1, 0.42, 0.25, w - 0.1, 0.47, 0.7, c);
    b.box('k', 0.1, 0.5, 0.2, w - 0.1, 0.85, 0.25, c);
    for (const x of [0.2, w - 0.28]) b.box('k', x, 0, 0.25, x + 0.08, 0.42, 0.7, C(0x3a3a3a));
  },
  vending(b, w, d) {
    b.box('k', 0.08, 0, 0.05, w - 0.08, 1.9, d - 0.25, C(0xc0392b));
    b.box('k', 0.15, 0.6, d - 0.26, w - 0.35, 1.75, d - 0.24, C(0x9ab8c8));
    b.box('k', w - 0.3, 0.9, d - 0.26, w - 0.15, 1.4, d - 0.24, C(0x2a2a2a));
  },
  pump(b, w, d) {
    b.box('k', 0.2, 0, 0.3, 0.8, 1.7, 0.7, C(0xe8e8e0));
    b.box('k', 0.22, 1.2, 0.29, 0.78, 1.6, 0.31, C(0x222222));
    b.box('k', 0.2, 1.7, 0.3, 0.8, 1.8, 0.7, C(0xc0392b));
    b.box('k', 0.75, 0.6, 0.45, 0.85, 1.0, 0.55, C(0x2a2a2a));
  },
  fountain(b, w, d) {
    b.box('k', 0.3, 0, 0.3, 0.7, 1.0, 0.7, C(0x3a5a3a));
    b.box('k', 0.38, 0.9, 0.62, 0.45, 0.98, 0.85, C(0x9aa0a0));
    b.box('k', 0.2, 0, 0.6, 0.8, 0.12, 1.0, C(0x6a6a66));
  },
  piano(b, w, d) {
    b.box('k', 0.05, 0, 0.05, w - 0.05, 1.3, 0.55, C(0x1a1414));
    b.box('k', 0.1, 0.7, 0.55, w - 0.1, 0.78, 0.75, C(0x1a1414));
    b.box('k', 0.12, 0.78, 0.56, w - 0.12, 0.8, 0.72, C(0xf0eee4));
  },
  car_lift(b, w, d) {
    b.box('k', 0.1, 0, 0.1, 0.9, 0.9, 0.9, C(0xe6a23c));
    b.box('k', 0.15, 0.9, 0.15, 0.85, 2.0, 0.25, C(0x3a3a3a));
    b.box('k', 0.3, 0.1, 0.9, 0.38, 0.14, 1.6, C(0x5a5a5a));
    b.box('k', 0.62, 0.1, 0.9, 0.7, 0.14, 1.6, C(0x5a5a5a));
  },
  bench_carp(b, w, d, f) {
    FURN_MODELS.workbench(b, w, d, f);
  },
  bench_mech(b, w, d, f) {
    FURN_MODELS.workbench(b, w, d, f);
  },
  kitchen_camp(b, w, d) {
    b.box('k', 0.15, 0, 0.15, 0.85, 0.75, 0.85, C(0x3a3a3a));
    b.box('k', 0.1, 0.75, 0.1, 0.9, 0.8, 0.9, C(0x5a5a5a));
    b.box('k', 0.6, 0.8, 0.6, 0.72, 1.9, 0.72, C(0x4a4a4a));
  },
  med_station(b, w, d) {
    b.box('k', 0.1, 0, 0.1, 0.9, 0.85, 0.9, C(0xe8e8e2));
    b.box('k', 0.1, 0.85, 0.1, 0.9, 0.9, 0.9, C(0xd8dcda));
    b.box('k', 0.4, 0.9, 0.3, 0.6, 0.94, 0.7, C(0xc0392b));
    b.box('k', 0.45, 0.9, 0.42, 0.55, 0.96, 0.58, C(0xffffff));
  },
  bench_elec(b, w, d) {
    b.box('k', 0.05, 0.85, 0.05, w - 0.05, 0.92, d - 0.1, C(0x6a7a6a));
    for (const [x, z] of [[0.08, 0.08], [w - 0.14, 0.08], [0.08, d - 0.2], [w - 0.14, d - 0.2]]) b.box('k', x, 0, z, x + 0.06, 0.85, z + 0.06, C(0x5a5a5a));
    b.box('k', 0.2, 0.92, 0.2, 0.5, 1.1, 0.45, C(0xe6c13a));
    b.box('k', 0.6, 0.92, 0.25, 0.8, 0.98, 0.5, C(0x2f9e5a));
  },
  crate_built(b, w, d) {
    FURN_MODELS.crate(b, w, d);
  },
  campfire(b, w, d) {
    for (let k = 0; k < 7; k++) {
      const a = (k / 7) * Math.PI * 2;
      const x = 0.5 + Math.cos(a) * 0.36, z = 0.5 + Math.sin(a) * 0.36;
      b.box('k', x - 0.08, 0, z - 0.08, x + 0.08, 0.12, z + 0.08, C(0x6a6a66));
    }
    b.rbox('k', 0.5, 0.05, 0.5, 0.05, 0.12, 0.3, 0.6, C(0x4a3424));
    b.rbox('k', 0.5, 0.05, 0.5, 0.05, 0.12, 0.3, 2.1, C(0x4a3424));
  },
  rain_collector(b, w, d) {
    b.cyl('k', 0.5, 0, 0.5, 0.36, 0.95, C(0x3a6ea5), 10);
    b.box('k', 0.05, 1.0, 0.05, 0.95, 1.05, 0.95, C(0x2f5a8a));
    for (const [x, z] of [[0.05, 0.05], [0.9, 0.05], [0.05, 0.9], [0.9, 0.9]]) b.box('k', x, 0, z, x + 0.05, 1.2, z + 0.05, C(0x8a6a4a));
  },
  garden(b, w, d) {
    const c = C(0x8a6a4a);
    b.box('k', 0.02, 0, 0.02, 0.98, 0.18, 0.1, c);
    b.box('k', 0.02, 0, 0.9, 0.98, 0.18, 0.98, c);
    b.box('k', 0.02, 0, 0.1, 0.1, 0.18, 0.9, c);
    b.box('k', 0.9, 0, 0.1, 0.98, 0.18, 0.9, c);
    b.box('k', 0.1, 0, 0.1, 0.9, 0.14, 0.9, C(0x4a3424));
  },
  generator(b, w, d) {
    b.box('k', 0.15, 0.1, 0.25, 0.85, 0.65, 0.75, C(0xc9a032));
    b.box('k', 0.1, 0, 0.2, 0.9, 0.1, 0.8, C(0x2a2a2a));
    b.box('k', 0.1, 0.1, 0.2, 0.14, 0.75, 0.24, C(0x2a2a2a));
    b.box('k', 0.86, 0.1, 0.76, 0.9, 0.75, 0.8, C(0x2a2a2a));
    b.box('k', 0.3, 0.65, 0.35, 0.5, 0.72, 0.5, C(0x3a3a3a));
  },
  ladder(b, w, d) {
    const c = C(0xa0805a);
    b.box('k', 0.15, 0, 0.1, 0.22, 3.25, 0.18, c);
    b.box('k', 0.78, 0, 0.1, 0.85, 3.25, 0.18, c);
    for (let k = 0; k < 10; k++) b.box('k', 0.2, 0.25 + k * 0.3, 0.11, 0.8, 0.29 + k * 0.3, 0.17, shadeCol(c, 0.9));
  },
  post(b, w, d) {
    b.box('k', 0.38, 0, 0.38, 0.62, 3.0, 0.62, C(0x8a6a4a));
  },
};

// mesh di un oggetto a terra (piccolo o ingombrante)
export function itemModel(b, id, x, z, rot, k) {
  const def = ITEMS[id];
  const col = lin(parseInt((def && def.col ? def.col : '#888888').slice(1), 16));
  const c = Math.cos(rot), s = Math.sin(rot);
  switch (id) {
    case 'plank':
      b.rbox('k', x, 0.02 + k * 0.05, z, 0.11, 0.06 + k * 0.05, 1.0, rot, lin(0xb08a5a));
      return;
    case 'log':
      b.rbox('k', x, 0.0 + k * 0.25, z, 0.15, 0.3 + k * 0.25, 0.7, rot, lin(0x6a4a2a));
      return;
    case 'sheet_metal':
      b.rbox('k', x, 0.01 + k * 0.03, z, 0.45, 0.03 + k * 0.03, 0.7, rot, lin(0x9aa6ae));
      return;
    case 'cement':
      b.rbox('k', x, k * 0.2, z, 0.3, 0.18 + k * 0.2, 0.22, rot, lin(0xc8c4b8));
      return;
    case 'barrel':
      b.cyl('k', x, 0, z, 0.3, 0.9, lin(0x3a6ea5), 10);
      return;
    case 'generator':
      b.rbox('k', x, 0.1, z, 0.35, 0.65, 0.25, rot, lin(0xc9a032));
      b.rbox('k', x, 0, z, 0.38, 0.1, 0.28, rot, lin(0x2a2a2a));
      return;
    case 'door_item':
      b.rbox('k', x, 0.0, z, 0.45, 0.06, 1.0, rot, lin(0x8a6a4a));
      return;
    case 'car_battery':
      b.rbox('k', x, 0, z, 0.15, 0.2, 0.12, rot, lin(0x2a2a2a));
      return;
    case 'pipe':
      b.rbox('k', x, 0.02, z, 0.03, 0.08, 0.6, rot + k, lin(0x7d8a90));
      return;
    default: {
      const ox = Math.cos(k * 2.4) * 0.18, oz = Math.sin(k * 2.4) * 0.18;
      const px = x + ox * c - oz * s, pz = z + ox * s + oz * c;
      if (def && (def.c === 'cloth' || def.c === 'bag')) b.rbox('k', px, 0, pz, 0.16, 0.05, 0.13, rot + k, col);
      else if (def && def.ic === 'bottle') b.cyl('k', px, 0, pz, 0.04, 0.26, col, 6);
      else if (def && def.ic === 'can') b.cyl('k', px, 0, pz, 0.04, 0.11, col, 6);
      else if (def && (def.c === 'weapon' || def.c === 'tool')) b.rbox('k', px, 0, pz, 0.04, 0.04, 0.3, rot + k * 1.3, col);
      else b.rbox('k', px, 0, pz, 0.07, 0.06, 0.09, rot + k, col);
    }
  }
}

// auto abbandonata: carrozzeria, abitacolo, ruote
export function carModel(car) {
  const b = new GeoBuilder();
  const L = 4.0, Wd = 1.75;
  const hl = L / 2, hw = Wd / 2;
  const body = lin(car.col);
  const glass = lin(car.broken ? 0x101418 : 0x2a3640);
  const dark = lin(0x1a1a1a);
  if (car.van) {
    b.box('k', -hw, 0.35, -hl, hw, 2.1, hl * 0.55, body);
    b.box('k', -hw, 0.35, hl * 0.55, hw, 1.3, hl, body);
    b.box('k', -hw + 0.06, 1.3, hl * 0.55 - 0.05, hw - 0.06, 1.95, hl * 0.62, glass);
    if (car.military) b.box('k', -hw - 0.02, 0.9, -hl * 0.4, hw + 0.02, 1.4, 0.2, lin(0x3a4a2a));
  } else {
    b.box('k', -hw, 0.35, -hl, hw, 0.95, hl, body);
    b.box('k', -hw + 0.08, 0.95, -hl * 0.55, hw - 0.08, 1.45, hl * 0.35, glass);
    b.box('k', -hw + 0.1, 1.45, -hl * 0.5, hw - 0.1, 1.5, hl * 0.3, body);
  }
  b.box('k', -hw - 0.02, 0.3, -hl - 0.03, hw + 0.02, 0.5, -hl + 0.05, dark);
  b.box('k', -hw - 0.02, 0.3, hl - 0.05, hw + 0.02, 0.5, hl + 0.03, dark);
  b.box('k', -hw + 0.1, 0.6, hl, -hw + 0.4, 0.75, hl + 0.02, lin(car.broken ? 0x555544 : 0xe8e4c8));
  b.box('k', hw - 0.4, 0.6, hl, hw - 0.1, 0.75, hl + 0.02, lin(car.broken ? 0x555544 : 0xe8e4c8));
  b.box('k', -hw + 0.1, 0.6, -hl - 0.02, -hw + 0.4, 0.75, -hl, lin(0x8a1a1a));
  b.box('k', hw - 0.4, 0.6, -hl - 0.02, hw - 0.1, 0.75, -hl, lin(0x8a1a1a));
  for (const [x, z] of [[-hw, hl * 0.62], [hw, hl * 0.62], [-hw, -hl * 0.62], [hw, -hl * 0.62]]) {
    b.cyl('k', 0.33, x - 0.12, z, 0.33, x + 0.12, dark, 8, 'x');
  }
  if (car.doorOpen && !car.van) b.box('k', -hw - 0.9, 0.4, -0.2, -hw - 0.85, 1.2, 0.85, body);
  if (car.dismantled) {
    // carcassa senza ruote né pezzi
  }
  return b.buildOne();
}

export function buildFurnGeo(f) {
  const model = FURN_MODELS[f.type];
  const b = new GeoBuilder();
  const def = f.def;
  const [sw, sd] = def.sz;
  if (model) model(b, sw, sd, f);
  else b.box('k', 0.1, 0, 0.1, sw - 0.1, def.h, sd - 0.1, lin(0x8a8a8a));
  return b.buildOne();
}
