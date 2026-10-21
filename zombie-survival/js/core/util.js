// Piccole utility matematiche e di formattazione condivise da tutti i sistemi.

export const TAU = Math.PI * 2;
export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => clamp((v - a) / (b - a), 0, 1);
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const approach = (v, target, step) =>
  v < target ? Math.min(v + step, target) : Math.max(v - step, target);

export function angDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}

export const dist2 = (ax, az, bx, bz) => {
  const dx = bx - ax, dz = bz - az;
  return dx * dx + dz * dz;
};

export const pad2 = (n) => (n < 10 ? '0' : '') + n;

export function fmtKg(w) {
  return (Math.round(w * 10) / 10).toFixed(1).replace('.', ',') + ' kg';
}

export function fmtNum(n, d = 1) {
  return n.toFixed(d).replace('.', ',');
}

export function cap(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// rilevamento grossolano dei dispositivi touch (usato per scegliere controlli e qualità)
export const IS_TOUCH =
  typeof window !== 'undefined' &&
  (('ontouchstart' in window) || navigator.maxTouchPoints > 0) &&
  window.matchMedia && window.matchMedia('(pointer: coarse)').matches;

export function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

export function safeStorageSet(key, val) {
  try {
    window.localStorage.setItem(key, val);
    return true;
  } catch (e) {
    return false;
  }
}

export function safeStorageDel(key) {
  try {
    window.localStorage.removeItem(key);
  } catch (e) {
    /* storage non disponibile */
  }
}

let uidCounter = 1;
export function uid() {
  return uidCounter++;
}
export function bumpUid(min) {
  if (min >= uidCounter) uidCounter = min + 1;
}
export function currentUid() {
  return uidCounter;
}
