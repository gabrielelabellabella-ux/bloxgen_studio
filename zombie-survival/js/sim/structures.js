// Danni a porte, finestre, barricate e pezzi costruiti: gli zombie li sfondano col tempo e col numero.
import { E, ST, hasBarricade } from '../world/grid.js';
import { NOISE } from './noise.js';

export function edgeCenter(e) {
  return e.o === 0 ? { x: e.i + 0.5, z: e.j } : { x: e.i, z: e.j + 0.5 };
}

// cosa deve fare uno zombie per passare da questo lato: null (passa), 'bash', 'climb'
export function zombieAction(g, e) {
  if (!e) return null;
  if (!g.blocksPlayer(e)) return null;
  if (hasBarricade(e)) return 'bash';
  switch (e.t) {
    case E.DOOR:
      return 'bash';
    case E.WINDOW:
      return e.st === ST.CLOSED ? 'bash' : 'climb';
    case E.FENCE:
      return 'climb';
    case E.WALL:
    case E.HFENCE:
      return e.built ? 'bash' : null;
    default:
      return null;
  }
}

export function damageEdge(G, e, dmg, src = 'zombie') {
  const g = G.grid;
  const c = edgeCenter(e);
  let changed = false;
  if (e.metal > 0) {
    e.metal -= dmg;
    if (e.metal <= 0) {
      e.metal = 0;
      changed = true;
      G.audio.play('metalbreak', c.x, e.L * 3 + 1.2, c.z);
      G.noise.emit(c.x, c.z, 14, { L: e.L, src: 'world', kind: 'break' });
    } else if (src === 'zombie') G.audio.play('metalhit', c.x, e.L * 3 + 1.2, c.z, 0.7);
  } else if (e.bar && e.bar.length) {
    e.bar[e.bar.length - 1] -= dmg;
    if (e.bar[e.bar.length - 1] <= 0) {
      e.bar.pop();
      changed = true;
      G.audio.play('woodbreak', c.x, e.L * 3 + 1.2, c.z);
      G.noise.emit(c.x, c.z, 12, { L: e.L, src: 'world', kind: 'break' });
      G.events.emit('barricadeHit', { e, broken: true });
    } else if (src === 'zombie') G.audio.play('bash', c.x, e.L * 3 + 1.2, c.z, 0.8);
  } else if (e.built && (e.t === E.WALL || e.t === E.HFENCE || e.t === E.FENCE || (e.t === E.WINDOW) || (e.t === E.DOOR && e.st === ST.BROKEN))) {
    e.hp -= dmg;
    if (src === 'zombie') G.audio.play(e.bmat === 'metal' ? 'metalhit' : 'bash', c.x, e.L * 3 + 1.2, c.z, 0.8);
    if (e.hp <= 0) {
      G.audio.play(e.bmat === 'metal' ? 'metalbreak' : 'woodbreak', c.x, e.L * 3 + 1.2, c.z);
      G.noise.emit(c.x, c.z, 15, { L: e.L, src: 'world', kind: 'break' });
      G.building.destroyEdge(e);
      return true;
    }
    G.events.emit('edge', e);
    return false;
  } else if (e.t === E.DOOR) {
    if (e.st === ST.CLOSED) {
      e.hp -= dmg;
      if (src === 'zombie') G.audio.play(e.mat === 'glass' ? 'glasshit' : e.mat === 'metal' ? 'metalhit' : 'bash', c.x, e.L * 3 + 1.2, c.z, 0.85);
      if (e.hp <= 0) {
        e.st = ST.BROKEN;
        changed = true;
        if (e.mat === 'glass') {
          G.audio.play('glass', c.x, e.L * 3 + 1.2, c.z);
          G.noise.emit(c.x, c.z, NOISE.glass, { L: e.L, src: 'world', kind: 'glass' });
        } else {
          G.audio.play('woodbreak', c.x, e.L * 3 + 1.2, c.z);
          G.noise.emit(c.x, c.z, 16, { L: e.L, src: 'world', kind: 'break' });
        }
      }
    }
  } else if (e.t === E.WINDOW) {
    if (e.st === ST.CLOSED) {
      e.hp -= dmg;
      if (e.hp <= 0) {
        breakWindow(G, e, src);
        return true;
      }
      G.audio.play('glasshit', c.x, e.L * 3 + 1.4, c.z, 0.8);
    }
  }
  if (changed) g.version++;
  G.events.emit('edge', e);
  return changed;
}

export function breakWindow(G, e, src) {
  const c = edgeCenter(e);
  e.st = ST.BROKEN;
  e.cleared = false;
  e.hp = 0;
  G.grid.version++;
  G.audio.play('glass', c.x, e.L * 3 + 1.4, c.z);
  G.noise.emit(c.x, c.z, NOISE.glass, { L: e.L, src: src === 'player' ? 'player' : 'world', kind: 'glass' });
  if (G.fx) G.fx.glassBurst(c.x, e.L * 3 + 1.4, c.z);
  G.events.emit('edge', e);
}
