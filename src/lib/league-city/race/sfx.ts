// ─── Race sounds ────────────────────────────────────────────
// No samples: short synth cues on Howler's audio context, like the horn.
// The countdown beeps and a higher GO, the checkpoint chime (up when you're
// ahead, down when behind), the final-lap sting, the finish fanfare, the
// new-record sting and the rocket start's whoosh.

import { Howler } from "howler";

type Note = [freq: number, at: number, dur: number];

function play(notes: Note[], type: OscillatorType, volume: number): void {
  const ctx = Howler.ctx;
  const out = Howler.masterGain;
  if (!ctx || !out || ctx.state !== "running") return;
  const t0 = ctx.currentTime + 0.01;
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 3000;
  filter.connect(out);
  let end = 0;
  for (const [freq, at, dur] of notes) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, t0 + at);
    g.gain.linearRampToValueAtTime(volume, t0 + at + 0.01);
    g.gain.setValueAtTime(volume, t0 + at + dur * 0.7);
    g.gain.linearRampToValueAtTime(0, t0 + at + dur);
    o.connect(g);
    g.connect(filter);
    o.start(t0 + at);
    o.stop(t0 + at + dur + 0.02);
    end = Math.max(end, at + dur);
  }
  setTimeout(() => filter.disconnect(), (end + 0.2) * 1000);
}

// Notes (Hz).
const C5 = 523;
const E5 = 659;
const G5 = 784;
const C6 = 1047;
const A4 = 440;

export const sfx = {
  beep: () => play([[A4, 0, 0.16]], "square", 0.12),
  go: () => play([[880, 0, 0.5]], "square", 0.14),
  chime: (ahead: boolean) =>
    play(ahead ? [[G5, 0, 0.09], [C6, 0.08, 0.14]] : [[E5, 0, 0.09], [C5, 0.08, 0.16]], "triangle", 0.18),
  finalLap: () =>
    play([[C5, 0, 0.1], [E5, 0.1, 0.1], [G5, 0.2, 0.1], [C6, 0.3, 0.3], [G5, 0.62, 0.1], [C6, 0.72, 0.4]], "square", 0.1),
  finish: () =>
    play(
      [[G5, 0, 0.12], [G5, 0.14, 0.12], [G5, 0.28, 0.12], [E5, 0.42, 0.3], [G5, 0.74, 0.14], [C6, 0.9, 0.7]],
      "square",
      0.11,
    ),
  record: () => play([[C6, 0, 0.08], [E5 * 2, 0.08, 0.08], [G5 * 2, 0.16, 0.3]], "triangle", 0.16),
  rocket: () => {
    const ctx = Howler.ctx;
    const out = Howler.masterGain;
    if (!ctx || !out || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "sawtooth";
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(900, t + 0.4);
    g.gain.setValueAtTime(0.1, t);
    g.gain.linearRampToValueAtTime(0, t + 0.45);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.5);
  },
};
