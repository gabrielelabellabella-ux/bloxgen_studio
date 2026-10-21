// Montesordo — avvio, ciclo di gioco e collegamento dei sistemi.
import * as THREE from 'three';
import { EventBus } from './core/events.js';
import { Clock } from './core/clock.js';
import { IS_TOUCH, clamp, damp, safeStorageGet, safeStorageSet } from './core/util.js';
import { RNG } from './core/rng.js';
import { QUALITY, PREFS_KEY, defaultPrefs, worldValue, LEVEL_H } from './config.js';
import { ITEMS } from './data/items.js';
import { generateWorld } from './world/mapgen.js';
import { initRuntime } from './world/runtime.js';
import { StaticWorld } from './world/worldmesh.js';
import { Dynamic } from './world/dynamic.js';
import { Sky } from './world/sky.js';
import { Weather } from './world/weather.js';
import { Decay } from './world/decay.js';
import { buildTextures } from './render/textures.js';
import { ZombieMeshes } from './render/zombiemesh.js';
import { Viewmodel } from './render/viewmodel.js';
import { FX } from './render/fx.js';
import { Paths } from './sim/pathfield.js';
import { Zombies, Z } from './sim/zombies.js';
import { Noise } from './sim/noise.js';
import { Player } from './sim/player.js';
import { Body } from './sim/body.js';
import { Mind } from './sim/mind.js';
import { Inventory } from './sim/inventory.js';
import { Actions } from './sim/actions.js';
import { Skills } from './sim/skills.js';
import { Combat } from './sim/combat.js';
import { Crafting } from './sim/crafting.js';
import { Building } from './sim/building.js';
import { Base } from './sim/base.js';
import { Interact } from './sim/interact.js';
import { Use } from './sim/use.js';
import { Sleep } from './sim/sleep.js';
import { Save, snapshotInit } from './sim/save.js';
import { mkItem } from './sim/items.js';
import { Audio } from './audio/audio.js';
import { Input } from './ui/input.js';
import { Hud } from './ui/hud.js';
import { Panels } from './ui/panels.js';
import { Touch } from './ui/touch.js';
import { Menus } from './ui/menus.js';
import { FURN } from './data/furniture.js';

const G = {
  events: new EventBus(),
  time: 0,
  state: 'menu',
  sleeping: false,
  stats: { kills: 0, startDay: 0, deaths: 0 },
  charName: 'Sopravvissuto',
};
window.__game = G;

const DIR_IT = { N: 'nord', S: 'sud', E: 'est', W: 'ovest' };
const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };

function loadPrefs() {
  const p = defaultPrefs();
  try {
    const s = safeStorageGet(PREFS_KEY);
    if (s) Object.assign(p, JSON.parse(s));
  } catch (e) {
    /* preferenze illeggibili: si usano i default */
  }
  return p;
}
function savePrefs() {
  safeStorageSet(PREFS_KEY, JSON.stringify(G.prefs));
}

// ---------------------------------------------------------------- avvio
let renderer, scene, camera, canvas;
let last = 0;
let indoorF = 0;
let exploreT = 0;

function setupRenderer() {
  canvas = document.getElementById('view');
  G.quality = QUALITY[G.prefs.quality] || QUALITY.medium;
  renderer = new THREE.WebGLRenderer({ canvas, antialias: G.prefs.quality === 'high', powerPreference: 'high-performance' });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.autoClear = false;
  applyQuality();
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0e0d);
  camera = new THREE.PerspectiveCamera(G.prefs.fov, 1, 0.05, G.quality.viewDist);
  camera.rotation.order = 'YXZ';
  scene.add(camera);
  G.renderer = renderer;
  G.scene = scene;
  G.camera = camera;
  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('orientationchange', () => setTimeout(resize, 200));
}

function applyQuality() {
  G.quality = QUALITY[G.prefs.quality] || QUALITY.medium;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, G.quality.pixelRatio));
  renderer.shadowMap.enabled = G.quality.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  document.body.classList.toggle('portrait', h > w);
}

