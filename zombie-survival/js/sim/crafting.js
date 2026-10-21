// Crafting: ricette conosciute, attrezzi giusti, materiali e a volte un banco da lavoro.
// I materiali si prendono da addosso e da quello che c'è a portata di mano (mobili, pavimento, carriola).
import { RECIPES, BENCH_NAMES, SKILLS } from '../data/recipes.js';
import { ITEMS, QUALITY_NAMES } from '../data/items.js';
import { FURN } from '../data/furniture.js';
import { mkItem, matches, ensureFurnItems, hasTool, itemName } from './items.js';
import { clamp } from '../core/util.js';
import { fx } from '../core/rng.js';
import { NOISE } from './noise.js';

export class Crafting {
  constructor(G) {
    this.G = G;
  }

  // fonti di materiali: inventario + vicinanze
  sources(radius = 2.6) {
    const G = this.G;
    const p = G.player;
    const out = [];
    for (const c of G.inv.containers()) out.push({ items: c.items, label: c.name, inv: true });
    const handList = [];
    if (G.inv.hand) handList.push(G.inv.hand);
    if (G.inv.off) handList.push(G.inv.off);
    if (handList.length) out.push({ items: handList, label: 'Mani', hands: true });
    if (G.inv.bulky && G.inv.bulky.kind === 'item') out.push({ items: [G.inv.bulky.item], label: 'In braccio', bulky: true });
    for (const f of G.world.furn) {
      if (f.removed || f.L !== p.L || !FURN[f.type].cont) continue;
      if (Math.abs(f.x - p.x) > radius + 1 || Math.abs(f.z - p.z) > radius + 1) continue;
      if (Math.hypot(f.x - p.x, f.z - p.z) > radius + Math.max(f.w, f.d) / 2) continue;
      out.push({ items: ensureFurnItems(G, f), label: FURN[f.type].n, furn: f });
    }
    for (const [key, list] of G.world.ground) {
      const [L, i, j] = key.split(',').map(Number);
      if (L !== p.L || Math.hypot(i + 0.5 - p.x, j + 0.5 - p.z) > radius) continue;
      out.push({ items: list, label: 'Pavimento', ground: key });
    }
    for (const b of G.world.barrows) {
      if (b.gone || Math.hypot(b.x - p.x, b.z - p.z) > radius + 0.5) continue;
      out.push({ items: b.items, label: 'Carriola', barrow: b });
    }
    return out;
  }

  countIn(srcs, spec) {
    let n = 0;
    for (const s of srcs) for (const it of s.items) if (matches(it, spec)) n += ITEMS[it.id].stack && typeof spec === 'string' ? it.n || 1 : 1;
    return n;
  }

  toolIn(srcs, tag) {
    for (const s of srcs) for (const it of s.items) {
      if (tag === 'dig' && (hasTool(it, 'shovel') || hasTool(it, 'trowel'))) return it;
      if (hasTool(it, tag) && (it.c === undefined || it.c > 0) && (it.n === undefined || it.n > 0 || !ITEMS[it.id].uses)) return it;
    }
    return null;
  }

  benchNear(type, radius = 2.8) {
    const G = this.G, p = G.player;
    for (const f of G.world.furn) {
      if (f.removed || f.L !== p.L) continue;
      const d = FURN[f.type];
      let ok = d.bench === type;
      if (type === 'kitchen' && (f.type === 'stove' || f.type === 'kitchen_camp' || f.type === 'counter')) ok = true;
      if (!ok) continue;
      if (Math.hypot(f.x - p.x, f.z - p.z) <= radius + Math.max(f.w, f.d) / 2) return f;
    }
    return null;
  }

  // fonte di calore: fornello con corrente, falò acceso, cucina da campo accesa
  heatNear(radius = 2.6) {
    const G = this.G, p = G.player;
    for (const f of G.world.furn) {
      if (f.removed || f.L !== p.L) continue;
      if (Math.hypot(f.x - p.x, f.z - p.z) > radius + Math.max(f.w, f.d) / 2) continue;
      if (f.type === 'stove' && G.decay.powerAt(Math.floor(f.x), Math.floor(f.z))) return f;
      if ((f.type === 'campfire' || f.type === 'kitchen_camp') && f.state.fuel > 0) return f;
    }
    return null;
  }

  known(r) {
    return !r.learn || this.G.skills.knows(r.id);
  }

