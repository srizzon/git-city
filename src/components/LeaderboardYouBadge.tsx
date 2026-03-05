"use client";

import { createContext, useContext, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";

// Context: single auth fetch shared by all badges + user position
const AuthLoginContext = createContext<string>("");

export function LeaderboardAuthProvider({ children }: { children: React.ReactNode }) {
  const [authLogin, setAuthLogin] = useState("");

  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getUser().then(({ data: { user } }: { data: { user: User | null } }) => {
      const login = (
        user?.user_metadata?.user_name ??
        user?.user_metadata?.preferred_username ??
        ""
      ).toLowerCase();
      setAuthLogin(login);
    });
  }, []);

  return <AuthLoginContext.Provider value={authLogin}>{children}</AuthLoginContext.Provider>;
}

export function useLeaderboardAuth() {
  return useContext(AuthLoginContext);
}

export default function LeaderboardYouBadge({ login }: { login: string }) {
  const authLogin = useLeaderboardAuth();

  if (!authLogin || authLogin !== login.toLowerCase()) return null;

  return (
    <span className="ml-2 text-[10px]" style={{ color: "#c8e64a" }}>
      YOU
    </span>
  );
}
