// Giocatore in prima persona: movimento, collisioni sulla griglia, scale, cadute, passi rumorosi,
// accovacciarsi, correre, scavalcare finestre e staccionate, arrampicarsi.
import { clamp, lerp, damp, angDiff } from '../core/util.js';
import { FLOOR_INFO, E, ST } from '../world/grid.js';
import { LEVEL_H } from '../config.js';
import { NOISE } from './noise.js';

export const EYE = 1.62;
export const EYE_CROUCH = 1.06;
export const RADIUS = 0.28;

export class Player {
  constructor(G) {
    this.G = G;
    this.reset(0, 0, 0);
  }

  reset(x, z, L, yaw = 0) {
    this.x = x;
    this.z = z;
    this.L = L;
    this.y = L * LEVEL_H;
    this.yaw = yaw;
    this.pitch = 0;
    this.vx = 0;
    this.vz = 0;
    this.vy = 0;
    this.crouch = false;
    this.running = false;
    this.moving = false;
    this.speedNow = 0;
    this.eye = EYE;
    this.stepDist = 0;
    this.bobT = 0;
    this.anim = null; // scavalcare, arrampicarsi
    this.fallFrom = null;
    this.px = x;
    this.pz = z;
    this.shake = 0;
    this.hurtT = 0;
    this.sway = { x: 0, y: 0 };
    this.lastMoveT = 0;
    this.stillT = 0;
    this.busy = false;
  }

  cellL() {
    // livello per le collisioni: sulle scale dipende dall'altezza
    return this.y > 1.5 ? 1 : 0;
  }

  // limita il movimento quando trasporti oggetti ingombranti o sei ferito
  maxSpeed(wantRun) {
    const G = this.G;
    const body = G.body, inv = G.inv;
    let walk = 1.65, run = 3.7, crouch = 0.95;
    const enc = inv.encumbrance();
    const encF = [1, 0.92, 0.82, 0.68, 0.5][enc];
    let f = encF;
    const legs = body.legFactor(); // 1 sano, <1 zoppica
    f *= legs.speed;
    if (body.fatigue > 80) f *= 0.9;
    if (inv.bulky) {
      const k = inv.bulky.kind;
      f *= k === 'corpse' ? 0.45 : k === 'barrow' ? 0.85 : k === 'furn' ? 0.6 : inv.bulkyWeight() > 20 ? 0.55 : 0.8;
    }
    if (G.mind.panic > 60) f *= 1.05;
    const canRun = wantRun && !this.crouch && legs.canRun && body.stamina > 0.05 && enc < 4 && !(inv.bulky && inv.bulky.kind !== 'barrow' && inv.bulkyWeight() > 20);
    if (this.crouch) return { v: crouch * f, run: false };
    if (canRun) return { v: run * f, run: true };
    return { v: walk * f, run: false };
  }

  update(dt, inp) {
    const G = this.G;
    const g = G.grid;
    // rotazione
    if (!this.anim || this.anim.look) {
      this.yaw -= inp.look.x;
      this.pitch -= inp.look.y;
      this.pitch = clamp(this.pitch, -1.45, 1.4);
    }
    this.px = this.x;
    this.pz = this.z;
    if (this.anim) {
      this.updateAnim(dt);
      this.updateEye(dt);
      return;
    }
    const busy = G.actions.blocksMove();
    let mx = inp.move.x, my = inp.move.y;
    if (busy || G.state !== 'playing') {
      mx = 0;
      my = 0;
    }
    const want = Math.min(1, Math.hypot(mx, my));
    const { v, run } = this.maxSpeed(inp.run && my > 0.2);
    // col joystick poco inclinato si cammina piano (e in silenzio)
    const sp = v * (G.touchActive ? Math.pow(want, 1.4) : want);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let dx = 0, dz = 0;
    if (want > 0.01) {
      const l = Math.hypot(mx, my);
      const nx = mx / l, ny = my / l;
      // avanti = -z nella camera
      dx = (nx * cos - ny * sin) * sp;
      dz = (-nx * sin - ny * cos) * sp;
    }
    const acc = want > 0.01 ? 10 : 12;
    this.vx = damp(this.vx, dx, acc, dt);
    this.vz = damp(this.vz, dz, acc, dt);
    this.running = run && want > 0.3;
    const L = this.cellL();
    this.ignoreFurn = 0;
    g.move(this, this.vx * dt, this.vz * dt, RADIUS, L);
    // spinta degli zombie vicini
    G.zombies.pushPlayer(this, dt);
    const moved = Math.hypot(this.x - this.px, this.z - this.pz);
    this.speedNow = moved / Math.max(dt, 1e-4);
    this.moving = this.speedNow > 0.25;
    if (this.moving) {
      this.stillT = 0;
    } else this.stillT += dt;
    this.updateVertical(dt);
    this.updateEye(dt);
    // passi: suono e rumore
    if (this.moving && this.vy === 0) {
      this.stepDist += moved;
      const stride = this.running ? 1.05 : this.crouch ? 0.55 : 0.78;
      if (this.stepDist >= stride) {
        this.stepDist = 0;
        this.footstep();
      }
      this.bobT += moved * (this.running ? 2.6 : 3.2);
    }
  }

