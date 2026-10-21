// La mente conta quanto il corpo: panico (respiro che fa rumore, mani che tremano, visione ristretta),
// morale, noia e solitudine. Un personaggio sano ma terrorizzato e depresso sopravvive male.
import { clamp, angDiff } from '../core/util.js';
import { Z } from './zombies.js';
import { NOISE } from './noise.js';

export class Mind {
  constructor(G) {
    this.G = G;
    this.reset();
    G.events.on('noise', (n) => this.onNoise(n));
    G.events.on('zombieKilled', () => this.onKill());
  }

  reset() {
    this.panic = 0;
    this.morale = 68;
    this.boredom = 8;
    this.lonely = 12;
    this.resist = 0;
    this.breathT = 0;
    this.kills = 0;
    this.nearZ = 0;
    this.surrounded = false;
    this.indoorT = 0;
  }

  shock(v) {
    this.panic = clamp(this.panic + v * (1 - this.resist * 0.6), 0, 100);
  }

  onNoise(n) {
    const p = this.G.player;
    if (n.src === 'player' || n.r < 14) return;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (d < 9) this.shock(10 * (1 - d / 9) + 4);
  }

  onKill() {
    this.kills++;
    this.resist = clamp(this.resist + 0.012, 0, 0.6);
    // vedere scene violente: i primi uccisi pesano sul morale
    const k = Math.max(0, 1 - this.kills / 35);
    this.morale = clamp(this.morale - 1.6 * k, 0, 100);
  }

  update(dt, hours) {
    const G = this.G;
    const p = G.player, b = G.body;
    // zombie vicini e accerchiamento
    let near = 0;
    const sectors = new Set();
    let pressure = 0;
    G.zombies.query(p.x, p.z, 12, (zb, d2) => {
      if (zb.state === Z.DEAD || Math.abs(zb.y - p.y) > 2) return;
      const d = Math.sqrt(d2);
      const active = zb.state === Z.CHASE || zb.state === Z.ATTACK || d < 4;
      if (!active && d > 6) return;
      near++;
      pressure += (1 - d / 12) * (active ? 2.4 : 0.8);
      if (d < 4) sectors.add(Math.floor(((Math.atan2(zb.x - p.x, zb.z - p.z) + Math.PI) / (Math.PI / 2)) % 4));
    });
    this.nearZ = near;
    this.surrounded = sectors.size >= 3;
    let gain = pressure + (this.surrounded ? 8 : 0);
    const day = G.sky.state.daylight;
    const i = Math.floor(p.x), j = Math.floor(p.z);
    const indoor = G.grid.indoor(p.L, i, j);
    if (day < 0.3 && !indoor && !G.inv.light()) gain += this.panic < 30 ? 0.45 : 0;
    if (b.bleeding() > 1) gain += this.panic < 45 ? 0.9 : 0;
    gain *= 1 - this.resist * 0.6;
    let decay = near === 0 ? 3.2 : 0.4;
    if (indoor && near === 0) decay += 2;
    if (G.sleeping) decay += 8;
    this.panic = clamp(this.panic + (gain - decay) * dt, 0, 100);
    // respiro affannoso udibile: fa rumore
    if (this.panic > 45 || b.stamina < 0.15) {
      this.breathT -= dt;
      if (this.breathT <= 0) {
        this.breathT = 1.6;
        G.noise.emit(p.x, p.z, NOISE.breathe * (this.panic > 70 ? 1.3 : 1), { L: p.L, src: 'player', kind: 'breath', ring: false });
      }
    }
    // morale
    let dm = 0;
    if (b.hunger > 60) dm -= 2;
    if (b.thirst > 60) dm -= 2;
    if (b.pain > 30) dm -= b.pain * 0.04;
    if (b.fatigue > 80) dm -= 2;
    if (b.wet > 0.5) dm -= 1;
    if (b.temp < 36) dm -= 1.2;
    if (b.cold > 0.3 || b.poison > 0.3 || b.fever > 0.5) dm -= 1.5;
    if (this.lonely > 60) dm -= 1.4;
    if (this.boredom > 60) dm -= 1.4;
    const corpses = G.world.corpses.filter((c) => !c.burned && Math.abs(c.x - p.x) < 7 && Math.abs(c.z - p.z) < 7).length;
    dm -= Math.min(4, corpses) * 0.6;
    const comfort = G.base ? G.base.comfortAt(p.x, p.z, p.L) : 0;
    if (dm >= 0) dm += 0.4 + comfort * 0.25;
    this.morale = clamp(this.morale + dm * hours, 0, 100);
    // noia: sale chiusi in casa, scende esplorando
    this.indoorT = indoor ? this.indoorT + hours : 0;
    let db = indoor ? (this.indoorT > 1 ? 3.2 : 1) : p.moving ? -3.5 : -0.5;
    if (G.actions.current && G.actions.current.repetitive) db += 2;
    if (G.sleeping) db = 0;
    this.boredom = clamp(this.boredom + db * hours, 0, 100);
    // solitudine: sale lentamente coi giorni senza contatto umano
    let dl = 0.55;
    if (G.base && G.base.radioOn) dl -= 1.2;
    this.lonely = clamp(this.lonely + dl * hours, 0, 100);
  }

  serialize() {
    return { panic: this.panic, morale: this.morale, boredom: this.boredom, lonely: this.lonely, resist: this.resist, kills: this.kills };
  }
  load(o) {
    this.reset();
    Object.assign(this, o);
  }
}

export { angDiff };
