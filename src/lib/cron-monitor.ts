/**
 * Lightweight cron monitoring. Reports failures to Discord webhook.
 * Usage: wrap cron handler with `withCronMonitor("job-name", handler)`
 */

const DISCORD_WEBHOOK = process.env.DISCORD_CRON_WEBHOOK_URL;

interface CronResult {
  ok: boolean;
  [key: string]: unknown;
}

/**
 * Send a cron failure alert to Discord.
 * Silently fails if webhook URL is not configured.
 */
async function alertCronFailure(jobName: string, error: unknown, durationMs: number) {
  if (!DISCORD_WEBHOOK) return;

  const message = error instanceof Error ? error.message : String(error);
  const payload = {
    content: `**Cron failure: \`${jobName}\`**\nDuration: ${(durationMs / 1000).toFixed(1)}s\nError: \`${message.slice(0, 500)}\``,
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Don't throw on monitoring failure
  }
}

/**
 * Report cron results (high error rate).
 */
async function alertCronHighErrorRate(jobName: string, results: CronResult, durationMs: number) {
  if (!DISCORD_WEBHOOK) return;

  const errors = (results.errors as number) ?? 0;
  const sent = (results.sent as number) ?? (results.notified as number) ?? 0;
  const total = errors + sent;
  if (total === 0 || errors === 0) return;

  const errorRate = errors / total;
  if (errorRate < 0.3) return; // Only alert on >30% error rate

  const payload = {
    content: `**Cron high error rate: \`${jobName}\`**\nDuration: ${(durationMs / 1000).toFixed(1)}s\nErrors: ${errors}/${total} (${(errorRate * 100).toFixed(0)}%)\nResults: \`${JSON.stringify(results)}\``,
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Don't throw on monitoring failure
  }
}

/**
 * Report cron timeout.
 */
async function alertCronTimeout(jobName: string, durationMs: number, results: CronResult) {
  if (!DISCORD_WEBHOOK) return;

  const payload = {
    content: `**Cron timeout: \`${jobName}\`**\nDuration: ${(durationMs / 1000).toFixed(1)}s\nPartial results: \`${JSON.stringify(results)}\``,
  };

  try {
    await fetch(DISCORD_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Don't throw
  }
}

export { alertCronFailure, alertCronHighErrorRate, alertCronTimeout };
