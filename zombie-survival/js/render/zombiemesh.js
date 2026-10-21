// Modelli degli zombie: SkinnedMesh procedurali (una draw call ciascuno), condivisi in un pool.
// Solo gli zombie vicini hanno un modello; quelli lontani sono simulati senza modello 3D.
// Smembramento: l'osso dell'arto perso viene azzerato e l'arto cade a terra come oggetto separato.
import * as THREE from 'three';
import { GeoBuilder, lin, shadeCol } from './geom.js';
import { Z } from '../sim/zombies.js';
import { clamp } from '../core/util.js';

// ossa: 0 bacino, 1 addome, 2 petto, 3 collo, 4 testa, 5 braccioS, 6 avambraccioS, 7 braccioD, 8 avambraccioD,
// 9 cosciaS, 10 gambaS, 11 cosciaD, 12 gambaD
const BONES = [
  { p: -1, pos: [0, 0.95, 0] },
  { p: 0, pos: [0, 0.14, 0] },
  { p: 1, pos: [0, 0.24, 0] },
  { p: 2, pos: [0, 0.3, 0] },
  { p: 3, pos: [0, 0.08, 0] },
  { p: 2, pos: [-0.22, 0.24, 0] },
  { p: 5, pos: [0, -0.3, 0] },
  { p: 2, pos: [0.22, 0.24, 0] },
  { p: 7, pos: [0, -0.3, 0] },
  { p: 0, pos: [-0.1, -0.04, 0] },
  { p: 9, pos: [0, -0.44, 0] },
  { p: 0, pos: [0.1, -0.04, 0] },
  { p: 11, pos: [0, -0.44, 0] },
];
// posizione assoluta (bind) di ogni osso
const ABS = [];
BONES.forEach((b, k) => {
  const pp = b.p >= 0 ? ABS[b.p] : [0, 0, 0];
  ABS[k] = [pp[0] + b.pos[0], pp[1] + b.pos[1], pp[2] + b.pos[2]];
});

const SKINS = [0x8a9a86, 0x9aa08c, 0x7f8a7a, 0xa0a492, 0x8e8a80, 0x869282];
const SHIRTS = [0x5a6a7a, 0x7a3a32, 0x3a4a3a, 0xa8a49a, 0x2f3a4a, 0x6a5a3a, 0x8a7a6a, 0x4a3a4a, 0x9a8a5a, 0x3a5a6a];
const PANTS = [0x2f3a4a, 0x3a3a36, 0x4a4032, 0x23262a, 0x5a5a52, 0x3a4a5a];

