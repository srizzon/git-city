import { NextResponse } from "next/server";
import { getGitcMarket } from "@/lib/gitc-server";

/**
 * Public GITC market snapshot for the bank building's LED ticker and the
 * wallet panel. Returns `{ priceUsd, change24h }` (both nullable). No auth —
 * this is public market data. The underlying fetch is cached 30s and never
 * throws, so a transient upstream outage just yields nulls the UI handles.
 */
export async function GET() {
  const market = await getGitcMarket();
  return NextResponse.json(market, {
    headers: {
      // Allow the CDN/browser to reuse for 30s; matches the upstream cache.
      "Cache-Control": "public, max-age=30, s-maxage=30",
    },
  });
}
