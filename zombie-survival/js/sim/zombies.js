// Zombie: lenti e stupidi da soli, letali in gruppo. Vista corta, udito fortissimo.
// Macchina a stati semplice (fermo, vaga, sente, insegue, attacca, sfonda, scavalca, a terra),
// gruppi che si muovono insieme e orde migranti annunciate da segnali.
import { clamp, angDiff, dist2 } from '../core/util.js';
import { RNG, hashSeed } from '../core/rng.js';
import { LEVEL_H, worldValue } from '../config.js';
import { F, ST, E } from '../world/grid.js';
import { zombieAction, damageEdge, edgeCenter } from './structures.js';
import { NOISE } from './noise.js';
import { zombieLoot } from './items.js';

export const Z = { IDLE: 0, WANDER: 1, INVEST: 2, CHASE: 3, ATTACK: 4, BASH: 5, CLIMB: 6, DOWN: 7, DEAD: 8 };
const ZR = 0.3; // raggio
const HASH = 4;

export class Zombies {
  constructor(G) {
    this.G = G;
    this.list = [];
    this.nextId = 1;
    this.groups = new Map();
    this.nextGroup = 1;
    this.rng = new RNG(Date.now() & 0xffffffff);
    this.hashW = 0;
    this.cells = [];
    this.hordes = [];
    this.sightR = 14;
    this.frame = 0;
    this.attackersRecent = [];
  }

  reset() {
    this.list = [];
    this.groups.clear();
    this.hordes = [];
    this.nextId = 1;
    this.nextGroup = 1;
  }

  // ---------------------------------------------------------------- creazione
  spawn(x, z, L, o = {}) {
    const r = this.rng;
    const zb = {
      id: this.nextId++, x, z, L, y: L * LEVEL_H, yaw: r.range(0, Math.PI * 2), vx: 0, vz: 0,
      spd: r.range(0.85, 1.15), state: Z.IDLE, tx: x, tz: z, tL: L, timer: r.range(1, 6),
      aware: 0, lastSeen: null, seeT: r.range(0, 0.3),
      hp: { head: 1, torso: 2.6, armL: 0.9, armR: 0.9, legL: 1.1, legR: 1.1 },
      lost: { armL: false, armR: false, legL: false, legR: false }, crawler: false,
      atkT: 0, atkCd: 0, bash: null, bashT: 0, climb: null, downT: 0, groanT: r.range(4, 14), stagger: 0,
      grp: o.grp || 0, variant: o.variant ?? r.int(0, 7), special: o.special || null, items: o.items || null,
      far: false, farT: r.range(0, 0.5), migrate: o.migrate || null, look: r.range(-1, 1),
      phase: r.range(0, 10), hitT: 0, lunge: 0,
    };
    this.list.push(zb);
    if (zb.grp) {
      const g = this.groups.get(zb.grp);
      if (g) g.members.push(zb.id);
    }
    return zb;
  }

  group(kind, x, z) {
    const g = { id: this.nextGroup++, kind, members: [], tx: x, tz: z, tL: 0, wanderT: this.rng.range(20, 80), path: null, pi: 0 };
    this.groups.set(g.id, g);
    return g;
  }

  init(W) {
    this.reset();
    const byGroup = new Map();
    for (const s of W.zombieSpawns) {
      let gid = 0;
      if (s.group !== undefined) {
        if (!byGroup.has(s.group)) byGroup.set(s.group, this.group('pack', s.x, s.z).id);
        gid = byGroup.get(s.group);
      }
      this.spawn(s.x, s.z, s.L, { grp: gid });
    }
    this.rebuildHash();
  }

  alive() {
    return this.list.length;
  }

  // ---------------------------------------------------------------- hash spaziale
  rebuildHash() {
    const g = this.G.grid;
    const W = Math.ceil(g.W / HASH), H = Math.ceil(g.H / HASH);
    if (this.hashW !== W) {
      this.hashW = W;
      this.cells = new Array(W * H);
      for (let k = 0; k < W * H; k++) this.cells[k] = [];
    }
    for (const c of this.cells) c.length = 0;
    for (const zb of this.list) {
      const cx = clamp(Math.floor(zb.x / HASH), 0, W - 1), cz = clamp(Math.floor(zb.z / HASH), 0, H - 1);
      this.cells[cz * W + cx].push(zb);
    }
  }
  query(x, z, r, fn) {
    if (!this.hashW) this.rebuildHash();
    const W = this.hashW, H = this.cells.length / W;
    const x0 = clamp(Math.floor((x - r) / HASH), 0, W - 1), x1 = clamp(Math.floor((x + r) / HASH), 0, W - 1);
    const z0 = clamp(Math.floor((z - r) / HASH), 0, H - 1), z1 = clamp(Math.floor((z + r) / HASH), 0, H - 1);
    const r2 = r * r;
    for (let cz = z0; cz <= z1; cz++)
      for (let cx = x0; cx <= x1; cx++) {
        for (const zb of this.cells[cz * W + cx]) {
          const dx = zb.x - x, dz = zb.z - z;
          if (dx * dx + dz * dz <= r2) fn(zb, dx * dx + dz * dz);
        }
      }
  }
  nearCount(x, z, r) {
    let n = 0;
    this.query(x, z, r, (zb) => {
      if (zb.state !== Z.DEAD) n++;
    });
    return n;
  }

