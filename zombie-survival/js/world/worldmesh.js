// Mondo statico: terreno, pavimenti, muri, tetti, segnaletica, alberi. Unito in mesh per materiale
// e per blocchi da 48 m: pochi draw call, e il frustum culling scarta comunque i blocchi alle spalle.
import * as THREE from 'three';
import { GeoBuilder, lin, shadeCol } from '../render/geom.js';
import { F, E, BLK, FLOOR_INFO } from './grid.js';
import { LEVEL_H } from '../config.js';
import { textTexture } from '../render/textures.js';

export const FLOOR_TEX = {
  [F.GRASS]: 'grass', [F.DIRT]: 'dirt', [F.ASPHALT]: 'asphalt', [F.SIDEWALK]: 'sidewalk', [F.GRAVEL]: 'gravel',
  [F.FIELD]: 'field', [F.FOREST]: 'forest', [F.PARKING]: 'asphalt', [F.CONCRETE]: 'concrete', [F.COURT]: 'court',
  [F.WOOD]: 'wood', [F.TILE]: 'tile', [F.CARPET]: 'carpet', [F.CONC_IN]: 'concrete', [F.LINO]: 'lino', [F.SHOP]: 'shop',
};
export const TEX_SCALE = {
  grass: 3, dirt: 3, asphalt: 4, sidewalk: 2, gravel: 2.5, field: 2, forest: 3, concrete: 3, court: 3, wood: 2, tile: 1, carpet: 2,
  lino: 2, shop: 1, plaster: 3, brick: 2, stone: 2, panel: 2, roof: 1.5, roof_flat: 3, metal: 2, hedge: 1.5, planks: 1,
};
const CHUNK = 48;
// solo muri, tetti, siepi e strutture proiettano ombre: pavimenti e terreno no (metà del lavoro risparmiato)
const CASTERS = new Set(['plaster', 'brick', 'stone', 'panel', 'roof', 'roof_flat', 'metal', 'hedge', 'planks', 'flat']);
const WHITE = [1, 1, 1];

export function windowSpan(e) {
  if (e.shop) return [0.35, 2.6];
  if (e.small) return [1.35, 2.0];
  if (e.high) return [3.1, 4.3];
  return [0.9, 2.1];
}

export class StaticWorld {
  constructor(tex, quality) {
    this.tex = tex;
    this.quality = quality;
    this.group = new THREE.Group();
    this.group.name = 'static';
    this.mats = {};
    this.lampHeads = null;
    this.lampPools = null;
    this.signs = [];
    this.grass = null;
    this.weeds = null;
  }

  mat(key) {
    if (this.mats[key]) return this.mats[key];
    let m;
    if (key === 'paint') {
      m = new THREE.MeshLambertMaterial({ color: 0xd8d4c4, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    } else if (key === 'chain') {
      m = new THREE.MeshLambertMaterial({ map: this.tex.chain, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, vertexColors: true });
    } else if (key === 'roof') {
      m = new THREE.MeshLambertMaterial({ map: this.tex.roof, vertexColors: true, side: THREE.DoubleSide });
    } else if (key === 'flat') {
      m = new THREE.MeshLambertMaterial({ vertexColors: true });
    } else {
      m = new THREE.MeshLambertMaterial({ map: this.tex[key] || null, vertexColors: true });
    }
    this.mats[key] = m;
    return m;
  }

  dispose() {
    this.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
    });
    for (const k in this.mats) this.mats[k].dispose();
    this.mats = {};
    for (const s of this.signs) {
      s.material.map && s.material.map.dispose();
      s.material.dispose();
    }
    this.signs = [];
    this.group.clear();
  }

