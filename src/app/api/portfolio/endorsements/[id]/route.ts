import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

// Profile owner can hide/approve/delete endorsements on their profile
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
    .from("portfolio_endorsements")
    .select("id")
    .eq("id", id)
    .eq("developer_id", dev.id)
    .single();
  if (!existing) return NextResponse.json({ error: "Endorsement not found" }, { status: 404 });

  const body = await req.json();
  const status = body.status;
  if (!["approved", "hidden"].includes(status)) {
    return NextResponse.json({ error: "Status must be 'approved' or 'hidden'" }, { status: 400 });
  }

  const { data: endorsement, error } = await admin
    .from("portfolio_endorsements")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ endorsement });
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
    .from("portfolio_endorsements")
    .delete()
    .eq("id", id)
    .eq("developer_id", dev.id);

  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
