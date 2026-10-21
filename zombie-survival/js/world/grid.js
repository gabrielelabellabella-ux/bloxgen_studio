// Griglia del mondo: celle da 1 m su due livelli (terra e primo piano, 3 m) e lati di cella
// per muri, finestre, porte, staccionate. È la base di collisioni, linea di vista e percorsi.
import { LEVEL_H } from '../config.js';

// tipi di pavimento/terreno
export const F = {
  GRASS: 0, DIRT: 1, ASPHALT: 2, SIDEWALK: 3, GRAVEL: 4, FIELD: 5, FOREST: 6, PARKING: 7, CONCRETE: 8, COURT: 9,
  WOOD: 10, TILE: 11, CARPET: 12, CONC_IN: 13, LINO: 14, SHOP: 15,
  FOUND_WOOD: 20, FOUND_METAL: 21, FOUND_CEMENT: 22,
  PF_WOOD: 30, PF_METAL: 31, PF_CEMENT: 32,
  NONE: 255,
};

export const FLOOR_INFO = {
  [F.GRASS]: { y: 0, soil: true, step: 'grass', out: true },
  [F.DIRT]: { y: 0, soil: true, step: 'grass', out: true },
  [F.ASPHALT]: { y: 0, step: 'hard', out: true },
  [F.SIDEWALK]: { y: 0.12, step: 'hard', out: true },
  [F.GRAVEL]: { y: 0, step: 'gravel', out: true },
  [F.FIELD]: { y: 0, soil: true, step: 'grass', out: true },
  [F.FOREST]: { y: 0, step: 'grass', out: true },
  [F.PARKING]: { y: 0, step: 'hard', out: true },
  [F.CONCRETE]: { y: 0.04, step: 'hard', out: true },
  [F.COURT]: { y: 0.04, step: 'hard', out: true },
  [F.WOOD]: { y: 0.16, step: 'wood' },
  [F.TILE]: { y: 0.16, step: 'hard' },
  [F.CARPET]: { y: 0.16, step: 'soft' },
  [F.CONC_IN]: { y: 0.16, step: 'hard' },
  [F.LINO]: { y: 0.16, step: 'hard' },
  [F.SHOP]: { y: 0.16, step: 'hard' },
  [F.FOUND_WOOD]: { y: 0.14, step: 'wood', built: 'wood' },
  [F.FOUND_METAL]: { y: 0.14, step: 'metal', built: 'metal' },
  [F.FOUND_CEMENT]: { y: 0.14, step: 'hard', built: 'cement' },
  [F.PF_WOOD]: { y: 0, step: 'wood', built: 'wood' },
  [F.PF_METAL]: { y: 0, step: 'metal', built: 'metal' },
  [F.PF_CEMENT]: { y: 0, step: 'hard', built: 'cement' },
};

// tipi di lato
export const E = { NONE: 0, WALL: 1, WINDOW: 2, DOOR: 3, FENCE: 4, RAILING: 5, HFENCE: 6, OPENING: 7 };
// stati di porte e finestre
export const ST = { CLOSED: 0, OPEN: 1, BROKEN: 2 };

// ostacoli statici nelle celle
export const BLK = { NONE: 0, TREE: 1, HEDGE: 2, CAR: 3, FOREST: 4, PILLAR: 5, ROCK: 6, PUMPISLAND: 7 };

export const ZONES = ['Periferia', 'Commerciale', 'Residenziale', 'Servizi'];

export class Grid {
  constructor(W, H) {
    this.W = W;
    this.H = H;
    this.N = W * H;
    const mk = () => ({
      floor: new Uint8Array(this.N).fill(F.NONE),
      room: new Int16Array(this.N).fill(-1),
      furn: new Int32Array(this.N), // id mobile + 1
    });
    this.lv = [mk(), mk()];
    this.lv[0].floor.fill(F.GRASS);
    this.block = new Uint8Array(this.N); // solo livello 0
    this.carAt = new Int16Array(this.N).fill(-1);
    this.zone = new Uint8Array(this.N);
    this.bld = new Int16Array(this.N).fill(-1);
    this.hE = [new Int32Array(W * (H + 1)), new Int32Array(W * (H + 1))];
    this.vE = [new Int32Array((W + 1) * H), new Int32Array((W + 1) * H)];
    this.edges = new Map();
    this.nextEdge = 1;
    this.stairs = [];
    this.stairCell = new Int16Array(this.N).fill(-1);
    this.climb = []; // collegamenti per arrampicarsi (corde, scale a pioli) {id, i0,j0 (L0), i1,j1 (L1)}
    this.version = 1; // cambia quando cambia la percorribilità (invalida i percorsi)
    this.furnRef = null; // array dei mobili, impostato dal mondo
  }

