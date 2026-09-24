import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { CLAIMED_DEVELOPER_LIMIT, pickClaimedDeveloper } from "@/lib/auth-identity";

export async function GET(req: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  const sb = getSupabaseAdmin();
  const { data: devRows } = await sb
    .from("developers")
    .select("id, github_login")
    .eq("claimed_by", user.id)
    .order("claimed_at", { ascending: true })
    .limit(CLAIMED_DEVELOPER_LIMIT);
  const dev = pickClaimedDeveloper(devRows, user);

  if (!dev) return NextResponse.json({ transactions: [], next_cursor: null });

  const cursor = req.nextUrl.searchParams.get("cursor");
  const limit = Math.min(
    50,
    Math.max(1, parseInt(req.nextUrl.searchParams.get("limit") ?? "20", 10)),
  );

  let query = sb
    .from("wallet_transactions")
    .select("id, type, amount, source, description, balance_after, created_at")
    .eq("developer_id", dev.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data: transactions } = await query;
  const nextCursor =
    transactions && transactions.length === limit
      ? transactions[transactions.length - 1].created_at
      : null;

  return NextResponse.json({ transactions: transactions ?? [], next_cursor: nextCursor });
}
