// Salvataggi: la mappa si rigenera dalla seed, si salvano solo le differenze (cosa è stato saccheggiato,
// costruito, distrutto), più giocatore, zombie, meteo e tempo. Sta nel browser (localStorage).
import { SAVE_KEY } from '../config.js';
import { safeStorageGet, safeStorageSet, safeStorageDel, bumpUid, currentUid } from '../core/util.js';
import { F } from '../world/grid.js';

const EDGE_KEYS = ['st', 'hp', 'bar', 'barMax', 'metal', 'metalMax', 'cover', 'cleared', 'barSide', 'swing', 'curtain'];
const FURN_KEYS = ['i', 'j', 'L', 'rot', 'w', 'd', 'x', 'z'];

export function snapshotInit(W) {
  W.edgeInit = new Map();
  for (const e of W.grid.edges.values()) W.edgeInit.set(e.id, JSON.stringify(EDGE_KEYS.map((k) => e[k])));
  W.furnInitCount = W.furn.length;
  W.furnInit = W.furn.map((f) => JSON.stringify(FURN_KEYS.map((k) => f[k])) + JSON.stringify(f.state));
}

export class Save {
  constructor(G) {
    this.G = G;
    this.lastSave = 0;
  }

  has() {
    return !!safeStorageGet(SAVE_KEY);
  }
  peek() {
    const s = safeStorageGet(SAVE_KEY);
    if (!s) return null;
    try {
      const d = JSON.parse(s);
      return { day: Math.floor(d.clock / 1440) + 1, time: d.clock, name: d.player && d.player.name, dead: d.dead };
    } catch (e) {
      return null;
    }
  }
  load() {
    const s = safeStorageGet(SAVE_KEY);
    if (!s) return null;
    try {
      return JSON.parse(s);
    } catch (e) {
      return null;
    }
  }
  clear() {
    safeStorageDel(SAVE_KEY);
  }

  save(reason) {
    const G = this.G;
    if (G.state === 'menu' || !G.world) return false;
    try {
      const data = this.serialize();
      const ok = safeStorageSet(SAVE_KEY, JSON.stringify(data));
      this.lastSave = G.clock.min;
      if (ok && reason === 'manual') G.hud.toast('Partita salvata.', 'good');
      if (!ok && reason === 'manual') G.hud.toast('Salvataggio non riuscito: il browser non permette di salvare.', 'bad');
      return ok;
    } catch (e) {
      console.error(e);
      return false;
    }
  }