  idx(i, j) {
    return j * this.W + i;
  }
  inb(i, j) {
    return i >= 0 && j >= 0 && i < this.W && j < this.H;
  }

  // ---------------------------------------------------------------- lati
  hId(L, i, j) {
    return this.hE[L][j * this.W + i];
  }
  vId(L, i, j) {
    return this.vE[L][j * (this.W + 1) + i];
  }
  hEdge(L, i, j) {
    if (i < 0 || i >= this.W || j < 0 || j > this.H) return null;
    const id = this.hE[L][j * this.W + i];
    return id ? this.edges.get(id) : null;
  }
  vEdge(L, i, j) {
    if (i < 0 || i > this.W || j < 0 || j >= this.H) return null;
    const id = this.vE[L][j * (this.W + 1) + i];
    return id ? this.edges.get(id) : null;
  }
  // lato tra due celle adiacenti ortogonalmente
  edgeBetween(L, i1, j1, i2, j2) {
    if (i1 === i2) {
      if (j2 === j1 + 1) return this.hEdge(L, i1, j2);
      if (j2 === j1 - 1) return this.hEdge(L, i1, j1);
    } else if (j1 === j2) {
      if (i2 === i1 + 1) return this.vEdge(L, i2, j1);
      if (i2 === i1 - 1) return this.vEdge(L, i1, j1);
    }
    return null;
  }
  edgeSlot(i1, j1, i2, j2) {
    if (i1 === i2) return { o: 0, i: i1, j: Math.max(j1, j2) };
    return { o: 1, i: Math.max(i1, i2), j: j1 };
  }
  setEdge(L, o, i, j, props) {
    const arr = o === 0 ? this.hE[L] : this.vE[L];
    const k = o === 0 ? j * this.W + i : j * (this.W + 1) + i;
    const old = arr[k];
    if (old) this.edges.delete(old);
    if (!props) {
      arr[k] = 0;
      this.version++;
      return null;
    }
    const id = this.nextEdge++;
    const e = Object.assign({ id, L, o, i, j, t: E.WALL, mat: 'plaster', hp: 0, maxHp: 0, st: ST.CLOSED, bar: null, metal: 0, cover: false, built: false, ext: false }, props);
    e.id = id;
    e.L = L; e.o = o; e.i = i; e.j = j;
    arr[k] = id;
    this.edges.set(id, e);
    this.version++;
    return e;
  }
  setEdgeBetween(L, i1, j1, i2, j2, props) {
    const s = this.edgeSlot(i1, j1, i2, j2);
    return this.setEdge(L, s.o, s.i, s.j, props);
  }
  removeEdge(e) {
    const arr = e.o === 0 ? this.hE[e.L] : this.vE[e.L];
    const k = e.o === 0 ? e.j * this.W + e.i : e.j * (this.W + 1) + e.i;
    if (arr[k] === e.id) arr[k] = 0;
    this.edges.delete(e.id);
    this.version++;
  }
  // le due celle ai lati di un lato
  edgeCells(e) {
    if (e.o === 0) return [[e.i, e.j - 1], [e.i, e.j]];
    return [[e.i - 1, e.j], [e.i, e.j]];
  }
  edgeCenter(e) {
    if (e.o === 0) return { x: e.i + 0.5, z: e.j };
    return { x: e.i, z: e.j + 0.5 };
  }

