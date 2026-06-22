import "server-only";
import { createPublicClient, http, fallback, parseEventLogs, getAddress } from "viem";
import { base } from "viem/chains";
import {
  GITC_ABI,
  GITC_ADDRESS,
  GITC_CHAIN_ID,
  GITC_DECIMALS,
  GITC_DISCOUNT_BPS,
  GITC_MIN_CONFIRMATIONS,
  GITC_SLIPPAGE_BPS,
  GITC_SWAP_DEFAULT_SLIPPAGE_BPS,
  GITC_TREASURY_ADDRESS,
  NATIVE_ETH_SENTINEL,
  USDC_BASE_ADDRESS,
  assertTreasuryConfigured,
} from "./gitc";

let cachedClient: ReturnType<typeof buildClient> | null = null;

function buildClient() {
  const transports = [];

  const alchemyKey = process.env.ALCHEMY_API_KEY;
  if (alchemyKey) {
    transports.push(http(`https://base-mainnet.g.alchemy.com/v2/${alchemyKey}`));
  }

  const ankrKey = process.env.ANKR_API_KEY;
  transports.push(http(ankrKey ? `https://rpc.ankr.com/base/${ankrKey}` : "https://rpc.ankr.com/base"));

  // Final fallback: Base public RPC (rate-limited, last resort).
  transports.push(http("https://mainnet.base.org"));

  return createPublicClient({
    chain: base,
    transport: fallback(transports, { rank: false }),
  });
}

export function getBaseClient() {
  if (!cachedClient) cachedClient = buildClient();
  return cachedClient;
}

/** Fetch the current head block number on Base. Used to anchor a quote. */
export async function getCurrentBaseBlock(): Promise<bigint> {
  return getBaseClient().getBlockNumber();
}

interface PriceCache {
  price: number;
  fetchedAt: number;
}
const PRICE_TTL_MS = 30_000;
let priceCache: PriceCache | null = null;

async function fetchFromGeckoTerminal(): Promise<number | null> {
  try {
    const url = `https://api.geckoterminal.com/api/v2/simple/networks/base/token_price/${GITC_ADDRESS}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      data?: { attributes?: { token_prices?: Record<string, string> } };
    };
    const raw = json.data?.attributes?.token_prices?.[GITC_ADDRESS.toLowerCase()];
    const price = raw ? Number(raw) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

async function fetchFromDexScreener(): Promise<number | null> {
  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${GITC_ADDRESS}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (!res.ok) return null;
    const json = (await res.json()) as {
      pairs?: Array<{ chainId?: string; priceUsd?: string; liquidity?: { usd?: number } }>;
    };
    // Prefer Base pair with highest liquidity.
    const basePairs = (json.pairs ?? []).filter((p) => p.chainId === "base");
    if (basePairs.length === 0) return null;
    basePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
    const top = basePairs[0];
    const price = top.priceUsd ? Number(top.priceUsd) : NaN;
    return Number.isFinite(price) && price > 0 ? price : null;
  } catch {
    return null;
  }
}

/**
 * Fetch GITC USD price (cached 30s).
 * Tries GeckoTerminal first, falls back to DexScreener.
 * Throws if both sources fail.
 */
export async function getGitcPriceUsd(): Promise<number> {
  if (priceCache && Date.now() - priceCache.fetchedAt < PRICE_TTL_MS) {
    return priceCache.price;
  }

  let price = await fetchFromGeckoTerminal();
  if (price === null) {
    price = await fetchFromDexScreener();
  }
  if (price === null) {
    throw new Error("Could not fetch GITC price from any source");
  }

  priceCache = { price, fetchedAt: Date.now() };
  return price;
}

export interface GitcMarket {
  priceUsd: number | null;
  /** 24h price change in percent (e.g. -3.2 for -3.2%). Null if unavailable. */
  change24h: number | null;
}

interface MarketCache {
  market: GitcMarket;
  fetchedAt: number;
}
let marketCache: MarketCache | null = null;

/**
 * Fetch the GITC market snapshot (price + 24h change) for the bank ticker and
 * the wallet panel. DexScreener exposes `priceChange.h24` on the Base pair, so
 * we read both from there in one call. If DexScreener is unavailable we fall
 * back to the price-only sources (`getGitcPriceUsd`) and report `change24h`
 * as null. Never throws — returns `{ priceUsd: null, change24h: null }` when
 * every source fails, which the ticker/chip render gracefully.
 */
export async function getGitcMarket(): Promise<GitcMarket> {
  if (marketCache && Date.now() - marketCache.fetchedAt < PRICE_TTL_MS) {
    return marketCache.market;
  }

  let market: GitcMarket = { priceUsd: null, change24h: null };

  try {
    const url = `https://api.dexscreener.com/latest/dex/tokens/${GITC_ADDRESS}`;
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      next: { revalidate: 30 },
    });
    if (res.ok) {
      const json = (await res.json()) as {
        pairs?: Array<{
          chainId?: string;
          priceUsd?: string;
          priceChange?: { h24?: number };
          liquidity?: { usd?: number };
        }>;
      };
      const basePairs = (json.pairs ?? []).filter((p) => p.chainId === "base");
      basePairs.sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
      const top = basePairs[0];
      if (top) {
        const price = top.priceUsd ? Number(top.priceUsd) : NaN;
        const change = top.priceChange?.h24;
        market = {
          priceUsd: Number.isFinite(price) && price > 0 ? price : null,
          change24h: typeof change === "number" && Number.isFinite(change) ? change : null,
        };
      }
    }
  } catch {
    /* fall through to price-only fallback */
  }

  // If DexScreener gave no price, fall back to the cached/Gecko price source.
  if (market.priceUsd === null) {
    try {
      market = { priceUsd: await getGitcPriceUsd(), change24h: market.change24h };
    } catch {
      /* keep nulls */
    }
  }

  marketCache = { market, fetchedAt: Date.now() };
  return market;
}