  check(r) {
    const G = this.G;
    const srcs = this.sources();
    const miss = [];
    const lines = [];
    for (const [spec, q] of r.in) {
      const have = this.countIn(srcs, spec);
      const name = specName(spec);
      lines.push({ t: name + (q > 1 ? ' ×' + q : ''), ok: have >= q });
      if (have < q) miss.push(name);
    }
    for (const t of r.tools || []) {
      const ok = !!this.toolIn(srcs, t);
      lines.push({ t: TOOL_NAMES[t] || t, ok, tool: true });
      if (!ok) miss.push(TOOL_NAMES[t] || t);
    }
    if (r.bench) {
      const ok = !!this.benchNear(r.bench);
      lines.push({ t: 'Vicino a: ' + BENCH_NAMES[r.bench], ok });
      if (!ok) miss.push(BENCH_NAMES[r.bench]);
    }
    if (r.heat) {
      const ok = !!this.heatNear();
      lines.push({ t: 'Fonte di calore (fornello con corrente, falò)', ok });
      if (!ok) miss.push('fuoco');
    }
    if (r.needsPower) {
      const b = this.benchNear(r.bench);
      const ok = !!(b && G.decay.powerAt(Math.floor(b.x), Math.floor(b.z)));
      lines.push({ t: 'Corrente elettrica', ok });
      if (!ok) miss.push('corrente');
    }
    for (const k in r.skill || {}) {
      const ok = G.skills.level(k) >= r.skill[k];
      lines.push({ t: SKILLS[k] + ' ' + r.skill[k], ok });
      if (!ok) miss.push(SKILLS[k]);
    }
    return { ok: miss.length === 0, miss, lines, srcs };
  }

  // consuma materiali dalle fonti; ritorna gli oggetti consumati (per la qualità)
  consume(srcs, spec, q) {
    let left = q;
    const used = [];
    // prima addosso, poi intorno
    for (const s of srcs) {
      for (let k = s.items.length - 1; k >= 0 && left > 0; k--) {
        const it = s.items[k];
        if (!matches(it, spec)) continue;
        const d = ITEMS[it.id];
        if (typeof spec === 'object' && (spec.tag === 'water' || spec.tag === 'tainted')) {
          it.liq = Math.max(0, it.liq - (spec.amt || 0.25));
          left--;
          continue;
        }
        if (typeof spec === 'object' && spec.tag === 'fuel') {
          if (d.liq) it.liq = Math.max(0, it.liq - (spec.amt || 0.1));
          else this.useOne(s, k, it);
          left--;
          continue;
        }
        if (d.stack) {
          const take = Math.min(it.n || 1, left);
          it.n = (it.n || 1) - take;
          left -= take;
          if (it.n <= 0) this.removeFrom(s, k, it);
        } else {
          used.push(it);
          this.removeFrom(s, k, it);
          left--;
        }
      }
      if (left <= 0) break;
    }
    return used;
  }
  useOne(s, k, it) {
    it.n = (it.n || 1) - 1;
    if (it.n <= 0) this.removeFrom(s, k, it);
  }
  removeFrom(s, k, it) {
    const G = this.G;
    if (s.hands) {
      G.inv.remove(it.u);
      return;
    }
    if (s.bulky) {
      G.inv.bulky = null;
      G.events.emit('inv');
      return;
    }
    s.items.splice(k, 1);
    if (s.ground) G.events.emit('ground', s.ground);
    if (s.barrow) G.dyn.updateBarrow(s.barrow);
    for (let h = 0; h < 4; h++) if (G.inv.hot[h] === it.u) G.inv.hot[h] = null;
    G.events.emit('inv');
  }

  wearTools(srcs, tools) {
    const G = this.G;
    for (const t of tools || []) {
      const it = this.toolIn(srcs, t);
      if (!it) continue;
      const d = ITEMS[it.id];
      if (d.uses) {
        it.n = (it.n || 1) - 1;
        if (it.n <= 0) {
          const s = srcs.find((x) => x.items.includes(it));
          if (s) this.removeFrom(s, s.items.indexOf(it), it);
          G.hud.toast(d.n + ': finito.');
        }
      } else if (it.c !== undefined) {
        it.c -= 1 / (d.dur || (d.wpn ? d.wpn.dur * 2 : 60));
        if (it.c <= 0) {
          const s = srcs.find((x) => x.items.includes(it));
          if (s) this.removeFrom(s, s.items.indexOf(it), it);
          G.hud.toast(d.n + ': si è rotto.', 'bad');
        }
      }
    }
  }

  craft(r) {
    const G = this.G;
    const c = this.check(r);
    if (!c.ok) {
      G.hud.toast('Ti manca: ' + c.miss.join(', '));
      return false;
    }
    const noisy = r.noise && r.noise >= 8;
    G.actions.start({
      name: r.n, dur: r.time, anim: r.heat ? 'cook' : noisy ? 'hammer' : 'craft', hands: true, repetitive: true,
      noise: r.noise ? { r: r.noise, every: 1 } : null,
      sound: noisy ? { name: (r.tools || []).includes('saw') ? 'saw' : (r.tools || []).includes('welder') ? 'weld' : 'hammer', every: 0.7 } : r.heat ? { name: 'sizzle', every: 2.5 } : { name: 'rustle', every: 1.4 },
      onDone: () => this.finish(r),
    });
    return true;
  }