  // ---------------------------------------------------------------- udito
  hear(x, z, L, r, o = {}) {
    const G = this.G;
    const g = G.grid;
    const srcIn = g.indoor(L, Math.floor(x), Math.floor(z));
    const srcB = g.inb(Math.floor(x), Math.floor(z)) ? g.bld[g.idx(Math.floor(x), Math.floor(z))] : -1;
    this.query(x, z, r, (zb, d2) => {
      if (zb.state === Z.DEAD || zb.state === Z.CLIMB) return;
      if (o.zid === zb.id) return;
      const zi = Math.floor(zb.x), zj = Math.floor(zb.z);
      const zIn = g.indoor(zb.L, zi, zj);
      const zB = g.inb(zi, zj) ? g.bld[g.idx(zi, zj)] : -1;
      let eff = r;
      if (srcIn !== zIn || (srcIn && srcB !== zB)) eff *= 0.65;
      if (d2 > eff * eff) return;
      if (zb.state === Z.CHASE && zb.lastSeen && G.time - zb.lastSeen.t < 2) return;
      if (zb.state === Z.ATTACK) return;
      if (zb.state === Z.BASH && o.src !== 'player') return;
      const d = Math.sqrt(d2);
      const err = d * 0.14;
      zb.tx = x + this.rng.range(-err, err);
      zb.tz = z + this.rng.range(-err, err);
      zb.tL = L;
      zb.tnode = G.paths.nodeOf(x, L * LEVEL_H + 0.1, z);
      if (zb.state !== Z.CHASE || o.src === 'player') {
        if (zb.state === Z.BASH) zb.bash = null;
        zb.state = Z.INVEST;
        zb.timer = 30;
      }
      zb.aware = Math.max(zb.aware, 0.35);
      if (o.src === 'player' && d < r * 0.35) zb.aware = Math.min(0.95, zb.aware + 0.25);
      if (zb.migrate) zb.migrate = null;
    });
  }

  // ---------------------------------------------------------------- vista
  updateSightRange() {
    const G = this.G;
    const day = G.sky.state.daylight;
    let R = 6 + 10 * day;
    const w = G.weather;
    if (w) {
      R *= 1 - w.fog * 0.55;
      R *= 1 - w.rain * 0.2;
    }
    this.sightR = R;
    // luce visibile da lontano di notte
    const light = G.inv.light();
    this.lightR = light && day < 0.5 ? (ITEM_LIGHT_R[light.id] || 26) * (1 - (w ? w.fog * 0.5 : 0)) : 0;
  }

  sight(zb, dtc) {
    const G = this.G, p = G.player, g = G.grid;
    if (G.state === 'dead') return;
    const dx = p.x - zb.x, dz = p.z - zb.z;
    const d = Math.hypot(dx, dz);
    let R = this.sightR;
    if (p.crouch) R *= 0.6;
    const pk = g.idx(clamp(Math.floor(p.x), 0, g.W - 1), clamp(Math.floor(p.z), 0, g.H - 1));
    if (G.world.bushAt && G.world.bushAt.has(pk) && p.L === 0) R *= 0.45;
    if (G.sleeping) R *= 0.5;
    if (p.moving && p.running) R *= 1.15;
    let lit = false;
    if (this.lightR > 0 && d < this.lightR) {
      R = Math.max(R, this.lightR);
      lit = true;
    }
    if (d > R + 0.5) {
      zb.aware = Math.max(0, zb.aware - 0.08 * dtc);
      return;
    }
    // campo visivo (la luce si vede da ogni direzione)
    const ang = Math.abs(angDiff(zb.yaw, Math.atan2(dx, dz)));
    if (ang > 1.15 && d > 1.8 && !lit) {
      zb.aware = Math.max(0, zb.aware - 0.05 * dtc);
      return;
    }
    const zl = zb.y > 1.5 ? 1 : 0;
    let vis;
    if (zl === p.L) vis = g.los(zl, zb.x, zb.z, p.x, p.z);
    else vis = !g.roofed(zl, Math.floor(zb.x), Math.floor(zb.z)) && !g.roofed(p.L, Math.floor(p.x), Math.floor(p.z)) && d < R * 0.8;
    if (!vis) {
      zb.aware = Math.max(0, zb.aware - 0.06 * dtc);
      return;
    }
    const stealth = G.skills ? G.skills.level('stealth') : 0;
    const rate = (0.25 + 1.7 * (1 - d / R)) * (1 - stealth * 0.05) * (G.clock.isNight() ? 1.1 : 1);
    zb.aware += rate * dtc;
    zb.lastSeen = { x: p.x, z: p.z, L: p.L, y: p.y, t: G.time };
    if (zb.aware >= 1) this.startChase(zb);
  }

  startChase(zb) {
    const G = this.G;
    const was = zb.state;
    zb.aware = 1.2;
    if (was === Z.CHASE || was === Z.ATTACK) return;
    if (was === Z.BASH) zb.bash = null;
    zb.state = Z.CHASE;
    zb.timer = 0;
    zb.migrate = null;
    G.audio.zombieVoice(zb, 'alert');
    G.noise.emit(zb.x, zb.z, NOISE.groan, { L: zb.L, src: 'zombie', zid: zb.id, kind: 'groan' });
    G.events.emit('spotted', zb);
  }

