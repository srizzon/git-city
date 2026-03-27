import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { data: existing } = await admin
    .from("portfolio_projects")
    .select("id")
    .eq("id", id)
    .eq("developer_id", dev.id)
    .single();
  if (!existing) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.title !== undefined) {
    const title = (body.title ?? "").trim();
    if (!title || title.length > 60) return NextResponse.json({ error: "Title required (max 60 chars)" }, { status: 400 });
    updates.title = title;
  }
  if (body.description !== undefined) updates.description = (body.description ?? "").trim().slice(0, 280) || null;
  if (body.role !== undefined) updates.role = (body.role ?? "").trim().slice(0, 60) || null;
  if (body.tech_stack !== undefined) updates.tech_stack = Array.isArray(body.tech_stack) ? body.tech_stack.slice(0, 5) : [];
  if (body.image_urls !== undefined) updates.image_urls = Array.isArray(body.image_urls) ? body.image_urls.slice(0, 3) : [];
  if (body.live_url !== undefined) updates.live_url = body.live_url || null;
  if (body.source_url !== undefined) updates.source_url = body.source_url || null;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;

  const { data: project, error } = await admin
    .from("portfolio_projects")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ project });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { error } = await admin
    .from("portfolio_projects")
    .delete()
    .eq("id", id)
    .eq("developer_id", dev.id);

  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
