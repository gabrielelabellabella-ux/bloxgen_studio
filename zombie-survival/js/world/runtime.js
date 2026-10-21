// Stato vivo del mondo sopra la mappa generata: oggetti a terra, cadaveri, pezzi costruiti, carriole.
import { mkItem } from '../sim/items.js';
import { ITEMS } from '../data/items.js';

export function initRuntime(G, W) {
  W.ground = new Map();
  W.corpses = [];
  W.nextCorpse = 1;
  W.builtFloors = new Map();
  W.barrows = (W.barrows || []).map((b, id) => ({ id, x: b.x, z: b.z, L: b.L || 0, yaw: b.yaw || 0, items: [] }));
  W.nextBarrow = W.barrows.length;
  W.groundKey = (L, i, j) => L + ',' + i + ',' + j;
  W.addGround = (L, i, j, it) => {
    const k = W.groundKey(L, i, j);
    let l = W.ground.get(k);
    if (!l) {
      l = [];
      W.ground.set(k, l);
    }
    l.push(it);
    G.events.emit('ground', k);
    return k;
  };
  W.removeGround = (k, it) => {
    const l = W.ground.get(k);
    if (!l) return;
    const i = l.indexOf(it);
    if (i >= 0) l.splice(i, 1);
    if (!l.length) W.ground.delete(k);
    G.events.emit('ground', k);
  };
  W.dropAtPlayer = (it) => {
    const p = G.player;
    const g = G.grid;
    let i = Math.floor(p.x), j = Math.floor(p.z);
    const L = p.L;
    if (g.cellBlocked(L, i, j)) {
      for (const [dx, dz] of [[0, 1], [1, 0], [0, -1], [-1, 0]]) {
        if (!g.cellBlocked(L, i + dx, j + dz) && !g.blocksPlayer(g.edgeBetween(L, i, j, i + dx, j + dz))) {
          i += dx;
          j += dz;
          break;
        }
      }
    }
    return W.addGround(L, i, j, it);
  };
  for (const gi of W.groundInit || []) {
    const d = ITEMS[gi.id];
    if (!d) continue;
    if (d.stack) W.addGround(gi.L, gi.i, gi.j, mkItem(gi.id, { n: gi.n }));
    else for (let n = 0; n < (gi.n || 1); n++) W.addGround(gi.L, gi.i, gi.j, mkItem(gi.id, gi.id === 'pipe' ? { c: 0.8 } : {}));
  }
}
