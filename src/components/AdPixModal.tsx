"use client";

import { useState, useEffect, useRef, useCallback } from "react";

const ACCENT = "#c8e64a";
const PIX_EXPIRY_SECONDS = 900;

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

interface AdPixModalProps {
  brCode: string;
  brCodeBase64: string;
  adId: string;
  planLabel: string;
  /** Where to send user after payment. If omitted, falls back to setup page. */
  successUrl?: string;
  onClose: () => void;
}

export default function AdPixModal({ brCode, brCodeBase64, adId, planLabel, successUrl, onClose }: AdPixModalProps) {
  const [countdown, setCountdown] = useState(PIX_EXPIRY_SECONDS);
  const [copied, setCopied] = useState(false);
  const [status, setStatus] = useState<"polling" | "completed" | "expired">("polling");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    timerRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, []);

  useEffect(() => {
    if (status !== "polling") return;
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/ads/checkout/pix/status?ad_id=${adId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.status === "active") {
          setStatus("completed");
        }
      } catch {
        // ignore
      }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, adId]);

  useEffect(() => {
    if (status === "completed" || status === "expired") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [status]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  }, [brCode]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="relative mx-4 w-full max-w-sm border-2 border-border bg-bg p-6">
        <button
          onClick={onClose}
          className="absolute right-3 top-3 text-xs text-muted hover:text-cream"
        >
          &#10005;
        </button>

        <h3 className="mb-1 text-xs" style={{ color: ACCENT }}>
          PIX Payment
        </h3>
        <p className="mb-4 text-[9px] text-muted normal-case">
          {planLabel}
        </p>

        {status === "completed" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm" style={{ color: ACCENT }}>
              &#10003; Payment confirmed!
            </p>
            <p className="mb-4 text-[9px] text-muted normal-case">
              Your ad is now active.
            </p>
            <div className="flex items-center justify-center gap-2">
              <a
                href={successUrl ?? `/ads/dashboard/${adId}`}
                className="btn-press px-4 py-2 text-[10px] text-bg"
                style={{ backgroundColor: ACCENT, boxShadow: "2px 2px 0 0 #5a7a00" }}
              >
                View ad
              </a>
              <button
                onClick={onClose}
                className="border-2 border-border px-4 py-2 text-[10px] text-cream hover:border-border-light"
              >
                Close
              </button>
            </div>
          </div>
        ) : status === "expired" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-xs text-red-400">QR code expired</p>
            <p className="text-[9px] text-muted normal-case">
              Close and try again to generate a new code.
            </p>
            <button
              onClick={onClose}
              className="mt-3 border-2 border-border px-4 py-2 text-[10px] text-cream hover:border-border-light"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              {brCodeBase64 ? (
                <img
                  src={brCodeBase64}
                  alt="PIX QR Code"
                  className="h-48 w-48"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center border-2 border-border text-[9px] text-muted">
                  QR code unavailable
                </div>
              )}
            </div>

            <div className="mb-4">
              <p className="mb-1 text-[8px] text-muted">PIX code (copy &amp; paste):</p>
              <div className="flex items-stretch gap-1">
                <div className="flex-1 overflow-hidden border-2 border-border bg-bg-card px-2 py-1.5">
                  <p className="truncate text-[8px] text-cream normal-case">
                    {brCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="shrink-0 border-2 px-3 text-[9px] transition-colors"
                  style={{
                    borderColor: copied ? ACCENT : "var(--color-border)",
                    color: copied ? ACCENT : "var(--color-cream)",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-[9px] text-muted normal-case">
                Expires in{" "}
                <span style={{ color: countdown < 60 ? "#ef4444" : ACCENT }}>
                  {formatCountdown(countdown)}
                </span>
              </p>
              <p className="text-[9px] text-muted normal-case animate-pulse">
                Checking payment...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
