import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "@/lib/supabase";
import { generateCityLayout, type CityBuilding, type DeveloperRecord } from "@/lib/github";
import { leagueTag } from "@/lib/leagues/cache";
import { getCityNorms, getLeagueCityDevs, getLeagueMembers } from "@/lib/leagues/queries";
import { isoDay, weekContributions, weekStart } from "@/lib/leagues/scoring";
import { leagueBuildings, scaleTownHeights } from "./buildings";
import { getCachedCity } from "./service";
import { getBrasilLayout } from "@/lib/towns/brasil-server";
import { brasilWorld, plainBuilding } from "@/lib/towns/brasil-world";
import { SMASH, toTarget, type DamageEntry, type SmashTarget } from "./smash";
import { cleanFloors, dropOwnTown, isUuid, type FloorEntry } from "./smash-floors";

// ─── Smash (server) ─────────────────────────────────────────
// The town's buildings as smash targets (the same formulas the town page
// draws with), its saved damage, who may smash, and the signed saves the
// PartyKit drive room sends (party/drive.ts signs them with the shared
// FORCE_PUSH_HMAC_SECRET).

export interface SmashTown {
  targets: SmashTarget[];
  /** loginLower → developer id, for saves. */
  devIds: Record<string, number>;
}

/** The town's buildings exactly as its page lays them out, invited members' (drawn faded) too. Cached 60s per town. */
export function getSmashTown(leagueId: string): Promise<SmashTown> {
  return unstable_cache(
    async (): Promise<SmashTown> => {
      const members = await getLeagueMembers(leagueId);
      const [city, cityDevs, norms] = await Promise.all([getCachedCity(leagueId), getLeagueCityDevs(members), getCityNorms()]);
      const devs = cityDevs as unknown as DeveloperRecord[];
      const layout = generateCityLayout(devs, undefined, norms);
      const byLogin = new Map(layout.buildings.map((b) => [b.loginLower, b]));
      // The Brasil map lays its buildings out in its states' cities, not on the town grid: the same
      // layout the page draws (brasil-town.tsx), or every hit would land where no building stands.
      const { data: lg } = await getSupabaseAdmin().from("leagues").select("map").eq("id", leagueId).maybeSingle<{ map: string | null }>();
      if (lg?.map === "brasil") {
        const { layout: map } = await getBrasilLayout(leagueId);
        const { objects, byDevId } = brasilWorld(map, (dev) => byLogin.get(dev.login.toLowerCase()) ?? plainBuilding(dev.login), 1);
        const devIds: Record<string, number> = {};
        for (const c of [...map.cities, map.island]) for (const d of c.devs) devIds[d.dev.login.toLowerCase()] = d.dev.id;
        return { targets: leagueBuildings(objects, scaleTownHeights(byDevId)).map(toTarget), devIds };
      }
      const byDevId = new Map<number, CityBuilding>();
      const devIds: Record<string, number> = {};
      for (const d of devs) {
        const b = byLogin.get(d.github_login.toLowerCase());
        if (!b) continue;
        byDevId.set(d.id, b);
        devIds[d.github_login.toLowerCase()] = d.id;
      }
      const buildings = leagueBuildings(city.objects, scaleTownHeights(byDevId));
      return { targets: buildings.map(toTarget), devIds };
    },
    ["smash-town", leagueId],
    { revalidate: 60, tags: [leagueTag(leagueId)] },
  )();
}

/** Each dev's contributions this week (daily cap applied, like the score). */
export async function weekContribs(devIds: number[], now = new Date()): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (devIds.length === 0) return out;
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("league_weekly_stats")
    .select("developer_id, day, contributions")
    .in("developer_id", devIds)
    .eq("week_start", isoDay(weekStart(now)))
    .returns<{ developer_id: number; day: string; contributions: number }[]>();
  const days = new Map<number, { day: string; contributions: number }[]>();
  for (const r of data ?? []) days.set(r.developer_id, [...(days.get(r.developer_id) ?? []), r]);
  for (const id of devIds) out.set(id, weekContributions(days.get(id) ?? []));
  return out;
}

interface DamageRow {
  developer_id: number;
  rows: number[];
  regen_from: string;
  contrib_base: number;
  demolished_by: number | null;
  shield_until: string | null;
}

