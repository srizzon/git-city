// ─── reel: the reel factory's commands ──────────────────────
// npm run reel -- <command> [args]
//
//   facts [date]        the day's numbers from prod → days/<date>/facts.json
//   check <id>          the text rules (before any voice is spent)
//   draft <id>          voice (cached) → mix → 360x640 4 fps export → contact sheet → checks
//   final <id>          1080x1920 30 fps export → sheet → caption.txt → archive folder → log.md row
//   cover <id>          the main reel's grid cover (Codex image, ~1.5 min of quota) → cover.png
//   schedule <id> [at]  uploads the final and puts it on the agenda (at: "2026-10-20T12:00", Brasília)
//   batch <date>        every reel of the day whose state asks for a job, one at a time
//   worker              runs what the studio queues, one job at a time, until stopped
//   status [date]       each reel of the day and where it is
//
// A reel is days/<date>/<slot>/spec.json under REELS_HOME (an id is
// <date>-<slot>). One export at a time: a lock file holds the one headless
// Chrome. The studio (a dev server at the config's studioUrl) must be up for
// draft and final.

import { execFileSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, unlinkSync, writeFileSync, appendFileSync, copyFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import type { Word } from "@trailer-kit/narration";
import { BRASIL_SCENES } from "@/components/reel/brasil/scenes";
import { BAY_SCENES } from "@/components/reel/bay/scenes";
import { checkPicture, checkText, checkTimed, type FrameReport, type Issue } from "../check";
import { readConfig, type ReelsConfig } from "../config";
import { computeFacts, loadFactsInput } from "../facts";
import { reelOf } from "../film";
import { filled, ReelSpec, specDir } from "../spec";
import { isAtLeast, readStatus, setError, setState, writeStatus } from "../status";
import { BUCKET } from "../publish";
import { mix, narrate } from "../voice";
import { anchorAt } from "@trailer-kit/narration";

const ROOT = process.cwd();
const EXPORT = path.join(ROOT, ".claude/skills/gg/kit/tools/export.mjs");
const SCENES: Record<string, readonly string[]> = { brasil: BRASIL_SCENES, bay: BAY_SCENES };

function home(): string {
  const h = process.env.REELS_HOME;
  if (!h || !existsSync(h)) throw new Error("REELS_HOME isn't set or doesn't exist.");
  return h;
}

const dirOf = (id: string) => path.join(home(), specDir(id).rel);
const brt = (d = new Date()) => new Date(d.getTime() - 3 * 3600_000).toISOString().slice(0, 10);

function loadSpec(id: string): ReelSpec {
  const file = path.join(dirOf(id), "spec.json");
  if (!existsSync(file)) throw new Error(`No reel ${id} (${file}).`);
  return ReelSpec.parse(JSON.parse(readFileSync(file, "utf8")));
}

/** Every reel id under days/, oldest first. */
function allIds(): string[] {
  const days = path.join(home(), "days");
  if (!existsSync(days)) return [];
  return readdirSync(days)
    .sort()
    .flatMap((d) => (existsSync(path.join(days, d)) ? readdirSync(path.join(days, d)).filter((s) => existsSync(path.join(days, d, s, "spec.json"))).map((s) => `${d}-${s}`) : []));
}

function mainOf(spec: ReelSpec): ReelSpec | null {
  if (spec.kind === "main") return null;
  const date = specDir(spec.id).date;
  const main = allIds().filter((id) => id.startsWith(date)).map(loadSpec).find((s) => s.kind === "main");
  return main ?? null;
}

const words = (id: string): Word[] | null => {
  const f = path.join(dirOf(id), "voice.json");
  return existsSync(f) ? (JSON.parse(readFileSync(f, "utf8")) as Word[]) : null;
};

/** Prints the issues (each once); true when none fails. */
function report(issues: Issue[]): boolean {
  for (const line of new Set(issues.map((i) => `  ${i.level === "fail" ? "✗" : "!"} ${i.rule}: ${i.message}`))) console.log(line);
  return !issues.some((i) => i.level === "fail");
}

function textIssues(spec: ReelSpec, config: ReelsConfig): Issue[] {
  const priorHooks = allIds()
    .filter((id) => id !== spec.id)
    .map((id) => loadSpec(id).lines[0].show.replace(/\*/g, ""));
  return checkText(spec, {
    scenes: SCENES[spec.world.type] ?? [],
    priorHooks,
    main: mainOf(spec),
    verifiedHandles: config.verifiedHandles.map((h) => h.toLowerCase()),
  });
}

// ─── One export at a time ───────────────────────────────────
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const lock = path.join(home(), ".lock");
  if (existsSync(lock)) {
    const pid = Number(readFileSync(lock, "utf8"));
    let alive = false;
    try {
      process.kill(pid, 0);
      alive = true;
    } catch {
      alive = false;
    }
    if (alive) throw new Error(`Another export is running (pid ${pid}). One headless Chrome at a time.`);
  }
  writeFileSync(lock, String(process.pid));
  return fn().finally(() => existsSync(lock) && unlinkSync(lock));
}

