import { getSupabaseAdmin } from "@/lib/supabase";

export interface PitchStats {
  developers: number;
  claimed: number;
  adCampaigns: number;
  uniqueBrands: number;
  shopPurchases: number;
  kudos: number;
  buildingVisits: number;
  achievements: number;
  daysOld: number;
  conversionRate: string;
  formattedDevelopers: string;
  formattedClaimed: string;
  formattedAdCampaigns: string;
  formattedUniqueBrands: string;
  formattedShopPurchases: string;
  formattedKudos: string;
  formattedBuildingVisits: string;
  formattedAchievements: string;
  formattedDaysOld: string;
  formattedRevenue: string;
  formattedAdRevenue: string;
  formattedShopRevenue: string;
}

const LAUNCH_DATE = new Date("2026-02-19T00:00:00Z");

// Revenue from Stripe dashboard (update manually, can't be calculated from DB
// because sky_ads doesn't store which currency was used per ad)
const KNOWN_REVENUE_BRL = 1586;
const KNOWN_AD_REVENUE_BRL = 1550;
const KNOWN_SHOP_REVENUE_BRL = 36;

function fmt(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtRounded(n: number): string {
  if (n >= 1000) {
    const rounded = Math.floor(n / 100) * 100;
    return fmt(rounded) + "+";
  }
  return fmt(n);
}

export async function getPitchStats(): Promise<PitchStats> {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    return {
      developers: 0,
      claimed: 0,
      adCampaigns: 0,
      uniqueBrands: 0,
      shopPurchases: 0,
      kudos: 0,
      buildingVisits: 0,
      achievements: 0,
      daysOld: 0,
      conversionRate: "0%",
      formattedDevelopers: "0",
      formattedClaimed: "0",
      formattedAdCampaigns: "0",
      formattedUniqueBrands: "0",
      formattedShopPurchases: "0",
      formattedKudos: "0",
      formattedBuildingVisits: "0",
      formattedAchievements: "0",
      formattedDaysOld: "0 days old",
      formattedRevenue: "R$0",
      formattedAdRevenue: "R$0",
      formattedShopRevenue: "R$0",
    };
  }

  const admin = getSupabaseAdmin();

  const [
    devsResult,
    claimedResult,
    adsResult,
    kudosResult,
    visitsResult,
    achievementsResult,
  ] = await Promise.all([
    admin.from("developers").select("*", { count: "exact", head: true }),
    admin.from("developers").select("*", { count: "exact", head: true }).eq("claimed", true),
    admin.from("sky_ads").select("plan_id, purchaser_email").not("purchaser_email", "is", null),
    admin.from("developer_kudos").select("*", { count: "exact", head: true }),
    admin.from("building_visits").select("*", { count: "exact", head: true }),
    admin.from("developer_achievements").select("*", { count: "exact", head: true }),
  ]);

  const developers = devsResult.count ?? 0;
  const claimed = claimedResult.count ?? 0;

  const paidAds = adsResult.data ?? [];
  const brandEmails = new Set<string>();
  for (const ad of paidAds) {
    if (ad.purchaser_email) {
      brandEmails.add(ad.purchaser_email);
    }
  }
  const adCampaigns = paidAds.length;
  const uniqueBrands = brandEmails.size;

  const kudos = kudosResult.count ?? 0;
  const buildingVisits = visitsResult.count ?? 0;
  const achievements = achievementsResult.count ?? 0;

  const daysOld = Math.floor((Date.now() - LAUNCH_DATE.getTime()) / 86400000);
  const conversionRate = developers > 0 ? ((claimed / developers) * 100).toFixed(1) + "%" : "0%";

  return {
    developers,
    claimed,
    adCampaigns,
    uniqueBrands,
    shopPurchases: 0,
    kudos,
    buildingVisits,
    achievements,
    daysOld,
    conversionRate,
    formattedDevelopers: fmtRounded(developers),
    formattedClaimed: fmt(claimed),
    formattedAdCampaigns: fmt(adCampaigns),
    formattedUniqueBrands: fmt(uniqueBrands),
    formattedShopPurchases: "0",
    formattedKudos: fmt(kudos),
    formattedBuildingVisits: fmt(buildingVisits),
    formattedAchievements: fmt(achievements),
    formattedDaysOld: `${daysOld} days old`,
    formattedRevenue: `R$${fmt(KNOWN_REVENUE_BRL)}+`,
    formattedAdRevenue: `R$${fmt(KNOWN_AD_REVENUE_BRL)}`,
    formattedShopRevenue: KNOWN_SHOP_REVENUE_BRL > 0 ? `R$${fmt(KNOWN_SHOP_REVENUE_BRL)}` : "Early sales",
  };
}
