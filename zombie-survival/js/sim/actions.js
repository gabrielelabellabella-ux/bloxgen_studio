// Azioni a tempo: bendarsi, barricare, smontare, leggere, cucinare... Ogni cura e ogni lavoro richiede tempo,
// e intanto sei vulnerabile. Muoversi o venire colpiti interrompe.

export class Actions {
  constructor(G) {
    this.G = G;
    this.current = null;
    G.events.on('wound', () => this.cancel('ferito'));
  }

  reset() {
    this.current = null;
  }

  // o: {name, dur, onDone, onTick, noise:{r, every}, sound:{name, every}, anim, repetitive, lock, hands, keepOnMove}
  start(o) {
    const G = this.G;
    if (this.current) this.cancel();
    let dur = o.dur;
    if (G.mind.morale < 25) dur *= 1.25;
    if (o.hands) dur *= 1 + G.body.handPenalty() * 0.8;
    if (G.body.pain > 60) dur *= 1.15;
    this.current = Object.assign({ t: 0, nT: 0, sT: 0 }, o, { dur });
    G.events.emit('action', this.current);
    return this.current;
  }

  cancel(reason) {
    const c = this.current;
    if (!c) return;
    this.current = null;
    if (c.onCancel) c.onCancel(reason);
    this.G.events.emit('action', null);
    if (reason && reason !== 'nuova') this.G.hud.toast(c.name + ': interrotto.');
  }

  blocksMove() {
    return !!(this.current && this.current.lock);
  }

  update(dt, inp) {
    const G = this.G;
    const c = this.current;
    if (!c) return;
    if (!c.lock && !c.keepOnMove && (Math.abs(inp.move.x) > 0.25 || Math.abs(inp.move.y) > 0.25)) {
      this.cancel('mosso');
      return;
    }
    c.t += dt;
    const p = G.player;
    if (c.noise) {
      c.nT -= dt;
      if (c.nT <= 0) {
        c.nT = c.noise.every || 0.9;
        G.noise.emit(p.x, p.z, c.noise.r, { L: p.L, src: 'player', kind: c.noise.kind || 'work' });
      }
    }
    if (c.sound) {
      c.sT -= dt;
      if (c.sT <= 0) {
        c.sT = c.sound.every || 0.6;
        G.audio.play(c.sound.name, c.sound.at ? c.sound.at.x : null, c.sound.at ? c.sound.at.y : null, c.sound.at ? c.sound.at.z : null, c.sound.vol || 1);
      }
    }
    if (c.onTick) c.onTick(dt, c.t / c.dur);
    if (c.t >= c.dur) {
      this.current = null;
      G.events.emit('action', null);
      if (c.onDone) c.onDone();
    }
  }

  progress() {
    const c = this.current;
    return c ? Math.min(1, c.t / c.dur) : 0;
  }
}
