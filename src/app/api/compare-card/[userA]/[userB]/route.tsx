import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { type NextRequest } from "next/server";

export const runtime = "nodejs";

// ─── i18n ─────────────────────────────────────────────────────
type Lang = "en" | "pt";

const i18n: Record<Lang, {
  rank: string; contribs: string; stars: string; repos: string; kudos: string;
  wins: string; tie: string; notFound: string; cta: string;
}> = {
  en: {
    rank: "RANK", contribs: "CONTRIBS", stars: "STARS", repos: "REPOS", kudos: "KUDOS",
    wins: "wins", tie: "Tie", notFound: "Comparison not found",
    cta: "Who wins? → thegitcity.com",
  },
  pt: {
    rank: "RANK", contribs: "COMMITS", stars: "ESTRELAS", repos: "REPOS", kudos: "KUDOS",
    wins: "vence", tie: "Empate", notFound: "Comparacao nao encontrada",
    cta: "Quem ganha? → thegitcity.com",
  },
};

// ─── Trash talk by result ─────────────────────────────────────
const TRASH_TALK: Record<Lang, { stomp: string[]; win: string[]; close: string[]; tie: string[] }> = {
  en: {
    stomp: [
      "THAT WASN'T EVEN CLOSE",
      "CALL AN AMBULANCE",
      "TOTAL DESTRUCTION",
    ],
    win: [
      "BETTER LUCK NEXT TIME",
      "GET BACK TO CODING",
      "NOT EVEN A CONTEST",
    ],
    close: [
      "THAT WAS PERSONAL",
      "DOWN TO THE WIRE",
      "PHOTO FINISH",
    ],
    tie: [
      "PERFECTLY BALANCED",
      "COULDN'T PICK A WINNER",
      "REMATCH REQUIRED",
    ],
  },
  pt: {
    stomp: [
      "NEM FOI JOGO",
      "CHAMA O SAMU",
      "DESTRUICAO TOTAL",
    ],
    win: [
      "TENTA DE NOVO",
      "VOLTA PRO VSCODE",
      "SEM CHANCE",
    ],
    close: [
      "ISSO FOI PESSOAL",
      "DECIDIDO NO DETALHE",
      "QUASE EMPATE",
    ],
    tie: [
      "PERFEITAMENTE EQUILIBRADO",
      "IMPOSSIVEL ESCOLHER",
      "REVANCHE OBRIGATORIA",
    ],
  },
};

function getTrashTalk(aWins: number, bWins: number, lang: Lang): string {
  const diff = Math.abs(aWins - bWins);
  const t = TRASH_TALK[lang];
  let pool: string[];
  if (aWins === bWins) pool = t.tie;
  else if (diff >= 3) pool = t.stomp;
  else if (diff === 2) pool = t.win;
  else pool = t.close;
  // Deterministic pick based on total
  return pool[(aWins + bWins) % pool.length];
}

// ─── Colors ───────────────────────────────────────────────────
const accent = "#c8e64a";
const bg = "#0d0d0f";
const cream = "#e8dcc8";
const border = "#2a2a30";
const cardBg = "#1c1c20";
const muted = "#8c8c9c";

// ─── Windows ──────────────────────────────────────────────────
const WSIZE = 20;
const WGAP = 8;
const WCOLS = 5;

function renderWindows(bHeight: number, color: string) {
  const rowH = WSIZE + WGAP;
  const usable = bHeight - 30;
  const nRows = Math.max(2, Math.floor(usable / rowH));
  const rows = [];
  for (let r = 0; r < nRows; r++) {
    const cells = [];
    for (let c = 0; c < WCOLS; c++) {
      const lit = (r * 5 + c * 3) % 7 > 1;
      cells.push(
        <div key={c} style={{ width: WSIZE, height: WSIZE, backgroundColor: lit ? color : `${color}18` }} />
      );
    }
    rows.push(<div key={r} style={{ display: "flex", gap: WGAP }}>{cells}</div>);
  }
  return rows;
}

