// Combattimento corpo a corpo: pesante e stancante. Ogni colpo consuma stamina, le armi si consumano,
// i colpi colpiscono zone precise (testa, busto, braccia, gambe). Spinta per guadagnare spazio,
// uccisioni silenziose alle spalle, oggetti lanciati per distrarre.
import { ITEMS, QUALITY_MULT } from '../data/items.js';
import { clamp, angDiff } from '../core/util.js';
import { fx } from '../core/rng.js';
import { Z } from './zombies.js';
import { NOISE } from './noise.js';
import { LEVEL_H } from '../config.js';
import { mkItem } from './items.js';

const FISTS = { dmg: 0.16, reach: 0.85, spd: 0.42, sta: 0.05, dur: 0, type: 'blunt', knock: 0.12, noise: 3 };

export class Combat {
  constructor(G) {
    this.G = G;
    this.swing = null;
    this.shove = null;
    this.cd = 0;
    this.projectiles = [];
    this.alarms = [];
  }

  reset() {
    this.swing = null;
    this.shove = null;
    this.cd = 0;
    this.projectiles = [];
    this.alarms = [];
  }

  stats() {
    const G = this.G;
    const it = G.inv.weapon();
    const w = it ? ITEMS[it.id].wpn : FISTS;
    const q = it && it.q !== undefined ? it.q : 1;
    const body = G.body;
    const st = body.stamina;
    const staF = st < 0.25 ? 0.55 + st * 1.8 : 1;
    const melee = G.skills.level('melee');
    let dmg = w.dmg * QUALITY_MULT.eff[q] * staF * (1 + melee * 0.05);
    let spd = w.spd / Math.max(0.55, staF) * (body.fatigue > 70 ? 1.15 : 1) * (1 - melee * 0.02);
    const arm = body.armFactor();
    dmg *= arm.dmg;
    if (w.two && arm.broken) dmg *= 0.4;
    if (w.two && G.inv.off && G.inv.light()) {
      dmg *= 0.7;
      spd *= 1.2;
    }
    if (G.mind.panic > 50) dmg *= 1.05;
    return { it, w, dmg, spd, staF, q };
  }

  aimError() {
    const G = this.G;
    const b = G.body, m = G.mind;
    let s = 0.09 + m.panic * 0.0022 + Math.max(0, b.fatigue - 40) * 0.0016 + (1 - b.stamina) * 0.1 + b.handPenalty() * 0.12 + b.shiver() * 0.1 + b.pain * 0.0008;
    s -= G.skills.level('melee') * 0.007;
    return Math.max(0.03, s);
  }

  update(dt, inp) {
    const G = this.G;
    if (this.cd > 0) this.cd -= dt;
    this.updateProjectiles(dt);
    this.updateAlarms(dt);
    if (G.state !== 'playing' || G.player.anim) return;
    const busy = G.actions.current;
    if (inp.pressed.has('attack') && !busy && G.ui.canAct()) this.tryAttack();
    if (inp.pressed.has('shove') && !busy && G.ui.canAct()) this.tryShove();
    if (inp.pressed.has('throw') && !busy && G.ui.canAct()) this.tryThrow();
    if (this.swing) {
      const s = this.swing;
      s.t += dt;
      if (!s.done && s.t >= s.dur * 0.45) {
        s.done = true;
        this.resolve(s);
      }
      if (s.t >= s.dur) this.swing = null;
    }
    if (this.shove) {
      this.shove.t += dt;
      if (!this.shove.done && this.shove.t > 0.12) {
        this.shove.done = true;
        this.resolveShove();
      }
      if (this.shove.t > 0.45) this.shove = null;
    }
  }

