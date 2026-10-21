// Generatore di Montesordo: una mappa piccola ma densa con quattro zone (periferia, commerciale,
// residenziale, servizi). Il layout è fisso, i dettagli (piante specchiate, mobili, bottino, auto,
// zombie) dipendono dalla seed, così lo stesso mondo si rigenera identico dai salvataggi.
import { Grid, F, E, ST, BLK } from './grid.js';
import { TPL, ROOM_TYPES } from './templates.js';
import { RNG, hashSeed } from '../core/rng.js';
import { MAP_W, MAP_H, worldValue } from '../config.js';
import { FURN } from '../data/furniture.js';

export const DIRS = [[0, 1], [1, 0], [0, -1], [-1, 0]]; // S, E, N, O (direzione verso cui guarda il fronte)

const EXT_STYLES = [
  { tex: 'plaster', col: 0xd9cdb4 }, { tex: 'plaster', col: 0xc9b79a }, { tex: 'plaster', col: 0xe0d6c2 },
  { tex: 'plaster', col: 0xb9a58a }, { tex: 'brick', col: 0xa86a4c }, { tex: 'brick', col: 0x9a5a3e },
  { tex: 'plaster', col: 0xc8c2b0 }, { tex: 'stone', col: 0xa29d92 },
];
const ROOF_COLS = [0x6e3b2a, 0x5a3a30, 0x4a4a4e, 0x7a4632, 0x3f3f44];
const ROOM_COLS = {
  living: [0xe6dccb, 0xd9cdb6, 0xcfd4c6, 0xe3d3bd],
  kitchen: [0xe8e2d2, 0xd8dccf, 0xe9dfc8],
  bedroom: [0xd4c8d6, 0xc8d2dc, 0xdcd0c0, 0xcfd9c9],
  bathroom: [0xd7e2e6, 0xe2e6e2, 0xcad8dc],
  default: [0xd8d2c4, 0xcfcab9, 0xdcd8cc],
  shop: [0xe4e2dc, 0xdedcd0],
  clinic: [0xdfe8e4, 0xe6ece8],
  school: [0xe0d8b8, 0xd8dcc8, 0xe8dcc0],
  industrial: [0xb8b4ac, 0xa8a69e],
};

export function generateWorld(settings) {
  const seed = settings.seed >>> 0;
  const rng = new RNG(hashSeed('montesordo', seed));
  const grid = new Grid(MAP_W, MAP_H);
  const W = {
    seed, grid, rng,
    buildings: [], rooms: [], furn: [], cars: [], trees: [], props: [], groundInit: [], barrows: [],
    zombieSpawns: [], labels: [], lots: [], playerSpawn: null, signs: [], crops: [],
  };
  grid.furnRef = W.furn;

  paintBase(W);
  paintRoads(W);
  layoutTown(W);
  plantVegetation(W);
  placeCars(W);
  placeStreetProps(W);
  spawnZombies(W, settings);
  return W;
}

// ---------------------------------------------------------------- terreno e zone
function zoneOf(i, j) {
  if (j < 70) return i < 70 ? 0 : 1; // NO periferia, NE commerciale
  return i < 70 ? 2 : 3; // SO residenziale, SE servizi
}

function paintBase(W) {
  const g = W.grid;
  for (let j = 0; j < g.H; j++) {
    for (let i = 0; i < g.W; i++) {
      const k = g.idx(i, j);
      g.zone[k] = zoneOf(i, j);
      const border = i < 5 || j < 5 || i >= g.W - 5 || j >= g.H - 5;
      if (border) {
        g.lv[0].floor[k] = F.FOREST;
        g.block[k] = BLK.FOREST;
      }
    }
  }
}

function rect(g, i0, j0, i1, j1, fn) {
  for (let j = Math.max(0, j0); j <= Math.min(g.H - 1, j1); j++)
    for (let i = Math.max(0, i0); i <= Math.min(g.W - 1, i1); i++) fn(g.idx(i, j), i, j);
}
function paint(g, i0, j0, i1, j1, f, opt = {}) {
  rect(g, i0, j0, i1, j1, (k) => {
    if (opt.keepForest && g.lv[0].floor[k] === F.FOREST) return;
    g.lv[0].floor[k] = f;
    if (opt.clear) g.block[k] = 0;
  });
}

function paintRoads(W) {
  const g = W.grid;
  // marciapiedi prima, asfalto sopra (agli incroci vince l'asfalto)
  paint(g, 3, 66, 140, 74, F.SIDEWALK, { clear: true }); // Via Roma (est-ovest)
  paint(g, 66, 3, 74, 140, F.SIDEWALK, { clear: true }); // Corso Garibaldi (nord-sud)
  paint(g, 5, 104, 65, 110, F.SIDEWALK, { clear: true }); // Via dei Tigli
  paint(g, 75, 121, 138, 127, F.SIDEWALK, { clear: true }); // Via delle Scuole
  paint(g, 3, 68, 140, 72, F.ASPHALT, { clear: true });
  paint(g, 68, 3, 72, 140, F.ASPHALT, { clear: true });
  paint(g, 5, 105, 67, 109, F.ASPHALT, { clear: true });
  paint(g, 73, 122, 138, 126, F.ASPHALT, { clear: true });
  // strada sterrata verso la cascina
  paint(g, 30, 3, 33, 65, F.GRAVEL, { clear: true });
  // parcheggio del supermercato
  paint(g, 88, 41, 120, 65, F.PARKING);
  // piazzale del capannone, area del distributore, piazzale della ferramenta
  paint(g, 6, 44, 29, 65, F.CONCRETE);
  paint(g, 42, 47, 64, 65, F.CONCRETE);
  paint(g, 121, 47, 138, 65, F.CONCRETE);
  // cortile di carico dietro il supermercato
  paint(g, 90, 6, 132, 20, F.CONCRETE);
  // striscia davanti ai negozi
  paint(g, 75, 30, 77, 65, F.CONCRETE);
  // piazzale davanti a farmacia e ambulatorio
  paint(g, 75, 75, 112, 76, F.CONCRETE);
  // campi coltivati della cascina
  paint(g, 6, 19, 28, 40, F.FIELD);
  paint(g, 8, 16, 30, 18, F.DIRT);
  // cortile della scuola con campo da basket
  paint(g, 92, 94, 103, 118, F.CONCRETE);
  paint(g, 94, 100, 102, 112, F.COURT);
  // cantiere
  paint(g, 38, 16, 62, 42, F.GRAVEL);

  W.labels.push(
    { x: 30, z: 70, text: 'Via Roma' }, { x: 110, z: 70, text: 'Via Roma' },
    { x: 70, z: 30, text: 'Corso Garibaldi', v: true }, { x: 70, z: 110, text: 'Corso Garibaldi', v: true },
    { x: 36, z: 107, text: 'Via dei Tigli' }, { x: 106, z: 124, text: 'Via delle Scuole' },
    { x: 31.5, z: 30, text: 'Strada della cascina', v: true },
  );
}

// ---------------------------------------------------------------- edifici
function mkXform(tpl, x0, z0, orient, mirror) {
  return (lx, lz) => {
    let x = mirror ? tpl.w - 1 - lx : lx;
    let z = lz;
    if (orient === 'N') z = tpl.d - 1 - z;
    if (orient === 'E') return [x0 + z, z0 + x];
    if (orient === 'W') return [x0 + (tpl.d - 1 - z), z0 + x];
    return [x0 + x, z0 + z];
  };
}

function newRoom(W, b, L, type) {
  const rt = ROOM_TYPES[type];
  const palKey = ROOM_COLS[type] ? type : b.kind === 'house' ? 'default' : b.palette;
  const pal = ROOM_COLS[palKey] || ROOM_COLS.default;
  const r = {
    id: W.rooms.length, bld: b.id, L, type, n: rt.n, cells: [],
    wall: { tex: type === 'bathroom' || type === 'kitchen_big' || type === 'wc' ? 'tile' : 'plaster', col: W.rng.pick(pal) },
    floor: F[rt.floor], win: rt.win,
  };
  W.rooms.push(r);
  b.rooms.push(r.id);
  return r;
}