/**
 * Convert a USD cents amount into GITC wei, applying:
 *   - the configured discount (cheaper to pay in GITC)
 *   - a slippage buffer (in case the price moves during the quote window)
 */
export async function quoteGitcWeiForUsdCents(usdCents: number): Promise<{
  gitcAmountWei: bigint;
  gitcPriceUsd: number;
  discountBps: number;
}> {
  const priceUsd = await getGitcPriceUsd();

  const discountedUsd = (usdCents / 100) * (1 - GITC_DISCOUNT_BPS / 10_000);
  const gitcTokens = discountedUsd / priceUsd;
  const bufferedTokens = gitcTokens * (1 + GITC_SLIPPAGE_BPS / 10_000);

  const wei = BigInt(Math.ceil(bufferedTokens * 10 ** GITC_DECIMALS));

  return {
    gitcAmountWei: wei,
    gitcPriceUsd: priceUsd,
    discountBps: GITC_DISCOUNT_BPS,
  };
}

// ─── 0x Swap API v2 (AllowanceHolder) ────────────────────────
// Native USDC/ETH → GITC swaps on Base. The API key is server-only, so the
// browser talks to our proxy routes (/api/gitc/swap/{price,quote}) which inject
// the key and force chainId + buyToken so the proxy can't be used as a generic
// 0x relay.

/** True when a 0x API key is configured (enables the native in-city swap). */
export function is0xEnabled(): boolean {
  return !!process.env.ZEROX_API_KEY;
}

const ZEROX_BASE = "https://api.0x.org/swap/allowance-holder";
const ALLOWED_SELL_TOKENS = new Set([
  USDC_BASE_ADDRESS.toLowerCase(),
  NATIVE_ETH_SENTINEL.toLowerCase(),
]);

export type ZeroxResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; error: string };

/**
 * Proxy a /price (indicative) or /quote (firm, returns a ready-to-send tx) call
 * to 0x for a USDC|ETH → GITC swap on Base. Validates and pins the dangerous
 * params (chainId, buyToken, sellToken whitelist) server-side.
 */
