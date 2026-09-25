import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { OG } from "@/lib/og/devHero";
import { getLeagueBySlug } from "@/lib/leagues/service";
import { getLeagueMembers, type LeagueMemberRow } from "@/lib/leagues/queries";
import { townDisplayName } from "@/lib/towns/names";

export const alt = "Town in Git City";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const revalidate = 3600;

const FACES = 9;
const FACE = 140;
const GAP = 16;

/** Avatars as data URLs, so a slow GitHub CDN drops a face instead of the image. */
async function loadFaces(members: LeagueMemberRow[]) {
  const picked = [...members]
    .filter((m) => m.avatar_url)
    // Joined members first, then the biggest buildings.
    .sort((a, b) => Number(b.status === "active") - Number(a.status === "active") || b.contributions - a.contributions)
    .slice(0, FACES);
  const faces = await Promise.all(
    picked.map(async (m) => {
      try {
        const url = m.avatar_url as string;
        const res = await fetch(`${url}${url.includes("?") ? "&" : "?"}s=160`, { signal: AbortSignal.timeout(3000) });
        if (!res.ok) return null;
        const type = res.headers.get("content-type") ?? "image/png";
        return { id: m.developer_id, active: m.status === "active", src: `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}` };
      } catch {
        return null;
      }
    }),
  );
  return faces.filter((f): f is NonNullable<typeof f> => !!f);
}

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fontData = await readFile(join(process.cwd(), "public/fonts/Silkscreen-Regular.ttf"));
  const fonts = [{ name: "Silkscreen", data: fontData, style: "normal" as const, weight: 400 as const }];

  const league = await getLeagueBySlug(slug);
  const members = league ? (await getLeagueMembers(league.id)).filter((m) => m.status !== "former") : [];
  const joined = members.filter((m) => m.status === "active").length;
  const faces = await loadFaces(members);
  const name = league ? townDisplayName(league.name) : "Town not found";
  const nameSize = name.length > 26 ? 56 : name.length > 18 ? 68 : 80;
  const cols = Math.min(3, Math.max(1, faces.length));
  const rows = Math.ceil(faces.length / 3);

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          position: "relative",
          backgroundColor: OG.bg,
          fontFamily: "Silkscreen",
          color: OG.cream,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 0,
            bottom: 0,
            width: faces.length > 0 ? 560 : 1056,
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
          }}
        >
          <div style={{ display: "flex", gap: 20, fontSize: 22, letterSpacing: 6, color: OG.accent }}>
            <span>{league?.kind === "company" ? "COMPANY TOWN" : "GIT CITY TOWN"}</span>
            {league?.kind === "company" && <span>✓ VERIFIED</span>}
          </div>
          <div style={{ display: "flex", marginTop: 20, fontSize: nameSize, lineHeight: 1.05, color: OG.cream }}>{name}</div>
          {league && (
            <div style={{ display: "flex", marginTop: 36, gap: 48 }}>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 64, color: OG.accent }}>{String(members.length)}</div>
                <div style={{ display: "flex", fontSize: 20, color: OG.muted }}>{members.length === 1 ? "BUILDING" : "BUILDINGS"}</div>
              </div>
              <div style={{ display: "flex", flexDirection: "column" }}>
                <div style={{ display: "flex", fontSize: 64, color: OG.cream }}>{String(joined)}</div>
                <div style={{ display: "flex", fontSize: 20, color: OG.muted }}>{joined === 1 ? "MEMBER" : "MEMBERS"}</div>
              </div>
            </div>
          )}
          <div style={{ display: "flex", marginTop: 40, fontSize: 18, color: OG.dim }}>{`thegitcity.com/town/${slug}`}</div>
        </div>

        {faces.length > 0 && (
          <div
            style={{
              position: "absolute",
              right: 72,
              top: (630 - (rows * FACE + (rows - 1) * GAP)) / 2,
              width: cols * FACE + (cols - 1) * GAP,
              display: "flex",
              flexWrap: "wrap",
              gap: GAP,
            }}
          >
            {faces.map((f) => (
               
              <img
                key={f.id}
                src={f.src}
                width={FACE}
                height={FACE}
                alt=""
                style={{ border: `4px solid ${f.active ? OG.accent : OG.border}` }}
              />
            ))}
          </div>
        )}
      </div>
    ),
    { ...size, fonts },
  );
}
