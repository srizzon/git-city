// Exports a film from the studio to an mp4, frame by frame, with no screen
// recorder. A headless browser opens the studio in export mode, the page's
// clocks (performance.now, Date.now, requestAnimationFrame, timers and CSS
// animations) are swapped for a virtual clock, and each frame is drawn at an
// exact time and screenshotted, so a slow machine still gets every frame
// right. The sound is mixed from the film's own cues (its song and effects)
// instead of being recorded, so it lands on the same beats as the picture.
//
// Needs Playwright in the project (npm i -D playwright; npx playwright install
// chromium) and ffmpeg on PATH (or the ffmpeg-static package, or FFMPEG=path).
//
// Usage: node export.mjs <studio url> [--out gg-output/trailer.mp4] [--fps 30]
//          [--size 1920x1080] [--poster <seconds>] [--no-poster-frame]
//          [--report <file.json>]
//   --poster  the settled frame to use as the thumbnail: written next to the
//             video as .jpg and baked in as frame 0, the frame every
//             platform's thumbnail grabber uses. Default: 1s before the end.
//   --no-poster-frame  keep frame 0 as filmed (a reel's first frame is its
//             hook; its cover is uploaded on its own). The .jpg is still written.
//   --report  every frame, call the page's window.__ggReport() (if it has
//             one) and write what it returns, one entry per frame, as JSON:
//             a page can report where its overlays are, for checks.
import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : fallback;
};
const BARE = new Set(["--no-poster-frame"]);
const url = args.find((a, i) => !a.startsWith("--") && !(args[i - 1]?.startsWith("--") && !BARE.has(args[i - 1])));
if (!url) {
  console.error(
    "Usage: node export.mjs <studio url> [--out gg-output/trailer.mp4] [--fps 30] [--size 1920x1080] [--poster <s>]",
  );
  process.exit(1);
}
const OUT = path.resolve(flag("out", "gg-output/trailer.mp4"));
mkdirSync(path.dirname(OUT), { recursive: true });
const POSTER = OUT.replace(/\.mp4$/i, "") + ".jpg";
const FPS = Number(flag("fps", 30));
const POSTER_FRAME = !args.includes("--no-poster-frame");
const REPORT = flag("report", null);
const report = [];
const [W, H] = flag("size", "1920x1080").split("x").map(Number);

const need = (name, hint) => {
  for (const from of [path.join(process.cwd(), "package.json"), import.meta.url]) {
    try {
      return createRequire(from)(name);
    } catch {
      // try the next place
    }
  }
  if (hint) {
    console.error(hint);
    process.exit(1);
  }
  return null;
};
const { chromium } = need(
  "playwright",
  "export.mjs needs Playwright: npm i -D playwright && npx playwright install chromium",
);
const FFMPEG =
  process.env.FFMPEG ?? ((await has("ffmpeg")) ? "ffmpeg" : need("ffmpeg-static")) ?? null;
if (!FFMPEG) {
  console.error("export.mjs needs ffmpeg: brew install ffmpeg (or npm i -D ffmpeg-static)");
  process.exit(1);
}

function has(bin) {
  return new Promise((ok) => {
    const p = spawn(bin, ["-version"], { stdio: "ignore" });
    p.on("error", () => ok(false));
    p.on("exit", (code) => ok(code === 0));
  });
}

function ffmpeg(argv, input) {
  return new Promise((ok, fail) => {
    const p = spawn(FFMPEG, ["-hide_banner", "-loglevel", "error", "-y", ...argv], {
      stdio: [input ? "pipe" : "ignore", "inherit", "inherit"],
    });
    p.on("error", fail);
    p.on("exit", (code) => (code === 0 ? ok() : fail(new Error(`ffmpeg exited ${code}`))));
    if (input) input(p.stdin);
  });
}

