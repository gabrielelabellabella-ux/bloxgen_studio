// Percorsi degli zombie: campi di flusso (Dijkstra dal bersaglio verso l'esterno) condivisi da tutti gli
// zombie che vanno nello stesso posto. Porte, finestre e barricate hanno un costo: se la strada
// alternativa è lunga, gli zombie scelgono di sfondare.

class Heap {
  constructor(cap) {
    this.c = new Float32Array(cap);
    this.n = new Int32Array(cap);
    this.size = 0;
  }
  push(cost, node) {
    if (this.size >= this.c.length) {
      const c2 = new Float32Array(this.c.length * 2);
      c2.set(this.c);
      const n2 = new Int32Array(this.n.length * 2);
      n2.set(this.n);
      this.c = c2;
      this.n = n2;
    }
    let i = this.size++;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.c[p] <= cost) break;
      this.c[i] = this.c[p];
      this.n[i] = this.n[p];
      i = p;
    }
    this.c[i] = cost;
    this.n[i] = node;
  }
  pop() {
    const topN = this.n[0];
    this.topC = this.c[0];
    const lc = this.c[--this.size], ln = this.n[this.size];
    let i = 0;
    for (;;) {
      let l = 2 * i + 1;
      if (l >= this.size) break;
      const r = l + 1;
      if (r < this.size && this.c[r] < this.c[l]) l = r;
      if (this.c[l] >= lc) break;
      this.c[i] = this.c[l];
      this.n[i] = this.n[l];
      i = l;
    }
    this.c[i] = lc;
    this.n[i] = ln;
    return topN;
  }
}

const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

export class Paths {
  constructor(G) {
    this.G = G;
    this.cache = new Map();
    this.heap = new Heap(4096);
    this.computed = 0;
  }

  get grid() {
    return this.G.grid;
  }

  // nodo del grafo per un'entità: sulle scale si usa sempre il livello terra
  nodeOf(x, y, z) {
    const g = this.grid;
    const i = Math.max(0, Math.min(g.W - 1, Math.floor(x)));
    const j = Math.max(0, Math.min(g.H - 1, Math.floor(z)));
    const k = g.idx(i, j);
    const s = g.stairCell[k] >= 0 ? g.stairs[g.stairCell[k]] : null;
    if (s && !s.removed) return k;
    return (y > 1.5 ? g.N : 0) + k;
  }

  // vicini di un nodo: chiama fn(nodo, costo, lato)
  neighbors(node, fn) {
    const g = this.grid;
    const L = node >= g.N ? 1 : 0;
    const k = node - L * g.N;
    const i = k % g.W, j = (k / g.W) | 0;
    for (const [dx, dz] of ORTHO) {
      const ni = i + dx, nj = j + dz;
      if (!g.walkNode(L, ni, nj)) continue;
      const e = g.edgeBetween(L, i, j, ni, nj);
      const c = g.zombieEdgeCost(e);
      if (c < 0) continue;
      let cost = 10 + c;
      const f = g.furnAt(L, ni, nj);
      if (f && f.barricade) cost += 120;
      fn(L * g.N + g.idx(ni, nj), cost, e);
    }
    for (const [dx, dz] of DIAG) {
      const ni = i + dx, nj = j + dz;
      if (!g.walkNode(L, ni, nj) || !g.walkNode(L, i + dx, j) || !g.walkNode(L, i, j + dz)) continue;
      if (g.cellBlocked(L, ni, nj) || g.cellBlocked(L, i + dx, j) || g.cellBlocked(L, i, j + dz)) continue;
      if (g.edgeBetween(L, i, j, i + dx, j) || g.edgeBetween(L, i, j, i, j + dz) || g.edgeBetween(L, i + dx, j, ni, nj) || g.edgeBetween(L, i, j + dz, ni, nj)) continue;
      if (L === 0 && (g.stairCell[g.idx(ni, nj)] >= 0 || g.stairCell[k] >= 0)) continue;
      fn(L * g.N + g.idx(ni, nj), 14, null);
    }
    // collegamenti delle scale
    if (L === 0) {
      const sk = g.stairCell[k];
      if (sk >= 0) {
        const s = g.stairs[sk];
        const last = s.cells[s.cells.length - 1];
        if (!s.removed && last[0] === i && last[1] === j) fn(g.N + g.idx(s.top[0], s.top[1]), 10, null);
      }
    } else {
      for (const s of g.stairs) {
        if (s.removed || s.top[0] !== i || s.top[1] !== j) continue;
        const last = s.cells[s.cells.length - 1];
        fn(g.idx(last[0], last[1]), 10, null);
      }
    }
  }

  compute(target, maxCost) {
    const g = this.grid;
    const dist = new Float32Array(g.N * 2).fill(Infinity);
    const h = this.heap;
    h.size = 0;
    dist[target] = 0;
    h.push(0, target);
    let n = 0;
    while (h.size) {
      const node = h.pop();
      const dc = h.topC;
      if (dc > dist[node]) continue;
      if (dc > maxCost) break;
      n++;
      this.neighbors(node, (nb, cost) => {
        const nd = dc + cost;
        if (nd < dist[nb]) {
          dist[nb] = nd;
          h.push(nd, nb);
        }
      });
    }
    this.computed++;
    return { target, dist, maxCost, version: g.version, t: 0, expanded: n };
  }

  get(target, maxCost = 600) {
    const g = this.grid;
    let f = this.cache.get(target);
    if (f && f.version === g.version && f.maxCost >= maxCost) {
      f.t = performance.now();
      return f;
    }
    f = this.compute(target, maxCost);
    f.t = performance.now();
    this.cache.set(target, f);
    if (this.cache.size > 12) {
      let oldK = -1, oldT = Infinity;
      for (const [k, v] of this.cache) if (v.t < oldT) {
        oldT = v.t;
        oldK = k;
      }
      this.cache.delete(oldK);
    }
    return f;
  }

  invalidate() {
    this.cache.clear();
  }

  // prossimo passo dal nodo `from` lungo il campo: {node, edge, cost}
  next(field, from) {
    let best = null, bestD = field.dist[from];
    if (!isFinite(bestD)) {
      // fuori dal campo: nessun suggerimento
      return null;
    }
    this.neighbors(from, (nb, cost, e) => {
      const d = field.dist[nb] + cost * 0.001;
      if (d < bestD - 1e-3) {
        bestD = d;
        best = { node: nb, edge: e };
      }
    });
    return best;
  }

  nodeCenter(node) {
    const g = this.grid;
    const L = node >= g.N ? 1 : 0;
    const k = node - L * g.N;
    return { L, i: k % g.W, j: (k / g.W) | 0, x: (k % g.W) + 0.5, z: ((k / g.W) | 0) + 0.5 };
  }
}
