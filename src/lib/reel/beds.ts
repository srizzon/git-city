// ─── Which music bed a reel gets ────────────────────────────
// A spec can name its bed; otherwise reels take turns on the config's three
// bases (Sam, 2026-10-19): the day's main on one, its trials each on the next,
// and the next day starting one further on. Instagram fingerprints the sound
// too, so the same bed every day would read as the same video. Trials written as
// variations of the main all take the next one: what they test is the one change.

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import type { ReelsConfig } from "./config";
import { specDir, type ReelSpec } from "./spec";

export function bedOf(spec: ReelSpec, config: ReelsConfig, home: string): string {
  if (spec.bed) return spec.bed;
  const beds = config.bedRotation;
  if (!beds.length) throw new Error("The spec names no bed and the config has no bedRotation.");
  const { date, slot } = specDir(spec.id);
  const day = Math.floor(Date.parse(`${date}T12:00:00Z`) / 86_400_000);
  const dir = path.join(home, "days", date);
  const trials = existsSync(dir)
    ? readdirSync(dir)
        .filter((s) => existsSync(path.join(dir, s, "spec.json")))
        .filter((s) => (JSON.parse(readFileSync(path.join(dir, s, "spec.json"), "utf8")) as { kind?: string }).kind === "trial")
        .sort()
    : [];
  const rank = spec.kind === "main" ? 0 : spec.variation ? 1 : trials.indexOf(slot) + 1;
  return beds[(day + rank) % beds.length];
}
