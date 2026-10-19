import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { NextResponse } from "next/server";
import { inHome } from "@/lib/reel/home";
import { ReelSpec, specDir } from "@/lib/reel/spec";
import { readStatus, setState, writeStatus } from "@/lib/reel/status";
import { readConfig } from "@/lib/reel/config";
import { busiestHour, scheduleReel } from "@/lib/reel/schedule";
import { getSupabaseAdmin } from "@/lib/supabase";
import { onlineFollowers } from "@/lib/instagram";

// The review studio's buttons (dev only). They change a reel's state and
// queue its next job; `npm run reel worker` runs the jobs, one at a time.
//
// POST { action: "approve_script" }       → script_ok, queues the draft
// POST { action: "approve_draft" }        → draft_ok, queues the final (and the main reel's cover after it)
// POST { action: "schedule" }             → uploads the final and puts it on the agenda (the cron posts it at its slot)
// POST { action: "note", text }           → appends to notes.md
// POST { action: "edit", lines }          → new lines; back to script (the voice is stale)
// POST { action: "cancel" }               → drops a queued job

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dir = inHome(specDir(id).rel);
  if (!dir || !existsSync(path.join(dir, "spec.json"))) return NextResponse.json({ error: "No such reel." }, { status: 404 });
  const body = (await req.json().catch(() => ({}))) as { action?: string; text?: string; lines?: { show: string; say?: string }[] };
  const status = readStatus(dir);

  if (body.action === "approve_script") {
    setState(dir, "script_ok");
    writeStatus(dir, { ...readStatus(dir), queued: "draft" });
  } else if (body.action === "approve_draft") {
    if (status.state !== "draft") return NextResponse.json({ error: "There's no draft to approve." }, { status: 400 });
    const spec = ReelSpec.parse(JSON.parse(readFileSync(path.join(dir, "spec.json"), "utf8")));
    if (spec.kind === "main" && !spec.post.cover) return NextResponse.json({ error: "The main reel needs its cover's prompt (post.cover) before the final." }, { status: 400 });
    setState(dir, "draft_ok");
    writeStatus(dir, { ...readStatus(dir), queued: "final" });
  } else if (body.action === "schedule") {
    if (status.state !== "final") return NextResponse.json({ error: "Only a finished reel can be scheduled." }, { status: 400 });
    const home = inHome("")!;
    try {
      const when = await scheduleReel({ home, id, sb: getSupabaseAdmin(), config: readConfig(home), busiest: busiestHour(await onlineFollowers()) });
      return NextResponse.json({ ok: true, at: when.toISOString(), status: readStatus(dir) });
    } catch (e) {
      return NextResponse.json({ error: (e as Error).message }, { status: 500 });
    }
  } else if (body.action === "note") {
    const text = body.text?.trim();
    if (!text) return NextResponse.json({ error: "Empty note." }, { status: 400 });
    appendFileSync(path.join(dir, "notes.md"), `- ${new Date().toISOString().slice(0, 16).replace("T", " ")} · ${text}\n`);
  } else if (body.action === "edit") {
    const spec = ReelSpec.parse(JSON.parse(readFileSync(path.join(dir, "spec.json"), "utf8")));
    const lines = body.lines ?? [];
    if (lines.length !== spec.lines.length || lines.some((l) => !l.show?.trim()))
      return NextResponse.json({ error: "Every line needs its text." }, { status: 400 });
    const next = { ...spec, lines: spec.lines.map((l, i) => ({ ...l, show: lines[i].show.trim(), ...(lines[i].say?.trim() ? { say: lines[i].say!.trim() } : {}) })) };
    writeFileSync(path.join(dir, "spec.json"), JSON.stringify(ReelSpec.parse(next), null, 2));
    setState(dir, "script");
  } else if (body.action === "cancel") {
    writeStatus(dir, { ...status, queued: null });
  } else {
    return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  }
  return NextResponse.json({ ok: true, status: readStatus(dir) });
}
