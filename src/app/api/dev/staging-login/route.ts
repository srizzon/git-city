// LOCAL ONLY, never committed: signs in as a staging test racer.
import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";

const USERS: Record<string, string> = { claude: "smash-claude@example.com", codex: "smash-codex@example.com" };

export async function GET(req: Request) {
  if (process.env.NODE_ENV !== "development" || !process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("jqdvuwlgczhcyzuiwofh")) return new NextResponse("no", { status: 404 });
  const as = new URL(req.url).searchParams.get("as") ?? "claude";
  const email = USERS[as];
  if (!email) return new NextResponse("as=claude|codex", { status: 400 });
  const sb = await createServerSupabase();
  await sb.auth.signOut();
  const { error } = await sb.auth.signInWithPassword({ email, password: "smash-test-pass-9" });
  if (error) return new NextResponse(error.message, { status: 500 });
  return NextResponse.redirect(new URL("/town/brasil-town", req.url));
}
