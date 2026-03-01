"use client";

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { Session } from "@supabase/supabase-js";
import { createBrowserSupabase } from "@/lib/supabase";
import {
  generateCityLayout,
  DISTRICT_NAMES,
  DISTRICT_COLORS,
  type CityBuilding,
  type CityPlaza,
  type CityDecoration,
  type CityRiver,
  type CityBridge,
  type DistrictZone,
} from "@/lib/github";
import Image from "next/image";
import Link from "next/link";
import ActivityTicker, { type FeedEvent } from "@/components/ActivityTicker";
import ActivityPanel from "@/components/ActivityPanel";
import LofiRadio from "@/components/LofiRadio";
import { ITEM_NAMES, ITEM_EMOJIS } from "@/lib/zones";
import { useStreakCheckin } from "@/lib/useStreakCheckin";
import { useLiveUsers } from "@/lib/useLiveUsers";
import { useRaidSequence } from "@/lib/useRaidSequence";
import RaidPreviewModal from "@/components/RaidPreviewModal";
import RaidOverlay from "@/components/RaidOverlay";
import PillModal from "@/components/PillModal";
import FounderMessage from "@/components/FounderMessage";
import RabbitCompletion from "@/components/RabbitCompletion";
import DistrictChooser from "@/components/DistrictChooser";
import LoadingScreen, { type LoadingStage } from "@/components/LoadingScreen";
import MiniMap from "@/components/MiniMap";
import { getCityCache, setCityCache, clearCityCache } from "@/lib/cityCache";
import { DEFAULT_SKY_ADS, buildAdLink, trackAdEvent, trackAdEvents, isBuildingAd } from "@/lib/skyAds";
import { track } from "@vercel/analytics";
import {
  identifyUser,
  trackSignInClicked,
  trackBuildingClaimed,
  trackFreeItemClaimed,
  trackBuildingClicked,
  trackKudosSent,
  trackSearchUsed,
  trackSkyAdImpression,
  trackSkyAdClick,
  trackSkyAdCtaClick,
  trackReferralLinkLanded,
  trackShareClicked,
  trackSignInPromptShown,
  trackSignInPromptClicked,
  trackDisabledButtonClicked,
} from "@/lib/himetrica";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
});

const THEMES = [
  { name: "Midnight 午夜", accent: "#6090e0", shadow: "#203870" },
  { name: "Sunset 日落",   accent: "#c8e64a", shadow: "#5a7a00" },
  { name: "Neon 霓虹",     accent: "#e040c0", shadow: "#600860" },
  { name: "Emerald 翡翠",  accent: "#f0c060", shadow: "#806020" },
];

// Achievement display data for profile card (client-side, mirrors DB)
// 成就显示数据（客户端，与数据库同步）
const TIER_COLORS_MAP: Record<string, string> = {
  bronze: "#cd7f32", silver: "#c0c0c0", gold: "#ffd700", diamond: "#b9f2ff",
};
const TIER_EMOJI_MAP: Record<string, string> = {
  bronze: "\uD83D\uDFE4", silver: "\u26AA", gold: "\uD83D\uDFE1", diamond: "\uD83D\uDC8E",
};
const ACHIEVEMENT_TIERS_MAP: Record<string, string> = {
  god_mode: "diamond", legend: "diamond", famous: "diamond", mayor: "diamond",
  machine: "gold", popular: "gold", factory: "gold", influencer: "gold", philanthropist: "gold", icon: "gold", legendary: "gold",
  grinder: "silver", architect: "silver", patron: "silver", beloved: "silver", admired: "silver",
  first_push: "bronze", committed: "bronze", builder: "bronze", rising_star: "bronze",
  recruiter: "bronze", generous: "bronze", gifted: "bronze", appreciated: "bronze",
  on_fire: "bronze", generous_streak: "bronze",
  dedicated: "silver",
  obsessed: "gold",
  no_life: "diamond",
  white_rabbit: "diamond",
};
const ACHIEVEMENT_NAMES_MAP: Record<string, string> = {
  god_mode: "God Mode", legend: "Legend", famous: "Famous", mayor: "Mayor",
  machine: "Machine", popular: "Popular", factory: "Factory", influencer: "Influencer",
  grinder: "Grinder", architect: "Architect", builder: "Builder", rising_star: "Rising Star",
  recruiter: "Recruiter", committed: "Committed", first_push: "First Push",
  philanthropist: "Philanthropist", patron: "Patron", generous: "Generous",
  icon: "Icon", beloved: "Beloved", gifted: "Gifted",
  legendary: "Legendary", admired: "Admired", appreciated: "Appreciated",
  on_fire: "On Fire", dedicated: "Dedicated", obsessed: "Obsessed",
  no_life: "No Life", generous_streak: "Generous Streak",
  white_rabbit: "White Rabbit",
};

// Dev "class" — funny RPG-style title, deterministic per username
// Dev "class" — 有趣的 RPG 风格标题，根据用户名确定
const DEV_CLASSES = [
  "Vibe Coder",
  "Stack Overflow Tourist",
  "Console.log Debugger",
  "Ctrl+C Ctrl+V Engineer",
  "Senior Googler",
  "Git Push --force Enjoyer",
  "Dark Mode Purist",
  "Rubber Duck Whisperer",
  "Merge Conflict Magnet",
  "README Skipper",
  "npm install Addict",
  "Localhost Champion",
  "Monday Deployer",
  "Production Debugger",
  "Legacy Code Archaeologist",
  "Off-By-One Specialist",
  "Commit Message Poet",
  "Tab Supremacist",
  "Docker Compose Therapist",
  "10x Dev (Self-Proclaimed)",
  "AI Prompt Jockey",
  "Semicolon Forgetter",
  "CSS Trial-and-Error Main",
  "Works On My Machine Dev",
  "TODO: Fix Later Dev",
  "Infinite Loop Survivor",
  "PR Approved (Didn't Read)",
  "LGTM Speed Runner",
  "404 Brain Not Found",
  "Sudo Make Me A Sandwich",
];
function getDevClass(login: string) {
  let h = 0;
  for (let i = 0; i < login.length; i++) h = ((h << 5) - h + login.charCodeAt(i)) | 0;
  return DEV_CLASSES[((h % DEV_CLASSES.length) + DEV_CLASSES.length) % DEV_CLASSES.length];
}

const GITC_CA = "0xd523f92f5f313288cf69ac9ca456b8a7d7a6dba3";
function formatTokenPrice(n: number) {
  if (n < 0.00001) return `$${n.toExponential(2)}`;
  if (n < 0.01) return `$${n.toFixed(6)}`;
  if (n < 1) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(2)}`;
}

interface CityStats {
  total_developers: number;
  total_contributions: number;
}

// Milestones that trigger 24h celebration effects
const CELEBRATION_MILESTONES = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

// ─── Loading phases for search feedback ─────────────────────
const LOADING_PHASES = [
  { delay: 0,     text: "Fetching GitHub profile... \n 正在获取 GitHub 个人资料..." },
  { delay: 2000,  text: "Analyzing contributions... \n 正在分析贡献..." },
  { delay: 5000,  text: "Building the city block... \n 正在构建城市街区..." },
  { delay: 9000,  text: "Almost there... \n 差不多了..." },
  { delay: 13000, text: "This one's a big profile. Hang tight... \n 这个用户的个人资料比较大，耐心等待..." },
];

// Errors that won't change if you retry the same username
const PERMANENT_ERROR_CODES = new Set(["not-found", "org", "no-activity"]);

const ERROR_MESSAGES: Record<string, { primary: (u: string) => string; secondary: string; hasRetry?: boolean; hasLink?: boolean }> = {
  "not-found": {
    primary: (u) => `"@${u}" doesn't exist on GitHub | 该用户不存在于 GitHub 上`,
    secondary: "Check the spelling — could be a typo. GitHub usernames are case-insensitive. \n 请检查用户名拼写是否正确，GitHub 用户名不区分大小写。",
  },
  "org": {
    primary: (u) => `"@${u}" is an organization, not a person | 该用户是组织，不是个人`,
    secondary: "Git City is for individual profiles. Try searching for one of its contributors by their personal username. \n Git City 是针对个人用户的，不支持组织搜索。请尝试搜索其贡献者的个人用户名。",
  },
  "no-activity": {
    primary: (u) => `"@${u}" has no public activity yet | 该用户暂无公开活动`,
    secondary: "Is this you? Open your profile settings, scroll to 'Contributions & activity', and enable 'Include private contributions'. Then search again. \n 是否是您？请打开您的个人资料设置，滚动到 '贡献与活动'，并启用 '包含私有贡献'。然后再次搜索。",
    hasLink: true,
  },
  "rate-limit": {
    primary: () => "Search limit reached | 搜索次数已达上限",
    secondary: "You can look up 10 new profiles per hour. Developers already in the city are unlimited. \n 每个小时最多只能搜索 10 个新用户。已加入城市的开发者没有搜索次数限制。",
  },
  "github-rate-limit": {
    primary: () => "GitHub's API is temporarily unavailable | GitHub API 暂时不可用",
    secondary: "Too many requests to GitHub. Try again in a few minutes. \n 由于 GitHub API 调用次数过多，暂时无法响应。请稍后重试。",
  },
  "network": {
    primary: () => "Couldn't reach the server | 无法连接到服务器",
    secondary: "Check your internet connection and try again. \n 请检查您的互联网连接并稍后重试。",
    hasRetry: true,
  },
  "generic": {
    primary: () => "Something went wrong | 发生了一些错误",
    secondary: "An unexpected error occurred. Try again. \n 发生了一些未知错误，请稍后重试。",
    hasRetry: true,
  },
};

