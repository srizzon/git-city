import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { provisionDeveloperOnLogin } from "@/lib/auth-provision";

export const maxDuration = 60;

// ---------------------------------------------------------------------------
// LOCAL-ONLY dev login.
//
// Lets contributors sign in as any GitHub username WITHOUT configuring a
// GitHub OAuth app — clone, run, log in. It mints a real Supabase session and
// runs the exact same provisioning as production GitHub OAuth
// (src/lib/auth-provision), so the logged-in experience is identical.
//
// Hard-disabled in production and whenever Supabase is not a local instance,
// so this can never be used against a real database.
//
//   GET /api/dev/login            → tiny form to type a username
//   GET /api/dev/login?login=foo  → signs in as "foo", redirects home
// ---------------------------------------------------------------------------

function devLoginAllowed(): boolean {
  if (process.env.NODE_ENV === "production") return false;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  return /\/\/(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(url);
}

const FORM_HTML = `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Git City · Dev login</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Silkscreen&display=swap" rel="stylesheet">
<style>
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;display:grid;place-items:center;padding:20px;
    background:#0d0d0f;color:#d4cfc4;
    font-family:"Silkscreen",ui-monospace,monospace;font-size:13px;line-height:1.5;
    background-image:linear-gradient(rgba(200,230,74,.03) 1px,transparent 1px),
      linear-gradient(90deg,rgba(200,230,74,.03) 1px,transparent 1px);
    background-size:32px 32px}
  form{background:#161618;padding:28px;border:3px solid #2a2a30;
    box-shadow:4px 4px 0 0 rgba(0,0,0,.5);width:min(92vw,360px)}
  .tag{display:inline-block;font-size:9px;letter-spacing:.12em;color:#c8e64a;
    border:2px solid #2a2a30;padding:3px 8px;margin-bottom:16px;text-transform:uppercase}
  h1{font-size:16px;margin:0 0 6px;color:#e8dcc8;text-transform:uppercase;letter-spacing:.04em}
  p{margin:0 0 20px;color:#8c8c9c;font-size:11px;line-height:1.6}
  label{display:block;font-size:9px;letter-spacing:.1em;color:#5c5c6c;
    text-transform:uppercase;margin-bottom:6px}
  input{width:100%;padding:11px 12px;border:3px solid #2a2a30;background:#0d0d0f;
    color:#e8dcc8;font:inherit;font-size:13px;margin-bottom:18px;outline:none;
    transition:border-color .1s}
  input:focus{border-color:#c8e64a}
  input::placeholder{color:#5c5c6c}
  button{width:100%;padding:12px;border:0;background:#c8e64a;color:#0d0d0f;
    font:inherit;font-size:12px;letter-spacing:.06em;text-transform:uppercase;cursor:pointer;
    box-shadow:4px 4px 0 0 #5a7a00;transition:transform .05s,box-shadow .05s}
  button:hover{transform:translate(2px,2px);box-shadow:2px 2px 0 0 #5a7a00}
  button:active{transform:translate(4px,4px);box-shadow:none}
</style></head><body>
<form method="GET" action="/api/dev/login">
  <span class="tag">▚ Local dev only</span>
  <h1>Enter Git City</h1>
  <p>Sign in as any GitHub username. No OAuth setup needed — a real session is minted locally.</p>
  <label for="login">GitHub username</label>
  <input id="login" name="login" placeholder="e.g. torvalds" autofocus autocomplete="off"
    pattern="[A-Za-z0-9-]{1,39}" required>
  <button type="submit">Sign in</button>
</form></body></html>`;

export async function GET(request: NextRequest) {
  if (!devLoginAllowed()) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { searchParams, origin } = new URL(request.url);
  const login = (searchParams.get("login") ?? "").trim().toLowerCase();

  // No username yet → serve the form.
  if (!login) {
    return new NextResponse(FORM_HTML, {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }

  // GitHub username rules: 1–39 chars, alphanumeric or single hyphens.
  if (!/^[a-z0-9](?:[a-z0-9-]{0,38})$/.test(login)) {
    return NextResponse.json({ error: "Invalid GitHub username" }, { status: 400 });
  }

  const admin = getSupabaseAdmin();
  const email = `${login}@local.test`;

  // Create the auth user (idempotent) with GitHub-shaped metadata so the
  // shared provisioning keys on user_name exactly like real OAuth does.
  const { error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      user_name: login,
      preferred_username: login,
      full_name: login,
      avatar_url: `https://avatars.githubusercontent.com/${login}`,
    },
  });
  if (createErr && !/registered|already|exists/i.test(createErr.message)) {
    return NextResponse.json({ error: createErr.message }, { status: 500 });
  }

  // Mint a session without a password: generate a magic-link token, then verify
  // it on the cookie-based server client so the session persists to cookies.
  const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (linkErr || !linkData?.properties?.hashed_token || !linkData.user) {
    return NextResponse.json({ error: linkErr?.message ?? "link generation failed" }, { status: 500 });
  }

  const supabase = await createServerSupabase();
  const { error: verifyErr } = await supabase.auth.verifyOtp({
    type: "email",
    token_hash: linkData.properties.hashed_token,
  });
  if (verifyErr) {
    return NextResponse.json({ error: verifyErr.message }, { status: 500 });
  }

  // Same provisioning as the real GitHub OAuth callback.
  const ref = searchParams.get("ref") ?? request.cookies.get("gc_ref")?.value ?? null;
  await provisionDeveloperOnLogin(login, linkData.user.id, ref);

  const next = searchParams.get("next");
  const isSafeNext =
    !!next && next.startsWith("/") && !next.startsWith("//") && !next.startsWith("/\\");
  const dest = isSafeNext ? next : `/?user=${login}`;
  const res = NextResponse.redirect(`${origin}${dest}`);
  res.cookies.delete("gc_ref");
  return res;
}
