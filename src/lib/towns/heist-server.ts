// ─── City of the day (server) ───────────────────────────────
// The Brasil map's city of the day: picked once a day (brasil_heist_days,
// migration 189) from the map as it stands and kept, its ring, how much of it
// still stands (blocks knocked off it today against all of its blocks), each dev's side (brasil_heist_sides: residents are cops), what
// pushes and busts pay (brasil_points), and the day's settling after midnight
// (the cops' bonus when the city stood). Days run on Brasília time. Server only.

import "server-only";
import { getSupabaseAdmin } from "../supabase";
import { LOT } from "../league-city/grid";
import { UNIT_TO_M } from "../league-city/drive/tuning";
import { getSmashTown, type HeistBust, type HeistPush } from "../league-city/smash-server";
import { cols } from "../league-city/smash";
import { awardPoints } from "./brasil-points-server";
import { sendHeistTurretEmail } from "../notification-senders/brasil-heist";
import { brasiliaToday } from "./brasil-day";
import { getBrasilLayout } from "./brasil-server";
import type { BrasilLayout, CityLayout } from "./brasil-map";
import { HEIST, RULES, defended, pickDayCity, pushPoints, ringOf, standingOf, type HeistResult, type HeistSide, type Ring } from "./heist";

const DAY_MS = 86_400_000;

/** Start of a Brasília day as an ISO instant (UTC-3, no daylight saving). */
const dayStart = (day: string) => `${day}T03:00:00Z`;
const dayEnd = (day: string) => new Date(Date.parse(dayStart(day)) + DAY_MS).toISOString();
const yesterdayOf = (day: string) => new Date(Date.parse(`${day}T12:00:00Z`) - DAY_MS).toISOString().slice(0, 10);

interface DayRow {
  day: string;
  city_key: string;
  name: string;
  uf: string | null;
  buildings: number;
  standing: number | null;
  settled_at: string | null;
  /** The city's blocks (floors × columns of every building), counted on the day's first ask. */
  blocks: number | null;
  /** Blocks knocked off it that day (the drive room's saves). */
  knocked: number;
}

export interface HeistDay {
  day: string;
  key: string;
  name: string;
  uf: string | null;
  buildings: number;
  /** Share standing now (today) or at midnight (a settled day). */
  standing: number;
  ring: Ring | null;
}

const cityOf = (layout: BrasilLayout, key: string): CityLayout | undefined => layout.cities.find((c) => c.key === key);

/** Today's city, picked (and stored) on the first ask of the day. Null while the map has no city to play. */
export async function heistDay(leagueId: string, now = Date.now(), layout?: BrasilLayout): Promise<HeistDay | null> {
  const sb = getSupabaseAdmin();
  const day = brasiliaToday(now);
  let { data: row } = await sb.from("brasil_heist_days").select("*").eq("day", day).maybeSingle<DayRow>();
  const map = layout ?? (await getBrasilLayout(leagueId)).layout;
  if (!row) {
    const { data: prev } = await sb.from("brasil_heist_days").select("city_key").eq("day", yesterdayOf(day)).maybeSingle<{ city_key: string }>();
    const pick = pickDayCity(
      map.cities.map((c) => ({ key: c.key, name: c.name, uf: c.uf, buildings: c.devs.length })),
      day,
      prev?.city_key ?? null,
    );
    if (!pick) return null;
    await sb.from("brasil_heist_days").upsert({ day, city_key: pick.key, name: pick.name, uf: pick.uf, buildings: pick.buildings }, { onConflict: "day", ignoreDuplicates: true });
    ({ data: row } = await sb.from("brasil_heist_days").select("*").eq("day", day).maybeSingle<DayRow>());
    if (!row) return null;
  }
  const city = cityOf(map, row.city_key);
  const blocks = row.blocks ?? (await countBlocks(leagueId, row.day, city));
  return {
    day: row.day,
    key: row.city_key,
    name: row.name,
    uf: row.uf,
    buildings: row.buildings,
    standing: row.standing ?? standingOf(blocks, row.knocked),
    ring: city ? ringOf(city.center, city.radius, LOT, UNIT_TO_M) : null,
  };
}

/** The city's blocks as the drive room builds it, stored on the day's row the first time. 0 when it can't be counted. */
async function countBlocks(leagueId: string, day: string, city: CityLayout | undefined): Promise<number> {
  if (!city) return 0;
  const ids = new Set(city.devs.map((d) => d.dev.id));
  const town = await getSmashTown(leagueId).catch(() => null);
  if (!town) return 0;
  let n = 0;
  for (const t of town.targets) if (ids.has(town.devIds[t.login.toLowerCase()])) n += t.floors * cols(t);
  if (n > 0) await getSupabaseAdmin().from("brasil_heist_days").update({ blocks: n }).eq("day", day).is("blocks", null);
  return n;
}

