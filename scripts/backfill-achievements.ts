import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";
import { resolve } from "path";

// Parse .env.local manually (no dotenv dependency)
const envPath = resolve(__dirname, "../.env.local");
const envContent = readFileSync(envPath, "utf-8");
for (const line of envContent.split("\n")) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#")) continue;
  const eqIdx = trimmed.indexOf("=");
  if (eqIdx === -1) continue;
  const key = trimmed.slice(0, eqIdx);
  const val = trimmed.slice(eqIdx + 1);
  if (!process.env[key]) process.env[key] = val;
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

interface Achievement {
  id: string;
  category: string;
  threshold: number;
  tier: string;
  reward_type: string;
  reward_item_id: string | null;
}

async function main() {
  // 1. Load all achievements
  const { data: achievements, error: achErr } = await sb
    .from("achievements")
    .select("*")
    .order("sort_order");

  if (achErr || !achievements) {
    console.error("Failed to load achievements:", achErr);
    return;
  }
  console.log(`Loaded ${achievements.length} achievements\n`);

  // 2. Load all devs with stats
  const { data: devs, error: devErr } = await sb
    .from("developers")
    .select(
      "id, github_login, contributions, public_repos, total_stars, kudos_count, referral_count",
    )
    .order("rank");

  if (devErr || !devs) {
    console.error("Failed to load developers:", devErr);
    return;
  }
  console.log(`Loaded ${devs.length} developers\n`);

  // 3. Load existing unlocks
  const { data: existing } = await sb
    .from("developer_achievements")
    .select("developer_id, achievement_id");

  const existingSet = new Set((existing ?? []).map((r) => `${r.developer_id}_${r.achievement_id}`));

  // 4. Count gifts per dev
  const { data: giftsSent } = await sb
    .from("purchases")
    .select("developer_id")
    .eq("status", "completed")
    .not("gifted_to", "is", null);

  const { data: giftsReceived } = await sb
    .from("purchases")
    .select("gifted_to")
    .eq("status", "completed")
    .not("gifted_to", "is", null);

  const giftsSentMap: Record<number, number> = {};
  for (const r of giftsSent ?? []) {
    giftsSentMap[r.developer_id] = (giftsSentMap[r.developer_id] ?? 0) + 1;
  }
  const giftsReceivedMap: Record<number, number> = {};
  for (const r of giftsReceived ?? []) {
    giftsReceivedMap[r.gifted_to] = (giftsReceivedMap[r.gifted_to] ?? 0) + 1;
  }

  // 5. Process each dev
  let totalUnlocks = 0;
  const unlockRows: { developer_id: number; achievement_id: string }[] = [];
  const purchaseRows: {
    developer_id: number;
    item_id: string;
    provider: string;
    provider_tx_id: string;
    amount_cents: number;
    currency: string;
    status: string;
  }[] = [];
  const feedEvents: {
    event_type: string;
    actor_id: number;
    metadata: Record<string, unknown>;
  }[] = [];

  for (const dev of devs) {
    const stats = {
      contributions: dev.contributions ?? 0,
      public_repos: dev.public_repos ?? 0,
      total_stars: dev.total_stars ?? 0,
      referral_count: dev.referral_count ?? 0,
      kudos_count: dev.kudos_count ?? 0,
      gifts_sent: giftsSentMap[dev.id] ?? 0,
      gifts_received: giftsReceivedMap[dev.id] ?? 0,
    };

    const newUnlocks: Achievement[] = [];

    for (const a of achievements as Achievement[]) {
      const key = `${dev.id}_${a.id}`;
      if (existingSet.has(key)) continue;

      let qualifies = false;
      switch (a.category) {
        case "commits":
          qualifies = stats.contributions >= a.threshold;
          break;
        case "repos":
          qualifies = stats.public_repos >= a.threshold;
          break;
        case "stars":
          qualifies = stats.total_stars >= a.threshold;
          break;
        case "social":
          qualifies = stats.referral_count >= a.threshold;
          break;
        case "kudos":
          qualifies = stats.kudos_count >= a.threshold;
          break;
        case "gifts_sent":
          qualifies = stats.gifts_sent >= a.threshold;
          break;
        case "gifts_received":
          qualifies = stats.gifts_received >= a.threshold;
          break;
      }

      if (qualifies) newUnlocks.push(a);
    }

    if (newUnlocks.length > 0) {
      console.log(
        `@${dev.github_login} → ${newUnlocks.map((a) => `${a.name} (${a.tier})`).join(", ")}`,
      );
      totalUnlocks += newUnlocks.length;

      for (const a of newUnlocks) {
        unlockRows.push({ developer_id: dev.id, achievement_id: a.id });

        if (a.reward_type === "unlock_item" && a.reward_item_id) {
          purchaseRows.push({
            developer_id: dev.id,
            item_id: a.reward_item_id,
            provider: "achievement",
            provider_tx_id: `achievement_${dev.id}_${a.id}`,
            amount_cents: 0,
            currency: "usd",
            status: "completed",
          });
        }
      }

      feedEvents.push({
        event_type: "achievement_unlocked",
        actor_id: dev.id,
        metadata:
          newUnlocks.length === 1
            ? {
                login: dev.github_login,
                achievement_id: newUnlocks[0].id,
                achievement_name: newUnlocks[0].name,
                tier: newUnlocks[0].tier,
              }
            : {
                login: dev.github_login,
                count: newUnlocks.length,
                achievements: newUnlocks.map((a) => ({ id: a.id, name: a.name, tier: a.tier })),
              },
      });
    }
  }

  console.log(`\n--- Summary ---`);
  console.log(`Total new unlocks: ${totalUnlocks}`);
  console.log(`Item rewards to grant: ${purchaseRows.length}`);
  console.log(`Feed events: ${feedEvents.length}`);

  if (totalUnlocks === 0) {
    console.log("Nothing to do!");
    return;
  }

  // 6. Batch insert
  console.log("\nInserting developer_achievements...");
  const { error: e1 } = await sb
    .from("developer_achievements")
    .upsert(unlockRows, { onConflict: "developer_id,achievement_id" });
  if (e1) console.error("  ERROR:", e1.message);
  else console.log(`  OK (${unlockRows.length} rows)`);

  if (purchaseRows.length > 0) {
    console.log("Granting item rewards...");
    // Insert one by one, skip if already owned
    let granted = 0;
    let skipped = 0;
    for (const row of purchaseRows) {
      const { error: e2 } = await sb.from("purchases").insert(row);
      if (e2) {
        skipped++;
      } else {
        granted++;
      }
    }
    console.log(`  OK (${granted} granted, ${skipped} already owned)`);
  }

  console.log("Inserting feed events...");
  const { error: e3 } = await sb.from("activity_feed").insert(feedEvents);
  if (e3) console.error("  ERROR:", e3.message);
  else console.log(`  OK (${feedEvents.length} rows)`);

  console.log("\nDone!");
}

main().catch(console.error);
