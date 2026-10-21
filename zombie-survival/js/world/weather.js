// Meteo e stagioni: pioggia (copre il rumore, riempie i barili, bagna e raffredda), nebbia (meno vista per
// tutti), temporali, neve d'inverno, caldo e freddo. La temperatura dipende da stagione, ora e tempo.
import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';
import { RNG } from '../core/rng.js';

const STATES = {
  clear: { cloud: 0.1, rain: 0, fog: 0, n: 'Sereno' },
  cloudy: { cloud: 0.7, rain: 0, fog: 0, n: 'Nuvoloso' },
  rain: { cloud: 0.9, rain: 0.6, fog: 0.05, n: 'Pioggia' },
  storm: { cloud: 1, rain: 1, fog: 0.08, n: 'Temporale' },
  fog: { cloud: 0.5, rain: 0, fog: 0.85, n: 'Nebbia' },
};
// probabilità per stagione: inverno, primavera, estate, autunno
const PROB = [
  [['clear', 3], ['cloudy', 4], ['rain', 2], ['storm', 0.2], ['fog', 2]],
  [['clear', 4], ['cloudy', 3], ['rain', 2.5], ['storm', 0.6], ['fog', 1]],
  [['clear', 6], ['cloudy', 2], ['rain', 1], ['storm', 1], ['fog', 0.3]],
  [['clear', 3], ['cloudy', 3.5], ['rain', 2.5], ['storm', 0.5], ['fog', 2]],
];

export class Weather {
  constructor(G) {
    this.G = G;
    this.rng = new RNG((G.settings.seed ^ 0x5eed) >>> 0);
    this.state = 'clear';
    this.cloud = 0.15;
    this.rain = 0;
    this.fog = 0;
    this.snow = false;
    this.temp = 16;
    this.drift = 0;
    this.nextChange = 8 * 60 + 180;
    this.thunderT = 10;
    this.particles = null;
    this.target = STATES.clear;
  }

  serialize() {
    return { state: this.state, cloud: this.cloud, rain: this.rain, fog: this.fog, drift: this.drift, next: this.nextChange };
  }
  load(o) {
    Object.assign(this, { state: o.state, cloud: o.cloud, rain: o.rain, fog: o.fog, drift: o.drift || 0, nextChange: o.next });
    this.target = STATES[this.state] || STATES.clear;
  }

  label() {
    if (this.snow && this.rain > 0.1) return 'Neve';
    return (STATES[this.state] || STATES.clear).n;
  }

  // la pioggia copre parte del rumore
  noiseMask() {
    return 1 - this.rain * 0.3 - (this.state === 'storm' ? 0.08 : 0);
  }

  baseTemp() {
    const c = this.G.clock;
    const doy = c.doy();
    const mean = 11 + 10.5 * Math.sin((2 * Math.PI * (doy - 110)) / 365);
    const daily = 5 * Math.cos((2 * Math.PI * (c.hour - 15)) / 24);
    return mean + daily;
  }

  update(dt, hours) {
    const G = this.G;
    const now = G.clock.min;
    if (now >= this.nextChange) {
      const s = G.clock.seasonIndex();
      const prev = this.state;
      this.state = this.rng.weighted(PROB[s]);
      if (prev === 'storm' && this.state === 'storm' && this.rng.chance(0.6)) this.state = 'rain';
      this.target = STATES[this.state];
      this.nextChange = now + this.rng.range(90, 300);
      this.drift = clamp(this.drift + this.rng.range(-1.5, 1.5), -4, 4);
      if (this.state !== prev) G.events.emit('weather', this.state);
    }
    const k = Math.min(1, hours * 1.5);
    this.cloud = lerp(this.cloud, this.target.cloud, k);
    this.rain = lerp(this.rain, this.target.rain, k);
    this.fog = lerp(this.fog, this.target.fog, k);
    if (this.rain < 0.02) this.rain = 0;
    this.temp = this.baseTemp() + this.drift - this.cloud * 1.5 - this.rain * 3;
    this.snow = this.temp < 1;
    // tuoni
    if (this.state === 'storm' && this.rain > 0.6) {
      this.thunderT -= dt;
      if (this.thunderT <= 0) {
        this.thunderT = this.rng.range(8, 30);
        G.sky.lightning();
        const delay = this.rng.range(0.5, 3);
        setTimeout(() => G.audio && G.audio.thunder(delay), delay * 1000);
      }
    }
  }

  // ---------------------------------------------------------------- particelle (pioggia/neve)
  initParticles(scene, count) {
    if (this.particles) {
      scene.remove(this.particles);
      this.particles.geometry.dispose();
    }
    this.count = count;
    const pos = new Float32Array(count * 6);
    this.drops = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      this.drops[k * 3] = (Math.random() - 0.5) * 30;
      this.drops[k * 3 + 1] = Math.random() * 16;
      this.drops[k * 3 + 2] = (Math.random() - 0.5) * 30;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.rainMat = new THREE.LineBasicMaterial({ color: 0xa8b4c0, transparent: true, opacity: 0.35, fog: true });
    this.particles = new THREE.LineSegments(geo, this.rainMat);
    this.particles.frustumCulled = false;
    this.particles.visible = false;
    scene.add(this.particles);
  }

  updateParticles(dt, cam) {
    if (!this.particles) return;
    const vis = this.rain > 0.05;
    this.particles.visible = vis;
    if (!vis) return;
    const g = this.G.grid;
    const n = Math.floor(this.count * clamp(this.rain, 0.2, 1));
    const pos = this.particles.geometry.attributes.position.array;
    const snow = this.snow;
    const fall = snow ? 1.4 : 15;
    const len = snow ? 0.05 : 0.45;
    const t = this.G.time;
    this.rainMat.color.setHex(snow ? 0xf2f4f6 : 0xa8b4c0);
    this.rainMat.opacity = snow ? 0.85 : 0.3 + this.rain * 0.15;
    const camL = cam.y > 4 ? 1 : 0;
    for (let k = 0; k < this.count; k++) {
      const o = k * 3;
      if (k >= n) {
        pos[k * 6 + 1] = -1000;
        pos[k * 6 + 4] = -1000;
        continue;
      }
      this.drops[o + 1] -= fall * dt;
      let x = this.drops[o] + (snow ? Math.sin(t * 0.7 + k) * 0.5 : 0);
      const y = this.drops[o + 1];
      let z = this.drops[o + 2];
      if (y < -1) {
        this.drops[o + 1] += 16;
        this.drops[o] = (Math.random() - 0.5) * 30;
        this.drops[o + 2] = (Math.random() - 0.5) * 30;
      }
      const wx = cam.x + x, wz = cam.z + z, wy = cam.y - 4 + y;
      // niente pioggia sotto i tetti
      const i = Math.floor(wx), j = Math.floor(wz);
      let hidden = false;
      if (g.inb(i, j)) {
        const roofY = g.roofed(0, i, j) ? (g.lv[1].floor[g.idx(i, j)] !== 255 || g.lv[1].room[g.idx(i, j)] >= 0 ? 6.5 : 3.6) : -1;
        if (roofY > 0 && wy < roofY && camL === 0) hidden = true;
      }
      const b = k * 6;
      if (hidden) {
        pos[b + 1] = -1000;
        pos[b + 4] = -1000;
        continue;
      }
      pos[b] = wx;
      pos[b + 1] = wy;
      pos[b + 2] = wz;
      pos[b + 3] = wx + (snow ? 0.03 : 0.04);
      pos[b + 4] = wy + len;
      pos[b + 5] = wz;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;
  }
}