  finish(r) {
    const G = this.G;
    const c = this.check(r);
    if (!c.ok) {
      G.hud.toast('Mancano i materiali.');
      return;
    }
    const srcs = c.srcs;
    if (r.special === 'boil') {
      for (const s of srcs) for (const it of s.items) {
        const d = ITEMS[it.id];
        if (d.liq && d.liq.kind === 'water' && it.taint && it.liq > 0) {
          it.taint = false;
          G.hud.toast(itemName(it) + ': ora è potabile.', 'good');
          this.xpAll(r);
          G.events.emit('inv');
          return;
        }
      }
      return;
    }
    // possibilità di errore con skill bassa
    let fail = 0;
    for (const k in r.skill || {}) fail = Math.max(fail, 0.22 - G.skills.level(k) * 0.05);
    if (fail > 0 && fx.chance(fail)) {
      for (const [spec, q] of r.in) this.consume(srcs, spec, Math.ceil(q / 2));
      G.hud.toast(r.n + ': è venuto male, materiali sprecati.', 'bad');
      this.xpAll(r, 0.5);
      return;
    }
    for (const [spec, q] of r.in) this.consume(srcs, spec, q);
    this.wearTools(srcs, r.tools);
    if (!r.out) return;
    let [id, n, opts] = r.out;
    opts = Object.assign({}, opts || {});
    if (r.burnable && fx.chance(Math.max(0, 0.22 - G.skills.level('cook') * 0.05))) {
      id = 'burnt_food';
      G.hud.toast('Si è bruciato...', 'bad');
    }
    if (r.quality) opts.q = this.quality(r.quality);
    const d = ITEMS[id];
    if (d.stack) {
      this.give(mkItem(id, Object.assign(opts, { n })));
    } else for (let k = 0; k < n; k++) this.give(mkItem(id, opts));
    if (id === 'stew' || id === 'veg_soup' || id === 'pasta_dish') G.mind.morale = clamp(G.mind.morale + 2, 0, 100);
    this.xpAll(r);
    G.hud.toast('Creato: ' + d.n + (n > 1 ? ' ×' + n : '') + (opts.q !== undefined ? ' (' + QUALITY_NAMES[opts.q] + ')' : ''), 'good');
    G.audio.play('craft');
  }

  quality(skill) {
    const l = this.G.skills.level(skill);
    return clamp(Math.round(l / 3 + fx.range(-0.75, 0.9)), 0, 3);
  }

  xpAll(r, mult = 1) {
    for (const k in r.xp || {}) this.G.skills.xp(k, r.xp[k] * mult);
  }

  // un oggetto finisce addosso, o a terra se non c'è posto
  give(it) {
    const G = this.G;
    const d = ITEMS[it.id];
    if (d.bulky) {
      if (!G.inv.bulky) {
        G.inv.bulky = { kind: 'item', item: it };
        G.events.emit('inv');
      } else G.world.dropAtPlayer(it);
      return;
    }
    if (!G.inv.add(it)) {
      G.world.dropAtPlayer(it);
      G.hud.toast(d.n + ' è a terra: non hai posto.');
    }
  }

  list() {
    return RECIPES.filter((r) => this.known(r));
  }
}

export function specName(spec) {
  if (typeof spec === 'string') return ITEMS[spec].n;
  return {
    cloth: 'Un vestito', stick: 'Ramo o asse', stone: 'Sasso', veg: 'Verdura', water: 'Acqua potabile ' + (spec.amt || 0.25).toString().replace('.', ',') + ' L',
    tainted: 'Acqua da bollire', fuel: 'Benzina o alcol', dressing: 'Benda o straccio',
  }[spec.tag] || spec.tag;
}

export const TOOL_NAMES = {
  hammer: 'Martello', saw: 'Sega', screwdriver: 'Cacciavite', pliers: 'Pinze', needle: 'Ago e filo', welder: 'Saldatrice', propane: 'Bombola di propano',
  wrench: 'Chiave inglese', knife: 'Coltello', opener: 'Apriscatole', fire: 'Accendino o fiammiferi', pot: 'Pentola', pan: 'Padella', shovel: 'Pala',
  trowel: 'Cazzuola o paletta', hose: 'Tubo di gomma', axe: 'Ascia', crowbar: 'Piede di porco', dig: 'Pala o paletta', gascan: 'Tanica', battery: 'Batterie',
};

export { NOISE };
