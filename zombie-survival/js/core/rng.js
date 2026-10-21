// RNG deterministico: la stessa seed rigenera lo stesso mondo (layout, mobili, bottino).

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(...parts) {
  let h = 2166136261 >>> 0;
  for (const p of parts) {
    const s = String(p);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= 0x9e3779b9;
    h = Math.imul(h, 2246822519) >>> 0;
  }
  return h >>> 0;
}

export class RNG {
  constructor(seed) {
    this.seed = seed >>> 0;
    this.f = mulberry32(this.seed);
  }
  next() {
    return this.f();
  }
  range(a, b) {
    return a + (b - a) * this.f();
  }
  int(a, b) {
    return a + Math.floor(this.f() * (b - a + 1));
  }
  chance(p) {
    return this.f() < p;
  }
  pick(arr) {
    return arr[Math.floor(this.f() * arr.length)];
  }
  sign() {
    return this.f() < 0.5 ? -1 : 1;
  }
  gauss() {
    let u = 0, v = 0;
    while (u === 0) u = this.f();
    while (v === 0) v = this.f();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }
  weighted(entries) {
    let tot = 0;
    for (const e of entries) tot += e[1];
    let r = this.f() * tot;
    for (const e of entries) {
      r -= e[1];
      if (r <= 0) return e[0];
    }
    return entries[entries.length - 1][0];
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.f() * (i + 1));
      const t = arr[i];
      arr[i] = arr[j];
      arr[j] = t;
    }
    return arr;
  }
}

// RNG "usa e getta" non deterministico per effetti cosmetici
export const fx = {
  r: Math.random,
  range: (a, b) => a + (b - a) * Math.random(),
  int: (a, b) => a + Math.floor(Math.random() * (b - a + 1)),
  chance: (p) => Math.random() < p,
  pick: (arr) => arr[Math.floor(Math.random() * arr.length)],
};
