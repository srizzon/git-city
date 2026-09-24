import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminUser } from "@/lib/auth-identity";
import { getById } from "@/lib/landmarks/repository";
import { sendWelcomeEmail } from "@/lib/landmarks/welcome-email";

async function requireAdmin(): Promise<null | NextResponse> {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !isAdminUser(user)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const forbidden = await requireAdmin();
  if (forbidden) return forbidden;
  const { id } = await ctx.params;

  const landmark = await getById(id);
  if (!landmark) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!landmark.active) return NextResponse.json({ error: "Landmark is inactive" }, { status: 400 });
  if (landmark.ownerGithubLogins.length === 0) {
    return NextResponse.json({ error: "No owner github logins on this landmark" }, { status: 400 });
  }

  let body: { overrideEmails?: string[] } = {};
  try {
    body = await req.json();
  } catch {
    // no body is fine
  }

  // Resolve owner emails from developers table
  const admin = getSupabaseAdmin();
  const { data: devs, error } = await admin
    .from("developers")
    .select("github_login, email")
    .in("github_login", landmark.ownerGithubLogins);
  if (error) {
    console.error("[landmarks] resolving owner emails failed", error);
    return NextResponse.json({ error: "Failed to resolve recipients" }, { status: 500 });
  }

  const resolved = new Set<string>();
  for (const d of devs ?? []) {
    const email = (d as { email?: string | null }).email;
    if (email) resolved.add(email);
  }
  for (const o of body.overrideEmails ?? []) {
    if (typeof o === "string" && /^[^@]+@[^@]+\.[^@]+$/.test(o)) {
      resolved.add(o);
    }
  }

  if (resolved.size === 0) {
    return NextResponse.json(
      { error: "No email on file for any owner. Provide overrideEmails." },
      { status: 400 },
    );
  }

  try {
    await sendWelcomeEmail(landmark, Array.from(resolved));
    return NextResponse.json({ ok: true, sentTo: Array.from(resolved) });
  } catch (err) {
    console.error("[landmarks] send welcome failed", err);
    const msg = err instanceof Error ? err.message : "Send failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
