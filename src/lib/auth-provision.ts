import { getSupabaseAdmin } from "@/lib/supabase";
import { evaluateEmblems } from "@/lib/emblems";
import { cacheEmailFromAuth, touchLastActive, ensurePreferences } from "@/lib/notification-helpers";
import { sendWelcomeNotification } from "@/lib/notification-senders/welcome";
import { sendReferralJoinedNotification } from "@/lib/notification-senders/referral";
import { fetchGitHubDeveloperData } from "@/lib/github-api";
import { calculateGithubXp } from "@/lib/xp";
import { earnPixels } from "@/lib/pixels";

/**
 * Provisions / claims the developer building for a freshly authenticated user.
 *
 * Shared by the real GitHub OAuth callback (`/auth/callback`) and the local
 * dev-login route (`/api/dev/login`) so both paths produce identical state:
 * building creation from GitHub data, XP, rank, activity feed, welcome
 * notification, referral attribution and achievement checks.
 *
 * Keyed on the GitHub login (from `user_metadata.user_name`) and the Supabase
 * auth user id — the only two values either entry point needs to provide.
 */
export async function provisionDeveloperOnLogin(
  githubLogin: string,
  authUserId: string,
  ref: string | null,
): Promise<void> {
  if (!githubLogin) return;

  const admin = getSupabaseAdmin();

  // Check if dev already exists in the database
  const { data: existingDev } = await admin
    .from("developers")
    .select("id, claimed")
    .eq("github_login", githubLogin)
    .maybeSingle();

  if (!existingDev) {
    // ─── New dev: create building from GitHub data on login ───
    try {
      const ghData = await fetchGitHubDeveloperData(githubLogin, { allowEmpty: true });

      const { data: created, error: createErr } = await admin
        .from("developers")
        .upsert({
          ...ghData,
          fetched_at: new Date().toISOString(),
          claimed: true,
          claimed_by: authUserId,
          claimed_at: new Date().toISOString(),
          fetch_priority: 1,
        }, { onConflict: "github_login" })
        .select("id")
        .single();

      if (created && !createErr) {
        // GitHub XP
        const xp = calculateGithubXp({
          contributions: ghData.contributions_total ?? ghData.contributions,
          total_stars: ghData.total_stars,
          public_repos: ghData.public_repos,
          total_prs: ghData.total_prs ?? 0,
        });
        if (xp > 0) {
          await admin.rpc("grant_xp", { p_developer_id: created.id, p_source: "github", p_amount: xp });
          await admin.from("developers").update({ xp_github: xp }).eq("id", created.id);
        }

        // Rank
        await admin.rpc("assign_new_dev_rank", { dev_id: created.id });
        admin.rpc("recalculate_ranks").then(
          () => console.log("Ranks recalculated for new dev:", githubLogin),
          (err: unknown) => console.error("Rank recalculation failed:", err),
        );

        // Feed event
        await admin.from("activity_feed").insert({
          event_type: "dev_joined",
          actor_id: created.id,
          metadata: { login: githubLogin },
        });

        // Notifications
        cacheEmailFromAuth(created.id, authUserId).catch(() => {});
        ensurePreferences(created.id).catch(() => {});
        sendWelcomeNotification(created.id, githubLogin);
      }
    } catch (err) {
      console.error("Failed to create dev on login:", err);
    }
  } else if (!existingDev.claimed) {
    // ─── Legacy dev: claim existing unclaimed building ───
    await admin
      .from("developers")
      .update({
        claimed: true,
        claimed_by: authUserId,
        claimed_at: new Date().toISOString(),
        fetch_priority: 1,
      })
      .eq("id", existingDev.id)
      .eq("claimed", false);

    await admin.from("activity_feed").insert({
      event_type: "dev_joined",
      actor_id: existingDev.id,
      metadata: { login: githubLogin },
    });

    cacheEmailFromAuth(existingDev.id, authUserId).catch(() => {});
    ensurePreferences(existingDev.id).catch(() => {});
    sendWelcomeNotification(existingDev.id, githubLogin);
  }

  // Fetch dev record for achievement check + referral processing.
  // Uses try-catch to avoid breaking login if v2 columns/tables don't exist yet.
  try {
    const { data: dev } = await admin
      .from("developers")
      .select("id, contributions, public_repos, total_stars, kudos_count, referral_count, referred_by")
      .eq("github_login", githubLogin)
      .single();

    if (dev) {
      // Cache email + update last_active_at on every login
      cacheEmailFromAuth(dev.id, authUserId).catch(() => {});
      touchLastActive(dev.id);

      // Process referral (from ?ref= param forwarded by client)
      if (ref && ref !== githubLogin && !dev.referred_by) {
        const { data: referrer } = await admin
          .from("developers")
          .select("id, github_login")
          .eq("github_login", ref.toLowerCase())
          .single();

        if (referrer) {
          await admin
            .from("developers")
            .update({ referred_by: referrer.github_login })
            .eq("id", dev.id);

          await admin.rpc("increment_referral_count", { referrer_dev_id: referrer.id });

          // Referral reward: +25 PX, idempotent per referred dev
          earnPixels(
            referrer.id,
            "referral",
            dev.id.toString(),
            `referral:${dev.id}`
          ).catch(() => {});

          await admin.from("activity_feed").insert({
            event_type: "referral",
            actor_id: referrer.id,
            target_id: dev.id,
            metadata: { referrer_login: referrer.github_login, referred_login: githubLogin },
          });

          // Notify referrer that their referral joined
          sendReferralJoinedNotification(referrer.id, referrer.github_login, githubLogin, dev.id);

          // Check referral achievements for the referrer
          const { data: referrerFull } = await admin
            .from("developers")
            .select("referral_count, kudos_count, contributions, public_repos, total_stars")
            .eq("id", referrer.id)
            .single();

          if (referrerFull) {
            const giftsSent = await countGifts(admin, referrer.id, "sent");
            const giftsReceived = await countGifts(admin, referrer.id, "received");
            await evaluateEmblems(referrer.id, {
              contributions: referrerFull.contributions,
              public_repos: referrerFull.public_repos,
              total_stars: referrerFull.total_stars,
              referral_count: referrerFull.referral_count,
              kudos_count: referrerFull.kudos_count,
              gifts_sent: giftsSent,
              gifts_received: giftsReceived,
            }, referrer.github_login);
          }
        }
      }

      // Run achievement check for this developer
      const giftsSent = await countGifts(admin, dev.id, "sent");
      const giftsReceived = await countGifts(admin, dev.id, "received");
      await evaluateEmblems(dev.id, {
        contributions: dev.contributions,
        public_repos: dev.public_repos,
        total_stars: dev.total_stars,
        referral_count: dev.referral_count ?? 0,
        kudos_count: dev.kudos_count ?? 0,
        gifts_sent: giftsSent,
        gifts_received: giftsReceived,
      }, githubLogin);
    }
  } catch {
    // Silently skip v2 features if tables/columns don't exist yet
    console.warn("Login: skipping v2 achievement/referral check (migration may not have run)");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function countGifts(admin: any, devId: number, direction: "sent" | "received"): Promise<number> {
  const column = direction === "sent" ? "developer_id" : "gifted_to";
  const { count } = await admin
    .from("purchases")
    .select("id", { count: "exact", head: true })
    .eq(column, devId)
    .eq("status", "completed")
    .not("gifted_to", "is", null);
  return count ?? 0;
}
