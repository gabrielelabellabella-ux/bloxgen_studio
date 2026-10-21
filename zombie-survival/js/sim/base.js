// Sistemi vivi della base: generatore (corrente, benzina, tanto rumore, monossido al chiuso),
// raccolta dell'acqua piovana, orto con stagioni, falò e cucina da campo, lampade, comfort.
import { FURN } from '../data/furniture.js';
import { ITEMS } from '../data/items.js';
import { E, ST } from '../world/grid.js';
import { LEVEL_H } from '../config.js';
import { clamp } from '../core/util.js';
import { fx } from '../core/rng.js';
import { mkItem } from './items.js';
import { Z } from './zombies.js';

const FUEL_HOURS = { plank: 2, branch: 0.8, log: 4, newspaper: 0.3, comic: 0.3, novel: 0.5, rag: 0.2, rag_dirty: 0.2, sheet: 0.4 };

export class Base {
  constructor(G) {
    this.G = G;
    this.genT = 0;
    this.lightT = 0;
    this.radioOn = false;
    this.lightSources = [];
  }

  generators() {
    return this.G.world.furn.filter((f) => !f.removed && f.type === 'generator');
  }

  genPowered(i, j) {
    for (const f of this.generators()) {
      if (f.state.on && f.state.wired && f.state.fuel > 0 && Math.hypot(f.x - i - 0.5, f.z - j - 0.5) < 14) return true;
    }
    return false;
  }

  nearBench(type) {
    const p = this.G.player;
    return this.G.world.furn.some((f) => !f.removed && FURN[f.type].bench === type && Math.hypot(f.x - p.x, f.z - p.z) < 3);
  }

  heatAt(x, z, L) {
    let h = 0;
    for (const f of this.G.world.furn) {
      if (f.removed || f.L !== L || !(f.type === 'campfire' || f.type === 'kitchen_camp') || !(f.state.fuel > 0)) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      const r = f.type === 'campfire' ? 4 : 2.5;
      if (d < r) h = Math.max(h, (f.type === 'campfire' ? 13 : 8) * (1 - d / r));
    }
    return h;
  }

  coAt(x, z, L) {
    const g = this.G.grid;
    let co = 0;
    for (const f of this.generators()) {
      if (!f.state.on || f.state.fuel <= 0) continue;
      if (!g.roofed(f.L, Math.floor(f.x), Math.floor(f.z))) continue;
      const d = Math.hypot(f.x - x, f.z - z);
      const sameBld = g.bld[g.idx(Math.floor(f.x), Math.floor(f.z))] >= 0 && g.bld[g.idx(Math.floor(f.x), Math.floor(f.z))] === g.bld[g.idx(Math.floor(x), Math.floor(z))];
      if (d < 4 || (sameBld && g.indoor(L, Math.floor(x), Math.floor(z)))) co = Math.max(co, d < 4 ? 1 : 0.6);
    }
    return co;
  }

  comfortAt(x, z, L) {
    const G = this.G, g = G.grid;
    const i = Math.floor(x), j = Math.floor(z);
    const rid = g.roomAt(L, i, j);
    if (rid < 0) return 0;
    let c = 0;
    for (const f of G.world.furn) {
      if (f.removed || f.room !== rid) continue;
      const d = FURN[f.type];
      c += d.comfort || 0;
      if (f.type === 'lamp' && f.state.on) c += 1;
    }
    return clamp(c / 4, 0, 3);
  }

  // c'è abbastanza luce per leggere?
  lightAt(x, z, L) {
    const G = this.G, g = G.grid;
    if (G.inv.light()) return true;
    if (G.inv.usable().some((e) => e.it.id === 'candle' && e.it.lit)) return true;
    const day = G.sky.state.daylight;
    const i = Math.floor(x), j = Math.floor(z);
    if (day > 0.35) {
      if (!g.roofed(L, i, j)) return true;
      // vicino a una finestra
      for (let dj = -2; dj <= 2; dj++)
        for (let di = -2; di <= 2; di++) {
          for (const e of [g.hEdge(L, i + di, j + dj), g.vEdge(L, i + di, j + dj)]) if (e && e.t === E.WINDOW && !e.cover) return true;
        }
    }
    for (const s of this.lightSources) if (s.L === L && Math.hypot(s.x - x, s.z - z) < s.r * 0.7) return true;
    return false;
  }

