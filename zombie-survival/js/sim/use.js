// Cosa si può fare con un oggetto: mangiare, bere, curarsi, leggere, impugnare, indossare, accendere...
import { ITEMS } from '../data/items.js';
import { RECIPES } from '../data/recipes.js';
import { BUILD } from '../data/build.js';
import { mkItem, itemName, rotLevel, totalWeight } from './items.js';
import { WOUNDS, ZONES } from './body.js';
import { clamp } from '../core/util.js';
import { fx } from '../core/rng.js';
import { SLOT_NAMES } from './inventory.js';

const HEADLINES = [
  'MISTERIOSA INFLUENZA NELLA VALLE: "Restate calmi", dice il sindaco',
  'Aggressioni al pronto soccorso: tre infermieri feriti da pazienti in delirio',
  'L\'esercito chiude le strade per Montesordo. "Misura temporanea"',
  'Black-out a rotazione nei prossimi giorni, avverte la società elettrica',
  'Morsi e febbre alta: i medici consigliano di isolare i familiari malati',
  'Saccheggi al supermercato: "Comprate solo l\'essenziale"',
  'Le campane della chiesa non suoneranno più: "Attirano i malati"',
];

export class Use {
  constructor(G) {
    this.G = G;
  }

  actions(it, where) {
    const G = this.G;
    const d = ITEMS[it.id];
    const out = [];
    const A = (label, run, ok = true, why = '') => out.push({ label, run, ok, why });
    const carried = !!G.inv.find(it.u);
    if (d.food && d.c === 'food') {
      const needsOpener = d.can;
      const opener = G.inv.hasTool('opener');
      const knife = G.inv.hasTool('knife');
      A(d.raw ? 'Mangia crudo' : 'Mangia', () => this.eat(it), !needsOpener || !!opener || !!knife, 'Serve un apriscatole (o un coltello).');
      if (G.body.hunger > 5) A('Mangia metà', () => this.eat(it, 0.5), (!needsOpener || !!opener || !!knife) && !d.can, 'Una scatola aperta non si conserva.');
    }
    if (d.c === 'drink' && d.food) A('Bevi', () => this.drinkItem(it));
    if (d.liq && d.liq.kind === 'water') {
      if (it.liq > 0.01) {
        A('Bevi' + (it.taint ? ' (da bollire!)' : ''), () => this.drinkWater(it));
        A('Svuota', () => {
          it.liq = 0;
          it.taint = false;
          G.events.emit('inv');
        });
      }
    }
    if (d.med) this.medActions(it, A);
    if ((d.wpn || d.tool || d.thr) && !d.light) {
      if (G.inv.hand === it) A('Rimetti via', () => this.unequip(it));
      else A('Impugna', () => this.equip(it), !G.inv.bulky, 'Hai le mani occupate.');
    }
    if (d.thr) A('Lancia', () => {
      if (G.inv.hand !== it) {
        this.equip(it, () => G.combat.tryThrow());
      } else G.combat.tryThrow();
    }, !G.inv.bulky, 'Hai le mani occupate.');
    if (it.id === 'alarm_clock' && it.timer) A('Lascia a terra (squilla tra poco)', () => this.dropTimer(it));
    if (d.light) this.lightActions(it, A);
    if (it.id === 'batteries') {
      const target = G.inv.usable().map((e) => e.it).filter((x) => x.bat !== undefined && x !== it).sort((a, b) => a.bat - b.bat)[0];
      A('Ricarica' + (target ? ': ' + ITEMS[target.id].n.toLowerCase() : ''), () => this.recharge(it, target), !!target && target.bat < 0.95, 'Niente da ricaricare.');
    }
    if (d.cloth) {
      const worn = G.inv.worn[d.cloth.slot] === it;
      if (worn) A('Togli', () => this.takeOff(it));
      else A('Indossa (' + SLOT_NAMES[d.cloth.slot].toLowerCase() + ')', () => this.wear(it));
      if (it.c < 0.95) {
        const kit = G.inv.hasTool('needle');
        A('Ripara (ago e filo)', () => this.repairCloth(it, kit), !!kit && G.inv.count('rag') > 0, 'Servono ago e filo e uno straccio.');
      }
    }
    if (d.bag) {
      const worn = Object.values(G.inv.bags).includes(it);
      if (worn) A('Togli', () => this.takeOffBag(it));
      else A('Indossa (' + { back: 'schiena', shoulder: 'spalla', belt: 'cintura' }[d.bag.slot] + ')', () => this.wearBag(it));
    }
    if (d.lit) A('Leggi', () => this.read(it), G.base.lightAt(G.player.x, G.player.z, G.player.L), 'È troppo buio per leggere.');
    if (d.fun) this.funActions(it, A);
    if (d.wpn && it.c < 0.98) {
      const tape = G.inv.count('duct_tape') > 0 || G.inv.count('glue') > 0;
      A('Ripara (nastro o colla)', () => this.repairWeapon(it), tape, 'Serve nastro adesivo o colla.');
    }
    if (it.id === 'generator') A('Posiziona qui (costruzione)', () => G.building.startMode('generator'));
    if (carried && !d.bulky) A('Lascia a terra', () => this.drop(it));
    return out;
  }

