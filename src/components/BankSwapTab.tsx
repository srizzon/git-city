"use client";

import { useEffect, useState } from "react";
import {
  useAccount,
  useBalance,
  useChainId,
  usePublicClient,
  useReadContract,
  useSendTransaction,
  useSwitchChain,
  useWalletClient,
  useWriteContract,
} from "wagmi";
import { base } from "viem/chains";
import { parseUnits, formatUnits } from "viem";
import { useAppKit } from "@reown/appkit/react";
import { Web3Provider } from "@/components/Web3Provider";
import CurrencyIcon from "@/components/CurrencyIcon";
import {
  GITC_ADDRESS,
  GITC_SWAP_DEFAULT_SLIPPAGE_BPS,
  GITC_SWAP_SLIPPAGE_PRESETS_BPS,
  SWAP_INPUTS,
  buildUniswapSwapUrl,
} from "@/lib/gitc";

const GOLD = "#e6b84d";
const GOLD_DEEP = "#6f3b05";
const DEAD = "#ff6b6b";

const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

// Native ETH needs a little headroom left for gas when the player taps "Max".
const ETH_GAS_BUFFER_WEI = parseUnits("0.00005", 18);

interface Market {
  priceUsd: number | null;
  change24h: number | null;
}

interface Props {
  market: Market;
  /** Called after a successful swap so the panel can refresh balances. */
  onConfirmed: () => void;
  /** Bridge the player to the Add Pixels screen (GITC preselected) after a swap. */
  onConvertToPixels?: () => void;
}

interface ZeroxQuote {
  disabled?: boolean;
  error?: string;
  buyAmount?: string;
  liquidityAvailable?: boolean;
  transaction?: { to: `0x${string}`; data: `0x${string}`; value?: string };
  issues?: { allowance?: { actual: string; spender: `0x${string}` } | null };
}

type SwapStatus =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "approving" }
  | { kind: "swapping" }
  | { kind: "confirming"; txHash: `0x${string}`; received: bigint }
  | { kind: "done"; txHash: `0x${string}`; received: bigint }
  | { kind: "error"; message: string };