/** The town's saved damage, with the owners' contributions now (the store grows floors back from them). */
export async function getDamage(leagueId: string, town: SmashTown): Promise<DamageEntry[]> {
  const sb = getSupabaseAdmin();
  const { data } = await sb
    .from("town_building_damage")
    .select("developer_id, rows, regen_from, contrib_base, demolished_by, shield_until")
    .eq("league_id", leagueId)
    .returns<DamageRow[]>();
  const rows = data ?? [];
  if (rows.length === 0) return [];
  const loginOf = new Map(Object.entries(town.devIds).map(([login, id]) => [id, login]));
  const killers = [...new Set(rows.map((r) => r.demolished_by).filter((id): id is number => id !== null && !loginOf.has(id)))];
  if (killers.length) {
    const { data: devs } = await sb.from("developers").select("id, github_login").in("id", killers).returns<{ id: number; github_login: string }[]>();
    for (const d of devs ?? []) loginOf.set(d.id, d.github_login.toLowerCase());
  }
  const contribs = await weekContribs(rows.map((r) => r.developer_id));
  const out: DamageEntry[] = [];
  for (const r of rows) {
    const login = loginOf.get(r.developer_id);
    if (!login || !(login in town.devIds)) continue;
    out.push({
      login,
      rows: r.rows,
      regenFrom: Date.parse(r.regen_from),
      contribBase: r.contrib_base,
      contribNow: contribs.get(r.developer_id) ?? 0,
      demolishedBy: r.demolished_by !== null ? (loginOf.get(r.demolished_by) ?? null) : null,
      shieldUntil: r.shield_until ? Date.parse(r.shield_until) : 0,
    });
  }
  return out;
}

// ─── Who may smash ──────────────────────────────────────────

export interface SmashViewer {
  login: string;
  devId: number;
  /** Anyone signed in with a building may smash (the room keeps their own building whole). */
  canSmash: boolean;
  /** An active member of this town (their building here is theirs to rebuild). */
  home: boolean;
  /** Floors knocked down outside their towns today (UTC), as stored; the HUD counts from here. */
  floorsToday: number;
}

/** The dev behind a Supabase access token, and whether they live in `slug`. */
export async function smashViewer(token: string, slug: string): Promise<SmashViewer | null> {
  const sb = getSupabaseAdmin();
  const { data: auth } = await sb.auth.getUser(token);
  const userId = auth?.user?.id;
  if (!userId) return null;
  const { data: dev } = await sb
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", userId)
    .limit(1)
    .maybeSingle<{ id: number; github_login: string }>();
  if (!dev) return null;
  const [{ data: here }, { data: today }] = await Promise.all([
    sb
      .from("league_members")
      .select("leagues!inner(slug)")
      .eq("developer_id", dev.id)
      .eq("status", "active")
      .eq("leagues.slug", slug)
      .limit(1)
      .returns<{ leagues: { slug: string } }[]>(),
    sb
      .from("town_play_days")
      .select("floors")
      .eq("developer_id", dev.id)
      .eq("day", isoDay(new Date()))
      .maybeSingle<{ floors: number }>(),
  ]);
  return { login: dev.github_login.toLowerCase(), devId: dev.id, canSmash: true, home: (here ?? []).length > 0, floorsToday: today?.floors ?? 0 };
}

// ─── Signed saves from the drive room ───────────────────────

export interface SmashSaveRow {
  login: string;
  rows: number[];
  regenFrom: number;
  contribBase: number;
  demolishedBy: string | null;
  /** The killer's developer id, when the room knows it (it learned it from /smash/me). */
  demolishedById?: number;
  /** Epoch ms the shield ends (0: none). */
  shieldUntil?: number;
}

export interface SmashFall {
  victim: string;
  attacker: string;
  attackerId: number;
  /** Epoch ms it fell (with the town and the victim, the fall's key). */
  at: number;
  /** It stood in the Brasil map's city of the day: it pays only once a robber pushes (`heist`), never as a plain smash. */
  day?: boolean;
}

/** A robber's push in the city of the day: the points they held, banked at once. */
export interface HeistPush {
  attackerId: number;
  pts: number;
  at: number;
}

/** A bust in the city of the day: by a cop, of a real robber (`robberId`) or a game-run one (null). */
export interface HeistBust {
  copId: number;
  robberId: number | null;
  at: number;
}

