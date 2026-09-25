import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";
import { sendLeagueJoinedNotification } from "@/lib/notification-senders/league-joined";
import { isPublicOrgMember, VERIFICATION_DAYS } from "./verification";
import { autoPlace } from "@/lib/league-city/service";
import { earnPixels } from "@/lib/pixels";
import { accountOldEnough } from "@/lib/towns/invites";

/**
 * An invite became a member: email whoever invited `devId`, give the invitee
 * the welcome pixels and the inviter a Town Builder count. Both rewards need
 * a 30+ day old GitHub account and are once per invitee.
 */
export async function inviteJoined(leagueId: string, devId: number, login: string, invitedBy: number | null) {
  if (!invitedBy || invitedBy === devId) return;
  const sb = getSupabaseAdmin();
  const { data: league } = await sb.from("leagues").select("slug, name").eq("id", leagueId).single();
  if (!league) return;
  const countsForBuilder = await rewardInvite(leagueId, devId, invitedBy).catch((err) => {
    console.error("[towns] invite reward failed:", err);
    return false;
  });
  sendLeagueJoinedNotification({
    inviterId: invitedBy,
    inviteeId: devId,
    inviteeLogin: login,
    leagueId,
    leagueSlug: league.slug,
    leagueName: league.name,
    countsForBuilder,
  });
}

/** True when the invite counted toward the inviter's Town Builder emblem. */
async function rewardInvite(leagueId: string, devId: number, invitedBy: number): Promise<boolean> {
  const sb = getSupabaseAdmin();
  const { data: dev } = await sb.from("developers").select("account_created_at").eq("id", devId).single();
  if (!accountOldEnough(dev?.account_created_at as string | null | undefined)) return false;
  await earnPixels(devId, "town_welcome", leagueId, `town_welcome:${devId}`);
  const { data } = await sb.rpc("grant_emblem", {
    p_developer_id: invitedBy,
    p_emblem_id: "town_builder",
    p_claim_key: `town_builder:${devId}`,
    p_meta: { league_id: leagueId, invitee_id: devId },
    p_source: "town",
  });
  return (data as { granted?: boolean } | null)?.granted === true;
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
      joined_via: "org",
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
    await inviteJoined(row.league_id, devId, login, row.invited_by);
  }
  return joined;
}
