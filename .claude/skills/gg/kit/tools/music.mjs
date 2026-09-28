// Trailer music, synthesized from scratch (no samples, no dependencies):
// arcade racing synthwave at 150 BPM. Two cuts:
//   full  16 bars for a ~25s launch trailer
//   soon  the Towns teaser: 1 bar intro, 3 bars of drop, silence on the
//         freeze, then the end card's hits (Git City: src/lib/trailer/towns/teaser)
//   demo  the kit's demo film, the same shape a bar shorter (Git City: src/lib/trailer/demo/film)
//   launch the Towns launch trailer: a hook of hits on the Enters, the drop,
//         the week's groove, a lighter Friday, Sunday's roll, silence on the
//         freeze, the payoff, then the end card's hits (Git City: src/lib/trailer/towns/launch)
// Everything is a function of beats, so changing BPM retimes it all; the
// film's timeline must use the same BPM. Tweak the arrangement at the bottom.
// Bar 1: the burnout (engine rev rising, a hit on beat 4 when the cars launch).
// Bars 2-9: the drop. 10-13: lead melody. 14-15: build. 16: final hit.
// Usage: node music.mjs <out.wav> [full|soon|demo|launch]
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const SR = 44100;
const BPM = 150;
const BEAT = 60 / BPM;
const BAR = BEAT * 4;
// A teaser cut ("soon", "demo"): 1 bar intro, the drop until the freeze, silence
// on the freeze, then the end card's hits from the cut to black. In beats:
const MODE = process.argv[3] ?? "full";
const CUTS = { soon: { freeze: 16, card: 18 }, demo: { freeze: 12, card: 14 } };
const TEASER = CUTS[MODE];
// The launch cut, in beats: the freeze, the payoff after the silence, and the cut to black.
const LAUNCH = MODE === "launch" ? { freeze: 70, resume: 72, card: 80 } : null;
const GATE = TEASER ?? (LAUNCH && { freeze: LAUNCH.freeze, card: LAUNCH.resume });
const BARS = LAUNCH ? Math.ceil((LAUNCH.card + 12) / 4) : TEASER ? Math.ceil((TEASER.card + 10) / 4) : 16;
const LEN = Math.ceil((BARS * BAR + 2.5) * SR);
const L = new Float32Array(LEN);
const R = new Float32Array(LEN);
const duck = new Float32Array(LEN).fill(1); // sidechain from the kick

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const at = (bar, beat = 0) => (bar * 4 + beat) * BEAT; // 0-indexed bar
let seed = 7;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 2 - 1;

function add(buf, i, v) {
  if (i >= 0 && i < LEN) buf[i] += v;
}
function both(i, v, pan = 0) {
  add(L, i, v * (1 - pan));
  add(R, i, v * (1 + pan));
}

// ─── Drums ───
function kick(t, gain = 1) {
  const s = Math.floor(t * SR);
  let ph = 0;
  for (let i = 0; i < 0.42 * SR; i++) {
    const x = i / SR;
    const f = 45 + 110 * Math.exp(-x * 28);
    ph += (2 * Math.PI * f) / SR;
    const env = Math.exp(-x * 7.5);
    const click = i < 60 ? rnd() * 0.4 * (1 - i / 60) : 0;
    both(s + i, (Math.sin(ph) * env * 0.95 + click) * gain);
  }
  for (let i = 0; i < 0.3 * SR; i++) {
    const k = s + i;
    if (k < LEN) duck[k] = Math.min(duck[k], 0.35 + 0.65 * Math.min(1, i / (0.3 * SR)));
  }
}
function snare(t, gain = 1) {
  const s = Math.floor(t * SR);
  let lp = 0,
    prev = 0;
  for (let i = 0; i < 0.22 * SR; i++) {
    const x = i / SR;
    const n = rnd();
    lp += 0.5 * (n - lp);
    const hp = n - lp; // brighter noise
    const tone = Math.sin(2 * Math.PI * 185 * x) * Math.exp(-x * 30) * 0.5;
    const env = Math.exp(-x * 16);
    both(s + i, (hp * 0.55 * env + tone) * gain, 0.05);
    prev = n;
  }
}
function hat(t, open = false, gain = 1) {
  const s = Math.floor(t * SR);
  let prev = 0;
  const dur = open ? 0.18 : 0.045;
  for (let i = 0; i < dur * SR; i++) {
    const x = i / SR;
    const n = rnd();
    const hp = n - prev;
    prev = n;
    both(s + i, hp * 0.16 * Math.exp(-x * (open ? 14 : 70)) * gain, 0.25);
  }
}
function crash(t, gain = 1) {
  const s = Math.floor(t * SR);
  let prev = 0;
  for (let i = 0; i < 2.2 * SR; i++) {
    const x = i / SR;
    const n = rnd();
    const hp = n - prev;
    prev = n;
    both(s + i, hp * 0.22 * Math.exp(-x * 1.6) * gain, i % 2 ? 0.3 : -0.3);
  }
}

