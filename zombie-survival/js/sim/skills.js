// Skill che salgono solo usandole. I manuali raddoppiano l'esperienza per un giorno,
// le riviste insegnano ricette. Morale basso = si impara più lentamente.
import { SKILLS } from '../data/recipes.js';

const THRESH = [0, 40, 120, 250, 430, 670, 970, 1340, 1780, 2300, 2900];

export class Skills {
  constructor(G) {
    this.G = G;
    this.reset();
  }
  reset() {
    this.xpv = {};
    for (const k in SKILLS) this.xpv[k] = 0;
    this.boost = {};
    this.known = new Set();
    this.read = new Set();
  }
  level(k) {
    const x = this.xpv[k] || 0;
    let l = 0;
    while (l < 10 && x >= THRESH[l + 1]) l++;
    return l;
  }
  progress(k) {
    const l = this.level(k);
    if (l >= 10) return 1;
    const x = this.xpv[k] || 0;
    return (x - THRESH[l]) / (THRESH[l + 1] - THRESH[l]);
  }
  xp(k, amount) {
    const G = this.G;
    if (!(k in this.xpv)) return;
    let a = amount;
    if (this.boost[k] > 0) a *= 2;
    if (G.mind.morale < 30) a *= 0.6;
    const before = this.level(k);
    this.xpv[k] += a;
    const after = this.level(k);
    if (after > before) {
      G.hud.toast(SKILLS[k] + ': livello ' + after, 'good');
      G.audio.play('levelup');
    }
  }
  knows(id) {
    return this.known.has(id);
  }
  update(hours) {
    for (const k in this.boost) {
      this.boost[k] -= hours;
      if (this.boost[k] <= 0) delete this.boost[k];
    }
  }
  serialize() {
    return { xp: this.xpv, boost: this.boost, known: [...this.known], read: [...this.read] };
  }
  load(o) {
    this.reset();
    Object.assign(this.xpv, o.xp || {});
    this.boost = o.boost || {};
    this.known = new Set(o.known || []);
    this.read = new Set(o.read || []);
  }
}