  // ---------------------------------------------------------------- aggiornamento
  update(dt) {
    const G = this.G;
    this.frame++;
    this.rebuildHash();
    this.updateSightRange();
    const p = G.player;
    this.night = G.clock.isNight();
    this.playerNode = G.paths.nodeOf(p.x, p.y, p.z);
    this.updateGroups(dt);
    this.updateHordes(dt);
    this.attackersRecent = this.attackersRecent.filter((a) => G.time - a.t < 2.5);
    for (let k = 0; k < this.list.length; k++) {
      const zb = this.list[k];
      const d2 = dist2(zb.x, zb.z, p.x, p.z);
      zb.far = d2 > 75 * 75 && zb.state !== Z.CHASE;
      if (zb.far) {
        zb.farT -= dt;
        if (zb.farT > 0) continue;
        const step = 0.5;
        zb.farT = step + this.rng.range(0, 0.15);
        this.think(zb, step, true);
      } else this.think(zb, dt, false);
    }
    this.separate();
    // morti e zombie usciti dalla mappa
    this.list = this.list.filter((zb) => !zb.removed);
  }

  separate() {
    for (const zb of this.list) {
      if (zb.far || zb.state === Z.DEAD || zb.state === Z.CLIMB) continue;
      this.query(zb.x, zb.z, 0.62, (o, d2) => {
        if (o === zb || o.state === Z.CLIMB || o.L !== zb.L || d2 < 1e-6) return;
        const d = Math.sqrt(d2);
        const push = (0.62 - d) * 0.25;
        const nx = (zb.x - o.x) / d, nz = (zb.z - o.z) / d;
        zb.x += nx * push;
        zb.z += nz * push;
      });
    }
  }

  speedOf(zb) {
    let s;
    switch (zb.state) {
      case Z.WANDER: s = zb.migrate ? 0.62 : 0.42; break;
      case Z.INVEST: s = 0.75; break;
      case Z.CHASE: s = 1.05; break;
      default: s = 0.5;
    }
    if (this.night) s *= 1.15;
    if (zb.crawler) s = 0.3;
    else {
      if (zb.hp.legL < 0.4 || zb.hp.legR < 0.4) s *= 0.8;
    }
    return s * zb.spd;
  }