  // ---------------------------------------------------------------- cibo e bevande
  eat(it, portion = 1) {
    const G = this.G;
    const d = ITEMS[it.id];
    let dur = 3;
    let tool = null;
    if (d.can) {
      tool = G.inv.hasTool('opener');
      if (!tool) {
        tool = G.inv.hasTool('knife');
        dur = 6;
      }
    }
    G.actions.start({
      name: 'Mangia: ' + d.n, dur, anim: 'eat', keepOnMove: false, sound: { name: 'eat', every: 1.1 },
      onDone: () => {
        if (!G.inv.find(it.u) && !this.inWorld(it)) return;
        if (tool && tool.c !== undefined) tool.c -= tool.id === 'can_opener' ? 0.01 : 0.03;
        if (d.can && !tool) return;
        G.body.consume(it, portion);
        if (portion < 1 && !d.can) {
          it.half = true;
          if (it.halfEaten) this.consumeItem(it);
          else it.halfEaten = true;
        } else this.consumeItem(it);
        if (d.leaves) G.crafting.give(mkItem(d.leaves));
        if (d.can) G.crafting.give(mkItem('empty_can'));
        if (rotLevel(it) === 2) G.hud.say('Che schifo... era andato a male.', 'rot');
        else if (d.food.mo >= 8) G.hud.say('Finalmente un pasto vero.', 'goodfood');
        else if (d.food.mo <= -8) G.hud.say('Che tristezza.', 'badfood');
      },
    });
  }
  drinkItem(it) {
    const G = this.G;
    const d = ITEMS[it.id];
    G.actions.start({
      name: 'Bevi: ' + d.n, dur: 2.2, anim: 'drink', sound: { name: 'drink', every: 0.8 },
      onDone: () => {
        G.body.consume(it, 1);
        if (d.uses && it.n > 1) {
          it.n -= 1;
          G.events.emit('inv');
        } else {
          this.consumeItem(it);
          if (d.leaves) G.crafting.give(mkItem(d.leaves));
        }
      },
    });
  }
  drinkWater(it) {
    const G = this.G;
    G.actions.start({
      name: 'Bevi', dur: 2, anim: 'drink', sound: { name: 'drink', every: 0.8 },
      onDone: () => {
        const want = clamp(G.body.thirst / 100 + 0.02, 0.1, 1);
        const take = Math.min(want, it.liq);
        it.liq -= take;
        G.body.drinkWater(take, it.taint);
        if (it.liq <= 0.01) {
          it.liq = 0;
          it.taint = false;
        }
        G.events.emit('inv');
      },
    });
  }

