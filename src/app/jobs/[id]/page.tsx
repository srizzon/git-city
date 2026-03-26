import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import JobDetailClient from "./JobDetailClient";

export const metadata: Metadata = {
  title: "Job - Git City",
};

interface Props {
  params: Promise<{ id: string }>;
}

export default async function JobDetailPage({ params }: Props) {
  const { id } = await params;
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/api/auth/github?redirect=/jobs/${id}`);
  }

  return <JobDetailClient listingId={id} />;
}
