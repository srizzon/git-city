import { NextResponse } from "next/server";
import {
  deleteLeague,
  getLeagueBySlug,
  getViewer,
  openInviteLink,
  renameLeague,
  rotateInviteToken,
  setJoinMode,
  setScoringMode,
  transferAdmin,
} from "@/lib/leagues/service";
import { getLeaguePageData } from "@/lib/leagues/queries";
import { assertSameOrigin, leagueErrorResponse, readJson } from "@/lib/leagues/http";
import type { ScoringMode } from "@/lib/leagues/scoring";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// GET: league page data (members, standings, hall of fame, viewer state).
export async function GET(_req: Request, { params }: Ctx) {
  const { slug } = await params;
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  try {
    const viewer = await getViewer();
    return NextResponse.json(await getLeaguePageData(league, viewer));
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// PATCH: admin settings { name?, scoring_mode?, join_mode?, admin_login?, rotate_invite? }.
// rotate_invite returns the new open invite link.
export async function PATCH(req: Request, { params }: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    if (typeof body.name === "string") await renameLeague(viewer, league, body.name);
    if (typeof body.scoring_mode === "string") await setScoringMode(viewer, league, body.scoring_mode as ScoringMode);
    if (body.join_mode !== undefined) await setJoinMode(viewer, league, body.join_mode);
    let inviteLink: string | undefined;
    if (body.rotate_invite === true) {
      const token = await rotateInviteToken(viewer, league);
      const origin = (process.env.PORTLESS_URL ?? new URL(req.url).origin).replace(/\/$/, "");
      inviteLink = openInviteLink(league.slug, viewer.github_login, token, origin);
    }
    // Last: after a transfer the viewer is no longer admin.
    if (typeof body.admin_login === "string") await transferAdmin(viewer, league, body.admin_login);
    return NextResponse.json(inviteLink ? { ok: true, invite_link: inviteLink } : { ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}

// DELETE { confirm }: admin deletes a custom league; confirm is the league name.
export async function DELETE(req: Request, { params }: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { slug } = await params;
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });

  const body = await readJson(req);
  try {
    await deleteLeague(viewer, league, typeof body.confirm === "string" ? body.confirm : "");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return leagueErrorResponse(err);
  }
}