export async function fetchZeroxSwap(
  kind: "price" | "quote",
  params: { sellToken: string; sellAmount: string; taker?: string; slippageBps?: string },
): Promise<ZeroxResult> {
  const apiKey = process.env.ZEROX_API_KEY;
  if (!apiKey) return { ok: false, status: 503, error: "disabled" };

  if (!ALLOWED_SELL_TOKENS.has(params.sellToken.toLowerCase())) {
    return { ok: false, status: 400, error: "Unsupported sell token" };
  }
  if (!/^\d+$/.test(params.sellAmount) || params.sellAmount === "0") {
    return { ok: false, status: 400, error: "Invalid sell amount" };
  }

  const slippage =
    params.slippageBps && /^\d+$/.test(params.slippageBps)
      ? params.slippageBps
      : String(GITC_SWAP_DEFAULT_SLIPPAGE_BPS);

  const qs = new URLSearchParams({
    chainId: String(GITC_CHAIN_ID),
    sellToken: params.sellToken,
    buyToken: GITC_ADDRESS,
    sellAmount: params.sellAmount,
    slippageBps: slippage,
  });

  const takerValid = params.taker && /^0x[a-fA-F0-9]{40}$/.test(params.taker);
  if (takerValid) qs.set("taker", params.taker!);
  // A firm quote needs a taker to build the transaction.
  if (kind === "quote" && !takerValid) {
    return { ok: false, status: 400, error: "A connected wallet is required to quote" };
  }

  try {
    const res = await fetch(`${ZEROX_BASE}/${kind}?${qs.toString()}`, {
      headers: { "0x-api-key": apiKey, "0x-version": "v2" },
    });
    const data = (await res.json().catch(() => ({}))) as { message?: string; reason?: string };
    if (!res.ok) {
      return { ok: false, status: res.status, error: data.message || data.reason || `0x ${kind} failed` };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, status: 502, error: "Could not reach the swap service" };
  }
}

export interface PaymentVerification {
  ok: boolean;
  reason?: string;
  paidAmountWei?: bigint;
  blockNumber?: bigint;
}

/**
 * Verify that a tx hash represents a valid GITC transfer from the given wallet
 * to the Git City treasury for at least the expected amount, AFTER the quote
 * was issued (anti-replay).
 */
export async function verifyGitcPaymentTx(params: {
  txHash: `0x${string}`;
  expectedWallet: string;
  minAmountWei: bigint;
  /** Block number at quote creation. tx must have been mined at or after this. */
  minBlockNumber: bigint;
}): Promise<PaymentVerification> {
  assertTreasuryConfigured();

  const client = getBaseClient();

  let receipt;
  try {
    receipt = await client.getTransactionReceipt({ hash: params.txHash });
  } catch {
    return { ok: false, reason: "Transaction not found yet" };
  }

  if (receipt.status !== "success") {
    return { ok: false, reason: "Transaction reverted" };
  }

  // Anti-replay: tx must be at or after the block when the quote was issued.
  if (receipt.blockNumber < params.minBlockNumber) {
    return { ok: false, reason: "Transaction predates the quote" };
  }

  // Confirmations check (defends against shallow reorgs).
  // Grace period: wait up to ~12s for new blocks to accumulate before
  // rejecting. Base mints a block every ~2s, so this is enough to absorb
  // the timing race between frontend "got receipt" and backend "checks
  // confirmations". Without this we'd reject a tx that's just a couple
  // hundred ms shy of the threshold.
  let head = await client.getBlockNumber();
  let confirmations = head - receipt.blockNumber + BigInt(1);
  for (let i = 0; i < 6 && confirmations < GITC_MIN_CONFIRMATIONS; i++) {
    await new Promise((resolve) => setTimeout(resolve, 2000));
    head = await client.getBlockNumber();
    confirmations = head - receipt.blockNumber + BigInt(1);
  }
  if (confirmations < GITC_MIN_CONFIRMATIONS) {
    return { ok: false, reason: "Awaiting confirmations" };
  }

  const transferLogs = parseEventLogs({
    abi: GITC_ABI,
    eventName: "Transfer",
    logs: receipt.logs,
  });

  const expectedFrom = getAddress(params.expectedWallet);
  const expectedTo = getAddress(GITC_TREASURY_ADDRESS);
  const gitcAddress = getAddress(GITC_ADDRESS);

  const payment = transferLogs.find((log) => {
    if (getAddress(log.address) !== gitcAddress) return false;
    if (getAddress(log.args.from) !== expectedFrom) return false;
    if (getAddress(log.args.to) !== expectedTo) return false;
    return true;
  });

  if (!payment) {
    return { ok: false, reason: "No GITC transfer to treasury from the expected wallet" };
  }

  if (payment.args.value < params.minAmountWei) {
    return {
      ok: false,
      reason: `Paid ${payment.args.value} < expected ${params.minAmountWei}`,
    };
  }

  return {
    ok: true,
    paidAmountWei: payment.args.value,
    blockNumber: receipt.blockNumber,
  };
}
