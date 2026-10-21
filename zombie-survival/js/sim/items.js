// Istanze degli oggetti: creazione, peso, nome visibile, freschezza, generazione del bottino.
import { ITEMS, QUALITY_MULT, QUALITY_NAMES } from '../data/items.js';
import { LOOT } from '../data/loot.js';
import { FURN } from '../data/furniture.js';
import { RNG, hashSeed } from '../core/rng.js';
import { uid, fmtNum } from '../core/util.js';
import { worldValue } from '../config.js';

export function mkItem(id, opts = {}) {
  const d = ITEMS[id];
  if (!d) throw new Error('oggetto sconosciuto: ' + id);
  const it = { u: uid(), id };
  if (d.wpn || d.cloth || (d.tool && d.dur) || (d.c === 'tool' && d.dur)) it.c = opts.c ?? 1;
  if (d.uses) it.n = opts.n ?? d.uses;
  if (d.stack) it.n = opts.n ?? 1;
  if (d.liq) {
    it.liq = opts.liq ?? 0;
    it.taint = !!opts.taint;
  }
  if (d.light && d.light.drain) it.bat = opts.bat ?? 1;
  if (d.light && d.light.burn) it.burn = opts.burn ?? d.light.burn;
  if (d.fun && d.fun.battery) it.bat = opts.bat ?? 1;
  if (d.rot) it.age = opts.age ?? 0;
  if (opts.q !== undefined) it.q = opts.q;
  if (d.bag) it.items = [];
  if (opts.timer) it.timer = true;
  if (opts.dirty) it.dirty = true;
  return it;
}

export function def(it) {
  return ITEMS[it.id];
}

export function itemWeight(it) {
  const d = ITEMS[it.id];
  let w = d.w;
  if (d.stack) w = d.w * (it.n || 1);
  if (d.liq) w += (it.liq || 0) * (d.liq.kind === 'fuel' ? 0.75 : 1);
  if (it.q !== undefined) w *= QUALITY_MULT.w[it.q];
  return w;
}

// peso della borsa piena (per quando la porti in mano o la lasci a terra)
export function totalWeight(it) {
  let w = itemWeight(it);
  if (it.items) for (const x of it.items) w += totalWeight(x);
  return w;
}

export function rotLevel(it) {
  const d = ITEMS[it.id];
  if (!d.rot) return 0;
  const a = it.age || 0;
  if (a < d.rot[0]) return 0;
  if (a < d.rot[1]) return 1;
  return 2;
}

export function itemName(it) {
  const d = ITEMS[it.id];
  let n = d.n;
  if (d.stack && (it.n || 1) > 1) n += ' ×' + it.n;
  if (it.q !== undefined && it.q !== 1) n += ' (' + QUALITY_NAMES[it.q] + ')';
  if (d.liq) {
    if (!it.liq || it.liq < 0.01) n += ' (vuota)';
    else n += ' (' + fmtNum(it.liq, 1) + ' L' + (d.liq.kind === 'water' && it.taint ? ', da bollire' : '') + ')';
  }
  const r = rotLevel(it);
  if (r === 1) n += ' (raffermo)';
  if (r === 2) n += ' (marcio)';
  if (it.wet > 0.3) n += ' (bagnato)';
  if (it.dirty) n += ' (sporco)';
  if (it.timer) n += ' (a tempo)';
  return n;
}

export function condLabel(it) {
  if (it.c === undefined) return '';
  if (it.c <= 0.15) return 'quasi rotto';
  if (it.c <= 0.4) return 'malridotto';
  if (it.c <= 0.75) return 'usato';
  return 'buono';
}

export function hasTool(it, tag) {
  const d = ITEMS[it.id];
  return !!(d.tool && d.tool.includes(tag));
}

// l'oggetto soddisfa un ingrediente/tag di ricetta?
export function matches(it, spec) {
  if (typeof spec === 'string') return it.id === spec;
  const d = ITEMS[it.id];
  switch (spec.tag) {
    case 'cloth':
      return d.c === 'cloth';
    case 'stick':
      return it.id === 'branch' || it.id === 'plank';
    case 'stone':
      return it.id === 'stone';
    case 'veg':
      return ['carrot', 'potato', 'tomato', 'cabbage'].includes(it.id) && rotLevel(it) < 2;
    case 'water':
      return !!(d.liq && d.liq.kind === 'water' && !it.taint && (it.liq || 0) >= (spec.amt || 0.25) - 1e-6);
    case 'tainted':
      return !!(d.liq && d.liq.kind === 'water' && it.taint && (it.liq || 0) >= 0.05);
    case 'fuel':
      return (d.liq && d.liq.kind === 'fuel' && (it.liq || 0) >= (spec.amt || 0.1)) || (d.alcohol && (it.n || 0) >= 1);
    case 'dressing':
      return it.id === 'bandage' || it.id === 'rag' || it.id === 'rag_dirty';
    default:
      return false;
  }
}

