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
    .from("portfolio_experiences")
    .select("id")
    .eq("id", id)
    .eq("developer_id", dev.id)
    .single();
  if (!existing) return NextResponse.json({ error: "Experience not found" }, { status: 404 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (body.company !== undefined) {
    const company = (body.company ?? "").trim();
    if (!company || company.length > 120) return NextResponse.json({ error: "Company required (max 120 chars)" }, { status: 400 });
    updates.company = company;
  }
  if (body.role !== undefined) {
    const role = (body.role ?? "").trim();
    if (!role || role.length > 120) return NextResponse.json({ error: "Role required (max 120 chars)" }, { status: 400 });
    updates.role = role;
  }
  if (body.impact_line !== undefined) updates.impact_line = (body.impact_line ?? "").trim().slice(0, 200) || null;
  if (body.sort_order !== undefined) updates.sort_order = body.sort_order;
  if (body.start_year !== undefined) updates.start_year = body.start_year ? parseInt(body.start_year) : null;
  if (body.start_month !== undefined) updates.start_month = body.start_month ? parseInt(body.start_month) : null;
  if (body.end_year !== undefined) updates.end_year = body.end_year ? parseInt(body.end_year) : null;
  if (body.end_month !== undefined) updates.end_month = body.end_month ? parseInt(body.end_month) : null;
  if (body.is_current !== undefined) updates.is_current = body.is_current === true;

  // Rebuild period string
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const sy = updates.start_year ?? body._start_year;
  const sm = updates.start_month ?? body._start_month;
  const ey = updates.end_year ?? body._end_year;
  const em = updates.end_month ?? body._end_month;
  const ic = updates.is_current ?? body._is_current;
  if (sy) {
    const start = sm ? `${monthNames[sm - 1]} ${sy}` : `${sy}`;
    const end = ic ? "Present" : ey ? (em ? `${monthNames[em - 1]} ${ey}` : `${ey}`) : null;
    updates.period = end ? `${start} – ${end}` : start;
  }

  const { data: experience, error } = await admin
    .from("portfolio_experiences")
    .update(updates)
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to update" }, { status: 500 });
  return NextResponse.json({ experience });
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
    .from("portfolio_experiences")
    .delete()
    .eq("id", id)
    .eq("developer_id", dev.id);

  if (error) return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
