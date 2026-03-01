import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import SignInButton from "./sign-in-button";

export const metadata: Metadata = {
  title: "Shop | 商店 - Git City",
  description: "Customize your building in Git City with effects, structures and more | 在Git City中自定义您的建筑，包括效果、结构和更多",
};

const ACCENT = "#c8e64a";

export default async function ShopLanding() {
  // If user is logged in and has a claimed building, redirect to their shop
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const githubLogin = (
      user.user_metadata?.user_name ??
      user.user_metadata?.preferred_username ??
      ""
    ).toLowerCase();

    if (githubLogin) {
      const sb = getSupabaseAdmin();
      const { data: dev } = await sb
        .from("developers")
        .select("github_login, claimed")
        .eq("github_login", githubLogin)
        .single();

      if (dev?.claimed) {
        redirect(`/shop/${dev.github_login}`);
      }
    }
  }

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <div className="mx-auto max-w-lg px-3 py-6 sm:px-4 sm:py-10">
        {/* Back */}
        <Link
          href="/"
          className="mb-6 inline-block text-sm text-muted transition-colors hover:text-cream sm:mb-8"
        >
          &larr; Back to City | 返回城市
        </Link>

        <div className="border-[3px] border-border bg-bg-raised p-6 sm:p-10">
          <h1 className="text-center text-xl text-cream sm:text-2xl">
            Git City <span style={{ color: ACCENT }}>Shop</span>
          </h1>

          <p className="mt-4 text-center text-[10px] leading-relaxed text-muted normal-case">
            Customize your building with effects, structures and identity items.
            Make your building stand out in the city.
            在Git City中自定义您的建筑，包括效果、结构和更多
            让你的建筑在城市中脱颖而出。
          </p>

          {/* How it works */}
          <div className="mt-6 space-y-3">
            <h2 className="text-xs" style={{ color: ACCENT }}>
              How it works
            </h2>
            <div className="space-y-2 text-[10px] text-muted normal-case">
              <div className="flex gap-3 border-[2px] border-border bg-bg-card px-4 py-3">
                <span style={{ color: ACCENT }}>1.</span>
                <span className="whitespace-pre-line">
                  Sign in with <span className="text-cream">GitHub</span> to
                  connect your account \n
                  使用<span className="text-cream">GitHub</span>登录连接您的账户
                </span>
              </div>
              <div className="flex gap-3 border-[2px] border-border bg-bg-card px-4 py-3">
                <span style={{ color: ACCENT }}>2.</span>
                <span className="whitespace-pre-line">
                  Search your username and{" "}
                  <span className="text-cream">claim</span> your building
                  \n
                  搜索您的用户名并 <span className="text-cream">认领</span> 您的建筑
                </span>
              </div>
              <div className="flex gap-3 border-[2px] border-border bg-bg-card px-4 py-3">
                <span style={{ color: ACCENT }}>3.</span>
                <span className="whitespace-pre-line">
                  Browse the shop and buy items to{" "}
                  <span className="text-cream">customize</span> your building
                  \n
                  浏览商店并购买项目以 <span className="text-cream">自定义</span> 您的建筑
                </span>
              </div>
            </div>
          </div>

          {/* Sign in */}
          <div className="mt-8 flex flex-col items-center gap-3">
            <SignInButton accent={ACCENT} />
            <p className="text-[8px] text-dim normal-case whitespace-pre-line">
              We only read your public profile info \n 我们仅读取您的公开配置文件信息
            </p>
          </div>
        </div>

        {/* Creator credit */}
        <div className="mt-10 border-t border-border/50 pt-4 text-center">
          <p className="text-[9px] text-muted normal-case">
            built by{" "}
            <a
              href="https://x.com/samuelrizzondev"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}
            >
              @samuelrizzondev
            </a>
            Sinicization Contribution by{" "}
            <a href="https://github.com/EndlessPixel"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-cream"
              style={{ color: ACCENT }}>@EndlessPixel
            </a>
          </p>
        </div>
      </div>
    </main>
  );
}
