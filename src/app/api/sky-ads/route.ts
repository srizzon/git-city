import { NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { DEFAULT_SKY_ADS, MAX_PLANES, MAX_BLIMPS, MAX_BILLBOARDS, MAX_ROOFTOP_SIGNS, MAX_LED_WRAPS, type SkyAd } from "@/lib/skyAds";

// Rotation interval in seconds. Every interval, a different set of paid ads is served.
const ROTATION_INTERVAL = 60;

/**
 * Deterministic shuffle using a numeric seed.
 * Same seed = same order across all server instances.
 */
function seededShuffle<T>(arr: T[], seed: number): T[] {
  const result = [...arr];
  let s = seed;
  for (let i = result.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) & 0x7fffffff; // LCG
    const j = s % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Pick which ads to show this rotation window.
 * Paid ads get priority. House ads (priority >= 100) fill remaining slots.
 */
function rotateAds(ads: SkyAd[], maxSlots: number): SkyAd[] {
  const house = ads.filter((a) => a.priority >= 100);
  const paid = ads.filter((a) => a.priority < 100);

  if (paid.length >= maxSlots) {
    // Paid ads fill all slots, no house ads
    const seed = Math.floor(Date.now() / 1000 / ROTATION_INTERVAL);
    return seededShuffle(paid, seed).slice(0, maxSlots);
  }

  // Paid ads first, then rotate paid if needed
  const seed = Math.floor(Date.now() / 1000 / ROTATION_INTERVAL);
  const selectedPaid =
    paid.length > maxSlots
      ? seededShuffle(paid, seed).slice(0, maxSlots)
      : paid;

  // House ads fill remaining slots
  const remaining = maxSlots - selectedPaid.length;
  return [...selectedPaid, ...house.slice(0, remaining)];
}

export async function GET() {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("sky_ads")
      .select("id, brand, text, description, color, bg_color, link, vehicle, priority, plan_id")
      .eq("active", true)
      .or("starts_at.is.null,starts_at.lte.now()")
      .or("ends_at.is.null,ends_at.gt.now()")
      .order("priority", { ascending: false });

    if (error || !data || data.length === 0) {
      return NextResponse.json(DEFAULT_SKY_ADS, {
        headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
      });
    }

    const allAds: SkyAd[] = data.map((row) => ({
      id: row.id,
      brand: row.brand,
      text: row.text,
      description: row.description,
      color: row.color,
      bgColor: row.bg_color,
      link: row.link,
      vehicle: row.vehicle,
      priority: row.priority,
    }));

    const planes = rotateAds(allAds.filter((a) => a.vehicle === "plane"), MAX_PLANES);
    const blimps = rotateAds(allAds.filter((a) => a.vehicle === "blimp"), MAX_BLIMPS);
    const billboards = rotateAds(allAds.filter((a) => a.vehicle === "billboard"), MAX_BILLBOARDS);
    const rooftopSigns = rotateAds(allAds.filter((a) => a.vehicle === "rooftop_sign"), MAX_ROOFTOP_SIGNS);
    const ledWraps = rotateAds(allAds.filter((a) => a.vehicle === "led_wrap"), MAX_LED_WRAPS);

    return NextResponse.json([...planes, ...blimps, ...billboards, ...rooftopSigns, ...ledWraps], {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  } catch {
    return NextResponse.json(DEFAULT_SKY_ADS, {
      headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=120" },
    });
  }
}
