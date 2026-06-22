import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_PROJECTS } from "@/lib/portfolio/constants";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { data } = await admin.from("portfolio_projects").select("*").eq("developer_id", dev.id).order("sort_order");
  return NextResponse.json({ projects: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { count } = await admin
    .from("portfolio_projects")
    .select("*", { count: "exact", head: true })
    .eq("developer_id", dev.id);

  if ((count ?? 0) >= MAX_PROJECTS) {
    return NextResponse.json({ error: `Maximum ${MAX_PROJECTS} projects allowed` }, { status: 400 });
  }

  const body = await req.json();
  const title = (body.title ?? "").trim();
  if (!title || title.length > 60) {
    return NextResponse.json({ error: "Title required (max 60 chars)" }, { status: 400 });
  }

  const { data: project, error } = await admin
    .from("portfolio_projects")
    .insert({
      developer_id: dev.id,
      title,
      description: (body.description ?? "").trim().slice(0, 280) || null,
      role: (body.role ?? "").trim().slice(0, 60) || null,
      tech_stack: Array.isArray(body.tech_stack) ? body.tech_stack.slice(0, 5).map((s: string) => s.trim().toLowerCase()) : [],
      image_urls: Array.isArray(body.image_urls) ? body.image_urls.slice(0, 3) : [],
      live_url: body.live_url || null,
      source_url: body.source_url || null,
      sort_order: count ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create project" }, { status: 500 });

  // First project achievement
  if (count === 0) {
    // Unified emblem grant. Idempotent; grants the catalog's 10 xp itself, so the
    // separate grant_xp(10) is no longer needed.
    await admin.rpc("grant_emblem", {
      p_developer_id: dev.id,
      p_emblem_id: "portfolio_complete",
      p_claim_key: `threshold:portfolio_complete:${dev.id}`,
      p_meta: {},
      p_source: "job",
    });
  }

  return NextResponse.json({ project });
}