  serialize() {
    const G = this.G;
    const W = G.world;
    const g = G.grid;
    const edges = [];
    for (const e of g.edges.values()) {
      if (e.built) {
        edges.push({ b: 1, L: e.L, o: e.o, i: e.i, j: e.j, t: e.t, bmat: e.bmat, mat: e.mat, hp: e.hp, maxHp: e.maxHp, st: e.st, h: e.h, piece: e.piece, bar: e.bar, barMax: e.barMax, metal: e.metal, metalMax: e.metalMax, cover: e.cover, cleared: e.cleared, frame: e.frame, swing: e.swing, barSide: e.barSide });
        continue;
      }
      const cur = JSON.stringify(EDGE_KEYS.map((k) => e[k]));
      if (cur !== W.edgeInit.get(e.id)) {
        const o = { id: e.id };
        for (const k of EDGE_KEYS) if (e[k] !== undefined) o[k] = e[k];
        edges.push(o);
      }
    }
    const furn = [];
    W.furn.forEach((f, idx) => {
      if (idx >= W.furnInitCount) {
        furn.push({ new: 1, ...strip(f) });
        return;
      }
      const moved = JSON.stringify(FURN_KEYS.map((k) => f[k])) + JSON.stringify(f.state) !== W.furnInit[idx];
      if (f.items || f.searched || f.removed || moved || f.carried || f.barricade || f.hp !== undefined) {
        const o = { id: f.id };
        if (f.items) o.items = f.items;
        if (f.searched) o.searched = 1;
        if (f.removed) o.removed = 1;
        if (f.carried) o.carried = 1;
        if (f.barricade) o.barricade = 1;
        if (f.hp !== undefined) o.hp = f.hp;
        if (f.wild) o.wild = 1;
        if (moved) {
          for (const k of FURN_KEYS) o[k] = f[k];
          o.state = f.state;
        }
        furn.push(o);
      }
    });
    const inv = G.inv;
    const bulky = inv.bulky ? (inv.bulky.kind === 'item' ? { kind: 'item', item: inv.bulky.item } : inv.bulky.kind === 'furn' ? { kind: 'furn', id: inv.bulky.f.id } : inv.bulky.kind === 'corpse' ? { kind: 'corpse', id: inv.bulky.c.id } : { kind: 'barrow', id: inv.bulky.b.id }) : null;
    const p = G.player;
    return {
      v: 1,
      savedAt: Date.now(),
      settings: G.settings,
      clock: G.clock.min,
      uid: currentUid(),
      player: { x: p.x, y: p.y, z: p.z, L: p.L, yaw: p.yaw, pitch: p.pitch, name: G.charName },
      body: G.body.serialize(),
      mind: G.mind.serialize(),
      skills: G.skills.serialize(),
      inv: { hand: inv.hand, off: inv.off, bulky, worn: inv.worn, bags: inv.bags, pockets: inv.pockets, hot: inv.hot },
      world: {
        edges, furn,
        ground: [...W.ground.entries()],
        corpses: W.corpses.map((c) => ({ ...c, carried: false })),
        nextCorpse: W.nextCorpse,
        floors: [...W.builtFloors.entries()],
        barrows: W.barrows.map((b) => ({ id: b.id, x: b.x, z: b.z, L: b.L, yaw: b.yaw, items: b.items, gone: b.gone })),
        cars: W.cars.map((c) => ({ fuel: c.fuel, trunk: c.trunk, glove: c.glove, dismantled: c.dismantled, battery: c.battery })),
        stairs: g.stairs.map((s) => ({ removed: s.removed, rope: s.rope })),
        explored: G.explored ? b64(G.explored) : null,
      },
      zombies: G.zombies.serialize(),
      weather: G.weather.serialize(),
      decay: G.decay.serialize(),
      stats: G.stats,
      lastBed: G.lastBed || null,
      mapRevealed: !!G.mapRevealed,
      oldSelf: G.oldSelf || null,
      dead: G.state === 'dead',
    };
  }

