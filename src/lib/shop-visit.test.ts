import { describe, expect, it, vi } from "vitest";
import { MISSIONS_BY_ID } from "./dailies";
import { reportShopVisit, SHOP_VISIT_MISSION } from "./shop-visit";

describe("reportShopVisit", () => {
  it("posts the visit_shop mission to the progress endpoint", async () => {
    const fetchFn = vi.fn().mockResolvedValue({ ok: true });
    await reportShopVisit(fetchFn as unknown as typeof fetch);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe("/api/dailies/progress");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body)).toEqual({ mission_id: "visit_shop" });
  });

  it("sends an id that is a real one-step mission in the pool", () => {
    expect(SHOP_VISIT_MISSION).toBe("visit_shop");
    expect(MISSIONS_BY_ID.get(SHOP_VISIT_MISSION)?.threshold).toBe(1);
  });

  it("swallows a network failure", async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError("offline"));
    await expect(reportShopVisit(fetchFn as unknown as typeof fetch)).resolves.toBeUndefined();
  });
});
