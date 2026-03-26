import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getAdvertiserFromCookies } from "@/lib/advertiser-auth";
import PostJobForm from "./PostJobForm";

export const metadata: Metadata = {
  title: "Post a Job - Git City Jobs",
};

export default async function PostJobPage() {
  const advertiser = await getAdvertiserFromCookies();
  if (!advertiser) {
    redirect("/business/login?redirect=/jobs/dashboard/new");
  }

  return <PostJobForm />;
}
