import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase-server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { checkAchievements } from "@/lib/achievements";
import { cacheEmailFromAuth, touchLastActive, ensurePreferences } from "@/lib/notification-helpers";
import { sendWelcomeNotification } from "@/lib/notification-senders/welcome";
import { sendReferralJoinedNotification } from "@/lib/notification-senders/referral";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");

  if (!code) {
    return NextResponse.redirect(`${origin}/?error=no_code`);
  }

  const supabase = await createServerSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);

  if (error || !data.user) {
    return NextResponse.redirect(`${origin}/?error=auth_failed`);
  }

  const githubLogin = (
    data.user.user_metadata.user_name ??
    data.user.user_metadata.preferred_username ??
    ""
  ).toLowerCase();

  const admin = getSupabaseAdmin();

  if (githubLogin) {
    // Auto-claim: if building exists and not yet claimed, claim it
    const { data: claimResult } = await admin
      .from("developers")
      .update({
        claimed: true,
        claimed_by: data.user.id,
        claimed_at: new Date().toISOString(),
        fetch_priority: 1,
      })
      .eq("github_login", githubLogin)
      .eq("claimed", false)
      .select("id");

    // First-time claim → dev_joined feed event + welcome email
    if (claimResult && claimResult.length > 0) {
      await admin.from("activity_feed").insert({
        event_type: "dev_joined",
        actor_id: claimResult[0].id,
        metadata: { login: githubLogin },
      });

      // Cache email, create preferences, send welcome notification
      cacheEmailFromAuth(claimResult[0].id, data.user.id).catch(() => {});
      ensurePreferences(claimResult[0].id).catch(() => {});
      sendWelcomeNotification(claimResult[0].id, githubLogin);
    }

    // Fetch dev record for achievement check + referral processing
    // Uses try-catch to avoid breaking login if v2 columns/tables don't exist yet
    try {
      const { data: dev } = await admin
        .from("developers")
        .select("id, contributions, public_repos, total_stars, kudos_count, referral_count, referred_by")
        .eq("github_login", githubLogin)
        .single();

      if (dev) {
        // Cache email + update last_active_at on every login
        cacheEmailFromAuth(dev.id, data.user.id).catch(() => {});
        touchLastActive(dev.id);

        // Process referral (from ?ref= param forwarded by client)
        const ref = searchParams.get("ref");
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
              await checkAchievements(referrer.id, {
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
        await checkAchievements(dev.id, {
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
      console.warn("Auth callback: skipping v2 achievement/referral check (migration may not have run)");
    }
  }

  // Support ?next= param for post-login redirect (e.g. /shop)
  const next = searchParams.get("next");
  if (next === "/shop" && githubLogin) {
    const { data: dev } = await admin
      .from("developers")
      .select("github_login")
      .eq("github_login", githubLogin)
      .single();

    if (!dev) {
      return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
    }

    return NextResponse.redirect(`${origin}/shop/${githubLogin}`);
  }

  return NextResponse.redirect(`${origin}/?user=${githubLogin}`);
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
