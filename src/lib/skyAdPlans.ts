import type { AdVehicle } from "./skyAds";

export type AdCurrency = "usd" | "brl";

// Promo discount multiplier. Set to 1 to disable.
export const PROMO_DISCOUNT = 1;
export const PROMO_LABEL = "";

export const SKY_AD_PLANS = {
  plane_monthly: {
    usd_cents: 2900,
    brl_cents: 14900,
    label: "Plane",
    vehicle: "plane" as AdVehicle,
    category: "sky" as const,
  },
  blimp_monthly: {
    usd_cents: 9900,
    brl_cents: 49900,
    label: "Blimp",
    vehicle: "blimp" as AdVehicle,
    category: "sky" as const,
  },
  billboard_monthly: {
    usd_cents: 5900,
    brl_cents: 29900,
    label: "Billboard",
    vehicle: "billboard" as AdVehicle,
    category: "building" as const,
  },
  rooftop_sign_monthly: {
    usd_cents: 4900,
    brl_cents: 24900,
    label: "Rooftop Sign",
    vehicle: "rooftop_sign" as AdVehicle,
    category: "building" as const,
  },
  led_wrap_monthly: {
    usd_cents: 4900,
    brl_cents: 24900,
    label: "LED Wrap",
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
