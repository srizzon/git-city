import { NextRequest, NextResponse } from "next/server";
import { queryCatalog, encodeCursor, decodeCursor } from "@/lib/cosmetics/catalog";

// GET /api/cosmetics — paginated catalog for the Store.
// Query params: slot, set, season, rarity, tags(csv), q, available(0|1),
// limit, cursor(base64 of {sort_order,id}). The catalog is public.

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const tags = sp.get("tags");

  try {
    const page = await queryCatalog({
      section: sp.get("section") ?? undefined,
      slot: sp.get("slot") ?? undefined,
      set: sp.get("set") ?? undefined,
      season: sp.get("season") ?? undefined,
      rarity: sp.get("rarity") ?? undefined,
      tags: tags ? tags.split(",").filter(Boolean) : undefined,
      q: sp.get("q") ?? undefined,
      availableOnly: sp.get("available") === "1",
      limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
      cursor: decodeCursor(sp.get("cursor")),
    });

    return NextResponse.json({
      items: page.items,
      nextCursor: encodeCursor(page.nextCursor),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to query catalog" },
      { status: 500 }
    );
  }
}
