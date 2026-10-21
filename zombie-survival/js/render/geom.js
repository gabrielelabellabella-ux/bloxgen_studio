// Costruttore di geometrie unite: scatole e quadrilateri con UV in coordinate del mondo e colori per vertice.
// Il mondo statico diventa poche mesh per materiale, così regge anche sui telefoni.
import * as THREE from 'three';

const colCache = new Map();
export function lin(hex) {
  let c = colCache.get(hex);
  if (!c) {
    const col = new THREE.Color(hex);
    c = [col.r, col.g, col.b];
    colCache.set(hex, c);
  }
  return c;
}
export function shadeCol(c, s) {
  return [c[0] * s, c[1] * s, c[2] * s];
}

export class GeoBuilder {
  constructor() {
    this.g = new Map();
  }
  get(key) {
    let a = this.g.get(key);
    if (!a) {
      a = { p: [], n: [], u: [], c: [], i: [], v: 0 };
      this.g.set(key, a);
    }
    return a;
  }
  // quattro angoli in senso antiorario visti dal lato della normale
  quad(key, P, nrm, uv, col) {
    const a = this.get(key);
    const v = a.v;
    for (let k = 0; k < 4; k++) {
      a.p.push(P[k][0], P[k][1], P[k][2]);
      a.n.push(nrm[0], nrm[1], nrm[2]);
      a.u.push(uv[k * 2], uv[k * 2 + 1]);
      const c = Array.isArray(col[0]) ? col[k] : col;
      a.c.push(c[0], c[1], c[2]);
    }
    a.i.push(v, v + 1, v + 2, v, v + 2, v + 3);
    a.v += 4;
  }
  tri(key, P, nrm, uv, col) {
    const a = this.get(key);
    const v = a.v;
    for (let k = 0; k < 3; k++) {
      a.p.push(P[k][0], P[k][1], P[k][2]);
      a.n.push(nrm[0], nrm[1], nrm[2]);
      a.u.push(uv[k * 2], uv[k * 2 + 1]);
      a.c.push(col[0], col[1], col[2]);
    }
    a.i.push(v, v + 1, v + 2);
    a.v += 3;
  }
  // quad generico: calcola normale e UV planari
  quadAuto(key, P, col, scale = 1) {
    const ux = P[1][0] - P[0][0], uy = P[1][1] - P[0][1], uz = P[1][2] - P[0][2];
    const vx = P[3][0] - P[0][0], vy = P[3][1] - P[0][1], vz = P[3][2] - P[0][2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const lu = Math.hypot(ux, uy, uz), lv = Math.hypot(vx, vy, vz);
    const uv = [0, 0, lu / scale, 0, lu / scale, lv / scale, 0, lv / scale];
    this.quad(key, P, [nx, ny, nz], uv, col);
  }
  // scatola allineata agli assi. o.keys/o.cols per faccia: px nx py ny pz nz; o.skip per saltare facce
  box(key, x0, y0, z0, x1, y1, z1, col, o = {}) {
    const s = o.uv || 1;
    const sk = o.skip || {};
    const K = o.keys || {};
    const C = o.cols || {};
    const sh = o.shade !== false;
    const side = (f) => (C[f] || col);
    const sd = (c, f) => (sh ? shadeCol(c, f) : c);
    if (!sk.py) this.quad(K.py || key, [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0]], [0, 1, 0],
      [x0 / s, -z1 / s, x1 / s, -z1 / s, x1 / s, -z0 / s, x0 / s, -z0 / s], side('py'));
    if (!sk.ny) this.quad(K.ny || key, [[x1, y0, z1], [x0, y0, z1], [x0, y0, z0], [x1, y0, z0]], [0, -1, 0],
      [-x1 / s, -z1 / s, -x0 / s, -z1 / s, -x0 / s, -z0 / s, -x1 / s, -z0 / s], sd(side('ny'), 0.55));
    if (!sk.px) this.quad(K.px || key, [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1]], [1, 0, 0],
      [-z1 / s, y0 / s, -z0 / s, y0 / s, -z0 / s, y1 / s, -z1 / s, y1 / s], sd(side('px'), 0.86));
    if (!sk.nx) this.quad(K.nx || key, [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0]], [-1, 0, 0],
      [z0 / s, y0 / s, z1 / s, y0 / s, z1 / s, y1 / s, z0 / s, y1 / s], sd(side('nx'), 0.86));
    if (!sk.pz) this.quad(K.pz || key, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], [0, 0, 1],
      [x0 / s, y0 / s, x1 / s, y0 / s, x1 / s, y1 / s, x0 / s, y1 / s], sd(side('pz'), 0.93));
    if (!sk.nz) this.quad(K.nz || key, [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0]], [0, 0, -1],
      [-x1 / s, y0 / s, -x0 / s, y0 / s, -x0 / s, y1 / s, -x1 / s, y1 / s], sd(side('nz'), 0.93));
  }
  // scatola ruotata attorno a Y (per mobili e oggetti), centro (cx,cz), mezze dimensioni
  rbox(key, cx, y0, cz, hw, y1, hd, ang, col, uv = 1) {
    const c = Math.cos(ang), s = Math.sin(ang);
    const tr = (lx, lz) => [cx + lx * c + lz * s, cz - lx * s + lz * c];
    const corners = [tr(-hw, -hd), tr(hw, -hd), tr(hw, hd), tr(-hw, hd)];
    const top = corners.map(([x, z]) => [x, y1, z]);
    this.quadAuto(key, [top[3], top[2], top[1], top[0]], col, uv);
    const sides = [[0, 1], [1, 2], [2, 3], [3, 0]];
    const shades = [0.93, 0.86, 0.93, 0.86];
    sides.forEach(([a, b], k) => {
      const [ax, az] = corners[a], [bx, bz] = corners[b];
      this.quadAuto(key, [[bx, y0, bz], [ax, y0, az], [ax, y1, az], [bx, y1, bz]], shadeCol(col, shades[k]), uv);
    });
  }
  // cilindro semplice (per barili, ruote, tronchi)
  cyl(key, cx, y0, cz, r, y1, col, seg = 8, axis = 'y') {
    for (let k = 0; k < seg; k++) {
      const a0 = (k / seg) * Math.PI * 2, a1 = ((k + 1) / seg) * Math.PI * 2;
      const c0 = Math.cos(a0) * r, s0 = Math.sin(a0) * r, c1 = Math.cos(a1) * r, s1 = Math.sin(a1) * r;
      const shade = 0.75 + 0.25 * Math.cos((a0 + a1) / 2 - 0.8);
      let P, T;
      if (axis === 'y') {
        P = [[cx + c0, y0, cz + s0], [cx + c1, y0, cz + s1], [cx + c1, y1, cz + s1], [cx + c0, y1, cz + s0]];
        T = [[cx, y1, cz], [cx + c1, y1, cz + s1], [cx + c0, y1, cz + s0]];
      } else if (axis === 'x') {
        // y0/y1 sono x0/x1, cx è y, cz è z
        P = [[y0, cx + c0, cz + s0], [y1, cx + c0, cz + s0], [y1, cx + c1, cz + s1], [y0, cx + c1, cz + s1]];
        T = [[y1, cx, cz], [y1, cx + c0, cz + s0], [y1, cx + c1, cz + s1]];
      } else {
        P = [[cx + c0, cz + s0, y1], [cx + c0, cz + s0, y0], [cx + c1, cz + s1, y0], [cx + c1, cz + s1, y1]];
        T = [[cx, cz, y1], [cx + c0, cz + s0, y1], [cx + c1, cz + s1, y1]];
      }
      this.quadAuto(key, P, shadeCol(col, shade), 1);
      const tn = axis === 'y' ? [0, 1, 0] : axis === 'x' ? [1, 0, 0] : [0, 0, 1];
      this.tri(key, T, tn, [0.5, 0.5, c1 + 0.5, s1 + 0.5, c0 + 0.5, s0 + 0.5], col);
    }
  }
  isEmpty() {
    for (const a of this.g.values()) if (a.v) return false;
    return true;
  }
  build() {
    const out = new Map();
    for (const [k, a] of this.g) {
      if (!a.v) continue;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(a.p, 3));
      geo.setAttribute('normal', new THREE.Float32BufferAttribute(a.n, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(a.u, 2));
      geo.setAttribute('color', new THREE.Float32BufferAttribute(a.c, 3));
      geo.setIndex(a.v > 65000 ? new THREE.Uint32BufferAttribute(a.i, 1) : new THREE.Uint16BufferAttribute(a.i, 1));
      geo.computeBoundingSphere();
      geo.computeBoundingBox();
      out.set(k, geo);
    }
    return out;
  }
  // una sola geometria (tutte le chiavi insieme) per oggetti con un unico materiale
  buildOne() {
    const all = { p: [], n: [], u: [], c: [], i: [], v: 0 };
    for (const a of this.g.values()) {
      const off = all.v;
      for (let k = 0; k < a.p.length; k++) all.p.push(a.p[k]);
      for (let k = 0; k < a.n.length; k++) all.n.push(a.n[k]);
      for (let k = 0; k < a.u.length; k++) all.u.push(a.u[k]);
      for (let k = 0; k < a.c.length; k++) all.c.push(a.c[k]);
      for (let k = 0; k < a.i.length; k++) all.i.push(a.i[k] + off);
      all.v += a.v;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(all.p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(all.n, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(all.u, 2));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(all.c, 3));
    geo.setIndex(all.v > 65000 ? new THREE.Uint32BufferAttribute(all.i, 1) : new THREE.Uint16BufferAttribute(all.i, 1));
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
    return geo;
  }
}
