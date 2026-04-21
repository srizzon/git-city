"use client";

import { useState, useCallback, useEffect, useRef, useMemo, Suspense } from "react";
import { Menu, X } from "lucide-react";
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
  type DeveloperRecord,
} from "@/lib/github";
import { SPONSORS, gridToWorldPos } from "@/lib/sponsors/registry";
import { getLandmarkAdId } from "@/lib/sponsors/landmarkAdIds";
import Image from "next/image";
import Link from "next/link";
import ActivityTicker, { type FeedEvent } from "@/components/ActivityTicker";
import { ITEM_NAMES, ITEM_EMOJIS } from "@/lib/zones";
import { useStreakCheckin } from "@/lib/useStreakCheckin";
import { useLiveUsers } from "@/lib/useLiveUsers";
import { useCodingPresence } from "@/lib/useCodingPresence";
import { useFlyPresence } from "@/lib/useFlyPresence";
import { useRaidSequence } from "@/lib/useRaidSequence";
import { isFridayThe13th } from "@/lib/raid";
import { useDailies } from "@/lib/useDailies";
import InviteCard, { type InvitePreview } from "@/components/InviteCard";
import XpBar from "@/components/XpBar";
import PixelBalance from "@/components/PixelBalance";
import { rankFromLevel, tierFromLevel, levelProgress, xpForLevel } from "@/lib/xp";
import LoadingScreen, { type LoadingStage } from "@/components/LoadingScreen";
import RadarMap from "@/components/RadarMap";
import { getCityCache, setCityCache, clearCityCache } from "@/lib/cityCache";
import { DEFAULT_SKY_ADS, buildAdLink, trackAdEvent, trackAdEvents, appendClickId, isBuildingAd } from "@/lib/skyAds";
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
  trackEArcadeClicked,
  trackLandmarkClicked,
} from "@/lib/himetrica";

const CityCanvas = dynamic(() => import("@/components/CityCanvas"), {
  ssr: false,
});

const ActivityPanel = dynamic(() => import("@/components/ActivityPanel"), { ssr: false });
const DailiesWidget = dynamic(() => import("@/components/DailiesWidget"), { ssr: false });
const RaidPreviewModal = dynamic(() => import("@/components/RaidPreviewModal"), { ssr: false });
const RaidOverlay = dynamic(() => import("@/components/RaidOverlay"), { ssr: false });
const PillModal = dynamic(() => import("@/components/PillModal"), { ssr: false });
const FounderMessage = dynamic(() => import("@/components/FounderMessage"), { ssr: false });
const EArcadeCard = dynamic(() => import("@/components/EArcadeCard"), { ssr: false });
const SponsoredCard = dynamic(() => import("@/lib/sponsors/SponsoredCard"), { ssr: false });
const RabbitCompletion = dynamic(() => import("@/components/RabbitCompletion"), { ssr: false });
const DistrictChooser = dynamic(() => import("@/components/DistrictChooser"), { ssr: false });
const LevelUpToast = dynamic(() => import("@/components/LevelUpToast"), { ssr: false });

// Feature flags — flip to switch milestone banner
const MILESTONE_MODE: "stars" | "devs" = "devs"; // "stars" = GitHub stars road to 1K, "devs" = total developers

const THEMES = [
  { name: "Midnight", accent: "#6090e0", shadow: "#203870" },
  { name: "Sunset", accent: "#c8e64a", shadow: "#5a7a00" },
  { name: "Neon", accent: "#e040c0", shadow: "#600860" },
  { name: "Emerald", accent: "#f0c060", shadow: "#806020" },
];

// Achievement display data for profile card (client-side, mirrors DB)
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
  daily_rookie: "bronze", daily_regular: "silver", daily_master: "gold", daily_legend: "diamond",
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
  daily_rookie: "Daily Rookie", daily_regular: "Daily Regular", daily_master: "Daily Master", daily_legend: "Daily Legend",
};

// Dev "class" — funny RPG-style title, deterministic per username
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

interface CityStats {
  total_developers: number;
  total_contributions: number;
}

// Milestones that trigger 24h celebration effects
const CELEBRATION_MILESTONES = [10000, 15000, 20000, 25000, 30000, 40000, 50000, 75000, 100000];

// ─── Loading phases for search feedback ─────────────────────
const LOADING_PHASES = [
  { delay: 0, text: "Fetching GitHub profile..." },
  { delay: 2000, text: "Analyzing contributions..." },
  { delay: 5000, text: "Building the city block..." },
  { delay: 9000, text: "Almost there..." },
  { delay: 13000, text: "This one's a big profile. Hang tight..." },
];

// Errors that won't change if you retry the same username
const PERMANENT_ERROR_CODES = new Set(["not-found", "org", "no-activity"]);

