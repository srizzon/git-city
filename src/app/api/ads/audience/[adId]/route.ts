import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { verifyApiKey } from "@/lib/advertiser-api-auth";

function estimateSeniority(accountCreatedAt: string, contributions: number): "junior" | "mid" | "senior" {
  const yearsOnGithub = (Date.now() - new Date(accountCreatedAt).getTime()) / (365.25 * 24 * 3600 * 1000);
  const contribsPerYear = contributions / Math.max(yearsOnGithub, 1);
  if (yearsOnGithub > 5 || contribsPerYear > 800) return "senior";
  if (yearsOnGithub >= 2 && contribsPerYear >= 200) return "mid";
  return "junior";
}

const COUNTRY_NAMES: Record<string, string> = {
  US: "United States", BR: "Brazil", IN: "India", DE: "Germany", GB: "United Kingdom",
  FR: "France", CA: "Canada", AU: "Australia", JP: "Japan", NL: "Netherlands",
  KR: "South Korea", CN: "China", RU: "Russia", ES: "Spain", IT: "Italy",
  SE: "Sweden", PL: "Poland", MX: "Mexico", AR: "Argentina", CO: "Colombia",
  PT: "Portugal", TR: "Turkey", ID: "Indonesia", PH: "Philippines", NG: "Nigeria",
};

async function getAdvertiserId(request: NextRequest): Promise<string | null> {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer gc_ak_")) {
    return verifyApiKey(authHeader.slice(7));
  }
  const advertiser = await getAdvertiserFromCookies();
  return advertiser?.id ?? null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ adId: string }> },
) {
  const advertiserId = await getAdvertiserId(request);
  if (!advertiserId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { adId } = await params;
  const sb = getSupabaseAdmin();

  // Verify ownership
  const { data: ad } = await sb
    .from("sky_ads")
    .select("id")
    .eq("id", adId)
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  if (!ad) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const period = request.nextUrl.searchParams.get("period") ?? "30d";
  const days = period === "7d" ? 7 : period === "90d" ? 90 : period === "all" ? null : 30;
  const since = days ? new Date(Date.now() - days * 86400000).toISOString() : null;

  // Get unique github logins who saw this ad
  let loginQuery = sb
    .from("sky_ad_events")
    .select("github_login, country, device")
    .eq("ad_id", adId)
    .not("github_login", "is", null);
  if (since) loginQuery = loginQuery.gte("created_at", since);
  const { data: events } = await loginQuery.limit(5000);

  if (!events || events.length === 0) {
    return NextResponse.json({
      countries: [], languages: [], seniority: [], devices: [], hourly: [],
      sample_rate: 0, total_identified: 0,
    });
  }

  // Get total event count for sample rate
  let countQuery = sb
    .from("sky_ad_events")
    .select("id", { count: "exact", head: true })
    .eq("ad_id", adId)
    .eq("event_type", "impression");
  if (since) countQuery = countQuery.gte("created_at", since);
  const { count: totalEvents } = await countQuery;

  // Unique logins
  const uniqueLogins = [...new Set(events.filter((e) => e.github_login).map((e) => e.github_login!))];

  // Look up developers
  const { data: devs } = await sb
    .from("developers")
    .select("github_login, primary_language, contributions, account_created_at")
    .in("github_login", uniqueLogins.slice(0, 1000));

  const devMap = new Map((devs ?? []).map((d) => [d.github_login, d]));

  // Country aggregation (from events, not dev table)
  const countryCounts = new Map<string, number>();
  const deviceCounts = new Map<string, number>();

  for (const e of events) {
    if (e.country) {
      countryCounts.set(e.country, (countryCounts.get(e.country) ?? 0) + 1);
    }
    if (e.device) {
      deviceCounts.set(e.device, (deviceCounts.get(e.device) ?? 0) + 1);
    }
  }

  // Language + seniority from dev data
  const langCounts = new Map<string, number>();
  const senCounts = new Map<string, number>();

  for (const login of uniqueLogins) {
    const dev = devMap.get(login);
    if (!dev) continue;

    if (dev.primary_language) {
      langCounts.set(dev.primary_language, (langCounts.get(dev.primary_language) ?? 0) + 1);
    }
    if (dev.account_created_at) {
      const sen = estimateSeniority(dev.account_created_at, dev.contributions ?? 0);
      senCounts.set(sen, (senCounts.get(sen) ?? 0) + 1);
    }
  }

  function toPercentageArray<T extends string>(counts: Map<T, number>): { name: T; pct: number }[] {
    const total = Array.from(counts.values()).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, pct: (count / total) * 100 }))
      .sort((a, b) => b.pct - a.pct);
  }

  const countryTotal = Array.from(countryCounts.values()).reduce((a, b) => a + b, 0);
  const countries = Array.from(countryCounts.entries())
    .map(([code, count]) => ({ code, name: COUNTRY_NAMES[code] ?? code, pct: (count / countryTotal) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  const deviceTotal = Array.from(deviceCounts.values()).reduce((a, b) => a + b, 0);
  const devices = Array.from(deviceCounts.entries())
    .map(([type, count]) => ({ type, pct: (count / deviceTotal) * 100 }))
    .sort((a, b) => b.pct - a.pct);

  // Hourly breakdown
  let hourlyQuery = sb
    .from("sky_ad_events")
    .select("created_at")
    .eq("ad_id", adId)
    .eq("event_type", "impression");
  if (since) hourlyQuery = hourlyQuery.gte("created_at", since);
  const { data: hourlyEvents } = await hourlyQuery.limit(10000);

  const hourly = new Array(24).fill(0);
  for (const e of hourlyEvents ?? []) {
    const hour = new Date(e.created_at).getUTCHours();
    hourly[hour]++;
  }

  const seniority = toPercentageArray(senCounts).map((s) => ({ level: s.name, pct: s.pct }));
  const languages = toPercentageArray(langCounts);

  return NextResponse.json({
    countries,
    languages,
    seniority,
    devices,
    hourly,
    sample_rate: totalEvents ? (uniqueLogins.length / totalEvents) * 100 : 0,
    total_identified: uniqueLogins.length,
  });
}
