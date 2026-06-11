"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import CurrencyIcon from "@/components/CurrencyIcon";
import { PaymentMethodTabs } from "@/components/PaymentMethodTabs";
import { PixModal } from "@/components/pixels/PixModal";
import {
  usePixelCheckout,
  type PayMethod,
  type PixelPackage,
} from "@/components/pixels/usePixelCheckout";
import { isGitcEnabled } from "@/lib/gitc";
import { isBrazilClient } from "@/lib/geo";

// The Exchange screen carries the heavy web3 bundle (wagmi + Reown). Load it
// lazily so opening the bank (home + Add Pixels + data fetches) never waits on
// that chunk.
const BankSwapTab = dynamic(() => import("@/components/BankSwapTab"), {
  ssr: false,
  loading: () => (
    <div className="flex flex-col gap-2 py-2">
      <div className="h-16 animate-pulse rounded bg-border/50" />
      <div className="h-10 animate-pulse rounded bg-border/50" />
      <div className="h-10 animate-pulse rounded bg-border/50" />
    </div>
  ),
});

// "Pay with GITC" also needs web3 — lazy too, so card/PIX buyers never load it.
const GitcPayPanel = dynamic(() => import("@/components/GitcPayPanel"), {
  ssr: false,
  loading: () => <div className="h-10 animate-pulse rounded bg-border/50" />,
});

// "Old money meets crypto": gold chrome, lime = Pixel / primary action.
const GOLD = "#e6b84d";
const GOLD_DEEP = "#6f3b05";
const LIME = "#c8e64a";
const LIME_DEEP = "#5a7a00";

type BankView = "home" | "add" | "exchange" | "activity";

interface GitcMarket {
  priceUsd: number | null;
  change24h: number | null;
}

interface WalletTx {
  id: string;
  type: "credit" | "debit";
  amount: number;
  source: string;
  description: string | null;
  balance_after: number;
  created_at: string;
}

export interface BankPanelProps {
  open: boolean;
  onClose: () => void;
  isAuthenticated: boolean;
  githubLogin: string;
  /** Balance already known by the HUD chip — shown instantly, no spinner. */
  initialBalance?: number | null;
  /** Called whenever the PX balance changes so the HUD chip can update. */
  onBalanceChange?: (balance: number) => void;
  serverCountry?: string | null;
}

const VIEW_TITLE: Record<BankView, string> = {
  home: "Git City Bank",
  add: "Add Pixels",
  exchange: "Exchange",
  activity: "Activity",
};

const BADGES: Record<string, string> = { popular: "Most popular", mega: "Best value" };

// ─── small helpers ───────────────────────────────────────────
/** Count-up animation for the hero balance. */
function useCountUp(target: number | null, ms = 650): number {
  const [display, setDisplay] = useState(target ?? 0);
  const fromRef = useRef(target ?? 0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (target === null) return;
    const from = fromRef.current;
    const to = target;
    if (from === to) { setDisplay(to); return; }
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / ms);
      const eased = 1 - Math.pow(1 - t, 3); // easeOutCubic
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, ms]);
  return display;
}

/** Turn a raw ledger row into friendly, sentence-case text (no slugs/IDs). */
function prettyTx(tx: WalletTx): string {
  let text = tx.description || tx.source.replace(/_/g, " ");
  text = text.replace(/\s*to dev\s+\d+/gi, ""); // drop "to dev 12561" tails
  text = text.replace(/_/g, " ").trim();
  return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
}

