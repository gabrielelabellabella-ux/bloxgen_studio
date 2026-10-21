// Controlli touch: joystick dinamico a sinistra, trascina a destra per guardarti intorno,
// pulsanti per colpire, spingere, interagire, accovacciarti, correre, torcia, lanciare.
import { icon } from './icons.js';
import { esc } from './hud.js';

export class Touch {
  constructor(G) {
    this.G = G;
    this.root = document.getElementById('touch');
    this.root.innerHTML = `
      <div class="t-joyzone" id="t-joyzone"><div class="t-base" id="t-base" hidden><div class="t-knob" id="t-knob"></div></div><div class="t-joyhint">Muoviti</div></div>
      <div class="t-look" id="t-look"></div>
      <div class="t-top">
        <button class="tt" data-ui="inv" aria-label="Zaino">${icon('bag')}</button>
        <button class="tt" data-ui="health" aria-label="Salute">${icon('health')}</button>
        <button class="tt" data-ui="craft" aria-label="Crea">${icon('craft')}</button>
        <button class="tt" data-ui="build" aria-label="Costruisci">${icon('build')}</button>
        <button class="tt" data-ui="map" aria-label="Mappa">${icon('map')}</button>
        <button class="tt" data-tap="rest" aria-label="Aspetta">${icon('wait')}</button>
        <button class="tt" data-tap="pause" aria-label="Pausa">${icon('pause')}</button>
      </div>
      <div class="t-btns">
        <button class="tb act" id="tb-act" data-tap="interact" hidden><span id="tb-act-l"></span></button>
        <button class="tb big" data-tap="attack" aria-label="Colpisci">${icon('attack')}</button>
        <button class="tb" data-tap="shove" aria-label="Spingi">${icon('shove')}<small>Spingi</small></button>
        <button class="tb tog" id="tb-crouch" data-tog="crouch" aria-label="Accovacciati">${icon('crouch')}<small>Giù</small></button>
        <button class="tb tog" id="tb-run" data-tog="run" aria-label="Corri">${icon('run')}<small>Corri</small></button>
        <button class="tb" data-tap="flash" aria-label="Torcia">${icon('flash')}<small>Luce</small></button>
        <button class="tb" id="tb-throw" data-tap="throw" aria-label="Lancia">${icon('throw')}<small>Lancia</small></button>
        <button class="tb" id="tb-drop" data-tap="drop" aria-label="Lascia" hidden>${icon('drop')}<small>Lascia</small></button>
        <button class="tb" id="tb-next" data-tap="cycle" aria-label="Altra azione" hidden>${icon('rotate')}<small>Altro</small></button>
      </div>
      <div class="t-build" id="t-build" hidden>
        <button class="tb big ok" data-tap="buildok">${icon('check')}<small>Costruisci</small></button>
        <button class="tb" data-tap="rotate">${icon('rotate')}<small>Ruota</small></button>
        <button class="tb" data-tap="buildexit">${icon('close')}<small>Esci</small></button>
      </div>`;
    this.joy = { id: null, x0: 0, y0: 0 };
    this.look = { id: null, x: 0, y: 0 };
    this.bind();
  }

  bind() {
    const G = this.G;
    const inp = G.input;
    const zone = document.getElementById('t-joyzone');
    const base = document.getElementById('t-base');
    const knob = document.getElementById('t-knob');
    const R = 58;
    zone.addEventListener('pointerdown', (e) => {
      if (this.joy.id !== null) return;
      e.preventDefault();
      zone.setPointerCapture(e.pointerId);
      this.joy = { id: e.pointerId, x0: e.clientX, y0: e.clientY };
      base.hidden = false;
      base.style.left = e.clientX + 'px';
      base.style.top = e.clientY + 'px';
      knob.style.transform = 'translate(-50%,-50%)';
      inp.touchMove.active = true;
      inp.touchMove.x = 0;
      inp.touchMove.y = 0;
    });
    const moveJoy = (e) => {
      if (e.pointerId !== this.joy.id) return;
      let dx = e.clientX - this.joy.x0, dy = e.clientY - this.joy.y0;
      const l = Math.hypot(dx, dy);
      if (l > R) {
        dx = (dx / l) * R;
        dy = (dy / l) * R;
      }
      knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
      inp.touchMove.x = dx / R;
      inp.touchMove.y = -dy / R;
      // spinto fino in fondo in avanti = corsa (se attiva)
    };
    const endJoy = (e) => {
      if (e.pointerId !== this.joy.id) return;
      this.joy.id = null;
      base.hidden = true;
      inp.touchMove.active = false;
      inp.touchMove.x = 0;
      inp.touchMove.y = 0;
    };
    zone.addEventListener('pointermove', moveJoy);
    zone.addEventListener('pointerup', endJoy);
    zone.addEventListener('pointercancel', endJoy);
    const look = document.getElementById('t-look');
    look.addEventListener('pointerdown', (e) => {
      if (this.look.id !== null) return;
      e.preventDefault();
      look.setPointerCapture(e.pointerId);
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY };
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.look.id) return;
      const s = 0.0052 * G.prefs.touchSensitivity;
      inp.look.x += (e.clientX - this.look.x) * s;
      inp.look.y += (e.clientY - this.look.y) * s * (G.prefs.invertY ? -1 : 1);
      this.look.x = e.clientX;
      this.look.y = e.clientY;
    });
    const endLook = (e) => {
      if (e.pointerId === this.look.id) this.look.id = null;
    };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);
    // pulsanti
    // i pulsanti in alto aprono pannelli e menu: al rilascio (click), altrimenti il tocco finisce
    // sul pannello appena aperto
    this.root.querySelector('.t-top').addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      if (b.dataset.ui) G.ui.togglePanel(b.dataset.ui);
      else if (b.dataset.tap) inp.tap(b.dataset.tap);
    });
    this.root.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('button');
      if (!b || b.classList.contains('tt')) return;
      e.preventDefault();
      e.stopPropagation();
      b.classList.add('down');
      setTimeout(() => b.classList.remove('down'), 140);
      if (b.dataset.tap) {
        const t = b.dataset.tap;
        if (t === 'buildok') G.building.confirm();
        else if (t === 'buildexit') G.building.stopMode();
        else inp.tap(t);
      }
      if (b.dataset.ui) G.ui.togglePanel(b.dataset.ui);
      if (b.dataset.tog === 'crouch') inp.tap('crouch');
      if (b.dataset.tog === 'run') {
        inp.runToggle = !inp.runToggle;
        b.classList.toggle('on', inp.runToggle);
      }
    });
    this.root.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  show(on) {
    this.root.hidden = !on;
  }

  setInteract(a) {
    const b = document.getElementById('tb-act');
    if (!b) return;
    if (!a) {
      b.hidden = true;
      return;
    }
    b.hidden = false;
    b.classList.toggle('no', !a.ok);
    document.getElementById('tb-act-l').innerHTML = esc(a.label);
  }

  update() {
    const G = this.G;
    const inv = G.inv;
    document.getElementById('tb-crouch').classList.toggle('on', G.player.crouch);
    document.getElementById('tb-run').classList.toggle('on', G.input.runToggle);
    document.getElementById('tb-drop').hidden = !inv.bulky;
    document.getElementById('tb-next').hidden = !(G.interact.actions.length > 1);
    const building = !!G.building.mode;
    document.getElementById('t-build').hidden = !building;
    this.root.querySelector('.t-btns').hidden = building;
  }
}
