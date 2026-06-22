// Server-only helpers for social links: GitHub-profile auto-fill.

import { getSupabaseAdmin } from "@/lib/supabase";
import { ghHeaders, FETCH_TIMEOUT_MS } from "@/lib/github-api";
import { normalizeSocialUrl, type SocialLinks } from "./social-links";

/**
 * Pull twitter_username + blog from the public GitHub profile and normalize
 * them into social links. Fail-silent: any error returns {}.
 */
export async function fetchGithubSocialSuggestions(login: string): Promise<SocialLinks> {
  try {
    const res = await fetch(`https://api.github.com/users/${encodeURIComponent(login)}`, {
      headers: ghHeaders(),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) return {};
    const data = (await res.json()) as {
      twitter_username?: string | null;
      blog?: string | null;
      email?: string | null;
    };
    const out: SocialLinks = {};
    if (data.twitter_username) {
      const url = normalizeSocialUrl("twitter", data.twitter_username);
      if (url) out.twitter = url;
    }
    if (data.blog) {
      const url = normalizeSocialUrl("website", data.blog);
      if (url) out.website = url;
    }
    if (data.email) {
      const url = normalizeSocialUrl("email", data.email);
      if (url) out.email = url;
    }
    return out;
  } catch {
    return {};
  }
}

/**
 * Seed social_links from GitHub right after a claim. Never overwrites an
 * existing record and never throws — meant to run fire-and-forget.
 */
export async function seedSocialLinksFromGithub(developerId: number, login: string): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    const { data: existing } = await admin
      .from("developer_customizations")
      .select("developer_id")
      .eq("developer_id", developerId)
      .eq("item_id", "social_links")
      .maybeSingle();
    if (existing) return;

    const suggested = await fetchGithubSocialSuggestions(login);
    if (Object.keys(suggested).length === 0) return;

    await admin.from("developer_customizations").upsert(
      {
        developer_id: developerId,
        item_id: "social_links",
        config: suggested,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "developer_id,item_id", ignoreDuplicates: true }
    );
  } catch {
    // fail-silent by design: a claim must never break because of this
  }
}
