import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin, broadcastToChannel } from "@/lib/supabase";
import crypto from "crypto";

function hashKey(key: string): string {
  return crypto.createHash("sha256").update(key).digest("hex");
}

// Debounce broadcasts: only send once per developer per 60s,
// unless it's an offline signal (always broadcast immediately).
const lastBroadcast = new Map<number, number>();
const BROADCAST_DEBOUNCE_MS = 60_000;

function shouldBroadcast(devId: number, isOffline: boolean): boolean {
  if (isOffline) return true;
  const last = lastBroadcast.get(devId) ?? 0;
  if (Date.now() - last < BROADCAST_DEBOUNCE_MS) return false;
  lastBroadcast.set(devId, Date.now());
  return true;
}

// ── Validation ──────────────────────────────────────────────────────────────

const MAX_STRING = 64;
const MAX_PROJECT = 128;
const MAX_SESSION_ID = 128;
const MAX_ACTIVE_SECONDS = 3600;
const ALLOWED_EDITORS = new Set(["vscode", "cursor", "vscodium", "windsurf", "positron"]);
const ALLOWED_OS = new Set(["darwin", "linux", "win32", "freebsd", "openbsd"]);
const ALLOWED_STATUS = new Set(["active", "offline"]);

interface ValidHeartbeat {
  language?: string;
  project?: string;
  isWrite: boolean;
  activeSeconds: number;
  sessionId: string;
  editorName: string;
  os?: string;
  status?: "active" | "offline";
}

function validateHeartbeat(raw: unknown): ValidHeartbeat | null {
  if (!raw || typeof raw !== "object") return null;
  const hb = raw as Record<string, unknown>;

  // sessionId is required
  if (typeof hb.sessionId !== "string" || hb.sessionId.length === 0 || hb.sessionId.length > MAX_SESSION_ID) {
    return null;
  }

  const language = typeof hb.language === "string" ? hb.language.slice(0, MAX_STRING) : undefined;
  const project = typeof hb.project === "string" ? hb.project.slice(0, MAX_PROJECT) : undefined;
  const isWrite = hb.isWrite === true;

  let activeSeconds = typeof hb.activeSeconds === "number" ? Math.floor(hb.activeSeconds) : 0;
  activeSeconds = Math.max(0, Math.min(activeSeconds, MAX_ACTIVE_SECONDS));

  const editorName = typeof hb.editorName === "string" && ALLOWED_EDITORS.has(hb.editorName)
    ? hb.editorName
    : "vscode";

  const os = typeof hb.os === "string" && ALLOWED_OS.has(hb.os) ? hb.os : undefined;

  const status = typeof hb.status === "string" && ALLOWED_STATUS.has(hb.status)
    ? (hb.status as "active" | "offline")
    : undefined;

  return { language, project, isWrite, activeSeconds, sessionId: hb.sessionId, editorName, os, status };
}

// ── Route ───────────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const apiKey = request.headers.get("x-api-key");
  if (!apiKey) {
    return NextResponse.json({ error: "Missing X-API-Key header" }, { status: 401 });
  }

  const sb = getSupabaseAdmin();

  const { data: dev, error: devErr } = await sb
    .from("developers")
    .select("id, github_login, avatar_url")
    .eq("vscode_api_key_hash", hashKey(apiKey))
    .single();

  if (devErr || !dev) {
    return NextResponse.json({ error: "Invalid API key" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rawList = Array.isArray(rawBody) ? rawBody : [rawBody];
  if (rawList.length === 0) {
    return NextResponse.json({ accepted: 0, rejected: 0 });
  }

  // Validate and sanitize all heartbeats
  const heartbeats: ValidHeartbeat[] = [];
  let rejected = 0;

  for (const raw of rawList.slice(0, 25)) {
    const hb = validateHeartbeat(raw);
    if (hb) {
      heartbeats.push(hb);
    } else {
      rejected++;
    }
  }
  rejected += Math.max(0, rawList.length - 25);

  let accepted = 0;

  for (const hb of heartbeats) {
    // Server generates timestamp, never trust client
    const now = new Date().toISOString();
    const isOffline = hb.status === "offline";

    if (isOffline) {
      const { error } = await sb
        .from("developer_sessions")
        .update({ status: "offline", ended_at: now })
        .eq("developer_id", dev.id)
        .eq("session_id", hb.sessionId);

      if (error) {
        rejected++;
        continue;
      }
    } else {
      const { data: existing } = await sb
        .from("developer_sessions")
        .select("total_heartbeats, active_seconds")
        .eq("developer_id", dev.id)
        .eq("session_id", hb.sessionId)
        .single();

      const { error } = await sb.from("developer_sessions").upsert(
        {
          developer_id: dev.id,
          session_id: hb.sessionId,
          status: "active",
          current_language: hb.language ?? null,
          current_project: hb.project ?? null,
          last_heartbeat_at: now,
          editor_name: hb.editorName,
          os: hb.os ?? null,
          total_heartbeats: (existing?.total_heartbeats ?? 0) + 1,
          active_seconds: (existing?.active_seconds ?? 0) + hb.activeSeconds,
        },
        { onConflict: "developer_id,session_id" },
      );

      if (error) {
        rejected++;
        continue;
      }
    }

    accepted++;
  }

  // Broadcast to realtime (no internal IDs exposed)
  if (heartbeats.length > 0) {
    const lastHb = heartbeats[heartbeats.length - 1];
    const isOffline = lastHb.status === "offline";
    if (shouldBroadcast(dev.id, isOffline)) {
      broadcastToChannel("coding-presence", "heartbeat", {
        githubLogin: dev.github_login,
        avatarUrl: dev.avatar_url,
        status: isOffline ? "offline" : "active",
        language: lastHb.language,
      });
    }
  }

  return NextResponse.json({ accepted, rejected });
}
