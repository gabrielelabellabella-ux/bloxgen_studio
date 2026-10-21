// Menu: principale, nuova partita (impostazioni del mondo), impostazioni, come si gioca, pausa, morte.
import { WORLD_OPTIONS, QUALITY, defaultWorldSettings } from '../config.js';
import { esc } from './hud.js';
import { icon } from './icons.js';

const $ = (id) => document.getElementById(id);

const NAMES = ['Marco Valli', 'Giulia Ferri', 'Luca Bassi', 'Sara Conti', 'Andrea Neri', 'Elena Riva', 'Paolo Greco', 'Marta Sala', 'Davide Longo', 'Chiara Pozzi', 'Simone Gatti', 'Anna Fabbri'];

export class Menus {
  constructor(G, hooks) {
    this.G = G;
    this.hooks = hooks;
    this.ws = defaultWorldSettings();
    this.bind();
  }

  bind() {
    // niente clic fantasma subito dopo che una schermata è comparsa (tocco che l'ha aperta)
    $('menu').addEventListener('click', (e) => {
      if (performance.now() - (this.shownAt || 0) < 350) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);
    $('m-new').addEventListener('click', () => this.showNew());
    $('m-continue').addEventListener('click', () => this.hooks.continueGame());
    $('m-settings').addEventListener('click', () => this.showSettings('menu'));
    $('m-help').addEventListener('click', () => this.show('help'));
    for (const b of document.querySelectorAll('[data-back]')) b.addEventListener('click', () => this.back(b.dataset.back));
    $('ng-start').addEventListener('click', () => {
      this.readNew();
      this.hooks.newGame(this.ws, ($('ng-name').value || '').trim() || NAMES[Math.floor(Math.random() * NAMES.length)]);
    });
    $('ng-reseed').addEventListener('click', () => {
      $('ng-seed').value = Math.floor(Math.random() * 1e9);
    });
    $('p-resume').addEventListener('click', () => this.hooks.resume());
    $('p-save').addEventListener('click', () => {
      const ok = this.G.save.save('manual');
      $('p-save').querySelector('small').textContent = ok ? 'Salvata: giorno ' + this.G.clock.day + ', ' + this.G.clock.timeStr() : 'Il browser non permette di salvare qui.';
    });
    // schermo intero (dove il browser lo permette)
    const fsOk = document.fullscreenEnabled || document.webkitFullscreenEnabled;
    for (const b of document.querySelectorAll('[data-full]')) {
      b.hidden = !fsOk;
      b.addEventListener('click', () => toggleFullscreen());
    }
    $('p-settings').addEventListener('click', () => this.showSettings('pause'));
    $('p-help').addEventListener('click', () => this.show('help', 'pause'));
    $('p-code').addEventListener('click', () => this.showCode());
    $('p-quit').addEventListener('click', () => this.hooks.quitToMenu());
    $('d-same').addEventListener('click', () => this.hooks.newSurvivor());
    $('d-new').addEventListener('click', () => this.showNew());
    $('d-menu').addEventListener('click', () => this.hooks.quitToMenu(true));
    $('code-copy').addEventListener('click', () => {
      const t = $('code-text');
      const done = () => ($('code-msg').textContent = 'Copiato. Incollalo su un altro dispositivo con "Carica codice".');
      try {
        navigator.clipboard.writeText(t.value).then(done, () => {
          t.select();
          $('code-msg').textContent = 'Seleziona e copia il testo a mano.';
        });
      } catch (e) {
        t.select();
      }
    });
    $('m-load-code').addEventListener('click', () => {
      $('code-text').value = '';
      $('code-copy').hidden = true;
      $('code-load').hidden = false;
      $('code-msg').textContent = 'Incolla qui un codice di salvataggio.';
      this.show('code', 'menu');
    });
    $('code-load').addEventListener('click', () => {
      const d = this.G.save.importCode($('code-text').value);
      if (!d) {
        $('code-msg').textContent = 'Codice non valido.';
        return;
      }
      $('code-msg').textContent = 'Caricato.';
      this.hooks.continueGame();
    });
    // impostazioni
    const prefs = this.G.prefs;
    const sel = $('s-quality');
    sel.innerHTML = Object.entries(QUALITY).map(([k, q]) => `<option value="${k}">${q.label}</option>`).join('');
    const sync = () => {
      sel.value = prefs.quality;
      $('s-sens').value = prefs.sensitivity;
      $('s-tsens').value = prefs.touchSensitivity;
      $('s-fov').value = prefs.fov;
      $('s-vol').value = prefs.volume;
      $('s-sfx').value = prefs.sfx;
      $('s-amb').value = prefs.ambience;
      $('s-inv').checked = prefs.invertY;
      $('s-rings').checked = prefs.noiseRings;
    };
    this.syncSettings = sync;
    const onChange = () => {
      const oldQ = prefs.quality;
      prefs.quality = sel.value;
      prefs.sensitivity = Number($('s-sens').value);
      prefs.touchSensitivity = Number($('s-tsens').value);
      prefs.fov = Number($('s-fov').value);
      prefs.volume = Number($('s-vol').value);
      prefs.sfx = Number($('s-sfx').value);
      prefs.ambience = Number($('s-amb').value);
      prefs.invertY = $('s-inv').checked;
      prefs.noiseRings = $('s-rings').checked;
      this.hooks.prefsChanged(oldQ !== prefs.quality);
    };
    for (const id of ['s-quality', 's-sens', 's-tsens', 's-fov', 's-vol', 's-sfx', 's-amb', 's-inv', 's-rings']) $(id).addEventListener('change', onChange);
    sync();
    // opzioni del mondo
    let h = '';
    for (const k in WORLD_OPTIONS) {
      const o = WORLD_OPTIONS[k];
      h += `<label class="field"><span>${esc(o.label)}</span><select id="ng-${k}">${o.choices.map(([v, n]) => `<option value="${v}">${esc(n)}</option>`).join('')}</select></label>`;
    }
    $('ng-opts').innerHTML = h;
  }

  show(name, from) {
    if ($('menu').hidden || this.current !== name) this.shownAt = performance.now();
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    const el = $('scr-' + name);
    if (el) el.hidden = false;
    $('menu').hidden = false;
    this.from = from || this.from;
    this.current = name;
  }
  hideAll() {
    $('menu').hidden = true;
    for (const s of document.querySelectorAll('.screen')) s.hidden = true;
    this.current = null;
  }
  back(to) {
    if (to === 'auto') to = this.from || 'main';
    if (to === 'pause') this.show('pause');
    else if (to === 'death') this.show('death');
    else this.showMain();
  }

  showMain() {
    const info = this.G.save.peek();
    const c = $('m-continue');
    c.hidden = !info || info.dead;
    if (info) c.querySelector('small').textContent = 'Giorno ' + info.day + (info.name ? ' · ' + info.name : '');
    this.from = 'main';
    this.show('main');
  }

  showNew() {
    this.ws = defaultWorldSettings();
    for (const k in WORLD_OPTIONS) $('ng-' + k).value = this.ws[k];
    $('ng-seed').value = this.ws.seed;
    $('ng-name').value = '';
    $('ng-name').placeholder = NAMES[Math.floor(Math.random() * NAMES.length)];
    const info = this.G.save.peek();
    $('ng-warn').hidden = !info || info.dead;
    this.show('new', this.current === 'death' ? 'death' : 'main');
  }
  readNew() {
    for (const k in WORLD_OPTIONS) this.ws[k] = $('ng-' + k).value;
    const s = Number($('ng-seed').value);
    this.ws.seed = Number.isFinite(s) && s > 0 ? Math.floor(s) : Math.floor(Math.random() * 1e9);
  }

  showSettings(from) {
    this.syncSettings();
    this.show('settings', from);
  }

  showPause() {
    $('p-save').querySelector('small').textContent = '';
    this.from = 'pause';
    this.show('pause');
  }

  showCode() {
    try {
      $('code-text').value = this.G.save.exportCode();
    } catch (e) {
      $('code-text').value = '';
    }
    $('code-copy').hidden = false;
    $('code-load').hidden = true;
    $('code-msg').textContent = 'Il salvataggio vive in questo browser. Questo codice è una copia di sicurezza: copialo e conservalo.';
    this.show('code', 'pause');
  }

  showDeath(info) {
    $('d-cause').textContent = info.cause;
    $('d-stats').innerHTML = `<div><b>${info.days}</b><span>giorni</span></div><div><b>${info.hours}</b><span>ore</span></div><div><b>${info.kills}</b><span>zombie uccisi</span></div>`;
    $('d-name').textContent = info.name;
    this.from = 'death';
    this.show('death');
  }
}

function toggleFullscreen() {
  const d = document;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
      return;
    }
    const el = d.documentElement;
    const r = (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
    const lock = () => {
      try {
        const o = screen.orientation;
        if (o && o.lock) o.lock('landscape').catch(() => {});
      } catch (e) {
        /* l'orientamento non si può bloccare */
      }
    };
    if (r && r.then) r.then(lock, () => {});
    else lock();
  } catch (e) {
    /* schermo intero non disponibile */
  }
}

export { icon };
