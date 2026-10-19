// ─── The weekly reels report ────────────────────────────────
// What each posted reel did (reel_posts + the reel-insights cron's latest
// reel_stats), and what the trials taught: on each day, every trial against
// the day's other trials on the numbers a hook moves (skipped in the first
// 3s, views per account reached), and the formats ranked by the devs they put on
// the map per 1k views. Pure: the CLI loads the rows and writes the file.

export interface PostRow {
  media_id: string;
  spec_id: string;
  kind: "main" | "trial";
  permalink: string | null;
  preset: string | null;
  hook: string | null;
  opening_scene: string | null;
  length_s: number | null;
  bed: string | null;
  graduated: boolean;
  posted_at: string;
}

export interface StatRow {
  media_id: string;
  taken_at: string;
  views: number | null;
  reach: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  saved: number | null;
  avg_watch_ms: number | null;
  skip_rate: number | null;
  devs_placed: number | null;
}

const n = (v: number | null | undefined) => (v == null ? "–" : v.toLocaleString("en-US"));
const per = (a: number | null, b: number | null) => (a == null || !b ? null : a / b);

/** The snapshot nearest to `hours` after the post, among those taken. */
export function statAt(stats: readonly StatRow[], post: PostRow, hours: number): StatRow | null {
  const want = Date.parse(post.posted_at) + hours * 3_600_000;
  let best: StatRow | null = null;
  for (const s of stats) {
    if (s.media_id !== post.media_id) continue;
    if (!best || Math.abs(Date.parse(s.taken_at) - want) < Math.abs(Date.parse(best.taken_at) - want)) best = s;
  }
  return best;
}

/** The report for the posts from `from` (ISO date) on, as markdown. */
export function weeklyReport(from: string, posts: readonly PostRow[], stats: readonly StatRow[]): string {
  const rows = posts.map((p) => ({ p, s: statAt(stats, p, 48) })).sort((a, b) => a.p.posted_at.localeCompare(b.p.posted_at));
  const out: string[] = [`# Reels, week of ${from}`, ""];
  if (!rows.length) return [...out, "No reels posted this week."].join("\n");

  const views = rows.reduce((t, r) => t + (r.s?.views ?? 0), 0);
  const devs = rows.reduce((t, r) => t + (r.s?.devs_placed ?? 0), 0);
  out.push(`${rows.length} reels, ${n(views)} views, ${n(devs)} devs put on the map (numbers at 48h, or the latest).`, "");

  out.push("| Posted | Kind | Format | Hook | Length | Bed | Views | Reach | Skipped 3s | Avg watch | Shares | Saves | New devs |");
  out.push("|---|---|---|---|---|---|---|---|---|---|---|---|---|");
  for (const { p, s } of rows) {
    const kind = p.kind === "trial" ? `trial${p.graduated ? " (graduated)" : ""}` : "main";
    out.push(
      `| ${p.posted_at.slice(5, 16).replace("T", " ")} | ${kind} | ${p.preset ?? "–"} | ${p.hook ?? "–"} | ${p.length_s ?? "–"}s | ${p.bed ?? "–"} | ${n(s?.views)} | ${n(s?.reach)} | ${s?.skip_rate == null ? "–" : `${s.skip_rate}%`} | ${s?.avg_watch_ms == null ? "–" : `${(s.avg_watch_ms / 1000).toFixed(1)}s`} | ${n(s?.shares)} | ${n(s?.saved)} | ${n(s?.devs_placed)} |`,
    );
  }

  // Each day's trials against each other: they all go to non-followers, the main mostly to followers,
  // so the trials compare among themselves; a variation changed one thing (preset "trial:<what>").
  out.push("", "## Trials", "");
  const byDay = new Map<string, typeof rows>();
  for (const r of rows) {
    const day = r.p.spec_id.slice(0, 10);
    byDay.set(day, [...(byDay.get(day) ?? []), r]);
  }
  let any = false;
  for (const [day, list] of byDay) {
    const trials = list.filter((r) => r.p.kind === "trial" && r.s?.skip_rate != null).sort((a, b) => a.s!.skip_rate! - b.s!.skip_rate!);
    if (!trials.length) continue;
    any = true;
    const main = list.find((r) => r.p.kind === "main");
    out.push(`${day}${main ? ` (main: "${main.p.hook}", ${main.s?.skip_rate ?? "–"}% skipped, to its own audience)` : ""}:`);
    trials.forEach((t, i) => {
      const what = t.p.preset?.startsWith("trial:") ? `${t.p.preset.slice(6)}: ` : "";
      const vr = per(t.s!.views, t.s!.reach);
      out.push(
        `${i + 1}. ${what}"${t.p.hook}": ${t.s!.skip_rate}% skipped in 3s, ${t.s!.avg_watch_ms == null ? "–" : `${(t.s!.avg_watch_ms / 1000).toFixed(1)}s`} avg watch, ${vr == null ? "–" : vr.toFixed(2)} views per account reached${t.p.graduated ? ", graduated" : ""}.`,
      );
    });
  }
  if (!any) out.push("No trial has numbers yet.");

  // Formats by what they bring: devs on the map per 1k views (two posts or more to count). Mains only:
  // a trial's format is its main's.
  out.push("", "## Formats", "");
  const byPreset = new Map<string, { posts: number; views: number; devs: number; skip: number[] }>();
  for (const { p, s } of rows.filter((r) => r.p.kind === "main")) {
    const k = p.preset ?? "–";
    const f = byPreset.get(k) ?? { posts: 0, views: 0, devs: 0, skip: [] };
    f.posts++;
    f.views += s?.views ?? 0;
    f.devs += s?.devs_placed ?? 0;
    if (s?.skip_rate != null) f.skip.push(s.skip_rate);
    byPreset.set(k, f);
  }
  const ranked = [...byPreset].sort((a, b) => b[1].devs / Math.max(1, b[1].views) - a[1].devs / Math.max(1, a[1].views));
  out.push("| Format | Posts | Views | New devs per 1k views | Avg skipped 3s |", "|---|---|---|---|---|");
  for (const [k, f] of ranked)
    out.push(`| ${k} | ${f.posts} | ${n(f.views)} | ${((f.devs / Math.max(1, f.views)) * 1000).toFixed(1)} | ${f.skip.length ? `${(f.skip.reduce((a, b) => a + b, 0) / f.skip.length).toFixed(1)}%` : "–"} |`);
  const weak = ranked.filter(([, f]) => f.posts >= 2).slice(-1)[0];
  if (weak && ranked.length > 1) out.push("", `Weakest with two or more posts: **${weak[0]}**. Move it down in weekly-formats.md if it's last again next week.`);
  return out.join("\n");
}

/** log.md with each posted reel's row filled in: posted date and its 48h numbers. */
export function fillLog(log: string, posts: readonly PostRow[], stats: readonly StatRow[]): string {
  return log
    .split("\n")
    .map((line) => {
      const post = posts.find((p) => line.includes(`-${p.spec_id} |`));
      if (!post) return line;
      const cells = line.split("|");
      // | # | Date | Format | Folder | Posted | Views / comments after 48h | Notes |
      if (cells.length < 8) return line;
      const s = statAt(stats, post, 48);
      cells[5] = ` ${post.posted_at.slice(0, 10)} `;
      if (s) cells[6] = ` ${n(s.views)} views, ${n(s.comments)} comments, ${n(s.devs_placed)} new devs, ${s.skip_rate ?? "–"}% skipped in 3s `;
      return cells.join("|");
    })
    .join("\n");
}