  // ---------------------------------------------------------------- aggiornamento
  update(dt, hours) {
    const G = this.G;
    const w = G.weather;
    const season = G.clock.seasonIndex();
    this.lightSources = [];
    for (const f of G.world.furn) {
      if (f.removed) continue;
      const s = f.state;
      switch (f.type) {
        case 'generator':
          if (s.on) {
            if (s.fuel > 0) s.fuel = Math.max(0, s.fuel - 0.45 * hours);
            if (s.fuel <= 0) {
              s.on = false;
              G.events.emit('furn', f);
              G.hud.toast('Il generatore si è spento: benzina finita.');
            }
          }
          break;
        case 'rain_collector':
          if (w && w.rain > 0.05 && !w.snow) s.water = Math.min(40, (s.water || 0) + w.rain * 4 * hours);
          break;
        case 'garden':
          this.updateGarden(f, hours, season);
          break;
        case 'campfire':
        case 'kitchen_camp':
          if (s.fuel > 0) {
            s.fuel = Math.max(0, s.fuel - hours * (w && w.rain > 0.3 && f.type === 'campfire' ? 1.8 : 1));
            if (s.fuel <= 0) G.events.emit('furn', f);
            this.lightSources.push({ x: f.x, z: f.z, L: f.L, r: f.type === 'campfire' ? 11 : 4, col: 0xff9a4a, flicker: true, fire: true, y: f.L * LEVEL_H + 0.6 });
          }
          break;
        case 'lamp':
          if (s.on && G.decay.powerAt(Math.floor(f.x), Math.floor(f.z))) this.lightSources.push({ x: f.x, z: f.z, L: f.L, r: 8, col: 0xffd8a0, y: f.L * LEVEL_H + 1.6, lamp: true, f });
          break;
      }
    }
    // luce portata dal giocatore (lanterne, candele, torce)
    const p = G.player;
    const li = G.inv.light();
    if (li && ITEMS[li.id].light.kind !== 'flash') {
      const k = ITEMS[li.id].light.kind;
      this.lightSources.push({ x: p.x, z: p.z, L: p.L, r: k === 'lantern' ? 9 : k === 'torch' ? 10 : 4, col: k === 'lantern' ? 0xffe2b0 : 0xffa050, y: p.y + 1.2, flicker: k !== 'lantern', player: true });
    }
    // consumo di batterie e combustibile delle luci portatili
    for (const e of G.inv.usable()) {
      const it = e.it;
      const d = ITEMS[it.id];
      if (!d.light || !it.on) continue;
      if (d.light.drain) {
        it.bat = Math.max(0, (it.bat || 0) - d.light.drain * hours);
        if (it.bat <= 0) {
          it.on = false;
          G.hud.toast(d.n + ': batterie scariche.');
          G.events.emit('inv');
        }
      } else if (d.light.burn) {
        it.burn = Math.max(0, (it.burn || 0) - hours);
        if (it.burn <= 0) {
          G.inv.remove(it.u);
          G.hud.toast(d.n + ' si è consumata.');
        }
      }
    }
    // rumore del generatore acceso
    this.genT -= dt;
    if (this.genT <= 0) {
      this.genT = 2.5;
      for (const f of this.generators()) {
        if (f.state.on && f.state.fuel > 0) {
          G.noise.emit(f.x, f.z, 30, { L: f.L, src: 'world', kind: 'generator' });
        }
      }
    }
    // di notte la luce si vede da fuori se le finestre non sono coperte
    this.lightT -= dt;
    if (this.lightT <= 0) {
      this.lightT = 3;
      this.lightLure();
    }
  }