function fmtPrice(p: number): string {
  if (p >= 1) return `$${p.toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  if (p >= 0.01) return `$${p.toFixed(4)}`;
  const decimals = Math.min(12, Math.max(2, -Math.floor(Math.log10(p)) + 1));
  return `$${p.toFixed(decimals)}`;
}

/** Abbreviate a token amount (1.17M / 12.4K / 940) — micro-cap GITC runs huge. */
function fmtGitc(tokens: number): string {
  if (!Number.isFinite(tokens) || tokens <= 0) return "0";
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 2 })}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toLocaleString(undefined, { maximumFractionDigits: 1 })}K`;
  return tokens.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function fmtUsd(v: number): string {
  return v >= 1 ? `$${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : `$${v.toFixed(2)}`;
}

/** Short token balance for the "you pay" line. */
function fmtBalance(wei: bigint, decimals: number): string {
  const n = Number(formatUnits(wei, decimals));
  return n.toLocaleString(undefined, { maximumFractionDigits: decimals === 6 ? 2 : 5 });
}

/** Live ETH/USD from Coinbase's keyless, CORS-enabled spot endpoint. */
function useEthUsd(enabled: boolean): number | null {
  const [price, setPrice] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled || price !== null) return;
    let cancelled = false;
    fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot")
      .then((r) => r.json())
      .then((d) => {
        const p = Number(d?.data?.amount);
        if (!cancelled && Number.isFinite(p) && p > 0) setPrice(p);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enabled, price]);
  return price;
}

function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : "";
  if (/user rejected|denied|user cancel|rejected the request/i.test(msg)) return "You cancelled the transaction.";
  if (/insufficient funds|exceeds balance|insufficient/i.test(msg)) return "Not enough balance for this swap (plus gas).";
  if (/chain|network|switch/i.test(msg)) return "Switch your wallet to Base and try again.";
  return "The swap failed. Try again, or raise slippage for low liquidity.";
}

/**
 * The Exchange tab is the ONLY part of the bank that needs web3 (wagmi + Reown),
 * so it owns the Web3Provider and is loaded lazily — opening the bank never
 * waits on the heavy wallet bundle.
 */
export default function BankSwapTab(props: Props) {
  return (
    <Web3Provider>
      <ExchangeInner {...props} />
    </Web3Provider>
  );
}

function ExchangeInner({ market, onConfirmed, onConvertToPixels }: Props) {
  const { open } = useAppKit();
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient({ chainId: base.id });
  const { writeContractAsync } = useWriteContract();
  const { sendTransactionAsync } = useSendTransaction();
  const { switchChainAsync } = useSwitchChain();

  const [sellId, setSellId] = useState<"USDC" | "ETH">("USDC");
  const [amount, setAmount] = useState("10");
  const [slippageBps, setSlippageBps] = useState<number>(GITC_SWAP_DEFAULT_SLIPPAGE_BPS);
  const [showSlippage, setShowSlippage] = useState(false);
  const [status, setStatus] = useState<SwapStatus>({ kind: "idle" });
  const [price, setPrice] = useState<{
    buyAmount: bigint | null;
    nativeAvailable: boolean;
    noLiquidity: boolean;
    loading: boolean;
  }>({ buyAmount: null, nativeAvailable: true, noLiquidity: false, loading: false });

  const input = SWAP_INPUTS.find((t) => t.id === sellId)!;
  const isEth = sellId === "ETH";
  const ethUsd = useEthUsd(isEth);
  const amt = parseFloat(amount) || 0;

  let sellWei: bigint | null = null;
  try {
    sellWei = amt > 0 ? parseUnits(amount, input.decimals) : null;
  } catch {
    sellWei = null;
  }
  const sellWeiStr = sellWei?.toString() ?? "";

  // ── input-token balance (for Max + insufficient) ──
  const { data: ethBal } = useBalance({
    address,
    chainId: base.id,
    query: { enabled: !!address && isEth },
  });
  const { data: usdcBal } = useReadContract({
    address: input.zeroxToken as `0x${string}`,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address && !isEth, refetchInterval: 20_000 },
  });
  const balanceWei: bigint | null = isEth ? ethBal?.value ?? null : (usdcBal as bigint | undefined) ?? null;
  const insufficient = sellWei !== null && balanceWei !== null && sellWei > balanceWei;

  // GITC balance — the player's proof the swap landed. Refetched after a swap.
  const { data: gitcBalRaw, refetch: refetchGitc } = useReadContract({
    address: GITC_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address },
  });
  const gitcBalance: bigint | null = (gitcBalRaw as bigint | undefined) ?? null;

  const { data: walletClient } = useWalletClient();
  async function addGitcToWallet() {
    try {
      await walletClient?.watchAsset({
        type: "ERC20",
        options: { address: GITC_ADDRESS, symbol: "GITC", decimals: 18 },
      });
    } catch {
      /* user declined or wallet doesn't support watchAsset — non-fatal */
    }
  }

  function setMax() {
    if (balanceWei === null) return;
    const maxWei = isEth ? (balanceWei > ETH_GAS_BUFFER_WEI ? balanceWei - ETH_GAS_BUFFER_WEI : BigInt(0)) : balanceWei;
    setAmount(formatUnits(maxWei, input.decimals));
  }

  function onAmountChange(v: string) {
    // Accept a comma as decimal separator (pt-BR) and sanitize to a
    // non-negative decimal (input is type=text so we control the value).
    const norm = v.replace(",", ".");
    if (norm === "" || /^\d*\.?\d*$/.test(norm)) setAmount(norm);
  }

  // Debounced indicative price. `{disabled}` → no 0x key → use the Uniswap fallback.
  useEffect(() => {
    if (!sellWeiStr) {
      setPrice((p) => ({ ...p, buyAmount: null, noLiquidity: false, loading: false }));
      return;
    }
    let cancelled = false;
    setPrice((p) => ({ ...p, loading: true }));
    const t = setTimeout(async () => {
      try {
        const qs = new URLSearchParams({
          sellToken: input.zeroxToken,
          sellAmount: sellWeiStr,
          slippageBps: String(slippageBps),
        });
        if (address) qs.set("taker", address);
        const res = await fetch(`/api/gitc/swap/price?${qs.toString()}`);
        const data = (await res.json()) as ZeroxQuote;
        if (cancelled) return;
        if (data.disabled) {
          setPrice({ buyAmount: null, nativeAvailable: false, noLiquidity: false, loading: false });
          return;
        }
        if (data.error || data.liquidityAvailable === false || !data.buyAmount) {
          setPrice({ buyAmount: null, nativeAvailable: true, noLiquidity: true, loading: false });
          return;
        }
        setPrice({ buyAmount: BigInt(data.buyAmount), nativeAvailable: true, noLiquidity: false, loading: false });
      } catch {
        if (!cancelled) setPrice((p) => ({ ...p, loading: false }));
      }
    }, 400);
    return () => { cancelled = true; clearTimeout(t); };
  }, [sellWeiStr, input.zeroxToken, slippageBps, address]);

  const unitUsd = isEth ? ethUsd : 1; // null until ETH price loads
  const sellUsd = unitUsd !== null ? amt * unitUsd : null;

  // GITC out: prefer the live 0x quote; fall back to price-pegged estimate.
  const gitcOut =
    price.buyAmount !== null
      ? Number(formatUnits(price.buyAmount, 18))
      : sellUsd !== null && market.priceUsd
        ? sellUsd / market.priceUsd
        : null;
  const rateGitc =
    gitcOut !== null && amt > 0 ? gitcOut / amt : market.priceUsd && unitUsd ? unitUsd / market.priceUsd : null;

  const uniUrl = buildUniswapSwapUrl({ inputCurrency: input.uniToken, amount: amt });
  const busy = status.kind === "quoting" || status.kind === "approving" || status.kind === "swapping";

  async function fetchQuote(): Promise<ZeroxQuote> {
    const qs = new URLSearchParams({
      sellToken: input.zeroxToken,
      sellAmount: sellWei!.toString(),
      taker: address!,
      slippageBps: String(slippageBps),
    });
    const res = await fetch(`/api/gitc/swap/quote?${qs.toString()}`);
    const q = (await res.json()) as ZeroxQuote;
    if (!res.ok && !q.disabled) throw new Error(q.error || "Could not get a quote");
    return q;
  }

  async function handleExchange() {
    if (!isConnected || !address) { open(); return; }
    if (!sellWei || !publicClient || insufficient) return;
    setStatus({ kind: "quoting" });
    try {
      // Make sure the wallet is on Base before quoting/sending.
      if (chainId !== base.id) {
        await switchChainAsync({ chainId: base.id });
      }

      let q = await fetchQuote();
      if (q.disabled) {
        setPrice((p) => ({ ...p, nativeAvailable: false }));
        setStatus({ kind: "idle" });
        return;
      }
      if (q.liquidityAvailable === false || !q.transaction) {
        setStatus({ kind: "error", message: "No liquidity for this trade. Try a smaller amount or raise slippage." });
        return;
      }

      // ERC20 inputs need a one-time allowance to the 0x AllowanceHolder.
      const allowance = q.issues?.allowance;
      if (!isEth && allowance?.spender && BigInt(allowance.actual ?? "0") < sellWei) {
        setStatus({ kind: "approving" });
        const approveHash = await writeContractAsync({
          address: input.zeroxToken as `0x${string}`,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [allowance.spender, sellWei],
          chainId: base.id,
        });
        await publicClient.waitForTransactionReceipt({ hash: approveHash });
        // Re-quote AFTER approval so the tx we send is fresh (avoids stale-quote reverts).
        setStatus({ kind: "quoting" });
        q = await fetchQuote();
        if (q.liquidityAvailable === false || !q.transaction) {
          setStatus({ kind: "error", message: "Price moved — try again or raise slippage." });
          return;
        }
      }

      setStatus({ kind: "swapping" });
      const received = q.buyAmount ? BigInt(q.buyAmount) : BigInt(0);
      const txHash = await sendTransactionAsync({
        to: q.transaction.to,
        data: q.transaction.data,
        value: BigInt(q.transaction.value ?? "0"),
        chainId: base.id,
      });
      // Hash in hand — show "confirming" with a live BaseScan link.
      setStatus({ kind: "confirming", txHash, received });
      await publicClient.waitForTransactionReceipt({ hash: txHash, confirmations: 2 });
      setStatus({ kind: "done", txHash, received });
      onConfirmed();
      refetchGitc();
    } catch (err) {
      setStatus({ kind: "error", message: friendlyError(err) });
    }
  }

  const ctaLabel =
    !isConnected
      ? "Connect wallet"
      : insufficient
        ? `Insufficient ${input.label}`
        : status.kind === "quoting"
          ? "Getting price…"
          : status.kind === "approving"
            ? `Approve ${input.label}…`
            : status.kind === "swapping"
              ? "Swapping…"
              : "Exchange";

  return (
    <div>
      {/* Header + slippage */}
      <div className="mb-2 flex items-center justify-between">
        <p className="font-pixel text-[10px] text-muted">Buy GITC with USDC or ETH on Base.</p>
        <button
          type="button"
          onClick={() => setShowSlippage((v) => !v)}
          className="font-pixel text-[9px] text-muted hover:text-cream cursor-pointer"
          title="Slippage tolerance"
        >
          ⚙ {slippageBps / 100}%
        </button>
      </div>
      {showSlippage && (
        <div className="mb-2 flex items-center gap-1.5 border-2 border-border bg-bg-raised p-2">
          <span className="font-pixel text-[9px] text-muted">Slippage</span>
          {GITC_SWAP_SLIPPAGE_PRESETS_BPS.map((bps) => {
            const active = bps === slippageBps;
            return (
              <button
                key={bps}
                type="button"
                onClick={() => setSlippageBps(bps)}
                className="btn-press border-2 px-2 py-1 font-pixel text-[9px] cursor-pointer"
                style={{
                  borderColor: active ? GOLD : "var(--color-border)",
                  color: active ? GOLD : "var(--color-muted)",
                  backgroundColor: active ? `${GOLD}14` : "transparent",
                }}
              >
                {bps / 100}%
              </button>
            );
          })}
          <span className="ml-auto font-pixel text-[8px] text-dim">price protection</span>
        </div>
      )}

      {/* Connected wallet — lets the player see & switch which wallet pays. */}
      {isConnected && address && (
        <button
          type="button"
          onClick={() => open({ view: "Account" })}
          className="btn-press mb-2 flex w-full items-center justify-between border-2 border-border bg-bg-raised px-2.5 py-1.5 cursor-pointer"
          title="Manage or switch wallet"
        >
          <span className="flex items-center gap-1.5 text-[9px] text-dim">
            <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: chainId === base.id ? "#39d353" : DEAD }} />
            {chainId === base.id ? "Connected" : "Wrong network"}
          </span>
          <span className="font-pixel text-[9px] text-muted">
            {address.slice(0, 6)}…{address.slice(-4)} · switch
          </span>
        </button>
      )}

      <div className="border-2 bg-bg-raised p-3" style={{ borderColor: `${GOLD}66` }}>
        {/* You pay */}
        <div className="border-2 border-border bg-bg p-3">
          <p className="mb-1.5 font-pixel text-[9px] text-muted">YOU PAY</p>
          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setSellId((id) => (id === "USDC" ? "ETH" : "USDC"))}
              className="btn-press flex items-center gap-1.5 border-2 border-border px-2 py-1.5 font-pixel text-[10px] text-cream cursor-pointer"
              title="Switch token to sell"
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: input.dot }} />
              {input.label}
              <span className="text-dim">▾</span>
            </button>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => onAmountChange(e.target.value)}
              placeholder="0.00"
              className="w-0 flex-1 bg-transparent text-right font-pixel text-lg outline-none"
              style={{ color: insufficient ? DEAD : "var(--color-cream)" }}
            />
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px]">
            <span className="flex items-center gap-1.5 text-dim">
              {balanceWei !== null ? (
                <>
                  <span style={insufficient ? { color: DEAD } : undefined}>Balance {fmtBalance(balanceWei, input.decimals)}</span>
                  {balanceWei > BigInt(0) && (
                    <button type="button" onClick={setMax} className="font-pixel text-[8px] underline hover:text-cream cursor-pointer" style={{ color: GOLD }}>
                      MAX
                    </button>
                  )}
                </>
              ) : isEth && !ethUsd ? (
                "loading price…"
              ) : (
                ""
              )}
            </span>
            <span className="text-dim">{sellUsd !== null ? `≈ ${fmtUsd(sellUsd)}` : ""}</span>
          </div>
        </div>

        {/* Direction (buy-only in v1) */}
        <div className="my-1 flex justify-center">
          <span className="flex h-6 w-6 items-center justify-center border-2 border-border bg-bg font-pixel text-[10px]" style={{ color: GOLD }}>↓</span>
        </div>

        {/* You get */}
        <div className="border-2 border-border bg-bg p-3">
          <p className="mb-1.5 font-pixel text-[9px] text-muted">YOU GET</p>
          <div className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 font-pixel text-[10px]" style={{ color: GOLD }}>
              <CurrencyIcon currency="gitc" size={13} /> GITC
            </span>
            <span className="font-pixel text-lg text-cream">
              {price.loading ? "…" : gitcOut !== null ? `~${fmtGitc(gitcOut)}` : "—"}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-dim">
            <span>{gitcBalance !== null ? `Balance ${fmtGitc(Number(formatUnits(gitcBalance, 18)))} GITC` : ""}</span>
            <span>{sellUsd !== null ? `≈ ${fmtUsd(sellUsd)}` : ""}</span>
          </div>
        </div>

        {/* Rate / warnings */}
        <p className="mt-2 text-center text-[9px] text-dim">
          {rateGitc !== null
            ? `1 ${input.label} ≈ ${fmtGitc(rateGitc)} GITC`
            : market.priceUsd
              ? `GITC at ${fmtPrice(market.priceUsd)}`
              : "Live rate at swap time"}
        </p>
        {price.noLiquidity && (
          <p className="mt-1 text-center text-[9px]" style={{ color: DEAD }}>
            Low liquidity at this size — try a smaller amount or raise slippage.
          </p>
        )}

        {/* CTA */}
        {!price.nativeAvailable ? (
          <>
            <a
              href={uniUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press mt-2 flex w-full items-center justify-center gap-1.5 border-2 py-2.5 font-pixel text-[10px] cursor-pointer"
              style={{ borderColor: GOLD, color: "#1a1208", backgroundColor: GOLD, boxShadow: `2px 2px 0 0 ${GOLD_DEEP}` }}
            >
              Swap on Uniswap <span aria-hidden>↗</span>
            </a>
            <p className="mt-1.5 text-center text-[9px] text-dim">Opens Uniswap on Base · the in-city swap turns on once configured.</p>
          </>
        ) : status.kind === "confirming" ? (
          <div className="mt-2 flex flex-col items-center gap-1.5 border-2 px-3 py-2.5" style={{ borderColor: GOLD, backgroundColor: `${GOLD}10` }}>
            <span className="font-pixel text-[10px]" style={{ color: GOLD }}>Confirming on Base…</span>
            <span className="text-[9px] text-dim normal-case">This usually takes a few seconds.</span>
            <a href={`https://basescan.org/tx/${status.txHash}`} target="_blank" rel="noopener noreferrer" className="text-[9px] underline normal-case hover:text-cream" style={{ color: GOLD }}>
              View transaction on BaseScan ↗
            </a>
          </div>
        ) : status.kind === "done" ? (
          <div className="mt-2 flex flex-col gap-2 border-2 px-3 py-3" style={{ borderColor: GOLD, backgroundColor: `${GOLD}14` }}>
            <p className="text-center font-pixel text-[10px]" style={{ color: GOLD }}>
              ✓ Received ~{fmtGitc(Number(formatUnits(status.received, 18)))} GITC
            </p>
            {gitcBalance !== null && (
              <p className="text-center text-[9px] text-dim normal-case">
                Wallet balance: {fmtGitc(Number(formatUnits(gitcBalance, 18)))} GITC
              </p>
            )}
            {onConvertToPixels && (
              <button type="button" onClick={onConvertToPixels}
                className="btn-press w-full py-2.5 font-pixel text-[10px] cursor-pointer"
                style={{ borderColor: GOLD, color: "#1a1208", backgroundColor: GOLD, boxShadow: `2px 2px 0 0 ${GOLD_DEEP}` }}>
                Convert to Pixels →
              </button>
            )}
            <div className="flex gap-2">
              <a href={`https://basescan.org/tx/${status.txHash}`} target="_blank" rel="noopener noreferrer"
                className="btn-press flex-1 border-2 border-border py-2 text-center text-[9px] text-muted normal-case hover:text-cream cursor-pointer">
                BaseScan ↗
              </a>
              <button type="button" onClick={addGitcToWallet}
                className="btn-press flex-1 border-2 border-border py-2 text-center text-[9px] text-muted normal-case hover:text-cream cursor-pointer">
                Add to wallet
              </button>
            </div>
            <button type="button" onClick={() => setStatus({ kind: "idle" })} className="text-center text-[9px] text-muted underline normal-case cursor-pointer">
              New swap
            </button>
          </div>
        ) : status.kind === "error" ? (
          <div className="mt-2 flex flex-col gap-1.5">
            <div className="border-2 px-3 py-2 text-center text-[10px] normal-case" style={{ borderColor: DEAD, color: DEAD, backgroundColor: `${DEAD}10` }}>
              {status.message}
            </div>
            <button type="button" onClick={() => setStatus({ kind: "idle" })} className="text-[9px] text-muted underline normal-case cursor-pointer">
              Try again
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleExchange}
            disabled={busy || (isConnected && (!sellWei || gitcOut === null || insufficient || price.noLiquidity))}
            className="btn-press mt-2 flex w-full items-center justify-center gap-1.5 border-2 py-2.5 font-pixel text-[10px] disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer"
            style={{ borderColor: GOLD, color: "#1a1208", backgroundColor: GOLD, boxShadow: `2px 2px 0 0 ${GOLD_DEEP}` }}
          >
            {ctaLabel}
          </button>
        )}
        {busy && (
          <p className="mt-1.5 text-center text-[9px] text-dim">
            {status.kind === "approving" ? "Approve in your wallet, then we’ll swap automatically." : status.kind === "swapping" ? "Confirm in your wallet…" : "Fetching the best price…"}
          </p>
        )}
        <p className="mt-1.5 text-center text-[9px] text-dim">
          GITC on Base · {GITC_ADDRESS.slice(0, 6)}…{GITC_ADDRESS.slice(-4)}
        </p>
      </div>
    </div>
  );
}
