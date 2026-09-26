import { NextResponse } from "next/server";
import { getLeagueBySlug, getMembership, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { invalidateLeague } from "@/lib/leagues/cache";
import { CoverError, saveCover } from "@/lib/towns/cover";
import { COVER_MAX_BYTES } from "@/lib/towns/cover-rules";

export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ slug: string }> };

// POST multipart { file, pinned? }: a photo of the city for the town's
// Discover card. Members' pages send the automatic one (only when it's due);
// pinned=1 is the admin's own view, which the automatic one never replaces.
export async function POST(req: Request, { params }: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const [{ slug }, viewer] = await Promise.all([params, getViewer()]);
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const league = await getLeagueBySlug(slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const me = await getMembership(league.id, viewer.id);
  if (me?.status !== "active") return NextResponse.json({ error: "Only members can photograph the town." }, { status: 403 });

  const { ok } = rateLimit(`league-cover:${viewer.id}`, 6, 60_000);
  if (!ok) return NextResponse.json({ error: "Too fast. Wait a moment." }, { status: 429 });

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > COVER_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "That picture is too big." }, { status: 413 });
  let file: File | null = null;
  let pinned = false;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
    pinned = form.get("pinned") === "1";
  } catch {
    file = null;
  }
  if (!file || file.size > COVER_MAX_BYTES) return NextResponse.json({ error: "Send one picture under 1.5 MB." }, { status: 400 });
  if (pinned && league.admin_id !== viewer.id) return NextResponse.json({ error: "Only the town admin can set the cover." }, { status: 403 });

  try {
    const saved = await saveCover(league.id, new Uint8Array(await file.arrayBuffer()), pinned);
    if (saved) invalidateLeague(league.id);
    return NextResponse.json({ saved });
  } catch (err) {
    if (err instanceof CoverError) return NextResponse.json({ error: err.message }, { status: 400 });
    console.error("[town-cover]", err);
    return NextResponse.json({ error: "Couldn't save the cover." }, { status: 500 });
  }
}
