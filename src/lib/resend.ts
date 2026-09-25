import { Resend } from "resend";
import type { CreateEmailOptions, CreateEmailRequestOptions, CreateEmailResponse } from "resend";

let _client: Resend | null = null;

export function getResend(): Resend {
  if (!_client) {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not set");
    }
    _client = new Resend(process.env.RESEND_API_KEY);
  }
  return _client;
}

// ── Throttled send ──
// Resend rate-limits per team. Crons used to fire ~50 sends at once and more
// than half came back 429. Every send in this instance goes through one
// module-level slot queue (~8 req/s), and a 429 backs off and retries.

const MAX_RPS = Number(process.env.RESEND_MAX_RPS) || 8;
const MIN_INTERVAL_MS = Math.ceil(1000 / MAX_RPS);
const MAX_RETRIES = 3;

let nextSlotAt = 0;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function takeSlot(): Promise<void> {
  const now = Date.now();
  const at = Math.max(now, nextSlotAt);
  nextSlotAt = at + MIN_INTERVAL_MS;
  if (at > now) await sleep(at - now);
}

function isRateLimited(res: CreateEmailResponse): boolean {
  if (!res.error) return false;
  // Quota errors are also 429 but retrying them is pointless.
  if (res.error.name === "daily_quota_exceeded" || res.error.name === "monthly_quota_exceeded") return false;
  return res.error.name === "rate_limit_exceeded" || res.error.statusCode === 429;
}

/** Tag values must match /^[A-Za-z0-9_-]+$/ and be at most 256 chars. */
export function toResendTag(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 256) || "none";
}

/**
 * resend.emails.send with a per-instance rate limiter and up to 3 retries on 429.
 * Returns the SDK response as-is; callers must check `error`.
 */
export async function sendEmail(
  payload: CreateEmailOptions,
  options?: CreateEmailRequestOptions,
): Promise<CreateEmailResponse> {
  const resend = getResend();
  for (let attempt = 0; ; attempt++) {
    await takeSlot();
    const res = await resend.emails.send(payload, options);
    if (!isRateLimited(res) || attempt >= MAX_RETRIES) return res;

    const retryAfter = Number(res.headers?.["retry-after"]);
    const backoff = retryAfter > 0 ? retryAfter * 1000 : 1000 * 2 ** attempt;
    await sleep(backoff + Math.floor(Math.random() * 250));
  }
}