  think(zb, dt, coarse) {
    const G = this.G, p = G.player;
    if (zb.stagger > 0) {
      zb.stagger -= dt;
      this.followGround(zb);
      return;
    }
    if (zb.hitT > 0) zb.hitT -= dt;
    switch (zb.state) {
      case Z.DOWN:
        zb.downT -= dt;
        if (zb.downT <= 0) {
          zb.state = zb.aware >= 1 ? Z.CHASE : Z.INVEST;
          zb.timer = 10;
        }
        return;
      case Z.CLIMB:
        this.doClimb(zb, dt);
        return;
      case Z.DEAD:
        return;
    }
    if (!coarse) {
      zb.seeT -= dt;
      if (zb.seeT <= 0) {
        const iv = 0.22 + this.rng.range(0, 0.08);
        zb.seeT = iv;
        if (dist2(zb.x, zb.z, p.x, p.z) < 40 * 40) this.sight(zb, iv);
      }
      zb.groanT -= dt;
      if (zb.groanT <= 0) {
        zb.groanT = zb.state === Z.CHASE ? this.rng.range(5, 10) : this.rng.range(8, 25);
        G.audio.zombieVoice(zb, zb.state === Z.CHASE ? 'chase' : 'idle');
        if (zb.state === Z.CHASE) G.noise.emit(zb.x, zb.z, NOISE.chaseGroan, { L: zb.L, src: 'zombie', zid: zb.id, kind: 'groan' });
      }
    }
    if (zb.atkCd > 0) zb.atkCd -= dt;
    switch (zb.state) {
      case Z.IDLE: {
        zb.timer -= dt;
        zb.yaw += Math.sin(G.time * 0.3 + zb.id) * dt * 0.15;
        if (zb.timer <= 0) {
          zb.timer = this.rng.range(6, 20) * (this.night ? 0.6 : 1);
          const grp = zb.grp && this.groups.get(zb.grp);
          if (grp) {
            this.groupSlot(zb, grp);
            zb.state = Z.WANDER;
          } else if (this.rng.chance(this.night ? 0.6 : 0.35)) {
            const t = this.randomNear(zb, 7);
            if (t) {
              zb.tx = t.x;
              zb.tz = t.z;
              zb.tL = zb.L;
              zb.state = Z.WANDER;
            }
          }
        }
        this.followGround(zb);
        break;
      }
      case Z.WANDER: {
        let fieldNode;
        if (zb.migrate) {
          const h = zb.migrate;
          zb.tx = h.tx + zb.mox;
          zb.tz = h.tz + zb.moz;
          zb.tL = 0;
          fieldNode = G.paths.nodeOf(h.tx, 0, h.tz);
        }
        const arrived = this.moveTo(zb, zb.tx, zb.tz, zb.tL, this.speedOf(zb), dt, 300, false, fieldNode);
        zb.timer -= dt;
        if (arrived || zb.timer < -40) {
          if (!zb.migrate) {
            zb.state = Z.IDLE;
            zb.timer = this.rng.range(5, 18);
          }
        }
        break;
      }
      case Z.INVEST: {
        const arrived = this.moveTo(zb, zb.tx, zb.tz, zb.tL, this.speedOf(zb), dt, 450, false, zb.tnode);
        zb.timer -= dt;
        if (arrived) {
          // si guarda intorno, poi rinuncia
          zb.yaw += Math.sin(G.time * 1.3 + zb.id) * dt * 0.8;
          if (zb.timer > 6) zb.timer = 6;
        }
        if (zb.timer <= 0) {
          zb.state = Z.IDLE;
          zb.timer = this.rng.range(4, 12);
          zb.aware = Math.min(zb.aware, 0.4);
        }
        break;
      }
      case Z.CHASE: {
        const seen = zb.lastSeen && G.time - zb.lastSeen.t < 0.7;
        const tx = seen ? p.x : zb.lastSeen ? zb.lastSeen.x : zb.tx;
        const tz = seen ? p.z : zb.lastSeen ? zb.lastSeen.z : zb.tz;
        const tL = seen ? p.L : zb.lastSeen ? zb.lastSeen.L : zb.tL;
        const d = Math.hypot(p.x - zb.x, p.z - zb.z);
        const sameL = Math.abs(p.y - zb.y) < 1.1;
        if (sameL && d < 0.95 && zb.atkCd <= 0 && G.state === 'playing' && !p.anim && G.grid.walkLine(zb.L, zb.x, zb.z, p.x, p.z)) {
          zb.state = Z.ATTACK;
          zb.atkT = 0;
          zb.atkHit = false;
          zb.atkDur = 0.8 / zb.spd;
          break;
        }
        const arrived = this.moveTo(zb, tx, tz, tL, this.speedOf(zb), dt, 700, seen);
        if (!seen) {
          zb.timer += dt;
          if (arrived || zb.timer > 18) {
            // l'ha perso: cerca intorno
            zb.state = Z.INVEST;
            zb.tx = tx;
            zb.tz = tz;
            zb.tL = tL;
            zb.tnode = null;
            zb.timer = 12;
            zb.aware = 0.6;
          }
        } else zb.timer = 0;
        break;
      }
      case Z.ATTACK: {
        zb.atkT += dt;
        const dx = p.x - zb.x, dz = p.z - zb.z;
        zb.yaw += angDiff(zb.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
        zb.lunge = Math.sin(clamp(zb.atkT / zb.atkDur, 0, 1) * Math.PI);
        if (!zb.atkHit && zb.atkT >= zb.atkDur * 0.7) {
          zb.atkHit = true;
          const d = Math.hypot(dx, dz);
          const facing = Math.abs(angDiff(zb.yaw, Math.atan2(dx, dz))) < 1.2;
          if (d < 1.25 && facing && Math.abs(p.y - zb.y) < 1.1 && G.state === 'playing') {
            this.attackersRecent.push({ id: zb.id, t: G.time });
            G.body.zombieHit(zb, new Set(this.attackersRecent.map((a) => a.id)).size);
          } else G.audio.zombieVoice(zb, 'miss');
        }
        if (zb.atkT >= zb.atkDur) {
          zb.state = Z.CHASE;
          zb.atkCd = 0.5 + this.rng.range(0, 0.4);
          zb.lunge = 0;
        }
        this.followGround(zb);
        break;
      }
      case Z.BASH: {
        if (zb.bash && zb.bash.fid !== undefined) {
          const f = G.world.furn[zb.bash.fid];
          if (!f || f.removed || f.carried) {
            zb.state = zb.aware >= 1 ? Z.CHASE : Z.INVEST;
            zb.bash = null;
            zb.timer = 20;
            break;
          }
          zb.yaw += angDiff(zb.yaw, Math.atan2(f.x - zb.x, f.z - zb.z)) * Math.min(1, dt * 6);
          zb.bashT -= dt;
          zb.lunge = Math.max(0, zb.lunge - dt * 3);
          if (zb.bashT <= 0) {
            zb.bashT = (1.25 + this.rng.range(-0.2, 0.3)) / zb.spd;
            zb.lunge = 1;
            G.building.damageFurn(f, 3 * (zb.crawler ? 0.4 : 1));
            G.noise.emit(f.x, f.z, NOISE.bash, { L: f.L, src: 'zombie', zid: zb.id, kind: 'bash' });
          }
          this.followGround(zb);
          break;
        }
        const e = zb.bash && G.grid.edges.get(zb.bash.id);
        if (!e || !zombieAction(G.grid, e)) {
          zb.state = zb.aware >= 1 ? Z.CHASE : Z.INVEST;
          zb.bash = null;
          zb.timer = 20;
          break;
        }
        const act = zombieAction(G.grid, e);
        const c = edgeCenter(e);
        zb.yaw += angDiff(zb.yaw, Math.atan2(c.x - zb.x, c.z - zb.z)) * Math.min(1, dt * 6);
        if (act === 'climb') {
          this.startClimb(zb, e);
          break;
        }
        zb.bashT -= dt;
        zb.lunge = Math.max(0, zb.lunge - dt * 3);
        if (zb.bashT <= 0) {
          zb.bashT = (1.25 + this.rng.range(-0.2, 0.3)) / zb.spd;
          zb.lunge = 1;
          let dmg = 3 * (zb.crawler ? 0.4 : 1) * ((zb.lost.armL ? 0.6 : 1) * (zb.lost.armR ? 0.6 : 1));
          const broke = damageEdge(G, e, dmg, 'zombie');
          if (!broke) G.noise.emit(c.x, c.z, NOISE.bash, { L: e.L, src: 'zombie', zid: zb.id, kind: 'bash' });
          G.events.emit('bash', { zb, e });
        }
        zb.bashGiveUp = (zb.bashGiveUp || 0) + dt;
        if (zb.bashGiveUp > 90 && zb.aware < 1) {
          zb.state = Z.IDLE;
          zb.bash = null;
          zb.bashGiveUp = 0;
        }
        this.followGround(zb);
        break;
      }
    }
  }

  // ---------------------------------------------------------------- movimento
  // ritorna true se è arrivato
  moveTo(zb, tx, tz, tL, speed, dt, maxCost, direct, fieldNode) {
    const G = this.G;
    const g = G.grid;
    const dx = tx - zb.x, dz = tz - zb.z;
    const d = Math.hypot(dx, dz);
    const zl = zb.y > 1.5 ? 1 : 0;
    if (d < 0.35 && zl === tL) return true;
    let wx = tx, wz = tz;
    const fromNode = G.paths.nodeOf(zb.x, zb.y, zb.z);
    const toNode = fieldNode !== undefined && fieldNode !== null ? fieldNode : tL === this.G.player.L && Math.abs(tx - this.G.player.x) < 0.01 && Math.abs(tz - this.G.player.z) < 0.01 ? this.playerNode : G.paths.nodeOf(tx, tL * LEVEL_H + 0.1, tz);
    const straight = zl === tL && fromNode !== toNode && d < 25 && g.walkLine(zl, zb.x, zb.z, tx, tz) && sideClear(g, zl, zb.x, zb.z, tx, tz);
    if (fromNode !== toNode && !straight) {
      const field = G.paths.get(toNode, maxCost);
      const nx = G.paths.next(field, fromNode);
      if (nx) {
        const c = G.paths.nodeCenter(nx.node);
        wx = c.x;
        wz = c.z;
        const bf = g.furnAt(c.L, c.i, c.j);
        if (bf && bf.barricade && g.cellBlocked(c.L, c.i, c.j) && Math.hypot(c.x - zb.x, c.z - zb.z) < 1.25) {
          zb.state = Z.BASH;
          zb.bash = { fid: bf.id };
          zb.bashT = 0.4;
          zb.bashGiveUp = 0;
          return false;
        }
        if (nx.edge) {
          const act = zombieAction(g, nx.edge);
          if (act) {
            const ec = edgeCenter(nx.edge);
            const de = Math.hypot(ec.x - zb.x, ec.z - zb.z);
            if (de < 0.75) {
              if (act === 'climb') this.startClimb(zb, nx.edge);
              else {
                zb.state = Z.BASH;
                zb.bash = { id: nx.edge.id };
                zb.bashT = 0.4;
                zb.bashGiveUp = 0;
              }
              return false;
            }
            wx = ec.x;
            wz = ec.z;
          }
        }
      } else if (zb.state === Z.INVEST || zb.state === Z.WANDER) {
        // irraggiungibile
        if (zb.state === Z.WANDER) return true;
      } else if (zb.state === Z.CHASE && tL > zl) {
        // il giocatore è in alto e non si arriva: attacca pali e scale
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const f = g.furnAt(0, Math.floor(zb.x) + di, Math.floor(zb.z) + dj);
            if (f && (f.type === 'post' || f.type === 'ladder')) {
              zb.state = Z.BASH;
              zb.bash = { fid: f.id };
              zb.bashT = 0.6;
              zb.bashGiveUp = 0;
              return false;
            }
          }
      }
    } else if (direct) {
      // cammina dritto (leggero ondeggiare)
      const wob = Math.sin(G.time * 1.7 + zb.id) * 0.25;
      wx += -dz / Math.max(d, 0.01) * wob;
      wz += dx / Math.max(d, 0.01) * wob;
    }
    const mx = wx - zb.x, mz = wz - zb.z;
    const ml = Math.hypot(mx, mz);
    if (ml > 0.01) {
      const want = Math.atan2(mx, mz);
      zb.yaw += angDiff(zb.yaw, want) * Math.min(1, dt * 5);
      const step = Math.min(speed * dt, ml);
      // si muove soprattutto nella direzione in cui guarda (passo pesante)
      const fwd = Math.max(0.25, Math.cos(angDiff(zb.yaw, want)));
      g.move(zb, (mx / ml) * step * fwd, (mz / ml) * step * fwd, ZR, zl);
      zb.phase += step * 2.4;
    }
    this.followGround(zb);
    return false;
  }

