"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

const ACCENT = "#c8e64a";

const NAV_ITEMS = [
  { href: "/ads/dashboard", label: "Overview" },
  { href: "/ads/dashboard/integration", label: "Integration" },
  { href: "/ads/dashboard/api-keys", label: "API Keys" },
  { href: "/ads/dashboard/billing", label: "Billing" },
];

interface Props {
  advertiser: { email: string; name: string | null };
}

export function DashboardNav({ advertiser }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/ads/auth/logout", { method: "POST" });
    router.push("/ads/login");
  }

  return (
    <nav className="border-b-[3px] border-border bg-bg">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/ads/dashboard" className="text-base text-cream">
            Git City <span style={{ color: ACCENT }}>Ads</span>
          </Link>
          <div className="hidden items-center gap-5 sm:flex">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href ||
                (item.href !== "/ads/dashboard" && pathname.startsWith(item.href));
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="text-xs transition-colors"
                  style={{ color: isActive ? ACCENT : "var(--color-muted)" }}
                >
                  {item.label}
                </Link>
              );
            })}
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="hidden text-xs text-muted normal-case sm:block">
            {advertiser.email}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="text-xs text-muted transition-colors hover:text-cream"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
