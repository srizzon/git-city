"use client";

import { createBrowserSupabase } from "@/lib/supabase";
import { trackSignInClicked } from "@/lib/himetrica";

export default function SignInButton({ accent }: { accent: string }) {
  const handleSignIn = async () => {
    trackSignInClicked("shop");
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/shop` },
    });
  };

  return (
    <button
      onClick={handleSignIn}
      className="btn-press flex items-center gap-2 px-8 py-3.5 text-sm text-bg"
      style={{
        backgroundColor: accent,
        boxShadow: "4px 4px 0 0 #5a7a00",
      }}
    >
      Sign in with GitHub
    </button>
  );
}
