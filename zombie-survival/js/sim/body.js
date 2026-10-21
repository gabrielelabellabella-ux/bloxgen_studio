// Il corpo conta: fame, sete, sonno, temperatura, stamina, ferite per zona (graffi, lacerazioni, morsi,
// ferite profonde, fratture, ustioni), infezioni, malattie. Nessuna barra della vita unica: la salute
// è nascosta e si legge dai sintomi, dal respiro e dal pannello salute.
import { ITEMS } from '../data/items.js';
import { clamp } from '../core/util.js';
import { fx } from '../core/rng.js';
import { worldValue } from '../config.js';

export const ZONES = {
  head: 'Testa', torso: 'Busto', armL: 'Braccio sinistro', armR: 'Braccio destro', handL: 'Mano sinistra', handR: 'Mano destra',
  legL: 'Gamba sinistra', legR: 'Gamba destra', footL: 'Piede sinistro', footR: 'Piede destro',
};
export const WOUNDS = {
  scratch: { n: 'Graffio', bleed: 3, clot: 0.35, pain: 8, heal: 1.5, inf: 0.05, zinf: 0.06 },
  lacer: { n: 'Lacerazione', bleed: 20, clot: 3, pain: 22, heal: 4, inf: 0.16, zinf: 0.2 },
  bite: { n: 'Morso', bleed: 24, clot: 3, pain: 30, heal: 5, inf: 0.22, zinf: 0.6 },
  deep: { n: 'Ferita profonda', bleed: 34, clot: 999, pain: 40, heal: 8, inf: 0.28, suture: true },
  fract: { n: 'Frattura', bleed: 0, clot: 0, pain: 55, heal: 16, splint: true },
  burn: { n: 'Ustione', bleed: 0, clot: 0, pain: 35, heal: 6, inf: 0.2 },
};
const ZONE_W = [['handL', 12], ['handR', 12], ['armL', 12], ['armR', 12], ['torso', 18], ['head', 8], ['legL', 10], ['legR', 10], ['footL', 3], ['footR', 3]];

let woundId = 1;

export class Body {
  constructor(G) {
    this.G = G;
    this.reset();
  }

  reset() {
    this.hunger = 12;
    this.thirst = 15;
    this.fatigue = 18;
    this.stamina = 1;
    this.temp = 37;
    this.fever = 0;
    this.wet = 0;
    this.health = 100;
    this.pain = 0;
    this.wounds = [];
    this.cold = 0;
    this.poison = 0;
    this.co = 0;
    this.zinf = null;
    this.meds = { pain: 0, antibio: 0, coldmed: 0, vitamin: 0, sleep: 0 };
    this.cause = '';
    this.vomitT = 0;
    this.coughT = 20;
    this.microT = 120;
    this.dead = false;
    this.ate = 0;
  }

  // ---------------------------------------------------------------- effetti sul movimento e sulle mani
  legFactor() {
    let speed = 1, canRun = true;
    for (const w of this.wounds) {
      if (!/^leg|^foot/.test(w.zone)) continue;
      if (w.type === 'fract') {
        speed *= w.splint ? 0.78 : 0.55;
        canRun = false;
      } else if (w.type === 'deep' || w.type === 'bite' || w.type === 'lacer' || w.type === 'burn') {
        speed *= w.type === 'deep' && !w.sutured ? 0.75 : 0.9;
        if (w.type === 'deep') canRun = false;
      }
    }
    if (this.health < 30) speed *= 0.85;
    if (this.pain > 70) canRun = false;
    return { speed, canRun, limp: speed < 0.95 };
  }
  armFactor() {
    let dmg = 1, broken = false;
    for (const w of this.wounds) {
      if (!/^arm|^hand/.test(w.zone)) continue;
      if (w.type === 'fract') {
        broken = true;
        dmg *= w.splint ? 0.7 : 0.5;
      } else if (w.type !== 'scratch') dmg *= 0.88;
    }
    return { dmg, broken };
  }
  handPenalty() {
    let p = 0;
    for (const w of this.wounds) {
      if (!/^hand|^arm/.test(w.zone)) continue;
      p += w.type === 'fract' ? 0.6 : w.type === 'scratch' ? 0.05 : 0.25;
    }
    return clamp(p, 0, 1);
  }
  // tremori (freddo, panico, febbre)
  shiver() {
    let s = 0;
    if (this.temp < 36) s += (36 - this.temp) * 0.5;
    if (this.fever > 0.5) s += 0.2;
    return clamp(s, 0, 1);
  }
  bleeding() {
    let b = 0;
    for (const w of this.wounds) b += this.bleedRate(w);
    return b;
  }
  bleedRate(w) {
    const d = WOUNDS[w.type];
    if (!d.bleed || w.stopped) return 0;
    let f = 1;
    if (w.bandage) f = d.suture && !w.sutured ? 0.35 : 0.05;
    if (d.suture && w.sutured) f = Math.min(f, 0.02);
    return d.bleed * w.sev * f;
  }
  infected() {
    return this.wounds.some((w) => w.infected > 0);
  }
  conditionLabel() {
    const h = this.health;
    if (h > 85) return 'Buona';
    if (h > 65) return 'Discreta';
    if (h > 45) return 'Ferito';
    if (h > 25) return 'Grave';
    return 'Critica';
  }

