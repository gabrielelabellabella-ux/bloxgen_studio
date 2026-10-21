// Il mondo peggiora: dopo qualche giorno salta la corrente (frigo spenti, niente luce), poco dopo
// smette di arrivare l'acqua. Il cibo fresco marcisce, l'erba cresce, la radio tace.
import { worldValue } from '../config.js';
import { RNG, hashSeed } from '../core/rng.js';
import { ITEMS } from '../data/items.js';
import { FURN } from '../data/furniture.js';

export const BROADCASTS = [
  { until: 2, lines: [
    'Qui Radio Valle. Comunicato dell\'unità di crisi: restate in casa, chiudete porte e finestre.',
    'Non avvicinatevi alle persone che mostrano un comportamento aggressivo. Non cercate di aiutarle.',
    'I soccorsi sono organizzati. Razionate acqua e cibo e attendete istruzioni.',
  ] },
  { until: 6, lines: [
    'La valle di Montesordo è sotto quarantena. Chi si avvicina alle barriere verrà respinto.',
    'Evitate ogni rumore inutile. Ripetiamo: evitate ogni rumore inutile.',
    'Le strutture sanitarie non accettano più pazienti con ferite da morso.',
  ] },
  { until: 11, lines: [
    '...messaggio registrato... restate in casa... chiudete porte e finestre... messaggio registrato...',
    '...chi ascolta, se c\'è qualcuno... qui è tutto silenzioso da giorni...',
  ] },
  { until: 99999, lines: ['Solo fruscio. Nessuna voce, da giorni.'] },
];

export class Decay {
  constructor(G) {
    this.G = G;
    const s = G.settings;
    const rng = new RNG(hashSeed(s.seed, 'decay'));
    this.powerCutDay = worldValue(s, 'powerDay') + rng.range(0, 1.2);
    this.waterCutDay = this.powerCutDay + worldValue(s, 'waterDelay') + rng.range(0, 1);
    this.speed = worldValue(s, 'decay');
    this.powerOn = true;
    this.waterOn = true;
    this.lastDay = -1;
    this.rotAcc = 0;
  }

  serialize() {
    return { p: this.powerCutDay, w: this.waterCutDay };
  }
  load(o) {
    if (o) {
      this.powerCutDay = o.p;
      this.waterCutDay = o.w;
    }
  }

  gridPower() {
    return this.G.clock.days < this.powerCutDay;
  }
  water() {
    return this.G.clock.days < this.waterCutDay;
  }
  powerAt(i, j) {
    if (this.gridPower()) return true;
    return this.G.base ? this.G.base.genPowered(i, j) : false;
  }

  update(hours, init) {
    const G = this.G;
    const days = G.clock.days;
    const p = this.gridPower();
    if (p !== this.powerOn) {
      this.powerOn = p;
      G.staticWorld.setPower(p);
      if (!p && !init) {
        G.hud.event('Salta la corrente', 'Le luci si spengono una dopo l\'altra, poi il ronzio dei frigoriferi. Silenzio.');
        G.audio.play('powerdown');
      }
      G.events.emit('power');
    }
    const w = this.water();
    if (w !== this.waterOn) {
      this.waterOn = w;
      if (!w && !init) G.hud.event("Niente più acqua", 'I rubinetti sputano aria. D\'ora in poi l\'acqua va raccolta e bollita.');
    }
    // marcire del cibo: aggiornato a ogni ora di gioco
    this.rotAcc += hours;
    if (this.rotAcc >= 1) {
      const h = this.rotAcc;
      this.rotAcc = 0;
      this.rot(h);
    }
    // erba che cresce
    const d = Math.floor(days);
    if (d !== this.lastDay) {
      this.lastDay = d;
      G.staticWorld.setGrowth(days * this.speed);
    }
  }

  rot(h) {
    const G = this.G;
    const r = (h / 24) * this.speed;
    const age = (list, k) => {
      for (const it of list) {
        if (it.age !== undefined && ITEMS[it.id].rot) it.age += r * k;
        if (it.items) age(it.items, k);
      }
    };
    for (const e of G.inv.entries()) if (e.it.age !== undefined) e.it.age += r;
    for (const f of G.world.furn) {
      if (!f.items || !f.items.length) continue;
      const cold = FURN[f.type] && FURN[f.type].cold && this.powerAt(Math.floor(f.x), Math.floor(f.z));
      age(f.items, cold ? 0.25 : 1);
    }
    for (const l of G.world.ground.values()) age(l, 1);
    for (const b of G.world.barrows) age(b.items, 1);
    for (const c of G.world.cars) {
      if (c.trunk) age(c.trunk, 1);
      if (c.glove) age(c.glove, 1);
    }
  }

  broadcast() {
    const d = this.G.clock.days;
    const b = BROADCASTS.find((x) => d < x.until) || BROADCASTS[BROADCASTS.length - 1];
    return b;
  }
}
