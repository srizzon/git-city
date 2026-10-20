import { NextResponse } from "next/server";
import { getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { CATEGORIES, readProjectInput } from "@/lib/towns/brasil-projects";
import { cannotPost, createProject, getCardData, listProjects, myProjects, type ListTab } from "@/lib/towns/brasil-projects-server";
import { brasilLeague } from "./shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const TABS = new Set<ListTab>(["week", "new", "all", "winners"]);

// GET ?view=card: the map's card (this week's top 3 and the ad).
// GET ?view=mine: the viewer's own projects and whether they can post.
// GET ?tab=week|new|all|winners&category=ai&uf=SP: the list.
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const league = await brasilLeague((await params).slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const viewer = await getViewer();
  if (q.get("view") === "card") return NextResponse.json(await getCardData(league.id, viewer));
  if (q.get("view") === "mine") {
    if (!viewer) return NextResponse.json({ projects: [], blocked: { code: "signed_out", error: "Sign in first." } });
    const [projects, blocked] = await Promise.all([myProjects(league.id, viewer), cannotPost(league.id, viewer)]);
    return NextResponse.json({ projects, blocked });
  }
  const tab = (q.get("tab") ?? "week") as ListTab;
  if (!TABS.has(tab)) return NextResponse.json({ error: "Bad tab." }, { status: 400 });
  const category = CATEGORIES.some((c) => c.id === q.get("category")) ? q.get("category") : null;
  const uf = /^[A-Z]{2}$/.test(q.get("uf") ?? "") ? q.get("uf") : null;
  return NextResponse.json(await listProjects(league.id, { tab, category, uf, viewerId: viewer?.id ?? null }));
}

// POST { name, tagline, description, url, repo, category }: posts a project; it comes back screened (live, review or rejected).
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const league = await brasilLeague((await params).slug);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`projects-post:${viewer.id}`, 5, 3_600_000).ok) return NextResponse.json({ error: "Too many tries. Wait a bit." }, { status: 429 });
  const read = readProjectInput(await readJson(req));
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const res = await createProject(league, viewer, read.input);
    if ("error" in res) return NextResponse.json(res, { status: 400 });
    return NextResponse.json(res);
  } catch (err) {
    console.error("[projects] post", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