function buildGeometry(variant) {
  const b = new GeoBuilder();
  const skin = lin(SKINS[variant % SKINS.length]);
  const shirt = lin(SHIRTS[(variant * 3 + 1) % SHIRTS.length]);
  const pants = lin(PANTS[(variant * 5 + 2) % PANTS.length]);
  const blood = lin(0x5a1a16);
  const parts = [];
  const add = (bone, x0, y0, z0, x1, y1, z1, col) => {
    const before = countVerts(b);
    b.box('k', x0, y0, z0, x1, y1, z1, col, { uv: 0.5 });
    parts.push({ bone, from: before, to: countVerts(b) });
  };
  const A = (k) => ABS[k];
  // bacino e busto
  add(0, -0.17, A(0)[1] - 0.12, -0.1, 0.17, A(0)[1] + 0.1, 0.1, pants);
  add(1, -0.16, A(1)[1] - 0.04, -0.09, 0.16, A(1)[1] + 0.2, 0.09, variant % 3 === 0 ? blood : shirt);
  add(2, -0.2, A(2)[1] - 0.06, -0.11, 0.2, A(2)[1] + 0.26, 0.11, shirt);
  add(3, -0.05, A(3)[1] - 0.04, -0.05, 0.05, A(3)[1] + 0.06, 0.05, skin);
  // testa con occhi infossati e mascella
  add(4, -0.11, A(4)[1], -0.12, 0.11, A(4)[1] + 0.25, 0.11, skin);
  add(4, -0.08, A(4)[1] + 0.12, 0.11, -0.025, A(4)[1] + 0.16, 0.12, lin(0x1a1414));
  add(4, 0.025, A(4)[1] + 0.12, 0.11, 0.08, A(4)[1] + 0.16, 0.12, lin(0x1a1414));
  add(4, -0.07, A(4)[1] + 0.02, 0.1, 0.07, A(4)[1] + 0.06, 0.125, variant % 2 ? blood : shadeCol(skin, 0.7));
  add(4, -0.115, A(4)[1] + 0.18, -0.125, 0.115, A(4)[1] + 0.26, 0.09, shadeCol(skin, 0.55));
  // braccia
  for (const [ub, lb, s] of [[5, 6, -1], [7, 8, 1]]) {
    const x = A(ub)[0];
    add(ub, x - 0.055, A(ub)[1] - 0.32, -0.055, x + 0.055, A(ub)[1] + 0.03, 0.055, shirt);
    add(lb, x - 0.048, A(lb)[1] - 0.29, -0.048, x + 0.048, A(lb)[1] + 0.01, 0.048, (variant + s) % 4 === 0 ? blood : skin);
    add(lb, x - 0.05, A(lb)[1] - 0.4, -0.03, x + 0.05, A(lb)[1] - 0.29, 0.04, skin);
  }
  // gambe
  for (const [ub, lb] of [[9, 10], [11, 12]]) {
    const x = A(ub)[0];
    add(ub, x - 0.075, A(ub)[1] - 0.45, -0.08, x + 0.075, A(ub)[1] + 0.02, 0.08, pants);
    add(lb, x - 0.06, A(lb)[1] - 0.42, -0.065, x + 0.06, A(lb)[1] + 0.01, 0.065, pants);
    add(lb, x - 0.06, A(lb)[1] - 0.5, -0.07, x + 0.06, A(lb)[1] - 0.42, 0.15, lin(0x2a2420));
  }
  const geo = b.buildOne();
  const n = geo.attributes.position.count;
  const si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
  for (const p of parts) {
    for (let v = p.from; v < p.to; v++) {
      si[v * 4] = p.bone;
      sw[v * 4] = 1;
    }
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(sw, 4));
  geo.userData.cols = { skin, shirt, pants };
  return geo;
}

function countVerts(b) {
  let n = 0;
  for (const a of b.g.values()) n += a.v;
  return n;
}

function makeSkeleton() {
  const bones = BONES.map((d) => {
    const bn = new THREE.Bone();
    bn.position.set(d.pos[0], d.pos[1], d.pos[2]);
    return bn;
  });
  BONES.forEach((d, k) => {
    if (d.p >= 0) bones[d.p].add(bones[k]);
  });
  return new THREE.Skeleton(bones);
}

