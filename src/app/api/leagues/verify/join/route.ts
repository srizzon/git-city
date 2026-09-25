import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/leagues/service";
import { joinCompanyLeague, VERIFICATION_DAYS } from "@/lib/leagues/verification";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";
import { LeagueError } from "@/lib/leagues/service";
import { startFrom } from "@/lib/towns/company-start";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { org, template?, scoring? }: join (or create) the company league of an org the dev proved
// membership of through the read:org OAuth.
export async function POST(req: Request) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const body = await readJson(req);
  const org = typeof body.org === "string" ? body.org.trim().toLowerCase() : "";
  const since = new Date(Date.now() - VERIFICATION_DAYS * 86_400_000).toISOString();
  const { data: proof } = await getSupabaseAdmin()
    .from("developer_orgs")
    .select("org_login")
    .eq("developer_id", viewer.id)
    .eq("org_login", org)
    .gte("verified_at", since)
    .maybeSingle();
  if (!proof) return NextResponse.json({ error: "Verify with GitHub first." }, { status: 403 });

  try {
    const { slug, seed } = await joinCompanyLeague(viewer.id, org, "private", startFrom(body));
    if (seed) after(() => seed().then(() => {}));
    return NextResponse.json({ slug });
  } catch (err) {
    if (err instanceof LeagueError) return leagueErrorResponse(err);
    console.error("[leagues:verify:join]", err);
    return NextResponse.json({ error: "Couldn't join that town. Try again." }, { status: 500 });
  }
}
