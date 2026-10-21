// Inventario a peso: quello che porti rallenta, stanca e fa rumore. Tasche, cintura, borsa e zaino
// aggiungono capienza e riducono il peso percepito. Quello che hai in mano è pronto; il resto va estratto.
import { ITEMS } from '../data/items.js';
import { FURN } from '../data/furniture.js';
import { itemWeight, totalWeight, mkItem, matches, hasTool, itemName } from './items.js';

export const POCKETS = { cap: 4, red: 0, eq: 0.8, name: 'Tasche' };
export const SLOT_NAMES = { head: 'Testa', torso_in: 'Busto (sotto)', torso_out: 'Busto (sopra)', hands: 'Mani', legs: 'Gambe', feet: 'Piedi' };
export const BAG_SLOT_NAMES = { back: 'Schiena', shoulder: 'Spalla', belt: 'Cintura' };
export const COMFORT_KG = 9;

export class Inventory {
  constructor(G) {
    this.G = G;
    this.reset();
  }

  reset() {
    this.hand = null;
    this.off = null;
    this.bulky = null; // {kind:'item', item} | {kind:'furn', f} | {kind:'corpse', c} | {kind:'barrow', b}
    this.worn = { head: null, torso_in: null, torso_out: null, hands: null, legs: null, feet: null };
    this.bags = { back: null, shoulder: null, belt: null };
    this.pockets = [];
    this.hot = [null, null, null, null];
  }

  starterKit() {
    this.reset();
    this.worn.torso_in = mkItem('tshirt', { c: 0.9 });
    this.worn.torso_out = mkItem('hoodie', { c: 0.85 });
    this.worn.legs = mkItem('jeans', { c: 0.9 });
    this.worn.feet = mkItem('sneakers', { c: 0.85 });
    this.pockets.push(mkItem('photo'), mkItem('crackers'), mkItem('lighter', { n: 30 }));
  }

  // ---------------------------------------------------------------- contenitori
  containers() {
    const out = [{ key: 'pockets', name: 'Tasche', items: this.pockets, cap: POCKETS.cap, red: 0, eq: POCKETS.eq }];
    for (const slot of ['belt', 'shoulder', 'back']) {
      const b = this.bags[slot];
      if (!b) continue;
      const d = ITEMS[b.id].bag;
      out.push({ key: 'bag:' + slot, name: ITEMS[b.id].n, items: b.items, cap: d.cap, red: d.red, eq: d.eq, bag: b });
    }
    return out;
  }
  container(key) {
    return this.containers().find((c) => c.key === key);
  }
  load(c) {
    let w = 0;
    for (const it of c.items) w += totalWeight(it);
    return w;
  }
  free(c) {
    return c.cap - this.load(c);
  }

  // peso percepito totale
  weight() {
    let w = 0;
    for (const c of this.containers()) {
      const l = this.load(c);
      w += l * (1 - c.red);
      if (c.bag) w += itemWeight(c.bag);
    }
    if (this.hand) w += totalWeight(this.hand);
    if (this.off) w += totalWeight(this.off);
    for (const s in this.worn) if (this.worn[s]) w += itemWeight(this.worn[s]) * 0.4;
    w += this.bulkyWeight();
    return w;
  }
  bulkyWeight() {
    const b = this.bulky;
    if (!b) return 0;
    if (b.kind === 'item') return totalWeight(b.item);
    if (b.kind === 'furn') return FURN[b.f.type].move || 20;
    if (b.kind === 'corpse') return 55;
    if (b.kind === 'barrow') {
      let w = 3;
      for (const it of b.b.items) w += totalWeight(it) * 0.25;
      return w;
    }
    return 0;
  }
  // livello di ingombro 0..4
  encumbrance() {
    const w = this.weight();
    if (w <= COMFORT_KG) return 0;
    if (w <= COMFORT_KG + 4) return 1;
    if (w <= COMFORT_KG + 9) return 2;
    if (w <= COMFORT_KG + 16) return 3;
    return 4;
  }

  // tutti gli oggetti portati (con dove si trovano)
  *entries() {
    if (this.hand) yield { it: this.hand, where: 'hand' };
    if (this.off) yield { it: this.off, where: 'off' };
    for (const c of this.containers()) for (const it of c.items) yield { it, where: c.key, c };
    for (const s in this.worn) if (this.worn[s]) yield { it: this.worn[s], where: 'worn:' + s };
    for (const s in this.bags) if (this.bags[s]) yield { it: this.bags[s], where: 'bagslot:' + s };
    if (this.bulky && this.bulky.kind === 'item') yield { it: this.bulky.item, where: 'bulky' };
  }
  find(u) {
    for (const e of this.entries()) if (e.it.u === u) return e;
    return null;
  }
  findId(id) {
    for (const e of this.entries()) if (e.it.id === id) return e;
    return null;
  }
  // oggetti usabili (non indossati)
  usable() {
    const out = [];
    for (const e of this.entries()) if (!e.where.startsWith('worn') && !e.where.startsWith('bagslot')) out.push(e);
    return out;
  }

