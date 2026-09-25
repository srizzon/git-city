import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin } from "@/lib/leagues/http";
import { LogoError, pixelize, removeLeagueLogo, setLeagueLogo } from "@/lib/league-city/logo";
import { LOGO_MAX_BYTES } from "@/lib/league-city/identity";

export const dynamic = "force-dynamic";

const UPLOADS_PER_HOUR = 10;

type Ctx = { params: Promise<{ slug: string }> };

async function adminLeague(req: Request, params: Ctx["params"]) {
  const bad = assertSameOrigin(req);
  if (bad) return { error: bad };
  const [{ slug }, viewer] = await Promise.all([params, getViewer()]);
  if (!viewer) return { error: NextResponse.json({ error: "Sign in first." }, { status: 401 }) };
  const league = await getLeagueBySlug(slug);
  if (!league) return { error: NextResponse.json({ error: "Town not found." }, { status: 404 }) };
  if (league.admin_id !== viewer.id) return { error: NextResponse.json({ error: "Only the town admin can change the logo." }, { status: 403 }) };
  return { league, viewer };
}

// POST multipart { file }: pixelize a PNG or JPG (≤ 1 MB). ?preview=1 returns
// the pixelized image as a data URL without saving; otherwise it becomes the
// town's logo. Saves are limited per admin (counted in league_assets).
export async function POST(req: Request, { params }: Ctx) {
  const ctx = await adminLeague(req, params);
  if ("error" in ctx) return ctx.error;
  const preview = new URL(req.url).searchParams.get("preview") === "1";

  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > LOGO_MAX_BYTES + 64 * 1024) return NextResponse.json({ error: "Logos can be up to 1 MB." }, { status: 413 });
  let file: File | null = null;
  try {
    const form = await req.formData();
    const f = form.get("file");
    file = f instanceof File ? f : null;
  } catch {
    file = null;
  }
  if (!file) return NextResponse.json({ error: "Pick an image." }, { status: 400 });
  if (file.size > LOGO_MAX_BYTES) return NextResponse.json({ error: "Logos can be up to 1 MB." }, { status: 413 });

  let png: Buffer;
  try {
    png = await pixelize(new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof LogoError) return NextResponse.json({ error: err.message }, { status: 400 });
    throw err;
  }
  if (preview) return NextResponse.json({ preview: `data:image/png;base64,${png.toString("base64")}` });

  const { data: ok } = await getSupabaseAdmin().rpc("league_take_logo_quota", {
    p_dev_id: ctx.viewer.id,
    p_limit: UPLOADS_PER_HOUR,
    p_window: "1 hour",
  });
  if (ok !== true) return NextResponse.json({ error: "Too many uploads. Try again in an hour." }, { status: 429 });
  try {
    await setLeagueLogo(ctx.league.id, png, "upload", ctx.viewer.id);
  } catch (err) {
    console.error("[league-logo]", err);
    return NextResponse.json({ error: "Couldn't save the logo." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

// DELETE: the town goes without a logo (pieces that need one show name plates).
export async function DELETE(req: Request, { params }: Ctx) {
  const ctx = await adminLeague(req, params);
  if ("error" in ctx) return ctx.error;
  await removeLeagueLogo(ctx.league.id);
  return NextResponse.json({ ok: true });
}
