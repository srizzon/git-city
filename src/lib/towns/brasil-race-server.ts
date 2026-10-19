// ─── Brasil town: races, server side ────────────────────────
// Saves a timed finish (brasil_race_results, migration 179), pays its
// points into the Brasil ledger, and reads the boards back: a route's best
// time per dev, the week's racers, the records each city's routes hold.
// Server only.
//
// Points (RACE_POINTS) are paid per race once at least two signed-in racers
// have saved their finish: each of them for finishing, the winner for each
// one they beat (the same pair at most a few times a day), and anyone for a
// new route record (once per route a week, solo too). Every payment has its
// own ref, so a race settled twice (every finish settles it again) pays once,
// and the day's cap trims what's left.

import { getSupabaseAdmin } from "../supabase";
import { awardPoints } from "./brasil-points-server";
import { RACE_POINTS, brasiliaDay, pointsWeek } from "./brasil-points";
import type { RallyReceipt } from "../league-city/drive/rally";
import type { GhostRun } from "../league-city/race/ghost";

export interface BoardRow {
  login: string;
  ms: number;
}

export interface RaceSaved {
  /** Your best on this route now (ms), and your place on its board. */
  best: number;
  rank: number;
  /** The route's record (after this finish), and whether this finish set it. */
  record: BoardRow | null;
  newRecord: boolean;
  /** Who held the record before you took it (another dev), for the email. */
  dethroned: { id: number; login: string; ms: number } | null;
  board: BoardRow[];
}

/** Brasília's day starts 03:00 UTC. */
const dayStart = (at: Date) => `${brasiliaDay(at)}T03:00:00Z`;

/** Race points this dev has had today. */
async function raceToday(developerId: number, at: Date): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_points")
    .select("points")
    .eq("developer_id", developerId)
    .eq("kind", "race")
    .gte("created_at", dayStart(at))
    .returns<{ points: number }[]>();
  return (data ?? []).reduce((a, r) => a + r.points, 0);
}

/** Pays up to `points` under the day's cap. */
async function pay(developerId: number, ref: string, points: number, at: Date): Promise<void> {
  const room = RACE_POINTS.dayCap - (await raceToday(developerId, at));
  const p = Math.min(points, room);
  if (p > 0) await awardPoints(developerId, "race", ref, at, p);
}

/** Pays what a race owes so far (idempotent: every payment's ref is unique). */
async function settleRace(raceId: string, at: Date): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data } = await sb.from("brasil_race_results").select("developer_id, place").eq("race_id", raceId).returns<{ developer_id: number; place: number }[]>();
  const rows = data ?? [];
  if (rows.length < 2) return;
  for (const r of rows) await pay(r.developer_id, `race:${raceId}:finish:${r.developer_id}`, RACE_POINTS.finish, at);
  const winner = rows.find((r) => r.place === 1);
  if (!winner) return;
  const beaten = rows.filter((r) => r !== winner).sort((a, b) => a.place - b.place).slice(0, RACE_POINTS.maxBeats);
  for (const b of beaten) {
    const { count } = await sb
      .from("brasil_points")
      .select("id", { count: "exact", head: true })
      .eq("developer_id", winner.developer_id)
      .eq("kind", "race")
      .like("ref", `race:%:beat:${winner.developer_id}:${b.developer_id}`)
      .gte("created_at", dayStart(at));
    if ((count ?? 0) >= RACE_POINTS.samePairPerDay) continue;
    await pay(winner.developer_id, `race:${raceId}:beat:${winner.developer_id}:${b.developer_id}`, RACE_POINTS.beat, at);
  }
}

interface RecordRow {
  developer_id: number;
  ms: number;
  developers: { github_login: string } | null;
}

async function recordOf(key: string): Promise<{ id: number; login: string; ms: number } | null> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_race_records")
    .select("developer_id, ms, developers(github_login)")
    .eq("route_key", key)
    .maybeSingle<RecordRow>();
  return data?.developers ? { id: data.developer_id, login: data.developers.github_login, ms: data.ms } : null;
}

/** A route's board: each dev's best, fastest first. */
export async function getRouteBoard(key: string, limit = 10): Promise<BoardRow[]> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_race_results")
    .select("developer_id, ms, developers(github_login)")
    .eq("route_key", key)
    .order("ms", { ascending: true })
    .limit(400)
    .returns<RecordRow[]>();
  const seen = new Set<number>();
  const out: BoardRow[] = [];
  for (const r of data ?? []) {
    if (seen.has(r.developer_id) || !r.developers) continue;
    seen.add(r.developer_id);
    out.push({ login: r.developers.github_login, ms: r.ms });
    if (out.length >= limit) break;
  }
  return out;
}

