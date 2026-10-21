// Pannelli: inventario e saccheggio, salute dettagliata, crafting, costruzione, abilità, mappa.
// Il tempo continua a scorrere mentre sono aperti: frugare in un cassetto con uno zombie alle spalle è un rischio.
import { icon } from './icons.js';
import { esc } from './hud.js';
import { ITEMS, CAT_NAMES, QUALITY_NAMES } from '../data/items.js';
import { FURN } from '../data/furniture.js';
import { RECIPES, SKILLS, BENCH_NAMES } from '../data/recipes.js';
import { BUILD } from '../data/build.js';
import { itemName, totalWeight, itemWeight, condLabel, ensureFurnItems, ensureCarItems, sortItems } from '../sim/items.js';
import { ZONES, WOUNDS } from '../sim/body.js';
import { SLOT_NAMES, COMFORT_KG } from '../sim/inventory.js';
import { fmtKg, fmtNum, clamp } from '../core/util.js';
import { F } from '../world/grid.js';
import { specName, TOOL_NAMES } from '../sim/crafting.js';

const TABS = [
  ['inv', 'Inventario', 'bag'],
  ['health', 'Salute', 'health'],
  ['craft', 'Crea', 'craft'],
  ['build', 'Costruisci', 'build'],
  ['skills', 'Abilità', 'skills'],
  ['map', 'Mappa', 'map'],
];

const $ = (id) => document.getElementById(id);