  build(W) {
    const g = W.grid;
    const q = this.quality;
    const nCx = Math.ceil(g.W / CHUNK), nCz = Math.ceil(g.H / CHUNK);
    const builders = [];
    for (let k = 0; k < nCx * nCz; k++) builders.push(new GeoBuilder());
    const B = (x, z) => {
      const cx = Math.min(nCx - 1, Math.max(0, Math.floor(x / CHUNK)));
      const cz = Math.min(nCz - 1, Math.max(0, Math.floor(z / CHUNK)));
      return builders[cz * nCx + cx];
    };
    const dark = q.interiorDark;

    // ---- terreno e pavimenti del piano terra
    for (let j = 0; j < g.H; j++) {
      for (let i = 0; i < g.W; i++) {
        const k = g.idx(i, j);
        const f = g.lv[0].floor[k];
        const fi = FLOOR_INFO[f] || FLOOR_INFO[F.GRASS];
        if (fi.built) continue; // le fondamenta costruite sono dinamiche
        const y = fi.y;
        const key = FLOOR_TEX[f] || 'grass';
        const s = TEX_SCALE[key];
        const indoor = g.lv[0].room[k] >= 0;
        const vary = 0.94 + (((i * 928371 + j * 1237) % 97) / 97) * 0.1;
        const col = indoor ? [dark * vary, dark * vary, dark * vary] : [vary, vary, vary];
        B(i, j).quad(key, [[i, y, j + 1], [i + 1, y, j + 1], [i + 1, y, j], [i, y, j]], [0, 1, 0],
          [i / s, -(j + 1) / s, (i + 1) / s, -(j + 1) / s, (i + 1) / s, -j / s, i / s, -j / s], col);
        // gradini (marciapiedi, soglie)
        for (const [di, dj] of [[1, 0], [0, 1]]) {
          const ni = i + di, nj = j + dj;
          if (!g.inb(ni, nj)) continue;
          const nf = g.lv[0].floor[g.idx(ni, nj)];
          const nfi = FLOOR_INFO[nf] || FLOOR_INFO[F.GRASS];
          if (nfi.built) continue;
          const ny = nfi.y;
          if (Math.abs(ny - y) < 0.01) continue;
          const hi = ny > y ? { f: nf, y: ny } : { f, y };
          const lo = ny > y ? y : ny;
          const hk = FLOOR_TEX[hi.f] === 'grass' ? 'concrete' : hi.f >= F.WOOD ? 'concrete' : FLOOR_TEX[hi.f];
          const bb = B(i, j);
          const c = shadeCol(WHITE, 0.8);
          if (di === 1) {
            // lato verticale a x = i+1
            const x = i + 1;
            if (ny > y) bb.quad(hk, [[x, lo, j], [x, lo, j + 1], [x, hi.y, j + 1], [x, hi.y, j]], [-1, 0, 0], [0, 0, 1, 0, 1, 0.12, 0, 0.12], c);
            else bb.quad(hk, [[x, lo, j + 1], [x, lo, j], [x, hi.y, j], [x, hi.y, j + 1]], [1, 0, 0], [0, 0, 1, 0, 1, 0.12, 0, 0.12], c);
          } else {
            const z = j + 1;
            if (ny > y) bb.quad(hk, [[i + 1, lo, z], [i, lo, z], [i, hi.y, z], [i + 1, hi.y, z]], [0, 0, -1], [0, 0, 1, 0, 1, 0.12, 0, 0.12], c);
            else bb.quad(hk, [[i, lo, z], [i + 1, lo, z], [i + 1, hi.y, z], [i, hi.y, z]], [0, 0, 1], [0, 0, 1, 0, 1, 0.12, 0, 0.12], c);
          }
        }
        // siepi
        if (g.block[k] === BLK.HEDGE) {
          const hv = 0.85 + (((i * 31 + j * 17) % 13) / 13) * 0.25;
          B(i, j).box('hedge', i + 0.04, 0, j + 0.04, i + 0.96, 1.55 + ((i + j) % 3) * 0.08, j + 0.96, lin(0x5c8a46).map((v) => v * hv), { uv: 1.5, skip: { ny: true } });
        }
      }
    }

    // ---- solai del primo piano, soffitti
    for (const b of W.buildings) {
      const H = b.wallH || b.floors * LEVEL_H;
      for (const rid of b.rooms) {
        const r = W.rooms[rid];
        for (const [i, j] of r.cells) {
          const k = g.idx(i, j);
          const bb = B(i, j);
          if (r.L === 0) {
            const hasUpper = b.floors === 2;
            if (hasUpper) {
              if (g.lv[1].floor[k] !== F.NONE) {
                const ru = W.rooms[g.lv[1].room[k]];
                const key = FLOOR_TEX[ru ? ru.floor : F.WOOD] || 'wood';
                const s = TEX_SCALE[key];
                const y = LEVEL_H;
                bb.quad(key, [[i, y, j + 1], [i + 1, y, j + 1], [i + 1, y, j], [i, y, j]], [0, 1, 0],
                  [i / s, -(j + 1) / s, (i + 1) / s, -(j + 1) / s, (i + 1) / s, -j / s, i / s, -j / s], [dark, dark, dark]);
                bb.quad('plaster', [[i + 1, y - 0.04, j + 1], [i, y - 0.04, j + 1], [i, y - 0.04, j], [i + 1, y - 0.04, j]], [0, -1, 0],
                  [0, 0, 0.33, 0, 0.33, 0.33, 0, 0.33], shadeCol(lin(0xe6e2d8), dark));
              } else {
                // bordo del vano scala
                for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                  const nk = g.idx(i + di, j + dj);
                  if (g.lv[1].floor[nk] === F.NONE) continue;
                  const c = shadeCol(lin(0xd8d0c0), dark);
                  if (di === 1) bb.quad('plaster', [[i + 1, LEVEL_H - 0.04, j], [i + 1, LEVEL_H - 0.04, j + 1], [i + 1, LEVEL_H, j + 1], [i + 1, LEVEL_H, j]], [-1, 0, 0], [0, 0, 1, 0, 1, 0.04, 0, 0.04], c);
                  if (di === -1) bb.quad('plaster', [[i, LEVEL_H - 0.04, j + 1], [i, LEVEL_H - 0.04, j], [i, LEVEL_H, j], [i, LEVEL_H, j + 1]], [1, 0, 0], [0, 0, 1, 0, 1, 0.04, 0, 0.04], c);
                  if (dj === 1) bb.quad('plaster', [[i + 1, LEVEL_H - 0.04, j + 1], [i, LEVEL_H - 0.04, j + 1], [i, LEVEL_H, j + 1], [i + 1, LEVEL_H, j + 1]], [0, 0, -1], [0, 0, 1, 0, 1, 0.04, 0, 0.04], c);
                  if (dj === -1) bb.quad('plaster', [[i, LEVEL_H - 0.04, j], [i + 1, LEVEL_H - 0.04, j], [i + 1, LEVEL_H, j], [i, LEVEL_H, j]], [0, 0, 1], [0, 0, 1, 0, 1, 0.04, 0, 0.04], c);
                }
              }
            } else {
              const y = H - 0.03;
              bb.quad('plaster', [[i + 1, y, j + 1], [i, y, j + 1], [i, y, j], [i + 1, y, j]], [0, -1, 0],
                [0, 0, 0.33, 0, 0.33, 0.33, 0, 0.33], shadeCol(lin(0xe6e2d8), dark));
            }
          } else {
            const y = 2 * LEVEL_H - 0.03;
            bb.quad('plaster', [[i + 1, y, j + 1], [i, y, j + 1], [i, y, j], [i + 1, y, j]], [0, -1, 0],
              [0, 0, 0.33, 0, 0.33, 0.33, 0, 0.33], shadeCol(lin(0xe6e2d8), dark));
          }
        }
      }
      this.buildRoof(W, b, B(b.i0 + b.w / 2, b.j0 + b.d / 2));
      if (b.sign) this.buildSign(W, b);
    }

