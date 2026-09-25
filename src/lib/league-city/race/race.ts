// ─── Races ──────────────────────────────────────────────────
// A race on the town track. The room server owns it through this state
// machine and times every lap itself (laps.ts); clients render it.
// Relative imports only (the PartyKit party bundles this file).
//
// - Anyone on the track starts one. The grid is set by the best lap each
//   driver has done in this room (no lap: to the back, in the order they came).
// - Everyone on the grid is placed on their slot and held there; five red
//   lights come on one a second, then go out after a short random wait.
// - Moving off your slot before the lights go out is a jump start: +5 s.
// - RACE.laps laps. Your time runs from lights out to your last crossing of
//   the line. Once the winner is in, the rest have RACE.afterWinner to finish.

export const RACE = {
  laps: 3,
  maxGrid: 12,
  /** One red light a second, five of them. */
  lights: 5,
  lightMs: 1000,
  /** Extra random hold with all five on before they go out (ms). */
  holdMin: 400,
  holdMax: 1600,
  /** How long the others have once the winner finishes (ms). */
  afterWinner: 45_000,
  /** A race that runs this long ends anyway (ms). */
  maxMs: 10 * 60_000,
  /** Results show at least this long before the next race can start (ms). */
  over: 8_000,
  /** Farther than this (m) from your slot before lights out: jump start. */
  jumpStart: 4,
  penaltyMs: 5_000,
} as const;

export type RacePhase = "idle" | "countdown" | "live" | "over";

export interface Finisher {
  id: string;
  name: string;
  /** Race time including penalties (ms). */
  ms: number;
}

export interface RaceState {
  phase: RacePhase;
  /** Lights on from here (server ms). */
  lightsAt: number;
  /** Lights out: the race starts (server ms). */
  startsAt: number;
  /** Live: ends by this time (server ms). Over: when it ended. */
  endsAt: number;
  /** Driver ids by grid slot. */
  grid: string[];
  /** Names by id, so results survive someone leaving. */
  names: Record<string, string>;
  /** Laps done by each racer. */
  laps: Record<string, number>;
  /** Penalty per racer (ms). */
  penalty: Record<string, number>;
  finished: Finisher[];
  /** Racers who left before finishing. */
  out: string[];
}

export function idleRace(): RaceState {
  return { phase: "idle", lightsAt: 0, startsAt: 0, endsAt: 0, grid: [], names: {}, laps: {}, penalty: {}, finished: [], out: [] };
}

export function canStart(s: RaceState, now: number): boolean {
  if (s.phase === "countdown" || s.phase === "live") return false;
  return !(s.phase === "over" && now < s.endsAt + RACE.over);
}

/**
 * Start a race. `drivers` in the order they came, `best` their best lap in
 * this room (ms). `hold` 0…1 picks the random wait before lights out.
 */
export function startRace(
  s: RaceState,
  drivers: readonly { id: string; name: string }[],
  best: Readonly<Record<string, number>>,
  now: number,
  hold: number,
): boolean {
  if (!canStart(s, now) || drivers.length === 0) return false;
  const order = drivers
    .map((d, i) => ({ ...d, i, b: best[d.name.toLowerCase()] ?? Infinity }))
    .sort((a, b) => a.b - b.b || a.i - b.i)
    .slice(0, RACE.maxGrid);
  Object.assign(s, idleRace());
  s.phase = "countdown";
  s.lightsAt = now + 1500;
  s.startsAt = s.lightsAt + RACE.lights * RACE.lightMs + RACE.holdMin + Math.round((RACE.holdMax - RACE.holdMin) * hold);
  s.endsAt = s.startsAt + RACE.maxMs;
  for (const d of order) {
    s.grid.push(d.id);
    s.names[d.id] = d.name;
    s.laps[d.id] = 0;
  }
  return true;
}

/** Lit lights at `now` (0–5); 0 again once they go out. */
export function litLights(s: RaceState, now: number): number {
  if (s.phase !== "countdown" || now < s.lightsAt) return 0;
  return Math.min(RACE.lights, 1 + Math.floor((now - s.lightsAt) / RACE.lightMs));
}

export function inRace(s: RaceState, id: string): boolean {
  return (s.phase === "countdown" || s.phase === "live") && s.grid.includes(id) && !s.out.includes(id) && !s.finished.some((f) => f.id === id);
}

/** A racer moved off their slot before lights out. Once per race. */
export function jumpStart(s: RaceState, id: string): boolean {
  if (s.phase !== "countdown" || !s.grid.includes(id) || s.penalty[id]) return false;
  s.penalty[id] = RACE.penaltyMs;
  return true;
}

/** A racer crossed the line completing a lap at `at` (server ms). Returns true when they finished. */
export function raceLap(s: RaceState, id: string, at: number): boolean {
  if (s.phase !== "live" || !inRace(s, id)) return false;
  s.laps[id] = (s.laps[id] ?? 0) + 1;
  if (s.laps[id] < RACE.laps) return false;
  s.finished.push({ id, name: s.names[id] ?? id, ms: Math.round(at - s.startsAt) + (s.penalty[id] ?? 0) });
  // Penalties can reorder the finishers.
  s.finished.sort((a, b) => a.ms - b.ms);
  if (s.finished.length === 1) s.endsAt = Math.min(s.endsAt, at + RACE.afterWinner);
  return true;
}

/** A racer left the room. */
export function leaveRace(s: RaceState, id: string): boolean {
  if (!inRace(s, id)) return false;
  s.out.push(id);
  return true;
}

/** Advance the clock. Returns true when clients must hear about it. */
export function tickRace(s: RaceState, now: number): boolean {
  if (s.phase === "countdown" && now >= s.startsAt) {
    s.phase = "live";
    return true;
  }
  if (s.phase !== "live") return false;
  const racing = s.grid.filter((id) => inRace(s, id));
  if (racing.length === 0 || now >= s.endsAt) {
    s.phase = "over";
    s.endsAt = now;
    return true;
  }
  return false;
}

/** Order on the road: laps done, then distance into the lap (m). Finishers first, by time. */
export function standings(s: RaceState, progress: Readonly<Record<string, number>>, length: number): string[] {
  const done = s.finished.map((f) => f.id);
  const rest = s.grid
    .filter((id) => !done.includes(id) && !s.out.includes(id))
    .sort((a, b) => (s.laps[b] ?? 0) * length + (progress[b] ?? 0) - ((s.laps[a] ?? 0) * length + (progress[a] ?? 0)));
  return [...done, ...rest];
}
