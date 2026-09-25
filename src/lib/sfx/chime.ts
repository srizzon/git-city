// A short rising two-note chime, synthesized like the horn (no sound file).
let ctx: AudioContext | null = null;

export function chime() {
  try {
    ctx ??= new AudioContext();
    const c = ctx;
    const t0 = c.currentTime;
    [880, 1318.5].forEach((f, i) => {
      const o = c.createOscillator();
      const g = c.createGain();
      o.type = "square";
      o.frequency.value = f;
      const t = t0 + i * 0.07;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.12, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + 0.18);
    });
  } catch {
    // no audio
  }
}
