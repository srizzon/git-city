import { headers } from "next/headers";
import { Web3Provider } from "@/components/Web3Provider";

/**
 * Web3 (Wagmi + Reown AppKit) is only loaded on routes that need it.
 * Pixels store accepts GITC for packages.
 */
export default async function PixelsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const h = await headers();
  const cookieHeader = h.get("cookie");
  return <Web3Provider cookies={cookieHeader}>{children}</Web3Provider>;
}