/** Blocks the drive room saw knocked off today's city (brasil_heist_knock adds them; a settled day takes no more). */
export async function knockHeist(n: number, now = Date.now()): Promise<void> {
  if (n <= 0) return;
  const { error } = await getSupabaseAdmin().rpc("brasil_heist_knock", { p_day: brasiliaToday(now), p_n: n });
  if (error) throw error;
}

/** The dev's home city key on the map, or null off it. */
function homeKey(layout: BrasilLayout, devId: number): string | null {
  for (const c of [...layout.cities, layout.island]) if (c.devs.some((d) => d.dev.id === devId)) return c.key;
  return null;
}

export interface HeistMe {
  side: HeistSide | null;
  resident: boolean;
}

/** A dev's side today: a resident is a cop; anyone else what they picked (or nothing yet). */
export async function heistSideOf(devId: number, day: HeistDay, layout: BrasilLayout): Promise<HeistMe> {
  if (homeKey(layout, devId) === day.key) return { side: "cop", resident: true };
  const { data } = await getSupabaseAdmin().from("brasil_heist_sides").select("side").eq("developer_id", devId).eq("day", day.day).maybeSingle<{ side: HeistSide }>();
  return { side: data?.side ?? null, resident: false };
}

/** Picks a side for the day; the first pick holds (a resident stays a cop). Returns the side that holds. */
export async function pickHeistSide(devId: number, day: HeistDay, layout: BrasilLayout, side: HeistSide): Promise<HeistMe> {
  const now = await heistSideOf(devId, day, layout);
  if (now.side) return now;
  await getSupabaseAdmin().from("brasil_heist_sides").upsert({ developer_id: devId, day: day.day, side }, { onConflict: "developer_id,day", ignoreDuplicates: true });
  return heistSideOf(devId, day, layout);
}

/** Points of `kind` a dev scored on a Brasília day. */
async function paidOn(devId: number, kind: "heist" | "bust", day: string): Promise<number> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_points")
    .select("points")
    .eq("developer_id", devId)
    .eq("kind", kind)
    .gte("created_at", dayStart(day))
    .lt("created_at", dayEnd(day))
    .returns<{ points: number }[]>();
  return (data ?? []).reduce((a, r) => a + r.points, 0);
}

/** How many busts a cop has on a Brasília day. */
export async function heistBustsOn(devId: number, day: string): Promise<number> {
  const { count } = await getSupabaseAdmin()
    .from("brasil_points")
    .select("id", { count: "exact", head: true })
    .eq("developer_id", devId)
    .eq("kind", "bust")
    .gte("created_at", dayStart(day))
    .lt("created_at", dayEnd(day));
  return count ?? 0;
}

/** Pays each push (the room's save): the points held, under the robber's day cap. Once per (robber, moment). */
export async function payPushes(pushes: readonly HeistPush[]): Promise<void> {
  for (const p of pushes) {
    const at = new Date(p.at);
    const pts = pushPoints(p.pts, await paidOn(p.attackerId, "heist", brasiliaToday(p.at)));
    if (pts > 0) await awardPoints(p.attackerId, "heist", `heist:${p.attackerId}:${p.at}`, at, pts);
  }
}

/** Pays each bust: a real robber's pays the full bust, a game-run one's less; under the cop's day cap. */
export async function payBusts(busts: readonly HeistBust[]): Promise<void> {
  for (const b of busts) {
    const at = new Date(b.at);
    const want = b.robberId === null ? RULES.gangBust : HEIST.bust;
    const pts = Math.max(0, Math.min(want, RULES.bustDayCap - (await paidOn(b.copId, "bust", brasiliaToday(b.at)))));
    if (pts > 0) await awardPoints(b.copId, "bust", `bust:${b.copId}:${b.at}`, at, pts);
  }
}

/** Counts the robbers each building stopped (its owner's row for the day). */
export async function recordTurretBusts(devIds: Record<string, number>, turrets: readonly { login: string; at: number }[]): Promise<void> {
  const sb = getSupabaseAdmin();
  const n = new Map<string, number>();
  for (const t of turrets) {
    const id = devIds[t.login];
    if (id === undefined) continue;
    const key = `${brasiliaToday(t.at)}:${id}`;
    n.set(key, (n.get(key) ?? 0) + 1);
  }
  for (const [key, add] of n) {
    const [day, id] = key.split(":");
    const { data } = await sb.from("brasil_heist_turrets").select("busts").eq("day", day).eq("developer_id", Number(id)).maybeSingle<{ busts: number }>();
    const { error } = await sb.from("brasil_heist_turrets").upsert({ day, developer_id: Number(id), busts: (data?.busts ?? 0) + add, updated_at: new Date().toISOString() }, { onConflict: "day,developer_id" });
    if (error) throw error;
  }
}

