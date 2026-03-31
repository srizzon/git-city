import type { Metadata } from "next";
import { Suspense } from "react";
import { createServerSupabase } from "@/lib/supabase-server";
import JobBoardClient from "./JobBoardClient";

export const metadata: Metadata = {
  title: "Developer Jobs - Git City",
  description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs with transparent salaries on Git City.",
  openGraph: {
    title: "Developer Jobs - Git City",
    description: "Real devs. Real jobs. No robots in between. Browse verified remote developer jobs with transparent salaries.",
  },
};

export default async function JobsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  const username = user
    ? (user.user_metadata?.user_name ?? user.user_metadata?.preferred_username ?? "") as string
    : null;

  let hasProfile = false;
  if (user) {
    const { data: dev } = await supabase
      .from("developers")
      .select("id")
      .eq("claimed_by", user.id)
      .maybeSingle();
    if (dev) {
      const { count } = await supabase
        .from("career_profiles")
        .select("id", { count: "exact", head: true })
        .eq("id", dev.id);
      hasProfile = (count ?? 0) > 0;
    }
  }

  return <Suspense><JobBoardClient username={username} hasProfile={hasProfile} /></Suspense>;
}
