import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import NotificationSettings from "./NotificationSettings";

export const metadata: Metadata = {
  title: "Settings - Git City",
};

export default async function SettingsPage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/api/auth/github?redirect=/settings");
  }

  return (
    <Suspense>
      <NotificationSettings />
    </Suspense>
  );
}
