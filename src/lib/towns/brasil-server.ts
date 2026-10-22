// ─── Brasil town: server side ───────────────────────────────
// The map is stored (migration 175): every resident's city and their lot in
// it (brasil_residents), where each city stands (brasil_cities), and how big
// Brazil is (brasil_map, with a version). Reading it never moves anything.
// Placing a resident reads the map fresh, lets BrasilMap (brasil-map.ts) pick
// the lot and make room, and writes it all at once (brasil_place), which
// refuses if someone placed in between: then it reads again and retries. A
// resident is also an active member of the town, so every town feature
// (standings, smash, the drive room) sees them. Server only.

import { unstable_cache } from "next/cache";
import { getSupabaseAdmin } from "../supabase";
import { invalidateLeague, leagueTag } from "../leagues/cache";
import type { League } from "../leagues/service";
import { createDeveloperFromGitHub } from "../create-developer";
import { GitHubFetchError } from "../github-api";
import { BrasilMap, HUB, STATES, capitalIbge, cityKeyOf, layoutFromState, ptState, type BrasilLayout, type MapState, type Resident, type UF } from "./brasil-map";
import { cityOf, resolveCity, type BrCity } from "./br-cities";
import { parseComment } from "./brasil-comments";
import { awardPoints, creditInvite, getOfficeAndLiveWeeks } from "./brasil-points-server";
import type { PointsBreakdown } from "./brasil-points";
import { ISLAND } from "./brasil-geo";
import { sendBrasilMapNotification } from "../notification-senders/brasil-map";

export const BRASIL_SLUG = "brasil-town";

export type ResidentSource = "site" | "instagram" | "admin";

interface ResidentRow {
  developer_id: number;
  uf: string | null;
  ibge: number | null;
  lx: number | null;
  lz: number | null;
  placed_at: string;
  developers: { github_login: string } | null;
}

/** Everyone on the map, in the order they arrived. */
export async function getBrasilResidents(leagueId: string): Promise<Resident[]> {
  const sb = getSupabaseAdmin();
  const out: Resident[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from("brasil_residents")
      .select("developer_id, uf, ibge, lx, lz, placed_at, developers(github_login)")
      .eq("league_id", leagueId)
      .order("placed_at", { ascending: true })
      .order("developer_id", { ascending: true })
      .range(from, from + 999)
      .returns<ResidentRow[]>();
    if (error) throw new Error(`brasil residents: ${error.message}`);
    for (const r of data ?? []) {
      const login = r.developers?.github_login;
      // A row without its lot in a city is from before migration 175 and its backfill: not on the map.
      if (!login || r.lx === null || r.lz === null) continue;
      out.push({ dev: { id: r.developer_id, login, uf: (r.uf as UF | null) ?? null }, city: r.ibge, lx: r.lx, lz: r.lz, at: Date.parse(r.placed_at) });
    }
    if (!data || data.length < 1000) break;
  }
  return out;
}

/** The whole stored map: the residents, where every city stands, the scale, and its version (uncached: scripts read it outside Next). */
export async function readMapState(leagueId: string): Promise<MapState & { version: number; grewAt: number | null }> {
  const sb = getSupabaseAdmin();
  const [residents, cities, map] = await Promise.all([
    getBrasilResidents(leagueId),
    sb.from("brasil_cities").select("ibge, cx, cz").eq("league_id", leagueId).range(0, 9999).returns<{ ibge: number; cx: number; cz: number }[]>(),
    sb.from("brasil_map").select("scale, version, grew_at").eq("league_id", leagueId).maybeSingle<{ scale: number | string; version: number | string; grew_at: string | null }>(),
  ]);
  if (cities.error) throw new Error(`brasil cities: ${cities.error.message}`);
  if (map.error) throw new Error(`brasil map: ${map.error.message}`);
  return {
    residents,
    cities: cities.data ?? [],
    scale: Number(map.data?.scale ?? 1),
    version: Number(map.data?.version ?? 0),
    grewAt: map.data?.grew_at ? Date.parse(map.data.grew_at) : null,
  };
}

/**
 * The stored map, cached for everyone a little while (every placement
 * expires it): the page, the share cards and the smash room all read it,
 * and a busy db mustn't be asked for every resident on every view.
 */
export function getBrasilState(leagueId: string): Promise<MapState & { version: number; grewAt: number | null }> {
  return unstable_cache(() => readMapState(leagueId), ["brasil-map-state", leagueId], { revalidate: 60, tags: [leagueTag(leagueId)] })();
}

