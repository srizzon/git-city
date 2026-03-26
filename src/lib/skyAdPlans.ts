import type { AdVehicle } from "./skyAds";

export type AdCurrency = "usd" | "brl";

// Promo discount multiplier. Set to 1 to disable.
export const PROMO_DISCOUNT = 1;
export const PROMO_LABEL = "";

export const SKY_AD_PLANS = {
  plane_monthly: {
    weekly_usd_cents: 1900,  monthly_usd_cents: 4900,
    weekly_brl_cents: 9500,  monthly_brl_cents: 24500,
    label: "Plane",
    vehicle: "plane" as AdVehicle,
    category: "sky" as const,
  },
  blimp_monthly: {
    weekly_usd_cents: 3900,  monthly_usd_cents: 9900,
    weekly_brl_cents: 19500, monthly_brl_cents: 49500,
    label: "Blimp",
    vehicle: "blimp" as AdVehicle,
    category: "sky" as const,
  },
  billboard_monthly: {
    weekly_usd_cents: 1200,  monthly_usd_cents: 2900,
    weekly_brl_cents: 6000,  monthly_brl_cents: 14500,
    label: "Billboard",
    vehicle: "billboard" as AdVehicle,
    category: "building" as const,
  },
  rooftop_sign_monthly: {
    weekly_usd_cents: 1500,  monthly_usd_cents: 3900,
    weekly_brl_cents: 7500,  monthly_brl_cents: 19500,
    label: "Rooftop Sign",
    vehicle: "rooftop_sign" as AdVehicle,
    category: "building" as const,
  },
  led_wrap_monthly: {
    weekly_usd_cents: 900,   monthly_usd_cents: 1900,
    weekly_brl_cents: 4500,  monthly_brl_cents: 9500,
    label: "LED Wrap",
    vehicle: "led_wrap" as AdVehicle,
    category: "building" as const,
  },
} as const;

export type SkyAdPlanId = keyof typeof SKY_AD_PLANS;

export const PERIOD_OPTIONS = {
  "1w": { label: "1 week", days: 7 },
  "1m": { label: "1 month", days: 30 },
} as const;

export type AdPeriod = keyof typeof PERIOD_OPTIONS;

/** Periods that support one-time payment (Stripe + Pix). Monthly is subscription. */
export const ONE_OFF_PERIODS: AdPeriod[] = ["1w"];

export function isValidPlanId(id: string): id is SkyAdPlanId {
  return id in SKY_AD_PLANS;
}

export function isValidPeriod(p: string): p is AdPeriod {
  return p in PERIOD_OPTIONS;
}

export function getPriceCents(planId: SkyAdPlanId, currency: AdCurrency, period: AdPeriod = "1m"): number {
  const plan = SKY_AD_PLANS[planId];
  if (period === "1w") {
    return Math.round((currency === "brl" ? plan.weekly_brl_cents : plan.weekly_usd_cents) * PROMO_DISCOUNT);
  }
  return Math.round((currency === "brl" ? plan.monthly_brl_cents : plan.monthly_usd_cents) * PROMO_DISCOUNT);
}

export function getPeriodDays(period: AdPeriod): number {
  return PERIOD_OPTIONS[period].days;
}

export function formatPrice(cents: number, currency: AdCurrency): string {
  const value = cents / 100;
  const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  if (currency === "brl") return `R$${formatted}`;
  return `$${formatted}`;
}
