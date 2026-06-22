"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

interface Props {
  login: string;
  contributions: number;
  rank: number | null;
  isOwner: boolean;
  accent: string;
  shadow: string;
}

type CardLang = "en" | "pt";

const rowClass =
  "flex w-full items-center justify-between border-[3px] border-border px-4 py-2.5 text-[10px] text-cream transition-colors hover:border-border-light disabled:opacity-50";

export default function ProfileActions({
  login,
  contributions,
  rank,
  isOwner,
  accent,
  shadow,
}: Props) {
  const [copied, setCopied] = useState(false);
  const [showFormatMenu, setShowFormatMenu] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [cardLang, setCardLang] = useState<CardLang>("en");
  const [origin, setOrigin] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  // Set after mount — keeps SSR and first client render identical
  useEffect(() => setOrigin(window.location.origin), []);
  const profileUrl = `${origin}/dev/${login}`;

  const tweetText = `My GitHub just turned into a building. ${contributions.toLocaleString()} contributions, Rank #${rank ?? "?"}. What does yours look like?`;

  const handleCopy = () => {
    navigator.clipboard.writeText(profileUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = async (format: "landscape" | "stories") => {
    setShowFormatMenu(false);
    setDownloading(true);
    try {
      const res = await fetch(
        `/api/share-card/${login}?format=${format}&lang=${cardLang}`
      );
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `gitcity-${login}-${format}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  };

  useEffect(() => {
    if (!showFormatMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowFormatMenu(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showFormatMenu]);

  return (
    <section className="flex flex-col gap-2.5">
      <Link
        href={`/?user=${login}`}
        className="btn-press flex w-full items-center justify-center px-6 py-3.5 text-sm text-bg"
        style={{ backgroundColor: accent, boxShadow: `4px 4px 0 0 ${shadow}` }}
      >
        View in City
      </Link>

      {isOwner && (
        <Link
          href={`/shop/${login}`}
          className="btn-press flex w-full items-center justify-center border-[3px] border-border px-6 py-3 text-sm text-cream transition-colors hover:border-border-light"
        >
          Customize Building
        </Link>
      )}

      {/* Share group */}
      <div className="mt-2 flex items-center gap-2.5">
        <span className="h-px flex-1 bg-border" />
        <span className="text-[8px] tracking-widest text-dim">SHARE</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <a
        href={`https://x.com/intent/tweet?text=${encodeURIComponent(tweetText)}&url=${encodeURIComponent(profileUrl)}`}
        target="_blank"
        rel="noopener noreferrer"
        className={rowClass}
      >
        Share on X
        <span className="text-dim">&rarr;</span>
      </a>

      <div ref={menuRef}>
        <button
          onClick={() => setShowFormatMenu((v) => !v)}
          disabled={downloading}
          className={`${rowClass} ${showFormatMenu ? "border-border-light bg-bg-card" : ""}`}
        >
          {downloading ? "Downloading..." : "Download Card"}
          <span className="text-dim">{showFormatMenu ? "▴" : "▾"}</span>
        </button>

        {showFormatMenu && (
          <div className="border-[3px] border-t-0 border-border-light bg-bg-card">
            <div className="flex items-center justify-between border-b border-border px-4 py-2">
              <span className="text-[8px] tracking-widest text-dim">LANGUAGE</span>
              <div className="flex gap-1">
                {(["en", "pt"] as const).map((lang) => (
                  <button
                    key={lang}
                    onClick={() => setCardLang(lang)}
                    className="border-2 px-2 py-0.5 text-[9px] transition-colors"
                    style={
                      cardLang === lang
                        ? { borderColor: accent, color: accent }
                        : { borderColor: "transparent", color: "#5c5c6c" }
                    }
                  >
                    {lang.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => handleDownload("landscape")}
              className="flex w-full items-center justify-between border-b border-border px-4 py-2.5 text-left text-[10px] text-cream transition-colors hover:bg-bg-raised"
            >
              Landscape
              <span className="text-[9px] text-dim">1200x675</span>
            </button>
            <button
              onClick={() => handleDownload("stories")}
              className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[10px] text-cream transition-colors hover:bg-bg-raised"
            >
              Stories
              <span className="text-[9px] text-dim">1080x1920</span>
            </button>
          </div>
        )}
      </div>

      <button onClick={handleCopy} className={rowClass}>
        {copied ? "Copied!" : "Copy Link"}
        {copied && <span className="h-1.5 w-1.5 bg-lime" />}
      </button>
    </section>
  );
}