export function placeBuilding(W, tplKey, x0, z0, orient, mirror, meta) {
  const g = W.grid, rng = W.rng;
  const tpl = TPL[tplKey];
  const X = mkXform(tpl, x0, z0, orient, mirror);
  const tr = orient === 'E' || orient === 'W';
  const b = {
    id: W.buildings.length, tpl: tplKey, name: meta.name, kind: meta.kind, palette: meta.palette || 'default',
    i0: x0, j0: z0, w: tr ? tpl.d : tpl.w, d: tr ? tpl.w : tpl.d, floors: tpl.floors, roof: tpl.roof,
    ridge: null, orient, mirror, rooms: [], doors: [], windows: [], extDoors: [],
    ext: meta.ext || rng.pick(EXT_STYLES), roofCol: rng.pick(ROOF_COLS), h: (tpl.tall || 3) * 1,
    zone: zoneOf(x0 + 1, z0 + 1), sign: meta.sign || null, home: !!meta.home, stairs: [],
  };
  if (tpl.tall) b.wallH = tpl.tall;
  b.ridge = b.w >= b.d ? 'x' : 'z';
  W.buildings.push(b);
  const roomAt = [new Map(), new Map()];
  const levels = tpl.floors === 2 ? [0, 1] : [0];
  for (const L of levels) {
    const rows = tpl['L' + L];
    const types = tpl['types' + L];
    const byChar = {};
    for (let lz = 0; lz < tpl.d; lz++) {
      for (let lx = 0; lx < tpl.w; lx++) {
        const ch = rows[lz][lx];
        if (ch === '.') continue;
        if (!byChar[ch]) byChar[ch] = newRoom(W, b, L, types[ch]);
        const r = byChar[ch];
        const [i, j] = X(lx, lz);
        const k = g.idx(i, j);
        g.lv[L].room[k] = r.id;
        g.lv[L].floor[k] = r.floor;
        if (L === 0) {
          g.bld[k] = b.id;
          g.block[k] = 0;
        }
        r.cells.push([i, j]);
        roomAt[L].set(k, r.id);
      }
    }
  }
  // muri tra stanze diverse e verso l'esterno
  const styleOf = (L, i, j) => {
    const rid = g.inb(i, j) ? g.lv[L].room[g.idx(i, j)] : -1;
    if (rid >= 0 && W.rooms[rid].bld === b.id) return W.rooms[rid].wall;
    return { tex: b.ext.tex, col: b.ext.col, ext: true };
  };
  for (const L of levels) {
    for (const rid of b.rooms) {
      const r = W.rooms[rid];
      if (r.L !== L) continue;
      for (const [i, j] of r.cells) {
        for (const [dx, dz] of DIRS) {
          const ni = i + dx, nj = j + dz;
          const nr = g.inb(ni, nj) ? g.lv[L].room[g.idx(ni, nj)] : -1;
          if (nr === r.id) continue;
          const s = g.edgeSlot(i, j, ni, nj);
          const existing = s.o === 0 ? g.hId(L, s.i, s.j) : g.vId(L, s.i, s.j);
          if (existing) continue;
          const ext = nr < 0 || W.rooms[nr].bld !== b.id;
          const [ai, aj] = s.o === 0 ? [s.i, s.j - 1] : [s.i - 1, s.j];
          const [bi, bj] = s.o === 0 ? [s.i, s.j] : [s.i, s.j];
          g.setEdge(L, s.o, s.i, s.j, {
            t: E.WALL, mat: ext ? b.ext.tex : 'plaster', ext, bld: b.id,
            sa: styleOf(L, ai, aj), sb: styleOf(L, bi, bj), h: L === 0 && b.wallH ? b.wallH : 3,
          });
        }
      }
    }
  }
  // porte interne e aperture
  for (const d of tpl.doors) {
    const [L, x1, z1, x2, z2, kind] = d;
    const [i1, j1] = X(x1, z1);
    const [i2, j2] = X(x2, z2);
    const old = g.edgeBetween(L, i1, j1, i2, j2);
    const sa = old ? old.sa : null, sb = old ? old.sb : null;
    if (kind === 'open') {
      g.setEdgeBetween(L, i1, j1, i2, j2, { t: E.OPENING, mat: 'plaster', sa, sb, bld: b.id });
    } else {
      const e = g.setEdgeBetween(L, i1, j1, i2, j2, {
        t: E.DOOR, mat: 'wood', hp: 50, maxHp: 50, st: rng.chance(0.55) ? ST.OPEN : ST.CLOSED, sa, sb, bld: b.id, swing: rng.sign(),
      });
      b.doors.push(e.id);
    }
  }
  // porte verso l'esterno
  for (const d of tpl.ext) {
    const [L, x1, z1, x2, z2, kind] = d;
    const [i1, j1] = X(x1, z1);
    const [i2, j2] = X(x2, z2);
    const old = g.edgeBetween(L, i1, j1, i2, j2);
    const mat = kind === 'glass' ? 'glass' : kind === 'metal' || kind === 'garage' ? 'metal' : 'wood';
    const hp = mat === 'glass' ? 10 : mat === 'metal' ? 140 : 70;
    const openP = b.kind === 'house' ? 0.12 : mat === 'glass' ? 0.2 : 0.1;
    const e = g.setEdgeBetween(L, i1, j1, i2, j2, {
      t: E.DOOR, mat, hp, maxHp: hp, st: rng.chance(openP) ? ST.OPEN : ST.CLOSED, ext: true,
      sa: old ? old.sa : null, sb: old ? old.sb : null, bld: b.id, front: kind === 'front' || kind === 'glass', swing: rng.sign(), garage: kind === 'garage',
    });
    if (mat === 'glass' && rng.chance(0.15)) e.st = ST.BROKEN;
    b.extDoors.push({ e: e.id, inside: [i1, j1], outside: [i2, j2], kind });
  }
  // scale
  if (tpl.stairs) {
    const cells = tpl.stairs.cells.map(([x, z]) => X(x, z));
    const top = X(tpl.stairs.top[0], tpl.stairs.top[1]);
    const [bi, bj] = cells[0];
    const [li, lj] = cells[cells.length - 1];
    const len = cells.length;
    const dx = Math.sign(li - bi), dz = Math.sign(lj - bj);
    const cx = bi + 0.5 - dx * 0.5, cz = bj + 0.5 - dz * 0.5;
    const s = { id: g.stairs.length, cells, top, dx, dz, len, e0: cx * dx + cz * dz, removed: false, rope: false, bld: b.id };
    g.stairs.push(s);
    b.stairs.push(s.id);
    for (const [i, j] of cells) {
      g.stairCell[g.idx(i, j)] = s.id;
      g.lv[1].floor[g.idx(i, j)] = F.NONE;
    }
    for (const rl of tpl.rails || []) {
      const [L, x1, z1, x2, z2] = rl;
      const [i1, j1] = X(x1, z1);
      const [i2, j2] = X(x2, z2);
      g.setEdgeBetween(L, i1, j1, i2, j2, { t: E.RAILING, mat: 'wood', bld: b.id });
    }
  }
  // finestre sui muri esterni
  for (const rid of b.rooms) {
    const r = W.rooms[rid];
    placeWindows(W, b, r);
  }
  return b;
}

function placeWindows(W, b, r) {
  const g = W.grid, rng = W.rng;
  if (r.win === 'none') return;
  // raccogli i lati esterni per direzione, ordinati lungo il lato
  const sides = [[], [], [], []];
  for (const [i, j] of r.cells) {
    DIRS.forEach(([dx, dz], d) => {
      const e = g.edgeBetween(r.L, i, j, i + dx, j + dz);
      if (e && e.t === E.WALL && e.ext) sides[d].push({ e, pos: dx !== 0 ? j : i });
    });
  }
  const front = { S: 0, E: 1, N: 2, W: 3 }[b.orient];
  for (let d = 0; d < 4; d++) {
    const list = sides[d].sort((a, b2) => a.pos - b2.pos);
    if (!list.length) continue;
    if (r.win === 'shop' && d !== front) continue;
    // spezza in tratti contigui
    const runs = [];
    let cur = [list[0]];
    for (let k = 1; k < list.length; k++) {
      if (list[k].pos === list[k - 1].pos + 1) cur.push(list[k]);
      else {
        runs.push(cur);
        cur = [list[k]];
      }
    }
    runs.push(cur);
    for (const run of runs) {
      const n = run.length;
      let picks = [];
      if (r.win === 'shop') picks = run.map((_, k) => k);
      else if (r.win === 'small') picks = n >= 2 ? [Math.floor(n / 2)] : [];
      else if (r.win === 'high') picks = run.map((_, k) => k).filter((k) => k % 4 === 2);
      else if (r.win === 'wide') picks = run.map((_, k) => k).filter((k) => k % 2 === 1 && k < n - 1);
      else {
        if (n === 2) picks = [rng.int(0, 1)];
        else if (n >= 3) picks = run.map((_, k) => k).filter((k) => k % 3 === 1);
      }
      for (const k of picks) {
        const e = run[k].e;
        const shop = r.win === 'shop';
        const nw = g.setEdge(e.L, e.o, e.i, e.j, {
          t: E.WINDOW, mat: 'glass', hp: shop ? 4 : 2, maxHp: shop ? 4 : 2, st: ST.CLOSED, ext: true,
          sa: e.sa, sb: e.sb, bld: b.id, shop, high: r.win === 'high', small: r.win === 'small', h: e.h,
        });
        if (rng.chance(0.07)) nw.st = ST.BROKEN;
        else if (rng.chance(0.06) && !shop) nw.st = ST.OPEN;
        if (rng.chance(0.25) && !shop) nw.curtain = true;
        b.windows.push(nw.id);
      }
    }
  }
}

