// Building: barricare edifici esistenti (assi, lamiere, mobili davanti agli ingressi, lenzuola alle finestre,
// scale smontate) e costruire da zero su griglia con snapping. Integrità strutturale: ogni pezzo deve
// poggiare su qualcosa, i materiali reggono campate diverse. Ogni lavoro fa rumore.
import { BUILD, BARRICADE, MATERIALS } from '../data/build.js';
import { FURN } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { F, E, ST, BLK, hasBarricade } from '../world/grid.js';
import { LEVEL_H } from '../config.js';
import { mkItem } from './items.js';
import { clamp } from '../core/util.js';
import { fx } from '../core/rng.js';
import { specName, TOOL_NAMES } from './crafting.js';
import { BENCH_NAMES, SKILLS } from '../data/recipes.js';

const FOUND_FLOOR = { wood: F.FOUND_WOOD, metal: F.FOUND_METAL, cement: F.FOUND_CEMENT };
const PFLOOR = { wood: F.PF_WOOD, metal: F.PF_METAL, cement: F.PF_CEMENT };

export class Building {
  constructor(G) {
    this.G = G;
    this.mode = null; // {id, rot}
    this.ghost = null;
  }

  // ---------------------------------------------------------------- barricate
  barricadeCheck(e, kind) {
    const G = this.G;
    const b = BARRICADE[kind];
    if (b.learn && !G.skills.knows(b.learn === 'mag_wood2' ? 'barricade_heavy' : 'barricade_metal')) return { ok: false, why: 'Non sai come farlo' };
    if (e.t === E.DOOR && e.st === ST.OPEN) return { ok: false, why: 'Chiudi prima la porta' };
    if (kind === 'metal' && e.metal > 0) return { ok: false, why: 'Già rinforzata' };
    if (kind !== 'metal' && e.bar && e.bar.length >= b.max) return { ok: false, why: 'Non c\'è più spazio per altre assi' };
    const srcs = G.crafting.sources();
    for (const [spec, q] of b.cost) if (G.crafting.countIn(srcs, spec) < q) return { ok: false, why: 'Ti serve: ' + specName(spec) + (q > 1 ? ' ×' + q : '') };
    for (const t of b.tools) if (!G.crafting.toolIn(srcs, t)) return { ok: false, why: 'Ti serve: ' + TOOL_NAMES[t] };
    for (const k in b.skill || {}) if (G.skills.level(k) < b.skill[k]) return { ok: false, why: SKILLS[k] + ' ' + b.skill[k] };
    return { ok: true, srcs };
  }

  barricade(e, kind) {
    const G = this.G;
    const c = this.barricadeCheck(e, kind);
    if (!c.ok) {
      G.hud.toast(c.why);
      return;
    }
    const b = BARRICADE[kind];
    const ec = edgeCenterOf(e);
    // le assi vanno dal lato in cui sei
    const side = this.playerSide(e);
    G.actions.start({
      name: 'Barricare', dur: b.time * (1 - G.skills.level('carp') * 0.04), anim: 'hammer', hands: true,
      noise: { r: b.noise, every: 0.8 }, sound: { name: kind === 'metal' ? 'weld' : 'hammer', every: 0.55, at: { x: ec.x, y: e.L * LEVEL_H + 1.3, z: ec.z } },
      onDone: () => {
        const cc = this.barricadeCheck(e, kind);
        if (!cc.ok) return G.hud.toast(cc.why);
        for (const [spec, q] of b.cost) G.crafting.consume(cc.srcs, spec, q);
        G.crafting.wearTools(cc.srcs, b.tools);
        const carp = G.skills.level(kind === 'metal' ? 'metal' : 'carp');
        const hp = Math.round(b.hp * (1 + carp * 0.06) * fx.range(0.9, 1.1));
        if (kind === 'metal') {
          e.metal = hp;
          e.metalMax = hp;
        } else {
          e.bar = e.bar || [];
          e.bar.push(hp);
          e.barMax = Math.max(e.barMax || 0, hp);
        }
        e.barSide = side;
        for (const k in b.xp) G.skills.xp(k, b.xp[k]);
        G.grid.version++;
        G.events.emit('edge', e);
        G.events.emit('barricaded', e);
      },
    });
  }

  playerSide(e) {
    const p = this.G.player;
    if (e.o === 0) return p.z >= e.j ? 1 : -1;
    return p.x >= e.i ? 1 : -1;
  }

  unbarricade(e) {
    const G = this.G;
    const tool = G.inv.hasTool('hammer') || G.inv.hasTool('crowbar');
    if (!tool) return G.hud.toast('Serve un martello o un piede di porco.');
    const ec = edgeCenterOf(e);
    G.actions.start({
      name: 'Togli la barricata', dur: e.metal > 0 ? 8 : 4, anim: 'hammer', noise: { r: 12, every: 1 }, sound: { name: 'woodcreak', every: 1.1, at: { x: ec.x, y: e.L * LEVEL_H + 1.2, z: ec.z } },
      onDone: () => {
        if (e.metal > 0) {
          e.metal = 0;
          if (fx.chance(0.6)) G.crafting.give(mkItem('sheet_metal'));
        } else if (e.bar && e.bar.length) {
          const hp = e.bar.pop();
          if (hp > (e.barMax || 45) * 0.4) G.crafting.give(mkItem('plank'));
          if (fx.chance(0.5)) G.crafting.give(mkItem('nails', { n: 1 }));
        }
        G.grid.version++;
        G.events.emit('edge', e);
      },
    });
  }

