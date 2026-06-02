import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase";

// ─── Game analytics logging (server-side) ──────────────────────
//
// Single write path into game_events. Analytics must NEVER break gameplay,
// so every call is fire-and-forget with swallowed errors.
//
// Event naming convention (industry standard): snake_case, object_action,
// past tense. e.g. raid_joined, boss_defeated, reward_granted.

export interface LogEventOpts {
  developerId?: number | null;
  anonymousId?: string | null;
  props?: Record<string, unknown>;
}

export async function logEvent(eventName: string, opts: LogEventOpts = {}): Promise<void> {
  try {
    const admin = getSupabaseAdmin();
    await admin.rpc("log_game_event", {
      p_event_name: eventName,
      p_developer_id: opts.developerId ?? null,
      p_anonymous_id: opts.anonymousId ?? null,
      p_props: opts.props ?? {},
    });
  } catch {
    // Swallow — telemetry failure must not surface to the player.
  }
}

// Batch variant — preferred when flushing a buffer of many events at once.
export async function logEventsBatch(
  events: Array<{ event_name: string; developer_id?: number | null; anonymous_id?: string | null; props?: Record<string, unknown> }>,
): Promise<void> {
  if (events.length === 0) return;
  try {
    const admin = getSupabaseAdmin();
    await admin.rpc("log_game_events_batch", {
      p_events: events.map((e) => ({
        event_name: e.event_name,
        developer_id: e.developer_id != null ? String(e.developer_id) : null,
        anonymous_id: e.anonymous_id ?? null,
        props: e.props ?? {},
      })),
    });
  } catch {
    // Swallow.
  }
}
