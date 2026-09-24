import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendLeagueJoinedNotification } from "@/lib/notification-senders/league-joined";
import { isPublicOrgMember, VERIFICATION_DAYS } from "./verification";
import { autoPlace } from "@/lib/league-city/service";

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
 * A dev with invited company league rows just claimed their building: make
 * them active when GitHub shows them as a public org member (that's the
 * proof); otherwise they stay invited until they verify. Custom league
 * invites stay invited until the dev clicks Join: an invite is an offer, not
 * a membership.
 */
export async function activateOnClaim(devId: number, login: string): Promise<number> {
  const sb = getSupabaseAdmin();
  const { data: rows } = await sb
    .from("league_members")
    .select("league_id, invited_by, leagues!inner(kind, github_org)")
    .eq("developer_id", devId)
    .eq("status", "invited")
    .eq("leagues.kind", "company")
    .returns<{ league_id: string; invited_by: number | null; leagues: { kind: string; github_org: string | null } }[]>();
  if (!rows || rows.length === 0) return 0;

  const { data: active } = await sb
    .from("league_members")
    .select("leagues!inner(kind)")
    .eq("developer_id", devId)
    .eq("status", "active")
    .eq("leagues.kind", "company")
    .limit(1);
  let hasCompany = (active ?? []).length > 0;

  const now = new Date().toISOString();
  let joined = 0;
  for (const row of rows) {
    if (hasCompany || !row.leagues.github_org) continue;
    const member = await isPublicOrgMember(row.leagues.github_org, login);
    if (!member) continue;
    const patch = {
      status: "active",
      joined_at: now,
      left_at: null,
      verification: "public",
      verified_until: new Date(Date.now() + VERIFICATION_DAYS * 86_400_000).toISOString(),
    };
    hasCompany = true;
    const { error } = await sb
      .from("league_members")
      .update(patch)
      .eq("league_id", row.league_id)
      .eq("developer_id", devId)
      .eq("status", "invited");
    if (error) continue;
    joined++;
    await autoPlace(row.league_id, devId);
    await notifyJoined(row.league_id, devId, login, row.invited_by);
  }
  return joined;
}
