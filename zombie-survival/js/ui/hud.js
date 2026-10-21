// HUD: niente barra della vita. Lo stato si legge dai moodle, dal respiro, dalla vignetta e da quello che
// il personaggio dice. Più orologio, bussola, indicatore del rumore, mani, azioni disponibili.
import { icon } from './icons.js';
import { ITEMS } from '../data/items.js';
import { itemName } from '../sim/items.js';
import { clamp, fmtNum } from '../core/util.js';
import { ZONES as ZONE_NAMES } from '../world/grid.js';
import { FURN } from '../data/furniture.js';

const MOODLES = [
  { key: 'bleed', icon: 'bleed', names: ['Graffio che sanguina', 'Sanguinamento', 'Emorragia', 'Emorragia grave'], desc: 'Benda le ferite (pannello Salute o inventario).', val: (G) => G.body.bleeding(), th: [0.5, 5, 14, 26] },
  { key: 'pain', icon: 'pain', names: ['Fastidio', 'Dolore', 'Dolore forte', 'Agonia'], desc: 'Antidolorifici e riposo. Il dolore rallenta e fa sbagliare i colpi.', val: (G) => G.body.pain, th: [12, 30, 55, 80] },
  { key: 'panic', icon: 'panic', names: ['Agitato', 'Spaventato', 'Panico', 'Terrore'], desc: 'Il respiro si sente, le mani tremano, i colpi vanno a vuoto. Allontanati e chiuditi dentro.', val: (G) => G.mind.panic, th: [22, 42, 62, 82] },
  { key: 'hunger', icon: 'hunger', names: ['Languorino', 'Fame', 'Molta fame', 'Inedia'], desc: 'Mangia. La fame toglie stamina e poi salute.', val: (G) => G.body.hunger, th: [28, 50, 72, 90] },
  { key: 'thirst', icon: 'thirst', names: ['Gola secca', 'Sete', 'Molta sete', 'Disidratato'], desc: 'Bevi. La sete sale più in fretta della fame.', val: (G) => G.body.thirst, th: [28, 50, 72, 90] },
  { key: 'tired', icon: 'tired', names: ['Stanco', 'Assonnato', 'Esausto', 'Crollo'], desc: 'Dormi (letto o divano). Stanchezza = mira e reazioni peggiori.', val: (G) => G.body.fatigue, th: [50, 70, 85, 95] },
  { key: 'endurance', icon: 'endurance', names: ['Fiato corto', 'Affannato', 'Senza fiato', 'Sfinito'], desc: 'Stamina bassa: colpi lenti e deboli. Fermati a riprendere fiato.', val: (G) => 1 - G.body.stamina, th: [0.45, 0.65, 0.85, 0.95] },
  { key: 'cold', icon: 'cold', names: ['Fresco', 'Freddo', 'Gelido', 'Ipotermia'], desc: 'Vestiti caldi, fuoco, riparo. Il freddo fa tremare e ammalare.', val: (G) => 37 - G.body.temp, th: [0.6, 1.1, 2, 3] },
  { key: 'hot', icon: 'hot', names: ['Accaldato', 'Caldo', 'Surriscaldato', 'Colpo di calore'], desc: 'Togliti qualche strato e bevi.', val: (G) => G.body.temp - 37, th: [0.6, 1.0, 1.6, 2.4] },
  { key: 'wet', icon: 'wet', names: ['Umido', 'Bagnato', 'Fradicio', 'Zuppo'], desc: 'I vestiti bagnati scaldano meno. Asciugati al chiuso o vicino al fuoco.', val: (G) => G.body.wet, th: [0.15, 0.4, 0.7, 0.9] },
  { key: 'sick', icon: 'fever', names: ['Malessere', 'Febbre', 'Febbre alta', 'Delirio'], desc: 'Febbre: infezione di una ferita, raffreddore... o peggio.', val: (G) => Math.max(G.body.fever, G.body.cold > 0.3 ? 0.4 : 0), th: [0.3, 0.9, 1.8, 2.6] },
  { key: 'nausea', icon: 'nausea', names: ['Stomaco in subbuglio', 'Nausea', 'Nausea forte', 'Intossicato'], desc: 'Cibo marcio o acqua non bollita. Bevi e riposa.', val: (G) => Math.max(G.body.poison, G.body.zinfStage() >= 1 ? 0.5 : 0), th: [0.25, 0.45, 0.7, 0.9] },
  { key: 'injured', icon: 'injured', names: ['Contuso', 'Ferito', 'Gravemente ferito', 'In fin di vita'], desc: 'La tua condizione generale. Controlla il pannello Salute.', val: (G) => 100 - G.body.health, th: [15, 35, 55, 75] },
  { key: 'sad', icon: 'sad', names: ['Giù di morale', 'Triste', 'Depresso', 'Disperato'], desc: 'Cibo buono e caldo, un letto, un posto accogliente, qualcosa di bello. Morale basso = lavori lenti, impari meno.', val: (G) => 100 - G.mind.morale, th: [55, 70, 82, 92] },
  { key: 'bored', icon: 'bored', names: ['Annoiato', 'Molto annoiato', 'Noia mortale', 'Al limite'], desc: 'Libri, fumetti, giochi, musica. Anche uscire ad esplorare.', val: (G) => G.mind.boredom, th: [40, 60, 80, 95] },
  { key: 'lonely', icon: 'lonely', names: ['Solo', 'Molto solo', 'Isolato', 'Abbandonato'], desc: 'Foto, diario, una radio che trasmette ancora voci.', val: (G) => G.mind.lonely, th: [40, 60, 80, 95] },
  { key: 'heavy', icon: 'heavy', names: ['Carico', 'Pesante', 'Sovraccarico', 'Schiacciato'], desc: 'Il peso rallenta, stanca e fa rumore.', val: (G) => G.inv.encumbrance(), th: [1, 2, 3, 4] },
  { key: 'co', icon: 'co', names: ['Mal di testa', 'Aria pesante', 'Avvelenamento', 'Asfissia'], desc: 'Monossido! Spegni il generatore o esci all\'aperto.', val: (G) => G.body.co, th: [0.08, 0.3, 0.6, 0.85] },
];

