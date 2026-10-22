// ─── Brasil town: the Instagram breaker ─────────────────────
// Every DM and public reply the bot sends goes through guarded(). Meta answers
// a blocked account (368) or a rate limit (4, 17, 32, 613, 80002) with an
// error; BREAKER.trips of those in a row pause the bot for BREAKER.pauseHours
// (instagram_account.paused_until, migration 187) and email Sam the error, so
// a block doesn't turn into a burst of retries that makes it worse. Any send
// that goes through resets the streak. BRASIL_IG_REPLIES=off is the manual
// switch; this is the automatic one. Server only.

import { getSupabaseAdmin } from "../supabase";
import { InstagramError } from "../instagram";
import { sendEmail } from "../resend";
import { FROM_NOTIFY } from "../email/senders";
import { LEGAL_EMAIL } from "../legal";

export const BREAKER = { trips: 3, pauseHours: 6, codes: [368, 4, 17, 32, 613, 80002] } as const;

interface State {
  fail_streak: number;
  paused_until: string | null;
}

async function state(): Promise<State | null> {
  const { data } = await getSupabaseAdmin().from("instagram_account").select("fail_streak, paused_until").eq("id", 1).maybeSingle<State>();
  return data;
}

/** Whether the bot may speak on Instagram now: not switched off, not paused by the breaker. */
export async function mayTalk(): Promise<boolean> {
  if (process.env.BRASIL_IG_REPLIES === "off") return false;
  const s = await state();
  return !s?.paused_until || Date.parse(s.paused_until) <= Date.now();
}

/** Runs one send; a block or rate limit counts toward the breaker, a success resets it. Rethrows the send's error. */
export async function guarded<T>(send: () => Promise<T>): Promise<T> {
  const sb = getSupabaseAdmin();
  try {
    const out = await send();
    await sb.from("instagram_account").update({ fail_streak: 0 }).eq("id", 1).gt("fail_streak", 0);
    return out;
  } catch (err) {
    if (err instanceof InstagramError && err.code !== null && (BREAKER.codes as readonly number[]).includes(err.code)) {
      const streak = ((await state())?.fail_streak ?? 0) + 1;
      const trip = streak >= BREAKER.trips;
      const until = new Date(Date.now() + BREAKER.pauseHours * 3_600_000).toISOString();
      await sb
        .from("instagram_account")
        .update(trip ? { fail_streak: 0, paused_until: until, pause_reason: err.message } : { fail_streak: streak })
        .eq("id", 1);
      if (trip) {
        console.error("[brasil] breaker tripped", err.message);
        await sendEmail({
          from: FROM_NOTIFY,
          to: LEGAL_EMAIL,
          subject: `Instagram bot paused for ${BREAKER.pauseHours}h`,
          text: `Meta refused ${BREAKER.trips} sends in a row, so the Brasil bot stopped sending DMs and replies until ${until}.\n\nLast error: ${err.message}\n\nCheck Settings → Account status in the Instagram app. To resume earlier, clear instagram_account.paused_until.`,
        }).catch((e) => console.error("[brasil] breaker email", e));
      }
    }
    throw err;
  }
}
