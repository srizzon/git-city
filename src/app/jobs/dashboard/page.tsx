import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import DashboardClient from "./DashboardClient";

export const metadata: Metadata = {
  title: "Company Dashboard - Git City Jobs",
};

export default async function DashboardPage() {
  const advertiser = await getAdvertiserFromCookies();

  if (!advertiser) {
    redirect("/business/login?redirect=/jobs/dashboard");
  }

  return <DashboardClient advertiserEmail={advertiser.email} />;
}
