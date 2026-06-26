"use client";

import { useEffect, useRef, useState } from "react";
import { useBossEvent } from "@/lib/bossEventStore";

// ─── Boss Share Card ───────────────────────────────────────────
//
// Modal triggered by "boss-share-card-open" CustomEvent.
// Shows a 1200x630 social card preview + download (PNG) + tweet button.
//
// Card is drawn fresh on every open to a hidden <canvas>. The preview
// just displays the canvas via dataURL. No external deps.
//
// Style matches the teaser-poster spec:
//   • bg #0d0d0f, Silkscreen font, lime/accent text
//   • subtle scanline overlay, pixel-shadow vibe
//   • bottom: thegitcity.com

const CARD_W = 1200;
const CARD_H = 630;

interface LeaderRow { rank: number; login: string; damage: number; minions: number }

interface Props {
  accentColor: string;
  shadowColor: string;
  leaderboard?: LeaderRow[];
  participants?: number;
  selfLogin?: string;
}

export default function BossShareCard({ accentColor, shadowColor, leaderboard = [], participants = 0, selfLogin = "" }: Props) {
  const playerDamage = useBossEvent((s) => s.playerDamage);
  const minionKills = useBossEvent((s) => s.minionKills);

  const [open, setOpen] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Rank from the real leaderboard (local YOU damage merged in for immediacy).
  const rankRows = leaderboard.map((r) => ({
    damage: r.damage,
    isYou: !!selfLogin && r.login.toLowerCase() === selfLogin.toLowerCase(),
  }));
  const myIdx = rankRows.findIndex((r) => r.isYou);
  if (myIdx >= 0) rankRows[myIdx] = { damage: Math.max(rankRows[myIdx].damage, playerDamage), isYou: true };
  else rankRows.push({ damage: playerDamage, isYou: true });
  rankRows.sort((a, b) => b.damage - a.damage);
  const yourRank = rankRows.findIndex((r) => r.isYou) + 1;
  const totalParticipants = Math.max(participants, rankRows.length);

  // Real damage/minions come from the DB-backed leaderboard. The local counters
  // reset whenever the PartyKit room restarts, so prefer the authoritative
  // leaderboard value and only fall back to the local meter when not listed.
  const selfRow = leaderboard.find((r) => !!selfLogin && r.login.toLowerCase() === selfLogin.toLowerCase());
  const yourDamage = Math.max(selfRow?.damage ?? 0, playerDamage);
  const yourMinions = Math.max(selfRow?.minions ?? 0, minionKills);

  // Listen for open event
  useEffect(() => {
    const handler = () => setOpen(true);
    window.addEventListener("boss-share-card-open", handler);
    return () => window.removeEventListener("boss-share-card-open", handler);
  }, []);

  // Render the canvas whenever the modal opens
  useEffect(() => {
    if (!open) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    canvas.width = CARD_W;
    canvas.height = CARD_H;

    // Background
    ctx.fillStyle = "#0d0d0f";
    ctx.fillRect(0, 0, CARD_W, CARD_H);

    // Subtle grid overlay (32px lines, faint accent)
    ctx.strokeStyle = `${accentColor}10`;
    ctx.lineWidth = 1;
    for (let x = 0; x < CARD_W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, CARD_H);
      ctx.stroke();
    }
    for (let y = 0; y < CARD_H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CARD_W, y);
      ctx.stroke();
    }

    // Card frame (pixel shadow border)
    const pad = 50;
    ctx.fillStyle = "#161618";
    ctx.fillRect(pad, pad, CARD_W - pad * 2, CARD_H - pad * 2);

    // Border
    ctx.strokeStyle = "#2a2a30";
    ctx.lineWidth = 3;
    ctx.strokeRect(pad, pad, CARD_W - pad * 2, CARD_H - pad * 2);

    // Pixel shadow (offset rect)
    ctx.fillStyle = shadowColor;
    ctx.fillRect(pad + 8, CARD_H - pad + 2, CARD_W - pad * 2, 6);
    ctx.fillRect(CARD_W - pad + 2, pad + 8, 6, CARD_H - pad * 2);

    // Header: "BUG INVASION · DEFEATED"
    ctx.font = "20px 'Silkscreen', monospace";
    ctx.fillStyle = accentColor;
    ctx.textAlign = "center";
    ctx.fillText("──  BUG INVASION  ·  DEFEATED  ──", CARD_W / 2, 130);

    // Big title
    ctx.font = "82px 'Silkscreen', monospace";
    ctx.fillStyle = accentColor;
    ctx.shadowColor = shadowColor;
    ctx.shadowOffsetX = 5;
    ctx.shadowOffsetY = 5;
    ctx.shadowBlur = 0;
    ctx.fillText("I HELPED DEFEAT", CARD_W / 2, 230);
    ctx.fillText("THE ORIGINAL BUG", CARD_W / 2, 320);
    ctx.shadowColor = "transparent";
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Stats row
    const statsY = 420;
    const statBoxW = 220;
    const statSpacing = 80;
    const statsCount = 3;
    const totalW = statBoxW * statsCount + statSpacing * (statsCount - 1);
    const startX = (CARD_W - totalW) / 2;

    const stats = [
      { label: "DAMAGE", value: yourDamage.toLocaleString() },
      { label: "RANK", value: `#${yourRank}/${totalParticipants}` },
      { label: "MINIONS", value: yourMinions.toString() },
    ];

    stats.forEach((s, i) => {
      const x = startX + i * (statBoxW + statSpacing);
      // Box
      ctx.fillStyle = "#0d0d0f";
      ctx.fillRect(x, statsY, statBoxW, 90);
      ctx.strokeStyle = "#2a2a30";
      ctx.lineWidth = 2;
      ctx.strokeRect(x, statsY, statBoxW, 90);
      // Label
      ctx.font = "14px 'Silkscreen', monospace";
      ctx.fillStyle = "#8c8c9c";
      ctx.textAlign = "center";
      ctx.fillText(s.label, x + statBoxW / 2, statsY + 28);
      // Value
      ctx.font = "32px 'Silkscreen', monospace";
      ctx.fillStyle = accentColor;
      ctx.fillText(s.value, x + statBoxW / 2, statsY + 70);
    });

    // Footer
    ctx.font = "20px 'Silkscreen', monospace";
    ctx.fillStyle = accentColor;
    ctx.textAlign = "center";
    ctx.fillText("THEGITCITY.COM", CARD_W / 2, CARD_H - 80);

    // Scanlines overlay
    ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
    for (let y = 0; y < CARD_H; y += 4) {
      ctx.fillRect(0, y, CARD_W, 1);
    }

    // Convert to PNG and stash for preview + download
    const url = canvas.toDataURL("image/png");
    setPreviewUrl(url);
  }, [open, yourDamage, yourMinions, yourRank, totalParticipants, accentColor, shadowColor]);

  if (!open) return null;

  // Personalized share URL → unfurls a custom OG card with the player's stats.
  const shareUrl = selfLogin
    ? `https://www.thegitcity.com/battle/boss/${encodeURIComponent(selfLogin.toLowerCase())}`
    : "https://www.thegitcity.com";
  const tweetText = encodeURIComponent(
    `Just helped defeat the Original Bug in Git City. Dealt ${yourDamage.toLocaleString()} damage, ranked #${yourRank}/${totalParticipants}.`,
  );
  const tweetUrl = `https://x.com/intent/tweet?text=${tweetText}&url=${encodeURIComponent(shareUrl)}`;

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center bg-bg/90 backdrop-blur-md font-pixel uppercase">
      <div
        className="border-2 border-border bg-bg-raised"
        style={{
          width: "min(820px, 95vw)",
          maxHeight: "92vh",
          overflowY: "auto",
          boxShadow: `4px 4px 0 0 ${shadowColor}`,
        }}
      >
        {/* Header */}
        <div className="flex items-baseline justify-between border-b-2 border-border/60 px-6 py-3">
          <span className="text-[10px] tracking-widest text-cream/60">SHARE YOUR VICTORY</span>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-[10px] text-cream/40 hover:text-cream"
          >
            CLOSE
          </button>
        </div>

        {/* Preview */}
        <div className="border-b-2 border-border/60 bg-bg p-4">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Share card preview"
              className="w-full border border-border"
              style={{ aspectRatio: `${CARD_W} / ${CARD_H}` }}
            />
          ) : (
            <div className="aspect-[1200/630] w-full animate-pulse border border-border bg-bg-card" />
          )}
        </div>

        {/* Actions */}
        <div className="grid grid-cols-3 gap-2 px-6 py-4">
          <a
            href={tweetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="btn-press px-4 py-2 text-center text-[10px] tracking-widest text-bg"
            style={{
              backgroundColor: accentColor,
              boxShadow: `4px 4px 0 0 ${shadowColor}`,
            }}
          >
            TWEET
          </a>
          <button
            type="button"
            className="btn-press border-2 border-border bg-bg px-4 py-2 text-[10px] tracking-widest text-cream"
            onClick={() => {
              if (!previewUrl) return;
              const a = document.createElement("a");
              a.href = previewUrl;
              a.download = `bug-invasion-victory-${Date.now()}.png`;
              a.click();
            }}
          >
            DOWNLOAD PNG
          </button>
          <button
            type="button"
            className="btn-press border-2 border-border bg-bg px-4 py-2 text-[10px] tracking-widest text-cream"
            onClick={async () => {
              if (!previewUrl || !canvasRef.current) return;
              try {
                canvasRef.current.toBlob(async (blob) => {
                  if (!blob) return;
                  if (navigator.clipboard && "write" in navigator.clipboard) {
                    await navigator.clipboard.write([
                      new ClipboardItem({ "image/png": blob }),
                    ]);
                  }
                });
              } catch {
                // Fallback: ignore
              }
            }}
          >
            COPY IMAGE
          </button>
        </div>

        {/* Footer hint */}
        <div className="border-t-2 border-border/50 px-4 py-2 text-center text-[8px] tracking-wider text-cream/30 normal-case">
          tweet button drops the text · attach the image you downloaded
        </div>

        {/* Hidden canvas for generation */}
        <canvas ref={canvasRef} style={{ display: "none" }} width={CARD_W} height={CARD_H} />
      </div>
    </div>
  );
}
