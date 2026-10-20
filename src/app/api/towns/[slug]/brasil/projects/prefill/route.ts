import { NextResponse } from "next/server";
import { getViewer } from "@/lib/leagues/service";
import { assertSameOrigin, readJson } from "@/lib/leagues/http";
import { rateLimit } from "@/lib/rate-limit";
import { LIMITS, linkRules, normalizeUrl, repoOfUrl } from "@/lib/towns/brasil-projects";
import { fetchPage, fetchRepo } from "@/lib/towns/brasil-projects-check";
import { brasilLeague } from "../shared";

export const dynamic = "force-dynamic";

const fit = (s: string | null | undefined, n: number) => {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

// POST { url }: what the form can fill from the link (name, tagline, description, repo, icon, cover).
// Nothing is stored; a link the rules refuse says why right away.
export async function POST(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const bad = assertSameOrigin(req);
  if (bad) return bad;
  if (!(await brasilLeague((await params).slug))) return NextResponse.json({ error: "Town not found." }, { status: 404 });
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  if (!rateLimit(`projects-prefill:${viewer.id}`, 20, 600_000).ok) return NextResponse.json({ error: "Too many links. Wait a bit." }, { status: 429 });
  const body = await readJson(req);
  const n = normalizeUrl(typeof body.url === "string" ? body.url : "");
  if ("error" in n) return NextResponse.json({ error: n.error }, { status: 400 });
  const rule = linkRules(n.url, n.host);
  if (rule.verdict === "reject") return NextResponse.json({ error: rule.reason }, { status: 400 });
  const repoUrl = repoOfUrl(n.url);
  const [page, repo] = await Promise.allSettled([fetchPage(n.url), repoUrl ? fetchRepo(repoUrl, viewer.github_login) : Promise.resolve(null)]);
  const p = page.status === "fulfilled" ? page.value : null;
  const r = repo.status === "fulfilled" ? repo.value : null;
  // A repo's name is its own; a site's title often carries " | Company" or " - tagline".
  const title = r ? r.repo.split("/").pop()! : (p?.title?.split(/\s[|–—·-]\s/)[0] ?? "");
  return NextResponse.json({
    url: n.url,
    name: fit(title, LIMITS.name),
    tagline: fit(r?.description ?? p?.description ?? "", LIMITS.tagline),
    // GitHub's page description is the repo's own plus " - owner/name": the tagline already says it.
    description: fit(p?.description && !(r?.description && p.description.includes(r.description)) ? p.description : "", LIMITS.description),
    repo: r?.repo ?? null,
    icon: p?.icon ?? null,
    cover: p?.image ?? null,
    readable: !!p,
    note: page.status === "rejected" ? (page.reason instanceof Error ? page.reason.message : null) : null,
  });
}
