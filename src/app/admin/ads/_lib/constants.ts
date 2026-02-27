import type { AdForm } from "./types";

export const VEHICLE_LABELS: Record<string, string> = {
  plane: "Plane",
  blimp: "Blimp",
  billboard: "Billboard",
  rooftop_sign: "Rooftop Sign",
  led_wrap: "LED Wrap",
};

export const VEHICLES = ["plane", "blimp", "billboard", "rooftop_sign", "led_wrap"] as const;

export const EMPTY_FORM: AdForm = {
  brand: "",
  text: "",
  description: "",
  color: "#f8d880",
  bg_color: "#1a1018",
  link: "",
  vehicle: "plane",
  priority: 50,
  starts_at: "",
  ends_at: "",
};

export const STORAGE_KEY = "admin-ads-filters";