  useStamina(x) {
    this.stamina = Math.max(0, this.stamina - x);
  }

  // ---------------------------------------------------------------- ferite
  addWound(zone, type, sev = 1, o = {}) {
    const w = { id: woundId++, zone, type, sev: clamp(sev, 0.2, 1), bandage: null, disinf: false, sutured: false, splint: false, infected: 0, heal: 0, age: 0, glass: !!o.glass };
    this.wounds.push(w);
    const G = this.G;
    G.events.emit('wound', w);
    const zinfP = (WOUNDS[type].zinf || 0) * worldValue(G.settings, 'infection');
    if (o.zombie && zinfP > 0 && !this.zinf && fx.chance(zinfP)) {
      this.zinf = { t: 0, inc: fx.range(12, 30), dur: fx.range(40, 80) };
    }
    return w;
  }

  zombieHit(zb, attackers) {
    const G = this.G;
    let zone = fx.r() * 100, acc = 0, z = 'torso';
    for (const [k, wgt] of ZONE_W) {
      acc += wgt;
      if (zone < acc) {
        z = k;
        break;
      }
    }
    zone = z;
    // senza braccia morde e graffia meno
    const armless = (zb.lost.armL ? 1 : 0) + (zb.lost.armR ? 1 : 0);
    let pBite = 0.14 + (attackers >= 2 ? 0.1 : 0) + (this.stamina < 0.3 ? 0.1 : 0) + armless * 0.12;
    if (zb.crawler) {
      zone = fx.pick(['legL', 'legR', 'footL', 'footR']);
      pBite += 0.15;
    }
    const r = fx.r();
    let type = r < pBite ? 'bite' : r < pBite + 0.3 * (armless === 2 ? 0.3 : 1) ? 'lacer' : 'scratch';
    if (armless === 2 && type === 'scratch') type = 'bite';
    G.mind.shock(18);
    G.player.shake = 0.6;
    G.player.hurtT = 0.5;
    G.audio.play('zombiehit');
    G.hud.flash('hit');
    // i vestiti proteggono
    const prot = G.inv.protection(zone);
    const block = type === 'bite' ? prot.bite : prot.scratch * (type === 'lacer' ? 0.7 : 1);
    if (fx.chance(block)) {
      for (const it of prot.items) it.c = Math.max(0, it.c - (type === 'bite' ? 0.09 : 0.05));
      G.hud.toast((prot.items[0] ? ITEMS[prot.items[0].id].n : 'I vestiti') + ' ha retto il colpo.', 'good');
      G.events.emit('inv');
    } else {
      for (const it of prot.items) it.c = Math.max(0, it.c - 0.03);
      const w = this.addWound(zone, type, fx.range(0.45, 1), { zombie: true });
      G.hud.toast(WOUNDS[type].n + ' — ' + ZONES[zone].toLowerCase(), 'bad');
      G.hud.say(type === 'bite' ? 'Mi ha morso... no, no, no.' : type === 'lacer' ? 'Ah! Mi ha squarciato!' : 'Mi ha graffiato!', 'wound' + w.id, 0);
      this.cause = 'Ucciso dagli zombie';
    }
    // contro tre zombie insieme rischi di non farcela
    if (attackers >= 3 && this.stamina < 0.4 && fx.chance(0.22 + (attackers - 3) * 0.12)) {
      this.cause = 'Trascinato a terra da ' + attackers + ' zombie';
      this.health = 0;
    }
  }

