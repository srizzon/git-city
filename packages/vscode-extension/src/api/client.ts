import { getConfig } from "../config";
import { getKey } from "../auth/keystore";
import type { RawHeartbeat } from "../privacy/sanitizer";

const MAX_RETRIES = 3;
const INITIAL_BACKOFF_MS = 1000;

export async function sendHeartbeats(heartbeats: RawHeartbeat[]): Promise<boolean> {
  const apiKey = await getKey();
  if (!apiKey || heartbeats.length === 0) return false;

  const { apiUrl } = getConfig();
  const url = `${apiUrl}/api/heartbeats`;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(heartbeats),
      });

      if (res.ok) return true;

      // Don't retry auth errors
      if (res.status === 401 || res.status === 403) return false;

      // Don't retry rate limits, they'll resolve naturally
      if (res.status === 429) return false;
    } catch {
      // Network error, retry with backoff
    }

    if (attempt < MAX_RETRIES - 1) {
      await new Promise((r) => setTimeout(r, INITIAL_BACKOFF_MS * Math.pow(2, attempt)));
    }
  }

  return false;
}

/**
 * Send a single heartbeat directly, bypassing the queue.
 * Used for offline signals during deactivate where we can't rely on the queue.
 * Accepts an optional pre-cached key since SecretStorage may be unavailable during shutdown.
 * Single attempt, 3s timeout — best effort before VS Code kills the process.
 */
export async function sendDirect(heartbeat: RawHeartbeat, cachedApiKey?: string): Promise<boolean> {
  const apiKey = cachedApiKey ?? await getKey();
  if (!apiKey) return false;

  const { apiUrl } = getConfig();
  const url = `${apiUrl}/api/heartbeats`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify([heartbeat]),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    return res.ok;
  } catch {
    return false;
  }
}
