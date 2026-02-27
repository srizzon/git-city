import type { AdVehicle } from "./skyAds";

export type AdCurrency = "usd" | "brl";

// Promo discount multiplier. Set to 1 to disable.
export const PROMO_DISCOUNT = 1;
export const PROMO_LABEL = "";

export const SKY_AD_PLANS = {
  // Sky Ads
  plane_weekly: {
    usd_cents: 1900,
    brl_cents: 9900,
    label: "Plane - Weekly",
    duration_days: 7,
    vehicle: "plane" as AdVehicle,
    category: "sky" as const,
  },
  plane_monthly: {
    usd_cents: 5900,
    brl_cents: 29900,
    label: "Plane - Monthly",
    duration_days: 30,
    vehicle: "plane" as AdVehicle,
    category: "sky" as const,
  },
  blimp_weekly: {
    usd_cents: 7900,
    brl_cents: 39900,
    label: "Blimp - Weekly",
    duration_days: 7,
    vehicle: "blimp" as AdVehicle,
    category: "sky" as const,
  },
  blimp_monthly: {
    usd_cents: 27900,
    brl_cents: 139900,
    label: "Blimp - Monthly",
    duration_days: 30,
    vehicle: "blimp" as AdVehicle,
    category: "sky" as const,
  },
  // Building Ads
  billboard_weekly: {
    usd_cents: 3900,
    brl_cents: 19900,
    label: "Billboard - Weekly",
    duration_days: 7,
    vehicle: "billboard" as AdVehicle,
    category: "building" as const,
  },
  billboard_monthly: {
    usd_cents: 13900,
    brl_cents: 69900,
    label: "Billboard - Monthly",
    duration_days: 30,
    vehicle: "billboard" as AdVehicle,
    category: "building" as const,
  },
  rooftop_sign_weekly: {
    usd_cents: 5900,
    brl_cents: 29900,
    label: "Rooftop Sign - Weekly",
    duration_days: 7,
    vehicle: "rooftop_sign" as AdVehicle,
    category: "building" as const,
  },
  rooftop_sign_monthly: {
    usd_cents: 19900,
    brl_cents: 99900,
    label: "Rooftop Sign - Monthly",
    duration_days: 30,
    vehicle: "rooftop_sign" as AdVehicle,
    category: "building" as const,
  },
  led_wrap_weekly: {
    usd_cents: 2900,
    brl_cents: 14900,
    label: "LED Wrap - Weekly",
    duration_days: 7,
    vehicle: "led_wrap" as AdVehicle,
    category: "building" as const,
  },
  led_wrap_monthly: {
    usd_cents: 9900,
    brl_cents: 49900,
    label: "LED Wrap - Monthly",
    duration_days: 30,
    vehicle: "led_wrap" as AdVehicle,
    category: "building" as const,
  },
} as const;

export type SkyAdPlanId = keyof typeof SKY_AD_PLANS;

export function isValidPlanId(id: string): id is SkyAdPlanId {
  return id in SKY_AD_PLANS;
}

export function getFullPriceCents(planId: SkyAdPlanId, currency: AdCurrency): number {
  const plan = SKY_AD_PLANS[planId];
  return currency === "brl" ? plan.brl_cents : plan.usd_cents;
}

export function getPriceCents(planId: SkyAdPlanId, currency: AdCurrency): number {
  const full = getFullPriceCents(planId, currency);
  return Math.round(full * PROMO_DISCOUNT);
}

export function formatPrice(cents: number, currency: AdCurrency): string {
  const value = cents / 100;
  const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  if (currency === "brl") return `R$${formatted}`;
  return `$${formatted}`;
}
