"use client";

import { useEffect, useId, useRef, useState } from "react";

// Reusable pixel-art dropdown matching the Git City design system
// (3px borders, hard pixel shadow, lime accent). Replaces native <select> in
// forms. Keyboard accessible: ↑/↓ to move, Enter/Space to pick, Esc to close.

export interface PixelOption {
  value: string;
  label: string;
  hint?: string;
}

export function PixelSelect({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className = "",
  disabled = false,
  ariaLabel,
}: {
  value: string;
  onChange: (v: string) => void;
  options: PixelOption[];
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(-1);
  const ref = useRef<HTMLDivElement>(null);
  const listId = useId();
  const current = options.find((o) => o.value === value);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  function openMenu() {
    setHi(Math.max(0, options.findIndex((o) => o.value === value)));
    setOpen(true);
  }

  function choose(v: string) {
    onChange(v);
    setOpen(false);
  }

  function onKey(e: React.KeyboardEvent) {
    if (disabled) return;
    if (e.key === "Escape") { setOpen(false); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (!open) { openMenu(); return; }
      if (hi >= 0 && hi < options.length) choose(options[hi].value);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) openMenu();
      else setHi((h) => Math.min(options.length - 1, h + 1));
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHi((h) => Math.max(0, h - 1));
    }
  }

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={() => !disabled && setOpen((o) => !o)}
        onKeyDown={onKey}
        className={`flex w-full items-center justify-between gap-2 border bg-bg px-3 py-2 text-left text-xs outline-none transition-colors ${
          open ? "border-lime" : "border-border hover:border-border-light"
        } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
      >
        <span className={`min-w-0 flex-1 truncate text-left ${current ? "text-cream" : "text-dim"}`}>{current?.label ?? placeholder}</span>
        <span className={`shrink-0 text-[8px] text-muted transition-transform ${open ? "rotate-180" : ""}`}>▼</span>
      </button>

      {open && (
        <ul
          role="listbox"
          id={listId}
          className="scrollbar-thin absolute left-0 right-0 top-full z-50 mt-1 max-h-60 list-none overflow-auto border-[3px] border-border-light bg-bg-card shadow-[6px_6px_0_0_rgba(0,0,0,0.5)]"
        >
          {options.map((o, i) => {
            const sel = o.value === value;
            return (
              <li key={o.value}>
                <button
                  type="button"
                  role="option"
                  aria-selected={sel}
                  onMouseEnter={() => setHi(i)}
                  onClick={() => choose(o.value)}
                  className={`flex w-full items-center justify-between gap-2 border-b border-border px-3 py-2 text-left text-[11px] transition-colors last:border-b-0 ${
                    i === hi ? "bg-bg-raised" : ""
                  } ${sel ? "text-lime" : "text-cream"}`}
                >
                  <span className="flex items-center gap-2">
                    <span className={`h-1.5 w-1.5 shrink-0 ${sel ? "bg-lime" : "bg-transparent"}`} />
                    {o.label}
                  </span>
                  {o.hint && <span className="shrink-0 text-[9px] text-dim">{o.hint}</span>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
