"use client";

import { useState } from "react";
import Link from "next/link";
import { Pending } from "@/components/leagues/PixelSpinner";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import Panel from "./Panel";

export default function JoinPanel({
  leagueSlug,
  leagueKind,
  signedIn,
  invitee,
  refLogin,
  onClose,
}: {
  leagueSlug: string;
  leagueKind: "company" | "custom";
  signedIn: boolean;
  invitee: string | null;
  refLogin: string | null;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    const params = new URLSearchParams();
    if (refLogin) params.set("ref", refLogin);
    params.set("next", `/league/${leagueSlug}`);
    await signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?${params.toString()}`);
  }

  async function join() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leagues/${leagueSlug}/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ref: refLogin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Couldn't join.");
        setBusy(false);
        return;
      }
      // Keep the pending state until the reload replaces the page.
      window.location.reload();
    } catch {
      setError("Couldn't join. Try again.");
      setBusy(false);
    }
  }

  const needsVerify = signedIn && leagueKind === "company";
  return (
    <Panel title="Your team is waiting" onClose={onClose}>
      <p className="text-[11px] text-muted normal-case">
        {invitee ? `@${invitee}'s building is in the city, waiting for you. ` : ""}Join to start scoring in the weekly race.
      </p>
      {needsVerify ? (
        <Link href="/leagues/verify" className="btn-press mt-4 block bg-lime px-4 py-3 text-center text-[11px] tracking-widest text-bg">
          Verify your company
        </Link>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={signedIn ? join : signIn}
          className="btn-press mt-4 w-full bg-lime px-4 py-3 text-[11px] tracking-widest text-bg disabled:opacity-50"
        >
          {busy ? <Pending label={signedIn ? "Joining" : "Opening GitHub"} /> : "Join the league"}
        </button>
      )}
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
    </Panel>
  );
}
