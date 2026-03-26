"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const ACCENT = "#c8e64a";

export default function AdsLoginPage() {
  return (
    <Suspense>
      <AdsLoginInner />
    </Suspense>
  );
}

function AdsLoginInner() {
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") ?? "";
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState(prefillEmail);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(
    errorParam === "invalid_or_expired"
      ? "Link expired or already used. Request a new one."
      : errorParam === "missing_token"
        ? "Invalid login link."
        : "",
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || loading) return;

    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/ads/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Something went wrong");
        setLoading(false);
        return;
      }

      setSent(true);
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg font-pixel uppercase text-warm">
      <div className="w-full max-w-sm px-4">
        <Link
          href="/advertise"
          className="text-xs text-muted transition-colors hover:text-cream"
        >
          &larr; Back
        </Link>

        <h1 className="mt-6 text-xl text-cream">
          Ad <span style={{ color: ACCENT }}>Dashboard</span>
        </h1>
        <p className="mt-2 text-xs text-muted normal-case">
          Sign in with the email used to purchase your ad.
        </p>

        {sent ? (
          <div className="mt-6 border-[3px] border-border p-5">
            <p className="text-sm text-cream">Check your email</p>
            <p className="mt-2 text-xs text-muted normal-case">
              We sent a sign-in link to <strong className="text-cream">{email}</strong>.
              It expires in 15 minutes.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setLoading(false); }}
              className="mt-4 text-[10px] normal-case transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6">
            {error && (
              <div
                className="mb-4 border-[3px] px-4 py-3 text-center text-xs normal-case"
                style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}
              >
                {error}
              </div>
            )}

            <label className="text-[10px] text-muted normal-case">Email address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="mt-1.5 w-full border-[3px] border-border bg-transparent px-3 py-2.5 font-pixel text-xs text-cream outline-none transition-colors focus:border-[#c8e64a] normal-case"
            />

            <button
              type="submit"
              disabled={!email.trim() || loading}
              className="btn-press mt-4 w-full py-3 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: ACCENT, boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {loading ? "Sending..." : "Send sign-in link"}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
