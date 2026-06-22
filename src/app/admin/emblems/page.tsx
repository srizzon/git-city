import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";
import EmblemsAdmin from "@/components/EmblemsAdmin";

export default async function AdminEmblemsPage() {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");
  if (!isAdminGithubLogin(getGithubLoginFromUser(user))) redirect("/");

  return <EmblemsAdmin />;
}