  // applica un salvataggio a un mondo appena rigenerato dalla stessa seed
  apply(d) {
    const G = this.G;
    const W = G.world;
    const g = G.grid;
    G.clock.min = d.clock;
    bumpUid(d.uid || 1);
    for (const e of d.world.edges) {
      if (e.b) {
        g.setEdge(e.L, e.o, e.i, e.j, { t: e.t, built: true, bmat: e.bmat, mat: e.mat, hp: e.hp, maxHp: e.maxHp, st: e.st, h: e.h, piece: e.piece, bar: e.bar, barMax: e.barMax, metal: e.metal || 0, metalMax: e.metalMax, cover: e.cover, cleared: e.cleared, frame: e.frame, swing: e.swing, barSide: e.barSide });
        continue;
      }
      const ed = g.edges.get(e.id);
      if (!ed) continue;
      for (const k of EDGE_KEYS) if (e[k] !== undefined) ed[k] = e[k];
    }
    for (const f of d.world.furn) {
      if (f.new) {
        const nf = { ...f };
        delete nf.new;
        nf.id = W.furn.length;
        W.furn.push(nf);
        if (!nf.removed && !nf.carried) for (let jj = nf.j; jj < nf.j + nf.d; jj++) for (let ii = nf.i; ii < nf.i + nf.w; ii++) g.lv[nf.L].furn[g.idx(ii, jj)] = nf.id + 1;
        continue;
      }
      const of = W.furn[f.id];
      if (!of) continue;
      // togli dalla vecchia posizione
      for (let jj = of.j; jj < of.j + of.d; jj++) for (let ii = of.i; ii < of.i + of.w; ii++) if (g.lv[of.L].furn[g.idx(ii, jj)] === of.id + 1) g.lv[of.L].furn[g.idx(ii, jj)] = 0;
      if (f.items) of.items = f.items;
      of.searched = !!f.searched;
      of.removed = !!f.removed;
      of.carried = !!f.carried;
      of.barricade = !!f.barricade;
      if (f.hp !== undefined) of.hp = f.hp;
      if (f.wild !== undefined) of.wild = !!f.wild;
      else if (f.state) of.wild = false;
      if (f.i !== undefined) {
        for (const k of FURN_KEYS) of[k] = f[k];
        of.state = f.state;
      }
      if (!of.removed && !of.carried) for (let jj = of.j; jj < of.j + of.d; jj++) for (let ii = of.i; ii < of.i + of.w; ii++) g.lv[of.L].furn[g.idx(ii, jj)] = of.id + 1;
    }
    W.ground = new Map(d.world.ground);
    W.corpses = d.world.corpses || [];
    W.nextCorpse = d.world.nextCorpse || W.corpses.length + 1;
    W.builtFloors = new Map(d.world.floors || []);
    for (const pc of W.builtFloors.values()) {
      if (pc.L === 0) g.lv[0].floor[g.idx(pc.i, pc.j)] = { wood: F.FOUND_WOOD, metal: F.FOUND_METAL, cement: F.FOUND_CEMENT }[pc.mat];
      else g.lv[1].floor[g.idx(pc.i, pc.j)] = { wood: F.PF_WOOD, metal: F.PF_METAL, cement: F.PF_CEMENT }[pc.mat];
    }
    W.barrows = (d.world.barrows || []).map((b) => ({ ...b, held: false }));
    (d.world.cars || []).forEach((c, k) => {
      if (W.cars[k]) Object.assign(W.cars[k], c);
    });
    (d.world.stairs || []).forEach((s, k) => {
      if (g.stairs[k]) Object.assign(g.stairs[k], s);
    });
    g.version++;
    if (d.world.explored) G.explored = unb64(d.world.explored, g.W * g.H);
    G.zombies.load(d.zombies);
    G.weather.load(d.weather);
    G.decay.load(d.decay);
    G.stats = d.stats || G.stats;
    G.lastBed = d.lastBed;
    G.mapRevealed = !!d.mapRevealed;
    G.oldSelf = d.oldSelf || null;
    G.charName = d.player.name || G.charName;
    G.body.load(d.body);
    G.mind.load(d.mind);
    G.skills.load(d.skills);
    const inv = G.inv;
    inv.reset();
    inv.hand = d.inv.hand;
    inv.off = d.inv.off;
    inv.worn = d.inv.worn;
    inv.bags = d.inv.bags;
    inv.pockets = d.inv.pockets;
    inv.hot = d.inv.hot || [null, null, null, null];
    if (d.inv.bulky) {
      const b = d.inv.bulky;
      if (b.kind === 'item') inv.bulky = { kind: 'item', item: b.item };
      else if (b.kind === 'furn' && W.furn[b.id]) inv.bulky = { kind: 'furn', f: W.furn[b.id] };
      else if (b.kind === 'corpse') {
        const c = W.corpses.find((x) => x.id === b.id);
        if (c) {
          c.carried = true;
          inv.bulky = { kind: 'corpse', c };
        }
      } else if (b.kind === 'barrow') {
        const br = W.barrows.find((x) => x.id === b.id);
        if (br) {
          br.held = true;
          inv.bulky = { kind: 'barrow', b: br };
        }
      }
    }
    const p = d.player;
    G.player.reset(p.x, p.z, p.L, p.yaw);
    G.player.y = p.y;
    G.player.pitch = p.pitch || 0;
  }

  // codice di salvataggio da copiare (backup manuale tra dispositivi)
  exportCode() {
    const s = JSON.stringify(this.serialize());
    return btoa(unescape(encodeURIComponent(s)));
  }
  importCode(code) {
    try {
      const s = decodeURIComponent(escape(atob(code.trim())));
      const d = JSON.parse(s);
      if (!d || d.v !== 1) return null;
      safeStorageSet(SAVE_KEY, s);
      return d;
    } catch (e) {
      return null;
    }
  }
}

function strip(f) {
  const o = {};
  for (const k in f) {
    if (k === 'def' || k.startsWith('_')) continue;
    o[k] = f[k];
  }
  return o;
}

function b64(u8) {
  let s = '';
  for (let k = 0; k < u8.length; k++) s += String.fromCharCode(u8[k]);
  return btoa(s);
}
function unb64(str, n) {
  const s = atob(str);
  const u8 = new Uint8Array(n);
  for (let k = 0; k < Math.min(n, s.length); k++) u8[k] = s.charCodeAt(k);
  return u8;
}
