// Client-side report of a shop visit for the "Window shopper" daily. Goes through
// the existing progress endpoint, which checks auth, a claimed building and that
// the mission is assigned today. Fire-and-forget: a failure never reaches the UI.
export const SHOP_VISIT_MISSION = "visit_shop";

export async function reportShopVisit(fetchFn: typeof fetch = fetch): Promise<void> {
  try {
    await fetchFn("/api/dailies/progress", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mission_id: SHOP_VISIT_MISSION }),
    });
  } catch {}
}