  // il lato ferma il giocatore?
  blocksPlayer(e) {
    if (!e) return false;
    switch (e.t) {
      case E.NONE:
      case E.OPENING:
        return false;
      case E.DOOR:
        return e.st === ST.CLOSED || hasBarricade(e);
      default:
        return true;
    }
  }
  // il lato ferma uno zombie che cammina? (per finestre/staccionate/porte chiuse serve un'azione)
  blocksZombie(e) {
    return this.blocksPlayer(e);
  }
  blocksSight(e) {
    if (!e) return false;
    switch (e.t) {
      case E.WALL:
        return true;
      case E.DOOR:
        return e.st === ST.CLOSED || barricadeLevel(e) >= 3;
      case E.WINDOW:
        return e.cover || barricadeLevel(e) >= 3 || e.metal > 0;
      default:
        return false;
    }
  }
  // costo per gli zombie nei percorsi: -1 invalicabile, altrimenti costo extra
  zombieEdgeCost(e) {
    if (!e) return 0;
    switch (e.t) {
      case E.NONE:
      case E.OPENING:
        return 0;
      case E.RAILING:
        return -1;
      case E.WALL:
        return e.built ? 60 + e.hp * 1.2 : -1;
      case E.HFENCE:
        return e.built ? 60 + e.hp : -1;
      case E.FENCE:
        return e.built ? 30 + (hasBarricade(e) ? 200 : 0) : 30;
      case E.DOOR: {
        let c = 0;
        if (e.st === ST.CLOSED) c += 40 + e.hp * 1.1;
        if (hasBarricade(e)) c += 40 + barricadeHp(e) * 1.1;
        return c;
      }
      case E.WINDOW: {
        let c = 25;
        if (e.st === ST.CLOSED) c += 20;
        if (hasBarricade(e)) c += 40 + barricadeHp(e) * 1.1;
        return c;
      }
    }
    return -1;
  }

  // ---------------------------------------------------------------- celle
  floorAt(L, i, j) {
    if (!this.inb(i, j)) return F.NONE;
    return this.lv[L].floor[j * this.W + i];
  }
  roomAt(L, i, j) {
    if (!this.inb(i, j)) return -1;
    return this.lv[L].room[j * this.W + i];
  }
  furnAt(L, i, j) {
    if (!this.inb(i, j)) return null;
    const v = this.lv[L].furn[j * this.W + i];
    return v ? this.furnRef[v - 1] : null;
  }
  stairAt(i, j) {
    if (!this.inb(i, j)) return null;
    const k = this.stairCell[j * this.W + i];
    return k >= 0 ? this.stairs[k] : null;
  }
  // la cella blocca il movimento (alberi, auto, mobili)?
  cellBlocked(L, i, j) {
    if (!this.inb(i, j)) return true;
    const k = j * this.W + i;
    if (L === 0 && this.block[k]) return true;
    const fv = this.lv[L].furn[k];
    if (fv) {
      const f = this.furnRef[fv - 1];
      if (f && !f.walk) return true;
    }
    return false;
  }
  cellBlocksSight(L, i, j) {
    if (!this.inb(i, j)) return true;
    const k = j * this.W + i;
    if (L === 0 && (this.block[k] === BLK.HEDGE || this.block[k] === BLK.FOREST)) return true;
    const fv = this.lv[L].furn[k];
    if (fv) {
      const f = this.furnRef[fv - 1];
      if (f && f.tall) return true;
    }
    return false;
  }
  // c'è un pavimento su cui stare a questo livello?
  hasFloor(L, i, j) {
    if (!this.inb(i, j)) return false;
    if (L === 0) return true;
    return this.lv[1].floor[j * this.W + i] !== F.NONE;
  }
  // nodo percorribile per i percorsi degli zombie
  walkNode(L, i, j) {
    if (!this.inb(i, j)) return false;
    if (L === 1 && this.lv[1].floor[j * this.W + i] === F.NONE) return false;
    if (L === 0 && this.lv[0].floor[j * this.W + i] === F.FOREST) return false;
    if (this.cellBlocked(L, i, j)) {
      const f = this.furnAt(L, i, j);
      return !!(f && f.barricade);
    }
    return true;
  }
  indoor(L, i, j) {
    if (!this.inb(i, j)) return false;
    const k = j * this.W + i;
    if (this.lv[L].room[k] >= 0) return true;
    if (L === 0) {
      const f1 = this.lv[1].floor[k];
      return f1 !== F.NONE;
    }
    return false;
  }
  // c'è un tetto sopra (per la pioggia)?
  roofed(L, i, j) {
    if (!this.inb(i, j)) return false;
    const k = j * this.W + i;
    if (this.lv[L].room[k] >= 0) return true;
    if (L === 0 && this.lv[1].floor[k] !== F.NONE) return true;
    return false;
  }

