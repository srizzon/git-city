import { getSupabaseAdmin } from "@/lib/supabase";
import { isAdminGithubLogin } from "@/lib/admin";

let _cachedAdminEmail: string | null | undefined;

/**
 * Get the admin notification email.
 * Priority:
 *   1. ADMIN_NOTIFICATION_EMAIL env var
 *   2. Email of the first admin developer in the database
 *
 * Caches the result in-memory (resets on cold start).
 * Logs an error if no admin email can be resolved.
 */
export async function getAdminNotificationEmail(): Promise<string | null> {
  if (_cachedAdminEmail !== undefined) return _cachedAdminEmail;

  // 1. Try env var
  const envEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
  if (envEmail) {
    _cachedAdminEmail = envEmail;
    return envEmail;
  }

  // 2. Fallback: look up admin developer email from DB
  try {
    const sb = getSupabaseAdmin();
    const { data: devs } = await sb
      .from("developers")
      .select("github_login, email")
      .not("email", "is", null)
      .limit(50);

    if (devs) {
      const adminDev = devs.find((d) => isAdminGithubLogin(d.github_login));
      if (adminDev?.email) {
        _cachedAdminEmail = adminDev.email;
        console.warn(
          `[admin-email] ADMIN_NOTIFICATION_EMAIL not set. Falling back to ${adminDev.github_login}'s email. Set the env var to avoid this lookup.`,
        );
        return adminDev.email;
      }
    }
  } catch (err) {
    console.error("[admin-email] Failed to look up admin email from DB:", err);
  }

  console.error(
    "[admin-email] No admin email found. Set ADMIN_NOTIFICATION_EMAIL env var. Job review emails will NOT be sent.",
  );
  _cachedAdminEmail = null;
  return null;
}