    // ---- muri, finestre, porte (parti fisse)
    const sideKey = (st) => (st ? (st.tex === 'tile' ? 'tile' : st.tex) : 'plaster');
    const sideCol = (st) => {
      if (!st) return lin(0xd8d2c4);
      const c = lin(st.col);
      return st.ext ? c : shadeCol(c, dark);
    };
    for (const e of g.edges.values()) {
      if (e.built) continue;
      const base = e.L * LEVEL_H;
      const h = e.h || LEVEL_H;
      const bb = e.o === 0 ? B(e.i + 0.5, e.j) : B(e.i, e.j + 0.5);
      const t = 0.08;
      let x0, x1, z0, z1;
      if (e.o === 0) {
        x0 = e.i; x1 = e.i + 1; z0 = e.j - t; z1 = e.j + t;
      } else {
        x0 = e.i - t; x1 = e.i + t; z0 = e.j; z1 = e.j + 1;
      }
      const keys = e.o === 0 ? { nz: sideKey(e.sa), pz: sideKey(e.sb) } : { nx: sideKey(e.sa), px: sideKey(e.sb) };
      const cols = e.o === 0 ? { nz: sideCol(e.sa), pz: sideCol(e.sb) } : { nx: sideCol(e.sa), px: sideCol(e.sb) };
      const extCol = e.sa && e.sa.ext ? sideCol(e.sa) : e.sb && e.sb.ext ? sideCol(e.sb) : sideCol(e.sa);
      const extKey = e.sa && e.sa.ext ? sideKey(e.sa) : e.sb && e.sb.ext ? sideKey(e.sb) : sideKey(e.sa);
      const wallBox = (y0, y1, skipTop) => {
        bb.box(extKey, x0, y0, z0, x1, y1, z1, extCol, { keys: { ...keys, py: extKey, ny: extKey }, cols: { ...cols }, uv: TEX_SCALE[extKey] || 2, skip: { py: skipTop, px: e.o === 0, nx: e.o === 0, pz: e.o === 1, nz: e.o === 1, ...(e.o === 0 ? { nz: false, pz: false } : { nx: false, px: false }) } });
      };
      if (e.t === E.WALL) {
        wallBox(base, base + h, true);
      } else if (e.t === E.WINDOW) {
        const [ws, wt] = windowSpan(e);
        wallBox(base, base + ws, false);
        wallBox(base + wt, base + h, true);
        // telaio
        const fc = lin(e.shop ? 0x3a3f43 : 0xe8e4da);
        const fk = 'flat';
        if (e.o === 0) {
          bb.box(fk, x0, base + ws - 0.05, z0 - 0.05, x1, base + ws, z1 + 0.05, fc);
          bb.box(fk, x0, base + ws, z0, x0 + 0.06, base + wt, z1, fc);
          bb.box(fk, x1 - 0.06, base + ws, z0, x1, base + wt, z1, fc);
          bb.box(fk, x0, base + wt - 0.06, z0, x1, base + wt, z1, fc);
        } else {
          bb.box(fk, x0 - 0.05, base + ws - 0.05, z0, x1 + 0.05, base + ws, z1, fc);
          bb.box(fk, x0, base + ws, z0, x1, base + wt, z0 + 0.06, fc);
          bb.box(fk, x0, base + ws, z1 - 0.06, x1, base + wt, z1, fc);
          bb.box(fk, x0, base + wt - 0.06, z0, x1, base + wt, z1, fc);
        }
      } else if (e.t === E.DOOR || e.t === E.OPENING) {
        if (e.gate) {
          const pc = lin(0x7d8a90);
          if (e.o === 0) {
            bb.box('metal', x0 - 0.05, 0, e.j - 0.05, x0 + 0.05, 2.2, e.j + 0.05, pc);
            bb.box('metal', x1 - 0.05, 0, e.j - 0.05, x1 + 0.05, 2.2, e.j + 0.05, pc);
          } else {
            bb.box('metal', e.i - 0.05, 0, z0 - 0.05, e.i + 0.05, 2.2, z0 + 0.05, pc);
            bb.box('metal', e.i - 0.05, 0, z1 - 0.05, e.i + 0.05, 2.2, z1 + 0.05, pc);
          }
          continue;
        }
        const lt = e.garage ? 2.35 : 2.15;
        wallBox(base + lt, base + h, true);
        const fc = lin(e.mat === 'glass' ? 0x3a3f43 : 0xd8d0c0);
        if (e.o === 0) {
          bb.box('flat', x0, base, z0 - 0.02, x0 + 0.06, base + lt, z1 + 0.02, fc);
          bb.box('flat', x1 - 0.06, base, z0 - 0.02, x1, base + lt, z1 + 0.02, fc);
        } else {
          bb.box('flat', x0 - 0.02, base, z0, x1 + 0.02, base + lt, z0 + 0.06, fc);
          bb.box('flat', x0 - 0.02, base, z1 - 0.06, x1 + 0.02, base + lt, z1, fc);
        }
      } else if (e.t === E.RAILING) {
        const c = lin(0x8a6a4a);
        let st = null;
        if (e.L === 0) {
          const cells = g.edgeCells(e);
          st = g.stairAt(cells[0][0], cells[0][1]) || g.stairAt(cells[1][0], cells[1][1]);
        }
        const mx = e.o === 0 ? e.i + 0.5 : e.i, mz = e.o === 0 ? e.j : e.j + 0.5;
        const top = st ? g.rampY(st, mx, mz) : 0;
        if (st) {
          // fianco della scala: pannello fino alla rampa
          if (e.o === 0) bb.box('planks', x0, 0, e.j - 0.03, x1, top, e.j + 0.03, shadeCol(c, 0.9));
          else bb.box('planks', e.i - 0.03, 0, z0, e.i + 0.03, top, z1, shadeCol(c, 0.9));
        }
        const yb = base + top;
        if (e.o === 0) {
          bb.box('planks', x0, yb + 0.95, e.j - 0.03, x1, yb + 1.02, e.j + 0.03, c);
          bb.box('planks', x0, yb, e.j - 0.03, x0 + 0.06, yb + 1.0, e.j + 0.03, c);
        } else {
          bb.box('planks', e.i - 0.03, yb + 0.95, z0, e.i + 0.03, yb + 1.02, z1, c);
          bb.box('planks', e.i - 0.03, yb, z0, e.i + 0.03, yb + 1.0, z0 + 0.06, c);
        }
      } else if (e.t === E.FENCE) {
        this.fenceGeo(bb, e, lin(0xe6e0d0));
      } else if (e.t === E.HFENCE) {
        const pc = lin(0x7d8a90);
        if (e.o === 0) {
          bb.box('metal', x0 - 0.04, 0, e.j - 0.04, x0 + 0.04, 2.15, e.j + 0.04, pc);
          bb.box('metal', x0, 2.05, e.j - 0.02, x1, 2.1, e.j + 0.02, pc);
          bb.quad('chain', [[x0, 0, e.j], [x1, 0, e.j], [x1, 2.05, e.j], [x0, 2.05, e.j]], [0, 0, 1], [0, 0, 1.6, 0, 1.6, 3.3, 0, 3.3], WHITE);
        } else {
          bb.box('metal', e.i - 0.04, 0, z0 - 0.04, e.i + 0.04, 2.15, z0 + 0.04, pc);
          bb.box('metal', e.i - 0.02, 2.05, z0, e.i + 0.02, 2.1, z1, pc);
          bb.quad('chain', [[e.i, 0, z1], [e.i, 0, z0], [e.i, 2.05, z0], [e.i, 2.05, z1]], [1, 0, 0], [0, 0, 1.6, 0, 1.6, 3.3, 0, 3.3], WHITE);
        }
      }
    }
    // pilastrini d'angolo dove si incontrano i muri
    for (let L = 0; L < 2; L++) {
      for (let z = 0; z <= g.H; z++) {
        for (let x = 0; x <= g.W; x++) {
          const inc = [g.hEdge(L, x - 1, z), g.hEdge(L, x, z), g.vEdge(L, x, z - 1), g.vEdge(L, x, z)];
          let ref = null, n = 0, h = 0;
          for (const e of inc) {
            if (!e || e.built) continue;
            if (e.t === E.WALL || e.t === E.WINDOW || e.t === E.DOOR || e.t === E.OPENING) {
              if (e.gate) continue;
              n++;
              h = Math.max(h, e.h || LEVEL_H);
              if (!ref || (e.sa && e.sa.ext) || (e.sb && e.sb.ext)) ref = e;
            }
          }
          if (!n) continue;
          const st = ref.sa && ref.sa.ext ? ref.sa : ref.sb && ref.sb.ext ? ref.sb : ref.sa;
          const base = L * LEVEL_H;
          B(x, z).box(sideKey(st), x - 0.08, base, z - 0.08, x + 0.08, base + h, z + 0.08, sideCol(st), { uv: 2, skip: { py: true, ny: true } });
        }
      }
    }

