import { sendNotificationAsync } from "../notifications";
import { buildButton } from "../email-template";
import { getSupabaseAdmin } from "../supabase";

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://thegitcity.com";

/**
 * Send community milestone notification to all opted-in users.
 * Processes in chunks of 50 to avoid cron timeouts.
 */
export async function sendCommunityMilestoneNotifications(
  milestone: number,
): Promise<{ sent: number; skipped: number; errors: number }> {
  const sb = getSupabaseAdmin();
  const stats = { sent: 0, skipped: 0, errors: 0 };

  // Get all claimed developers with email who haven't been notified for this milestone
  let offset = 0;
  const batchSize = 50;

  while (true) {
    const { data: devs } = await sb
      .from("developers")
      .select("id, github_login")
      .eq("claimed", true)
      .not("email", "is", null)
      .range(offset, offset + batchSize - 1);

    if (!devs || devs.length === 0) break;

    const results = await Promise.allSettled(
      devs.map((dev) =>
        sendNotificationForMilestone(dev.id, dev.github_login, milestone),
      ),
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        stats.sent++;
      } else {
        stats.errors++;
      }
    }

    if (devs.length < batchSize) break;
    offset += batchSize;
  }

  return stats;
}

function sendNotificationForMilestone(
  devId: number,
  login: string,
  milestone: number,
) {
  const formatted = milestone.toLocaleString();

  return sendNotificationAsync({
    type: "community_milestone",
    category: "transactional",
    developerId: devId,
    dedupKey: `community_milestone:${milestone}:${devId}`,
    title: `Git City hit ${formatted} developers!`,
    body: `The community just reached ${formatted} developers. You're one of them!`,
    html: `
      <p style="margin:0 0 4px; font-size:12px; font-weight:bold; color:#5a8a00; letter-spacing:1px; text-transform:uppercase;">Community milestone</p>
      <h1 style="margin:0 0 8px; font-size:40px; font-weight:bold; color:#111111; font-family:Helvetica,Arial,sans-serif;">${formatted}</h1>
      <p style="margin:0 0 28px; font-size:15px; color:#555555; line-height:1.6;">developers in Git City &mdash; and you're one of them, @${login}!</p>
      <hr style="border:none; border-top:1px solid #eeeeee; margin:0 0 28px;" />
      ${buildButton("Visit Git City", BASE_URL)}
    `,
    actionUrl: BASE_URL,
    priority: "low",
    channels: ["email"],
  });
}
