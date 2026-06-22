import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

// Bake & store a card thumbnail. The admin gallery renders the cosmetic
// offscreen, snapshots a PNG data URL, and posts it here. We upload it to
// Storage and save the public URL on the row — so the Store grid serves cached
// images (never live 3D per card), which is what keeps thousands of cosmetics
// scrollable.

const BUCKET = "cosmetics";

export async function POST(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await ctx.params;
  let body: { dataUrl?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: "invalid_json" }, { status: 400 }); }

  const dataUrl = body.dataUrl ?? "";
  const m = /^data:image\/(png|jpeg|webp);base64,(.+)$/.exec(dataUrl);
  if (!m) return NextResponse.json({ error: "expected a base64 image data URL" }, { status: 400 });
  const ext = m[1] === "jpeg" ? "jpg" : m[1];
  const bytes = Buffer.from(m[2], "base64");
  if (bytes.length > 2_000_000) return NextResponse.json({ error: "thumbnail too large" }, { status: 413 });

  const admin = getSupabaseAdmin();

  // Self-provision the public bucket so a fresh install just works.
  const { data: bucket } = await admin.storage.getBucket(BUCKET);
  if (!bucket) {
    const { error: mkErr } = await admin.storage.createBucket(BUCKET, { public: true });
    if (mkErr) return NextResponse.json({ error: `bucket: ${mkErr.message}` }, { status: 500 });
  }

  const path = `thumbnails/${id}.${ext}`;
  const { error: upErr } = await admin.storage.from(BUCKET).upload(path, bytes, {
    contentType: m[1] === "jpeg" ? "image/jpeg" : `image/${m[1]}`,
    upsert: true,
  });
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 });

  const { data: pub } = admin.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust so the grid picks up re-bakes immediately.
  const url = `${pub.publicUrl}?v=${bytes.length}`;

  const { error: updErr } = await admin.from("items").update({ thumbnail_url: url }).eq("id", id);
  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 });

  return NextResponse.json({ ok: true, thumbnail_url: url });
}