// ─── The virtual clock, injected before any of the page's code runs ────────
// Time runs for real while the page loads (so it hydrates and fetches its
// models), and stops when the export starts: from then on it only moves when
// __ggTime.advance is called, and every frame callback runs on that time.
const VIRTUAL_TIME = () => {
  const realNow = performance.now.bind(performance);
  const realDateNow = Date.now.bind(Date);
  const realRaf = window.requestAnimationFrame.bind(window);
  const realCaf = window.cancelAnimationFrame.bind(window);
  const realSetTimeout = window.setTimeout.bind(window);
  const realClearTimeout = window.clearTimeout.bind(window);
  const realSetInterval = window.setInterval.bind(window);
  const realClearInterval = window.clearInterval.bind(window);
  let frozen = false;
  let now = 0;
  let dateBase = 0;
  let nextId = 1e9;
  const frames = new Map();
  const timers = new Map();
  const born = new WeakMap();
  const ours = (id) => typeof id === "number" && id >= 1e9;

  performance.now = () => (frozen ? now : realNow());
  Date.now = () => (frozen ? dateBase + now : realDateNow());
  window.requestAnimationFrame = (cb) => {
    if (!frozen) return realRaf(cb);
    frames.set(++nextId, cb);
    return nextId;
  };
  window.cancelAnimationFrame = (id) => (ours(id) ? frames.delete(id) : realCaf(id));
  const later =
    (repeat) =>
    (cb, ms = 0, ...rest) => {
      if (!frozen) return (repeat ? realSetInterval : realSetTimeout)(cb, ms, ...rest);
      timers.set(++nextId, {
        at: now + Math.max(0, ms),
        every: repeat ? Math.max(1, ms) : 0,
        cb,
        rest,
      });
      return nextId;
    };
  window.setTimeout = later(false);
  window.setInterval = later(true);
  window.clearTimeout = (id) => (ours(id) ? timers.delete(id) : realClearTimeout(id));
  window.clearInterval = (id) => (ours(id) ? timers.delete(id) : realClearInterval(id));

  // CSS animations and transitions follow the same clock: each is paused and
  // placed at its age on the virtual clock.
  const syncAnimations = () => {
    for (const a of document.getAnimations()) {
      if (!born.has(a)) born.set(a, now);
      a.pause();
      a.currentTime = now - born.get(a);
    }
  };
  const runFrame = () => {
    syncAnimations();
    const due = [...frames.values()];
    frames.clear();
    for (const cb of due) cb(now);
  };
  // One real task, so React commits what the frame callbacks changed.
  const settle = () => new Promise((ok) => realSetTimeout(ok, 0));

  window.__ggTime = {
    freeze() {
      now = realNow();
      dateBase = realDateNow() - now;
      frozen = true;
    },
    /** Moves the clock ms forward, runs the timers and frame callbacks due, and lets the page settle. */
    async advance(ms) {
      const target = now + ms;
      for (;;) {
        let next = null;
        for (const [id, t] of timers)
          if (t.at <= target && (!next || t.at < next[1].at)) next = [id, t];
        if (!next) break;
        const [id, t] = next;
        now = Math.max(now, t.at);
        if (t.every) t.at += t.every;
        else timers.delete(id);
        t.cb(...t.rest);
      }
      now = target;
      runFrame();
      await settle();
      await settle();
      // A second pass at the same time, so pictures that read React state
      // (what's visible after a cut) draw with what was just committed.
      runFrame();
      await settle();
    },
  };
};