// ---------------------------------------------------------------- arredamento
function addFurn(W, type, i, j, L, rot, room, extra = {}) {
  const g = W.grid;
  const def = FURN[type];
  const [sw, sd] = def.sz;
  const along = rot === 0 || rot === 2; // fronte verso z: larghezza lungo x
  const w = along ? sw : sd, d = along ? sd : sw;
  for (let jj = j; jj < j + d; jj++)
    for (let ii = i; ii < i + w; ii++) {
      if (!g.inb(ii, jj)) return null;
      if (g.lv[L].furn[g.idx(ii, jj)]) return null;
    }
  const f = {
    id: W.furn.length, type, i, j, w, d, L, rot, room: room ? room.id : -1,
    bld: room ? room.bld : -1, zone: g.zone[g.idx(i, j)], loot: def.cont ? def.cont.loot : null,
    items: null, searched: false, tall: !!def.tall, walk: !!def.walk, cold: !!def.cold,
    x: i + w / 2, z: j + d / 2, h: def.h, state: {}, ...extra,
  };
  if (def.tank !== undefined) f.state.water = def.tank;
  W.furn.push(f);
  for (let jj = j; jj < j + d; jj++) for (let ii = i; ii < i + w; ii++) g.lv[L].furn[g.idx(ii, jj)] = f.id + 1;
  return f;
}

function isWallSide(g, L, i, j, d, low) {
  const [dx, dz] = DIRS[d];
  const e = g.edgeBetween(L, i, j, i + dx, j + dz);
  if (!e) return false;
  if (e.t === E.WALL) return true;
  if (low && e.t === E.WINDOW && !e.shop) return true;
  return false;
}

// celle riservate: davanti alle porte e alle scale
function reservedCells(W, r) {
  const g = W.grid;
  const res = new Set();
  const inRoom = new Set(r.cells.map(([i, j]) => g.idx(i, j)));
  for (const [i, j] of r.cells) {
    const k = g.idx(i, j);
    if (r.L === 0 && g.stairCell[k] >= 0) res.add(k);
    if (r.L === 1 && g.lv[1].floor[k] === F.NONE) res.add(k);
    for (const [dx, dz] of DIRS) {
      const e = g.edgeBetween(r.L, i, j, i + dx, j + dz);
      if (e && (e.t === E.DOOR || e.t === E.OPENING)) res.add(k);
    }
  }
  // davanti all'ingresso delle scale
  for (const s of g.stairs) {
    if (W.rooms[r.id].L !== 0) continue;
    const [bi, bj] = s.cells[0];
    const ei = bi - s.dx, ej = bj - s.dz;
    if (g.inb(ei, ej) && inRoom.has(g.idx(ei, ej))) res.add(g.idx(ei, ej));
  }
  return res;
}

function roomConnected(W, r) {
  const g = W.grid;
  const cells = r.cells.map(([i, j]) => g.idx(i, j));
  const set = new Set(cells);
  const free = cells.filter((k) => !g.lv[r.L].furn[k] || g.furnRef[g.lv[r.L].furn[k] - 1].walk);
  if (!free.length) return false;
  const res = reservedCells(W, r);
  const start = [...res][0] ?? free[0];
  const seen = new Set([start]);
  const q = [start];
  while (q.length) {
    const k = q.pop();
    const i = k % g.W, j = (k / g.W) | 0;
    for (const [dx, dz] of DIRS) {
      const ni = i + dx, nj = j + dz;
      const nk = g.idx(ni, nj);
      if (!set.has(nk) || seen.has(nk)) continue;
      if (g.lv[r.L].furn[nk] && !g.furnRef[g.lv[r.L].furn[nk] - 1].walk) continue;
      const e = g.edgeBetween(r.L, i, j, ni, nj);
      if (e && g.blocksPlayer(e) && e.t !== E.DOOR) continue;
      seen.add(nk);
      q.push(nk);
    }
  }
  for (const k of res) if (!seen.has(k)) return false;
  return seen.size >= Math.min(free.length, Math.ceil(cells.length * 0.35));
}

function tryPlaceWall(W, r, type, opts = {}) {
  const g = W.grid, rng = W.rng;
  const def = FURN[type];
  const low = def.h < 1.1;
  const res = reservedCells(W, r);
  const cands = [];
  for (const [i, j] of r.cells) {
    for (let s = 0; s < 4; s++) {
      if (!isWallSide(g, r.L, i, j, s, low)) continue;
      const rot = (s + 2) % 4; // il fronte guarda via dal muro
      const along = rot === 0 || rot === 2;
      const [sw] = def.sz;
      // celle dell'impronta lungo il muro
      const cells = [];
      let ok = true;
      for (let a = 0; a < sw; a++) {
        const ci = along ? i + a : i, cj = along ? j : j + a;
        const k = g.idx(ci, cj);
        if (!g.inb(ci, cj) || g.lv[r.L].room[k] !== r.id || g.lv[r.L].furn[k] || res.has(k)) {
          ok = false;
          break;
        }
        if (!isWallSide(g, r.L, ci, cj, s, low)) {
          ok = false;
          break;
        }
        cells.push(k);
      }
      if (!ok) continue;
      // profondità (per mobili profondi 1 sempre ok)
      let i0 = i, j0 = j;
      const [sw2, sd2] = def.sz;
      if (sd2 > 1) {
        // la profondità va verso l'interno della stanza
        const [fx, fz] = DIRS[rot];
        for (let dd = 1; dd < sd2; dd++) {
          for (let a = 0; a < sw2; a++) {
            const ci = (along ? i + a : i) + fx * dd, cj = (along ? j : j + a) + fz * dd;
            const k = g.idx(ci, cj);
            if (!g.inb(ci, cj) || g.lv[r.L].room[k] !== r.id || g.lv[r.L].furn[k] || res.has(k)) ok = false;
          }
        }
        if (fx < 0) i0 = i - (sd2 - 1);
        if (fz < 0) j0 = j - (sd2 - 1);
        if (!ok) continue;
      }
      let score = rng.next();
      if (opts.near) {
        // preferisci accanto ai mobili già messi (cucina in fila)
        let adj = 0;
        for (const k of cells) {
          const ci = k % g.W, cj = (k / g.W) | 0;
          for (const [dx, dz] of DIRS) {
            const f = g.furnAt(r.L, ci + dx, cj + dz);
            if (f && opts.near.includes(f.type)) adj++;
          }
        }
        score += adj * 2;
      }
      cands.push({ i: i0, j: j0, rot, score });
    }
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 12)) {
    const f = addFurn(W, type, c.i, c.j, r.L, c.rot, r, opts.extra);
    if (!f) continue;
    if (roomConnected(W, r)) return f;
    removeFurnRaw(W, f);
  }
  return null;
}

