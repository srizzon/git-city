import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Daily cleanup of GITC payment records.
 *
 * What this does:
 *   1. Marks pending quotes past expires_at as expired (defense in depth — the
 *      confirm endpoint already does this on access, but cron catches quotes
 *      that were never visited again).
 *   2. Deletes the orphan inactive sky_ads / pixel_purchases rows whose
 *      associated GITC quote is expired and older than 7 days.
 *   3. Deletes the expired quote rows themselves after 30 days.
 *
 * Active payments and confirmed records are never touched.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const result = {
    ad_quotes_marked_expired: 0,
    pixel_quotes_marked_expired: 0,
    sky_ads_deleted: 0,
    pixel_purchases_deleted: 0,
    ad_quotes_deleted: 0,
    pixel_quotes_deleted: 0,
    errors: [] as string[],
  };

  // 1. Mark stale pending quotes as expired.
  try {
    const { data: marked } = await sb
      .from("ad_gitc_payments")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", now.toISOString())
      .select("id");
    result.ad_quotes_marked_expired = marked?.length ?? 0;
  } catch (err) {
    result.errors.push(`mark ads expired: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { data: marked } = await sb
      .from("pixel_gitc_payments")
      .update({ status: "expired" })
      .eq("status", "pending")
      .lt("expires_at", now.toISOString())
      .select("id");
    result.pixel_quotes_marked_expired = marked?.length ?? 0;
  } catch (err) {
    result.errors.push(`mark pixel expired: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2a. Delete orphan inactive sky_ads (quote expired/failed >7 days ago).
  try {
    const { data: oldExpired } = await sb
      .from("ad_gitc_payments")
      .select("ad_id, package_ad_ids")
      .in("status", ["expired", "failed"])
      .lt("created_at", sevenDaysAgo.toISOString());

    const adIds = new Set<string>();
    for (const row of oldExpired ?? []) {
      if (row.ad_id) adIds.add(row.ad_id);
      for (const id of row.package_ad_ids ?? []) adIds.add(id);
    }

    if (adIds.size > 0) {
      const { data: deleted } = await sb
        .from("sky_ads")
        .delete()
        .in("id", Array.from(adIds))
        .eq("active", false)
        .select("id");
      result.sky_ads_deleted = deleted?.length ?? 0;
    }
  } catch (err) {
    result.errors.push(`delete sky_ads: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 2b. Delete orphan pixel_purchases (gitc, expired/failed >7 days ago).
  try {
    const { data: oldExpired } = await sb
      .from("pixel_gitc_payments")
      .select("pixel_purchase_id")
      .in("status", ["expired", "failed"])
      .lt("created_at", sevenDaysAgo.toISOString());

    const purchaseIds = (oldExpired ?? []).map((r) => r.pixel_purchase_id).filter(Boolean);
    if (purchaseIds.length > 0) {
      const { data: deleted } = await sb
        .from("pixel_purchases")
        .delete()
        .in("id", purchaseIds)
        .neq("status", "completed")
        .select("id");
      result.pixel_purchases_deleted = deleted?.length ?? 0;
    }
  } catch (err) {
    result.errors.push(`delete pixel_purchases: ${err instanceof Error ? err.message : String(err)}`);
  }

  // 3. Delete the expired/failed quote rows themselves after 30 days.
  // (Confirmed rows are kept forever as the audit trail.)
  try {
    const { data: deleted } = await sb
      .from("ad_gitc_payments")
      .delete()
      .in("status", ["expired", "failed"])
      .lt("created_at", thirtyDaysAgo.toISOString())
      .select("id");
    result.ad_quotes_deleted = deleted?.length ?? 0;
  } catch (err) {
    result.errors.push(`delete ad quotes: ${err instanceof Error ? err.message : String(err)}`);
  }

  try {
    const { data: deleted } = await sb
      .from("pixel_gitc_payments")
      .delete()
      .in("status", ["expired", "failed"])
      .lt("created_at", thirtyDaysAgo.toISOString())
      .select("id");
    result.pixel_quotes_deleted = deleted?.length ?? 0;
  } catch (err) {
    result.errors.push(`delete pixel quotes: ${err instanceof Error ? err.message : String(err)}`);
  }

  return NextResponse.json({ ok: true, ...result });
}
