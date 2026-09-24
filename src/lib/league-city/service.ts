import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { START_SIZE } from "./grid";
import { starterOps } from "./starter";
import type { CityObject, CityOp } from "./types";

// ─── League city service ────────────────────────────────────
// Every write goes through apply_league_city_ops (migration 126), which locks
// the league's city, validates the batch and bumps the version.

const MAX_OPS = 200;

export interface LeagueCity {
  size: number;
  version: number;
  objects: CityObject[];
}

export interface OpsResult {
  version: number;
  size: number;
  objects_changed: number;
  unplaced: number[];
  skipped?: boolean;
}

const MESSAGES: Record<string, [string, number]> = {
  lot_taken: ["That lot is taken.", 409],
  out_of_bounds: ["That's outside the city.", 400],
  not_member: ["That developer isn't in this league.", 400],
  too_many_ops: ["Too many changes at once.", 400],
  already_placed: ["That building is already in the city.", 409],
  forbidden: ["Buildings can't be removed from the city.", 403],
  not_found: ["That object is gone. Reload the city.", 409],
  invalid_op: ["That change isn't valid.", 400],
};

export class CityOpError extends Error {
  code: string;
  status: number;
  constructor(code: string) {
    const [message, status] = MESSAGES[code] ?? ["Couldn't save the city.", 500];
    super(message);
    this.code = code in MESSAGES ? code : "city_failed";
    this.status = status;
  }
}

async function rpc(leagueId: string, actorId: number | null, ops: CityOp[]): Promise<OpsResult> {
  const { data, error } = await getSupabaseAdmin().rpc("apply_league_city_ops", {
    p_league_id: leagueId,
    p_actor_id: actorId,
    p_ops: ops,
  });
  if (error) {
    if (!(error.message in MESSAGES)) console.error("[league-city]", error);
    throw new CityOpError(error.message);
  }
  return data as OpsResult;
}

/** Applies an admin's batch. Throws CityOpError with a user-facing message. */
export async function applyOps(leagueId: string, actorId: number, ops: CityOp[]): Promise<OpsResult> {
  if (ops.some((o) => o.op === "init" || o.op === "auto_place")) throw new CityOpError("invalid_op");
  return rpc(leagueId, actorId, ops);
}

// ─── Reads ──────────────────────────────────────────────────

async function loadCity(leagueId: string): Promise<LeagueCity | null> {
  const sb = getSupabaseAdmin();
  const { data: city } = await sb.from("league_cities").select("size, version").eq("league_id", leagueId).maybeSingle();
  if (!city) return null;
  const objects: CityObject[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("league_objects")
      .select("id, kind, item_type, developer_id, x, z, px, pz, rot, is_new")
      .eq("league_id", leagueId)
      .order("id")
      .range(from, from + 999)
      .returns<CityObject[]>();
    if (!data || data.length === 0) break;
    objects.push(...data);
    if (data.length < 1000) break;
  }
  return { size: city.size as number, version: Number(city.version), objects };
}

/** The league's city, building the starter city first if it has none yet. */
export async function getCity(leagueId: string): Promise<LeagueCity> {
  const city = await loadCity(leagueId);
  if (city) return city;
  await ensureCity(leagueId);
  return (await loadCity(leagueId)) ?? { size: START_SIZE, version: 0, objects: [] };
}

// ─── System writes ──────────────────────────────────────────

/**
 * Builds the starter city from the current members when the league has no
 * city yet. Safe to race: the first batch carries `init`, which the SQL
 * function skips when another call already built the city.
 */
export async function ensureCity(leagueId: string): Promise<void> {
  const sb = getSupabaseAdmin();
  const { data: existing } = await sb.from("league_cities").select("version").eq("league_id", leagueId).maybeSingle();
  if (existing && Number(existing.version) > 0) return;

  const members: { developer_id: number; weight: number }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("league_members")
      .select("developer_id, developers!league_members_developer_id_fkey(contributions)")
      .eq("league_id", leagueId)
      .in("status", ["invited", "active"])
      .order("developer_id")
      .range(from, from + 999)
      .returns<{ developer_id: number; developers: { contributions: number | null } | null }[]>();
    if (!data || data.length === 0) break;
    for (const r of data) members.push({ developer_id: r.developer_id, weight: r.developers?.contributions ?? 0 });
    if (data.length < 1000) break;
  }

  const { ops, unplaced } = starterOps(members);
  const first = await rpc(leagueId, null, ops.slice(0, MAX_OPS));
  if (first.skipped) return;
  for (let i = MAX_OPS; i < ops.length; i += MAX_OPS) await rpc(leagueId, null, ops.slice(i, i + MAX_OPS));
  if (unplaced.length) console.warn(`[league-city] ${leagueId}: ${unplaced.length} members didn't fit the starter city`);
}

/**
 * Puts members' buildings in the city (nearest free lot to the center that
 * touches a road). No-op for members who already have one. Never throws:
 * placement must not break an invite or a join.
 */
export async function autoPlace(leagueId: string, devIds: number | number[]): Promise<void> {
  const ids = Array.isArray(devIds) ? devIds : [devIds];
  if (ids.length === 0) return;
  try {
    await ensureCity(leagueId);
    for (let i = 0; i < ids.length; i += MAX_OPS) {
      const res = await rpc(
        leagueId,
        null,
        ids.slice(i, i + MAX_OPS).map((id): CityOp => ({ op: "auto_place", developer_id: id })),
      );
      if (res.unplaced?.length) console.warn(`[league-city] ${leagueId}: city full, ${res.unplaced.length} waiting`);
    }
  } catch (err) {
    console.error("[league-city] auto-place failed", leagueId, err);
  }
}

/** Takes former or removed members' buildings out of the city. Never throws. */
export async function removeBuilding(leagueId: string, devIds: number | number[]): Promise<void> {
  const ids = Array.isArray(devIds) ? devIds : [devIds];
  if (ids.length === 0) return;
  try {
    const { data: city } = await getSupabaseAdmin().from("league_cities").select("version").eq("league_id", leagueId).maybeSingle();
    if (!city) return;
    for (let i = 0; i < ids.length; i += MAX_OPS) {
      await rpc(
        leagueId,
        null,
        ids.slice(i, i + MAX_OPS).map((id): CityOp => ({ op: "remove", developer_id: id })),
      );
    }
  } catch (err) {
    console.error("[league-city] remove failed", leagueId, err);
  }
}
