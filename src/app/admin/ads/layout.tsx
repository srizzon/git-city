import { redirect } from "next/navigation";
import { createServerSupabase } from "@/lib/supabase-server";

const OWNER_LOGIN = "srizzon";

export default async function AdminAdsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/");

  const login = (
    user.user_metadata.user_name ??
    user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  if (login !== OWNER_LOGIN) redirect("/");

  return <>{children}</>;
}
