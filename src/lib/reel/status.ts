// ─── A reel's state ─────────────────────────────────────────
// Where each reel is on its way to Instagram, in its folder's status.json:
// written by the CLI and the studio's buttons, read by the day board.
//
//   script → script_ok → draft → draft_ok → final → scheduled → posted
//
// Each step records when it happened; a failed job records its error and
// leaves the state where it was.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const STATES = ["script", "script_ok", "draft", "draft_ok", "final", "scheduled", "posted"] as const;
export type ReelState = (typeof STATES)[number];

export interface ReelStatus {
  state: ReelState;
  history: { state: ReelState; at: string }[];
  /** The last failed job, until the next one succeeds. */
  error: { job: string; message: string; at: string } | null;
  /** A job queued by the studio and not done yet. */
  queued: string | null;
}

const FILE = "status.json";

export function readStatus(dir: string): ReelStatus {
  const file = path.join(dir, FILE);
  if (!existsSync(file)) return { state: "script", history: [], error: null, queued: null };
  return JSON.parse(readFileSync(file, "utf8")) as ReelStatus;
}

export function writeStatus(dir: string, status: ReelStatus) {
  writeFileSync(path.join(dir, FILE), JSON.stringify(status, null, 2));
}

export function setState(dir: string, state: ReelState): ReelStatus {
  const s = readStatus(dir);
  const next = { ...s, state, error: null, history: [...s.history, { state, at: new Date().toISOString() }] };
  writeStatus(dir, next);
  return next;
}

export function setError(dir: string, job: string, message: string) {
  writeStatus(dir, { ...readStatus(dir), error: { job, message, at: new Date().toISOString() }, queued: null });
}

export const isAtLeast = (s: ReelState, than: ReelState) => STATES.indexOf(s) >= STATES.indexOf(than);
