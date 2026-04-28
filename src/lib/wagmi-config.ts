import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { base } from "@reown/appkit/networks";
import { http, fallback } from "viem";

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const supportedNetworks = [base] as const;

/**
 * Browser-side RPC for Base.
 *
 * We avoid Reown's bundled RPC (rpc.walletconnect.org) because it requires
 * domain-allowlist auth that fails inconsistently across preview deploys.
 * Instead we use:
 *   1. Alchemy if NEXT_PUBLIC_ALCHEMY_API_KEY is provided (best uptime)
 *   2. Base official public RPC (mainnet.base.org)
 *   3. Ankr public RPC (last-resort fallback)
 *
 * `fallback()` rotates through these on failure so any single outage is
 * absorbed automatically.
 */
const publicAlchemyKey = process.env.NEXT_PUBLIC_ALCHEMY_API_KEY;

const baseTransport = fallback([
  ...(publicAlchemyKey
    ? [http(`https://base-mainnet.g.alchemy.com/v2/${publicAlchemyKey}`)]
    : []),
  http("https://mainnet.base.org"),
  http("https://rpc.ankr.com/base"),
]);

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: reownProjectId || "missing-reown-project-id",
  networks: [...supportedNetworks],
  transports: {
    [base.id]: baseTransport,
  },
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
