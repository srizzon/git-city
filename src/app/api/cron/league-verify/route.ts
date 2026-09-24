import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { reassignAdmin } from "@/lib/leagues/service";
import { removeBuilding } from "@/lib/league-city/service";
import { fetchOrgPublicMembers, VERIFICATION_DAYS } from "@/lib/leagues/verification";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// ─── Daily company membership re-check ───────────────────────────────────────
// - Public-verified members missing from the org's public list → former.
// - Private-verified members past verified_until → former (logins renew it).
// - Members found in the public list are renewed for free (private stays
//   private: public would drop them the day they hide their membership).
// - The public list is read in full, never capped: a missing page would read
//   as "left the org".
// - Admin reassigned when the admin left.
// A GitHub error skips the league without touching anyone.

export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  const renewTo = new Date(now.getTime() + VERIFICATION_DAYS * 86_400_000).toISOString();
  const { data: leagues, error } = await sb.from("leagues").select("id, github_org, admin_id").eq("kind", "company");
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  let checked = 0;
  let skipped = 0;
  let marked = 0;
  let renewed = 0;
  let reassigned = 0;

  for (const league of leagues ?? []) {
    type Member = { developer_id: number; verification: string | null; verified_until: string | null; developers: { github_login: string } | null };
    const members: Member[] = [];
    for (let from = 0; ; from += 1000) {
      const { data } = await sb
        .from("league_members")
        .select("developer_id, verification, verified_until, developers!league_members_developer_id_fkey(github_login)")
        .eq("league_id", league.id)
        .eq("status", "active")
        .order("developer_id")
        .range(from, from + 999)
        .returns<Member[]>();
      if (!data || data.length === 0) break;
      members.push(...data);
      if (data.length < 1000) break;
    }
    if (members.length === 0) continue;

    const publicList = await fetchOrgPublicMembers(league.github_org as string);
    if (!publicList) {
      skipped++;
      continue;
    }
    checked++;
    const inPublic = new Set(publicList);

    const leave: number[] = [];
    const renew: number[] = [];
    for (const m of members) {
      const login = m.developers?.github_login?.toLowerCase() ?? "";
      if (inPublic.has(login)) {
        if (m.verification) renew.push(m.developer_id);
        continue;
      }
      if (m.verification === "public") leave.push(m.developer_id);
      else if (m.verification === "private" && m.verified_until && Date.parse(m.verified_until) < now.getTime()) {
        leave.push(m.developer_id);
      }
    }

    // Chunked: thousands of ids in one .in() overflow the request URL.
    for (let i = 0; i < renew.length; i += 300) {
      await sb
        .from("league_members")
        .update({ verified_until: renewTo })
        .eq("league_id", league.id)
        .in("developer_id", renew.slice(i, i + 300));
    }
    renewed += renew.length;
    if (leave.length) {
      for (let i = 0; i < leave.length; i += 300) {
        await sb
          .from("league_members")
          .update({ status: "former", left_at: now.toISOString() })
          .eq("league_id", league.id)
          .in("developer_id", leave.slice(i, i + 300));
      }
      marked += leave.length;
      await removeBuilding(league.id as string, leave);
    }
    if (!league.admin_id || leave.includes(league.admin_id as number)) {
      const before = league.admin_id;
      const after = await reassignAdmin(league.id as string);
      if (after !== before) reassigned++;
    }
  }

  return NextResponse.json({ ok: true, leagues: leagues?.length ?? 0, checked, skipped, marked_former: marked, renewed, reassigned });
}
