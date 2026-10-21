// Costanti globali, impostazioni del mondo (configurabili a inizio partita) e preset grafici.
import { IS_TOUCH } from './core/util.js';

export const MAP_W = 144;
export const MAP_H = 144;
export const LEVEL_H = 3.0; // altezza di un piano
export const SAVE_KEY = 'montesordo_save_v1';
export const PREFS_KEY = 'montesordo_prefs_v1';

// Opzioni del mondo come le descrive il GDD (numero di zombie, decadimento, corrente/acqua,
// orde migranti, durata del giorno) + contagio, che chiude il punto aperto sul morso.
export const WORLD_OPTIONS = {
  population: {
    label: 'Popolazione zombie',
    choices: [
      ['low', 'Bassa', 70],
      ['normal', 'Normale', 120],
      ['high', 'Alta', 180],
      ['apoc', 'Apocalisse', 250],
    ],
    def: 'normal',
  },
  dayLength: {
    label: 'Durata del giorno',
    choices: [
      ['15', '15 minuti', 15],
      ['30', '30 minuti', 30],
      ['45', '45 minuti', 45],
      ['60', '1 ora', 60],
      ['90', '1 ora e mezza', 90],
    ],
    def: '30',
  },
  powerDay: {
    label: 'Salta la corrente',
    choices: [
      ['3', 'Dopo 3 giorni', 3],
      ['7', 'Dopo 7 giorni', 7],
      ['14', 'Dopo 14 giorni', 14],
      ['30', 'Dopo 30 giorni', 30],
    ],
    def: '7',
  },
  waterDelay: {
    label: "Si ferma l'acqua",
    choices: [
      ['2', '2 giorni dopo la corrente', 2],
      ['4', '4 giorni dopo la corrente', 4],
      ['8', '8 giorni dopo la corrente', 8],
    ],
    def: '4',
  },
  decay: {
    label: 'Velocità del decadimento',
    choices: [
      ['slow', 'Lenta', 0.5],
      ['normal', 'Normale', 1],
      ['fast', 'Veloce', 2],
    ],
    def: 'normal',
  },
  hordes: {
    label: 'Orde migranti',
    choices: [
      ['off', 'Mai', 0],
      ['rare', 'Rare (ogni 7 giorni)', 7],
      ['normal', 'Normali (ogni 4 giorni)', 4],
      ['often', 'Frequenti (ogni 2 giorni)', 2],
    ],
    def: 'normal',
  },
  infection: {
    label: 'Contagio da ferite',
    choices: [
      ['real', 'Realistico', 1],
      ['low', 'Ridotto', 0.4],
      ['off', 'Assente', 0],
    ],
    def: 'real',
  },
};

export function defaultWorldSettings() {
  const s = {};
  for (const k in WORLD_OPTIONS) s[k] = WORLD_OPTIONS[k].def;
  s.seed = Math.floor(Math.random() * 1e9);
  return s;
}

export function worldValue(settings, key) {
  const opt = WORLD_OPTIONS[key];
  const id = settings[key] ?? opt.def;
  const c = opt.choices.find((x) => x[0] === id) || opt.choices.find((x) => x[0] === opt.def);
  return c[2];
}

export const QUALITY = {
  low: { label: 'Bassa', pixelRatio: 0.85, shadows: false, shadowSize: 0, rain: 450, zombieMeshes: 22, viewDist: 70, grass: 600, aniso: 1, interiorDark: 0.55 },
  medium: { label: 'Media', pixelRatio: 1.25, shadows: true, shadowSize: 1024, rain: 900, zombieMeshes: 34, viewDist: 90, grass: 1400, aniso: 2, interiorDark: 0.8 },
  high: { label: 'Alta', pixelRatio: 2, shadows: true, shadowSize: 2048, rain: 1600, zombieMeshes: 48, viewDist: 110, grass: 2600, aniso: 4, interiorDark: 0.8 },
};

function guessQuality() {
  if (!IS_TOUCH) return 'high';
  const mem = navigator.deviceMemory || 4;
  const cores = navigator.hardwareConcurrency || 4;
  if (mem <= 3 || cores <= 4) return 'low';
  return 'medium';
}

export function defaultPrefs() {
  return {
    quality: guessQuality(),
    sensitivity: 1,
    touchSensitivity: 1,
    invertY: false,
    fov: 72,
    volume: 0.8,
    sfx: 1,
    ambience: 0.8,
    noiseRings: true,
    hints: true,
    leftHanded: false,
  };
}
