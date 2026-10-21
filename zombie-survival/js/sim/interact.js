// Interazioni: cosa stai guardando (mobili, porte, finestre, oggetti a terra, cadaveri, auto, scale)
// e la lista di azioni possibili. PC: rotella o Q per scegliere, E per eseguire. Touch: tocchi il pulsante.
import { FURN } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { E, ST, hasBarricade } from '../world/grid.js';
import { LEVEL_H } from '../config.js';
import { breakWindow } from './structures.js';
import { ensureFurnItems, ensureCarItems, mkItem, itemName, totalWeight } from './items.js';
import { fx } from '../core/rng.js';
import { clamp } from '../core/util.js';
import { BARRICADE } from '../data/build.js';
import { NOISE } from './noise.js';

const REACH = 2.5;

function rayBox(o, d, b) {
  let tmin = 0, tmax = 1e9;
  for (const [oa, da, a0, a1] of [[o.x, d.x, b.x0, b.x1], [o.y, d.y, b.y0, b.y1], [o.z, d.z, b.z0, b.z1]]) {
    if (Math.abs(da) < 1e-9) {
      if (oa < a0 || oa > a1) return null;
    } else {
      let t1 = (a0 - oa) / da, t2 = (a1 - oa) / da;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

export class Interact {
  constructor(G) {
    this.G = G;
    this.target = null;
    this.actions = [];
    this.sel = 0;
    this.lastKey = '';
    this.scanT = 0;
  }

  reset() {
    this.target = null;
    this.actions = [];
    this.sel = 0;
  }

  update(dt, inp) {
    const G = this.G;
    this.scanT -= dt;
    if (this.scanT <= 0) {
      this.scanT = 0.1;
      this.scan();
    }
    if (inp.wheel && this.actions.length > 1) this.sel = (this.sel + (inp.wheel > 0 ? 1 : -1) + this.actions.length) % this.actions.length;
    if (inp.pressed.has('cycle') && this.actions.length > 1) this.sel = (this.sel + 1) % this.actions.length;
    if (inp.pressed.has('interact') && G.state === 'playing' && !G.player.anim) this.run(this.sel);
  }

  run(k) {
    const G = this.G;
    const a = this.actions[k];
    if (!a) return;
    if (G.actions.current && !a.instant) G.actions.cancel('nuova');
    if (!a.ok) {
      G.hud.toast(a.why || 'Non puoi.');
      return;
    }
    a.run();
    this.scanT = 0;
  }

  // ---------------------------------------------------------------- scansione del bersaglio
  scan() {
    const G = this.G;
    const p = G.player;
    if (G.state !== 'playing' || p.anim || G.building.mode) {
      this.setTarget(null);
      return;
    }
    const cam = G.camera.position;
    const o = { x: cam.x, y: cam.y, z: cam.z };
    const d = { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) };
    const g = G.grid;
    let best = null;
    const consider = (t, box, kind, ref, blocker) => {
      const h = rayBox(o, d, box);
      if (h === null || h > REACH) return;
      if (!best || h < best.t) best = { t: h, box, kind, ref, blocker };
    };
    const pi = Math.floor(p.x), pj = Math.floor(p.z);
    const L = p.L;
    const base = L * LEVEL_H;
    this.scanId = (this.scanId || 0) + 1;
    // mobili
    for (let j = pj - 3; j <= pj + 3; j++)
      for (let i = pi - 3; i <= pi + 3; i++) {
        if (!g.inb(i, j)) continue;
        for (const LL of [L, 0]) {
          const v = g.lv[LL].furn[g.idx(i, j)];
          if (!v) continue;
          const f = G.world.furn[v - 1];
          if (!f || f.removed || f.carried || f._seen === this.scanId) continue;
          if (LL !== L && f.type !== 'ladder') continue;
          f._seen = this.scanId;
          const fy = LL === 1 ? LEVEL_H : g.groundY(0, f.x, f.z);
          const h = f.type === 'ladder' ? 3.7 : Math.max(0.35, FURN[f.type].h);
          consider(0, { x0: f.i + 0.04, x1: f.i + f.w - 0.04, y0: fy, y1: fy + h, z0: f.j + 0.04, z1: f.j + f.d - 0.04 }, 'furn', f);
        }
      }
    // lati
    for (let j = pj - 3; j <= pj + 3; j++)
      for (let i = pi - 3; i <= pi + 3; i++) {
        for (const e of [g.hEdge(L, i, j), g.vEdge(L, i, j)]) {
          if (!e) continue;
          const h = e.h || LEVEL_H;
          const box = e.o === 0 ? { x0: e.i, x1: e.i + 1, y0: base, y1: base + h, z0: e.j - 0.1, z1: e.j + 0.1 } : { x0: e.i - 0.1, x1: e.i + 0.1, y0: base, y1: base + h, z0: e.j, z1: e.j + 1 };
          const interactive = e.t === E.DOOR || e.t === E.WINDOW || e.t === E.FENCE || e.built;
          const passable = e.t === E.OPENING || (e.t === E.DOOR && e.st !== ST.CLOSED && !hasBarricade(e));
          if (passable && !(e.t === E.DOOR)) continue;
          if (e.t === E.DOOR && e.st === ST.OPEN && !hasBarricade(e)) {
            // porta aperta: si può chiudere guardando il vano
            consider(0, box, 'edge', e);
            continue;
          }
          consider(0, box, interactive ? 'edge' : 'wall', e, !interactive);
        }
      }
    // scale
    for (const s of g.stairs) {
      const [li, lj] = s.cells[s.cells.length - 1];
      if (Math.abs(li - pi) > 5 || Math.abs(lj - pj) > 5) continue;
      if (!s.removed && L === 0) {
        const xs = s.cells.map((c) => c[0]), zs = s.cells.map((c) => c[1]);
        consider(0, { x0: Math.min(...xs), x1: Math.max(...xs) + 1, y0: 0, y1: 1.2, z0: Math.min(...zs), z1: Math.max(...zs) + 1 }, 'stairs', s);
      }
      if (s.removed) {
        // il buco (e la corda, se c'è)
        const box = { x0: li + 0.1, x1: li + 0.9, y0: L === 0 ? 0.2 : LEVEL_H - 0.6, y1: L === 0 ? 3.2 : LEVEL_H + 0.3, z0: lj + 0.1, z1: lj + 0.9 };
        consider(0, box, 'hole', s);
      }
    }
    // oggetti a terra
    for (let j = pj - 2; j <= pj + 2; j++)
      for (let i = pi - 2; i <= pi + 2; i++) {
        const k = L + ',' + i + ',' + j;
        const list = G.world.ground.get(k);
        if (!list || !list.length) continue;
        const gy = L === 1 ? LEVEL_H : g.groundY(0, i + 0.5, j + 0.5);
        consider(0, { x0: i + 0.1, x1: i + 0.9, y0: gy, y1: gy + 0.45, z0: j + 0.1, z1: j + 0.9 }, 'ground', k);
      }
    // cadaveri
    for (const c of G.world.corpses) {
      if (c.carried || c.L !== L || Math.abs(c.x - p.x) > 3 || Math.abs(c.z - p.z) > 3) continue;
      const gy = c.y !== undefined ? c.y : g.groundY(c.L, c.x, c.z);
      consider(0, { x0: c.x - 0.6, x1: c.x + 0.6, y0: gy, y1: gy + 0.45, z0: c.z - 0.6, z1: c.z + 0.6 }, 'corpse', c);
    }
    // auto
    if (L === 0) for (const car of G.world.cars) {
      if (car.gone || Math.abs(car.x - p.x) > 5 || Math.abs(car.z - p.z) > 5) continue;
      consider(0, { x0: car.i + 0.05, x1: car.i + car.w - 0.05, y0: 0, y1: car.van ? 2.1 : 1.5, z0: car.j + 0.05, z1: car.j + car.d - 0.05 }, 'car', car);
    }
    // carriole
    for (const b of G.world.barrows) {
      if (b.gone || b.held || Math.abs(b.x - p.x) > 3 || Math.abs(b.z - p.z) > 3) continue;
      const gy = b.L * LEVEL_H + g.groundY(b.L, b.x, b.z) * (b.L === 0 ? 1 : 0);
      consider(0, { x0: b.x - 0.45, x1: b.x + 0.45, y0: gy, y1: gy + 0.75, z0: b.z - 0.45, z1: b.z + 0.45 }, 'barrow', b);
    }
    // solai e fondamenta costruiti (guardando in basso)
    if (p.pitch < -0.6) {
      const k = L + ',' + pi + ',' + pj;
      const pc = G.world.builtFloors.get(k);
      if (pc && !best) best = { t: 1, box: { x0: pi, x1: pi + 1, y0: base - 0.02, y1: base + 0.16, z0: pj, z1: pj + 1 }, kind: 'floor', ref: k };
    }
    if (best && best.blocker) best = null;
    this.setTarget(best);
  }

  setTarget(t) {
    const G = this.G;
    const key = t ? t.kind + ':' + (t.ref && (t.ref.id !== undefined ? t.ref.id : t.ref)) : '';
    this.target = t;
    this.actions = t ? this.actionsFor(t) : this.selfActions();
    if (key !== this.lastKey) this.sel = 0;
    if (this.sel >= this.actions.length) this.sel = 0;
    this.lastKey = key;
    G.dyn.highlight(t && this.actions.length ? t.box : null);
    G.hud.setActions(this.actions, this.sel, t ? this.titleFor(t) : '');
  }

  titleFor(t) {
    const G = this.G;
    switch (t.kind) {
      case 'furn': {
        const f = t.ref;
        let n = FURN[f.type].n;
        if (f.type === 'garden' && f.state.crop) n += ': ' + ITEMS[f.state.crop].n.toLowerCase() + (f.state.dead ? ' (secco)' : f.state.growth >= 1 ? ' (maturo)' : ' (' + Math.round(f.state.growth * 100) + '%)');
        if (f.type === 'generator') n += f.state.on ? ' (acceso)' : ' (spento)';
        if (f.type === 'rain_collector') n += ' (' + Math.round(f.state.water || 0) + ' L)';
        if ((f.type === 'campfire' || f.type === 'kitchen_camp') && f.state.fuel > 0) n += ' (acceso)';
        if (f.barricade) n += ' — barricata';
        if (f.built && f.maxHp && f.hp < f.maxHp) n += ' (' + Math.round((f.hp / f.maxHp) * 100) + '%)';
        if (FURN[f.type].cont && f.searched && f.items && !f.items.length) n += ' (vuoto)';
        return n;
      }
      case 'edge': {
        const e = t.ref;
        let n = e.t === E.DOOR ? (e.gate ? 'Cancello' : 'Porta') : e.t === E.WINDOW ? 'Finestra' : e.t === E.FENCE ? 'Staccionata' : e.t === E.HFENCE ? 'Recinzione' : 'Muro';
        if (e.built) n += ' costruita';
        if (e.t === E.DOOR && e.st === ST.BROKEN) n += ' sfondata';
        if (e.t === E.WINDOW) n += e.st === ST.BROKEN ? (e.cleared ? ' (senza vetro)' : ' (vetro rotto)') : e.st === ST.OPEN ? ' (aperta)' : '';
        const bl = (e.bar ? e.bar.length : 0);
        if (e.metal > 0) n += ' — lamiera';
        else if (bl) n += ' — ' + bl + (bl === 1 ? ' asse' : ' assi');
        if (e.cover) n += ', coperta';
        if (e.built && e.maxHp) n += ' (' + Math.round((e.hp / e.maxHp) * 100) + '%)';
        return n;
      }
      case 'stairs': return 'Scale';
      case 'hole': return t.ref.rope ? 'Corda di lenzuola' : 'Vano scala vuoto';
      case 'ground': {
        const l = G.world.ground.get(t.ref) || [];
        return l.length === 1 ? itemName(l[0]) : 'Oggetti a terra (' + l.length + ')';
      }
      case 'corpse': return t.ref.special === 'oldself' ? 'Il tuo vecchio corpo' : t.ref.burned ? 'Resti carbonizzati' : 'Cadavere';
      case 'car': return t.ref.military ? 'Mezzo militare' : t.ref.dismantled ? 'Carcassa d\'auto' : 'Auto abbandonata';
      case 'barrow': return 'Carriola' + (t.ref.items.length ? ' (' + t.ref.items.length + ')' : '');
      case 'floor': return 'Pavimento costruito';
    }
    return '';
  }

  // azioni senza bersaglio (mani occupate)
  selfActions() {
    const G = this.G;
    const out = [];
    const b = G.inv.bulky;
    if (b) {
      if (b.kind === 'furn') out.push(this.A('Posa: ' + FURN[b.f.type].n, () => G.building.placeFurn()));
      else if (b.kind === 'barrow') out.push(this.A('Lascia la carriola', () => this.dropBulky()));
      else out.push(this.A('Lascia: ' + (b.kind === 'corpse' ? 'cadavere' : ITEMS[b.item.id].n), () => this.dropBulky()));
    }
    return out;
  }

  A(label, run, ok = true, why = '') {
    return { label, run, ok, why };
  }

  actionsFor(t) {
    const G = this.G;
    const out = [];
    const A = (l, r, ok, why) => out.push(this.A(l, r, ok, why));
    const bulky = G.inv.bulky;
    switch (t.kind) {
      case 'furn': {
        const f = t.ref;
        const d = FURN[f.type];
        const s = f.state;
        if (d.cont && !(d.glass && !s.smashed)) A('Apri: ' + d.n, () => this.openFurn(f));
        if (d.glass && !s.smashed) A('Rompi la vetrina', () => this.smashVending(f));
        if (d.sleep) A('Dormi', () => G.sleep.start(f), G.body.fatigue > 25 || !!G.body.meds.sleep, 'Non hai sonno.');
        if (d.use === 'tap') this.waterActions(out, f, G.decay.water(), false);
        if (d.use === 'toilet' || d.use === 'tub') this.waterActions(out, f, (s.water || 0) > 0.2, true);
        if (d.use === 'stove') {
          const pow = G.decay.powerAt(Math.floor(f.x), Math.floor(f.z));
          A('Cucina', () => G.ui.open('craft', { filter: 'Cibo' }), pow, 'Niente corrente: il fornello non funziona.');
        }
        if (d.bench && d.bench !== 'kitchen') A('Usa: ' + d.n, () => G.ui.open('craft', { bench: d.bench }));
        if (d.use === 'lamp') {
          const pow = G.decay.powerAt(Math.floor(f.x), Math.floor(f.z));
          A(s.on ? 'Spegni la lampada' : 'Accendi la lampada', () => {
            s.on = !s.on;
            G.events.emit('furn', f);
            G.audio.play('click');
          }, pow || s.on, 'Non c\'è corrente.');
        }
        if (d.use === 'pump') {
          const pow = G.decay.gridPower();
          const can = G.inv.usable().map((e) => e.it).find((it) => it.id === 'gas_can' && (it.liq || 0) < 10);
          A('Riempi la tanica', () => this.pump(can), pow && !!can, !pow ? 'Senza corrente le pompe non vanno.' : 'Serve una tanica.');
        }
        if (d.use === 'piano') A('Suona il pianoforte', () => this.playPiano(f));
        if (d.use === 'campfire' || d.use === 'campstove') {
          const fuel = this.fuelItem();
          A('Aggiungi legna' + (fuel ? ' (' + ITEMS[fuel.id].n.toLowerCase() + ')' : ''), () => G.base.addFuel(f, fuel), !!fuel, 'Servono assi, rami, giornali o stracci.');
          if (s.fuel > 0) A('Cucina sul fuoco', () => G.ui.open('craft', { filter: 'Cibo' }));
        }
        if (d.use === 'rain') this.waterActions(out, f, (s.water || 0) > 0.25, true, true);
        if (d.use === 'garden') this.gardenActions(out, f);
        if (d.use === 'generator') {
          A(s.on ? 'Spegni il generatore' : 'Accendi il generatore', () => G.base.toggleGenerator(f));
          A('Versa benzina (' + (s.fuel || 0).toFixed(1).replace('.', ',') + ' L)', () => G.base.refuel(f));
          if (!s.wired) A('Collega alla casa', () => G.base.wireGenerator(f));
        }
        if (d.use === 'ladder') {
          const p = G.player;
          if (p.L === 0) A('Sali', () => this.climbLadder(f, true));
          else A('Scendi', () => this.climbLadder(f, false));
        }
        if (d.dis && !f.built) {
          const c = G.building.dismantleCheck(f);
          A('Smonta' + (d.dis.tool ? ' (' + { hammer: 'martello', screwdriver: 'cacciavite', saw: 'sega', wrench: 'chiave inglese' }[d.dis.tool] + ')' : ''), () => G.building.dismantle(f), c.ok, c.why);
        }
        if ((d.move || f.barricade) && !bulky) A('Solleva e sposta', () => G.building.pickUpFurn(f), !(f.items && f.items.length), 'Prima svuotalo.');
        if (f.built) {
          if (f.hp < f.maxHp) A('Ripara', () => G.building.repair({ furn: f, mat: 'wood' }));
          A('Smonta', () => G.building.dismantleBuilt({ furn: f, piece: f.piece }));
        }
        break;
      }
      case 'edge': {
        const e = t.ref;
        const bl = hasBarricade(e);
        if (e.t === E.DOOR) {
          if (e.st === ST.CLOSED) A(bl ? 'Barricata' : e.gate ? 'Apri il cancello' : 'Apri la porta', () => this.toggleDoor(e), !bl, 'Prima togli la barricata.');
          else if (e.st === ST.OPEN) A(e.gate ? 'Chiudi il cancello' : 'Chiudi la porta', () => this.toggleDoor(e), !this.blockingDoor(e), 'C\'è qualcosa in mezzo.');
        }
        if (e.t === E.WINDOW) {
          if (e.st === ST.CLOSED && !bl && !e.frame) {
            A('Apri la finestra', () => this.openWindow(e));
            A('Rompi il vetro', () => this.smashWindow(e));
          }
          if (e.st === ST.OPEN && !bl && !e.frame) {
            A('Scavalca', () => this.climbWindow(e));
            A('Chiudi la finestra', () => this.closeWindow(e));
          }
          if (e.st === ST.BROKEN && !bl) {
            if (!e.cleared) A('Togli i vetri', () => this.clearGlass(e));
            A('Scavalca' + (!e.cleared ? ' (vetri!)' : ''), () => this.climbWindow(e));
          }
          if (!e.frame) {
            if (!e.cover) A('Copri con un lenzuolo', () => this.cover(e, true), G.inv.count('sheet') > 0, 'Serve un lenzuolo.');
            else A('Togli il lenzuolo', () => this.cover(e, false));
          }
        }
        if (e.t === E.FENCE) A('Scavalca', () => this.vault(e), !bl);
        if ((e.t === E.DOOR || e.t === E.WINDOW) && !(e.t === E.DOOR && e.gate)) {
          const cp = G.building.barricadeCheck(e, 'plank');
          A('Barrica con un\'asse' + (e.bar && e.bar.length ? ' (' + (e.bar.length + 1) + '/4)' : ''), () => G.building.barricade(e, 'plank'), cp.ok, cp.why);
          if (G.skills.knows('barricade_heavy')) {
            const ch = G.building.barricadeCheck(e, 'heavy');
            A('Barrica con asse rinforzata', () => G.building.barricade(e, 'heavy'), ch.ok, ch.why);
          }
          if (G.skills.knows('barricade_metal')) {
            const cm = G.building.barricadeCheck(e, 'metal');
            A('Rinforza con lamiera', () => G.building.barricade(e, 'metal'), cm.ok, cm.why);
          }
          if (bl) A('Togli un\'asse', () => G.building.unbarricade(e));
        }
        if (e.built) {
          if (e.hp < e.maxHp) A('Ripara', () => G.building.repair({ edge: e, mat: e.bmat }));
          A('Smonta', () => G.building.dismantleBuilt({ edge: e, piece: e.piece }));
        }
        break;
      }
      case 'stairs': {
        const s = t.ref;
        const ok = G.inv.hasTool('hammer') && G.inv.hasTool('saw');
        A('Smonta le scale', () => G.building.removeStairs(s), !!ok, 'Servono martello e sega.');
        break;
      }
      case 'hole': {
        const s = t.ref;
        const p = G.player;
        if (s.rope) {
          if (p.L === 0) A('Arrampicati sulla corda', () => this.climbRope(s, true));
          else A('Calati con la corda', () => this.climbRope(s, false));
        } else if (p.L === 1) {
          A('Fissa una corda di lenzuola', () => G.building.installRope(s), G.inv.count('sheet_rope') > 0, 'Serve una corda di lenzuola (2 lenzuola annodate).');
        }
        break;
      }
      case 'ground': {
        const list = G.world.ground.get(t.ref) || [];
        const big = list.find((it) => ITEMS[it.id].bulky);
        if (big && !bulky) A('Solleva: ' + ITEMS[big.id].n, () => this.liftGround(t.ref, big));
        if (bulky && bulky.kind === 'barrow' && big) A('Carica nella carriola', () => this.loadBarrow(bulky.b, t.ref, big));
        const small = list.filter((it) => !ITEMS[it.id].bulky);
        if (small.length === 1) A('Prendi: ' + itemName(small[0]), () => this.takeGround(t.ref, small[0]));
        if (list.length > 1 || small.length > 1) A('Guarda cosa c\'è', () => G.ui.open('loot', { kind: 'ground', key: t.ref }));
        break;
      }
      case 'corpse': {
        const c = t.ref;
        if (!c.burned) A('Perquisisci', () => G.ui.open('loot', { kind: 'corpse', corpse: c }));
        if (!bulky && !c.burned) A('Trascina', () => this.dragCorpse(c));
        const fuel = G.inv.usable().map((e) => e.it).find((it) => (it.id === 'gas_can' && it.liq >= 0.5) || (ITEMS[it.id].alcohol && it.n > 0));
        const fire = G.inv.hasTool('fire');
        A('Brucia', () => this.burnCorpse(c, fuel, fire), !!fuel && !!fire && !c.burned, !fire ? 'Serve qualcosa per accendere.' : c.burned ? 'Già bruciato.' : 'Serve benzina o alcol.');
        if (c.burned) A('Sotterra i resti', () => this.buryCorpse(c), !!G.inv.hasTool('shovel'), 'Serve una pala.');
        break;
      }
      case 'car': {
        const car = t.ref;
        if (!car.dismantled) {
          A('Bagagliaio', () => G.ui.open('loot', { kind: 'car', car, part: 'trunk' }));
          A('Cruscotto', () => G.ui.open('loot', { kind: 'car', car, part: 'glove' }));
          A('Travasa la benzina', () => G.building.siphon(car), !!G.inv.hasTool('hose'), 'Serve un tubo di gomma e una tanica.');
          A('Smonta l\'auto', () => G.building.dismantleCar(car));
        }
        break;
      }
      case 'barrow': {
        const b = t.ref;
        if (!bulky) A('Spingi la carriola', () => this.pushBarrow(b));
        if (bulky && bulky.kind === 'item') A('Metti nella carriola: ' + ITEMS[bulky.item.id].n, () => this.putInBarrow(b));
        if (bulky && bulky.kind === 'corpse') A('Carica il cadavere', () => G.hud.toast('Non ci sta: trascinalo.'), false, 'Troppo grande.');
        A('Guarda dentro', () => G.ui.open('loot', { kind: 'barrow', barrow: b }));
        break;
      }
      case 'floor': {
        const pc = G.world.builtFloors.get(t.ref);
        if (pc) {
          if (pc.hp < pc.maxHp) A('Ripara il pavimento', () => G.building.repair({ floorKey: t.ref, mat: pc.mat }));
          A('Smonta il pavimento', () => G.building.dismantleBuilt({ floorKey: t.ref, piece: pc.piece }));
        }
        break;
      }
    }
    // azioni delle mani occupate in coda
    for (const a of this.selfActions()) out.push(a);
    return out;
  }

  // ---------------------------------------------------------------- acqua
  waterActions(out, f, available, tainted, rain) {
    const G = this.G;
    const label = tainted ? ' (da bollire)' : '';
    const conts = G.inv.usable().map((e) => e.it).filter((it) => ITEMS[it.id].liq && ITEMS[it.id].liq.kind === 'water' && (it.liq || 0) < ITEMS[it.id].liq.cap - 0.01 && !(it.liq > 0.01 && !it.taint && tainted));
    out.push(this.A('Bevi' + label, () => this.drinkFrom(f, tainted, rain), available && G.body.thirst > 3, available ? 'Non hai sete.' : rain ? 'È vuoto.' : 'Non esce acqua.'));
    out.push(this.A('Riempi' + (conts[0] ? ': ' + ITEMS[conts[0].id].n.toLowerCase() : '') + label, () => this.fillFrom(f, conts, tainted, rain), available && conts.length > 0, !available ? 'Niente acqua.' : 'Serve una bottiglia, pentola o secchio.'));
  }
  drinkFrom(f, tainted, rain) {
    const G = this.G;
    G.actions.start({
      name: 'Bevi', dur: 3, anim: 'drink', sound: { name: 'drink', every: 1 },
      onDone: () => {
        const want = Math.min(1, G.body.thirst / 100 + 0.05);
        if (rain || tainted) {
          const key = rain ? 'water' : 'water';
          const av = f.state[key] || 0;
          const take = Math.min(av, want);
          f.state[key] = av - take;
          G.body.drinkWater(take, true);
        } else G.body.drinkWater(want, false);
        G.events.emit('furn', f);
      },
    });
  }
  fillFrom(f, conts, tainted, rain) {
    const G = this.G;
    G.actions.start({
      name: 'Riempi', dur: 2.5, anim: 'craft', sound: { name: 'pour', every: 1.2 },
      onDone: () => {
        for (const it of conts) {
          const cap = ITEMS[it.id].liq.cap;
          let need = cap - (it.liq || 0);
          if (rain || tainted) {
            const av = f.state.water || 0;
            need = Math.min(need, av);
            f.state.water = av - need;
            if (need <= 0) break;
            it.taint = true;
          } else it.taint = !!it.taint && (it.liq || 0) > 0.01;
          it.liq = (it.liq || 0) + need;
        }
        G.events.emit('inv');
        G.events.emit('furn', f);
        G.hud.toast('Riempito.');
      },
    });
  }

  gardenActions(out, f) {
    const G = this.G;
    const s = f.state;
    if (!s.crop) {
      const seeds = G.inv.usable().map((e) => e.it).find((it) => ITEMS[it.id].seed);
      out.push(this.A('Semina' + (seeds ? ': ' + ITEMS[seeds.id].n.toLowerCase() : ''), () => G.base.plant(f, seeds), !!seeds, 'Servono dei semi.'));
    } else if (s.dead) {
      out.push(this.A('Estirpa le piante secche', () => {
        s.crop = null;
        s.dead = false;
        s.growth = 0;
        G.events.emit('furn', f);
      }));
    } else if (s.growth >= 1) out.push(this.A('Raccogli', () => G.base.harvest(f)));
    if (s.crop && !s.dead) {
      const can = G.inv.usable().map((e) => e.it).find((it) => ITEMS[it.id].liq && ITEMS[it.id].liq.kind === 'water' && it.liq > 0.2);
      out.push(this.A('Annaffia' + (s.water < 0.15 ? ' (asciutto!)' : ''), () => G.base.water(f, can), !!can, 'Serve acqua (anche da bollire va bene).'));
    }
  }

  fuelItem() {
    const G = this.G;
    const b = G.inv.bulky;
    if (b && b.kind === 'item' && (b.item.id === 'plank' || b.item.id === 'log')) return b.item;
    const fuels = ['branch', 'newspaper', 'rag', 'rag_dirty', 'comic', 'plank'];
    for (const id of fuels) {
      const e = G.inv.usable().find((x) => x.it.id === id);
      if (e) return e.it;
    }
    return null;
  }

  // ---------------------------------------------------------------- porte e finestre
  blockingDoor() {
    return false;
  }
  toggleDoor(e) {
    const G = this.G;
    const c = e.o === 0 ? { x: e.i + 0.5, z: e.j } : { x: e.i, z: e.j + 0.5 };
    if (e.st === ST.CLOSED) {
      e.st = ST.OPEN;
      // apre dal lato opposto a te
      e.swing = -G.building.playerSide(e);
    } else e.st = ST.CLOSED;
    G.grid.version++;
    G.audio.play(e.gate ? 'gate' : 'door', c.x, e.L * 3 + 1.2, c.z);
    G.noise.emit(c.x, c.z, e.gate ? 5 : 2.5, { L: e.L, src: 'player', kind: 'door', ring: false });
    G.events.emit('edge', e);
  }
  openWindow(e) {
    const G = this.G;
    G.actions.start({
      name: 'Apri la finestra', dur: 1.6, anim: 'craft',
      onDone: () => {
        e.st = ST.OPEN;
        G.grid.version++;
        G.audio.play('window');
        G.noise.emit(G.player.x, G.player.z, 3, { L: e.L, src: 'player', kind: 'window', ring: false });
        G.events.emit('edge', e);
      },
    });
  }
  closeWindow(e) {
    const G = this.G;
    e.st = ST.CLOSED;
    G.grid.version++;
    G.audio.play('window');
    G.events.emit('edge', e);
  }
  smashWindow(e) {
    const G = this.G;
    const w = G.inv.weapon();
    breakWindow(G, e, 'player');
    if (!w && !G.inv.worn.hands && fx.chance(0.5)) G.body.addWound(fx.pick(['handL', 'handR']), 'lacer', 0.5, { glass: true });
  }
  breakWindowBy(e, src) {
    breakWindow(this.G, e, src);
  }
  clearGlass(e) {
    const G = this.G;
    G.actions.start({
      name: 'Togli i vetri', dur: 2.5, anim: 'craft', sound: { name: 'glasshit', every: 0.9 },
      onDone: () => {
        e.cleared = true;
        G.events.emit('edge', e);
        if (!G.inv.weapon() && !G.inv.worn.hands && fx.chance(0.3)) G.body.addWound(fx.pick(['handL', 'handR']), 'scratch', 0.6, { glass: true });
        G.noise.emit(G.player.x, G.player.z, 4, { L: e.L, src: 'player', kind: 'glass', ring: false });
      },
    });
  }
  // colpo a vuoto: se davanti c'è una finestra intatta, la rompe
  swingAtWindow() {
    const G = this.G;
    const t = this.target;
    if (t && t.kind === 'edge' && t.ref.t === E.WINDOW && t.ref.st === ST.CLOSED && !hasBarricade(t.ref) && t.t < 1.6) {
      breakWindow(G, t.ref, 'player');
    }
  }
  climbWindow(e) {
    const G = this.G;
    const g = G.grid;
    const [a, b] = g.edgeCells(e);
    const p = G.player;
    const from = Math.floor(p.x) === a[0] && Math.floor(p.z) === a[1] ? a : b;
    const to = from === a ? b : a;
    if (g.cellBlocked(e.L, to[0], to[1])) return G.hud.toast('Dall\'altra parte è bloccato.');
    const glass = e.st === ST.BROKEN && !e.cleared;
    G.audio.play('climb');
    p.startCross(e, 1.15, () => {
      if (glass) {
        const gloves = G.inv.worn.hands;
        const sleeves = G.inv.worn.torso_out;
        const pr = 0.45 * (gloves ? 0.4 : 1) * (sleeves ? 0.7 : 1);
        if (fx.chance(pr)) {
          G.body.addWound(fx.pick(['handL', 'handR', 'armL', 'armR', 'legL', 'legR']), fx.chance(0.3) ? 'deep' : 'lacer', fx.range(0.4, 0.9), { glass: true });
          G.hud.toast('Ti sei tagliato con i vetri!', 'bad');
        }
      }
    });
    G.noise.emit(p.x, p.z, 4, { L: e.L, src: 'player', kind: 'climb', ring: false });
  }
  vault(e) {
    const G = this.G;
    const g = G.grid;
    const [a, b] = g.edgeCells(e);
    const p = G.player;
    const from = Math.floor(p.x) === a[0] && Math.floor(p.z) === a[1] ? a : b;
    const to = from === a ? b : a;
    if (g.cellBlocked(e.L, to[0], to[1])) return G.hud.toast('Dall\'altra parte è bloccato.');
    G.audio.play('climb');
    G.body.useStamina(0.06);
    p.startCross(e, 0.75, null);
  }
  cover(e, on) {
    const G = this.G;
    if (on) {
      const it = G.inv.findId('sheet');
      if (!it) return;
      G.inv.remove(it.it.u);
    } else G.crafting.give(mkItem('sheet'));
    e.cover = on;
    G.grid.version++;
    G.events.emit('edge', e);
  }

  // ---------------------------------------------------------------- contenitori e oggetti
  openFurn(f) {
    const G = this.G;
    ensureFurnItems(G, f);
    const first = !f.searched;
    f.searched = true;
    G.audio.play(FURN[f.type].cold ? 'fridge' : 'drawer', f.x, f.L * 3 + 0.8, f.z);
    if (first) G.noise.emit(f.x, f.z, 2.2, { L: f.L, src: 'player', kind: 'search', ring: false });
    G.ui.open('loot', { kind: 'furn', f });
  }
  smashVending(f) {
    const G = this.G;
    f.state.smashed = true;
    G.audio.play('glass', f.x, f.L * 3 + 1, f.z);
    G.noise.emit(f.x, f.z, 15, { L: f.L, src: 'player', kind: 'glass' });
    G.fx.glassBurst(f.x, f.L * 3 + 1, f.z);
    G.events.emit('furn', f);
  }
  pump(can) {
    const G = this.G;
    G.actions.start({
      name: 'Riempi la tanica', dur: 5, anim: 'craft', sound: { name: 'pour', every: 1.4 },
      onDone: () => {
        can.liq = 10;
        G.events.emit('inv');
        G.hud.toast('Tanica piena: 10 L di benzina.', 'good');
      },
    });
  }
  playPiano(f) {
    const G = this.G;
    G.actions.start({
      name: 'Suona', dur: 8, anim: 'craft', noise: { r: 26, every: 1 }, sound: { name: 'piano', every: 0.45, at: { x: f.x, y: f.L * 3 + 1, z: f.z } },
      onDone: () => {
        G.mind.boredom = clamp(G.mind.boredom - 40, 0, 100);
        G.mind.morale = clamp(G.mind.morale + 8, 0, 100);
        G.mind.lonely = clamp(G.mind.lonely - 5, 0, 100);
        G.hud.say('Per un attimo, sembrava tutto normale.', 'piano');
      },
    });
  }
  takeGround(key, it) {
    const G = this.G;
    if (!G.inv.add(it)) return G.hud.toast('Non hai spazio.');
    G.world.removeGround(key, it);
    G.audio.play('pickup');
  }
  liftGround(key, it) {
    const G = this.G;
    if (G.inv.bulky) return G.hud.toast('Hai già le mani occupate.');
    G.world.removeGround(key, it);
    G.inv.bulky = { kind: 'item', item: it };
    G.audio.play('pickup');
    G.events.emit('inv');
  }
  dropBulky() {
    const G = this.G;
    const b = G.inv.bulky;
    if (!b) return;
    const p = G.player;
    if (b.kind === 'item') {
      G.inv.bulky = null;
      G.world.dropAtPlayer(b.item);
      // generatore e sveglie a tempo
    } else if (b.kind === 'furn') {
      if (!G.building.placeFurn()) return;
    } else if (b.kind === 'corpse') {
      const c = b.c;
      c.carried = false;
      c.x = p.x - Math.sin(p.yaw) * 0.8;
      c.z = p.z - Math.cos(p.yaw) * 0.8;
      c.L = p.L;
      c.y = G.grid.groundY(p.L, c.x, c.z);
      G.inv.bulky = null;
    } else if (b.kind === 'barrow') {
      const br = b.b;
      br.held = false;
      G.inv.bulky = null;
      G.dyn.updateBarrow(br);
    }
    G.audio.play('drop');
    G.events.emit('inv');
  }
  dragCorpse(c) {
    const G = this.G;
    c.carried = true;
    G.inv.bulky = { kind: 'corpse', c };
    G.audio.play('drag');
    G.events.emit('inv');
  }
  burnCorpse(c, fuel, fire) {
    const G = this.G;
    G.actions.start({
      name: 'Brucia il cadavere', dur: 4, anim: 'craft', sound: { name: 'pour', every: 1.4 },
      onDone: () => {
        if (fuel.id === 'gas_can') fuel.liq -= 0.5;
        else {
          fuel.n -= 1;
          if (fuel.n <= 0) G.inv.remove(fuel.u);
        }
        fire.n = (fire.n || 1) - 1;
        if (fire.n <= 0) G.inv.remove(fire.u);
        c.burned = true;
        c.burnT = 30;
        G.fx.fire(c.x, c.y || 0, c.z, 30);
        G.audio.play('fire', c.x, 0.5, c.z);
        G.noise.emit(c.x, c.z, 8, { L: c.L, src: 'player', kind: 'fire' });
        const p = G.player;
        if (Math.hypot(p.x - c.x, p.z - c.z) < 1.1 && fx.chance(0.5)) G.body.burn();
        G.events.emit('inv');
      },
    });
  }
  buryCorpse(c) {
    const G = this.G;
    G.actions.start({
      name: 'Sotterra i resti', dur: 8, anim: 'hammer', noise: { r: 6, every: 1.2 },
      onDone: () => {
        G.world.corpses = G.world.corpses.filter((x) => x !== c);
        G.mind.morale = clamp(G.mind.morale + 2, 0, 100);
      },
    });
  }
  pushBarrow(b) {
    const G = this.G;
    b.held = true;
    G.inv.bulky = { kind: 'barrow', b };
    G.events.emit('inv');
  }
  putInBarrow(b) {
    const G = this.G;
    const it = G.inv.bulky.item;
    if (b.items.length >= 12) return G.hud.toast('La carriola è piena.');
    b.items.push(it);
    G.inv.bulky = null;
    G.dyn.updateBarrow(b);
    G.audio.play('drop');
    G.events.emit('inv');
  }
  loadBarrow(b, key, it) {
    const G = this.G;
    if (b.items.length >= 12) return G.hud.toast('La carriola è piena.');
    G.world.removeGround(key, it);
    b.items.push(it);
    G.dyn.updateBarrow(b);
    G.audio.play('drop');
  }

  // ---------------------------------------------------------------- arrampicarsi
  climbLadder(f, up) {
    const G = this.G;
    const p = G.player;
    if (G.inv.bulky) return G.hud.toast('Con le mani occupate non si sale.');
    const [ti, tj] = f.state.to || [f.i, f.j - 1];
    G.audio.play('climb');
    if (up) p.startClimb(ti + 0.5, tj + 0.5, 1, 1.8, null);
    else p.startClimb(f.x, f.z + (f.j + 0.5 > tj ? 0.35 : -0.35), 0, 1.6, null);
  }
  climbRope(s, up) {
    const G = this.G;
    const p = G.player;
    if (G.inv.bulky) return G.hud.toast('Con le mani occupate non si sale.');
    const [li, lj] = s.cells[s.cells.length - 1];
    G.audio.play('climb');
    G.body.useStamina(0.15);
    if (up) p.startClimb(s.top[0] + 0.5, s.top[1] + 0.5, 1, 2.6, null);
    else p.startClimb(li + 0.5, lj + 0.5, 0, 2.2, null);
    G.noise.emit(p.x, p.z, 3, { L: p.L, src: 'player', kind: 'climb', ring: false });
  }
}

export { totalWeight, ensureCarItems, NOISE, BARRICADE };
