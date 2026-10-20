import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { BRASIL_SLUG } from "@/lib/towns/brasil-server";
import { normalizeUrl } from "@/lib/towns/brasil-projects";
import { adminAdSlots, adminBan, adminDecide, adminProjects, adminSaveAd, projectHealth, type AdSlotRow } from "@/lib/towns/brasil-projects-server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function requireAdmin() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user && isAdminUser(user) ? user : null;
}

// GET ?view=queue|all|ads|health (&q= to search all): the projects desk.
export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) return NextResponse.json({ error: "The Brasil town isn't set up." }, { status: 404 });
  const q = new URL(req.url).searchParams;
  const view = q.get("view") ?? "queue";
  if (view === "ads") return NextResponse.json({ slots: await adminAdSlots(league.id) });
  if (view === "health") return NextResponse.json(await projectHealth(league.id));
  return NextResponse.json({ projects: await adminProjects(league.id, view === "all" ? "all" : "queue", q.get("q") ?? "") });
}

// POST { action: approve|reject|hide|recheck|dismiss_reports, id, reason? }
//    | { action: "ban" | "unban", developerId, reason? }
//    | { action: "save_ad", slot }
export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const league = await getLeagueBySlug(BRASIL_SLUG);
  if (!league) return NextResponse.json({ error: "The Brasil town isn't set up." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = String(body.action ?? "");
  try {
    if (["approve", "reject", "hide", "recheck", "dismiss_reports"].includes(action)) {
      const error = await adminDecide(league.id, Number(body.id), action as "approve", typeof body.reason === "string" ? body.reason : undefined);
      return error ? NextResponse.json({ error }, { status: 400 }) : NextResponse.json({ ok: true });
    }
    if (action === "ban" || action === "unban") {
      await adminBan(Number(body.developerId), action === "ban", typeof body.reason === "string" ? body.reason : undefined);
      return NextResponse.json({ ok: true });
    }
    if (action === "save_ad") {
      const s = (body.slot ?? {}) as Partial<AdSlotRow>;
      const url = normalizeUrl(String(s.url ?? ""));
      if ("error" in url) return NextResponse.json({ error: url.error }, { status: 400 });
      if (!s.name?.trim() || !s.tagline?.trim() || !s.starts_at || !s.ends_at) return NextResponse.json({ error: "Name, tagline and dates are needed." }, { status: 400 });
      if (!["draft", "live", "ended"].includes(String(s.status))) return NextResponse.json({ error: "Bad status." }, { status: 400 });
      const res = await adminSaveAd(league.id, { ...s, name: s.name.trim().slice(0, 40), tagline: s.tagline.trim().slice(0, 80), url: url.url, starts_at: s.starts_at, ends_at: s.ends_at, status: s.status as AdSlotRow["status"] });
      return "error" in res ? NextResponse.json(res, { status: 400 }) : NextResponse.json({ id: res.id, flags: res.screening?.checks.filter((c) => c.verdict !== "approve").map((c) => c.reason) ?? [] });
    }
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  } catch (err) {
    console.error("[admin] projects", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