// ─── Picture ────────────────────────────────────────────────────────────────
const work = mkdtempSync(path.join(tmpdir(), "gg-export-"));
const browser = await chromium.launch({
  args: ["--autoplay-policy=no-user-gesture-required", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.addInitScript(VIRTUAL_TIME);
const target = new URL(url);
target.searchParams.set("export", "1");
console.log(`Opening ${target.href}`);
await page.goto(target.href, { waitUntil: "load", timeout: 180_000 });
await page.waitForFunction(() => window.__gg, null, { timeout: 180_000 });
await page.waitForLoadState("networkidle").catch(() => {});
await page.evaluate(() => document.fonts.ready);
// Dev servers draw their own badges over the page (Next.js, Vite): not in the film.
await page.addStyleTag({
  content: "nextjs-portal, vite-error-overlay { display: none !important; }",
});
// Let models, textures and shaders finish on real time before the clock stops.
await page.waitForTimeout(1500);

const film = await page.evaluate(() => window.__gg.info());
const seconds = film.length * film.beat;
const total = Math.ceil(seconds * FPS);
const posterAt = Math.min(
  total - 1,
  Math.max(0, Math.round(Number(flag("poster", seconds - 1)) * FPS)),
);
console.log(`${seconds.toFixed(2)}s, ${total} frames at ${FPS} fps, ${W}×${H}`);

// The stage goes full frame first, while time still runs for real: canvases
// resize (on a ResizeObserver and a debounce) and draw at their new size, or
// frame 0 comes out cropped.
await page.evaluate(() => window.__gg.prepare?.());
await page.waitForTimeout(800);
await page.evaluate(() => {
  window.__ggTime.freeze();
  window.__gg.start();
});
const silent = path.join(work, "picture.mp4");
let poster = null;
const started = Date.now();
await ffmpeg(
  [
    "-f",
    "image2pipe",
    "-framerate",
    String(FPS),
    "-i",
    "-",
    "-c:v",
    "libx264",
    "-preset",
    "medium",
    "-crf",
    "14",
    "-pix_fmt",
    "yuv420p",
    silent,
  ],
  async (stdin) => {
    for (let i = 0; i < total; i++) {
      await page.evaluate((ms) => window.__ggTime.advance(ms), i === 0 ? 0 : 1000 / FPS);
      const png = await page.screenshot({ type: "png" });
      if (REPORT) report.push(await page.evaluate(() => window.__ggReport?.() ?? null));
      if (i === posterAt) poster = png;
      if (!stdin.write(png)) await new Promise((ok) => stdin.once("drain", ok));
      if (i % FPS === 0) process.stdout.write(`\r  frame ${i + 1}/${total}`);
    }
    stdin.end();
  },
);
console.log(`\r  ${total} frames in ${((Date.now() - started) / 1000).toFixed(0)}s`);
const origin = target.origin;
await browser.close();

// ─── Sound, mixed from the film's cues ──────────────────────────────────────
const files = new Map();
async function local(src) {
  if (files.has(src)) return files.get(src);
  const res = await fetch(new URL(src, origin));
  if (!res.ok) {
    console.warn(`  skipped ${src}: ${res.status}`);
    files.set(src, null);
    return null;
  }
  const file = path.join(
    work,
    `a${files.size}${path.extname(new URL(src, origin).pathname) || ".wav"}`,
  );
  writeFileSync(file, Buffer.from(await res.arrayBuffer()));
  files.set(src, file);
  return file;
}

const inputs = [];
const chains = [];
const SR = 48000;
if (film.song) {
  const f = await local(film.song.src);
  if (f) {
    inputs.push(f);
    chains.push(`atrim=start=${film.song.offset},asetpts=PTS-STARTPTS`);
  }
}
for (const cue of film.sounds) {
  if (cue.beat < 0 || cue.beat * film.beat >= seconds) continue;
  const f = await local(cue.src);
  if (!f) continue;
  const at = Math.round(cue.beat * film.beat * 1000);
  const steps = [`aresample=${SR}`];
  if (cue.rate && cue.rate !== 1)
    steps.push(`asetrate=${Math.round(SR * cue.rate)}`, `aresample=${SR}`);
  if (cue.dur !== undefined)
    steps.push(
      "aloop=loop=-1:size=2147483647",
      `atrim=0:${cue.dur + 0.2}`,
      `afade=t=out:st=${Math.max(0, cue.dur - 0.08)}:d=0.2`,
    );
  steps.push(`volume=${cue.gain}`, `adelay=${at}:all=1`);
  inputs.push(f);
  chains.push(steps.join(","));
}

// ─── Poster on frame 0, sound under the picture ─────────────────────────────
const still = path.join(work, "poster.png");
writeFileSync(still, poster);
const argv = ["-i", silent, "-i", still, ...inputs.flatMap((f) => ["-i", f])];
const graph = [POSTER_FRAME ? "[0:v][1:v]overlay=0:0:enable='eq(n,0)'[v]" : "[0:v]null[v]"];
if (inputs.length) {
  chains.forEach((c, i) => graph.push(`[${i + 2}:a]${c}[s${i}]`));
  graph.push(
    `${chains.map((_, i) => `[s${i}]`).join("")}amix=inputs=${chains.length}:normalize=0:duration=longest,` +
      `alimiter=limit=0.95,atrim=0:${seconds},apad=whole_dur=${seconds}[a]`,
  );
}
await ffmpeg([
  ...argv,
  "-filter_complex",
  graph.join(";"),
  "-map",
  "[v]",
  ...(inputs.length ? ["-map", "[a]", "-c:a", "aac", "-b:a", "192k"] : []),
  "-c:v",
  "libx264",
  "-preset",
  "slow",
  "-crf",
  "17",
  "-pix_fmt",
  "yuv420p",
  "-movflags",
  "+faststart",
  "-t",
  String(seconds),
  OUT,
]);
// The poster as a small jpg, for uploads and <video poster>.
await ffmpeg(["-i", still, "-q:v", "2", POSTER]);
rmSync(work, { recursive: true, force: true });
if (REPORT) writeFileSync(path.resolve(REPORT), JSON.stringify(report));
console.log(`Wrote ${OUT}\n      ${POSTER} (frame ${posterAt}${POSTER_FRAME ? ", also frame 0" : ""})`);