  followGround(zb) {
    const g = this.G.grid;
    const zl = zb.y > 1.5 ? 1 : 0;
    let gy = g.groundY(zl, zb.x, zb.z);
    if (gy < -1) gy = g.groundY(0, zb.x, zb.z);
    zb.y += (gy - zb.y) * 0.5;
    if (Math.abs(gy - zb.y) < 0.01) zb.y = gy;
    zb.L = zb.y > 1.5 ? 1 : 0;
  }

  startClimb(zb, e) {
    const g = this.G.grid;
    const [a, b] = g.edgeCells(e);
    const ia = Math.floor(zb.x), ja = Math.floor(zb.z);
    const to = ia === a[0] && ja === a[1] ? b : a;
    zb.state = Z.CLIMB;
    zb.climb = { e: e.id, x0: zb.x, z0: zb.z, x1: to[0] + 0.5, z1: to[1] + 0.5, t: 0, dur: (e.t === E.FENCE ? 3.2 : 2.2) / zb.spd * (zb.crawler ? 1.6 : 1) };
    const c = edgeCenter(e);
    zb.yaw = Math.atan2(c.x - zb.x, c.z - zb.z);
  }

  doClimb(zb, dt) {
    const c = zb.climb;
    c.t += dt;
    const u = clamp(c.t / c.dur, 0, 1);
    // resta incastrato a metà, poi passa
    const s = u < 0.7 ? u * 0.55 / 0.7 : 0.55 + (u - 0.7) / 0.3 * 0.45;
    zb.x = c.x0 + (c.x1 - c.x0) * s;
    zb.z = c.z0 + (c.z1 - c.z0) * s;
    if (u >= 1) {
      zb.state = zb.aware >= 1 ? Z.CHASE : Z.INVEST;
      zb.climb = null;
      zb.timer = 20;
      // i vetri rotti feriscono anche loro: niente, sono già morti
    }
    this.followGround(zb);
  }

