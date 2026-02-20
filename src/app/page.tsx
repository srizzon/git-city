"use client";

import { useState, useCallback, useEffect, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import {
  generateCityLayout,
  type CityBuilding,
  type CityPlaza,
  type CityDecoration,
} from "@/lib/github";
import Link from "next/link";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
});

const THEMES = [
  { name: "Sunset",   accent: "#c8e64a", shadow: "#5a7a00" },
  { name: "Midnight", accent: "#6090e0", shadow: "#203870" },
  { name: "Neon",     accent: "#e040c0", shadow: "#600860" },
  { name: "Dawn",     accent: "#e08860", shadow: "#804020" },
  { name: "Emerald",  accent: "#39d353", shadow: "#0e4429" },
  { name: "Vapor",    accent: "#e060a0", shadow: "#602050" },
];

interface CityStats {
  total_developers: number;
  total_contributions: number;
}

function HomeContent() {
  const searchParams = useSearchParams();
  const userParam = searchParams.get("user");

  const [username, setUsername] = useState("");
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [plazas, setPlazas] = useState<CityPlaza[]>([]);
  const [decorations, setDecorations] = useState<CityDecoration[]>([]);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [flyMode, setFlyMode] = useState(false);
  const [exploreMode, setExploreMode] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);
  const [hud, setHud] = useState({ speed: 0, altitude: 0 });
  const [flyPaused, setFlyPaused] = useState(false);
  const [stats, setStats] = useState<CityStats>({ total_developers: 0, total_contributions: 0 });
  const [focusedBuilding, setFocusedBuilding] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{
    login: string;
    contributions: number;
    rank: number | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [purchasedItem, setPurchasedItem] = useState<string | null>(null);

  const [isMobile, setIsMobile] = useState(false);

  const theme = THEMES[themeIndex];
  const didInit = useRef(false);
  const savedFocusRef = useRef<string | null>(null);

  // Detect mobile/touch device
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640 || "ontouchstart" in window);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  // Auth state listener
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => setSession(s));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event: string, s: Session | null) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  const authLogin = (
    session?.user?.user_metadata?.user_name ??
    session?.user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  // ESC exits share modal / explore mode / clears focus
  useEffect(() => {
    if (!exploreMode && !focusedBuilding && !shareData) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        if (shareData) setShareData(null);
        else if (focusedBuilding) setFocusedBuilding(null);
        else if (exploreMode) { setExploreMode(false); setFocusedBuilding(savedFocusRef.current); savedFocusRef.current = null; }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exploreMode, focusedBuilding, shareData]);

  const reloadCity = useCallback(async () => {
    const res = await fetch("/api/city?from=0&to=500");
    if (!res.ok) return;
    const data = await res.json();
    setStats(data.stats);
    if (data.developers.length > 0) {
      const layout = generateCityLayout(data.developers);
      setBuildings(layout.buildings);
      setPlazas(layout.plazas);
      setDecorations(layout.decorations);
    }
  }, []);

  // Load city from Supabase on mount
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    async function loadCity() {
      try {
        await reloadCity();
      } catch {
        // City might be empty, that's ok
      } finally {
        setInitialLoading(false);
      }
    }

    loadCity();
  }, [reloadCity]);

  // Focus on building from ?user= query param
  useEffect(() => {
    if (userParam && buildings.length > 0) {
      setFocusedBuilding(userParam);
    }
  }, [userParam, buildings.length]);

  // Detect post-purchase redirect (?purchased=item_id)
  const purchasedParam = searchParams.get("purchased");
  useEffect(() => {
    if (purchasedParam) {
      setPurchasedItem(purchasedParam);
      // Reload city to reflect new purchase
      reloadCity();
      // Clear purchased param from URL after a delay
      const timer = setTimeout(() => setPurchasedItem(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [purchasedParam, reloadCity]);

  const searchUser = useCallback(async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;

    setLoading(true);
    setError(null);
    setFocusedBuilding(null);

    try {
      // Check if dev already exists in the city
      const isNew = !buildings.some(
        (b) => b.login.toLowerCase() === trimmed
      );

      // Add/refresh the developer
      const devRes = await fetch(`/api/dev/${encodeURIComponent(trimmed)}`);
      const devData = await devRes.json();

      if (!devRes.ok) {
        setError(devData.error || "Failed to fetch");
        return;
      }

      // Reload entire city to get updated ranks
      await reloadCity();

      // Focus camera on the searched building
      setFocusedBuilding(devData.github_login);

      // Only show share modal for newly added devs
      if (isNew) {
        setShareData({
          login: devData.github_login,
          contributions: devData.contributions,
          rank: devData.rank,
        });
        setCopied(false);
      }
      setUsername("");
    } catch {
      setError("Network error. Try again.");
    } finally {
      setLoading(false);
    }
  }, [username]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchUser();
  };

  const handleSignIn = async () => {
    const supabase = createBrowserSupabase();
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
  };

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setSession(null);
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/claim", { method: "POST" });
      if (res.ok) {
        await reloadCity();
      }
    } finally {
      setClaiming(false);
    }
  };

  // Determine if the logged-in user can claim their building
  const myBuilding = authLogin
    ? buildings.find((b) => b.login.toLowerCase() === authLogin)
    : null;
  const canClaim = !!session && !!myBuilding && !myBuilding.claimed;

  // Shop link: logged in + claimed → own shop, otherwise → /shop landing
  const shopHref =
    session && myBuilding?.claimed
      ? `/shop/${myBuilding.login}`
      : "/shop";

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg font-pixel uppercase text-warm">
      {/* 3D Canvas */}
      <CityCanvas
        buildings={buildings}
        plazas={plazas}
        decorations={decorations}
        flyMode={flyMode}
        onExitFly={() => { setFlyMode(false); setFlyPaused(false); }}
        themeIndex={themeIndex}
        onHud={(s, a) => setHud({ speed: s, altitude: a })}
        onPause={(p) => setFlyPaused(p)}
        focusedBuilding={focusedBuilding}
        accentColor={theme.accent}
        onClearFocus={() => setFocusedBuilding(null)}
      />

      {/* ─── Fly Mode HUD ─── */}
      {flyMode && (
        <div className="pointer-events-none fixed inset-0 z-30">
          {/* Top bar */}
          <div className="absolute top-4 left-1/2 -translate-x-1/2">
            <div className="inline-flex items-center gap-3 border-[3px] border-border bg-bg/70 px-5 py-2.5 backdrop-blur-sm">
              <span
                className={`h-2 w-2 flex-shrink-0 ${flyPaused ? "" : "blink-dot"}`}
                style={{ backgroundColor: flyPaused ? "#f85149" : theme.accent }}
              />
              <span className="text-[10px] text-cream">
                {flyPaused ? "Paused" : "Fly"}
              </span>
            </div>
          </div>

          {/* Flight data */}
          <div className="absolute bottom-4 left-3 text-[9px] leading-loose text-muted sm:bottom-6 sm:left-6 sm:text-[10px]">
            <div className="flex items-center gap-2">
              <span>SPD</span>
              <span style={{ color: theme.accent }} className="w-6 text-right">
                {Math.round(hud.speed)}
              </span>
              <div className="flex h-[6px] w-20 items-center border border-border/60 bg-bg/50">
                <div
                  className="h-full transition-all duration-150"
                  style={{
                    width: `${Math.round(((hud.speed - 20) / 140) * 100)}%`,
                    backgroundColor: theme.accent,
                  }}
                />
              </div>
            </div>
            <div>
              ALT{" "}
              <span style={{ color: theme.accent }}>
                {Math.round(hud.altitude)}
              </span>
            </div>
          </div>

          {/* Controls hint */}
          <div className="absolute bottom-4 right-3 text-right text-[8px] leading-loose text-muted sm:bottom-6 sm:right-6 sm:text-[9px]">
            {flyPaused ? (
              <>
                <div>
                  <span className="text-cream">Drag</span> orbit
                </div>
                <div>
                  <span className="text-cream">Scroll</span> zoom
                </div>
                <div>
                  <span style={{ color: theme.accent }}>P</span> resume
                </div>
                <div>
                  <span style={{ color: theme.accent }}>ESC</span> exit
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-cream">Mouse</span> steer
                </div>
                <div>
                  <span className="text-cream">Shift</span> boost
                </div>
                <div>
                  <span className="text-cream">Alt</span> slow
                </div>
                <div>
                  <span className="text-cream">Scroll</span> base speed
                </div>
                <div>
                  <span style={{ color: theme.accent }}>P</span> pause
                </div>
                <div>
                  <span style={{ color: theme.accent }}>ESC</span> exit
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Explore Mode: minimal UI ─── */}
      {exploreMode && !flyMode && (
        <div className="pointer-events-none fixed inset-0 z-20">
          {/* Back button */}
          <div className="pointer-events-auto absolute top-3 left-3 sm:top-4 sm:left-4">
            <button
              onClick={() => { setExploreMode(false); setFocusedBuilding(savedFocusRef.current); savedFocusRef.current = null; }}
              className="flex items-center gap-2 border-[3px] border-border bg-bg/70 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
            >
              <span style={{ color: theme.accent }}>ESC</span>
              <span className="text-cream">Back</span>
            </button>
          </div>

          {/* Theme switcher (bottom-left) */}
          <div className="pointer-events-auto absolute bottom-3 left-3 sm:bottom-4 sm:left-4">
            <button
              onClick={() => setThemeIndex((i) => (i + 1) % THEMES.length)}
              className="flex items-center gap-2 border-[3px] border-border bg-bg/70 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
            >
              <span style={{ color: theme.accent }}>&#9654;</span>
              <span className="text-cream">{theme.name}</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Shop (top-left, always visible) ─── */}
      {!flyMode && !exploreMode && (
        <div className="pointer-events-auto fixed top-3 left-3 z-30 sm:top-4 sm:left-4">
          <Link
            href={shopHref}
            className="btn-press flex items-center gap-1.5 px-4 py-2 text-[10px] text-bg"
            style={{
              backgroundColor: theme.accent,
              boxShadow: `2px 2px 0 0 ${theme.shadow}`,
            }}
          >
            Shop
          </Link>
        </div>
      )}

      {/* ─── Auth (top-right) ─── */}
      {!flyMode && !exploreMode && (
        <div className="pointer-events-auto fixed top-3 right-3 z-30 flex flex-wrap items-center justify-end gap-1.5 sm:top-4 sm:right-4 sm:gap-2">
          {!session ? (
            <button
              onClick={handleSignIn}
              className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/80 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
            >
              <span style={{ color: theme.accent }}>G</span>
              <span className="text-cream">Sign in</span>
            </button>
          ) : (
            <>
              {canClaim && (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="btn-press px-3 py-1.5 text-[10px] text-bg disabled:opacity-40"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `2px 2px 0 0 ${theme.shadow}`,
                  }}
                >
                  {claiming ? "..." : "Claim"}
                </button>
              )}
              <Link
                href={`/dev/${authLogin}`}
                className="text-[9px] text-cream normal-case transition-colors hover:text-accent"
              >
                @{authLogin}
              </Link>
              <button
                onClick={handleSignOut}
                className="border-[2px] border-border bg-bg/80 px-2 py-1 text-[9px] text-muted backdrop-blur-sm transition-colors hover:text-cream hover:border-border-light"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      )}

      {/* ─── Main UI Overlay ─── */}
      {!flyMode && !exploreMode && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-between pt-12 pb-4 px-3 sm:py-8 sm:px-4"
          style={{
            background:
              "linear-gradient(to bottom, rgba(13,13,15,0.88) 0%, rgba(13,13,15,0.55) 30%, transparent 60%, transparent 85%, rgba(13,13,15,0.5) 100%)",
          }}
        >
          {/* Top */}
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col items-center gap-3 sm:gap-5">
            <div className="text-center">
              <h1 className="text-2xl text-cream sm:text-3xl md:text-5xl">
                Git{" "}
                <span style={{ color: theme.accent }}>City</span>
              </h1>
              <p className="mt-2 text-[10px] leading-relaxed text-muted normal-case">
                A global city of GitHub developers. Find yourself.
              </p>
            </div>

            {/* Search */}
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-md items-center gap-2"
            >
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="find yourself in the city"
                className="min-w-0 flex-1 border-[3px] border-border bg-bg-raised px-3 py-2 text-xs text-cream outline-none transition-colors placeholder:text-dim sm:px-4 sm:py-2.5"
                style={{ borderColor: undefined }}
                onFocus={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "")}
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="btn-press flex-shrink-0 px-4 py-2 text-xs text-bg disabled:opacity-40 sm:px-5 sm:py-2.5"
                style={{
                  backgroundColor: theme.accent,
                  boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                }}
              >
                {loading ? "..." : "Search"}
              </button>
            </form>

            {error && (
              <p className="text-[10px] text-red-400 normal-case">{error}</p>
            )}

            {initialLoading && (
              <p className="text-[10px] text-muted normal-case">
                Loading city...
              </p>
            )}
          </div>

          {/* Center - Explore buttons */}
          {buildings.length > 0 && (
            <div className="pointer-events-auto flex flex-col items-center gap-2">
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={() => setExploreMode(true)}
                  className="btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                  }}
                >
                  Explore City
                </button>
                {!isMobile && (
                  <button
                    onClick={() => { setFocusedBuilding(null); setFlyMode(true); }}
                    className="btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg"
                    style={{
                      backgroundColor: theme.accent,
                      boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                    }}
                  >
                    &#9992; Fly
                  </button>
                )}
              </div>
              {isMobile && (
                <a
                  href="/leaderboard"
                  className="btn-press mt-1 border-[3px] border-border bg-bg-raised px-5 py-2 text-[10px] backdrop-blur-sm"
                  style={{ color: theme.accent }}
                >
                  &#9819; Leaderboard
                </a>
              )}
            </div>
          )}

          {/* Bottom */}
          <div className="pointer-events-auto flex w-full flex-col items-center gap-3 sm:flex-row sm:items-end sm:justify-between">
            {/* Theme switcher */}
            <button
              onClick={() => setThemeIndex((i) => (i + 1) % THEMES.length)}
              className="group flex items-center gap-2 border-[3px] border-border bg-bg-raised px-3 py-1.5 text-[10px] transition-colors"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.borderColor = theme.accent + "80")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.borderColor = "")
              }
            >
              <span style={{ color: theme.accent }}>&#9654;</span>
              <span className="text-cream">{theme.name}</span>
              <span className="text-dim">
                {themeIndex + 1}/{THEMES.length}
              </span>
            </button>

            {/* Info */}
            <div className="text-center">
              {stats.total_developers > 0 ? (
                <p className="text-[10px] text-dim">
                  {stats.total_developers} developer{stats.total_developers !== 1 && "s"} in
                  the city
                </p>
              ) : buildings.length > 0 ? (
                <p className="text-[10px] text-dim">
                  {buildings.length} building{buildings.length !== 1 && "s"} in
                  the city
                </p>
              ) : (
                <p className="text-[10px] text-dim normal-case">
                  Search for a GitHub username to join the city
                </p>
              )}
              <p className="mt-1 text-[9px] text-muted normal-case">
                built by{" "}
                <a
                  href="https://x.com/samuelrizzondev"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-cream"
                  style={{ color: theme.accent }}
                >
                  @samuelrizzondev
                </a>
              </p>
            </div>

            {/* Mini Leaderboard - hidden on mobile */}
            {buildings.length > 0 && (
              <div className="hidden w-[200px] sm:block">
                <a
                  href="/leaderboard"
                  className="mb-2 block text-right text-xs text-muted transition-colors hover:text-cream normal-case"
                >
                  Leaderboard &rarr;
                </a>
                <div className="border-[2px] border-border bg-bg-raised/80 backdrop-blur-sm">
                  {buildings
                    .slice()
                    .sort((a, b) => a.rank - b.rank)
                    .slice(0, 5)
                    .map((b) => (
                      <a
                        key={b.login}
                        href={`/dev/${b.login}`}
                        className="flex items-center justify-between px-3 py-1.5 transition-colors hover:bg-bg-card"
                      >
                        <span className="flex items-center gap-2 overflow-hidden">
                          <span
                            className="text-[10px]"
                            style={{
                              color:
                                b.rank === 1
                                  ? "#ffd700"
                                  : b.rank === 2
                                    ? "#c0c0c0"
                                    : b.rank === 3
                                      ? "#cd7f32"
                                      : theme.accent,
                            }}
                          >
                            #{b.rank}
                          </span>
                          <span className="truncate text-[10px] text-cream normal-case">
                            {b.login}
                          </span>
                        </span>
                        <span className="ml-2 flex-shrink-0 text-[10px] text-muted">
                          {b.contributions.toLocaleString()}
                        </span>
                      </a>
                    ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Purchase Toast ─── */}
      {purchasedItem && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2">
          <div
            className="border-[3px] px-5 py-2.5 text-[10px] text-bg"
            style={{
              backgroundColor: theme.accent,
              borderColor: theme.shadow,
            }}
          >
            Item purchased! Effect applied to your building.
          </div>
        </div>
      )}

      {/* ─── Share Modal ─── */}
      {shareData && !flyMode && !exploreMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => setShareData(null)}
          />

          {/* Modal */}
          <div className="relative mx-3 border-[3px] border-border bg-bg-raised p-4 text-center sm:mx-0 sm:p-6">
            {/* Close */}
            <button
              onClick={() => setShareData(null)}
              className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream"
            >
              ESC
            </button>

            <p className="text-xs text-cream">Building created!</p>

            <p className="mt-2 text-[10px] text-muted normal-case">
              Rank <span style={{ color: theme.accent }}>#{shareData.rank ?? "?"}</span>
              {" · "}
              <span style={{ color: theme.accent }}>{shareData.contributions.toLocaleString()}</span> contributions
            </p>

            {/* Buttons */}
            <div className="mt-4 flex flex-col items-center gap-2 sm:mt-5 sm:flex-row sm:justify-center sm:gap-3">
              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                  `My building in Git City by @samuelrizzondev: ${shareData.contributions.toLocaleString()} contributions, Rank #${shareData.rank ?? "?"}. Find yours →`
                )}&url=${encodeURIComponent(
                  `${window.location.origin}/dev/${shareData.login}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-press px-4 py-2 text-[10px] text-bg"
                style={{
                  backgroundColor: theme.accent,
                  boxShadow: `3px 3px 0 0 ${theme.shadow}`,
                }}
              >
                Share on X
              </a>

              <button
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/dev/${shareData.login}`
                  );
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="btn-press border-[3px] border-border px-4 py-2 text-[10px] text-cream transition-colors hover:border-border-light"
              >
                {copied ? "Copied!" : "Copy Link"}
              </button>
            </div>

            {/* View profile link */}
            <a
              href={`/dev/${shareData.login}`}
              className="mt-4 inline-block text-[9px] text-muted transition-colors hover:text-cream normal-case"
            >
              View full profile &rarr;
            </a>
          </div>
        </div>
      )}
    </main>
  );
}

export default function Home() {
  return (
    <Suspense>
      <HomeContent />
    </Suspense>
  );
}
