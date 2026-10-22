// ─── reel: the reels' commands ──────────────────────────────
// npm run reel -- <command> [args]
//
//   voice <script.txt> <out-dir> [--voice davi] [--at 0.4]
//        the narration (ElevenLabs, cached) → <out-dir>/vo.mp3 and voice.json (word timings).
//        One line per sentence, "[tone] text" for its audio tag; "<seconds>|[tone] text"
//        on every line places each line alone at that time.
//   mix <vo.mp3> <bed.mp3> <seconds> <out.wav> [bed volume, 0.26]
//        the voice over the music bed, ducked, faded, -14 LUFS.
//   schedule <reel.mp4> --kind main|trial --caption <caption.txt> [--cover cover.png]
//            [--at 2026-10-22T12:00] [--id <agenda id>] [--thumb <seconds>] [--hook "..."] [--watch]
//        uploads the mp4 and puts it on the agenda (at: Brasília); the reel-publish cron posts it.
//   report [from]
//        the week's report from reel_posts and reel_stats → REELS_HOME/reports/<from>.md,
//        and log.md's rows filled in with their numbers
//
// The voice settings and posting slots live in REELS_HOME/reels.config.json.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { narratorOf, readConfig } from "../config";
import { busiestHour, scheduleReel, type ReelKind } from "../schedule";
import { fillLog, weeklyReport, type PostRow, type StatRow } from "../report";
import { onlineFollowers } from "@/lib/instagram";
import { mix, narrate } from "../voice";

function home(): string {
  const h = process.env.REELS_HOME;
  if (!h || !existsSync(h)) throw new Error("REELS_HOME isn't set or doesn't exist.");
  return h;
}

const admin = () => createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

/** The positional args and the --flags (a flag with no value is "true"). */
function parse(argv: string[]): { args: string[]; flags: Record<string, string> } {
  const args: string[] = [];
  const flags: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith("--")) args.push(argv[i]);
    else if (argv[i + 1] === undefined || argv[i + 1].startsWith("--")) flags[argv[i].slice(2)] = "true";
    else flags[argv[i].slice(2)] = argv[++i];
  }
  return { args, flags };
}

const seconds = (mp4: string) =>
  Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", mp4], { encoding: "utf8" }).trim());

// ─── Commands ───────────────────────────────────────────────
async function voice(script: string, out: string, flags: Record<string, string>) {
  const lines = readFileSync(script, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => {
      const timed = /^(\d+(?:\.\d+)?)\|(.*)$/.exec(l);
      const text = timed ? timed[2].trim() : l;
      const tagged = /^\[([a-z ]+)\]\s*(.*)$/.exec(text);
      return { say: tagged ? tagged[2] : text, tone: tagged?.[1], at: timed ? Number(timed[1]) : undefined };
    });
  mkdirSync(out, { recursive: true });
  const w = await narrate(lines, Number(flags.at ?? 0.4), narratorOf(readConfig(home()), flags.voice), path.join(home(), ".cache", "tts"), path.join(out, "vo.mp3"));
  writeFileSync(path.join(out, "voice.json"), JSON.stringify(w));
  console.log(`  ${w.length} words, last at ${w[w.length - 1][2].toFixed(2)}s → ${path.join(out, "vo.mp3")}, voice.json`);
}

async function schedule(mp4: string, flags: Record<string, string>) {
  const kind = flags.kind as ReelKind;
  if (kind !== "main" && kind !== "trial") throw new Error("--kind main or --kind trial.");
  if (!flags.caption) throw new Error("--caption <caption.txt>.");
  const length = seconds(mp4);
  const when = await scheduleReel({
    sb: admin(),
    config: readConfig(home()),
    busiest: busiestHour(await onlineFollowers()),
    // A video's folder (videos/<date>-<slug>/) names it: every folder's file is reel.mp4.
    id: flags.id ?? path.basename(path.dirname(path.resolve(mp4))),
    kind,
    caption: readFileSync(flags.caption, "utf8").trim(),
    video: mp4,
    cover: flags.cover ?? null,
    thumbAt: flags.thumb ? Number(flags.thumb) : Math.max(0, length - 1),
    lengthS: length,
    hook: flags.hook,
    watch: flags.watch === "true",
    at: flags.at,
  });
  console.log(`  scheduled for ${when.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} (Brasília)`);
}

async function weekReport(from?: string) {
  const start = from ?? new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
  const sb = admin();
  const { data: posts, error } = await sb.from("reel_posts").select("*").gte("posted_at", `${start}T00:00:00Z`).returns<PostRow[]>();
  if (error) throw new Error(`reel_posts: ${error.message}`);
  const ids = (posts ?? []).map((p) => p.media_id);
  const { data: stats } = ids.length ? await sb.from("reel_stats").select("*").in("media_id", ids).returns<StatRow[]>() : { data: [] as StatRow[] };
  const md = weeklyReport(start, posts ?? [], stats ?? []);
  mkdirSync(path.join(home(), "reports"), { recursive: true });
  writeFileSync(path.join(home(), "reports", `${start}.md`), md + "\n");
  const log = path.join(home(), "log.md");
  if (existsSync(log)) writeFileSync(log, fillLog(readFileSync(log, "utf8"), posts ?? [], stats ?? []));
  console.log(md);
  console.log(`\n→ ${path.join(home(), "reports", `${start}.md`)}`);
}

const [cmd, ...rest] = process.argv.slice(2);
const { args, flags } = parse(rest);
const commands: Record<string, () => Promise<unknown> | unknown> = {
  voice: () => voice(args[0], args[1], flags),
  mix: () => mix(args[0], args[1], Number(args[2]), args[3], Number(args[4] ?? 0.26)),
  schedule: () => schedule(args[0], flags),
  report: () => weekReport(args[0]),
};
if (!cmd || !commands[cmd]) {
  console.log(readFileSync(new URL(import.meta.url), "utf8").split("\n").slice(1, 18).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  process.exit(cmd ? 1 : 0);
}
Promise.resolve(commands[cmd]()).catch((e) => {
  console.error(`✗ ${(e as Error).message}`);
  process.exit(1);
});
