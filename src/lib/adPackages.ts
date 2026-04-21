import type { AdVehicle } from "./skyAds";
import type { AdCurrency } from "./skyAdPlans";

export interface AdPackage {
  label: string;
  vehicles: AdVehicle[];
  monthly_usd_cents: number;
  monthly_brl_cents: number;
  landmark: boolean;
}

export const AD_PACKAGES = {
  foundation: {
    label: "Foundation",
    vehicles: ["rooftop_sign", "rooftop_sign"] as AdVehicle[],
    monthly_usd_cents: 4700,
    monthly_brl_cents: 29700,
    landmark: false,
  },
  skyline: {
    label: "Skyline",
    vehicles: ["rooftop_sign", "rooftop_sign", "blimp", "led_wrap", "plane"] as AdVehicle[],
    monthly_usd_cents: 7700,
    monthly_brl_cents: 49700,
    landmark: false,
  },
  landmark: {
    label: "Landmark",
    vehicles: ["rooftop_sign", "rooftop_sign", "blimp", "led_wrap", "plane"] as AdVehicle[],
    monthly_usd_cents: 12700,
    monthly_brl_cents: 79700,
    landmark: true,
  },
} as const;

export type AdPackageId = keyof typeof AD_PACKAGES;

export function isValidPackageId(id: string): id is AdPackageId {
  return id in AD_PACKAGES;
}

export function getPackagePriceCents(packageId: AdPackageId, currency: AdCurrency): number {
  const pkg = AD_PACKAGES[packageId];
  return currency === "brl" ? pkg.monthly_brl_cents : pkg.monthly_usd_cents;
}

export function formatPackagePrice(cents: number, currency: AdCurrency): string {
  const value = cents / 100;
  const formatted = Number.isInteger(value) ? value.toFixed(0) : value.toFixed(2);
  if (currency === "brl") return `R$${formatted}`;
  return `$${formatted}`;
}