  randomNear(zb, r) {
    const g = this.G.grid;
    for (let k = 0; k < 6; k++) {
      const x = zb.x + this.rng.range(-r, r), z = zb.z + this.rng.range(-r, r);
      const i = Math.floor(x), j = Math.floor(z);
      if (!g.inb(i, j) || !g.walkNode(zb.L, i, j) || g.cellBlocked(zb.L, i, j)) continue;
      // resta nello stesso edificio (o all'aperto)
      if (g.roomAt(zb.L, i, j) >= 0 !== g.roomAt(zb.L, Math.floor(zb.x), Math.floor(zb.z)) >= 0) continue;
      if (!g.walkLine(zb.L, zb.x, zb.z, x, z)) continue;
      return { x: i + 0.5, z: j + 0.5 };
    }
    return null;
  }

  // ---------------------------------------------------------------- gruppi
  groupSlot(zb, grp) {
    const idx = grp.members.indexOf(zb.id);
    const a = idx * 2.4, r = 0.8 + Math.sqrt(idx) * 0.9;
    zb.tx = grp.tx + Math.cos(a) * r;
    zb.tz = grp.tz + Math.sin(a) * r;
    zb.tL = grp.tL;
  }

  updateGroups(dt) {
    const g = this.G.grid;
    for (const grp of this.groups.values()) {
      if (grp.kind !== 'pack') continue;
      grp.wanderT -= dt * (this.night ? 1.8 : 1);
      if (grp.wanderT > 0) continue;
      grp.wanderT = this.rng.range(50, 140);
      // nuova meta vicina all'aperto
      for (let k = 0; k < 10; k++) {
        const x = grp.tx + this.rng.range(-22, 22), z = grp.tz + this.rng.range(-22, 22);
        const i = Math.floor(x), j = Math.floor(z);
        if (!g.inb(i, j) || g.bld[g.idx(i, j)] >= 0 || g.cellBlocked(0, i, j) || g.lv[0].floor[g.idx(i, j)] === F.FOREST) continue;
        grp.tx = i + 0.5;
        grp.tz = j + 0.5;
        break;
      }
      for (const id of grp.members) {
        const zb = this.list.find((x) => x.id === id);
        if (zb && zb.state === Z.IDLE) zb.timer = this.rng.range(0, 4);
      }
    }
  }

  // ---------------------------------------------------------------- orde migranti
  scheduleHorde(atMin, side, size) {
    this.hordes.push({ at: atMin, side, size, stage: 0, tx: 0, tz: 0, path: null, pi: 0, members: [], done: false });
  }