export class ZombieMeshes {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'zombies';
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: G.tex.zombie });
    this.geos = [];
    for (let v = 0; v < 8; v++) this.geos.push(buildGeometry(v));
    this.special = null;
    this.pool = [];
    const n = G.quality.zombieMeshes;
    for (let k = 0; k < n; k++) {
      const sk = makeSkeleton();
      const m = new THREE.SkinnedMesh(this.geos[0], this.mat);
      m.add(sk.bones[0]);
      m.bind(sk);
      m.frustumCulled = false;
      m.visible = false;
      m.castShadow = false;
      this.shadowOk = G.quality.shadows && G.quality.shadowSize >= 2048;
      m.userData.zid = 0;
      this.pool.push(m);
      this.group.add(m);
    }
    // arti staccati e cadaveri
    this.limbs = [];
    this.limbGeo = {
      arm: (() => {
        const b = new GeoBuilder();
        b.box('k', -0.05, -0.3, -0.05, 0.05, 0.3, 0.05, lin(0x8a9a86));
        b.box('k', -0.06, 0.15, -0.06, 0.06, 0.32, 0.06, lin(0x5a6a7a));
        return b.buildOne();
      })(),
      leg: (() => {
        const b = new GeoBuilder();
        b.box('k', -0.07, -0.42, -0.07, 0.07, 0.42, 0.07, lin(0x2f3a4a));
        b.box('k', -0.06, -0.5, -0.06, 0.06, -0.42, 0.14, lin(0x2a2420));
        return b.buildOne();
      })(),
    };
    this.corpseMeshes = [];
    for (let k = 0; k < 28; k++) {
      const m = new THREE.Mesh(this.geos[0], this.mat);
      m.visible = false;
      this.corpseMeshes.push(m);
    }
    this.corpseGeos = this.geos.map((g) => this.bakeCorpse(g));
    for (const m of this.corpseMeshes) {
      m.geometry = this.corpseGeos[0];
      this.group.add(m);
    }
    this.flies = null;
  }

  // posa distesa "cotta" nella geometria, per i cadaveri statici
  bakeCorpse(geo) {
    const sk = makeSkeleton();
    const m = new THREE.SkinnedMesh(geo, this.mat);
    m.add(sk.bones[0]);
    m.bind(sk);
    const b = sk.bones;
    b[0].position.set(0, 0.12, 0);
    b[0].rotation.x = -Math.PI / 2;
    b[5].rotation.z = -0.9;
    b[7].rotation.z = 1.1;
    b[6].rotation.x = -0.4;
    b[9].rotation.z = -0.15;
    b[11].rotation.z = 0.25;
    b[10].rotation.x = 0.3;
    b[4].rotation.y = 0.6;
    m.updateMatrixWorld(true);
    sk.update();
    const pos = geo.attributes.position;
    const out = new Float32Array(pos.count * 3);
    const v = new THREE.Vector3();
    for (let k = 0; k < pos.count; k++) {
      v.fromBufferAttribute(pos, k);
      m.applyBoneTransform(k, v);
      out[k * 3] = v.x;
      out[k * 3 + 1] = v.y;
      out[k * 3 + 2] = v.z;
    }
    const g2 = new THREE.BufferGeometry();
    g2.setAttribute('position', new THREE.BufferAttribute(out, 3));
    g2.setAttribute('color', geo.attributes.color);
    g2.setAttribute('uv', geo.attributes.uv);
    g2.setIndex(geo.index);
    g2.computeVertexNormals();
    return g2;
  }

  dispose() {
    this.group.clear();
  }

  // assegna i modelli agli zombie più vicini e li anima
  update(dt, time) {
    const G = this.G;
    const p = G.player;
    const cull = Math.min(G.sky.state.fogFar + 6, G.quality.viewDist);
    const cands = [];
    // fuori dal campo visivo (alle spalle) non serve disegnarli: le skinned mesh costano
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    for (const zb of G.zombies.list) {
      if (zb.removed) continue;
      const dx = zb.x - p.x, dz = zb.z - p.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= cull * cull) continue;
      if (d2 > 9 && (dx * fx + dz * fz) / Math.sqrt(d2) < 0.25) continue;
      cands.push([d2, zb]);
    }
    cands.sort((a, b) => a[0] - b[0]);
    const want = new Set();
    for (let k = 0; k < Math.min(cands.length, this.pool.length); k++) want.add(cands[k][1].id);
    const byId = new Map();
    for (const m of this.pool) {
      if (m.userData.zid && want.has(m.userData.zid)) byId.set(m.userData.zid, m);
      else {
        m.userData.zid = 0;
        m.visible = false;
      }
    }
    const free = this.pool.filter((m) => !m.userData.zid);
    for (let k = 0; k < Math.min(cands.length, this.pool.length); k++) {
      const zb = cands[k][1];
      let m = byId.get(zb.id);
      if (!m) {
        m = free.pop();
        if (!m) break;
        m.userData.zid = zb.id;
        m.geometry = this.geos[zb.variant % this.geos.length];
        if (zb.special === 'oldself' && G.player.oldGeo) m.geometry = G.player.oldGeo;
      }
      m.visible = true;
      if (this.shadowOk) m.castShadow = cands[k][0] < 400;
      this.pose(m, zb, dt, time);
    }
    this.updateLimbs(dt);
    this.updateCorpses();
  }

  pose(m, zb, dt, time) {
    const b = m.skeleton.bones;
    m.position.set(zb.x, zb.y, zb.z);
    m.rotation.y = zb.yaw;
    const ph = zb.phase;
    const walk = zb.state === Z.WANDER || zb.state === Z.INVEST || zb.state === Z.CHASE;
    const sp = zb.state === Z.CHASE ? 1 : 0.7;
    // reset
    for (const bn of b) bn.rotation.set(0, 0, 0);
    b[0].position.set(0, 0.95, 0);
    // arti persi
    const lose = (k, flag) => b[k].scale.setScalar(flag ? 0.0001 : 1);
    lose(5, zb.lost.armL);
    lose(7, zb.lost.armR);
    lose(9, zb.lost.legL);
    lose(11, zb.lost.legR);
    const sway = Math.sin(time * 1.3 + zb.id) * 0.06;
    if (zb.state === Z.DOWN && !zb.crawler) {
      // a terra sulla schiena, si dimena
      b[0].position.set(0, 0.16, 0);
      b[0].rotation.x = -Math.PI / 2 + 0.1;
      b[5].rotation.z = -1.2 + Math.sin(time * 6 + zb.id) * 0.4;
      b[7].rotation.z = 1.2 + Math.sin(time * 5 + zb.id) * 0.4;
      b[9].rotation.x = Math.sin(time * 4) * 0.3;
      b[11].rotation.x = -Math.sin(time * 4) * 0.3;
      b[4].rotation.y = Math.sin(time * 3 + zb.id) * 0.5;
      return;
    }
    if (zb.crawler) {
      // striscia a pancia in giù tirandosi con le braccia
      b[0].position.set(0, 0.2, -0.35);
      b[0].rotation.x = Math.PI / 2 - 0.08;
      b[2].rotation.x = -0.25;
      b[4].rotation.x = -0.9;
      const c = Math.sin(ph * 1.6);
      b[5].rotation.x = -2.6 + c * 0.6;
      b[7].rotation.x = -2.6 - c * 0.6;
      b[9].rotation.x = 0.1;
      b[11].rotation.x = 0.15;
      return;
    }
    const lean = zb.state === Z.CHASE ? 0.32 : 0.18;
    b[1].rotation.x = lean + sway * 0.5;
    b[2].rotation.x = 0.08;
    b[4].rotation.x = -0.25 + Math.sin(time * 0.9 + zb.id) * 0.12;
    b[4].rotation.z = zb.look * 0.35 + sway;
    // camminata trascinata
    const legAmp = walk ? 0.5 * sp : 0.04;
    const c = Math.sin(ph), c2 = Math.sin(ph + Math.PI);
    const limp = zb.hp.legL < 0.5 ? 0.4 : 1;
    b[9].rotation.x = c * legAmp * limp;
    b[11].rotation.x = c2 * legAmp;
    b[10].rotation.x = Math.max(0, -Math.cos(ph)) * 0.7 * legAmp + 0.05;
    b[12].rotation.x = Math.max(0, -Math.cos(ph + Math.PI)) * 0.7 * legAmp + 0.05;
    b[0].position.y = 0.95 - Math.abs(Math.sin(ph)) * 0.04 * (walk ? 1 : 0);
    b[0].rotation.z = Math.sin(ph) * 0.06 * (walk ? 1 : 0.3);
    // braccia protese o penzolanti
    const reach = zb.state === Z.CHASE || zb.state === Z.ATTACK || zb.state === Z.BASH ? 1 : zb.variant % 3 === 0 ? 0.6 : 0.15;
    const lunge = zb.lunge || 0;
    b[5].rotation.x = -1.35 * reach - lunge * 0.4 + c2 * 0.15;
    b[7].rotation.x = -1.35 * reach - lunge * 0.5 + c * 0.15;
    b[5].rotation.z = -0.1 - (1 - reach) * 0.05;
    b[7].rotation.z = 0.1 + (1 - reach) * 0.05;
    b[6].rotation.x = -0.2 * reach;
    b[8].rotation.x = -0.3 * reach;
    if (zb.state === Z.ATTACK) {
      b[1].rotation.x = lean + lunge * 0.35;
      b[4].rotation.x = -0.1 + lunge * 0.3;
    }
    if (zb.state === Z.BASH) {
      const hit = lunge;
      b[5].rotation.x = -2.1 + hit * 0.9;
      b[7].rotation.x = -2.0 + hit * 0.8;
      b[1].rotation.x = 0.25 + hit * 0.2;
    }
    if (zb.state === Z.CLIMB) {
      b[0].position.y = 0.75;
      b[1].rotation.x = 0.9;
      b[5].rotation.x = -1.6;
      b[7].rotation.x = -1.5;
      b[9].rotation.x = -0.8;
    }
    if (zb.stagger > 0) {
      b[1].rotation.x = -0.25;
      b[4].rotation.x = -0.4;
    }
    if (zb.hitT > 0) {
      b[2].rotation.y = Math.sin(zb.hitT * 30) * 0.15;
    }
  }

  // ---------------------------------------------------------------- arti staccati
  dropLimb(zb, zone) {
    const isArm = zone.startsWith('arm');
    const m = new THREE.Mesh(isArm ? this.limbGeo.arm : this.limbGeo.leg, this.mat);
    const side = zone.endsWith('L') ? -1 : 1;
    const c = Math.cos(zb.yaw), s = Math.sin(zb.yaw);
    const lx = side * (isArm ? 0.25 : 0.1);
    m.position.set(zb.x + lx * c, zb.y + (isArm ? 1.25 : 0.5), zb.z - lx * s);
    m.rotation.set(Math.random(), zb.yaw, Math.random());
    this.group.add(m);
    this.limbs.push({ m, vx: (Math.random() - 0.5) * 2 + side * c, vy: 2 + Math.random(), vz: (Math.random() - 0.5) * 2 - side * s, rest: false, t: 0, ground: zb.y });
    if (this.limbs.length > 30) {
      const old = this.limbs.shift();
      this.group.remove(old.m);
    }
  }

  updateLimbs(dt) {
    for (const l of this.limbs) {
      if (l.rest) continue;
      l.t += dt;
      l.vy -= 9.8 * dt;
      l.m.position.x += l.vx * dt;
      l.m.position.y += l.vy * dt;
      l.m.position.z += l.vz * dt;
      l.m.rotation.x += dt * 6;
      if (l.m.position.y <= l.ground + 0.06) {
        l.m.position.y = l.ground + 0.06;
        l.m.rotation.x = Math.PI / 2;
        l.rest = true;
      }
    }
  }

  // ---------------------------------------------------------------- cadaveri
  updateCorpses() {
    const G = this.G;
    const p = G.player;
    const list = G.world.corpses;
    const near = [];
    for (const c of list) {
      const d2 = (c.x - p.x) ** 2 + (c.z - p.z) ** 2;
      if (d2 < 45 * 45 && !c.carried) near.push([d2, c]);
    }
    near.sort((a, b) => a[0] - b[0]);
    for (let k = 0; k < this.corpseMeshes.length; k++) {
      const m = this.corpseMeshes[k];
      const e = near[k];
      if (!e) {
        m.visible = false;
        continue;
      }
      const c = e[1];
      m.visible = true;
      m.geometry = c.special === 'oldself' && G.player.oldCorpseGeo ? G.player.oldCorpseGeo : this.corpseGeos[c.variant % this.corpseGeos.length];
      const gy = c.y !== undefined ? c.y : G.grid.groundY(c.L, c.x, c.z);
      m.position.set(c.x, gy + 0.02, c.z);
      m.rotation.y = c.yaw;
      const age = (G.clock.min - c.t) / 1440;
      const burned = c.burned ? 0.25 : 1;
      m.scale.set(1, clamp(1 - age * 0.05, 0.7, 1), 1);
      m.material = burned < 1 ? this.burnMat || (this.burnMat = new THREE.MeshLambertMaterial({ color: 0x2a2420 })) : this.mat;
    }
  }

  // geometria personalizzata per il "vecchio te" diventato zombie
  makeCustom(variantColors) {
    const v = 0;
    const geo = buildGeometry(v);
    const col = geo.attributes.color;
    const { shirt, pants } = geo.userData.cols;
    const ns = lin(variantColors.shirt), np = lin(variantColors.pants);
    for (let k = 0; k < col.count; k++) {
      const r = col.getX(k), g = col.getY(k), b = col.getZ(k);
      if (Math.abs(r - shirt[0]) < 1e-4 && Math.abs(g - shirt[1]) < 1e-4 && Math.abs(b - shirt[2]) < 1e-4) col.setXYZ(k, ns[0], ns[1], ns[2]);
      else if (Math.abs(r - pants[0]) < 1e-4 && Math.abs(g - pants[1]) < 1e-4 && Math.abs(b - pants[2]) < 1e-4) col.setXYZ(k, np[0], np[1], np[2]);
    }
    return { geo, corpse: this.bakeCorpse(geo) };
  }
}