function tryPlaceCenter(W, r, type, opts = {}) {
  const g = W.grid, rng = W.rng;
  const res = reservedCells(W, r);
  const cands = [];
  for (const [i, j] of r.cells) {
    let wallAdj = 0;
    for (let s = 0; s < 4; s++) {
      const [dx, dz] = DIRS[s];
      const e = g.edgeBetween(r.L, i, j, i + dx, j + dz);
      if (e) wallAdj++;
    }
    if (wallAdj > 0 && !opts.anywhere) continue;
    const rot = rng.int(0, 3);
    cands.push({ i, j, rot, score: rng.next() });
  }
  cands.sort((a, b) => b.score - a.score);
  for (const c of cands.slice(0, 10)) {
    const def = FURN[type];
    const along = c.rot === 0 || c.rot === 2;
    const w = along ? def.sz[0] : def.sz[1], d = along ? def.sz[1] : def.sz[0];
    let ok = true;
    for (let jj = c.j; jj < c.j + d; jj++)
      for (let ii = c.i; ii < c.i + w; ii++) {
        const k = g.idx(ii, jj);
        if (!g.inb(ii, jj) || g.lv[r.L].room[k] !== r.id || res.has(k) || g.lv[r.L].furn[k]) ok = false;
      }
    if (!ok) continue;
    const f = addFurn(W, type, c.i, c.j, r.L, c.rot, r, opts.extra);
    if (!f) continue;
    if (roomConnected(W, r)) return f;
    removeFurnRaw(W, f);
  }
  return null;
}

export function removeFurnRaw(W, f) {
  const g = W.grid;
  for (let jj = f.j; jj < f.j + f.d; jj++)
    for (let ii = f.i; ii < f.i + f.w; ii++) {
      const k = g.idx(ii, jj);
      if (g.lv[f.L].furn[k] === f.id + 1) g.lv[f.L].furn[k] = 0;
    }
  if (W.furn[W.furn.length - 1] === f) W.furn.pop();
  else f.removed = true;
}

const PLANS = {
  living: [['sofa', 1], ['tv', 0.9], ['bookshelf', 0.8], ['armchair', 0.6], ['lamp', 0.7], ['bookshelf', 0.3], ['desk', 0.15]],
  kitchen: [['fridge', 1], ['stove', 1], ['sink_k', 1], ['counter', 1], ['counter', 0.9], ['counter', 0.6], ['trash_bin', 0.25]],
  bedroom: [['bed', 1], ['wardrobe', 1], ['nightstand', 0.85], ['dresser', 0.8], ['lamp', 0.3], ['desk', 0.3], ['bookshelf', 0.25]],
  bathroom: [['toilet', 1], ['sink_b', 1], ['med_cabinet', 0.9], ['tub', 0.75]],
  hall: [['shoe_rack', 0.8]],
  landing: [['bookshelf', 0.4]],
  storage: [['shelf', 1], ['crate', 0.7]],
  garage: [['workbench', 1], ['shelf', 1], ['shelf', 0.7], ['crate', 0.5]],
  study: [['desk', 1], ['bookshelf', 1], ['bookshelf', 0.6], ['armchair', 0.5], ['lamp', 0.5]],
  office: [['desk', 1], ['bookshelf', 0.8], ['locker', 0.6], ['crate', 0.3]],
  wc: [['toilet', 1], ['sink_b', 1]],
  backroom: [['shelf', 1], ['shelf', 0.9], ['crate', 0.8], ['crate', 0.7], ['pallet', 0.5], ['shelf', 0.5]],
  exam: [['exam_bed', 1], ['med_shelf', 1], ['med_shelf', 0.6], ['desk', 0.8], ['sink_b', 0.6]],
  vault: [['med_shelf', 1], ['med_shelf', 1], ['med_shelf', 0.8], ['crate', 0.6], ['med_shelf', 0.6]],
  reception: [['counter_shop', 1], ['chair', 1], ['chair', 1], ['chair', 0.8], ['chair', 0.6], ['vending', 0.7], ['trash_bin', 0.5]],
  janitor: [['shelf', 1], ['shelf', 0.8], ['crate', 0.6], ['sink_k', 0.6]],
  kitchen_big: [['fridge', 1], ['stove', 1], ['stove', 0.8], ['sink_k', 1], ['counter', 1], ['counter', 1], ['shelf', 1], ['shelf', 0.8], ['counter', 0.6]],
  trailer: [['desk', 1], ['locker', 1], ['locker', 0.8], ['crate', 0.7]],
  shed: [['workbench', 1], ['shelf', 1], ['crate', 0.8], ['crate', 0.6], ['shelf', 0.5]],
};

const LOOT_OVERRIDE = {
  supermarket: { sales: { shelf_store: 'store_dry', fridge_store: 'store_fridge' }, backroom: { shelf: 'store_dry', crate: 'store_house', pallet: 'pallet' } },
  hardware: { sales: { shelf_store: 'hardware', counter_shop: 'shop_counter' }, backroom: { shelf: 'hardware', crate: 'hardware', workbench: 'garage_bench' } },
  bar: { sales: { counter_shop: 'bar_counter', fridge_store: 'vending' }, backroom: { shelf: 'bar_counter', crate: 'store_dry' } },
  clothes: { sales: { clothes_rack: 'clothes_store', counter_shop: 'shop_counter', shelf: 'clothes_store' }, backroom: { shelf: 'clothes_store', crate: 'clothes_store' } },
  electro: { sales: { shelf_store: 'electro_counter', counter_shop: 'electro_counter' }, backroom: { shelf: 'electro_counter', crate: 'crate' } },
  pharmacy: { sales: { pharma_shelf: 'pharmacy', counter_shop: 'pharmacy' }, backroom: { shelf: 'pharmacy', crate: 'pharmacy', med_shelf: 'pharmacy' } },
  clinic: { vault: { med_shelf: 'clinic_vault', crate: 'clinic_vault' }, exam: { med_shelf: 'clinic' }, reception: { counter_shop: 'desk' } },
  school: { kitchen_big: { shelf: 'store_dry', counter: 'kitchen' }, janitor: { shelf: 'garage_shelf', crate: 'garage_shelf' } },
  warehouse: { warehouse: { shelf: 'warehouse', crate: 'warehouse', pallet: 'pallet', workbench: 'garage_bench' } },
  gas: { sales: { shelf_store: 'gas_shop', counter_shop: 'gas_shop', fridge_store: 'vending' }, backroom: { shelf: 'gas_shop', crate: 'crate' } },
  site: { trailer: { crate: 'site', locker: 'locker' } },
  farm: { shed: { shelf: 'farm_shed', crate: 'farm_shed', workbench: 'farm_shed' } },
};

function furnishBuilding(W, b) {
  for (const rid of b.rooms) {
    const r = W.rooms[rid];
    if (r.type === 'sales') furnishSales(W, b, r);
    else if (r.type === 'classroom') furnishClassroom(W, r);
    else if (r.type === 'library') furnishLibrary(W, r);
    else if (r.type === 'canteen') furnishCanteen(W, r);
    else if (r.type === 'warehouse') furnishWarehouse(W, r);
    else if (r.type === 'corridor') {
      for (let k = 0; k < 4; k++) tryPlaceWall(W, r, k % 2 ? 'locker' : 'trash_bin');
    } else {
      const plan = PLANS[r.type] || [];
      const placedKitchen = ['fridge', 'stove', 'sink_k', 'counter'];
      for (const [type, p] of plan) {
        if (!W.rng.chance(p)) continue;
        const near = r.type === 'kitchen' || r.type === 'kitchen_big' ? placedKitchen : null;
        tryPlaceWall(W, r, type, { near });
      }
      if (r.type === 'kitchen' && r.cells.length >= 12 && W.rng.chance(0.75)) {
        const t = tryPlaceCenter(W, r, 'table');
        if (t) tryPlaceCenter(W, r, 'chair', { anywhere: true });
      }
      if (r.type === 'living' && r.cells.length >= 16 && W.rng.chance(0.4)) tryPlaceCenter(W, r, 'table');
    }
  }
  // tabelle di bottino specifiche per edificio
  const ov = LOOT_OVERRIDE[b.lootKind || b.kind];
  for (const f of W.furn) {
    if (f.bld !== b.id) continue;
    if (ov) {
      const r = W.rooms[f.room];
      const m = r && ov[r.type];
      if (m && m[f.type]) f.loot = m[f.type];
    }
    if (b.kind === 'supermarket' && f.type === 'shelf_store' && (f.i + f.j) % 3 === 0) f.loot = 'store_house';
    if (b.kind === 'school' && f.type === 'bookshelf') f.lootMult = 1.4;
  }
}