function boot() {
  G.prefs = loadPrefs();
  G.touchActive = IS_TOUCH;
  document.body.classList.toggle('touch', IS_TOUCH);
  setupRenderer();
  G.input = new Input(canvas);
  G.input.touchMode = IS_TOUCH;
  G.input.sens = G.prefs.sensitivity;
  G.input.invertY = G.prefs.invertY;
  G.tex = buildTextures(G.quality.aniso);
  G.clock = new Clock(8 * 60);
  G.settings = { seed: 2026 };
  // sistemi che non dipendono dalla mappa
  G.noise = new Noise(G);
  G.player = new Player(G);
  G.body = new Body(G);
  G.mind = new Mind(G);
  G.inv = new Inventory(G);
  G.actions = new Actions(G);
  G.skills = new Skills(G);
  G.combat = new Combat(G);
  G.crafting = new Crafting(G);
  G.interact = new Interact(G);
  G.use = new Use(G);
  G.sleep = new Sleep(G);
  G.save = new Save(G);
  G.audio = new Audio(G);
  G.fx = new FX(G);
  scene.add(G.fx.group);
  G.viewmodel = new Viewmodel(G);
  G.hud = new Hud(G);
  G.hud.show(false);
  G.panels = new Panels(G);
  G.ui = {
    open: (t, o) => G.panels.open(t, o),
    close: () => G.panels.close(),
    togglePanel: (t) => (G.state === 'playing' ? G.panels.toggle(t) : null),
    canAct: () => !G.panels.isOpen && G.state === 'playing',
    lootLocate: (it) => G.panels.lootLocate(it),
  };
  G.touch = new Touch(G);
  G.touch.show(false);
  G.menus = new Menus(G, hooks);
  G.input.onLockChange = (locked) => {
    document.body.classList.toggle('locked', locked);
    if (locked || G.state !== 'playing' || G.panels.isOpen || IS_TOUCH) return;
    // Esc durante la costruzione esce dalla modalità costruzione, non dal gioco
    if (G.building && G.building.mode) G.building.stopMode();
    else pauseGame();
  };
  G.input.onDragMode = () => {
    document.body.classList.add('dragmode');
    if (G.state === 'playing') G.hud.toast('Qui il mouse non si può bloccare: tieni premuto e trascina per guardarti intorno, clic per colpire.', 'tip');
  };
  wireEvents();
  G.menus.showMain();
  // mondo di sfondo per il menu (dopo il primo frame, così il menu appare subito)
  setTimeout(() => {
    try {
      const info = G.save.load();
      buildWorld(info ? info.settings : { ...G.settings, population: 'normal' });
      placeMenuCamera();
    } catch (e) {
      console.error(e);
    }
    document.body.classList.add('ready');
  }, 30);
  // aggiornamenti dal visualizzatore (artifact): conserva la partita
  try {
    if (window.claude && window.claude.hot && window.claude.hot.snapshot) window.claude.hot.snapshot(() => (G.state === 'playing' || G.state === 'paused' ? { save: G.save.serialize() } : {}));
  } catch (e) {
    /* non disponibile */
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && (G.state === 'playing' || G.state === 'paused')) G.save.save('auto');
    if (!document.hidden && G.state === 'playing') requestWakeLock();
  });
  window.addEventListener('pagehide', () => {
    if (G.state === 'playing' || G.state === 'paused') G.save.save('auto');
  });
  requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- mondo
function disposeWorld() {
  if (G.staticWorld) {
    scene.remove(G.staticWorld.group);
    G.staticWorld.dispose();
  }
  if (G.dyn) {
    scene.remove(G.dyn.group);
    G.dyn.dispose();
  }
  if (G.zmesh) scene.remove(G.zmesh.group);
  if (G.sky) {
    scene.remove(G.sky.hemi, G.sky.fill, G.sky.sun, G.sky.sun.target, G.sky.dome, G.sky.stars);
    for (const p of G.sky.points) scene.remove(p);
    camera.remove(G.sky.flash, G.sky.flash.target);
  }
  if (G.weather && G.weather.particles) scene.remove(G.weather.particles);
  G.fx.dispose();
}

function buildWorld(settings) {
  disposeWorld();
  G.settings = Object.assign({}, settings);
  const W = generateWorld(G.settings);
  G.world = W;
  G.grid = W.grid;
  initRuntime(G, W);
  G.paths = new Paths(G);
  G.zombies = new Zombies(G);
  G.zombies.init(W);
  G.decay = new Decay(G);
  G.weather = new Weather(G);
  G.base = new Base(G);
  G.building = new Building(G);
  G.building.prebuild(W.prebuilt);
  snapshotInit(W);
  G.sky = new Sky(G);
  G.staticWorld = new StaticWorld(G.tex, G.quality);
  G.staticWorld.build(W);
  scene.add(G.staticWorld.group);
  G.dyn = new Dynamic(G);
  G.dyn.init(W);
  scene.add(G.dyn.group);
  G.zmesh = new ZombieMeshes(G);
  scene.add(G.zmesh.group);
  G.weather.initParticles(scene, G.quality.rain);
  G.decay.update(0, true);
  G.explored = new Uint8Array(G.grid.W * G.grid.H);
  G.worldSeed = G.settings.seed;
  scene.fog = scene.fog || null;
}