const ERROR_MESSAGES: Record<string, { primary: (u: string) => string; secondary: string; hasRetry?: boolean; hasLink?: boolean }> = {
  "not-found": {
    primary: (u) => `"@${u}" doesn't exist on GitHub`,
    secondary: "Check the spelling — could be a typo. GitHub usernames are case-insensitive.",
  },
  "org": {
    primary: (u) => `"@${u}" is an organization, not a person`,
    secondary: "Git City is for individual profiles. Try searching for one of its contributors by their personal username.",
  },
  "no-activity": {
    primary: (u) => `"@${u}" has no public activity yet`,
    secondary: "Is this you? Open your profile settings, scroll to 'Contributions & activity', and enable 'Include private contributions'. Then search again.",
    hasLink: true,
  },
  "rate-limit": {
    primary: () => "Search limit reached",
    secondary: "You can look up 10 new profiles per hour. Developers already in the city are unlimited.",
  },
  "github-rate-limit": {
    primary: () => "GitHub's API is temporarily unavailable",
    secondary: "Too many requests to GitHub. Try again in a few minutes.",
  },
  "timeout": {
    primary: (u) => `Fetching "@${u}" took too long`,
    secondary: "GitHub's API was slow to respond. This usually resolves itself — try again in a moment.",
    hasRetry: true,
  },
  "network": {
    primary: () => "Couldn't reach the server",
    secondary: "Check your internet connection and try again.",
    hasRetry: true,
  },
  "generic": {
    primary: () => "Something went wrong",
    secondary: "An unexpected error occurred. Try again.",
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
    if (feedback?.type !== "loading") {
      const timerId = setTimeout(() => setPhaseIndex(0), 0);
      return () => clearTimeout(timerId);
    }
    const timers = LOADING_PHASES.map((phase, i) =>
      setTimeout(() => setPhaseIndex(i), phase.delay)
    );
    return () => timers.forEach(clearTimeout);
  }, [feedback?.type]);

  // Auto-dismiss errors after 8s (except persistent ones)
  useEffect(() => {
    if (feedback?.type !== "error") return;
    const code = feedback.code ?? "generic";
    if (code === "no-activity" || code === "network" || code === "generic" || code === "timeout") return;
    const timer = setTimeout(onDismiss, 8000);
    return () => clearTimeout(timer);
  }, [feedback, onDismiss]);

  if (!feedback) return null;

  // Loading state
  if (feedback.type === "loading") {
    return (
      <div className="flex items-center gap-2 py-1 animate-[fade-in_0.15s_ease-out]">
        <span className="blink-dot h-2 w-2 shrink-0" style={{ backgroundColor: accentColor }} />
        <span className="text-[11px] text-muted normal-case">{LOADING_PHASES[phaseIndex].text}</span>
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
      <p className="mt-1 text-[10px] text-muted normal-case">{msg.secondary}</p>
      {msg.hasLink && (
        <a
          href="https://github.com/settings/profile"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-block text-[10px] normal-case transition-colors hover:text-cream"
          style={{ color: accentColor }}
        >
          Open Profile Settings &rarr;
        </a>
      )}
      {msg.hasRetry && (
        <button
          onClick={onRetry}
          className="btn-press mt-2 border-2 border-border px-3 py-1 text-[10px] text-cream transition-colors hover:border-border-light"
        >
          Retry
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
    <div className="hidden w-50 sm:block">
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
          View all &rarr;
        </a>
      </div>
      <div className="border-2 border-border bg-bg-raised/80 backdrop-blur-sm">
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
            <span className="ml-2 shrink-0 text-[10px] text-muted">
              {(b[cat.key] as number).toLocaleString()}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
}

// ─── Streak Pill (HUD element, inline next to @username) ────
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
  // Keep raw dev records so we can inject new devs and regenerate layout locally
  const rawDevsRef = useRef<DeveloperRecord[]>([]);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const dropsPayloadRef = useRef<any[]>([]);
  const [plazas, setPlazas] = useState<CityPlaza[]>([]);
  const [decorations, setDecorations] = useState<CityDecoration[]>([]);
  const [river, setRiver] = useState<CityRiver | null>(null);
  const [bridges, setBridges] = useState<CityBridge[]>([]);
  const [districtZones, setDistrictZones] = useState<DistrictZone[]>([]);
  const [loading, setLoading] = useState(false);
  // Loading state machine — skip on return visits that still have cached data
  const [loadStage, setLoadStage] = useState<LoadingStage>("init");
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: "loading" | "error";
    code?: "not-found" | "org" | "no-activity" | "rate-limit" | "github-rate-limit" | "timeout" | "network" | "generic";
    username?: string;
    raw?: string;
  } | null>(null);
  const [flyMode, setFlyMode] = useState(false);
  const [flyVehicle, setFlyVehicle] = useState<string>("airplane");
  const [introMode, setIntroMode] = useState(false);
  const [introPhase, setIntroPhase] = useState(-1); // -1 = not started, 0-3 = text phases, 4 = done
  const [exploreMode, setExploreMode] = useState(false);
  const [themeIndex, setThemeIndex] = useState(0);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = localStorage.getItem("gitcity_theme");
    if (saved !== null) {
      const n = parseInt(saved, 10);
      if (n >= 0 && n <= 3) setThemeIndex(n);
    }
  }, []);


  // Merge active drops into a freshly generated layout (by rank)
  const mergeDrops = useCallback((blds: CityBuilding[]) => {
    const payload = dropsPayloadRef.current;
    if (payload.length === 0) return;
    const dropByRank = new Map<number, (typeof payload)[0]>();
    for (const d of payload) dropByRank.set(d.n, d);
    for (const b of blds) {
      const d = dropByRank.get(b.rank);
      if (d) {
        b.active_drop = { id: d.id, rarity: d.r, points: d.p, max_pulls: d.m, pull_count: d.c, expires_at: d.x };
      }
    }
  }, []);

  const [hud, setHud] = useState({ speed: 0, altitude: 0 });
  const [playerPos, setPlayerPos] = useState<{ x: number; z: number }>({ x: 0, z: 0 });
  const [playerYaw, setPlayerYaw] = useState(0);
  const [cameraPos, setCameraPos] = useState<{ x: number; z: number; tx: number; tz: number }>({ x: 800, z: 1000, tx: 0, tz: 0 });
  const [districtAnnouncement, setDistrictAnnouncement] = useState<{ name: string; color: string; population: number } | null>(null);
  const lastDistrictRef = useRef<string | null>(null);
  const announceTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const announceCooldownRef = useRef(0);
  const [flyPaused, setFlyPaused] = useState(false);
  const [flyPauseSignal, setFlyPauseSignal] = useState(0);
  const [flyJoystickState, setFlyJoystickState] = useState<{ baseX: number; baseY: number; dx: number; dy: number } | null>(null);
  const [flyBoostActive, setFlyBoostActive] = useState(false);
  const [flyBrakeActive, setFlyBrakeActive] = useState(false);
  const [flyScore, setFlyScore] = useState({ score: 0, earned: 0, combo: 0, collected: 0, maxCombo: 1 });
  const [flyPersonalBest, setFlyPersonalBest] = useState(0);
  const flyStartTime = useRef(0);
  const flyPausedAt = useRef(0);
  const flyTotalPauseMs = useRef(0);
  const exitFlyRef = useRef<(() => void) | null>(null);
  const [flyElapsedSec, setFlyElapsedSec] = useState(0);
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
  const [invitePreview, setInvitePreview] = useState<InvitePreview | null>(null);
  const [vsCodeKey, setVsCodeKey] = useState<string | null>(null);
  const [vsCodeKeyLoading, setVsCodeKeyLoading] = useState(false);
  const [vsCodeKeyCopied, setVsCodeKeyCopied] = useState(false);
  const [codingPanelOpen, setCodingPanelOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [codingInfoOpen, setCodingInfoOpen] = useState(false);
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
  const [dropPulling, setDropPulling] = useState(false);
  const [myDropPulls, setMyDropPulls] = useState<Record<string, { points: number }>>({});
  const myDropPullsLoaded = useRef(false);
  const [dropHint, setDropHint] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [dropPlantOpen, setDropPlantOpen] = useState(false);
  const [dropPlantRarity, setDropPlantRarity] = useState("common");
  const [dropPlantDuration, setDropPlantDuration] = useState(24);
  const [dropPlantMaxPulls, setDropPlantMaxPulls] = useState(50);
  const [dropPlantItem, setDropPlantItem] = useState("");
  const [dropPlantItems, setDropPlantItems] = useState<{ id: string; name: string; category: string }[]>([]);
  const [dropPlanting, setDropPlanting] = useState(false);
  const [dropPlantResult, setDropPlantResult] = useState<string | null>(null);
  const visitTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [compareBuilding, setCompareBuilding] = useState<CityBuilding | null>(null);
  const [comparePair, setComparePair] = useState<[CityBuilding, CityBuilding] | null>(null);
  const [compareCinematicPlaying, setCompareCinematicPlaying] = useState(false);

  useEffect(() => {
    if (comparePair) {
      setCompareCinematicPlaying(true);
    } else {
      setCompareCinematicPlaying(false);
    }
  }, [comparePair]);
  const [compareSelfHint, setCompareSelfHint] = useState(false);
  const [giftModalOpen, setGiftModalOpen] = useState(false);
  const [giftItems, setGiftItems] = useState<{ id: string; price_usd_cents: number; price_pixels: number | null; name: string; owned: boolean }[] | null>(null);
  const [giftBuying, setGiftBuying] = useState<string | null>(null);
  const [giftError, setGiftError] = useState<string | null>(null);
  const [compareCopied, setCompareCopied] = useState(false);
  const [compareLang, setCompareLang] = useState<"en" | "pt">("en");
  const [clickedAd, setClickedAd] = useState<import("@/lib/skyAds").SkyAd | null>(null);
  const [skyAds, setSkyAds] = useState<import("@/lib/skyAds").SkyAd[]>(DEFAULT_SKY_ADS);
  const [starCount, setStarCount] = useState<number | null>(null);
  const [discordMembers, setDiscordMembers] = useState<number | null>(null);
  const [jobCount, setJobCount] = useState<number | null>(null);
  const [jobPanelOpen, setJobPanelOpen] = useState(false);
  const [jobPreview, setJobPreview] = useState<Array<{ id: string; title: string; salary_min: number; salary_max: number; salary_currency: string; tier: string; seniority: string; role_type: string; company: { name: string } | null }>>([]);
  const [pillModalOpen, setPillModalOpen] = useState(false);
  const [founderMessageOpen, setFounderMessageOpen] = useState(false);
  const [eArcadeOpen, setEArcadeOpen] = useState(false);
  const [arcadeOnline, setArcadeOnline] = useState<number>(0);
  const [activeSponsor, setActiveSponsor] = useState<string | null>(null);
  const [districtChooserOpen, setDistrictChooserOpen] = useState(false);
  const [rabbitCinematic, setRabbitCinematic] = useState(false);
  const [rabbitCinematicPhase, setRabbitCinematicPhase] = useState(-1);
  const [rabbitProgress, setRabbitProgress] = useState(0);
  useEffect(() => {
    const saved = parseInt(localStorage.getItem("gitcity_rabbit_progress") ?? "0", 10) || 0;
    if (saved > 0) setRabbitProgress(saved);
  }, []);
  const [rabbitSighting, setRabbitSighting] = useState<number | null>(null);
  const [rabbitCompletion, setRabbitCompletion] = useState(false);
  const [rabbitHintFlash, setRabbitHintFlash] = useState<string | null>(null);

  // Growth optimization (A1: sign-in prompt, A5: ad direct open)
  const buildingClickCountRef = useRef(0);
  const signInPromptShownRef = useRef(false);
  const [signInPromptVisible, setSignInPromptVisible] = useState(false);
  const [adToast, setAdToast] = useState<string | null>(null);

  // Welcome CTA (shown after intro for non-logged-in users)
  const [welcomeCtaVisible, setWelcomeCtaVisible] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // XP level-up toast
  const [levelUpLevel, setLevelUpLevel] = useState<number | null>(null);

  // Fly onboarding
  const [showDailyNudge, setShowDailyNudge] = useState(false);
  const [showFlyHint, setShowFlyHint] = useState(false);
  const [showFlyControls, setShowFlyControls] = useState(false);
  const [showFlyResults, setShowFlyResults] = useState<{
    score: number; collected: number; maxCombo: number; timeBonus: number;
    isNewPB: boolean; rank: number; totalPilots: number;
  } | null>(null);
  const dailyNudgeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flyHintTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const flyResultsTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // A8: Ghost preview for own building
  const ghostPreviewShownRef = useRef(false);
  const [ghostPreviewLogin, setGhostPreviewLogin] = useState<string | null>(null);

  // Raid system
  const [raidState, raidActions] = useRaidSequence();
  const prevRaidPhaseRef = useRef<string>("idle");
  const lastSuccessfulRaidRef = useRef<{ defenderLogin: string; attackerLogin: string; tagStyle: string } | null>(null);

  // Fetch GitHub star count + Discord member count + Arcade player count
  useEffect(() => {
    fetch("https://api.github.com/repos/srizzon/git-city")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.stargazers_count != null) setStarCount(d.stargazers_count); })
      .catch(() => { });
    fetch("https://discord.com/api/v9/invites/2bTjFAkny7?with_counts=true")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => { if (d?.approximate_member_count != null) setDiscordMembers(d.approximate_member_count); })
      .catch(() => { });
    fetch("/api/jobs?preview=true")
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.total != null) setJobCount(d.total);
        if (Array.isArray(d?.listings)) setJobPreview(d.listings);
      })
      .catch(() => { });
    const pkHost = process.env.NEXT_PUBLIC_PARTYKIT_HOST;
    if (pkHost) {
      const base = pkHost.startsWith("http") ? pkHost : `${pkHost.includes("localhost") ? "http" : "https"}://${pkHost}`;
      fetch(`${base}/parties/lobby/main`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: { count?: number } | null) => { if (d?.count) setArcadeOnline(d.count); })
        .catch(() => { });
    }
  }, []);

  // Track successful raid data before state resets
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
  useEffect(() => {
    fetch("/api/sky-ads")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (Array.isArray(data) && data.length > 0) setSkyAds(data); })
      .catch(() => { });
  }, []);

  // Derived — second focused building for dual-focus camera
  const focusedBuildingB = comparePair ? comparePair[1].login : null;

  const [isMobile, setIsMobile] = useState(false);

  const theme = THEMES[themeIndex];
  const didInit = useRef(false);
  const savedFocusRef = useRef<string | null>(null);

  // Broadcast mode/theme to global LofiRadio (lives in layout)
  useEffect(() => {
    const detail = {
      flyMode,
      raidMode: raidState.phase !== "idle" && raidState.phase !== "preview",
      accent: theme.accent,
      shadow: theme.shadow,
      hidden: flyMode && isMobile,
    };
    // Store for late-mounting components (e.g. portal)
    (window as unknown as Record<string, unknown>).__gcRadioMode = detail;
    window.dispatchEvent(new CustomEvent("gc:radio-mode", { detail }));
  }, [flyMode, raidState.phase, theme.accent, theme.shadow, isMobile]);

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

  const authAvatar = (session?.user?.user_metadata?.avatar_url ?? "") as string;
  const { pilotsRef: flyPilotsRef, sendMove: flySendMove } = useFlyPresence(
    flyMode,
    authLogin,
    authAvatar,
    flyVehicle,
  );

  // Fetch existing VS Code API key
  useEffect(() => {
    if (!session) return;
    fetch("/api/vscode-key")
      .then(r => r.json())
      .then(d => { if (d.key) setVsCodeKey(d.key); })
      .catch(() => { });
  }, [session]);

  // Fetch user's drop pulls from DB (source of truth, survives refresh/device changes)
  useEffect(() => {
    if (!session || buildings.length === 0 || myDropPullsLoaded.current) return;
    const hasDrops = buildings.some((b) => b.active_drop);
    if (!hasDrops) return;
    myDropPullsLoaded.current = true;

    let cancelled = false;
    fetch("/api/drops/my-pulls")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (cancelled || !data?.pulls) return;
        const pullMap: Record<string, { points: number }> = {};
        for (const [dropId, info] of Object.entries(data.pulls as Record<string, { points: number; pull_count: number }>)) {
          pullMap[dropId] = { points: info.points };
        }
        if (Object.keys(pullMap).length > 0) {
          setMyDropPulls(pullMap);
        }
        // Patch stale pull_count on buildings with fresh DB values
        setBuildings((prev) =>
          prev.map((b) => {
            const fresh = b.active_drop && (data.pulls as Record<string, { pull_count: number }>)[b.active_drop.id];
            if (!fresh) return b;
            return { ...b, active_drop: { ...b.active_drop!, pull_count: fresh.pull_count } };
          })
        );
      })
      .catch(() => { });
    return () => { cancelled = true; };
  }, [session, buildings]);

  // Show drop hint once after city loads
  const dropHintShown = useRef(false);
  const [dropHintText, setDropHintText] = useState("");
  useEffect(() => {
    if (dropHintShown.current || loadStage !== "done" || buildings.length === 0) return;
    const dropsBuildings = buildings.filter((b) => b.active_drop);
    if (dropsBuildings.length === 0) return;
    dropHintShown.current = true;
    const districts = [...new Set(dropsBuildings.map((b) => b.district).filter(Boolean))];
    const shown = districts.slice(0, 2).map((d) => DISTRICT_NAMES[d!] ?? d);
    const extra = districts.length - shown.length;
    let text = "Drops are hidden in the city";
    if (shown.length > 0) {
      text = `Drops hidden in ${shown.join(", ")}${extra > 0 ? ` +${extra} more` : ""}`;
    }
    setDropHintText(text);
    const timer = setTimeout(() => {
      setDropHint(true);
      setTimeout(() => setDropHint(false), 5000);
    }, 3000);
    return () => clearTimeout(timer);
  }, [loadStage, buildings]);

  // Admin check (client-side, for UI only - real auth is on the server endpoints)
  useEffect(() => {
    const adminLogins = (process.env.NEXT_PUBLIC_ADMIN_GITHUB_LOGINS ?? "")
      .split(",").map(l => l.trim().toLowerCase()).filter(Boolean);
    const admin = !!authLogin && adminLogins.includes(authLogin);
    setIsAdmin(admin);
    if (admin) {
      fetch("/api/items").then(r => r.json()).then(d => setDropPlantItems(d.items ?? [])).catch(() => { });
    }
  }, [authLogin]);

  // Fly timer — ticks every second while flying and not paused
  useEffect(() => {
    if (!flyMode || flyPaused) return;
    const id = setInterval(() => {
      const now = Date.now();
      const elapsed = now - flyStartTime.current - flyTotalPauseMs.current;
      setFlyElapsedSec(Math.floor(elapsed / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [flyMode, flyPaused]);

  // Dismiss fly onboarding overlays when entering fly mode
  useEffect(() => {
    if (flyMode) {
      setShowDailyNudge(false); setShowFlyHint(false); setShowFlyResults(null);
      clearTimeout(dailyNudgeTimerRef.current); clearTimeout(flyHintTimerRef.current); clearTimeout(flyResultsTimerRef.current);
    }
  }, [flyMode]);

  // Fetch fly vehicle from raid loadout (on login)
  const sessionUserId = session?.user?.id;
  useEffect(() => {
    if (!sessionUserId) return;
    fetch("/api/raid/loadout")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => { if (data?.vehicle) setFlyVehicle(data.vehicle); })
      .catch(() => { });
  }, [sessionUserId]);

  // Load theme from DB when logged in (overrides localStorage)
  const themeLoadedFromDb = useRef(false);
  useEffect(() => {
    if (!sessionUserId || themeLoadedFromDb.current) return;
    themeLoadedFromDb.current = true;
    fetch("/api/preferences/theme")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data && typeof data.city_theme === "number" && data.city_theme >= 0 && data.city_theme <= 3) {
          setThemeIndex(data.city_theme);
          localStorage.setItem("gitcity_theme", String(data.city_theme));
        }
      })
      .catch(() => { });
  }, [sessionUserId]);

  // Cycle theme: save to localStorage + sync to DB if logged in
  const cycleTheme = useCallback(() => {
    setThemeIndex((i) => {
      const next = (i + 1) % THEMES.length;
      localStorage.setItem("gitcity_theme", String(next));
      if (sessionUserId) {
        fetch("/api/preferences/theme", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ city_theme: next }),
        }).catch(() => { });
      }
      return next;
    });
  }, [sessionUserId]);

  // Save ?ref= to localStorage (7-day expiry)
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
          trackMissionRef.current("visit_building");
          trackMissionRef.current("visit_3_buildings");
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
        trackMissionRef.current("give_kudos");
        trackMissionRef.current("give_kudos_3");
        setKudosSent(true);
        // Increment kudos_count locally
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

  // Drop pull handler
  const handleDropPull = useCallback(async (dropId: string) => {
    if (dropPulling || !session) return;
    setDropPulling(true);
    try {
      const res = await fetch("/api/drops/pull", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ drop_id: dropId }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setMyDropPulls((prev) => ({ ...prev, [dropId]: { points: data.points_earned } }));
        // Update pull_count locally (only if not already_pulled, to avoid double increment)
        if (!data.already_pulled && selectedBuilding?.active_drop?.id === dropId) {
          const updatedDrop = { ...selectedBuilding.active_drop, pull_count: selectedBuilding.active_drop.pull_count + 1 };
          setSelectedBuilding({ ...selectedBuilding, active_drop: updatedDrop });
          setBuildings((prev) =>
            prev.map((b) =>
              b.active_drop?.id === dropId ? { ...b, active_drop: updatedDrop } : b
            )
          );
        }
      }
    } catch { /* ignore */ }
    finally { setDropPulling(false); }
  }, [dropPulling, session, selectedBuilding]);

  // Admin: plant drop on selected building
  const handlePlantDrop = useCallback(async () => {
    if (!selectedBuilding || dropPlanting) return;
    setDropPlanting(true);
    setDropPlantResult(null);
    try {
      const res = await fetch("/api/admin/drops", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          building_login: selectedBuilding.login,
          rarity: dropPlantRarity,
          duration_hours: dropPlantDuration,
          max_pulls: dropPlantMaxPulls,
          item_reward: dropPlantRarity === "legendary" && dropPlantItem ? dropPlantItem : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setDropPlantResult(data.error ?? "Failed");
      } else {
        // Update building locally with the new drop
        const drop = data.drop;
        const activeDrop = { id: drop.id, rarity: drop.rarity, points: drop.points, max_pulls: drop.max_pulls, pull_count: 0, expires_at: drop.expires_at };
        setSelectedBuilding({ ...selectedBuilding, active_drop: activeDrop });
        setBuildings((prev) => prev.map((b) => b.login === selectedBuilding.login ? { ...b, active_drop: activeDrop } : b));
        setDropPlantOpen(false);
        setDropPlantResult("Planted!");
        setTimeout(() => setDropPlantResult(null), 2000);
      }
    } catch {
      setDropPlantResult("Network error");
    } finally {
      setDropPlanting(false);
    }
  }, [selectedBuilding, dropPlanting, dropPlantRarity, dropPlantDuration, dropPlantMaxPulls, dropPlantItem]);

  // Gift: open modal with available items
  const handleOpenGift = useCallback(async () => {
    if (!selectedBuilding || !session) return;
    setGiftModalOpen(true);
    setGiftItems(null);
    setGiftError(null);
    try {
      const res = await fetch("/api/items");
      if (!res.ok) return;
      const { items } = await res.json();
      const receiverOwned = new Set(selectedBuilding.owned_items ?? []);
      const NON_GIFTABLE = new Set(["flag", "custom_color"]);
      const available = (items as { id: string; name: string; price_usd_cents: number; price_pixels: number | null; category: string }[])
        .filter((i) => (i.price_pixels ?? i.price_usd_cents) > 0 && !NON_GIFTABLE.has(i.id))
        .map((i) => ({ ...i, owned: receiverOwned.has(i.id) }));
      setGiftItems(available);
    } catch { /* ignore */ }
  }, [selectedBuilding, session]);

  // Gift: checkout for receiver
  const handleGiftCheckout = useCallback(async (itemId: string) => {
    if (!selectedBuilding || giftBuying) return;
    setGiftBuying(itemId);
    setGiftError(null);
    try {
      const res = await fetch("/api/pixels/spend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          item_id: itemId,
          gifted_to_login: selectedBuilding.login,
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setGiftError(null);
        setGiftItems((prev) =>
          prev?.map((i) => i.id === itemId ? { ...i, owned: true } : i) ?? null
        );
      } else {
        const msg = data.error === "insufficient_balance"
          ? "Not enough PX. Buy more at /pixels"
          : data.error === "already_owned"
            ? "They already own this item"
            : data.error || "Gift failed";
        setGiftError(msg);
      }
    } catch {
      setGiftError("Network error. Try again.");
    } finally {
      setGiftBuying(null);
    }
  }, [selectedBuilding, giftBuying]);


  const lastDistRef = useRef(999);

  const endRabbitCinematic = useCallback(() => {
    setRabbitCinematic(false);
    setRabbitCinematicPhase(-1);
  }, []);

  // ESC: layered dismissal
  // During fly mode: only close overlays (profile card) — AirplaneFlight handles pause/exit
  // Outside fly mode: compare → share modal → profile card → focus → explore mode
  useEffect(() => {
    if (flyMode && !selectedBuilding && !pillModalOpen && !founderMessageOpen && !eArcadeOpen && !activeSponsor) return;
    if (!flyMode && !exploreMode && !focusedBuilding && !shareData && !selectedBuilding && !giftClaimed && !giftModalOpen && !comparePair && !compareBuilding && !founderMessageOpen && !pillModalOpen && !eArcadeOpen && !activeSponsor && !rabbitCinematic && !invitePreview && raidState.phase === "idle") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        // Founder modals take highest priority
        if (founderMessageOpen) { setFounderMessageOpen(false); return; }
        if (pillModalOpen) { setPillModalOpen(false); return; }
        if (eArcadeOpen) { setEArcadeOpen(false); return; }
        if (activeSponsor) { setActiveSponsor(null); return; }
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
          else if (invitePreview) { setInvitePreview(null); }
          else if (shareData) { setShareData(null); setSelectedBuilding(null); setFocusedBuilding(null); }
          else if (selectedBuilding) { setSelectedBuilding(null); setFocusedBuilding(null); }
          else if (focusedBuilding) setFocusedBuilding(null);
          else if (exploreMode) { setExploreMode(false); setFocusedBuilding(savedFocusRef.current); savedFocusRef.current = null; }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [flyMode, exploreMode, focusedBuilding, shareData, selectedBuilding, giftClaimed, giftModalOpen, comparePair, compareBuilding, founderMessageOpen, pillModalOpen, eArcadeOpen, activeSponsor, rabbitCinematic, endRabbitCinematic, raidState.phase, raidActions, invitePreview]);

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
      } catch { }
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let allDevs: any[] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cityStats: any = null;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let dropsPayload: any[] = [];

    // Skip snapshot when busting cache — go straight to DB for fresh data
    if (!bustCache) {
      try {
        const v = Math.floor(Date.now() / 300_000);
        const snapshotUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/city-data/snapshot.json?v=${v}`;
        const snapshotRes = await fetch(snapshotUrl);
        if (snapshotRes.ok) {
          const buf = await snapshotRes.arrayBuffer();
          const ds = new DecompressionStream("gzip");
          const stream = new Blob([buf]).stream().pipeThrough(ds);
          const snapshot = await new Response(stream).json();
          allDevs = snapshot.developers;
          cityStats = snapshot.stats;
          dropsPayload = snapshot._d ?? [];
        }
      } catch { /* fall through to chunked */ }
    }

    // Snapshot is the only data source. No chunked API fallback.

    if (allDevs.length === 0) return null;

    // Apply loadout override from localStorage (saved in shop, TTL 10 min)
    try {
      const raw = localStorage.getItem("gitcity:loadout_override");
      if (raw) {
        const { developerId, loadout, ts } = JSON.parse(raw);
        if (Date.now() - ts < 10 * 60 * 1000) {
          const idx = allDevs.findIndex((d) => d.id === developerId);
          if (idx !== -1) {
            allDevs[idx] = { ...allDevs[idx], loadout };
          }
        } else {
          localStorage.removeItem("gitcity:loadout_override");
        }
      }
    } catch { }

    rawDevsRef.current = allDevs;
    if (dropsPayload.length > 0) dropsPayloadRef.current = dropsPayload;
    setStats(cityStats);
    const layout = generateCityLayout(allDevs);
    mergeDrops(layout.buildings);

    setBuildings(layout.buildings);
    setPlazas(layout.plazas);
    setDecorations(layout.decorations);
    setRiver(layout.river);
    setBridges(layout.bridges);
    setDistrictZones(layout.districtZones);
    setCityCache({ ...layout, stats: cityStats, rawDevs: rawDevsRef.current });
    return layout.buildings;
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
    const cached = getCityCache();
    if (cached) {
      rawDevsRef.current = cached.rawDevs ?? [];
      setBuildings(cached.buildings);
      setPlazas(cached.plazas);
      setDecorations(cached.decorations);
      setRiver(cached.river);
      setBridges(cached.bridges);
      setDistrictZones(cached.districtZones);
      setStats(cached.stats);
      setLoadStage("done");
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

        // Fetch city data
        setLoadStage("fetching");
        setLoadProgress(10);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allDevs: any[] = [];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let cityStats: any = null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let dropsPayload: any[] = [];

        // Try pre-computed snapshot first (single file from Supabase CDN)
        try {
          const v = Math.floor(Date.now() / 300_000); // changes every 5 min, aligned with cron
          const snapshotUrl = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/city-data/snapshot.json?v=${v}`;
          const snapshotRes = await fetch(snapshotUrl);
          if (snapshotRes.ok) {
            const buf = await snapshotRes.arrayBuffer();
            const ds = new DecompressionStream("gzip");
            const stream = new Blob([buf]).stream().pipeThrough(ds);
            const snapshot = await new Response(stream).json();
            allDevs = snapshot.developers;
            cityStats = snapshot.stats;
            dropsPayload = snapshot._d ?? [];
          }
        } catch { /* snapshot failed */ }

        setLoadProgress(30);

        if (!allDevs || allDevs.length === 0) {
          setLoadProgress(100);
          setLoadStage("ready");
          return;
        }

        // Apply loadout override from localStorage (saved in shop, TTL 10 min)
        try {
          const raw = localStorage.getItem("gitcity:loadout_override");
          if (raw) {
            const { developerId, loadout, ts } = JSON.parse(raw);
            if (Date.now() - ts < 10 * 60 * 1000) {
              const idx = allDevs.findIndex((d) => d.id === developerId);
              if (idx !== -1) {
                allDevs[idx] = { ...allDevs[idx], loadout };
              }
            } else {
              localStorage.removeItem("gitcity:loadout_override");
            }
          }
        } catch { }

        // Generate layout
        setLoadStage("generating");
        setLoadProgress(45);
        await new Promise((r) => setTimeout(r, 0)); // yield to browser

        rawDevsRef.current = allDevs;
        if (dropsPayload.length > 0) dropsPayloadRef.current = dropsPayload;
        setStats(cityStats);
        const finalLayout = generateCityLayout(allDevs);
        mergeDrops(finalLayout.buildings);

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
          requestAnimationFrame(() => {
            requestAnimationFrame(() => done());
          });
          setTimeout(done, 500);
        });

        setLoadProgress(80);

        // Save to cache for return visits
        setCityCache({ ...finalLayout, stats: cityStats, rawDevs: rawDevsRef.current });
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
    // Show welcome CTA for non-logged-in users who haven't seen it
    if (!session && !localStorage.getItem("gitcity_welcome_seen")) {
      setWelcomeCtaVisible(true);
      setTimeout(() => setWelcomeCtaVisible(false), 12000);
    }
  }, [session]);

  const replayIntro = useCallback(() => {
    setIntroMode(true);
    setIntroPhase(-1);
    setIntroConfetti(false);
  }, []);

  // Focus on building from ?user= query param (skip if gift redirect, handled separately)
  const didFocusUserParam = useRef(false);
  const fetchingUserParam = useRef(false);
  useEffect(() => {
    if (!userParam || giftedParam || buildings.length === 0) return;

    const found = buildings.find(
      (b) => b.login.toLowerCase() === userParam.toLowerCase()
    );

    // Dev not in city yet — fetch to create, then inject into layout
    if (!found) {
      if (fetchingUserParam.current) return;
      fetchingUserParam.current = true;
      (async () => {
        try {
          const res = await fetch(`/api/dev/${encodeURIComponent(userParam)}`);
          if (!res.ok) return;
          const devData = await res.json();

          // Dev doesn't exist in DB yet (auth callback may have failed) — skip injection
          if (devData.exists === false) return;

          // Dedup: another effect may have already injected this dev
          if (rawDevsRef.current.some((d: DeveloperRecord) => d.github_login.toLowerCase() === userParam.toLowerCase())) return;

          const newDev = {
            ...devData,
            owned_items: [],
            achievements: [],
            loadout: null,
            custom_color: null,
            billboard_images: [],
            active_raid_tag: null,
            kudos_count: devData.kudos_count ?? 0,
            visit_count: devData.visit_count ?? 0,
            app_streak: devData.app_streak ?? 0,
            raid_xp: devData.raid_xp ?? 0,
            rabbit_completed: false,
            xp_total: devData.xp_total ?? 0,
            xp_level: devData.xp_level ?? 1,
          };
          rawDevsRef.current = [...rawDevsRef.current, newDev];
          const layout = generateCityLayout(rawDevsRef.current);
          mergeDrops(layout.buildings);
          setBuildings(layout.buildings);
          setPlazas(layout.plazas);
          setDecorations(layout.decorations);
          setRiver(layout.river);
          setBridges(layout.bridges);
          setDistrictZones(layout.districtZones);
          setCityCache({ ...layout, stats: stats ?? { total_developers: 0, total_contributions: 0 }, rawDevs: rawDevsRef.current });

          // Focus immediately after injection instead of waiting for re-run
          const injected = layout.buildings.find(
            (b) => b.login.toLowerCase() === userParam.toLowerCase()
          );
          if (injected && !didFocusUserParam.current) {
            didFocusUserParam.current = true;
            setFocusedBuilding(userParam);
            setSelectedBuilding(injected);
            setExploreMode(true);
          }
        } finally {
          fetchingUserParam.current = false;
        }
      })();
      return;
    }

    if (!didFocusUserParam.current) {
      // First focus: enter explore mode
      didFocusUserParam.current = true;
      setFocusedBuilding(userParam);
      setSelectedBuilding(found);
      setExploreMode(true);

      // Building from cache/snapshot may have stale claimed status — refresh from DB
      if (!found.claimed) {
        fetch(`/api/dev/${encodeURIComponent(userParam)}`)
          .then(r => r.ok ? r.json() : null)
          .then(devData => {
            if (!devData || devData.exists === false) return;
            if (!devData.claimed) return;
            // Update building in-place so canClaim recalculates
            setBuildings(prev => prev.map(b =>
              b.login.toLowerCase() === userParam.toLowerCase()
                ? { ...b, claimed: true }
                : b
            ));
            setSelectedBuilding(prev =>
              prev && prev.login.toLowerCase() === userParam.toLowerCase()
                ? { ...prev, claimed: true }
                : prev
            );
          })
          .catch(() => { });
      }
    } else {
      // Buildings array was replaced (full layout loaded) — keep selectedBuilding in sync
      setSelectedBuilding(prev =>
        prev && prev.login.toLowerCase() === userParam.toLowerCase() ? found : prev
      );
    }
  }, [userParam, giftedParam, buildings, stats]);

  // ── Ensure logged-in user's building always appears + claimed status is fresh ──
  // Covers: page reload, new tab, cache expiry, auth callback failure
  const ensuringAuthBuilding = useRef<string | null>(null);
  const refreshedClaimedStatus = useRef(false);
  useEffect(() => {
    if (!authLogin || buildings.length === 0) return;

    // Building already in city — check if claimed status needs refresh
    const existing = buildings.find(b => b.login.toLowerCase() === authLogin);
    if (existing) {
      // Refresh claimed status once per session (snapshot may be stale after login)
      if (!existing.claimed && !refreshedClaimedStatus.current) {
        refreshedClaimedStatus.current = true;
        fetch(`/api/dev/${encodeURIComponent(authLogin)}`)
          .then(r => r.ok ? r.json() : null)
          .then(devData => {
            if (!devData || devData.exists === false || !devData.claimed) return;
            setBuildings(prev => prev.map(b =>
              b.login.toLowerCase() === authLogin ? { ...b, claimed: true } : b
            ));
          })
          .catch(() => { });
      }
      return;
    }

    // ?user= handler is already handling this
    if (userParam && userParam.toLowerCase() === authLogin) return;

    // Already fetching for this login
    if (ensuringAuthBuilding.current === authLogin) return;
    ensuringAuthBuilding.current = authLogin;

    (async () => {
      try {
        const res = await fetch(`/api/dev/${encodeURIComponent(authLogin)}`);
        if (!res.ok) return;
        const devData = await res.json();
        if (devData.exists === false) return;

        // Dedup: another effect or search may have already injected this dev
        if (rawDevsRef.current.some((d: DeveloperRecord) => d.github_login.toLowerCase() === authLogin)) return;

        const newDev = {
          ...devData,
          owned_items: [],
          achievements: [],
          loadout: null,
          custom_color: null,
          billboard_images: [],
          active_raid_tag: null,
          kudos_count: devData.kudos_count ?? 0,
          visit_count: devData.visit_count ?? 0,
          app_streak: devData.app_streak ?? 0,
          raid_xp: devData.raid_xp ?? 0,
          rabbit_completed: false,
          xp_total: devData.xp_total ?? 0,
          xp_level: devData.xp_level ?? 1,
        };
        rawDevsRef.current = [...rawDevsRef.current, newDev];
        const layout = generateCityLayout(rawDevsRef.current);
        mergeDrops(layout.buildings);
        setBuildings(layout.buildings);
        setPlazas(layout.plazas);
        setDecorations(layout.decorations);
        setRiver(layout.river);
        setBridges(layout.bridges);
        setDistrictZones(layout.districtZones);
        setCityCache({ ...layout, stats: stats ?? { total_developers: 0, total_contributions: 0 }, rawDevs: rawDevsRef.current });
      } catch {
        // Allow retry on next dep change (e.g. transient network error)
        ensuringAuthBuilding.current = null;
      }
    })();
  }, [authLogin, buildings, userParam, stats]);

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
      setFeedback({ type: "error", code: cachedError as NonNullable<typeof feedback>["code"], username: trimmed });
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
        let code: "not-found" | "org" | "no-activity" | "rate-limit" | "github-rate-limit" | "timeout" | "generic" = "generic";
        if (devRes.status === 404) code = "not-found";
        else if (devRes.status === 504) code = "timeout";
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

      // Dev not in the city yet: show invite card instead of creating a building
      if (devData.exists === false && devData.preview) {
        setInvitePreview(devData.preview);
        setUsername("");
        return;
      }

      // Merge the refreshed dev back into the live city so searches update stats immediately
      let updatedBuildings: CityBuilding[] | null = null;
      const refreshedLogin = (devData.github_login ?? trimmed).toLowerCase();
      const existingDev = rawDevsRef.current.find(
        (d) => d.github_login?.toLowerCase() === refreshedLogin
      );
      const eAny = existingDev as any;
      const syncedDev = {
        ...(existingDev ?? {}),
        ...devData,
        owned_items: existingDev?.owned_items ?? [],
        achievements: existingDev?.achievements ?? [],
        loadout: existingDev?.loadout ?? null,
        custom_color: existingDev?.custom_color ?? null,
        billboard_images: existingDev?.billboard_images ?? [],
        active_raid_tag: existingDev?.active_raid_tag ?? null,
        kudos_count: devData.kudos_count ?? existingDev?.kudos_count ?? 0,
        visit_count: devData.visit_count ?? existingDev?.visit_count ?? 0,
        app_streak: devData.app_streak ?? existingDev?.app_streak ?? 0,
        raid_xp: devData.raid_xp ?? existingDev?.raid_xp ?? 0,
        rabbit_completed: devData.rabbit_completed ?? existingDev?.rabbit_completed ?? false,
        xp_total: devData.xp_total ?? existingDev?.xp_total ?? 0,
        xp_level: devData.xp_level ?? existingDev?.xp_level ?? 1,
      };
      rawDevsRef.current = existedBefore
        ? rawDevsRef.current.map((d) =>
          d.github_login?.toLowerCase() === refreshedLogin ? syncedDev : d
        )
        : [...rawDevsRef.current, syncedDev];

      const layout = generateCityLayout(rawDevsRef.current);
      mergeDrops(layout.buildings);
      setBuildings(layout.buildings);
      setPlazas(layout.plazas);
      setDecorations(layout.decorations);
      setRiver(layout.river);
      setBridges(layout.bridges);
      setDistrictZones(layout.districtZones);
      setCityCache({ ...layout, stats: stats ?? { total_developers: 0, total_contributions: 0 }, rawDevs: rawDevsRef.current });
      updatedBuildings = layout.buildings;

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
        (b: CityBuilding) => b.login.toLowerCase() === refreshedLogin
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [username, buildings, authLogin, compareBuilding, comparePair, stats]);

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
      } else if (res.status === 409) {
        // Already claimed (e.g. by auth callback) — just refresh to sync UI
        await reloadCity(true);
      }
    } finally {
      setClaiming(false);
    }
  };

  const handleClaimFreeGift = async () => {
    if (claimingGift) return;
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

  // Daily missions
  const { data: dailiesData, trackClientMission, claim: claimDailies, refresh: refreshDailies, toasts: dailyToasts } = useDailies(session, !!myBuilding?.claimed);
  // Stable ref so closures (visit useEffect, kudos callback) always use latest
  const trackMissionRef = useRef(trackClientMission);
  trackMissionRef.current = trackClientMission;

  // Detect level-up from check-in XP result
  useEffect(() => {
    if (!streakData?.xp || !myBuilding) return;
    const newLevel = streakData.xp.new_level;
    const currentLevel = myBuilding.xp_level ?? 1;
    if (newLevel > currentLevel) {
      setLevelUpLevel(newLevel);
    }
  }, [streakData?.xp, myBuilding]);

  // Live users presence
  const { count: liveUsers } = useLiveUsers();
  const { liveCount: codingCount, liveByLogin } = useCodingPresence();

  // City energy: devs coding -> city lights up. 0 devs = nearly dark, 5+ = full brightness
  const cityEnergy = useMemo(() => {
    if (codingCount === 0) return 0.05;
    if (codingCount === 1) return 0.35;
    if (codingCount === 2) return 0.55;
    if (codingCount <= 5) return 0.55 + (codingCount - 2) * 0.15; // 3->0.7, 5->1.0
    if (codingCount <= 15) return 1.0 + (Math.min(codingCount, 15) - 5) * 0.02; // 10->1.1, 15->1.2
    return Math.min(1.4, 1.2 + (codingCount - 15) * 0.02); // 25+->1.4 cap
  }, [codingCount]);

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
      .catch(() => { });
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
      .catch(() => { });
  }, [stats.total_developers, milestoneCelebrations]);

  // Feature 1: Daily Challenge Nudge — show after load if user has history but hasn't played today
  useEffect(() => {
    if (loadStage !== "done" || !session || flyMode || introMode) return;
    dailyNudgeTimerRef.current = setTimeout(() => {
      try {
        const raw = localStorage.getItem("gitcity_fly_history");
        if (!raw) return; // no history — first-fly hint handles this
        const hist = JSON.parse(raw);
        if (!hist.seeds || Object.keys(hist.seeds).length === 0) return;
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 0);
        const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
        const currentSeed = `${now.getFullYear()}-${dayOfYear}`;
        if (hist.seeds[currentSeed]) return; // already played today
        setShowDailyNudge(true);
        // Auto-dismiss after 15s
        const autoDismiss = setTimeout(() => setShowDailyNudge(false), 15000);
        dailyNudgeTimerRef.current = autoDismiss;
      } catch { }
    }, 2000);
    return () => clearTimeout(dailyNudgeTimerRef.current);
  }, [loadStage, session, flyMode, introMode]);

  // Feature 2: First-Fly Tooltip — show if user has never flown
  useEffect(() => {
    if (loadStage !== "done" || flyMode || introMode) return;
    try {
      if (localStorage.getItem("gitcity_fly_history") || localStorage.getItem("gitcity_fly_hint_seen")) return;
    } catch { return; }
    flyHintTimerRef.current = setTimeout(() => {
      setShowFlyHint(true);
      // Auto-dismiss after 10s
      const autoDismiss = setTimeout(() => {
        setShowFlyHint(false);
        try { localStorage.setItem("gitcity_fly_hint_seen", "1"); } catch { }
      }, 10000);
      flyHintTimerRef.current = autoDismiss;
    }, 5000);
    return () => clearTimeout(flyHintTimerRef.current);
  }, [loadStage, flyMode, introMode]);

  // Feature 3: First-Flight Controls Overlay — user-dismissed only (no auto-dismiss)

  return (
    <main className="relative min-h-screen overflow-hidden bg-bg font-pixel uppercase text-warm">
      {/* 3D Canvas */}
      <CityCanvas
        onCompareCinematicEnd={() => setCompareCinematicPlaying(false)}
        buildings={buildings}
        plazas={plazas}
        decorations={decorations}
        river={river}
        bridges={bridges}
        flyMode={flyMode}
        flyVehicle={flyVehicle}
        onExitFly={exitFlyRef.current = () => {
          const wallMs = Date.now() - flyStartTime.current;
          // Exclude pause time from flight duration
          const currentPauseMs = flyPausedAt.current > 0 ? Date.now() - flyPausedAt.current : 0;
          const flightMs = Math.max(0, wallMs - flyTotalPauseMs.current - currentPauseMs);
          // Time bonus: % of base score scaled by how fast you finished (max +50% of base score)
          // Rewards efficiency without letting quick-quits dominate
          const FLY_TIME_LIMIT = 90;
          const timeFraction = flyScore.collected > 0 ? Math.max(0, (FLY_TIME_LIMIT - flightMs / 1000) / FLY_TIME_LIMIT) : 0;
          const timeBonus = Math.floor(flyScore.score * 0.5 * timeFraction);
          const finalScore = flyScore.score + timeBonus;
          // Read current PB fresh from localStorage (React state may be stale)
          let currentPB = flyPersonalBest;
          try { currentPB = Math.max(currentPB, parseInt(localStorage.getItem("gitcity_fly_pb") || "0", 10) || 0); } catch { }
          // Only show "New PB!" if there WAS a previous best to beat (not on first-ever flight)
          const isNewPB = currentPB > 0 && finalScore > currentPB;
          // Update personal best
          if (isNewPB) {
            setFlyPersonalBest(finalScore);
            try { localStorage.setItem("gitcity_fly_pb", String(finalScore)); } catch { }
          }
          // Update fly history (streak, days played, per-seed scores)
          if (finalScore > 0) {
            try {
              const now = new Date();
              const start = new Date(now.getFullYear(), 0, 0);
              const dayOfYear = Math.floor((now.getTime() - start.getTime()) / 86400000);
              const currentSeed = `${now.getFullYear()}-${dayOfYear}`;
              const raw = localStorage.getItem("gitcity_fly_history");
              const hist = raw ? JSON.parse(raw) : { seeds: {}, currentStreak: 0, longestStreak: 0, lastPlayedSeed: "" };
              const prev = hist.seeds[currentSeed];
              hist.seeds[currentSeed] = {
                bestScore: Math.max(prev?.bestScore ?? 0, finalScore),
                playCount: (prev?.playCount ?? 0) + 1,
              };
              // Recalculate streak
              if (hist.lastPlayedSeed !== currentSeed) {
                const yesterdayDay = dayOfYear - 1;
                const yesterdaySeed = yesterdayDay >= 1 ? `${now.getFullYear()}-${yesterdayDay}` : `${now.getFullYear() - 1}-365`;
                if (hist.lastPlayedSeed === yesterdaySeed) {
                  hist.currentStreak = (hist.currentStreak || 0) + 1;
                } else if (!hist.lastPlayedSeed) {
                  hist.currentStreak = 1;
                } else {
                  hist.currentStreak = 1;
                }
                hist.lastPlayedSeed = currentSeed;
              }
              hist.longestStreak = Math.max(hist.longestStreak || 0, hist.currentStreak);
              localStorage.setItem("gitcity_fly_history", JSON.stringify(hist));
            } catch { }
          }
          // Exit fly immediately (don't block on API)
          setFlyMode(false); setFlyPaused(false); setFlyBoostActive(false); setFlyBrakeActive(false); lastDistrictRef.current = null; setDistrictAnnouncement(null); clearTimeout(announceTimerRef.current);
          // Feature 4: Show post-flight results (rank fills in async)
          if (finalScore > 0) {
            const captured = { score: finalScore, collected: flyScore.collected, maxCombo: flyScore.maxCombo, timeBonus, isNewPB };
            // Show immediately with rank=0, then update when POST returns
            setShowFlyResults({ ...captured, rank: 0, totalPilots: 0 });
            flyResultsTimerRef.current = setTimeout(() => setShowFlyResults(null), 12000);
            // Fire POST in background, update rank when it returns
            if (session) {
              const maxComboVal = Math.min(Math.max(flyScore.maxCombo, 1), 3);
              fetch("/api/fly-scores", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ score: finalScore, collected: flyScore.collected, max_combo: maxComboVal, flight_ms: flightMs }),
              })
                .then((res) => res.ok ? res.json() : null)
                .then((data) => {
                  if (data) {
                    setShowFlyResults((prev) => prev ? { ...prev, rank: data.rank_today ?? 0, totalPilots: data.total ?? 0 } : null);
                  }
                })
                .catch(() => { });
            }
          }
        }}
        themeIndex={themeIndex}
        onHud={(s, a, x, z, yaw) => {
          setHud({ speed: s, altitude: a });
          setPlayerYaw(yaw);
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
        onPause={(p) => {
          if (p) {
            flyPausedAt.current = Date.now();
          } else if (flyPausedAt.current > 0) {
            flyTotalPauseMs.current += Date.now() - flyPausedAt.current;
            flyPausedAt.current = 0;
          }
          setFlyPaused(p);
        }}
        onCollect={(score, earned, combo, collected, maxCombo) => setFlyScore({ score, earned, combo, collected, maxCombo })}
        focusedBuilding={focusedBuilding}
        focusedBuildingB={focusedBuildingB}
        accentColor={theme.accent}
        onClearFocus={() => setFocusedBuilding(null)}
        flyPauseSignal={flyPauseSignal}
        isMobile={isMobile}
        onJoystickState={flyMode ? setFlyJoystickState : undefined}
        flyBoostActive={flyBoostActive}
        flyBrakeActive={flyBrakeActive}
        flyHasOverlay={!!selectedBuilding || pillModalOpen || founderMessageOpen || eArcadeOpen || !!activeSponsor || rabbitCinematic}
        flyStartPaused={showFlyControls}
        holdRise={loadStage !== "done"}
        celebrationActive={celebrationActive}
        onCameraMove={(x, z, tx, tz) => setCameraPos({ x, z, tx, tz })}
        skyAds={skyAds}
        onAdClick={(ad) => {
          trackSkyAdClick(ad.id, ad.vehicle, ad.link);
          // Building ads (billboard, rooftop, led_wrap): direct open
          // Sky ads (plane, blimp): show modal first so user sees what it is
          if (ad.link && isBuildingAd(ad.vehicle)) {
            const ctaHref = buildAdLink(ad) ?? ad.link;
            const isMailto = ad.link.startsWith("mailto:");
            // Track click via beacon, cta_click via fetch to get click_id
            trackAdEvent(ad.id, "click", authLogin || undefined);
            trackSkyAdCtaClick(ad.id, ad.vehicle);
            track("sky_ad_click", { ad_id: ad.id, vehicle: ad.vehicle, brand: ad.brand ?? "" });
            // Async: get click_id then open link
            (async () => {
              const clickId = await trackAdEvent(ad.id, "cta_click", authLogin || undefined);
              const finalUrl = clickId ? appendClickId(ctaHref, clickId) : ctaHref;
              if (isMailto) {
                window.location.href = finalUrl;
              } else {
                window.open(finalUrl, "_blank", "noopener,noreferrer");
              }
            })();
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
        onFocusInfo={() => { }}
        ghostPreviewLogin={ghostPreviewLogin}
        liveByLogin={liveByLogin}
        cityEnergy={cityEnergy}
        raidPhase={raidState.phase}
        raidData={raidState.raidData}
        raidAttacker={raidState.attackerBuilding}
        raidDefender={raidState.defenderBuilding}
        onRaidPhaseComplete={raidActions.onPhaseComplete}
        onLandmarkClick={() => { setPillModalOpen(true); setSelectedBuilding(null); }}
        onEArcadeClick={() => { trackEArcadeClicked(); setEArcadeOpen(true); setSelectedBuilding(null); }}
        onSponsorClick={(slug) => {
          trackLandmarkClicked(slug);
          const adId = getLandmarkAdId(slug);
          if (adId) fetch("/api/sky-ads/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ad_id: adId, event_type: "click" }) }).catch(() => { });
          if (!exploreMode) setExploreMode(true);
          setActiveSponsor(slug);
          setSelectedBuilding(null);
          setFocusedBuilding(null);
        }}
        sponsorFocusPos={(() => {
          if (!activeSponsor) return null;
          const sp = SPONSORS.find(s => s.slug === activeSponsor);
          if (!sp) return null;
          const pos = gridToWorldPos(sp.gridX, sp.gridZ);
          return [pos[0], sp.hitboxHeight * 0.6, pos[2]] as [number, number, number];
        })()}
        activeSponsorSlug={activeSponsor}
        rabbitSighting={rabbitSighting}
        onRabbitCaught={onRabbitCaught}
        rabbitCinematic={rabbitCinematic}
        onRabbitCinematicEnd={endRabbitCinematic}
        rabbitCinematicTarget={rabbitSighting ?? undefined}
        onBuildingClick={(b) => {
          trackBuildingClicked(b.login);
          // A1: Sign-in prompt after 1 building click without session
          if (!session && !signInPromptShownRef.current) {
            buildingClickCountRef.current += 1;
            if (buildingClickCountRef.current >= 1) {
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
          // Track explore_district daily if clicking a building in a different district
          if (myBuilding?.district && b.district && b.district !== myBuilding.district) {
            trackMissionRef.current("explore_district");
          }
          if (flyMode) {
            // Auto-pause flight to show profile card
            setFlyPauseSignal(s => s + 1);
          } else if (!exploreMode) {
            setExploreMode(true);
          }
        }}
        onFlyMove={flySendMove}
        flyPilotsRef={flyPilotsRef}
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
              "Somewhere in the internet...",
              "Developers became buildings",
              "And commits became floors",
            ].map((text, i) => (
              <p
                key={i}
                className="absolute text-center font-pixel normal-case text-cream"
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
                <span style={{ color: theme.accent }}>Git City</span>
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
            Skip &gt;
          </button>
        </div>
      )}

      {/* ─── Fly Mode HUD ─── */}
      {flyMode && (
        <div className="pointer-events-none fixed inset-0 z-30">

          {/* ── Mobile: unified top bar ── */}
          {isMobile ? (
            <div className="pointer-events-auto absolute left-2 right-2 flex items-center gap-1.5 border-[3px] border-border bg-bg/80 px-2 py-1.5 backdrop-blur-sm" style={{ top: "max(8px, env(safe-area-inset-top, 8px))" }}>
              {/* Exit */}
              <button
                onClick={(e) => { e.stopPropagation(); e.preventDefault(); exitFlyRef.current?.(); }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="btn-press shrink-0 text-[10px] tracking-wider uppercase"
                style={{ color: theme.accent }}
              >
                Exit
              </button>
              <span className="text-border">|</span>
              {/* Pause/Resume */}
              <button
                onClick={(e) => {
                  e.stopPropagation(); e.preventDefault();
                  if (flyPaused) {
                    window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
                  } else {
                    setFlyPauseSignal(s => s + 1);
                  }
                }}
                onTouchStart={(e) => e.stopPropagation()}
                onTouchEnd={(e) => e.stopPropagation()}
                className="btn-press shrink-0 text-[10px] tracking-wider uppercase text-cream"
              >
                {flyPaused ? "Resume" : "Pause"}
              </button>
              {/* Spacer */}
              <div className="flex-1" />
              {/* Status dot + FLY + score */}
              <span
                className={`h-1.5 w-1.5 shrink-0 ${flyPaused ? "" : "blink-dot"}`}
                style={{ backgroundColor: flyPaused ? "#f85149" : theme.accent }}
              />
              <span className="text-[9px]" style={{ color: theme.accent }}>{flyScore.score}</span>
              <span className="text-[9px] text-muted">PX</span>
              {flyScore.combo >= 2 && (
                <span className="animate-pulse text-[9px] font-bold" style={{ color: "#ffd700" }}>
                  &times;{flyScore.combo >= 4 ? 3 : flyScore.combo >= 3 ? 2 : 1.5}
                </span>
              )}
              <span className="text-border">|</span>
              <span className="text-[9px] text-muted">{flyScore.collected}<span style={{ color: theme.accent }}>/40</span></span>
              <span className="text-[9px]" style={{ color: flyElapsedSec < 90 ? theme.accent : "#f85149" }}>
                {Math.floor(flyElapsedSec / 60)}:{String(flyElapsedSec % 60).padStart(2, "0")}
              </span>
            </div>
          ) : (
            <>
              {/* ── Desktop: centered top bar ── */}
              <div className="absolute top-4 left-1/2 -translate-x-1/2">
                <div className="inline-flex items-center gap-3 border-[3px] border-border bg-bg/70 px-5 py-2.5 backdrop-blur-sm">
                  <span
                    className={`h-2 w-2 shrink-0 ${flyPaused ? "" : "blink-dot"}`}
                    style={{ backgroundColor: flyPaused ? "#f85149" : theme.accent }}
                  />
                  <span className="text-[10px] text-cream">
                    {flyPaused ? "Paused" : "Fly"}
                  </span>
                  <span className="mx-1 text-border">|</span>
                  <span className="text-[10px]" style={{ color: theme.accent }}>{flyScore.score}</span>
                  <span className="text-[10px] text-muted">PX</span>
                  {flyScore.combo >= 2 && (
                    <span className="animate-pulse text-[10px] font-bold" style={{ color: "#ffd700" }}>
                      &times;{flyScore.combo >= 4 ? 3 : flyScore.combo >= 3 ? 2 : 1.5}
                    </span>
                  )}
                </div>
              </div>

              {/* ── Desktop: score HUD (top right) ── */}
              <div className="absolute top-4 right-4 text-right text-[10px] text-muted">
                <div>{flyScore.collected}/40 collected</div>
                <div className="mt-1 flex h-1 w-24 items-center border border-border/40 bg-bg/50 ml-auto">
                  <div className="h-full transition-all duration-150" style={{ width: `${(flyScore.collected / 40) * 100}%`, backgroundColor: theme.accent }} />
                </div>
                <div className="mt-1.5 text-[8px]">
                  <span className="text-muted">TIME </span>
                  <span style={{ color: flyElapsedSec < 90 ? theme.accent : "#f85149" }}>
                    {Math.floor(flyElapsedSec / 60)}:{String(flyElapsedSec % 60).padStart(2, "0")}
                  </span>
                </div>
                {flyPersonalBest > 0 && (
                  <div className="mt-0.5 text-[8px] text-muted">BEST: <span style={{ color: theme.accent }}>{flyPersonalBest}</span></div>
                )}
              </div>
            </>
          )}

          {/* Flight data (above lo-fi radio) — hidden on mobile */}
          {!isMobile && (
            <div className="absolute bottom-14 left-3 text-[9px] leading-loose text-muted sm:left-4 sm:text-[10px]">
              <div className="flex items-center gap-2">
                <span>SPD</span>
                <span style={{ color: theme.accent }} className="w-6 text-right">
                  {Math.round(hud.speed)}
                </span>
                <div className="flex h-1.5 w-20 items-center border border-border/60 bg-bg/50">
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
          )}

          {/* District announcement */}
          {districtAnnouncement && (
            <div key={districtAnnouncement.name} className="absolute bottom-6 left-1/2 -translate-x-1/2 animate-district-in">
              <div className="border-l-4 bg-bg/80 px-4 py-2 backdrop-blur-sm" style={{ borderColor: districtAnnouncement.color }}>
                <div className="text-[8px] uppercase tracking-widest text-muted">District</div>
                <div className="font-pixel text-sm text-cream">{districtAnnouncement.name}</div>
                <div className="text-[8px] text-muted">{districtAnnouncement.population.toLocaleString()} devs</div>
              </div>
            </div>
          )}

          {/* Controls hint */}
          {!isMobile && (
            <div className="absolute bottom-28 left-3 text-[8px] leading-loose text-muted sm:left-4 sm:text-[9px]">
              {flyPaused ? (
                <>
                  <div>
                    <span className="text-cream">Drag</span> orbit
                  </div>
                  <div>
                    <span className="text-cream">Scroll</span> zoom
                  </div>
                  <div>
                    <span className="text-cream">WASD</span> resume
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
                    <span style={{ color: theme.accent }}>R</span> return to city
                  </div>
                  <div>
                    <span style={{ color: theme.accent }}>P</span> pause
                  </div>
                  <div>
                    <span style={{ color: theme.accent }}>ESC</span> pause
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Mobile Fly HUD (bottom controls only — top bar is unified above) ─── */}
      {isMobile && flyMode && !showFlyControls && (
        <>
          {/* Boost + Slow — bottom left, retro style */}
          {!flyPaused && (
            <div className="fixed z-50 flex gap-1.5 select-none" style={{ bottom: "max(24px, env(safe-area-inset-bottom, 24px))", left: "16px", WebkitTouchCallout: "none" }}>
              <button
                onTouchStart={(e) => { e.stopPropagation(); setFlyBrakeActive(true); }}
                onTouchEnd={(e) => { e.stopPropagation(); setFlyBrakeActive(false); }}
                onTouchCancel={() => setFlyBrakeActive(false)}
                className="btn-press border-[3px] bg-bg/80 px-3 py-2 text-[10px] tracking-widest uppercase backdrop-blur-sm transition-all"
                style={{
                  borderColor: flyBrakeActive ? theme.accent : "var(--color-border)",
                  color: flyBrakeActive ? theme.accent : "var(--color-muted)",
                }}
              >
                Slow
              </button>
              <button
                onTouchStart={(e) => { e.stopPropagation(); setFlyBoostActive(true); }}
                onTouchEnd={(e) => { e.stopPropagation(); setFlyBoostActive(false); }}
                onTouchCancel={() => setFlyBoostActive(false)}
                className="btn-press border-[3px] bg-bg/80 px-3 py-2 text-[10px] tracking-widest uppercase backdrop-blur-sm transition-all"
                style={{
                  borderColor: flyBoostActive ? "#ffb428" : "var(--color-border)",
                  color: flyBoostActive ? "#ffb428" : "var(--color-cream)",
                  boxShadow: flyBoostActive ? "0 0 12px rgba(255,180,40,0.25)" : "none",
                }}
              >
                Boost
              </button>
            </div>
          )}

          {/* Joystick visual overlay */}
          {flyJoystickState && (
            <div style={{ position: "fixed", inset: 0, pointerEvents: "none", zIndex: 30 }}>
              {/* Base ring */}
              <div style={{
                position: "absolute",
                left: flyJoystickState.baseX - 60,
                top: flyJoystickState.baseY - 60,
                width: 120, height: 120,
                borderRadius: "50%",
                border: "1.5px solid rgba(255,255,255,0.2)",
                background: "rgba(255,255,255,0.04)",
              }} />
              {/* Thumb */}
              <div style={{
                position: "absolute",
                left: flyJoystickState.baseX + flyJoystickState.dx - 18,
                top: flyJoystickState.baseY + flyJoystickState.dy - 18,
                width: 36, height: 36,
                borderRadius: "50%",
                background: "rgba(255,255,255,0.25)",
                border: "1px solid rgba(255,255,255,0.35)",
                willChange: "transform",
              }} />
            </div>
          )}
        </>
      )}

      {/* ─── Feature 3: First-Flight Controls Overlay ─── */}
      {showFlyControls && flyMode && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/50 backdrop-blur-[2px]">
          <div
            className="border-[3px] border-border bg-bg-raised px-8 py-6 text-center animate-[fade-in_0.3s_ease-out]"
            style={{ borderColor: theme.accent + "60" }}
          >
            <p className="mb-4 text-xs tracking-widest text-muted">FLIGHT CONTROLS</p>
            <div className="flex flex-col gap-2.5 text-[11px]">
              {isMobile ? (
                <>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-cream">Touch &amp; Drag</span>
                    <span className="text-muted">Steer</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-cream">Buttons</span>
                    <span className="text-muted">Pause / Exit</span>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-cream">Mouse</span>
                    <span className="text-muted">Steer</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-cream">Scroll</span>
                    <span className="text-muted">Speed</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span className="text-cream">Shift / Alt</span>
                    <span className="text-muted">Boost / Slow</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span style={{ color: theme.accent }}>R</span>
                    <span className="text-muted">Return to City</span>
                  </div>
                  <div className="flex items-center justify-between gap-6">
                    <span style={{ color: theme.accent }}>ESC</span>
                    <span className="text-muted">Pause &amp; Exit</span>
                  </div>
                </>
              )}
            </div>
            <button
              onClick={() => {
                setShowFlyControls(false);
                try { localStorage.setItem("gitcity_fly_controls_seen", "1"); } catch { }
                // Resume the paused flight by dispatching Space keydown
                window.dispatchEvent(new KeyboardEvent("keydown", { code: "Space", bubbles: true }));
              }}
              className="btn-press mt-5 px-6 py-2 text-[10px] text-bg"
              style={{ backgroundColor: theme.accent, boxShadow: `3px 3px 0 0 ${theme.shadow}` }}
            >
              Got it, let&apos;s fly!
            </button>
          </div>
        </div>
      )}

      {/* ─── Radar Map ─── */}
      <RadarMap
        buildings={buildings}
        playerX={playerPos.x}
        playerZ={playerPos.z}
        playerYaw={playerYaw}
        cameraX={cameraPos.x}
        cameraZ={cameraPos.z}
        cameraTargetX={cameraPos.tx}
        cameraTargetZ={cameraPos.tz}
        visible={loadStage === "done" && !introMode && !rabbitCinematic && (exploreMode || flyMode)}
        flyMode={flyMode}
        currentDistrict={lastDistrictRef.current}
        districtZones={districtZones}
        remotePilotsRef={flyPilotsRef}
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

          {/* Theme switcher + Radio (bottom-left) — above ticker */}
          <div className="pointer-events-auto fixed bottom-10 left-3 z-31 flex flex-col-reverse items-start gap-2 sm:left-4 sm:flex-row sm:items-center">
            <button
              onClick={cycleTheme}
              className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
            >
              <span style={{ color: theme.accent }}>&#9654;</span>
              <span className="text-cream">{theme.name}</span>
              <span className="text-dim">{themeIndex + 1}/{THEMES.length}</span>
            </button>
            <div id="gc-radio-slot" />
          </div>

          {/* Feed toggle (top-right, below GitHub badges on desktop) */}
          {feedEvents.length >= 1 && (
            <div className="pointer-events-auto absolute top-3 right-3 sm:top-4 sm:right-4">
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
            <div className="absolute bottom-20 left-3 text-[8px] leading-loose text-muted sm:left-4 sm:text-[9px]">
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

      {/* ─── GitHub + Discord (top-left) ─── */}
      {!flyMode && !introMode && !rabbitCinematic && (
        <div className={`pointer-events-auto fixed top-3 left-3 z-30 items-center gap-1.5 sm:gap-2 sm:top-4 sm:left-4 ${exploreMode ? "hidden" : "flex"}`}>
          {/* Mobile: Live + Jobs */}
          <div className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm sm:hidden">
            <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef4444]" />
            <span className="text-cream">{liveUsers.toLocaleString()}</span>
            <span className="text-muted">live</span>
          </div>
          {jobCount != null && jobCount > 0 && (
            <Link
              href="/jobs"
              className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light sm:hidden"
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#fbbf24]" />
              <span className="text-cream">{jobCount}</span>
              <span className="text-muted">{jobCount === 1 ? "job" : "jobs"}</span>
            </Link>
          )}
          {/* Desktop: GitHub + Discord */}
          {starCount != null && (
            <a
              href="https://github.com/srizzon/git-city"
              target="_blank"
              rel="noopener noreferrer"
              className="hidden sm:flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-cream"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
              <span style={{ color: theme.accent }}>&#9733;</span>
              <span className="text-cream">{starCount.toLocaleString()}</span>
            </a>
          )}
          <a
            href="https://discord.gg/2bTjFAkny7"
            target="_blank"
            rel="noopener noreferrer"
            className="hidden sm:flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#5865F2]"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" /></svg>
            <span className="hidden sm:inline text-cream">Discord</span>
            {discordMembers != null && <span className="text-cream">{discordMembers.toLocaleString()}</span>}
          </a>
        </div>
      )}

      {/* ─── Live + Coding + Jobs (top-right) ─── */}
      {!flyMode && !introMode && !rabbitCinematic && (
        <div className={`pointer-events-auto fixed top-3 right-3 z-30 items-center gap-1.5 sm:gap-2 sm:top-4 sm:right-4 ${exploreMode ? "hidden" : "hidden sm:flex"}`}>
          {/* Live users */}
          <div className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm">
            <span className="live-dot h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef4444]" />
            <span className="text-cream">{liveUsers.toLocaleString()}</span>
            <span className="text-muted">live</span>
          </div>
          {/* Coding now — desktop dropdown */}
          {(() => {
            const energyLabel = codingCount === 0 ? "City sleeping" : codingCount <= 2 ? "City waking up" : codingCount <= 9 ? "City alive" : "City buzzing";
            const energyDotColor = codingCount === 0 ? "bg-muted/50" : codingCount <= 2 ? "bg-[#fbbf24]" : "bg-[#4ade80]";
            const energyDotAnim = codingCount === 0 ? "" : "live-dot";
            return (
              <div className="relative hidden sm:block">
                <button
                  onClick={() => { setCodingPanelOpen((v) => !v); setJobPanelOpen(false); }}
                  className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                >
                  <span className={`${energyDotAnim} h-1.5 w-1.5 flex-shrink-0 rounded-full ${energyDotColor}`} />
                  {codingCount > 0 ? (
                    <>
                      <span className="text-cream">{codingCount}</span>
                      <span className="text-muted">coding</span>
                    </>
                  ) : (
                    <span className="text-muted">{energyLabel}</span>
                  )}
                </button>
                {codingPanelOpen && (() => {
                  // Creator always first, then up to 4 others
                  const allDevs = Array.from(liveByLogin.values());
                  const creator = allDevs.find((d) => d.githubLogin.toLowerCase() === "srizzon");
                  const others = allDevs.filter((d) => d.githubLogin.toLowerCase() !== "srizzon");
                  const displayDevs = [
                    ...(creator ? [creator] : []),
                    ...others.slice(0, creator ? 4 : 5),
                  ];
                  const remaining = allDevs.length - displayDevs.length;

                  return (
                    <div className="absolute right-0 top-full mt-1 w-80 border-[3px] border-border bg-bg/95 backdrop-blur-sm">
                      <div className="border-b border-border px-5 py-3 text-xs text-muted">
                        Coding right now
                      </div>
                      <div>
                        {displayDevs.map((dev) => {
                          const isCreator = dev.githubLogin.toLowerCase() === "srizzon";
                          return (
                            <button
                              key={dev.githubLogin}
                              onClick={() => {
                                const b = buildings.find(
                                  (b) => b.login.toLowerCase() === dev.githubLogin.toLowerCase(),
                                );
                                if (b) {
                                  setSelectedBuilding(null);
                                  setFocusedBuilding(b.login);
                                  setCodingPanelOpen(false);
                                }
                              }}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                            >
                              <div className="relative flex-shrink-0">
                                {dev.avatarUrl && (
                                  <img
                                    src={dev.avatarUrl}
                                    alt=""
                                    className="h-6 w-6 rounded-full"
                                    style={isCreator ? { boxShadow: "0 0 6px #fbbf24" } : undefined}
                                  />
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5">
                                  <span className={`truncate text-[11px] ${isCreator ? "text-[#fbbf24]" : "text-cream"}`}>
                                    {dev.githubLogin}
                                  </span>
                                  {isCreator && (
                                    <span className="shrink-0 text-[8px] text-[#fbbf24]/70">CREATOR</span>
                                  )}
                                </div>
                                <div className="truncate text-[10px] normal-case text-muted">
                                  {isCreator ? "building the city" : dev.language || ""}
                                </div>
                              </div>
                              <span className={`live-dot h-2 w-2 flex-shrink-0 rounded-full ${isCreator ? "bg-[#fbbf24]" : "bg-[#4ade80]"}`} />
                            </button>
                          );
                        })}
                      </div>
                      <div className="border-t border-border">
                        <Link
                          href="/live"
                          onClick={() => setCodingPanelOpen(false)}
                          className="block px-4 py-2.5 text-center text-[11px] text-muted transition-colors hover:text-cream"
                        >
                          {remaining > 0 ? `+${remaining} more` : "View live page"} &rarr;
                        </Link>
                      </div>

                      {/* CTA: Go Live flow */}
                      <div className="border-t border-border">
                        {!session ? (
                          <div className="px-5 py-5 text-center">
                            <p className="mb-3 text-xs normal-case text-muted">
                              Keep your city alive while you code
                            </p>
                            <Link
                              href="/auth"
                              onClick={() => setCodingPanelOpen(false)}
                              className="btn-press inline-block w-full py-2.5 text-center text-xs text-bg"
                              style={{ backgroundColor: "#4ade80", boxShadow: "2px 2px 0 0 #16a34a" }}
                            >
                              Sign in with GitHub
                            </Link>
                          </div>
                        ) : liveByLogin.has(authLogin) ? (
                          <div className="px-5 py-3.5 text-center text-xs normal-case text-[#4ade80]">
                            Your building is powering the city
                          </div>
                        ) : vsCodeKey ? (
                          <div className="px-5 py-5">
                            <p className="mb-3 text-sm font-bold text-cream">Your API Key</p>
                            <div className="mb-3 flex items-center gap-2">
                              <code className="flex-1 truncate bg-white/5 px-3 py-2 text-[11px] normal-case text-cream">
                                {vsCodeKey}
                              </code>
                              <button
                                onClick={() => {
                                  navigator.clipboard.writeText(vsCodeKey);
                                  setVsCodeKeyCopied(true);
                                  setTimeout(() => setVsCodeKeyCopied(false), 2000);
                                }}
                                className="btn-press shrink-0 border border-border px-3 py-2 text-[11px] text-cream transition-colors hover:border-border-light"
                              >
                                {vsCodeKeyCopied ? "Copied!" : "Copy"}
                              </button>
                            </div>
                            <div className="space-y-2.5 text-xs normal-case text-muted">
                              <p><span className="text-cream">1.</span> Install <a href="https://marketplace.visualstudio.com/items?itemName=git-city.gitcity" target="_blank" rel="noopener noreferrer" className="text-[#4ade80] hover:underline">Git City: Pulse</a> in VS Code</p>
                              <p><span className="text-cream">2.</span> Cmd+Shift+P &rarr; &ldquo;Pulse: Connect&rdquo;</p>
                              <p><span className="text-cream">3.</span> Paste your key and start coding</p>
                            </div>
                            <p className="mt-3 text-[10px] normal-case text-muted/50">
                              Your building lights up in ~30s
                            </p>
                            <p className="mt-1.5 text-[10px] normal-case text-muted/50">
                              Only your username and language are shared publicly. Control what&apos;s sent in VS Code Settings &gt; Git City &gt; Privacy.
                            </p>
                          </div>
                        ) : (
                          <div className="px-5 py-5">
                            <p className="mb-3 text-sm normal-case text-cream font-bold">
                              Keep your city alive
                            </p>
                            <p className="mb-3 text-[11px] normal-case text-muted">
                              When you code, your building glows and the city stays lit. Every active dev powers the signal.
                            </p>
                            <div className="mb-4 space-y-2.5 text-xs normal-case text-muted">
                              <p><span className="text-cream">1.</span> Generate your key below</p>
                              <p><span className="text-cream">2.</span> Install <a href="https://marketplace.visualstudio.com/items?itemName=git-city.gitcity" target="_blank" rel="noopener noreferrer" className="text-[#4ade80] hover:underline">Git City: Pulse</a> in VS Code</p>
                              <p><span className="text-cream">3.</span> Paste key in VS Code, start coding</p>
                            </div>
                            <button
                              onClick={async () => {
                                setVsCodeKeyLoading(true);
                                try {
                                  const res = await fetch("/api/vscode-key", { method: "POST" });
                                  const data = await res.json();
                                  if (data.key) {
                                    setVsCodeKey(data.key);
                                    navigator.clipboard.writeText(data.key);
                                    setVsCodeKeyCopied(true);
                                    setTimeout(() => setVsCodeKeyCopied(false), 2000);
                                  }
                                } finally {
                                  setVsCodeKeyLoading(false);
                                }
                              }}
                              disabled={vsCodeKeyLoading}
                              className="btn-press w-full py-2.5 text-center text-xs text-bg"
                              style={{ backgroundColor: "#4ade80", boxShadow: "2px 2px 0 0 #16a34a" }}
                            >
                              {vsCodeKeyLoading ? "Generating..." : vsCodeKeyCopied ? "Key copied to clipboard!" : "Generate API Key"}
                            </button>
                            <p className="mt-3 text-[10px] normal-case text-muted/50">
                              Only your username and language are shared publicly. You can control this in VS Code Settings &gt; Git City &gt; Privacy.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })()}
          {/* Jobs — dropdown preview */}
          {jobCount != null && jobCount > 0 && (
            <div className="relative">
              <button
                onClick={() => { setJobPanelOpen((v) => !v); setCodingPanelOpen(false); }}
                className="flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
              >
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#fbbf24]" />
                <span className="text-cream">{jobCount}</span>
                <span className="text-muted">{jobCount === 1 ? "job" : "jobs"}</span>
              </button>
              {jobPanelOpen && (
                <div className="absolute right-0 top-full mt-1 w-80 border-[3px] border-border bg-bg/95 backdrop-blur-sm">
                  <div className="border-b border-border px-5 py-3">
                    <p className="text-xs text-cream">Jobs in the city</p>
                    <p className="mt-0.5 text-[10px] normal-case text-muted">
                      Real jobs from verified companies, exclusive to Git City developers.
                    </p>
                  </div>
                  <div>
                    {jobPreview.map((job) => (
                      <Link
                        key={job.id}
                        href={`/jobs/${job.id}`}
                        onClick={() => setJobPanelOpen(false)}
                        className="flex w-full items-start justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-white/5"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            {job.tier === "premium" && (
                              <span className="shrink-0 text-[8px] text-[#fbbf24]">★</span>
                            )}
                            {job.tier === "featured" && (
                              <span className="shrink-0 text-[8px] text-[#c8e64a]">★</span>
                            )}
                            <span className="truncate text-[11px] text-cream">{job.title}</span>
                          </div>
                          <p className="truncate text-[10px] normal-case text-muted">
                            {job.company?.name ?? "Company"} · {job.seniority} · {job.role_type}
                          </p>
                        </div>
                        <span className="shrink-0 text-[10px] text-[#c8e64a]">
                          {job.salary_currency} {job.salary_min.toLocaleString()}–{job.salary_max.toLocaleString()}
                        </span>
                      </Link>
                    ))}
                  </div>
                  <div className="border-t border-border">
                    <Link
                      href="/jobs"
                      onClick={() => setJobPanelOpen(false)}
                      className="block px-4 py-2.5 text-center text-[11px] text-muted transition-colors hover:text-cream"
                    >
                      {jobCount > 3 ? `View all ${jobCount} jobs` : "Browse all jobs"} &rarr;
                    </Link>
                  </div>
                  {session ? (
                    <div className="flex border-t border-border">
                      <Link
                        href={authLogin ? `/hire/${authLogin}` : "/hire/edit"}
                        onClick={() => setJobPanelOpen(false)}
                        className="flex-1 px-4 py-2.5 text-center text-[11px] text-[#c8e64a] transition-colors hover:bg-white/5"
                      >
                        My profile
                      </Link>
                    </div>
                  ) : (
                    <div className="border-t border-border px-5 py-3.5 text-center">
                      <Link
                        href="/auth"
                        onClick={() => setJobPanelOpen(false)}
                        className="btn-press inline-block w-full py-2 text-center text-xs text-bg"
                        style={{ backgroundColor: "#fbbf24", boxShadow: "2px 2px 0 0 #b45309" }}
                      >
                        Sign in to apply
                      </Link>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ─── Coding Info Modal (mobile) ─── */}
      {codingInfoOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex items-end sm:hidden" onClick={() => setCodingInfoOpen(false)}>
          <div
            className="w-full border-t-2 border-border bg-bg px-5 py-6 animate-[slide-up_0.2s_ease-out]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="live-dot h-2 w-2 rounded-full bg-[#4ade80]" />
                <span className="text-sm text-cream">{codingCount} coding right now</span>
              </div>
              <button onClick={() => setCodingInfoOpen(false)} className="text-muted">
                <X size={16} />
              </button>
            </div>
            <p className="mb-5 text-xs text-muted normal-case leading-relaxed">
              Every developer coding right now is keeping the city alive. Their buildings light up in real time as they work.
            </p>
            <Link
              href="/live"
              onClick={() => setCodingInfoOpen(false)}
              className="btn-press block w-full py-3 text-center text-xs text-bg"
              style={{ backgroundColor: theme.accent, boxShadow: `2px 2px 0 0 ${theme.shadow}` }}
            >
              See who&apos;s coding live
            </Link>
          </div>
        </div>
      )}

      {/* ─── Mobile Hamburger Button ─── */}
      {!flyMode && !introMode && !rabbitCinematic && !exploreMode && (
        <button
          onClick={() => setMobileMenuOpen(true)}
          className="pointer-events-auto fixed top-3 right-3 z-40 flex h-8 w-8 items-center justify-center border-2 border-border bg-bg/80 backdrop-blur-sm sm:hidden"
        >
          <Menu size={16} className="text-cream" />
        </button>
      )}

      {/* ─── Mobile Fullscreen Menu ─── */}
      {mobileMenuOpen && (
        <div className="pointer-events-auto fixed inset-0 z-50 flex flex-col bg-bg sm:hidden animate-[slide-in-right_0.25s_ease-out]" style={{ background: "var(--color-bg)" }}>

          {/* ── Profile / Auth header ── */}
          {session ? (
            <div className="px-5 pt-6 pb-5 border-b border-border" style={{ background: theme.accent + "0d" }}>
              <div className="flex items-start justify-between">
                <Link href={`/dev/${authLogin}`} onClick={() => setMobileMenuOpen(false)} className="flex items-center gap-3">
                  {myBuilding?.avatar_url && (
                    <Image src={myBuilding.avatar_url} alt="" width={48} height={48} unoptimized={true} className="h-12 w-12 rounded-full border-2" style={{ borderColor: theme.accent }} />
                  )}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-cream font-bold">@{authLogin}</span>
                      {streakData && streakData.streak > 0 && (
                        <span className="flex items-center gap-0.5 text-xs" style={{ color: getStreakTierColor(streakData.streak) }}>
                          🔥<span className="font-bold">{streakData.streak}</span>
                        </span>
                      )}
                    </div>
                    {myBuilding && (
                      <div className="mt-0.5 text-[10px] text-muted normal-case">
                        {myBuilding.district} district
                        {myBuilding.claimed && <span className="ml-1.5 text-[#4ade80]">claimed</span>}
                      </div>
                    )}
                    {liveByLogin.has(authLogin) && (
                      <div className="mt-1 flex items-center gap-1 text-[10px]" style={{ color: theme.accent }}>
                        <span className="live-dot h-1.5 w-1.5 rounded-full bg-[#4ade80]" />
                        coding now
                      </div>
                    )}
                  </div>
                </Link>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center border-2 border-border text-muted"
                >
                  <X size={14} />
                </button>
              </div>
              {canClaim && (
                <button
                  onClick={() => { handleClaim(); setMobileMenuOpen(false); }}
                  disabled={claiming}
                  className="btn-press mt-4 w-full py-2.5 text-xs text-bg disabled:opacity-40"
                  style={{ backgroundColor: theme.accent, boxShadow: `2px 2px 0 0 ${theme.shadow}` }}
                >
                  {claiming ? "..." : "Claim your building"}
                </button>
              )}
            </div>
          ) : (
            <div className="px-5 pt-6 pb-5 border-b border-border">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs text-muted">GIT CITY</span>
                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex h-8 w-8 items-center justify-center border-2 border-border text-muted"
                >
                  <X size={14} />
                </button>
              </div>
              <p className="mb-3 text-xs text-muted normal-case leading-relaxed">Your GitHub commits build a real 3D city. Sign in to claim your building.</p>
              <button
                onClick={() => { handleSignIn(); setMobileMenuOpen(false); }}
                className="btn-press w-full py-3 text-xs text-bg"
                style={{ backgroundColor: theme.accent, boxShadow: `2px 2px 0 0 ${theme.shadow}` }}
              >
                Sign in with GitHub
              </button>
            </div>
          )}

          {/* ── Nav ── */}
          <div className="flex-1 overflow-y-auto">
            {/* ── City ── */}
            <div className="px-5 pt-4 pb-1">
              <p className="text-[9px] text-muted/50 uppercase tracking-[0.2em]">City</p>
            </div>
            <div className="divide-y divide-border/40">
              <Link
                href="/live"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[#ef4444] ${liveUsers > 0 ? "live-dot" : ""}`} />
                  Live
                  <span className="text-[10px] text-muted">{liveUsers.toLocaleString()} online</span>
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
              <Link
                href="/live"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[#4ade80] ${codingCount > 0 ? "live-dot" : ""}`} />
                  Coding
                  {codingCount > 0 && <span className="text-[10px] text-muted">{codingCount} active</span>}
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
              <button
                onClick={() => {
                  setMobileMenuOpen(false);
                  if (session) {
                    window.location.href = "/arcade";
                  } else {
                    trackEArcadeClicked();
                    setEArcadeOpen(true);
                  }
                }}
                className="flex w-full items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <span className={`h-1.5 w-1.5 shrink-0 rounded-full bg-[#a78bfa] ${arcadeOnline > 0 ? "animate-pulse" : ""}`} />
                  Lobby
                  <span className="text-[10px] text-muted">{arcadeOnline} playing</span>
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </button>
            </div>

            {/* ── Explore ── */}
            <div className="px-5 pt-5 pb-1">
              <p className="text-[9px] text-muted/50 uppercase tracking-[0.2em]">Explore</p>
            </div>
            <div className="divide-y divide-border/40">
              <Link
                href={shopHref}
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="text-sm text-cream">Shop</span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
              <Link
                href="/leaderboard"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="text-sm text-cream">Leaderboard</span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
            </div>

            {/* ── Opportunities ── */}
            <div className="px-5 pt-5 pb-1">
              <p className="text-[9px] text-muted/50 uppercase tracking-[0.2em]">Opportunities</p>
            </div>
            <div className="divide-y divide-border/40">
              <Link
                href="/jobs"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#fbbf24]" />
                  Jobs
                  {jobCount != null && jobCount > 0 && <span className="text-[10px] text-muted">{jobCount} open</span>}
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
              <Link
                href="/for-companies"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="text-sm text-cream">Hire developers</span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
              <Link
                href="/advertise"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="text-sm text-cream">Place your Ad</span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </Link>
            </div>

            {/* ── Community ── */}
            <div className="px-5 pt-5 pb-1">
              <p className="text-[9px] text-muted/50 uppercase tracking-[0.2em]">Community</p>
            </div>
            <div className="divide-y divide-border/40">
              <a
                href="https://discord.gg/2bTjFAkny7"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-[#5865F2] shrink-0"><path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.095 2.157 2.42 0 1.333-.947 2.418-2.157 2.418z" /></svg>
                  Discord
                  {discordMembers != null && <span className="text-[10px] text-muted">{discordMembers.toLocaleString()} members</span>}
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </a>
              <a
                href="https://github.com/srizzon/git-city"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center justify-between px-5 py-3.5 active:bg-white/5"
              >
                <span className="flex items-center gap-2 text-sm text-cream">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-cream shrink-0"><path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" /></svg>
                  GitHub
                  {starCount != null && <span className="text-[10px] text-muted">&#9733; {starCount.toLocaleString()}</span>}
                </span>
                <span className="text-xs" style={{ color: theme.accent }}>&#8594;</span>
              </a>
            </div>

            {/* ── Theme ── */}
            <div className="border-t border-border px-5 py-4">
              <p className="mb-3 text-[10px] text-muted uppercase tracking-widest">Theme</p>
              <div className="grid grid-cols-4 gap-2">
                {THEMES.map((t, i) => (
                  <button
                    key={t.name}
                    onClick={() => { setThemeIndex(i); try { localStorage.setItem("gitcity_theme", String(i)); } catch { } }}
                    className="py-2.5 text-[10px] border-2 transition-colors"
                    style={{
                      borderColor: themeIndex === i ? t.accent : "var(--color-border)",
                      color: themeIndex === i ? t.accent : "var(--color-muted)",
                      backgroundColor: themeIndex === i ? t.accent + "18" : "transparent",
                    }}
                  >
                    {t.name}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Settings ── */}
            {session && (
              <div className="border-t border-border px-5 py-4">
                <a href="/settings" className="text-[11px] text-muted transition-colors hover:text-cream normal-case">
                  Notification settings
                </a>
              </div>
            )}

            {/* ── Footer ── */}
            <div className="border-t border-border px-5 py-4">
              <p className="text-[10px] text-muted/40 normal-case">
                A city of {buildings.length.toLocaleString()} developers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─── Main UI Overlay ─── */}
      {!flyMode && !exploreMode && !introMode && !rabbitCinematic && (
        <div
          className="pointer-events-none fixed inset-0 z-20 flex flex-col items-center justify-between pt-16 pb-4 px-3 sm:py-8 sm:px-4"
          style={{
            background:
              "linear-gradient(to bottom, rgba(13,13,15,0.88) 0%, rgba(13,13,15,0.55) 30%, transparent 60%, transparent 85%, rgba(13,13,15,0.5) 100%)",
          }}
        >
          {/* Top */}
          <div className="pointer-events-auto flex w-full max-w-2xl flex-col items-center gap-2 sm:gap-5">
            <div className="text-center">
              <h1 className="text-2xl text-cream sm:text-3xl md:text-5xl">
                Git{" "}
                <span style={{ color: theme.accent }}>City</span>
              </h1>
              <p className="mt-2 text-[10px] leading-relaxed text-cream/80 normal-case">
                {stats.total_developers > 0
                  ? `A city of ${stats.total_developers.toLocaleString()} GitHub developers. Find yourself.`
                  : "A global city of GitHub developers. Find yourself."}
              </p>
              <p className="pointer-events-auto mt-1 text-[9px] text-cream/50 normal-case hidden sm:block">
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

            {/* Milestone progress banner — hidden on mobile to reduce clutter */}
            <div className="hidden sm:flex sm:justify-center w-full">
              {MILESTONE_MODE === "stars" ? (
                // ── GitHub Stars mode ──
                (() => {
                  if (starCount == null) return null;
                  const STAR_MILESTONES = [100, 250, 500, 1000, 2500, 5000];
                  const target = STAR_MILESTONES.find((m) => starCount < m);
                  if (!target) return null;
                  const prev = STAR_MILESTONES[STAR_MILESTONES.indexOf(target) - 1] ?? 0;
                  const progress = ((starCount - prev) / (target - prev)) * 100;
                  const remaining = target - starCount;
                  const label = target >= 1000 ? `${target / 1000}K` : target.toLocaleString();
                  return (
                    <a
                      href="https://github.com/srizzon/git-city"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="block w-full max-w-sm group"
                    >
                      <div className="border-2 border-border bg-bg/80 px-4 py-3 backdrop-blur-sm transition-colors group-hover:border-[var(--hover-border)]" style={{ "--hover-border": theme.accent } as React.CSSProperties}>
                        <div className="mb-2 flex items-baseline justify-between">
                          <span className="text-[9px] tracking-wider" style={{ color: theme.accent }}>
                            ROAD TO {label} STARS
                          </span>
                          <span className="text-[9px] text-cream/60">
                            {remaining.toLocaleString()} to go
                          </span>
                        </div>
                        <div className="relative h-2.5 w-full overflow-hidden border-2 border-border bg-bg">
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
                            {starCount.toLocaleString()} <span className="text-cream/40">/ {target.toLocaleString()}</span>
                          </span>
                          <span className="text-[8px] text-cream/40 normal-case group-hover:text-cream/60 transition-colors">
                            Star us on GitHub
                          </span>
                        </div>
                      </div>
                    </a>
                  );
                })()
              ) : (
                // ── Total Developers mode ──
                (() => {
                  const MILESTONES = [10000, 20000, 50000, 100000];
                  const count = stats.total_developers;
                  if (count <= 0) return null;

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
                          <span className="text-[8px] text-cream/40 normal-case">
                            Something unlocks at {label}...
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()
              )}
            </div>

            {/* Search / Welcome CTA takeover */}
            {welcomeCtaVisible && !session ? (
              <div
                className="flex w-full max-w-md flex-col items-center gap-2 border-[3px] bg-bg-raised/90 px-5 py-4 backdrop-blur-sm animate-[slide-up_0.3s_ease-out]"
                style={{ borderColor: theme.accent }}
              >
                <p className="text-[11px] text-cream normal-case leading-relaxed">
                  Find your building in the city
                </p>
                <button
                  onClick={() => {
                    setWelcomeCtaVisible(false);
                    localStorage.setItem("gitcity_welcome_seen", "true");
                    handleSignIn();
                  }}
                  className="btn-press w-full max-w-60 py-2.5 text-[10px] text-bg"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `3px 3px 0 0 ${theme.shadow}`,
                  }}
                >
                  Sign in with GitHub
                </button>
                <button
                  onClick={() => {
                    setWelcomeCtaVisible(false);
                    localStorage.setItem("gitcity_welcome_seen", "true");
                    setTimeout(() => searchInputRef.current?.focus(), 100);
                  }}
                  className="text-[9px] text-dim transition-colors hover:text-muted normal-case"
                >
                  or type your username
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleSubmit}
                className="flex w-full max-w-md items-center gap-2"
              >
                <input
                  ref={searchInputRef}
                  type="text"
                  value={username}
                  onChange={(e) => {
                    setUsername(e.target.value);
                    if (feedback?.type === "error") setFeedback(null);
                  }}
                  placeholder={session ? "search any GitHub username" : "type your GitHub username"}
                  className="min-w-0 flex-1 border-[3px] border-border bg-bg-raised px-3 py-2 text-base sm:text-xs text-cream outline-none transition-colors placeholder:text-dim sm:px-4 sm:py-2.5"
                  style={{ borderColor: undefined }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                  onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                />
                <button
                  type="submit"
                  disabled={loading || !username.trim()}
                  className="btn-press shrink-0 px-4 py-2 text-xs text-bg disabled:opacity-40 sm:px-5 sm:py-2.5"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                  }}
                >
                  {loading ? <span className="blink-dot inline-block">_</span> : "Search"}
                </button>
              </form>
            )}

            {/* Search Feedback: loading phases + errors */}
            <SearchFeedback feedback={feedback} accentColor={theme.accent} onDismiss={() => setFeedback(null)} onRetry={searchUser} />

            {/* Loading indicator removed — LoadingScreen overlay handles this */}

            {/* ─── Friday the 13th Event Banner (inline) ─── */}
            {isFridayThe13th() && (
              <div className="flex items-center gap-2 border-2 border-red-500/40 bg-red-950/30 px-3 py-1.5 sm:px-4 sm:py-2">
                <span className="text-sm shrink-0">&#128128;</span>
                <span className="font-silkscreen text-[9px] sm:text-[10px] uppercase tracking-wider text-red-400 whitespace-nowrap">
                  Friday the 13th
                </span>
                <span className="text-[9px] text-red-400/40">|</span>
                <span className="text-[9px] sm:text-[10px] text-orange-300/80 whitespace-nowrap">
                  Unlimited battles, no cooldowns
                </span>
              </div>
            )}
          </div>

          {/* Center - Explore buttons + Shop + Auth */}
          {buildings.length > 0 && (
            <div className="pointer-events-auto flex flex-col items-center gap-2 sm:gap-3">
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
                  Explore City
                  <span className="block text-[8px] opacity-60 normal-case">Browse Buildings</span>
                </button>
                <button
                  onClick={() => {
                    if (session) {
                      window.location.href = "/arcade";
                    } else {
                      trackEArcadeClicked();
                      setEArcadeOpen(true);
                    }
                  }}
                  className="btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg"
                  style={{
                    backgroundColor: theme.accent,
                    boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                  }}
                >
                  Lobby
                  <span className="block text-[8px] opacity-60 normal-case">
                    {arcadeOnline > 0 ? `${arcadeOnline} online` : "Meet other devs"}
                  </span>
                </button>
                {(
                  <div className="relative">
                    <button
                      onClick={() => {
                        setFocusedBuilding(null);
                        setFlyMode(true);
                        setFlyScore({ score: 0, earned: 0, combo: 0, collected: 0, maxCombo: 1 });
                        flyStartTime.current = Date.now();
                        flyPausedAt.current = 0;
                        flyTotalPauseMs.current = 0;
                        setFlyElapsedSec(0);
                        try { setFlyPersonalBest(parseInt(localStorage.getItem("gitcity_fly_pb") || "0", 10) || 0); } catch { setFlyPersonalBest(0); }
                        // Feature 3: show controls overlay on first flight
                        if (!localStorage.getItem("gitcity_fly_controls_seen")) {
                          setShowFlyControls(true);
                        }
                      }}
                      className="btn-press px-7 py-3 text-xs sm:py-3.5 sm:text-sm text-bg"
                      style={{
                        backgroundColor: theme.accent,
                        boxShadow: `4px 4px 0 0 ${theme.shadow}`,
                      }}
                    >
                      Fly
                      <span className="block text-[8px] opacity-60 normal-case">Collect PX</span>
                    </button>
                    {/* Feature 2: First-Fly Tooltip */}
                    {showFlyHint && (
                      <div className="absolute bottom-full left-1/2 z-30 mb-3 -translate-x-1/2 animate-[fade-in_0.3s_ease-out]">
                        <div
                          className="relative w-64 border-2 border-border bg-bg-raised px-4 py-3 text-center backdrop-blur-sm"
                          style={{ borderColor: theme.accent + "60" }}
                        >
                          <p className="text-[10px] leading-relaxed text-cream normal-case">
                            Fly over your city. Collect coins. Compete on the daily leaderboard.
                          </p>
                          <button
                            onClick={() => {
                              setShowFlyHint(false);
                              clearTimeout(flyHintTimerRef.current);
                              try { localStorage.setItem("gitcity_fly_hint_seen", "1"); } catch { }
                            }}
                            className="mt-2 px-3 py-1 text-[9px] text-bg"
                            style={{ backgroundColor: theme.accent }}
                          >
                            Got it
                          </button>
                          {/* Downward arrow */}
                          <div
                            className="absolute top-full left-1/2 -translate-x-1/2 border-x-[6px] border-t-[6px] border-x-transparent"
                            style={{ borderTopColor: theme.accent + "60" }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Feature 1: Daily Challenge Nudge */}
              {showDailyNudge && (
                <div className="animate-[slide-up_0.3s_ease-out] flex items-center gap-2">
                  <button
                    onClick={() => {
                      setShowDailyNudge(false);
                      clearTimeout(dailyNudgeTimerRef.current);
                      setFocusedBuilding(null);
                      setFlyMode(true);
                      setFlyScore({ score: 0, earned: 0, combo: 0, collected: 0, maxCombo: 1 });
                      flyStartTime.current = Date.now();
                      flyPausedAt.current = 0;
                      flyTotalPauseMs.current = 0;
                      setFlyElapsedSec(0);
                      try { setFlyPersonalBest(parseInt(localStorage.getItem("gitcity_fly_pb") || "0", 10) || 0); } catch { setFlyPersonalBest(0); }
                      if (!localStorage.getItem("gitcity_fly_controls_seen")) {
                        setShowFlyControls(true);
                      }
                    }}
                    className="btn-press flex items-center gap-2 border-2 bg-bg/80 px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                    style={{ borderColor: theme.accent + "60", color: theme.accent }}
                  >
                    <span className="normal-case">Today&apos;s challenge is live</span>
                    <span>Play &#8594;</span>
                  </button>
                  <button
                    onClick={() => { setShowDailyNudge(false); clearTimeout(dailyNudgeTimerRef.current); }}
                    className="text-[10px] text-muted transition-colors hover:text-cream"
                  >
                    &#10005;
                  </button>
                </div>
              )}

              {/* Nav + Auth — desktop only (mobile uses bottom bar) */}
              <div className="hidden sm:flex items-center justify-center gap-2">
                <Link
                  href={shopHref}
                  className="btn-press border-[3px] border-border bg-bg/80 px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                  style={{ color: theme.accent }}
                >
                  Shop
                </Link>
                <Link
                  href="/advertise"
                  className="btn-press relative border-[3px] px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors"
                  style={{ color: theme.accent, borderColor: theme.accent + "60", backgroundColor: theme.accent + "12" }}
                >
                  Place your Ad
                  <span
                    className="absolute -top-1.5 -right-2 rounded-sm px-1 py-px text-[7px] font-bold leading-none text-bg"
                    style={{ backgroundColor: theme.accent }}
                  >
                    NEW
                  </span>
                </Link>
                <Link
                  href="/leaderboard"
                  className="btn-press border-[3px] border-border bg-bg/80 px-4 py-1.5 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
                  style={{ color: theme.accent }}
                >
                  &#9819; Leaderboard
                </Link>
              </div>
              <div className="hidden sm:flex items-center justify-center gap-2">
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
                    {myBuilding?.claimed && (
                      <>
                        <XpBar
                          xpTotal={myBuilding.xp_total ?? 0}
                          xpLevel={myBuilding.xp_level ?? 1}
                          accent={theme.accent}
                        />
                        <PixelBalance />
                      </>
                    )}
                    <a
                      href="/settings"
                      className="border-2 border-border bg-bg/80 px-2 py-1 text-[9px] text-muted backdrop-blur-sm transition-colors hover:text-cream hover:border-border-light"
                    >
                      Settings
                    </a>
                    <button
                      onClick={handleSignOut}
                      className="border-2 border-border bg-bg/80 px-2 py-1 text-[9px] text-muted backdrop-blur-sm transition-colors hover:text-cream hover:border-border-light"
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

      {/* ─── Mobile Bottom Bar (game-style nav) ─── */}
      {!flyMode && !exploreMode && !introMode && !rabbitCinematic && buildings.length > 0 && (
        <nav className="pointer-events-auto fixed inset-x-0 bottom-0 z-35 hidden items-center justify-around border-t-2 border-border bg-bg/95 px-1 py-2 backdrop-blur-md sm:hidden">
          <Link
            href={shopHref}
            className="btn-press border-2 border-border px-3 py-1.5 text-[10px] transition-colors active:bg-white/5"
            style={{ color: theme.accent }}
          >
            Shop
          </Link>
          <Link
            href="/advertise"
            className="btn-press relative border-2 px-3 py-1.5 text-[10px] transition-colors active:bg-white/5"
            style={{ color: theme.accent, borderColor: theme.accent + "60", backgroundColor: theme.accent + "12" }}
          >
            Ad
            <span
              className="absolute -top-1.5 -right-1.5 rounded-sm px-0.5 py-px text-[6px] font-bold leading-none text-bg"
              style={{ backgroundColor: theme.accent }}
            >
              NEW
            </span>
          </Link>
          <button
            onClick={() => {
              if (session) {
                window.location.href = "/arcade";
              } else {
                trackEArcadeClicked();
                setEArcadeOpen(true);
              }
            }}
            className="btn-press relative border-2 border-border px-3 py-1.5 text-[10px] transition-colors active:bg-white/5"
            style={{ color: theme.accent }}
          >
            Lobby
            {arcadeOnline > 0 && (
              <span
                className="absolute -top-1.5 -right-1.5 rounded-full px-1 py-px text-[7px] font-bold leading-none text-bg"
                style={{ backgroundColor: theme.accent }}
              >
                {arcadeOnline}
              </span>
            )}
          </button>
          <Link
            href="/leaderboard"
            className="btn-press border-2 border-border px-3 py-1.5 text-[10px] transition-colors active:bg-white/5"
            style={{ color: theme.accent }}
          >
            &#9819; Rank
          </Link>
          {!session ? (
            <button
              onClick={handleSignIn}
              className="btn-press border-2 border-border px-3 py-1.5 text-[10px] transition-colors active:bg-white/5"
            >
              <span style={{ color: theme.accent }}>G</span>{" "}
              <span className="text-cream">Sign in</span>
            </button>
          ) : (
            <>
              {canClaim && (
                <button
                  onClick={handleClaim}
                  disabled={claiming}
                  className="btn-press px-3 py-1.5 text-[10px] text-bg disabled:opacity-40"
                  style={{ backgroundColor: theme.accent, boxShadow: `2px 2px 0 0 ${theme.shadow}` }}
                >
                  {claiming ? "..." : "Claim"}
                </button>
              )}
              <Link
                href={`/dev/${authLogin}`}
                className="btn-press flex items-center gap-1 border-2 border-border px-3 py-1.5 text-[10px] text-cream normal-case transition-colors active:bg-white/5"
              >
                @{authLogin.length > 8 ? authLogin.slice(0, 7) + "…" : authLogin}
                {streakData && streakData.streak > 0 && (
                  <span className="flex items-center gap-0.5" style={{ color: getStreakTierColor(streakData.streak) }}>
                    <span className="text-[8px]">🔥</span>
                    <span className="font-bold">{streakData.streak}</span>
                  </span>
                )}
              </Link>
            </>
          )}
        </nav>
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
              Sign in to give Kudos, battle buildings, and claim yours
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
              Sign in with GitHub
            </button>
            <button
              onClick={() => setSignInPromptVisible(false)}
              className="mt-1.5 w-full py-1 text-[8px] text-dim transition-colors hover:text-muted"
            >
              Maybe later
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
            Opening {adToast} &rarr;
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
            <p className="text-[10px] text-cream normal-case mb-2 leading-relaxed">
              Unlock effects for your building
            </p>
            <p className="text-[8px] text-muted normal-case mb-2.5">
              Neon Outline, Particle Aura, Spotlight, and more
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
                    className="border-2 border-border shrink-0"
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
                        className="shrink-0 px-1.5 py-0.5 text-[7px] text-bg"
                        style={{ backgroundColor: theme.accent }}
                      >
                        Claimed
                      </span>
                    )}
                  </div>
                  <p className="truncate text-[10px] text-muted">@{selectedBuilding.login}</p>
                  {selectedBuilding.active_raid_tag && (
                    <p className="text-[8px] text-red-400">
                      Attacked by @{selectedBuilding.active_raid_tag.attacker_login}
                    </p>
                  )}
                </div>
              </div>

              {/* XP Level badge + progress */}
              {(() => {
                const bTier = tierFromLevel(selectedBuilding.xp_level ?? 1);
                const bRank = rankFromLevel(selectedBuilding.xp_level ?? 1);
                const bProgress = levelProgress(selectedBuilding.xp_total ?? 0);
                const bXpCurrent = (selectedBuilding.xp_total ?? 0) - xpForLevel(selectedBuilding.xp_level ?? 1);
                const bXpNeeded = xpForLevel((selectedBuilding.xp_level ?? 1) + 1) - xpForLevel(selectedBuilding.xp_level ?? 1);
                return (
                  <div className="mx-4 mb-2 flex items-center gap-2">
                    <span
                      className="flex h-7 w-7 items-center justify-center border-2 text-xs font-bold"
                      style={{ borderColor: bTier.color, color: bTier.color }}
                    >
                      {selectedBuilding.xp_level ?? 1}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-bold" style={{ color: bTier.color }}>
                          Lv {selectedBuilding.xp_level ?? 1} · {bRank.title}
                        </span>
                        <span
                          className="px-1 py-px text-[7px] font-bold"
                          style={{ backgroundColor: bTier.color + "22", color: bTier.color }}
                        >
                          {bTier.name.toUpperCase()}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5">
                        <div className="h-1 flex-1 bg-border">
                          <div
                            className="h-full"
                            style={{ width: `${Math.max(2, Math.round(bProgress * 100))}%`, backgroundColor: bTier.color }}
                          />
                        </div>
                        <span className="text-[7px] text-muted">{bXpCurrent}/{bXpNeeded}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}

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
                  { label: "Rank", value: `#${selectedBuilding.rank}` },
                  { label: "Contribs", value: selectedBuilding.contributions.toLocaleString() },
                  { label: "Repos", value: selectedBuilding.public_repos.toLocaleString() },
                  { label: "Stars", value: selectedBuilding.total_stars.toLocaleString() },
                  { label: "Kudos", value: (selectedBuilding.kudos_count ?? 0).toLocaleString() },
                  { label: "Visits", value: (selectedBuilding.visit_count ?? 0).toLocaleString() },
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

              {/* Drop banner: show when building has an active drop */}
              {selectedBuilding.active_drop && (() => {
                const drop = selectedBuilding.active_drop;
                const rarityColors: Record<string, string> = { common: "#00ff88", rare: "#0088ff", epic: "#aa00ff", legendary: "#ffaa00" };
                const dropColor = rarityColors[drop.rarity] ?? rarityColors.common;
                const myPull = myDropPulls[drop.id];
                const exhausted = drop.pull_count >= drop.max_pulls;
                return (
                  <div
                    className="mx-4 mb-3 border-2 p-3"
                    style={{ borderColor: dropColor, backgroundColor: `${dropColor}10` }}
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[11px] font-bold" style={{ color: dropColor }}>
                        DROP FOUND!
                      </span>
                      <span className="text-[9px] text-muted">
                        {drop.pull_count}/{drop.max_pulls} pulled
                      </span>
                    </div>
                    <div className="text-[10px] text-cream mb-2">
                      +{drop.points} pts <span className="text-muted capitalize">({drop.rarity})</span>
                    </div>
                    {myPull ? (
                      <div className="text-[10px] text-center py-1.5" style={{ color: dropColor }}>
                        Already pulled +{myPull.points} pts
                      </div>
                    ) : exhausted ? (
                      <div className="text-[10px] text-center py-1.5 text-muted">
                        Fully pulled ({drop.max_pulls}/{drop.max_pulls})
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleDropPull(drop.id)}
                          disabled={dropPulling}
                          className="btn-press flex-1 py-1.5 text-[10px] text-bg"
                          style={{ backgroundColor: dropColor, boxShadow: `2px 2px 0 0 ${dropColor}66` }}
                        >
                          {dropPulling ? "Pulling..." : "Pull"}
                        </button>
                        <a
                          href={`https://x.com/intent/tweet?text=${encodeURIComponent(`just pulled a ${drop.rarity} drop in Git City 👀 how many are you walking past?`)}&url=${encodeURIComponent("https://thegitcity.com")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-press border-2 px-3 py-1.5 text-[10px] transition-colors hover:border-border-light"
                          style={{ borderColor: `${dropColor}66`, color: dropColor }}
                        >
                          Share
                        </a>
                      </div>
                    )}
                  </div>
                );
              })()}

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
                    className="mx-4 mb-3 border-2 p-2.5"
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
                      <span className="animate-pulse">Sending...</span>
                    ) : kudosError ? (
                      <span>{kudosError}</span>
                    ) : kudosSent ? (
                      <span>+1 Kudos!</span>
                    ) : (
                      "Give Kudos"
                    )}
                  </button>
                  <button
                    onClick={handleOpenGift}
                    className="btn-press mt-1.5 w-full border-2 border-border py-1.5 text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    Send Gift
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
                    {raidState.loading ? "Loading..." : "\u2694\ufe0f BATTLE \u2014 Win +50 XP"}
                  </button>
                </div>
              )}

              {/* A3: Disabled action buttons for non-logged users */}
              {!session && (
                <div className="mx-4 mb-3 space-y-1.5">
                  <button
                    onClick={() => { trackDisabledButtonClicked("kudos"); handleSignIn(); }}
                    className="btn-press w-full py-2 text-[10px] border-2 border-dashed border-border/50 text-muted/60 transition-colors hover:border-border hover:text-muted"
                  >
                    &#x1F512; Give Kudos
                  </button>
                  <button
                    onClick={() => { trackDisabledButtonClicked("gift"); handleSignIn(); }}
                    className="btn-press w-full py-1.5 text-[9px] border-2 border-dashed border-border/50 text-muted/60 transition-colors hover:border-border hover:text-muted"
                  >
                    &#x1F512; Send Gift
                  </button>
                  <button
                    onClick={() => { trackDisabledButtonClicked("raid"); handleSignIn(); }}
                    className="btn-press w-full py-2 text-[10px] border-2 border-dashed border-red-500/30 text-red-400/40 transition-colors hover:border-red-500/60 hover:text-red-400/70"
                  >
                    &#x1F512; &#x2694;&#xFE0F; BATTLE
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
                    className="btn-press w-full border-2 border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
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
                    className="btn-press w-full border-2 border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    Compare
                  </button>
                </div>
              )}

              {/* Admin: Plant Drop */}
              {isAdmin && !selectedBuilding.active_drop && (
                <div className="mx-4 mb-3">
                  {!dropPlantOpen ? (
                    <button
                      onClick={() => setDropPlantOpen(true)}
                      className="btn-press w-full border-2 border-yellow-500/40 py-1.5 text-[9px] text-yellow-400 transition-colors hover:border-yellow-500/70 hover:bg-yellow-500/5"
                    >
                      Plant Drop
                    </button>
                  ) : (
                    <div className="border-2 border-yellow-500/30 bg-yellow-500/5 p-3 space-y-2">
                      <div className="flex gap-2">
                        <select
                          value={dropPlantRarity}
                          onChange={(e) => setDropPlantRarity(e.target.value)}
                          className="flex-1 border border-border bg-bg px-2 py-1 text-[9px] text-cream outline-none"
                        >
                          <option value="common">Common 10pts</option>
                          <option value="rare">Rare 50pts</option>
                          <option value="epic">Epic 200pts</option>
                          <option value="legendary">Legendary 500pts</option>
                        </select>
                        <select
                          value={dropPlantDuration}
                          onChange={(e) => setDropPlantDuration(Number(e.target.value))}
                          className="border border-border bg-bg px-2 py-1 text-[9px] text-cream outline-none"
                        >
                          <option value={24}>24h</option>
                          <option value={48}>48h</option>
                          <option value={72}>72h</option>
                        </select>
                      </div>
                      <input
                        type="number"
                        value={dropPlantMaxPulls}
                        onChange={(e) => setDropPlantMaxPulls(Number(e.target.value))}
                        className="w-full border border-border bg-bg px-2 py-1 text-[9px] text-cream outline-none"
                        placeholder="Max pulls"
                        min={1}
                        max={500}
                      />
                      {dropPlantRarity === "legendary" && (
                        <select
                          value={dropPlantItem}
                          onChange={(e) => setDropPlantItem(e.target.value)}
                          className="w-full border border-border bg-bg px-2 py-1 text-[9px] text-cream outline-none"
                        >
                          <option value="">Select item reward...</option>
                          {dropPlantItems.map((item) => (
                            <option key={item.id} value={item.id}>{item.name}</option>
                          ))}
                        </select>
                      )}
                      {dropPlantResult && (
                        <p className={`text-[9px] ${dropPlantResult === "Planted!" ? "text-lime" : "text-red-400"}`}>{dropPlantResult}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handlePlantDrop}
                          disabled={dropPlanting || (dropPlantRarity === "legendary" && !dropPlantItem)}
                          className="btn-press flex-1 py-1.5 text-[9px] text-bg disabled:opacity-50"
                          style={{ backgroundColor: "#ffaa00" }}
                        >
                          {dropPlanting ? "..." : "Plant"}
                        </button>
                        <button
                          onClick={() => { setDropPlantOpen(false); setDropPlantResult(null); }}
                          className="border border-border px-3 py-1.5 text-[9px] text-muted hover:text-cream"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
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
                      Loadout
                    </Link>
                    <Link
                      href={`/dev/${selectedBuilding.login}`}
                      className="btn-press flex-1 border-2 border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                    >
                      Profile
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
                      View Profile
                    </Link>
                    <a
                      href={`https://github.com/${selectedBuilding.login}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-press flex-1 border-2 border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
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
                className="blink-dot h-2 w-2 shrink-0"
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
                className="ml-1 shrink-0 text-[9px] text-muted transition-colors hover:text-cream"
              >
                Cancel
              </button>
            </div>
            {/* Self-compare hint */}
            {compareSelfHint && (
              <p className="mt-1 text-[9px] normal-case" style={{ color: "#f85149" }}>
                Pick a different building to compare
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
                className="min-w-0 flex-1 border-2 border-border bg-bg px-2.5 py-1.5 text-base sm:text-[10px] text-cream outline-none transition-colors placeholder:text-dim"
                onFocus={(e) => (e.currentTarget.style.borderColor = theme.accent)}
                onBlur={(e) => (e.currentTarget.style.borderColor = "")}
                autoFocus
              />
              <button
                type="submit"
                disabled={loading || !username.trim()}
                className="btn-press shrink-0 px-3 py-1.5 text-[10px] text-bg disabled:opacity-40"
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
      {!compareCinematicPlaying && comparePair && (() => {
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
            sm:bottom-auto sm:right-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2"
            >
              <div className="relative border-t-[3px] border-border bg-bg-raised/95 backdrop-blur-sm
              w-full sm:w-95 sm:border-[3px] sm:max-h-[85vh] sm:overflow-y-auto
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
                  <Link href={`/dev/${comparePair[0].login}`} className="flex flex-col items-center gap-1.5 group w-27.5">
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
                    <p className="truncate text-[10px] text-cream normal-case max-w-27.5 transition-colors group-hover:text-white">@{comparePair[0].login}</p>
                    <p className="text-[8px] text-muted normal-case text-center">{getDevClass(comparePair[0].login)}</p>
                  </Link>

                  <span className="text-base shrink-0 pt-4" style={{ color: theme.accent }}>VS</span>

                  <Link href={`/dev/${comparePair[1].login}`} className="flex flex-col items-center gap-1.5 group w-27.5">
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
                    <p className="truncate text-[10px] text-cream normal-case max-w-27.5 transition-colors group-hover:text-white">@{comparePair[1].login}</p>
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
                    className="btn-press flex-1 border-2 border-border py-1.5 text-center text-[9px] text-cream transition-colors hover:border-border-light"
                  >
                    Card
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
                    Stories
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
                    Compare Again
                  </button>
                  <button
                    onClick={closeCompare}
                    className="btn-press flex-1 border-[2px] border-border py-2 text-center text-[10px] text-cream transition-colors hover:border-border-light"
                  >
                    Close
                  </button>
                </div>
              </div>
            </div>
          </>
        );
      })()}

      {/* ─── Invite Card (dev not in city yet) ─── */}
      {invitePreview && !flyMode && (
        <InviteCard
          developer={invitePreview}
          isLoggedIn={!!session}
          onLogin={handleSignIn}
          onClose={() => setInvitePreview(null)}
          accent={theme.accent}
          shadow={theme.shadow}
        />
      )}

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
                className="mx-auto mb-3 border-2 border-border"
                style={{ imageRendering: "pixelated" }}
              />
            )}

            <p className="text-xs text-cream normal-case">
              <span style={{ color: theme.accent }}>@{shareData.login}</span> joined the city!
            </p>

            <p className="mt-2 text-[10px] text-muted normal-case">
              Rank <span style={{ color: theme.accent }}>#{shareData.rank ?? "?"}</span>
              {" · "}
              <span style={{ color: theme.accent }}>{shareData.contributions.toLocaleString()}</span> contributions
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
                Explore Building
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
                Share on X
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
              View full profile &rarr;
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
                sm:w-85 sm:mx-4 sm:border-[3px]
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
                  className="flex h-9 w-9 shrink-0 items-center justify-center border-2"
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
                      onClick={async (e) => {
                        e.preventDefault();
                        track("sky_ad_click", { ad_id: clickedAd.id, vehicle: clickedAd.vehicle, brand: clickedAd.brand ?? "" });
                        trackSkyAdCtaClick(clickedAd.id, clickedAd.vehicle);
                        const clickId = await trackAdEvent(clickedAd.id, "cta_click", authLogin || undefined);
                        const finalUrl = clickId ? appendClickId(ctaHref, clickId) : ctaHref;
                        if (isMailto) {
                          window.location.href = finalUrl;
                        } else {
                          window.open(finalUrl, "_blank", "noopener,noreferrer");
                        }
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

      {/* ─── Bottom-left controls: Theme + Radio (portal slot) + Intro ─── */}
      {!flyMode && !introMode && !rabbitCinematic && !exploreMode && (
        <div className="pointer-events-auto fixed bottom-8 left-3 z-25 flex flex-col-reverse items-start gap-2 sm:bottom-10 sm:left-4 sm:flex-row sm:items-center">
          <button
            onClick={cycleTheme}
            className="btn-press flex items-center gap-1.5 border-[3px] border-border bg-bg/70 px-2.5 py-1 text-[10px] backdrop-blur-sm transition-colors hover:border-border-light"
          >
            <span style={{ color: theme.accent }}>&#9654;</span>
            <span className="text-cream">{theme.name}</span>
            <span className="text-dim">{themeIndex + 1}/{THEMES.length}</span>
          </button>
          <div id="gc-radio-slot" suppressHydrationWarning />
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


      {/* ─── Daily Missions (quest tracker, right side) ─── */}
      {session && myBuilding?.claimed && !flyMode && !introMode && !exploreMode && !rabbitCinematic && (
        <DailiesWidget
          data={dailiesData}
          accent={theme.accent}
          shadow={theme.shadow}
          isMobile={isMobile}
          onClaim={claimDailies}
          onRefresh={refreshDailies}
        />
      )}

      {/* ─── Drop hint toast (only when city is fully visible) ─── */}
      {dropHint && !introMode && loadStage === "done" && (
        <div className="pointer-events-none fixed bottom-20 left-1/2 z-50 -translate-x-1/2 sm:bottom-24">
          <div
            className="border-2 border-border bg-bg-raised/95 px-5 py-2.5 text-[11px] text-cream backdrop-blur-sm"
            style={{ borderColor: "#ffaa0044", animation: "toastDrop 0.3s ease-out, toastOut 0.4s ease-in 4s forwards" }}
          >
            <span style={{ color: "#ffaa00" }}>&#9679;</span>{" "}
            {dropHintText}
          </div>
        </div>
      )}

      {/* ─── Daily mission progress toasts (top-center, always visible) ─── */}
      {dailyToasts.length > 0 && (
        <div className="pointer-events-none fixed left-1/2 top-4 z-60 flex -translate-x-1/2 flex-col items-center gap-1.5">
          {dailyToasts.map((t) => (
            <div
              key={t.id}
              className="pointer-events-none border-2 border-border bg-bg-raised/95 px-4 py-2 text-[11px] backdrop-blur-sm"
              style={{ animation: "toastDrop 0.3s ease-out, toastOut 0.4s ease-in 2s forwards", borderColor: t.done ? theme.accent : undefined }}
            >
              <span style={{ color: theme.accent }}>{t.done ? "\u2713" : "\u2606"}</span>
              {" "}{t.title}{t.done ? " \u2014 Complete!" : ""}
            </div>
          ))}
          <style jsx>{`
            @keyframes toastDrop {
              from { opacity: 0; transform: translateY(-16px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes toastOut {
              from { opacity: 1; }
              to { opacity: 0; transform: translateY(-8px); }
            }
          `}</style>
        </div>
      )}

      {/* ─── Level Up Toast ─── */}
      {levelUpLevel !== null && (
        <LevelUpToast level={levelUpLevel} onDone={() => setLevelUpLevel(null)} />
      )}

      {/* ─── Activity Ticker ─── */}
      {!flyMode && !introMode && !rabbitCinematic && feedEvents.length >= 1 && (
        <ActivityTicker
          events={feedEvents}
          hasBottomBar={false}
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
          <div className="relative z-10 w-full max-w-70 border-[3px] border-border bg-bg-raised">
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
                        {item.owned ? "Owned" : isBuying ? "..." : item.price_pixels != null ? `${item.price_pixels} PX` : `$${(item.price_usd_cents / 100).toFixed(2)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Error message */}
            {giftError && (
              <div className="border-t border-border px-4 py-2 bg-red-500/10">
                <p className="text-[10px] text-red-400 normal-case text-center">{giftError}</p>
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

      {/* ─── Feature 4: Post-Flight Results Modal ─── */}
      {showFlyResults && !flyMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-bg/70 backdrop-blur-sm"
            onClick={() => { setShowFlyResults(null); clearTimeout(flyResultsTimerRef.current); }}
          />
          {/* Modal */}
          <div
            className="relative mx-3 border-[3px] border-border bg-bg-raised p-5 text-center sm:mx-0 sm:p-7 animate-[gift-bounce_0.5s_ease-out]"
            style={{ borderColor: theme.accent + "60", minWidth: 280 }}
          >
            {/* Close */}
            <button
              onClick={() => { setShowFlyResults(null); clearTimeout(flyResultsTimerRef.current); }}
              className="absolute top-2 right-3 text-[10px] text-muted transition-colors hover:text-cream"
            >
              ESC
            </button>

            <p className="text-[9px] tracking-widest text-muted mb-1">FLIGHT COMPLETE</p>

            {/* Score */}
            <div className="text-3xl sm:text-4xl font-bold" style={{ color: theme.accent }}>
              {showFlyResults.score}
            </div>
            <p className="text-[9px] text-muted mt-0.5">points</p>

            {/* New PB badge */}
            {showFlyResults.isNewPB && (
              <div
                className="mt-2 inline-block rounded-sm px-2.5 py-0.5 text-[9px] font-bold text-bg animate-pulse"
                style={{ backgroundColor: theme.accent }}
              >
                NEW PERSONAL BEST!
              </div>
            )}

            {/* Stats grid */}
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div>
                <div className="text-sm font-bold text-cream">{showFlyResults.collected}</div>
                <div className="text-[8px] text-muted">Collected</div>
              </div>
              <div>
                <div className="text-sm font-bold text-cream">{showFlyResults.maxCombo}x</div>
                <div className="text-[8px] text-muted">Max Combo</div>
              </div>
              <div>
                <div className="text-sm font-bold text-cream">+{showFlyResults.timeBonus}</div>
                <div className="text-[8px] text-muted">Time Bonus</div>
              </div>
            </div>

            {/* Rank */}
            {showFlyResults.rank > 0 && (
              <div className="mt-3 border-t border-border/40 pt-3">
                <span className="text-[9px] text-muted">Rank </span>
                <span className="text-sm font-bold" style={{ color: theme.accent }}>
                  #{showFlyResults.rank}
                </span>
                {showFlyResults.totalPilots > 0 && (
                  <span className="text-[9px] text-muted"> of {showFlyResults.totalPilots}</span>
                )}
              </div>
            )}

            {/* CTAs */}
            <div className="mt-4 flex flex-col items-center gap-2 sm:flex-row sm:justify-center sm:gap-3">
              <button
                onClick={() => {
                  setShowFlyResults(null); clearTimeout(flyResultsTimerRef.current);
                  setFocusedBuilding(null);
                  setFlyMode(true);
                  setFlyScore({ score: 0, earned: 0, combo: 0, collected: 0, maxCombo: 1 });
                  flyStartTime.current = Date.now();
                  flyPausedAt.current = 0;
                  flyTotalPauseMs.current = 0;
                  setFlyElapsedSec(0);
                  try { setFlyPersonalBest(parseInt(localStorage.getItem("gitcity_fly_pb") || "0", 10) || 0); } catch { setFlyPersonalBest(0); }
                }}
                className="btn-press px-5 py-2 text-[10px] text-bg"
                style={{ backgroundColor: theme.accent, boxShadow: `3px 3px 0 0 ${theme.shadow}` }}
              >
                Fly Again
              </button>
              <Link
                href="/leaderboard?mode=game&tab=flight"
                onClick={() => { setShowFlyResults(null); clearTimeout(flyResultsTimerRef.current); }}
                className="btn-press border-2 border-border px-5 py-2 text-[10px] transition-colors hover:border-border-light"
                style={{ color: theme.accent }}
              >
                See Leaderboard
              </Link>
              <button
                onClick={() => { setShowFlyResults(null); clearTimeout(flyResultsTimerRef.current); }}
                className="text-[9px] text-muted transition-colors hover:text-cream"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
              className="mt-4 inline-flex items-center gap-3 border-2 border-border bg-bg-card px-5 py-3"
            >
              <span className="text-2xl">{"\uD83C\uDFC1"}</span>
              <div className="text-left">
                <p className="text-xs text-cream">Flag</p>
                <p className="text-[9px] text-muted normal-case">
                  A flag on top of your building
                </p>
              </div>
            </div>

            {/* Upsell strip */}
            <div className="mt-5 w-full max-w-70">
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
                    className="flex flex-col items-center gap-1 border-2 border-border bg-bg-card px-2 py-2.5 transition-colors hover:border-border-light"
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
        <FounderMessage
          onClose={() => setFounderMessageOpen(false)}
          session={session}
          hasClaimed={!!myBuilding?.claimed}
          onSignIn={handleSignInWithRef}
        />
      )}

      {/* E.Arcade card */}
      {eArcadeOpen && (
        <EArcadeCard
          onClose={() => setEArcadeOpen(false)}
          onEnter={() => {
            window.location.href = "/arcade";
          }}
          onViewJobs={() => {
            window.location.href = "/jobs";
          }}
          session={session}
          onSignIn={handleSignInWithRef}
        />
      )}

      {/* Sponsored landmark card */}
      {activeSponsor && (() => {
        const cfg = SPONSORS.find((s) => s.slug === activeSponsor);
        return cfg ? <SponsoredCard config={cfg} onClose={() => setActiveSponsor(null)} /> : null;
      })()}

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
            className="pointer-events-auto absolute top-4 right-4 z-60 font-pixel text-[10px] sm:text-[12px] tracking-wider border border-[#00ff41]/40 px-3 py-1.5 transition-colors hover:bg-[#00ff41]/10"
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