/**
 * Settles a finished day once: how much of the city stood at midnight and,
 * when it held (HEIST.standGoal), HEIST.standBonus to every cop who busted
 * someone that day. Returns false when there's nothing to settle.
 */
export async function settleHeistDay(leagueId: string, day: string): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data: row } = await sb.from("brasil_heist_days").select("*").eq("day", day).maybeSingle<DayRow>();
  if (!row || row.settled_at) return false;
  const blocks = row.blocks ?? (await countBlocks(leagueId, day, cityOf((await getBrasilLayout(leagueId)).layout, row.city_key)));
  const standing = standingOf(blocks, row.knocked);
  if (defended(standing)) {
    const { data: cops } = await sb
      .from("brasil_points")
      .select("developer_id")
      .eq("kind", "bust")
      .gte("created_at", dayStart(day))
      .lt("created_at", dayEnd(day))
      .returns<{ developer_id: number }[]>();
    for (const id of new Set((cops ?? []).map((c) => c.developer_id))) await awardPoints(id, "heist_bonus", `heist_bonus:${day}`, new Date(dayEnd(day)), HEIST.standBonus);
  }
  await sb.from("brasil_heist_days").update({ standing, settled_at: new Date().toISOString() }).eq("day", day);
  // Owners whose building stopped robbers hear how many.
  const { data: turrets } = await sb.from("brasil_heist_turrets").select("developer_id, busts").eq("day", day).gt("busts", 0).returns<{ developer_id: number; busts: number }[]>();
  for (const t of turrets ?? []) await sendHeistTurretEmail({ developerId: t.developer_id, busts: t.busts, cityName: row.name, day }).catch((err) => console.error("[heist] turret email", err));
  return true;
}

/** Yesterday's city as the result tower shows it, with the viewer's own line. Null when there was none or it isn't settled. */
export async function heistResult(viewerDevId: number | null, now = Date.now()): Promise<HeistResult | null> {
  const sb = getSupabaseAdmin();
  const day = yesterdayOf(brasiliaToday(now));
  const { data: row } = await sb.from("brasil_heist_days").select("*").eq("day", day).maybeSingle<DayRow>();
  if (!row || row.standing === null) return null;
  const { data: rows } = await sb
    .from("brasil_points")
    .select("developer_id, kind, points, developers!inner(github_login)")
    .in("kind", ["heist", "bust", "heist_bonus"])
    .gte("created_at", dayStart(day))
    .lt("created_at", new Date(Date.parse(dayEnd(day)) + 3_600_000).toISOString())
    .returns<{ developer_id: number; kind: string; points: number; developers: { github_login: string } }[]>();
  const busts = new Map<number, { login: string; n: number }>();
  const hauls = new Map<number, { login: string; pts: number }>();
  let bonus = 0;
  for (const r of rows ?? []) {
    if (r.kind === "bust") {
      const b = busts.get(r.developer_id) ?? { login: r.developers.github_login, n: 0 };
      b.n++;
      busts.set(r.developer_id, b);
    } else if (r.kind === "heist") {
      const h = hauls.get(r.developer_id) ?? { login: r.developers.github_login, pts: 0 };
      h.pts += r.points;
      hauls.set(r.developer_id, h);
    } else if (r.kind === "heist_bonus" && r.developer_id === viewerDevId) bonus = r.points;
  }
  const you =
    viewerDevId === null
      ? null
      : hauls.has(viewerDevId)
        ? { side: "robber" as const, pts: hauls.get(viewerDevId)!.pts }
        : busts.has(viewerDevId) || bonus
          ? { side: "cop" as const, busts: busts.get(viewerDevId)?.n ?? 0, bonus }
          : null;
  return {
    city: { name: row.name, uf: row.uf ?? "", buildings: row.buildings, standing: row.standing },
    standing: row.standing,
    cops: [...busts.values()].sort((a, b) => b.n - a.n).slice(0, 2).map((c) => ({ login: c.login, busts: c.n })),
    robbers: [...hauls.values()].sort((a, b) => b.pts - a.pts).slice(0, 1).map((r) => ({ login: r.login, pts: r.pts })),
    you,
  };
}