  fall(h) {
    const G = this.G;
    G.audio.play('thud');
    G.player.shake = 0.8;
    G.mind.shock(10);
    if (h > 2.4 && fx.chance(clamp((h - 2) * 0.25, 0, 0.9))) {
      this.addWound(fx.pick(['legL', 'legR']), 'fract', 1);
      G.hud.toast('Frattura alla gamba!', 'bad');
      G.hud.say('La gamba... non la sento.', 'fract', 0);
    } else {
      this.pain = Math.min(100, this.pain + 20);
      G.hud.say('Ahi. Atterraggio pesante.', 'fall');
    }
    if (h > 4) {
      this.health -= (h - 4) * 10;
      this.cause = 'Caduta';
    }
  }

  burn(zone) {
    this.addWound(zone || fx.pick(['handL', 'handR', 'armL', 'armR']), 'burn', fx.range(0.4, 0.9));
    this.G.hud.toast('Ustione!', 'bad');
    this.G.audio.play('hurt');
  }

  // ---------------------------------------------------------------- cure
  applyBandage(w, it) {
    const G = this.G;
    const kind = it.id;
    w.bandage = { kind, dirt: kind === 'rag' ? 0.3 : kind === 'bandage' ? 0.1 : 0 };
    w.stopped = w.stopped || (WOUNDS[w.type].bleed && !WOUNDS[w.type].suture);
    G.skills.xp('med', 3);
  }
  disinfect(w) {
    w.disinf = true;
    if (w.infected > 0) w.infected = Math.max(0, w.infected - 0.35);
    this.pain = Math.min(100, this.pain + 6);
    this.G.skills.xp('med', 2);
  }
  suture(w, good) {
    w.sutured = true;
    w.stopped = true;
    if (!good && !w.disinf) w.infected = Math.max(w.infected, fx.chance(0.25) ? 0.1 : 0);
    this.pain = Math.min(100, this.pain + 15);
    this.G.skills.xp('med', 8);
  }
  applySplint(w) {
    w.splint = true;
    this.G.skills.xp('med', 5);
  }
  takeMed(kind) {
    const G = this.G;
    switch (kind) {
      case 'painkill':
        this.meds.pain = 4;
        G.hud.toast('Il dolore si attenua.');
        break;
      case 'antibio':
        this.meds.antibio = Math.max(this.meds.antibio, 10);
        G.hud.toast('Antibiotici presi. Continua la cura.');
        break;
      case 'antiviral':
        if (this.zinf && this.zinf.t < this.zinf.inc + this.zinf.dur * 0.85) {
          this.zinf = null;
          G.events.emit('cured');
        }
        G.hud.toast("Brucia nelle vene. Speriamo che funzioni.");
        break;
      case 'coldmed':
        this.meds.coldmed = 6;
        this.cold = Math.max(0, this.cold - 0.25);
        break;
      case 'vitamin':
        this.meds.vitamin = 24;
        break;
      case 'sleep':
        this.meds.sleep = 6;
        G.hud.toast('Ti senti la testa pesante.');
        break;
    }
  }

  // mangiare e bere: food = def.food, it = istanza
  consume(it, portion = 1) {
    const G = this.G;
    const d = ITEMS[it.id];
    const f = d.food;
    if (!f) return;
    const rot = it.age !== undefined && d.rot ? (it.age >= d.rot[1] ? 2 : it.age >= d.rot[0] ? 1 : 0) : 0;
    const cook = G.skills.level('cook');
    let mo = f.mo || 0;
    if (f.hot) mo += cook * 0.6;
    if (rot === 1) mo -= 3;
    if (rot === 2) mo -= 10;
    this.hunger = clamp(this.hunger - (f.hu || 0) * portion * (rot === 2 ? 0.6 : 1), 0, 100);
    this.thirst = clamp(this.thirst - (f.th || 0) * portion, 0, 100);
    this.fatigue = clamp(this.fatigue + (f.fa || 0) * portion, 0, 100);
    if (f.st) this.stamina = clamp(this.stamina + f.st, 0, 1);
    if (f.hot) this.temp = Math.min(37.4, this.temp + 0.3);
    G.mind.morale = clamp(G.mind.morale + mo * portion, 0, 100);
    if (f.bo) G.mind.boredom = clamp(G.mind.boredom + f.bo, 0, 100);
    if (f.pa) G.mind.panic = clamp(G.mind.panic + f.pa, 0, 100);
    let pois = (f.poison || 0) * (d.raw ? 1 : 0.4);
    if (rot === 2) pois = Math.max(pois, 0.55);
    if (rot === 1) pois = Math.max(pois, 0.06);
    if (pois && fx.chance(pois)) this.poison = Math.max(this.poison, fx.range(0.6, 1));
    this.ate = G.time;
  }
  drinkWater(liters, tainted) {
    this.thirst = clamp(this.thirst - liters * 100, 0, 100);
    if (tainted && fx.chance(0.35 * Math.min(1, liters * 3))) this.poison = Math.max(this.poison, fx.range(0.5, 0.9));
  }