  remove(u) {
    const e = this.find(u);
    if (!e) return null;
    const it = e.it;
    if (e.where === 'hand') this.hand = null;
    else if (e.where === 'off') this.off = null;
    else if (e.where === 'bulky') this.bulky = null;
    else if (e.where.startsWith('worn:')) this.worn[e.where.slice(5)] = null;
    else if (e.where.startsWith('bagslot:')) this.bags[e.where.slice(8)] = null;
    else {
      const i = e.c.items.indexOf(it);
      if (i >= 0) e.c.items.splice(i, 1);
    }
    for (let k = 0; k < 4; k++) if (this.hot[k] === u) this.hot[k] = null;
    this.G.events.emit('inv');
    return it;
  }

  // trova il contenitore migliore e aggiunge l'oggetto; ritorna la chiave o null
  add(it, pref) {
    const d = ITEMS[it.id];
    if (d.bulky) return null;
    const w = totalWeight(it);
    // le pile si uniscono
    if (d.stack) {
      for (const c of this.containers()) {
        const same = c.items.find((x) => x.id === it.id && !x.dirty === !it.dirty);
        if (same && this.free(c) >= w - 1e-6) {
          same.n = (same.n || 1) + (it.n || 1);
          this.G.events.emit('inv');
          return c.key;
        }
      }
    }
    const conts = this.containers();
    let order = conts;
    if (pref) order = [conts.find((c) => c.key === pref), ...conts.filter((c) => c.key !== pref)].filter(Boolean);
    else if (d.wpn || d.tool) order = [...conts.filter((c) => c.key === 'bag:belt'), ...conts.filter((c) => c.key !== 'bag:belt')];
    else if (w <= 0.5) order = conts;
    else order = [...conts.filter((c) => c.key.startsWith('bag:back')), ...conts.filter((c) => c.key.startsWith('bag:shoulder')), ...conts.filter((c) => !c.key.startsWith('bag:back') && !c.key.startsWith('bag:shoulder'))];
    for (const c of order) {
      if (c.bag === it) continue;
      if (this.free(c) >= w - 1e-6) {
        c.items.push(it);
        this.G.events.emit('inv');
        return c.key;
      }
    }
    return null;
  }

  // sposta in un contenitore specifico
  moveTo(u, key) {
    const e = this.find(u);
    if (!e) return false;
    const c = this.container(key);
    if (!c || c.bag === e.it) return false;
    if (this.free(c) < totalWeight(e.it) - 1e-6) return false;
    this.remove(u);
    c.items.push(e.it);
    this.G.events.emit('inv');
    return true;
  }

  // tempo per tirare fuori un oggetto dal punto in cui si trova
  equipTime(u) {
    const e = this.find(u);
    if (!e) return 0;
    if (e.where === 'hand' || e.where === 'off') return 0;
    if (e.c) return e.c.eq;
    return 0.6;
  }

  // ---------------------------------------------------------------- conteggi e consumo (solo addosso)
  count(spec) {
    let n = 0;
    for (const e of this.usable()) if (matches(e.it, spec)) n += ITEMS[e.it.id].stack ? e.it.n || 1 : 1;
    return n;
  }
  hasTool(tag) {
    for (const e of this.usable()) if (hasTool(e.it, tag) && (e.it.c === undefined || e.it.c > 0)) return e.it;
    return null;
  }
  // arma in mano
  weapon() {
    const h = this.hand;
    if (h && ITEMS[h.id].wpn) return h;
    return null;
  }
  // luce: torcia/lanterna accesa nella mano secondaria (o in mano)
  light() {
    for (const it of [this.off, this.hand]) {
      if (it && ITEMS[it.id].light && it.on) return it;
    }
    return null;
  }
  // protezione per zona (vestiti)
  protection(zone) {
    const slots = { head: ['head'], torso: ['torso_in', 'torso_out'], armL: ['torso_in', 'torso_out'], armR: ['torso_in', 'torso_out'], handL: ['hands'], handR: ['hands'], legL: ['legs'], legR: ['legs'], footL: ['feet'], footR: ['feet'] }[zone] || [];
    let scratch = 0, bite = 0;
    const items = [];
    for (const s of slots) {
      const it = this.worn[s];
      if (!it) continue;
      const c = ITEMS[it.id].cloth;
      // le maniche corte non proteggono le braccia
      if ((zone === 'armL' || zone === 'armR') && (it.id === 'tshirt')) continue;
      const k = it.c > 0.15 ? 1 : 0.4;
      scratch = 1 - (1 - scratch) * (1 - c.scratch * k);
      bite = 1 - (1 - bite) * (1 - c.bite * k);
      items.push(it);
    }
    return { scratch, bite, items };
  }
  warmth() {
    let w = 0;
    for (const s in this.worn) {
      const it = this.worn[s];
      if (!it) continue;
      const c = ITEMS[it.id].cloth;
      w += c.warm * (1 - (it.wet || 0) * 0.6) * (it.c > 0.15 ? 1 : 0.6);
    }
    return w;
  }
  waterproof() {
    const o = this.worn.torso_out;
    return o ? ITEMS[o.id].cloth.water || 0 : 0;
  }
  footNoise() {
    const f = this.worn.feet;
    if (!f) return 0.95;
    return ITEMS[f.id].cloth.quiet || 1;
  }

  describe(it) {
    return itemName(it);
  }
}
