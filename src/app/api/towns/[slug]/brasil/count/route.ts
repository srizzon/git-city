import { NextResponse } from "next/server";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getCount } from "@/lib/towns/brasil-election-server";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";

export const dynamic = "force-dynamic";

// GET: the presidential count as it stands (the live-count page reads it every few seconds).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  if (!PRESIDENCY_ON) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const league = await getLeagueBySlug((await params).slug);
  if (league?.map !== "brasil") return NextResponse.json({ error: "Not found." }, { status: 404 });
  return NextResponse.json(await getCount(league.id), { headers: { "Cache-Control": "no-store" } });
}