// quante "unità" contiene per una ricetta (pile e usi)
export function units(it, spec) {
  const d = ITEMS[it.id];
  if (typeof spec === 'object' && (spec.tag === 'water' || spec.tag === 'fuel' || spec.tag === 'tainted')) return 1;
  if (d.stack) return it.n || 1;
  return 1;
}

// ---------------------------------------------------------------- bottino
export function lootRng(seed, kind, id) {
  return new RNG(hashSeed(seed, kind, id));
}

function rollItem(G, rng, id, ctx) {
  const d = ITEMS[id];
  if (!d) return null;
  const opts = {};
  if (d.stack) opts.n = id === 'nails' || id === 'screws' ? rng.int(8, 40) : id.startsWith('seeds') ? rng.int(3, 8) : id === 'rag' || id === 'rag_dirty' ? rng.int(1, 4) : 1;
  if (d.uses) opts.n = Math.max(1, Math.round(d.uses * rng.range(0.3, 1)));
  if (d.liq) {
    if (id === 'bottle') opts.liq = rng.chance(0.75) ? 1 : rng.range(0, 0.6);
    else if (id === 'gas_can') opts.liq = rng.chance(0.4) ? rng.range(1, 8) : 0;
    else opts.liq = 0;
  }
  if (d.light && d.light.drain) opts.bat = rng.range(0.15, 1);
  if (d.fun && d.fun.battery) opts.bat = rng.range(0.1, 1);
  if (d.wpn || d.cloth || d.dur) opts.c = rng.range(0.45, 1);
  if (d.rot) opts.age = ctx.age || 0;
  return mkItem(id, opts);
}

// età (in giorni di decomposizione) del cibo trovato ora in un contenitore mai aperto
export function initialAge(G, cold) {
  const days = G.clock.days;
  const decay = worldValue(G.settings, 'decay');
  const powerDay = G.decay ? G.decay.powerCutDay : 7;
  if (!cold) return days * decay;
  const powered = Math.min(days, powerDay);
  return (powered * 0.25 + Math.max(0, days - powerDay)) * decay;
}

export function ensureFurnItems(G, f) {
  if (f.items) return f.items;
  f.items = [];
  const def = FURN[f.type];
  if (!def || !def.cont) return f.items;
  const table = LOOT[f.loot || def.cont.loot];
  const rng = lootRng(G.settings.seed, 'f', f.id);
  const age = initialAge(G, !!def.cold);
  if (table) {
    const zoneMult = [0.95, 1.15, 1, 1.15][f.zone] || 1;
    const mult = (f.lootMult || 1) * zoneMult;
    let n = rng.int(table.n[0], table.n[1]);
    n = Math.round(n * mult + (rng.chance((n * mult) % 1) ? 1 : 0));
    for (let k = 0; k < n; k++) {
      const id = rng.weighted(table.items);
      const it = rollItem(G, rng, id, { age });
      if (it) f.items.push(it);
    }
  }
  if (f.guaranteed) {
    for (const [id, n, opts] of f.guaranteed) {
      const d = ITEMS[id];
      const o = Object.assign({}, opts || {});
      if (d.stack) o.n = n || 1;
      f.items.push(mkItem(id, o));
    }
  }
  return f.items;
}

export function ensureCarItems(G, car, part) {
  const key = part === 'trunk' ? 'trunk' : 'glove';
  if (car[key]) return car[key];
  car[key] = [];
  const table = LOOT[part === 'trunk' ? 'car_trunk' : 'car_glovebox'];
  const rng = lootRng(G.settings.seed, 'car' + key, car.id);
  const n = rng.int(table.n[0], table.n[1]);
  for (let k = 0; k < n; k++) {
    const it = rollItem(G, rng, rng.weighted(table.items), { age: initialAge(G, false) });
    if (it) car[key].push(it);
  }
  return car[key];
}

export function zombieLoot(G, rng) {
  const table = LOOT.zombie;
  const out = [];
  const n = rng.int(table.n[0], table.n[1]);
  for (let k = 0; k < n; k++) {
    const it = rollItem(G, rng, rng.weighted(table.items), { age: 5 });
    if (it) out.push(it);
  }
  return out;
}

// valore di "utilità" approssimativo per ordinare la lista
export function sortItems(list) {
  const order = { weapon: 0, tool: 1, med: 2, food: 3, drink: 4, mat: 5, seed: 6, cloth: 7, bag: 8, lit: 9, misc: 10 };
  return list.sort((a, b) => (order[ITEMS[a.id].c] - order[ITEMS[b.id].c]) || ITEMS[a.id].n.localeCompare(ITEMS[b.id].n));
}
