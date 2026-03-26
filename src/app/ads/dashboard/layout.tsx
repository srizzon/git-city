import { redirect } from "next/navigation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import { DashboardNav } from "./_components/nav";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) redirect("/business/login?redirect=/ads/dashboard");

  return (
    <main className="min-h-screen bg-bg font-pixel uppercase text-warm">
      <DashboardNav advertiser={advertiser} />
      <div className="mx-auto max-w-5xl px-4 py-6">
        {children}
      </div>
    </main>
  );
}
