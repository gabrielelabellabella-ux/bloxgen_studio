// Cielo, luci e nebbia: ciclo giorno/notte, torcia, luci puntiformi (lampade, fuochi) e lampi.
import * as THREE from 'three';
import { clamp, lerp, smoothstep } from '../core/util.js';

const KEYS = [
  // elevazione del sole, zenit, orizzonte, nebbia, cielo emisfero, intensità emisfero, colore sole, intensità sole
  { el: -0.6, top: 0x04060a, hor: 0x0a0f16, fog: 0x080b10, hs: 0x2a3650, hi: 0.3, sc: 0x8fa3c8, si: 0.3 },
  { el: -0.12, top: 0x0b1220, hor: 0x1c1f2c, fog: 0x14171f, hs: 0x2a3650, hi: 0.34, sc: 0x8fa3c8, si: 0.3 },
  { el: -0.02, top: 0x1e2c48, hor: 0x5a4048, fog: 0x3a3238, hs: 0x5a6680, hi: 0.55, sc: 0xff9a60, si: 0.4 },
  { el: 0.06, top: 0x40618a, hor: 0xc78150, fog: 0x8a7462, hs: 0x9aa8c0, hi: 0.95, sc: 0xffb276, si: 1.4 },
  { el: 0.25, top: 0x5f84ad, hor: 0xb9c6cc, fog: 0xa6b2b6, hs: 0xc4d2de, hi: 1.25, sc: 0xfff0d8, si: 2.3 },
  { el: 1.2, top: 0x5a82ad, hor: 0xbac8d0, fog: 0xa9b6bc, hs: 0xc8d6e2, hi: 1.35, sc: 0xfff4e0, si: 2.5 },
];

const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpHex(a, b, t, out) {
  tmpA.setHex(a);
  tmpB.setHex(b);
  return out.copy(tmpA).lerp(tmpB, t);
}