  lightLure() {
    const G = this.G, g = G.grid;
    if (G.sky.state.daylight > 0.3) return;
    const lit = [];
    const p = G.player;
    const pl = G.inv.light();
    if (pl) lit.push({ x: p.x, z: p.z, L: p.L });
    for (const s of this.lightSources) if (!s.player) lit.push(s);
    for (const s of lit) {
      const i = Math.floor(s.x), j = Math.floor(s.z);
      const b = g.inb(i, j) ? g.bld[g.idx(i, j)] : -1;
      if (b < 0 || !g.indoor(s.L, i, j)) {
        // fuoco all'aperto: visibile da lontano
        if (s.fire) G.zombies.query(s.x, s.z, 24, (zb) => {
          if (zb.state === Z.IDLE || zb.state === Z.WANDER) {
            if (fx.chance(0.35) && g.los(0, zb.x, zb.z, s.x, s.z)) G.zombies.hear(s.x, s.z, s.L, 1, { src: 'world', kind: 'light' });
          }
        });
        continue;
      }
      const bld = G.world.buildings[b];
      const wins = bld.windows.map((id) => g.edges.get(id)).filter((e) => e && !e.cover && !(e.bar && e.bar.length >= 3) && !(e.metal > 0));
      if (!wins.length) continue;
      for (const e of wins) {
        const c = e.o === 0 ? { x: e.i + 0.5, z: e.j } : { x: e.i, z: e.j + 0.5 };
        G.zombies.query(c.x, c.z, 18, (zb) => {
          if (zb.state !== Z.IDLE && zb.state !== Z.WANDER) return;
          if (g.indoor(zb.L, Math.floor(zb.x), Math.floor(zb.z))) return;
          if (fx.chance(0.25)) {
            zb.state = Z.INVEST;
            zb.tx = c.x;
            zb.tz = c.z;
            zb.tL = e.L;
            zb.tnode = null;
            zb.timer = 25;
          }
        });
      }
    }
  }

  updateGarden(f, hours, season) {
    const G = this.G;
    const s = f.state;
    const w = G.weather;
    if (w && w.rain > 0.05) s.water = clamp((s.water || 0) + w.rain * 0.25 * hours, 0, 1);
    s.water = clamp((s.water || 0) - (season === 2 ? 0.035 : 0.022) * hours, 0, 1);
    if (!s.crop || s.dead) return;
    const sf = [0, 1, 1.1, 0.7][season];
    const temp = w ? w.temp : 15;
    if (temp < -1 && s.growth < 1 && !f.wild) {
      s.dead = true;
      G.events.emit('furn', f);
      return;
    }
    const days = { carrot: 10, potato: 14, tomato: 16, cabbage: 12 }[s.crop] || 12;
    const before = s.growth;
    if (s.growth < 1) {
      s.growth = Math.min(1, s.growth + (hours / (days * 24)) * (s.water > 0.08 ? 1 : 0.3) * sf * (1 + G.skills.level('farm') * 0.05));
      if (s.growth >= 1) s.ripeAt = G.clock.days;
    } else if (G.clock.days - (s.ripeAt || G.clock.days) > 7 && !f.wild) {
      s.dead = true;
    }
    // aggiorna il modello solo a ogni stadio
    if (Math.floor(before * 5) !== Math.floor(s.growth * 5) || s.dead) G.events.emit('furn', f);
  }

  // ---------------------------------------------------------------- azioni
  plant(f, seedIt) {
    const G = this.G;
    G.actions.start({
      name: 'Semina', dur: 4, anim: 'craft',
      onDone: () => {
        seedIt.n = (seedIt.n || 1) - 1;
        if (seedIt.n <= 0) G.inv.remove(seedIt.u);
        f.state.crop = ITEMS[seedIt.id].seed.crop;
        f.state.growth = 0;
        f.state.dead = false;
        f.wild = false;
        G.skills.xp('farm', 6);
        G.events.emit('furn', f);
        G.events.emit('inv');
        G.hud.toast('Seminato. Va annaffiato.', 'good');
      },
    });
  }
  water(f, can) {
    const G = this.G;
    G.actions.start({
      name: 'Annaffia', dur: 3, anim: 'craft', sound: { name: 'pour', every: 1.5 },
      onDone: () => {
        const amt = Math.min(can.liq, 0.5);
        can.liq -= amt;
        f.state.water = clamp((f.state.water || 0) + amt * 1.6, 0, 1);
        G.skills.xp('farm', 2);
        G.events.emit('furn', f);
        G.events.emit('inv');
      },
    });
  }
  harvest(f) {
    const G = this.G;
    G.actions.start({
      name: 'Raccogli', dur: 4, anim: 'craft',
      onDone: () => {
        const s = f.state;
        const cropName = ITEMS[s.crop].n;
        const n = fx.int(2, 4) + Math.floor(G.skills.level('farm') / 3);
        for (let k = 0; k < n; k++) G.crafting.give(mkItem(s.crop));
        if (fx.chance(0.35 + G.skills.level('farm') * 0.05)) {
          const sid = { carrot: 'seeds_carrot', potato: 'seeds_potato', tomato: 'seeds_tomato', cabbage: 'seeds_cabbage' }[s.crop];
          G.crafting.give(mkItem(sid, { n: fx.int(1, 3) }));
        }
        G.skills.xp('farm', 10);
        G.mind.morale = clamp(G.mind.morale + 6, 0, 100);
        s.crop = null;
        s.growth = 0;
        if (f.wild) {
          f.removed = true;
          const g = G.grid;
          g.lv[0].furn[g.idx(f.i, f.j)] = 0;
        }
        G.events.emit('furn', f);
        G.hud.toast('Raccolto: ' + cropName + ' ×' + n, 'good');
      },
    });
  }