/** The last layout drawn on this server, by map version: drawing thousands of cities isn't free, and most views share a version. */
let drawn: { key: string; layout: BrasilLayout } | null = null;

/** Whether this login (lowercase) moved onto the map in the last 2 minutes. */
async function placedJustNow(leagueId: string, login: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_residents")
    .select("developer_id, developers!inner(github_login)")
    .eq("league_id", leagueId)
    .ilike("developers.github_login", login)
    .gte("placed_at", new Date(Date.now() - 120_000).toISOString())
    .limit(1);
  return !!data?.length;
}

/**
 * The whole map from what's stored. `at`: the login a link opens (?at=, lowercase). Someone the DM just
 * put on the map taps its link within seconds, before the cached map (up to a minute old) has them: then,
 * and only for a login placed in the last 2 minutes, the map is read fresh.
 */
export async function getBrasilLayout(leagueId: string, at: string | null = null): Promise<{ layout: BrasilLayout; residents: Resident[]; grewAt: number | null }> {
  let state = await getBrasilState(leagueId);
  if (at && !state.residents.some((r) => r.dev.login.toLowerCase() === at) && (await placedJustNow(leagueId, at))) state = await readMapState(leagueId);
  const key = `${leagueId}:${state.version}:${state.residents.length}`;
  if (drawn?.key !== key) drawn = { key, layout: layoutFromState(state) };
  return { layout: drawn.layout, residents: state.residents, grewAt: state.grewAt };
}

export type PlaceOutcome = {
  status: "added" | "already" | "moved";
  /** The city's IBGE code (null: the island). */
  city: number | null;
  /** They're the first to live there: they founded it. */
  founded: boolean;
};

/**
 * Each state's founder (login by UF): the first dev who ever arrived in it, kept
 * (brasil_state_founders) whatever city they move to later.
 */
export async function getBrasilStateFounders(leagueId: string): Promise<Partial<Record<UF, string>>> {
  const { data } = await getSupabaseAdmin()
    .from("brasil_state_founders")
    .select("uf, developers(github_login)")
    .eq("league_id", leagueId)
    .returns<{ uf: UF; developers: { github_login: string } | null }[]>();
  return Object.fromEntries((data ?? []).flatMap((r) => (r.developers ? [[r.uf, r.developers.github_login]] : [])));
}

/** The city a dev named only by state goes to: its capital. */
export const cityForState = (uf: UF | null): number | null => (uf ? capitalIbge(uf) : null);

/**
 * Puts a developer on the map in a city (its IBGE code; null: the island),
 * as an active member of the town, founding the city if nobody lives there.
 * Already there in the same city: nothing changes. Already somewhere else:
 * they move (a new lot, the old one freed), only when `allowMove` (the
 * site's picker, not a comment).
 */
export async function placeBrasilResident(
  league: Pick<League, "id">,
  dev: { id: number; login: string },
  city: number | null,
  source: ResidentSource,
  allowMove = false,
  /** They named this city themselves (not just a state). */
  cityPicked = true,
): Promise<PlaceOutcome> {
  const sb = getSupabaseAdmin();
  const info = city === null ? null : cityOf(city);
  if (city !== null && !info) throw new Error(`brasil: unknown city ${city}`);
  const { data: current } = await sb
    .from("brasil_residents")
    .select("ibge, lx")
    .eq("league_id", league.id)
    .eq("developer_id", dev.id)
    .maybeSingle<{ ibge: number | null; lx: number | null }>();
  const there = !!current && current.lx !== null;
  if (there && (cityKeyOf(current!.ibge) === cityKeyOf(city) || !allowMove)) return { status: "already", city: current!.ibge, founded: false };

  await ensureMember(league.id, dev.id, source);
  for (let attempt = 0; attempt < 5; attempt++) {
    const state = await readMapState(league.id);
    const map = new BrasilMap(state).ensureCapitals();
    if (there) map.remove(dev.id);
    const before = map.population(city);
    const r = map.place({ id: dev.id, login: dev.login, uf: info?.uf ?? null }, city, Date.now());
    const { cities, grew } = map.changes();
    const island = cityKeyOf(city) === "island";
    const { error } = await sb.rpc("brasil_place", {
      p_league: league.id,
      p_version: state.version,
      p_scale: map.scale,
      p_cities: cities,
      p_resident: { developer_id: dev.id, uf: info?.uf ?? null, hub: island ? HUB.island : HUB.city, ibge: city, lx: r.lx, lz: r.lz, city_picked: cityPicked, source },
    });
    if (!error) {
      invalidateLeague(league.id);
      if (!there) await awardPoints(dev.id, "join", String(dev.id));
      // The first dev ever in a state founds it, for good (a later move doesn't pass it on).
      if (info?.uf)
        await sb.from("brasil_state_founders").upsert({ league_id: league.id, uf: info.uf, developer_id: dev.id }, { onConflict: "league_id,uf", ignoreDuplicates: true });
      if (grew) console.info(`[brasil] the map grew to ${map.scale}`);
      return { status: there ? "moved" : "added", city, founded: !island && before === 0 };
    }
    // 40001: someone placed a moment ago (the map changed); 23505: the lot was taken. Read again and retry.
    if (error.code !== "40001" && error.code !== "23505") throw new Error(`brasil place: ${error.message}`);
  }
  throw new Error("brasil place: too many retries");
}

