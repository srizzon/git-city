// ─── Horn ───────────────────────────────────────────────────
// No sample: two detuned square/saw tones through a quick envelope, like a
// small car's two-note horn. Plays while held; `stop` releases it.

export function startHorn(ctx: AudioContext, destination: AudioNode, volume = 0.22): () => void {
  const now = ctx.currentTime;
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.02);
  // A low-pass takes the fizz off the square wave.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 2200;
  filter.connect(gain);
  gain.connect(destination);

  const tones = [
    { type: "square" as const, freq: 415, detune: -8 },
    { type: "sawtooth" as const, freq: 523, detune: 6 },
  ].map(({ type, freq, detune }) => {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(filter);
    o.start(now);
    return o;
  });

  let stopped = false;
  return () => {
    if (stopped) return;
    stopped = true;
    const t = ctx.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.08);
    for (const o of tones) o.stop(t + 0.1);
    setTimeout(() => gain.disconnect(), 200);
  };
}
