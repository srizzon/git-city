"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Props {
  login: string;
  accent: string;
  shadow: string;
}

export default function CompareChallenge({ login, accent, shadow }: Props) {
  const [rival, setRival] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = rival.trim().replace(/^@/, "");
    if (trimmed && trimmed.toLowerCase() !== login.toLowerCase()) {
      router.push(`/?compare=${encodeURIComponent(login)},${encodeURIComponent(trimmed)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={rival}
        onChange={(e) => setRival(e.target.value)}
        placeholder="compare with..."
        className="min-w-0 flex-1 border-[3px] border-border bg-bg-card px-3 py-2.5 text-[10px] text-cream placeholder:text-muted/50 focus:border-border-light focus:outline-none"
      />
      <button
        type="submit"
        disabled={!rival.trim()}
        className="btn-press shrink-0 border-[3px] border-border px-5 py-2.5 text-[10px] text-cream transition-colors hover:border-border-light disabled:opacity-40"
      >
        Compare | 对比
      </button>
    </form>
  );
}
