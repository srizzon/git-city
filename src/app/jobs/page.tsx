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

  return <Suspense><JobBoardClient username={username} /></Suspense>;
}
