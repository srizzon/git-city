import { NextResponse } from "next/server";
import { rateLimit } from "@/lib/rate-limit";
import { getViewer } from "@/lib/leagues/service";
import { checkCompanyOrg } from "@/lib/towns/company-check";
import { normalizeOrgInput } from "@/lib/towns/company-step";

export const dynamic = "force-dynamic";

// GET ?org=: what the Company tab shows for one org (is it an org, are you in
// it, does it have a town, where do you stand). Read-only: never creates or
// joins a town.
export async function GET(req: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });

  const org = normalizeOrgInput(new URL(req.url).searchParams.get("org") ?? "");
  if (!org) return NextResponse.json({ error: "That isn't a GitHub org name." }, { status: 400 });

  const { ok } = rateLimit(`league-verify-check:${viewer.id}`, 20, 60_000);
  if (!ok) return NextResponse.json({ error: "Too many checks. Wait a minute." }, { status: 429 });

  const check = await checkCompanyOrg(viewer, org);
  return NextResponse.json(check, { headers: { "Cache-Control": "no-store" } });
}
