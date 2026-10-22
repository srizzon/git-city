import { getSupabaseAdmin } from "@/lib/supabase";
import { captureServer } from "@/lib/posthog-server";
import { invalidateLeague } from "@/lib/leagues/cache";

export interface AccountToDelete {
  /** The login (auth user), or null for a building nobody claimed. */
  authUserId: string | null;
  /** Every building to erase: all the ones the login claimed, or the unclaimed one. */
  developers: { id: number; github_login: string }[];
}

// The account behind a building: its login and every building that login claimed.
export async function findAccount(developerId: number): Promise<AccountToDelete | null> {
  const admin = getSupabaseAdmin();
  const { data: dev } = await admin
    .from("developers")
    .select("id, github_login, claimed_by")
    .eq("id", developerId)
    .maybeSingle();
  if (!dev) return null;
  if (!dev.claimed_by) return { authUserId: null, developers: [{ id: dev.id, github_login: dev.github_login }] };
  const { data: owned } = await admin.from("developers").select("id, github_login").eq("claimed_by", dev.claimed_by);
  return { authUserId: dev.claimed_by, developers: owned ?? [] };
}

// Erases an account. delete_developer_account (183) removes a building and
// every row that points at it in one transaction, so a failure leaves that
// building whole; the login goes last, once no building points at it.
export async function deleteAccount(account: AccountToDelete, via: "self" | "admin"): Promise<boolean> {
  const admin = getSupabaseAdmin();
  // The towns they live in, read before the rows go: their cached maps must forget them now.
  const ids = account.developers.map((d) => d.id);
  const { data: memberships } = await admin.from("league_members").select("league_id").in("developer_id", ids);
  const leagueIds = new Set((memberships ?? []).map((m) => m.league_id as string));

  for (const dev of account.developers) {
    const { error } = await admin.rpc("delete_developer_account", { p_developer_id: dev.id });
    if (error) {
      console.error(`[account-delete] developer ${dev.id} failed`, error);
      return false;
    }
  }
  leagueIds.forEach(invalidateLeague);

  if (account.authUserId) {
    const { error } = await admin.auth.admin.deleteUser(account.authUserId);
    if (error) {
      console.error(`[account-delete] auth user ${account.authUserId} failed`, error);
      return false;
    }
  }

  for (const dev of account.developers) {
    await captureServer(dev.github_login, "account_deleted", { developer_id: dev.id, via });
  }
  return true;
}