  // ---------------------------------------------------------------- medicina
  medActions(it, A) {
    const G = this.G;
    const d = ITEMS[it.id];
    const k = d.med.kind;
    const b = G.body;
    const worst = (pred) => b.wounds.filter(pred).sort((x, y) => b.bleedRate(y) - b.bleedRate(x) || (y.bandage ? y.bandage.dirt : 1) - (x.bandage ? x.bandage.dirt : 1))[0];
    if (k === 'bandage') {
      const w = worst((w) => !w.bandage || w.bandage.dirt > 0.5);
      A(w ? 'Benda: ' + WOUNDS[w.type].n.toLowerCase() + ' (' + ZONES[w.zone].toLowerCase() + ')' : 'Benda', () => this.treat('bandage', w, it), !!w, 'Nessuna ferita da bendare.');
    }
    if (k === 'disinfect' || (d.alcohol && it.n > 0)) {
      const w = worst((w) => !w.disinf);
      A('Disinfetta' + (w ? ': ' + ZONES[w.zone].toLowerCase() : ''), () => this.treat('disinfect', w, it), !!w, 'Nessuna ferita da disinfettare.');
    }
    if (k === 'suture') {
      const w = worst((w) => w.type === 'deep' && !w.sutured);
      A('Sutura la ferita profonda', () => this.treat('suture', w, it), !!w, 'Nessuna ferita profonda.');
    }
    if (k === 'splint') {
      const w = worst((w) => w.type === 'fract' && !w.splint);
      A('Steccatura', () => this.treat('splint', w, it), !!w, 'Nessuna frattura.');
    }
    if (['painkill', 'antibio', 'antiviral', 'coldmed', 'vitamin', 'sleep'].includes(k)) A('Prendi', () => this.takeMed(it));
  }

  treat(kind, w, it, opts = {}) {
    const G = this.G;
    const b = G.body;
    const med = G.skills.level('med');
    const dur = { bandage: 3.5, disinfect: 2.5, suture: 7, splint: 6 }[kind] * (1 - med * 0.05) * (opts.self === false ? 1 : 1);
    G.actions.start({
      name: { bandage: 'Bendaggio', disinfect: 'Disinfetti', suture: 'Sutura', splint: 'Steccatura' }[kind], dur, anim: 'bandage', hands: true, sound: { name: 'rustle', every: 1 },
      onDone: () => {
        if (!b.wounds.includes(w)) return;
        if (kind === 'bandage') {
          b.applyBandage(w, it);
          this.useOne(it);
        } else if (kind === 'disinfect') {
          b.disinfect(w);
          this.useOne(it);
        } else if (kind === 'suture') {
          const good = it.id === 'suture_kit';
          b.suture(w, good || med >= 3);
          this.useOne(it);
        } else if (kind === 'splint') {
          b.applySplint(w);
          this.consumeItem(it);
        }
        G.events.emit('inv');
        G.events.emit('body');
      },
    });
  }

  takeMed(it) {
    const G = this.G;
    G.actions.start({
      name: 'Prendi: ' + ITEMS[it.id].n, dur: 1.5, anim: 'eat',
      onDone: () => {
        G.body.takeMed(ITEMS[it.id].med.kind);
        this.useOne(it);
      },
    });
  }

