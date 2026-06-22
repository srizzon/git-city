"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  current: string;
  pool: string[];
  isOwner: boolean;
  color: string;
}

export default function TitlePicker({ current, pool, isOwner, color }: Props) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(current);
  const [saving, setSaving] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  if (!isOwner) {
    return (
      <span className="text-xs sm:text-sm" style={{ color }}>
        &laquo;{current}&raquo;
      </span>
    );
  }

  const pick = async (next: string) => {
    setOpen(false);
    if (next === title || saving) return;
    const prev = title;
    setTitle(next);
    setSaving(true);
    try {
      const res = await fetch("/api/profile/showcase", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equipped_title: next }),
      });
      if (!res.ok) {
        setTitle(prev);
      } else {
        router.refresh();
      }
    } catch {
      setTitle(prev);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div ref={menuRef} className="relative inline-block">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={saving}
        className="text-xs transition-opacity hover:opacity-80 disabled:opacity-50 sm:text-sm"
        style={{ color }}
        title="Change your title"
      >
        &laquo;{title}&raquo; <span className="text-[8px]">&#9662;</span>
      </button>
      {open && (
        <div className="absolute left-1/2 top-full z-30 mt-2 w-56 -translate-x-1/2 border-[3px] border-border-light bg-bg shadow-[6px_6px_0_0_rgba(0,0,0,0.5)] sm:left-0 sm:translate-x-0">
          <div className="flex items-center justify-between border-b-2 border-border px-3 py-2">
            <span className="text-[8px] tracking-widest text-dim">EQUIP TITLE</span>
            <span className="text-[8px] text-dim">{pool.length}</span>
          </div>
          <div className="max-h-52 overflow-y-auto scrollbar-thin">
            {pool.map((t) => {
              const active = t === title;
              return (
                <button
                  key={t}
                  onClick={() => pick(t)}
                  className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[10px] transition-colors hover:bg-bg-card ${
                    active ? "bg-bg-card text-cream" : "text-muted hover:text-cream"
                  }`}
                >
                  <span className="truncate">{t}</span>
                  {active && (
                    <span
                      className="h-1.5 w-1.5 shrink-0"
                      style={{ backgroundColor: color }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
