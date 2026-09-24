import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendLeagueJoinedNotification } from "@/lib/notification-senders/league-joined";
import { MAX_CUSTOM_LEAGUES } from "./service";
import { isPublicOrgMember, VERIFICATION_DAYS } from "./verification";

/** Emails whoever invited `devId` into a league the dev just joined. */
export async function notifyJoined(leagueId: string, devId: number, login: string, invitedBy: number | null) {
  if (!invitedBy || invitedBy === devId) return;
  const { data: league } = await getSupabaseAdmin().from("leagues").select("slug, name").eq("id", leagueId).single();
  if (!league) return;
  sendLeagueJoinedNotification({
    inviterId: invitedBy,
    inviteeId: devId,
    inviteeLogin: login,
    leagueSlug: league.slug,
    leagueName: league.name,
  });
}

/**
 * A dev with invited league rows just claimed their building: make them
 * active members. Custom leagues activate directly (up to the 5-league limit).
 * Company leagues still need proof of membership, so they activate only when
 * the dev is a public org member; otherwise they stay invited until the dev
 * verifies.
 */
export async function activateOnClaim(devId: number, login: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("league_members")
    .select("league_id, invited_by, leagues!inner(kind, github_org)")
    .eq("developer_id", devId)
    .eq("status", "invited")
    .returns<{ league_id: string; invited_by: number | null; leagues: { kind: string; github_org: string | null } }[]>();
  if (!rows || rows.length === 0) return 0;

  const { data: active } = await sb
    .from("league_members")
    .select("leagues!inner(kind)")
    .eq("developer_id", devId)
    .eq("status", "active")
    .returns<{ leagues: { kind: string } }[]>();
  let customCount = (active ?? []).filter((a) => a.leagues.kind === "custom").length;
  let hasCompany = (active ?? []).some((a) => a.leagues.kind === "company");

  const now = new Date().toISOString();
  let joined = 0;
  for (const row of rows) {
    const patch: Record<string, unknown> = { status: "active", joined_at: now, left_at: null };
    if (row.leagues.kind === "custom") {
      if (customCount >= MAX_CUSTOM_LEAGUES) continue;
      customCount++;
    } else {
      if (hasCompany || !row.leagues.github_org) continue;
      const member = await isPublicOrgMember(row.leagues.github_org, login);
      if (!member) continue;
      patch.verification = "public";
      patch.verified_until = new Date(Date.now() + VERIFICATION_DAYS * 86_400_000).toISOString();
      hasCompany = true;
    }
    const { error } = await sb
      .from("league_members")
      .update(patch)
      .eq("league_id", row.league_id)
      .eq("developer_id", devId)
      .eq("status", "invited");
    if (error) continue;
    joined++;
    await notifyJoined(row.league_id, devId, login, row.invited_by);
  }
  return joined;
}
