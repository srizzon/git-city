import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG } from "@/lib/og/devHero";
import { BrasilPixels } from "@/lib/og/brasilPixels";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { STATES, parseUF } from "@/lib/towns/brasil-map";
import { BRASIL_SLUG, getBrasilLayout } from "@/lib/towns/brasil-server";
import { weekCrown } from "@/components/towns/brasil/stats";
import { candidateByNumber } from "@/lib/towns/brasil-election-server";
import { PRESIDENCY_ON } from "@/lib/towns/brasil-election";

// The Brasil map's share card: two short lines on the left, the map of Brazil
// in pixels on the right with the real cities. Each link shares a moment:
//   ?at=login  someone on the map: their state lit, their city glowing
//              ("@login / tá no mapa.", "fundou SP." for a founder, "tá na ilha.")
//   ?uf=SP     a state: lit, with its place ("#4 do Brasil.", "levou a coroa.", "tá vazio.")
//   ?vote=34   a vote ("seu voto para"), ?run=34 a candidacy ("vote 34"): the
//              voting machine's screen with the number, the candidate's face
//              and @, their state lit and their city glowing
//   nothing    the whole map: every city lit, "326 devs / e você?"
// In Portuguese: whoever shares it and whoever gets it is Brazilian.

const size = { width: 1200, height: 630 };
const LOGIN_RE = /^[a-z0-9](?:[a-z0-9]|-(?=[a-z0-9])){0,38}$/i;
const fmt = (n: number) => n.toLocaleString("pt-BR");

interface Card {
  top: string;
  bottom: string;
  lit?: (typeof STATES)[number]["uf"] | null;
  hot?: [number, number] | null;
  litIsland?: boolean;
}

/** Big, but a long login or state still fits the left half (Silkscreen is wide: about 1.1 of the size per letter). */
const TEXT_W = 440;
const fontFor = (s: string) => Math.max(26, Math.min(80, Math.floor(TEXT_W / (s.length * 1.1))));

