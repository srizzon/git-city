import { NextResponse } from "next/server";
import { getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { readProjectInput } from "@/lib/towns/brasil-projects";
import { appealProject, editProject, getProject, removeProject, reportProject, voteProject } from "@/lib/towns/brasil-projects-server";
import { brasilLeague } from "../shared";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Ctx = { params: Promise<{ slug: string; id: string }> };

async function setup(ctx: Ctx) {
  const { slug, id } = await ctx.params;
  const league = await brasilLeague(slug);
  return { league, id, viewer: league ? await getViewer() : null };
}

// GET: a project by its slug (the id segment carries the slug here).
export async function GET(_req: Request, ctx: Ctx) {
  const { league, id, viewer } = await setup(ctx);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const p = await getProject(league.id, id, viewer);
  return p ? NextResponse.json(p) : NextResponse.json({ error: "Project not found." }, { status: 404 });
}

// PATCH { name, tagline, description, url, repo, category }: the maker edits it (screened again).
export async function PATCH(req: Request, ctx: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { league, id, viewer } = await setup(ctx);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`projects-edit:${viewer.id}`, 10, 3_600_000).ok) return NextResponse.json({ error: "Too many edits. Wait a bit." }, { status: 429 });
  const read = readProjectInput(await readJson(req));
  if ("error" in read) return NextResponse.json({ error: read.error }, { status: 400 });
  try {
    const res = await editProject(league, viewer, Number(id), read.input);
    return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res);
  } catch (err) {
    console.error("[projects] edit", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}

// DELETE: the maker takes it down.
export async function DELETE(req: Request, ctx: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { league, id, viewer } = await setup(ctx);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const error = await removeProject(league, viewer, Number(id));
  return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
}

// POST { action: "vote", on } | { action: "report", reason, note } | { action: "appeal", note }.
export async function POST(req: Request, ctx: Ctx) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  const { league, id, viewer } = await setup(ctx);
  if (!league) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const n = Number(id);
  if (!Number.isInteger(n)) return NextResponse.json({ error: "Bad project." }, { status: 400 });
  const body = await readJson(req);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  try {
    if (body.action === "vote" && typeof body.on === "boolean") {
      const res = await voteProject(league, viewer, n, body.on);
      return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json(res);
    }
    if (body.action === "report" && typeof body.reason === "string") {
      if (!rateLimit(`projects-report:${viewer.id}`, 10, 3_600_000).ok) return NextResponse.json({ error: "Too many reports. Wait a bit." }, { status: 429 });
      const error = await reportProject(league, viewer, n, body.reason, note);
      return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
    }
    if (body.action === "appeal") {
      const error = await appealProject(league, viewer, n, note);
      return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  } catch (err) {
    console.error("[projects] action", err);
    return NextResponse.json({ error: "Something went wrong. Try again." }, { status: 500 });
  }
}