function SearchFeedback({
  feedback,
  accentColor,
  onDismiss,
  onRetry,
}: {
  feedback: { type: "loading" | "error"; code?: string; username?: string; raw?: string } | null;
  accentColor: string;
  onDismiss: () => void;
  onRetry: () => void;
}) {
  const [phaseIndex, setPhaseIndex] = useState(0);

  // Phased loading messages
  useEffect(() => {
    if (feedback?.type !== "loading") { setPhaseIndex(0); return; }
    const timers = LOADING_PHASES.map((phase, i) =>
      setTimeout(() => setPhaseIndex(i), phase.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [feedback?.type]);

  // Auto-dismiss errors after 8s (except persistent ones)
  useEffect(() => {
    if (feedback?.type !== "error") return;
    const code = feedback.code ?? "generic";
    if (code === "no-activity" || code === "network" || code === "generic") return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  if (!feedback) return null;

  // Loading state
  if (feedback.type === "loading") {
    return (
      <div className="flex items-center gap-2 py-1 animate-[fade-in_0.15s_ease-out]">
        <span className="blink-dot h-2 w-2 flex-shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-[11px] text-muted normal-case whitespace-pre-line">{LOADING_PHASES[phaseIndex].text}</span>
      </div>
    );
  }

  // Error state
  const code = feedback.code ?? "generic";
  const msg = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.generic;
  const u = feedback.username ?? "";

  return (
    <div
      className="relative w-full max-w-md border-[3px] bg-bg-raised/90 px-4 py-3 backdrop-blur-sm animate-[fade-in_0.15s_ease-out]"
      style={{ borderColor: code === "rate-limit" ? accentColor + "66" : "rgba(248, 81, 73, 0.4)" }}
    >
      <button onClick={onDismiss} className="absolute top-2 right-2 text-[10px] text-muted transition-colors hover:text-cream">&#10005;</button>
      <p className="text-[11px] text-cream normal-case pr-4">{msg.primary(u)}</p>
      <p className="mt-1 text-[10px] text-muted normal-case whitespace-pre-line">{msg.secondary}</p>
      {msg.hasLink && (
        <a
          href="https://github.com/settings/profile"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[10px] normal-case transition-colors hover:text-cream"
          style={{ color: accentColor }}
        >
          Open Profile Settings &rarr; | 打开个人资料设置 &rarr;
        </a>
      )}
      {msg.hasRetry && (
        <button
          onClick={onRetry}
          className="btn-press mt-2 border-[2px] border-border px-3 py-1 text-[10px] text-cream transition-colors hover:border-border-light"
        >
          Retry | 重试
        </button>
      )}
    </div>
  );
}

const LEADERBOARD_CATEGORIES = [
  { label: "Contributors", key: "contributions" as const, tab: "contributors" },
  { label: "Stars", key: "total_stars" as const, tab: "stars" },
  { label: "Repos", key: "public_repos" as const, tab: "architects" },
] as const;

function MiniLeaderboard({ buildings, accent }: { buildings: CityBuilding[]; accent: string }) {
  const [catIndex, setCatIndex] = useState(0);

  // Auto-rotate every 10s
  useEffect(() => {
    const timer = setInterval(() => {
      setCatIndex((i) => (i + 1) % LEADERBOARD_CATEGORIES.length);
    }, 10000);
    return () => clearInterval(timer);
  }, []);

  const cat = LEADERBOARD_CATEGORIES[catIndex];
  const sorted = buildings
    .slice()
    .sort((a, b) => (b[cat.key] as number) - (a[cat.key] as number))
    .slice(0, 5);

  return (
    <div className="hidden w-[200px] sm:block">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => setCatIndex((i) => (i + 1) % LEADERBOARD_CATEGORIES.length)}
          className="text-[10px] text-muted transition-colors hover:text-cream normal-case"
          style={{ color: accent }}
        >
          {cat.label}
        </button>
        <a
          href={`/leaderboard?tab=${cat.tab}`}
          className="text-[9px] text-muted transition-colors hover:text-cream normal-case"
        >
          View all &rarr; | 查看所有 &rarr;
        </a>
      </div>
      <div className="border-[2px] border-border bg-bg-raised/80 backdrop-blur-sm">
        {sorted.map((b, i) => (
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
                    i === 0 ? "#ffd700"
                    : i === 1 ? "#c0c0c0"
                    : i === 2 ? "#cd7f32"
                    : accent,
                }}
              >
                #{i + 1}
              </span>
              <span className="truncate text-[10px] text-cream normal-case">
                {b.login}
              </span>
            </span>
            <span className="ml-2 flex-shrink-0 text-[10px] text-muted">
              {(b[cat.key] as number).toLocaleString()}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Streak Pill (HUD element, inline next to @username) ────
//  streak 条纹（HUD 元素，内联在 @username 旁边）
function getStreakTierColor(streak: number) {
  if (streak >= 30) return "#aa44ff";
  if (streak >= 14) return "#ff2222";
  if (streak >= 7) return "#ff8833";
  return "#4488ff";
}


function HomeContent() {
  const searchParams = useSearchParams();
  const userParam = searchParams.get("user");
  const giftedParam = searchParams.get("gifted");

  const [username, setUsername] = useState("");
  const failedUsernamesRef = useRef<Map<string, string>>(new Map()); // username -> error code
  const [buildings, setBuildings] = useState<CityBuilding[]>([]);
  const [plazas, setPlazas] = useState<CityPlaza[]>([]);
  const [decorations, setDecorations] = useState<CityDecoration[]>([]);
  const [river, setRiver] = useState<CityRiver | null>(null);
  const [bridges, setBridges] = useState<CityBridge[]>([]);
  const [districtZones, setDistrictZones] = useState<DistrictZone[]>([]);
  const [loading, setLoading] = useState(false);
  // Loading state machine — skip on return visits that still have cached data
  const [loadStage, setLoadStage] = useState<LoadingStage>(() => getCityCache() ? "done" : "init");
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const initialLoading = loadStage !== "done";
  const [feedback, setFeedback] = useState<{
    type: "loading" | "error";
    code?: "not-found" | "org" | "no-activity" | "rate-limit" | "github-rate-limit" | "network" | "generic";
    username?: string;
    raw?: string;
  } | null>(null);
  const [flyMode, setFlyMode] = useState(false);
  const [flyVehicle, setFlyVehicle] = useState<string>("airplane");
  const [introMode, setIntroMode] = useState(false);
  const [introPhase, setIntroPhase] = useState(-1); // -1 = not started, 0-3 = text phases, 4 = done
  const [exploreMode, setExploreMode] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);
  const [hud, setHud] = useState({ speed: 0, altitude: 0 });
  const [playerPos, setPlayerPos] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [districtAnnouncement, setDistrictAnnouncement] = useState<{ name: string; color: string; population: number } | null>(null);
  const lastDistrictRef = useRef<string | null>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announceCooldownRef = useRef(0);
  const [flyPaused, setFlyPaused] = useState(false);
  const [flyPauseSignal, setFlyPauseSignal] = useState(0);
  const [stats, setStats] = useState<CityStats>({ total_developers: 0, total_contributions: 0 });
  const [milestoneCelebrations, setMilestoneCelebrations] = useState<{ milestone: number; reached_at: string }[]>([]);
  const [focusedBuilding, setFocusedBuilding] = useState<string | null>(null);
  const [shareData, setShareData] = useState<{
    login: string;
    contributions: number;
    rank: number | null;
    avatar_url: string | null;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [purchasedItem, setPurchasedItem] = useState<string | null>(null);
  const [selectedBuilding, setSelectedBuilding] = useState<CityBuilding | null>(null);
  const [giftClaimed, setGiftClaimed] = useState(false);
  const [claimingGift, setClaimingGift] = useState(false);
  const [feedEvents, setFeedEvents] = useState<FeedEvent[]>([]);
  const [feedPanelOpen, setFeedPanelOpen] = useState(false);
  const [kudosSending, setKudosSending] = useState(false);
  const [kudosSent, setKudosSent] = useState(false);
  const [kudosError, setKudosError] = useState<string | null>(null);
  const [focusDist, setFocusDist] = useState(999);
  const visitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compareBuilding, setCompareBuilding] = useState<CityBuilding | null>(null);
  const [comparePair, setComparePair] = useState<[CityBuilding, CityBuilding] | null>(null);
  const [compareSelfHint, setCompareSelfHint] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftItems, setGiftItems] = useState<{ id: string; price_usd_cents: number; owned: boolean }[] | null>(null);
  const [giftBuying, setGiftBuying] = useState<string | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const [compareLang, setCompareLang] = useState<"en" | "pt">("en");
  const [clickedAd, setClickedAd] = useState<import("@/lib/skyAds").SkyAd | null>(null);
  const [skyAds, setSkyAds] = useState<import("@/lib/skyAds").SkyAd[]>(DEFAULT_SKY_ADS);
  const [gitcPrice, setGitcPrice] = useState<{ priceUsd: string; change24h: number } | null>(null);
  const [caCopied, setCaCopied] = useState(false);
  const [pillModalOpen, setPillModalOpen] = useState(false);
  const [founderMessageOpen, setFounderMessageOpen] = useState(false);
  const [districtChooserOpen, setDistrictChooserOpen] = useState(false);
  const [rabbitCinematic, setRabbitCinematic] = useState(false);
  const [rabbitCinematicPhase, setRabbitCinematicPhase] = useState(-1);
  const [rabbitProgress, setRabbitProgress] = useState(() => {
    if (typeof window === "undefined") return 0;
    return parseInt(localStorage.getItem("gitcity_rabbit_progress") ?? "0", 10) || 0;
  });
  const [rabbitSighting, setRabbitSighting] = useState<number | null>(null);
  const [rabbitCompletion, setRabbitCompletion] = useState(false);
  const [rabbitHintFlash, setRabbitHintFlash] = useState<string | null>(null);

  // Growth optimization (A1: sign-in prompt, A5: ad direct open)
  // 增长优化（A1：登录提示，A5：广告直接打开）
  const buildingClickCountRef = useRef(0);
  const signInPromptShownRef = useRef(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
  const [adToast, setAdToast] = useState<string | null>(null);

  // A8: Ghost preview for own building
  // A8：自有建筑的幽灵预览
  const ghostPreviewShownRef = useRef(false);
  const [ghostPreviewLogin, setGhostPreviewLogin] = useState<string | null>(null);

  // Raid system
  const [raidState, raidActions] = useRaidSequence();
  const prevRaidPhaseRef = useRef<string>("idle");
  const lastSuccessfulRaidRef = useRef<{ defenderLogin: string; attackerLogin: string; tagStyle: string } | null>(null);

  // Track successful raid data before state resets
  // 在状态重置之前跟踪成功的raid数据
  useEffect(() => {
    if (raidState.raidData?.success && raidState.defenderBuilding) {
      lastSuccessfulRaidRef.current = {
        defenderLogin: raidState.defenderBuilding.login,
        attackerLogin: raidState.raidData.attacker.login,
        tagStyle: raidState.raidData.tag_style,
      };
    }
  }, [raidState.raidData, raidState.defenderBuilding]);

  // Update building with raid tag when raid exits
  // 当raid退出时，更新建筑上的raid标签
  useEffect(() => {
    const prev = prevRaidPhaseRef.current;
    prevRaidPhaseRef.current = raidState.phase;

    if (raidState.phase === "idle" && prev !== "idle" && prev !== "preview" && lastSuccessfulRaidRef.current) {
      const { defenderLogin, attackerLogin, tagStyle } = lastSuccessfulRaidRef.current;
      lastSuccessfulRaidRef.current = null;
      setBuildings((prev) =>
        prev.map((b) =>
          b.login === defenderLogin
            ? {
                ...b,
                active_raid_tag: {
                  attacker_login: attackerLogin,
                  tag_style: tagStyle,
                  expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
                },
              }
            : b
        )
      );
    }
  }, [raidState.phase]);

  // Fetch ads from DB (fallback to DEFAULT_SKY_ADS on error)
  // 从DB获取广告（出错时回退到DEFAULT_SKY_ADS）
  useEffect(() => {
    fetch("/api/sky-ads")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data) && data.length > 0) setSkyAds(data); })
      .catch(() => {});
  }, []);

  // Fetch $GITC price from DexScreener + poll every 30s
  // 从DexScreener获取$GITC价格 + 每30秒轮询一次
  useEffect(() => {
    let cancelled = false;
    const fetchPrice = () =>
      fetch(`https://api.dexscreener.com/latest/dex/tokens/${GITC_CA}`)
        .then((r) => r.json())
        .then((d) => {
          if (cancelled || !d.pairs?.[0]) return;
          const p = d.pairs[0];
          setGitcPrice({ priceUsd: p.priceUsd, change24h: p.priceChange?.h24 ?? 0 });
        })
        .catch(() => {});
    fetchPrice();
    const id = setInterval(fetchPrice, 30_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  // Derived — second focused building for dual-focus camera
  // 派生 — 双焦点相机的第二个聚焦建筑
  const focusedBuildingB = comparePair ? comparePair[1].login : null;

  const [isMobile, setIsMobile] = useState(false);

  const theme = THEMES[themeIndex];
  const didInit = useRef(false);
  const savedFocusRef = useRef<string | null>(null);

  // Detect mobile/touch device
  // 检测移动/触摸设备
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 640 || "ontouchstart" in window);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  const copyCA = useCallback(() => {
    navigator.clipboard.writeText(GITC_CA);
    setCaCopied(true);
    setTimeout(() => setCaCopied(false), 2000);
  }, []);

  // Auth state listener
  // 认证状态监听器
  useEffect(() => {
    const supabase = createBrowserSupabase();
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      if (s) {
        const login = (s.user?.user_metadata?.user_name ?? s.user?.user_metadata?.preferred_username ?? "").toLowerCase();
        if (login) identifyUser({ github_login: login, email: s.user?.email ?? undefined });
      }
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event: string, s: Session | null) => {
      setSession(s);
      if (s && event !== "TOKEN_REFRESHED") {
        const login = (s.user?.user_metadata?.user_name ?? s.user?.user_metadata?.preferred_username ?? "").toLowerCase();
        if (login) identifyUser({ github_login: login, email: s.user?.email ?? undefined });
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  const authLogin = (
    session?.user?.user_metadata?.user_name ??
    session?.user?.user_metadata?.preferred_username ??
    ""
  ).toLowerCase();

  // Fetch fly vehicle from raid loadout (on login)
  // 从raid负载中获取飞车（登录时）
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (!sessionUserId) return;
    fetch("/api/raid/loadout")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.vehicle) setFlyVehicle(data.vehicle); })
      .catch(() => {});
  }, [sessionUserId]);

  // Save ?ref= to localStorage (7-day expiry)
  // 保存 ?ref= 到 localStorage（7天过期）
  useEffect(() => {
    const ref = searchParams.get("ref");
    if (ref) {
      trackReferralLinkLanded(ref);
      try {
        localStorage.setItem("gc_ref", JSON.stringify({ login: ref, expires: Date.now() + 7 * 86400000 }));
      } catch { /* ignore */ }
    }
  }, [searchParams]);

  // Forward ref from localStorage to auth callback URL
  // 从 localStorage 转发 ref 到认证回调 URL
  const handleSignInWithRef = useCallback(async () => {
    trackSignInClicked("city");
    const supabase = createBrowserSupabase();
    let redirectTo = `${window.location.origin}/auth/callback`;
    try {
      const raw = localStorage.getItem("gc_ref");
      if (raw) {
        const { login, expires } = JSON.parse(raw);
        if (Date.now() < expires && login) {
          redirectTo += `?ref=${encodeURIComponent(login)}`;
        }
      }
    } catch { /* ignore */ }
    await supabase.auth.signInWithOAuth({
      provider: "github",
      options: { redirectTo },
    });
  }, []);

  // Fetch activity feed on mount + poll every 60s
  // 挂载时获取活动流 + 每60秒轮询一次
  useEffect(() => {
    let cancelled = false;
    const fetchFeed = async () => {
      try {
        const res = await fetch("/api/feed?limit=50&today=1");
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setFeedEvents(data.events ?? []);
      } catch { /* ignore */ }
    };
    fetchFeed();
    const interval = setInterval(fetchFeed, 120000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  // Visit tracking: fire visit POST after 3s of profile card open
  // 访问跟踪：在打开个人资料卡片3秒后触发访问 POST
  useEffect(() => {
    if (selectedBuilding && session && selectedBuilding.login.toLowerCase() !== authLogin) {
      visitTimerRef.current = setTimeout(async () => {
        try {
          const building = buildings.find(b => b.login === selectedBuilding.login);
          if (!building) return;
          await fetch("/api/interactions/visit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ building_login: selectedBuilding.login }),
          });
        } catch { /* ignore */ }
      }, 3000);
    }
    return () => {
      if (visitTimerRef.current) clearTimeout(visitTimerRef.current);
    };
  }, [selectedBuilding, session, authLogin, buildings]);

  // Kudos handler
  const handleGiveKudos = useCallback(async () => {
    if (!selectedBuilding || kudosSending || kudosSent || !session) return;
    if (selectedBuilding.login.toLowerCase() === authLogin) return;
    setKudosSending(true);
    setKudosError(null);
    try {
      const res = await fetch("/api/interactions/kudos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receiver_login: selectedBuilding.login }),
      });
      if (res.ok) {
        trackKudosSent(selectedBuilding.login);
        setKudosSent(true);
        // Increment kudos_count locally
        // 本地增加 kudos_count
        const newCount = (selectedBuilding.kudos_count ?? 0) + 1;
        setSelectedBuilding({ ...selectedBuilding, kudos_count: newCount });
        setBuildings((prev) =>
          prev.map((b) =>
            b.login === selectedBuilding.login ? { ...b, kudos_count: newCount } : b
          )
        );
        setTimeout(() => setKudosSent(false), 3000);
      } else {
        const body = await res.json().catch(() => null);
        const msg = body?.error || "Could not send kudos";
        setKudosError(msg);
        setTimeout(() => setKudosError(null), 3000);
      }
    } catch { /* ignore */ }
    finally { setKudosSending(false); }
  }, [selectedBuilding, kudosSending, kudosSent, session, authLogin]);

  // Gift: open modal with available items
  // 礼物：打开包含可用物品的弹窗
  const handleOpenGift = useCallback(async () => {
    if (!selectedBuilding || !session) return;
    setGiftModalOpen(true);
    setGiftItems(null);
    try {
      const res = await fetch("/api/items");
      if (!res.ok) return;
      const { items } = await res.json();
      const receiverOwned = new Set(selectedBuilding.owned_items ?? []);
      const NON_GIFTABLE = new Set(["flag", "custom_color"]);
      const available = (items as { id: string; price_usd_cents: number; category: string }[])
        .filter((i) => i.price_usd_cents > 0 && !NON_GIFTABLE.has(i.id))
        .map((i) => ({ ...i, owned: receiverOwned.has(i.id) }));
      setGiftItems(available);
    } catch { /* ignore */ }
  }, [selectedBuilding, session]);

  // Gift: checkout for receiver
  // 礼物：为接收者结账
  const handleGiftCheckout = useCallback(async (itemId: string) => {
    if (!selectedBuilding || giftBuying) return;
    setGiftBuying(itemId);
    try {
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          provider: "stripe",
          gifted_to_login: selectedBuilding.login,
        }),
      });
      const data = await res.json();
      if (res.ok && data.url) {
        window.location.href = data.url;
      }
    } catch { /* ignore */ }
    finally { setGiftBuying(null); }
  }, [selectedBuilding, giftBuying]);

  const lastDistRef = useRef(999);

  const endRabbitCinematic = useCallback(() => {
    setRabbitCinematic(false);
    setRabbitCinematicPhase(-1);
  }, []);

  // ESC: layered dismissal
  // During fly mode: only close overlays (profile card) — AirplaneFlight handles pause/exit
  // Outside fly mode: compare → share modal → profile card → focus → explore mode

  // EndlessPixel的吐槽： 我也不知道翻译的什么鬼，机翻的结果

  // ESC: 分阶段裁员
  // 在飞行模式下：仅关闭覆盖层（个人资料卡）——AirplaneFlight 负责暂停/退出
  // 外部模式下：比较 → 分享弹窗 → 个人资料卡 → 关注 → 探索模式
  useEffect(() => {
    if (flyMode && !selectedBuilding) return;
    if (!flyMode && !exploreMode && !focusedBuilding && !shareData && !selectedBuilding && !giftClaimed && !giftModalOpen && !comparePair && !compareBuilding && !founderMessageOpen && !pillModalOpen && !rabbitCinematic && raidState.phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        // Founder modals take highest priority
        if (founderMessageOpen) { setFounderMessageOpen(false); return; }
        if (pillModalOpen) { setPillModalOpen(false); return; }
        // Rabbit cinematic
        if (rabbitCinematic) { endRabbitCinematic(); return; }
        // Raid takes priority
        if (raidState.phase !== "idle") {
          if (raidState.phase === "preview") {
            raidActions.exitRaid();
          } else if (raidState.phase === "flight" || raidState.phase === "attack") {
            raidActions.skipToShare();
          } else if (raidState.phase === "share") {
            raidActions.exitRaid();
          } else {
            raidActions.exitRaid();
          }
          return;
        }
        if (flyMode && selectedBuilding) {
          setSelectedBuilding(null);
          setFocusedBuilding(null);
        } else if (!flyMode) {
          // Compare states take priority after fly mode
          if (comparePair) {
            // Return to building A's profile card
            setSelectedBuilding(comparePair[0]);
            setFocusedBuilding(comparePair[0].login);
            setComparePair(null);
            setCompareBuilding(null);
          } else if (compareBuilding) {
            // Cancel pick, restore profile card of first building
            setSelectedBuilding(compareBuilding);
            setFocusedBuilding(compareBuilding.login);
            setCompareBuilding(null);
          } else if (giftModalOpen) { setGiftModalOpen(false); setGiftItems(null); }
            else if (giftClaimed) setGiftClaimed(false);
          else if (shareData) { setShareData(null); setSelectedBuilding(null); setFocusedBuilding(null); }
          else if (selectedBuilding) { setSelectedBuilding(null); setFocusedBuilding(null); }
          else if (focusedBuilding) setFocusedBuilding(null);
          else if (exploreMode) { setExploreMode(false); setFocusedBuilding(savedFocusRef.current); savedFocusRef.current = null; }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyMode, exploreMode, focusedBuilding, shareData, selectedBuilding, giftClaimed, giftModalOpen, comparePair, compareBuilding, founderMessageOpen, pillModalOpen, rabbitCinematic, endRabbitCinematic, raidState.phase, raidActions]);

  // Rabbit cinematic text phase timing (8s total flyover)
  useEffect(() => {
    if (!rabbitCinematic) {
      setRabbitCinematicPhase(-1);
      return;
    }
    const timers: ReturnType<typeof setTimeout>[] = [];
    // Phase 0: "Follow the white rabbit..." at 0.5s
    timers.push(setTimeout(() => setRabbitCinematicPhase(0), 500));
    // Phase 1: "It hides among the plazas..." at 4.0s
    timers.push(setTimeout(() => setRabbitCinematicPhase(1), 4000));
    return () => timers.forEach(clearTimeout);
  }, [rabbitCinematic]);

  // Fetch rabbit progress on login — sync local progress to server
  useEffect(() => {
    if (!session) return;
    (async () => {
      try {
        const res = await fetch("/api/rabbit?check=true");
        if (!res.ok) return;
        const data = await res.json();
        const serverProgress = data?.progress ?? 0;
        const localProgress = parseInt(localStorage.getItem("gitcity_rabbit_progress") ?? "0", 10) || 0;

        // Sync local progress to server if ahead (silently fails if no claimed building)
        if (localProgress > serverProgress) {
          for (let s = serverProgress + 1; s <= localProgress; s++) {
            const sr = await fetch("/api/rabbit", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ sighting: s }),
            });
            if (!sr.ok) break; // stop sync if server rejects (e.g. no claimed building)
          }
        }

        const best = Math.max(serverProgress, localProgress);
        setRabbitProgress(best);
        localStorage.setItem("gitcity_rabbit_progress", String(best));
        if (best > 0 && best < 5) {
          setRabbitSighting(best + 1);
        }
        if (best >= 5 && serverProgress < 5 && localProgress >= 5) {
          setRabbitCompletion(true);
        }
      } catch {}
    })();
  }, [session]);

  // Auto-dismiss rabbit hint flash
  useEffect(() => {
    if (!rabbitHintFlash) return;
    const t = setTimeout(() => setRabbitHintFlash(null), 3000);
    return () => clearTimeout(t);
  }, [rabbitHintFlash]);

  // Handle rabbit caught
  const onRabbitCaught = useCallback(async () => {
    if (!rabbitSighting) return;
    const sighting = rabbitSighting;
    setRabbitSighting(null);

    // Try to save to API (works when logged in + has claimed building)
    const login = (session?.user?.user_metadata?.user_name ?? "").toLowerCase();
    const claimed = login && buildings.some((b) => b.login.toLowerCase() === login && b.claimed);
    if (session && claimed) {
      try {
        const res = await fetch("/api/rabbit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sighting }),
        });
        const data = await res.json();
        if (res.ok) {
          setRabbitProgress(data.progress);
          localStorage.setItem("gitcity_rabbit_progress", String(data.progress));

          if (data.completed) {
            setRabbitCompletion(true);
            return;
          }
          setRabbitHintFlash("The rabbit moves deeper...");
          setTimeout(() => setRabbitSighting(data.progress + 1), 2000);
          return;
        }
      } catch {
        // Fall through to local tracking
      }
    }

    // Local tracking (not logged in or API failed)
    const newProgress = sighting;
    setRabbitProgress(newProgress);
    localStorage.setItem("gitcity_rabbit_progress", String(newProgress));

    if (sighting >= 5) {
      // Final sighting: need login to save achievement
      handleSignInWithRef();
      return;
    }

    // Sightings 1-4: advance locally
    setRabbitHintFlash("The rabbit moves deeper...");
    setTimeout(() => setRabbitSighting(newProgress + 1), 2000);
  }, [rabbitSighting, session, buildings, handleSignInWithRef]);

  const reloadCity = useCallback(async (bustCache = false) => {
    if (bustCache) clearCityCache();
    const cacheBust = bustCache ? `&_t=${Date.now()}` : "";
    const CHUNK = 1000;
    const res = await fetch(`/api/city?from=0&to=${CHUNK}${cacheBust}`);
    if (!res.ok) return null;
    const data = await res.json();
    setStats(data.stats);
    if (data.developers.length === 0) return null;

    // Render downtown immediately
    const layout = generateCityLayout(data.developers);
    setBuildings(layout.buildings);
    setPlazas(layout.plazas);
    setDecorations(layout.decorations);
    setRiver(layout.river);
    setBridges(layout.bridges);
    setDistrictZones(layout.districtZones);

    const total = data.stats?.total_developers ?? 0;
    if (total <= CHUNK) {
      setCityCache({ ...layout, stats: data.stats });
      return layout.buildings;
    }

    // Fetch remaining chunks in parallel
    const promises: Promise<{ developers: typeof data.developers } | null>[] = [];
    for (let from = CHUNK; from < total; from += CHUNK) {
      promises.push(
        fetch(`/api/city?from=${from}&to=${from + CHUNK}${cacheBust}`)
          .then(r => r.ok ? r.json() : null)
      );
    }
    const results = await Promise.all(promises);
    let allDevs = [...data.developers];
    for (const chunk of results) {
      if (chunk?.developers?.length) {
        allDevs = [...allDevs, ...chunk.developers];
      }
    }

    // Regenerate full layout with all developers
    const fullLayout = generateCityLayout(allDevs);
    setBuildings(fullLayout.buildings);
    setPlazas(fullLayout.plazas);
    setDecorations(fullLayout.decorations);
    setRiver(fullLayout.river);
    setBridges(fullLayout.bridges);
    setDistrictZones(fullLayout.districtZones);
    setCityCache({ ...fullLayout, stats: data.stats });
    return fullLayout.buildings;
  }, []);

  // Handle loading fade complete: transition to "done" and trigger intro
  const handleLoadFadeComplete = useCallback(() => {
    setLoadStage("done");
    const hasDeepLink = searchParams.get("user") || searchParams.get("compare");
    if (!localStorage.getItem("gitcity_intro_seen") && !hasDeepLink) {
      setIntroMode(true);
    }
  }, [searchParams]);

  // Retry handler for loading errors
  const handleLoadRetry = useCallback(() => {
    setLoadStage("init");
    setLoadProgress(0);
    setLoadError(null);
    didInit.current = false;
  }, []);

  // Load city from Supabase on mount
  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    // Return visit: restore from cache or fetch silently
    if (loadStage === "done") {
      const cached = getCityCache();
      if (cached) {
        setBuildings(cached.buildings);
        setPlazas(cached.plazas);
        setDecorations(cached.decorations);
        setRiver(cached.river);
        setBridges(cached.bridges);
        setDistrictZones(cached.districtZones);
        setStats(cached.stats);
      } else {
        reloadCity().catch(() => {});
      }
      return;
    }

    const loadStartTime = performance.now();

    async function loadCity() {
      try {
        // WebGL check
        setLoadStage("init");
        setLoadProgress(3);
        const canvas = document.createElement("canvas");
        const gl = canvas.getContext("webgl") || canvas.getContext("experimental-webgl");
        if (!gl) {
          setLoadError("Your browser does not support WebGL. Try Chrome, Firefox, or Edge.");
          setLoadStage("error");
          return;
        }

        // Fetch first chunk
        setLoadStage("fetching");
        setLoadProgress(10);

        const CHUNK = 1000;
        const res = await fetch(`/api/city?from=0&to=${CHUNK}`);
        if (!res.ok) throw new Error("Failed to fetch city data");
        const data = await res.json();

        setLoadProgress(30);

        if (data.developers.length === 0) {
          // Empty city, skip to ready
          setLoadProgress(100);
          setLoadStage("ready");
          return;
        }

        // Generate layout
        setLoadStage("generating");
        setLoadProgress(45);
        await new Promise((r) => setTimeout(r, 0)); // yield to browser

        setStats(data.stats);
        let finalLayout = generateCityLayout(data.developers);
        setBuildings(finalLayout.buildings);
        setPlazas(finalLayout.plazas);
        setDecorations(finalLayout.decorations);
        setRiver(finalLayout.river);
        setBridges(finalLayout.bridges);
        setDistrictZones(finalLayout.districtZones);

        setLoadProgress(55);

        // Rendering: wait for Canvas to process data (2 rAF + fallback)
        setLoadStage("rendering");
        setLoadProgress(65);

        await new Promise<void>((resolve) => {
          let resolved = false;
          const done = () => {
            if (resolved) return;
            resolved = true;
            resolve();
          };
          // 2 chained rAFs
          requestAnimationFrame(() => {
            requestAnimationFrame(() => done());
          });
          // Fallback for hidden tabs where rAF doesn't fire
          setTimeout(done, 500);
        });

        setLoadProgress(80);

        // Fetch remaining chunks if needed
        const total = data.stats?.total_developers ?? 0;
        if (total > CHUNK) {
          const promises: Promise<{ developers: typeof data.developers } | null>[] = [];
          for (let from = CHUNK; from < total; from += CHUNK) {
            promises.push(
              fetch(`/api/city?from=${from}&to=${from + CHUNK}`)
                .then((r) => (r.ok ? r.json() : null))
            );
          }
          const results = await Promise.all(promises);
          let allDevs = [...data.developers];
          for (const chunk of results) {
            if (chunk?.developers?.length) {
              allDevs = [...allDevs, ...chunk.developers];
            }
          }
          finalLayout = generateCityLayout(allDevs);
          setBuildings(finalLayout.buildings);
          setPlazas(finalLayout.plazas);
          setDecorations(finalLayout.decorations);
          setRiver(finalLayout.river);
          setBridges(finalLayout.bridges);
          setDistrictZones(finalLayout.districtZones);
        }

        // Save to cache for return visits
        setCityCache({ ...finalLayout, stats: data.stats });
        setLoadProgress(95);

        // Enforce minimum 800ms display time to avoid flash
        const elapsed = performance.now() - loadStartTime;
        if (elapsed < 800) {
          await new Promise((r) => setTimeout(r, 800 - elapsed));
        }

        setLoadProgress(100);
        setLoadStage("ready");
      } catch (err) {
        setLoadError(err instanceof Error ? err.message : "Something went wrong");
        setLoadStage("error");
      }
    }

    loadCity();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadStage]);

  // City reload on tab return removed — navigating back from shop already
  // re-mounts the component and loads fresh data via the mount effect above.

  // ─── Intro text phase timing (14s total) ─────────────────────
  // Phase 0: "Somewhere in the internet..."   0.8s → fade out ~3.8s
  // Phase 1: "Developers became buildings"    4.2s → fade out ~7.2s
  // Phase 2: "And commits became floors"      7.6s → fade out ~10.6s
  // Phase 3: "Welcome to Git City"            11.0s → confetti + hold until end
  const INTRO_TEXT_SCHEDULE = [800, 4200, 7600, 11000];
  const [introConfetti, setIntroConfetti] = useState(false);

  useEffect(() => {
    if (!introMode) {
      setIntroPhase(-1);
      setIntroConfetti(false);
      return;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    for (let i = 0; i < INTRO_TEXT_SCHEDULE.length; i++) {
      timers.push(setTimeout(() => setIntroPhase(i), INTRO_TEXT_SCHEDULE[i]));
    }
    // Confetti shortly after "Welcome to Git City"
    timers.push(setTimeout(() => setIntroConfetti(true), INTRO_TEXT_SCHEDULE[3] + 500));

    return () => timers.forEach(clearTimeout);
  }, [introMode]);

  const endIntro = useCallback(() => {
    setIntroMode(false);
    setIntroPhase(-1);
    setIntroConfetti(false);
    localStorage.setItem("gitcity_intro_seen", "true");
  }, []);

  const replayIntro = useCallback(() => {
    setIntroMode(true);
    setIntroPhase(-1);
    setIntroConfetti(false);
  }, []);

  // Focus on building from ?user= query param (skip if gift redirect, handled separately)
  const didFocusUserParam = useRef(false);
  useEffect(() => {
    if (!userParam || giftedParam || buildings.length === 0) return;

    const found = buildings.find(
      (b) => b.login.toLowerCase() === userParam.toLowerCase()
    );
    if (!found) return; // Not loaded yet, wait for next chunk

    if (!didFocusUserParam.current) {
      // First focus: enter explore mode
      didFocusUserParam.current = true;
      setFocusedBuilding(userParam);
      setSelectedBuilding(found);
      setExploreMode(true);
    } else {
      // Buildings array was replaced (full layout loaded) — keep selectedBuilding in sync
      setSelectedBuilding(prev =>
        prev && prev.login.toLowerCase() === userParam.toLowerCase() ? found : prev
      );
    }
  }, [userParam, giftedParam, buildings]);

  // Handle ?compare=userA,userB deep link
  const compareParam = searchParams.get("compare");
  const didHandleCompareParam = useRef(false);
  useEffect(() => {
    if (!compareParam || buildings.length === 0 || didHandleCompareParam.current) return;
    const parts = compareParam.split(",").map(s => s.trim().toLowerCase());
    if (parts.length !== 2 || parts[0] === parts[1]) return;

    const bA = buildings.find(b => b.login.toLowerCase() === parts[0]);
    const bB = buildings.find(b => b.login.toLowerCase() === parts[1]);

    if (bA && bB) {
      didHandleCompareParam.current = true;
      setComparePair([bA, bB]);
      setFocusedBuilding(bA.login);
      setExploreMode(true);
      return;
    }

    // One or both devs not loaded yet — fetch them, reload city, then compare
    didHandleCompareParam.current = true;
    (async () => {
      const missing = [!bA ? parts[0] : null, !bB ? parts[1] : null].filter(Boolean);
      await Promise.all(
        missing.map(login => fetch(`/api/dev/${encodeURIComponent(login!)}`))
      );
      const updated = await reloadCity(true);
      if (!updated) return;
      const foundA = updated.find((b: CityBuilding) => b.login.toLowerCase() === parts[0]);
      const foundB = updated.find((b: CityBuilding) => b.login.toLowerCase() === parts[1]);
      if (foundA && foundB) {
        setComparePair([foundA, foundB]);
        setFocusedBuilding(foundA.login);
        setExploreMode(true);
      }
    })();
  }, [compareParam, buildings, reloadCity]);

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

  // Detect post-gift redirect (?gifted=item_id&user=login)
  const [giftedInfo, setGiftedInfo] = useState<{ item: string; to: string } | null>(null);
  const didHandleGiftParam = useRef(false);
  useEffect(() => {
    if (giftedParam && userParam && buildings.length > 0 && !didHandleGiftParam.current) {
      didHandleGiftParam.current = true;
      setGiftedInfo({ item: giftedParam, to: userParam });
      reloadCity();
      // Focus on receiver's building
      setFocusedBuilding(userParam);
      const found = buildings.find(
        (b) => b.login.toLowerCase() === userParam.toLowerCase()
      );
      if (found) {
        setSelectedBuilding(found);
        setExploreMode(true);
      }
      const timer = setTimeout(() => setGiftedInfo(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [giftedParam, userParam, buildings, reloadCity]);

  const searchUser = useCallback(async () => {
    const trimmed = username.trim().toLowerCase();
    if (!trimmed) return;

    trackSearchUsed(trimmed);

    // Check if this username already failed with a permanent error
    const cachedError = failedUsernamesRef.current.get(trimmed);
    if (cachedError) {
      setFeedback({ type: "error", code: cachedError as any, username: trimmed });
      return;
    }

    // Snapshot compare state before async work — ESC may clear it mid-flight
    const wasComparing = compareBuilding;

    setLoading(true);
    setFeedback({ type: "loading" });
    setFocusedBuilding(null);
    setSelectedBuilding(null);
    setShareData(null);

    try {
      // Self-compare guard
      if (wasComparing && trimmed === wasComparing.login.toLowerCase()) {
        setCompareSelfHint(true);
        setTimeout(() => setCompareSelfHint(false), 2000);
        setFeedback(null);
        return;
      }

      // Check if dev already exists in the city before the fetch
      const existedBefore = buildings.some(
        (b) => b.login.toLowerCase() === trimmed
      );

      // Add/refresh the developer
      const devRes = await fetch(`/api/dev/${encodeURIComponent(trimmed)}`);
      const devData = await devRes.json();

      if (!devRes.ok) {
        let code: "not-found" | "org" | "no-activity" | "rate-limit" | "github-rate-limit" | "generic" = "generic";
        if (devRes.status === 404) code = "not-found";
        else if (devRes.status === 429) {
          code = devData.error?.includes("GitHub") ? "github-rate-limit" : "rate-limit";
        } else if (devRes.status === 400) {
          if (devData.error?.includes("Organization")) code = "org";
          else if (devData.error?.includes("no public activity")) code = "no-activity";
        }
        // Cache permanent errors so we don't re-fetch
        if (PERMANENT_ERROR_CODES.has(code)) {
          failedUsernamesRef.current.set(trimmed, code);
        }
        setFeedback({ type: "error", code, username: trimmed, raw: devData.error });
        return;
      }

      setFeedback(null);

      // Only reload city if the dev is new — skip the full reload when they already exist
      let updatedBuildings: CityBuilding[] | null = null;
      if (!existedBefore) {
        updatedBuildings = await reloadCity(true);
      }

      // Focus camera on the searched building
      setFocusedBuilding(devData.github_login);

      // A8: Ghost preview — if user searched for themselves, show temporary effect
      if (
        authLogin &&
        trimmed === authLogin &&
        !ghostPreviewShownRef.current
      ) {
        ghostPreviewShownRef.current = true;
        setGhostPreviewLogin(devData.github_login);
        setTimeout(() => setGhostPreviewLogin(null), 4000);
      }

      // Find the building in the current or updated city
      const searchPool = updatedBuildings ?? buildings;
      const foundBuilding = searchPool.find(
        (b: CityBuilding) => b.login.toLowerCase() === trimmed
      );

      // Compare pick mode: use snapshot so ESC mid-search doesn't cause stale state
      if (wasComparing && !comparePair && foundBuilding) {
        // Only complete if compare mode is still active (not cancelled by ESC)
        if (compareBuilding) {
          setComparePair([wasComparing, foundBuilding]);
          setFocusedBuilding(wasComparing.login);
        } else {
          // Compare was cancelled during search — fall through to normal
          if (foundBuilding) {
            setSelectedBuilding(foundBuilding);
            setExploreMode(true);
          }
        }
      } else if (!existedBefore) {
        // New developer: show the share modal
        setShareData({
          login: devData.github_login,
          contributions: devData.contributions,
          rank: devData.rank,
          avatar_url: devData.avatar_url,
        });
        if (foundBuilding) setSelectedBuilding(foundBuilding);
        setCopied(false);
      } else if (foundBuilding) {
        // Existing developer: enter explore mode and show profile card
        setSelectedBuilding(foundBuilding);
        setExploreMode(true);
      }
      setUsername("");
    } catch {
      setFeedback({ type: "error", code: "network", username: trimmed });
    } finally {
      setLoading(false);
    }
  }, [username, buildings, reloadCity]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    searchUser();
  };

  const handleSignIn = handleSignInWithRef;

  const handleSignOut = async () => {
    await fetch("/api/auth/signout", { method: "POST" });
    setSession(null);
  };

  const handleClaim = async () => {
    setClaiming(true);
    try {
      const res = await fetch("/api/claim", { method: "POST" });
      if (res.ok) {
        trackBuildingClaimed(authLogin);
        await reloadCity();
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleClaimFreeGift = async () => {
    setClaimingGift(true);
    try {
      const res = await fetch("/api/claim-free-item", { method: "POST" });
      if (res.ok) {
        trackFreeItemClaimed();
        await reloadCity();
        setGiftClaimed(true);
      }
    } finally {
      setClaimingGift(false);
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

  // Show free gift CTA when user claimed but hasn't picked up the free item
  const hasFreeGift =
    !!session &&
    !!myBuilding?.claimed &&
    !myBuilding.owned_items.includes("flag");

  // Show district chooser once per session when user hasn't chosen yet
  const shouldShowDistrictChooser =
    !!session && !!myBuilding?.claimed && !myBuilding.district_chosen;

  useEffect(() => {
    if (shouldShowDistrictChooser && !sessionStorage.getItem("district_dismissed")) {
      setDistrictChooserOpen(true);
    }
  }, [shouldShowDistrictChooser]);

  // Streak auto check-in (1x per browser session)
  const { streakData } = useStreakCheckin(session, !!myBuilding?.claimed);

  // Live users presence
  const { count: liveUsers, status: liveStatus } = useLiveUsers();

  // ─── Milestone celebration system ──────────────────────────
  const forceCelebrate = searchParams.has("celebrate");

  const celebrationActive = useMemo(() => {
    if (forceCelebrate) return true;
    if (stats.total_developers < CELEBRATION_MILESTONES[0]) return false;
    const current = [...CELEBRATION_MILESTONES].reverse().find((m) => stats.total_developers >= m);
    if (!current) return false;
    const record = milestoneCelebrations.find((c) => c.milestone === current);
    if (!record) return true;
    const elapsed = Date.now() - new Date(record.reached_at).getTime();
    return elapsed < 24 * 60 * 60 * 1000;
  }, [stats.total_developers, milestoneCelebrations, forceCelebrate]);

  // Fetch milestone celebrations on mount
  useEffect(() => {
    fetch("/api/milestone-celebration")
      .then((r) => r.ok ? r.json() : [])
      .then((data) => { if (Array.isArray(data)) setMilestoneCelebrations(data); })
      .catch(() => {});
  }, []);

  // Record milestone when crossed
  useEffect(() => {
    if (stats.total_developers < CELEBRATION_MILESTONES[0]) return;
    const current = [...CELEBRATION_MILESTONES].reverse().find((m) => stats.total_developers >= m);
    if (!current) return;
    const alreadyRecorded = milestoneCelebrations.some((c) => c.milestone === current);
    if (alreadyRecorded) return;
    fetch("/api/milestone-celebration", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ total_developers: stats.total_developers }),
    })
      .then((r) => r.json())
      .then((data) => {
        if (data.celebrated) {
          setMilestoneCelebrations((prev) => [
            { milestone: data.milestone, reached_at: data.reached_at ?? new Date().toISOString() },
            ...prev,
          ]);
        }
      })
      .catch(() => {});
  }, [stats.total_developers, milestoneCelebrations]);

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg font-pixel uppercase text-warm">
      {/* 3D Canvas */}
      <CityCanvas
        buildings={buildings}
        plazas={plazas}
        decorations={decorations}
        river={river}
        bridges={bridges}
        flyMode={flyMode}
        flyVehicle={flyVehicle}
        onExitFly={() => { setFlyMode(false); setFlyPaused(false); lastDistrictRef.current = null; setDistrictAnnouncement(null); clearTimeout(announceTimerRef.current); }}
        themeIndex={themeIndex}
        onHud={(s, a, x, z, yaw) => {
          setHud({ speed: s, altitude: a });
          // Look-ahead: ~40u ahead of airplane = center of screen
          const mapX = x - Math.sin(yaw) * 40;
          const mapZ = z - Math.cos(yaw) * 40;
          setPlayerPos({ x: mapX, z: mapZ });
          // Find nearest building to determine district
          let nearestDistrict: string | null = null;
          let bestDist = Infinity;
          for (const b of buildings) {
            const dx = mapX - b.position[0], dz = mapZ - b.position[2];
            const dist = dx * dx + dz * dz;
            if (dist < bestDist) { bestDist = dist; nearestDistrict = b.district ?? "fullstack"; }
          }
          const district = nearestDistrict
            ? districtZones.find(d => d.id === nearestDistrict) ?? null
            : null;
          const now = Date.now();
          if (district && district.id !== lastDistrictRef.current) {
            lastDistrictRef.current = district.id;
            // Only show announcement if cooldown elapsed (5s)
            if (now - announceCooldownRef.current > 5000) {
              announceCooldownRef.current = now;
              clearTimeout(announceTimerRef.current);
              setDistrictAnnouncement({ name: district.name, color: district.color, population: district.population });
              announceTimerRef.current = setTimeout(() => setDistrictAnnouncement(null), 3000);
            }
          }
        }}
        onPause={(p) => setFlyPaused(p)}
        focusedBuilding={focusedBuilding}
        focusedBuildingB={focusedBuildingB}
        accentColor={theme.accent}
        onClearFocus={() => setFocusedBuilding(null)}
        flyPauseSignal={flyPauseSignal}
        flyHasOverlay={!!selectedBuilding}
        holdRise={loadStage !== "done"}
        celebrationActive={celebrationActive}
        skyAds={skyAds}
        onAdClick={(ad) => {
          trackSkyAdClick(ad.id, ad.vehicle, ad.link);
          // Building ads (billboard, rooftop, led_wrap): direct open
          // Sky ads (plane, blimp): show modal first so user sees what it is
          if (ad.link && isBuildingAd(ad.vehicle)) {
            const ctaHref = buildAdLink(ad) ?? ad.link;
            const isMailto = ad.link.startsWith("mailto:");
            // Single beacon for both events (avoids rate limit dropping cta_click)
            trackAdEvents(ad.id, ["click", "cta_click"], authLogin || undefined);
            trackSkyAdCtaClick(ad.id, ad.vehicle);
            track("sky_ad_click", { ad_id: ad.id, vehicle: ad.vehicle, brand: ad.brand ?? "" });
            if (isMailto) {
              window.location.href = ctaHref;
            } else {
              const a = document.createElement("a");
              a.href = ctaHref;
              a.target = "_blank";
              a.rel = "noopener noreferrer";
              a.click();
            }
            try { setAdToast(ad.brand || new URL(ad.link).hostname.replace("www.", "")); } catch { setAdToast(ad.brand || "link"); }
            setTimeout(() => setAdToast(null), 2500);
          } else {
            trackAdEvent(ad.id, "click", authLogin || undefined);
            setClickedAd(ad);
          }
        }}
        onAdViewed={(adId) => {
          // sessionStorage dedup: prevent inflated impressions across remounts
          try {
            const key = "gc_ad_viewed";
            const raw = sessionStorage.getItem(key);
            const viewed: string[] = raw ? JSON.parse(raw) : [];
            if (viewed.includes(adId)) return;
            viewed.push(adId);
            sessionStorage.setItem(key, JSON.stringify(viewed));
          } catch {
            // sessionStorage unavailable — allow tracking
          }
          trackAdEvent(adId, "impression", authLogin || undefined);
          const ad = skyAds.find(a => a.id === adId);
          if (ad) trackSkyAdImpression(ad.id, ad.vehicle, ad.brand);
        }}
        introMode={introMode}
        onIntroEnd={endIntro}
        onFocusInfo={() => {}}
        ghostPreviewLogin={ghostPreviewLogin}
        raidPhase={raidState.phase}
        raidData={raidState.raidData}
        raidAttacker={raidState.attackerBuilding}
        raidDefender={raidState.defenderBuilding}
        onRaidPhaseComplete={raidActions.onPhaseComplete}
        onLandmarkClick={() => { setPillModalOpen(true); setSelectedBuilding(null); }}
        rabbitSighting={rabbitSighting}
        onRabbitCaught={onRabbitCaught}
        rabbitCinematic={rabbitCinematic}
        onRabbitCinematicEnd={endRabbitCinematic}
        rabbitCinematicTarget={rabbitSighting ?? undefined}
        onBuildingClick={(b) => {
          trackBuildingClicked(b.login);
          // A1: Sign-in prompt after 3 building clicks without session
          if (!session && !signInPromptShownRef.current) {
            buildingClickCountRef.current += 1;
            if (buildingClickCountRef.current >= 3) {
              signInPromptShownRef.current = true;
              setSignInPromptVisible(true);
              trackSignInPromptShown();
              setTimeout(() => setSignInPromptVisible(false), 8000);
            }
          }
          // Compare pick mode: clicking a second building completes the pair
          if (compareBuilding && !comparePair) {
            if (b.login.toLowerCase() === compareBuilding.login.toLowerCase()) {
              setCompareSelfHint(true);
              setTimeout(() => setCompareSelfHint(false), 2000);
              return;
            }
            setComparePair([compareBuilding, b]);
            setFocusedBuilding(compareBuilding.login);
            return;
          }
          // Active comparison: ignore clicks
          if (comparePair) return;

          setSelectedBuilding(b);
          setFocusedBuilding(b.login);
          setKudosSent(false);
          setKudosError(null);
          lastDistRef.current = 999;
          setFocusDist(999);
          if (flyMode) {
            // Auto-pause flight to show profile card
            setFlyPauseSignal(s => s + 1);
          } else if (!exploreMode) {
            setExploreMode(true);
          }
        }}
      />

      {/* Loading screen overlay */}
      {loadStage !== "done" && (
        <LoadingScreen
          stage={loadStage}
          progress={loadProgress}
          error={loadError}
          accentColor={theme.accent}
          onRetry={handleLoadRetry}
          onFadeComplete={handleLoadFadeComplete}
        />
      )}

      {/* ─── Intro Flyover Overlay ─── */}
      {introMode && (
        <div className="pointer-events-none fixed inset-0 z-50">
          {/* Cinematic letterbox bars (transform: scaleY for composited-only GPU animation) */}
          <div
            className="absolute inset-x-0 top-0 origin-top bg-black/80 transition-transform duration-1000"
            style={{ height: "12%", transform: introPhase >= 0 ? "scaleY(1)" : "scaleY(0)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 origin-bottom bg-black/80 transition-transform duration-1000"
            style={{ height: "18%", transform: introPhase >= 0 ? "scaleY(1)" : "scaleY(0)" }}
          />

          {/* Text in the lower bar area */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: "18%" }}>
            {/* Narrative texts (phases 0-2) */}
            {[
              "Somewhere in the internet... \n 发现了 GitHub 开发者......",
              "Developers became buildings \n 开发者成为了建筑",
              "And commits became floors \n 提交成为了楼层",
            ].map((text, i) => (
              <p
                key={i}
                className="absolute text-center font-pixel normal-case text-cream whitespace-pre-line"
                style={{
                  fontSize: "clamp(0.85rem, 3vw, 1.5rem)",
                  letterSpacing: "0.05em",
                  opacity: introPhase === i ? 1 : 0,
                  transition: "opacity 0.7s ease-in-out",
                }}
              >
                {text}
              </p>
            ))}

            {/* Welcome to Git City (phase 3) */}
            <div
              className="absolute flex flex-col items-center gap-1"
              style={{
                opacity: introPhase === 3 ? 1 : 0,
                transform: introPhase === 3 ? "scale(1)" : "scale(0.95)",
                transition: "opacity 0.8s ease-out, transform 0.8s ease-out",
              }}
            >
              <p
                className="text-center font-pixel uppercase text-cream"
                style={{ fontSize: "clamp(1.2rem, 5vw, 2.8rem)" }}
              >
                Welcome to{" "}
                <span style={{ color: theme.accent }}>Git City</span><br />欢迎来到{" "} <span style={{ color: theme.accent }}>Git City</span>
              </p>
            </div>
          </div>

          {/* Confetti burst */}
          {introConfetti && (
            <div className="absolute inset-0 overflow-hidden">
              {Array.from({ length: 25 }).map((_, i) => {
                const colors = [theme.accent, "#fff", theme.shadow, "#f0c060", "#e040c0", "#60c0f0"];
                const color = colors[i % colors.length];
                const left = 10 + Math.random() * 80;
                const delay = Math.random() * 0.6;
                const duration = 2.5 + Math.random() * 1.5;
                const w = 3 + Math.random() * 5;
                const h = Math.random() > 0.5 ? w : w * 0.35;
                const drift = (Math.random() - 0.5) * 80;
                const rotation = Math.random() * 720;
                return (
                  <div
                    key={i}
                    style={{
                      position: "absolute",
                      left: `${left}%`,
                      top: "-8px",
                      width: `${w}px`,
                      height: `${h}px`,
                      backgroundColor: color,
                      animation: `introConfettiFall ${duration}s ${delay}s ease-in forwards`,
                      transform: `rotate(${rotation}deg) translateX(${drift}px)`,
                      opacity: 0,
                    }}
                  />
                );
              })}
            </div>
          )}

          {/* Skip button - top right, outside the cinematic bars */}
          <button
            className="pointer-events-auto absolute top-4 right-4 font-pixel text-[10px] uppercase text-cream/40 transition-colors hover:text-cream sm:text-xs"
            onClick={endIntro}
          >
            Skip 跳过 &gt;
          </button>
        </div>
      )}

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

          {/* Flight data (above lo-fi radio) */}
          <div className="absolute bottom-14 left-3 text-[9px] leading-loose text-muted sm:left-4 sm:text-[10px]">
            <div className="flex items-center gap-2">
              <span>SPD 速度</span>
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
              ALT 高度{" "}
              <span style={{ color: theme.accent }}>
                {Math.round(hud.altitude)}
              </span>
            </div>
          </div>

          {/* District announcement */}
          {districtAnnouncement && (
            <div key={districtAnnouncement.name} className="absolute bottom-32 left-3 animate-district-in sm:left-4">
              <div className="border-l-4 bg-bg/80 px-4 py-2 backdrop-blur-sm" style={{ borderColor: districtAnnouncement.color }}>
                <div className="text-[8px] uppercase tracking-widest text-muted">District</div>
                <div className="font-pixel text-sm text-cream">{districtAnnouncement.name}</div>
                <div className="text-[8px] text-muted">{districtAnnouncement.population.toLocaleString()} devs</div>
              </div>
            </div>
          )}

          {/* Controls hint */}
          <div className="absolute bottom-[140px] right-3 text-right text-[8px] leading-loose text-muted sm:right-4 sm:text-[9px]">
            {flyPaused ? (
              <>
                <div>
                  <span className="text-cream">Drag</span> orbit 拖拽轨道
                </div>
                <div>
                  <span className="text-cream">Scroll</span> zoom 缩放
                </div>
                <div>
                  <span className="text-cream">WASD</span> resume 恢复
                </div>
                <div>
                  <span style={{ color: theme.accent }}>ESC</span> exit 退出
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-cream">Mouse</span> steer 鼠标控制
                </div>
                <div>
                  <span className="text-cream">Shift</span> boost 加速
                </div>
                <div>
                  <span className="text-cream">Alt</span> slow 减速
                </div>
                <div>
                  <span className="text-cream">Scroll</span> base speed 基础速度
                </div>
                <div>
                  <span style={{ color: theme.accent }}>P</span> pause 暂停
                </div>
                <div>
                  <span style={{ color: theme.accent }}>ESC</span> pause 暂停
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ─── Mini-map ─── */}
      <MiniMap
        buildings={buildings}
        playerX={playerPos.x}
        playerZ={playerPos.z}
        visible={flyMode}
        currentDistrict={lastDistrictRef.current}
      />

      {/* ─── Explore Mode: minimal UI ─── */}
      {exploreMode && !flyMode && (
        <div className="pointer-events-none fixed inset-0 z-20">
          {/* Back button */}
          <div className="pointer-events-auto absolute top-3 left-3 sm:top-4 sm:left-4">
            <button
              onClick={() => {
                if (selectedBuilding) {
                  setSelectedBuilding(null);
                  setFocusedBuilding(null);
                } else {
                  setExploreMode(false);
                  setFocusedBuilding(savedFocusRef.current);
                  savedFocusRef.current = null;
                }
              }}
              className="flex items-center gap-2 border-[3px] border-border bg-bg/70 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
              style={{ borderColor: undefined }}
              onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
              onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
            >
              <span style={{ color: theme.accent }}>ESC</span>
              <span className="text-cream">Back</span>
            </button>
          </div>

          {/* $GITC price widget (top-center, desktop only) */}
          {gitcPrice && (
            <div className="pointer-events-auto absolute top-3 left-1/2 -translate-x-1/2 hidden sm:block sm:top-4">
              <button
                onClick={copyCA}
                className="flex items-center gap-2 border-[3px] border-border bg-bg/70 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
              >
                <span style={{ color: theme.accent }}>$GITC</span>
                <span className="text-cream">{formatTokenPrice(parseFloat(gitcPrice.priceUsd))}</span>
                <span style={{ color: gitcPrice.change24h >= 0 ? "#4ade80" : "#f87171" }}>
                  {gitcPrice.change24h >= 0 ? "+" : ""}{gitcPrice.change24h.toFixed(1)}%
                </span>
                <span className="text-dim">{caCopied ? "Copied!" : "Copy CA"}</span>
              </button>
            </div>
          )}

          {/* Theme switcher (bottom-left) — same position as main controls */}
          <div className="pointer-events-auto fixed bottom-10 left-3 z-[25] flex items-center gap-2 sm:left-4">
            <button
              onClick={() => setThemeIndex((i) => (i + 1) % THEMES.length)}
              className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
            >
              <span style={{ color: theme.accent }}>&#9654;</span>
              <span className="text-cream">{theme.name}</span>
              <span className="text-dim">{themeIndex + 1}/{THEMES.length}</span>
            </button>
          </div>

          {/* Feed toggle (top-right, below GitHub badges on desktop) */}
          {feedEvents.length >= 1 && (
            <div className="pointer-events-auto absolute top-3 right-3 sm:top-14 sm:right-4">
              <button
                onClick={() => setFeedPanelOpen(true)}
                className="flex items-center gap-2 border-[3px] border-border bg-bg/70 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
              >
                <span style={{ color: theme.accent }}>&#9679;</span>
                <span className="text-cream">Feed</span>
              </button>
            </div>
          )}

          {/* Navigation hints (bottom-right) — hidden when building card is open */}
          {!selectedBuilding && (
            <div className="absolute bottom-3 right-3 text-right text-[8px] leading-loose text-muted sm:bottom-4 sm:right-4 sm:text-[9px]">
              <div><span className="text-cream">Drag</span> orbit</div>
              <div><span className="text-cream">Scroll</span> zoom</div>
              <div><span className="text-cream">Right-drag</span> pan</div>
              <div><span className="text-cream">Click</span> building</div>
              <div><span style={{ color: theme.accent }}>ESC</span> back</div>
            </div>
          )}
        </div>
      )}

      {/* Shop & Auth moved to center buttons area */}

      {/* ─── GitHub Badge (mobile: top-center, desktop: top-right) ─── */}
      {!flyMode && !introMode && !rabbitCinematic && (
        <div className={`pointer-events-auto fixed top-3 left-1/2 z-30 -translate-x-1/2 items-center gap-2 sm:left-auto sm:right-4 sm:top-4 sm:translate-x-0 ${exploreMode ? "hidden lg:flex" : "flex"}`}>
          <a
            href="https://github.com/srizzon/git-city"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
          >
            <span style={{ color: theme.accent }}>&#9733;</span>
            <span className="text-cream">Star</span>
          </a>
          <a
            href="https://github.com/sponsors/srizzon"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
          >
            <span style={{ color: theme.accent }}>&#9829;</span>
            <span className="text-cream">Sponsor</span>
          </a>
          {liveStatus !== "error" && (
            <div className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm">
              <span className="live-dot h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[#4ade80]" />
              <span className="text-cream">{liveUsers.toLocaleString()}</span>
              <span className="text-muted">live</span>
            </div>
          )}
        </div>
      )}

      {/* ─── Main UI Overlay ─── */}
      {!flyMode && !exploreMode && !introMode && !rabbitCinematic && (
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
              <p className="mt-2 text-[11.5px] leading-relaxed text-cream/80 normal-case whitespace-pre-line">
                {stats.total_developers > 0
                  ? `A city of ${stats.total_developers.toLocaleString()} GitHub developers. Find yourself.`
                  : "A global city of GitHub developers. Find yourself. \n 加入我们，发现更多的 GitHub 开发者。"}
              </p>
              <p className="pointer-events-auto mt-1 text-[10px] text-cream/50 normal-case">
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
                &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;
                Sinicization by{" "}
                <a
                  href="https://github.com/EndlessPixel"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="transition-colors hover:text-cream"
                  style={{ color: theme.accent }}
                >
                  @EndlessPixel
                </a>
              </p>
              {gitcPrice && (
                <button
                  onClick={copyCA}
                  className="mt-1.5 inline-flex items-center gap-1.5 border-[2px] border-border bg-bg/70 px-2.5 py-1 text-[9px] backdrop-blur-sm transition-colors"
                  onMouseEnter={(e) => (e.currentTarget.style.borderColor = theme.accent + "80")}
                  onMouseLeave={(e) => (e.currentTarget.style.borderColor = "")}
                >
                  <span style={{ color: theme.accent }}>$GITC</span>
                  <span className="text-cream">{formatTokenPrice(parseFloat(gitcPrice.priceUsd))}</span>
                  <span style={{ color: gitcPrice.change24h >= 0 ? "#4ade80" : "#f87171" }}>
                    {gitcPrice.change24h >= 0 ? "+" : ""}{gitcPrice.change24h.toFixed(1)}%
                  </span>
                  <span className="text-dim">
                    {caCopied ? "Copied!" : `${GITC_CA.slice(0, 6)}...${GITC_CA.slice(-4)}`}
                  </span>
                  {!caCopied && (
                    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-dim">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                    </svg>
                  )}
                </button>
              )}
            </div>

            {/* Milestone progress banner */}
            {(() => {
              const MILESTONES = [10000, 15000, 25000, 50000, 100000];
              const count = stats.total_developers;
              if (count <= 0) return null;

              if (celebrationActive) {
                return (
                  <div className="w-full max-w-sm">
                    <style>{`@keyframes celebration-glow {
  0%, 100% { box-shadow: 0 0 8px ${theme.accent}60; }
  50% { box-shadow: 0 0 20px ${theme.accent}, 0 0 40px ${theme.accent}40; }
}`}</style>
                    <div className="border-[2px] border-border bg-bg/80 px-4 py-3 backdrop-blur-sm">
                      <div className="mb-2 flex items-center justify-center gap-2">
                        <span className="animate-pulse text-[10px]" style={{ color: theme.accent }}>★</span>
                        <span className="text-[10px] tracking-widest text-cream">10,000 DEVELOPERS</span>
                        <span className="animate-pulse text-[10px]" style={{ color: theme.accent }}>★</span>
                      </div>
                      <div className="mb-2 text-center text-[9px] tracking-wider text-cream/50">
                        The city that code built.
                      </div>
                      <div className="relative h-2.5 w-full overflow-hidden border-[2px] border-border bg-bg">
                        <div
                          className="absolute inset-y-0 left-0"
                          style={{
                            width: "100%",
                            backgroundColor: theme.accent,
                            boxShadow: `0 0 8px ${theme.accent}60`,
                            animation: "celebration-glow 2s ease-in-out infinite",
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-baseline justify-between">
                        <span className="text-[9px] tracking-wider" style={{ color: theme.accent }}>
                          10K unlocked
                        </span>
                        <span className="text-[9px] text-cream/40">
                          Next: 15K
                        </span>
                      </div>
                    </div>
                  </div>
                );
              }

              const target = MILESTONES.find((m) => count < m);
              if (!target) return null;
              const prev = MILESTONES[MILESTONES.indexOf(target) - 1] ?? 0;
              const progress = ((count - prev) / (target - prev)) * 100;
              const remaining = target - count;
              const label = target >= 1000 ? `${target / 1000}K` : target.toLocaleString();
              return (
                <div className="w-full max-w-sm">
                  <div className="border-[2px] border-border bg-bg/80 px-4 py-3 backdrop-blur-sm">
                    <div className="mb-2 flex items-baseline justify-between">
                      <span className="text-[9px] tracking-wider" style={{ color: theme.accent }}>
                        ROAD TO {label}
                      </span>
                      <span className="text-[9px] text-cream/60">
                        {remaining.toLocaleString()} to go
                      </span>
                    </div>
                    <div className="relative h-2.5 w-full overflow-hidden border-[2px] border-border bg-bg">
                      <div
                        className="absolute inset-y-0 left-0 transition-all duration-1000"
                        style={{
                          width: `${progress}%`,
                          backgroundColor: theme.accent,
                          boxShadow: `0 0 8px ${theme.accent}60`,
                        }}
                      />
                    </div>
                    <div className="mt-2 flex items-baseline justify-between">
                      <span className="text-[10px] text-cream">
                        {count.toLocaleString()} <span className="text-cream/40">/ {target.toLocaleString()}</span>
                      </span>
                      <span className="text-[8px] text-cream/40 normal-case whitespace-pre-line">
                        Something unlocks at {label}... \n 某物在 {label} 解锁
                      </span>
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Search */}
            <form
              onSubmit={handleSubmit}
              className="flex w-full max-w-md items-center gap-2"
            >
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (feedback?.type === "error") setFeedback(null);
                }}
                placeholder="add a dev to the city"
                className="min-w-0 flex-1 border-[3px] border-border bg-bg-raised px-3 py-2 text-base sm:text-xs text-cream outline-none transition-colors placeholder:text-dim sm:px-4 sm:py-2.5"
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
                {loading ? <span className="blink-dot inline-block">_</span> : "Search"}
              </button>
            </form>

            {/* Search Feedback: loading phases + errors */}
            <SearchFeedback feedback={feedback} accentColor={theme.accent} onDismiss={() => setFeedback(null)} onRetry={searchUser} />

            {initialLoading && (
              <p className="text-[10px] text-muted normal-case whitespace-pre-line">
                Loading city... | 正在加载城市...
              </p>
            )}
          </div>

          {/* Center - Explore buttons + Shop + Auth */}
          {buildings.length > 0 && (
            <div className="pointer-events-auto flex flex-col items-center gap-3">
              {/* Free Gift CTA — above primary actions */}
              {hasFreeGift && (
                <button
                  onClick={handleClaimFreeGift}
                  disabled={claimingGift}
                  className="gift-cta btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg disabled:opacity-60"
                  style={{
                    backgroundColor: theme.accent,
                    ["--gift-glow-color" as string]: theme.accent + "66",
                    ["--gift-shadow-color" as string]: theme.shadow,
                  }}
                >
                  {claimingGift ? "Opening..." : "\uD83C\uDF81 Open Free Gift!"}
                </button>
              )}

              {/* Primary actions */}
              <div className="flex items-center gap-3 sm:gap-4">
                <button
                  onClick={() => setExploreMode(true)}
                  className="btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                  }}
                >
                  Explore City | 探索城市
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
                    &#9992; Fly | 飞行
                  </button>
                )}
              </div>

              {/* Nav links */}
              <div className="flex items-center justify-center gap-2">
                <Link
                  href={shopHref}
                  className="btn-press border-[3px] border-border bg-bg/80 px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                  style={{ color: theme.accent }}
                >
                  Shop | 商店
                </Link>
                <Link
                  href="/advertise"
                  className="btn-press relative border-[3px] px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
                  style={{ color: theme.accent, borderColor: theme.accent + "60", backgroundColor: theme.accent + "12" }}
                >
                  Place your Ad | 发布广告
                  <span
                    className="absolute -top-1.5 -right-2 rounded-sm px-1 py-px text-[7px] font-bold leading-none text-bg"
                    style={{ backgroundColor: theme.accent }}
                  >
                    NEW | 新的
                  </span>
                </Link>
                <Link
                  href="/leaderboard"
                  className="btn-press border-[3px] border-border bg-bg/80 px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                  style={{ color: theme.accent }}
                >
                  &#9819; Leaderboard | 排行榜
                </Link>
              </div>

              {/* Auth */}
              <div className="flex items-center justify-center gap-2">
                {!session ? (
                  <button
                    onClick={handleSignIn}
                    className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/80 px-3 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                  >
                    <span style={{ color: theme.accent }}>G</span>
                    <span className="text-cream">Sign in | 登录</span>
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
                      className="flex items-center gap-1.5 border-[3px] border-border bg-bg/80 px-3 py-1.5 text-[10px] text-cream normal-case backdrop-blur-sm transition-colors hover:border-border-light"
                      style={streakData && streakData.streak > 0 && streakData.checked_in ? { animation: "streak-pulse 1.5s ease-in-out 2" } : undefined}
                    >
                      @{authLogin}
                      {streakData && streakData.streak > 0 && (
                        <span className="flex items-center gap-0.5" style={{ color: getStreakTierColor(streakData.streak) }}>
                          <span className="text-[9px] leading-none">🔥</span>
                          <span className="font-bold">{streakData.streak}</span>
                        </span>
                      )}
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
            </div>
          )}

          {/* Bottom — leaderboard only (info + theme moved to fixed elements) */}
          <div className="pointer-events-auto flex w-full items-end justify-end">
            {/* Mini Leaderboard - hidden on mobile, rotates categories */}
            {buildings.length > 0 && (
              <MiniLeaderboard buildings={buildings} accent={theme.accent} />
            )}
          </div>
        </div>
      )}

      {/* ─── Purchase Toast ─── */}
      {purchasedItem && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2">
          <div
            className="border-[3px] px-5 py-2.5 text-[10px] text-bg whitespace-pre-line"
            style={{
              backgroundColor: theme.accent,
              borderColor: theme.shadow,
            }}
          >
            Item purchased! Effect applied to your building. \n 项目购买成功！效果已应用于您的建筑。
          </div>
        </div>
      )}

      {/* ─── Gift Toast ─── */}
      {giftedInfo && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2">
          <div
            className="flex items-center gap-2 border-[3px] px-5 py-2.5 text-[10px] text-bg"
            style={{
              backgroundColor: theme.accent,
              borderColor: theme.shadow,
            }}
          >
            <span className="text-base">🎁</span>
            <span>{ITEM_NAMES[giftedInfo.item] ?? giftedInfo.item} sent to {giftedInfo.to}!</span>
          </div>
        </div>
      )}

      {/* ─── A1: Sign-in prompt after building exploration ─── */}
      {signInPromptVisible && !session && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-xs animate-[slide-up_0.2s_ease-out]">
          <div className="border-[3px] border-border bg-bg-raised/95 px-4 py-3 backdrop-blur-sm">
            <p className="text-[10px] text-cream normal-case mb-2.5 leading-relaxed">
              Sign in to give Kudos, raid buildings, and claim yours
              登录以点赞、突袭建筑和认领您的建筑
            </p>
            <button
              onClick={() => {
                trackSignInPromptClicked();
                setSignInPromptVisible(false);
                handleSignIn();
              }}
              className="btn-press w-full py-2 text-[10px] text-bg"
              style={{
                backgroundColor: theme.accent,
                boxShadow: `2px 2px 0 0 ${theme.shadow}`,
              }}
            >
              Sign in with GitHub | 使用 GitHub 登录
            </button>
            <button
              onClick={() => setSignInPromptVisible(false)}
              className="mt-1.5 w-full py-1 text-[8px] text-dim transition-colors hover:text-muted"
            >
              Maybe later | 稍后再说
            </button>
          </div>
        </div>
      )}

      {/* ─── A5: Ad redirect toast ─── */}
      {adToast && (
        <div className="fixed top-16 left-1/2 z-50 -translate-x-1/2 animate-[fade-in_0.15s_ease-out]">
          <div
            className="border-[3px] px-5 py-2.5 text-[10px] text-bg"
            style={{
              backgroundColor: theme.accent,
              borderColor: theme.shadow,
            }}
          >
            Opening 打开 {adToast} &rarr;
          </div>
        </div>
      )}

      {/* ─── A8: Ghost preview CTA ─── */}
      {ghostPreviewLogin && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-xs animate-[slide-up_0.2s_ease-out]">
          <div
            className="border-[3px] bg-bg-raised/95 px-4 py-3 backdrop-blur-sm"
            style={{ borderColor: theme.accent }}
          >
            <p className="text-[10px] text-cream normal-case mb-2 leading-relaxed whitespace-pre-line">
              Unlock effects for your building \n 解锁您建筑的效果
            </p>
            <p className="text-[8px] text-muted normal-case mb-2.5 whitespace-pre-line">
              Neon Outline, Particle Aura, Spotlight, and more \n 霓虹轮廓、粒子光环、聚光灯等
            </p>
            <Link
              href={myBuilding?.claimed ? `/shop/${ghostPreviewLogin}` : `/dev/${ghostPreviewLogin}`}
              onClick={() => setGhostPreviewLogin(null)}
              className="btn-press block w-full py-2 text-center text-[10px] text-bg"
              style={{
                backgroundColor: theme.accent,
                boxShadow: `2px 2px 0 0 ${theme.shadow}`,
              }}
            >
              {myBuilding?.claimed ? "Customize" : "Claim & Customize"} &rarr;
            </Link>
            <button
              onClick={() => setGhostPreviewLogin(null)}
              className="mt-1.5 w-full py-1 text-[8px] text-dim transition-colors hover:text-muted"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* ─── A12: Streak reward toast ─── */}
      {streakData?.streak_reward && streakData.checked_in && (
        <div className="fixed top-20 left-1/2 z-50 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-xs animate-[slide-up_0.2s_ease-out]">
          <div
            className="border-[3px] bg-bg-raised/95 px-4 py-3 backdrop-blur-sm text-center"
            style={{ borderColor: theme.accent }}
          >
            <p className="text-lg mb-1">🎁</p>
            <p className="text-[10px] text-cream normal-case mb-1 font-bold">
              {streakData.streak_reward.milestone}-day streak reward!
            </p>
            <p className="text-[9px] normal-case mb-2" style={{ color: theme.accent }}>
              You unlocked {streakData.streak_reward.item_name}
            </p>
            <Link
              href={`/shop/${authLogin}`}
              className="btn-press block w-full py-1.5 text-center text-[9px] text-bg"
              style={{
                backgroundColor: theme.accent,
                boxShadow: `2px 2px 0 0 ${theme.shadow}`,
              }}
            >
              Equip now &rarr;
            </Link>
          </div>
        </div>
      )}

      {/* ─── Building Profile Card ─── */}
      {/* Desktop: right edge, vertically centered. Mobile: bottom sheet, centered. */}
      {selectedBuilding && (!flyMode || flyPaused) && !comparePair && raidState.phase === "idle" && (
        <>
          {/* Nav hints — only on desktop, bottom-right */}
          <div className="pointer-events-none fixed bottom-6 right-6 z-30 hidden text-right text-[9px] leading-loose text-muted sm:block">
            <div><span className="text-cream">Drag</span> orbit</div>
            <div><span className="text-cream">Scroll</span> zoom</div>
            <div><span style={{ color: theme.accent }}>ESC</span> close</div>
          </div>

          {/* Card container — mobile: bottom sheet, desktop: fixed right side */}
          <div className="pointer-events-auto fixed z-40
            bottom-0 left-0 right-0
            sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
          >
            <div className="relative border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
              w-full max-h-[50vh] overflow-y-auto sm:w-[320px] sm:border-[3px] sm:max-h-[85vh]
              animate-[slide-up_0.2s_ease-out] sm:animate-none"
            >
              {/* Close */}
              <button
                onClick={() => { setSelectedBuilding(null); setFocusedBuilding(null); }}
                className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream z-10"
              >
                ESC
              </button>

              {/* Drag handle on mobile */}
              <div className="flex justify-center py-2 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>

              {/* Header with avatar + name */}
              <div className="flex items-center gap-3 px-4 pb-3 sm:pt-4">
                {selectedBuilding.avatar_url && (
                  <Image
                    src={selectedBuilding.avatar_url}
                    alt={selectedBuilding.login}
                    width={48}
                    height={48}
                    className="border-[2px] border-border flex-shrink-0"
                    style={{ imageRendering: "pixelated" }}
                  />
                )}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {selectedBuilding.name && (
                      <p className="truncate text-sm text-cream">{selectedBuilding.name}</p>
                    )}
                    {selectedBuilding.claimed && (
                      <span
                        className="flex-shrink-0 px-1.5 py-0.5 text-[7px] text-bg"
                        style={{ backgroundColor: theme.accent }}
                      >
                        Claimed | 已认领
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted">@{selectedBuilding.login}</p>
                  {selectedBuilding.active_raid_tag && (
                    <p className="text-[8px] text-red-400">
                      Raided by @{selectedBuilding.active_raid_tag.attacker_login} | 被 @{selectedBuilding.active_raid_tag.attacker_login} 攻击
                    </p>
                  )}
                </div>
              </div>

              {/* District badge */}
              {selectedBuilding.district && (
                <div className="px-4 pb-2">
                  <span
                    className="inline-block px-2 py-0.5 text-[8px] text-bg"
                    style={{ backgroundColor: DISTRICT_COLORS[selectedBuilding.district] ?? '#888' }}
                  >
                    {DISTRICT_NAMES[selectedBuilding.district] ?? selectedBuilding.district}
                  </span>
                </div>
              )}

              {/* Stats */}
              <div className="grid grid-cols-3 gap-px bg-border/30 mx-4 mb-3 border border-border/50">
                {[
                  { label: "Rank | 排名", value: `#${selectedBuilding.rank}` },
                  { label: "Contribs | 贡献", value: selectedBuilding.contributions.toLocaleString() },
                  { label: "Repos | 仓库", value: selectedBuilding.public_repos.toLocaleString() },
                  { label: "Stars | 星标", value: selectedBuilding.total_stars.toLocaleString() },
                  { label: "Kudos | 奖励", value: (selectedBuilding.kudos_count ?? 0).toLocaleString() },
                  { label: "Visits | 访问", value: (selectedBuilding.visit_count ?? 0).toLocaleString() },
                ].map((s) => (
                  <div key={s.label} className="bg-bg-card p-2 text-center">
                    <div className="text-xs" style={{ color: theme.accent }}>{s.value}</div>
                    <div className="text-[8px] text-muted mt-0.5">{s.label}</div>
                  </div>
                ))}
              </div>

              {/* Achievements with tier colors, sorted by tier */}
              {selectedBuilding.achievements && selectedBuilding.achievements.length > 0 && (
                <div className="mx-4 mb-3 flex flex-wrap gap-1">
                  {[...selectedBuilding.achievements]
                    .sort((a, b) => {
                      const tierOrder = ["diamond", "gold", "silver", "bronze"];
                      const ta = tierOrder.indexOf(ACHIEVEMENT_TIERS_MAP[a] ?? "bronze");
                      const tb = tierOrder.indexOf(ACHIEVEMENT_TIERS_MAP[b] ?? "bronze");
                      return ta - tb;
                    })
                    .slice(0, 3)
                    .map((ach) => {
                      const tier = ACHIEVEMENT_TIERS_MAP[ach];
                      const color = tier ? TIER_COLORS_MAP[tier] : undefined;
                      const emoji = tier ? TIER_EMOJI_MAP[tier] : "";
                      return (
                        <span
                          key={ach}
                          className="px-1.5 py-0.5 text-[8px] border normal-case"
                          style={{
                            borderColor: color ?? "rgba(255,255,255,0.15)",
                            color: color ?? "#a0a0b0",
                          }}
                        >
                          {emoji} {ACHIEVEMENT_NAMES_MAP[ach] ?? ach.replace(/_/g, " ")}
                        </span>
                      );
                    })}
                  {selectedBuilding.achievements.length > 3 && (
                    <Link
                      href={`/dev/${selectedBuilding.login}`}
                      className="px-1.5 py-0.5 text-[8px] transition-colors hover:text-cream"
                      style={{ color: theme.accent }}
                    >
                      +{selectedBuilding.achievements.length - 3} more &rarr;
                    </Link>
                  )}
                </div>
              )}

              {/* A7: Show equipped items on other devs' buildings (mimetic desire) */}
              {selectedBuilding.login.toLowerCase() !== authLogin && (() => {
                const equipped: string[] = [];
                if (selectedBuilding.loadout?.crown) equipped.push(selectedBuilding.loadout.crown);
                if (selectedBuilding.loadout?.roof) equipped.push(selectedBuilding.loadout.roof);
                if (selectedBuilding.loadout?.aura) equipped.push(selectedBuilding.loadout.aura);
                for (const fi of ["custom_color", "billboard", "led_banner"]) {
                  if (selectedBuilding.owned_items.includes(fi)) equipped.push(fi);
                }
                if (equipped.length === 0) return null;
                const shown = equipped.slice(0, 3);
                const extra = equipped.length - 3;
                return (
                  <div
                    className="mx-4 mb-3 border-[2px] p-2.5"
                    style={{ borderColor: `${theme.accent}33`, backgroundColor: `${theme.accent}08` }}
                  >
                    <div className="flex flex-wrap gap-1.5">
                      {shown.map((id) => (
                        <span
                          key={id}
                          className="text-[9px] normal-case"
                          style={{ color: theme.accent }}
                        >
                          {ITEM_EMOJIS[id] ?? "🎁"} {ITEM_NAMES[id] ?? id}
                        </span>
                      ))}
                      {extra > 0 && (
                        <span className="text-[9px] text-muted">
                          +{extra} more
                        </span>
                      )}
                    </div>
                    {session && (
                      <Link
                        href={`/shop/${authLogin}`}
                        className="btn-press mt-2 block w-full py-1.5 text-center text-[9px] text-bg"
                        style={{
                          backgroundColor: theme.accent,
                          boxShadow: `2px 2px 0 0 ${theme.shadow}`,
                        }}
                      >
                        Get these for your building
                      </Link>
                    )}
                  </div>
                );
              })()}

              {/* Kudos: give kudos (other's building, logged in) */}
              {session && selectedBuilding.login.toLowerCase() !== authLogin && (
                <div className="relative mx-4 mb-3">
                  {/* Floating emoji animation on success */}
                  {kudosSent && (
                    <div className="pointer-events-none absolute inset-0 overflow-visible">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <span
                          key={i}
                          className="kudos-float absolute text-sm"
                          style={{
                            left: `${15 + i * 14}%`,
                            animationDelay: `${i * 0.08}s`,
                          }}
                        >
                          {["👏", "⭐", "💛", "✨", "👏", "⭐"][i]}
                        </span>
                      ))}
                    </div>
                  )}
                  <button
                    onClick={handleGiveKudos}
                    disabled={kudosSending || kudosSent || !!kudosError}
                    className={[
                      "btn-press w-full py-2 text-[10px] text-bg transition-all duration-300",
                      kudosSent ? "scale-[1.02]" : "",
                    ].join(" ")}
                    style={{
                      backgroundColor: kudosError ? "#ff4444" : kudosSent ? "#39d353" : theme.accent,
                      boxShadow: kudosError
                        ? "0 0 12px rgba(255,68,68,0.4)"
                        : kudosSent
                        ? "0 0 12px rgba(57,211,83,0.4)"
                        : `2px 2px 0 0 ${theme.shadow}`,
                    }}
                  >
                    {kudosSending ? (
                      <span className="animate-pulse">Sending 发送中...</span>
                    ) : kudosError ? (
                      <span>{kudosError}</span>
                    ) : kudosSent ? (
                      <span>+1 Kudos!</span>
                    ) : (
                      "Give Kudos | 给建设者点赞"
                    )}
                  </button>
                  <button
                    onClick={handleOpenGift}
                    className="btn-press mt-1.5 w-full border-[2px] border-border py-1.5 text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    Send Gift | 发送礼物
                  </button>
                  {/* Raid button */}
                  {raidState.phase === "idle" && raidState.error && (
                    <p className="mt-1.5 text-center text-[10px] text-red-400">{raidState.error}</p>
                  )}
                  <button
                    onClick={() => {
                      if (authLogin && selectedBuilding) {
                        raidActions.startPreview(selectedBuilding.login, buildings, authLogin);
                      }
                    }}
                    disabled={raidState.loading}
                    className="btn-press mt-1.5 w-full border-[3px] border-red-500/60 px-4 py-2 text-xs text-red-400 transition-colors hover:bg-red-500/10"
                  >
                    {raidState.loading ? "Loading..." : "RAID"}
                  </button>
                </div>
              )}

              {/* A3: Disabled action buttons for non-logged users */}
              {!session && (
                <div className="mx-4 mb-3 space-y-1.5">
                  <button
                    onClick={() => { trackDisabledButtonClicked("kudos"); handleSignIn(); }}
                    className="btn-press w-full py-2 text-[10px] border-[2px] border-dashed border-border/50 text-muted/60 transition-colors hover:border-border hover:text-muted"
                  >
                    &#x1F512; Give Kudos | 给建设者点赞
                  </button>
                  <button
                    onClick={() => { trackDisabledButtonClicked("gift"); handleSignIn(); }}
                    className="btn-press w-full py-1.5 text-[9px] border-[2px] border-dashed border-border/50 text-muted/60 transition-colors hover:border-border hover:text-muted"
                  >
                    &#x1F512; Send Gift | 发送礼物
                  </button>
                  <button
                    onClick={() => { trackDisabledButtonClicked("raid"); handleSignIn(); }}
                    className="btn-press w-full py-2 text-[10px] border-[2px] border-dashed border-red-500/30 text-red-400/40 transition-colors hover:border-red-500/60 hover:text-red-400/70"
                  >
                    &#x1F512; RAID | 发起突袭
                  </button>
                </div>
              )}

              {/* Own building: copy invite link */}
              {selectedBuilding.login.toLowerCase() === authLogin && (
                <div className="mx-4 mb-3">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(
                        `${window.location.origin}/?ref=${authLogin}`
                      );
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="btn-press w-full border-[2px] border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    {copied ? "Copied!" : "\uD83D\uDCCB Copy Invite Link"}
                  </button>
                </div>
              )}

              {/* Compare button */}
              {!flyMode && (
                <div className="mx-4 mb-3">
                  <button
                    onClick={() => {
                      setCompareBuilding(selectedBuilding);
                      setSelectedBuilding(null);
                      if (!exploreMode) setExploreMode(true);
                    }}
                    className="btn-press w-full border-[2px] border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    Compare | 对比
                  </button>
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-2 p-4 pt-0 pb-5 sm:pb-4">
                {selectedBuilding.login.toLowerCase() === authLogin ? (
                  <>
                    <Link
                      href={`/shop/${selectedBuilding.login}?tab=loadout`}
                      className="btn-press flex-1 py-2 text-center text-[10px] text-bg"
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: `2px 2px 0 0 ${theme.shadow}`,
                      }}
                    >
                      Loadout | 装备
                    </Link>
                    <Link
                      href={`/dev/${selectedBuilding.login}`}
                      className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                    >
                      Profile | 个人资料
                    </Link>
                  </>
                ) : (
                  <>
                    <Link
                      href={`/dev/${selectedBuilding.login}`}
                      className="btn-press flex-1 py-2 text-center text-[10px] text-bg"
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: `2px 2px 0 0 ${theme.shadow}`,
                      }}
                    >
                      View Profile | 查看个人资料
                    </Link>
                    <a
                      href={`https://github.com/${selectedBuilding.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                    >
                      GitHub
                    </a>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── Compare Pick Prompt ─── */}
      {compareBuilding && !comparePair && !flyMode && (
        <div className="fixed top-3 left-1/2 z-40 -translate-x-1/2 w-[calc(100%-1.5rem)] max-w-sm sm:top-4 sm:w-auto">
          <div className="border-[3px] border-border bg-bg-raised/95 px-4 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="blink-dot h-2 w-2 flex-shrink-0"
                style={{ backgroundColor: theme.accent }}
              />
              <span className="text-[10px] text-cream normal-case truncate min-w-0">
                Comparing <span style={{ color: theme.accent }}>@{compareBuilding.login}</span>
              </span>
              <button
                onClick={() => {
                  setSelectedBuilding(compareBuilding);
                  setFocusedBuilding(compareBuilding.login);
                  setCompareBuilding(null);
                }}
                className="ml-1 flex-shrink-0 text-[9px] text-muted transition-colors hover:text-cream"
              >
                Cancel
              </button>
            </div>
            {/* Self-compare hint */}
            {compareSelfHint && (
              <p className="mt-1 text-[9px] normal-case whitespace-pre-line" style={{ color: "#f85149" }}>
                Pick a different building to compare \n 选择不同的建筑进行对比
              </p>
            )}
            {/* Search field for compare pick */}
            <form
              onSubmit={(e) => { e.preventDefault(); searchUser(); }}
              className="mt-2 flex items-center gap-2"
            >
              <input
                type="text"
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value);
                  if (feedback?.type === "error") setFeedback(null);
                }}
                placeholder="search username to compare"
                className="min-w-0 flex-1 border-[2px] border-border bg-bg px-2.5 py-1.5 text-base sm:text-[10px] text-cream outline-none transition-colors placeholder:text-dim"
                onFocus={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="btn-press flex-shrink-0 px-3 py-1.5 text-[10px] text-bg disabled:opacity-40"
                style={{ backgroundColor: theme.accent }}
              >
                {loading ? "_" : "Go"}
              </button>
            </form>
            {feedback && (
              <div className="mt-1.5">
                <SearchFeedback feedback={feedback} accentColor={theme.accent} onDismiss={() => setFeedback(null)} onRetry={searchUser} />
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Comparison Panel ─── */}
      {comparePair && (() => {
        const compareStatDefs: { label: string; key: keyof CityBuilding; invert?: boolean }[] = [
          { label: "Rank", key: "rank", invert: true },
          { label: "Contributions", key: "contributions" },
          { label: "Stars", key: "total_stars" },
          { label: "Repos", key: "public_repos" },
          { label: "Kudos", key: "kudos_count" },
        ];
        let totalAWins = 0;
        let totalBWins = 0;
        const cmpRows = compareStatDefs.map((s) => {
          const a = (comparePair[0][s.key] as number) ?? 0;
          const b = (comparePair[1][s.key] as number) ?? 0;
          let aW = false, bW = false;
          if (s.invert) { aW = a > 0 && (a < b || b === 0); bW = b > 0 && (b < a || a === 0); }
          else { aW = a > b; bW = b > a; }
          if (aW) totalAWins++;
          if (bW) totalBWins++;
          return { ...s, a, b, aW, bW };
        });
        const cmpTie = totalAWins === totalBWins;
        const cmpWinner = totalAWins > totalBWins ? comparePair[0].login : comparePair[1].login;
        const cmpSummary = cmpTie
          ? `Tie ${totalAWins}-${totalBWins}`
          : `@${cmpWinner} wins ${Math.max(totalAWins, totalBWins)}-${Math.min(totalAWins, totalBWins)}`;

        const closeCompare = () => { setSelectedBuilding(comparePair[0]); setFocusedBuilding(comparePair[0].login); setComparePair(null); setCompareBuilding(null); };

        return (
        <>
          {/* No fullscreen backdrop — let the user orbit the camera freely */}
          <div className="pointer-events-auto fixed z-40
            bottom-0 left-0 right-0
            sm:bottom-auto sm:left-auto sm:right-5 sm:top-1/2 sm:-translate-y-1/2"
          >
            <div className="relative border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
              w-full sm:w-[380px] sm:border-[3px] sm:max-h-[85vh] sm:overflow-y-auto
              max-h-[45vh] overflow-y-auto
              animate-[slide-up_0.2s_ease-out] sm:animate-none"
            >
              {/* Drag handle on mobile - swipe down to close */}
              <div
                className="flex justify-center py-2 sm:hidden"
                onTouchStart={(e) => { (e.currentTarget as any)._touchY = e.touches[0].clientY; }}
                onTouchEnd={(e) => { const start = (e.currentTarget as any)._touchY; if (start != null && e.changedTouches[0].clientY - start > 50) closeCompare(); }}
              >
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>

              {/* ── Header: Avatars + VS ── */}
              <div className="flex items-start justify-center gap-5 px-5 pt-1 pb-4 sm:pt-4">
                <Link href={`/dev/${comparePair[0].login}`} className="flex flex-col items-center gap-1.5 group w-[110px]">
                  {comparePair[0].avatar_url && (
                    <Image
                      src={comparePair[0].avatar_url}
                      alt={comparePair[0].login}
                      width={56}
                      height={56}
                      className="border-[3px] transition-colors group-hover:brightness-110"
                      style={{
                        imageRendering: "pixelated",
                        borderColor: totalAWins >= totalBWins ? theme.accent : "#3a3a40",
                      }}
                    />
                  )}
                  <p className="truncate text-[10px] text-cream normal-case max-w-[110px] transition-colors group-hover:text-white">@{comparePair[0].login}</p>
                  <p className="text-[8px] text-muted normal-case text-center">{getDevClass(comparePair[0].login)}</p>
                </Link>

                <span className="text-base shrink-0 pt-4" style={{ color: theme.accent }}>VS</span>

                <Link href={`/dev/${comparePair[1].login}`} className="flex flex-col items-center gap-1.5 group w-[110px]">
                  {comparePair[1].avatar_url && (
                    <Image
                      src={comparePair[1].avatar_url}
                      alt={comparePair[1].login}
                      width={56}
                      height={56}
                      className="border-[3px] transition-colors group-hover:brightness-110"
                      style={{
                        imageRendering: "pixelated",
                        borderColor: totalBWins >= totalAWins ? theme.accent : "#3a3a40",
                      }}
                    />
                  )}
                  <p className="truncate text-[10px] text-cream normal-case max-w-[110px] transition-colors group-hover:text-white">@{comparePair[1].login}</p>
                  <p className="text-[8px] text-muted normal-case text-center">{getDevClass(comparePair[1].login)}</p>
                </Link>
              </div>

              {/* ── Scoreboard ── */}
              <div className="mx-4 border-[2px] border-border bg-bg-card">
                {cmpRows.map((s, i) => (
                  <div
                    key={s.key}
                    className={`flex items-center py-2 px-3 ${i < cmpRows.length - 1 ? "border-b border-border/40" : ""}`}
                  >
                    <span
                      className="w-[72px] text-right text-[11px] tabular-nums"
                      style={{ color: s.aW ? theme.accent : s.bW ? "#555" : "#888" }}
                    >
                      {s.key === "rank" ? (s.a > 0 ? `#${s.a}` : "-") : s.a.toLocaleString()}
                    </span>
                    <span className="flex-1 text-center text-[8px] text-muted uppercase tracking-wider">
                      {s.label}
                    </span>
                    <span
                      className="w-[72px] text-left text-[11px] tabular-nums"
                      style={{ color: s.bW ? theme.accent : s.aW ? "#555" : "#888" }}
                    >
                      {s.key === "rank" ? (s.b > 0 ? `#${s.b}` : "-") : s.b.toLocaleString()}
                    </span>
                  </div>
                ))}
              </div>

              {/* ── Winner banner ── */}
              <div
                className="mx-4 mt-3 py-2.5 text-center text-[11px] uppercase tracking-wide"
                style={{
                  backgroundColor: `${theme.accent}15`,
                  border: `2px solid ${theme.accent}40`,
                  color: theme.accent,
                }}
              >
                {cmpSummary}
              </div>

              {/* ── Actions ── */}
              <div className="px-4 pt-3 pb-1 flex gap-2">
                <a
                  href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                    `I just compared my building with ${comparePair[1].login}'s in Git City. It wasn't even close. What's yours?`
                  )}&url=${encodeURIComponent(
                    `${typeof window !== "undefined" ? window.location.origin : ""}/compare/${comparePair[0].login}/${comparePair[1].login}`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-press flex-1 py-2 text-center text-[10px] text-bg"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `2px 2px 0 0 ${theme.shadow}`,
                  }}
                >
                  Share on X
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `${window.location.origin}/compare/${comparePair[0].login}/${comparePair[1].login}`
                    );
                    setCompareCopied(true);
                    setTimeout(() => setCompareCopied(false), 2000);
                  }}
                  className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                >
                  {compareCopied ? "Copied!" : "Copy Link"}
                </button>
              </div>

              {/* Download with lang toggle */}
              <div className="px-4 flex items-center gap-2 pb-1">
                <div className="flex gap-0.5 shrink-0">
                  {(["en", "pt"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setCompareLang(l)}
                      className="px-2 py-0.5 text-[9px] uppercase transition-colors"
                      style={{
                        color: compareLang === l ? theme.accent : "#666",
                        borderBottom: compareLang === l ? `2px solid ${theme.accent}` : "2px solid transparent",
                      }}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/compare-card/${comparePair[0].login}/${comparePair[1].login}?format=landscape&lang=${compareLang}`);
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `gitcity-${comparePair[0].login}-vs-${comparePair[1].login}.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-press flex-1 border-[2px] border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                >
                  Card | 卡片
                </button>
                <button
                  onClick={async () => {
                    const res = await fetch(`/api/compare-card/${comparePair[0].login}/${comparePair[1].login}?format=stories&lang=${compareLang}`);
                    if (!res.ok) return;
                    const blob = await res.blob();
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = `gitcity-${comparePair[0].login}-vs-${comparePair[1].login}-stories.png`;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                    URL.revokeObjectURL(url);
                  }}
                  className="btn-press flex-1 border-[2px] border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                >
                  Stories | 故事
                </button>
              </div>

              {/* Compare Again + Close */}
              <div className="flex gap-2 px-4 pt-1 pb-5 sm:pb-4">
                <button
                  onClick={() => {
                    const first = comparePair[0];
                    setComparePair(null);
                    setCompareBuilding(first);
                    setFocusedBuilding(first.login);
                  }}
                  className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                >
                  Compare Again | 再次对比
                </button>
                <button
                  onClick={closeCompare}
                  className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                >
                  Close | 关闭
                </button>
              </div>
            </div>
          </div>
        </>
        );
      })()}

      {/* ─── Share Modal ─── */}
      {shareData && !flyMode && !exploreMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => { setShareData(null); setSelectedBuilding(null); setFocusedBuilding(null); }}
          />

          {/* Modal */}
          <div className="relative mx-3 border-[3px] border-border bg-bg-raised p-4 text-center sm:mx-0 sm:p-6">
            {/* Close */}
            <button
              onClick={() => { setShareData(null); setSelectedBuilding(null); setFocusedBuilding(null); }}
              className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream"
            >
              &#10005;
            </button>

            {/* Avatar */}
            {shareData.avatar_url && (
              <Image
                src={shareData.avatar_url}
                alt={shareData.login}
                width={48}
                height={48}
                className="mx-auto mb-3 border-[2px] border-border"
                style={{ imageRendering: "pixelated" }}
              />
            )}

            <p className="text-xs text-cream normal-case">
              <span style={{ color: theme.accent }}>@{shareData.login}</span> joined the city! | 该用户加入了城市！
            </p>

            <p className="mt-2 text-[10px] text-muted normal-case">
              Rank <span style={{ color: theme.accent }}>#{shareData.rank ?? "?"}</span>
              {" · "}
              <span style={{ color: theme.accent }}>{shareData.contributions.toLocaleString()}</span> contributions | 该用户做出了 <span style={{ color: theme.accent }}>{shareData.contributions.toLocaleString()}</span> 次贡献
            </p>

            {/* Buttons */}
            <div className="mt-4 flex flex-col items-center gap-2 sm:mt-5 sm:flex-row sm:justify-center sm:gap-3">
              <button
                onClick={() => {
                  if (!selectedBuilding && shareData) {
                    const b = buildings.find(
                      (b) => b.login.toLowerCase() === shareData.login.toLowerCase()
                    );
                    if (b) setSelectedBuilding(b);
                  }
                  setShareData(null);
                  setExploreMode(true);
                }}
                className="btn-press px-4 py-2 text-[10px] text-bg"
                style={{
                  backgroundColor: theme.accent,
                  boxShadow: `3px 3px 0 0 ${theme.shadow}`,
                }}
              >
                Explore Building | 探索建筑
              </button>

              <a
                href={`https://x.com/intent/tweet?text=${encodeURIComponent(
                  `My GitHub just turned into a building. ${shareData.contributions.toLocaleString()} contributions, Rank #${shareData.rank ?? "?"}. What does yours look like?`
                )}&url=${encodeURIComponent(
                  `${window.location.origin}/dev/${shareData.login}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => trackShareClicked("x")}
                className="btn-press border-[3px] border-border px-4 py-2 text-[10px] text-cream transition-colors hover:border-border-light"
              >
                Share on X | 在 X 上分享
              </a>

              <button
                onClick={() => {
                  trackShareClicked("copy_link");
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
              View full profile &rarr; | 查看完整配置文件 &rarr;
            </a>
          </div>
        </div>
      )}

      {/* ─── Sky Ad Card ─── */}
      {clickedAd && (
        <div
          className="fixed inset-0 z-50 bg-black/50"
          onClick={() => setClickedAd(null)}
          onKeyDown={(e) => { if (e.key === "Escape") setClickedAd(null); }}
          tabIndex={-1}
          ref={(el) => el?.focus()}
        >
          {/* Desktop: centered card. Mobile: bottom sheet */}
          <div className="pointer-events-none flex h-full items-end sm:items-center sm:justify-center">
            <div
              className="pointer-events-auto relative w-full border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
                sm:w-[340px] sm:mx-4 sm:border-[3px]
                animate-[slide-up_0.2s_ease-out] sm:animate-[fade-in_0.15s_ease-out]"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close */}
              <button
                onClick={() => setClickedAd(null)}
                className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream z-10 cursor-pointer"
              >
                ESC
              </button>

              {/* Drag handle on mobile */}
              <div className="flex justify-center py-2 sm:hidden">
                <div className="h-1 w-10 rounded-full bg-border" />
              </div>

              {/* Header: brand + sponsored tag */}
              <div className="flex items-center gap-3 px-4 pb-3 sm:pt-4">
                <div
                  className="flex h-9 w-9 flex-shrink-0 items-center justify-center border-[2px]"
                  style={{ borderColor: clickedAd.color, color: clickedAd.color }}
                >
                  <span className="text-sm">{clickedAd.vehicle === "blimp" ? "\u25C6" : clickedAd.vehicle === "billboard" ? "\uD83D\uDCCB" : clickedAd.vehicle === "rooftop_sign" ? "\uD83D\uDD04" : clickedAd.vehicle === "led_wrap" ? "\uD83D\uDCA1" : "\u2708"}</span>
                </div>
                <div className="min-w-0 flex-1">
                  {clickedAd.brand && (
                    <p className="truncate text-sm text-cream">{clickedAd.brand}</p>
                  )}
                  <p className="text-[9px] text-dim">Sponsored</p>
                </div>
              </div>

              {/* Divider */}
              <div className="mx-4 mb-3 h-px bg-border" />

              {/* Description */}
              {clickedAd.description && (
                <p className="mx-4 mb-4 text-xs text-cream normal-case leading-relaxed">
                  {clickedAd.description}
                </p>
              )}

              {/* CTA */}
              {clickedAd.link && (() => {
                const ctaHref = buildAdLink(clickedAd) ?? clickedAd.link;
                const isMailto = clickedAd.link.startsWith("mailto:");
                return (
                  <div className="px-4 pb-5 sm:pb-4">
                    <a
                      href={ctaHref}
                      target={isMailto ? undefined : "_blank"}
                      rel={isMailto ? undefined : "noopener noreferrer"}
                      className="btn-press block w-full py-2.5 text-center text-[10px] text-bg"
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                      }}
                      onClick={() => {
                        track("sky_ad_click", { ad_id: clickedAd.id, vehicle: clickedAd.vehicle, brand: clickedAd.brand ?? "" });
                        trackAdEvent(clickedAd.id, "cta_click", authLogin || undefined);
                        trackSkyAdCtaClick(clickedAd.id, clickedAd.vehicle);
                      }}
                    >
                      {isMailto
                        ? "Send Email \u2192"
                        : `Visit ${new URL(clickedAd.link!).hostname.replace("www.", "")} \u2192`}
                    </a>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}

      {/* ─── Bottom-left controls: Theme + Radio ─── */}
      {!flyMode && !introMode && !rabbitCinematic && !exploreMode && (
        <div className="pointer-events-auto fixed bottom-10 left-3 z-[25] flex items-center gap-2 sm:left-4">
          <button
            onClick={() => setThemeIndex((i) => (i + 1) % THEMES.length)}
            className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
          >
            <span style={{ color: theme.accent }}>&#9654;</span>
            <span className="text-cream">{theme.name}</span>
            <span className="text-dim">{themeIndex + 1}/{THEMES.length}</span>
          </button>
          <LofiRadio accent={theme.accent} shadow={theme.shadow} flyMode={flyMode} raidMode={raidState.phase !== "idle" && raidState.phase !== "preview"} />
          <button
            onClick={replayIntro}
            className="btn-press flex items-center gap-1 border-[3px] border-border bg-bg/70 px-2 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
            title="Replay intro"
          >
            <span style={{ color: theme.accent }}>&#9654;</span>
            <span className="text-cream">Intro</span>
          </button>
        </div>
      )}
      {flyMode && (
        <div className="pointer-events-auto fixed bottom-4 left-3 z-[25] sm:left-4">
          <LofiRadio accent={theme.accent} shadow={theme.shadow} flyMode={flyMode} raidMode={raidState.phase !== "idle" && raidState.phase !== "preview"} />
        </div>
      )}


      {/* ─── Activity Ticker ─── */}
      {!flyMode && !introMode && !rabbitCinematic && feedEvents.length >= 1 && (
        <ActivityTicker
          events={feedEvents}
          onEventClick={(evt) => {
            if (compareBuilding || comparePair) return;
            const login = evt.actor?.login;
            if (login) {
              setFocusedBuilding(login);
              const found = buildings.find(b => b.login.toLowerCase() === login.toLowerCase());
              if (found) {
                setSelectedBuilding(found);
                if (!exploreMode) setExploreMode(true);
              }
            }
          }}
          onOpenPanel={() => setFeedPanelOpen(true)}
        />
      )}

      {/* ─── Gift Modal ─── */}
      {giftModalOpen && selectedBuilding && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => { setGiftModalOpen(false); setGiftItems(null); }}
          />
          <div className="relative z-10 w-full max-w-[280px] border-[3px] border-border bg-bg-raised">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <div>
                <h3 className="text-xs" style={{ color: theme.accent }}>Send Gift</h3>
                <p className="mt-0.5 text-[8px] text-muted normal-case">to @{selectedBuilding.login}</p>
              </div>
              <button
                onClick={() => { setGiftModalOpen(false); setGiftItems(null); }}
                className="text-xs text-muted hover:text-cream"
              >
                &#10005;
              </button>
            </div>

            {/* Items */}
            {giftItems === null ? (
              <p className="py-8 text-center text-[9px] text-dim normal-case animate-pulse">
                Loading...
              </p>
            ) : giftItems.length === 0 ? (
              <p className="py-8 text-center text-[9px] text-dim normal-case">
                No items available
              </p>
            ) : (
              <div className="max-h-72 overflow-y-auto scrollbar-thin">
                {giftItems.map((item) => {
                  const isBuying = giftBuying === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => !item.owned && handleGiftCheckout(item.id)}
                      disabled={!!giftBuying || item.owned}
                      className={`flex w-full items-center gap-3 border-b border-border/30 px-4 py-2.5 text-left transition-colors ${item.owned ? "opacity-35 cursor-not-allowed" : "hover:bg-bg-card/80 disabled:opacity-40"}`}
                    >
                      <span className="text-base shrink-0">{ITEM_EMOJIS[item.id] ?? "🎁"}</span>
                      <span className="flex-1 text-[10px] text-cream">
                        {ITEM_NAMES[item.id] ?? item.id}
                      </span>
                      <span className="text-[10px] shrink-0" style={{ color: item.owned ? undefined : theme.accent }}>
                        {item.owned ? "Owned" : isBuying ? "..." : `$${(item.price_usd_cents / 100).toFixed(2)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Activity Panel (slide-in) ─── */}
      <ActivityPanel
        initialEvents={feedEvents}
        open={feedPanelOpen}
        onClose={() => setFeedPanelOpen(false)}
        onNavigate={(login) => {
          if (compareBuilding || comparePair) return;
          setFeedPanelOpen(false);
          setFocusedBuilding(login);
          const found = buildings.find(b => b.login.toLowerCase() === login.toLowerCase());
          if (found) {
            setSelectedBuilding(found);
            if (!exploreMode) setExploreMode(true);
          }
        }}
      />

      {/* ─── Free Gift Celebration Modal ─── */}
      {giftClaimed && !flyMode && !exploreMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => setGiftClaimed(false)}
          />

          {/* Modal */}
          <div
            className="relative mx-3 border-[3px] border-border bg-bg-raised p-5 text-center sm:mx-0 sm:p-7 animate-[gift-bounce_0.5s_ease-out]"
            style={{ borderColor: theme.accent + "60" }}
          >
            {/* Close */}
            <button
              onClick={() => setGiftClaimed(false)}
              className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream"
            >
              ESC
            </button>

            <div className="text-3xl sm:text-4xl mb-3">{"\uD83C\uDF89"}</div>

            <p className="text-sm text-cream sm:text-base">Gift Unlocked!</p>

            <div
              className="mt-4 inline-flex items-center gap-3 border-[2px] border-border bg-bg-card px-5 py-3"
            >
              <span className="text-2xl">{"\uD83C\uDFC1"}</span>
              <div className="text-left">
                <p className="text-xs text-cream">Flag</p>
                <p className="text-[9px] text-muted normal-case whitespace-pre-line">
                  A flag on top of your building \n 你的建筑上有一个标志
                </p>
              </div>
            </div>

            {/* Upsell strip */}
            <div className="mt-5 w-full max-w-[280px]">
              <p className="mb-2 text-[9px] tracking-widest text-muted uppercase">
                Upgrade your building
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { emoji: "\uD83C\uDF3F", name: "Garden", price: "$0.75" },
                  { emoji: "\u2728", name: "Neon", price: "$1.00" },
                  { emoji: "\uD83D\uDD25", name: "Fire", price: "$1.00" },
                ].map((item) => (
                  <Link
                    key={item.name}
                    href={shopHref}
                    onClick={() => setGiftClaimed(false)}
                    className="flex flex-col items-center gap-1 border-[2px] border-border bg-bg-card px-2 py-2.5 transition-colors hover:border-border-light"
                  >
                    <span className="text-xl">{item.emoji}</span>
                    <span className="text-[8px] text-cream leading-tight">
                      {item.name}
                    </span>
                    <span
                      className="text-[9px] font-bold"
                      style={{ color: theme.accent }}
                    >
                      {item.price}
                    </span>
                  </Link>
                ))}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
              <button
                onClick={() => {
                  setGiftClaimed(false);
                  if (myBuilding) {
                    setFocusedBuilding(myBuilding.login);
                    setSelectedBuilding(myBuilding);
                    setExploreMode(true);
                  }
                }}
                className="btn-press px-5 py-2.5 text-[10px] text-bg"
                style={{
                  backgroundColor: theme.accent,
                  boxShadow: `3px 3px 0 0 ${theme.shadow}`,
                }}
              >
                View in City
              </button>
              <Link
                href={shopHref}
                onClick={() => setGiftClaimed(false)}
                className="btn-press border-[3px] border-border px-5 py-2 text-[10px] text-cream transition-colors hover:border-border-light"
              >
                Visit Shop {"→"}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Mark streak achievements as seen on check-in */}

      {/* Raid Preview Modal */}
      {raidState.phase === "preview" && raidState.previewData && (
        <RaidPreviewModal
          preview={raidState.previewData}
          loading={raidState.loading}
          error={raidState.error}
          onRaid={(boostPurchaseId, vehicleId) => raidActions.executeRaid(boostPurchaseId, vehicleId)}
          onCancel={raidActions.exitRaid}
        />
      )}

      {/* Raid Overlay (cinema bars + text + share) */}
      {raidState.phase !== "idle" && raidState.phase !== "preview" && (
        <RaidOverlay
          phase={raidState.phase}
          raidData={raidState.raidData}
          onSkip={raidActions.skipToShare}
          onExit={raidActions.exitRaid}
        />
      )}

      {/* District chooser modal */}
      {districtChooserOpen && myBuilding && (
        <DistrictChooser
          currentDistrict={myBuilding.district ?? null}
          inferredDistrict={myBuilding.district ?? null}
          onClose={() => { sessionStorage.setItem("district_dismissed", "1"); setDistrictChooserOpen(false); }}
          onChosen={(districtId) => {
            sessionStorage.setItem("district_dismissed", "1");
            setDistrictChooserOpen(false);
            // Update the building in local state
            setBuildings((prev) =>
              prev.map((b) =>
                b.login === myBuilding.login
                  ? { ...b, district: districtId, district_chosen: true }
                  : b
              )
            );
          }}
        />
      )}

      {/* Founder's Landmark modals */}
      {pillModalOpen && (
        <PillModal
          rabbitCompleted={rabbitProgress >= 5}
          onRedPill={() => {
            setPillModalOpen(false);
            setFounderMessageOpen(true);
          }}
          onBluePill={() => {
            setPillModalOpen(false);
            if (rabbitProgress >= 5) return;
            setRabbitSighting(rabbitProgress + 1);
            setRabbitCinematic(true);
          }}
          onClose={() => setPillModalOpen(false)}
        />
      )}
      {founderMessageOpen && (
        <FounderMessage onClose={() => setFounderMessageOpen(false)} />
      )}

      {/* Rabbit Quest Cinematic Overlay */}
      {rabbitCinematic && (
        <div className="fixed inset-0 z-50 pointer-events-none">
          {/* Letterbox bars */}
          <div
            className="absolute inset-x-0 top-0 origin-top bg-black/80 transition-transform duration-700"
            style={{ height: "12%", transform: rabbitCinematicPhase >= 0 ? "scaleY(1)" : "scaleY(0)" }}
          />
          <div
            className="absolute inset-x-0 bottom-0 origin-bottom bg-black/80 transition-transform duration-700"
            style={{ height: "18%", transform: rabbitCinematicPhase >= 0 ? "scaleY(1)" : "scaleY(0)" }}
          />

          {/* CRT scanlines */}
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage: "repeating-linear-gradient(0deg, transparent, transparent 1px, rgba(0,255,65,0.08) 1px, rgba(0,255,65,0.08) 2px)",
              backgroundSize: "100% 2px",
            }}
          />

          {/* Text in lower bar */}
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-center" style={{ height: "18%" }}>
            {["Follow the white rabbit...", "It hides among the plazas..."].map((text, i) => (
              <p
                key={i}
                className="absolute text-center font-pixel normal-case px-4"
                style={{
                  fontSize: "clamp(0.85rem, 3vw, 1.5rem)",
                  letterSpacing: "0.08em",
                  color: "#00ff41",
                  textShadow: "0 0 20px rgba(0,255,65,0.5), 0 0 40px rgba(0,255,65,0.2)",
                  opacity: rabbitCinematicPhase === i ? 1 : 0,
                  transition: "opacity 0.7s ease-in-out",
                }}
              >
                {text}
              </p>
            ))}
          </div>

          {/* Skip button */}
          <button
            className="pointer-events-auto absolute top-4 right-4 z-[60] font-pixel text-[10px] sm:text-[12px] tracking-wider border border-[#00ff41]/40 px-3 py-1.5 transition-colors hover:bg-[#00ff41]/10"
            style={{
              color: "#00ff41",
              textShadow: "0 0 8px rgba(0,255,65,0.3)",
            }}
            onClick={endRabbitCinematic}
          >
            SKIP
          </button>
        </div>
      )}

      {/* Rabbit hint flash ("The rabbit moves deeper...") */}
      {rabbitHintFlash && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          style={{ animation: "rabbitHintAnim 3s ease-in-out forwards" }}
        >
          <div className="absolute inset-0 bg-black/60" />
          <p
            className="relative font-pixel text-[14px] sm:text-[16px] tracking-widest text-center px-4"
            style={{
              color: "#00ff41",
              textShadow: "0 0 15px rgba(0,255,65,0.5), 0 0 30px rgba(0,255,65,0.2)",
            }}
          >
            {rabbitHintFlash}
          </p>
          <style jsx>{`
            @keyframes rabbitHintAnim {
              0% { opacity: 0; }
              15% { opacity: 1; }
              70% { opacity: 1; }
              100% { opacity: 0; }
            }
          `}</style>
        </div>
      )}

      {/* Rabbit completion cinematic */}
      {rabbitCompletion && (
        <RabbitCompletion onComplete={() => setRabbitCompletion(false)} />
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
