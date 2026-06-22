"use client";

import { type ReactNode, useState } from "react";
import { WagmiProvider, type Config, cookieToInitialState } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createAppKit } from "@reown/appkit/react";
import { base } from "@reown/appkit/networks";
import { reownProjectId, wagmiAdapter, wagmiConfig } from "@/lib/wagmi-config";

const metadata = {
  name: "Git City",
  description: "3D pixel art city built from real GitHub data.",
  url: "https://thegitcity.com",
  icons: ["https://thegitcity.com/apple-icon.png"],
};

if (typeof window !== "undefined") {
  if (!reownProjectId) {
    console.warn(
      "[Web3] NEXT_PUBLIC_REOWN_PROJECT_ID is not set. Wallet connect modal will fail to open. Get a free project ID at https://dashboard.reown.com",
    );
  } else {
    createAppKit({
      adapters: [wagmiAdapter],
      projectId: reownProjectId,
      networks: [base],
      defaultNetwork: base,
      metadata,
      features: {
        analytics: false,
        email: false,
        socials: false,
        // In-app fiat on-ramp (card/Apple Pay via Coinbase Pay) and token
        // swaps. Both default to true, but we set them explicitly so the
        // in-city Bank panel can rely on them being present.
        onramp: true,
        swaps: true,
      },
      themeMode: "dark",
      themeVariables: {
        "--w3m-accent": "#c8e64a",
        "--w3m-color-mix": "#c8e64a",
        "--w3m-color-mix-strength": 10,
      },
    });
  }
}

function sanitizeWagmiCookie(cookie: string | null): string | null {
  if (!cookie) return cookie;
  return cookie
    .split("; ")
    .map((kv) => {
      const eq = kv.indexOf("=");
      if (eq === -1) return kv;
      const key = kv.slice(0, eq);
      const val = kv.slice(eq + 1);
      if (!key.endsWith("wagmi.store")) return kv;
      if (!val.startsWith("%")) return kv;
      try {
        return `${key}=${decodeURIComponent(val)}`;
      } catch {
        return `${key}=`;
      }
    })
    .join("; ");
}

export function Web3Provider({
  children,
  cookies,
}: {
  children: ReactNode;
  /**
   * SSR cookie header for hydration. Omit when mounting client-side (e.g. the
   * in-city Bank panel) and we fall back to `document.cookie`.
   */
  cookies?: string | null;
}) {
  const [queryClient] = useState(() => new QueryClient());
  const cookieSource =
    cookies !== undefined
      ? cookies
      : typeof document !== "undefined"
        ? document.cookie
        : null;
  let initialState: ReturnType<typeof cookieToInitialState> | undefined;
  try {
    initialState = cookieToInitialState(wagmiConfig as Config, sanitizeWagmiCookie(cookieSource));
  } catch {
    initialState = undefined;
  }

  return (
    <WagmiProvider config={wagmiConfig as Config} initialState={initialState}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