  tryAttack() {
    const G = this.G;
    if (this.swing || this.shove || this.cd > 0) return;
    if (G.inv.bulky) {
      G.hud.toast('Hai le mani occupate. Lascia prima quello che porti (X).');
      return;
    }
    const it = G.inv.hand;
    if (it && !ITEMS[it.id].wpn) {
      // un oggetto lanciabile in mano: lo lancia
      if (ITEMS[it.id].thr) return this.tryThrow();
    }
    const S = this.stats();
    if (G.body.stamina < 0.02) {
      G.hud.say('Non ho più fiato...', 'tired');
      return;
    }
    // bersaglio a terra: calcio/pestone
    const stomp = this.stompTarget();
    const stealth = !stomp && this.stealthTarget(S);
    const dur = stomp ? 0.55 : stealth ? 0.75 : S.spd;
    this.swing = { t: 0, dur, done: false, S, stomp, stealth, style: stomp ? 'stomp' : stealth ? 'stealth' : S.w.stab ? 'stab' : S.w.type === 'blade' && S.w.two ? 'chop' : 'swing' };
    this.cd = dur * 0.95;
    const sta = (stomp ? 0.08 : S.w.sta) * (1 + G.inv.encumbrance() * 0.1) * (G.mind.panic > 50 ? 1.3 : 1);
    G.body.useStamina(sta);
    G.audio.play('swoosh', null, null, null, 0.6 + S.w.dmg * 0.2);
    G.events.emit('swing', this.swing);
  }

  stompTarget() {
    const G = this.G, p = G.player;
    if (p.pitch > -0.55) return null;
    let best = null, bd = 1.2;
    G.zombies.query(p.x, p.z, 1.3, (zb, d2) => {
      if (zb.state !== Z.DOWN && !zb.crawler) return;
      const d = Math.sqrt(d2);
      const ang = Math.abs(angDiff(p.yaw + Math.PI, Math.atan2(zb.x - p.x, zb.z - p.z)));
      if (ang > 0.9) return;
      if (d < bd) {
        bd = d;
        best = zb;
      }
    });
    return best;
  }

  stealthTarget(S) {
    const G = this.G, p = G.player;
    if (!p.crouch || !S.it) return null;
    let best = null;
    G.zombies.query(p.x, p.z, 1.4, (zb) => {
      if (zb.aware >= 0.6 || zb.state === Z.CHASE || zb.state === Z.ATTACK || zb.state === Z.DOWN || zb.crawler || zb.state === Z.CLIMB) return;
      const toP = Math.atan2(p.x - zb.x, p.z - zb.z);
      const behind = Math.abs(angDiff(zb.yaw, toP)) > 1.9;
      const facing = Math.abs(angDiff(p.yaw + Math.PI, Math.atan2(zb.x - p.x, zb.z - p.z))) < 0.7;
      if (behind && facing && Math.abs(zb.y - p.y) < 0.8) best = zb;
    });
    return best;
  }

  // zombie davanti al giocatore entro la portata, ordinati per allineamento con la mira
  targets(reach, arc) {
    const G = this.G, p = G.player;
    const out = [];
    const fwd = p.yaw + Math.PI;
    G.zombies.query(p.x, p.z, reach + 0.4, (zb, d2) => {
      if (zb.state === Z.DEAD || zb.state === Z.CLIMB) return;
      if (Math.abs(zb.y - p.y) > 1.2) return;
      const d = Math.sqrt(d2);
      const dir = Math.atan2(zb.x - p.x, zb.z - p.z);
      const off = angDiff(fwd, dir);
      const tol = arc + Math.atan2(0.3, Math.max(d, 0.3));
      if (Math.abs(off) > tol) return;
      if (!G.grid.walkLine(p.cellL(), p.x, p.z, zb.x, zb.z)) return;
      out.push({ zb, d, off });
    });
    out.sort((a, b) => Math.abs(a.off) + a.d * 0.2 - (Math.abs(b.off) + b.d * 0.2));
    return out;
  }

  zoneFor(zb, d, off, err) {
    const G = this.G, p = G.player;
    const eyeY = p.y + p.eye;
    let rel = eyeY + Math.tan(p.pitch) * d - zb.y + fx.range(-1, 1) * err * 1.2;
    let lat = Math.tan(off) * d + fx.range(-1, 1) * err;
    if (zb.state === Z.DOWN || zb.crawler) {
      if (rel < 0.6 && Math.abs(lat) < 0.3 && fx.chance(0.6 - err)) return 'head';
      return fx.chance(0.5) ? 'torso' : lat < 0 ? 'armL' : 'armR';
    }
    if (rel >= 1.47) return rel > 1.95 ? (fx.chance(0.5) ? 'head' : 'torso') : 'head';
    if (rel < 0.9) {
      const z = lat < 0 ? 'legR' : 'legL';
      return zb.lost[z] ? 'torso' : z;
    }
    if (Math.abs(lat) > 0.19) {
      const z = lat < 0 ? 'armR' : 'armL';
      return zb.lost[z] ? 'torso' : z;
    }
    return 'torso';
  }