  // ---------------------------------------------------------------- mobili: smontare e spostare
  dismantleCheck(f) {
    const G = this.G;
    const d = FURN[f.type];
    if (!d.dis) return { ok: false, why: 'Non si smonta' };
    const tool = d.dis.tool ? G.inv.hasTool(d.dis.tool) : true;
    if (!tool) return { ok: false, why: 'Serve: ' + TOOL_NAMES[d.dis.tool] };
    if (f.items && f.items.length) return { ok: false, why: 'Prima svuotalo' };
    return { ok: true };
  }

  dismantle(f) {
    const G = this.G;
    const d = FURN[f.type];
    const c = this.dismantleCheck(f);
    if (!c.ok) return G.hud.toast(c.why);
    const lvl = G.skills.level(d.dis.skill);
    const snd = d.dis.tool === 'hammer' ? 'hammer' : d.dis.tool === 'saw' ? 'saw' : 'screw';
    G.actions.start({
      name: 'Smonta: ' + d.n, dur: d.dis.time * (1 - lvl * 0.05), anim: d.dis.tool === 'hammer' ? 'hammer' : 'craft', hands: true, repetitive: true,
      noise: { r: d.dis.noise, every: 0.9 }, sound: { name: snd, every: snd === 'hammer' ? 0.55 : 1, at: { x: f.x, y: f.L * LEVEL_H + 0.6, z: f.z } },
      onDone: () => {
        if (f.removed) return;
        const t = G.inv.hasTool(d.dis.tool);
        if (d.dis.tool && t && t.c !== undefined) t.c -= 0.02;
        for (const [id, a, b] of d.dis.yield) {
          let n = fx.int(a, b);
          if (lvl >= 3 && fx.chance(0.4)) n++;
          if (!n) continue;
          if (ITEMS[id].stack) G.world.addGround(f.L, Math.floor(f.x), Math.floor(f.z), mkItem(id, { n }));
          else for (let k = 0; k < n; k++) G.world.addGround(f.L, Math.floor(f.x), Math.floor(f.z), mkItem(id, ITEMS[id].wpn ? { c: 0.7 } : {}));
        }
        G.skills.xp(d.dis.skill, d.dis.xp);
        this.removeFurn(f);
        G.hud.toast(d.n + ' smontato: materiali a terra.', 'good');
      },
    });
  }

  removeFurn(f) {
    const G = this.G;
    const g = G.grid;
    for (let jj = f.j; jj < f.j + f.d; jj++)
      for (let ii = f.i; ii < f.i + f.w; ii++) {
        const k = g.idx(ii, jj);
        if (g.lv[f.L].furn[k] === f.id + 1) g.lv[f.L].furn[k] = 0;
      }
    // il contenuto finisce a terra
    if (f.items && f.items.length) for (const it of f.items.splice(0)) G.world.addGround(f.L, Math.floor(f.x), Math.floor(f.z), it);
    f.removed = true;
    g.version++;
    G.events.emit('furn', f);
    if (f.type === 'post' || f.type === 'ladder') this.checkIntegrity();
  }

  pickUpFurn(f) {
    const G = this.G;
    if (G.inv.bulky) return G.hud.toast('Hai già le mani occupate.');
    const d = FURN[f.type];
    if (!d.move) return;
    if (f.items && f.items.length) return G.hud.toast('Prima svuotalo.');
    const g = G.grid;
    for (let jj = f.j; jj < f.j + f.d; jj++)
      for (let ii = f.i; ii < f.i + f.w; ii++) {
        const k = g.idx(ii, jj);
        if (g.lv[f.L].furn[k] === f.id + 1) g.lv[f.L].furn[k] = 0;
      }
    f.carried = true;
    f.barricade = false;
    g.version++;
    G.inv.bulky = { kind: 'furn', f };
    G.audio.play('drag');
    G.noise.emit(G.player.x, G.player.z, 6, { L: G.player.L, src: 'player', kind: 'drag' });
    G.events.emit('furn', f);
    G.events.emit('inv');
  }

