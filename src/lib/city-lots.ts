import "server-only";
import type { getSupabaseAdmin } from "@/lib/supabase";
import type { CityLot } from "@/lib/github";

type Admin = ReturnType<typeof getSupabaseAdmin>;

interface AssignedLotRow {
  lot_id: number;
  x: number;
  z: number;
  max_w: number;
  max_d: number;
  downtown: boolean;
  evicted_id: number | null;
}

/**
 * Gives a developer a lot if they have none (assign_city_lot, migration 146):
 * the closest free lot, else the outermost unclaimed building's. Returns the
 * lot, or null when there is none to give (every lot claimed, or no lots yet).
 * Never throws: a failed assignment must not break the login it runs in.
 */
export async function assignCityLot(sb: Admin, devId: number): Promise<CityLot | null> {
  const { data, error } = await sb.rpc("assign_city_lot", { p_dev_id: devId });
  if (error) {
    console.error("assign_city_lot failed:", error.message);
    return null;
  }
  const row = (data as AssignedLotRow[] | null)?.[0];
  return row ? { x: row.x, z: row.z, w: row.max_w, d: row.max_d, downtown: row.downtown } : null;
}

/** A developer's current lot, or null. */
export async function getCityLot(sb: Admin, devId: number): Promise<CityLot | null> {
  const { data } = await sb
    .from("city_lots")
    .select("x, z, max_w, max_d, downtown")
    .eq("developer_id", devId)
    .maybeSingle();
  return data ? { x: data.x, z: data.z, w: data.max_w, d: data.max_d, downtown: data.downtown } : null;
}
