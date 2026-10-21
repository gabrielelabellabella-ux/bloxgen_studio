// Sistema di rumore centrale: ogni azione chiama un unico metodo (posizione, raggio, intensità)
// e gli zombie dentro il raggio vanno verso la fonte. È la risorsa più pericolosa del gioco.

export const NOISE = {
  crouchStep: 1.4,
  walkStep: 4.5,
  runStep: 11,
  swingMiss: 2.5,
  glass: 19,
  hammer: 22,
  saw: 13,
  groan: 11,
  chaseGroan: 9,
  bash: 9,
  breathe: 4,
  cough: 10,
  generator: 30,
};

export class Noise {
  constructor(G) {
    this.G = G;
    this.playerLevel = 0; // rumore del giocatore per l'indicatore (raggio in m)
    this.playerT = 0;
    this.events = [];
    this.lastRing = 0;
  }

  // x,z posizione; r raggio; o: {L, src:'player'|'zombie'|'world', kind, ring}
  emit(x, z, r, o = {}) {
    const G = this.G;
    const L = o.L || 0;
    let rr = r;
    const w = G.weather;
    if (w) rr *= w.noiseMask();
    if (o.src === 'player') {
      if (rr > this.playerLevel) this.playerLevel = rr;
      this.playerT = 0.6;
      if (G.prefs.noiseRings && rr >= 3 && o.ring !== false && G.fx) G.fx.noiseRing(x, z, L, rr);
    }
    G.events.emit('noise', { x, z, L, r: rr, src: o.src, kind: o.kind });
    if (G.zombies) G.zombies.hear(x, z, L, rr, o);
  }

  update(dt) {
    if (this.playerT > 0) this.playerT -= dt;
    else this.playerLevel = Math.max(0, this.playerLevel - dt * 18);
  }
}
