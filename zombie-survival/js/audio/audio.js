// Audio procedurale con WebAudio: niente file, ogni suono è sintetizzato all'avvio. Suoni posizionali
// (passi, colpi, vetri, versi degli zombie), ambiente (pioggia, vento, grilli, uccelli), respiro e battito.

const SR = 22050;

// ---------------------------------------------------------------- piccola libreria di sintesi offline
function biquad(type, f, q, sr = SR) {
  const w = (2 * Math.PI * f) / sr, c = Math.cos(w), s = Math.sin(w), a = s / (2 * q);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - c) / 2; b1 = 1 - c; b2 = (1 - c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else if (type === 'hp') { b0 = (1 + c) / 2; b1 = -(1 + c); b2 = (1 + c) / 2; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  else { b0 = a; b1 = 0; b2 = -a; a0 = 1 + a; a1 = -2 * c; a2 = 1 - a; }
  const k = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: a1 / a0, a2: a2 / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  return (x) => {
    const y = k.b0 * x + k.b1 * k.x1 + k.b2 * k.x2 - k.a1 * k.y1 - k.a2 * k.y2;
    k.x2 = k.x1; k.x1 = x; k.y2 = k.y1; k.y1 = y;
    return y;
  };
}
const rnd = () => Math.random() * 2 - 1;
function buf(sec, fn) {
  const n = Math.max(1, Math.floor(SR * sec));
  const d = new Float32Array(n);
  fn(d, n);
  let m = 0;
  for (let k = 0; k < n; k++) m = Math.max(m, Math.abs(d[k]));
  if (m > 0) for (let k = 0; k < n; k++) d[k] /= m * 1.05;
  return d;
}
const env = (t, a, dcy) => (t < a ? t / a : Math.exp(-(t - a) / dcy));

const SYN = {
  step(surface) {
    return buf(0.16, (d, n) => {
      const lp = biquad('lp', surface === 'grass' ? 3500 : surface === 'gravel' ? 5000 : surface === 'wood' ? 1600 : 2200, 0.7);
      const bp = biquad('bp', surface === 'wood' ? 380 : 140, 2);
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        let x = 0;
        if (surface === 'gravel') x = (Math.random() < 0.08 ? rnd() : 0) * env(t, 0.003, 0.05);
        else x = rnd() * env(t, 0.002, surface === 'grass' || surface === 'soft' ? 0.045 : 0.018);
        x = lp(x) * (surface === 'soft' ? 0.4 : 1);
        x += bp(rnd()) * env(t, 0.001, 0.03) * (surface === 'wood' ? 2.2 : 1.4);
        d[k] = x;
      }
    });
  },
  swoosh: () => buf(0.3, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const f = 300 + Math.sin((t / 0.3) * Math.PI) * 1600;
      if (k % 64 === 0) d.f = biquad('bp', f, 1.2);
      d[k] = d.f(rnd()) * Math.sin((t / 0.3) * Math.PI);
    }
  }),
  thud: () => buf(0.35, (d, n) => {
    const lp = biquad('lp', 400, 0.8);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = Math.sin(2 * Math.PI * (75 - t * 80) * t) * env(t, 0.002, 0.09) + lp(rnd()) * env(t, 0.001, 0.05) * 0.8;
    }
  }),
  hitblunt: () => buf(0.3, (d, n) => {
    const lp = biquad('lp', 900, 0.8);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = Math.sin(2 * Math.PI * (110 - t * 160) * t) * env(t, 0.001, 0.06) + lp(rnd()) * env(t, 0.001, 0.04) + (t < 0.01 ? rnd() * 0.5 : 0);
    }
  }),
  hitblade: () => buf(0.35, (d, n) => {
    const bp = biquad('bp', 900, 1.5), lp = biquad('lp', 600, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * env(t, 0.004, 0.08) * (0.6 + 0.4 * Math.sin(t * 90)) + lp(rnd()) * env(t, 0.001, 0.05) + Math.sin(2 * Math.PI * 95 * t) * env(t, 0.001, 0.05) * 0.6;
    }
  }),
  stab: () => buf(0.25, (d, n) => {
    const bp = biquad('bp', 700, 2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * env(t, 0.01, 0.06) * (0.5 + 0.5 * Math.sin(t * 140));
    }
  }),
  glass: () => buf(1.1, (d, n) => {
    const hp = biquad('hp', 2500, 0.7);
    const pings = [];
    for (let k = 0; k < 26; k++) pings.push({ f: 2500 + Math.random() * 6000, t0: Math.random() * 0.5, a: 0.3 + Math.random() * 0.7, dc: 0.02 + Math.random() * 0.12 });
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let x = hp(rnd()) * env(t, 0.001, 0.08) * 1.4;
      for (const p of pings) if (t > p.t0) x += Math.sin(2 * Math.PI * p.f * (t - p.t0)) * p.a * Math.exp(-(t - p.t0) / p.dc) * 0.35;
      d[k] = x;
    }
  }),
  glasshit: () => buf(0.3, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = (Math.sin(2 * Math.PI * 3100 * t) + Math.sin(2 * Math.PI * 4700 * t) * 0.6) * env(t, 0.001, 0.05) + rnd() * env(t, 0.001, 0.01) * 0.5;
    }
  }),
  woodbreak: () => buf(0.7, (d, n) => {
    const bp = biquad('bp', 800, 3), lp = biquad('lp', 500, 0.7);
    const cracks = [0, 0.05, 0.11, 0.2, 0.32];
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let x = 0;
      for (const c of cracks) if (t > c) x += rnd() * Math.exp(-(t - c) / 0.025);
      d[k] = bp(x) * 1.6 + lp(x) * 0.8 + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.002, 0.08) * 0.6;
    }
  }),
  bash: () => buf(0.45, (d, n) => {
    const lp = biquad('lp', 450, 0.9), bp = biquad('bp', 220, 4);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const x = rnd() * env(t, 0.002, 0.06);
      d[k] = Math.sin(2 * Math.PI * (85 - t * 40) * t) * env(t, 0.002, 0.14) + lp(x) * 1.4 + bp(x) * 2 * env(t, 0, 0.12);
    }
  }),
  metalhit: () => buf(0.8, (d, n) => {
    const fs = [520, 1270, 2130, 3310];
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let x = 0;
      fs.forEach((f, i) => (x += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / (0.25 / (i + 1))) / (i + 1)));
      d[k] = x + rnd() * env(t, 0.001, 0.008);
    }
  }),
  metalbreak: () => buf(0.9, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = (Math.sin(2 * Math.PI * 300 * t * (1 + t)) * Math.exp(-t / 0.3) + rnd() * env(t, 0.001, 0.1)) * 0.8;
    }
  }),
  hammer: () => buf(0.18, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = (Math.sin(2 * Math.PI * 950 * t) * 0.8 + Math.sin(2 * Math.PI * 2350 * t) * 0.5) * env(t, 0.001, 0.035) + rnd() * env(t, 0.0005, 0.006) + Math.sin(2 * Math.PI * 140 * t) * env(t, 0.001, 0.03) * 0.6;
    }
  }),
  saw: () => buf(0.55, (d, n) => {
    const bp = biquad('bp', 2400, 1.4);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const stroke = Math.abs(Math.sin(t * Math.PI * 4));
      d[k] = bp(rnd()) * stroke * (0.7 + 0.3 * Math.sin(t * 2 * Math.PI * 120));
    }
  }),
  screw: () => buf(0.4, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = Math.sin(2 * Math.PI * (1800 + Math.sin(t * 60) * 300) * t) * 0.3 * (0.5 + 0.5 * Math.sin(t * 25)) * env(t, 0.02, 0.2) + rnd() * 0.15 * env(t, 0.01, 0.3);
    }
  }),
  weld: () => buf(0.7, (d, n) => {
    const hp = biquad('hp', 3000, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = hp(rnd()) * (Math.random() < 0.3 ? 1 : 0.3) + Math.sin(2 * Math.PI * 100 * t) * 0.3;
    }
  }),
  trowel: () => buf(0.4, (d, n) => {
    const bp = biquad('bp', 1500, 1);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * Math.sin((k / n) * Math.PI);
  }),
  door: () => buf(0.7, (d, n) => {
    const bp = biquad('bp', 900, 6);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const f = 180 + Math.sin(t * 13) * 40 + t * 60;
      const saw = ((t * f) % 1) * 2 - 1;
      d[k] = bp(saw) * 0.5 * Math.sin((t / 0.55) * Math.PI) * (t < 0.55 ? 1 : 0) + (t > 0.55 ? Math.sin(2 * Math.PI * 160 * t) * env(t - 0.55, 0.001, 0.04) : 0);
    }
  }),
  gate: () => buf(0.6, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = (Math.sin(2 * Math.PI * 700 * t) + Math.sin(2 * Math.PI * 1730 * t) * 0.5) * Math.exp(-t / 0.15) * 0.6 + rnd() * env(t, 0.001, 0.05);
    }
  }),
  window: () => buf(0.5, (d, n) => {
    const bp = biquad('bp', 1100, 1.5);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * Math.sin((k / n) * Math.PI) * (0.8 + 0.2 * Math.sin(k * 0.01));
  }),
  drawer: () => buf(0.4, (d, n) => {
    const bp = biquad('bp', 700, 1.2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * (t < 0.3 ? Math.sin((t / 0.3) * Math.PI) : 0) + (t > 0.3 ? Math.sin(2 * Math.PI * 300 * t) * env(t - 0.3, 0.001, 0.02) : 0);
    }
  }),
  fridge: () => buf(0.6, (d, n) => {
    const lp = biquad('lp', 300, 0.8);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = lp(rnd()) * env(t, 0.005, 0.06) * 2 + Math.sin(2 * Math.PI * 100 * t) * 0.15 * (t > 0.1 ? 1 : 0);
    }
  }),
  pickup: () => buf(0.15, (d, n) => {
    const bp = biquad('bp', 2000, 1);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * env(k / SR, 0.005, 0.04);
  }),
  drop: () => buf(0.25, (d, n) => {
    const lp = biquad('lp', 600, 1);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = lp(rnd()) * env(t, 0.001, 0.05) + Math.sin(2 * Math.PI * 120 * t) * env(t, 0.001, 0.05);
    }
  }),
  equip: () => buf(0.25, (d, n) => {
    const bp = biquad('bp', 2500, 1);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * env(k / SR, 0.02, 0.06);
  }),
  click: () => buf(0.05, (d, n) => {
    for (let k = 0; k < n; k++) d[k] = rnd() * env(k / SR, 0.0005, 0.004) + Math.sin(k * 0.6) * env(k / SR, 0.0005, 0.008);
  }),
  rustle: () => buf(0.6, (d, n) => {
    const bp = biquad('bp', 3200, 0.8);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * (0.3 + 0.7 * Math.abs(Math.sin(k * 0.0009 + Math.sin(k * 0.0003) * 2))) * Math.sin((k / n) * Math.PI);
  }),
  page: () => buf(0.35, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      if (k % 32 === 0) d.f = biquad('bp', 1200 + t * 9000, 1);
      d[k] = d.f(rnd()) * Math.sin((t / 0.35) * Math.PI);
    }
  }),
  eat: () => buf(0.9, (d, n) => {
    const bp = biquad('bp', 1500, 1);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const ch = [0.05, 0.3, 0.55].reduce((a, c) => a + (t > c ? Math.exp(-(t - c) / 0.04) : 0), 0);
      d[k] = bp(rnd()) * ch * (Math.random() < 0.5 ? 1 : 0.4);
    }
  }),
  drink: () => buf(0.7, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const g = [0.05, 0.35].reduce((a, c) => a + (t > c && t < c + 0.18 ? Math.sin(((t - c) / 0.18) * Math.PI) : 0), 0);
      d[k] = Math.sin(2 * Math.PI * (160 + Math.sin(t * 40) * 60) * t) * g * 0.7 + rnd() * 0.1 * g;
    }
  }),
  pour: () => buf(1.2, (d, n) => {
    const bp = biquad('bp', 900, 1.5);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * (0.6 + 0.4 * Math.sin(k * 0.004 + Math.sin(k * 0.0011) * 3)) * Math.min(1, k / 2000, (n - k) / 2000);
  }),
  cough: () => buf(0.7, (d, n) => {
    const bp1 = biquad('bp', 600, 2), bp2 = biquad('bp', 1400, 2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const e = env(t, 0.005, 0.07) + (t > 0.3 ? env(t - 0.3, 0.005, 0.08) : 0);
      const x = rnd() + Math.sin(2 * Math.PI * 140 * t) * 0.6;
      d[k] = (bp1(x) + bp2(x) * 0.7) * e;
    }
  }),
  vomit: () => buf(1.0, (d, n) => {
    const lp = biquad('lp', 700, 2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = lp(rnd() + Math.sin(2 * Math.PI * 90 * t)) * Math.sin((t / 1) * Math.PI) * (0.6 + 0.4 * Math.sin(t * 30));
    }
  }),
  hurt: () => buf(0.45, (d, n) => {
    const f1 = biquad('bp', 650, 4), f2 = biquad('bp', 1150, 4);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const f0 = 150 - t * 70;
      const s = ((t * f0) % 1) * 2 - 1;
      d[k] = (f1(s) + f2(s) * 0.6 + rnd() * 0.08) * env(t, 0.01, 0.15);
    }
  }),
  zombiehit: () => buf(0.5, (d, n) => {
    const bp = biquad('bp', 800, 1.2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * env(t, 0.003, 0.08) * 1.4 + Math.sin(2 * Math.PI * 90 * t) * env(t, 0.002, 0.06);
    }
  }),
  shove: () => buf(0.35, (d, n) => {
    const f1 = biquad('bp', 500, 3);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const s = ((t * 120) % 1) * 2 - 1;
      d[k] = f1(s + rnd() * 0.5) * env(t, 0.02, 0.1);
    }
  }),
  throw: () => buf(0.25, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      if (k % 64 === 0) d.f = biquad('bp', 500 + t * 5000, 1);
      d[k] = d.f(rnd()) * Math.sin((t / 0.25) * Math.PI);
    }
  }),
  clink: () => buf(0.3, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = (Math.sin(2 * Math.PI * 2600 * t) + Math.sin(2 * Math.PI * 4100 * t) * 0.4) * env(t, 0.001, 0.05) + (t > 0.09 ? Math.sin(2 * Math.PI * 2300 * t) * env(t - 0.09, 0.001, 0.03) * 0.5 : 0);
    }
  }),
  alarm: () => buf(1.0, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const on = Math.floor(t * 16) % 2 === 0 && t < 0.8;
      d[k] = on ? (Math.sin(2 * Math.PI * 2400 * t) > 0 ? 0.6 : -0.6) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3700 * t)) : 0;
    }
  }),
  fire: () => buf(1.5, (d, n) => {
    const lp = biquad('lp', 1200, 0.7);
    for (let k = 0; k < n; k++) d[k] = lp(rnd()) * 0.25 + (Math.random() < 0.002 ? rnd() * 2 : 0);
  }),
  sizzle: () => buf(1.2, (d, n) => {
    const hp = biquad('hp', 4000, 0.7);
    for (let k = 0; k < n; k++) d[k] = hp(rnd()) * (0.6 + 0.4 * Math.sin(k * 0.002)) * Math.min(1, k / 1000, (n - k) / 1000);
  }),
  levelup: () => buf(0.9, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = Math.sin(2 * Math.PI * 660 * t) * env(t, 0.01, 0.3) * 0.5 + (t > 0.15 ? Math.sin(2 * Math.PI * 990 * t) * env(t - 0.15, 0.01, 0.35) * 0.5 : 0);
    }
  }),
  craft: () => buf(0.3, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = Math.sin(2 * Math.PI * 1200 * t) * env(t, 0.001, 0.04) + Math.sin(2 * Math.PI * 1800 * t) * (t > 0.1 ? env(t - 0.1, 0.001, 0.04) : 0);
    }
  }),
  climb: () => buf(0.7, (d, n) => {
    const bp = biquad('bp', 2000, 0.8), f1 = biquad('bp', 500, 3);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * 0.5 * Math.sin((t / 0.7) * Math.PI) + f1(((t * 110) % 1) * 2 - 1) * env(t, 0.1, 0.2) * 0.6;
    }
  }),
  drag: () => buf(0.8, (d, n) => {
    const lp = biquad('lp', 500, 1);
    for (let k = 0; k < n; k++) d[k] = lp(rnd()) * (0.6 + 0.4 * Math.sin(k * 0.003)) * Math.sin((k / n) * Math.PI);
  }),
  collapse: () => buf(1.6, (d, n) => {
    const lp = biquad('lp', 300, 0.7), bp = biquad('bp', 900, 2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const x = rnd();
      d[k] = lp(x) * Math.exp(-t / 0.5) * 2 + bp(x) * (Math.random() < 0.02 ? 3 : 0.2) * Math.exp(-t / 0.4);
    }
  }),
  powerdown: () => buf(1.5, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const f = 120 * Math.exp(-t * 1.6);
      d[k] = Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.9) + (t < 0.01 ? rnd() : 0);
    }
  }),
  genstart: () => buf(1.6, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const f = t < 0.4 ? 0 : 30 + Math.min(1, (t - 0.4) * 2) * 25;
      const saw = f ? ((t * f) % 1) * 2 - 1 : 0;
      d[k] = (t < 0.4 ? rnd() * (Math.floor(t * 30) % 2) * 0.5 : saw * 0.6 + rnd() * 0.2);
    }
  }),
  piano: () => buf(1.4, (d, n) => {
    const f = 220;
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let x = 0;
      for (let h = 1; h <= 6; h++) x += Math.sin(2 * Math.PI * f * h * t * (1 + h * 0.0004)) * Math.exp(-t * (1.5 + h * 0.8)) / h;
      d[k] = x * env(t, 0.003, 10);
    }
  }),
  static: () => buf(2, (d, n) => {
    const bp = biquad('bp', 1800, 0.6);
    for (let k = 0; k < n; k++) d[k] = bp(rnd()) * (0.5 + 0.5 * Math.sin(k * 0.0007)) + (Math.random() < 0.001 ? rnd() * 2 : 0);
  }),
  beep: () => buf(0.15, (d, n) => {
    for (let k = 0; k < n; k++) d[k] = (Math.sin(2 * Math.PI * 880 * (k / SR)) > 0 ? 0.4 : -0.4) * Math.min(1, (n - k) / 200);
  }),
  weaponbreak: () => buf(0.6, (d, n) => {
    const bp = biquad('bp', 1500, 2);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * env(t, 0.001, 0.05) * 2 + (t > 0.2 ? rnd() * Math.exp(-(t - 0.2) / 0.03) : 0);
    }
  }),
  woodcreak: () => buf(0.8, (d, n) => {
    const bp = biquad('bp', 600, 8);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const saw = ((t * (90 + Math.sin(t * 9) * 30)) % 1) * 2 - 1;
      d[k] = bp(saw) * Math.sin((t / 0.8) * Math.PI);
    }
  }),
  // ---- versi degli zombie: impulso glottale rauco filtrato da formanti
  groan(seed, kind) {
    const len = kind === 'alert' ? 1.4 : kind === 'attack' ? 0.6 : kind === 'chase' ? 1.0 : 1.8 + (seed % 3) * 0.3;
    return buf(len, (d, n) => {
      const f1 = biquad('bp', 420 + (seed % 5) * 60, 5), f2 = biquad('bp', 1050 + (seed % 4) * 120, 6), f3 = biquad('bp', 2400, 4);
      const lp = biquad('lp', 2500, 0.7);
      let ph = 0;
      const base = (kind === 'alert' ? 110 : kind === 'attack' ? 130 : 72) + (seed % 7) * 6;
      for (let k = 0; k < n; k++) {
        const t = k / SR;
        const u = t / len;
        let f0 = base * (1 + 0.25 * Math.sin(u * Math.PI * (1 + (seed % 3))) + 0.04 * Math.sin(t * 40) + 0.08 * rnd() * 0.3);
        if (kind === 'alert') f0 *= 1 + u * 0.5;
        ph += f0 / SR;
        const pulse = Math.pow(Math.max(0, Math.sin(ph * 2 * Math.PI)), 6) - 0.2;
        const breath = rnd() * (kind === 'chase' || kind === 'attack' ? 0.9 : 0.45);
        const src = pulse + breath * (0.4 + 0.6 * Math.abs(Math.sin(t * 6)));
        let e = Math.sin(u * Math.PI);
        if (kind === 'chase') e *= 0.5 + 0.5 * Math.abs(Math.sin(t * 9));
        d[k] = lp(f1(src) * 1.2 + f2(src) * 0.8 + f3(src) * 0.3) * e;
      }
    });
  },
  // ---- loop d'ambiente
  rain: () => buf(3, (d, n) => {
    const lp = biquad('lp', 2800, 0.5), hp = biquad('hp', 400, 0.5);
    for (let k = 0; k < n; k++) d[k] = hp(lp(rnd())) + (Math.random() < 0.004 ? rnd() * 1.5 : 0);
    xfade(d);
  }),
  wind: () => buf(4, (d, n) => {
    const lp = biquad('lp', 500, 0.6);
    for (let k = 0; k < n; k++) d[k] = lp(rnd()) * (0.5 + 0.5 * Math.sin((k / n) * Math.PI * 2 * 2));
    xfade(d);
  }),
  crickets: () => buf(3, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const chirp = Math.floor(t * 3.3) % 3 !== 2 && (t * 3.3) % 1 < 0.45 ? Math.abs(Math.sin(t * 2 * Math.PI * 30)) : 0;
      d[k] = Math.sin(2 * Math.PI * 4400 * t) * chirp * 0.5 + Math.sin(2 * Math.PI * 4900 * (t + 0.7)) * (Math.floor((t + 0.7) * 2.7) % 2 ? Math.abs(Math.sin(t * 2 * Math.PI * 26)) : 0) * 0.3;
    }
    xfade(d);
  }),
  birds: () => buf(5, (d, n) => {
    const chirps = [];
    for (let k = 0; k < 9; k++) chirps.push({ t0: Math.random() * 4.6, f: 2500 + Math.random() * 2500, len: 0.08 + Math.random() * 0.15, sw: (Math.random() - 0.5) * 3000 });
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      let x = 0;
      for (const c of chirps) if (t > c.t0 && t < c.t0 + c.len) {
        const u = (t - c.t0) / c.len;
        x += Math.sin(2 * Math.PI * (c.f + c.sw * u) * t) * Math.sin(u * Math.PI);
      }
      d[k] = x * 0.6;
    }
  }),
  genloop: () => buf(1, (d, n) => {
    const lp = biquad('lp', 900, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const saw = ((t * 50) % 1) * 2 - 1;
      d[k] = lp(saw * 0.8 + rnd() * 0.3) + Math.sin(2 * Math.PI * 100 * t) * 0.3;
    }
  }),
  fireloop: () => buf(3, (d, n) => {
    const lp = biquad('lp', 900, 0.7);
    for (let k = 0; k < n; k++) d[k] = lp(rnd()) * 0.35 + (Math.random() < 0.0015 ? rnd() * 2 : 0);
    xfade(d);
  }),
  heart: () => buf(0.86, (d, n) => {
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const b = (tt) => (tt > 0 ? Math.sin(2 * Math.PI * 55 * tt) * Math.exp(-tt / 0.05) : 0);
      d[k] = b(t) + b(t - 0.22) * 0.7;
    }
  }),
  breath: () => buf(2.4, (d, n) => {
    const bp = biquad('bp', 900, 0.9);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      const inh = t < 0.9 ? Math.sin((t / 0.9) * Math.PI) : 0;
      const exh = t > 1.1 && t < 2.2 ? Math.sin(((t - 1.1) / 1.1) * Math.PI) * 0.8 : 0;
      d[k] = bp(rnd()) * (inh + exh);
    }
  }),
  rumble: () => buf(4, (d, n) => {
    const lp = biquad('lp', 260, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = lp(rnd()) * (0.7 + 0.3 * Math.sin(t * 1.3)) + Math.sin(2 * Math.PI * (70 + Math.sin(t * 2) * 10) * t) * 0.15 * (0.5 + 0.5 * Math.sin(t * 0.8));
    }
    xfade(d);
  }),
  thunder: () => buf(3.5, (d, n) => {
    const lp = biquad('lp', 180, 0.6), lp2 = biquad('lp', 900, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = lp(rnd()) * Math.exp(-t / 1.4) * 3 + lp2(rnd()) * env(t, 0.01, 0.15) * (t < 0.3 ? 1 : 0);
    }
  }),
  flock: () => buf(1.6, (d, n) => {
    const bp = biquad('bp', 1500, 0.7);
    for (let k = 0; k < n; k++) {
      const t = k / SR;
      d[k] = bp(rnd()) * Math.abs(Math.sin(t * 2 * Math.PI * 11)) * Math.exp(-t / 0.8);
    }
  }),
};

