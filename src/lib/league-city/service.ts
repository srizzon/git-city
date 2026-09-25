import "server-only";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { invalidateLeague, leagueTag } from "@/lib/leagues/cache";
import { START_H } from "./grid";
import { starterOps } from "./starter";
import { DEFAULT_TEMPLATE, type TemplateId } from "./templates";
import { leagueAssetUrl } from "./identity";
import type { CityIdentity, CityObject, CityOp } from "./types";

// ─── League city service ────────────────────────────────────
// Every write goes through apply_league_city_ops (migration 145), which locks
// the league's city, validates the batch against the item catalog and bumps
// the version.

const MAX_OPS = 200;

export interface LeagueCity {
  h: number;
  version: number;
  objects: CityObject[];
  identity: CityIdentity;
}

export interface OpsResult {
  version: number;
  h: number;
  objects_changed: number;
  unplaced: number[];
  skipped?: boolean;
}

const MESSAGES: Record<string, [string, number]> = {
  lot_taken: ["That lot is taken.", 409],
  out_of_bounds: ["That's outside the city.", 400],
  not_member: ["That developer isn't in this town.", 400],
  too_many_ops: ["Too many changes at once.", 400],
  already_placed: ["That building is already in the city.", 409],
  forbidden: ["Buildings can't be removed from the city.", 403],
  not_found: ["That object is gone. Reload the city.", 409],
  invalid_op: ["That change isn't valid.", 400],
  on_building: ["That's on a building's lot.", 409],
  on_road: ["Keep it on the sidewalk, off the asphalt.", 409],
  prop_overlap: ["Too close to something else.", 409],
  city_full: ["The city is full.", 409],
  payload_too_large: ["Too many edits in one save.", 413],
  locked: ["The entrance is fixed.", 409],
  limit_reached: ["That's the most of those a town can have.", 409],
  system_only: ["Only the town can place that.", 403],
  props_too_large: ["Those settings are too long.", 400],
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
  if (!(data as OpsResult).skipped) invalidateLeague(leagueId);
  return data as OpsResult;
}

/** Applies an admin's batch. Throws CityOpError with a user-facing message. */
export async function applyOps(leagueId: string, actorId: number, ops: CityOp[]): Promise<OpsResult> {
  if (ops.some((o) => o.op === "init" || o.op === "auto_place")) throw new CityOpError("invalid_op");
  return rpc(leagueId, actorId, ops);
}

// ─── Reads ──────────────────────────────────────────────────

const EMPTY_IDENTITY: CityIdentity = { sky: 1, signSide: null, logoUrl: null, logoRemoved: false, identityVersion: 0 };

interface CityRow {
  h: number;
  version: number;
  sky: number;
  sign_side: CityIdentity["signSide"];
  identity_version: number;
  logo: { path: string; status: "active" | "removed" } | null;
}

async function loadCity(leagueId: string): Promise<LeagueCity | null> {
  const sb = getSupabaseAdmin();
  const { data: city } = await sb
    .from("league_cities")
    .select("h, version, sky, sign_side, identity_version, logo:league_assets!league_cities_logo_asset_id_fkey(path, status)")
    .eq("league_id", leagueId)
    .maybeSingle<CityRow>();
  if (!city) return null;
  const objects: CityObject[] = [];
  for (let from = 0; ; from += 1000) {
    const { data } = await sb
      .from("league_objects")
      .select("id, kind, item_type, developer_id, x, z, px, pz, rot, is_new, props, locked")
      .eq("league_id", leagueId)
      .order("id")
      .range(from, from + 999)
      .returns<CityObject[]>();
    if (!data || data.length === 0) break;
    objects.push(...data);
    if (data.length < 1000) break;
  }
  const active = city.logo?.status === "active";
  return {
    h: city.h,
    version: Number(city.version),
    objects,
    identity: {
      sky: city.sky,
      signSide: city.sign_side,
      logoUrl: active && city.logo ? leagueAssetUrl(city.logo.path) : null,
      logoRemoved: city.logo?.status === "removed",
      identityVersion: Number(city.identity_version),
    },
  };
}

/** The league's city, building the starter city first if it has none yet. */
export async function getCity(leagueId: string): Promise<LeagueCity> {
  const city = await loadCity(leagueId);
  if (city) return city;
  await ensureCity(leagueId);
  return (await loadCity(leagueId)) ?? { h: START_H, version: 0, objects: [], identity: EMPTY_IDENTITY };
}

/**
 * getCity for anonymous reads (the league page, drivers polling), cached 60s
 * per league. Every city write expires it; the editor reads getCity.
 */
export function getCachedCity(leagueId: string): Promise<LeagueCity> {
  return unstable_cache(() => getCity(leagueId), ["league-city", leagueId], {
    revalidate: 60,
    tags: [leagueTag(leagueId)],
  })();
}

// ─── System writes ──────────────────────────────────────────

/**
 * Builds the starter city from the current members when the league has no
 * city yet, from `template` (a new town's pick; older leagues get crew). Safe
 * to race: the first batch carries `init`, which the SQL function skips when
 * another call already built the city.
 */
export async function ensureCity(leagueId: string, template: TemplateId = DEFAULT_TEMPLATE): Promise<void> {
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

  const starter = starterOps(members, template);
  // The starter lays out existing members; only later arrivals are NEW.
  const ops: CityOp[] = starter.ops.map((op) => (op.op === "place" && op.kind === "building" ? { ...op, id: crypto.randomUUID() } : op));
  const dismiss: CityOp[] = ops.flatMap((op) => (op.op === "place" && op.kind === "building" && op.id ? [{ op: "dismiss_new", id: op.id }] : []));
  ops.push(...dismiss);
  const unplaced = starter.unplaced;
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
