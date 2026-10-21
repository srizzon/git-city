import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth-identity";
import { deleteAccount, findAccount } from "@/lib/account-delete";

export const dynamic = "force-dynamic";

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminUser(user) ? user : null;
}

// GET ?q=<github login or email>: the buildings that match, for a deletion
// request sent by email. The email on file is what proves it's theirs.
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const q = new URL(req.url).searchParams.get("q")?.trim().replace(/^@/, "").toLowerCase() ?? "";
  if (!q) return NextResponse.json({ accounts: [] });

  const column = q.includes("@") ? "email" : "github_login";
  const { data, error } = await getSupabaseAdmin()
    .from("developers")
    .select("id, github_login, name, email, claimed, claimed_by, created_at, xp_total, last_active_at")
    .ilike(column, q.replace(/[%_\\]/g, "\\$&"))
    .limit(10);
  if (error) return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  return NextResponse.json({ accounts: data ?? [] });
}

// POST { developer_id, confirm }: erases the account behind that building,
// with every building its login claimed. confirm must be the building's login.
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const body = (await req.json().catch(() => ({}))) as { developer_id?: number; confirm?: string };
  if (typeof body.developer_id !== "number" || typeof body.confirm !== "string") {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  const account = await findAccount(body.developer_id);
  const target = account?.developers.find((d) => d.id === body.developer_id);
  if (!account || !target) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (target.github_login.toLowerCase() !== body.confirm.trim().toLowerCase()) {
    return NextResponse.json({ error: "Type the login to confirm" }, { status: 400 });
  }

  const ok = await deleteAccount(account, "admin");
  if (!ok) return NextResponse.json({ error: "Delete failed, see the logs" }, { status: 500 });
  return NextResponse.json({ ok: true, deleted: account.developers.map((d) => d.github_login) });
}