const LINES = {
  hunger: [null, 'Mi brontola lo stomaco.', 'Ho una fame da lupi.', 'Devo mangiare qualcosa, subito.', 'Sto morendo di fame...'],
  thirst: [null, 'Ho la gola secca.', 'Ho sete.', 'Devo bere. Adesso.', 'Acqua... qualsiasi acqua.'],
  tired: [null, 'Comincio a essere stanco.', 'Mi si chiudono gli occhi.', 'Devo dormire.', 'Non mi reggo in piedi.'],
  cold: [null, 'Fa freddino.', 'Sto gelando.', 'Non sento più le dita.', 'Devo scaldarmi o muoio.'],
  hot: [null, 'Fa caldo.', 'Sto sudando come un matto.', 'Questo caldo mi uccide.', 'Mi gira la testa.'],
  wet: [null, null, 'Sono fradicio.', 'Bagnato fino alle ossa.', null],
  pain: [null, 'Fa male.', 'Fa davvero male.', 'Il dolore è insopportabile.', 'Basta... basta.'],
  bleed: [null, 'Sto sanguinando.', 'Perdo troppo sangue!', 'Devo fermare il sangue, ora!', 'Non... così tanto sangue...'],
  panic: [null, 'Calma. Respira.', 'Ok, ok, ok...', 'Devo andarmene di qui!', 'No no no no!'],
  sad: [null, 'Che giornata.', 'A cosa serve tutto questo?', 'Non ce la faccio più.', '...'],
  bored: [null, 'Mi annoio.', 'Che noia mortale.', 'Devo fare qualcosa o impazzisco.', null],
  lonely: [null, 'Che silenzio.', 'Mi manca sentire una voce.', 'Sono rimasto solo?', 'Parlo da solo, ormai.'],
  heavy: [null, null, 'Pesa parecchio.', 'Sono troppo carico.', 'Non riesco a muovermi con tutto questo peso.'],
  sick: [null, 'Non mi sento bene.', 'Ho la febbre.', 'Brucio...', 'Le gambe non mi reggono.'],
  nausea: [null, 'Ho lo stomaco sottosopra.', 'Sto per vomitare.', null, null],
  endurance: [null, null, null, 'Non ho più fiato...', null],
};

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor(G) {
    this.G = G;
    this.root = $('hud');
    this.build();
    this.levels = {};
    this.sayCd = {};
    this.toasts = [];
    this.t = 0;
    this.lastAct = '';
  }

  build() {
    this.root.innerHTML = `
      <div class="hud-tl">
        <div class="hud-clock"><span id="h-day">Giorno 1</span><b id="h-time">08:00</b></div>
        <div class="hud-meta" id="h-meta">Sereno, 16°C</div>
        <div class="hud-place" id="h-place"></div>
      </div>
      <div class="hud-compass" id="h-compass"><div class="cmp-strip" id="h-cmp"></div><div class="cmp-mark"></div></div>
      <div class="hud-moodles" id="h-moodles"></div>
      <div class="hud-center">
        <div class="crosshair" id="h-cross"></div>
        <svg class="stamina-ring" id="h-stam" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16"/><circle id="h-stam-c" cx="20" cy="20" r="16"/></svg>
      </div>
      <div class="hud-actions" id="h-actions"></div>
      <div class="hud-progress" id="h-progress" hidden><span id="h-prog-l"></span><i><b id="h-prog-b"></b></i></div>
      <div class="hud-say" id="h-say"></div>
      <div class="hud-sub" id="h-sub"></div>
      <div class="hud-toasts" id="h-toasts"></div>
      <div class="hud-event" id="h-event" hidden><b id="h-ev-t"></b><span id="h-ev-x"></span></div>
      <div class="hud-bottom">
        <div class="hud-noise" id="h-noise" title="Rumore che stai facendo"><i id="h-noise-b"></i><span id="h-noise-l">Silenzio</span></div>
        <div class="hud-hands" id="h-hands"></div>
        <div class="hud-hotbar" id="h-hot"></div>
      </div>
      <div class="hud-wait" id="h-wait" hidden>${icon('wait')} Aspetti…</div>
      <div class="hud-build" id="h-build" hidden></div>
      <div class="ov-vignette" id="ov-vig"></div>
      <div class="ov-hit" id="ov-hit"></div>
      <div class="ov-blink" id="ov-blink"></div>
      <div class="ov-sleep" id="ov-sleep" hidden><div><span>Dormi…</span><b id="ov-sleep-c">22:00</b></div></div>
    `;
    this.el = {
      day: $('h-day'), time: $('h-time'), meta: $('h-meta'), place: $('h-place'), moodles: $('h-moodles'), actions: $('h-actions'),
      prog: $('h-progress'), progL: $('h-prog-l'), progB: $('h-prog-b'), say: $('h-say'), sub: $('h-sub'), toasts: $('h-toasts'),
      ev: $('h-event'), evT: $('h-ev-t'), evX: $('h-ev-x'), noise: $('h-noise'), noiseB: $('h-noise-b'), noiseL: $('h-noise-l'),
      hands: $('h-hands'), hot: $('h-hot'), stam: $('h-stam'), stamC: $('h-stam-c'), cmp: $('h-cmp'), vig: $('ov-vig'), hit: $('ov-hit'),
      blink: $('ov-blink'), sleep: $('ov-sleep'), sleepC: $('ov-sleep-c'), wait: $('h-wait'), build: $('h-build'), cross: $('h-cross'),
    };
    this.el.hot.addEventListener('click', (e) => {
      const b = e.target.closest('[data-hot]');
      if (b) this.G.input.tap('hot' + (Number(b.dataset.hot) + 1));
    });
    this.el.actions.addEventListener('click', (e) => {
      const b = e.target.closest('[data-act]');
      if (b) this.G.interact.run(Number(b.dataset.act));
    });
    this.el.moodles.addEventListener('click', (e) => {
      const b = e.target.closest('[data-m]');
      if (!b) return;
      const m = MOODLES.find((x) => x.key === b.dataset.m);
      const lv = this.levels[m.key] || 1;
      this.toast(m.names[lv - 1] + ': ' + m.desc);
    });
    // bussola: lettere ogni 45°
    const pts = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
    let html = '';
    for (let r = 0; r < 3; r++) pts.forEach((p, k) => {
      html += `<span style="left:${(r * 8 + k) * 60}px" class="${p.length === 1 ? 'card' : ''}">${p}</span>`;
    });
    this.el.cmp.innerHTML = html + '<i id="h-cmp-h" class="cmp-horde" hidden></i><i id="h-cmp-b" class="cmp-home" hidden></i>';
    this.el.cmpH = $('h-cmp-h');
    this.el.cmpB = $('h-cmp-b');
  }

  show(on) {
    this.root.hidden = !on;
  }

  // ---------------------------------------------------------------- messaggi
  toast(text, kind = '') {
    const d = document.createElement('div');
    d.className = 'toast ' + kind;
    d.textContent = text;
    this.el.toasts.appendChild(d);
    this.toasts.push({ d, t: 5 + text.length * 0.03 });
    while (this.toasts.length > 5) {
      const o = this.toasts.shift();
      o.d.remove();
    }
  }
  say(text, key, cd = 90) {
    const now = this.G.time;
    if (key && this.sayCd[key] && now - this.sayCd[key] < cd) return;
    if (key) this.sayCd[key] = now;
    this.el.say.textContent = '«' + text + '»';
    this.el.say.classList.add('on');
    this.sayT = 4 + text.length * 0.04;
  }
  subtitle(text, sec) {
    this.el.sub.textContent = text;
    this.el.sub.classList.add('on');
    this.subT = sec;
  }
  event(title, text) {
    this.el.evT.textContent = title;
    this.el.evX.textContent = text;
    this.el.ev.hidden = false;
    this.el.ev.classList.remove('fade');
    void this.el.ev.offsetWidth;
    this.el.ev.classList.add('fade');
    this.evT = 7;
  }
  flash(kind) {
    const el = kind === 'blink' ? this.el.blink : this.el.hit;
    el.classList.remove('go');
    void el.offsetWidth;
    el.classList.add('go');
  }
  sleepOverlay(on) {
    this.el.sleep.hidden = !on;
  }
  sleepClock(t) {
    this.el.sleepC.textContent = t;
  }
  waitBadge(on) {
    this.el.wait.hidden = !on;
  }
  buildBar(text) {
    if (!text) {
      this.el.build.hidden = true;
      return;
    }
    this.el.build.hidden = false;
    this.el.build.innerHTML = text;
  }

  setActions(list, sel, title) {
    const key = title + '|' + list.map((a) => a.label + a.ok).join('|') + '|' + sel;
    if (key === this.lastAct) return;
    this.lastAct = key;
    if (!list.length) {
      this.el.actions.innerHTML = '';
      this.el.actions.classList.remove('on');
      this.G.touch && this.G.touch.setInteract(null);
      return;
    }
    const touch = this.G.touchActive;
    let h = title ? `<div class="act-title">${esc(title)}</div>` : '';
    list.slice(0, 7).forEach((a, k) => {
      h += `<button class="act ${k === sel ? 'sel' : ''} ${a.ok ? '' : 'no'}" data-act="${k}">${!touch && k === sel ? '<kbd>E</kbd>' : ''}${esc(a.label)}</button>`;
    });
    if (!touch && list.length > 1) h += `<div class="act-hint"><kbd>Q</kbd>/rotella per scegliere</div>`;
    this.el.actions.innerHTML = h;
    this.el.actions.classList.add('on');
    this.G.touch && this.G.touch.setInteract(list[sel]);
  }

  // ---------------------------------------------------------------- aggiornamento (10 volte al secondo)
  update(dt) {
    const G = this.G;
    this.t += dt;
    for (const o of this.toasts) {
      o.t -= dt;
      if (o.t < 0.6) o.d.classList.add('out');
    }
    this.toasts = this.toasts.filter((o) => {
      if (o.t <= 0) {
        o.d.remove();
        return false;
      }
      return true;
    });
    if (this.sayT > 0) {
      this.sayT -= dt;
      if (this.sayT <= 0) this.el.say.classList.remove('on');
    }
    if (this.subT > 0) {
      this.subT -= dt;
      if (this.subT <= 0) this.el.sub.classList.remove('on');
    }
    if (this.evT > 0) {
      this.evT -= dt;
      if (this.evT <= 0) this.el.ev.hidden = true;
    }
    this.updateBars(dt);
    this.slowT = (this.slowT || 0) - dt;
    if (this.slowT > 0) return;
    this.slowT = 0.15;
    this.updateSlow();
  }

  updateBars() {
    const G = this.G;
    // azione in corso
    const a = G.actions.current;
    if (a) {
      this.el.prog.hidden = false;
      this.el.progL.textContent = a.name;
      this.el.progB.style.width = Math.round(G.actions.progress() * 100) + '%';
    } else this.el.prog.hidden = true;
    // stamina vicino al mirino
    const st = G.body.stamina;
    const circ = 2 * Math.PI * 16;
    this.el.stamC.style.strokeDasharray = circ;
    this.el.stamC.style.strokeDashoffset = circ * (1 - st);
    this.el.stam.classList.toggle('on', st < 0.98);
    this.el.stam.classList.toggle('low', st < 0.25);
    // rumore
    const nl = G.noise.playerLevel;
    this.el.noiseB.style.width = Math.min(100, (nl / 25) * 100) + '%';
    this.el.noise.className = 'hud-noise ' + (nl > 15 ? 'loud' : nl > 7 ? 'mid' : nl > 2 ? 'low' : '');
    this.el.noiseL.textContent = nl > 15 ? 'Molto rumoroso' : nl > 7 ? 'Rumoroso' : nl > 2 ? 'Discreto' : 'Silenzio';
    // bussola
    const p = G.player;
    let deg = ((-p.yaw * 180) / Math.PI) % 360;
    if (deg < 0) deg += 360;
    // a yaw 0 si guarda verso nord (-z)
    const px = (deg / 45) * 60 + 8 * 60;
    this.el.cmp.style.transform = `translateX(${-px}px)`;
    const wrapPos = (a) => {
      let x = a;
      while (x - deg > 180) x -= 360;
      while (deg - x > 180) x += 360;
      return (x / 45) * 60 + 8 * 60;
    };
    const h = G.zombies.hordes.find((x) => x.stage >= 1 && x.stage < 5);
    if (h) {
      const ang = { N: 0, E: 90, S: 180, W: 270 }[h.side];
      this.el.cmpH.hidden = false;
      this.el.cmpH.style.left = wrapPos(ang) + 'px';
    } else this.el.cmpH.hidden = true;
    if (G.lastBed) {
      const dx = G.lastBed.x - p.x, dz = G.lastBed.z - p.z;
      let a = (Math.atan2(dx, -dz) * 180) / Math.PI;
      if (a < 0) a += 360;
      this.el.cmpB.hidden = Math.hypot(dx, dz) < 3;
      this.el.cmpB.style.left = wrapPos(a) + 'px';
    }
    // vignetta: panico, salute, stanchezza
    const panic = G.mind.panic / 100;
    const hurt = clamp((70 - G.body.health) / 70, 0, 1);
    const tired = clamp((G.body.fatigue - 75) / 25, 0, 1);
    const v = Math.max(panic * 0.9, hurt, tired * 0.7);
    this.el.vig.style.opacity = v.toFixed(2);
    this.el.vig.style.setProperty('--vr', (70 - v * 30).toFixed(0) + '%');
    this.el.vig.classList.toggle('red', hurt > panic);
    const canvas = G.renderer.domElement;
    const sat = G.body.health < 40 || G.mind.morale < 15 ? 0.55 : 1;
    const blur = G.body.thirst > 90 || G.body.fatigue > 95 ? 1.2 : 0;
    const f = (sat < 1 ? `saturate(${sat}) ` : '') + (blur ? `blur(${blur}px)` : '');
    if (f !== this.lastFilter) {
      canvas.style.filter = f || 'none';
      this.lastFilter = f;
    }
    this.el.cross.classList.toggle('hidden', !!G.building.mode);
  }

  updateSlow() {
    const G = this.G;
    const c = G.clock;
    this.el.day.textContent = 'Giorno ' + c.day + ' · ' + c.dateStr();
    this.el.time.textContent = c.timeStr();
    const w = G.weather;
    this.el.meta.textContent = w.label() + ', ' + Math.round(w.temp) + '°C · ' + c.season();
    // luogo
    const p = G.player;
    const g = G.grid;
    const i = Math.floor(p.x), j = Math.floor(p.z);
    let place = '';
    if (g.inb(i, j)) {
      const rid = g.roomAt(p.L, i, j);
      if (rid >= 0) {
        const r = G.world.rooms[rid];
        const b = G.world.buildings[r.bld];
        place = b.name + ' — ' + r.n + (p.L === 1 ? ' (primo piano)' : '');
      } else place = 'Montesordo — ' + ZONE_NAMES[g.zone[g.idx(i, j)]];
    }
    this.el.place.textContent = place;
    this.updateMoodles();
    this.updateHands();
  }

  updateMoodles() {
    const G = this.G;
    let h = '';
    for (const m of MOODLES) {
      const v = m.val(G);
      let lv = 0;
      for (let k = 0; k < 4; k++) if (v >= m.th[k]) lv = k + 1;
      const prev = this.levels[m.key] || 0;
      this.levels[m.key] = lv;
      if (lv > prev && LINES[m.key] && LINES[m.key][lv]) this.say(LINES[m.key][lv], 'm-' + m.key + lv, 240);
      if (!lv) continue;
      h += `<button class="moodle l${lv}" data-m="${m.key}" title="${esc(m.names[lv - 1])}">${icon(m.icon)}<span>${esc(m.names[lv - 1])}</span></button>`;
    }
    if (h !== this.lastMoodles) {
      this.el.moodles.innerHTML = h;
      this.lastMoodles = h;
    }
  }

  updateHands() {
    const G = this.G;
    const inv = G.inv;
    const it = inv.hand;
    let h = '';
    const slot = (x, label) => {
      if (!x) return `<div class="hand empty"><span>${label}</span><b>vuota</b></div>`;
      const d = ITEMS[x.id];
      const c = x.c !== undefined ? `<i class="dur"><b style="width:${Math.round(clamp(x.c, 0, 1) * 100)}%"></b></i>` : '';
      const bat = x.bat !== undefined ? `<i class="dur bat"><b style="width:${Math.round(clamp(x.bat, 0, 1) * 100)}%"></b></i>` : '';
      return `<div class="hand" style="--ic:${d.col}">${icon(d.ic)}<span>${label}</span><b>${esc(itemName(x))}${x.on ? ' · accesa' : ''}</b>${c}${bat}</div>`;
    };
    if (inv.bulky) {
      const b = inv.bulky;
      const name = b.kind === 'item' ? ITEMS[b.item.id].n : b.kind === 'furn' ? FURN[b.f.type].n : b.kind === 'corpse' ? 'Cadavere' : 'Carriola';
      h = `<div class="hand bulky">${icon(b.kind === 'barrow' ? 'build' : b.kind === 'item' ? ITEMS[b.item.id].ic : 'heavy')}<span>In braccio</span><b>${esc(name)}</b><em>${G.touchActive ? 'Lascia col pulsante' : '<kbd>X</kbd> per lasciare'}</em></div>`;
    } else {
      h = slot(it, 'Mano') + (inv.off ? slot(inv.off, 'Altra mano') : '');
    }
    if (h !== this.lastHands) {
      this.el.hands.innerHTML = h;
      this.lastHands = h;
    }
    let hb = '';
    for (let k = 0; k < 4; k++) {
      const u = inv.hot[k];
      const e = u ? inv.find(u) : null;
      if (u && !e) inv.hot[k] = null;
      const d = e ? ITEMS[e.it.id] : null;
      hb += `<button class="hot ${e && (inv.hand === e.it || inv.off === e.it) ? 'cur' : ''}" data-hot="${k}" style="${d ? '--ic:' + d.col : ''}"><kbd>${k + 1}</kbd>${d ? icon(d.ic) : ''}</button>`;
    }
    if (hb !== this.lastHot) {
      this.el.hot.innerHTML = hb;
      this.lastHot = hb;
    }
  }
}

export function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export { MOODLES, fmtNum };
