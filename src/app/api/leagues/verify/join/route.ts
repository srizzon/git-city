import { NextResponse, after } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getViewer } from "@/lib/leagues/service";
import { isPublicOrgMember, joinCompanyLeague, VERIFICATION_DAYS } from "@/lib/leagues/verification";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";
import { LeagueError } from "@/lib/leagues/service";
import { rateLimit } from "@/lib/rate-limit";
import { startFrom } from "@/lib/towns/company-start";
import { normalizeOrgInput } from "@/lib/towns/company-step";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { org, expect, template?, scoring? }: the Company tab's one button.
// Builds the org's town (expect "create") or moves the dev in (expect "join").
// Membership is proven by the read:org sign-in (developer_orgs) or, for orgs
// that block apps, by the dev's public membership, checked again here.
export async function POST(req: Request) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { ok } = rateLimit(`league-verify-join:${viewer.id}`, 10, 60_000);
  if (!ok) return NextResponse.json({ error: "Too fast. Wait a moment." }, { status: 429 });

  const body = await readJson(req);
  const org = normalizeOrgInput(typeof body.org === "string" ? body.org : "");
  if (!org) return NextResponse.json({ error: "That isn't a GitHub org name." }, { status: 400 });

  const since = new Date(Date.now() - VERIFICATION_DAYS * 86_400_000).toISOString();
  const { data: proof } = await getSupabaseAdmin()
    .from("developer_orgs")
    .select("org_login")
    .eq("developer_id", viewer.id)
    .eq("org_login", org)
    .gte("verified_at", since)
    .maybeSingle();

  let verification: "private" | "public" = "private";
  if (!proof) {
    const pub = await isPublicOrgMember(org, viewer.github_login);
    if (pub === null) return NextResponse.json({ error: "GitHub didn't answer. Try again in a moment." }, { status: 503 });
    if (!pub) {
      return NextResponse.json(
        { error: `We can't see you in @${org} anymore. Make your membership public, then check again.`, code: "not_member" },
        { status: 403 },
      );
    }
    verification = "public";
  }

  try {
    const { slug, created, seed } = await joinCompanyLeague(viewer.id, org, verification, startFrom(body));
    if (seed) after(() => seed().then(() => {}));
    return NextResponse.json({ slug, created });
  } catch (err) {
    if (err instanceof LeagueError) return leagueErrorResponse(err);
    console.error("[leagues:verify:join]", err);
    return NextResponse.json({ error: "Couldn't open that town. Try again." }, { status: 500 });
  }
}