// ─── Synths ───
function tone(
  t,
  dur,
  midi,
  {
    wave = "saw",
    gain = 0.2,
    cutoff = 2000,
    env = [0.005, 0.1, 0.6, 0.08],
    pan = 0,
    vib = 0,
    detune = 0,
    sc = true,
    glideFrom = null,
  } = {},
) {
  const s = Math.floor(t * SR);
  const [a, d, sus, r] = env;
  const n = Math.floor((dur + r) * SR);
  const f0 = mtof(midi);
  const voices = detune ? [-detune, 0, detune] : [0];
  const phs = voices.map(() => Math.random());
  let lp = 0;
  const k = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    let e = x < a ? x / a : x < a + d ? 1 - (1 - sus) * ((x - a) / d) : sus;
    if (x > dur) e *= Math.max(0, 1 - (x - dur) / r);
    let f = f0;
    if (glideFrom !== null)
      f = mtof(glideFrom) + (f0 - mtof(glideFrom)) * Math.min(1, x / Math.max(0.001, dur));
    if (vib) f *= 1 + vib * Math.sin(2 * Math.PI * 5.5 * x) * Math.min(1, x * 4);
    let v = 0;
    voices.forEach((dv, j) => {
      phs[j] = (phs[j] + (f * Math.pow(2, dv / 1200)) / SR) % 1;
      const p = phs[j];
      v +=
        wave === "saw"
          ? 2 * p - 1
          : wave === "square"
            ? p < 0.5
              ? 1
              : -1
            : wave === "pulse"
              ? p < 0.25
                ? 1
                : -1
              : Math.sin(2 * Math.PI * p);
    });
    v /= voices.length;
    lp += k * (v - lp);
    const idx = s + i;
    const g = sc && idx < LEN ? duck[idx] : 1;
    both(idx, lp * e * gain * g, pan);
  }
}

// Echo send for the lead (dotted eighth).
const echoL = new Float32Array(LEN),
  echoR = new Float32Array(LEN);
function lead(t, dur, midi, gain = 0.13) {
  const s = Math.floor(t * SR);
  const n = Math.floor((dur + 0.05) * SR);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const x = i / SR;
    const f = mtof(midi) * (1 + 0.006 * Math.sin(2 * Math.PI * 6 * x) * Math.min(1, x * 3));
    ph = (ph + f / SR) % 1;
    let e =
      Math.min(1, x / 0.004) *
      (x > dur ? Math.max(0, 1 - (x - dur) / 0.05) : 1) *
      (0.8 + 0.2 * Math.exp(-x * 8));
    const v = (ph < 0.25 ? 1 : -1) * e * gain;
    both(s + i, v, -0.1);
    add(echoL, s + i, v * 0.5);
    add(echoR, s + i, v * 0.5);
  }
}