export class Panels {
  constructor(G) {
    this.G = G;
    this.root = $('panel');
    this.tab = null;
    this.loot = null;
    this.craftFilter = 'Tutte';
    this.craftSel = null;
    this.buildCat = 'Strutture';
    this.buildSel = null;
    this.healthSel = null;
    this.root.innerHTML = `
      <div class="pn-head">
        <nav class="pn-tabs" id="pn-tabs">${TABS.map(([k, n, ic]) => `<button data-tab="${k}">${icon(ic)}<span>${n}</span></button>`).join('')}</nav>
        <button class="pn-close" id="pn-close" aria-label="Chiudi">${icon('close')}</button>
      </div>
      <div class="pn-body" id="pn-body"></div>
      <div class="pop" id="pn-pop" hidden></div>`;
    this.body = $('pn-body');
    this.pop = $('pn-pop');
    // un tocco che ha aperto il pannello non deve cliccare anche quello che c'è sotto
    this.root.addEventListener('click', (e) => {
      if (performance.now() - (this.openedAt || 0) < 350) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    $('pn-tabs').addEventListener('click', (e) => {
      const b = e.target.closest('[data-tab]');
      if (b) this.open(b.dataset.tab);
    });
    $('pn-close').addEventListener('click', () => this.close());
    this.body.addEventListener('click', (e) => this.onClick(e));
    this.pop.addEventListener('click', (e) => this.onPop(e));
    document.addEventListener('pointerdown', (e) => {
      if (!this.pop.hidden && !this.pop.contains(e.target) && !e.target.closest('[data-item]')) this.hidePop();
    });
    G.events.on('inv', () => this.dirty());
    G.events.on('ground', () => this.dirty());
    G.events.on('body', () => this.dirty());
  }

  get isOpen() {
    return !!this.tab;
  }

  open(tab, opts = {}) {
    const G = this.G;
    if (tab === 'loot') {
      this.loot = opts;
      tab = 'inv';
    }
    if (tab === 'craft') {
      if (opts.filter) this.craftFilter = opts.filter;
      if (opts.bench) this.craftBench = opts.bench;
    }
    if (!this.tab) this.openedAt = performance.now();
    this.tab = tab;
    this.root.hidden = false;
    G.input.releaseLock();
    for (const b of $('pn-tabs').children) b.classList.toggle('on', b.dataset.tab === tab);
    this.hidePop();
    this.render();
    G.events.emit('panel', tab);
  }
  close() {
    if (!this.tab) return;
    this.tab = null;
    this.loot = null;
    this.craftBench = null;
    this.root.hidden = true;
    this.hidePop();
    this.G.events.emit('panel', null);
  }
  toggle(tab) {
    if (this.tab === tab) this.close();
    else this.open(tab);
  }
  dirty() {
    if (this.tab && !this.renderPending) {
      this.renderPending = true;
      requestAnimationFrame(() => {
        this.renderPending = false;
        if (this.tab) this.render();
      });
    }
  }

  update(dt) {
    if (!this.tab) return;
    // il bersaglio del saccheggio si allontana?
    if (this.loot) {
      const pos = this.lootPos();
      const p = this.G.player;
      if (pos && Math.hypot(pos.x - p.x, pos.z - p.z) > 3.2) {
        this.loot = null;
        this.render();
      }
    }
    this.liveT = (this.liveT || 0) - dt;
    if (this.liveT <= 0 && (this.tab === 'health' || this.tab === 'map')) {
      this.liveT = 1;
      this.render();
    }
  }

  // ---------------------------------------------------------------- contenitore aperto
  lootList() {
    const G = this.G;
    const L = this.loot;
    if (!L) return null;
    switch (L.kind) {
      case 'furn': return { list: ensureFurnItems(G, L.f), name: FURN[L.f.type].n, onChange: () => G.events.emit('furn', L.f), cap: (FURN[L.f.type].cont || {}).cap || 30 };
      case 'ground': {
        let l = G.world.ground.get(L.key);
        if (!l) {
          l = [];
          G.world.ground.set(L.key, l);
        }
        return { list: l, name: 'A terra', onChange: () => G.events.emit('ground', L.key), cap: 999 };
      }
      case 'corpse': return { list: L.corpse.items || (L.corpse.items = []), name: L.corpse.special === 'oldself' ? 'Il tuo vecchio corpo' : 'Cadavere', onChange: () => {}, cap: 20 };
      case 'car': return { list: ensureCarItems(G, L.car, L.part), name: L.part === 'trunk' ? 'Bagagliaio' : 'Cruscotto', onChange: () => {}, cap: L.part === 'trunk' ? 40 : 4 };
      case 'barrow': return { list: L.barrow.items, name: 'Carriola', onChange: () => G.dyn.updateBarrow(L.barrow), cap: 60, barrow: true };
    }
    return null;
  }
  lootPos() {
    const L = this.loot;
    if (!L) return null;
    if (L.kind === 'furn') return { x: L.f.x, z: L.f.z };
    if (L.kind === 'ground') {
      const [, i, j] = L.key.split(',').map(Number);
      return { x: i + 0.5, z: j + 0.5 };
    }
    if (L.kind === 'corpse') return { x: L.corpse.x, z: L.corpse.z };
    if (L.kind === 'car') return { x: L.car.x, z: L.car.z };
    if (L.kind === 'barrow') return { x: L.barrow.x, z: L.barrow.z };
    return null;
  }
  // dove si trova un oggetto nel mondo (contenitore aperto o pavimento vicino)
  lootLocate(it) {
    const l = this.lootList();
    if (l && l.list.includes(it)) return l;
    const G = this.G;
    const p = G.player;
    for (let dj = -1; dj <= 1; dj++)
      for (let di = -1; di <= 1; di++) {
        const k = p.L + ',' + (Math.floor(p.x) + di) + ',' + (Math.floor(p.z) + dj);
        const gl = G.world.ground.get(k);
        if (gl && gl.includes(it)) return { list: gl, onChange: () => G.events.emit('ground', k) };
      }
    return null;
  }

  // ---------------------------------------------------------------- render
  render() {
    const t = this.tab;
    if (t === 'inv') this.body.innerHTML = this.renderInv();
    else if (t === 'health') this.body.innerHTML = this.renderHealth();
    else if (t === 'craft') this.body.innerHTML = this.renderCraft();
    else if (t === 'build') this.body.innerHTML = this.renderBuild();
    else if (t === 'skills') this.body.innerHTML = this.renderSkills();
    else if (t === 'map') {
      this.body.innerHTML = '<div class="map-wrap"><canvas id="map-c"></canvas><div class="map-legend" id="map-leg"></div></div>';
      this.drawMap();
    }
  }

  row(it, src) {
    const d = ITEMS[it.id];
    const w = totalWeight(it);
    const c = it.c !== undefined ? `<i class="dur"><b style="width:${Math.round(clamp(it.c, 0, 1) * 100)}%"></b></i>` : '';
    const extra = it.bat !== undefined ? ` · batt. ${Math.round(it.bat * 100)}%` : it.items && it.items.length ? ` · ${it.items.length} oggetti` : '';
    return `<button class="it" data-item="${it.u}" data-src="${src}" style="--ic:${d.col}">${icon(d.ic)}<span class="it-n">${esc(itemName(it))}<small>${esc(CAT_NAMES[d.c] || '')}${extra}${d.bulky ? ' · ingombrante' : ''}</small></span><span class="it-w">${fmtKg(w)}</span>${c}</button>`;
  }

  renderInv() {
    const G = this.G;
    const inv = G.inv;
    const w = inv.weight();
    const enc = inv.encumbrance();
    let h = `<div class="inv-grid"><section class="inv-col"><header><h3>Addosso</h3><div class="wbar ${enc ? 'e' + enc : ''}"><i style="width:${Math.min(100, (w / (COMFORT_KG + 12)) * 100)}%"></i><em style="left:${(COMFORT_KG / (COMFORT_KG + 12)) * 100}%"></em><span>${fmtKg(w)} / ${COMFORT_KG} kg ${['', '· carico', '· pesante', '· sovraccarico', '· schiacciato'][enc]}</span></div></header>`;
    // mani
    h += `<div class="cont"><h4>Mani</h4>`;
    if (inv.bulky) {
      const b = inv.bulky;
      if (b.kind === 'item') h += this.row(b.item, 'bulky');
      else h += `<div class="it static">${icon('heavy')}<span class="it-n">${b.kind === 'furn' ? esc(FURN[b.f.type].n) : b.kind === 'corpse' ? 'Cadavere' : 'Carriola'}<small>in braccio</small></span></div>`;
    }
    if (inv.hand) h += this.row(inv.hand, 'hand');
    if (inv.off) h += this.row(inv.off, 'off');
    if (!inv.hand && !inv.off && !inv.bulky) h += `<p class="empty">Mani libere.</p>`;
    h += `</div>`;
    for (const c of inv.containers()) {
      const load = inv.load(c);
      h += `<div class="cont" data-cont="${c.key}"><h4>${esc(c.name)} <small>${fmtNum(load)} / ${fmtNum(c.cap)} kg${c.red ? ' · peso −' + Math.round(c.red * 100) + '%' : ''}</small></h4>`;
      if (!c.items.length) h += `<p class="empty">Vuoto.</p>`;
      for (const it of sortItems(c.items.slice())) h += this.row(it, c.key);
      h += `</div>`;
    }
    // vestiti e borse indossate
    h += `<div class="cont"><h4>Indossati</h4>`;
    for (const s in inv.worn) if (inv.worn[s]) h += this.row(inv.worn[s], 'worn');
    for (const s in inv.bags) if (inv.bags[s]) h += this.row(inv.bags[s], 'bag');
    h += `</div></section>`;
    // destra: contenitore aperto o pavimento
    const L = this.lootList();
    h += `<section class="inv-col loot">`;
    if (L) {
      h += `<header><h3>${esc(L.name)}</h3>${L.list.length ? `<button class="btn sm" data-take-all="1">Prendi tutto</button>` : ''}</header><div class="cont">`;
      if (!L.list.length) h += `<p class="empty">${this.loot.kind === 'furn' ? 'Vuoto. Qualcuno è passato prima di te, o non c\'era niente.' : 'Niente.'}</p>`;
      for (const it of sortItems(L.list.slice())) h += this.row(it, 'loot');
      h += `</div><p class="hint">Tocca un oggetto per prenderlo, usarlo o metterlo via. Puoi anche lasciare qui le tue cose.</p>`;
    } else {
      const p = G.player;
      const near = [];
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const k = p.L + ',' + (Math.floor(p.x) + di) + ',' + (Math.floor(p.z) + dj);
          const gl = G.world.ground.get(k);
          if (gl) for (const it of gl) near.push(it);
        }
      h += `<header><h3>Qui intorno</h3></header><div class="cont">`;
      if (!near.length) h += `<p class="empty">Niente a terra. Guarda un mobile e premi ${G.touchActive ? 'il pulsante azione' : 'E'} per frugarci dentro.</p>`;
      for (const it of near) h += this.row(it, 'near');
      h += `</div>`;
    }
    h += `</section></div>`;
    return h;
  }

  onClick(e) {
    const G = this.G;
    const it = e.target.closest('[data-item]');
    if (it) {
      this.showPop(Number(it.dataset.item), it.dataset.src, it);
      return;
    }
    if (e.target.closest('[data-take-all]')) {
      const L = this.lootList();
      if (!L) return;
      let moved = 0;
      for (const x of L.list.slice()) {
        if (ITEMS[x.id].bulky) continue;
        if (G.inv.add(x)) {
          L.list.splice(L.list.indexOf(x), 1);
          moved++;
        }
      }
      L.onChange();
      G.audio.play('pickup');
      if (L.list.some((x) => !ITEMS[x.id].bulky)) G.hud.toast('Non ci sta tutto.');
      if (moved) this.render();
      return;
    }
    const tr = e.target.closest('[data-treat]');
    if (tr) {
      const [kind, wid, u] = tr.dataset.treat.split(':');
      const w = G.body.wounds.find((x) => x.id === Number(wid));
      const item = this.findAny(Number(u));
      if (w && item) G.use.treat(kind, w, item);
      return;
    }
    const z = e.target.closest('[data-zone]');
    if (z) {
      this.healthSel = z.dataset.zone;
      this.render();
      return;
    }
    const cf = e.target.closest('[data-cfilter]');
    if (cf) {
      this.craftFilter = cf.dataset.cfilter;
      this.render();
      return;
    }
    const rc = e.target.closest('[data-recipe]');
    if (rc) {
      this.craftSel = rc.dataset.recipe;
      this.render();
      return;
    }
    const mk = e.target.closest('[data-make]');
    if (mk) {
      const r = RECIPES.find((x) => x.id === mk.dataset.make);
      if (r && G.crafting.craft(r)) this.close();
      return;
    }
    const bc = e.target.closest('[data-bcat]');
    if (bc) {
      this.buildCat = bc.dataset.bcat;
      this.render();
      return;
    }
    const bp = e.target.closest('[data-piece]');
    if (bp) {
      this.buildSel = bp.dataset.piece;
      this.render();
      return;
    }
    const bs = e.target.closest('[data-buildstart]');
    if (bs) {
      G.building.startMode(bs.dataset.buildstart);
      this.close();
      return;
    }
  }

  findAny(u) {
    const G = this.G;
    const e = G.inv.find(u);
    if (e) return e.it;
    const L = this.lootList();
    if (L) {
      const x = L.list.find((i) => i.u === u);
      if (x) return x;
    }
    for (const l of G.world.ground.values()) {
      const x = l.find((i) => i.u === u);
      if (x) return x;
    }
    return null;
  }

  // ---------------------------------------------------------------- menu azioni dell'oggetto
  showPop(u, src, anchor) {
    const G = this.G;
    const it = this.findAny(u);
    if (!it) return;
    const d = ITEMS[it.id];
    const acts = [];
    const carried = !!G.inv.find(u);
    const L = this.lootList();
    if (!carried) {
      if (d.bulky) acts.push({ label: 'Solleva (in braccio)', fn: () => this.liftFromLoot(it) });
      else acts.push({ label: 'Prendi', fn: () => this.takeFromLoot(it) });
    }
    for (const a of G.use.actions(it, src)) acts.push({ label: a.label, fn: a.run, ok: a.ok, why: a.why });
    if (carried && L && !d.bulky && src !== 'worn') acts.push({ label: 'Metti in: ' + L.name.toLowerCase(), fn: () => this.putInLoot(it) });
    if (carried && !d.bulky && src !== 'worn' && src !== 'bag') {
      for (const c of G.inv.containers()) if (c.key !== src && c.bag !== it) acts.push({ label: 'Sposta in: ' + c.name.toLowerCase(), fn: () => (G.inv.moveTo(u, c.key) ? null : G.hud.toast('Non c\'è posto.')) });
      if (d.wpn || d.tool || d.thr || d.food || d.med || d.light) acts.push({ hot: true });
    }
    if (src === 'bulky') acts.push({ label: 'Lascia a terra', fn: () => G.interact.dropBulky() });
    let h = `<header style="--ic:${d.col}">${icon(d.ic)}<div><b>${esc(itemName(it))}</b><small>${esc(CAT_NAMES[d.c] || '')} · ${fmtKg(itemWeight(it))}${it.c !== undefined ? ' · ' + condLabel(it) : ''}${it.q !== undefined ? ' · qualità ' + QUALITY_NAMES[it.q] : ''}</small></div></header>`;
    if (d.d) h += `<p>${esc(d.d)}</p>`;
    h += itemStats(d);
    acts.forEach((a, k) => {
      if (a.hot) {
        h += `<div class="pa-hot"><span>Tasto rapido</span>${[0, 1, 2, 3].map((n) => `<button data-sethot="${n}" class="${G.inv.hot[n] === u ? 'on' : ''}">${n + 1}</button>`).join('')}</div>`;
        return;
      }
      h += `<button class="pa ${a.ok === false ? 'no' : ''}" data-pa="${k}">${esc(a.label)}${a.ok === false && a.why ? `<small>${esc(a.why)}</small>` : ''}</button>`;
    });
    this.popItem = u;
    this.popActs = acts;
    this.pop.innerHTML = h;
    this.pop.hidden = false;
    const r = anchor.getBoundingClientRect();
    const pr = this.root.getBoundingClientRect();
    const mobile = window.innerWidth < 700;
    if (mobile) {
      this.pop.style.left = '';
      this.pop.style.top = '';
      this.pop.classList.add('sheet');
    } else {
      this.pop.classList.remove('sheet');
      const left = Math.min(r.right - pr.left + 6, pr.width - 290);
      this.pop.style.left = Math.max(8, left) + 'px';
      this.pop.style.top = Math.max(8, Math.min(r.top - pr.top, pr.height - this.pop.offsetHeight - 8)) + 'px';
    }
  }
  hidePop() {
    this.pop.hidden = true;
  }
  onPop(e) {
    const hb = e.target.closest('[data-sethot]');
    if (hb) {
      const n = Number(hb.dataset.sethot);
      const G = this.G;
      for (let k = 0; k < 4; k++) if (G.inv.hot[k] === this.popItem) G.inv.hot[k] = null;
      G.inv.hot[n] = this.popItem;
      G.events.emit('inv');
      this.hidePop();
      G.hud.toast('Tasto rapido ' + (n + 1) + ' assegnato.');
      return;
    }
    const b = e.target.closest('[data-pa]');
    if (!b) return;
    const a = this.popActs[Number(b.dataset.pa)];
    if (!a) return;
    if (a.ok === false) {
      this.G.hud.toast(a.why || 'Non puoi.');
      return;
    }
    this.hidePop();
    a.fn();
    this.dirty();
  }
  takeFromLoot(it) {
    const G = this.G;
    const loc = this.lootLocate(it);
    if (!loc) return;
    if (!G.inv.add(it)) return G.hud.toast('Non hai spazio. Libera qualcosa o trova uno zaino.');
    loc.list.splice(loc.list.indexOf(it), 1);
    loc.onChange && loc.onChange();
    G.audio.play('pickup');
    this.render();
  }
  liftFromLoot(it) {
    const G = this.G;
    if (G.inv.bulky) return G.hud.toast('Hai già le mani occupate.');
    const loc = this.lootLocate(it);
    if (!loc) return;
    loc.list.splice(loc.list.indexOf(it), 1);
    loc.onChange && loc.onChange();
    G.inv.bulky = { kind: 'item', item: it };
    G.events.emit('inv');
    this.render();
  }
  putInLoot(it) {
    const G = this.G;
    const L = this.lootList();
    if (!L) return;
    let load = 0;
    for (const x of L.list) load += totalWeight(x);
    if (load + totalWeight(it) > L.cap) return G.hud.toast('Non ci sta.');
    G.inv.remove(it.u);
    it.on = false;
    L.list.push(it);
    L.onChange();
    this.render();
  }

  // ---------------------------------------------------------------- salute
  renderHealth() {
    const G = this.G;
    const b = G.body, m = G.mind;
    const worst = {};
    for (const w of b.wounds) {
      const s = (w.type === 'bite' || w.type === 'deep' || w.type === 'fract' ? 3 : w.type === 'lacer' || w.type === 'burn' ? 2 : 1) + (w.infected > 0 ? 1 : 0);
      worst[w.zone] = Math.max(worst[w.zone] || 0, s);
    }
    const zc = (z) => ['ok', 'w1', 'w2', 'w3', 'w3'][worst[z] || 0];
    const sel = this.healthSel;
    const svg = `<svg class="bodymap" viewBox="0 0 120 240">
      <circle data-zone="head" class="z ${zc('head')} ${sel === 'head' ? 'sel' : ''}" cx="60" cy="24" r="17"/>
      <rect data-zone="torso" class="z ${zc('torso')} ${sel === 'torso' ? 'sel' : ''}" x="38" y="44" width="44" height="72" rx="10"/>
      <rect data-zone="armR" class="z ${zc('armR')} ${sel === 'armR' ? 'sel' : ''}" x="18" y="46" width="17" height="64" rx="8"/>
      <rect data-zone="armL" class="z ${zc('armL')} ${sel === 'armL' ? 'sel' : ''}" x="85" y="46" width="17" height="64" rx="8"/>
      <circle data-zone="handR" class="z ${zc('handR')} ${sel === 'handR' ? 'sel' : ''}" cx="26" cy="122" r="9"/>
      <circle data-zone="handL" class="z ${zc('handL')} ${sel === 'handL' ? 'sel' : ''}" cx="94" cy="122" r="9"/>
      <rect data-zone="legR" class="z ${zc('legR')} ${sel === 'legR' ? 'sel' : ''}" x="40" y="120" width="18" height="90" rx="8"/>
      <rect data-zone="legL" class="z ${zc('legL')} ${sel === 'legL' ? 'sel' : ''}" x="62" y="120" width="18" height="90" rx="8"/>
      <rect data-zone="footR" class="z ${zc('footR')} ${sel === 'footR' ? 'sel' : ''}" x="34" y="214" width="24" height="12" rx="5"/>
      <rect data-zone="footL" class="z ${zc('footL')} ${sel === 'footL' ? 'sel' : ''}" x="62" y="214" width="24" height="12" rx="5"/>
    </svg>`;
    const bar = (label, v, bad, txt) => `<div class="stat"><span>${label}</span><i class="${bad ? 'bad' : ''}"><b style="width:${Math.round(clamp(v, 0, 1) * 100)}%"></b></i><em>${txt || ''}</em></div>`;
    let h = `<div class="health-grid"><section class="hb-left">${svg}<div class="cond">Condizione: <b class="c-${b.conditionLabel().toLowerCase()}">${b.conditionLabel()}</b></div><p class="hint">Tocca una parte del corpo per vedere le ferite.</p></section><section class="hb-right">`;
    // ferite
    const list = b.wounds.filter((w) => !sel || w.zone === sel);
    h += `<h3>Ferite${sel ? ' — ' + ZONES[sel] : ''}</h3>`;
    if (!list.length) h += `<p class="empty">${sel ? 'Niente qui.' : 'Nessuna ferita. Per ora.'}</p>`;
    const dress = this.bestDressing();
    const disinf = G.inv.usable().map((e) => e.it).find((it) => ITEMS[it.id].med && ITEMS[it.id].med.kind === 'disinfect') || G.inv.usable().map((e) => e.it).find((it) => ITEMS[it.id].alcohol && it.n > 0);
    const sut = G.inv.usable().map((e) => e.it).find((it) => it.id === 'suture_kit') || G.inv.usable().map((e) => e.it).find((it) => it.id === 'sewing_kit');
    const spl = G.inv.usable().map((e) => e.it).find((it) => it.id === 'splint');
    for (const w of list) {
      const d = WOUNDS[w.type];
      const bl = b.bleedRate(w);
      const st = [];
      if (bl > 0.5) st.push('<b class="red">sanguina</b>');
      if (w.bandage) st.push(w.bandage.dirt > 0.7 ? '<b class="amb">benda sporca</b>' : 'bendata');
      if (w.disinf) st.push('disinfettata');
      if (d.suture) st.push(w.sutured ? 'suturata' : '<b class="red">da suturare</b>');
      if (d.splint) st.push(w.splint ? 'steccata' : '<b class="amb">da steccare</b>');
      if (w.infected > 0) st.push('<b class="red">infetta</b>');
      st.push('guarigione ' + Math.round(w.heal * 100) + '%');
      h += `<div class="wound"><header><b>${d.n}</b><span>${ZONES[w.zone]}</span></header><p>${st.join(' · ')}</p><div class="wbtns">`;
      if (d.bleed || w.type === 'burn' || w.type === 'bite') {
        if (dress && (!w.bandage || w.bandage.dirt > 0.3)) h += `<button class="btn sm" data-treat="bandage:${w.id}:${dress.u}">${w.bandage ? 'Cambia benda' : 'Benda'} (${esc(ITEMS[dress.id].n.toLowerCase())})</button>`;
      }
      if (disinf && !w.disinf && d.inf) h += `<button class="btn sm" data-treat="disinfect:${w.id}:${disinf.u}">Disinfetta</button>`;
      if (sut && d.suture && !w.sutured) h += `<button class="btn sm" data-treat="suture:${w.id}:${sut.u}">Sutura${sut.id === 'sewing_kit' ? ' (ago e filo)' : ''}</button>`;
      if (spl && d.splint && !w.splint) h += `<button class="btn sm" data-treat="splint:${w.id}:${spl.u}">Steccatura</button>`;
      h += `</div></div>`;
    }
    h += `<h3>Corpo</h3>`;
    h += bar('Fame', b.hunger / 100, b.hunger > 60, Math.round(b.hunger) + '%');
    h += bar('Sete', b.thirst / 100, b.thirst > 60, Math.round(b.thirst) + '%');
    h += bar('Sonno', b.fatigue / 100, b.fatigue > 70, Math.round(b.fatigue) + '%');
    h += bar('Stamina', b.stamina, b.stamina < 0.3, Math.round(b.stamina * 100) + '%');
    h += bar('Dolore', b.pain / 100, b.pain > 40, Math.round(b.pain) + '%');
    const temp = b.temp + b.fever;
    h += `<div class="stat"><span>Temperatura</span><em class="big ${temp > 37.8 || temp < 35.8 ? 'red' : ''}">${fmtNum(temp, 1)} °C</em></div>`;
    h += `<div class="stat"><span>Bagnato</span><em>${Math.round(b.wet * 100)}%</em></div>`;
    const ill = [];
    if (b.cold > 0.05) ill.push('Raffreddore');
    if (b.poison > 0.05) ill.push('Intossicazione');
    if (b.fever > 0.3) ill.push('Febbre (causa da capire)');
    if (b.co > 0.05) ill.push('Monossido di carbonio');
    if (b.meds.pain > 0) ill.push('Antidolorifici in circolo');
    if (b.meds.antibio > 0) ill.push('Cura antibiotica');
    h += `<div class="stat"><span>Condizioni</span><em>${ill.length ? ill.join(', ') : 'nessuna'}</em></div>`;
    h += `<h3>Mente</h3>`;
    h += bar('Panico', m.panic / 100, m.panic > 40, Math.round(m.panic) + '%');
    h += bar('Morale', m.morale / 100, m.morale < 30, Math.round(m.morale) + '%');
    h += bar('Noia', m.boredom / 100, m.boredom > 60, Math.round(m.boredom) + '%');
    h += bar('Solitudine', m.lonely / 100, m.lonely > 60, Math.round(m.lonely) + '%');
    h += `<h3>Vestiti</h3><div class="clothes">`;
    for (const s in G.inv.worn) {
      const it = G.inv.worn[s];
      if (!it) {
        h += `<div class="cl empty"><span>${SLOT_NAMES[s]}</span><b>—</b></div>`;
        continue;
      }
      const c = ITEMS[it.id].cloth;
      h += `<div class="cl"><span>${SLOT_NAMES[s]}</span><b>${esc(itemName(it))}</b><small>calore ${Math.round(c.warm * 100)} · graffi ${Math.round(c.scratch * 100)} · morsi ${Math.round(c.bite * 100)}${it.c < 0.4 ? ' · strappato' : ''}${it.wet > 0.2 ? ' · bagnato' : ''}</small></div>`;
    }
    h += `</div></section></div>`;
    return h;
  }

  bestDressing() {
    const G = this.G;
    const order = ['sterile_bandage', 'bandage', 'rag'];
    for (const id of order) {
      const e = G.inv.usable().find((x) => x.it.id === id);
      if (e) return e.it;
    }
    return null;
  }

  // ---------------------------------------------------------------- crafting
  renderCraft() {
    const G = this.G;
    const known = G.crafting.list();
    const cats = ['Tutte', ...new Set(RECIPES.map((r) => r.cat))];
    let h = `<div class="craft-grid"><section><div class="chips">${cats.map((c) => `<button class="chip ${c === this.craftFilter ? 'on' : ''}" data-cfilter="${c}">${c}</button>`).join('')}</div><div class="rlist">`;
    const list = known.filter((r) => this.craftFilter === 'Tutte' || r.cat === this.craftFilter);
    const checks = new Map(list.map((r) => [r.id, G.crafting.check(r)]));
    list.sort((a, b) => (checks.get(b.id).ok ? 1 : 0) - (checks.get(a.id).ok ? 1 : 0));
    for (const r of list) {
      const c = checks.get(r.id);
      h += `<button class="rc ${c.ok ? 'ok' : ''} ${this.craftSel === r.id ? 'sel' : ''}" data-recipe="${r.id}"><b>${esc(r.n)}</b><small>${c.ok ? 'Pronto' : 'Manca: ' + esc(c.miss.slice(0, 3).join(', '))}</small></button>`;
    }
    const total = RECIPES.length, kn = known.length;
    h += `</div><p class="hint">Conosci ${kn} ricette su ${total}. Le altre si imparano leggendo riviste e manuali.</p></section><section class="rdetail">`;
    const r = RECIPES.find((x) => x.id === this.craftSel) || list[0];
    if (r) {
      const c = checks.get(r.id) || G.crafting.check(r);
      const out = r.out ? ITEMS[r.out[0]] : null;
      h += `<h3>${esc(r.n)}</h3>`;
      if (r.d) h += `<p>${esc(r.d)}</p>`;
      if (out) h += `<p class="out" style="--ic:${out.col}">${icon(out.ic)} ${esc(out.n)}${r.out[1] > 1 ? ' ×' + r.out[1] : ''}${r.quality ? ' · la qualità dipende dalla skill' : ''}</p>`;
      h += `<ul class="req">${c.lines.map((l) => `<li class="${l.ok ? 'ok' : 'no'}">${icon(l.ok ? 'check' : 'close')}${esc(l.t)}</li>`).join('')}</ul>`;
      h += `<p class="meta">${r.time} s${r.noise ? ' · rumore ' + r.noise + ' m' : ''}${r.xp ? ' · ' + Object.keys(r.xp).map((k) => SKILLS[k]).join(', ') : ''}</p>`;
      h += `<button class="btn ${c.ok ? 'primary' : ''}" data-make="${r.id}" ${c.ok ? '' : 'disabled'}>Crea</button>`;
    } else h += `<p class="empty">Nessuna ricetta in questa categoria.</p>`;
    h += `</section></div>`;
    return h;
  }

  // ---------------------------------------------------------------- costruzione
  renderBuild() {
    const G = this.G;
    const cats = ['Strutture', 'Difese', 'Banchi', 'Base'];
    let h = `<div class="craft-grid"><section><div class="chips">${cats.map((c) => `<button class="chip ${c === this.buildCat ? 'on' : ''}" data-bcat="${c}">${c}</button>`).join('')}</div><div class="rlist">`;
    const ids = Object.keys(BUILD).filter((k) => BUILD[k].cat === this.buildCat);
    for (const id of ids) {
      const p = BUILD[id];
      const known = !p.learn || G.skills.knows(id);
      const c = known ? G.building.pieceCheck(id) : { ok: false, why: 'Da imparare: ' + ITEMS[p.learn].n };
      h += `<button class="rc ${c.ok ? 'ok' : ''} ${known ? '' : 'locked'} ${this.buildSel === id ? 'sel' : ''}" data-piece="${id}"><b>${esc(p.n)}</b><small>${known ? (c.ok ? 'Materiali pronti' : esc(c.why)) : esc(c.why)}</small></button>`;
    }
    h += `</div><p class="hint">Barricate su porte e finestre: guardale e scegli l'azione. Smontare i mobili dà assi e chiodi.</p></section><section class="rdetail">`;
    const id = this.buildSel && BUILD[this.buildSel] && BUILD[this.buildSel].cat === this.buildCat ? this.buildSel : ids[0];
    const p = BUILD[id];
    if (p) {
      const known = !p.learn || G.skills.knows(id);
      h += `<h3>${esc(p.n)}</h3>`;
      if (p.d) h += `<p>${esc(p.d)}</p>`;
      const srcs = G.crafting.sources(3);
      const lines = p.cost.map(([s, q]) => ({ t: specName(s) + (q > 1 ? ' ×' + q : ''), ok: G.crafting.countIn(srcs, s) >= q }));
      for (const t of p.tools) lines.push({ t: TOOL_NAMES[t], ok: !!G.crafting.toolIn(srcs, t) });
      for (const k in p.skill || {}) lines.push({ t: SKILLS[k] + ' ' + p.skill[k], ok: G.skills.level(k) >= p.skill[k] });
      if (p.bench) lines.push({ t: 'Un ' + BENCH_NAMES[p.bench] + ' nella base (25 m)', ok: G.building.benchInBase(p.bench) });
      if (p.learn) lines.push({ t: 'Imparato da: ' + ITEMS[p.learn].n, ok: known });
      h += `<ul class="req">${lines.map((l) => `<li class="${l.ok ? 'ok' : 'no'}">${icon(l.ok ? 'check' : 'close')}${esc(l.t)}</li>`).join('')}</ul>`;
      h += `<p class="meta">${p.time} s · rumore ${p.noise} m${p.hp ? ' · resistenza ' + p.hp : ''}${p.mat ? ' · campata ' + { wood: 1, metal: 2, cement: 3 }[p.mat] : ''}</p>`;
      h += `<p class="hint">I materiali vanno tenuti addosso o lasciati a terra entro 3 m dal punto di lavoro.</p>`;
      h += `<button class="btn ${known ? 'primary' : ''}" data-buildstart="${id}" ${known ? '' : 'disabled'}>Scegli dove costruire</button>`;
    }
    h += `</section></div>`;
    return h;
  }

  // ---------------------------------------------------------------- abilità
  renderSkills() {
    const G = this.G;
    const s = G.skills;
    let h = `<div class="skills"><section><h3>Abilità</h3>`;
    for (const k in SKILLS) {
      const l = s.level(k);
      const boost = s.boost[k] > 0 ? `<em class="boost">×2 per ${Math.ceil(s.boost[k])} h</em>` : '';
      h += `<div class="sk"><span>${SKILLS[k]}</span><b>${l}</b><i><b style="width:${Math.round(s.progress(k) * 100)}%"></b></i>${boost}</div>`;
    }
    const lit = Object.keys(ITEMS).filter((id) => ITEMS[id].lit && ITEMS[id].lit.recipes);
    h += `</section><section><h3>Riviste e manuali letti</h3><ul class="read">${lit.map((id) => `<li class="${s.read.has(id) ? 'ok' : ''}">${icon(s.read.has(id) ? 'check' : 'book')}${esc(ITEMS[id].n)}</li>`).join('')}</ul>`;
    const st = G.stats;
    h += `<h3>Sopravvivenza</h3><div class="stat"><span>Personaggio</span><em>${esc(G.charName)}</em></div><div class="stat"><span>Zombie uccisi</span><em>${st.kills}</em></div><div class="stat"><span>Giorni passati</span><em>${Math.floor(G.clock.days - (st.startDay || 0))}</em></div><div class="stat"><span>Personaggi morti in questo mondo</span><em>${st.deaths || 0}</em></div>`;
    h += `</section></div>`;
    return h;
  }

  // ---------------------------------------------------------------- mappa
  drawMap() {
    const G = this.G;
    const g = G.grid;
    const c = $('map-c');
    if (!c) return;
    const wrap = c.parentElement;
    const size = Math.min(wrap.clientWidth - 8, Math.max(260, wrap.clientHeight - 8), 720);
    const scale = size / g.W;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = size * dpr;
    c.height = size * dpr;
    c.style.width = size + 'px';
    c.style.height = size + 'px';
    const ctx = c.getContext('2d');
    ctx.setTransform(dpr * scale, 0, 0, dpr * scale, 0, 0);
    ctx.fillStyle = '#0d100e';
    ctx.fillRect(0, 0, g.W, g.H);
    const col = {
      [F.GRASS]: '#3b4a2c', [F.DIRT]: '#4a3e2c', [F.ASPHALT]: '#55585a', [F.SIDEWALK]: '#7a7770', [F.GRAVEL]: '#6a6152', [F.FIELD]: '#5a4632', [F.FOREST]: '#1f2a1a',
      [F.PARKING]: '#5a5c5e', [F.CONCRETE]: '#6e6c66', [F.COURT]: '#7a4a3a',
    };
    const ex = G.explored;
    const full = G.mapRevealed;
    for (let j = 0; j < g.H; j++)
      for (let i = 0; i < g.W; i++) {
        const k = g.idx(i, j);
        const seen = ex && ex[k];
        if (!seen && !full) continue;
        let cc = g.bld[k] >= 0 ? '#b9ad94' : col[g.lv[0].floor[k]] || '#3b4a2c';
        if (!seen) cc = g.bld[k] >= 0 ? '#5a5448' : '#262c22';
        ctx.fillStyle = cc;
        ctx.fillRect(i, j, 1.02, 1.02);
      }
    // edifici con nome
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const fs = 2.6;
    ctx.font = `600 ${fs}px "Barlow Semi Condensed", sans-serif`;
    for (const l of G.world.labels) {
      const k = g.idx(Math.floor(l.x), Math.floor(l.z));
      if (!full && !(ex && ex[k])) continue;
      ctx.fillStyle = l.bld !== undefined ? '#1b1c18' : '#d8d2c0';
      if (l.v) {
        ctx.save();
        ctx.translate(l.x, l.z);
        ctx.rotate(-Math.PI / 2);
        ctx.fillText(l.text, 0, 0);
        ctx.restore();
      } else ctx.fillText(l.bld !== undefined ? shortName(l.text) : l.text, l.x, l.z);
    }
    // letto (base)
    if (G.lastBed) {
      ctx.fillStyle = '#e6a23c';
      ctx.beginPath();
      ctx.arc(G.lastBed.x, G.lastBed.z, 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    // orda in arrivo
    const h = G.zombies.hordes.find((x) => x.stage >= 1 && x.stage < 5);
    if (h) {
      ctx.fillStyle = '#c8553a';
      const pos = { N: [72, 4], S: [72, 140], W: [4, 72], E: [140, 72] }[h.side];
      ctx.beginPath();
      ctx.arc(pos[0], pos[1], 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // giocatore
    const p = G.player;
    ctx.save();
    ctx.translate(p.x, p.z);
    ctx.rotate(-p.yaw);
    ctx.fillStyle = '#f2ead6';
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 0.4;
    ctx.beginPath();
    ctx.moveTo(0, -2.6);
    ctx.lineTo(1.7, 1.8);
    ctx.lineTo(0, 0.9);
    ctx.lineTo(-1.7, 1.8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    $('map-leg').innerHTML = `<span><i class="lg you"></i>Tu</span>${G.lastBed ? '<span><i class="lg bed"></i>Dove hai dormito</span>' : ''}${h ? '<span><i class="lg horde"></i>Orda in arrivo</span>' : ''}<span>${full ? 'Mappa completa' : 'Si riempie esplorando. Una mappa del paese la completa.'}</span>`;
  }
}

function shortName(n) {
  return n.replace('Supermercato ', '').replace('"', '').replace('"', '').replace('Scuola media ', 'Scuola ').replace(' comunale', '');
}

function itemStats(d) {
  const s = [];
  if (d.food) {
    if (d.food.hu) s.push('fame −' + d.food.hu);
    if (d.food.th) s.push(d.food.th > 0 ? 'sete −' + d.food.th : 'sete +' + -d.food.th);
    if (d.food.mo) s.push('morale ' + (d.food.mo > 0 ? '+' : '') + d.food.mo);
  }
  if (d.wpn) s.push('danno ' + fmtNum(d.wpn.dmg, 2), 'portata ' + fmtNum(d.wpn.reach, 1) + ' m', d.wpn.two ? 'due mani' : 'una mano', d.wpn.type === 'blade' ? 'taglio' : 'botta');
  if (d.cloth) s.push('calore ' + Math.round(d.cloth.warm * 100), 'graffi ' + Math.round(d.cloth.scratch * 100), 'morsi ' + Math.round(d.cloth.bite * 100));
  if (d.bag) s.push('capienza ' + d.bag.cap + ' kg', 'peso −' + Math.round(d.bag.red * 100) + '%');
  return s.length ? `<p class="stats">${s.map((x) => '<span>' + esc(x) + '</span>').join('')}</p>` : '';
}