  // altezza del terreno/pavimento in un punto
  groundY(L, x, z) {
    const i = Math.floor(x), j = Math.floor(z);
    if (!this.inb(i, j)) return 0;
    const k = j * this.W + i;
    const sk = this.stairCell[k];
    if (sk >= 0) {
      const s = this.stairs[sk];
      if (!s.removed) return this.rampY(s, x, z);
      if (L === 1) return -10; // buco: si cade
    }
    if (L === 0) {
      const fi = FLOOR_INFO[this.lv[0].floor[k]];
      return fi ? fi.y : 0;
    }
    if (this.lv[1].floor[k] === F.NONE) return -10;
    return LEVEL_H;
  }
  rampY(s, x, z) {
    const t = x * s.dx + z * s.dz - s.e0;
    const u = t < 0 ? 0 : t > s.len ? 1 : t / s.len;
    return 0.16 + u * (LEVEL_H - 0.16);
  }

  // ---------------------------------------------------------------- collisioni
  // sposta un cerchio (x,z,raggio) di (dx,dz) contro lati e celle bloccate al livello L
  move(ent, dx, dz, r, L) {
    const len = Math.max(Math.abs(dx), Math.abs(dz));
    const steps = Math.max(1, Math.ceil(len / 0.12));
    const sx = dx / steps, sz = dz / steps;
    for (let s = 0; s < steps; s++) {
      ent.x += sx;
      ent.z += sz;
      this.resolve(ent, r, L);
    }
  }
  resolve(ent, r, L) {
    const W = this.W, H = this.H;
    for (let it = 0; it < 2; it++) {
      const ci = Math.floor(ent.x), cj = Math.floor(ent.z);
      // celle bloccate
      for (let j = cj - 1; j <= cj + 1; j++) {
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (!this.cellBlocked(L, i, j)) continue;
          if (ent.ignoreFurn && this.lv[L].furn[j * W + i] === ent.ignoreFurn) continue;
          pushOutBox(ent, i, j, i + 1, j + 1, r);
        }
      }
      // lati orizzontali (linea z = j, da x=i a x=i+1)
      for (let j = cj - 1; j <= cj + 2; j++) {
        if (j < 0 || j > H) continue;
        for (let i = ci - 1; i <= ci + 1; i++) {
          if (i < 0 || i >= W) continue;
          const id = this.hE[L][j * W + i];
          if (!id) continue;
          const e = this.edges.get(id);
          if (!this.blocksPlayer(e) || e === ent.passEdge) continue;
          pushOutSeg(ent, i, j, i + 1, j, r + 0.06);
        }
      }
      // lati verticali (linea x = i, da z=j a z=j+1)
      for (let j = cj - 1; j <= cj + 1; j++) {
        if (j < 0 || j >= H) continue;
        for (let i = ci - 1; i <= ci + 2; i++) {
          if (i < 0 || i > W) continue;
          const id = this.vE[L][j * (W + 1) + i];
          if (!id) continue;
          const e = this.edges.get(id);
          if (!this.blocksPlayer(e) || e === ent.passEdge) continue;
          pushOutSeg(ent, i, j, i, j + 1, r + 0.06);
        }
      }
      // bordi della mappa
      if (ent.x < r) ent.x = r;
      if (ent.z < r) ent.z = r;
      if (ent.x > W - r) ent.x = W - r;
      if (ent.z > H - r) ent.z = H - r;
    }
  }

  // ---------------------------------------------------------------- linea di vista
  // attraversa le celle tra due punti (Amanatides-Woo) e chiama test(lato) / testCell(i,j)
  trace(L, x0, z0, x1, z1, edgeTest, cellTest) {
    let i = Math.floor(x0), j = Math.floor(z0);
    const ie = Math.floor(x1), je = Math.floor(z1);
    const dx = x1 - x0, dz = z1 - z0;
    const si = dx > 0 ? 1 : -1, sj = dz > 0 ? 1 : -1;
    const tdi = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tdj = dz !== 0 ? Math.abs(1 / dz) : Infinity;
    let tmi = dx !== 0 ? (si > 0 ? i + 1 - x0 : x0 - i) * tdi : Infinity;
    let tmj = dz !== 0 ? (sj > 0 ? j + 1 - z0 : z0 - j) * tdj : Infinity;
    let guard = 0;
    while ((i !== ie || j !== je) && guard++ < 512) {
      let e;
      if (tmi < tmj) {
        e = this.vEdge(L, si > 0 ? i + 1 : i, j);
        i += si;
        tmi += tdi;
      } else {
        e = this.hEdge(L, i, sj > 0 ? j + 1 : j);
        j += sj;
        tmj += tdj;
      }
      if (e && edgeTest(e)) return false;
      if (cellTest && (i !== ie || j !== je) && cellTest(i, j)) return false;
      if (!this.inb(i, j)) return false;
    }
    return true;
  }
  los(L, x0, z0, x1, z1) {
    return this.trace(L, x0, z0, x1, z1, (e) => this.blocksSight(e), (i, j) => this.cellBlocksSight(L, i, j));
  }
  // linea percorribile senza ostacoli (per muoversi dritti verso un bersaglio)
  walkLine(L, x0, z0, x1, z1) {
    const t = (e) => this.blocksPlayer(e);
    const c = (i, j) => this.cellBlocked(L, i, j) || (L === 1 && !this.hasFloor(1, i, j));
    return this.trace(L, x0, z0, x1, z1, t, c);
  }
}

