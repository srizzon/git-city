"use client";

import { useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";

const ETH_ADDRESS = "0x8C24A2b54128bC0717F533E6DA7338be30b9f732";
const ACCENT = "#c8e64a";

function SupportContent() {
  const searchParams = useSearchParams();
  const thanks = searchParams.get("thanks") === "true";

  const [copied, setCopied] = useState(false);
  const [loadingAmount, setLoadingAmount] = useState<number | null>(null);
  const [customAmount, setCustomAmount] = useState("");
  const [error, setError] = useState<string | null>(null);

  const copyEth = async () => {
    await navigator.clipboard.writeText(ETH_ADDRESS);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleStripeCheckout = async (amount: number) => {
    if (loadingAmount) return;
    setError(null);
    setLoadingAmount(amount);

    try {
      const res = await fetch("/api/support/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || "Something went wrong");
        return;
      }

      if (data.url) {
        window.location.href = data.url;
      }
    } catch {
      setError("Failed to connect. Try again.");
    } finally {
      setLoadingAmount(null);
    }
  };

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to City
        </Link>

        <h1 className="text-2xl text-cream sm:text-3xl">
          Keep the <span style={{ color: ACCENT }}>Signal</span> Alive
        </h1>
        <p className="mt-2 text-xs text-muted normal-case sm:text-sm">
          Git City runs on servers, databases, and API calls. Every new building
          that goes up, the cost goes up with it. Your support keeps this city
          running.
        </p>

        {/* Thank you banner */}
        {thanks && (
          <div
            className="mt-6 border-[3px] p-5 sm:p-6"
            style={{ borderColor: ACCENT, backgroundColor: "rgba(200, 230, 74, 0.06)" }}
          >
            <p className="text-sm" style={{ color: ACCENT }}>
              Thank you for your support
            </p>
            <p className="mt-2 text-xs text-muted normal-case">
              Your contribution keeps the city running. You are a real one.
            </p>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-5">
          {/* Stripe */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="text-sm text-cream">
              <span style={{ color: ACCENT }}>01.</span> One-time Support
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {[5, 10, 25].map((amount) => (
                <button
                  key={amount}
                  disabled={loadingAmount !== null}
                  onClick={() => handleStripeCheckout(amount)}
                  className="btn-press border-[2px] border-border px-5 py-2 text-xs text-cream transition-colors hover:border-border-light disabled:cursor-wait disabled:opacity-50"
                >
                  {loadingAmount === amount ? "..." : `$${amount}`}
                </button>
              ))}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-dim">$</span>
                <input
                  type="number"
                  min={1}
                  placeholder="__"
                  value={customAmount}
                  onChange={(e) => setCustomAmount(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && customAmount) {
                      handleStripeCheckout(parseInt(customAmount, 10));
                    }
                  }}
                  className="w-14 border-[2px] border-border bg-transparent px-2 py-2 text-xs text-cream outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                />
                <button
                  disabled={loadingAmount !== null || !customAmount || parseInt(customAmount, 10) < 1}
                  onClick={() => handleStripeCheckout(parseInt(customAmount, 10))}
                  className="btn-press border-[2px] border-border px-3 py-2 text-[10px] text-cream transition-colors hover:border-border-light disabled:cursor-not-allowed disabled:opacity-30"
                >
                  {loadingAmount && loadingAmount !== 5 && loadingAmount !== 10 && loadingAmount !== 25 ? "..." : "GO"}
                </button>
              </div>
            </div>
            {error && (
              <p className="mt-3 text-xs normal-case" style={{ color: "#f87171" }}>
                {error}
              </p>
            )}
          </div>

          {/* GitHub Sponsors */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="text-sm text-cream">
              <span style={{ color: ACCENT }}>02.</span> GitHub Sponsors
            </p>
            <a
              href="https://github.com/sponsors/srizzon"
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press mt-4 inline-block border-[2px] border-border px-5 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              github.com/sponsors/srizzon
            </a>
          </div>

          {/* Crypto (ETH) */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="text-sm text-cream">
              <span style={{ color: ACCENT }}>03.</span> Crypto (ETH)
            </p>
            <div className="mt-4 flex items-center gap-3">
              <code className="break-all text-[9px] text-muted normal-case sm:text-xs">
                {ETH_ADDRESS}
              </code>
              <button
                onClick={copyEth}
                className="btn-press shrink-0 border-[2px] border-border px-3 py-1.5 text-[10px] transition-colors hover:border-border-light"
                style={{
                  color: copied ? "#0d0d0f" : ACCENT,
                  backgroundColor: copied ? ACCENT : "transparent",
                }}
              >
                {copied ? "Copied!" : "Copy"}
              </button>
            </div>
          </div>

          {/* $GITC Community Token */}
          <div className="border-[3px] border-border bg-bg-raised p-5 sm:p-6">
            <p className="text-sm text-cream">
              <span style={{ color: ACCENT }}>04.</span> $GITC Community Token
            </p>
            <p className="mt-2 text-xs text-muted normal-case">
              The community created a token to support the project.
            </p>
            <Link
              href="/token"
              className="btn-press mt-4 inline-block border-[2px] border-border px-5 py-2 text-xs text-muted transition-colors hover:border-border-light hover:text-cream"
            >
              Learn more & disclaimer
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function SupportPage() {
  return (
    <Suspense>
      <SupportContent />
    </Suspense>
  );
}