/** A long name ("Rio Grande do Norte") on two balanced lines, so it stays big. */
function linesOf(s: string): string[] {
  if (s.length <= 12 || !s.includes(" ")) return [s];
  const words = s.split(" ");
  let best = [s];
  let bestW = s.length;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" ");
    const b = words.slice(i).join(" ");
    if (Math.max(a.length, b.length) < bestW) {
      best = [a, b];
      bestW = Math.max(a.length, b.length);
    }
  }
  return best;
}

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const league = await getLeagueBySlug(BRASIL_SLUG);
  const { layout, residents } = league ? await getBrasilLayout(league.id) : { layout: null, residents: [] };
  const cities = layout ? [...layout.cities, layout.island] : [];
  const devs = residents.length;

  let card: Card = { top: `${fmt(devs)} devs`, bottom: "e você?" };
  const at = q.get("at")?.toLowerCase();
  const uf = parseUF(q.get("uf") ?? "");
  if (at && LOGIN_RE.test(at)) {
    const me = residents.find((r) => r.dev.login.toLowerCase() === at);
    const city = me && cities.find((c) => c.devs.some((d) => d.dev.login.toLowerCase() === at));
    const founder = !!city?.devs.find((d) => d.dev.login.toLowerCase() === at)?.founder;
    if (me) card = { top: `@${at}`, bottom: !me.dev.uf ? "tá na ilha." : founder ? `fundou ${me.dev.uf}.` : "tá no mapa.", lit: me.dev.uf, hot: [me.x, me.z], litIsland: !me.dev.uf };
  } else if (uf && layout) {
    const counts = STATES.map((s) => ({ uf: s.uf, n: residents.filter((r) => r.dev.uf === s.uf).length })).sort((a, b) => b.n - a.n);
    const n = counts.find((c) => c.uf === uf)!.n;
    const place = counts.findIndex((c) => c.uf === uf) + 1;
    const crowned = weekCrown(layout, Date.now()).crown?.uf === uf;
    const name = STATES.find((s) => s.uf === uf)!.name;
    card = { top: name, bottom: crowned ? "levou a coroa." : n === 0 ? "tá vazio." : `#${place} do Brasil.`, lit: uf };
  }

  const font = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  // A vote (?vote=34, "seu voto para") or a candidacy (?run=34, "vote 34"): the voting machine's screen with the number, the candidate's face and @.
  const run = q.get("run");
  const num = Number(run ?? q.get("vote"));
  const cand = PRESIDENCY_ON && Number.isInteger(num) && num >= 10 && num <= 99 ? await candidateByNumber(num) : null;
  if (cand) {
    const me = residents.find((r) => r.dev.login.toLowerCase() === cand.login.toLowerCase());
    const name = `@${cand.login}`;
    const ink = "#1b1d22";
    const photo = cand.avatar_url ? `${cand.avatar_url}${cand.avatar_url.includes("?") ? "&" : "?"}s=320` : null;
    return new ImageResponse(
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", backgroundColor: OG.bg, fontFamily: "Silkscreen" }}>
        <div style={{ display: "flex", padding: "0 0 0 56px" }}>
          <div style={{ width: 600, height: 420, display: "flex", flexDirection: "column", backgroundColor: "#d9dad4", padding: 18, border: "4px solid #8d8d87", boxShadow: "0 12px 0 #6f706b" }}>
            <div style={{ flex: 1, display: "flex", backgroundColor: "#eef0ea", border: "5px solid #9a9a94", padding: "22px 24px", color: ink, gap: 22 }}>
              <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
                <span style={{ fontSize: 20, textTransform: "uppercase" }}>{run ? "Para presidente," : "Seu voto para"}</span>
                <span style={{ fontSize: 38, textTransform: "uppercase", marginTop: 6 }}>{run ? "Vote" : "Presidente"}</span>
                <div style={{ display: "flex", marginTop: 20, gap: 12 }}>
                  {String(num)
                    .split("")
                    .map((d, i) => (
                      <span key={i} style={{ width: 100, height: 128, display: "flex", alignItems: "center", justifyContent: "center", border: `5px solid ${ink}`, backgroundColor: "rgba(255,255,255,0.6)", fontSize: 100 }}>
                        {d}
                      </span>
                    ))}
                </div>
                <span style={{ fontSize: Math.max(18, Math.min(30, Math.floor(300 / (name.length * 1.05)))), marginTop: 22 }}>{name}</span>
                {me && <span style={{ fontSize: 22, marginTop: 4 }}>{me.dev.uf ?? "Ilha"}</span>}
              </div>
              <div style={{ width: 170, height: 214, display: "flex", border: "5px solid #9a9a94", backgroundColor: "#ffffff", overflow: "hidden" }}>
                {/* eslint-disable-next-line @next/next/no-img-element -- an OG image (satori) takes plain img */}
                {photo && <img src={photo} width={170} height={214} style={{ objectFit: "cover" }} alt="" />}
              </div>
            </div>
          </div>
        </div>
        <div style={{ display: "flex", width: 540, height: 590 }}>
          <BrasilPixels width={540} height={590} cities={cities} lit={me?.dev.uf ?? null} hot={me ? [me.x, me.z] : null} litIsland={!!me && !me.dev.uf} />
        </div>
      </div>,
      { ...size, fonts: [{ name: "Silkscreen", data: font, style: "normal" }], headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
    );
  }
  return new ImageResponse(
    <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", backgroundColor: OG.bg, fontFamily: "Silkscreen" }}>
      <div style={{ width: 560, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 0 0 72px", overflow: "hidden" }}>
        {linesOf(card.top).map((l, i, all) => (
          <span key={i} style={{ fontSize: fontFor(all.reduce((a, b) => (b.length > a.length ? b : a))), lineHeight: 1.1, color: OG.cream, textTransform: "uppercase" }}>
            {l}
          </span>
        ))}
        <span style={{ fontSize: fontFor(card.bottom), lineHeight: 1.1, color: OG.accent, textTransform: "uppercase", marginTop: 12 }}>{card.bottom}</span>
      </div>
      <div style={{ display: "flex", width: 600, height: 590 }}>
        <BrasilPixels width={600} height={590} cities={cities} lit={card.lit ?? null} hot={card.hot ?? null} litIsland={card.litIsland} />
      </div>
    </div>,
    { ...size, fonts: [{ name: "Silkscreen", data: font, style: "normal" }], headers: { "Cache-Control": "public, max-age=600, s-maxage=600" } },
  );
}
