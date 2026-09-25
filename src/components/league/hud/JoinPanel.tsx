"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Pending } from "@/components/leagues/PixelSpinner";
import { createBrowserSupabase } from "@/lib/supabase";
import { signInWithGitHub } from "@/lib/sign-in";
import { REQUEST_TTL_DAYS, type JoinAction } from "@/lib/towns/joining";
import Panel from "./Panel";

const PRIMARY = "btn-press mt-4 block w-full bg-lime px-4 py-3 text-center text-[11px] tracking-widest text-bg disabled:opacity-50";

export default function JoinPanel({
  leagueSlug,
  action,
  signedIn,
  invitee,
  refLogin,
  inviteToken,
  org = null,
  onClose,
}: {
  leagueSlug: string;
  action: JoinAction;
  signedIn: boolean;
  invitee: string | null;
  refLogin: string | null;
  inviteToken: string | null;
  /** Company towns: the GitHub org, so verifying opens with it picked. */
  org?: string | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Invited or holding the admin's link: the team is already waiting for them.
  const expected = !!invitee || !!inviteToken;

  async function signIn() {
    setBusy(true);
    const params = new URLSearchParams();
    if (refLogin) params.set("ref", refLogin);
    // Come back to the same link, token included, with this panel open.
    const back = new URLSearchParams();
    if (refLogin) back.set("ref", refLogin);
    if (inviteToken) back.set("t", inviteToken);
    if (invitee) back.set("invite", invitee);
    back.set("join", "1");
    params.set("next", `/town/${leagueSlug}?${back.toString()}`);
    await signInWithGitHub(createBrowserSupabase(), `${window.location.origin}/auth/callback?${params.toString()}`);
  }

  async function call(path: string, method: "POST" | "DELETE", body?: object): Promise<boolean> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(path, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(json.error ?? "Something went wrong. Try again.");
        setBusy(false);
        return false;
      }
      return true;
    } catch {
      setError("Network error. Try again.");
      setBusy(false);
      return false;
    }
  }

  async function join() {
    // Keep the pending state until the reload replaces the page.
    if (await call(`/api/leagues/${leagueSlug}/join`, "POST", { ref: refLogin, t: inviteToken })) window.location.reload();
  }

  async function ask() {
    if (await call(`/api/leagues/${leagueSlug}/requests`, "POST")) {
      setBusy(false);
      router.refresh();
    }
  }

  async function cancel() {
    if (await call(`/api/leagues/${leagueSlug}/requests`, "DELETE")) {
      setBusy(false);
      router.refresh();
    }
  }

  if (action === "verify") {
    return (
      <Panel title="Work here?" onClose={onClose}>
        <p className="text-[11px] text-muted normal-case">
          Company towns are for {org ? `@${org}` : "the org"}&apos;s members. Show you&apos;re in the org on GitHub and your building moves in.
        </p>
        <Link href={`/towns/new?kind=company${org ? `&org=${encodeURIComponent(org)}` : ""}`} className={PRIMARY}>
          Check my membership
        </Link>
      </Panel>
    );
  }

  if (action === "pending") {
    return (
      <Panel title="Request sent" onClose={onClose}>
        <p className="text-[11px] text-muted normal-case">
          The admin decides who moves in. You&apos;ll get an email when they let you in. Requests expire after {REQUEST_TTL_DAYS} days.
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={cancel}
          className="btn-press mt-4 w-full border-2 border-border px-4 py-3 text-[11px] text-muted hover:text-cream disabled:opacity-50"
        >
          {busy ? <Pending label="Cancelling" /> : "Cancel request"}
        </button>
        {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
      </Panel>
    );
  }

  const asking = action === "ask";
  const title = expected ? "Your team is waiting" : asking ? "Ask to join" : "Join this town";
  const copy = expected
    ? `${invitee ? `@${invitee}'s building is in the city, waiting for you. ` : ""}Join to start scoring in the weekly race.`
    : asking
      ? "The admin decides who moves in. Ask, and your building joins the skyline once they say yes."
      : "Anyone can move in. Your building joins the skyline and races with the town every week.";
  const label = asking ? "Ask to join" : "Join the town";
  const pendingLabel = !signedIn ? "Opening GitHub" : asking ? "Asking" : "Joining";

  return (
    <Panel title={title} onClose={onClose}>
      <p className="text-[11px] text-muted normal-case">{copy}</p>
      <button type="button" disabled={busy} onClick={!signedIn ? signIn : asking ? ask : join} className={PRIMARY}>
        {busy ? <Pending label={pendingLabel} /> : signedIn ? label : `Sign in to ${asking ? "ask" : "join"}`}
      </button>
      {error && <p className="mt-2 text-[11px] text-red-400 normal-case">{error}</p>}
    </Panel>
  );
}