  resolve(s) {
    const G = this.G, p = G.player;
    const S = s.S;
    if (s.stomp) {
      const zb = s.stomp;
      if (zb.removed) return;
      const boots = G.inv.worn.feet && G.inv.worn.feet.id === 'boots';
      this.applyHit(zb, 'head', boots ? 0.65 : 0.45, { knock: 0, blunt: true, stomp: true });
      G.noise.emit(p.x, p.z, 4, { L: p.L, src: 'player', kind: 'hit' });
      return;
    }
    if (s.stealth) {
      const zb = s.stealth;
      if (zb.removed || zb.aware >= 0.9) {
        s.stealth = null;
      } else {
        const r = G.zombies.hit(zb, 'head', 9, { blade: S.w.type === 'blade', sever: 0, knock: 0 });
        G.audio.play(S.w.type === 'blade' ? 'stab' : 'hitblunt', zb.x, zb.y + 1.5, zb.z, 0.7);
        G.noise.emit(p.x, p.z, 1.6, { L: p.L, src: 'player', kind: 'hit', ring: false });
        G.fx.blood(zb.x, zb.y + 1.6, zb.z, 6);
        this.wear(S, 1);
        G.skills.xp('stealth', 12);
        G.skills.xp('melee', 4);
        if (r.killed) G.events.emit('stealthKill', zb);
        return;
      }
    }
    const reach = S.w.reach + 0.15;
    const arc = S.w.stab ? 0.28 : S.w.type === 'blunt' && S.w.two ? 0.75 : 0.55;
    const list = this.targets(reach, arc);
    if (!list.length) {
      G.noise.emit(p.x, p.z, NOISE.swingMiss, { L: p.L, src: 'player', kind: 'swing', ring: false });
      // colpo a vuoto contro una finestra? la rompe
      G.interact.swingAtWindow(S);
      return;
    }
    const err = this.aimError() * (S.w.stab ? 0.7 : 1);
    const maxHits = S.w.type === 'blunt' && S.w.two ? 2 : 1;
    let hits = 0;
    for (const t of list) {
      if (hits >= maxHits) break;
      // a stamina bassa si manca più spesso
      const missP = clamp((1 - S.staF) * 0.35 + err * 0.6 - 0.05, 0, 0.6);
      if (fx.chance(missP)) {
        G.audio.play('swoosh', null, null, null, 0.5);
        continue;
      }
      const zone = this.zoneFor(t.zb, t.d, t.off, err);
      let dmg = S.dmg * fx.range(0.85, 1.15) * (hits === 1 ? 0.6 : 1);
      if (zone === 'head' && fx.chance(0.05 + G.skills.level('melee') * 0.015)) dmg *= 2;
      this.applyHit(t.zb, zone, dmg, { blade: S.w.type === 'blade', sever: S.w.sever || 0, knock: S.w.knock * S.staF * (zone === 'head' ? 1.2 : zone.startsWith('leg') ? 1.4 : 1), blunt: S.w.type === 'blunt' });
      hits++;
    }
    if (hits) {
      this.wear(S, hits);
      G.noise.emit(p.x, p.z, S.w.noise, { L: p.L, src: 'player', kind: 'hit' });
      G.skills.xp('melee', 2 * hits);
      p.shake = Math.max(p.shake, 0.25);
    } else G.noise.emit(p.x, p.z, NOISE.swingMiss, { L: p.L, src: 'player', kind: 'swing', ring: false });
  }

