import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";
import { verifyKillToken } from "@/lib/pvpToken";
import { getHappyHourStatus } from "@/lib/happyHour";

const BASE_KILL_XP = 5;

function deny(reason: string, status = 400) {
  return NextResponse.json({ granted: 0, reason }, { status });
}

function getAllowedOrigins(): string[] {
  const set = new Set<string>();
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) set.add(explicit);
  const vercel = process.env.VERCEL_URL;
  if (vercel) set.add(`https://${vercel}`);
  return [...set];
}

const LOCALHOST_RE = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/;

function isAllowedOrigin(origin: string | null, referer: string | null): boolean {
  const candidates = [origin, referer].filter(
    (v): v is string => typeof v === "string" && v.length > 0,
  );
  if (candidates.length === 0) return false;

  // Dev: accept any localhost / 127.0.0.1 port (Next may pick 3001+ if 3000 is taken)
  if (process.env.NODE_ENV !== "production") {
    if (candidates.some((c) => LOCALHOST_RE.test(c))) return true;
  }

  const allowed = getAllowedOrigins();
  if (allowed.length === 0) return true; // misconfigured env should not block prod; cookie auth still required
  return candidates.some((c) => allowed.some((a) => c.startsWith(a)));
}

export async function POST(request: Request) {
  const headerList = await headers();
  const origin = headerList.get("origin");
  const referer = headerList.get("referer");
  if (!isAllowedOrigin(origin, referer)) {
    return deny("forbidden_origin", 403);
  }

  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { ok } = rateLimit(`pvp-credit:${user.id}`, 1, 500);
  if (!ok) {
    return NextResponse.json({ error: "Too fast" }, { status: 429 });
  }

  let body: { kill_token?: unknown };
  try {
    body = await request.json();
  } catch {
    return deny("invalid_json");
  }
  const killToken = typeof body.kill_token === "string" ? body.kill_token : null;
  if (!killToken) return deny("missing_kill_token");

  // Verify HMAC signature. This guarantees the token came from the PartyKit
  // server and the killer/victim pair was set by the game server, not by
  // the client. After this point we trust the payload's contents.
  const verify = verifyKillToken(killToken);
  if (!verify.ok) {
    return deny(`token_${verify.reason}`, 400);
  }
  const payload = verify.payload;

  // Killer must match the authenticated session. The token already binds
  // the killer login but we still re-verify against the cookie to prevent
  // a token being replayed by a different account.
  const killerLogin = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();
  if (!killerLogin) return deny("no_github_login");
  if (payload.kln !== killerLogin) return deny("killer_mismatch", 403);
  if (payload.vln === payload.kln) return deny("self_kill");

  // Happy hour is recomputed server-side. We do trust payload.hh because
  // it is signed, but defense-in-depth: if the client somehow had a token
  // claiming hh=true but the window has passed, downgrade to 1x.
  const liveHappyHour = getHappyHourStatus().active;
  const effectiveHappyHour = payload.hh && liveHappyHour;
  const baseXp = BASE_KILL_XP * (effectiveHappyHour ? 2 : 1);

  const admin = getSupabaseAdmin();

  const [killerRes, targetRes] = await Promise.all([
    admin.from("developers").select("id").eq("github_login", payload.kln).single(),
    admin.from("developers").select("id").eq("github_login", payload.vln).single(),
  ]);

  if (!killerRes.data) return deny("killer_not_found", 404);
  if (!targetRes.data) return deny("target_not_found", 404);

  // Atomic credit: cap check + audit insert + XP grant happen in one
  // server-side transaction. Idempotent via UNIQUE(kill_token).
  const { data, error } = await admin.rpc("pvp_credit_kill", {
    p_killer_id: killerRes.data.id,
    p_target_id: targetRes.data.id,
    p_base_xp: baseXp,
    p_happy_hour: effectiveHappyHour,
    p_kill_token: killToken,
  });

  if (error) {
    return NextResponse.json({ error: "Credit failed" }, { status: 500 });
  }

  return NextResponse.json(data);
}