function furnishSales(W, b, r) {
  const k = b.kind;
  if (k === 'supermarket') {
    // frighi lungo il muro di fondo, scaffali in file doppie, casse vicino all'ingresso
    for (let n = 0; n < 9; n++) tryPlaceWall(W, r, 'fridge_store', { near: ['fridge_store'] });
    const front = frontDirOf(b);
    rowsOfShelves(W, r, 'shelf_store', front, 4, 2);
    for (let n = 0; n < 3; n++) tryPlaceCenter(W, r, 'checkout', { anywhere: true });
    return;
  }
  if (k === 'hardware' || k === 'electro' || k === 'gas') {
    for (let n = 0; n < 8; n++) tryPlaceWall(W, r, k === 'gas' && n === 2 ? 'fridge_store' : 'shelf_store');
    tryPlaceCenter(W, r, 'counter_shop', { anywhere: true });
    if (k === 'hardware') rowsOfShelves(W, r, 'shelf_store', frontDirOf(b), 3, 2);
    return;
  }
  if (k === 'pharmacy') {
    for (let n = 0; n < 7; n++) tryPlaceWall(W, r, 'pharma_shelf');
    tryPlaceCenter(W, r, 'counter_shop', { anywhere: true });
    tryPlaceCenter(W, r, 'shelf_store', { extra: { loot: 'pharmacy' } });
    return;
  }
  if (k === 'clothes') {
    for (let n = 0; n < 4; n++) tryPlaceWall(W, r, 'shelf');
    for (let n = 0; n < 4; n++) tryPlaceCenter(W, r, 'clothes_rack');
    tryPlaceWall(W, r, 'counter_shop');
    return;
  }
  if (k === 'bar') {
    tryPlaceWall(W, r, 'counter_shop');
    tryPlaceWall(W, r, 'counter_shop', { near: ['counter_shop'] });
    tryPlaceWall(W, r, 'fridge_store');
    tryPlaceWall(W, r, 'piano');
    for (let n = 0; n < 3; n++) tryPlaceCenter(W, r, 'table');
    for (let n = 0; n < 3; n++) tryPlaceCenter(W, r, 'chair', { anywhere: true });
    tryPlaceWall(W, r, 'vending');
    return;
  }
  for (let n = 0; n < 4; n++) tryPlaceWall(W, r, 'shelf');
}

function frontDirOf(b) {
  return { S: 0, E: 1, N: 2, W: 3 }[b.orient];
}

// file di scaffali doppi perpendicolari al fronte, con corridoi da 2 celle
function rowsOfShelves(W, r, type, front, spacing, aisle) {
  const g = W.grid;
  const xs = r.cells.map((c) => c[0]), zs = r.cells.map((c) => c[1]);
  const i0 = Math.min(...xs), i1 = Math.max(...xs), j0 = Math.min(...zs), j1 = Math.max(...zs);
  const alongX = front === 0 || front === 2; // le file corrono lungo z se il fronte guarda z
  const a0 = alongX ? i0 : j0, a1 = alongX ? i1 : j1; // asse trasversale
  const b0 = alongX ? j0 : i0, b1 = alongX ? j1 : i1; // asse delle file
  const margin = 2;
  for (let a = a0 + aisle; a + 1 <= a1 - aisle + 1; a += spacing) {
    for (let bb = b0 + margin; bb + 1 <= b1 - margin - 1; bb += 2) {
      for (const side of [0, 1]) {
        const ai = a + side;
        const rot = alongX ? (side === 0 ? 3 : 1) : side === 0 ? 2 : 0;
        const ci = alongX ? ai : bb, cj = alongX ? bb : ai;
        if (!g.inb(ci, cj)) continue;
        const f = addFurn(W, type, ci, cj, r.L, rot, r);
        if (f && !roomConnected(W, r)) removeFurnRaw(W, f);
      }
    }
  }
}

function furnishClassroom(W, r) {
  const xs = r.cells.map((c) => c[0]), zs = r.cells.map((c) => c[1]);
  const i0 = Math.min(...xs), i1 = Math.max(...xs), j0 = Math.min(...zs), j1 = Math.max(...zs);
  tryPlaceWall(W, r, 'teacher_desk');
  tryPlaceWall(W, r, 'bookshelf');
  for (let j = j0 + 2; j <= j1 - 2; j += 2) {
    for (let i = i0 + 1; i <= i1 - 1; i += 2) {
      const f = addFurn(W, 'school_desk', i, j, r.L, 2, r);
      if (f && !roomConnected(W, r)) removeFurnRaw(W, f);
    }
  }
}

function furnishLibrary(W, r) {
  for (let n = 0; n < 10; n++) tryPlaceWall(W, r, 'bookshelf');
  for (let n = 0; n < 3; n++) tryPlaceCenter(W, r, 'table');
  tryPlaceCenter(W, r, 'bookshelf');
  tryPlaceCenter(W, r, 'bookshelf');
}

function furnishCanteen(W, r) {
  for (let n = 0; n < 5; n++) tryPlaceCenter(W, r, 'table');
  for (let n = 0; n < 5; n++) tryPlaceCenter(W, r, 'chair', { anywhere: true });
  tryPlaceWall(W, r, 'vending');
  tryPlaceWall(W, r, 'piano');
  tryPlaceWall(W, r, 'trash_bin');
}

function furnishWarehouse(W, r) {
  for (let n = 0; n < 8; n++) tryPlaceWall(W, r, n % 3 === 2 ? 'crate' : 'shelf');
  tryPlaceWall(W, r, 'workbench');
  for (let n = 0; n < 6; n++) tryPlaceCenter(W, r, n % 2 ? 'pallet' : 'crate');
  tryPlaceCenter(W, r, 'car_lift');
}

