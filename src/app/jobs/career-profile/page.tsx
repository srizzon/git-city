import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import CareerProfileForm from "./CareerProfileForm";

export const metadata: Metadata = {
  title: "Career Profile - Git City Jobs",
};

export default async function CareerProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/api/auth/github?redirect=/jobs/career-profile");
  }

  return (
    <Suspense>
      <CareerProfileForm />
    </Suspense>
  );
}