  // ---------------------------------------------------------------- mani e vestiti
  equip(it, after) {
    const G = this.G;
    const inv = G.inv;
    if (inv.bulky) return G.hud.toast('Hai le mani occupate.');
    const t = inv.find(it.u) ? inv.equipTime(it.u) : 0.6;
    const go = () => {
      const e = inv.find(it.u);
      if (e) inv.remove(it.u);
      else if (!this.takeFromWorld(it)) return;
      const old = inv.hand;
      inv.hand = null;
      if (old && !inv.add(old)) G.world.dropAtPlayer(old);
      inv.hand = it;
      G.audio.play('equip');
      G.events.emit('inv');
      G.events.emit('equip', it);
      if (after) after();
    };
    if (t < 0.05) return go();
    G.actions.start({ name: 'Estrai: ' + ITEMS[it.id].n, dur: t, anim: 'equip', keepOnMove: true, onDone: go });
  }
  unequip(it) {
    const G = this.G;
    const inv = G.inv;
    if (inv.hand === it) inv.hand = null;
    else if (inv.off === it) inv.off = null;
    if (!inv.add(it)) G.world.dropAtPlayer(it);
    G.events.emit('inv');
    G.events.emit('equip', null);
  }
  wear(it) {
    const G = this.G;
    const inv = G.inv;
    const slot = ITEMS[it.id].cloth.slot;
    G.actions.start({
      name: 'Indossa: ' + ITEMS[it.id].n, dur: slot === 'feet' || slot === 'legs' ? 5 : 3, anim: 'craft', sound: { name: 'rustle', every: 1 },
      onDone: () => {
        if (inv.find(it.u)) inv.remove(it.u);
        else if (!this.takeFromWorld(it)) return;
        const old = inv.worn[slot];
        inv.worn[slot] = it;
        if (old && !inv.add(old)) G.world.dropAtPlayer(old);
        G.events.emit('inv');
      },
    });
  }
  takeOff(it) {
    const G = this.G;
    const inv = G.inv;
    const slot = ITEMS[it.id].cloth.slot;
    G.actions.start({
      name: 'Togli: ' + ITEMS[it.id].n, dur: 2.5, anim: 'craft',
      onDone: () => {
        if (inv.worn[slot] !== it) return;
        inv.worn[slot] = null;
        if (!inv.add(it)) G.world.dropAtPlayer(it);
        G.events.emit('inv');
      },
    });
  }
  wearBag(it) {
    const G = this.G;
    const inv = G.inv;
    const slot = ITEMS[it.id].bag.slot;
    G.actions.start({
      name: 'Indossa: ' + ITEMS[it.id].n, dur: 2, anim: 'craft',
      onDone: () => {
        if (inv.find(it.u)) inv.remove(it.u);
        else if (!this.takeFromWorld(it)) return;
        const old = inv.bags[slot];
        inv.bags[slot] = it;
        if (old) G.world.dropAtPlayer(old);
        G.events.emit('inv');
        if (old) G.hud.toast(ITEMS[old.id].n + ' lasciato a terra con il suo contenuto.');
      },
    });
  }
  takeOffBag(it) {
    const G = this.G;
    const inv = G.inv;
    for (const s in inv.bags) if (inv.bags[s] === it) inv.bags[s] = null;
    G.world.dropAtPlayer(it);
    G.events.emit('inv');
    G.hud.toast(ITEMS[it.id].n + ' a terra (con il contenuto).');
  }
  repairCloth(it, kit) {
    const G = this.G;
    G.actions.start({
      name: 'Ripara: ' + ITEMS[it.id].n, dur: 6, anim: 'craft', hands: true,
      onDone: () => {
        const rag = G.inv.findId('rag');
        if (!rag) return;
        rag.it.n = (rag.it.n || 1) - 1;
        if (rag.it.n <= 0) G.inv.remove(rag.it.u);
        kit.n -= 1;
        if (kit.n <= 0) G.inv.remove(kit.u);
        it.c = Math.min(1, it.c + 0.35);
        G.events.emit('inv');
      },
    });
  }
  repairWeapon(it) {
    const G = this.G;
    G.actions.start({
      name: 'Ripara: ' + ITEMS[it.id].n, dur: 4, anim: 'craft', hands: true,
      onDone: () => {
        const t = G.inv.findId('duct_tape') || G.inv.findId('glue');
        if (!t) return;
        t.it.n -= 1;
        if (t.it.n <= 0) G.inv.remove(t.it.u);
        const lvl = Math.max(G.skills.level('carp'), G.skills.level('metal'));
        it.c = Math.min(1, it.c + 0.25 + lvl * 0.03);
        G.events.emit('inv');
        G.hud.toast(ITEMS[it.id].n + ' riparato alla meno peggio.');
      },
    });
  }

