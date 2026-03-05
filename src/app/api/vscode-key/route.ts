import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

async function getAuthenticatedDevId(): Promise<{ devId: number } | { error: string; status: number }> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Not authenticated", status: 401 };

  const githubLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  if (!githubLogin) return { error: "No GitHub login found", status: 400 };

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("id")
    .eq("github_login", githubLogin)
    .single();

  if (!dev) return { error: "Developer not found", status: 404 };
  return { devId: dev.id };
}

export async function GET() {
  const auth = await getAuthenticatedDevId();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sb = getSupabaseAdmin();
  const { data: dev } = await sb
    .from("developers")
    .select("vscode_api_key_hash")
    .eq("id", auth.devId)
    .single();

  return NextResponse.json({ hasKey: !!dev?.vscode_api_key_hash });
}

export async function POST() {
  const auth = await getAuthenticatedDevId();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const newKey = crypto.randomBytes(32).toString("base64url");
  const sb = getSupabaseAdmin();

  const { error } = await sb
    .from("developers")
    .update({ vscode_api_key_hash: hashKey(newKey) })
    .eq("id", auth.devId);

  if (error) {
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }

  return NextResponse.json({ key: newKey });
}