function timeAgo(iso: string): string {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

/** Human price — never scientific notation. Low-cap tokens get full decimals. */
function fmtPrice(p: number): string {
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  // sub-cent: enough decimals to reveal ~2 significant digits, no e-notation
  const decimals = Math.min(12, Math.max(2, -Math.floor(Math.log10(p)) + 1));
  return `$${p.toFixed(decimals)}`;
}

// ─── Panel ───────────────────────────────────────────────────
export default function BankPanel({
  open,
  onClose,
  isAuthenticated,
  githubLogin,
  initialBalance = null,
  onBalanceChange,
  serverCountry,
}: BankPanelProps) {
  void githubLogin;
  const [view, setView] = useState<BankView>("home");
  const [showInfo, setShowInfo] = useState(false);
  // Lets the Exchange "Convert to Pixels →" land on Add Pixels with GITC chosen.
  const [addInitialMethod, setAddInitialMethod] = useState<PayMethod | undefined>(undefined);
  const [packages, setPackages] = useState<PixelPackage[]>([]);
  const [packagesLoading, setPackagesLoading] = useState(false);
  const [balance, setBalance] = useState<number | null>(initialBalance);
  const [history, setHistory] = useState<WalletTx[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [market, setMarket] = useState<GitcMarket>({ priceUsd: null, change24h: null });
  const [isBR, setIsBR] = useState(false);

  const refreshBalance = useCallback(() => {
    fetch("/api/pixels/balance")
      .then((r) => r.json())
      .then((d) => {
        const b = d.balance ?? 0;
        setBalance(b);
        onBalanceChange?.(b);
      })
      .catch(() => {});
    setHistoryLoading(true);
    fetch("/api/pixels/history?limit=20")
      .then((r) => r.json())
      .then((d) => setHistory(d.transactions ?? []))
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }, [onBalanceChange]);

  const {
    buying,
    error,
    setError,
    pixModal,
    handleStripeBuy,
    handlePixBuy,
    handlePixClose,
    buildGitcCallbacks,
  } = usePixelCheckout({ packages, isAuthenticated, onPurchased: refreshBalance });

  useEffect(() => {
    if (!open) return;
    setIsBR(isBrazilClient(serverCountry));
    setPackagesLoading(true);
    fetch("/api/pixels/packages")
      .then((r) => r.json())
      .then((d) => setPackages(d.packages ?? []))
      .catch(() => {})
      .finally(() => setPackagesLoading(false));
    fetch("/api/gitc/price").then((r) => r.json()).then((d: GitcMarket) => setMarket(d)).catch(() => {});
    if (isAuthenticated) refreshBalance();
  }, [open, isAuthenticated, serverCountry, refreshBalance]);

  // Reset to the home view whenever the panel is re-opened.
  useEffect(() => {
    if (open) { setView("home"); setShowInfo(false); }
  }, [open]);

  if (!open) return null;
  const gitcEnabled = isGitcEnabled();
  const canGoBack = showInfo || view !== "home";

  const goBack = () => {
    if (showInfo) setShowInfo(false);
    else setView("home");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="relative flex max-h-[88vh] w-full max-w-md flex-col border-2 bg-bg"
        style={{ borderColor: GOLD, boxShadow: `0 0 0 1px ${GOLD_DEEP}, 6px 6px 0 0 rgba(0,0,0,0.5)` }}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 px-4 py-3" style={{ borderColor: `${GOLD}40` }}>
          <div className="flex items-center gap-2">
            {canGoBack && (
              <button onClick={goBack} className="font-pixel text-xs text-muted hover:text-cream cursor-pointer" aria-label="Back">←</button>
            )}
            <h2 className="font-pixel text-sm tracking-wide" style={{ color: GOLD }}>
              {showInfo ? "About the Bank" : VIEW_TITLE[view]}
            </h2>
          </div>
          <div className="flex items-center gap-3">
            {!showInfo && (
              <button onClick={() => setShowInfo(true)} className="flex h-5 w-5 items-center justify-center rounded-full border font-pixel text-[9px] text-muted hover:text-cream cursor-pointer" style={{ borderColor: `${GOLD}66` }} aria-label="What is this?">?</button>
            )}
            <button onClick={onClose} className="font-pixel text-sm text-muted hover:text-cream cursor-pointer" aria-label="Close">&#10005;</button>
          </div>
        </div>

        <div className="no-scrollbar flex-1 overflow-y-auto p-4">
          {error && (
            <div className="mb-3 border-2 border-red-500/40 bg-red-500/10 p-2 text-center">
              <p className="text-[11px] text-red-400">{error}</p>
            </div>
          )}
          {!isAuthenticated && !showInfo && (
            <div className="mb-3 border-2 border-border bg-bg-raised p-3 text-center">
              <p className="font-pixel text-[11px] text-cream">Sign in to use the bank</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted">Claim your building in the city first.</p>
            </div>
          )}

          {showInfo ? (
            <InfoBody />
          ) : view === "home" ? (
            <BankHome
              balance={balance}
              market={market}
              history={history}
              gitcEnabled={gitcEnabled}
              isAuthenticated={isAuthenticated}
              onNavigate={(v) => { if (v === "add") setAddInitialMethod(undefined); setView(v); }}
            />
          ) : view === "add" ? (
            <AddPixels
              packages={packages}
              packagesLoading={packagesLoading}
              isBR={isBR}
              buying={buying}
              isAuthenticated={isAuthenticated}
              gitcEnabled={gitcEnabled}
              market={market}
              initialMethod={addInitialMethod}
              onStripe={handleStripeBuy}
              onPix={handlePixBuy}
              buildGitcCallbacks={buildGitcCallbacks}
              onConfirmed={refreshBalance}
              onError={setError}
              onNavigateExchange={() => setView("exchange")}
            />
          ) : view === "exchange" ? (
            gitcEnabled ? (
              <BankSwapTab
                market={market}
                onConfirmed={refreshBalance}
                onConvertToPixels={() => { setAddInitialMethod("gitc"); setView("add"); }}
              />
            ) : (
              <p className="py-8 text-center text-[11px] leading-relaxed text-muted">GITC swaps aren’t available right now. You can still add Pixels with card or PIX.</p>
            )
          ) : (
            <ActivityView balance={balance} history={history} loading={historyLoading} isAuthenticated={isAuthenticated} />
          )}
        </div>
      </div>

      {pixModal && <PixModal data={pixModal} onClose={handlePixClose} />}
    </div>
  );
}

// ─── Home ────────────────────────────────────────────────────
function BankHome({ balance, market, history, gitcEnabled, isAuthenticated, onNavigate }: {
  balance: number | null;
  market: GitcMarket;
  history: WalletTx[];
  gitcEnabled: boolean;
  isAuthenticated: boolean;
  onNavigate: (v: BankView) => void;
}) {
  const display = useCountUp(balance);
  const recent = history.slice(0, 3);
  const up = (market.change24h ?? 0) >= 0;

  const actions: { id: BankView; icon: string; label: string; primary?: boolean }[] = [
    { id: "add", icon: "＋", label: "Add Pixels", primary: true },
    ...(gitcEnabled ? [{ id: "exchange" as BankView, icon: "⇄", label: "Exchange" }] : []),
    { id: "activity", icon: "≡", label: "Activity" },
  ];

  return (
    <div>
      {/* Hero balance */}
      <div className="mb-4 flex flex-col items-center border-2 py-5" style={{ borderColor: `${LIME}40`, background: `radial-gradient(circle at 50% 0%, ${LIME}12, transparent 70%)` }}>
        <CurrencyIcon currency="pixels" size={40} />
        <p className="mt-2 font-pixel text-4xl leading-none text-cream">
          {balance !== null
            ? display.toLocaleString()
            : isAuthenticated
              ? <span className="inline-block h-7 w-24 animate-pulse rounded bg-border align-middle" />
              : <span className="text-dim">—</span>}
        </p>
        <p className="mt-1 font-pixel text-[10px]" style={{ color: LIME }}>Pixels</p>
        <p className="mt-1 text-[11px] text-muted">to spend in the city</p>
      </div>

      {/* Actions */}
      <div className="mb-4 grid gap-2" style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}>
        {actions.map((a) => (
          <button
            key={a.id}
            onClick={() => onNavigate(a.id)}
            className="btn-press flex flex-col items-center gap-1.5 border-2 py-3 transition-colors cursor-pointer"
            style={a.primary
              ? { borderColor: LIME, backgroundColor: `${LIME}14` }
              : { borderColor: "var(--color-border)", backgroundColor: "var(--color-bg-raised)" }}
          >
            <span className="font-pixel text-lg" style={{ color: a.primary ? LIME : GOLD }}>{a.icon}</span>
            <span className="font-pixel text-[9px]" style={{ color: a.primary ? LIME : "var(--color-muted)" }}>{a.label}</span>
          </button>
        ))}
      </div>

      {/* GITC ticker → Exchange (ignorable by non-crypto players) */}
      {gitcEnabled && market.priceUsd !== null && (
        <button
          onClick={() => onNavigate("exchange")}
          className="btn-press mb-4 flex w-full items-center justify-between border-2 px-3 py-2.5 cursor-pointer"
          style={{ borderColor: `${GOLD}40`, background: `linear-gradient(90deg, transparent, ${GOLD}10, transparent)` }}
        >
          <span className="flex items-center gap-2">
            <CurrencyIcon currency="gitc" size={14} />
            <span className="font-pixel text-[10px]" style={{ color: GOLD }}>GITC</span>
            <span className="font-pixel text-[10px] text-cream">{fmtPrice(market.priceUsd)}</span>
            {market.change24h !== null && (
              <span className="font-pixel text-[10px]" style={{ color: up ? "#39d353" : "#ff6b6b" }}>
                {up ? "▲" : "▼"} {Math.abs(market.change24h).toFixed(1)}%
              </span>
            )}
          </span>
          <span className="font-pixel text-[11px] text-dim">›</span>
        </button>
      )}

      {/* Recent activity preview */}
      {isAuthenticated && recent.length > 0 && (
        <>
          <div className="mb-2 flex items-center justify-between">
            <p className="font-pixel text-[10px] text-muted">Recent</p>
            <button onClick={() => onNavigate("activity")} className="text-[10px] text-muted hover:text-cream cursor-pointer">View all ›</button>
          </div>
          <ul className="flex flex-col gap-1">
            {recent.map((tx) => {
              const credit = tx.type === "credit";
              return (
                <li key={tx.id} className="flex items-center gap-2 border-l-2 bg-bg-raised/60 px-2.5 py-1.5" style={{ borderColor: credit ? LIME : GOLD_DEEP }}>
                  <span className="flex-1 truncate text-[11px] text-warm">{prettyTx(tx)}</span>
                  <span className="shrink-0 text-[10px] text-dim">{timeAgo(tx.created_at)}</span>
                  <span className="shrink-0 font-pixel text-[10px]" style={{ color: credit ? "#39d353" : "#ff6b6b" }}>
                    {credit ? "+" : "−"}{tx.amount.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}

// ─── Activity (full ledger) ──────────────────────────────────
function ActivityView({ balance, history, loading, isAuthenticated }: { balance: number | null; history: WalletTx[]; loading: boolean; isAuthenticated: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const display = useCountUp(balance);
  const shown = showAll ? history : history.slice(0, 8);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between border-2 px-3 py-2.5" style={{ borderColor: `${LIME}40` }}>
        <span className="flex items-center gap-2">
          <CurrencyIcon currency="pixels" size={20} />
          <span className="font-pixel text-[10px]" style={{ color: LIME }}>Balance</span>
        </span>
        <span className="font-pixel text-base text-cream">
          {balance !== null
            ? display.toLocaleString()
            : isAuthenticated
              ? <span className="inline-block h-4 w-16 animate-pulse rounded bg-border align-middle" />
              : <span className="text-dim">—</span>}
        </span>
      </div>

      {loading && history.length === 0 ? (
        <ul className="flex flex-col gap-1">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="flex items-center gap-2 border-l-2 border-border bg-bg-raised/60 px-2.5 py-2">
              <span className="h-3 flex-1 animate-pulse rounded bg-border" style={{ animationDelay: `${i * 80}ms` }} />
              <span className="h-3 w-8 animate-pulse rounded bg-border" />
            </li>
          ))}
        </ul>
      ) : history.length === 0 ? (
        <p className="py-8 text-center text-[11px] leading-relaxed text-muted">No activity yet. Earn Pixels by committing daily and keeping streaks.</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1">
            {shown.map((tx) => {
              const credit = tx.type === "credit";
              return (
                <li key={tx.id} className="flex items-center gap-2 border-l-2 bg-bg-raised/60 px-2.5 py-1.5" style={{ borderColor: credit ? LIME : GOLD_DEEP }}>
                  <span className="flex-1 truncate text-[11px] text-warm">{prettyTx(tx)}</span>
                  <span className="shrink-0 text-[10px] text-dim">{timeAgo(tx.created_at)}</span>
                  <span className="flex shrink-0 items-center gap-1 font-pixel text-[10px]" style={{ color: credit ? "#39d353" : "#ff6b6b" }}>
                    {credit ? "+" : "−"}{tx.amount.toLocaleString()}
                  </span>
                </li>
              );
            })}
          </ul>
          {history.length > 8 && (
            <button onClick={() => setShowAll((v) => !v)} className="mt-2 w-full text-center text-[10px] text-muted hover:text-cream cursor-pointer">
              {showAll ? "Show less" : `View all (${history.length})`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── Add Pixels (pick pack → Card / PIX / GITC) ──────────────
function AddPixels({ packages, packagesLoading, isBR, buying, isAuthenticated, gitcEnabled, market, initialMethod, onStripe, onPix, buildGitcCallbacks, onConfirmed, onError, onNavigateExchange }: {
  packages: PixelPackage[];
  packagesLoading: boolean;
  isBR: boolean;
  buying: string | null;
  isAuthenticated: boolean;
  gitcEnabled: boolean;
  market: GitcMarket;
  initialMethod?: PayMethod;
  onStripe: (id: string) => void;
  onPix: (id: string) => void;
  buildGitcCallbacks: ReturnType<typeof usePixelCheckout>["buildGitcCallbacks"];
  onConfirmed: () => void;
  onError: (msg: string) => void;
  onNavigateExchange: () => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [method, setMethod] = useState<PayMethod>(initialMethod ?? (isBR ? "pix" : "card"));
  const pkg = packages.find((p) => p.id === selected) ?? null;

  // A method whose tab is hidden (e.g. PIX on a pack with no BRL price) must
  // never stay "selected" or the pay box renders empty. Fall back to the first
  // visible method without losing the user's stored preference.
  const methodVisible: Record<PayMethod, boolean> = {
    card: true,
    pix: isBR && !!pkg?.price_brl_cents,
    gitc: gitcEnabled,
  };
  const visibleOrder: PayMethod[] = ["card", "pix", "gitc"];
  const effectiveMethod: PayMethod = methodVisible[method] ? method : visibleOrder.find((m) => methodVisible[m]) ?? "card";

  return (
    <div>
      <p className="mb-3 text-[11px] leading-relaxed text-muted">Pick a pack, then choose how to pay. Card and PIX are instant — no crypto needed.</p>
      <div className="flex flex-col gap-2">
        {packagesLoading && packages.length === 0 ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center justify-between border-2 border-border bg-bg-raised px-3 py-2.5">
              <span className="flex items-center gap-2">
                <span className="h-[18px] w-[18px] animate-pulse rounded bg-border" style={{ animationDelay: `${i * 80}ms` }} />
                <span className="h-3 w-20 animate-pulse rounded bg-border" style={{ animationDelay: `${i * 80}ms` }} />
              </span>
              <span className="h-3 w-12 animate-pulse rounded bg-border" style={{ animationDelay: `${i * 80}ms` }} />
            </div>
          ))
        ) : packages.length === 0 ? (
          <p className="py-6 text-center text-[11px] leading-relaxed text-muted">Couldn’t load packs. Check your connection and try again.</p>
        ) : (
          packages.map((p) => {
          const total = p.pixels + p.bonus_pixels;
          const active = p.id === selected;
          const bonusPct = p.bonus_pixels > 0 ? Math.round((p.bonus_pixels / p.pixels) * 100) : 0;
          return (
            <button
              key={p.id}
              onClick={() => setSelected(active ? null : p.id)}
              className="btn-press flex items-center justify-between border-2 px-3 py-2.5 text-left transition-colors cursor-pointer"
              style={{ borderColor: active ? LIME : "var(--color-border)", backgroundColor: active ? `${LIME}14` : "var(--color-bg-raised)" }}
            >
              <span className="flex items-center gap-2">
                <CurrencyIcon currency="pixels" size={18} />
                <span className="font-pixel text-[12px] text-cream">{total.toLocaleString()}</span>
                {BADGES[p.id] && <span className="font-pixel text-[8px]" style={{ color: GOLD }}>{BADGES[p.id]}</span>}
                {bonusPct > 0 && <span className="text-[9px] text-[#39d353]">+{bonusPct}%</span>}
              </span>
              <span className="font-pixel text-[11px] text-warm">${(p.price_usd_cents / 100).toFixed(2)}</span>
            </button>
          );
          })
        )}
      </div>

      {pkg && (
        <div className="mt-4 border-2 border-border bg-bg-raised p-3">
          <PaymentMethodTabs<PayMethod>
            methods={[
              { id: "card", label: "Card" },
              { id: "pix", label: "PIX", visible: methodVisible.pix },
              { id: "gitc", label: "GITC", visible: methodVisible.gitc },
            ]}
            selected={effectiveMethod}
            onChange={setMethod}
          >
            {effectiveMethod === "card" && (
              <button onClick={() => onStripe(pkg.id)} disabled={!!buying || !isAuthenticated}
                className="btn-press w-full py-2.5 font-pixel text-[11px] text-bg disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: LIME, boxShadow: `2px 2px 0 0 ${LIME_DEEP}` }}>
                {buying === pkg.id ? "Redirecting…" : `Pay $${(pkg.price_usd_cents / 100).toFixed(2)} with card`}
              </button>
            )}
            {effectiveMethod === "pix" && pkg.price_brl_cents && (
              <button onClick={() => onPix(pkg.id)} disabled={!!buying || !isAuthenticated}
                className="btn-press w-full py-2.5 font-pixel text-[11px] disabled:opacity-40 cursor-pointer"
                style={{ backgroundColor: "transparent", border: `2px solid ${LIME}`, color: LIME, boxShadow: `2px 2px 0 0 ${LIME_DEEP}` }}>
                {buying === pkg.id ? "Generating PIX…" : `Pay R$${(pkg.price_brl_cents / 100).toFixed(2)} with PIX`}
              </button>
            )}
            {effectiveMethod === "gitc" && (
              <>
                {market.priceUsd !== null && (
                  <p className="mb-2 text-[10px] leading-relaxed text-muted normal-case">
                    Pay in GITC at the live price ({fmtPrice(market.priceUsd)}). Connect your wallet to see the exact amount.
                  </p>
                )}
                <GitcPayPanel
                  pkg={pkg}
                  buying={buying}
                  buildGitcCallbacks={buildGitcCallbacks}
                  onConfirmed={onConfirmed}
                  onError={onError}
                  onNeedGitc={onNavigateExchange}
                />
              </>
            )}
          </PaymentMethodTabs>
        </div>
      )}
    </div>
  );
}

// ─── Info ────────────────────────────────────────────────────
function InfoBody() {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex gap-3">
        <CurrencyIcon currency="pixels" size={28} />
        <div>
          <p className="font-pixel text-[11px]" style={{ color: LIME }}>Pixel</p>
          <p className="mt-1 text-[12px] leading-relaxed text-warm">
            The city’s currency. Spend it on cosmetics, upgrades and perks for your building. Earn it by committing daily, keeping streaks and playing — or add it with card or PIX in one tap.
          </p>
        </div>
      </div>
      <div className="flex gap-3">
        <CurrencyIcon currency="gitc" size={28} />
        <div>
          <p className="font-pixel text-[11px]" style={{ color: GOLD }}>GITC</p>
          <p className="mt-1 text-[12px] leading-relaxed text-warm">
            An optional crypto token on Base, for players who already use crypto. Exchange USDC or ETH for GITC here, and pay for Pixels with it. You never need it — card and PIX add Pixels directly.
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-dim">
        No crypto knowledge required. Pixels earned by playing stay in the city.
      </p>
    </div>
  );
}