  applyHit(zb, zone, dmg, o) {
    const G = this.G;
    const res = G.zombies.hit(zb, zone, dmg, o);
    const hy = zone === 'head' ? 1.6 : zone.startsWith('leg') ? 0.5 : 1.2;
    const y = zb.state === Z.DOWN || zb.crawler ? zb.y + 0.3 : zb.y + hy;
    G.audio.play(o.blade ? 'hitblade' : 'hitblunt', zb.x, y, zb.z, zone === 'head' ? 1 : 0.8);
    G.fx.blood(zb.x, y, zb.z, zone === 'head' ? 8 : 4);
    if (res.severed) {
      G.zmesh.dropLimb(zb, res.severed);
      G.fx.blood(zb.x, y, zb.z, 12);
      G.fx.decal(zb.x, zb.z, zb.L, 1.2);
    }
    if (res.killed) {
      G.fx.decal(zb.x, zb.z, zb.L, 1.0);
      G.skills.xp('melee', 6);
    }
    return res;
  }

  wear(S, hits) {
    const G = this.G;
    const it = S.it;
    if (!it || !S.w.dur) return;
    const melee = G.skills.level('melee');
    it.c -= (hits / (S.w.dur * QUALITY_MULT.dur[it.q !== undefined ? it.q : 1])) * (1 - melee * 0.03);
    if (it.c <= 0) {
      G.inv.remove(it.u);
      G.audio.play('weaponbreak');
      G.hud.toast(ITEMS[it.id].n + ': si è rotta!', 'bad');
      G.hud.say('No! Si è rotta...', 'break');
    } else if (it.c < 0.15 && !it.warned) {
      it.warned = true;
      G.hud.toast(ITEMS[it.id].n + ' è quasi da buttare.', 'warn');
    }
    G.events.emit('inv');
  }

  tryShove() {
    const G = this.G;
    if (this.shove || (this.swing && this.swing.t < this.swing.dur * 0.6)) return;
    if (G.inv.bulky && G.inv.bulky.kind !== 'barrow') {
      G.hud.toast('Hai le mani occupate.');
      return;
    }
    this.swing = null;
    this.shove = { t: 0, done: false };
    G.body.useStamina(0.07);
    G.audio.play('shove');
    G.events.emit('shove');
  }

  resolveShove() {
    const G = this.G, p = G.player;
    const list = this.targets(1.25, 0.95);
    const power = clamp(0.5 + G.body.stamina, 0.5, 1.2);
    const dx = -Math.sin(p.yaw), dz = -Math.cos(p.yaw);
    for (const t of list.slice(0, 3)) G.zombies.shove(t.zb, dx, dz, power);
    if (list.length) G.noise.emit(p.x, p.z, 3, { L: p.L, src: 'player', kind: 'shove', ring: false });
  }

  // ---------------------------------------------------------------- lanci
  tryThrow() {
    const G = this.G, p = G.player;
    let it = G.inv.hand;
    if (!it || !ITEMS[it.id].thr) {
      // prendi il primo lanciabile addosso
      const e = G.inv.usable().find((x) => ITEMS[x.it.id].thr);
      if (!e) {
        G.hud.toast('Non hai niente da lanciare (bottiglie, lattine, sassi, sveglie).');
        return;
      }
      it = e.it;
    }
    G.inv.remove(it.u);
    const sp = 11;
    const dir = { x: -Math.sin(p.yaw) * Math.cos(p.pitch), y: Math.sin(p.pitch), z: -Math.cos(p.yaw) * Math.cos(p.pitch) };
    const y = p.y + p.eye - 0.1;
    this.projectiles.push({ it, x: p.x + dir.x * 0.4, y, z: p.z + dir.z * 0.4, vx: dir.x * sp, vy: dir.y * sp + 2.2, vz: dir.z * sp, t: 0, mesh: G.fx.projectileMesh(it) });
    G.body.useStamina(0.04);
    G.audio.play('throw');
    G.events.emit('throw', it);
  }

