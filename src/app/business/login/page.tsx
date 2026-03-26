"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

const ACCENT = "#c8e64a";

// Contextual messaging based on redirect destination
function getContext(redirect: string | null): { title: string; subtitle: string } {
  if (redirect?.includes("/jobs")) {
    return {
      title: "Post a Job",
      subtitle: "Reach 67K+ verified GitHub developers with real contributions you can audit.",
    };
  }
  if (redirect?.includes("/ads")) {
    return {
      title: "Sky Ads",
      subtitle: "Advertise your brand inside the city. Seen by thousands of developers daily.",
    };
  }
  return {
    title: "For Companies",
    subtitle: "Manage your jobs, ads, and more on Git City.",
  };
}

export default function BusinessLoginPage() {
  return (
    <Suspense>
      <BusinessLoginInner />
    </Suspense>
  );
}

function BusinessLoginInner() {
  const searchParams = useSearchParams();
  const prefillEmail = searchParams.get("email") ?? "";
  const errorParam = searchParams.get("error");
  const redirect = searchParams.get("redirect");

  const ctx = getContext(redirect);

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
      const params = new URLSearchParams();
      if (redirect) params.set("redirect", redirect);

      const res = await fetch("/api/ads/auth/send-magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), redirect: redirect ?? undefined }),
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
      <div className="w-full max-w-md px-4">
        <Link
          href="/"
          className="text-sm text-muted transition-colors hover:text-cream"
        >
          &larr; Back to city
        </Link>

        <h1 className="mt-8 text-2xl text-cream sm:text-3xl">
          Git City{" "}
          <span style={{ color: ACCENT }}>{ctx.title}</span>
        </h1>
        <p className="mt-3 text-sm text-muted normal-case leading-relaxed">
          {ctx.subtitle}
        </p>

        {sent ? (
          <div className="mt-8 border-[3px] border-border bg-bg-raised p-6">
            <p className="text-base text-cream">Check your email</p>
            <p className="mt-3 text-sm text-muted normal-case">
              We sent a sign-in link to{" "}
              <strong className="text-cream">{email}</strong>.
              It expires in 15 minutes.
            </p>
            <button
              type="button"
              onClick={() => { setSent(false); setLoading(false); }}
              className="mt-5 text-xs normal-case transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-8">
            {error && (
              <div
                className="mb-5 border-[3px] px-5 py-4 text-center text-sm normal-case"
                style={{ borderColor: "#ff6b6b", color: "#ff6b6b", backgroundColor: "#ff6b6b10" }}
              >
                {error}
              </div>
            )}

            <label htmlFor="business-email" className="text-xs text-muted normal-case">
              Company email
            </label>
            <input
              id="business-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              autoFocus
              className="mt-2 w-full border-[3px] border-border bg-transparent px-4 py-3 text-sm text-cream outline-none transition-colors normal-case focus-visible:border-lime"
              style={{ fontFamily: "inherit" }}
            />

            <button
              type="submit"
              disabled={!email.trim() || loading}
              className="btn-press mt-5 w-full py-4 text-sm text-bg transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
              style={{ backgroundColor: ACCENT, boxShadow: "4px 4px 0 0 #5a7a00" }}
            >
              {loading ? "Sending..." : "Send sign-in link"}
            </button>

            <p className="mt-4 text-center text-xs text-dim normal-case">
              No password needed. We&apos;ll email you a magic link.
            </p>
          </form>
        )}
      </div>
    </main>
  );
}