// ─── FX ───
function riser(t0, t1, gain = 0.25) {
  const s = Math.floor(t0 * SR),
    n = Math.floor((t1 - t0) * SR);
  let lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const fc = 300 + 7000 * u * u;
    const k = 1 - Math.exp((-2 * Math.PI * fc) / SR);
    lp += k * (rnd() - lp);
    both(s + i, lp * gain * u, Math.sin(u * 20) * 0.3);
  }
}
// The engine: a detuned saw growl gliding up, wobbling like revs.
function engine(t0, t1, gain = 0.22) {
  const s = Math.floor(t0 * SR),
    n = Math.floor((t1 - t0) * SR);
  let p1 = 0,
    p2 = 0,
    lp = 0;
  for (let i = 0; i < n; i++) {
    const u = i / n;
    const x = i / SR;
    const f = (38 + 70 * u * u) * (1 + 0.08 * Math.sin(2 * Math.PI * (9 + 18 * u) * x));
    p1 = (p1 + f / SR) % 1;
    p2 = (p2 + (f * 1.503) / SR) % 1;
    const v = (2 * p1 - 1) * 0.7 + (2 * p2 - 1) * 0.4;
    const fc = 180 + 1800 * u;
    lp += (1 - Math.exp((-2 * Math.PI * fc) / SR)) * (v - lp);
    const e = Math.min(1, x / 0.05) * (u > 0.97 ? (1 - u) / 0.03 : 1);
    both(s + i, Math.tanh(lp * 2.2) * gain * e * (0.5 + 0.5 * u));
  }
}
function impact(t, gain = 1) {
  kick(t, 1.1 * gain);
  crash(t, 0.8 * gain);
  const s = Math.floor(t * SR);
  let lp = 0;
  for (let i = 0; i < 0.5 * SR; i++) {
    const x = i / SR;
    lp += 0.15 * (rnd() - lp);
    both(s + i, lp * 0.9 * Math.exp(-x * 9) * gain);
  }
  tone(t, 0.35, 28, {
    wave: "sine",
    gain: 0.5 * gain,
    cutoff: 400,
    env: [0.002, 0.3, 0.2, 0.3],
    sc: false,
    glideFrom: 40,
  });
}

// ─── Arrangement ───
// Bars 0-1: burnouts. Engine revs beats 0-3, launch hit on beat 3 (the 4th beat).
for (const b of LAUNCH ? [] : [0]) {
  kick(at(b, 0), 0.8);
  engine(at(b, 0), at(b, 3), 0.24);
  riser(at(b, 1.5), at(b, 3), 0.18);
  impact(at(b, 3), 1.1);
  tone(at(b, 0), BAR, 28, {
    wave: "saw",
    gain: 0.12,
    cutoff: 220,
    env: [0.02, 0.2, 0.8, 0.1],
    sc: false,
  });
}

// Chords: Em, C, D, B (i, VI, VII, V).
const CHORDS = [
  { root: 40, notes: [64, 67, 71] },
  { root: 36, notes: [60, 64, 67] },
  { root: 38, notes: [62, 66, 69] },
  { root: 35, notes: [59, 63, 66] },
];

function groove(bar, { hats = true, arp = true, pad = true, bassBusy = true, drop = false } = {}) {
  const c = CHORDS[bar % 4];
  for (let q = 0; q < 4; q++) {
    kick(at(bar, q), 1);
    if (q === 1 || q === 3) snare(at(bar, q), 0.9);
    if (hats) {
      for (let s = 0; s < 4; s++) hat(at(bar, q + s / 4), s === 2, s === 2 ? 0.8 : 0.55);
    }
  }
  // Bass: offbeat octave pumping eighths.
  for (let e = 0; e < 8; e++) {
    const m = c.root + (e % 2 ? 12 : 0);
    if (!bassBusy && e % 2 === 0) continue;
    tone(at(bar, e / 2), (BEAT / 2) * 0.9, m, {
      wave: "saw",
      gain: 0.22,
      cutoff: 900,
      env: [0.003, 0.08, 0.5, 0.03],
      detune: 8,
    });
  }
  if (pad)
    for (const n of c.notes)
      tone(at(bar), BAR, n - 12, {
        wave: "saw",
        gain: 0.05,
        cutoff: 1500,
        env: [0.05, 0.4, 0.7, 0.2],
        detune: 14,
        pan: n % 2 ? 0.4 : -0.4,
      });
  if (arp) {
    const seq = [c.notes[0], c.notes[1], c.notes[2], c.notes[0] + 12];
    for (let s = 0; s < 16; s++)
      tone(at(bar, s / 4), (BEAT / 4) * 0.8, seq[s % 4], {
        wave: "pulse",
        gain: 0.06,
        cutoff: 3500,
        env: [0.002, 0.05, 0.4, 0.03],
        pan: 0.35,
      });
  }
  if (drop) crash(at(bar), 0.9);
}