export class Sky {
  constructor(G) {
    this.G = G;
    const scene = G.scene;
    this.hemi = new THREE.HemisphereLight(0xc4d2de, 0x4a4436, 1);
    scene.add(this.hemi);
    this.fill = new THREE.AmbientLight(0xd8cfc0, 0);
    scene.add(this.fill);
    this.sun = new THREE.DirectionalLight(0xffffff, 2);
    this.sun.position.set(30, 60, 20);
    scene.add(this.sun);
    scene.add(this.sun.target);
    const q = G.quality;
    if (q.shadows) {
      this.sun.castShadow = true;
      this.sun.shadow.mapSize.set(q.shadowSize, q.shadowSize);
      const s = q.shadowSize >= 2048 ? 34 : 26;
      const cam = this.sun.shadow.camera;
      cam.left = -s; cam.right = s; cam.top = s; cam.bottom = -s;
      cam.near = 1; cam.far = 160;
      this.sun.shadow.bias = -0.0006;
      this.sun.shadow.normalBias = 0.05;
    }
    // torcia agganciata alla camera
    this.flash = new THREE.SpotLight(0xfff0d6, 0, 34, 0.44, 0.55, 1.35);
    this.flash.position.set(0.18, -0.12, 0.05);
    this.flash.target.position.set(0.05, -0.35, -6);
    G.camera.add(this.flash);
    G.camera.add(this.flash.target);
    // luci puntiformi condivise (lampade accese, falò, lanterna)
    this.points = [];
    for (let k = 0; k < 3; k++) {
      const p = new THREE.PointLight(0xffc890, 0, 10, 1.6);
      scene.add(p);
      this.points.push(p);
    }
    // cupola del cielo
    const domeGeo = new THREE.SphereGeometry(1, 24, 12);
    this.domeMat = new THREE.ShaderMaterial({
      uniforms: {
        top: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunCol: { value: new THREE.Color() },
        sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunVis: { value: 1 }, moonDir: { value: new THREE.Vector3(0, -1, 0) }, night: { value: 0 },
      },
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; vec4 p = modelViewMatrix * vec4(position,1.0); gl_Position = projectionMatrix * p; }`,
      fragmentShader: `uniform vec3 top; uniform vec3 hor; uniform vec3 sunCol; uniform vec3 sunDir; uniform float sunVis; uniform vec3 moonDir; uniform float night; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = mix(hor, top, smoothstep(-0.02, 0.55, h));
          col = mix(col, hor * 0.7, smoothstep(0.0, -0.3, h));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunCol * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.18) * sunVis;
          float m = max(dot(d, normalize(moonDir)), 0.0);
          col += vec3(0.75, 0.8, 0.9) * (smoothstep(0.99955, 0.9997, m) * 1.4 + pow(m, 60.0) * 0.06) * night;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide, depthWrite: false, fog: false,
    });
    this.dome = new THREE.Mesh(domeGeo, this.domeMat);
    this.dome.renderOrder = -10;
    this.dome.frustumCulled = false;
    scene.add(this.dome);
    // stelle
    const starPos = [];
    for (let k = 0; k < 600; k++) {
      const u = Math.random(), v = Math.random() * 0.9 + 0.08;
      const th = u * Math.PI * 2, ph = Math.acos(1 - v);
      starPos.push(Math.sin(ph) * Math.cos(th), Math.cos(ph), Math.sin(ph) * Math.sin(th));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
    this.starMat = new THREE.PointsMaterial({ color: 0xdfe6f0, size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
    this.stars = new THREE.Points(sg, this.starMat);
    this.stars.renderOrder = -9;
    this.stars.frustumCulled = false;
    scene.add(this.stars);
    scene.fog = new THREE.Fog(0xa6b2b6, 20, 90);
    this.fogCol = new THREE.Color();
    this.flashT = 0;
    this.exposure = 1;
    this.sunDir = new THREE.Vector3();
    this.state = { daylight: 1, ambient: 1 };
  }

  lightning() {
    this.flashT = 0.25;
  }

  // weather: {cloud 0..1, rain 0..1, fog 0..1}, indoor 0..1
  update(dt, clock, weather, cam, indoor, viewDist) {
    const el = clock.sunElevation();
    let k = 0;
    while (k < KEYS.length - 2 && el > KEYS[k + 1].el) k++;
    const A = KEYS[k], B = KEYS[k + 1];
    const t = clamp((el - A.el) / (B.el - A.el), 0, 1);
    const top = lerpHex(A.top, B.top, t, this.domeMat.uniforms.top.value);
    const hor = lerpHex(A.hor, B.hor, t, this.domeMat.uniforms.hor.value);
    lerpHex(A.fog, B.fog, t, this.fogCol);
    lerpHex(A.hs, B.hs, t, this.hemi.color);
    lerpHex(A.sc, B.sc, t, this.sun.color);
    let hi = lerp(A.hi, B.hi, t);
    let si = lerp(A.si, B.si, t);
    const cloud = weather.cloud || 0, rain = weather.rain || 0, fogW = weather.fog || 0;
    // nuvole e pioggia: più grigio, meno sole
    const grey = new THREE.Color(0x8a9296);
    const dayF = smoothstep(-0.1, 0.2, el);
    const mixG = clamp(cloud * 0.6 + rain * 0.3, 0, 0.85) * dayF;
    top.lerp(grey.clone().multiplyScalar(0.75), mixG);
    hor.lerp(grey, mixG);
    this.fogCol.lerp(grey, mixG * 0.8);
    si *= 1 - clamp(cloud * 0.7 + rain * 0.25 + fogW * 0.5, 0, 0.9);
    hi *= 1 - rain * 0.2;
    if (fogW > 0) {
      const fc = new THREE.Color(0xb8bcbc).multiplyScalar(0.2 + 0.8 * dayF);
      this.fogCol.lerp(fc, fogW);
      hor.lerp(fc, fogW);
      top.lerp(fc, fogW * 0.8);
    }
    // lampi
    if (this.flashT > 0) {
      this.flashT -= dt;
      const f = this.flashT > 0.18 || (this.flashT < 0.1 && this.flashT > 0.05) ? 1 : 0.2;
      hi += 2.5 * f;
      top.lerp(new THREE.Color(0xc8d0e8), 0.6 * f);
    }
    this.hemi.intensity = hi;
    // al chiuso di giorno la luce entra dalle finestre e rimbalza: un riempimento morbido
    // di notte resta un filo di luce (luna, riflessi): si vedono le sagome, non i dettagli
    this.fill.intensity = indoor * dayF * (0.55 - 0.25 * clamp(cloud + rain, 0, 1)) + (1 - dayF) * (0.11 - 0.05 * cloud);
    this.hemi.groundColor.setHex(0x3a362c).multiplyScalar(0.4 + 0.6 * dayF);
    // sole di giorno, luna di notte
    const az = clock.sunAzimuth();
    const night = el < -0.08;
    const dirEl = night ? clamp(-el, 0.25, 0.9) : Math.max(el, 0.05);
    const daz = night ? az + Math.PI : az;
    this.sunDir.set(Math.sin(daz) * Math.cos(dirEl), Math.sin(dirEl), -Math.cos(daz) * Math.cos(dirEl)).normalize();
    this.sun.intensity = night ? 0.3 * (1 - cloud * 0.8) : si;
    this.sun.position.set(cam.x + this.sunDir.x * 70, cam.y + this.sunDir.y * 70, cam.z + this.sunDir.z * 70);
    this.sun.target.position.set(cam.x, cam.y, cam.z);
    this.sun.target.updateMatrixWorld();
    this.domeMat.uniforms.sunCol.value.copy(this.sun.color);
    this.domeMat.uniforms.sunDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.domeMat.uniforms.sunVis.value = (1 - cloud * 0.9) * (1 - fogW);
    this.domeMat.uniforms.moonDir.value.set(-Math.sin(az), Math.max(0.2, -Math.sin(el)), Math.cos(az));
    const nightF = smoothstep(-0.02, -0.25, el);
    this.domeMat.uniforms.night.value = nightF * (1 - cloud) * (1 - fogW);
    this.starMat.opacity = nightF * (1 - cloud * 0.95) * (1 - fogW);
    // nebbia e distanza visiva
    const scene = this.G.scene;
    scene.fog.color.copy(this.fogCol);
    const far = viewDist;
    let fogFar = lerp(24, far, dayF);
    let fogNear = lerp(1, far * 0.25, dayF);
    fogFar *= 1 - rain * 0.3;
    fogFar = lerp(fogFar, 15, fogW);
    fogNear = lerp(fogNear, 0.5, fogW);
    scene.fog.far = fogFar;
    scene.fog.near = Math.min(fogNear, fogFar * 0.5);
    const r = this.G.camera.far * 0.92;
    this.dome.position.copy(cam);
    this.dome.scale.setScalar(r);
    this.stars.position.copy(cam);
    this.stars.scale.setScalar(r * 0.98);
    // adattamento degli occhi: al chiuso di giorno l'esposizione sale
    const targetExp = 1 + indoor * 0.75 * dayF + (1 - dayF) * 0.35;
    this.exposure += (targetExp - this.exposure) * (this.G.debugInstant ? 1 : Math.min(1, dt * 1.5));
    this.G.renderer.toneMappingExposure = this.exposure;
    this.state.daylight = dayF;
    this.state.fogFar = fogFar;
    this.state.ambient = hi + this.sun.intensity * 0.3;
  }
}