function run(cmd: string, args: string[]): Promise<void> {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: "inherit" });
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`${path.basename(cmd)} exited ${code}`))));
  });
}

async function studioUp(config: ReelsConfig) {
  try {
    // Any answer will do (a 404 is quick; the home page compiles the whole city first).
    await fetch(`${config.studioUrl}/api/reels/file/.ping`, { signal: AbortSignal.timeout(30000) });
  } catch {
    throw new Error(`The studio isn't up at ${config.studioUrl}: npm run reel:studio`);
  }
}

function sheet(mp4: string, out: string) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-i", mp4, "-vf", "fps=1.5,scale=180:-1,tile=8x4", "-frames:v", "1", out]);
}

// ─── Commands ───────────────────────────────────────────────
async function facts(date = brt()) {
  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
  const f = computeFacts(await loadFactsInput(sb, Date.now()));
  const dir = path.join(home(), "days", date);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "facts.json"), JSON.stringify(f, null, 2));
  console.log(`${f.total} devs (${f.new24h} in 24h), island ${f.island}, ${f.statesWithFounder} states founded`);
  console.log(`closest: ${f.gaps.slice(0, 3).map((g) => `${g.ahead} ${g.gap} ahead of ${g.behind}`).join(" · ")}`);
  console.log(`→ ${path.join(dir, "facts.json")}`);
}

async function check(id: string) {
  const config = readConfig(home());
  const spec = loadSpec(id);
  let ok = report(textIssues(spec, config));
  const w = words(id);
  if (w) {
    const main = mainOf(spec);
    const mainWords = main ? words(main.id) : null;
    ok = report(checkTimed(spec, w, main && mainWords ? reelOf(filled(main), mainWords, null).length : undefined)) && ok;
  }
  console.log(ok ? "  ✓ no rule fails" : "  ✗ fails");
  if (!ok) process.exitCode = 1;
  return ok;
}

async function voice(id: string, config: ReelsConfig) {
  const spec = filled(loadSpec(id));
  const dir = dirOf(id);
  const lines = spec.lines.map((l) => ({ say: l.say ?? l.show.replace(/\*/g, ""), at: l.at }));
  const w = await narrate(lines, spec.voiceAt, config.voice, path.join(home(), ".cache", "tts"), path.join(dir, "vo.mp3"));
  writeFileSync(path.join(dir, "voice.json"), JSON.stringify(w));
  const reel = reelOf(spec, w, null);
  const bed = path.join(home(), config.beds, spec.bed);
  if (!existsSync(bed)) throw new Error(`No bed ${bed}.`);
  mix(path.join(dir, "vo.mp3"), bed, reel.length, path.join(dir, "mix.wav"), spec.bedVolume);
  console.log(`  voice ${reel.length.toFixed(1)}s, ${w.length} words → vo.mp3, mix.wav`);
}

async function draft(id: string) {
  const config = readConfig(home());
  const dir = dirOf(id);
  try {
    if (!report(textIssues(loadSpec(id), config))) throw new Error("The text rules failed.");
    await voice(id, config);
    if (!(await check(id))) throw new Error("The timing rules failed.");
    await studioUp(config);
    await withLock(() =>
      run("node", [EXPORT, `${config.studioUrl}/reels/${id}/studio`, "--size", "360x640", "--fps", "4", "--no-poster-frame", "--out", path.join(dir, "draft.mp4"), "--report", path.join(dir, "report.json")]),
    );
    sheet(path.join(dir, "draft.mp4"), path.join(dir, "sheet.jpg"));
    const frames = (JSON.parse(readFileSync(path.join(dir, "report.json"), "utf8")) as (FrameReport | null)[]).filter((f): f is FrameReport => !!f);
    const picture = checkPicture(frames);
    report(picture);
    writeFileSync(path.join(dir, "checks.json"), JSON.stringify(picture, null, 2));
    setState(dir, "draft");
    console.log(`→ ${path.join(dir, "draft.mp4")}\n  ${path.join(dir, "sheet.jpg")}`);
  } catch (e) {
    setError(dir, "draft", (e as Error).message);
    throw e;
  }
}

/** The next archive number: one past the highest NN- folder. */
function nextNumber(): string {
  const n = readdirSync(home())
    .map((d) => /^(\d{2})-/.exec(d)?.[1])
    .filter(Boolean)
    .map(Number);
  return String((n.length ? Math.max(...n) : 0) + 1).padStart(2, "0");
}

