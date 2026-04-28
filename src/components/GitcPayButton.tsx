"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useAccount,
  useDisconnect,
  useReadContract,
  useWriteContract,
  useWaitForTransactionReceipt,
} from "wagmi";
import { base } from "viem/chains";
import { useAppKit } from "@reown/appkit/react";
import {
  GITC_ABI,
  GITC_ADDRESS,
  GITC_DISCOUNT_BPS,
  GITC_TREASURY_ADDRESS,
  formatGitcAmount,
} from "@/lib/gitc";

const ACCENT = "#c8e64a";
const DEAD = "#ff6b6b";

const REOWN_PROJECT_ID = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

interface Recoverable {
  quoteId: string;
  gitcAmountWei: bigint;
  redirect: string;
  wallet: `0x${string}`;
  txHash: `0x${string}`;
}

type Status =
  | { kind: "idle" }
  | { kind: "quoting" }
  | { kind: "ready"; quoteId: string; gitcAmountWei: bigint; redirect: string; wallet: `0x${string}` }
  | { kind: "signing"; quoteId: string; gitcAmountWei: bigint; redirect: string; wallet: `0x${string}` }
  | { kind: "confirming"; quoteId: string; gitcAmountWei: bigint; redirect: string; wallet: `0x${string}`; txHash: `0x${string}` }
  | { kind: "verifying"; quoteId: string; gitcAmountWei: bigint; redirect: string; wallet: `0x${string}`; txHash: `0x${string}` }
  | { kind: "done"; gitcAmountWei: bigint; redirect: string }
  | { kind: "error"; message: string; recoverable?: Recoverable };

export interface GitcQuoteResponse {
  quoteId: string;
  gitcAmountWei: string;
  /** Frontend chooses where to send the user after success. */
  redirectUrl: string;
}

export interface GitcPayButtonProps {
  disabled: boolean;
  /**
   * Async callback that asks the backend for a quote.
   * Receives the connected wallet address; returns the quote payload + final redirect.
   * Return null to silently abort (e.g. validation failed client-side).
   */
  onRequestQuote: (wallet: `0x${string}`) => Promise<GitcQuoteResponse | null>;
  /** Async callback that confirms the on-chain payment with the backend. */
  onConfirm: (params: { quoteId: string; txHash: `0x${string}` }) => Promise<{ ok: boolean; error?: string }>;
  onError?: (message: string) => void;
}

/**
 * Thin guard wrapper. Renders nothing when Reown isn't configured so the
 * underlying hooks (which require an initialized AppKit) are never called.
 */
export function GitcPayButton(props: GitcPayButtonProps) {
  if (!REOWN_PROJECT_ID) return null;
  return <GitcPayButtonInner {...props} />;
}

