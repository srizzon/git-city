import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

/**
 * Resolve the authenticated developer's ID from the Supabase session.
 * Requires the user to be logged in (via GitHub OAuth or /api/dev-login locally).
 */
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

/**
 * POST /api/neovim-key
 * Generates a new API key for the Neovim plugin.
 * Stores only the hash in vscode_api_key_hash (shared auth column for all editors).
 * Returns the plaintext key once — like GitHub tokens, it cannot be retrieved again.
 */
export async function POST() {
  const auth = await getAuthenticatedDevId();
  if ("error" in auth) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const sb = getSupabaseAdmin();
  const newKey = `nvim_${crypto.randomBytes(24).toString("hex")}`;

  const { error } = await sb
    .from("developers")
    .update({ vscode_api_key_hash: hashKey(newKey) })
    .eq("id", auth.devId);

  if (error) {
    console.error("Neovim key generation error:", error);
    return NextResponse.json({ error: "Failed to generate key" }, { status: 500 });
  }

  return NextResponse.json({ key: newKey });
}