function resetCharacter() {
  G.player.reset(0, 0, 0);
  G.body.reset();
  G.mind.reset();
  G.inv.reset();
  G.actions.reset();
  G.skills.reset();
  G.combat.reset();
  G.interact.reset();
  G.sleep.active = false;
  G.sleep.waiting = false;
  G.sleeping = false;
  G.panels.close();
}

function startPlaying() {
  G.state = 'playing';
  G.menus.hideAll();
  G.hud.show(true);
  G.touch.show(IS_TOUCH);
  G.hud.sleepOverlay(false);
  G.audio.init();
  G.input.enabled = true;
  if (!IS_TOUCH) G.input.requestLock();
  requestWakeLock();
  scheduleNextHorde(true);
}

const hooks = {
  newGame(ws, name) {
    G.audio.init();
    showLoading('Generazione di Montesordo…');
    setTimeout(() => {
      G.save.clear();
      buildWorld(ws);
      resetCharacter();
      G.clock.min = 8 * 60;
      G.charName = name;
      G.stats = { kills: 0, startDay: 0, deaths: 0 };
      G.lastBed = null;
      G.mapRevealed = false;
      G.oldSelf = null;
      G.nextHordeAt = null;
      const s = G.world.playerSpawn;
      G.player.reset(s.x, s.z, s.L, Math.PI);
      G.inv.starterKit();
      G.lastBed = null;
      hideLoading();
      startPlaying();
      G.hud.event('Montesordo, ' + G.clock.dateStr(), 'Da tre giorni la valle è chiusa. In strada c\'è gente che cammina male e non risponde. Sopravvivi il più a lungo possibile. Non fare rumore.');
      setTimeout(() => tip('start'), 6000);
      G.save.save('auto');
    }, 40);
  },
  continueGame(dataIn) {
    const d = dataIn || G.save.load();
    if (!d) return;
    G.audio.init();
    showLoading('Ritorno a Montesordo…');
    setTimeout(() => {
      loadSave(d);
      hideLoading();
      startPlaying();
      G.hud.toast('Partita caricata: giorno ' + G.clock.day + ', ' + G.clock.timeStr() + '.');
    }, 40);
  },
  resume() {
    G.menus.hideAll();
    G.state = 'playing';
    if (!IS_TOUCH) G.input.requestLock();
  },
  quitToMenu(fromDeath) {
    if (!fromDeath && G.state !== 'dead') G.save.save('auto');
    G.state = 'menu';
    G.hud.show(false);
    G.touch.show(false);
    G.panels.close();
    G.input.releaseLock();
    G.menus.showMain();
    placeMenuCamera();
  },
  newSurvivor() {
    newSurvivor();
  },
  prefsChanged(qualityChanged) {
    savePrefs();
    G.input.sens = G.prefs.sensitivity;
    G.input.invertY = G.prefs.invertY;
    camera.fov = G.prefs.fov;
    camera.updateProjectionMatrix();
    G.audio.applyPrefs();
    if (qualityChanged) {
      applyQuality();
      camera.far = G.quality.viewDist;
      camera.updateProjectionMatrix();
      if (G.world) {
        // ricostruisce il mondo con la nuova qualità mantenendo lo stato
        const d = G.state === 'menu' ? null : G.save.serialize();
        buildWorld(G.settings);
        if (d) loadSave(d);
        else placeMenuCamera();
      }
    }
  },
};

function loadSave(d) {
  buildWorld(d.settings);
  resetCharacter();
  // i pezzi del cantiere vengono dal salvataggio
  for (const e of [...G.grid.edges.values()]) if (e.built) G.grid.removeEdge(e);
  for (const [k, pc] of G.world.builtFloors) G.grid.lv[pc.L].floor[G.grid.idx(pc.i, pc.j)] = pc.L === 0 ? 0 : 255;
  G.world.builtFloors.clear();
  G.save.apply(d);
  G.dyn.dispose();
  G.dyn.init(G.world);
  G.decay.update(0, true);
  G.staticWorld.setGrowth(G.clock.days * G.decay.speed);
  if (G.oldSelf && G.oldSelf.colors) makeOldSelfGeo(G.oldSelf.colors);
}

function pauseGame() {
  if (G.state !== 'playing') return;
  G.state = 'paused';
  G.input.releaseLock();
  G.menus.showPause();
}