  // ---------------------------------------------------------------- aggiornamento
  update(dt, hours) {
    const G = this.G;
    const p = G.player;
    const sleeping = G.sleeping;
    // attività
    const act = sleeping ? 0.6 : p.running ? 1.9 : p.moving ? 1.15 : 1;
    const hot = this.temp > 37.6 ? 1.5 : 1;
    const ill = this.cold > 0.3 || this.poison > 0.3 || this.fever > 0.5;
    this.hunger = clamp(this.hunger + 1.55 * act * (this.temp < 36 ? 1.25 : 1) * hours, 0, 100);
    this.thirst = clamp(this.thirst + 3.1 * act * hot * (this.poison > 0.3 ? 1.5 : 1) * (this.fever > 0.5 ? 1.3 : 1) * hours, 0, 100);
    if (sleeping) {
      const q = G.sleepQuality || 0.8;
      this.fatigue = clamp(this.fatigue - 13 * q * hours, 0, 100);
    } else {
      this.fatigue = clamp(this.fatigue + 4.6 * (ill ? 1.3 : 1) * (this.wounds.length ? 1.1 : 1) * (p.running ? 1.2 : 1) * hours, 0, 100);
    }
    // stamina in tempo reale
    let regen = p.running ? -0.105 * (1 + G.inv.encumbrance() * 0.15) : p.moving ? 0.055 : 0.11;
    if (regen > 0) {
      if (this.hunger > 60) regen *= 0.6;
      if (this.thirst > 60) regen *= 0.6;
      if (this.fatigue > 70) regen *= 0.6;
      if (this.temp < 35.5) regen *= 0.8;
      if (this.cold > 0.3) regen *= 0.8;
      if (this.health < 40) regen *= 0.7;
      if (this.wounds.some((w) => w.zone === 'torso' && (w.type === 'deep' || w.type === 'fract'))) regen *= 0.6;
      if (sleeping) regen *= 3;
    } else if (G.mind.panic > 50) regen *= 1.3;
    this.stamina = clamp(this.stamina + regen * dt, 0, 1);
    this.updateWounds(hours, sleeping);
    this.updateTemperature(dt, hours);
    this.updateIllness(dt, hours);
    // salute
    let dh = 0;
    const bleed = this.bleeding();
    dh -= bleed;
    if (bleed > 0.5) this.cause = 'Dissanguato';
    if (this.hunger > 92) {
      dh -= 3;
      this.cause = 'Morto di fame';
    }
    if (this.thirst > 92) {
      dh -= 7;
      this.cause = 'Morto di sete';
    }
    if (this.temp < 34) {
      dh -= (34 - this.temp) * 5;
      this.cause = 'Ipotermia';
    }
    for (const w of this.wounds) if (w.infected > 0) {
      dh -= w.infected * 4;
      if (w.infected > 0.4) this.cause = 'Infezione';
    }
    if (this.poison > 0.5) {
      dh -= 2.5;
      this.cause = 'Intossicazione';
    }
    if (this.co > 0.2) {
      dh -= this.co * 14;
      this.cause = 'Monossido di carbonio';
    }
    if (this.zinf) {
      const z = this.zinf;
      const st = z.t > z.inc + z.dur * 0.85 ? 3 : z.t > z.inc + z.dur * 0.45 ? 2 : z.t > z.inc ? 1 : 0;
      if (st >= 2) {
        dh -= st === 3 ? 16 : 4;
        this.cause = 'Il contagio';
      }
    }
    const healing = dh >= 0 && this.hunger < 75 && this.thirst < 75 && !this.zinfStage();
    if (healing) dh += (sleeping ? 4 : 1.6) * (this.health < 100 ? 1 : 0);
    this.health = clamp(this.health + dh * hours, 0, 100);
    // dolore
    let pain = 0;
    for (const w of this.wounds) {
      const d = WOUNDS[w.type];
      pain += d.pain * w.sev * (1 - w.heal * 0.7) * (w.splint ? 0.55 : 1) * (w.infected > 0 ? 1.4 : 1);
    }
    if (this.meds.pain > 0) pain -= 40;
    this.pain = clamp(pain, 0, 100);
    for (const k in this.meds) this.meds[k] = Math.max(0, this.meds[k] - hours);
    if (this.health <= 0 && !this.dead) {
      this.dead = true;
      G.events.emit('death', this.cause || 'Ferite');
    }
    // colpo di sonno
    if (!sleeping && this.fatigue > 90) {
      this.microT -= dt;
      if (this.microT <= 0) {
        this.microT = fx.range(25, 60);
        G.hud.flash('blink');
        G.hud.say('Non riesco a tenere gli occhi aperti...', 'sleepy');
        if (this.fatigue > 98) G.events.emit('passOut');
      }
    }
  }