// The end card (beats after the cut to black): an echo on the cut, an
// 8-bit kick and crunch as the name stamps on (+1), a thud on the stamp
// (+3), a chord stab on the line (+5) and a held note under the hold.
function cardHits(card) {
  const C = card * BEAT;
  tone(C, 0.9, 28, {
    wave: "sine",
    gain: 0.25,
    cutoff: 300,
    env: [0.002, 0.8, 0.1, 0.6],
    sc: false,
    glideFrom: 36,
  });
  const stamp = C + BEAT;
  kick(stamp, 1.1);
  snare(stamp, 0.6);
  tone(stamp, 0.18, 40, {
    wave: "square",
    gain: 0.16,
    cutoff: 1800,
    env: [0.001, 0.12, 0.2, 0.05],
    sc: false,
  });
  // The stamp lands (card beat 3): a dry thud, like a rubber stamp.
  const thud = C + 3 * BEAT;
  kick(thud, 1.2);
  snare(thud, 0.45);
  tone(thud, 0.12, 33, {
    wave: "square",
    gain: 0.2,
    cutoff: 700,
    env: [0.001, 0.08, 0.1, 0.04],
    sc: false,
  });
  const stab = C + 5 * BEAT;
  kick(stab, 0.8);
  for (const n of [64, 67, 71, 76])
    tone(stab, 0.22, n, {
      wave: "saw",
      gain: 0.07,
      cutoff: 2600,
      env: [0.002, 0.15, 0.3, 0.12],
      detune: 12,
      sc: false,
    });
  tone(stab, 3 * BEAT, 52, {
    wave: "saw",
    gain: 0.045,
    cutoff: 900,
    env: [0.08, 0.5, 0.7, 0.4],
    detune: 10,
    sc: false,
  });
}

if (LAUNCH) {
  // Beats as `at(0, beat)`: the timeline of src/lib/trailer/towns/launch.
  const B = (beat) => at(0, beat);
  // The hook (0-16): a low drone under the typing, a hit on each Enter (3, 7,
  // 10), then the town rising a band a beat with a riser into the drop.
  tone(B(0), 10 * BEAT, 28, { wave: "saw", gain: 0.08, cutoff: 220, env: [0.3, 0.2, 0.8, 0.2], sc: false });
  for (const n of CHORDS[0].notes)
    tone(B(0), 10 * BEAT, n - 12, { wave: "saw", gain: 0.03, cutoff: 800, env: [0.6, 0.4, 0.7, 0.2], detune: 14, pan: n % 2 ? 0.4 : -0.4 });
  for (const e of [3, 7]) {
    kick(B(e), 1);
    tone(B(e), 0.3, 28, { wave: "sine", gain: 0.35, cutoff: 300, env: [0.002, 0.25, 0.1, 0.2], sc: false, glideFrom: 36 });
  }
  impact(B(10), 0.9);
  for (let q = 10; q < 16; q++) kick(B(q), 0.7 + 0.05 * (q - 10));
  tone(B(10), 6 * BEAT, 28, { wave: "saw", gain: 0.12, cutoff: 300, env: [0.05, 0.2, 0.8, 0.1], sc: false });
  riser(B(12), B(16), 0.22);
  // Pick a side, and the week (16-48): the drop, the groove, the lead from Wednesday.
  impact(B(16), 1.1);
  for (let bar = 4; bar < 12; bar++) groove(bar, { drop: bar === 4 || bar === 10 });
  const MEL = [
    [71, 71, 76, 74, 71, 69, 67, 69],
    [67, 67, 72, 71, 67, 64, 67, 69],
  ];
  MEL.forEach((m, i) => m.forEach((n, e) => n && lead(at(8 + i, e / 2), (BEAT / 2) * 0.9, n)));
  // Friday (48-56): lighter, no kick, the bass and hats.
  for (const bar of [12, 13]) groove(bar, { arp: false, bassBusy: false });
  // Sunday (56-70): a snare roll that doubles, the bass on quarters, a riser to midnight.
  for (let bar = 14; bar < 18; bar++) {
    const c = CHORDS[bar % 4];
    for (let q = 0; q < 4; q++) {
      if (bar * 4 + q >= LAUNCH.freeze) break;
      kick(at(bar, q), 0.9);
      tone(at(bar, q), BEAT * 0.9, c.root + 12, { wave: "saw", gain: 0.18, cutoff: 700 + (bar - 14) * 500 + q * 150, env: [0.003, 0.1, 0.6, 0.05], detune: 8 });
    }
    const div = bar < 16 ? 4 : 8;
    for (let k = 0; k < div * 4; k++) {
      const beat = bar * 4 + k / div;
      if (beat < LAUNCH.freeze) snare(at(0, beat), 0.3 + (0.5 * (beat - 56)) / 14);
    }
  }
  riser(B(62), B(LAUNCH.freeze), 0.3);
  // The payoff (72-80): the crown's hit, the groove once more, a last crash.
  impact(B(LAUNCH.resume), 1.2);
  groove(18, { drop: true });
  groove(19, { drop: true });
  cardHits(LAUNCH.card);
} else if (TEASER) {
  for (let b = 1; b * 4 < TEASER.freeze; b++) groove(b, { drop: b === 1 });
  cardHits(TEASER.card);
} else {
  for (let b = 1; b < 9; b++) groove(b, { drop: b === 1 || b === 5 });

  // Lead melody over bars 10-13 (eighths, 0 = rest).
  const MEL = [
    [71, 71, 76, 74, 71, 69, 67, 69],
    [67, 67, 72, 71, 67, 64, 67, 69],
    [69, 69, 74, 72, 69, 66, 69, 71],
    [71, 0, 75, 0, 78, 76, 75, 71],
  ];
  for (let i = 0; i < 4; i++) {
    const b = 9 + i;
    groove(b, { drop: i === 0 });
    MEL[i].forEach((m, e) => m && lead(at(b, e / 2), (BEAT / 2) * 0.9, m));
  }

  // Build: bars 14-15, snare roll and riser, bass on quarters.
  for (const b of [13, 14]) {
    const c = CHORDS[b % 4];
    for (let q = 0; q < 4; q++) {
      kick(at(b, q), 0.9);
      tone(at(b, q), BEAT * 0.9, c.root + 12, {
        wave: "saw",
        gain: 0.18,
        cutoff: 700 + (b - 13) * 900 + q * 250,
        env: [0.003, 0.1, 0.6, 0.05],
        detune: 8,
      });
    }
    const div = b === 13 ? 4 : 8;
    for (let s = 0; s < div * 4; s++)
      snare(at(b, s / div), 0.35 + (0.55 * ((b - 13) * 16 + s * (16 / div / 2))) / 32);
  }
  riser(at(13), at(15), 0.3);
  impact(at(15), 1.2);
  tone(at(15), BAR * 1.2, 40, {
    wave: "saw",
    gain: 0.12,
    cutoff: 600,
    env: [0.005, 1.2, 0.3, 1.0],
    detune: 12,
    sc: false,
  });
  for (const n of CHORDS[0].notes)
    tone(at(15), BAR * 1.2, n, {
      wave: "saw",
      gain: 0.05,
      cutoff: 1800,
      env: [0.005, 1.4, 0.3, 1.2],
      detune: 14,
      sc: false,
    });
}
// Echo on the lead: dotted eighth, three repeats.
const dly = Math.floor(BEAT * 0.75 * SR);
for (let i = dly; i < LEN; i++) {
  echoL[i] += echoR[i - dly] * 0.45;
  echoR[i] += echoL[i - dly] * 0.45;
}
for (let i = dly; i < LEN; i++) {
  L[i] += echoL[i - dly] * 0.6;
  R[i] += echoR[i - dly] * 0.6;
}

