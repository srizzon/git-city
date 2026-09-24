"use client";

import { useState } from "react";
import Link from "next/link";

export interface OrgState {
  login: string;
  avatar_url: string | null;
  league: { slug: string; name: string } | null;
  joined: boolean;
}

export default function VerifyClient({
  signedIn,
  verifiedOnce,
  orgs,
  error,
}: {
  signedIn: boolean;
  verifiedOnce: boolean;
  orgs: OrgState[];
  error: string | null;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(error ? "GitHub sign-in failed. Try again." : null);
  const [publicOrg, setPublicOrg] = useState("");

  async function post(url: string, org: string) {
    setBusy(org);
    setMessage(null);
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org }),
      });
      const json = await res.json();
      if (!res.ok) {
        setMessage(json.error ?? "Something went wrong.");
        return;
      }
      window.location.href = `/league/${json.slug}`;
    } finally {
      setBusy(null);
    }
  }

  if (!signedIn) {
    return (
      <a
        href={`/api/auth/github?redirect=${encodeURIComponent("/leagues/verify")}`}
        className="btn-press mt-8 block bg-lime px-4 py-3 text-center text-[11px] tracking-widest text-bg"
      >
        Sign in with GitHub
      </a>
    );
  }

  return (
    <div className="mt-8 space-y-8">
      {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- API route, full navigation */}
      <a
        href="/api/leagues/verify"
        className="btn-press block bg-lime px-4 py-3 text-center text-[11px] tracking-widest text-bg"
      >
        {verifiedOnce ? "Check my orgs again" : "Verify with GitHub"}
      </a>

      {message && <p className="text-[11px] text-red-400 normal-case">{message}</p>}

      {verifiedOnce && (
        <section>
          <h2 className="text-sm text-cream">Your orgs</h2>
          <ul className="mt-3 space-y-2">
            {orgs.map((o) => (
              <li key={o.login} className="flex items-center gap-3 border-[3px] border-border bg-bg-card p-3">
                {o.avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={o.avatar_url} alt="" width={28} height={28} className="h-7 w-7" />
                ) : (
                  <div className="h-7 w-7 bg-bg-raised" />
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-cream normal-case">@{o.login}</div>
                  <div className="text-[9px] text-muted">
                    {o.league ? (o.joined ? "You're in" : "League exists") : "No league yet"}
                  </div>
                </div>
                {o.joined && o.league ? (
                  <Link href={`/league/${o.league.slug}`} className="text-[10px] text-lime">
                    Open &rarr;
                  </Link>
                ) : (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => post("/api/leagues/verify/join", o.login)}
                    className="btn-press border-2 border-lime px-3 py-1.5 text-[10px] text-lime disabled:opacity-40"
                  >
                    {busy === o.login ? "..." : o.league ? "Join" : "Start league"}
                  </button>
                )}
              </li>
            ))}
            {orgs.length === 0 && (
              <li className="text-[11px] text-muted normal-case">GitHub didn&apos;t list any orgs for you.</li>
            )}
          </ul>
        </section>
      )}

      <section className="border-t-2 border-border pt-6">
        <h2 className="text-sm text-cream">Don&apos;t see your company?</h2>
        <p className="mt-2 text-[11px] leading-relaxed text-muted normal-case">
          Some orgs block third-party apps. Make your membership public on GitHub (org page &rarr; People &rarr; your
          name &rarr; Public), then check it here.
        </p>
        <form
          className="mt-3 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (publicOrg.trim()) post("/api/leagues/verify/public", publicOrg.trim());
          }}
        >
          <input
            value={publicOrg}
            onChange={(e) => setPublicOrg(e.target.value)}
            placeholder="org name, e.g. vercel"
            aria-label="GitHub org"
            autoCapitalize="off"
            spellCheck={false}
            className="min-w-0 flex-1 border-2 border-border bg-bg-raised px-3 py-2 text-base text-cream normal-case outline-none focus:border-lime sm:text-xs"
          />
          <button
            type="submit"
            disabled={busy !== null || !publicOrg.trim()}
            className="btn-press border-2 border-border px-3 py-2 text-[10px] text-cream disabled:opacity-40"
          >
            {busy === publicOrg.trim() ? "..." : "Check"}
          </button>
        </form>
      </section>
    </div>
  );
}
