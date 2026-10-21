// Corpo visibile in prima persona: braccia e mani con l'arma o l'oggetto in mano, gambe e busto quando
// guardi in basso. Disegnato in una scena separata sopra il mondo, così non entra nei muri.
import * as THREE from 'three';
import { GeoBuilder, lin, shadeCol } from './geom.js';
import { ITEMS } from '../data/items.js';
import { clamp, lerp, damp } from '../core/util.js';

const SKIN = 0xc9a088;

function box(b, x0, y0, z0, x1, y1, z1, c) {
  b.box('k', x0, y0, z0, x1, y1, z1, lin(c));
}

// prisma a n lati lungo z (raggio r0 in z0, r1 in z1), chiuso alle due estremità
function prism(b, x, y, z0, z1, r0, r1, col, seg) {
  const P = (a, z, r) => [x + Math.cos(a) * r, y + Math.sin(a) * r, z];
  for (let k = 0; k < seg; k++) {
    const a0 = (k / seg) * Math.PI * 2 + Math.PI / seg, a1 = ((k + 1) / seg) * Math.PI * 2 + Math.PI / seg;
    const sh = 0.72 + 0.28 * Math.max(0, Math.sin((a0 + a1) / 2) * 0.8 + 0.2);
    b.quadAuto('k', [P(a0, z0, r0), P(a1, z0, r0), P(a1, z1, r1), P(a0, z1, r1)], shadeCol(col, sh), 1);
    b.tri('k', [[x, y, z1], P(a0, z1, r1), P(a1, z1, r1)], [0, 0, 1], [0, 0, 0, 0, 0, 0], col);
    b.tri('k', [[x, y, z0], P(a1, z0, r0), P(a0, z0, r0)], [0, 0, -1], [0, 0, 0, 0, 0, 0], shadeCol(col, 0.8));
  }
}

// modello dell'oggetto in mano (origine = impugnatura, asse lungo -z... si orienta col gruppo)
function heldModel(id) {
  const b = new GeoBuilder();
  const d = ITEMS[id];
  const col = d && d.col ? parseInt(d.col.slice(1), 16) : 0x888888;
  switch (id) {
    case 'bat': case 'golf_club': case 'rolling_pin':
      box(b, -0.02, -0.02, -0.12, 0.02, 0.02, 0.08, 0x2a2a2a);
      b.cyl('k', 0, -0.62, 0, 0.032, 0.08, lin(id === 'golf_club' ? 0x9aa6ae : 0xb08a4a), 6, 'z');
      if (id === 'bat') b.cyl('k', 0, -0.62, 0, 0.045, -0.3, lin(0xb08a4a), 6, 'z');
      if (id === 'golf_club') box(b, -0.02, -0.04, -0.66, 0.05, 0.02, -0.6, 0x9aa6ae);
      break;
    case 'spiked_bat':
      b.cyl('k', 0, -0.62, 0, 0.045, 0.08, lin(0x8a5a3a), 6, 'z');
      for (let k = 0; k < 6; k++) box(b, -0.06 + (k % 2) * 0.1, -0.006, -0.55 + k * 0.05, -0.04 + (k % 2) * 0.1, 0.006, -0.54 + k * 0.05, 0x9aa6ae);
      break;
    case 'crowbar':
      box(b, -0.015, -0.015, -0.6, 0.015, 0.015, 0.1, 0xb03a2a);
      box(b, -0.015, -0.015, -0.66, 0.015, 0.08, -0.6, 0xb03a2a);
      break;
    case 'pipe':
      b.cyl('k', 0, -0.55, 0, 0.022, 0.1, lin(0x7d8a90), 6, 'z');
      break;
    case 'kitchen_knife': case 'hunting_knife': case 'scalpel': case 'machete': {
      const L = id === 'machete' ? 0.42 : id === 'scalpel' ? 0.08 : 0.2;
      box(b, -0.014, -0.02, -0.02, 0.014, 0.02, 0.09, 0x2a2a2a);
      box(b, -0.004, -0.025, -0.02 - L, 0.004, 0.02, -0.02, 0xd8dde0);
      break;
    }
    case 'axe': case 'hatchet': {
      const L = id === 'axe' ? 0.62 : 0.34;
      box(b, -0.018, -0.018, -L, 0.018, 0.018, 0.08, 0x8a5a3a);
      box(b, -0.012, -0.05, -L - 0.02, 0.012, 0.12, -L + 0.08, 0x7a8288);
      break;
    }
    case 'shovel':
      box(b, -0.018, -0.018, -0.75, 0.018, 0.018, 0.08, 0x8a6a4a);
      box(b, -0.11, -0.01, -1.0, 0.11, 0.01, -0.75, 0x6f7f86);
      break;
    case 'spear': case 'metal_spear':
      b.cyl('k', 0, -0.95, 0, 0.022, 0.2, lin(id === 'spear' ? 0xa0794a : 0x8d9aa0), 6, 'z');
      box(b, -0.012, -0.012, -1.1, 0.012, 0.012, -0.95, 0xc8ccd0);
      break;
    case 'pan':
      box(b, -0.015, -0.015, -0.24, 0.015, 0.015, 0.08, 0x2a2a2a);
      b.cyl('k', 0, -0.4, -0.02, 0.14, -0.24, lin(0x3b3f43), 10, 'z');
      break;
    case 'hammer':
      box(b, -0.015, -0.015, -0.26, 0.015, 0.015, 0.08, 0x8a6a4a);
      box(b, -0.025, -0.03, -0.32, 0.025, 0.09, -0.26, 0x5a5f63);
      break;
    case 'flashlight':
      b.cyl('k', 0, -0.18, 0, 0.025, 0.06, lin(0x2a2a2a), 8, 'z');
      b.cyl('k', 0, -0.22, 0, 0.034, -0.18, lin(0x3a3a3a), 8, 'z');
      break;
    case 'lantern':
      box(b, -0.06, -0.14, -0.06, 0.06, 0.06, 0.06, 0xe6a23c);
      box(b, -0.05, -0.12, -0.05, 0.05, 0.04, 0.05, 0xfff0c0);
      break;
    case 'torch_improv': case 'candle':
      box(b, -0.02, -0.02, -0.25, 0.02, 0.02, 0.05, id === 'candle' ? 0xefe3c0 : 0x6a4a2a);
      break;
    default:
      if (d && d.ic === 'bottle') b.cyl('k', 0, -0.12, 0, 0.035, 0.12, lin(col), 8, 'y');
      else if (d && d.ic === 'can') b.cyl('k', 0, -0.05, 0, 0.035, 0.06, lin(col), 8, 'y');
      else box(b, -0.04, -0.04, -0.05, 0.04, 0.04, 0.05, col);
  }
  return b.buildOne();
}

