import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createServerSupabase } from "@/lib/supabase-server";
import { isAdminGithubLogin } from "@/lib/admin";

/**
 * Who is signed in, from data the user can't edit.
 *
 * Never trust user.user_metadata for identity: any signed-in user can rewrite
 * it with supabase.auth.updateUser({ data }), and the JWT carries the forged
 * value until their next OAuth sign-in. The GitHub identity's identity_data is
 * written only by GoTrue from the provider, and developers.claimed_by holds
 * the auth user id, so those are the two sources used here.
 */

function identityLogin(data: unknown): string {
  const d = data as { user_name?: unknown; preferred_username?: unknown } | null | undefined;
  const login = typeof d?.user_name === "string" ? d.user_name : typeof d?.preferred_username === "string" ? d.preferred_username : "";
  return login.toLowerCase();
}

/** Every GitHub login the user has signed in with (a user can link two accounts). */
export function githubLoginsFromIdentities(user: User | null | undefined): string[] {
  return (user?.identities ?? [])
    .filter((i) => i.provider === "github")
    .map((i) => identityLogin(i.identity_data))
    .filter(Boolean);
}

/**
 * The user's GitHub login (lowercased), or "". With two linked GitHub
 * accounts, the one they last signed in with: metadata may pick among the
 * user's own identities, never name someone else.
 */
export function githubLoginFromIdentity(user: User | null | undefined): string {
  const logins = githubLoginsFromIdentities(user);
  if (logins.length <= 1) return logins[0] ?? "";
  const meta = identityLogin(user?.user_metadata);
  return logins.includes(meta) ? meta : logins[0];
}

/** The verified auth user (getUser round-trips to Auth; getClaims has no identities). */
export async function getAuthUser(supabase?: SupabaseClient): Promise<User | null> {
  const sb = supabase ?? (await createServerSupabase());
  const {
    data: { user },
  } = await sb.auth.getUser();
  return user ?? null;
}

/** The signed-in user plus their GitHub login from the identity, or null. */
export async function getAuthIdentity(supabase?: SupabaseClient): Promise<{ user: User; login: string } | null> {
  const user = await getAuthUser(supabase);
  if (!user) return null;
  return { user, login: githubLoginFromIdentity(user) };
}

/**
 * The developer row the signed-in user has claimed (developers.claimed_by =
 * auth user id), or null. `columns` is passed to select().
 */
export async function getAuthedDeveloper<T extends { id: number } = { id: number; github_login: string; claimed: boolean }>(
  columns = "id, github_login, claimed",
  supabase?: SupabaseClient,
): Promise<{ user: User; login: string; dev: T } | null> {
  const identity = await getAuthIdentity(supabase);
  if (!identity) return null;
  // A user with two linked GitHub accounts can own two buildings; prefer the
  // one matching the login they signed in with.
  const { data } = await getSupabaseAdmin()
    .from("developers")
    .select(columns)
    .eq("claimed_by", identity.user.id)
    .order("claimed_at", { ascending: true })
    .limit(5);
  const rows = (data ?? []) as unknown as (T & { github_login?: string })[];
  if (rows.length === 0) return null;
  const dev = rows.find((r) => r.github_login?.toLowerCase() === identity.login) ?? rows[0];
  return { ...identity, dev };
}

/** Site admin check against ADMIN_GITHUB_LOGINS, using the GitHub identities. */
export function isAdminUser(user: User | null | undefined): boolean {
  return githubLoginsFromIdentities(user).some((login) => isAdminGithubLogin(login));
}
