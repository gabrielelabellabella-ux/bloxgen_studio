// Sonno e attesa: dormire fa passare il tempo in fretta mentre il mondo continua (gli zombie possono
// sfondare le barricate). Ti svegli col giorno, quando sei riposato, o di soprassalto se succede qualcosa.
import { FURN } from '../data/furniture.js';
import { clamp } from '../core/util.js';
import { Z } from './zombies.js';

export const SLEEP_SPEED = 40;
export const WAIT_SPEED = 8;

export class Sleep {
  constructor(G) {
    this.G = G;
    this.active = false;
    this.waiting = false;
    G.events.on('noise', (n) => this.onNoise(n));
    G.events.on('wound', () => this.wake('Ti svegli di soprassalto: ti hanno ferito!'));
    G.events.on('passOut', () => this.start(null, true));
  }

  canRest() {
    const G = this.G, p = G.player;
    let danger = false;
    G.zombies.query(p.x, p.z, 16, (zb) => {
      if (zb.state === Z.CHASE || zb.state === Z.ATTACK || zb.state === Z.BASH) danger = true;
      if (Math.abs(zb.y - p.y) < 1.5 && Math.hypot(zb.x - p.x, zb.z - p.z) < 7) danger = true;
    });
    return !danger;
  }

  start(f, forced) {
    const G = this.G;
    if (!forced && !this.canRest()) return G.hud.toast('Non puoi dormire con gli zombie così vicini.');
    if (!forced && G.body.fatigue < 25 && !G.body.meds.sleep) return G.hud.toast('Non hai sonno.');
    const d = f ? FURN[f.type] : null;
    let q = d ? d.sleep : 0.45;
    if (G.mind.morale < 30) q *= 0.75;
    if (G.body.pain > 50) q *= 0.7;
    if (G.body.temp < 36) q *= 0.8;
    if (G.mind.panic > 40) q *= 0.8;
    G.sleepQuality = q;
    G.sleeping = true;
    this.active = true;
    this.bed = f;
    this.startMin = G.clock.min;
    this.reason = '';
    G.actions.cancel();
    G.player.crouch = false;
    if (f) {
      G.player.x = f.x;
      G.player.z = f.z;
      G.lastBed = { x: f.x, z: f.z, L: f.L };
    }
    if (forced) G.hud.event('Crolli dal sonno', 'Le gambe cedono. Ti addormenti dove sei.');
    G.save.save('sleep');
    G.hud.sleepOverlay(true);
    G.audio.duck(true);
  }

  onNoise(n) {
    if (!this.active) return;
    const p = this.G.player;
    if (n.src === 'player') return;
    const d = Math.hypot(n.x - p.x, n.z - p.z);
    if (n.r >= 9 && d < Math.min(16, n.r)) this.wake(n.kind === 'glass' ? 'Un vetro va in frantumi. Ti svegli di colpo.' : n.kind === 'bash' ? 'Colpi alla porta. Ti svegli di colpo.' : 'Un rumore ti sveglia.');
  }

  wake(reason) {
    const G = this.G;
    if (!this.active) return;
    this.active = false;
    G.sleeping = false;
    const hours = (G.clock.min - this.startMin) / 60;
    const q = G.sleepQuality || 0.5;
    const mo = hours > 3 ? (q >= 0.9 ? 8 : q >= 0.6 ? 3 : -3) : 0;
    G.mind.morale = clamp(G.mind.morale + mo, 0, 100);
    G.hud.sleepOverlay(false);
    G.audio.duck(false);
    G.hud.toast(reason || 'Ti svegli. Hai dormito ' + Math.max(1, Math.round(hours)) + (Math.round(hours) === 1 ? ' ora.' : ' ore.'), reason ? 'bad' : '');
    if (!reason) G.save.save('wake');
  }

  update(dt) {
    const G = this.G;
    if (this.active) {
      const b = G.body;
      const h = G.clock.hour;
      if ((b.fatigue < 3 && h > 5.5 && h < 11) || b.fatigue <= 0.2) return this.wake();
      if (b.hunger > 88 || b.thirst > 88) return this.wake('Ti svegli: fame e sete non ti danno tregua.');
      if (b.bleeding() > 1) return this.wake('Ti svegli: stai sanguinando.');
      const p = G.player;
      let near = false;
      G.zombies.query(p.x, p.z, 5, (zb) => {
        if (Math.abs(zb.y - p.y) < 1.5 && zb.state !== Z.DEAD) near = true;
      });
      if (near) return this.wake('Qualcosa ansima vicino a te. Ti svegli di colpo!');
      G.hud.sleepClock(G.clock.timeStr());
      return;
    }
    if (this.waiting) {
      if (!this.canRest() || G.player.moving) {
        this.stopWait();
      }
    }
  }

  toggleWait() {
    const G = this.G;
    if (this.waiting) return this.stopWait();
    if (!this.canRest()) return G.hud.toast('Non è il momento di riposare.');
    this.waiting = true;
    G.hud.toast('Aspetti in silenzio. Muoviti per smettere.');
    G.hud.waitBadge(true);
  }
  stopWait() {
    this.waiting = false;
    this.G.hud.waitBadge(false);
  }

  speed() {
    if (this.active) return SLEEP_SPEED;
    if (this.waiting) return WAIT_SPEED;
    return 1;
  }
}
