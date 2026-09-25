import { NextResponse } from "next/server";
import { searchTowns } from "@/lib/towns/discover";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// GET ?q=: towns by name or GitHub org. Reads the cached catalog, so a
// keystroke never reaches the database; the limit only stops scripted floods.
export async function GET(req: Request) {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  if (!rateLimit(`town-search:${ip}`, 30, 60_000).ok) {
    return NextResponse.json({ error: "Too fast." }, { status: 429 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  if (q.length > 60) return NextResponse.json({ results: [] });
  try {
    return NextResponse.json({ results: await searchTowns(q) });
  } catch (err) {
    console.error("[towns] search failed:", err);
    return NextResponse.json({ error: "Search failed." }, { status: 500 });
  }
}
