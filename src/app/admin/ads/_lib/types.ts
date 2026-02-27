export interface AdStats {
  id: string;
  brand: string;
  text: string;
  description: string | null;
  color: string;
  bg_color: string;
  link: string | null;
  vehicle: string;
  active: boolean;
  priority: number;
  plan_id: string | null;
  starts_at: string | null;
  ends_at: string | null;
  purchaser_email: string | null;
  tracking_token: string | null;
  created_at: string | null;
  impressions: number;
  clicks: number;
  cta_clicks: number;
  ctr: string;
}

export interface AdForm {
  brand: string;
  text: string;
  description: string;
  color: string;
  bg_color: string;
  link: string;
  vehicle: "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";
  priority: number;
  starts_at: string;
  ends_at: string;
}

export type SortKey =
  | "brand"
  | "impressions"
  | "clicks"
  | "cta_clicks"
  | "ctr"
  | "priority"
  | "created_at"
  | "status";

export type SortDir = "asc" | "desc";
export type Period = "7d" | "30d" | "all";
export type StatusFilter = "all" | "active" | "paused" | "expired";
export type VehicleFilter = "all" | "plane" | "blimp" | "billboard" | "rooftop_sign" | "led_wrap";
export type SourceFilter = "all" | "paid" | "manual";

export type AdStatus = "active" | "paused" | "expired";

export interface AdsFilters {
  period: Period;
  status: StatusFilter;
  vehicle: VehicleFilter;
  source: SourceFilter;
  q: string;
  sort: SortKey;
  dir: SortDir;
}

export interface ConfirmState {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
}

export interface ModalState {
  open: boolean;
  mode: "create" | "edit";
  ad?: AdStats;
}