// ─── GET ──────────────────────────────────────────────────────
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ userA: string; userB: string }> }
) {
  const { userA, userB } = await params;
  const format = request.nextUrl.searchParams.get("format") ?? "landscape";
  const lang = (request.nextUrl.searchParams.get("lang") === "pt" ? "pt" : "en") as Lang;
  const t = i18n[lang];

  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const fields = "github_login, name, avatar_url, contributions, contributions_total, public_repos, total_stars, rank, kudos_count";
  const [{ data: devA }, { data: devB }] = await Promise.all([
    supabase.from("developers").select(fields).eq("github_login", userA.toLowerCase()).single(),
    supabase.from("developers").select(fields).eq("github_login", userB.toLowerCase()).single(),
  ]);

  if (!devA || !devB) {
    return new ImageResponse(
      (<div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", backgroundColor: bg, fontFamily: "Silkscreen", color: cream, fontSize: 48, border: `6px solid ${border}` }}>{t.notFound}</div>),
      { width: 1200, height: 675, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
    );
  }

  // Effective contributions (matches rank calculation)
  const contribsA = ((devA as Record<string, unknown>).contributions_total as number) || (devA as Record<string, unknown>).contributions as number;
  const contribsB = ((devB as Record<string, unknown>).contributions_total as number) || (devB as Record<string, unknown>).contributions as number;
  const devAEff = { ...devA, contributions: contribsA };
  const devBEff = { ...devB, contributions: contribsB };

  // Compare stats
  const statDefs = [
    { label: t.rank, key: "rank" as const, invert: true },
    { label: t.contribs, key: "contributions" as const, invert: false },
    { label: t.stars, key: "total_stars" as const, invert: false },
    { label: t.repos, key: "public_repos" as const, invert: false },
    { label: t.kudos, key: "kudos_count" as const, invert: false },
  ];

  let aWins = 0;
  let bWins = 0;
  const statRows = statDefs.map((s) => {
    const a: number = (devAEff as Record<string, number>)[s.key] ?? 0;
    const b: number = (devBEff as Record<string, number>)[s.key] ?? 0;
    let aWin = false, bWin = false;
    if (s.invert) { aWin = a > 0 && (a < b || b === 0); bWin = b > 0 && (b < a || a === 0); }
    else { aWin = a > b; bWin = b > a; }
    if (aWin) aWins++;
    if (bWin) bWins++;
    return { label: s.label, a, b, aWin, bWin, isRank: s.key === "rank" };
  });

  const isTie = aWins === bWins;
  const winnerLogin = aWins > bWins ? devA.github_login : devB.github_login;
  const summary = isTie
    ? `${t.tie} ${aWins}-${bWins}`
    : `@${winnerLogin} ${t.wins} ${Math.max(aWins, bWins)}-${Math.min(aWins, bWins)}`;

  const aIsWinner = aWins > bWins;
  const bIsWinner = bWins > aWins;
  const aColor = aIsWinner || isTie ? accent : muted;
  const bColor = bIsWinner || isTie ? accent : muted;
  const trashTalk = getTrashTalk(aWins, bWins, lang);

  if (format === "stories") {
    return renderStories(devAEff, devBEff, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, t, fontData);
  }
  return renderLandscape(devAEff, devBEff, statRows, summary, trashTalk, aColor, bColor, aIsWinner, bIsWinner, isTie, fontData);
}

// ─── Landscape (1200x675) ─────────────────────────────────────
function renderLandscape(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean; isRank: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  fontData: Buffer
) {
  const maxContrib = Math.max(devA.contributions as number, devB.contributions as number, 1);
  const MIN_H = 180; const MAX_H = 360;
  const heightA = Math.round(MIN_H + ((devA.contributions as number) / maxContrib) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.contributions as number) / maxContrib) * (MAX_H - MIN_H));
  const GROUND_Y = 510;
  const BLDG_W = 180;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", backgroundColor: bg, fontFamily: "Silkscreen", border: `6px solid ${border}`, position: "relative", overflow: "hidden" }}>

        {/* ── Left side: Dev A avatar + building ── */}
        <div style={{ position: "absolute", left: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          {devA.avatar_url ? <img src={devA.avatar_url as string} width={64} height={64} style={{ border: `3px solid ${aColor}` }} /> : null}
          <div style={{ display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devA.name ?? devA.github_login) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: muted }}>@{devA.github_login as string}</div>
          </div>
        </div>

        {/* Building A */}
        <div style={{ position: "absolute", left: 60, top: GROUND_Y - heightA, width: BLDG_W, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>

        {/* ── Right side: Dev B avatar + building ── */}
        <div style={{ position: "absolute", right: 30, top: 28, display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase" }}>{((devB.name ?? devB.github_login) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 14, color: muted }}>@{devB.github_login as string}</div>
          </div>
          {devB.avatar_url ? <img src={devB.avatar_url as string} width={64} height={64} style={{ border: `3px solid ${bColor}` }} /> : null}
        </div>

        {/* Building B */}
        <div style={{ position: "absolute", right: 60, top: GROUND_Y - heightB, width: BLDG_W, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        {/* ── Center: Trash talk + VS + Stats ── */}
        <div style={{ position: "absolute", left: 270, top: 0, width: 660, height: GROUND_Y, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center" }}>
          {/* Trash talk hook */}
          <div style={{ display: "flex", fontSize: 16, color: accent, textTransform: "uppercase", marginBottom: 16 }}>
            &ldquo;{trashTalk}&rdquo;
          </div>

          {/* VS badge */}
          <div style={{ display: "flex", fontSize: 48, color: accent, border: `4px solid ${accent}`, padding: "2px 26px", marginBottom: 20 }}>VS</div>

          {/* Stats rows */}
          {statRows.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", marginBottom: 6, width: 620 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 220, fontSize: 32, color: s.aWin ? accent : muted, paddingRight: 12 }}>{s.isRank ? (s.a > 0 ? `#${s.a}` : "-") : s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 220, fontSize: 32, color: s.bWin ? accent : muted, paddingLeft: 12 }}>{s.isRank ? (s.b > 0 ? `#${s.b}` : "-") : s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Ground */}
        <div style={{ position: "absolute", left: 0, top: GROUND_Y, width: 1200, height: 4, backgroundColor: accent, display: "flex" }} />
        <div style={{ position: "absolute", left: 0, top: GROUND_Y + 4, width: 1200, height: 160, backgroundColor: "#141418", display: "flex" }} />

        {/* Bottom bar: Summary left, Branding right */}
        <div style={{ position: "absolute", bottom: 0, left: 0, width: 1200, height: 90, display: "flex", alignItems: "center", justifyContent: "space-between", paddingLeft: 40, paddingRight: 40 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ display: "flex", fontSize: 26, color: cream, textTransform: "uppercase" }}>{summary}</div>
          </div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 26, color: cream }}>GIT</span>
            <span style={{ fontSize: 26, color: accent }}>CITY</span>
          </div>
        </div>
      </div>
    ),
    { width: 1200, height: 675, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}

// ─── Stories (1080x1920) ──────────────────────────────────────
function renderStories(
  devA: Record<string, unknown>, devB: Record<string, unknown>,
  statRows: { label: string; a: number; b: number; aWin: boolean; bWin: boolean; isRank: boolean }[],
  summary: string, trashTalk: string,
  aColor: string, bColor: string,
  aIsWinner: boolean, bIsWinner: boolean, isTie: boolean,
  t: typeof i18n.en, fontData: Buffer
) {
  const maxContrib = Math.max(devA.contributions as number, devB.contributions as number, 1);
  const MIN_H = 300; const MAX_H = 550;
  const heightA = Math.round(MIN_H + ((devA.contributions as number) / maxContrib) * (MAX_H - MIN_H));
  const heightB = Math.round(MIN_H + ((devB.contributions as number) / maxContrib) * (MAX_H - MIN_H));
  const GROUND_Y = 1050;

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", backgroundColor: bg, fontFamily: "Silkscreen", position: "relative", overflow: "hidden", alignItems: "center" }}>

        {/* Trash talk (hook) */}
        <div style={{ position: "absolute", top: 150, width: 920, display: "flex", justifyContent: "center" }}>
          <div style={{ display: "flex", fontSize: 34, color: accent, textTransform: "uppercase", textAlign: "center", justifyContent: "center" }}>
            &ldquo;{trashTalk}&rdquo;
          </div>
        </div>

        {/* Avatars row — fixed-width columns for symmetry */}
        <div style={{ position: "absolute", top: 230, width: 920, display: "flex", justifyContent: "center", alignItems: "center" }}>
          {/* Dev A */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            {devA.avatar_url ? <img src={devA.avatar_url as string} width={100} height={100} style={{ border: `3px solid ${aColor}` }} /> : null}
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase", marginTop: 8 }}>{((devA.name ?? devA.github_login) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 16, color: muted }}>@{devA.github_login as string}</div>
          </div>
          {/* VS */}
          <div style={{ display: "flex", fontSize: 44, color: accent, border: `3px solid ${accent}`, padding: "4px 22px" }}>VS</div>
          {/* Dev B */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 320 }}>
            {devB.avatar_url ? <img src={devB.avatar_url as string} width={100} height={100} style={{ border: `3px solid ${bColor}` }} /> : null}
            <div style={{ display: "flex", fontSize: 22, color: cream, textTransform: "uppercase", marginTop: 8 }}>{((devB.name ?? devB.github_login) as string).slice(0, 14)}</div>
            <div style={{ display: "flex", fontSize: 16, color: muted }}>@{devB.github_login as string}</div>
          </div>
        </div>

        {/* Buildings side by side */}
        <div style={{ position: "absolute", left: 140, top: GROUND_Y - heightA, width: 260, height: heightA, backgroundColor: cardBg, borderTop: `6px solid ${aColor}`, borderLeft: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${aIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightA, aColor)}
        </div>
        <div style={{ position: "absolute", left: 680, top: GROUND_Y - heightB, width: 260, height: heightB, backgroundColor: cardBg, borderTop: `6px solid ${bColor}`, borderLeft: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, borderRight: `3px solid ${bIsWinner || isTie ? `${accent}50` : border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 14, gap: WGAP }}>
          {renderWindows(heightB, bColor)}
        </div>

        {/* Ground */}
        <div style={{ position: "absolute", left: 80, top: GROUND_Y, width: 920, height: 4, backgroundColor: accent, display: "flex" }} />

        {/* Stats comparison — wider columns for large numbers */}
        <div style={{ position: "absolute", top: GROUND_Y + 40, left: 0, width: 1080, display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          {statRows.map((s) => (
            <div key={s.label} style={{ display: "flex", alignItems: "center", width: 900 }}>
              <div style={{ display: "flex", justifyContent: "flex-end", width: 320, fontSize: 34, color: s.aWin ? accent : muted, paddingRight: 16 }}>{s.isRank ? (s.a > 0 ? `#${s.a}` : "-") : s.a.toLocaleString()}</div>
              <div style={{ display: "flex", justifyContent: "center", width: 160, fontSize: 16, color: `${muted}aa` }}>{s.label}</div>
              <div style={{ display: "flex", width: 320, fontSize: 34, color: s.bWin ? accent : muted, paddingLeft: 16 }}>{s.isRank ? (s.b > 0 ? `#${s.b}` : "-") : s.b.toLocaleString()}</div>
            </div>
          ))}
        </div>

        {/* Summary */}
        <div style={{ position: "absolute", top: GROUND_Y + 310, width: 1080, display: "flex", justifyContent: "center", fontSize: 28, color: cream, textTransform: "uppercase" }}>{summary}</div>

        {/* CTA */}
        <div style={{ position: "absolute", top: GROUND_Y + 380, display: "flex", flexDirection: "column", alignItems: "center", width: 1080, gap: 14 }}>
          <div style={{ display: "flex", fontSize: 24, color: bg, backgroundColor: accent, padding: "12px 40px", textTransform: "uppercase" }}>{t.cta}</div>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, textTransform: "uppercase" }}>
            <span style={{ fontSize: 20, color: cream }}>GIT</span>
            <span style={{ fontSize: 20, color: accent }}>CITY</span>
          </div>
        </div>
      </div>
    ),
    { width: 1080, height: 1920, headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" }, fonts: [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }] }
  );
}
