// Oggetti del mondo che cambiano: porte, vetri, barricate, mobili, oggetti a terra, auto, scale,
// pezzi costruiti, carriole. Ogni cambiamento di stato arriva come evento e ricostruisce solo quel pezzo.
import * as THREE from 'three';
import { GeoBuilder, lin, shadeCol } from '../render/geom.js';
import { E, ST, F, FLOOR_INFO } from './grid.js';
import { LEVEL_H } from '../config.js';
import { FURN } from '../data/furniture.js';
import { buildFurnGeo, itemModel, carModel } from '../render/models.js';
import { windowSpan } from './worldmesh.js';

const ROT_Y = [0, Math.PI / 2, Math.PI, -Math.PI / 2];
// Gli oggetti sono uniti in blocchi da 24 m (una mesh per materiale per blocco): pochi draw call
// anche con migliaia di mobili, porte e finestre. Un cambiamento ricostruisce solo il suo blocco.
const CH = 24;

export class Dynamic {
  constructor(G) {
    this.G = G;
    this.group = new THREE.Group();
    this.group.name = 'dynamic';
    this.items = new Map();
    this.chunks = new Map();
    this.anims = new Map();
    this.doorAng = new Map();
    this.barrows = new Map();
    this.cullT = 0;
    const tex = G.tex;
    this.mats = {
      furn: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.grime }),
      planks: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.planks, side: THREE.DoubleSide }),
      metal: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.metal }),
      cement: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.concrete }),
      glass: new THREE.MeshLambertMaterial({ color: 0xa8c4d0, transparent: true, opacity: 0.25, depthWrite: false, side: THREE.DoubleSide }),
      cloth: new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }),
      chain: new THREE.MeshLambertMaterial({ map: tex.chain, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide }),
      car: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.grime }),
      wood: new THREE.MeshLambertMaterial({ vertexColors: true, map: tex.wood }),
    };
    for (const k in this.mats) this.mats[k].userData.key = k;
    // evidenziazione del bersaglio: solo gli angoli della scatola, non tutto il contorno
    const seg = [];
    for (const sx of [-0.5, 0.5])
      for (const sy of [-0.5, 0.5])
        for (const sz of [-0.5, 0.5]) {
          seg.push(sx, sy, sz, sx * 0.56, sy, sz);
          seg.push(sx, sy, sz, sx, sy * 0.56, sz);
          seg.push(sx, sy, sz, sx, sy, sz * 0.56);
        }
    const hl = new THREE.BufferGeometry();
    hl.setAttribute('position', new THREE.Float32BufferAttribute(seg, 3));
    this.hl = new THREE.LineSegments(hl, new THREE.LineBasicMaterial({ color: 0xe6a23c, transparent: true, opacity: 0.9, depthTest: true }));
    this.hl.visible = false;
    this.group.add(this.hl);
  }

  dispose() {
    for (const ch of this.chunks.values()) for (const m of ch.meshes) m.geometry.dispose();
    for (const it of this.items.values()) for (const p of it.parts) p.geo.dispose();
    for (const a of this.anims.values()) disposeTree(a.pivot);
    for (const m of this.barrows.values()) disposeTree(m);
    this.group.clear();
    this.group.add(this.hl);
    this.items.clear();
    this.chunks.clear();
    this.anims.clear();
    this.doorAng.clear();
    this.barrows.clear();
  }

  init(W) {
    this.W = W;
    this.building = true;
    for (const f of W.furn) if (!f.removed) this.updateFurn(f);
    for (const e of W.grid.edges.values()) this.updateEdge(e);
    for (const s of W.grid.stairs) this.updateStair(s);
    for (const c of W.cars) this.updateCar(c);
    for (const key of W.ground.keys()) this.updateGround(key);
    for (const [key] of W.builtFloors) this.updateFloor(key);
    for (const b of W.barrows) this.updateBarrow(b);
    this.building = false;
    for (const ch of this.chunks.values()) this.rebuildChunk(ch);
  }

  chunkAt(x, z) {
    const g = this.G.grid;
    const n = Math.ceil(g.W / CH);
    const cx = Math.max(0, Math.min(n - 1, Math.floor(x / CH))), cz = Math.max(0, Math.min(n - 1, Math.floor(z / CH)));
    const k = cz * n + cx;
    let ch = this.chunks.get(k);
    if (!ch) {
      ch = { keys: new Set(), meshes: [], dirty: false, x: (cx + 0.5) * CH, z: (cz + 0.5) * CH };
      this.chunks.set(k, ch);
    }
    return ch;
  }

  // un oggetto (gruppo three.js costruito al volo) diventa una lista di pezzi in coordinate del mondo
  setItem(key, obj, x, z) {
    this.removeItem(key);
    if (!obj) return;
    obj.updateMatrixWorld(true);
    const parts = [];
    obj.traverse((o) => {
      if (o.isMesh) parts.push({ mat: o.material.userData.key, geo: o.geometry, m: o.matrixWorld.clone() });
    });
    if (!parts.length) return;
    const ch = this.chunkAt(x, z);
    this.items.set(key, { ch, parts });
    ch.keys.add(key);
    ch.dirty = true;
  }
  removeItem(key) {
    const it = this.items.get(key);
    if (!it) return;
    for (const p of it.parts) p.geo.dispose();
    it.ch.keys.delete(key);
    it.ch.dirty = true;
    this.items.delete(key);
  }

  rebuildChunk(ch) {
    for (const m of ch.meshes) {
      this.group.remove(m);
      m.geometry.dispose();
    }
    ch.meshes = [];
    ch.dirty = false;
    const byMat = new Map();
    for (const key of ch.keys) {
      for (const p of this.items.get(key).parts) {
        let l = byMat.get(p.mat);
        if (!l) byMat.set(p.mat, (l = []));
        l.push(p);
      }
    }
    const shadows = this.G.quality.shadows;
    for (const [mk, parts] of byMat) {
      const mat = this.mats[mk];
      const mesh = new THREE.Mesh(mergeParts(parts, mat.vertexColors), mat);
      mesh.matrixAutoUpdate = false;
      mesh.receiveShadow = shadows && mk !== 'glass' && mk !== 'chain';
      mesh.castShadow = shadows && mk === 'car';
      if (mk === 'glass') mesh.renderOrder = 2;
      this.group.add(mesh);
      ch.meshes.push(mesh);
    }
  }

  // ---------------------------------------------------------------- mobili
  updateFurn(f) {
    if (f.removed || f.carried) {
      this.removeItem('f' + f.id);
      return;
    }
    f.def = FURN[f.type];
    const geo = buildFurnGeo(f);
    const m = new THREE.Mesh(geo, this.mats.furn);
    const [sw, sd] = f.def.sz;
    const pos = [[f.i, f.j], [f.i, f.j + sw], [f.i + sw, f.j + sd], [f.i + sd, f.j]][f.rot];
    const y = f.L === 1 ? LEVEL_H : this.G.grid.groundY(0, f.x, f.z);
    m.position.set(pos[0], y, pos[1]);
    m.rotation.y = ROT_Y[f.rot];
    if (f.type === 'garden') this.updateGarden(f, m);
    this.setItem('f' + f.id, m, f.x, f.z);
  }

  updateGarden(f, parent) {
    const s = f.state;
    if (!s.crop) return;
    const gr = Math.min(1.1, s.growth || 0);
    const b = new GeoBuilder();
    const dead = s.dead;
    const leaf = lin(dead ? 0x6a5a3a : s.water > 0.05 ? 0x4f8a3a : 0x8a8a3a);
    const n = 4;
    for (let k = 0; k < n; k++) {
      const x = 0.25 + (k % 2) * 0.5, z = 0.25 + Math.floor(k / 2) * 0.5;
      const h = 0.06 + gr * (s.crop === 'tomato' ? 0.7 : s.crop === 'cabbage' ? 0.28 : 0.35);
      const w = 0.04 + gr * (s.crop === 'cabbage' ? 0.18 : 0.1);
      b.box('k', x - w, 0.14, z - w, x + w, 0.14 + h, z + w, leaf);
      if (gr >= 1 && !dead) {
        const fruit = lin({ tomato: 0xd33a2c, carrot: 0xe07a2c, potato: 0x9a7a4a, cabbage: 0x8ab85a }[s.crop]);
        b.box('k', x - 0.05, 0.14 + h * 0.6, z - 0.05, x + 0.05, 0.14 + h * 0.6 + 0.08, z + 0.05, fruit);
      }
    }
    const m = new THREE.Mesh(b.buildOne(), this.mats.furn);
    parent.add(m);
  }

  // ---------------------------------------------------------------- lati
  updateEdge(e) {
    const g = this.G.grid;
    if (!g.edges.has(e.id)) {
      this.removeItem('e' + e.id);
      this.stopAnim(e.id);
      this.doorAng.delete(e.id);
      return;
    }
    const grp = new THREE.Group();
    const base = e.L * LEVEL_H;
    const cx = e.o === 0 ? e.i + 0.5 : e.i, cz = e.o === 0 ? e.j : e.j + 0.5;
    let any = false;
    if (e.built) {
      any = this.builtEdge(grp, e) || any;
    }
    if (e.t === E.DOOR) {
      any = this.doorPanel(grp, e, base) || any;
    } else if (e.t === E.WINDOW) {
      any = this.windowParts(grp, e, base) || any;
    }
    if (e.bar && e.bar.length || e.metal > 0) {
      any = this.barricadeParts(grp, e, base) || any;
    }
    this.setItem('e' + e.id, any ? grp : null, cx, cz);
  }

  edgeFrame(e) {
    // origine al centro del lato; asse locale x lungo il lato, z attraverso
    if (e.o === 0) return { ox: e.i + 0.5, oz: e.j, yaw: 0 };
    return { ox: e.i, oz: e.j + 0.5, yaw: -Math.PI / 2 };
  }

  doorPanel(grp, e, base) {
    if (e.st === ST.BROKEN) {
      this.stopAnim(e.id);
      this.doorAng.delete(e.id);
      // porta sfondata: resta a terra
      const fr = this.edgeFrame(e);
      const b = new GeoBuilder();
      b.box('k', -0.44, 0.0, 0.1, 0.44, 0.05, 1.0, lin(e.mat === 'metal' ? 0x6a7076 : 0x6a4a32));
      const m = new THREE.Mesh(b.buildOne(), e.mat === 'metal' ? this.mats.metal : this.mats.wood);
      m.position.set(fr.ox, base + this.G.grid.groundY(e.L, fr.ox, fr.oz) * (e.L === 0 ? 1 : 0), fr.oz);
      m.rotation.y = fr.yaw + (e.swing > 0 ? 0 : Math.PI) + 0.2;
      if (e.mat === 'glass') return false;
      grp.add(m);
      return true;
    }
    const fr = this.edgeFrame(e);
    const pivot = new THREE.Group();
    const hy = e.garage ? 2.3 : 2.08;
    pivot.position.set(fr.ox, base + (e.L === 0 ? 0.16 : 0), fr.oz);
    pivot.rotation.y = fr.yaw;
    const hinge = new THREE.Group();
    hinge.position.set(-0.44, 0, 0);
    pivot.add(hinge);
    const b = new GeoBuilder();
    let mat = this.mats.wood;
    if (e.mat === 'glass') {
      b.box('k', 0, 0, -0.025, 0.06, hy, 0.025, lin(0x2a2e30));
      b.box('k', 0.82, 0, -0.025, 0.88, hy, 0.025, lin(0x2a2e30));
      b.box('k', 0, 0, -0.025, 0.88, 0.1, 0.025, lin(0x2a2e30));
      b.box('k', 0, hy - 0.08, -0.025, 0.88, hy, 0.025, lin(0x2a2e30));
      b.box('k', 0.7, 0.95, -0.06, 0.74, 1.15, 0.06, lin(0xb8bcc0));
      mat = this.mats.metal;
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.76, hy - 0.18), this.mats.glass);
      gl.position.set(0.44, hy / 2, 0);
      hinge.add(gl);
    } else if (e.mat === 'chain') {
      b.box('k', 0, 0, -0.03, 0.05, 2.0, 0.03, lin(0x7d8a90));
      b.box('k', 0.85, 0, -0.03, 0.9, 2.0, 0.03, lin(0x7d8a90));
      b.box('k', 0, 1.95, -0.03, 0.9, 2.0, 0.03, lin(0x7d8a90));
      b.box('k', 0, 0, -0.03, 0.9, 0.05, 0.03, lin(0x7d8a90));
      mat = this.mats.metal;
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.9), this.mats.chain);
      ch.position.set(0.45, 1.0, 0);
      hinge.add(ch);
    } else {
      const c = e.mat === 'metal' ? lin(0x7a8288) : lin(e.ext ? 0x6a4630 : 0x9a7a5a);
      if (e.mat === 'metal') mat = this.mats.metal;
      b.box('k', 0, 0, -0.025, 0.88, hy, 0.025, c);
      if (e.mat !== 'metal') {
        b.box('k', 0.1, 0.25, -0.03, 0.78, 0.95, 0.03, shadeCol(c, 0.88));
        b.box('k', 0.1, 1.15, -0.03, 0.78, hy - 0.2, 0.03, shadeCol(c, 0.88));
      }
      b.box('k', 0.74, 0.98, -0.07, 0.8, 1.04, 0.07, lin(0xc8c0a0));
    }
    const panel = new THREE.Mesh(b.buildOne(), mat);
    hinge.add(panel);
    // apre verso il lato scelto (swing): angolo rispetto all'asse del lato
    const openAng = e.o === 0 ? (e.swing > 0 ? -Math.PI / 2 : Math.PI / 2) : e.swing > 0 ? Math.PI / 2 : -Math.PI / 2;
    const target = e.st === ST.OPEN ? openAng * 0.95 : 0;
    const running = this.anims.get(e.id);
    const cur = running ? running.hinge.rotation.y : this.doorAng.has(e.id) ? this.doorAng.get(e.id) : target;
    this.stopAnim(e.id);
    const cam = this.G.camera.position;
    if (!this.building && Math.abs(cur - target) > 0.01 && Math.hypot(fr.ox - cam.x, fr.oz - cam.z) < 40) {
      hinge.rotation.y = cur;
      this.anims.set(e.id, { e, pivot, hinge, target });
      this.group.add(pivot);
      return false;
    }
    hinge.rotation.y = target;
    this.doorAng.set(e.id, target);
    grp.add(pivot);
    return true;
  }

  stopAnim(id) {
    const a = this.anims.get(id);
    if (!a) return;
    this.group.remove(a.pivot);
    disposeTree(a.pivot);
    this.anims.delete(id);
  }

  windowParts(grp, e, base) {
    const fr = this.edgeFrame(e);
    const [ws, wt] = windowSpan(e);
    const hgt = wt - ws;
    const root = new THREE.Group();
    root.position.set(fr.ox, base, fr.oz);
    root.rotation.y = fr.yaw;
    grp.add(root);
    if (e.st === ST.CLOSED) {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.88, hgt - 0.08), this.mats.glass);
      gl.position.set(0, ws + hgt / 2, 0);
      root.add(gl);
      if (!e.shop) {
        const b = new GeoBuilder();
        b.box('k', -0.44, ws + hgt / 2 - 0.02, -0.02, 0.44, ws + hgt / 2 + 0.02, 0.02, lin(0xe8e4da));
        b.box('k', -0.02, ws, -0.02, 0.02, wt, 0.02, lin(0xe8e4da));
        root.add(new THREE.Mesh(b.buildOne(), this.mats.furn));
      }
    } else if (e.st === ST.OPEN) {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(0.88, hgt / 2), this.mats.glass);
      gl.position.set(0, wt - hgt / 4, 0.04);
      root.add(gl);
    } else if (e.st === ST.BROKEN && !e.cleared) {
        const pos = [], k = e.id;
      for (let n = 0; n < 5; n++) {
        const x = -0.4 + ((k * 7 + n * 13) % 9) * 0.1;
        const top = n % 2 === 0;
        const y0 = top ? wt - 0.04 : ws + 0.04;
        const y1 = top ? wt - 0.12 - ((k + n) % 4) * 0.06 : ws + 0.12 + ((k + n * 3) % 4) * 0.07;
        pos.push([x, y0, x + 0.12, y1]);
      }
      const geo = new THREE.BufferGeometry();
      const arr = [];
      for (const [x0, y0, x1, y1] of pos) arr.push(x0, y0, 0, x1, y0, 0, (x0 + x1) / 2, y1, 0);
      geo.setAttribute('position', new THREE.Float32BufferAttribute(arr, 3));
      geo.computeVertexNormals();
      root.add(new THREE.Mesh(geo, this.mats.glass));
    }
    // tende o lenzuolo (dal lato interno)
    if (e.cover || e.curtain) {
      const side = this.insideSide(e);
      const b = new GeoBuilder();
      const cc = lin(e.cover ? 0xd8d0bc : 0x8a5a4a);
      if (e.cover) {
        b.box('k', -0.5, ws - 0.05, side * 0.11, 0.5, wt + 0.05, side * 0.11 + side * 0.01, cc);
      } else {
        b.box('k', -0.5, ws - 0.1, side * 0.11, -0.25, wt + 0.08, side * 0.11 + side * 0.01, cc);
        b.box('k', 0.25, ws - 0.1, side * 0.11, 0.5, wt + 0.08, side * 0.11 + side * 0.01, cc);
      }
      root.add(new THREE.Mesh(b.buildOne(), this.mats.cloth));
    }
    return true;
  }

  insideSide(e) {
    // +1 se l'interno è dal lato della cella (i,j), -1 se dal lato opposto
    const g = this.G.grid;
    const [a, b] = g.edgeCells(e);
    const ra = g.roomAt(e.L, a[0], a[1]), rb = g.roomAt(e.L, b[0], b[1]);
    if (rb >= 0 && ra < 0) return 1;
    if (ra >= 0 && rb < 0) return -1;
    return e.barSide || 1;
  }

  barricadeParts(grp, e, base) {
    const fr = this.edgeFrame(e);
    const root = new THREE.Group();
    root.position.set(fr.ox, base, fr.oz);
    root.rotation.y = fr.yaw;
    grp.add(root);
    const side = e.barSide || this.insideSide(e);
    const b = new GeoBuilder();
    const isWin = e.t === E.WINDOW;
    const [ws, wt] = isWin ? windowSpan(e) : [0.2, 2.0];
    const z = side * 0.12;
    if (e.metal > 0) {
      const dmg = 1 - e.metal / (e.metalMax || 220);
      b.box('k', -0.52, ws - 0.08, z, 0.52, wt + 0.08, z + side * 0.02, shadeCol(lin(0x8a949a), 1 - dmg * 0.4));
      root.add(new THREE.Mesh(b.buildOne(), this.mats.metal));
      return true;
    }
    const n = e.bar.length;
    for (let k = 0; k < n; k++) {
      const t = (k + 0.5) / 4;
      const y = ws + (wt - ws) * (n === 1 ? 0.5 : t);
      const tilt = ((e.id * 13 + k * 7) % 11 - 5) * 0.025;
      const hpR = e.bar[k] / (e.barMax || 45);
      const c = shadeCol(lin(0xa8845a), 0.6 + hpR * 0.4);
      const yy = y;
      // asse inclinata: due vertici alti diversi
      const P = (x, dy) => [x, yy + dy + x * tilt, z + side * (0.01 + k * 0.012)];
      const h = 0.09;
      b.quadAuto('k', side > 0 ? [P(-0.6, -h), P(0.6, -h), P(0.6, h), P(-0.6, h)] : [P(0.6, -h), P(-0.6, -h), P(-0.6, h), P(0.6, h)], c, 1);
      b.box('k', -0.6, yy - h + -0.6 * tilt, z + side * 0.005 - 0.015, -0.55, yy + h - 0.6 * tilt, z + side * 0.005 + 0.015, shadeCol(c, 0.6));
    }
    root.add(new THREE.Mesh(b.buildOne(), this.mats.planks));
    return true;
  }

  builtEdge(grp, e) {
    const base = e.L * LEVEL_H;
    const b = new GeoBuilder();
    const hpR = e.maxHp ? Math.max(0.15, e.hp / e.maxHp) : 1;
    const mat = e.bmat || 'wood';
    const c = shadeCol(lin(mat === 'wood' ? 0xb08a5a : mat === 'metal' ? 0x9aa4aa : 0xb8b4ac), 0.55 + 0.45 * hpR);
    const t = mat === 'cement' ? 0.12 : 0.07;
    const fr = this.edgeFrame(e);
    const root = new THREE.Group();
    root.position.set(fr.ox, base + (e.L === 0 ? 0.14 : 0), fr.oz);
    root.rotation.y = fr.yaw;
    if (e.t === E.FENCE) {
      b.box('k', -0.5, 0, -0.05, -0.42, 1.1, 0.05, c);
      for (let k = 0; k < 4; k++) b.box('k', -0.4 + k * 0.25, 0.05, -0.03, -0.3 + k * 0.25, 1.0, 0.03, c);
      b.box('k', -0.5, 0.35, -0.04, 0.5, 0.42, 0.04, c);
      b.box('k', -0.5, 0.78, -0.04, 0.5, 0.85, 0.04, c);
    } else if (e.t === E.HFENCE) {
      b.box('k', -0.5, 0, -0.04, -0.44, 2.15, 0.04, c);
      b.box('k', -0.5, 2.0, -0.03, 0.5, 2.08, 0.03, c);
      const ch = new THREE.Mesh(new THREE.PlaneGeometry(1, 2.0), this.mats.chain);
      ch.position.set(0, 1.0, 0);
      root.add(ch);
    } else if (e.t === E.WALL) {
      b.box('k', -0.5, 0, -t, 0.5, LEVEL_H - (e.L === 0 ? 0.14 : 0), t, c, { uv: 1 });
    } else if (e.t === E.WINDOW) {
      const [ws, wt] = [0.9, 2.1];
      b.box('k', -0.5, 0, -t, 0.5, ws, t, c, { uv: 1 });
      b.box('k', -0.5, wt, -t, 0.5, LEVEL_H - 0.14, t, c, { uv: 1 });
      b.box('k', -0.5, ws, -t, -0.42, wt, t, c, { uv: 1 });
      b.box('k', 0.42, ws, -t, 0.5, wt, t, c, { uv: 1 });
    } else if (e.t === E.DOOR || e.t === E.OPENING) {
      b.box('k', -0.5, 2.15, -t, 0.5, LEVEL_H - 0.14, t, c, { uv: 1 });
      b.box('k', -0.5, 0, -t, -0.44, 2.15, t, c, { uv: 1 });
      b.box('k', 0.44, 0, -t, 0.5, 2.15, t, c, { uv: 1 });
    }
    if (b.isEmpty()) return false;
    root.add(new THREE.Mesh(b.buildOne(), mat === 'wood' ? this.mats.planks : mat === 'metal' ? this.mats.metal : this.mats.cement));
    grp.add(root);
    return true;
  }

  // ---------------------------------------------------------------- scale
  updateStair(s) {
    if (s.removed) {
      this.removeItem('s' + s.id);
      return;
    }
    const b = new GeoBuilder();
    const n = 15;
    const [bi, bj] = s.cells[0];
    // origine all'ingresso, asse lungo la salita
    const ex = bi + 0.5 - s.dx * 0.5, ez = bj + 0.5 - s.dz * 0.5;
    const px = -s.dz, pz = s.dx; // perpendicolare
    const c = lin(0x8a6a4a);
    for (let k = 0; k < n; k++) {
      const a0 = (k / n) * s.len, a1 = ((k + 1) / n) * s.len;
      const y1 = 0.16 + ((k + 1) / n) * (LEVEL_H - 0.16);
      const P = (a, p) => [ex + s.dx * a + px * p, ez + s.dz * a + pz * p];
      const pts = [P(a0, -0.46), P(a1, -0.46), P(a1, 0.46), P(a0, 0.46)];
      const xs = pts.map((p) => p[0]), zs = pts.map((p) => p[1]);
      b.box('k', Math.min(...xs), Math.max(0.16, y1 - 0.2), Math.min(...zs), Math.max(...xs), y1, Math.max(...zs), shadeCol(c, k % 2 ? 0.92 : 1), { uv: 1 });
    }
    this.setItem('s' + s.id, new THREE.Mesh(b.buildOne(), this.mats.wood), bi + 0.5, bj + 0.5);
  }

  // ---------------------------------------------------------------- auto
  updateCar(car) {
    if (car.gone) {
      this.removeItem('c' + car.id);
      return;
    }
    const geo = carModel(car);
    const m = new THREE.Mesh(geo, this.mats.car);
    m.position.set(car.x, car.dismantled ? -0.2 : 0, car.z);
    m.rotation.y = car.yaw;
    this.setItem('c' + car.id, m, car.x, car.z);
  }

  // ---------------------------------------------------------------- oggetti a terra
  updateGround(key) {
    const list = this.W.ground.get(key);
    if (!list || !list.length) {
      this.removeItem('g' + key);
      return;
    }
    const [L, i, j] = key.split(',').map(Number);
    const b = new GeoBuilder();
    const counts = {};
    let k = 0;
    for (const it of list.slice(0, 12)) {
      const n = counts[it.id] || 0;
      counts[it.id] = n + 1;
      itemModel(b, it.id, 0, 0, ((i * 7 + j * 3) % 6) * 0.5 + (it.u % 3) * 0.3, n + (FURN_BULKY.has(it.id) ? 0 : k));
      k++;
    }
    const m = new THREE.Mesh(b.buildOne(), this.mats.furn);
    const y = L === 1 ? LEVEL_H : this.G.grid.groundY(0, i + 0.5, j + 0.5);
    m.position.set(i + 0.5, y, j + 0.5);
    this.setItem('g' + key, m, i + 0.5, j + 0.5);
  }

  // ---------------------------------------------------------------- solai e fondamenta costruiti
  updateFloor(key) {
    const p = this.W.builtFloors.get(key);
    if (!p) {
      this.removeItem('b' + key);
      return;
    }
    const b = new GeoBuilder();
    const hpR = Math.max(0.2, p.hp / p.maxHp);
    const c = shadeCol(lin(p.mat === 'wood' ? 0xb08a5a : p.mat === 'metal' ? 0x9aa4aa : 0xb8b4ac), 0.6 + 0.4 * hpR);
    if (p.L === 0) b.box('k', p.i, 0, p.j, p.i + 1, 0.14, p.j + 1, c, { uv: 1 });
    else b.box('k', p.i, LEVEL_H - 0.12, p.j, p.i + 1, LEVEL_H, p.j + 1, c, { uv: 1 });
    const m = new THREE.Mesh(b.buildOne(), p.mat === 'wood' ? this.mats.planks : p.mat === 'metal' ? this.mats.metal : this.mats.cement);
    this.setItem('b' + key, m, p.i + 0.5, p.j + 0.5);
  }

  // ---------------------------------------------------------------- carriole
  updateBarrow(br) {
    const old = this.barrows.get(br.id);
    if (old) {
      this.group.remove(old);
      disposeTree(old);
      this.barrows.delete(br.id);
    }
    if (br.gone) return;
    const b = new GeoBuilder();
    const c = lin(0x3a7a4a);
    b.box('k', -0.32, 0.38, -0.45, 0.32, 0.62, 0.3, c);
    b.box('k', -0.28, 0.3, -0.4, 0.28, 0.38, 0.25, shadeCol(c, 0.8));
    b.cyl('k', 0.2, -0.05, -0.55, 0.2, 0.05, lin(0x1a1a1a), 8, 'x');
    b.box('k', -0.3, 0.45, 0.25, -0.26, 0.5, 0.95, lin(0x8a6a4a));
    b.box('k', 0.26, 0.45, 0.25, 0.3, 0.5, 0.95, lin(0x8a6a4a));
    b.box('k', -0.28, 0, 0.15, -0.24, 0.4, 0.2, lin(0x5a5a5a));
    b.box('k', 0.24, 0, 0.15, 0.28, 0.4, 0.2, lin(0x5a5a5a));
    const n = Math.min(6, (br.items || []).length);
    for (let k = 0; k < n; k++) {
      const it = br.items[k];
      if (it.id === 'plank') b.box('k', -0.1 + (k % 3) * 0.08, 0.6 + Math.floor(k / 3) * 0.05, -0.8, -0.02 + (k % 3) * 0.08, 0.64 + Math.floor(k / 3) * 0.05, 0.9, lin(0xb08a5a));
      else b.box('k', -0.2 + (k % 3) * 0.14, 0.62, -0.3 + Math.floor(k / 3) * 0.2, -0.08 + (k % 3) * 0.14, 0.75, -0.18 + Math.floor(k / 3) * 0.2, lin(0x8a8a7a));
    }
    const m = new THREE.Mesh(b.buildOne(), this.mats.furn);
    m.position.set(br.x, br.L * LEVEL_H + this.G.grid.groundY(br.L, br.x, br.z) * (br.L === 0 ? 1 : 0), br.z);
    m.rotation.y = br.yaw;
    this.group.add(m);
    this.barrows.set(br.id, m);
  }
  moveBarrow(br) {
    const m = this.barrows.get(br.id);
    if (!m) return;
    m.position.set(br.x, br.y !== undefined ? br.y : this.G.grid.groundY(br.L, br.x, br.z), br.z);
    m.rotation.y = br.yaw;
  }

  // ---------------------------------------------------------------- evidenziazione del bersaglio
  highlight(box) {
    if (!box) {
      this.hl.visible = false;
      return;
    }
    this.hl.visible = true;
    this.hl.position.set((box.x0 + box.x1) / 2, (box.y0 + box.y1) / 2, (box.z0 + box.z1) / 2);
    this.hl.scale.set(Math.max(0.05, box.x1 - box.x0), Math.max(0.05, box.y1 - box.y0), Math.max(0.05, box.z1 - box.z0));
  }

  update(dt, cam, cullDist) {
    for (const a of [...this.anims.values()]) {
      const cur = a.hinge.rotation.y;
      const diff = a.target - cur;
      if (Math.abs(diff) > 0.001) a.hinge.rotation.y = cur + Math.sign(diff) * Math.min(Math.abs(diff), dt * 5);
      else {
        // finita: la porta torna dentro il suo blocco
        this.doorAng.set(a.e.id, a.target);
        this.stopAnim(a.e.id);
        if (this.G.grid.edges.has(a.e.id)) this.updateEdge(a.e);
      }
    }
    let budget = 4;
    for (const ch of this.chunks.values()) {
      if (ch.dirty && budget-- > 0) this.rebuildChunk(ch);
    }
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.25;
      const r = cullDist + CH * 0.71;
      const r2 = r * r;
      for (const ch of this.chunks.values()) {
        const dx = ch.x - cam.x, dz = ch.z - cam.z;
        const vis = dx * dx + dz * dz < r2;
        for (const m of ch.meshes) m.visible = vis;
      }
      const c2 = cullDist * cullDist;
      for (const m of this.barrows.values()) {
        const dx = m.position.x - cam.x, dz = m.position.z - cam.z;
        m.visible = dx * dx + dz * dz < c2;
      }
    }
  }
}

