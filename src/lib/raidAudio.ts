import { Howl } from "howler";

// ─── Raid Sound System ────────────────────────────────────────
// Lazy-loaded on first raid trigger. All sounds preloaded together.

let raidSounds: Record<string, Howl> | null = null;

const SOUND_DEFS: Record<string, { src: string; volume: number; loop?: boolean }> = {
  takeoff: { src: "/audio/raid/takeoff.mp3", volume: 0.4 },
  flight: { src: "/audio/raid/flight-loop.mp3", volume: 0.2, loop: true },
  shoot: { src: "/audio/raid/shoot.mp3", volume: 0.3 },
  impact: { src: "/audio/raid/impact.mp3", volume: 0.35 },
  shield_hit: { src: "/audio/raid/shield-hit.mp3", volume: 0.3 },
  explosion: { src: "/audio/raid/explosion.mp3", volume: 0.4 },
  victory: { src: "/audio/raid/victory.mp3", volume: 0.5 },
  defeat: { src: "/audio/raid/defeat.mp3", volume: 0.4 },
  crash: { src: "/audio/raid/crash.mp3", volume: 0.35 },
};

export function preloadRaidAudio() {
  if (raidSounds) return;
  raidSounds = {};
  for (const [name, def] of Object.entries(SOUND_DEFS)) {
    raidSounds[name] = new Howl({
      src: [def.src],
      volume: def.volume,
      loop: def.loop ?? false,
      preload: true,
    });
  }
}

export function playRaidSound(name: string) {
  raidSounds?.[name]?.play();
}

export function stopRaidSound(name: string) {
  raidSounds?.[name]?.stop();
}

export function fadeOutRaidSound(name: string, duration = 1000) {
  const s = raidSounds?.[name];
  if (s && s.playing()) {
    s.fade(s.volume(), 0, duration);
    setTimeout(() => s.stop(), duration);
  }
}

export function stopAllRaidSounds() {
  if (!raidSounds) return;
  for (const s of Object.values(raidSounds)) {
    s.stop();
  }
}
