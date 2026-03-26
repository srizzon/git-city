import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import MyApplicationsClient from "./MyApplicationsClient";

export const metadata: Metadata = {
  title: "My Applications - Git City Jobs",
};

export default async function MyApplicationsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/api/auth/github?redirect=/jobs/my-applications");
  }

  return <MyApplicationsClient />;
}