function GitcPayButtonInner({ disabled, onRequestQuote, onConfirm, onError }: GitcPayButtonProps) {
  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const { data: balanceData } = useReadContract({
    address: GITC_ADDRESS,
    abi: GITC_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: base.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const balance = (balanceData as bigint | undefined) ?? BigInt(0);

  const { writeContractAsync, reset: resetWrite } = useWriteContract();

  const pendingTxHash =
    status.kind === "confirming" || status.kind === "verifying" ? status.txHash : undefined;

  const { data: receipt, isError: receiptError } = useWaitForTransactionReceipt({
    hash: pendingTxHash,
    confirmations: 3,
    chainId: base.id,
    query: { enabled: !!pendingTxHash },
  });

  // Reset state if the user switches wallet account mid-flow.
  // Quotes are bound to a specific wallet address server-side, so a switch
  // would otherwise lead to a confirmed-but-unverifiable payment.
  useEffect(() => {
    if (status.kind === "idle" || status.kind === "quoting") return;
    if (status.kind === "done" || status.kind === "error") return;
    if (!address) {
      // wallet disconnected
      resetWrite();
      setStatus({ kind: "idle" });
      return;
    }
    if (status.wallet.toLowerCase() !== address.toLowerCase()) {
      resetWrite();
      setStatus({ kind: "error", message: "Wallet changed. Please start over." });
    }
  }, [address, status, resetWrite]);

  // Once the receipt arrives, ask the backend to verify and activate.
  // We retry transient errors (await confirms, network) automatically so a
  // user who has already paid on-chain doesn't lose their payment to a UI
  // race condition.
  useEffect(() => {
    if (status.kind !== "confirming") return;
    if (receiptError) {
      setStatus({ kind: "error", message: "Transaction failed on-chain" });
      return;
    }
    if (!receipt) return;
    const current = status;
    setStatus({ ...current, kind: "verifying" });

    let cancelled = false;
    const recoverable: Recoverable = {
      quoteId: current.quoteId,
      gitcAmountWei: current.gitcAmountWei,
      redirect: current.redirect,
      wallet: current.wallet,
      txHash: current.txHash,
    };

    const TRANSIENT_PATTERNS = [
      "awaiting confirmation",
      "not found",
      "network",
      "rate limit",
      "timeout",
      "could not confirm",
    ];
    const isTransient = (msg: string) =>
      TRANSIENT_PATTERNS.some((p) => msg.toLowerCase().includes(p));

    const MAX_ATTEMPTS = 8; // ~80s at 10s spacing — covers Base reorgs
    const RETRY_MS = 10_000;

    (async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (cancelled) return;
        try {
          const result = await onConfirm({
            quoteId: current.quoteId,
            txHash: current.txHash,
          });
          if (cancelled) return;
          if (result.ok) {
            setStatus({
              kind: "done",
              gitcAmountWei: current.gitcAmountWei,
              redirect: current.redirect,
            });
            return;
          }
          if (result.error && isTransient(result.error) && attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
            continue;
          }
          setStatus({
            kind: "error",
            message: result.error || "Verification failed",
            recoverable,
          });
          return;
        } catch {
          if (cancelled) return;
          if (attempt < MAX_ATTEMPTS) {
            await new Promise((resolve) => setTimeout(resolve, RETRY_MS));
            continue;
          }
          setStatus({
            kind: "error",
            message: "Network error during verification",
            recoverable,
          });
          return;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [receipt, receiptError, status, onConfirm]);

  const insufficient = useMemo(() => {
    if (status.kind !== "ready" && status.kind !== "signing") return false;
    return balance < status.gitcAmountWei;
  }, [balance, status]);

  async function handleQuote() {
    if (!address) {
      open();
      return;
    }
    setStatus({ kind: "quoting" });
    try {
      const data = await onRequestQuote(address);
      if (!data) {
        setStatus({ kind: "idle" });
        return;
      }
      setStatus({
        kind: "ready",
        quoteId: data.quoteId,
        gitcAmountWei: BigInt(data.gitcAmountWei),
        redirect: data.redirectUrl,
        wallet: address,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not get a quote";
      setStatus({ kind: "error", message: msg });
      onError?.(msg);
    }
  }

  async function handlePay() {
    if (status.kind !== "ready") return;
    const current = status;
    setStatus({ ...current, kind: "signing" });
    try {
      const hash = await writeContractAsync({
        address: GITC_ADDRESS,
        abi: GITC_ABI,
        functionName: "transfer",
        args: [GITC_TREASURY_ADDRESS, current.gitcAmountWei],
        chainId: base.id,
      });
      setStatus({
        kind: "confirming",
        quoteId: current.quoteId,
        gitcAmountWei: current.gitcAmountWei,
        redirect: current.redirect,
        wallet: current.wallet,
        txHash: hash,
      });
    } catch (err) {
      const message = err instanceof Error && err.message.includes("User rejected")
        ? "You rejected the transaction"
        : err instanceof Error && err.message.toLowerCase().includes("chain")
          ? "Switch your wallet to Base network and try again"
          : "Could not submit the transaction";
      setStatus({ kind: "error", message });
    }
  }

  function handleReset() {
    resetWrite();
    setStatus({ kind: "idle" });
  }

  function handleSwitchWallet() {
    resetWrite();
    setStatus({ kind: "idle" });
    disconnect();
  }

  function handleRetryVerification() {
    if (status.kind !== "error" || !status.recoverable) return;
    const r = status.recoverable;
    // Re-enter the confirming state; the verify-effect will pick it up and
    // run the retry loop again against the SAME tx hash. The user does not
    // need to re-pay.
    setStatus({
      kind: "confirming",
      quoteId: r.quoteId,
      gitcAmountWei: r.gitcAmountWei,
      redirect: r.redirect,
      wallet: r.wallet,
      txHash: r.txHash,
    });
  }

  useEffect(() => {
    if (status.kind !== "done") return;
    const t = setTimeout(() => {
      window.location.href = status.redirect;
    }, 1500);
    return () => clearTimeout(t);
  }, [status]);

  const accentButtonStyle = {
    backgroundColor: "transparent",
    border: `2px solid ${ACCENT}`,
    color: ACCENT,
    boxShadow: "4px 4px 0 0 #5a7a00",
  } as const;

  const subtleButtonClass =
    "w-full py-2.5 text-xs text-muted border-2 border-border hover:border-lime hover:text-lime transition-colors disabled:cursor-not-allowed disabled:opacity-40 cursor-pointer";

  const discountLabel = GITC_DISCOUNT_BPS > 0 ? ` -${(GITC_DISCOUNT_BPS / 100).toFixed(0)}%` : "";

  if (status.kind === "done") {
    return (
      <div
        className="border-2 px-3 py-2 text-center text-[10px] normal-case"
        style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: `${ACCENT}10` }}
      >
        ✓ Paid {formatGitcAmount(status.gitcAmountWei)} GITC. Redirecting...
      </div>
    );
  }

  if (status.kind === "error") {
    const recoverable = status.recoverable;
    return (
      <div className="flex flex-col gap-1.5">
        <div
          className="border-2 px-3 py-2 text-center text-[10px] normal-case"
          style={{ borderColor: DEAD, color: DEAD, backgroundColor: `${DEAD}10` }}
        >
          {status.message}
        </div>
        {recoverable && (
          <p className="text-center text-[9px] text-dim normal-case">
            Your payment is on-chain (tx {recoverable.txHash.slice(0, 10)}…). It
            will be credited automatically — retrying verification will not
            charge you again.
          </p>
        )}
        {recoverable ? (
          <>
            <button
              type="button"
              onClick={handleRetryVerification}
              className="btn-press w-full py-2.5 text-xs transition-opacity"
              style={accentButtonStyle}
            >
              Retry verification
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="text-[9px] text-muted underline normal-case"
            >
              Cancel and reset
            </button>
          </>
        ) : (
          <button type="button" onClick={handleReset} className={subtleButtonClass}>
            Try again
          </button>
        )}
      </div>
    );
  }

  if (!isConnected) {
    return (
      <button
        type="button"
        onClick={() => open()}
        disabled={disabled}
        className="btn-press w-full py-2.5 text-xs transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={accentButtonStyle}
      >
        Connect wallet
      </button>
    );
  }

  if (status.kind === "ready" || status.kind === "signing") {
    const shortAddress = status.wallet.slice(0, 6) + "…" + status.wallet.slice(-4);
    return (
      <div className="flex flex-col gap-1.5">
        <div className="border-2 border-border bg-bg-raised px-2.5 py-2 text-[10px] normal-case">
          <div className="flex items-baseline justify-between">
            <span className="text-muted">You pay</span>
            <span style={{ color: ACCENT }} className="text-xs">
              {formatGitcAmount(status.gitcAmountWei)} GITC
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between text-[9px]">
            <span className="text-dim">Balance</span>
            <span className={insufficient ? "" : "text-cream"} style={insufficient ? { color: DEAD } : undefined}>
              {formatGitcAmount(balance)} GITC
            </span>
          </div>
          <div className="mt-0.5 flex items-baseline justify-between text-[9px]">
            <span className="text-dim">Wallet</span>
            <button
              type="button"
              onClick={handleSwitchWallet}
              disabled={status.kind === "signing"}
              className="text-[9px] text-muted underline normal-case hover:text-cream"
              title="Disconnect this wallet and pick another"
            >
              {shortAddress} · switch
            </button>
          </div>
          <p className="mt-2 text-[9px] text-dim">
            Quote valid 5 min · sent to Git City treasury on Base · wallet linked to your account.
          </p>
        </div>
        <button
          type="button"
          onClick={handlePay}
          disabled={status.kind === "signing" || insufficient}
          className="btn-press w-full py-2.5 text-xs transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
          style={accentButtonStyle}
        >
          {status.kind === "signing"
            ? "Confirm in wallet..."
            : insufficient
              ? "Insufficient GITC"
              : `Pay ${formatGitcAmount(status.gitcAmountWei)} GITC`}
        </button>
        {!insufficient && (
          <button
            type="button"
            onClick={handleReset}
            disabled={status.kind === "signing"}
            className="text-[9px] text-muted underline normal-case"
          >
            Cancel
          </button>
        )}
      </div>
    );
  }

  if (status.kind === "confirming" || status.kind === "verifying") {
    return (
      <div
        className="border-2 px-3 py-2 text-center text-[10px] normal-case"
        style={{ borderColor: ACCENT, color: ACCENT, backgroundColor: `${ACCENT}10` }}
      >
        {status.kind === "confirming" ? "Confirming on Base..." : "Verifying..."}
      </div>
    );
  }

  // idle / quoting — connected, awaiting quote request
  const shortConnectedAddress = address
    ? address.slice(0, 6) + "…" + address.slice(-4)
    : "";
  return (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={handleSwitchWallet}
        className="self-end text-[9px] text-muted underline normal-case hover:text-cream"
        title="Disconnect this wallet and pick another"
      >
        {shortConnectedAddress} · switch
      </button>
      <button
        type="button"
        onClick={handleQuote}
        disabled={disabled || status.kind === "quoting"}
        className="btn-press w-full py-2.5 text-xs transition-opacity disabled:cursor-not-allowed disabled:opacity-40"
        style={accentButtonStyle}
      >
        {status.kind === "quoting" ? "Fetching quote..." : `Pay with GITC${discountLabel}`}
      </button>
    </div>
  );
}
