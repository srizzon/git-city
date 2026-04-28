import { cookieStorage, createStorage } from "wagmi";
import { WagmiAdapter } from "@reown/appkit-adapter-wagmi";
import { base } from "@reown/appkit/networks";

export const reownProjectId = process.env.NEXT_PUBLIC_REOWN_PROJECT_ID ?? "";

export const supportedNetworks = [base] as const;

export const wagmiAdapter = new WagmiAdapter({
  storage: createStorage({ storage: cookieStorage }),
  ssr: true,
  projectId: reownProjectId || "missing-reown-project-id",
  networks: [...supportedNetworks],
});

export const wagmiConfig = wagmiAdapter.wagmiConfig;
