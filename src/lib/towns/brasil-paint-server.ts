// ─── Brasil town: the State War, server side ────────────────
// What the drive room loads (the buildings, the map's scale, today's points
// and the week so far) and what it saves, signed (migration 178). The board
// itself stays in the room. Server only.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getSupabaseAdmin } from "../supabase";
import { awardPoints } from "./brasil-points-server";
import { brasiliaDay, pointsWeek } from "./brasil-points";
import { getBrasilLayout } from "./brasil-server";
import { UFS, type UF } from "./brasil-map";
import { PAINT, weekStandings, type PaintLoad, type PaintSave } from "./brasil-paint";

const BRT_MS = 3 * 3_600_000;

/** The buildings (each its owner's state), today's painting points and the week so far. */
export async function loadPaint(leagueId: string, now = new Date()): Promise<PaintLoad> {
  const { layout } = await getBrasilLayout(leagueId);
  const homes: PaintLoad["homes"] = [];
  for (const c of [...layout.cities, layout.island]) for (const d of c.devs) homes.push({ x: d.x, z: d.z, uf: c.uf, login: d.dev.login.toLowerCase(), devId: d.dev.id });
  const sb = getSupabaseAdmin();
  // Today, Brasília's: from its midnight (03:00 UTC).
  const dayStart = new Date(Date.parse(`${brasiliaDay(now)}T00:00:00Z`) + BRT_MS).toISOString();
  const [today, players] = await Promise.all([
    sb
      .from("brasil_points")
      .select("points, developers(github_login)")
      .eq("kind", "paint")
      .gte("created_at", dayStart)
      .range(0, 9999)
      .returns<{ points: number; developers: { github_login: string } | null }[]>(),
    sb
      .from("brasil_paint_players")
      .select("developer_id, taken, invaded, loops, developers(github_login)")
      .eq("week_start", pointsWeek(now))
      .range(0, 9999)
      .returns<{ developer_id: number; taken: number; invaded: number; loops: number; developers: { github_login: string } | null }[]>(),
  ]);
  if (today.error) throw new Error(`paint today: ${today.error.message}`);
  if (players.error) throw new Error(`paint players: ${players.error.message}`);
  const pts: Record<string, number> = {};
  for (const r of today.data ?? []) {
    const l = r.developers?.github_login.toLowerCase();
    if (l) pts[l] = Math.min(PAINT.dayCap, (pts[l] ?? 0) + r.points);
  }
  return {
    scale: layout.scale,
    homes,
    today: pts,
    players: (players.data ?? []).flatMap((p) =>
      p.developers ? [{ login: p.developers.github_login.toLowerCase(), devId: p.developer_id, taken: p.taken, invaded: p.invaded, loops: p.loops }] : [],
    ),
  };
}

const isId = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n > 0;
const isCount = (n: unknown): n is number => typeof n === "number" && Number.isSafeInteger(n) && n >= 0 && n < 1e7;
const isUF = (u: unknown): u is UF => typeof u === "string" && (UFS as string[]).includes(u);

/** The room signs `${slug}.${body}`; a save more than a minute old, or malformed, is refused. Bad rows are dropped. */
export function verifyPaintSave(slug: string, body: string, signature: string | null, now = Date.now()): PaintSave | null {
  const secret = process.env.FORCE_PUSH_HMAC_SECRET;
  if (!secret || secret.length < 32 || !signature || body.length > 500_000) return null;
  const want = createHmac("sha256", secret).update(`${slug}.${body}`).digest();
  const got = Buffer.from(signature, "hex");
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  let s: PaintSave;
  try {
    s = JSON.parse(body) as PaintSave;
  } catch {
    return null;
  }
  if (typeof s?.at !== "number" || Math.abs(now - s.at) > 60_000 || !/^\d{4}-\d{2}-\d{2}$/.test(String(s.week)) || !isId(s.land)) return null;
  const shares: PaintSave["shares"] = {};
  for (const [uf, n] of Object.entries(s.shares ?? {})) if (isUF(uf) && isCount(n)) shares[uf] = n;
  const recent = (at: unknown) => typeof at === "number" && Math.abs(now - at) < 86_400_000;
  return {
    at: s.at,
    week: s.week,
    land: s.land,
    shares,
    players: (Array.isArray(s.players) ? s.players : []).filter((p) => isId(p?.devId) && isCount(p.taken) && isCount(p.invaded) && isCount(p.loops)),
    points: (Array.isArray(s.points) ? s.points : []).filter(
      (p) => isId(p?.devId) && typeof p.ref === "string" && p.ref.length <= 120 && Number.isInteger(p.points) && p.points > 0 && p.points <= PAINT.dayCap && recent(p.at),
    ),
    invasions: (Array.isArray(s.invasions) ? s.invasions : []).filter(
      (v) => isId(v?.devId) && isUF(v.by) && isUF(v.victim) && v.by !== v.victim && isId(v.lots) && Number.isInteger(v.x) && Number.isInteger(v.z) && recent(v.at),
    ),
  };
}

/** Writes a save: the hour's shares, the painters' week, the invasions, then each loop's points. Throws on a failed write (the room resends). */
export async function savePaint(save: PaintSave): Promise<void> {
  const sb = getSupabaseAdmin();
  const hour = new Date(Math.floor(save.at / 3_600_000) * 3_600_000).toISOString();
  const { error: e1 } = await sb.from("brasil_paint_hours").upsert({ week_start: save.week, hour, land: save.land, shares: save.shares }, { onConflict: "week_start,hour" });
  if (e1) throw new Error(`paint hours: ${e1.message}`);
  if (save.players.length) {
    const { error } = await sb.from("brasil_paint_players").upsert(
      save.players.map((p) => ({ week_start: save.week, developer_id: p.devId, taken: p.taken, invaded: p.invaded, loops: p.loops, updated_at: new Date(save.at).toISOString() })),
      { onConflict: "week_start,developer_id" },
    );
    if (error) throw new Error(`paint players: ${error.message}`);
  }
  if (save.invasions.length) {
    const { error } = await sb.from("brasil_paint_invasions").insert(
      save.invasions.map((v) => ({
        week_start: pointsWeek(new Date(v.at)),
        developer_id: v.devId,
        by_uf: v.by,
        victim_uf: v.victim,
        lots: v.lots,
        x: v.x,
        z: v.z,
        created_at: new Date(v.at).toISOString(),
      })),
    );
    if (error) throw new Error(`paint invasions: ${error.message}`);
  }
  // Unique per (kind, ref): a resent save scores nothing twice.
  for (const p of save.points) await awardPoints(p.devId, "paint", p.ref, new Date(p.at), p.points);
}

/** A week's war: each state's average share of the land over the week's hours so far, most first. */
export async function paintWeek(week: string, now = Date.now()): Promise<{ uf: UF; share: number }[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("brasil_paint_hours")
    .select("hour, land, shares")
    .eq("week_start", week)
    .order("hour", { ascending: true })
    .range(0, 999)
    .returns<{ hour: string; land: number; shares: Partial<Record<UF, number>> }[]>();
  if (error) throw new Error(`paint week: ${error.message}`);
  return weekStandings(
    week,
    (data ?? []).map((r) => ({ at: Date.parse(r.hour), land: r.land, shares: r.shares })),
    now,
  );
}