async function final(id: string) {
  const config = readConfig(home());
  const dir = dirOf(id);
  const spec = filled(loadSpec(id));
  try {
    if (!isAtLeast(readStatus(dir).state, "draft_ok")) throw new Error(`${id} isn't approved as a draft yet.`);
    const w = words(id);
    if (!w) throw new Error("No voice: run draft first.");
    const reel = reelOf(spec, w, null);
    const poster = spec.post.thumbAt !== undefined ? anchorAt(w, spec.post.thumbAt) : reel.length - 1;
    await studioUp(config);
    await withLock(() =>
      run("node", [EXPORT, `${config.studioUrl}/reels/${id}/studio`, "--size", "1080x1920", "--fps", "30", "--no-poster-frame", "--poster", String(poster), "--out", path.join(dir, "final.mp4")]),
    );
    sheet(path.join(dir, "final.mp4"), path.join(dir, "sheet-final.jpg"));
    writeFileSync(path.join(dir, "caption.txt"), spec.post.caption + "\n");
    // The archive: one numbered folder per reel, and its row in log.md.
    const folder = `${nextNumber()}-${id}`;
    const out = path.join(home(), folder);
    mkdirSync(out, { recursive: true });
    for (const [from, to] of [["final.mp4", "reel.mp4"], ["final.jpg", "poster.jpg"], ["caption.txt", "caption.txt"], ["vo.mp3", "vo.mp3"], ["voice.json", "vo-words.json"], ["spec.json", "spec.json"]])
      if (existsSync(path.join(dir, from))) copyFileSync(path.join(dir, from), path.join(out, to));
    const hook = spec.lines[0].show.replace(/\*/g, "");
    appendFileSync(path.join(home(), "log.md"), `| ${folder.slice(0, 2)} | ${specDir(id).date} | ${spec.preset ?? "?"} (${spec.kind}); hook "${hook}" | ${folder} | not yet | | ${reel.length.toFixed(1)}s, bed ${spec.bed} |\n`);
    setState(dir, "final");
    console.log(`→ ${path.join(out, "reel.mp4")}\n  ${path.join(dir, "sheet-final.jpg")}`);
  } catch (e) {
    setError(dir, "final", (e as Error).message);
    throw e;
  }
}

const BRT = "-03:00";

/** Where a reel goes on the agenda: the main at its slot, each trial its gap after; never in the past, never within the hour of another. */
async function slotFor(spec: ReelSpec, config: ReelsConfig, taken: number[], at?: string): Promise<Date> {
  if (at) return new Date(`${at}${BRT}`);
  const { date, slot } = specDir(spec.id);
  const trials = allIds().filter((id) => id.startsWith(date)).map(loadSpec).filter((s) => s.kind === "trial").map((s) => specDir(s.id).slot).sort();
  const base = new Date(`${date}T${config.slots.main}:00${BRT}`).getTime();
  const step = config.slots.trialGapHours * 3_600_000;
  let t = spec.kind === "main" ? base : base + (trials.indexOf(slot) + 1) * step;
  const soonest = Date.now() + 10 * 60_000;
  while (t < soonest || taken.some((x) => Math.abs(x - t) < 3_600_000)) t += t < soonest ? Math.ceil((soonest - t) / 1_800_000) * 1_800_000 : 1_800_000;
  return new Date(t);
}

async function schedule(id: string, at?: string) {
  const config = readConfig(home());
  const dir = dirOf(id);
  const spec = filled(loadSpec(id));
  try {
    if (readStatus(dir).state !== "final") throw new Error(`${id} isn't a finished reel (state ${readStatus(dir).state}).`);
    if (!existsSync(path.join(dir, "final.mp4"))) throw new Error("No final.mp4.");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });
    const { data: rows } = await sb.from("reel_schedule").select("spec_id, scheduled_at").in("status", ["scheduled", "publishing"]);
    const when = await slotFor(spec, config, (rows ?? []).filter((r) => r.spec_id !== id).map((r) => Date.parse(r.scheduled_at)), at);
    const key = `${id}/${crypto.randomUUID()}`;
    const upload = async (file: string, type: string) => {
      const p = `${key}-${file}`;
      const { error } = await sb.storage.from(BUCKET).upload(p, readFileSync(path.join(dir, file)), { contentType: type, upsert: true });
      if (error) throw new Error(`upload ${file}: ${error.message}`);
      return p;
    };
    const video = await upload("final.mp4", "video/mp4");
    const cover = spec.kind === "main" && existsSync(path.join(dir, "cover.png")) ? await upload("cover.png", "image/png") : null;
    const w = words(id)!;
    const reel = reelOf(spec, w, null);
    const thumb = spec.post.thumbAt !== undefined ? anchorAt(w, spec.post.thumbAt) : reel.length - 1;
    const { error } = await sb.from("reel_schedule").upsert(
      {
        spec_id: id,
        kind: spec.kind,
        caption: spec.post.caption,
        video_path: video,
        cover_path: cover,
        thumb_offset_ms: Math.round(thumb * 1000),
        scheduled_at: when.toISOString(),
        status: "scheduled",
        attempts: 0,
        error: null,
        container_id: null,
        meta: {
          preset: spec.preset,
          hook: spec.lines[0].show.replace(/\*/g, ""),
          opening_scene: spec.scenes[0].scene,
          length_s: Math.round(reel.length * 100) / 100,
          bed: spec.bed,
          cta: spec.header.cta.map((l) => l.text.replace(/\*/g, "")).join(" "),
          watch: spec.post.watch,
        },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "spec_id" },
    );
    if (error) throw new Error(`agenda: ${error.message}`);
    if (spec.kind === "main" && !cover) console.log("  ! no cover.png: the main reel goes out with its frame as the cover (npm run reel -- cover <id> first)");
    setState(dir, "scheduled");
    console.log(`  scheduled for ${when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`);
  } catch (e) {
    setError(dir, "schedule", (e as Error).message);
    throw e;
  }
}

