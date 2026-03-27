import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { MAX_EXPERIENCES } from "@/lib/portfolio/constants";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { data } = await admin.from("portfolio_experiences").select("*").eq("developer_id", dev.id).order("sort_order");
  return NextResponse.json({ experiences: data ?? [] });
}

export async function POST(req: NextRequest) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const admin = getSupabaseAdmin();
  const { data: dev } = await admin.from("developers").select("id").eq("claimed_by", user.id).single();
  if (!dev) return NextResponse.json({ error: "No developer profile" }, { status: 404 });

  const { count } = await admin
    .from("portfolio_experiences")
    .select("*", { count: "exact", head: true })
    .eq("developer_id", dev.id);

  if ((count ?? 0) >= MAX_EXPERIENCES) {
    return NextResponse.json({ error: `Maximum ${MAX_EXPERIENCES} experiences allowed` }, { status: 400 });
  }

  const body = await req.json();
  const company = (body.company ?? "").trim();
  const role = (body.role ?? "").trim();

  if (!company || company.length > 120) {
    return NextResponse.json({ error: "Company required (max 120 chars)" }, { status: 400 });
  }
  if (!role || role.length > 120) {
    return NextResponse.json({ error: "Role required (max 120 chars)" }, { status: 400 });
  }

  const startYear = body.start_year ? parseInt(body.start_year) : null;
  const startMonth = body.start_month ? parseInt(body.start_month) : null;
  const endYear = body.end_year ? parseInt(body.end_year) : null;
  const endMonth = body.end_month ? parseInt(body.end_month) : null;
  const isCurrent = body.is_current === true;

  // Build period string from dates
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  let period: string | null = null;
  if (startYear) {
    const start = startMonth ? `${monthNames[startMonth - 1]} ${startYear}` : `${startYear}`;
    const end = isCurrent ? "Present" : endYear ? (endMonth ? `${monthNames[endMonth - 1]} ${endYear}` : `${endYear}`) : null;
    period = end ? `${start} – ${end}` : start;
  }

  const { data: experience, error } = await admin
    .from("portfolio_experiences")
    .insert({
      developer_id: dev.id,
      company,
      role,
      period,
      impact_line: (body.impact_line ?? "").trim().slice(0, 200) || null,
      start_year: startYear,
      start_month: startMonth,
      end_year: isCurrent ? null : endYear,
      end_month: isCurrent ? null : endMonth,
      is_current: isCurrent,
      sort_order: count ?? 0,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: "Failed to create experience" }, { status: 500 });
  return NextResponse.json({ experience });
}