function xfade(d) {
  const n = d.length, m = Math.min(2000, n / 4);
  for (let k = 0; k < m; k++) {
    const a = k / m;
    d[k] = d[k] * a + d[n - m + k] * (1 - a);
  }
}

export class Audio {
  constructor(G) {
    this.G = G;
    this.ctx = null;
    this.buf = {};
    this.active = 0;
    this.loops = {};
    this.speechOk = typeof window !== 'undefined' && 'speechSynthesis' in window;
    this.voice = null;
    this.ducked = false;
  }

  init() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try {
      this.ctx = new AC();
    } catch (e) {
      this.ctx = null;
      return;
    }
    const c = this.ctx;
    this.master = c.createGain();
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.master.connect(comp).connect(c.destination);
    this.sfx = c.createGain();
    this.amb = c.createGain();
    this.sfx.connect(this.master);
    this.amb.connect(this.master);
    this.applyPrefs();
    const mk = (name, data) => {
      const b = c.createBuffer(1, data.length, SR);
      b.copyToChannel(data, 0);
      this.buf[name] = b;
    };
    for (const s of ['hard', 'grass', 'wood', 'gravel', 'soft', 'metal']) for (let v = 0; v < 3; v++) mk('step_' + s + v, SYN.step(s === 'metal' ? 'hard' : s));
    for (const k of Object.keys(SYN)) {
      if (k === 'step' || k === 'groan') continue;
      mk(k, SYN[k]());
    }
    for (let v = 0; v < 6; v++) mk('groan' + v, SYN.groan(v * 7 + 3, 'idle'));
    for (let v = 0; v < 3; v++) mk('alert' + v, SYN.groan(v * 5 + 1, 'alert'));
    for (let v = 0; v < 3; v++) mk('chase' + v, SYN.groan(v * 11 + 2, 'chase'));
    for (let v = 0; v < 3; v++) mk('attack' + v, SYN.groan(v * 13 + 4, 'attack'));
    // loop
    for (const k of ['rain', 'wind', 'crickets', 'birds', 'genloop', 'fireloop', 'heart', 'breath', 'rumble']) this.loop(k);
    if (this.speechOk) {
      const pick = () => {
        const vs = speechSynthesis.getVoices();
        this.voice = vs.find((v) => v.lang && v.lang.toLowerCase().startsWith('it')) || null;
      };
      pick();
      try {
        speechSynthesis.onvoiceschanged = pick;
      } catch (e) {
        /* niente */
      }
    }
  }

  applyPrefs() {
    if (!this.ctx) return;
    const p = this.G.prefs;
    this.master.gain.value = p.volume;
    this.sfx.gain.value = p.sfx * (this.ducked ? 0.35 : 1);
    this.amb.gain.value = p.ambience;
  }

  loop(name) {
    const c = this.ctx;
    const src = c.createBufferSource();
    src.buffer = this.buf[name];
    src.loop = true;
    const g = c.createGain();
    g.gain.value = 0;
    const f = c.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 20000;
    let panner = null;
    if (name === 'genloop' || name === 'fireloop' || name === 'rumble') {
      panner = this.mkPanner();
      src.connect(f).connect(g).connect(panner).connect(name === 'rumble' ? this.amb : this.sfx);
    } else src.connect(f).connect(g).connect(name === 'heart' || name === 'breath' ? this.sfx : this.amb);
    src.start();
    this.loops[name] = { src, g, f, panner, vol: 0 };
  }

  mkPanner() {
    const p = this.ctx.createPanner();
    p.panningModel = this.G.touchActive ? 'equalpower' : 'HRTF';
    p.distanceModel = 'inverse';
    p.refDistance = 1.6;
    p.rolloffFactor = 1.15;
    p.maxDistance = 60;
    return p;
  }

  // suono singolo; x null = non posizionale
  play(name, x, y, z, vol = 1, rate) {
    const c = this.ctx;
    if (!c || !this.buf[name]) return;
    if (this.active > 26) return;
    const src = c.createBufferSource();
    src.buffer = this.buf[name];
    src.playbackRate.value = rate || 0.92 + Math.random() * 0.16;
    if (name === 'piano') src.playbackRate.value = [1, 1.122, 1.189, 1.335, 1.498, 1.587, 1.782, 2][Math.floor(Math.random() * 8)] * 0.75;
    const g = c.createGain();
    g.gain.value = vol;
    let node = src.connect(g);
    if (x !== null && x !== undefined) {
      const G = this.G;
      const p = G.player;
      const dist = Math.hypot(x - p.x, z - p.z);
      if (dist > 70) return;
      // muri in mezzo: suono ovattato
      const g2 = G.grid;
      const inA = g2.indoor(p.L, Math.floor(p.x), Math.floor(p.z));
      const inB = g2.indoor(y > 2.9 ? 1 : 0, Math.floor(x), Math.floor(z));
      if (inA !== inB || (dist > 4 && !g2.los(p.L, p.x, p.z, x, z))) {
        const f = c.createBiquadFilter();
        f.type = 'lowpass';
        f.frequency.value = 900;
        node = node.connect(f);
      }
      const pn = this.mkPanner();
      pn.positionX.value = x;
      pn.positionY.value = y;
      pn.positionZ.value = z;
      node.connect(pn).connect(this.sfx);
    } else node.connect(this.sfx);
    this.active++;
    src.onended = () => {
      this.active--;
    };
    src.start();
  }

  footstep(surface, run, crouch) {
    const v = Math.floor(Math.random() * 3);
    const s = ['hard', 'grass', 'wood', 'gravel', 'soft', 'metal'].includes(surface) ? surface : 'hard';
    this.play('step_' + s + v, null, null, null, (run ? 0.9 : crouch ? 0.22 : 0.45) * (s === 'soft' ? 0.6 : 1), run ? 1.05 : 0.95 + Math.random() * 0.1);
  }

  zombieVoice(zb, kind) {
    if (!this.ctx) return;
    const v = zb.id % 3;
    const name = kind === 'alert' ? 'alert' + v : kind === 'chase' ? 'chase' + v : kind === 'miss' || kind === 'attack' ? 'attack' + v : 'groan' + (zb.id % 6);
    const vol = kind === 'idle' ? 0.55 : 0.9;
    this.play(name, zb.x, zb.y + 1.6, zb.z, vol, 0.85 + (zb.id % 5) * 0.06 + Math.random() * 0.05);
  }

  thunder(delay) {
    this.play('thunder', null, null, null, Math.max(0.3, 1 - delay * 0.2), 0.9 + Math.random() * 0.2);
  }

  speak(text) {
    if (!this.speechOk || !this.G.prefs.volume) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text.replace(/\.\.\./g, ', '));
      u.lang = 'it-IT';
      if (this.voice) u.voice = this.voice;
      u.rate = 0.92;
      u.pitch = 0.85;
      u.volume = 0.7 * this.G.prefs.volume;
      speechSynthesis.speak(u);
    } catch (e) {
      /* sintesi vocale non disponibile */
    }
  }

  duck(on) {
    this.ducked = on;
    this.applyPrefs();
  }

  setLoop(name, vol, rate, pos, lowpass) {
    const l = this.loops[name];
    if (!l) return;
    const t = this.ctx.currentTime;
    l.g.gain.setTargetAtTime(vol, t, 0.3);
    if (rate) l.src.playbackRate.setTargetAtTime(rate, t, 0.5);
    if (pos && l.panner) {
      l.panner.positionX.setTargetAtTime(pos.x, t, 0.1);
      l.panner.positionY.setTargetAtTime(pos.y, t, 0.1);
      l.panner.positionZ.setTargetAtTime(pos.z, t, 0.1);
    }
    l.f.frequency.setTargetAtTime(lowpass || 20000, t, 0.3);
  }

  update(dt) {
    const c = this.ctx;
    if (!c) return;
    const G = this.G;
    const cam = G.camera;
    const L = c.listener;
    const p = G.player;
    const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
    if (L.positionX) {
      L.positionX.value = cam.position.x;
      L.positionY.value = cam.position.y;
      L.positionZ.value = cam.position.z;
      L.forwardX.value = fx;
      L.forwardY.value = 0;
      L.forwardZ.value = fz;
      L.upX.value = 0;
      L.upY.value = 1;
      L.upZ.value = 0;
    } else if (L.setPosition) {
      L.setPosition(cam.position.x, cam.position.y, cam.position.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    if (G.state !== 'playing' && G.state !== 'paused') {
      for (const k in this.loops) this.setLoop(k, 0);
      return;
    }
    const w = G.weather;
    const indoor = G.grid.indoor(p.L, Math.floor(p.x), Math.floor(p.z));
    const day = G.sky.state.daylight;
    const lp = indoor ? 700 : 20000;
    this.setLoop('rain', w.rain * (w.snow ? 0.15 : 0.55), 1, null, indoor ? 500 : 20000);
    this.setLoop('wind', 0.12 + w.cloud * 0.1 + (w.state === 'storm' ? 0.25 : 0), 1, null, lp);
    this.setLoop('crickets', (1 - day) * (G.clock.seasonIndex() === 0 ? 0 : 0.12) * (1 - w.rain), 1, null, lp);
    const birdsGone = G.zombies.hordes.some((h) => h.stage >= 2 && h.stage < 5);
    this.setLoop('birds', day * 0.12 * (1 - w.rain) * (birdsGone ? 0 : 1) * (G.clock.seasonIndex() === 0 ? 0.3 : 1), 1, null, lp);
    const panic = G.mind.panic;
    this.setLoop('heart', panic > 35 ? Math.min(0.6, (panic - 35) / 60) : 0, 0.9 + panic / 120);
    const heavy = Math.max(panic > 40 ? (panic - 40) / 60 : 0, G.body.stamina < 0.35 ? (0.35 - G.body.stamina) * 2 : 0);
    this.setLoop('breath', Math.min(0.5, heavy * 0.5), 1 + heavy * 0.6);
    // generatore e fuochi più vicini
    let gen = null, gd = 1e9;
    for (const f of G.base.generators()) {
      if (!f.state.on || f.state.fuel <= 0) continue;
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < gd) {
        gd = d;
        gen = f;
      }
    }
    this.setLoop('genloop', gen ? 0.8 : 0, 1, gen ? { x: gen.x, y: gen.L * 3 + 0.5, z: gen.z } : null);
    let fire = null, fd = 1e9;
    for (const s of G.base.lightSources) {
      if (!s.fire) continue;
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < fd) {
        fd = d;
        fire = s;
      }
    }
    for (const f of G.fx.fires) {
      const d = Math.hypot(f.x - p.x, f.z - p.z);
      if (d < fd) {
        fd = d;
        fire = f;
      }
    }
    this.setLoop('fireloop', fire ? 0.7 : 0, 1, fire ? { x: fire.x, y: (fire.y || 0) + 0.5, z: fire.z } : null);
    // brusio dell'orda in arrivo
    const h = G.zombies.hordes.find((x) => x.stage >= 1 && x.stage < 5);
    if (h) {
      const dir = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] }[h.side];
      const near = h.stage >= 4 ? { x: h.tx, z: h.tz } : { x: p.x + dir[0] * 45, z: p.z + dir[1] * 45 };
      const vol = h.stage === 1 ? 0.25 : h.stage === 2 ? 0.45 : 0.7;
      this.setLoop('rumble', vol, 1, { x: near.x, y: 2, z: near.z });
    } else this.setLoop('rumble', 0);
  }
}