export class Viewmodel {
  constructor(G) {
    this.G = G;
    this.scene = new THREE.Scene();
    this.cam = new THREE.PerspectiveCamera(60, 1, 0.01, 10);
    this.scene.add(this.cam);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x444444, 1);
    this.dir = new THREE.DirectionalLight(0xffffff, 1);
    this.flash = new THREE.PointLight(0xfff0d6, 0, 3, 1.2);
    this.flash.position.set(0.1, -0.2, -0.4);
    this.fill = new THREE.AmbientLight(0xd8cfc0, 0);
    this.scene.add(this.hemi, this.dir, this.dir.target, this.fill);
    this.cam.add(this.flash);
    this.mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    this.rig = new THREE.Group();
    this.cam.add(this.rig);
    this.armR = new THREE.Group();
    this.armL = new THREE.Group();
    this.rig.add(this.armR, this.armL);
    this.handR = new THREE.Group();
    this.handL = new THREE.Group();
    this.armR.add(this.handR);
    this.armL.add(this.handL);
    this.heldR = null;
    this.heldL = null;
    this.body = new THREE.Group();
    this.scene.add(this.body);
    this.sleeveCol = -1;
    this.t = 0;
    this.equipT = 1;
    this.prevHand = null;
    this.prevOff = null;
    this.state = { swing: 0, shove: 0 };
    this.bob = { x: 0, y: 0 };
  }

  buildArm(group, sleeve, hand, mirror) {
    while (group.children.length > 1) group.remove(group.children[1]);
    const b = new GeoBuilder();
    const s = mirror ? -1 : 1;
    const sc = lin(sleeve), hc = lin(hand);
    // avambraccio lungo +z verso la camera, mano in fondo verso -z
    prism(b, 0, 0, 0.0, 0.38, 0.05, 0.06, sc, 8);
    prism(b, 0, -0.002, -0.045, 0.005, 0.055, 0.055, shadeCol(sc, 0.8), 8);
    prism(b, 0, -0.004, -0.075, -0.04, 0.031, 0.033, hc, 6);
    // palmo, dita chiuse sull'impugnatura, nocche e pollice
    b.box('k', -0.037, -0.032, -0.165, 0.037, 0.026, -0.065, hc);
    b.box('k', -0.035, -0.062, -0.2, 0.035, 0.008, -0.155, shadeCol(hc, 0.9));
    b.box('k', -0.036, 0.004, -0.19, 0.036, 0.022, -0.15, shadeCol(hc, 1.05));
    b.box('k', -0.052 * s, -0.012, -0.15, -0.026 * s, 0.018, -0.09, shadeCol(hc, 0.95));
    group.add(new THREE.Mesh(b.buildOne(), this.mat));
  }

  buildBody(sleeve, pants, shoes) {
    this.body.clear();
    const b = new GeoBuilder();
    // busto e gambe visti dall'alto (coordinate relative agli occhi, sotto la camera)
    box(b, -0.2, -0.75, -0.05, 0.2, -0.2, 0.18, sleeve);
    b.box('k', -0.19, -1.0, -0.06, -0.02, -0.72, 0.16, lin(pants));
    b.box('k', 0.02, -1.0, -0.06, 0.19, -0.72, 0.16, lin(pants));
    this.torso = new THREE.Mesh(b.buildOne(), this.mat);
    this.body.add(this.torso);
    const lb = new GeoBuilder();
    lb.box('k', -0.075, -0.82, -0.08, 0.075, 0, 0.08, lin(pants));
    lb.box('k', -0.07, -0.9, -0.2, 0.07, -0.82, 0.09, lin(shoes));
    const legGeo = lb.buildOne();
    this.legL = new THREE.Mesh(legGeo, this.mat);
    this.legR = new THREE.Mesh(legGeo, this.mat);
    this.legL.position.set(-0.1, -1.0, 0.06);
    this.legR.position.set(0.1, -1.0, 0.06);
    this.body.add(this.legL, this.legR);
  }

  refreshLook() {
    const inv = this.G.inv;
    const sleeveIt = inv.worn.torso_out || inv.worn.torso_in;
    const sleeve = sleeveIt ? parseInt(ITEMS[sleeveIt.id].col.slice(1), 16) : SKIN;
    const handC = inv.worn.hands ? parseInt(ITEMS[inv.worn.hands.id].col.slice(1), 16) : SKIN;
    const pants = inv.worn.legs ? parseInt(ITEMS[inv.worn.legs.id].col.slice(1), 16) : 0x3a3a3a;
    const shoes = inv.worn.feet ? parseInt(ITEMS[inv.worn.feet.id].col.slice(1), 16) : SKIN;
    const key = [sleeve, handC, pants, shoes].join(',');
    if (key === this.lookKey) return;
    this.lookKey = key;
    this.armR.clear();
    this.armL.clear();
    this.handR = new THREE.Group();
    this.handL = new THREE.Group();
    this.armR.add(this.handR);
    this.armL.add(this.handL);
    this.buildArm(this.armR, sleeve, handC, false);
    this.buildArm(this.armL, sleeve, handC, true);
    this.buildBody(sleeve, pants, shoes);
    this.heldRId = null;
    this.heldLId = null;
  }

  setHeld(group, id, cur) {
    if (cur === id) return id;
    while (group.children.length) group.remove(group.children[0]);
    if (id) {
      const m = new THREE.Mesh(heldModel(id), this.mat);
      group.add(m);
    }
    return id;
  }

  update(dt) {
    const G = this.G;
    const p = G.player;
    const inv = G.inv;
    this.t += dt;
    this.refreshLook();
    const handIt = inv.hand;
    const offIt = inv.off;
    const bulky = inv.bulky;
    // estrazione di un oggetto: le braccia scendono e risalgono
    if ((handIt && handIt.u) !== this.prevHand || (offIt && offIt.u) !== this.prevOff) {
      this.equipT = 0;
      this.prevHand = handIt && handIt.u;
      this.prevOff = offIt && offIt.u;
    }
    this.equipT = Math.min(1, this.equipT + dt * 3);
    const act = G.actions.current;
    const anim = act ? act.anim : null;
    const w = handIt && ITEMS[handIt.id].wpn;
    const two = w && w.two;
    this.heldRId = this.setHeld(this.handR, bulky ? null : handIt ? handIt.id : null, this.heldRId);
    this.heldLId = this.setHeld(this.handL, bulky ? null : offIt ? offIt.id : null, this.heldLId);
    // ondeggiamento, passo, tremore
    const moving = p.moving;
    const bobAmp = moving ? (p.running ? 0.035 : 0.018) : 0.004;
    const bt = p.bobT;
    this.bob.x = damp(this.bob.x, Math.sin(bt * 0.5) * bobAmp, 10, dt);
    this.bob.y = damp(this.bob.y, Math.abs(Math.cos(bt * 0.5)) * bobAmp, 10, dt);
    const shake = (G.mind.panic > 40 ? (G.mind.panic - 40) / 60 : 0) * 0.006 + G.body.shiver() * 0.006;
    const jx = (Math.random() - 0.5) * shake, jy = (Math.random() - 0.5) * shake;
    const breathe = Math.sin(this.t * 1.6) * 0.004;
    const eq = 1 - this.equipT;
    // posizioni di riposo
    let rx = 0.24, ry = -0.24 - eq * 0.35, rz = -0.36, rrx = 0.05, rry = 0.08, rrz = 0;
    let lx = -0.24, ly = -0.42, lz = -0.38, lrx = 0.05, lry = -0.08, lrz = 0;
    let showL = !!offIt || two || !!bulky;
    let showR = true;
    if (two && !bulky) {
      lx = -0.04;
      ly = -0.27 - eq * 0.35;
      lz = -0.42;
      lry = -0.4;
      rx = 0.18;
    }
    if (offIt && !bulky) {
      lx = -0.22;
      ly = -0.26 - eq * 0.3;
      lz = -0.4;
      lrx = 0.15;
    }
    // colpo
    const sw = G.combat.swing;
    if (sw) {
      const u = sw.t / sw.dur;
      if (sw.style === 'stab' || sw.style === 'stealth') {
        const k = u < 0.35 ? -u / 0.35 * 0.12 : u < 0.55 ? -0.12 + (u - 0.35) / 0.2 * 0.5 : 0.38 - (u - 0.55) / 0.45 * 0.38;
        rz -= k;
        if (two) lz -= k;
        rrx = -0.1;
      } else if (sw.style === 'stomp') {
        showR = true;
      } else if (sw.style === 'chop') {
        const a = u < 0.4 ? u / 0.4 : u < 0.55 ? 1 - (u - 0.4) / 0.15 * 2.2 : -1.2 + (u - 0.55) / 0.45 * 1.2;
        rrx = 0.05 + a * 1.1;
        ry += a * 0.12;
        if (two) {
          lrx = rrx;
          ly += a * 0.12;
        }
      } else {
        // fendente orizzontale da destra a sinistra
        const a = u < 0.38 ? u / 0.38 : u < 0.6 ? 1 - ((u - 0.38) / 0.22) * 2.2 : -1.2 + ((u - 0.6) / 0.4) * 1.2;
        rry = 0.08 + a * 0.95;
        rx += a * 0.12;
        rz += Math.abs(a) * -0.05;
        if (two) {
          lry = -0.4 + a * 0.95;
          lx += a * 0.14;
        }
      }
    }
    // spinta: due mani avanti
    if (G.combat.shove) {
      const u = G.combat.shove.t / 0.45;
      const k = Math.sin(Math.min(1, u) * Math.PI);
      showL = true;
      rx = 0.16;
      lx = -0.16;
      ry = ly = -0.2;
      rz = lz = -0.35 - k * 0.25;
      rrx = lrx = -0.2;
      rry = lry = 0;
    }
    // oggetti ingombranti: braccia avanti
    if (bulky) {
      showL = true;
      rx = 0.2;
      lx = -0.2;
      ry = ly = -0.3;
      rz = lz = -0.42;
      rrx = lrx = 0.2;
    }
    // azioni a tempo
    if (anim && !sw) {
      const tt = this.t;
      showL = true;
      if (anim === 'hammer') {
        const k = Math.abs(Math.sin(tt * 9));
        rrx = 0.4 + k * 0.7;
        ry = -0.2 + k * 0.06;
        lx = -0.12;
        ly = -0.36;
        lz = -0.45;
      } else if (anim === 'eat' || anim === 'drink') {
        const k = Math.min(1, act.t / 0.4);
        rx = lerp(0.24, 0.05, k);
        ry = lerp(-0.24, -0.1, k);
        rz = lerp(-0.36, -0.2, k);
        rrx = -0.4 * k;
        showL = false;
      } else if (anim === 'read') {
        rx = 0.1;
        lx = -0.1;
        ry = ly = -0.22;
        rz = lz = -0.34;
        rry = 0.4;
        lry = -0.4;
        rrx = lrx = 0.5;
      } else if (anim === 'bandage') {
        rx = 0.05 + Math.sin(tt * 6) * 0.04;
        lx = -0.1;
        ry = -0.32;
        ly = -0.36;
        rz = lz = -0.32;
        rrz = Math.sin(tt * 6) * 0.4;
      } else if (anim === 'equip') {
        // gestito da equipT
        showL = !!offIt || two;
      } else {
        rx = 0.14 + Math.sin(tt * 5) * 0.02;
        lx = -0.14 + Math.cos(tt * 4) * 0.02;
        ry = ly = -0.34;
        rz = lz = -0.42 + Math.sin(tt * 3) * 0.02;
        rrx = lrx = 0.3;
      }
    }
    // lancio
    if (this.throwT > 0) {
      this.throwT -= dt;
      const u = 1 - this.throwT / 0.4;
      rrx = -1.2 + u * 1.6;
      ry = -0.1 + u * 0.05;
    }
    this.armR.visible = showR;
    this.armL.visible = showL;
    const sm = 18;
    this.armR.position.set(damp(this.armR.position.x, rx + this.bob.x + jx, sm, dt), damp(this.armR.position.y, ry + this.bob.y + jy + breathe, sm, dt), damp(this.armR.position.z, rz, sm, dt));
    this.armR.rotation.set(damp(this.armR.rotation.x, rrx, sm, dt), damp(this.armR.rotation.y, rry, sm, dt), damp(this.armR.rotation.z, rrz, sm, dt));
    this.armL.position.set(damp(this.armL.position.x, lx + this.bob.x + jx, sm, dt), damp(this.armL.position.y, ly + this.bob.y - jy + breathe, sm, dt), damp(this.armL.position.z, lz, sm, dt));
    this.armL.rotation.set(damp(this.armL.rotation.x, lrx, sm, dt), damp(this.armL.rotation.y, lry, sm, dt), damp(this.armL.rotation.z, lrz, sm, dt));
    // l'oggetto sta nella mano, puntato in avanti/alto
    this.handR.position.set(0, 0, -0.16);
    this.handR.rotation.set(w ? (w.stab ? 0 : 1.15) : 0.2, 0, 0);
    this.handL.position.set(0, 0, -0.16);
    this.handL.rotation.set(0.1, 0, 0);
    // corpo e gambe sotto la camera (solo inclinazione, il resto ruota col giocatore)
    this.cam.rotation.set(p.pitch, 0, 0);
    this.body.position.set(0, 0, 0.12);
    const legSwing = moving ? Math.sin(p.bobT * 0.5) * (p.running ? 0.5 : 0.35) : 0;
    if (this.legL) {
      this.legL.rotation.x = legSwing;
      this.legR.rotation.x = -legSwing;
      this.body.visible = !G.sleeping;
      this.body.position.y = p.crouch ? 0.45 : 0;
    }
    // luci coerenti col mondo
    const sky = G.sky;
    this.hemi.color.copy(sky.hemi.color);
    this.hemi.groundColor.copy(sky.hemi.groundColor);
    this.hemi.intensity = sky.hemi.intensity * (G.grid.indoor(p.L, Math.floor(p.x), Math.floor(p.z)) ? 0.7 : 1);
    this.dir.color.copy(sky.sun.color);
    this.dir.intensity = sky.sun.intensity * 0.6;
    const sd = sky.sunDir;
    const c = Math.cos(-p.yaw), s = Math.sin(-p.yaw);
    this.dir.position.set(sd.x * c - sd.z * s, sd.y, sd.x * s + sd.z * c);
    this.fill.intensity = sky.fill.intensity;
    this.flash.intensity = sky.flash.intensity > 0 ? 1.4 : 0;
    let near = 0;
    for (const l of sky.points) {
      const d = l.position.distanceTo(G.camera.position);
      if (l.intensity > 0 && d < l.distance) near += l.intensity * (1 - d / l.distance) * 0.25;
    }
    this.hemi.intensity += Math.min(1.5, near);
  }

  throwAnim() {
    this.throwT = 0.4;
  }

  render(renderer, aspect, fov) {
    this.cam.aspect = aspect;
    this.cam.fov = Math.min(70, fov - 6);
    this.cam.updateProjectionMatrix();
    renderer.clearDepth();
    renderer.render(this.scene, this.cam);
  }
}

export { clamp };