function disposeTree(o) {
  o.traverse((x) => {
    if (x.geometry) x.geometry.dispose();
  });
}

// unisce pezzi (geometria + matrice) in una sola geometria in coordinate del mondo
const nm = new THREE.Matrix3();
function mergeParts(parts, withColor) {
  let nv = 0, ni = 0;
  for (const p of parts) {
    const c = p.geo.attributes.position.count;
    nv += c;
    ni += p.geo.index ? p.geo.index.count : c;
  }
  const pos = new Float32Array(nv * 3), nor = new Float32Array(nv * 3), uv = new Float32Array(nv * 2);
  const col = withColor ? new Float32Array(nv * 3) : null;
  const idx = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
  let vo = 0, io = 0;
  for (const p of parts) {
    const g = p.geo;
    const P = g.attributes.position.array, N = g.attributes.normal ? g.attributes.normal.array : null;
    const U = g.attributes.uv ? g.attributes.uv.array : null, C = g.attributes.color ? g.attributes.color.array : null;
    const cnt = g.attributes.position.count;
    const e = p.m.elements;
    nm.getNormalMatrix(p.m);
    const n = nm.elements;
    for (let k = 0; k < cnt; k++) {
      const x = P[k * 3], y = P[k * 3 + 1], z = P[k * 3 + 2];
      const o = (vo + k) * 3;
      pos[o] = e[0] * x + e[4] * y + e[8] * z + e[12];
      pos[o + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
      pos[o + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
      if (N) {
        const a = N[k * 3], b = N[k * 3 + 1], c = N[k * 3 + 2];
        let nx = n[0] * a + n[3] * b + n[6] * c, ny = n[1] * a + n[4] * b + n[7] * c, nz = n[2] * a + n[5] * b + n[8] * c;
        const l = Math.hypot(nx, ny, nz) || 1;
        nor[o] = nx / l;
        nor[o + 1] = ny / l;
        nor[o + 2] = nz / l;
      } else nor[o + 1] = 1;
      if (U) {
        uv[(vo + k) * 2] = U[k * 2];
        uv[(vo + k) * 2 + 1] = U[k * 2 + 1];
      }
      if (col) {
        if (C) {
          col[o] = C[k * 3];
          col[o + 1] = C[k * 3 + 1];
          col[o + 2] = C[k * 3 + 2];
        } else col[o] = col[o + 1] = col[o + 2] = 1;
      }
    }
    if (g.index) {
      const I = g.index.array;
      for (let k = 0; k < I.length; k++) idx[io + k] = I[k] + vo;
      io += I.length;
    } else {
      for (let k = 0; k < cnt; k++) idx[io + k] = vo + k;
      io += cnt;
    }
    vo += cnt;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  if (col) geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setIndex(new THREE.BufferAttribute(idx, 1));
  geo.computeBoundingSphere();
  return geo;
}

const FURN_BULKY = new Set(['plank', 'log', 'sheet_metal', 'cement', 'barrel', 'generator', 'door_item', 'car_battery', 'pipe']);
export { FLOOR_INFO, F };
