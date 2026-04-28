/**
 * Constants and ABI for accepting GITCITY (GITC) token as payment on Base.
 * https://basescan.org/token/0xd523f92f5f313288cf69ac9ca456b8a7d7a6dba3
 *
 * Payments are received as a plain ERC20 transfer to the Git City treasury
 * wallet. No burn mechanism — the dev rel team's recommendation, and the
 * cleanest path for a product-first project.
 */

export const GITC_ADDRESS = "0xd523f92f5f313288cf69ac9ca456b8a7d7a6dba3" as const;
export const GITC_DECIMALS = 18;
export const GITC_SYMBOL = "GITC";
export const GITC_NAME = "GITCITY";
export const GITC_CHAIN_ID = 8453; // Base mainnet

const PLACEHOLDER_TREASURY = "0x0000000000000000000000000000000000000000" as const;

/**
 * Public Git City treasury wallet on Base.
 *
 * Forks MUST set `NEXT_PUBLIC_GITC_TREASURY_ADDRESS` — otherwise in production
 * we throw at first use to avoid silently routing payments somewhere wrong.
 * In dev the placeholder address is returned and a warning is logged.
 */
export const GITC_TREASURY_ADDRESS: `0x${string}` = (() => {
  const fromEnv = process.env.NEXT_PUBLIC_GITC_TREASURY_ADDRESS;
  if (fromEnv && /^0x[a-fA-F0-9]{40}$/.test(fromEnv)) {
    return fromEnv as `0x${string}`;
  }
  if (process.env.NODE_ENV === "production") {
    // Throwing here would break ALL pages on import, so we defer:
    // any call site that actually needs the treasury (server verification,
    // client write) must call `assertTreasuryConfigured()` first.
    return PLACEHOLDER_TREASURY;
  }
  if (typeof window === "undefined" && fromEnv === undefined) {
    console.warn(
      "[gitc] NEXT_PUBLIC_GITC_TREASURY_ADDRESS is not set; using placeholder. GITC payments will fail until configured.",
    );
  }
  return PLACEHOLDER_TREASURY;
})();

export function isTreasuryConfigured(): boolean {
  return GITC_TREASURY_ADDRESS !== PLACEHOLDER_TREASURY;
}

export function assertTreasuryConfigured(): void {
  if (!isTreasuryConfigured()) {
    throw new Error(
      "NEXT_PUBLIC_GITC_TREASURY_ADDRESS is not configured. Set it in your environment.",
    );
  }
}

/** Discount applied when paying with GITC, in basis points (0 = no discount). */
export const GITC_DISCOUNT_BPS = 0;

/** Slippage buffer applied to the GITC quote to absorb price drift, in basis points. */
export const GITC_SLIPPAGE_BPS = 500; // 5%

/** Quote validity window in seconds. */
export const GITC_QUOTE_TTL_SECONDS = 300; // 5 min

/** Confirmations to wait before activating an ad / crediting pixels. */
export const GITC_MIN_CONFIRMATIONS = BigInt(3);

export const GITC_ABI = [
  {
    type: "function",
    name: "transfer",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
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
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint8" }],
  },
  {
    type: "event",
    name: "Transfer",
    inputs: [
      { name: "from", type: "address", indexed: true },
      { name: "to", type: "address", indexed: true },
      { name: "value", type: "uint256", indexed: false },
    ],
    anonymous: false,
  },
] as const;

/** Format a wei amount to a short human-readable GITC string. */
export function formatGitcAmount(wei: bigint): string {
  const tokens = Number(wei) / 10 ** GITC_DECIMALS;
  if (tokens >= 1_000_000) return `${(tokens / 1_000_000).toFixed(2)}M`;
  if (tokens >= 1_000) return `${(tokens / 1_000).toFixed(2)}K`;
  return tokens.toFixed(2);
}

/** True when GITC payments are wired up (Reown project id + treasury present). */
export function isGitcEnabled(): boolean {
  return !!process.env.NEXT_PUBLIC_REOWN_PROJECT_ID && isTreasuryConfigured();
}