  updateHordes(dt) {
    const G = this.G;
    const now = G.clock.min;
    for (const h of this.hordes) {
      if (h.done) continue;
      const toGo = h.at - now; // minuti di gioco
      if (h.stage === 0 && toGo < 150) {
        h.stage = 1;
        G.events.emit('hordeSignal', { stage: 1, side: h.side, h });
      }
      if (h.stage === 1 && toGo < 70) {
        h.stage = 2;
        G.events.emit('hordeSignal', { stage: 2, side: h.side, h });
      }
      if (h.stage === 2 && toGo < 30) {
        h.stage = 3;
        // zombie isolati che si muovono tutti nella stessa direzione
        const path = this.hordePath(h.side);
        h.path = path;
        let n = 0;
        for (const zb of this.list) {
          if (n >= 8) break;
          if (zb.state !== Z.IDLE && zb.state !== Z.WANDER) continue;
          if (G.grid.bld[G.grid.idx(Math.floor(zb.x), Math.floor(zb.z))] >= 0) continue;
          if (this.rng.chance(0.25)) {
            const last = path[path.length - 1];
            zb.state = Z.INVEST;
            zb.tx = last.x + this.rng.range(-6, 6);
            zb.tz = last.z + this.rng.range(-6, 6);
            zb.tL = 0;
            zb.tnode = null;
            zb.timer = 400;
            n++;
          }
        }
        G.events.emit('hordeSignal', { stage: 3, side: h.side, h });
      }
      if (h.stage === 3 && toGo <= 0) {
        h.stage = 4;
        const start = h.path[0];
        h.tx = start.x;
        h.tz = start.z;
        h.pi = 1;
        for (let k = 0; k < h.size; k++) {
          const zb = this.spawn(start.x + this.rng.range(-4, 4), start.z + this.rng.range(-4, 4), 0, { migrate: h });
          zb.state = Z.WANDER;
          zb.mox = this.rng.range(-4.5, 4.5);
          zb.moz = this.rng.range(-4.5, 4.5);
          h.members.push(zb.id);
        }
        G.events.emit('hordeSignal', { stage: 4, side: h.side, h });
      }
      if (h.stage === 4) {
        // la testa dell'orda avanza lungo il percorso
        const wp = h.path[h.pi];
        if (!wp) {
          h.done = true;
          // chi è ancora in migrazione esce dalla mappa, una parte resta
          for (const zb of this.list) {
            if (zb.migrate !== h) continue;
            zb.migrate = null;
            if (this.rng.chance(0.6) && dist2(zb.x, zb.z, G.player.x, G.player.z) > 40 * 40) zb.removed = true;
            else {
              zb.state = Z.IDLE;
              zb.timer = this.rng.range(5, 30);
            }
          }
          G.events.emit('hordeSignal', { stage: 5, side: h.side, h });
          continue;
        }
        const dx = wp.x - h.tx, dz = wp.z - h.tz;
        const d = Math.hypot(dx, dz);
        const sp = 0.55 * (this.night ? 1.15 : 1) * dt;
        if (d < 1) h.pi++;
        else {
          h.tx += (dx / d) * sp;
          h.tz += (dz / d) * sp;
        }
      }
    }
    this.hordes = this.hordes.filter((h) => !h.done || G.clock.min - h.at < 600);
  }

  hordePath(side) {
    // dagli ingressi della valle, lungo le strade principali
    const ends = { N: { x: 70, z: 8 }, S: { x: 70, z: 136 }, W: { x: 8, z: 70 }, E: { x: 136, z: 70 } };
    const opp = { N: 'S', S: 'N', W: 'E', E: 'W' };
    const a = ends[side], b = ends[opp[side]];
    const mid1 = { x: 70 + this.rng.range(-3, 3), z: 70 + this.rng.range(-3, 3) };
    const turn = this.rng.chance(0.5);
    const path = [a, mid1];
    if (turn) {
      const sides = side === 'N' || side === 'S' ? ['W', 'E'] : ['N', 'S'];
      path.push(ends[this.rng.pick(sides)]);
    } else path.push(b);
    return path;
  }

  // ---------------------------------------------------------------- interazione col giocatore
  pushPlayer(p, dt) {
    this.query(p.x, p.z, 0.7, (zb, d2) => {
      if (zb.state === Z.DEAD || zb.state === Z.DOWN || zb.state === Z.CLIMB || Math.abs(zb.y - p.y) > 1) return;
      const d = Math.sqrt(d2) || 0.01;
      const over = 0.62 - d;
      if (over <= 0) return;
      const nx = (p.x - zb.x) / d, nz = (p.z - zb.z) / d;
      p.x += nx * over * 0.6;
      p.z += nz * over * 0.6;
      zb.x -= nx * over * 0.4;
      zb.z -= nz * over * 0.4;
    });
  }

  // un colpo del giocatore su una zona del corpo
  hit(zb, zone, dmg, o = {}) {
    const G = this.G;
    zb.hitT = 0.25;
    if (zb.state === Z.IDLE || zb.state === Z.WANDER || zb.state === Z.INVEST) {
      this.startChase(zb);
    }
    zb.aware = 1.2;
    const before = zb.hp[zone];
    zb.hp[zone] -= dmg;
    let severed = null;
    if (zone !== 'head' && zone !== 'torso' && zb.hp[zone] <= 0 && before > 0) {
      if (o.blade && this.rng.chance(o.sever || 0.3)) {
        zb.lost[zone] = true;
        severed = zone;
      }
      if (zone === 'legL' || zone === 'legR') {
        if (!zb.crawler) {
          zb.crawler = true;
          zb.state = Z.DOWN;
          zb.downT = 1.2;
        }
      }
    }
    if (zb.hp.head <= 0) {
      this.kill(zb, o);
      return { killed: true, severed };
    }
    if (zone === 'torso' && zb.hp.torso <= 0) {
      zb.hp.torso = 0.6;
      zb.state = Z.DOWN;
      zb.downT = this.rng.range(2, 4);
    }
    // atterrato?
    if (zb.state !== Z.DOWN && this.rng.chance(o.knock || 0)) {
      zb.state = Z.DOWN;
      zb.downT = this.rng.range(1.8, 3.5);
      G.audio.play('thud', zb.x, zb.y + 0.3, zb.z, 0.7);
    } else if (zb.state !== Z.DOWN) {
      zb.stagger = Math.max(zb.stagger, 0.35);
      if (zb.state === Z.ATTACK) {
        zb.state = Z.CHASE;
        zb.atkCd = 0.6;
      }
    }
    return { killed: false, severed };
  }