export function hasBarricade(e) {
  return (e.bar && e.bar.length > 0) || e.metal > 0;
}
export function barricadeLevel(e) {
  return (e.bar ? e.bar.length : 0) + (e.metal > 0 ? 4 : 0);
}
export function barricadeHp(e) {
  let h = e.metal || 0;
  if (e.bar) for (const p of e.bar) h += p;
  return h;
}

function pushOutBox(ent, x0, z0, x1, z1, r) {
  const cx = ent.x < x0 ? x0 : ent.x > x1 ? x1 : ent.x;
  const cz = ent.z < z0 ? z0 : ent.z > z1 ? z1 : ent.z;
  let dx = ent.x - cx, dz = ent.z - cz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    ent.x = cx + (dx / d) * r;
    ent.z = cz + (dz / d) * r;
  } else {
    // centro dentro la scatola: esci dal lato più vicino
    const l = ent.x - x0, rr = x1 - ent.x, t = ent.z - z0, b = z1 - ent.z;
    const m = Math.min(l, rr, t, b);
    if (m === l) ent.x = x0 - r;
    else if (m === rr) ent.x = x1 + r;
    else if (m === t) ent.z = z0 - r;
    else ent.z = z1 + r;
  }
}

function pushOutSeg(ent, ax, az, bx, bz, r) {
  const vx = bx - ax, vz = bz - az;
  let t = ((ent.x - ax) * vx + (ent.z - az) * vz) / (vx * vx + vz * vz);
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = ax + vx * t, pz = az + vz * t;
  let dx = ent.x - px, dz = ent.z - pz;
  const d2 = dx * dx + dz * dz;
  if (d2 >= r * r) return;
  if (d2 > 1e-9) {
    const d = Math.sqrt(d2);
    ent.x = px + (dx / d) * r;
    ent.z = pz + (dz / d) * r;
  } else {
    // esattamente sulla linea: spingi dal lato da cui si arriva
    const nx = -vz, nz = vx;
    const s = (ent.px !== undefined ? (ent.px - px) * nx + (ent.pz - pz) * nz : 1) >= 0 ? 1 : -1;
    const nl = Math.hypot(nx, nz);
    ent.x = px + (nx / nl) * r * s;
    ent.z = pz + (nz / nl) * r * s;
  }
}