  // posa il mobile trasportato davanti a te; vicino a una porta/finestra diventa una barricata
  placeFurn() {
    const G = this.G;
    const b = G.inv.bulky;
    if (!b || b.kind !== 'furn') return false;
    const f = b.f;
    const p = G.player;
    const g = G.grid;
    const fwdX = -Math.sin(p.yaw), fwdZ = -Math.cos(p.yaw);
    const i = Math.floor(p.x + fwdX * 0.9), j = Math.floor(p.z + fwdZ * 0.9);
    const L = p.L;
    const rot = Math.abs(fwdX) > Math.abs(fwdZ) ? (fwdX > 0 ? 3 : 1) : fwdZ > 0 ? 2 : 0;
    const d = FURN[f.type];
    const along = rot === 0 || rot === 2;
    const w = along ? d.sz[0] : d.sz[1], dd = along ? d.sz[1] : d.sz[0];
    for (let jj = j; jj < j + dd; jj++)
      for (let ii = i; ii < i + w; ii++) {
        if (!g.inb(ii, jj) || g.cellBlocked(L, ii, jj) || !g.hasFloor(L, ii, jj) || (L === 0 && g.stairCell[g.idx(ii, jj)] >= 0)) {
          G.hud.toast('Non c\'è spazio lì.');
          return false;
        }
        if (Math.floor(p.x) === ii && Math.floor(p.z) === jj) {
          G.hud.toast('Fai un passo indietro.');
          return false;
        }
      }
    f.i = i;
    f.j = j;
    f.L = L;
    f.rot = rot;
    f.w = w;
    f.d = dd;
    f.x = i + w / 2;
    f.z = j + dd / 2;
    f.carried = false;
    // davanti a un ingresso? diventa barricata da sfondare
    let barr = false;
    for (let jj = j; jj < j + dd; jj++)
      for (let ii = i; ii < i + w; ii++) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const e = g.edgeBetween(L, ii, jj, ii + dx, jj + dz);
          if (e && (e.t === E.DOOR || e.t === E.WINDOW)) barr = true;
        }
        g.lv[L].furn[g.idx(ii, jj)] = f.id + 1;
      }
    f.barricade = barr;
    f.hp = f.hp || (d.move || 10) * 4;
    G.inv.bulky = null;
    g.version++;
    G.audio.play('drag');
    G.events.emit('furn', f);
    G.events.emit('inv');
    if (barr) G.hud.toast(d.n + ' blocca l\'ingresso.', 'good');
    return true;
  }

  // ---------------------------------------------------------------- scale e corde
  removeStairs(s) {
    const G = this.G;
    if (!G.inv.hasTool('hammer') || !G.inv.hasTool('saw')) return G.hud.toast('Servono martello e sega.');
    const [bi, bj] = s.cells[1];
    G.actions.start({
      name: 'Smonta le scale', dur: 18 * (1 - G.skills.level('carp') * 0.05), anim: 'hammer', hands: true, repetitive: true,
      noise: { r: 24, every: 0.8 }, sound: { name: 'saw', every: 1.2, at: { x: bi + 0.5, y: 1, z: bj + 0.5 } },
      onDone: () => {
        s.removed = true;
        G.grid.version++;
        for (let k = 0; k < 4; k++) G.world.addGround(0, bi, bj, mkItem('plank'));
        G.skills.xp('carp', 15);
        G.events.emit('stairs', s);
        G.hud.toast('Le scale non ci sono più: il piano di sopra è isolato. Ti serve una corda per salire.', 'good');
      },
    });
  }

  installRope(s) {
    const G = this.G;
    const e = G.inv.findId('sheet_rope');
    if (!e) return G.hud.toast('Ti serve una corda di lenzuola.');
    G.actions.start({
      name: 'Fissa la corda', dur: 4, anim: 'craft',
      onDone: () => {
        G.inv.remove(e.it.u);
        s.rope = true;
        G.events.emit('stairs', s);
        G.hud.toast('Corda fissata. Tu sali, loro no.', 'good');
      },
    });
  }

  // ---------------------------------------------------------------- auto
  dismantleCar(car) {
    const G = this.G;
    if (!G.skills.knows('dismantle_car') && G.skills.level('mech') < 2) return G.hud.toast('Non sai come smontare un\'auto (rivista di meccanica).');
    if (!G.inv.hasTool('wrench') || !G.inv.hasTool('saw')) return G.hud.toast('Servono chiave inglese e sega.');
    G.actions.start({
      name: 'Smonta l\'auto', dur: 26 * (1 - G.skills.level('mech') * 0.05), anim: 'hammer', hands: true, repetitive: true,
      noise: { r: 20, every: 0.9 }, sound: { name: 'metalhit', every: 0.9, at: { x: car.x, y: 0.8, z: car.z } },
      onDone: () => {
        car.dismantled = true;
        const i = Math.floor(car.x), j = Math.floor(car.z);
        const n = fx.int(3, 6) + Math.floor(G.skills.level('mech') / 2);
        for (let k = 0; k < n; k++) G.world.addGround(0, i, j + (car.ax === 'x' ? -1 : 0), mkItem('scrap'));
        G.world.addGround(0, i, j, mkItem('elec_parts'));
        G.world.addGround(0, i, j, mkItem('wire'));
        if (car.battery) {
          car.battery = false;
          G.world.addGround(0, i, j, mkItem('car_battery'));
        }
        G.skills.xp('mech', 18);
        G.events.emit('car', car);
      },
    });
    // allarme dell'auto con poca esperienza
    if (!car.military && G.skills.level('mech') < 2 && fx.chance(0.3)) {
      setTimeout(() => {
        if (G.state !== 'playing') return;
        G.hud.toast("L'allarme dell'auto! Scappa!", 'bad');
        G.combat.alarms.push({ x: car.x, z: car.z, L: 0, t: 14, next: 0, car: true });
      }, 2500);
    }
  }

  siphon(car) {
    const G = this.G;
    if (!G.inv.hasTool('hose')) return G.hud.toast('Serve un tubo di gomma.');
    const can = G.inv.usable().map((e) => e.it).find((it) => it.id === 'gas_can' && (it.liq || 0) < 10);
    if (!can) return G.hud.toast('Serve una tanica non piena.');
    if (car.fuel <= 0.05) return G.hud.toast('Il serbatoio è vuoto.');
    G.actions.start({
      name: 'Travasa la benzina', dur: 6, anim: 'craft', sound: { name: 'pour', every: 1.5 },
      onDone: () => {
        const take = Math.min(car.fuel, 10 - (can.liq || 0));
        can.liq = (can.liq || 0) + take;
        car.fuel -= take;
        G.hud.toast('Travasati ' + take.toFixed(1).replace('.', ',') + ' L di benzina.', 'good');
        G.events.emit('inv');
      },
    });
  }

  // ---------------------------------------------------------------- costruzione su griglia
  pieceCheck(id, placement) {
    const G = this.G;
    const p = BUILD[id];
    if (p.learn && !G.skills.knows(id)) return { ok: false, why: 'Non conosci questo progetto (' + ITEMS[p.learn].n + ')' };
    for (const k in p.skill || {}) if (G.skills.level(k) < p.skill[k]) return { ok: false, why: SKILLS[k] + ' ' + p.skill[k] + ' richiesta' };
    if (p.bench && !this.benchInBase(p.bench)) return { ok: false, why: 'Serve un ' + BENCH_NAMES[p.bench] + ' entro 25 m' };
    const srcs = G.crafting.sources(3);
    for (const [spec, q] of p.cost) if (G.crafting.countIn(srcs, spec) < q) return { ok: false, why: 'Ti serve: ' + specName(spec) + (q > 1 ? ' ×' + q : '') + ' (addosso o a terra vicino)' };
    for (const t of p.tools) if (!G.crafting.toolIn(srcs, t)) return { ok: false, why: 'Ti serve: ' + TOOL_NAMES[t] };
    if (placement) {
      const v = this.validPlacement(id, placement);
      if (!v.ok) return v;
    }
    return { ok: true, srcs };
  }

  benchInBase(type) {
    const G = this.G, p = G.player;
    return G.world.furn.some((f) => !f.removed && FURN[f.type].bench === type && Math.hypot(f.x - p.x, f.z - p.z) < 25);
  }

  validPlacement(id, pl) {
    const G = this.G;
    const g = G.grid;
    const p = BUILD[id];
    const { L, i, j } = pl;
    if (!p.L.includes(L)) return { ok: false, why: L === 1 ? 'Solo a terra' : 'Solo al piano di sopra' };
    const freeCell = (ii, jj, LL = L) => g.inb(ii, jj) && !g.cellBlocked(LL, ii, jj) && !g.lv[LL].furn[g.idx(ii, jj)] && !(LL === 0 && g.stairCell[g.idx(ii, jj)] >= 0);
    const outdoorGround = (ii, jj) => g.inb(ii, jj) && g.bld[g.idx(ii, jj)] < 0 && g.lv[0].floor[g.idx(ii, jj)] !== F.FOREST && freeCell(ii, jj, 0) && !G.world.builtFloors.has('0,' + ii + ',' + jj);
    const pp = G.player;
    if (Math.floor(pp.x) === i && Math.floor(pp.z) === j && p.kind === 'cell' && L === pp.L && !FURN[p.furn || 'garden']?.walk) return { ok: false, why: 'Sei in mezzo' };
    switch (p.needs) {
      case 'ground':
        if (p.kind === 'edge') {
          if (pl.edgeExists) return { ok: false, why: 'C\'è già qualcosa' };
          const [a, b] = pl.cells;
          if (g.bld[g.idx(a[0], a[1])] >= 0 || g.bld[g.idx(b[0], b[1])] >= 0) return { ok: false, why: 'Non dentro gli edifici' };
          return { ok: true };
        }
        if (!outdoorGround(i, j)) return { ok: false, why: 'Serve terreno libero all\'aperto' };
        return { ok: true };
      case 'ground2':
        for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) if (!outdoorGround(i + di, j + dj)) return { ok: false, why: 'Serve uno spazio libero 2×2' };
        if (!outdoorGround(i, j + 2) && !outdoorGround(i + 1, j + 2)) return { ok: false, why: 'Serve spazio per la scala' };
        return { ok: true };
      case 'outdoor':
        if (g.roofed(0, i, j) || g.bld[g.idx(i, j)] >= 0 || !freeCell(i, j)) return { ok: false, why: 'Serve un posto all\'aperto' };
        return { ok: true };
      case 'soil': {
        const f = g.lv[0].floor[g.idx(i, j)];
        if (!(f === F.GRASS || f === F.DIRT || f === F.FIELD) || g.bld[g.idx(i, j)] >= 0 || !freeCell(i, j)) return { ok: false, why: 'Serve terra o erba libera' };
        return { ok: true };
      }
      case 'floor_any': {
        const sz = p.size || [1, 1];
        for (let a = 0; a < sz[0]; a++) {
          const ii = pl.rot % 2 === 0 ? i + a : i, jj = pl.rot % 2 === 0 ? j : j + a;
          if (!freeCell(ii, jj) || !g.hasFloor(L, ii, jj)) return { ok: false, why: 'Serve un pavimento libero' };
        }
        if (id === 'generator' && !(G.inv.bulky && G.inv.bulky.kind === 'item' && G.inv.bulky.item.id === 'generator')) return { ok: false, why: 'Devi avere il generatore in braccio' };
        return { ok: true };
      }
      case 'support': {
        if (pl.edgeExists) return { ok: false, why: 'C\'è già qualcosa' };
        const [a, b] = pl.cells;
        const sup = (c) => (L === 0 ? G.world.builtFloors.has('0,' + c[0] + ',' + c[1]) : G.world.builtFloors.has('1,' + c[0] + ',' + c[1]));
        if (!sup(a) && !sup(b)) return { ok: false, why: L === 0 ? 'Un muro senza fondamenta crolla' : 'Serve un solaio sotto' };
        return { ok: true };
      }
      case 'span': {
        if (g.lv[1].floor[g.idx(i, j)] !== F.NONE) return { ok: false, why: 'C\'è già un pavimento' };
        if (g.bld[g.idx(i, j)] >= 0) return { ok: false, why: 'Non sopra gli edifici' };
        const d = this.supportDist(i, j, MATERIALS[p.mat].span, p.mat);
        if (d === null) return { ok: false, why: 'Senza sostegni crolla (muri o pali sotto, campata ' + MATERIALS[p.mat].span + ')' };
        return { ok: true };
      }
      case 'ladder': {
        if (!freeCell(i, j, 0) || g.bld[g.idx(i, j)] >= 0) return { ok: false, why: 'Serve spazio libero' };
        const t = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dz]) => [i + dx, j + dz]).find(([a, b]) => g.inb(a, b) && G.world.builtFloors.has('1,' + a + ',' + b));
        if (!t) return { ok: false, why: 'Va appoggiata a un solaio costruito' };
        pl.ladderTo = t;
        return { ok: true };
      }
    }
    return { ok: true };
  }

  // distanza di sostegno per un solaio al primo piano
  directSupport(i, j) {
    const G = this.G, g = G.grid;
    const f = g.furnAt(0, i, j);
    if (f && f.type === 'post' && !f.removed) return true;
    for (const [a, b, c, d] of [[i, j, i + 1, j], [i, j, i - 1, j], [i, j, i, j + 1], [i, j, i, j - 1]]) {
      const e = g.edgeBetween(0, a, b, c, d);
      if (e && e.built && (e.t === E.WALL || e.t === E.WINDOW || e.t === E.DOOR || e.t === E.OPENING)) return true;
    }
    return false;
  }
  supportDist(i, j, span) {
    if (this.directSupport(i, j)) return 0;
    const G = this.G;
    // BFS sui solai costruiti verso un sostegno diretto
    const seen = new Set([i + ',' + j]);
    let frontier = [[i, j]];
    for (let d = 1; d <= span; d++) {
      const next = [];
      for (const [a, b] of frontier) {
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const na = a + dx, nb = b + dz;
          const k = na + ',' + nb;
          if (seen.has(k)) continue;
          seen.add(k);
          if (!G.world.builtFloors.has('1,' + k)) continue;
          if (this.directSupport(na, nb)) return d;
          next.push([na, nb]);
        }
      }
      frontier = next;
    }
    return null;
  }

  // ricalcola i sostegni: i solai senza appoggio crollano, e con loro i muri sopra
  checkIntegrity() {
    const G = this.G;
    let changed = true, guard = 0;
    while (changed && guard++ < 20) {
      changed = false;
      for (const [key, pc] of [...G.world.builtFloors]) {
        if (pc.L !== 1) continue;
        if (this.supportDist(pc.i, pc.j, MATERIALS[pc.mat].span) === null) {
          this.collapseFloor(key, pc);
          changed = true;
        }
      }
      for (const e of [...G.grid.edges.values()]) {
        if (!e.built) continue;
        const [a, b] = G.grid.edgeCells(e);
        if (e.L === 1) {
          if (!G.world.builtFloors.has('1,' + a[0] + ',' + a[1]) && !G.world.builtFloors.has('1,' + b[0] + ',' + b[1])) {
            this.destroyEdge(e, true);
            changed = true;
          }
        } else if (e.t !== E.FENCE && e.t !== E.HFENCE) {
          if (!G.world.builtFloors.has('0,' + a[0] + ',' + a[1]) && !G.world.builtFloors.has('0,' + b[0] + ',' + b[1])) {
            this.destroyEdge(e, true);
            changed = true;
          }
        }
      }
    }
  }

  collapseFloor(key, pc) {
    const G = this.G, g = G.grid;
    G.world.builtFloors.delete(key);
    g.lv[1].floor[g.idx(pc.i, pc.j)] = F.NONE;
    g.version++;
    // quello che c'era sopra cade giù
    const gk = '1,' + pc.i + ',' + pc.j;
    const items = G.world.ground.get(gk);
    if (items) {
      for (const it of items.splice(0)) G.world.addGround(0, pc.i, pc.j, it);
      G.world.ground.delete(gk);
      G.events.emit('ground', gk);
    }
    const f = g.furnAt(1, pc.i, pc.j);
    if (f) this.removeFurn(f);
    if (fx.chance(0.5)) G.world.addGround(0, pc.i, pc.j, mkItem(pc.mat === 'wood' ? 'plank' : 'scrap'));
    G.audio.play('collapse', pc.i + 0.5, 3, pc.j + 0.5);
    G.noise.emit(pc.i + 0.5, pc.j + 0.5, 22, { L: 0, src: 'world', kind: 'collapse' });
    G.events.emit('floor', key);
    G.hud.toast('Un solaio è crollato!', 'bad');
  }

  destroyEdge(e, silent) {
    const G = this.G;
    G.grid.removeEdge(e);
    G.paths.invalidate();
    G.events.emit('edge', e);
    if (!silent) this.checkIntegrity();
    if (silent) {
      const c = edgeCenterOf(e);
      G.audio.play('collapse', c.x, e.L * 3 + 1, c.z);
    }
  }

  // posizionamento a partire dallo sguardo
  computePlacement(id) {
    const G = this.G;
    const p = BUILD[id];
    const pl = G.player;
    const cam = G.camera;
    const dir = { x: -Math.sin(pl.yaw) * Math.cos(pl.pitch), y: Math.sin(pl.pitch), z: -Math.cos(pl.yaw) * Math.cos(pl.pitch) };
    const L = p.L.length === 1 ? p.L[0] : pl.L;
    const planeY = L === 1 ? LEVEL_H : 0.1;
    const oy = cam.position.y;
    let t;
    if (Math.abs(dir.y) > 0.02) t = (planeY - oy) / dir.y;
    if (!(t > 0) || t > 6) t = 2.4;
    const hx = cam.position.x + dir.x * t, hz = cam.position.z + dir.z * t;
    const i = Math.floor(hx), j = Math.floor(hz);
    const rot = this.mode ? this.mode.rot : 0;
    if (p.kind === 'edge') {
      const fx2 = hx - i, fz2 = hz - j;
      // lato più vicino al punto mirato
      const dl = fx2, dr = 1 - fx2, dt = fz2, db = 1 - fz2;
      const m = Math.min(dl, dr, dt, db);
      let o, ei, ej, cells;
      if (m === dt) { o = 0; ei = i; ej = j; cells = [[i, j - 1], [i, j]]; }
      else if (m === db) { o = 0; ei = i; ej = j + 1; cells = [[i, j], [i, j + 1]]; }
      else if (m === dl) { o = 1; ei = i; ej = j; cells = [[i - 1, j], [i, j]]; }
      else { o = 1; ei = i + 1; ej = j; cells = [[i, j], [i + 1, j]]; }
      const exists = o === 0 ? !!G.grid.hId(L, ei, ej) : !!G.grid.vId(L, ei, ej);
      return { kind: 'edge', L, o, i: ei, j: ej, cells, edgeExists: exists, x: o === 0 ? ei + 0.5 : ei, z: o === 0 ? ej : ej + 0.5 };
    }
    return { kind: p.kind, L, i, j, rot, x: i + 0.5, z: j + 0.5 };
  }

  startMode(id) {
    this.mode = { id, rot: 0 };
    this.G.hud.toast('Costruzione: ' + BUILD[id].n + '. Mira dove vuoi costruire.');
  }
  stopMode() {
    this.mode = null;
    this.ghost = null;
    this.G.fx.buildGhost(null);
  }
  rotate() {
    if (this.mode) this.mode.rot = (this.mode.rot + 1) % 4;
  }

  updateGhost() {
    const G = this.G;
    if (!this.mode) return;
    const pl = this.computePlacement(this.mode.id);
    const c = this.pieceCheck(this.mode.id, pl);
    this.ghost = { pl, ok: c.ok, why: c.why };
    G.fx.buildGhost(BUILD[this.mode.id], pl, c.ok);
  }

  confirm() {
    const G = this.G;
    if (!this.mode || !this.ghost) return;
    const id = this.mode.id;
    const pl = this.ghost.pl;
    const c = this.pieceCheck(id, pl);
    if (!c.ok) {
      G.hud.toast(c.why);
      return;
    }
    const p = BUILD[id];
    const lvl = G.skills.level(p.mat === 'metal' ? 'metal' : 'carp');
    G.actions.start({
      name: p.n, dur: p.time * (1 - Math.min(0.4, lvl * 0.05)), anim: 'hammer', hands: true, repetitive: true,
      noise: p.noise ? { r: p.noise * (1 - Math.min(0.3, lvl * 0.03)), every: 0.85 } : null,
      sound: { name: (p.tools || []).includes('welder') ? 'weld' : p.mat === 'cement' ? 'trowel' : 'hammer', every: 0.55, at: { x: pl.x, y: pl.L * 3 + 0.8, z: pl.z } },
      onDone: () => {
        const cc = this.pieceCheck(id, pl);
        if (!cc.ok) return G.hud.toast(cc.why);
        for (const [spec, q] of p.cost) G.crafting.consume(cc.srcs, spec, q);
        G.crafting.wearTools(cc.srcs, p.tools);
        this.create(id, pl);
        for (const k in p.xp || {}) G.skills.xp(k, p.xp[k]);
        G.audio.play('craft');
      },
    });
  }

  create(id, pl, prebuilt) {
    const G = this.G, g = G.grid;
    const p = BUILD[id];
    const q = prebuilt ? 1 : G.crafting.quality(p.mat === 'metal' ? 'metal' : 'carp');
    const hp = Math.round(p.hp * [0.7, 1, 1.15, 1.3][q]);
    if (p.kind === 'edge') {
      const t = p.fence ? (p.fence === 'high' ? E.HFENCE : E.FENCE) : p.door ? E.DOOR : p.window ? E.WINDOW : E.WALL;
      const e = g.setEdge(pl.L, pl.o, pl.i, pl.j, {
        t, built: true, bmat: p.mat, mat: p.mat === 'metal' ? 'metal' : 'wood', hp, maxHp: hp, st: t === E.WINDOW ? ST.OPEN : ST.CLOSED,
        h: p.fence === 'high' ? 2.1 : p.fence ? 1.0 : LEVEL_H, swing: 1, piece: id,
      });
      if (t === E.WINDOW) {
        e.st = ST.BROKEN;
        e.cleared = true;
        e.frame = true;
      }
      if (t === E.DOOR) e.hp = hp;
      g.version++;
      G.paths.invalidate();
      G.events.emit('edge', e);
      return e;
    }
    if (p.kind === 'tower') return this.createTower(pl, hp);
    if (p.furn) {
      const d = FURN[p.furn];
      const rot = pl.rot || 0;
      const along = rot % 2 === 0;
      const f = {
        id: G.world.furn.length, type: p.furn, i: pl.i, j: pl.j, w: along ? d.sz[0] : d.sz[1], d: along ? d.sz[1] : d.sz[0], L: pl.L, rot,
        room: -1, bld: -1, zone: g.zone[g.idx(pl.i, pl.j)], loot: null, items: d.cont ? [] : null, searched: true, tall: !!d.tall, walk: !!d.walk,
        cold: false, h: d.h, state: {}, built: true, hp, maxHp: hp, piece: id,
      };
      f.x = f.i + f.w / 2;
      f.z = f.j + f.d / 2;
      if (p.furn === 'campfire') f.state.fuel = 3;
      if (p.furn === 'rain_collector') f.state.water = 0;
      if (p.furn === 'generator') {
        const it = G.inv.bulky && G.inv.bulky.item;
        f.state.fuel = it && it.genFuel ? it.genFuel : 0;
        f.state.on = false;
        G.inv.bulky = null;
        G.events.emit('inv');
      }
      if (p.furn === 'ladder') f.state.to = pl.ladderTo;
      if (p.furn === 'garden') f.state = { crop: null, growth: 0, water: 0.3 };
      G.world.furn.push(f);
      for (let jj = f.j; jj < f.j + f.d; jj++) for (let ii = f.i; ii < f.i + f.w; ii++) g.lv[f.L].furn[g.idx(ii, jj)] = f.id + 1;
      g.version++;
      G.events.emit('furn', f);
      if (p.furn === 'post') this.checkIntegrity();
      return f;
    }
    // fondamenta e solai
    const key = pl.L + ',' + pl.i + ',' + pl.j;
    const pc = { L: pl.L, i: pl.i, j: pl.j, mat: p.mat, hp, maxHp: hp, piece: id };
    G.world.builtFloors.set(key, pc);
    if (pl.L === 0) g.lv[0].floor[g.idx(pl.i, pl.j)] = FOUND_FLOOR[p.mat];
    else g.lv[1].floor[g.idx(pl.i, pl.j)] = PFLOOR[p.mat];
    g.version++;
    G.paths.invalidate();
    G.events.emit('floor', key);
    return pc;
  }

  createTower(pl, hp) {
    const G = this.G;
    const { i, j } = pl;
    for (const [di, dj] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
      this.create('post_wood', { kind: 'cell', L: 0, i: i + di, j: j + dj, rot: 0 }, true);
      this.create('floor_wood', { kind: 'cell', L: 1, i: i + di, j: j + dj }, true);
    }
    // parapetto su tre lati, la scala sul quarto
    const rails = [[0, i, j], [0, i + 1, j], [1, i, j], [1, i, j + 1], [1, i + 2, j], [1, i + 2, j + 1]];
    for (const [o, a, b] of rails) {
      const e = G.grid.setEdge(1, o, a, b, { t: E.FENCE, built: true, bmat: 'wood', mat: 'wood', hp: 80, maxHp: 80, h: 1.0, piece: 'fence_wood' });
      G.events.emit('edge', e);
    }
    const lj = G.grid.cellBlocked(0, i, j + 2) ? i + 1 : i;
    this.create('ladder', { kind: 'cell', L: 0, i: lj, j: j + 2, rot: 0, ladderTo: [lj, j + 1] }, true);
    G.grid.version++;
    G.paths.invalidate();
  }

  // smonta un pezzo costruito: restituisce parte dei materiali
  dismantleBuilt(target) {
    const G = this.G;
    if (!G.inv.hasTool('hammer') && !G.inv.hasTool('crowbar')) return G.hud.toast('Serve un martello o un piede di porco.');
    const id = target.piece;
    const p = BUILD[id] || BUILD.wall_wood;
    G.actions.start({
      name: 'Smonta: ' + p.n, dur: p.time * 0.6, anim: 'hammer', noise: { r: p.noise || 18, every: 0.9 }, sound: { name: 'woodbreak', every: 1.4 },
      onDone: () => {
        for (const [spec, q] of p.cost) {
          if (typeof spec !== 'string' || !ITEMS[spec] || spec === 'generator') continue;
          const n = Math.floor(q * 0.5);
          for (let k = 0; k < n; k++) if (!ITEMS[spec].stack) G.crafting.give(mkItem(spec));
          if (ITEMS[spec].stack && n) G.crafting.give(mkItem(spec, { n }));
        }
        if (target.edge) this.destroyEdge(target.edge);
        else if (target.furn) {
          if (target.furn.type === 'generator') G.crafting.give(mkItem('generator'));
          this.removeFurn(target.furn);
        } else if (target.floorKey) {
          const pc = G.world.builtFloors.get(target.floorKey);
          G.world.builtFloors.delete(target.floorKey);
          G.grid.lv[pc.L].floor[G.grid.idx(pc.i, pc.j)] = pc.L === 0 ? F.GRASS : F.NONE;
          G.grid.version++;
          G.paths.invalidate();
          G.events.emit('floor', target.floorKey);
          this.checkIntegrity();
        }
      },
    });
  }

  repairCheck(target) {
    const G = this.G;
    const mat = target.mat || 'wood';
    const need = mat === 'wood' ? [['plank', 1], ['nails', 3]] : mat === 'metal' ? [['scrap', 1]] : [['cement', 1]];
    const tool = mat === 'wood' ? 'hammer' : mat === 'metal' ? 'welder' : 'trowel';
    const srcs = G.crafting.sources(3);
    for (const [s, q] of need) if (G.crafting.countIn(srcs, s) < q) return { ok: false, why: 'Ti serve: ' + specName(s) };
    if (!G.crafting.toolIn(srcs, tool)) return { ok: false, why: 'Ti serve: ' + TOOL_NAMES[tool] };
    return { ok: true, need, tool, srcs };
  }

  repair(target) {
    const G = this.G;
    const c = this.repairCheck(target);
    if (!c.ok) return G.hud.toast(c.why);
    G.actions.start({
      name: 'Ripara', dur: 5, anim: 'hammer', noise: { r: 18, every: 0.9 }, sound: { name: 'hammer', every: 0.6 },
      onDone: () => {
        const cc = this.repairCheck(target);
        if (!cc.ok) return;
        for (const [s, q] of cc.need) G.crafting.consume(cc.srcs, s, q);
        const o = target.edge || target.furn || G.world.builtFloors.get(target.floorKey);
        o.hp = Math.min(o.maxHp, o.hp + o.maxHp * (0.35 + G.skills.level('carp') * 0.04));
        G.skills.xp(target.mat === 'metal' ? 'metal' : 'carp', 5);
        if (target.edge) G.events.emit('edge', target.edge);
        if (target.furn) G.events.emit('furn', target.furn);
        if (target.floorKey) G.events.emit('floor', target.floorKey);
      },
    });
  }

  // zombie contro i mobili-barricata e i pali
  damageFurn(f, dmg) {
    const G = this.G;
    f.hp = (f.hp || 40) - dmg;
    G.audio.play('bash', f.x, f.L * 3 + 0.8, f.z, 0.8);
    if (f.hp <= 0) {
      G.audio.play('woodbreak', f.x, f.L * 3 + 0.8, f.z);
      G.noise.emit(f.x, f.z, 14, { L: f.L, src: 'world', kind: 'break' });
      if (FURN[f.type].dis) for (let k = 0; k < 2; k++) G.world.addGround(f.L, Math.floor(f.x), Math.floor(f.z), mkItem('plank'));
      this.removeFurn(f);
      return true;
    }
    return false;
  }

  // pezzi già costruiti all'inizio (cantiere)
  prebuild(list) {
    for (const p of list || []) {
      if (p.kind === 'found') this.create('found_' + p.mat, { kind: 'cell', L: 0, i: p.i, j: p.j }, true);
    }
    for (const p of list || []) {
      if (p.kind === 'wall') {
        const cells = p.o === 0 ? [[p.i, p.j - 1], [p.i, p.j]] : [[p.i - 1, p.j], [p.i, p.j]];
        this.create('wall_' + p.mat, { kind: 'edge', L: 0, o: p.o, i: p.i, j: p.j, cells }, true);
      }
    }
  }
}

export function edgeCenterOf(e) {
  return e.o === 0 ? { x: e.i + 0.5, z: e.j } : { x: e.i, z: e.j + 0.5 };
}

export { hasBarricade, BLK, clamp };
