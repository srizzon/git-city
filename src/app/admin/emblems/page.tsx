import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminUser } from "@/lib/auth-identity";
import EmblemsAdmin from "@/components/EmblemsAdmin";

export default async function AdminEmblemsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");
  if (!isAdminUser(user)) redirect("/");

  return <EmblemsAdmin />;
}
