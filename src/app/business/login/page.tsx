"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

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

  const isJobsFlow = redirect?.includes("/jobs");

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
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="flex min-h-screen items-center justify-center px-4">
        <div className="w-full max-w-md">
          <Link href={isJobsFlow ? "/for-companies" : "/"} className="text-xs text-dim transition-colors hover:text-muted">
            &larr; {isJobsFlow ? "Back to For Companies" : "Back to City"}
          </Link>

          {/* Header */}
          <div className="mt-6">
            {isJobsFlow ? (
              <>
                <h1 className="text-2xl text-cream sm:text-3xl">
                  Post a Job on <span className="text-lime">Git City</span>
                </h1>
                <p className="mt-3 text-xs text-muted normal-case leading-relaxed">
                  Enter your company email to get started. We'll send you a sign-in link. No password needed.
                </p>
                {/* Founding reminder */}
                <div className="mt-4 border-[2px] border-[#fbbf24]/20 bg-[#fbbf24]/[0.03] px-4 py-3">
                  <p className="text-xs text-[#fbbf24] normal-case">
                    First listing free. Founding Company spots still available.
                  </p>
                </div>
              </>
            ) : (
              <>
                <h1 className="text-2xl text-cream sm:text-3xl">
                  Git City <span className="text-lime">for Companies</span>
                </h1>
                <p className="mt-3 text-xs text-muted normal-case leading-relaxed">
                  Manage your jobs and ads on Git City.
                </p>
              </>
            )}
          </div>

          {sent ? (
            <div className="mt-8 border-[3px] border-border bg-bg-raised p-6 space-y-4">
              <p className="text-sm text-cream">Check your email</p>
              <p className="text-xs text-muted normal-case">
                We sent a sign-in link to{" "}
                <strong className="text-cream">{email}</strong>.
                It expires in 15 minutes.
              </p>
              <p className="text-xs text-dim normal-case">
                Didn't receive it? Check your spam folder or make sure you used a company email (no Gmail, Hotmail, etc).
              </p>
              <button
                type="button"
                onClick={() => { setSent(false); setLoading(false); }}
                className="text-xs text-lime normal-case transition-colors hover:text-cream cursor-pointer"
              >
                Use a different email
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="mt-8 space-y-4">
              {error && (
                <div className="border-[3px] border-red-500/30 bg-red-500/5 px-4 py-3 text-center">
                  <p className="text-xs text-red-400 normal-case">{error}</p>
                </div>
              )}

              <div>
                <label htmlFor="business-email" className="text-xs text-muted">
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
                  className="mt-1.5 w-full border-[3px] border-border bg-transparent px-4 py-3 text-sm text-cream outline-none transition-colors normal-case focus-visible:border-lime"
                />
              </div>

              <button
                type="submit"
                disabled={!email.trim() || loading}
                className="btn-press w-full py-4 text-sm text-bg disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: "#c8e64a", boxShadow: "4px 4px 0 0 #5a7a00" }}
              >
                {loading ? "Sending..." : "Send sign-in link"}
              </button>

              <p className="text-center text-xs text-dim normal-case">
                No password needed. We'll email you a magic link.
              </p>
            </form>
          )}

          {/* Steps preview */}
          {isJobsFlow && !sent && (
            <div className="mt-8 space-y-2">
              <p className="text-xs text-dim mb-3">What happens next</p>
              <Step n="1" text="Check your email and click the link" />
              <Step n="2" text="Set up your company profile (2 min)" />
              <Step n="3" text="Post your first job listing" />
            </div>
          )}
        </div>
      </div>
    </main>
  );
}

function Step({ n, text }: { n: string; text: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-xs text-lime shrink-0">{n}.</span>
      <p className="text-xs text-muted normal-case">{text}</p>
    </div>
  );
}