    // ---- segnaletica orizzontale
    this.roadPaint(W, B);
    // ---- arredo urbano statico
    this.buildProps(W, B);

    // ---- crea le mesh
    for (const bld of builders) {
      if (bld.isEmpty()) continue;
      for (const [key, geo] of bld.build()) {
        const m = new THREE.Mesh(geo, this.mat(key));
        m.matrixAutoUpdate = false;
        m.updateMatrix();
        m.castShadow = q.shadows && CASTERS.has(key);
        m.receiveShadow = q.shadows;
        this.group.add(m);
      }
    }
    this.buildTrees(W);
    this.buildGrass(W);
    this.buildLamps(W);
  }

  fenceGeo(bb, e, col) {
    const c = col;
    if (e.o === 0) {
      const z = e.j;
      bb.box('planks', e.i - 0.05, 0, z - 0.05, e.i + 0.05, 1.1, z + 0.05, shadeCol(c, 0.9), { uv: 1 });
      bb.box('planks', e.i, 0.35, z - 0.02, e.i + 1, 0.43, z + 0.02, c, { uv: 1 });
      bb.box('planks', e.i, 0.8, z - 0.02, e.i + 1, 0.88, z + 0.02, c, { uv: 1 });
      for (let k = 0; k < 4; k++) {
        const x = e.i + 0.12 + k * 0.25;
        bb.box('planks', x - 0.04, 0.05, z - 0.03, x + 0.04, 1.0, z + 0.03, c, { uv: 1, skip: { ny: true } });
      }
    } else {
      const x = e.i;
      bb.box('planks', x - 0.05, 0, e.j - 0.05, x + 0.05, 1.1, e.j + 0.05, shadeCol(c, 0.9), { uv: 1 });
      bb.box('planks', x - 0.02, 0.35, e.j, x + 0.02, 0.43, e.j + 1, c, { uv: 1 });
      bb.box('planks', x - 0.02, 0.8, e.j, x + 0.02, 0.88, e.j + 1, c, { uv: 1 });
      for (let k = 0; k < 4; k++) {
        const z = e.j + 0.12 + k * 0.25;
        bb.box('planks', x - 0.03, 0.05, z - 0.04, x + 0.03, 1.0, z + 0.04, c, { uv: 1, skip: { ny: true } });
      }
    }
  }

  buildRoof(W, b, bb) {
    const H = b.wallH || b.floors * LEVEL_H;
    const x0 = b.i0, x1 = b.i0 + b.w, z0 = b.j0, z1 = b.j0 + b.d;
    const rc = lin(b.roofCol);
    const ec = lin(b.ext.col);
    const ek = b.ext.tex;
    if (b.roof === 'gable') {
      const ov = 0.4, slope = 0.5;
      if (b.ridge === 'x') {
        const zm = (z0 + z1) / 2, span = (z1 - z0) / 2;
        const yr = H + span * slope, ye = H - ov * slope;
        const X0 = x0 - ov, X1 = x1 + ov;
        bb.quadAuto('roof', [[X0, ye, z0 - ov], [X0, yr, zm], [X1, yr, zm], [X1, ye, z0 - ov]], rc, 1.5);
        bb.quadAuto('roof', [[X1, ye, z1 + ov], [X1, yr, zm], [X0, yr, zm], [X0, ye, z1 + ov]], shadeCol(rc, 0.9), 1.5);
        bb.tri(ek, [[x0, H, z1], [x0, yr, zm], [x0, H, z0]], [-1, 0, 0], [z1 / 2, H / 2, zm / 2, yr / 2, z0 / 2, H / 2], shadeCol(ec, 0.86));
        bb.tri(ek, [[x1, H, z0], [x1, yr, zm], [x1, H, z1]], [1, 0, 0], [z0 / 2, H / 2, zm / 2, yr / 2, z1 / 2, H / 2], shadeCol(ec, 0.86));
        bb.box('flat', X0, yr - 0.05, zm - 0.12, X1, yr + 0.08, zm + 0.12, shadeCol(rc, 0.7));
      } else {
        const xm = (x0 + x1) / 2, span = (x1 - x0) / 2;
        const yr = H + span * slope, ye = H - ov * slope;
        const Z0 = z0 - ov, Z1 = z1 + ov;
        bb.quadAuto('roof', [[x0 - ov, ye, Z1], [xm, yr, Z1], [xm, yr, Z0], [x0 - ov, ye, Z0]], rc, 1.5);
        bb.quadAuto('roof', [[x1 + ov, ye, Z0], [xm, yr, Z0], [xm, yr, Z1], [x1 + ov, ye, Z1]], shadeCol(rc, 0.9), 1.5);
        bb.tri(ek, [[x0, H, z0], [xm, yr, z0], [x1, H, z0]], [0, 0, -1], [x0 / 2, H / 2, xm / 2, yr / 2, x1 / 2, H / 2], shadeCol(ec, 0.93));
        bb.tri(ek, [[x1, H, z1], [xm, yr, z1], [x0, H, z1]], [0, 0, 1], [x1 / 2, H / 2, xm / 2, yr / 2, x0 / 2, H / 2], shadeCol(ec, 0.93));
        bb.box('flat', xm - 0.12, yr - 0.05, Z0, xm + 0.12, yr + 0.08, Z1, shadeCol(rc, 0.7));
      }
    } else {
      bb.box('roof_flat', x0 - 0.08, H, z0 - 0.08, x1 + 0.08, H + 0.12, z1 + 0.08, lin(0x8a8a86), { uv: 3, skip: { ny: true } });
      const t = 0.18, ph = 0.55;
      bb.box(ek, x0 - 0.1, H, z0 - 0.1, x1 + 0.1, H + ph, z0 - 0.1 + t, ec, { uv: 2, skip: { ny: true } });
      bb.box(ek, x0 - 0.1, H, z1 + 0.1 - t, x1 + 0.1, H + ph, z1 + 0.1, ec, { uv: 2, skip: { ny: true } });
      bb.box(ek, x0 - 0.1, H, z0 - 0.1, x0 - 0.1 + t, H + ph, z1 + 0.1, ec, { uv: 2, skip: { ny: true } });
      bb.box(ek, x1 + 0.1 - t, H, z0 - 0.1, x1 + 0.1, H + ph, z1 + 0.1, ec, { uv: 2, skip: { ny: true } });
      // macchine sul tetto per i negozi grandi
      if (b.w > 14) {
        bb.box('metal', x0 + 3, H + 0.12, z0 + 2, x0 + 5, H + 1.2, z0 + 3.4, lin(0xa8acaa));
        bb.box('metal', x1 - 6, H + 0.12, z0 + 3, x1 - 4.5, H + 0.9, z0 + 4, lin(0x9aa0a0));
      }
    }
  }

  buildSign(W, b) {
    // sopra la porta d'ingresso principale, sul lato esterno del muro
    const d = b.extDoors.find((x) => x.kind === 'glass' || x.kind === 'front') || b.extDoors[0];
    if (!d) return;
    const [ii, ij] = d.inside, [oi, oj] = d.outside;
    const dx = oi - ii, dz = oj - ij;
    const tex = textTexture(b.sign.text, { fg: b.sign.col, bg: '#16191a', w: 512, h: 128 });
    const glow = !!b.sign.glow;
    const mat = new THREE.MeshLambertMaterial({ map: tex, emissive: glow ? 0xffffff : 0x000000, emissiveMap: glow ? tex : null, emissiveIntensity: glow ? 0.9 : 0 });
    const len = Math.min(6, Math.max(2.4, b.sign.text.length * 0.42));
    const geo = new THREE.PlaneGeometry(len, len / 4);
    const m = new THREE.Mesh(geo, mat);
    const ex = (ii + oi + 1) / 2, ez = (ij + oj + 1) / 2;
    m.position.set(ex + dx * 0.12, (b.wallH || 3) - 0.45, ez + dz * 0.12);
    m.rotation.y = Math.atan2(dx, dz);
    m.userData.glow = glow;
    this.signs.push(m);
    this.group.add(m);
  }

  setPower(on) {
    this.power = on;
    for (const s of this.signs) {
      if (!s.userData.glow) continue;
      s.material.emissiveIntensity = on ? 0.9 : 0;
    }
    this.applyLamps();
  }
  // i lampioni si accendono al tramonto, finché c'è corrente
  setDark(dark) {
    if (dark === this.dark) return;
    this.dark = dark;
    this.applyLamps();
  }
  applyLamps() {
    if (!this.lampHeads) return;
    const on = this.power !== false && !!this.dark;
    this.lampHeads.material.color.setHex(on ? 0xffd9a0 : 0x2a2a28);
    this.lampPools.visible = on;
  }

  roadPaint(W, B) {
    const P = (x0, z0, x1, z1) => B((x0 + x1) / 2, (z0 + z1) / 2).quad('paint', [[x0, 0.006, z1], [x1, 0.006, z1], [x1, 0.006, z0], [x0, 0.006, z0]], [0, 1, 0], [0, 0, 1, 0, 1, 1, 0, 1], WHITE);
    // linee di mezzeria tratteggiate
    for (let x = 6; x < 138; x += 4) if (Math.abs(x + 1 - 70) > 6) P(x, 69.94, x + 2, 70.06);
    for (let z = 6; z < 138; z += 4) if (Math.abs(z + 1 - 70) > 6) P(69.94, z, 70.06, z + 2);
    for (let x = 6; x < 64; x += 4) P(x, 106.94, x + 2, 107.06);
    for (let x = 77; x < 137; x += 4) P(x, 123.94, x + 2, 124.06);
    // strisce pedonali all'incrocio
    for (let k = 0; k < 5; k++) {
      P(63.5, 68.2 + k * 0.9, 65.5, 68.6 + k * 0.9);
      P(75.5, 68.2 + k * 0.9, 77.5, 68.6 + k * 0.9);
      P(68.2 + k * 0.9, 63.5, 68.6 + k * 0.9, 65.5);
      P(68.2 + k * 0.9, 75.5, 68.6 + k * 0.9, 77.5);
    }
    // stalli del parcheggio
    for (let x = 90; x <= 118; x += 3) {
      P(x, 43, x + 0.1, 48);
      P(x, 51, x + 0.1, 56);
    }
    // campo da basket
    P(94, 100, 102, 100.1); P(94, 111.9, 102, 112); P(94, 100, 94.1, 112); P(101.9, 100, 102, 112); P(94, 105.95, 102, 106.05);
  }

  buildProps(W, B) {
    for (const p of W.props) {
      if (p.type === 'canopy') {
        const bb = B((p.x0 + p.x1) / 2, (p.z0 + p.z1) / 2);
        bb.box('roof_flat', p.x0, p.h, p.z0, p.x1, p.h + 0.35, p.z1, lin(0xd8d8d0), { uv: 3 });
        bb.box('flat', p.x0, p.h + 0.05, p.z0 - 0.02, p.x1, p.h + 0.3, p.z0, lin(0xc0392b));
        bb.box('flat', p.x0, p.h + 0.05, p.z1, p.x1, p.h + 0.3, p.z1 + 0.02, lin(0xc0392b));
        for (const [x, z] of [[p.x0 + 1, p.z0 + 1], [p.x1 - 1, p.z0 + 1], [p.x0 + 1, p.z1 - 1], [p.x1 - 1, p.z1 - 1]]) {
          bb.box('metal', x - 0.15, 0, z - 0.15, x + 0.15, p.h, z + 0.15, lin(0xc8c8c0));
        }
      } else if (p.type === 'scaffold') {
        const bb = B(p.x0, p.z0);
        for (let x = p.x0; x <= p.x1; x += 1.5) {
          bb.box('metal', x - 0.03, 0, p.z0 - 0.03, x + 0.03, 4, p.z0 + 0.03, lin(0x9aa0a0));
          bb.box('metal', x - 0.03, 0, p.z1 - 0.03, x + 0.03, 4, p.z1 + 0.03, lin(0x9aa0a0));
        }
        for (const y of [1.3, 2.6, 3.9]) {
          bb.box('planks', p.x0, y, p.z0, p.x1, y + 0.05, p.z1, lin(0xa8885a));
          bb.box('metal', p.x0, y + 0.9, p.z0 - 0.03, p.x1, y + 0.95, p.z0 + 0.03, lin(0x9aa0a0));
        }
      } else if (p.type === 'barrier') {
        const bb = B(p.x0, p.z0);
        const alongX = p.x1 - p.x0 > p.z1 - p.z0;
        const len = alongX ? p.x1 - p.x0 : p.z1 - p.z0;
        for (let k = 0; k < len; k += 2) {
          if (alongX) bb.box('concrete', p.x0 + k + 0.05, 0, p.z0 + 0.6, p.x0 + k + 1.95, 0.9, p.z0 + 1.4, lin(0xb8b4a8), { uv: 2 });
          else bb.box('concrete', p.x0 + 0.6, 0, p.z0 + k + 0.05, p.x0 + 1.4, 0.9, p.z0 + k + 1.95, lin(0xb8b4a8), { uv: 2 });
        }
        // rete militare alta
        if (alongX) bb.quad('chain', [[p.x0, 0.9, p.z0 + 1], [p.x1, 0.9, p.z0 + 1], [p.x1, 3, p.z0 + 1], [p.x0, 3, p.z0 + 1]], [0, 0, 1], [0, 0, len / 0.6, 0, len / 0.6, 3.4, 0, 3.4], WHITE);
        else bb.quad('chain', [[p.x0 + 1, 0.9, p.z1], [p.x0 + 1, 0.9, p.z0], [p.x0 + 1, 3, p.z0], [p.x0 + 1, 3, p.z1]], [1, 0, 0], [0, 0, len / 0.6, 0, len / 0.6, 3.4, 0, 3.4], WHITE);
      } else if (p.type === 'qsign') {
        const tex = textTexture('ZONA DI QUARANTENA\nDIVIETO DI TRANSITO', { fg: '#1c1c1a', bg: '#e6c13a', border: '#1c1c1a', w: 512, h: 256 });
        const m = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.1), new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide }));
        m.position.set(p.x, 2.2, p.z);
        m.rotation.y = p.rot;
        this.group.add(m);
        this.signs.push(m);
        B(p.x, p.z).box('metal', p.x - 0.05, 0, p.z - 0.05, p.x + 0.05, 1.7, p.z + 0.05, lin(0x7d8a90));
      } else if (p.type === 'lamp') {
        const bb = B(p.x, p.z);
        bb.box('metal', p.x - 0.07, 0, p.z - 0.07, p.x + 0.07, 5.6, p.z + 0.07, lin(0x4a5054));
      }
    }
  }

  buildLamps(W) {
    const lamps = W.props.filter((p) => p.type === 'lamp');
    const headGeo = new THREE.BoxGeometry(0.5, 0.16, 0.9);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, fog: true });
    const heads = new THREE.InstancedMesh(headGeo, headMat, lamps.length);
    const poolTex = (() => {
      const c = document.createElement('canvas');
      c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const gr = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(255,214,150,0.55)');
      gr.addColorStop(0.5, 'rgba(255,200,130,0.18)');
      gr.addColorStop(1, 'rgba(255,190,120,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, 64, 64);
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      return t;
    })();
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
    const poolGeo = new THREE.PlaneGeometry(9, 9);
    poolGeo.rotateX(-Math.PI / 2);
    const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
    const m = new THREE.Matrix4();
    const qn = new THREE.Quaternion();
    lamps.forEach((p, k) => {
      const hx = p.x + Math.sin(p.rot) * 0.9, hz = p.z + Math.cos(p.rot) * 0.9;
      qn.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rot);
      m.compose(new THREE.Vector3(hx, 5.55, hz), qn, new THREE.Vector3(1, 1, 1));
      heads.setMatrixAt(k, m);
      m.compose(new THREE.Vector3(hx, 0.13, hz), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
      pools.setMatrixAt(k, m);
    });
    const arms = new GeoBuilder();
    for (const p of lamps) {
      const hx = p.x + Math.sin(p.rot) * 0.45, hz = p.z + Math.cos(p.rot) * 0.45;
      arms.rbox('metal', hx, 5.5, hz, 0.04, 5.6, 0.5, p.rot, lin(0x4a5054));
    }
    for (const geo of arms.build().values()) this.group.add(new THREE.Mesh(geo, this.mat('metal')));
    pools.renderOrder = 2;
    this.lampHeads = heads;
    this.lampPools = pools;
    this.group.add(heads, pools);
    this.lampPositions = lamps.map((p) => ({ x: p.x + Math.sin(p.rot) * 0.9, z: p.z + Math.cos(p.rot) * 0.9 }));
  }

  buildTrees(W) {
    const q = this.quality;
    const pines = W.trees.filter((t) => t.kind === 'pine');
    const oaks = W.trees.filter((t) => t.kind !== 'pine');
    const trunkGeo = new THREE.CylinderGeometry(0.1, 0.16, 1.6, 6);
    trunkGeo.translate(0, 0.8, 0);
    const oakTrunkGeo = new THREE.CylinderGeometry(0.13, 0.2, 2.6, 6);
    oakTrunkGeo.translate(0, 1.3, 0);
    const pineGeo = (() => {
      const a = new THREE.ConeGeometry(1.5, 2.6, 7);
      a.translate(0, 2.4, 0);
      const b = new THREE.ConeGeometry(1.1, 2.2, 7);
      b.translate(0, 3.7, 0);
      const c = new THREE.ConeGeometry(0.7, 1.6, 7);
      c.translate(0, 4.8, 0);
      return mergeNonIndexed([a, b, c]);
    })();
    const oakGeo = (() => {
      const a = new THREE.IcosahedronGeometry(1.7, 1);
      a.scale(1, 0.85, 1);
      a.translate(0, 3.4, 0);
      const b = new THREE.IcosahedronGeometry(1.1, 0);
      b.translate(0.9, 3.1, 0.4);
      return mergeNonIndexed([a, b]);
    })();
    const leafMat = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const barkMat = new THREE.MeshLambertMaterial({ color: 0x5a4632 });
    const mk = (geo, mat, list, colFn) => {
      const im = new THREE.InstancedMesh(geo, mat, list.length);
      const m = new THREE.Matrix4();
      const qq = new THREE.Quaternion();
      const col = new THREE.Color();
      list.forEach((t, k) => {
        qq.setFromAxisAngle(new THREE.Vector3(0, 1, 0), (t.x * 13.1 + t.z * 7.7) % 6.28);
        m.compose(new THREE.Vector3(t.x, 0, t.z), qq, new THREE.Vector3(t.s, t.s * (0.9 + ((t.x * 3.3) % 0.3)), t.s));
        im.setMatrixAt(k, m);
        if (colFn) {
          colFn(t, col);
          im.setColorAt(k, col);
        }
      });
      im.castShadow = q.shadows && q.shadowSize >= 2048;
      im.receiveShadow = false;
      return im;
    };
    const pineCol = (t, c) => c.setHSL(0.28 + ((t.x * 7.3) % 0.05), 0.35, 0.18 + ((t.z * 3.1) % 0.06));
    const oakCol = (t, c) => c.setHSL(0.22 + ((t.x * 5.7) % 0.07), 0.38, 0.22 + ((t.z * 2.3) % 0.08));
    this.group.add(mk(trunkGeo, barkMat, pines), mk(pineGeo, leafMat, pines, pineCol), mk(oakTrunkGeo, barkMat, oaks), mk(oakGeo, leafMat, oaks, oakCol));
    // cespugli
    const bushes = W.props.filter((p) => p.type === 'bush');
    const bushGeo = new THREE.IcosahedronGeometry(0.75, 1);
    bushGeo.scale(1, 0.75, 1);
    bushGeo.translate(0, 0.45, 0);
    const bm = mk(bushGeo, leafMat, bushes.map((b) => ({ x: b.x, z: b.z, s: b.s })), (t, c) => c.setHSL(0.27, 0.4, 0.2 + ((t.x * 3.7) % 0.07)));
    this.group.add(bm);
  }

  buildGrass(W) {
    const g = W.grid;
    const q = this.quality;
    const geo = new THREE.BufferGeometry();
    const pos = [], uv = [], nrm = [];
    // due facce per lato con la normale verso l'alto: con DoubleSide il retro verrebbe nero
    for (const a of [0, Math.PI / 2]) {
      const c = Math.cos(a) * 0.35, s = Math.sin(a) * 0.35;
      pos.push(-c, 0, -s, c, 0, s, c, 0.5, s, -c, 0, -s, c, 0.5, s, -c, 0.5, -s);
      uv.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1);
      pos.push(-c, 0, -s, c, 0.5, s, c, 0, s, -c, 0, -s, -c, 0.5, -s, c, 0.5, s);
      uv.push(0, 0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1);
      for (let k = 0; k < 12; k++) nrm.push(0, 1, 0);
    }
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    const mat = new THREE.MeshLambertMaterial({ map: this.tex.tuft, alphaTest: 0.4, transparent: false });
    const spotsG = [], spotsW = [];
    let seed = 1234567;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) / 4294967296);
    let tries = 0;
    while (spotsG.length < q.grass && tries++ < q.grass * 8) {
      const i = Math.floor(rnd() * g.W), j = Math.floor(rnd() * g.H);
      const k = g.idx(i, j);
      const f = g.lv[0].floor[k];
      if ((f === F.GRASS || f === F.FIELD || f === F.DIRT) && !g.block[k] && g.bld[k] < 0) spotsG.push([i + rnd(), j + rnd(), 0.6 + rnd() * 0.8]);
    }
    tries = 0;
    while (spotsW.length < q.grass / 2 && tries++ < q.grass * 8) {
      const i = Math.floor(rnd() * g.W), j = Math.floor(rnd() * g.H);
      const k = g.idx(i, j);
      const f = g.lv[0].floor[k];
      if ((f === F.SIDEWALK || f === F.ASPHALT || f === F.PARKING || f === F.CONCRETE || f === F.GRAVEL) && !g.block[k]) spotsW.push([i + rnd(), j + rnd(), 0.5 + rnd() * 0.7, FLOOR_INFO[f].y]);
    }
    const mkIM = (spots) => {
      const im = new THREE.InstancedMesh(geo, mat, spots.length);
      im.userData.spots = spots;
      return im;
    };
    this.grass = mkIM(spotsG);
    this.weeds = mkIM(spotsW);
    this.setGrowth(0);
    this.group.add(this.grass, this.weeds);
  }

  // l'erba cresce col passare dei giorni (mondo che decade)
  setGrowth(days) {
    const m = new THREE.Matrix4();
    const qq = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);
    const gG = 1 + Math.min(1.6, days * 0.08);
    const gW = Math.max(0.001, Math.min(1.3, (days - 2) * 0.1));
    const apply = (im, growth, isW) => {
      im.userData.spots.forEach((sp, k) => {
        qq.setFromAxisAngle(up, (sp[0] * 17.3) % 6.28);
        const s = sp[2] * growth;
        m.compose(new THREE.Vector3(sp[0], isW ? sp[3] : 0, sp[1]), qq, new THREE.Vector3(s, s, s));
        im.setMatrixAt(k, m);
      });
      im.instanceMatrix.needsUpdate = true;
      im.computeBoundingSphere();
    };
    apply(this.grass, gG, false);
    apply(this.weeds, gW, true);
    this.weeds.visible = days > 2;
  }
}

function mergeNonIndexed(geos) {
  const parts = geos.map((g) => (g.index ? g.toNonIndexed() : g));
  let n = 0;
  for (const p of parts) n += p.attributes.position.count;
  const pos = new Float32Array(n * 3);
  let o = 0;
  for (const p of parts) {
    pos.set(p.attributes.position.array, o);
    o += p.attributes.position.array.length;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.computeVertexNormals();
  return geo;
}