/** A resident is an active member (a comment needs no invite or quota: they asked to be on the map). */
async function ensureMember(leagueId: string, devId: number, source: ResidentSource) {
  const sb = getSupabaseAdmin();
  const { data: m } = await sb.from("league_members").select("status").eq("league_id", leagueId).eq("developer_id", devId).maybeSingle<{ status: string }>();
  if (m?.status === "active") return;
  const { error } = await sb.from("league_members").upsert(
    {
      league_id: leagueId,
      developer_id: devId,
      status: "active",
      joined_at: new Date().toISOString(),
      left_at: null,
      removed_by: null,
      joined_via: source === "instagram" ? "instagram" : "open",
    },
    { onConflict: "league_id,developer_id" },
  );
  if (error) throw new Error(`brasil member: ${error.message}`);
}

// ─── Comments from the reels ────────────────────────────────

export const IMPORT = {
  /** Most new residents one reel adds in an hour (a flood is someone gaming it). */
  perReelHour: 400,
} as const;

export interface ReelComment {
  /** The platform's comment id: a comment is imported once. */
  id: string;
  reel: string;
  igUser: string | null;
  text: string;
  /** What the reel is about: the Brasil map (the default), or just a building in the city. */
  kind?: ReelKind;
  /** The comment already read (by the model, or as a "sim" to our suggestion); else the rules read it. */
  parsed?: { login: string | null; uf: UF | null; place?: string | null };
  /** Its log row is already there (the caller claimed it): fill it in instead of adding one. */
  claimed?: boolean;
}

export type ReelKind = "brasil" | "city";

export type ImportOutcome = "added" | "already" | "unknown_user" | "no_login" | "blocked" | "capped" | "which_city";

export interface ImportResult {
  outcome: ImportOutcome;
  login: string | null;
  uf: UF | null;
  /** The city they're in (or the name asked about, for "which_city"). */
  city: string | null;
  /** "which_city": the states that have a city by that name. */
  options?: UF[];
  founded: boolean;
  fresh: boolean;
}

/** The city a comment names: by its words for a place, else its state's capital, else the island. Ambiguous names come back to ask. */
export function cityOfComment(place: string | null | undefined, uf: UF | null): { city: BrCity | null } | { ask: BrCity[] } {
  if (place) {
    const r = resolveCity(place, uf);
    if (r.kind === "city") return { city: r.city };
    if (r.kind === "ambiguous") return { ask: r.options };
  }
  const capital = cityForState(uf);
  return { city: capital === null ? null : (cityOf(capital) ?? null) };
}

/**
 * One comment: read it, check the username on GitHub (creating the dev if
 * Git City doesn't have them yet), put them on the map in the city they
 * named (only a state: its capital; nothing: the island), and log what came
 * of it. A city name several states share comes back as "which_city". A comment seen before
 * returns what it got then, not fresh (so it is never answered twice). One
 * Instagram account puts one GitHub login on the map. A city reel's comment
 * only gives the dev their building in the city: "added" when it's new.
 */