  footstep() {
    const G = this.G;
    const g = G.grid;
    const i = Math.floor(this.x), j = Math.floor(this.z);
    const L = this.cellL();
    let surf = 'hard';
    if (L === 0 && g.inb(i, j)) {
      const fi = FLOOR_INFO[g.lv[0].floor[g.idx(i, j)]];
      if (fi) surf = fi.step;
    } else if (L === 1 && g.inb(i, j)) {
      const fi = FLOOR_INFO[g.lv[1].floor[g.idx(i, j)]];
      if (fi) surf = fi.step;
    }
    if (g.stairAt(i, j)) surf = 'wood';
    const quiet = G.inv.footNoise();
    const enc = G.inv.encumbrance();
    let r = this.running ? NOISE.runStep : this.crouch ? NOISE.crouchStep : NOISE.walkStep;
    if (this.crouch && this.speedNow < 0.6) r *= 0.6;
    r *= quiet * (1 + enc * 0.12);
    if (surf === 'gravel') r *= 1.25;
    if (surf === 'soft' || surf === 'grass') r *= 0.85;
    if (G.inv.bulky && G.inv.bulky.kind === 'barrow') r *= 1.4;
    if (G.inv.bulky && G.inv.bulky.kind === 'corpse') r *= 1.3;
    G.audio.footstep(surf, this.running, this.crouch);
    G.noise.emit(this.x, this.z, r, { L: this.cellL(), src: 'player', kind: 'step', ring: this.running });
    G.skills && this.crouch && G.zombies.nearCount(this.x, this.z, 8) > 0 && G.skills.xp('stealth', 0.4);
  }

  updateVertical(dt) {
    const G = this.G;
    const g = G.grid;
    const L = this.cellL();
    let gy = g.groundY(L, this.x, this.z);
    if (gy < -1 && L === 1) {
      // buco nel pavimento: si cade al piano di sotto
      gy = g.groundY(0, this.x, this.z);
    }
    if (this.y > gy + 0.45 || this.vy < 0) {
      if (this.fallFrom === null) this.fallFrom = this.y;
      this.vy -= 18 * dt;
      this.y += this.vy * dt;
      if (this.y <= gy) {
        const h = this.fallFrom - gy;
        this.y = gy;
        this.vy = 0;
        this.fallFrom = null;
        if (h > 1.6) G.body.fall(h);
      }
    } else {
      // gradini e rampe: si segue il terreno
      this.y = gy > this.y ? damp(this.y, gy, 25, dt) : damp(this.y, gy, 18, dt);
      if (Math.abs(this.y - gy) < 0.005) this.y = gy;
      this.vy = 0;
      this.fallFrom = null;
    }
    this.L = this.y > 1.5 ? 1 : 0;
  }

  updateEye(dt) {
    const target = this.crouch ? EYE_CROUCH : EYE;
    this.eye = damp(this.eye, target, 10, dt);
    if (this.shake > 0) this.shake = Math.max(0, this.shake - dt * 2.5);
    if (this.hurtT > 0) this.hurtT -= dt;
  }

  // ---------------------------------------------------------------- animazioni di attraversamento
  // scavalca una finestra o una staccionata: da qui all'altra cella attraverso il lato e
  startCross(e, dur, onDone) {
    const g = this.G.grid;
    const [a, b] = g.edgeCells(e);
    const ia = Math.floor(this.x), ja = Math.floor(this.z);
    const from = ia === a[0] && ja === a[1] ? a : b;
    const to = from === a ? b : a;
    const tx = to[0] + 0.5, tz = to[1] + 0.5;
    this.anim = { kind: 'cross', t: 0, dur, x0: this.x, z0: this.z, y0: this.y, x1: tx, z1: tz, e, onDone, look: true };
    this.vx = this.vz = 0;
  }
  startClimb(toX, toZ, toL, dur, onDone) {
    this.anim = { kind: 'climb', t: 0, dur, x0: this.x, z0: this.z, y0: this.y, x1: toX, z1: toZ, y1: toL * LEVEL_H, onDone, look: true };
    this.vx = this.vz = 0;
  }
  updateAnim(dt) {
    const a = this.anim;
    a.t += dt;
    const u = clamp(a.t / a.dur, 0, 1);
    const s = u * u * (3 - 2 * u);
    this.x = lerp(a.x0, a.x1, s);
    this.z = lerp(a.z0, a.z1, s);
    if (a.kind === 'cross') {
      const gy = this.G.grid.groundY(this.y > 1.5 ? 1 : 0, this.x, this.z);
      this.y = gy + Math.sin(u * Math.PI) * 0.45;
      this.crouch = u < 0.85;
    } else {
      this.y = lerp(a.y0, a.y1, s);
    }
    if (u >= 1) {
      this.anim = null;
      this.crouch = false;
      this.L = this.y > 1.5 ? 1 : 0;
      if (a.onDone) a.onDone();
    }
  }
}

export { E, ST, angDiff };
