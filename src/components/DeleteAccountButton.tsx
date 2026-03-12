"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function DeleteAccountButton() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function handleDelete() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/account/delete", { method: "POST" });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Something went wrong. Try again.");
        setLoading(false);
        return;
      }
      router.push("/");
    } catch {
      setError("Network error. Try again.");
      setLoading(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="shrink-0 border-[2px] border-red-500/60 px-4 py-2 font-pixel text-[10px] uppercase text-red-400 transition-colors hover:bg-red-500/10"
      >
        Delete Account
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 px-4"
          onClick={() => !loading && setOpen(false)}
        >
          <div
            className="w-full max-w-sm border-[3px] border-red-500/60 bg-bg-raised p-6 font-pixel uppercase"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-sm text-red-400">Delete Account</h2>
            <p className="mt-3 text-[10px] leading-5 text-muted normal-case">
              This will permanently delete your account, your building, and all
              associated data: customizations, purchases, achievements, streaks,
              raids, and kudos.
            </p>
            <p className="mt-3 text-[10px] text-red-400">
              This action cannot be undone.
            </p>

            {error && (
              <p className="mt-3 text-[10px] text-red-400 normal-case">{error}</p>
            )}

            <div className="mt-5 flex gap-3">
              <button
                onClick={handleDelete}
                disabled={loading}
                className="flex-1 border-[2px] border-red-500/60 px-4 py-2 text-[10px] text-red-400 transition-colors hover:bg-red-500/10 disabled:opacity-50"
              >
                {loading ? "Deleting..." : "Yes, Delete"}
              </button>
              <button
                onClick={() => setOpen(false)}
                disabled={loading}
                className="flex-1 border-[2px] border-border px-4 py-2 text-[10px] text-muted transition-colors hover:text-cream disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