// ---------------------------------------------------------------- disposizione del paese
function layoutTown(W) {
  const g = W.grid, rng = W.rng;
  const houseNames = rng.shuffle(['Casa Ferrari', 'Casa Bianchi', 'Casa Colombo', 'Villetta Russo', 'Casa Galli', 'Casa Fontana', 'Casa Marini', 'Villetta Greco', 'Casa Rinaldi', 'Casa Moretti']);
  let hn = 0;
  const house = (tpl, x, z, o, home) => {
    const b = placeBuilding(W, tpl, x, z, o, home ? false : rng.chance(0.5), { name: home ? 'Casa tua' : houseNames[hn++], kind: 'house', home });
    return b;
  };
  // --- residenziale (SO): fila nord guarda la Via dei Tigli (sud), fila sud guarda a nord
  const north = [['houseC', 8], ['houseB', 31], ['houseA', 50]];
  const south = [['houseA', 10], ['houseB', 31], ['houseC', 48]];
  const homeB = house(north[0][0], north[0][1], 93, 'S', true);
  house(north[1][0], north[1][1], 93, 'S');
  house(north[2][0], north[2][1], 93, 'S');
  for (const [tpl, x] of south) house(tpl, x, 114, 'N');
  // --- servizi (SE)
  const pharm = placeBuilding(W, 'pharmacy', 77, 77, 'N', false, { name: 'Farmacia Moretti', kind: 'pharmacy', palette: 'clinic', ext: { tex: 'plaster', col: 0xe3e0d4 }, sign: { text: 'FARMACIA', col: '#2f9e5a', glow: true } });
  const clinic = placeBuilding(W, 'clinic', 92, 77, 'N', false, { name: 'Ambulatorio comunale', kind: 'clinic', palette: 'clinic', ext: { tex: 'plaster', col: 0xd8dcd6 }, sign: { text: 'AMBULATORIO', col: '#3a6ea5' } });
  const school = placeBuilding(W, 'school', 104, 98, 'S', false, { name: 'Scuola media "G. Verdi"', kind: 'school', palette: 'school', ext: { tex: 'plaster', col: 0xe0c896 }, sign: { text: 'SCUOLA', col: '#8a3b2a' } });
  house('houseA', 79, 129, 'N');
  house('houseB', 99, 129, 'N');
  // --- commerciale (NE)
  placeBuilding(W, 'supermarket', 98, 22, 'S', false, { name: 'Supermercato "Spesa Facile"', kind: 'supermarket', palette: 'shop', ext: { tex: 'panel', col: 0xc8c8c0 }, sign: { text: 'SPESA FACILE', col: '#c0392b', glow: true } });
  placeBuilding(W, 'hardware', 122, 50, 'S', false, { name: 'Ferramenta Rossi', kind: 'hardware', palette: 'shop', ext: { tex: 'brick', col: 0x9a5a3e }, sign: { text: 'FERRAMENTA', col: '#e6a23c' } });
  placeBuilding(W, 'shop', 76, 54, 'W', false, { name: 'Bar Centrale', kind: 'bar', palette: 'shop', sign: { text: 'BAR', col: '#e6c13a', glow: true } });
  placeBuilding(W, 'shop', 76, 44, 'W', false, { name: 'Abbigliamento Elena', kind: 'clothes', palette: 'shop', sign: { text: 'ABBIGLIAMENTO', col: '#9a4fb0' } });
  placeBuilding(W, 'shop', 76, 34, 'W', false, { name: 'Elettronica e Tabacchi', kind: 'electro', palette: 'shop', sign: { text: 'TABACCHI', col: '#3a6ea5' } });
  // --- periferia (NO)
  placeBuilding(W, 'gasshop', 48, 50, 'S', false, { name: 'Distributore', kind: 'gas', palette: 'shop', ext: { tex: 'panel', col: 0xd8d8d0 }, sign: { text: 'CARBURANTI', col: '#c0392b', glow: true } });
  placeBuilding(W, 'warehouse', 8, 46, 'S', false, { name: 'Capannone Brambilla', kind: 'warehouse', palette: 'industrial', ext: { tex: 'panel', col: 0x8f9a94 } });
  placeBuilding(W, 'trailer', 40, 18, 'S', false, { name: 'Baracca del cantiere', kind: 'site', palette: 'industrial', ext: { tex: 'panel', col: 0xd8c23a } });
  placeBuilding(W, 'houseA', 9, 6, 'S', rng.chance(0.5), { name: 'Cascina Valli', kind: 'house', ext: { tex: 'stone', col: 0xa29d92 } });
  placeBuilding(W, 'shed', 21, 8, 'S', false, { name: 'Fienile', kind: 'farm', palette: 'industrial', ext: { tex: 'wood', col: 0x8a6a4a } });

  for (const b of W.buildings) furnishBuilding(W, b);

  // pensilina e pompe del distributore
  W.props.push({ type: 'canopy', x0: 46, z0: 58, x1: 60, z1: 64, h: 4.4 });
  for (const [x, z] of [[50, 61], [55, 61]]) addFurn(W, 'pump', x, z, 0, 0, null, { zone: 0 });
  // insegne e cartelli sulla mappa
  for (const b of W.buildings) {
    W.labels.push({ x: b.i0 + b.w / 2, z: b.j0 + b.d / 2, text: b.name, bld: b.id });
  }
  // casa del giocatore: spawn nella camera da letto
  const bedroom = homeB.rooms.map((id) => W.rooms[id]).find((r) => r.type === 'bedroom');
  const bed = W.furn.find((f) => f.room === bedroom.id && f.type === 'bed');
  let sc = bedroom.cells.find(([i, j]) => !g.lv[0].furn[g.idx(i, j)] && !(bed && Math.abs(i + 0.5 - bed.x) < 1.5 && Math.abs(j + 0.5 - bed.z) < 1.5)) || bedroom.cells.find(([i, j]) => !g.lv[0].furn[g.idx(i, j)]);
  W.playerSpawn = { x: sc[0] + 0.5, z: sc[1] + 0.5, L: 0, yaw: 0, home: homeB.id };
  W.home = homeB.id;
  // la torcia sul comodino: la prima notte arriva presto
  const ns = W.furn.find((f) => f.room === bedroom.id && f.type === 'nightstand');
  if (ns) ns.guaranteed = [['flashlight', 1, { bat: 0.8 }], ['painkillers']];
  // oggetti garantiti in casa: mazza, martello, chiodi, assi, carriola
  const garage = homeB.rooms.map((id) => W.rooms[id]).find((r) => r.type === 'garage');
  const gb = W.furn.find((f) => f.room === garage.id && f.type === 'workbench');
  if (gb) gb.guaranteed = [['hammer'], ['nails', 24], ['screwdriver'], ['duct_tape']];
  const gs = W.furn.find((f) => f.room === garage.id && f.type === 'shelf');
  if (gs) gs.guaranteed = [['bat'], ['gas_can', 1, { liq: 2 }]];
  const kitchen = homeB.rooms.map((id) => W.rooms[id]).find((r) => r.type === 'kitchen');
  const kc = W.furn.find((f) => f.room === kitchen.id && f.type === 'counter');
  if (kc) kc.guaranteed = [['beans'], ['can_opener'], ['kitchen_knife'], ['matches']];
  const fr = W.furn.find((f) => f.room === kitchen.id && f.type === 'fridge');
  if (fr) fr.guaranteed = [['bottle', 1, { liq: 1 }], ['cheese'], ['milk']];
  const freeIn = (r, n) => {
    const out = [];
    for (const [i, j] of r.cells) {
      if (!g.lv[r.L].furn[g.idx(i, j)] && !g.stairAt(i, j)) out.push([i, j]);
      if (out.length >= n) break;
    }
    return out;
  };
  const gc = freeIn(garage, 6);
  if (gc[0]) W.groundInit.push({ i: gc[0][0], j: gc[0][1], L: 0, id: 'plank', n: 3 });
  if (gc[2]) W.barrows.push({ x: gc[2][0] + 0.5, z: gc[2][1] + 0.5, L: 0, yaw: 0 });
  // materiali da costruzione: ferramenta, cantiere, capannone, cascina
  const roomOf = (kind, type) => {
    const b = W.buildings.find((bb) => bb.kind === kind);
    return b && b.rooms.map((id) => W.rooms[id]).find((r) => r.type === type);
  };
  const drop = (r, list) => {
    if (!r) return;
    const cells = freeIn(r, list.length + 6);
    list.forEach((it, n) => {
      const c = cells[(n * 2) % cells.length];
      if (c) W.groundInit.push({ i: c[0], j: c[1], L: r.L, id: it[0], n: it[1] || 1 });
    });
  };
  drop(roomOf('hardware', 'backroom'), [['generator'], ['barrel'], ['plank', 3], ['sheet_metal', 2], ['cement', 1], ['barrel']]);
  drop(roomOf('warehouse', 'warehouse'), [['plank', 4], ['barrel', 2], ['sheet_metal', 2], ['log', 2], ['pipe', 2]]);
  drop(roomOf('farm', 'shed'), [['log', 3], ['barrel'], ['plank', 2]]);
  // cantiere: recinto, pile di materiali, carriola
  siteYard(W);
  // cascina: carriola e campi abbandonati con qualche pianta matura
  W.barrows.push({ x: 26.5, z: 16.5, L: 0, yaw: 1.2 });
  for (let n = 0; n < 14; n++) {
    const i = rng.int(7, 27), j = rng.int(20, 39);
    if (g.lv[0].furn[g.idx(i, j)]) continue;
    const crop = rng.pick(['potato', 'cabbage', 'carrot', 'tomato']);
    addFurn(W, 'garden', i, j, 0, 0, null, { zone: 0, wild: true, state: { crop, growth: rng.range(0.7, 1.05), water: 0.5, planted: -rng.range(20, 40) } });
  }
  // recinti dei lotti residenziali
  residentialFences(W);
  // cortile della scuola recintato con cancello
  fenceRect(W, 92, 94, 103, 118, E.HFENCE, [[1, 92, 106], [0, 97, 119]]);
  // parco con fontanella e panchine
  paint(g, 77, 91, 90, 116, F.GRASS);
  addFurn(W, 'fountain', 83, 103, 0, 0, null, { zone: 3 });
  addFurn(W, 'park_bench', 79, 96, 0, 1, null, { zone: 3 });
  addFurn(W, 'park_bench', 86, 110, 0, 3, null, { zone: 3 });
  addFurn(W, 'park_bench', 79, 108, 0, 1, null, { zone: 3 });
  // vialetti
  for (const b of W.buildings) {
    for (const d of b.extDoors) {
      const [oi, oj] = d.outside;
      if (g.inb(oi, oj) && g.lv[0].floor[g.idx(oi, oj)] === F.GRASS) {
        // vialetto fino alla strada
        const dir = [Math.sign(oi - d.inside[0]), Math.sign(oj - d.inside[1])];
        let ci = oi, cj = oj, n = 0;
        while (g.inb(ci, cj) && g.lv[0].floor[g.idx(ci, cj)] === F.GRASS && n < 6) {
          g.lv[0].floor[g.idx(ci, cj)] = d.kind === 'garage' ? F.CONCRETE : F.GRAVEL;
          if (d.kind === 'garage') {
            const pi = ci + dir[1], pj = cj + dir[0];
            const mi = ci - dir[1], mj = cj - dir[0];
            for (const [xi, xj] of [[pi, pj], [mi, mj]])
              if (g.inb(xi, xj) && g.lv[0].floor[g.idx(xi, xj)] === F.GRASS && g.bld[g.idx(xi, xj)] < 0) g.lv[0].floor[g.idx(xi, xj)] = F.CONCRETE;
          }
          ci += dir[0];
          cj += dir[1];
          n++;
        }
      }
    }
  }
}

