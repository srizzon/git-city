// ─── The reels board ────────────────────────────────────────
// What the review studio shows: the days that have reels, each reel's spec,
// state, checks and files, and its script as a table (time · scene · line)
// once its voice exists. Reads REELS_HOME; server only, dev only.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { Word } from "@trailer-kit/narration";
import type { Issue } from "./check";
import { reelOf } from "./film";
import { inHome, readSpecAt } from "./home";
import { filled, isReelDay, ReelSpec, specDir } from "./spec";
import { readStatus, type ReelStatus } from "./status";

export interface ScriptRow {
  /** Seconds, once the voice exists. */
  at: number | null;
  /** The scene that starts on this line, if one does. */
  scene: string | null;
  show: string;
  say: string;
}

export interface BoardReel {
  id: string;
  slot: string;
  spec: ReelSpec;
  status: ReelStatus;
  length: number | null;
  rows: ScriptRow[];
  /** The picture checks of the last draft. */
  checks: Issue[];
  /** URLs of what's been rendered, with their file times (to bust the cache). */
  files: { draft?: string; sheet?: string; final?: string; finalSheet?: string };
  notes: string;
  /** A spec that doesn't parse or fill: the error. */
  error: string | null;
}

/** The days with reels, newest first. */
export function reelDays(): string[] {
  const days = inHome("days");
  if (!days || !existsSync(days)) return [];
  return readdirSync(days)
    .filter(isReelDay)
    .sort()
    .reverse();
}

const url = (rel: string, file: string, dir: string) => {
  const full = path.join(dir, file);
  return existsSync(full) ? `/api/reels/file/${rel}/${file}?v=${Math.round(statSync(full).mtimeMs)}` : undefined;
};

function scriptRows(spec: ReelSpec, words: Word[] | null): { rows: ScriptRow[]; length: number | null } {
  const lines = spec.lines.map((l) => ({ show: l.show, say: l.say ?? l.show.replace(/\*/g, "") }));
  if (!words) return { length: null, rows: lines.map((l, i) => ({ ...l, at: null, scene: i === 0 ? spec.scenes[0].scene : null })) };
  const reel = reelOf(spec, words, null);
  let w = 0;
  const rows = lines.map((l) => {
    const at = words[w]?.[1] ?? null;
    w += l.say.split(/\s+/).filter(Boolean).length;
    return { ...l, at, scene: null as string | null };
  });
  // Each cut goes on the line it falls in.
  for (const c of reel.cuts) {
    const i = rows.findLastIndex((r) => r.at !== null && r.at <= c.from + 1e-6);
    const row = rows[Math.max(0, i)];
    row.scene = row.scene ? `${row.scene}, ${c.kind}` : c.kind;
  }
  return { rows, length: reel.length };
}

export function boardReel(id: string): BoardReel | null {
  const { rel, slot } = specDir(id);
  const dir = inHome(rel);
  if (!dir || !existsSync(path.join(dir, "spec.json"))) return null;
  const read = (f: string) => (existsSync(path.join(dir, f)) ? readFileSync(path.join(dir, f), "utf8") : null);
  const status = readStatus(dir);
  const notes = read("notes.md") ?? "";
  const checks = JSON.parse(read("checks.json") ?? "[]") as Issue[];
  const files = { draft: url(rel, "draft.mp4", dir), sheet: url(rel, "sheet.jpg", dir), final: url(rel, "final.mp4", dir), finalSheet: url(rel, "sheet-final.jpg", dir) };
  let spec: ReelSpec;
  try {
    spec = readSpecAt(dir);
  } catch (e) {
    return { id, slot, spec: null as unknown as ReelSpec, status, length: null, rows: [], checks, files, notes, error: (e as Error).message };
  }
  try {
    const voice = read("voice.json");
    const { rows, length } = scriptRows(filled(spec), voice ? (JSON.parse(voice) as Word[]) : null);
    return { id, slot, spec, status, length, rows, checks, files, notes, error: null };
  } catch (e) {
    return { id, slot, spec, status, length: null, rows: [], checks, files, notes, error: (e as Error).message };
  }
}

/** A day's reels: the main first, then the trials. */
export function boardDay(date: string): BoardReel[] {
  const dir = inHome(`days/${date}`);
  if (!dir || !existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((s) => existsSync(path.join(dir, s, "spec.json")))
    .map((s) => boardReel(`${date}-${s}`))
    .filter((r): r is BoardReel => !!r)
    .sort((a, b) => (a.spec?.kind === "main" ? -1 : b.spec?.kind === "main" ? 1 : a.slot.localeCompare(b.slot)));
}