const VIDEO_EDITOR = path.join(process.env.HOME ?? "", "orca/projects/video-editor");

/** The main reel's cover in the channel's style: its prompt into covers.json, one igcover run, the result as cover.png. */
async function cover(id: string) {
  const spec = loadSpec(id);
  if (spec.kind !== "main") throw new Error("Trials have no cover.");
  if (!spec.post.cover) throw new Error("The spec has no post.cover.prompt (approved with the script).");
  const file = path.join(VIDEO_EDITOR, "channels/samuelrizzondev/brand/instagram/covers.json");
  const covers = JSON.parse(readFileSync(file, "utf8")) as { covers: { id: string; reel?: string; ref?: string; prompt: string }[] };
  const ref = covers.covers.find((c) => c.ref)?.ref;
  const entry = { id, reel: `Git City reel ${id}: ${spec.lines[0].show.replace(/\*/g, "")}`, ...(ref ? { ref } : {}), prompt: spec.post.cover.prompt };
  covers.covers = [...covers.covers.filter((c) => c.id !== id), entry];
  writeFileSync(file, JSON.stringify(covers, null, 2) + "\n");
  await run("uv", ["run", "--python", "3.13", "--with", "pillow", "--directory", VIDEO_EDITOR, "scripts/igcover.py", "samuelrizzondev", id]);
  copyFileSync(path.join(VIDEO_EDITOR, `channels/samuelrizzondev/brand/instagram/out/cover-${id}.png`), path.join(dirOf(id), "cover.png"));
  console.log(`→ ${path.join(dirOf(id), "cover.png")}`);
}

/** The job a reel's state asks for (the studio's buttons set the states and queue). */
type Job = "draft" | "final" | "schedule";
function jobFor(id: string): Job | null {
  const s = readStatus(dirOf(id));
  return s.queued === "draft" || s.queued === "final" || s.queued === "schedule" ? s.queued : null;
}

async function runJob(id: string, job: Job) {
  const dir = dirOf(id);
  console.log(`\n${job} ${id}`);
  try {
    await (job === "draft" ? draft(id) : job === "final" ? final(id) : schedule(id));
    writeStatus(dir, { ...readStatus(dir), queued: null });
  } catch (e) {
    console.error(`  ✗ ${(e as Error).message}`);
  }
}

async function batch(date: string) {
  for (const id of allIds().filter((x) => x.startsWith(date))) {
    const job = jobFor(id);
    if (job) await runJob(id, job);
  }
}

async function worker() {
  console.log("reel worker: running the studio's queue, one job at a time (Ctrl-C to stop)");
  for (;;) {
    const next = allIds().map((id) => [id, jobFor(id)] as const).find(([, j]) => j);
    if (next) await runJob(next[0], next[1]!);
    else await new Promise((r) => setTimeout(r, 3000));
  }
}

function status(date?: string) {
  for (const id of allIds().filter((x) => !date || x.startsWith(date))) {
    const s = readStatus(dirOf(id));
    const spec = loadSpec(id);
    console.log(`${id.padEnd(28)} ${spec.kind.padEnd(5)} ${s.state.padEnd(10)}${s.queued ? ` queued:${s.queued}` : ""}${s.error ? ` ✗ ${s.error.job}: ${s.error.message}` : ""}`);
  }
}

const [cmd, arg] = process.argv.slice(2);
const commands: Record<string, () => Promise<unknown> | unknown> = {
  facts: () => facts(arg),
  check: () => check(arg),
  draft: () => draft(arg),
  final: () => final(arg),
  cover: () => cover(arg),
  schedule: () => schedule(arg, process.argv[4]),
  batch: () => batch(arg ?? brt()),
  worker: () => worker(),
  status: () => status(arg),
};
if (!cmd || !commands[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 13).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