export async function importBrasilComment(
  league: Pick<League, "id">,
  c: ReelComment,
): Promise<ImportResult> {
  const sb = getSupabaseAdmin();
  const { data: seen } = c.claimed
    ? { data: null }
    : await sb.from("brasil_comments").select("outcome, github_login, uf, ibge").eq("id", c.id).maybeSingle<{ outcome: ImportOutcome; github_login: string | null; uf: UF | null; ibge: number | null }>();
  if (seen) return { outcome: seen.outcome, login: seen.github_login, uf: seen.uf, city: seen.ibge ? (cityOf(seen.ibge)?.name ?? null) : null, founded: false, fresh: false };

  const parsed = c.parsed ?? parseComment(c.text);
  const { login } = parsed;
  const where = cityOfComment(parsed.place, parsed.uf);
  const target = "city" in where ? where.city : null;
  const uf = target?.uf ?? parsed.uf;
  let founded = false;
  const log = async (outcome: ImportOutcome, developerId: number | null = null) => {
    const row = { reel: c.reel, ig_user: c.igUser, github_login: login, uf, ibge: target?.ibge ?? null, developer_id: developerId, outcome };
    if (c.claimed) await sb.from("brasil_comments").update(row).eq("id", c.id);
    else await sb.from("brasil_comments").insert({ id: c.id, ...row });
    const ask = "ask" in where ? where.ask : null;
    return { outcome, login, uf, city: ask ? ask[0].name : (target?.name ?? null), options: ask?.map((x) => x.uf), founded, fresh: true };
  };
  if (!login) return log("no_login");

  if (c.igUser) {
    const { data: earlier } = await sb.from("brasil_comments").select("github_login").eq("ig_user", c.igUser).eq("outcome", "added").limit(1).maybeSingle<{ github_login: string }>();
    if (earlier && earlier.github_login !== login) return log("blocked");
  }
  const hourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count } = await sb.from("brasil_comments").select("id", { count: "exact", head: true }).eq("reel", c.reel).eq("outcome", "added").gte("created_at", hourAgo);
  if ((count ?? 0) >= IMPORT.perReelHour) return log("capped");

  let dev: { id: number; github_login: string } | null = null;
  const { data: known } = await sb.from("developers").select("id, github_login").eq("github_login", login).maybeSingle<{ id: number; github_login: string }>();
  dev = known;
  if (c.kind === "city" && dev) return log("already", dev.id);
  if (!dev) {
    try {
      dev = await createDeveloperFromGitHub(login);
    } catch (err) {
      if (err instanceof GitHubFetchError) return log("unknown_user");
      throw err;
    }
    if (c.kind === "city") return log("added", dev.id);
  }

  // A city name in several states: ask which before placing anyone.
  if ("ask" in where) return log("which_city", dev.id);
  const placed = await placeBrasilResident(league, { id: dev.id, login: dev.github_login }, target?.ibge ?? null, "instagram", false, !!parsed.place && !!target);
  founded = placed.founded;
  if (placed.status === "added") {
    await emailOnMap({ id: dev.id, login: dev.github_login }, target, placed.founded);
    // Someone tagged them: the friend's points go to whoever tagged them first.
    if (c.igUser) await creditInvite(c.igUser, dev).catch((err) => console.error("[brasil] invite", err));
  }
  return log(placed.status === "already" ? "already" : "added", dev.id);
}

/** "Você tá no mapa": the email to a dev a comment just placed (only those with an account get it). */
async function emailOnMap(dev: { id: number; login: string }, city: BrCity | null, founder: boolean) {
  const uf = city?.uf ?? null;
  sendBrasilMapNotification({
    developerId: dev.id,
    login: dev.login,
    uf,
    state: uf ? (STATES.find((s) => s.uf === uf)?.name ?? null) : null,
    stateThe: uf ? ptState(uf, "the") : null,
    stateIn: uf ? ptState(uf, "in") : null,
    stateOf: uf ? ptState(uf, "of") : null,
    city: city?.name ?? ISLAND.name,
    founder,
  });
}

// ─── The week the offices come from ─────────────────────────

export interface BrasilWeek {
  /** The Monday (UTC) of the week that elects the offices. */
  weekStart: string;
  /** No closed points week yet: the offices go by this week so far. */
  provisional: boolean;
  /** Each resident's points that week (login lowercase). */
  totals: Record<string, number>;
  breakdown: Record<string, PointsBreakdown>;
  /** This week so far (the same as the above while provisional). */
  live: { weekStart: string; totals: Record<string, number>; breakdown: Record<string, PointsBreakdown> };
}

/** Last closed week's points (the offices hold all of this week), else this week so far, and this week live. */
export async function getBrasilWeek(leagueId: string): Promise<BrasilWeek> {
  const { office, live, provisional } = await getOfficeAndLiveWeeks(leagueId);
  return { ...office, provisional, live };
}
