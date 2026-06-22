import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  SOCIAL_PLATFORMS,
  normalizeSocialUrl,
  sanitizeSocialLinks,
  type SocialLinks,
} from "@/lib/social-links";
import { fetchGithubSocialSuggestions } from "@/lib/social-links-server";

const LOGIN_RE = /^[a-z0-9-]{1,39}$/;
const MAX_BODY_BYTES = 2_000;

// GET /api/social-links?login=x — public links for a dev (city card).
// GET /api/social-links?login=x&suggest=1 — owner-only: saved links + GitHub
// suggestions for the edit form prefill (never cached).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const login = (searchParams.get("login") ?? "").toLowerCase();
  if (!LOGIN_RE.test(login)) {
    return NextResponse.json({ error: "Invalid login" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed_by")
    .eq("github_login", login)
    .maybeSingle();
  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  const { data: row } = await admin
    .from("developer_customizations")
    .select("config")
    .eq("developer_id", dev.id)
    .eq("item_id", "social_links")
    .maybeSingle();
  const links = sanitizeSocialLinks(row?.config);

  if (searchParams.get("suggest") === "1") {
    const supabase = await createServerSupabase();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user || dev.claimed_by !== user.id) {
      return NextResponse.json({ error: "Must own this building" }, { status: 403 });
    }
    // Only suggest when nothing was ever saved — never fight the user's edits.
    const suggested = row ? {} : await fetchGithubSocialSuggestions(login);
    return NextResponse.json(
      { links, suggested },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  }

  return NextResponse.json(
    { links },
    { headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=86400" } }
  );
}

// POST /api/social-links — save the caller's links. Empty/absent field = link removed.
export async function POST(request: Request) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const admin = getSupabaseAdmin();
  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  const { data: dev } = await admin
    .from("developers")
    .select("id, claimed, claimed_by")
    .eq("github_login", githubLogin)
    .single();
  if (!dev || !dev.claimed || dev.claimed_by !== user.id) {
    return NextResponse.json({ error: "Must own a claimed building" }, { status: 403 });
  }

  const raw = await request.text();
  if (raw.length > MAX_BODY_BYTES) {
    return NextResponse.json({ error: "Payload too large" }, { status: 413 });
  }
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const config: SocialLinks = {};
  for (const platform of SOCIAL_PLATFORMS) {
    const value = body[platform];
    if (value === undefined || value === null) continue;
    if (typeof value !== "string") {
      return NextResponse.json({ error: `Invalid ${platform}`, field: platform }, { status: 400 });
    }
    if (value.trim() === "") continue; // cleared field = link removed
    const url = normalizeSocialUrl(platform, value);
    if (!url) {
      return NextResponse.json(
        { error: `Invalid URL for ${platform}`, field: platform },
        { status: 400 }
      );
    }
    config[platform] = url;
  }

  const { error: saveErr } = await admin.from("developer_customizations").upsert(
    {
      developer_id: dev.id,
      item_id: "social_links",
      config,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "developer_id,item_id" }
  );
  if (saveErr) {
    return NextResponse.json(
      { error: `Couldn't save links: ${saveErr.message}` },
      { status: 500 }
    );
  }

  // Refresh the ISR-cached profile page so other viewers see the change.
  revalidatePath(`/dev/${githubLogin}`);

  return NextResponse.json({ ok: true, links: config });
}