function siteYard(W) {
  const g = W.grid, rng = W.rng;
  fenceRect(W, 38, 16, 62, 42, E.HFENCE, [[0, 50, 43], [0, 51, 43], [1, 63, 30]]);
  const piles = [['plank', 4, 44, 26], ['plank', 4, 45, 26], ['cement', 2, 44, 30], ['cement', 2, 45, 30], ['sheet_metal', 2, 47, 33], ['pipe', 3, 48, 33], ['log', 2, 56, 38], ['barrel', 1, 58, 20]];
  for (const [id, n, i, j] of piles) W.groundInit.push({ i, j, L: 0, id, n });
  W.barrows.push({ x: 49.5, z: 36.5, L: 0, yaw: 0.6 });
  // fondamenta e muri lasciati a metà dagli operai (pezzi costruiti, si possono smontare)
  W.prebuilt = [];
  for (let j = 24; j <= 29; j++) for (let i = 52; i <= 58; i++) W.prebuilt.push({ kind: 'found', i, j, mat: 'cement' });
  for (let i = 52; i <= 58; i++) if (rng.chance(0.8)) W.prebuilt.push({ kind: 'wall', o: 0, i, j: 24, mat: 'cement' });
  for (let j = 24; j <= 27; j++) W.prebuilt.push({ kind: 'wall', o: 1, i: 52, j, mat: 'cement' });
  W.props.push({ type: 'scaffold', x0: 52, z0: 23, x1: 59, z1: 24 });
}

function fenceRect(W, i0, j0, i1, j1, type, gates) {
  const g = W.grid;
  const mk = (o, i, j) => {
    if ((o === 0 ? g.hId(0, i, j) : g.vId(0, i, j))) return; // non sovrascrivere muri esistenti
    const gate = gates.some(([go, gi, gj]) => go === o && gi === i && gj === j);
    if (gate) g.setEdge(0, o, i, j, { t: E.DOOR, mat: 'chain', hp: 90, maxHp: 90, st: ST.CLOSED, gate: true, swing: 1 });
    else g.setEdge(0, o, i, j, { t: type, mat: type === E.HFENCE ? 'chain' : 'picket', h: type === E.HFENCE ? 2.1 : 1.0 });
  };
  for (let i = i0; i <= i1; i++) {
    mk(0, i, j0);
    mk(0, i, j1 + 1);
  }
  for (let j = j0; j <= j1; j++) {
    mk(1, i0, j);
    mk(1, i1 + 1, j);
  }
}

function residentialFences(W) {
  const g = W.grid, rng = W.rng;
  const pick = () => (rng.chance(0.35) ? 'hedge' : 'picket');
  // separazioni tra i lotti (linee verticali) e recinto sul retro verso Via Roma
  const lines = [[25, 75, 103], [45, 75, 103], [25, 111, 138], [45, 111, 138], [96, 128, 138]];
  for (const [x, j0, j1] of lines) {
    const kind = pick();
    for (let j = j0; j <= j1; j++) {
      if (g.vId(0, x, j) || g.bld[g.idx(x, j)] >= 0 || g.bld[g.idx(x - 1, j)] >= 0) continue;
      if (kind === 'hedge') {
        const k = g.idx(x, j);
        if (!g.lv[0].furn[k] && g.lv[0].floor[k] === F.GRASS) g.block[k] = BLK.HEDGE;
      } else g.setEdge(0, 1, x, j, { t: E.FENCE, mat: 'picket', h: 1.0 });
    }
  }
  // retro dei lotti nord, lungo Via Roma, con un varco per lotto
  for (let i = 6; i <= 65; i++) {
    if (i % 20 === 15) continue;
    g.setEdge(0, 0, i, 75, { t: E.FENCE, mat: 'picket', h: 1.0 });
  }
  for (let i = 6; i <= 65; i++) {
    if (i % 20 === 5) continue;
    g.setEdge(0, 0, i, 138, { t: E.FENCE, mat: 'picket', h: 1.0 });
  }
  W.lots.push([7, 75, 24, 103], [26, 75, 44, 103], [46, 75, 64, 103], [7, 111, 24, 138], [26, 111, 44, 138], [46, 111, 64, 138]);
}

// ---------------------------------------------------------------- vegetazione
function freeOutdoor(g, i, j, margin = 0) {
  for (let jj = j - margin; jj <= j + margin; jj++)
    for (let ii = i - margin; ii <= i + margin; ii++) {
      if (!g.inb(ii, jj)) return false;
      const k = g.idx(ii, jj);
      const f = g.lv[0].floor[k];
      if (f !== F.GRASS && f !== F.DIRT) return false;
      if (g.bld[k] >= 0 || g.block[k] || g.lv[0].furn[k]) return false;
      if (g.hId(0, ii, jj) || g.vId(0, ii, jj) || g.hId(0, ii, jj + 1) || g.vId(0, ii + 1, jj)) return false;
    }
  return true;
}

function plantVegetation(W) {
  const g = W.grid, rng = W.rng;
  // bosco ai margini: tanti alberi decorativi nelle celle di foresta
  for (let j = 0; j < g.H; j++) {
    for (let i = 0; i < g.W; i++) {
      const k = g.idx(i, j);
      if (g.lv[0].floor[k] !== F.FOREST) continue;
      if (rng.chance(0.42)) W.trees.push({ x: i + rng.range(0.2, 0.8), z: j + rng.range(0.2, 0.8), s: rng.range(0.85, 1.5), kind: rng.chance(0.6) ? 'pine' : 'oak', forest: true });
    }
  }
  // alberi sparsi in giardini, parco, periferia
  const zones = [
    [6, 76, 65, 103, 22], [6, 111, 65, 138, 22], [77, 91, 90, 116, 16], [76, 128, 120, 138, 6],
    [6, 5, 65, 15, 6], [6, 20, 30, 42, 4], [34, 5, 65, 46, 10], [123, 75, 138, 96, 8], [113, 128, 138, 138, 6],
    [133, 6, 138, 45, 6], [76, 6, 88, 30, 6], [92, 88, 103, 94, 3],
  ];
  for (const [i0, j0, i1, j1, n] of zones) {
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 30) {
      const i = rng.int(i0, i1), j = rng.int(j0, j1);
      if (!freeOutdoor(g, i, j, 1)) continue;
      g.block[g.idx(i, j)] = BLK.TREE;
      W.trees.push({ x: i + 0.5, z: j + 0.5, s: rng.range(0.9, 1.4), kind: rng.chance(0.35) ? 'pine' : 'oak' });
      placed++;
    }
  }
  // cespugli che nascondono (vegetazione = stealth)
  for (let n = 0; n < 70; n++) {
    const i = rng.int(6, 137), j = rng.int(6, 137);
    if (!freeOutdoor(g, i, j, 0)) continue;
    if (g.zone[g.idx(i, j)] === 1 && rng.chance(0.6)) continue;
    W.props.push({ type: 'bush', x: i + 0.5, z: j + 0.5, s: rng.range(0.8, 1.3) });
    W.bushAt = W.bushAt || new Set();
    W.bushAt.add(g.idx(i, j));
  }
}

// ---------------------------------------------------------------- auto abbandonate
const CAR_COLS = [0x8a1f1f, 0x2f4a6a, 0xc8c8c0, 0x3a3f43, 0x6a6a5a, 0x1f3a2a, 0xb8a040, 0x5a2a4a, 0xe0e0d8];