  // ---------------------------------------------------------------- luci
  lightActions(it, A) {
    const G = this.G;
    const d = ITEMS[it.id];
    if (it.on) A('Spegni', () => this.toggleLight(it, false));
    else {
      const ok = d.light.drain ? it.bat > 0.01 : !!G.inv.hasTool('fire');
      A('Accendi', () => this.toggleLight(it, true), ok, d.light.drain ? 'Batterie scariche.' : 'Serve un accendino.');
    }
  }
  toggleLight(it, on) {
    const G = this.G;
    const inv = G.inv;
    const d = ITEMS[it.id];
    if (!on) {
      it.on = false;
      G.audio.play('click');
      G.events.emit('inv');
      return;
    }
    if (d.light.burn) {
      const f = inv.hasTool('fire');
      if (!f) return;
      f.n -= 1;
      if (f.n <= 0) inv.remove(f.u);
    }
    // la luce va nella mano libera
    const finish = () => {
      if (inv.off && inv.off !== it) {
        const old = inv.off;
        inv.off = null;
        old.on = false;
        if (!inv.add(old)) G.world.dropAtPlayer(old);
      }
      if (inv.off !== it) {
        if (inv.find(it.u)) inv.remove(it.u);
        inv.off = it;
      }
      it.on = true;
      G.audio.play('click');
      G.events.emit('inv');
      if (inv.hand && ITEMS[inv.hand.id].wpn && ITEMS[inv.hand.id].wpn.two) G.hud.toast('Con la torcia in mano l\'arma a due mani colpisce peggio.');
    };
    const t = inv.off === it ? 0 : inv.equipTime(it.u);
    if (t < 0.05) finish();
    else G.actions.start({ name: 'Prendi: ' + d.n, dur: t, anim: 'equip', keepOnMove: true, onDone: finish });
  }
  // tasto F: accende/spegne la luce migliore che hai
  quickLight() {
    const G = this.G;
    const inv = G.inv;
    if (inv.off && ITEMS[inv.off.id].light) return this.toggleLight(inv.off, !inv.off.on);
    const list = inv.usable().map((e) => e.it).filter((it) => ITEMS[it.id].light && (it.bat === undefined || it.bat > 0.01));
    list.sort((a, b) => (ITEMS[a.id].light.kind === 'flash' ? -1 : 0) - (ITEMS[b.id].light.kind === 'flash' ? -1 : 0));
    if (!list.length) return G.hud.toast('Non hai una torcia (o le batterie sono scariche).');
    this.toggleLight(list[0], true);
  }
  recharge(bat, target) {
    const G = this.G;
    G.actions.start({
      name: 'Cambia le batterie', dur: 2, anim: 'craft',
      onDone: () => {
        target.bat = 1;
        G.inv.remove(bat.u);
        G.events.emit('inv');
      },
    });
  }

  // ---------------------------------------------------------------- letture e svago
  read(it) {
    const G = this.G;
    const d = ITEMS[it.id];
    const l = d.lit;
    const again = G.skills.read.has(it.id);
    G.actions.start({
      name: 'Leggi: ' + d.n, dur: l.time * (again ? 0.5 : 1), anim: 'read', repetitive: false, sound: { name: 'page', every: 3 },
      onDone: () => {
        const m = G.mind;
        if (l.recipes) {
          const fresh = l.recipes.filter((r) => !G.skills.knows(r));
          for (const r of l.recipes) G.skills.known.add(r);
          if (fresh.length) {
            const names = fresh.map((r) => (RECIPES.find((x) => x.id === r) || BUILD[r] || { n: KNOW_NAMES[r] || r }).n);
            G.hud.event('Hai imparato', names.join(' · '));
            G.audio.play('levelup');
          } else G.hud.toast('Niente di nuovo in questa rivista.');
          G.skills.xp(l.skill, again ? 0 : 10);
        }
        if (l.skill && l.boost) {
          G.skills.boost[l.skill] = l.boostHours;
          if (!again) G.skills.xp(l.skill, l.xp);
          G.hud.toast('Per un giorno impari più in fretta: ' + l.skill.replace(/^./, (c) => c), 'good');
        }
        if (l.kind === 'news') G.hud.event('Giornale', HEADLINES[it.u % HEADLINES.length]);
        if (l.kind === 'map') {
          G.mapRevealed = true;
          G.hud.toast('La mappa del paese ora è completa (M).', 'good');
        }
        if (l.bo) m.boredom = clamp(m.boredom + l.bo * (again ? 0.5 : 1), 0, 100);
        if (l.mo) m.morale = clamp(m.morale + l.mo * (again ? 0.4 : 1), 0, 100);
        if (l.lonely) m.lonely = clamp(m.lonely + l.lonely, 0, 100);
        G.skills.read.add(it.id);
      },
    });
  }

