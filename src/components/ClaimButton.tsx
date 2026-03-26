"use client";

import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";

interface Props {
  githubLogin: string;
  claimed: boolean;
}

export default function ClaimButton({ githubLogin, claimed }: Props) {
  const [isClaimed, setIsClaimed] = useState(claimed);
  const [loading, setLoading] = useState(false);
  const [isOwner, setIsOwner] = useState(false);

  const accent = "#c8e64a";

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      if (!user) return;
      const login = (
        user.user_metadata.user_name ??
        user.user_metadata.preferred_username ??
        ""
      ).toLowerCase();
      setIsOwner(login === githubLogin.toLowerCase());
    });
  }, [githubLogin]);

  if (isClaimed) {
    return (
      <div
        className="inline-block border-2 px-3 py-1 text-[10px]"
        style={{ borderColor: accent, color: accent }}
      >
        CLAIMED
      </div>
    );
  }

  if (!isOwner) return null;

  async function handleClaim() {
    setLoading(true);
    try {
      const res = await fetch("/api/claim", { method: "POST" });
      if (res.ok) setIsClaimed(true);
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={handleClaim}
      disabled={loading}
      className="btn-press px-4 py-2 text-[10px] text-bg disabled:opacity-40"
      style={{
        backgroundColor: accent,
        boxShadow: "4px 4px 0 0 #5a7a00",
      }}
    >
      {loading ? "Claiming..." : "Claim My Building"}
    </button>
  );
}
