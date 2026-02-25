import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rateLimit } from "@/lib/rate-limit";

// ---------------------------------------------------------------------------
// Route-specific rate limits: [maxRequests, windowMs]
// ---------------------------------------------------------------------------
const ROUTE_LIMITS: [string, number, number][] = [
  // Exact-prefix match – order from most-specific to least-specific
  ["/api/customizations/upload", 5, 60_000],
  ["/api/customizations", 10, 60_000],
  ["/api/sky-ads/track", 30, 60_000],
  ["/api/sky-ads", 30, 60_000],
  ["/api/checkin", 10, 60_000],
  ["/api/interactions/kudos", 20, 60_000],
  ["/api/interactions/visit", 50, 60_000],
  ["/api/interactions", 60, 60_000],
  ["/api/achievements", 30, 60_000],
  ["/api/loadout", 10, 60_000],
  ["/api/feed", 30, 60_000],
  ["/api/checkout", 6, 60_000],
  ["/api/claim", 5, 60_000],
  ["/api/city", 30, 60_000],
  ["/api/dev/", 60, 60_000],
  ["/api/items", 30, 60_000],
  ["/api/auth", 10, 60_000],
];

const DEFAULT_API: [number, number] = [60, 60_000];
const DEFAULT_PAGE: [number, number] = [120, 60_000];

function getLimitForPath(pathname: string): {
  limit: number;
  window: number;
  group: string;
} {
  // Webhooks are called by trusted third-parties (Stripe, AbacatePay) –
  // they verify signatures, so we don't rate-limit them.
  if (pathname.startsWith("/api/webhooks")) {
    return { limit: 1000, window: 60_000, group: "webhooks" };
  }

  for (const [prefix, limit, window] of ROUTE_LIMITS) {
    if (pathname.startsWith(prefix)) {
      return { limit, window, group: prefix };
    }
  }

  if (pathname.startsWith("/api/")) {
    return { limit: DEFAULT_API[0], window: DEFAULT_API[1], group: "/api" };
  }

  return { limit: DEFAULT_PAGE[0], window: DEFAULT_PAGE[1], group: "/pages" };
}

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── 1. Rate Limit ────────────────────────────────────────────────────
  const ip = getClientIp(request);
  const { limit, window, group } = getLimitForPath(pathname);
  const key = `${ip}:${group}`;
  const { ok, remaining, reset } = rateLimit(key, limit, window);

  if (!ok) {
    return new NextResponse(
      JSON.stringify({ error: "Too many requests. Please slow down." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(Math.ceil((reset - Date.now()) / 1000)),
          "X-RateLimit-Limit": String(limit),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(reset / 1000)),
        },
      },
    );
  }

  // ── 2. Supabase Session Refresh ──────────────────────────────────────
  // Only call Supabase when the user is actually logged in (has auth
  // cookies).  For anonymous visitors (~80%+ of viral traffic) we skip
  // the external HTTP call entirely, saving latency and Supabase quota.
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-"));

  let supabaseResponse = NextResponse.next({ request });

  if (hasSession) {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) =>
              request.cookies.set(name, value),
            );
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) =>
              supabaseResponse.cookies.set(name, value, options),
            );
          },
        },
      },
    );

    await supabase.auth.getUser();
  }

  // ── 3. Security headers ─────────────────────────────────────────────
  supabaseResponse.headers.set("X-Frame-Options", "DENY");
  supabaseResponse.headers.set("X-Content-Type-Options", "nosniff");
  supabaseResponse.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  supabaseResponse.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");

  // ── 4. Attach rate-limit headers so clients can self-throttle ────────
  supabaseResponse.headers.set("X-RateLimit-Limit", String(limit));
  supabaseResponse.headers.set("X-RateLimit-Remaining", String(remaining));
  supabaseResponse.headers.set(
    "X-RateLimit-Reset",
    String(Math.ceil(reset / 1000)),
  );

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon\\.ico|models|fonts).*)",
  ],
};