function placeCars(W) {
  const g = W.grid, rng = W.rng;
  const spots = [
    // strade (asse x = lungo x)
    [18, 69, 'x'], [40, 70, 'x'], [58, 68, 'x'], [86, 69, 'x'], [112, 70, 'x'], [128, 68, 'x'],
    [69, 18, 'z'], [70, 46, 'z'], [68, 92, 'z'], [70, 130, 'z'],
    [20, 106, 'x'], [52, 107, 'x'], [90, 123, 'x'], [124, 124, 'x'],
    // parcheggio
    [92, 44, 'z'], [95, 44, 'z'], [104, 44, 'z'], [110, 44, 'z'], [116, 44, 'z'], [98, 52, 'z'], [107, 52, 'z'], [113, 54, 'z'],
    // distributore, retro supermercato, posti di blocco
    [51, 62, 'x'], [100, 10, 'x'], [118, 12, 'x'], [7, 68, 'x'], [133, 70, 'x'], [69, 7, 'z'], [70, 133, 'z'],
  ];
  for (const [i, j, ax] of spots) {
    if (rng.chance(0.18) && i > 10 && i < 133 && j > 10 && j < 133) continue;
    const w = ax === 'x' ? 4 : 2, d = ax === 'x' ? 2 : 4;
    let ok = true;
    for (let jj = j; jj < j + d; jj++)
      for (let ii = i; ii < i + w; ii++) {
        if (!g.inb(ii, jj) || g.block[g.idx(ii, jj)] || g.bld[g.idx(ii, jj)] >= 0 || g.lv[0].furn[g.idx(ii, jj)]) ok = false;
      }
    if (!ok) continue;
    const military = (i < 10 || i > 130 || j < 10 || j > 130);
    const car = {
      id: W.cars.length, i, j, w, d, ax, x: i + w / 2, z: j + d / 2, yaw: (ax === 'x' ? Math.PI / 2 : 0) + rng.range(-0.12, 0.12) + (rng.chance(0.5) ? Math.PI : 0),
      col: military ? 0x4a5a3a : rng.pick(CAR_COLS), military, van: military || rng.chance(0.18),
      fuel: rng.chance(0.7) ? rng.range(2, 18) : 0, broken: rng.chance(0.5), doorOpen: rng.chance(0.25),
      trunk: null, glove: null, battery: !military && rng.chance(0.85), dismantled: false,
    };
    W.cars.push(car);
    for (let jj = j; jj < j + d; jj++)
      for (let ii = i; ii < i + w; ii++) {
        g.block[g.idx(ii, jj)] = BLK.CAR;
        g.carAt[g.idx(ii, jj)] = car.id;
      }
  }
  // barriere dei posti di blocco: la valle è chiusa
  for (const [i0, j0, i1, j1] of [[3, 66, 4, 74], [139, 66, 140, 74], [66, 3, 74, 4], [66, 139, 74, 140], [30, 3, 33, 4]]) {
    rect(g, i0, j0, i1, j1, (k) => {
      g.block[k] = BLK.FOREST;
    });
    W.props.push({ type: 'barrier', x0: i0, z0: j0, x1: i1 + 1, z1: j1 + 1 });
  }
}

// ---------------------------------------------------------------- arredo urbano
function placeStreetProps(W) {
  const g = W.grid, rng = W.rng;
  // lampioni lungo le strade principali
  for (let i = 10; i < 136; i += 12) {
    W.props.push({ type: 'lamp', x: i + 0.5, z: 66.3, rot: 0 });
    W.props.push({ type: 'lamp', x: i + 6.5, z: 74.7, rot: Math.PI });
  }
  for (let j = 10; j < 136; j += 12) {
    if (Math.abs(j - 70) < 6) continue;
    W.props.push({ type: 'lamp', x: 66.3, z: j + 0.5, rot: Math.PI / 2 });
    W.props.push({ type: 'lamp', x: 74.7, z: j + 6.5, rot: -Math.PI / 2 });
  }
  for (let i = 12; i < 64; i += 14) W.props.push({ type: 'lamp', x: i + 0.5, z: 104.3, rot: 0 });
  for (let i = 80; i < 136; i += 14) W.props.push({ type: 'lamp', x: i + 0.5, z: 121.3, rot: 0 });
  // bidoni della spazzatura (contenitori)
  const bins = [[20, 67], [44, 73], [62, 67], [80, 73], [100, 67], [126, 73], [67, 30], [73, 50], [67, 90], [73, 116], [94, 7], [96, 7], [124, 7], [30, 105], [56, 109], [100, 122], [60, 50]];
  for (const [i, j] of bins) {
    const k = g.idx(i, j);
    if (g.block[k] || g.lv[0].furn[k]) continue;
    addFurn(W, 'trash_bin', i, j, 0, 0, null, { zone: g.zone[k] });
  }
  // distributori automatici
  addFurn(W, 'vending', 59, 49, 0, 0, null, { zone: 0 });
  addFurn(W, 'vending', 92, 89, 0, 0, null, { zone: 3 });
  // cartelli della quarantena
  for (const [x, z, r] of [[8, 70, Math.PI / 2], [135, 70, -Math.PI / 2], [70, 8, 0], [70, 135, Math.PI], [31.5, 8, 0]]) W.props.push({ type: 'qsign', x, z, rot: r });
  void rng;
}

// ---------------------------------------------------------------- zombie iniziali
function spawnZombies(W, settings) {
  const g = W.grid, rng = W.rng;
  const total = worldValue(settings, 'population');
  const home = W.buildings[W.home];
  const hx = home.i0 + home.w / 2, hz = home.j0 + home.d / 2;
  const okCell = (L, i, j) => {
    if (!g.walkNode(L, i, j)) return false;
    if (g.cellBlocked(L, i, j)) return false;
    if (L === 0 && g.stairCell[g.idx(i, j)] >= 0) return false;
    const dx = i + 0.5 - hx, dz = j + 0.5 - hz;
    if (dx * dx + dz * dz < 18 * 18) return false;
    return true;
  };
  const inBld = (b, n) => {
    const rooms = b.rooms.map((id) => W.rooms[id]);
    let placed = 0, tries = 0;
    while (placed < n && tries++ < n * 20) {
      const r = rng.pick(rooms);
      const [i, j] = rng.pick(r.cells);
      if (!okCell(r.L, i, j)) continue;
      W.zombieSpawns.push({ x: i + rng.range(0.3, 0.7), z: j + rng.range(0.3, 0.7), L: r.L, inside: b.id });
      placed++;
    }
    return placed;
  };
  const outdoorGroup = (cx, cz, n, rad) => {
    let placed = 0, tries = 0;
    const grp = W.zombieSpawns.length;
    while (placed < n && tries++ < n * 30) {
      const i = Math.floor(cx + rng.range(-rad, rad)), j = Math.floor(cz + rng.range(-rad, rad));
      if (!g.inb(i, j) || g.bld[g.idx(i, j)] >= 0 || !okCell(0, i, j)) continue;
      W.zombieSpawns.push({ x: i + 0.5, z: j + 0.5, L: 0, group: grp });
      placed++;
    }
    return placed;
  };
  // quote per tipo di edificio: i posti di valore sono i più infestati
  const share = { pharmacy: 0.06, clinic: 0.07, hardware: 0.06, supermarket: 0.09, school: 0.07, bar: 0.02, clothes: 0.015, electro: 0.015, gas: 0.02, warehouse: 0.03, site: 0.01, farm: 0.01, house: 0.012 };
  let used = 0;
  for (const b of W.buildings) {
    if (b.home) continue;
    const n = Math.max(b.kind === 'house' ? 0 : 1, Math.round(total * (share[b.kind] || 0.01) * rng.range(0.7, 1.3)));
    used += inBld(b, n);
  }
  // gruppi in strada: restano fermi o vagano
  const spots = [[40, 70], [100, 70], [70, 40], [70, 100], [104, 52], [55, 58], [20, 62], [110, 15], [36, 107], [104, 124], [84, 100], [97, 106], [50, 30], [125, 85], [130, 30], [15, 125], [60, 125], [20, 85]];
  let si = 0;
  while (used < total && si < 200) {
    const [cx, cz] = spots[si % spots.length];
    const n = Math.min(total - used, rng.int(2, 6));
    used += outdoorGroup(cx, cz, n, 6);
    si++;
  }
}