  zinfStage() {
    const z = this.zinf;
    if (!z) return 0;
    return z.t > z.inc + z.dur * 0.85 ? 3 : z.t > z.inc + z.dur * 0.45 ? 2 : z.t > z.inc ? 1 : 0;
  }

  updateWounds(hours, sleeping) {
    const G = this.G;
    const medBonus = G.base && G.base.nearBench('med') ? 1.3 : 1;
    for (const w of this.wounds) {
      const d = WOUNDS[w.type];
      w.age += hours;
      if (d.bleed && !w.stopped && w.age > d.clot) w.stopped = true;
      if (w.bandage) {
        const k = w.bandage.kind === 'rag' ? 2 : w.bandage.kind === 'sterile_bandage' ? 0.5 : 1;
        w.bandage.dirt = clamp(w.bandage.dirt + (0.028 * k + this.bleedRate(w) * 0.004) * hours, 0, 1);
      }
      // infezione delle ferite sporche
      if (d.inf && w.infected <= 0 && !w.disinf) {
        const dirty = !w.bandage || w.bandage.dirt > 0.7;
        const pr = (d.inf / 24) * (dirty ? (w.bandage ? 2 : 1.4) : 0.25) * (this.meds.vitamin > 0 ? 0.7 : 1);
        if (fx.chance(pr * hours)) {
          w.infected = 0.1;
          G.events.emit('woundInfected', w);
        }
      }
      if (w.infected > 0) {
        w.infected = clamp(w.infected + (this.meds.antibio > 0 ? -0.09 : 0.035) * hours, 0, 1);
        if (w.infected <= 0) G.hud.toast("L'infezione si è ritirata.", 'good');
      }
      // guarigione
      const needsSut = d.suture && !w.sutured;
      if (!needsSut && w.infected <= 0 && (w.stopped || !d.bleed)) {
        let r = hours / (d.heal * 24);
        r *= w.bandage || !d.bleed ? 1 : 0.6;
        if (sleeping) r *= 1.6;
        if (this.hunger > 70 || this.thirst > 70) r *= 0.5;
        if (d.splint) r *= w.splint ? 2 : 0.7;
        r *= medBonus * (1 + G.skills.level('med') * 0.04);
        w.heal += r;
      }
    }
    const healed = this.wounds.filter((w) => w.heal >= 1);
    for (const w of healed) G.hud.toast(WOUNDS[w.type].n + ' (' + ZONES[w.zone].toLowerCase() + '): guarita.', 'good');
    if (healed.length) this.wounds = this.wounds.filter((w) => w.heal < 1);
  }

