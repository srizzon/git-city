import { NextResponse } from "next/server";
import { clickAd, visitProject } from "@/lib/towns/brasil-projects-server";

export const dynamic = "force-dynamic";

// GET ?p=<project id> | ?ad=<slot id>: the click-through. Counts the visit,
// re-checks the link with Safe Browsing, then sends the browser on. A link
// that's no longer up lands back on the map.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const q = new URL(req.url).searchParams;
  const p = Number(q.get("p"));
  const ad = Number(q.get("ad"));
  const to = Number.isInteger(p) && p > 0 ? await visitProject(p) : Number.isInteger(ad) && ad > 0 ? await clickAd(ad) : null;
  const res = NextResponse.redirect(to ?? new URL(`/town/${encodeURIComponent(slug)}`, req.url), 302);
  res.headers.set("Referrer-Policy", "origin");
  res.headers.set("Cache-Control", "no-store");
  return res;
}
