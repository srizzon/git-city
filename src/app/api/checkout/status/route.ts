import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const purchaseId = searchParams.get("purchase_id");

  if (!purchaseId) {
    return NextResponse.json({ error: "Missing purchase_id" }, { status: 400 });
  }

  // Auth required
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();

  // Get dev ID for this user
  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("claimed_by", user.id)
    .single();

  if (!dev) {
    return NextResponse.json({ error: "Developer not found" }, { status: 404 });
  }

  // Fetch purchase — must belong to this developer
  const { data: purchase } = await sb
    .from("purchases")
    .select("status")
    .eq("id", purchaseId)
    .eq("developer_id", dev.id)
    .single();

  if (!purchase) {
    return NextResponse.json({ error: "Purchase not found" }, { status: 404 });
  }

  return NextResponse.json({ status: purchase.status });
}
