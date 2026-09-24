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
// - Private members found in the public list are renewed for free.
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
    const { data: members } = await sb
      .from("league_members")
      .select("developer_id, verification, verified_until, developers!league_members_developer_id_fkey(github_login)")
      .eq("league_id", league.id)
      .eq("status", "active")
      .returns<{ developer_id: number; verification: string | null; verified_until: string | null; developers: { github_login: string } | null }[]>();
    if (!members || members.length === 0) continue;

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

    if (renew.length) {
      await sb
        .from("league_members")
        .update({ verification: "public", verified_until: renewTo })
        .eq("league_id", league.id)
        .in("developer_id", renew);
      renewed += renew.length;
    }
    if (leave.length) {
      await sb
        .from("league_members")
        .update({ status: "former", left_at: now.toISOString() })
        .eq("league_id", league.id)
        .in("developer_id", leave);
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