export interface SmashSave {
  at: number;
  rows: SmashSaveRow[];
  demolished: SmashFall[];
  /** Floors knocked down outside each player's town, per player per UTC day (party/smash.ts). */
  floors?: FloorEntry[];
  /** The batch id those floors go under. A resent batch is a no-op in add_town_floors. */
  floorsBatch?: string;
  /** The city of the day's pushes and busts (the Brasil map). */
  heist?: HeistPush[];
  busts?: HeistBust[];
  /** Buildings whose shot ended a robber's run (owner's login). */
  turrets?: { login: string; at: number }[];
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
/** A login-shaped key. Whose building it is gets checked against the town (SmashTown.devIds), not its spelling. */
const isLogin = (s: unknown): s is string => typeof s === "string" && s.length > 0 && s.length <= 39;

/** The room signs `${slug}.${body}`; a save more than a minute old, or malformed, is refused. */
export function verifySmashSave(slug: string, body: string, signature: string | null, now = Date.now()): SmashSave | null {
  const secret = process.env.FORCE_PUSH_HMAC_SECRET;
  if (!secret || secret.length < 32 || !signature || body.length > 200_000) return null;
  const want = createHmac("sha256", secret).update(`${slug}.${body}`).digest();
  const got = Buffer.from(signature, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let save: SmashSave;
  try {
    save = JSON.parse(body) as SmashSave;
  } catch {
    return null;
  }
  if (typeof save.at !== "number" || Math.abs(now - save.at) > 60_000) return null;
  if (!Array.isArray(save.rows) || !Array.isArray(save.demolished)) return null;
  const falls = save.demolished.filter(
    (d) => isLogin(d?.victim) && isLogin(d.attacker) && d.victim !== d.attacker && isId(d.attackerId) && typeof d.at === "number" && Math.abs(now - d.at) < 86_400_000,
  );
  // Floors never fail a save: bad entries are dropped, and a bad batch id skips recordFloors.
  return {
    at: save.at,
    rows: save.rows.filter((r) => isLogin(r?.login)),
    demolished: falls,
    floors: cleanFloors(save.floors, now),
    floorsBatch: isUuid(save.floorsBatch) ? save.floorsBatch : undefined,
    heist: (Array.isArray(save.heist) ? save.heist : []).filter(
      (h) => isId(h?.attackerId) && Number.isInteger(h.pts) && h.pts > 0 && h.pts <= 500 && typeof h.at === "number" && Math.abs(now - h.at) < 86_400_000,
    ),
    turrets: (Array.isArray(save.turrets) ? save.turrets : []).filter((t) => isLogin(t?.login) && typeof t.at === "number" && Math.abs(now - t.at) < 86_400_000),
    busts: (Array.isArray(save.busts) ? save.busts : []).filter(
      (b) => isId(b?.copId) && (b.robberId === null || (isId(b.robberId) && b.robberId !== b.copId)) && typeof b.at === "number" && Math.abs(now - b.at) < 86_400_000,
    ),
  };
}

/** Writes the room's damage: damaged (or still shielded) buildings upserted, healed ones deleted. Throws on a failed write (the room retries). */
export async function saveDamage(leagueId: string, town: SmashTown, save: SmashSave, now = Date.now()): Promise<void> {
  const sb = getSupabaseAdmin();
  const floorsOf = new Map(town.targets.map((t) => [t.login, t.floors]));
  const saved = save.rows.filter((r) => town.devIds[r.login] !== undefined && floorsOf.has(r.login));
  if (saved.length === 0) return;
  const ids = saved.map((r) => town.devIds[r.login]);
  // A building first hit in this room session comes with base -1: its owner's contributions now.
  const fresh = saved.filter((r) => !(Number(r.contribBase) >= 0)).map((r) => town.devIds[r.login]);
  const [baseNow, { data: before, error: readErr }] = await Promise.all([
    weekContribs(fresh),
    // Who knocked each one down, as saved: a killer the room only knows by login (loaded, not seen driving) keeps it.
    sb.from("town_building_damage").select("developer_id, demolished_by").eq("league_id", leagueId).in("developer_id", ids).returns<{ developer_id: number; demolished_by: number | null }[]>(),
  ]);
  if (readErr) throw readErr;
  const killerBefore = new Map((before ?? []).map((r) => [r.developer_id, r.demolished_by]));

  const upserts = [];
  const healed: number[] = [];
  for (const r of saved) {
    const devId = town.devIds[r.login];
    const floors = floorsOf.get(r.login) as number;
    if (!Array.isArray(r.rows) || r.rows.length === 0 || r.rows.length > 16) continue;
    const rows = r.rows.map((n) => Math.max(0, Math.min(floors, Math.round(Number(n) || 0))));
    // The shield can't reach past what a fall now would give.
    const shield = Math.min(Number(r.shieldUntil) || 0, now + SMASH.shieldMs);
    if (rows.every((n) => n >= floors) && shield <= now) {
      healed.push(devId);
      continue;
    }
    const killer = !r.demolishedBy
      ? null
      : (town.devIds[r.demolishedBy] ?? (isId(r.demolishedById) ? r.demolishedById : (killerBefore.get(devId) ?? null)));
    upserts.push({
      league_id: leagueId,
      developer_id: devId,
      rows,
      regen_from: new Date(Number(r.regenFrom) || now).toISOString(),
      contrib_base: Number(r.contribBase) >= 0 ? Math.round(Number(r.contribBase)) : (baseNow.get(devId) ?? 0),
      demolished_by: killer,
      demolished_at: killer ? new Date(now).toISOString() : null,
      shield_until: shield > now ? new Date(shield).toISOString() : null,
      updated_at: new Date(now).toISOString(),
    });
  }
  if (upserts.length) {
    const { error } = await sb.from("town_building_damage").upsert(upserts, { onConflict: "league_id,developer_id" });
    if (error) throw error;
  }
  if (healed.length) {
    const { error } = await sb.from("town_building_damage").delete().eq("league_id", leagueId).in("developer_id", healed);
    if (error) throw error;
  }
}

/**
 * Adds the save's floors to town_play_days under its batch id, so a resent
 * batch adds nothing. Entries for this town's own devs are dropped (they
 * score 0). Throws on a failed write (the room resends the same batch).
 * Returns the floors sent.
 */
export async function recordFloors(town: SmashTown, save: SmashSave): Promise<number> {
  if (!save.floorsBatch || !save.floors?.length) return 0;
  const entries = dropOwnTown(save.floors, town.devIds);
  if (entries.length === 0) return 0;
  const { error } = await getSupabaseAdmin().rpc("add_town_floors", { p_batch: save.floorsBatch, p: entries });
  if (error) throw error;
  return entries.reduce((sum, e) => sum + e.n, 0);
}

export interface RecordedFall {
  victim: string;
  victimId: number;
  attacker: string;
  attackerId: number;
  /** When it fell (epoch ms). */
  at: number;
  /** In the city of the day (paid by the push, not here). */
  day: boolean;
}

/**
 * Logs the save's falls (town_demolitions). A resent save inserts nothing
 * twice: returns only the falls that are new, the ones to email about.
 */
export async function recordFalls(leagueId: string, town: SmashTown, save: SmashSave): Promise<RecordedFall[]> {
  const falls = save.demolished.flatMap((d) => {
    const victimId = town.devIds[d.victim];
    return victimId === undefined || victimId === d.attackerId ? [] : [{ ...d, victimId }];
  });
  if (falls.length === 0) return [];
  const { data, error } = await getSupabaseAdmin()
    .from("town_demolitions")
    .upsert(
      falls.map((f) => ({ league_id: leagueId, victim_id: f.victimId, attacker_id: f.attackerId, fell_at: new Date(f.at).toISOString() })),
      { onConflict: "league_id,victim_id,fell_at", ignoreDuplicates: true },
    )
    .select("victim_id, attacker_id")
    .returns<{ victim_id: number; attacker_id: number }[]>();
  if (error) throw error;
  const fresh = new Set((data ?? []).map((r) => `${r.victim_id}:${r.attacker_id}`));
  return falls
    .filter((f) => fresh.has(`${f.victimId}:${f.attackerId}`))
    .map((f) => ({ victim: f.victim, victimId: f.victimId, attacker: f.attacker, attackerId: f.attackerId, at: f.at, day: f.day === true }));
}