function showLoading(t) {
  const l = document.getElementById('loading');
  l.querySelector('span').textContent = t;
  l.hidden = false;
}
function hideLoading() {
  document.getElementById('loading').hidden = true;
}

let wakeLock = null;
async function requestWakeLock() {
  if (!IS_TOUCH || !('wakeLock' in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (e) {
    wakeLock = null;
  }
}

// ---------------------------------------------------------------- eventi
function wireEvents() {
  const ev = G.events;
  ev.on('edge', (e) => G.dyn && G.dyn.updateEdge(e));
  ev.on('furn', (f) => G.dyn && G.dyn.updateFurn(f));
  ev.on('ground', (k) => G.dyn && G.dyn.updateGround(k));
  ev.on('floor', (k) => G.dyn && G.dyn.updateFloor(k));
  ev.on('stairs', (s) => G.dyn && G.dyn.updateStair(s));
  ev.on('car', (c) => G.dyn && G.dyn.updateCar(c));
  ev.on('power', () => {
    if (!G.world) return;
    for (const f of G.world.furn) if (f.type === 'lamp' || f.type === 'generator') G.dyn.updateFurn(f);
  });
  ev.on('zombieKilled', () => {
    G.stats.kills++;
    if (G.stats.kills === 1) tip('firstKill');
  });
  ev.on('stealthKill', () => G.hud.toast('Uccisione silenziosa.', 'good'));
  ev.on('death', (cause) => onDeath(cause));
  ev.on('spotted', () => {
    if (!G.tipSeen || !G.tipSeen.spotted) tip('spotted');
  });
  ev.on('throw', () => G.viewmodel.throwAnim());
  ev.on('wound', (w) => {
    if (w.type !== 'scratch') tip('wound');
  });
  ev.on('woundInfected', () => G.hud.toast('Una ferita si è infettata. Disinfettala, servono antibiotici.', 'bad'));
  ev.on('cured', () => G.hud.event('La febbre scende', 'Il contagio si è fermato. Per stavolta.'));
  ev.on('hordeSignal', (d) => hordeSignal(d));
  ev.on('weather', (s) => {
    if (s === 'rain') G.hud.toast('Comincia a piovere: copre un po\' di rumore, ma ti bagna.');
    if (s === 'fog') G.hud.toast('Sale la nebbia. Si vede poco, per tutti.');
    if (s === 'storm') G.hud.toast('Arriva un temporale.');
  });
  ev.on('barricaded', () => tip('barricade'));
}

function hordeSignal(d) {
  const G2 = G;
  const dir = DIR_IT[d.side];
  if (d.stage === 1) G2.hud.event('Un brusio lontano', 'Un rumore basso e costante arriva da ' + dir + '. Non smette.');
  if (d.stage === 2) {
    const p = G2.player;
    const v = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[d.side];
    G2.fx.birdsFlock(p.x + v[0] * 30, p.z + v[1] * 30, -v[0], -v[1]);
    G2.hud.toast('Uno stormo si alza in volo da ' + dir + ' e scappa via.');
  }
  if (d.stage === 3) G2.hud.toast('Gli zombie in strada si muovono tutti nella stessa direzione, verso ' + DIR_IT[OPP[d.side]] + '. Qualcosa sta arrivando.');
  if (d.stage === 4) G2.hud.event("Un'orda attraversa Montesordo", 'Arriva da ' + dir + '. Nasconditi, spegni le luci, non fare rumore. Spera che le barricate reggano.');
  if (d.stage === 5) G2.hud.toast('Il brusio si allontana. L\'orda è passata, ma non tutti se ne sono andati.');
}

function scheduleNextHorde(init) {
  const every = worldValue(G.settings, 'hordes');
  if (!every) {
    G.nextHordeAt = null;
    return;
  }
  if (init && G.nextHordeAt) return;
  const rng = new RNG((G.settings.seed ^ (G.clock.day * 7919)) >>> 0);
  const base = G.nextHordeAt ? G.nextHordeAt : Math.max(G.clock.days + 1, every);
  G.nextHordeAt = base + (init && !G.nextHordeAt ? rng.range(0, 0.6) : every * rng.range(0.85, 1.2));
}

function checkHordes() {
  if (!G.nextHordeAt) return;
  if (G.clock.days >= G.nextHordeAt) {
    const pop = worldValue(G.settings, 'population');
    const size = Math.round(clamp((14 + G.clock.days * 0.8) * (pop / 120), 10, 45));
    const side = ['N', 'S', 'E', 'W'][Math.floor(Math.random() * 4)];
    G.zombies.scheduleHorde(G.clock.min + 160, side, size);
    const every = worldValue(G.settings, 'hordes');
    G.nextHordeAt = G.clock.days + every * (0.85 + Math.random() * 0.35);
  }
}

// ---------------------------------------------------------------- consigli (una volta sola)
const TIPS = {
  start: () => (IS_TOUCH ? 'Joystick a sinistra per muoverti, trascina a destra per guardare. Il pulsante azione appare quando guardi qualcosa.' : 'WASD per muoverti, mouse per guardare. E per interagire, C per accovacciarti (meno rumore), Tab per lo zaino.'),
  spotted: () => 'Ti hanno visto. Da soli sono lenti: allontanati, chiudi una porta, o colpisci alla testa. Mai contro tre insieme.',
  wound: () => 'Sei ferito. Apri la Salute (' + (IS_TOUCH ? 'cuore in alto' : 'H') + ') e benda la ferita prima di dissanguarti.',
  firstKill: () => 'Il rumore dei colpi richiama altri zombie. Meglio non farsi vedere.',
  barricade: () => 'Le assi reggono un po\'. Gli zombie le abbattono col tempo, in gruppo molto più in fretta.',
  night: () => 'Si fa buio. Di notte gli zombie sono più attivi e una torcia accesa si vede da lontano. Copri le finestre prima di accendere luci.',
};
function tip(key) {
  if (!G.prefs.hints) return;
  G.tipSeen = G.tipSeen || {};
  if (G.tipSeen[key]) return;
  G.tipSeen[key] = true;
  G.hud.toast(TIPS[key](), 'tip');
}

// ---------------------------------------------------------------- morte e nuovo personaggio
function onDeath(cause) {
  if (G.state === 'dead') return;
  G.actions.reset();
  G.sleep.active = false;
  G.sleeping = false;
  G.hud.sleepOverlay(false);
  G.state = 'dead';
  G.input.releaseLock();
  G.panels.close();
  G.audio.play('hurt', null, null, null, 1, 0.7);
  const p = G.player;
  // il vecchio te diventerà uno zombie con le tue cose addosso
  const items = [];
  for (const e of G.inv.entries()) {
    if (e.where === 'bulky') continue;
    if (e.it.items) for (const x of e.it.items.splice(0)) items.push(x);
    items.push(e.it);
  }
  const shirt = G.inv.worn.torso_out || G.inv.worn.torso_in;
  const pants = G.inv.worn.legs;
  G.oldSelf = {
    x: p.x, z: p.z, L: p.L, y: p.y, items, name: G.charName,
    colors: { shirt: shirt ? parseInt(ITEMS[shirt.id].col.slice(1), 16) : 0x8a9aa8, pants: pants ? parseInt(ITEMS[pants.id].col.slice(1), 16) : 0x3a3a3a },
    turned: false,
  };
  if (G.inv.bulky && G.inv.bulky.kind === 'barrow') G.inv.bulky.b.held = false;
  if (G.inv.bulky && G.inv.bulky.kind === 'corpse') G.inv.bulky.c.carried = false;
  G.inv.reset();
  const days = G.clock.days - (G.stats.startDay || 0);
  G.save.save('death');
  G.menus.showDeath({ cause: cause || 'Sei morto', name: G.charName, days: Math.floor(days), hours: Math.floor((days % 1) * 24), kills: G.stats.kills });
  G.hud.show(false);
  G.touch.show(false);
}

function makeOldSelfGeo(colors) {
  const c = G.zmesh.makeCustom(colors);
  G.player.oldGeo = c.geo;
  G.player.oldCorpseGeo = c.corpse;
}

function newSurvivor() {
  const old = G.oldSelf;
  resetCharacter();
  G.stats.deaths = (G.stats.deaths || 0) + 1;
  G.stats.kills = 0;
  if (old) {
    makeOldSelfGeo(old.colors);
    const zb = G.zombies.spawn(old.x, old.z, old.L, { special: 'oldself', items: old.items });
    zb.y = old.y;
    old.turned = true;
  }
  // il tempo passa mentre il nuovo sopravvissuto si nasconde
  const h = G.clock.hour;
  const add = h < 7 ? 7 - h : 24 - h + 7;
  G.clock.min += add * 60;
  G.stats.startDay = G.clock.days;
  // nuova casa: lontana da dove sei morto, con meno zombie possibile intorno
  const houses = G.world.buildings.filter((b) => b.kind === 'house');
  const rng = new RNG((Date.now() & 0xffffffff) >>> 0);
  let spawn = null, best = Infinity;
  for (const b of rng.shuffle(houses.slice())) {
    const cx = b.i0 + b.w / 2, cz = b.j0 + b.d / 2;
    if (old && Math.hypot(cx - old.x, cz - old.z) < 18) continue;
    const rooms = b.rooms.map((id) => G.world.rooms[id]).filter((r) => r.L === 0 && r.type !== 'garage');
    const cells = [];
    for (const r of rooms) for (const [i, j] of r.cells) if (!G.grid.cellBlocked(0, i, j) && !G.grid.lv[0].furn[G.grid.idx(i, j)] && G.grid.stairCell[G.grid.idx(i, j)] < 0) cells.push([i, j]);
    if (!cells.length) continue;
    let n = 0;
    G.zombies.query(cx, cz, 12, () => n++);
    if (n < best) {
      best = n;
      const c = rng.pick(cells);
      spawn = { x: c[0] + 0.5, z: c[1] + 0.5, b };
      if (n === 0) break;
    }
  }
  if (!spawn) spawn = { x: G.world.playerSpawn.x, z: G.world.playerSpawn.z, b: null };
  // si era chiuso dentro: in casa non c'è nessuno
  if (spawn.b) {
    const b = spawn.b;
    for (const zb of G.zombies.list) if (zb.special !== 'oldself' && zb.x > b.i0 - 0.5 && zb.x < b.i0 + b.w + 0.5 && zb.z > b.j0 - 0.5 && zb.z < b.j0 + b.d + 0.5) zb.removed = true;
    G.zombies.list = G.zombies.list.filter((zb) => !zb.removed);
    G.zombies.rebuildHash();
  }
  G.player.reset(spawn.x, spawn.z, 0, rng.range(0, 6.28));
  G.inv.starterKit();
  G.charName = ['Marco Valli', 'Giulia Ferri', 'Luca Bassi', 'Sara Conti', 'Andrea Neri', 'Elena Riva', 'Paolo Greco', 'Marta Sala'][Math.floor(Math.random() * 8)];
  G.lastBed = null;
  startPlaying();
  G.hud.event(G.charName + ', giorno ' + G.clock.day, 'Ti sei nascosto per giorni. Là fuori, da qualche parte, c\'è la base di qualcuno che non ce l\'ha fatta.');
  G.save.save('auto');
}

// ---------------------------------------------------------------- ciclo
let shownState = '';
function loop(t) {
  requestAnimationFrame(loop);
  if (G.state !== shownState) {
    shownState = G.state;
    document.body.dataset.state = G.state;
  }
  const now = t / 1000;
  let dt = now - last;
  last = now;
  if (!(dt > 0)) dt = 0.016;
  dt = Math.min(dt, 0.05);
  const inp = G.input.poll();
  if (!G.world) {
    renderer.clear();
    return;
  }
  if (G.state === 'playing') {
    globalKeys(inp);
    if (G.state === 'playing') update(dt, inp);
  } else if (G.state === 'paused' || G.state === 'dead') {
    if (inp.pressed.has('pause') && G.state === 'paused') hooks.resume();
    visuals(dt * 0.2, true);
  } else menuCamera(dt);
  render();
}

function globalKeys(inp) {
  const pr = inp.pressed;
  if (pr.has('pause')) {
    if (G.building.mode) G.building.stopMode();
    else if (G.panels.isOpen) G.panels.close();
    else pauseGame();
    return;
  }
  if (pr.has('inv')) G.panels.toggle('inv');
  if (pr.has('health')) G.panels.toggle('health');
  if (pr.has('craft')) G.panels.toggle('craft');
  if (pr.has('build')) G.building.mode ? G.building.stopMode() : G.panels.toggle('build');
  if (pr.has('map')) G.panels.toggle('map');
  if (pr.has('skills')) G.panels.toggle('skills');
  if (G.panels.isOpen) return;
  if (pr.has('crouch') && !G.player.anim) G.player.crouch = !G.player.crouch;
  if (pr.has('flash')) G.use.quickLight();
  for (let k = 0; k < 4; k++) if (pr.has('hot' + (k + 1))) hotbar(k);
  if (pr.has('drop')) G.interact.dropBulky();
  if (pr.has('rest')) {
    if (G.body.fatigue > 80 && !G.sleep.active) G.sleep.start(null);
    else G.sleep.toggleWait();
  }
  if (pr.has('rotate')) G.building.rotate();
  if (G.building.mode && pr.has('attack')) {
    pr.delete('attack');
    G.building.confirm();
  }
}

function hotbar(k) {
  const u = G.inv.hot[k];
  if (!u) return G.hud.toast('Tasto rapido ' + (k + 1) + ' vuoto: assegnalo dallo zaino.');
  const e = G.inv.find(u);
  if (!e) return;
  const d = ITEMS[e.it.id];
  if (G.inv.hand === e.it) return G.use.unequip(e.it);
  if (d.light) return G.use.toggleLight(e.it, !e.it.on);
  if (d.food || d.med) {
    const a = G.use.actions(e.it).find((x) => x.ok);
    if (a) a.run();
    return;
  }
  G.use.equip(e.it);
}

function update(dt, inp) {
  const sleeping = G.sleep.active;
  const canAct = G.ui.canAct();
  const pin = canAct && !sleeping ? inp : { move: { x: 0, y: 0 }, look: G.panels.isOpen ? { x: 0, y: 0 } : inp.look, run: false, pressed: new Set(), wheel: 0 };
  if (!sleeping) {
    G.actions.update(dt, pin);
    G.player.update(dt, pin);
    G.combat.update(dt, canAct ? inp : pin);
    G.interact.update(dt, canAct ? inp : pin);
    if (G.building.mode) G.building.updateGhost();
  }
  // simulazione (più veloce mentre dormi o aspetti)
  const speed = G.sleep.speed();
  const dayLen = worldValue(G.settings, 'dayLength');
  const minPerSec = 1440 / (dayLen * 60);
  let rem = dt * speed;
  const step = speed > 1 ? 0.25 : 0.1;
  let guard = 0;
  while (rem > 1e-6 && guard++ < 12) {
    const h = Math.min(rem, step);
    rem -= h;
    simStep(h, minPerSec);
    if (G.state !== 'playing') return;
  }
  visuals(dt, false);
  // salvataggio automatico ogni 2 ore di gioco
  if (G.clock.min - G.save.lastSave > 120 && !sleeping) G.save.save('auto');
}

function simStep(h, minPerSec) {
  G.time += h;
  const gm = h * minPerSec;
  const wasNight = G.clock.isNight();
  G.clock.min += gm;
  const hours = gm / 60;
  G.zombies.update(h);
  G.noise.update(h);
  G.body.update(h, hours);
  G.mind.update(h, hours);
  G.skills.update(hours);
  G.weather.update(h, hours);
  G.decay.update(hours);
  G.base.update(h, hours);
  G.sleep.update(h);
  for (const c of G.world.corpses) if (c.burnT > 0) c.burnT -= h;
  checkHordes();
  if (!wasNight && G.clock.isNight()) tip('night');
  // cadaveri vecchi vicino a dove vivi: aria malsana
  G.miasmaT = (G.miasmaT || 0) - h;
  if (G.miasmaT <= 0) {
    G.miasmaT = 30;
    const p = G.player;
    const old = G.world.corpses.filter((c) => !c.burned && G.clock.min - c.t > 1440 && Math.hypot(c.x - p.x, c.z - p.z) < 10).length;
    if (old >= 4 && Math.random() < 0.06) {
      G.body.poison = Math.max(G.body.poison, 0.55);
      G.hud.say('Quest\'aria mi fa star male. I corpi vanno bruciati o portati via.', 'miasma', 300);
    }
  }
}

function visuals(dt, frozen) {
  const p = G.player;
  // camera
  const bob = p.moving && !frozen ? Math.sin(p.bobT) * (p.running ? 0.05 : 0.028) * (G.body.legFactor().limp ? 1.8 : 1) : 0;
  const limpDip = G.body.legFactor().limp && p.moving ? Math.max(0, Math.sin(p.bobT * 0.5)) * 0.05 : 0;
  const shake = p.shake;
  const tremor = (G.mind.panic > 50 ? (G.mind.panic - 50) / 50 : 0) * 0.004 + G.body.shiver() * 0.004;
  camera.position.set(p.x, p.y + p.eye + bob - limpDip, p.z);
  camera.rotation.y = p.yaw + (Math.random() - 0.5) * (shake * 0.04 + tremor);
  camera.rotation.x = p.pitch + (Math.random() - 0.5) * (shake * 0.04 + tremor);
  camera.rotation.z = p.moving ? Math.sin(p.bobT * 0.5) * 0.004 : 0;
  const fovT = G.prefs.fov + (p.running ? 4 : 0);
  if (Math.abs(camera.fov - fovT) > 0.05) {
    camera.fov = damp(camera.fov, fovT, 6, dt);
    camera.updateProjectionMatrix();
  }
  // luce della torcia
  const li = G.inv.light();
  let fl = 0;
  if (li && ITEMS[li.id].light.kind === 'flash') fl = (li.bat > 0.15 ? 55 : 30 + Math.random() * 20) * (G.inv.off === li || G.inv.hand === li ? 1 : 0);
  G.sky.flash.intensity = fl;
  const i = Math.floor(p.x), j = Math.floor(p.z);
  const ind = G.grid.inb(i, j) && G.grid.roofed(p.L, i, j) ? 1 : 0;
  indoorF = G.debugInstant ? ind : damp(indoorF, ind, 3, dt);
  G.sky.update(dt, G.clock, G.weather, camera.position, indoorF, G.quality.viewDist);
  G.staticWorld.setDark(G.sky.state.daylight < 0.42);
  G.weather.updateParticles(dt, camera.position);
  G.dyn.update(dt, camera.position, Math.min(G.quality.viewDist, G.sky.state.fogFar + 10));
  G.zmesh.update(dt, G.time);
  G.fx.update(dt);
  G.fx.assignLights(G.sky.points);
  G.viewmodel.update(dt);
  G.audio.update(dt);
  if (!frozen) {
    G.hud.update(dt);
    G.touch.update();
    G.panels.update(dt);
    if (G.building.mode) {
      const gh = G.building.ghost;
      G.hud.buildBar(`<b>${G.building.mode ? (G.building.ghost && G.building.ghost.ok ? 'Pronto' : 'Non qui') : ''}</b> ${gh && !gh.ok ? gh.why : ''} <span>${IS_TOUCH ? '' : 'Clic: costruisci · R: ruota · Esc: esci'}</span>`);
    } else G.hud.buildBar(null);
    exploreT -= dt;
    if (exploreT <= 0) {
      exploreT = 0.5;
      markExplored();
    }
  }
}

function markExplored() {
  const g = G.grid, p = G.player;
  const r = 13;
  const pi = Math.floor(p.x), pj = Math.floor(p.z);
  for (let j = pj - r; j <= pj + r; j++)
    for (let i = pi - r; i <= pi + r; i++) {
      if (!g.inb(i, j)) continue;
      if ((i - pi) ** 2 + (j - pj) ** 2 > r * r) continue;
      G.explored[g.idx(i, j)] = 1;
    }
}

// aggancio per i test automatici: fa avanzare la simulazione senza disegnare
G.debugStep = (frames, dt = 1 / 30, o = {}) => {
  for (let k = 0; k < frames && G.state === 'playing'; k++) {
    const inp = { move: o.move || { x: 0, y: 0 }, look: o.look || { x: 0, y: 0 }, run: !!o.run, attackHeld: false, pressed: new Set(k === 0 ? o.press || [] : []), wheel: 0 };
    globalKeys(inp);
    if (G.state === 'playing') update(dt, inp);
  }
};

// ---------------------------------------------------------------- camera del menu
let menuT = 0;
function placeMenuCamera() {
  menuT = 0;
  G.clock.min = 19.2 * 60;
}
function menuCamera(dt) {
  if (!G.world) return;
  menuT += dt;
  const a = menuT * 0.035;
  const cx = 72, cz = 76;
  camera.position.set(cx + Math.cos(a) * 34, 15 + Math.sin(menuT * 0.1) * 1.5, cz + Math.sin(a) * 34);
  camera.lookAt(cx, 2, cz);
  G.clock.min = 19.1 * 60 + Math.sin(menuT * 0.02) * 15;
  G.sky.update(dt, G.clock, G.weather || { cloud: 0.3, rain: 0, fog: 0 }, camera.position, 0, G.quality.viewDist);
  G.staticWorld.setDark(G.sky.state.daylight < 0.42);
  G.dyn.update(dt, camera.position, 80);
  G.zombies.rebuildHash();
  G.zmesh.update(dt, menuT);
  G.sky.flash.intensity = 0;
}

function render() {
  renderer.clear();
  renderer.render(scene, camera);
  if (G.state === 'playing' || G.state === 'paused') G.viewmodel.render(renderer, camera.aspect, camera.fov);
}

// avvio compatibile con gli aggiornamenti del visualizzatore
function start(data) {
  boot();
  if (data && data.save) {
    setTimeout(() => hooks.continueGame(data.save), 120);
  }
}
try {
  if (window.claude && window.claude.hot && window.claude.hot.ready) window.claude.hot.ready(start);
  else start((window.claude && window.claude.hot && window.claude.hot.data) || {});
} catch (e) {
  console.error(e);
  start({});
}

export { G, Z, FURN, LEVEL_H, mkItem };