  funActions(it, A) {
    const G = this.G;
    const f = ITEMS[it.id].fun;
    const label = { photo: 'Guarda la foto', diary: 'Scrivi sul diario', radio: 'Ascolta la radio', cards: 'Gioca a solitario', handheld: 'Gioca', teddy: 'Stringi il peluche' }[it.id] || 'Usa';
    let ok = true, why = '';
    if (f.needs && !G.inv.findId(f.needs)) {
      ok = false;
      why = 'Serve una penna.';
    }
    if (f.battery && !(it.bat > 0.02)) {
      ok = false;
      why = 'Batterie scariche.';
    }
    if (f.cd && it.lastUse !== undefined && G.clock.min - it.lastUse < f.cd * 60) {
      ok = false;
      why = 'Non ora.';
    }
    A(label, () => this.fun(it), ok, why);
  }
  fun(it) {
    const G = this.G;
    const f = ITEMS[it.id].fun;
    const m = G.mind;
    const radio = it.id === 'radio';
    G.actions.start({
      name: { photo: 'Guardi la foto', diary: 'Scrivi', radio: 'Ascolti la radio', cards: 'Solitario', handheld: 'Giochi', teddy: 'Un momento' }[it.id] || 'Usa',
      dur: radio ? 12 : it.id === 'photo' || it.id === 'teddy' ? 4 : 10, anim: it.id === 'diary' ? 'read' : 'craft',
      sound: radio ? { name: 'static', every: 3 } : it.id === 'handheld' ? { name: 'beep', every: 1.2 } : null,
      noise: radio ? { r: 5, every: 2 } : it.id === 'handheld' ? { r: 3, every: 2 } : null,
      onTick: radio ? (dt, u) => {
        if (!it.saidLine && u > 0.15) {
          it.saidLine = true;
          const b = G.decay.broadcast();
          const line = fx.pick(b.lines);
          G.hud.subtitle('RADIO — ' + line, 7);
          G.audio.speak(line);
        }
      } : null,
      onDone: () => {
        it.saidLine = false;
        const silent = radio && G.decay.broadcast().until > 50;
        if (f.lonely) m.lonely = clamp(m.lonely + f.lonely * (silent ? 0.2 : 1), 0, 100);
        if (f.bo) m.boredom = clamp(m.boredom + f.bo, 0, 100);
        if (f.mo) m.morale = clamp(m.morale + f.mo * (silent ? 0 : 1), 0, 100);
        if (silent) m.morale = clamp(m.morale - 3, 0, 100);
        if (f.battery) it.bat = Math.max(0, it.bat - f.battery);
        it.lastUse = G.clock.min;
        if (it.id === 'photo') G.hud.say('Tornerò a casa. In qualche modo.', 'photo');
        if (it.id === 'diary') G.hud.say('Giorno ' + G.clock.day + '. Sono ancora vivo.', 'diary');
        G.events.emit('inv');
      },
    });
  }

  // ---------------------------------------------------------------- terra e trasferimenti
  drop(it) {
    const G = this.G;
    if (G.inv.hand === it || G.inv.off === it || G.inv.find(it.u)) {
      G.inv.remove(it.u);
      it.on = false;
      G.world.dropAtPlayer(it);
      G.audio.play('drop');
    }
  }
  dropTimer(it) {
    const G = this.G;
    G.inv.remove(it.u);
    const k = G.world.dropAtPlayer(it);
    const [L, i, j] = k.split(',').map(Number);
    G.combat.armTimer(it, i + 0.5, j + 0.5, L, 45);
    G.hud.toast('Sveglia a terra: squillerà tra 45 secondi. Allontanati.');
  }

  // consuma un'unità (pile, usi) dall'inventario o dal mondo
  useOne(it) {
    const d = ITEMS[it.id];
    if (d.stack || d.uses) {
      it.n = (it.n || 1) - 1;
      if (it.n <= 0) this.consumeItem(it);
      else this.G.events.emit('inv');
    } else this.consumeItem(it);
  }
  consumeItem(it) {
    const G = this.G;
    if (G.inv.find(it.u)) {
      G.inv.remove(it.u);
      return;
    }
    this.takeFromWorld(it);
  }
  // l'oggetto è in un contenitore aperto o a terra: rimuovilo da lì
  takeFromWorld(it) {
    const G = this.G;
    const loc = G.ui.lootLocate ? G.ui.lootLocate(it) : null;
    if (loc) {
      loc.list.splice(loc.list.indexOf(it), 1);
      if (loc.onChange) loc.onChange();
      return true;
    }
    return false;
  }
  inWorld(it) {
    const G = this.G;
    return !!(G.ui.lootLocate && G.ui.lootLocate(it));
  }
}

const KNOW_NAMES = {
  dismantle_car: 'Smontare le auto', barricade_heavy: 'Barricate rinforzate', barricade_metal: 'Barricate in lamiera', gen_wiring: 'Collegare il generatore',
};

export { totalWeight, itemName };
