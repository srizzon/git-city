import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { rateLimit } from "@/lib/rate-limit";

const VALID_EVENTS = new Set(["impression", "click", "cta_click"]);

function generateClickId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return "gc_" + Array.from(bytes).map((b) => b.toString(36).padStart(2, "0")).join("").slice(0, 21);
}

const BOT_UA_PATTERNS = /bot|crawler|spider|headless|phantomjs|selenium|puppeteer|wget|curl|python-requests|scrapy|slurp|mediapartners/i;

const MOBILE_UA = /Mobile|Android|iPhone/i;
const TABLET_UA = /iPad|Tablet/i;

function parseDevice(ua: string): string {
  if (TABLET_UA.test(ua)) return "tablet";
  if (MOBILE_UA.test(ua)) return "mobile";
  return "desktop";
}

// In-memory dedup cache: skip Supabase query if we've seen this combo recently.
// Key: `${ipHash}:${adId}:${eventType}`, Value: timestamp (ms)
const recentEvents = new Map<string, number>();
const DEDUP_CACHE_MAX = 10_000;
const IMPRESSION_WINDOW_MS = 30 * 60 * 1000; // 30 min
const CLICK_WINDOW_MS = 60 * 60 * 1000; // 1 hour

// Prune stale entries every 5 min
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, ts] of recentEvents) {
      if (now - ts > CLICK_WINDOW_MS) recentEvents.delete(key);
    }
  }, 5 * 60 * 1000);
}

function isDedupedInMemory(ipHash: string, adId: string, eventType: string): boolean {
  const key = `${ipHash}:${adId}:${eventType}`;
  const ts = recentEvents.get(key);
  if (!ts) return false;
  const window = eventType === "impression" ? IMPRESSION_WINDOW_MS : CLICK_WINDOW_MS;
  return Date.now() - ts < window;
}

function markSeen(ipHash: string, adId: string, eventType: string) {
  const key = `${ipHash}:${adId}:${eventType}`;
  recentEvents.set(key, Date.now());
  // Evict oldest if too large
  if (recentEvents.size > DEDUP_CACHE_MAX) {
    const firstKey = recentEvents.keys().next().value;
    if (firstKey) recentEvents.delete(firstKey);
  }
}

const ALLOWED_ORIGINS = new Set([
  "https://thegitcity.com",
  "https://www.thegitcity.com",
  "http://localhost:3001",
  "http://localhost:3000",
]);

async function hashIP(ip: string): Promise<string> {
  const data = new TextEncoder().encode(ip + (process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""));
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function POST(request: NextRequest) {
  // ── Origin validation ──
  const origin = request.headers.get("origin") ?? request.headers.get("referer");
  if (origin) {
    try {
      const url = new URL(origin);
      if (!ALLOWED_ORIGINS.has(url.origin)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    } catch {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  // ── Bot filtering ──
  const ua = request.headers.get("user-agent") ?? "";
  if (BOT_UA_PATTERNS.test(ua)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown";

  const { ok } = rateLimit(`ad:${ip}`, 120, 60_000);
  if (!ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  let body: {
    ad_id?: string;
    event_type?: string;
    event_types?: string[];
    github_login?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { ad_id, github_login } = body;
  if (!ad_id || typeof ad_id !== "string") {
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  // Support both single event_type and batch event_types[]
  const types: string[] = [];
  if (body.event_type && VALID_EVENTS.has(body.event_type)) {
    types.push(body.event_type);
  }
  if (Array.isArray(body.event_types)) {
    for (const t of body.event_types) {
      if (typeof t === "string" && VALID_EVENTS.has(t) && !types.includes(t)) {
        types.push(t);
      }
    }
  }

  if (types.length === 0) {
    return NextResponse.json({ error: "Invalid event type" }, { status: 400 });
  }

  const ipHash = await hashIP(ip);
  const userAgent = request.headers.get("user-agent")?.slice(0, 256) ?? null;
  const login = typeof github_login === "string" ? github_login.slice(0, 39).toLowerCase() : null;
  const country = request.headers.get("x-vercel-ip-country") ?? request.headers.get("cf-ipcountry") ?? null;
  const region = request.headers.get("x-vercel-ip-country-region") ?? null;
  const device = ua ? parseDevice(ua) : null;

  const sb = getSupabaseAdmin();

  // ── Click dedup: same ip_hash + ad_id within 1 hour = skip insert ──
  const clickTypes = types.filter((t) => t === "click" || t === "cta_click");
  const nonClickTypes = types.filter((t) => t !== "click" && t !== "cta_click");

  let dedupedClickTypes = clickTypes;
  if (clickTypes.length > 0) {
    // Check in-memory cache first
    const allCachedClicks = clickTypes.every((t) => isDedupedInMemory(ipHash, ad_id, t));
    if (allCachedClicks) {
      dedupedClickTypes = [];
    } else {
      // Fall back to Supabase check
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      const { count } = await sb
        .from("sky_ad_events")
        .select("id", { count: "exact", head: true })
        .eq("ad_id", ad_id)
        .eq("ip_hash", ipHash)
        .in("event_type", clickTypes)
        .gte("created_at", oneHourAgo);

      if ((count ?? 0) > 0) {
        dedupedClickTypes = [];
        // Mark in cache so future checks skip Supabase
        for (const t of clickTypes) markSeen(ipHash, ad_id, t);
      }
    }
  }

  // ── Impression dedup: same ip_hash + ad_id within 30 min = skip ──
  const impressionTypes = nonClickTypes.filter((t) => t === "impression");
  const otherTypes = nonClickTypes.filter((t) => t !== "impression");

  let dedupedImpressionTypes = impressionTypes;
  if (impressionTypes.length > 0) {
    const allCachedImpressions = impressionTypes.every((t) => isDedupedInMemory(ipHash, ad_id, t));
    if (allCachedImpressions) {
      dedupedImpressionTypes = [];
    } else {
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      const { count } = await sb
        .from("sky_ad_events")
        .select("id", { count: "exact", head: true })
        .eq("ad_id", ad_id)
        .eq("ip_hash", ipHash)
        .eq("event_type", "impression")
        .gte("created_at", thirtyMinAgo);

      if ((count ?? 0) > 0) {
        dedupedImpressionTypes = [];
        for (const t of impressionTypes) markSeen(ipHash, ad_id, t);
      }
    }
  }

  const finalTypes = [...otherTypes, ...dedupedImpressionTypes, ...dedupedClickTypes];

  if (finalTypes.length === 0) {
    // All events deduped, return 201 silently
    return NextResponse.json({ ok: true }, { status: 201 });
  }

  // Generate click_id for cta_click events (used for conversion tracking)
  const hasCtaClick = finalTypes.includes("cta_click");
  const clickId = hasCtaClick ? generateClickId() : null;

  const rows = finalTypes.map((event_type) => ({
    ad_id,
    event_type,
    ip_hash: ipHash,
    user_agent: userAgent,
    github_login: login,
    country,
    region,
    device,
    ...(event_type === "cta_click" && clickId ? { click_id: clickId } : {}),
  }));

  await sb.from("sky_ad_events").insert(rows);

  // Mark inserted events in dedup cache
  for (const row of rows) {
    markSeen(ipHash, ad_id, row.event_type);
  }

  return NextResponse.json({ ok: true, ...(clickId ? { click_id: clickId } : {}) }, { status: 201 });
}
