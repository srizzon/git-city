import type { Metadata } from "next";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import CareerProfileForm from "./CareerProfileForm";

export const metadata: Metadata = {
  title: "Edit Profile - Git City",
};

export default async function EditProfilePage() {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/api/auth/github?redirect=/hire/edit");
  }

  return (
    <Suspense>
      <CareerProfileForm />
    </Suspense>
  );
}
