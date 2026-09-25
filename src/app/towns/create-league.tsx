"use client";

import { useState } from "react";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { Pending } from "@/components/leagues/PixelSpinner";
import { NO_AUTOFILL } from "@/components/league/hud/shared";

export default function CreateLeague({ signedIn, defaultOpen = false }: { signedIn: boolean; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/leagues", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't create the town.");
        setBusy(false);
        return;
      }
      // Keep the pending state until the league page loads.
      window.location.href = `/town/${json.league.slug}`;
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
    }
  }

  if (!signedIn) {
    return (
      <button
        type="button"
        disabled={busy}
        // Land back on the open form so creating is one step after login.
        onClick={() => {
          setBusy(true);
          signInWithGitHub(
            createBrowserSupabase(),
            `${window.location.origin}/auth/callback?next=${encodeURIComponent("/towns?create=1")}`,
          );
        }}
        className="btn-press bg-lime px-4 py-3 text-[11px] tracking-widest text-bg"
      >
        {busy ? <Pending label="Opening GitHub" /> : "Sign in to create a town"}
      </button>
    );
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="btn-press bg-lime px-4 py-3 text-[11px] tracking-widest text-bg">
        Create town
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-2 sm:col-span-2">
      <div className="flex gap-2">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          disabled={busy}
          placeholder="Town name"
          aria-label="Town name"
          {...NO_AUTOFILL}
          className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-xs"
        />
        <button
          type="submit"
          disabled={busy || name.trim().length < 2}
          className="btn-press min-w-[104px] bg-lime px-4 py-2 text-[11px] text-bg disabled:opacity-40"
        >
          {busy ? <Pending label="Creating" /> : "Create"}
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400 normal-case">{error}</p>}
    </form>
  );
}