  addFuel(f, it) {
    const G = this.G;
    const h = FUEL_HOURS[it.id] || 0.3;
    if (ITEMS[it.id].bulky) G.inv.bulky = null;
    else G.inv.remove(it.u);
    f.state.fuel = (f.state.fuel || 0) + h;
    G.events.emit('furn', f);
    G.events.emit('inv');
    G.audio.play('fire');
  }

  lightFire(f) {
    const G = this.G;
    const t = G.inv.hasTool('fire');
    if (!t) return G.hud.toast('Serve un accendino o dei fiammiferi.');
    if (!(f.state.fuel > 0)) return G.hud.toast('Serve legna (assi, rami) o carta.');
    t.n = (t.n || 1) - 1;
    if (t.n <= 0) G.inv.remove(t.u);
    f.state.lit = true;
    G.events.emit('furn', f);
    G.audio.play('fire');
  }

  toggleGenerator(f) {
    const G = this.G;
    const s = f.state;
    if (!s.on && !(s.fuel > 0)) return G.hud.toast('Il generatore è a secco. Versa benzina.');
    s.on = !s.on;
    G.events.emit('furn', f);
    G.events.emit('power');
    if (s.on) {
      G.audio.play('genstart', f.x, f.L * 3 + 0.5, f.z);
      if (!s.wired) G.hud.toast('Acceso, ma non è collegato: non alimenta niente.');
      if (G.grid.roofed(f.L, Math.floor(f.x), Math.floor(f.z))) G.hud.toast('Generatore al chiuso: monossido!', 'bad');
    }
  }

  wireGenerator(f) {
    const G = this.G;
    if (!G.skills.knows('gen_wiring') && G.skills.level('elec') < 2) return G.hud.toast('Non sai collegarlo (manuale da elettricista o Elettricità 2).');
    if (!G.inv.hasTool('screwdriver') || !G.inv.hasTool('pliers')) return G.hud.toast('Servono cacciavite e pinze.');
    G.actions.start({
      name: 'Collega il generatore', dur: 10, anim: 'craft', sound: { name: 'screw', every: 1.2 },
      onDone: () => {
        f.state.wired = true;
        G.skills.xp('elec', 20);
        G.events.emit('furn', f);
        G.events.emit('power');
        G.hud.toast('Generatore collegato: alimenta tutto entro 14 m.', 'good');
      },
    });
  }

  refuel(f) {
    const G = this.G;
    const can = G.inv.usable().map((e) => e.it).find((it) => it.id === 'gas_can' && it.liq > 0.1);
    if (!can) return G.hud.toast('Serve una tanica con benzina.');
    G.actions.start({
      name: 'Versa benzina', dur: 4, anim: 'craft', sound: { name: 'pour', every: 1.5 },
      onDone: () => {
        const need = Math.max(0, 12 - (f.state.fuel || 0));
        const take = Math.min(need, can.liq);
        can.liq -= take;
        f.state.fuel = (f.state.fuel || 0) + take;
        G.hud.toast('Serbatoio: ' + f.state.fuel.toFixed(1).replace('.', ',') + ' L (' + Math.round(f.state.fuel / 0.45) + ' ore).');
        G.events.emit('inv');
      },
    });
  }
}

export { ST };
