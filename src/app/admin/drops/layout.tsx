import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";
import { getGithubLoginFromUser, isAdminGithubLogin } from "@/lib/admin";

export default async function AdminDropsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const login = getGithubLoginFromUser(user);
  if (!isAdminGithubLogin(login)) redirect("/");

  return <>{children}</>;
}