  shove(zb, dirX, dirZ, power) {
    const G = this.G;
    zb.aware = Math.max(zb.aware, 1);
    if (zb.state === Z.ATTACK) {
      zb.state = Z.CHASE;
      zb.atkCd = 0.8;
    }
    if (zb.state === Z.IDLE || zb.state === Z.WANDER || zb.state === Z.INVEST) this.startChase(zb);
    const g = G.grid;
    g.move(zb, dirX * 0.9 * power, dirZ * 0.9 * power, ZR, zb.y > 1.5 ? 1 : 0);
    const behind = Math.abs(angDiff(zb.yaw, Math.atan2(dirX, dirZ))) < 1.2;
    let p = 0.22 * power + (behind ? 0.3 : 0) + (zb.hp.legL < 0.5 || zb.hp.legR < 0.5 ? 0.15 : 0);
    if (zb.crawler) p = 0;
    if (this.rng.chance(p)) {
      zb.state = Z.DOWN;
      zb.downT = this.rng.range(1.5, 3);
      G.audio.play('thud', zb.x, zb.y + 0.3, zb.z, 0.6);
    } else zb.stagger = 0.9;
  }

  kill(zb, o = {}) {
    const G = this.G;
    zb.state = Z.DEAD;
    zb.removed = true;
    const rng = new RNG(hashSeed(G.settings.seed, 'zl', zb.id, G.clock.min | 0));
    const items = zb.items || zombieLoot(G, rng);
    G.world.corpses.push({ id: G.world.nextCorpse++, x: zb.x, z: zb.z, L: zb.L, y: zb.y, yaw: zb.yaw, variant: zb.variant, t: G.clock.min, items, special: zb.special, lost: { ...zb.lost }, crawler: zb.crawler });
    G.events.emit('zombieKilled', { zb, o });
    if (zb.migrate) zb.migrate.members = zb.migrate.members.filter((id) => id !== zb.id);
    G.audio.play('thud', zb.x, zb.y + 0.3, zb.z, 0.9);
  }

  // ---------------------------------------------------------------- salvataggio
  serialize() {
    return {
      next: this.nextId,
      list: this.list.filter((z) => !z.migrate).map((z) => ({
        id: z.id, x: +z.x.toFixed(2), z: +z.z.toFixed(2), L: z.L, y: +z.y.toFixed(2), yaw: +z.yaw.toFixed(2), spd: +z.spd.toFixed(2), st: z.state === Z.CHASE || z.state === Z.ATTACK ? Z.INVEST : z.state === Z.CLIMB || z.state === Z.BASH ? Z.IDLE : z.state === Z.DOWN ? Z.IDLE : z.state,
        tx: +z.tx.toFixed(1), tz: +z.tz.toFixed(1), tL: z.tL, hp: z.hp, lost: z.lost, cr: z.crawler, g: z.grp, v: z.variant, sp: z.special, items: z.items,
      })),
      groups: [...this.groups.values()].map((g) => ({ id: g.id, kind: g.kind, tx: g.tx, tz: g.tz, members: g.members })),
      nextGroup: this.nextGroup,
      hordes: this.hordes.filter((h) => !h.done && h.stage < 4).map((h) => ({ at: h.at, side: h.side, size: h.size, stage: h.stage })),
    };
  }
  load(d) {
    this.reset();
    this.nextId = d.next;
    this.nextGroup = d.nextGroup || 1;
    for (const g of d.groups || []) this.groups.set(g.id, { ...g, wanderT: this.rng.range(20, 80), tL: 0, path: null, pi: 0, members: [] });
    for (const s of d.list) {
      const zb = this.spawn(s.x, s.z, s.L, { grp: s.g, variant: s.v, special: s.sp, items: s.items });
      zb.id = s.id;
      zb.y = s.y;
      zb.yaw = s.yaw;
      zb.spd = s.spd;
      zb.state = s.st;
      zb.tx = s.tx;
      zb.tz = s.tz;
      zb.tL = s.tL;
      zb.hp = s.hp;
      zb.lost = s.lost;
      zb.crawler = s.cr;
      zb.timer = this.rng.range(2, 10);
    }
    this.nextId = Math.max(this.nextId, ...this.list.map((z) => z.id + 1), 1);
    for (const h of d.hordes || []) this.hordes.push({ ...h, stage: Math.min(h.stage, 2), path: null, pi: 0, members: [], done: false, tx: 0, tz: 0 });
  }
}

const ITEM_LIGHT_R = { flashlight: 30, lantern: 24, torch_improv: 26, candle: 10 };

// controllo laterale per non tagliare gli spigoli camminando dritti
function sideClear(g, L, x0, z0, x1, z1) {
  const dx = x1 - x0, dz = z1 - z0;
  const d = Math.hypot(dx, dz) || 1;
  const nx = (-dz / d) * 0.26, nz = (dx / d) * 0.26;
  return g.walkLine(L, x0 + nx, z0 + nz, x1 + nx, z1 + nz) && g.walkLine(L, x0 - nx, z0 - nz, x1 - nx, z1 - nz);
}

export { ST };