  updateProjectiles(dt) {
    const G = this.G;
    const g = G.grid;
    for (const pr of this.projectiles) {
      pr.t += dt;
      const steps = 3;
      for (let s = 0; s < steps && !pr.dead; s++) {
        const h = dt / steps;
        pr.vy -= 9.8 * h;
        const nx = pr.x + pr.vx * h, nz = pr.z + pr.vz * h, ny = pr.y + pr.vy * h;
        const L = ny > LEVEL_H + 0.1 ? 1 : 0;
        // muri e porte
        const e = crossedEdge(g, L, pr.x, pr.z, nx, nz);
        const base = L * LEVEL_H;
        if (e && (g.blocksPlayer(e) || ny - base > (e.h || 3)) && ny - base < (e.h || 3)) {
          if (e.t === 2 && e.st === 0 && ny - base > 0.8 && ny - base < 2.2) {
            G.interact.breakWindowBy(e, 'player');
            pr.vx *= 0.6;
            pr.vz *= 0.6;
          } else {
            pr.vx *= -0.3;
            pr.vz *= -0.3;
          }
          G.audio.play('clink', pr.x, pr.y, pr.z, 0.6);
          continue;
        }
        pr.x = nx;
        pr.z = nz;
        pr.y = ny;
        // zombie colpito
        G.zombies.query(pr.x, pr.z, 0.4, (zb) => {
          if (pr.dead || pr.y < zb.y || pr.y > zb.y + 1.8 || zb.state === Z.DEAD) return;
          G.zombies.hit(zb, pr.y - zb.y > 1.45 ? 'head' : 'torso', 0.12, { knock: 0.05 });
          zb.stagger = 0.4;
          pr.vx *= 0.2;
          pr.vz *= 0.2;
        });
        const gy = g.groundY(L, pr.x, pr.z);
        if (pr.y <= gy + 0.03 || pr.t > 6) {
          pr.y = Math.max(pr.y, gy);
          this.land(pr, L);
        }
      }
      if (pr.mesh) {
        pr.mesh.position.set(pr.x, pr.y, pr.z);
        pr.mesh.rotation.x += dt * 9;
        pr.mesh.rotation.z += dt * 5;
      }
    }
    this.projectiles = this.projectiles.filter((p) => !p.dead);
  }

  land(pr, L) {
    const G = this.G;
    pr.dead = true;
    G.fx.removeMesh(pr.mesh);
    const d = ITEMS[pr.it.id].thr;
    const i = Math.floor(pr.x), j = Math.floor(pr.z);
    if (d.breaks) {
      G.audio.play('glass', pr.x, pr.y, pr.z, 0.8);
      G.fx.glassBurst(pr.x, pr.y + 0.1, pr.z);
    } else G.audio.play(pr.it.id === 'stone' ? 'thud' : 'clink', pr.x, pr.y, pr.z, 0.9);
    G.noise.emit(pr.x, pr.z, d.noise, { L, src: 'world', kind: 'throw' });
    G.events.emit('noiseLure', { x: pr.x, z: pr.z });
    if (!d.breaks) {
      G.world.addGround(L, i, j, pr.it);
      if (d.ring) this.alarms.push({ x: pr.x, z: pr.z, L, t: d.ring, next: 0, it: pr.it });
    }
  }

  updateAlarms(dt) {
    const G = this.G;
    for (const a of this.alarms) {
      if (a.delay !== undefined && a.delay > 0) {
        a.delay -= dt;
        continue;
      }
      a.t -= dt;
      a.next -= dt;
      if (a.next <= 0) {
        a.next = 1.1;
        G.noise.emit(a.x, a.z, 22, { L: a.L, src: 'world', kind: 'alarm' });
        G.audio.play('alarm', a.x, a.L * LEVEL_H + 0.3, a.z, 1);
      }
    }
    this.alarms = this.alarms.filter((a) => a.t > 0);
  }

  // sveglia a tempo lasciata a terra
  armTimer(it, x, z, L, seconds) {
    this.alarms.push({ x, z, L, t: 18, next: 0, it, delay: seconds });
  }
}

function crossedEdge(g, L, x0, z0, x1, z1) {
  const i0 = Math.floor(x0), j0 = Math.floor(z0), i1 = Math.floor(x1), j1 = Math.floor(z1);
  if (i0 !== i1 && g.inb(Math.max(i0, i1), j0)) {
    const e = g.vEdge(L, Math.max(i0, i1), j0);
    if (e) return e;
  }
  if (j0 !== j1) {
    const e = g.hEdge(L, i1, Math.max(j0, j1));
    if (e) return e;
  }
  return null;
}

export { mkItem };
