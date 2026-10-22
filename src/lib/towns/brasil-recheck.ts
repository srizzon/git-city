// ─── Brasil town: the slow city recheck ─────────────────────
// Until 2026-10-22 the comment reader lost cities: one written beside an
// Instagram handle or a state's full name, one taken for a GitHub username,
// and everything before every city existed (migration 175). Those residents
// sit in their state's capital with city_picked false. A cron reads their
// comment again with today's reader (rereadComment, settlePlace) and moves
// whoever named a city there, RECHECK.perRun comments a run, spaced out so the
// Instagram reads stay slow. Only the same login moves (never someone else),
// only to a city the words settle (an ambiguous name stays put), and nobody
// who picked a city since is touched. Remove the cron once nothing is left.
// Server only.

import { getSupabaseAdmin } from "../supabase";
import { instagramCommentText } from "../instagram";
import { captureServer } from "../posthog-server";
import { getLeagueBySlug } from "../leagues/service";
import { BRASIL_SLUG, placeBrasilResident } from "./brasil-server";
import { resolveCity } from "./br-cities";
import { rereadComment } from "./brasil-instagram";

export const RECHECK = { perRun: 6 } as const;

type Verdict = "moved" | "same" | "no_city" | "other_login" | "gone" | "skip";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function recheckBrasilCities(): Promise<Partial<Record<Verdict, number>>> {
  const out: Partial<Record<Verdict, number>> = {};
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league || league.map !== "brasil") return out;
  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("brasil_comments")
    .select("id, ig_user, developer_id")
    .eq("outcome", "added")
    .is("place_recheck", null)
    .not("developer_id", "is", null)
    .order("created_at", { ascending: true })
    .limit(RECHECK.perRun * 4)
    .returns<{ id: string; ig_user: string | null; developer_id: number }[]>();

  let reads = 0;
  for (const row of rows ?? []) {
    if (reads >= RECHECK.perRun) break;
    const verdict = await (async (): Promise<Verdict> => {
      if (!row.id.startsWith("ig:")) return "skip";
      const { data: r } = await sb
        .from("brasil_residents")
        .select("ibge, city_picked, developers(github_login)")
        .eq("league_id", league.id)
        .eq("developer_id", row.developer_id)
        .maybeSingle<{ ibge: number | null; city_picked: boolean; developers: { github_login: string } | null }>();
      const login = r?.developers?.github_login;
      if (!r || r.city_picked || !login) return "skip";
      if (reads) await sleep(15_000 + Math.random() * 10_000);
      reads++;
      const text = await instagramCommentText(row.id.slice(3));
      if (!text) return "gone";
      const reading = await rereadComment({ id: row.id.slice(3), text, igUser: row.ig_user });
      if (reading.login?.toLowerCase() !== login.toLowerCase()) return "other_login";
      if (!reading.place) return "no_city";
      // Only a city the words settle: no state's capital as a fallback, no guess between namesakes.
      const target = resolveCity(reading.place, reading.uf);
      if (target.kind !== "city") return "no_city";
      if (target.city.ibge === r.ibge) return "same";
      await placeBrasilResident(league, { id: row.developer_id, login }, target.city.ibge, "instagram", true, true);
      await captureServer(login, "brasil_city_rechecked", { from: r.ibge, to: target.city.ibge });
      return "moved";
    })().catch((err) => {
      console.error("[brasil] recheck", row.id, err);
      return null;
    });
    // An error leaves it for the next run.
    if (!verdict) continue;
    await sb.from("brasil_comments").update({ place_recheck: verdict }).eq("id", row.id);
    out[verdict] = (out[verdict] ?? 0) + 1;
  }
  return out;
}
