// Trailer sound effects the game doesn't ship, synthesized: an explosion, a
// whoosh, a crumble, a keyboard click and a two-tone horn. The game's own
// skid and impact (public/sounds/drive) cover the rest.
// Usage: node sfx.mjs <out dir>
import { mkdirSync, writeFileSync } from "node:fs";
const SR = 44100;
const OUT = process.argv[2] ?? "public/trailer/sfx";
mkdirSync(OUT, { recursive: true });
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function wav(path, data) {
  let peak = 0;
  for (const v of data) peak = Math.max(peak, Math.abs(v));
  const n = data.length,
    out = Buffer.alloc(44 + n * 2);
  out.write("RIFF", 0);
  out.writeUInt32LE(36 + n * 2, 4);
  out.write("WAVE", 8);
  out.write("fmt ", 12);
  out.writeUInt32LE(16, 16);
  out.writeUInt16LE(1, 20);
  out.writeUInt16LE(1, 22);
  out.writeUInt32LE(SR, 24);
  out.writeUInt32LE(SR * 2, 28);
  out.writeUInt16LE(2, 32);
  out.writeUInt16LE(16, 34);
  out.write("data", 36);
  out.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++)
    out.writeInt16LE(Math.round((data[i] / peak) * 0.95 * 32767), 44 + i * 2);
  writeFileSync(path, out);
}

// Explosion: a sub drop, a noise body closing down, and crackle in the tail.
{
  const n = Math.floor(1.8 * SR),
    d = new Float32Array(n);
  let ph = 0,
    lp = 0,
    lp2 = 0;
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    const f = 30 + 90 * Math.exp(-x * 9);
    ph += (2 * Math.PI * f) / SR;
    const sub = Math.sin(ph) * Math.exp(-x * 3.2) * 1.1;
    const fc = 200 + 5000 * Math.exp(-x * 5);
    lp += (1 - Math.exp((-2 * Math.PI * fc) / SR)) * (rnd() - lp);
    lp2 += 0.02 * (lp - lp2);
    const body = (lp * 0.9 + lp2 * 2.5) * Math.exp(-x * 2.4) * Math.min(1, x / 0.003);
    const crackle = x > 0.15 && Math.random() < 0.0025 * Math.exp(-x * 1.5) * 60 ? rnd() * 0.5 : 0;
    d[i] = Math.tanh((sub + body + crackle) * 1.6);
  }
  wav(`${OUT}/explosion.wav`, d);
}

// Whoosh: band of noise sweeping up, in and out.
{
  const n = Math.floor(0.55 * SR),
    d = new Float32Array(n);
  let lo = 0,
    hi = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fc = 400 + 4500 * u;
    const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    const nz = rnd();
    lo += k * (nz - lo);
    hi += k * 0.35 * (nz - hi);
    d[i] = (lo - hi) * Math.sin(Math.PI * u) ** 1.5;
  }
  wav(`${OUT}/whoosh.wav`, d);
}
// Crumble: a building settling into rubble. A soft thud, a low rumble that
// swells and fades, and debris clattering, thinning out.
{
  const n = Math.floor(2.2 * SR),
    d = new Float32Array(n);
  let lp = 0,
    lp2 = 0,
    ph = 0;
  const clacks = [];
  for (let i = 0; i < 70; i++)
    clacks.push({
      at: 0.05 + Math.pow(Math.random(), 1.8) * 1.6,
      f: 900 + Math.random() * 2600,
      a: 0.15 + Math.random() * 0.35,
    });
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    ph += (2 * Math.PI * (55 + 25 * Math.exp(-x * 6))) / SR;
    const thud = Math.sin(ph) * Math.exp(-x * 7) * 0.9;
    lp += 0.01 * (rnd() - lp);
    lp2 += 0.004 * (lp - lp2);
    const rumble = lp2 * 22 * Math.min(1, x / 0.25) * Math.exp(-x * 1.4);
    let clack = 0;
    for (const c of clacks) {
      const t = x - c.at;
      if (t < 0 || t > 0.04) continue;
      clack += Math.sin(2 * Math.PI * c.f * t) * Math.exp(-t * 160) * c.a;
    }
    d[i] = Math.tanh((thud + rumble + clack) * 1.3);
  }
  wav(`${OUT}/crumble.wav`, d);
}

// Key: one mechanical keyboard click.
{
  const n = Math.floor(0.06 * SR),
    d = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    const nz = rnd();
    const hp = nz - prev;
    prev = nz;
    d[i] =
      hp * Math.exp(-x * 140) * 0.8 + Math.sin(2 * Math.PI * 1900 * x) * Math.exp(-x * 90) * 0.35;
  }
  wav(`${OUT}/key.wav`, d);
}
// Horn: a little two-tone beep-beep, square and bright.
{
  const n = Math.floor(0.42 * SR),
    d = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    const on = x < 0.14 || (x > 0.2 && x < 0.38);
    const e = on ? 1 : 0;
    const v = ((x * 440) % 1 < 0.5 ? 1 : -1) * 0.5 + ((x * 554) % 1 < 0.5 ? 1 : -1) * 0.4;
    d[i] = v * e * 0.6;
  }
  wav(`${OUT}/horn.wav`, d);
}
console.log("ok");

// Ping: a notification landing. Two bright sine notes a fifth apart, a soft
// bell tail, like a phone's inbox chime.
{
  const n = Math.floor(0.9 * SR),
    d = new Float32Array(n);
  const notes = [
    [0, 1318.5],
    [0.09, 1975.5],
  ];
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    let v = 0;
    for (const [at, f] of notes) {
      const t = x - at;
      if (t < 0) continue;
      const e = Math.min(1, t / 0.004) * Math.exp(-t * 5.5);
      v += (Math.sin(2 * Math.PI * f * t) + 0.3 * Math.sin(2 * Math.PI * f * 2 * t) * Math.exp(-t * 12)) * e * 0.5;
    }
    d[i] = v;
  }
  wav(`${OUT}/ping.wav`, d);
}

// Click: a mouse button, a short hard tick with a low body.
{
  const n = Math.floor(0.05 * SR),
    d = new Float32Array(n);
  let prev = 0;
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    const nz = rnd();
    const hp = nz - prev;
    prev = nz;
    d[i] = hp * Math.exp(-x * 260) + Math.sin(2 * Math.PI * 520 * x) * Math.exp(-x * 120) * 0.6;
  }
  wav(`${OUT}/click.wav`, d);
}

// Crown: the win landing. A deep boom under a bright metallic clang and a
// shimmering chord that rings out.
{
  const n = Math.floor(2.4 * SR),
    d = new Float32Array(n);
  let ph = 0;
  const partials = [523.25, 659.25, 783.99, 1046.5, 1318.5, 2093];
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    ph += (2 * Math.PI * (40 + 70 * Math.exp(-x * 10))) / SR;
    const boom = Math.sin(ph) * Math.exp(-x * 3) * 1.1;
    let clang = 0;
    partials.forEach((f, k) => {
      clang += Math.sin(2 * Math.PI * f * (1 + 0.003 * k) * x + k) * Math.exp(-x * (1.2 + k * 0.5)) * (k < 3 ? 0.35 : 0.2);
    });
    const hit = rnd() * Math.exp(-x * 60) * 0.6;
    d[i] = Math.tanh((boom + clang * Math.min(1, x / 0.002) + hit) * 1.2);
  }
  wav(`${OUT}/crown.wav`, d);
}
