import "server-only";
import { createPublicClient, http, fallback, parseEventLogs, getAddress } from "viem";
import { base } from "viem/chains";
import {
  GITC_ABI,
  GITC_ADDRESS,
  GITC_DECIMALS,
  GITC_DISCOUNT_BPS,
  GITC_MIN_CONFIRMATIONS,
  GITC_SLIPPAGE_BPS,
  GITC_TREASURY_ADDRESS,
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
  const head = await client.getBlockNumber();
  const confirmations = head - receipt.blockNumber + BigInt(1);
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
