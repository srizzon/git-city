"use client";

import { useState, useEffect, useRef, useCallback } from "react";

export interface PixModalData {
  brCode: string;
  brCodeBase64: string;
  pixId: string;
  packageName: string;
  totalPx: number;
}

export const PIX_EXPIRY_SECONDS = 900; // 15 min

function formatCountdown(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * PIX QR-code payment modal. Polls /api/pixels/purchase-status until the
 * payment completes or the 15-minute window expires. Shared by the /pixels
 * store and the in-city Bank panel.
 */
export function PixModal({
  data,
  onClose,
}: {
  data: PixModalData;
  onClose: (purchased: boolean) => void;
}) {
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
        const res = await fetch(`/api/pixels/purchase-status?pix_id=${data.pixId}`);
        if (!res.ok) return;
        const json = await res.json();
        if (json.status === "completed") setStatus("completed");
      } catch { /* ignore */ }
    }, 3000);
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [status, data.pixId]);

  useEffect(() => {
    if (status === "completed" || status === "expired") {
      if (pollRef.current) clearInterval(pollRef.current);
      if (timerRef.current) clearInterval(timerRef.current);
    }
  }, [status]);

  const copyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(data.brCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* fallback */ }
  }, [data.brCode]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70">
      <div className="relative mx-4 w-full max-w-sm border-[3px] border-border bg-bg p-6 font-pixel uppercase">
        <button
          onClick={() => onClose(false)}
          className="absolute right-3 top-3 text-sm text-muted hover:text-cream cursor-pointer"
        >
          &#10005;
        </button>

        <h3 className="mb-1 text-sm text-lime">PIX Payment</h3>
        <p className="mb-4 text-xs text-muted normal-case">
          {data.totalPx.toLocaleString()} PX — {data.packageName}
        </p>

        {status === "completed" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-base text-lime">Payment confirmed!</p>
            <p className="text-sm text-muted normal-case mb-4">
              {data.totalPx.toLocaleString()} PX added to your balance.
            </p>
            <button
              onClick={() => onClose(true)}
              className="btn-press px-6 py-2 text-sm text-bg"
              style={{ backgroundColor: "#c8e64a", boxShadow: "2px 2px 0 0 #5a7a00" }}
            >
              Done
            </button>
          </div>
        ) : status === "expired" ? (
          <div className="py-6 text-center">
            <p className="mb-2 text-sm text-red-400">QR code expired</p>
            <p className="text-xs text-muted normal-case mb-3">
              Close and try again to generate a new code.
            </p>
            <button
              onClick={() => onClose(false)}
              className="border-2 border-border px-4 py-2 text-xs text-cream hover:border-border-light cursor-pointer"
            >
              Close
            </button>
          </div>
        ) : (
          <>
            <div className="mb-4 flex justify-center">
              {data.brCodeBase64 ? (
                <img
                  src={data.brCodeBase64}
                  alt="PIX QR Code"
                  className="h-48 w-48"
                  style={{ imageRendering: "pixelated" }}
                />
              ) : (
                <div className="flex h-48 w-48 items-center justify-center border-2 border-border text-xs text-muted">
                  QR code unavailable
                </div>
              )}
            </div>

            <div className="mb-4">
              <p className="mb-1 text-[10px] text-muted">PIX code (copy &amp; paste):</p>
              <div className="flex items-stretch gap-1">
                <div className="flex-1 overflow-hidden border-2 border-border bg-bg-card px-2 py-1.5">
                  <p className="truncate text-[10px] text-cream normal-case">
                    {data.brCode}
                  </p>
                </div>
                <button
                  onClick={copyCode}
                  className="shrink-0 border-2 px-3 text-xs transition-colors cursor-pointer"
                  style={{
                    borderColor: copied ? "#c8e64a" : "var(--color-border)",
                    color: copied ? "#c8e64a" : "var(--color-cream)",
                  }}
                >
                  {copied ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between">
              <p className="text-xs text-muted normal-case">
                Expires in{" "}
                <span style={{ color: countdown < 60 ? "#ef4444" : "#c8e64a" }}>
                  {formatCountdown(countdown)}
                </span>
              </p>
              <p className="text-xs text-muted normal-case animate-pulse">
                Checking payment...
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
