import { type NextRequest, NextResponse } from "next/server";
import { fetchZeroxSwap, is0xEnabled } from "@/lib/gitc-server";

/**
 * Firm quote for a USDC|ETH → GITC swap on Base (0x Swap API v2). Returns a
 * ready-to-send transaction (`transaction.{to,data,value}`) plus any allowance
 * the taker must grant first (`issues.allowance.{actual,spender}`). Requires a
 * `taker` (connected wallet). `{ disabled: true }` when no 0x key is set.
 */
export async function GET(req: NextRequest) {
  if (!is0xEnabled()) return NextResponse.json({ disabled: true });

  const sp = req.nextUrl.searchParams;
  const result = await fetchZeroxSwap("quote", {
    sellToken: sp.get("sellToken") ?? "",
    sellAmount: sp.get("sellAmount") ?? "",
    taker: sp.get("taker") ?? undefined,
    slippageBps: sp.get("slippageBps") ?? undefined,
  });

  if (!result.ok) {
    if (result.error === "disabled") return NextResponse.json({ disabled: true });
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