/** Saves a verified finish for the signed-in viewer, pays the race, and says where it puts them. */
export async function saveRaceResult(developerId: number, login: string, r: RallyReceipt, ghost: GhostRun | null, at = new Date()): Promise<RaceSaved | null> {
  const sb = getSupabaseAdmin();
  const before = await recordOf(r.key);
  const { error } = await sb.from("brasil_race_results").insert({
    race_id: r.race,
    developer_id: developerId,
    route_key: r.key,
    from_city: r.from,
    to_city: r.to,
    ms: r.ms,
    place: r.place,
    racers: r.n,
    created_at: at.toISOString(),
  });
  // Already saved (the client retried): carry on with the board.
  if (error && error.code !== "23505") {
    console.error("[brasil race] save", error.message);
    return null;
  }
  const newRecord = !error && (!before || r.ms < before.ms);
  if (newRecord) {
    await pay(developerId, `record:${r.key}:${pointsWeek(at)}:${developerId}`, RACE_POINTS.record, at);
    if (ghost) {
      await sb.from("brasil_route_ghosts").upsert({ route_key: r.key, developer_id: developerId, ms: r.ms, ghost, updated_at: at.toISOString() });
    }
  }
  await settleRace(r.race, at);

  const board = await getRouteBoard(r.key, 50);
  const mine = board.findIndex((b) => b.login.toLowerCase() === login.toLowerCase());
  const { data: bestRow } = await sb
    .from("brasil_race_results")
    .select("ms")
    .eq("route_key", r.key)
    .eq("developer_id", developerId)
    .order("ms", { ascending: true })
    .limit(1)
    .maybeSingle<{ ms: number }>();
  return {
    best: bestRow?.ms ?? r.ms,
    rank: mine >= 0 ? mine + 1 : board.length + 1,
    record: board[0] ?? null,
    newRecord,
    dethroned: newRecord && before && before.id !== developerId ? before : null,
    board: board.slice(0, 10),
  };
}

/** What a race paid this dev so far. */
export async function racePointsOf(developerId: number, raceId: string, key: string, at = new Date()): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_points")
    .select("points, ref")
    .eq("developer_id", developerId)
    .eq("kind", "race")
    .or(`ref.like.race:${raceId}:%,ref.eq.record:${key}:${pointsWeek(at)}:${developerId}`)
    .returns<{ points: number; ref: string }[]>();
  return (data ?? []).reduce((a, r) => a + r.points, 0);
}

export async function getRouteGhost(key: string): Promise<{ login: string; ms: number; ghost: GhostRun } | null> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_route_ghosts")
    .select("ms, ghost, developers(github_login)")
    .eq("route_key", key)
    .maybeSingle<{ ms: number; ghost: GhostRun; developers: { github_login: string } | null }>();
  return data?.developers ? { login: data.developers.github_login, ms: data.ms, ghost: data.ghost } : null;
}

export interface RacerWeekRow {
  login: string;
  points: number;
  wins: number;
  records: number;
}

export interface RouteRecord {
  key: string;
  from: string;
  to: string;
  login: string;
  ms: number;
}

/** Every route's record (one row per route). */
export async function getRouteRecords(): Promise<RouteRecord[]> {
  const out: RouteRecord[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await getSupabaseAdmin()
      .from("brasil_race_records")
      .select("route_key, from_city, to_city, ms, developers(github_login)")
      .range(from, from + 999)
      .returns<{ route_key: string; from_city: string; to_city: string; ms: number; developers: { github_login: string } | null }[]>();
    for (const r of data ?? []) if (r.developers) out.push({ key: r.route_key, from: r.from_city, to: r.to_city, login: r.developers.github_login, ms: r.ms });
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** This week's racers: race points, wins over someone, records held; most points first. */
export async function getRaceWeek(at = new Date()): Promise<RacerWeekRow[]> {
  const sb = getSupabaseAdmin();
  const week = pointsWeek(at);
  const [{ data: pts }, { data: wins }, records] = await Promise.all([
    sb.from("brasil_points").select("points, developers(github_login)").eq("kind", "race").eq("week_start", week).limit(5000).returns<{ points: number; developers: { github_login: string } | null }[]>(),
    sb
      .from("brasil_race_results")
      .select("developers(github_login)")
      .eq("place", 1)
      .gt("racers", 1)
      .gte("created_at", `${week}T00:00:00Z`)
      .limit(5000)
      .returns<{ developers: { github_login: string } | null }[]>(),
    getRouteRecords(),
  ]);
  const rows = new Map<string, RacerWeekRow>();
  const of = (login: string) => {
    const l = login.toLowerCase();
    let r = rows.get(l);
    if (!r) rows.set(l, (r = { login, points: 0, wins: 0, records: 0 }));
    return r;
  };
  for (const p of pts ?? []) if (p.developers) of(p.developers.github_login).points += p.points;
  for (const w of wins ?? []) if (w.developers) of(w.developers.github_login).wins += 1;
  for (const r of records) of(r.login).records += 1;
  return [...rows.values()].sort((a, b) => b.points - a.points || b.records - a.records || b.wins - a.wins || a.login.localeCompare(b.login)).slice(0, 30);
}
