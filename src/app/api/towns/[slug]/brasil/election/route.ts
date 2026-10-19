import { NextResponse } from "next/server";
import { getLeagueBySlug, getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { castVote, getElection, setRunning } from "@/lib/towns/brasil-election-server";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";

export const dynamic = "force-dynamic";

async function brasil(slug: string) {
  if (!PRESIDENCY_ON) return null;
  const league = await getLeagueBySlug(slug);
  return league?.map === "brasil" ? league : null;
}

// GET: the presidential race as the viewer sees it (candidates, live count, their vote).
export async function GET(_req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const league = await brasil((await params).slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  return NextResponse.json(await getElection(league.id, await getViewer()));
}

// POST { action: "run" | "withdraw" } | { action: "vote", number: 24 | null }: the signed-in dev runs, stops running, or votes (null: blank).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const league = await brasil((await params).slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const body = await readJson(req);
  try {
    let error: string | null = null;
    if (body.action === "run" || body.action === "withdraw") error = await setRunning(league.id, viewer, body.action === "run");
    else if (body.action === "vote" && (body.number === null || (typeof body.number === "number" && Number.isInteger(body.number) && body.number >= 10 && body.number <= 99))) error = await castVote(league.id, viewer, body.number);
    else return NextResponse.json({ error: "Bad request." }, { status: 400 });
    if (error) return NextResponse.json({ error }, { status: 400 });
    return NextResponse.json(await getElection(league.id, viewer));
  } catch (err) {
    console.error("[brasil] election", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
