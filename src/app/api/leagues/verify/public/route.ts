import { NextResponse, after } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getViewer } from "@/lib/leagues/service";
import { isPublicOrgMember, joinCompanyLeague } from "@/lib/leagues/verification";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST { org }: fallback for orgs that restrict OAuth app access. The dev makes
// their membership public on GitHub, then we check the public API.
export async function POST(req: Request) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const { ok } = rateLimit(`league-verify-public:${viewer.id}`, 5, 60_000);
  if (!ok) return NextResponse.json({ error: "Too fast." }, { status: 429 });

  const body = await readJson(req);
  const org = typeof body.org === "string" ? body.org.trim().replace(/^@/, "").toLowerCase() : "";
  const member = await isPublicOrgMember(org, viewer.github_login);
  if (member === null) return NextResponse.json({ error: "GitHub didn't answer. Try again." }, { status: 503 });
  if (!member) {
    return NextResponse.json(
      { error: `We can't see you in @${org} yet. Make your membership public, then check again.` },
      { status: 404 },
    );
  }

  try {
    const { slug, seed } = await joinCompanyLeague(viewer.id, org, "public");
    if (seed) after(() => seed().then(() => {}));
    return NextResponse.json({ slug });
  } catch (err) {
    console.error("[leagues:verify:public]", err);
    return NextResponse.json({ error: "Couldn't join that league. Try again." }, { status: 500 });
  }
}