// The freeze: hard silence from the freeze until the cut to black.
if (GATE) {
  const s0 = Math.floor(GATE.freeze * BEAT * SR),
    s1 = Math.floor(GATE.card * BEAT * SR) - 40;
  for (let i = s0; i < s1 && i < LEN; i++) {
    const k = i < s0 + 220 ? 1 - (i - s0) / 220 : 0;
    L[i] *= k;
    R[i] *= k;
    echoL[i] = 0;
    echoR[i] = 0;
  }
}

// Master: gentle saturation and normalize.
let peak = 0;
for (let i = 0; i < LEN; i++) {
  L[i] = Math.tanh(L[i] * 1.25);
  R[i] = Math.tanh(R[i] * 1.25);
  peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
}
const norm = 0.92 / peak;

const out = Buffer.alloc(44 + LEN * 4);
out.write("RIFF", 0);
out.writeUInt32LE(36 + LEN * 4, 4);
out.write("WAVE", 8);
out.write("fmt ", 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write("data", 36);
out.writeUInt32LE(LEN * 4, 40);
for (let i = 0; i < LEN; i++) {
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * norm)) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * norm)) * 32767), 46 + i * 4);
}
const outPath = process.argv[2] ?? "teaser.wav";
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);
console.log(`${(LEN / SR).toFixed(1)}s at ${BPM} BPM`);
