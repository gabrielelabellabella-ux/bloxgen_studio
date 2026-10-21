// Effetti: sangue, schegge di vetro, onde di rumore a terra, fuoco, stormi di uccelli, macchie di sangue,
// oggetti lanciati, anteprima della costruzione e luci puntiformi condivise.
import * as THREE from 'three';
import { ITEMS } from '../data/items.js';
import { LEVEL_H } from '../config.js';
import { BUILD } from '../data/build.js';

export class FX {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'fx';
    // particelle (punti) riciclate
    this.N = 260;
    this.pp = [];
    const pos = new Float32Array(this.N * 3), col = new Float32Array(this.N * 3);
    this.pgeo = new THREE.BufferGeometry();
    this.pgeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.pgeo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    this.points = new THREE.Points(this.pgeo, new THREE.PointsMaterial({ size: 0.06, vertexColors: true, sizeAttenuation: true, transparent: true, opacity: 0.95, depthWrite: false }));
    this.points.frustumCulled = false;
    this.group.add(this.points);
    for (let k = 0; k < this.N; k++) this.pp.push({ life: 0 });
    this.pi = 0;
    // macchie di sangue
    const dc = document.createElement('canvas');
    dc.width = dc.height = 64;
    const ctx = dc.getContext('2d');
    for (let k = 0; k < 9; k++) {
      ctx.fillStyle = `rgba(${70 + Math.random() * 30},10,8,${0.5 + Math.random() * 0.4})`;
      ctx.beginPath();
      ctx.arc(20 + Math.random() * 24, 20 + Math.random() * 24, 4 + Math.random() * 14, 0, Math.PI * 2);
      ctx.fill();
    }
    const dt = new THREE.CanvasTexture(dc);
    dt.colorSpace = THREE.SRGBColorSpace;
    this.decalMat = new THREE.MeshLambertMaterial({ map: dt, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4 });
    this.decalGeo = new THREE.PlaneGeometry(1, 1);
    this.decalGeo.rotateX(-Math.PI / 2);
    this.decals = [];
    // anelli del rumore
    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.94, 1, 48);
    this.ringGeo.rotateX(-Math.PI / 2);
    // fuoco
    this.fires = [];
    this.flameMat = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    this.flameGeo = new THREE.ConeGeometry(0.22, 0.7, 6);
    this.flameGeo.translate(0, 0.35, 0);
    this.campfireFlames = new Map();
    // uccelli
    this.birds = [];
    this.birdGeo = new THREE.BufferGeometry();
    this.birdGeo.setAttribute('position', new THREE.Float32BufferAttribute([-0.25, 0, 0.05, 0, 0, -0.05, 0, 0, 0.05, 0.25, 0, 0.05, 0, 0, -0.05, 0, 0, 0.05], 3));
    this.birdGeo.computeVertexNormals();
    this.birdMat = new THREE.MeshBasicMaterial({ color: 0x141414, side: THREE.DoubleSide, fog: true });
    // anteprima di costruzione
    this.ghost = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial({ color: 0x7fae6a, transparent: true, opacity: 0.35, depthWrite: false }));
    this.ghost.visible = false;
    this.group.add(this.ghost);
  }

  dispose() {
    for (const d of this.decals) this.group.remove(d);
    this.decals = [];
    for (const r of this.rings) this.group.remove(r.m);
    this.rings = [];
    for (const f of this.fires) this.group.remove(f.m);
    this.fires = [];
    for (const b of this.birds) this.group.remove(b.m);
    this.birds = [];
    for (const m of this.campfireFlames.values()) this.group.remove(m);
    this.campfireFlames.clear();
  }

  spawn(x, y, z, vx, vy, vz, life, r, g, b, grav = 9.8) {
    const p = this.pp[this.pi];
    this.pi = (this.pi + 1) % this.N;
    Object.assign(p, { x, y, z, vx, vy, vz, life, r, g, b, grav });
  }

  blood(x, y, z, n) {
    for (let k = 0; k < n; k++) this.spawn(x, y, z, (Math.random() - 0.5) * 3, Math.random() * 2.5, (Math.random() - 0.5) * 3, 0.6 + Math.random() * 0.4, 0.35, 0.03, 0.02);
  }
  glassBurst(x, y, z) {
    for (let k = 0; k < 18; k++) this.spawn(x, y, z, (Math.random() - 0.5) * 4, Math.random() * 2, (Math.random() - 0.5) * 4, 0.7 + Math.random() * 0.5, 0.7, 0.8, 0.85);
  }
  decal(x, z, L, s) {
    const m = new THREE.Mesh(this.decalGeo, this.decalMat);
    const y = L === 1 ? LEVEL_H + 0.02 : this.G.grid.groundY(0, x, z) + 0.015;
    m.position.set(x + (Math.random() - 0.5) * 0.4, y, z + (Math.random() - 0.5) * 0.4);
    m.rotation.y = Math.random() * 6.28;
    const sc = s * (0.7 + Math.random() * 0.6);
    m.scale.set(sc, 1, sc);
    this.group.add(m);
    this.decals.push(m);
    if (this.decals.length > 60) this.group.remove(this.decals.shift());
  }
  noiseRing(x, z, L, r) {
    const mat = new THREE.MeshBasicMaterial({ color: r > 14 ? 0xc8553a : 0xe6a23c, transparent: true, opacity: 0.5, depthWrite: false, fog: false });
    const m = new THREE.Mesh(this.ringGeo, mat);
    const y = L === 1 ? LEVEL_H + 0.06 : this.G.grid.groundY(0, x, z) + 0.06;
    m.position.set(x, y, z);
    m.scale.setScalar(0.3);
    this.group.add(m);
    this.rings.push({ m, r, t: 0 });
    if (this.rings.length > 12) {
      const o = this.rings.shift();
      this.group.remove(o.m);
      o.m.material.dispose();
    }
  }
  fire(x, y, z, sec) {
    const m = new THREE.Mesh(this.flameGeo, this.flameMat);
    m.position.set(x, y, z);
    m.scale.set(2.2, 1.6, 2.2);
    this.group.add(m);
    this.fires.push({ x, y, z, t: sec, m });
  }
  birdsFlock(cx, cz, dirX, dirZ) {
    for (let k = 0; k < 14; k++) {
      const m = new THREE.Mesh(this.birdGeo, this.birdMat);
      m.position.set(cx + (Math.random() - 0.5) * 8, 4 + Math.random() * 3, cz + (Math.random() - 0.5) * 8);
      this.group.add(m);
      this.birds.push({ m, vx: dirX * (6 + Math.random() * 3) + (Math.random() - 0.5) * 2, vy: 2 + Math.random() * 2, vz: dirZ * (6 + Math.random() * 3) + (Math.random() - 0.5) * 2, t: 0, ph: Math.random() * 6 });
    }
    this.G.audio.play('flock', cx, 5, cz, 1);
  }
  projectileMesh(it) {
    const d = ITEMS[it.id];
    const geo = d.ic === 'bottle' ? new THREE.CylinderGeometry(0.035, 0.04, 0.25, 6) : d.ic === 'can' ? new THREE.CylinderGeometry(0.035, 0.035, 0.11, 6) : new THREE.BoxGeometry(0.1, 0.08, 0.1);
    const m = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color: new THREE.Color(d.col || '#888') }));
    this.group.add(m);
    return m;
  }
  removeMesh(m) {
    if (!m) return;
    this.group.remove(m);
    m.geometry.dispose();
  }

  buildGhost(piece, pl, ok) {
    const g = this.ghost;
    if (!piece || !pl) {
      g.visible = false;
      return;
    }
    g.visible = true;
    g.material.color.setHex(ok ? 0x7fae6a : 0xc8553a);
    const base = pl.L * LEVEL_H;
    if (pl.kind === 'edge') {
      const h = piece.fence ? (piece.fence === 'high' ? 2.1 : 1) : LEVEL_H;
      if (pl.o === 0) {
        g.position.set(pl.i + 0.5, base + h / 2, pl.j);
        g.scale.set(1, h, 0.14);
      } else {
        g.position.set(pl.i, base + h / 2, pl.j + 0.5);
        g.scale.set(0.14, h, 1);
      }
    } else if (pl.kind === 'tower') {
      g.position.set(pl.i + 1, base + 1.6, pl.j + 1);
      g.scale.set(2, 3.2, 2);
    } else {
      const sz = piece.size || [1, 1];
      const furn = piece.furn;
      const h = piece.kind === 'cell' && !furn ? 0.16 : 0.9;
      const w = pl.rot % 2 === 0 ? sz[0] : sz[1], d = pl.rot % 2 === 0 ? sz[1] : sz[0];
      g.position.set(pl.i + w / 2, base + h / 2, pl.j + d / 2);
      g.scale.set(w, h, d);
    }
  }

  update(dt) {
    const G = this.G;
    // particelle
    const pos = this.pgeo.attributes.position.array, col = this.pgeo.attributes.color.array;
    for (let k = 0; k < this.N; k++) {
      const p = this.pp[k];
      if (p.life > 0) {
        p.life -= dt;
        p.vy -= p.grav * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        const gy = G.grid.groundY(p.y > LEVEL_H ? 1 : 0, p.x, p.z) + 0.02;
        if (p.y < gy) {
          p.y = gy;
          p.vx *= 0.3;
          p.vz *= 0.3;
          p.vy = 0;
        }
        pos[k * 3] = p.x;
        pos[k * 3 + 1] = p.y;
        pos[k * 3 + 2] = p.z;
        col[k * 3] = p.r;
        col[k * 3 + 1] = p.g;
        col[k * 3 + 2] = p.b;
      } else pos[k * 3 + 1] = -1000;
    }
    this.pgeo.attributes.position.needsUpdate = true;
    this.pgeo.attributes.color.needsUpdate = true;
    // anelli
    for (const r of this.rings) {
      r.t += dt;
      const u = Math.min(1, r.t / 0.9);
      r.m.scale.setScalar(0.3 + (r.r - 0.3) * u);
      r.m.material.opacity = 0.5 * (1 - u);
    }
    this.rings = this.rings.filter((r) => {
      if (r.t >= 0.9) {
        this.group.remove(r.m);
        r.m.material.dispose();
        return false;
      }
      return true;
    });
    // fuochi (cadaveri che bruciano)
    for (const f of this.fires) {
      f.t -= dt;
      f.m.scale.y = 1.4 + Math.sin(G.time * 17 + f.x) * 0.3;
      f.m.rotation.y += dt * 2;
      if (Math.random() < 0.3) this.spawn(f.x + (Math.random() - 0.5) * 0.6, f.y + 0.6, f.z + (Math.random() - 0.5) * 0.6, 0, 1.2, 0, 0.8, 1, 0.55, 0.15, -0.5);
    }
    this.fires = this.fires.filter((f) => {
      if (f.t <= 0) {
        this.group.remove(f.m);
        return false;
      }
      return true;
    });
    // fiamme dei falò accesi
    const seen = new Set();
    for (const s of G.base.lightSources) {
      if (!s.fire) continue;
      const key = s.x + ',' + s.z;
      seen.add(key);
      let m = this.campfireFlames.get(key);
      if (!m) {
        m = new THREE.Mesh(this.flameGeo, this.flameMat);
        m.position.set(s.x, s.y - 0.55, s.z);
        this.group.add(m);
        this.campfireFlames.set(key, m);
      }
      m.scale.set(1, 0.9 + Math.sin(G.time * 13 + s.x) * 0.25, 1);
      if (Math.random() < 0.15) this.spawn(s.x + (Math.random() - 0.5) * 0.3, s.y, s.z + (Math.random() - 0.5) * 0.3, (Math.random() - 0.5) * 0.3, 1.5, (Math.random() - 0.5) * 0.3, 0.9, 1, 0.6, 0.2, -0.6);
    }
    for (const [k, m] of this.campfireFlames) if (!seen.has(k)) {
      this.group.remove(m);
      this.campfireFlames.delete(k);
    }
    // uccelli
    for (const b of this.birds) {
      b.t += dt;
      b.m.position.x += b.vx * dt;
      b.m.position.y += b.vy * dt;
      b.m.position.z += b.vz * dt;
      b.m.rotation.y = Math.atan2(b.vx, b.vz);
      b.m.scale.y = 1;
      b.m.rotation.z = Math.sin(G.time * 18 + b.ph) * 0.6;
    }
    this.birds = this.birds.filter((b) => {
      if (b.t > 7) {
        this.group.remove(b.m);
        return false;
      }
      return true;
    });
  }

  // assegna le tre luci puntiformi alle sorgenti più vicine
  assignLights(lights) {
    const G = this.G;
    const p = G.player;
    const src = G.base.lightSources.slice().sort((a, b) => Math.hypot(a.x - p.x, a.z - p.z) - Math.hypot(b.x - p.x, b.z - p.z));
    for (const f of this.fires) src.push({ x: f.x, z: f.z, y: f.y + 0.6, r: 9, col: 0xff8a3a, flicker: true });
    for (let k = 0; k < lights.length; k++) {
      const l = lights[k];
      const s = src[k];
      if (!s || Math.hypot(s.x - p.x, s.z - p.z) > 30) {
        l.intensity = 0;
        continue;
      }
      l.position.set(s.x, s.y !== undefined ? s.y : 1.5, s.z);
      l.color.setHex(s.col || 0xffc890);
      l.distance = s.r * 1.5;
      const fl = s.flicker ? 0.85 + Math.sin(G.time * 23 + k) * 0.08 + Math.sin(G.time * 37) * 0.07 : 1;
      l.intensity = (s.player ? 3.2 : s.lamp ? 4 : 6) * fl;
    }
  }
}

export { BUILD };