  updateTemperature(dt, hours) {
    const G = this.G;
    const p = G.player;
    const w = G.weather;
    const i = Math.floor(p.x), j = Math.floor(p.z);
    const indoor = G.grid.indoor(p.L, i, j);
    let amb = w ? w.temp : 15;
    if (indoor) amb = amb + (19 - amb) * 0.55 + (G.decay && G.decay.powerAt(i, j) ? 2 : 0);
    const fire = G.base ? G.base.heatAt(p.x, p.z, p.L) : 0;
    amb += fire;
    const ins = G.inv.warmth();
    const act = p.running ? 4 : p.moving ? 1.5 : 0;
    const comfort = amb + ins * 14 + act - this.wet * 7;
    let target = 37;
    if (comfort < 13) target = 37 - (13 - comfort) * 0.16;
    else if (comfort > 28) target = 37 + (comfort - 28) * 0.08;
    target = clamp(target, 30, 39.5);
    const rate = target < this.temp ? 0.6 : 1.2;
    this.temp += (target - this.temp) * Math.min(1, rate * hours);
    // pioggia e asciugatura
    const rain = w ? w.rain : 0;
    const roofed = G.grid.roofed(p.L, i, j);
    if (rain > 0.05 && !roofed) {
      const wp = G.inv.waterproof();
      this.wet = clamp(this.wet + rain * 0.9 * (1 - wp * 0.85) * hours, 0, 1);
      for (const s in G.inv.worn) {
        const it = G.inv.worn[s];
        if (it && (s !== 'torso_in' || wp < 0.8)) it.wet = clamp((it.wet || 0) + rain * 0.9 * (s === 'torso_out' ? 1 : 1 - wp) * hours, 0, 1);
      }
    } else {
      const dry = fire > 0 ? 0.9 : indoor ? 0.18 : 0.1;
      this.wet = clamp(this.wet - dry * hours, 0, 1);
      for (const s in G.inv.worn) {
        const it = G.inv.worn[s];
        if (it && it.wet) it.wet = clamp(it.wet - dry * hours, 0, 1);
      }
    }
    // febbre
    let fever = 0;
    if (this.infected()) fever = Math.max(fever, 0.8 + Math.max(...this.wounds.map((x) => x.infected)) * 1.6);
    const zs = this.zinfStage();
    if (zs) fever = Math.max(fever, [0, 1.1, 2, 2.9][zs]);
    if (this.cold > 0.4) fever = Math.max(fever, 0.6);
    this.fever = fever;
  }

  updateIllness(dt, hours) {
    const G = this.G;
    // raffreddore da freddo e pioggia
    if (this.cold <= 0 && (this.temp < 35.8 || (this.wet > 0.5 && (G.weather ? G.weather.temp : 15) < 12))) {
      if (fx.chance(0.035 * hours * (this.meds.vitamin > 0 ? 0.5 : 1))) {
        this.cold = 1;
        G.hud.say('Mi sa che mi sono preso un raffreddore.', 'cold', 0);
      }
    }
    if (this.cold > 0) {
      this.cold = Math.max(0, this.cold - (this.meds.coldmed > 0 ? 0.04 : 0.02) * hours);
      // la tosse fa rumore
      this.coughT -= dt;
      if (this.coughT <= 0 && this.meds.coldmed <= 0) {
        this.coughT = fx.range(25, 80);
        const p = G.player;
        G.audio.play('cough');
        G.noise.emit(p.x, p.z, 10, { L: p.L, src: 'player', kind: 'cough' });
      }
    }
    if (this.poison > 0) {
      this.poison = Math.max(0, this.poison - 0.045 * hours);
      if (this.poison > 0.5) {
        this.vomitT -= dt;
        if (this.vomitT <= 0) {
          this.vomitT = fx.range(40, 120);
          this.hunger = clamp(this.hunger + 8, 0, 100);
          this.thirst = clamp(this.thirst + 12, 0, 100);
          G.mind.morale = clamp(G.mind.morale - 5, 0, 100);
          G.audio.play('vomit');
          G.hud.say('Sto male...', 'vomit');
          G.noise.emit(G.player.x, G.player.z, 6, { L: G.player.L, src: 'player', kind: 'vomit' });
        }
      }
    }
    if (this.zinf) this.zinf.t += hours * (this.meds.antibio > 0 ? 0.5 : 1);
    // monossido dal generatore al chiuso
    const coHere = G.base ? G.base.coAt(G.player.x, G.player.z, G.player.L) : 0;
    this.co = clamp(this.co + (coHere > 0 ? coHere * 0.8 : -0.6) * hours, 0, 1);
  }

  serialize() {
    const o = {};
    for (const k of ['hunger', 'thirst', 'fatigue', 'stamina', 'temp', 'wet', 'health', 'cold', 'poison', 'co', 'zinf', 'meds', 'wounds', 'cause']) o[k] = this[k];
    return o;
  }
  load(o) {
    this.reset();
    Object.assign(this, JSON.parse(JSON.stringify(o)));
    for (const w of this.wounds) woundId = Math.max(woundId, w.id + 1);
  }
}
