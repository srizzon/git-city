/**
 * Activity Tracker
 *
 * Based on WakaTime's proven patterns:
 * - 50ms debounce on raw editor events
 * - Heartbeat sent when: file changed, file saved, or 120s elapsed
 * - Idle detected after configurable timeout of no editor events (default 5 min)
 * - Explicit offline signal on idle/pause/close for instant presence updates
 *
 * States:
 *   ACTIVE  — dev is coding, heartbeats flowing
 *   IDLE    — no editor events for idleTimeout, offline signal sent
 *   PAUSED  — user manually paused tracking
 *
 * Transitions:
 *   active ──(no editor events for idleTimeout)──> idle    (sends offline signal)
 *   active ──(user pauses)───────────────────────> paused  (sends offline signal)
 *   idle   ──(any editor event)──────────────────> active  (sends immediate heartbeat)
 *   paused ──(user resumes)──────────────────────> active  (sends immediate heartbeat)
 *
 * Window focus/blur is NOT tracked. A dev with VS Code open on a second
 * monitor should stay "active" until the idle timeout fires naturally.
 */

import * as vscode from "vscode";
import * as os from "os";
import * as path from "path";
import { getConfig } from "../config";
import { sanitize, type RawHeartbeat } from "../privacy/sanitizer";
import { enqueue } from "../api/queue";
import { HEARTBEAT_THROTTLE_MS } from "../constants";

// ─── State ──────────────────────────────────────────────────────

type TrackerState = "active" | "idle" | "paused";

let state: TrackerState = "idle";
let sessionId: string;

// Timing
let lastHeartbeatTime = 0;
let lastFile = "";
let activeSecondsAccum = 0;
let lastActivityTime = 0;

// Timers
let debounceTimer: ReturnType<typeof setTimeout> | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let activeSecondsTimer: ReturnType<typeof setInterval> | undefined;

// Callback
let onStatusChange: ((status: "active" | "idle" | "paused") => void) | undefined;

const DEBOUNCE_MS = 50;

// ─── Public API ─────────────────────────────────────────────────

export function initTracker(
  context: vscode.ExtensionContext,
  statusCallback: (status: "active" | "idle" | "paused") => void,
) {
  sessionId = crypto.randomUUID();
  onStatusChange = statusCallback;

  // Editor events → debounced handler
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor(() => scheduleEvent(false)),
    vscode.workspace.onDidChangeTextDocument(() => scheduleEvent(false)),
    vscode.workspace.onDidSaveTextDocument(() => scheduleEvent(true)),
    vscode.window.onDidChangeTextEditorSelection(() => scheduleEvent(false)),
  );

  // Track active seconds: every second while in active state, increment counter
  activeSecondsTimer = setInterval(() => {
    if (state !== "active") return;
    const now = Date.now();
    if (lastActivityTime > 0 && now - lastActivityTime < getConfig().idleTimeout) {
      activeSecondsAccum++;
    }
  }, 1000);

  context.subscriptions.push({ dispose: () => clearInterval(activeSecondsTimer) });
}

export function setPaused(paused: boolean) {
  if (paused) {
    transition("paused");
  } else {
    transition("active");
    sendHeartbeatNow();
  }
}

export function isPaused() {
  return state === "paused";
}

export function getActiveSeconds() {
  return activeSecondsAccum;
}

/** Send a heartbeat immediately, bypassing all throttles. Used on key setup. */
export function sendImmediateHeartbeat() {
  if (state === "paused" || !getConfig().enabled) return;
  transition("active");
  sendHeartbeatNow();
}

/** Build an offline heartbeat (used by deactivate to send directly). */
export function buildOfflineHeartbeat(): RawHeartbeat {
  return {
    timestamp: new Date().toISOString(),
    isWrite: false,
    activeSeconds: 0,
    sessionId,
    editorName: "vscode",
    os: os.platform(),
    status: "offline",
  };
}

/** Send an offline signal so the server removes presence immediately. */
export function sendOfflineSignal() {
  enqueue(buildOfflineHeartbeat());
}

// ─── State Transitions ─────────────────────────────────────────

function transition(newState: TrackerState) {
  const prev = state;
  if (prev === newState) return;
  state = newState;

  // Send offline signal when leaving active for idle/paused
  if (prev === "active" && (newState === "idle" || newState === "paused")) {
    sendOfflineSignal();
  }

  // Clear idle timer when not active
  if (newState !== "active") {
    clearIdleTimer();
  }

  // Notify UI
  onStatusChange?.(newState);
}

// ─── Event Handling ─────────────────────────────────────────────

/** Debounce raw editor events (50ms, WakaTime pattern). Saves bypass debounce. */
function scheduleEvent(isWrite: boolean) {
  if (state === "paused" || !getConfig().enabled) return;

  if (isWrite) {
    processEvent(true);
    return;
  }

  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => processEvent(false), DEBOUNCE_MS);
}

function processEvent(isWrite: boolean) {
  const now = Date.now();
  lastActivityTime = now;

  // Track if we were idle — need to send immediate heartbeat on wake
  const wasIdle = state === "idle";

  // Transition to active (sends offline→active status change to UI)
  if (state !== "active") {
    transition("active");
  }

  // Reset idle timer on every editor event
  resetIdleTimer();

  const editor = vscode.window.activeTextEditor;
  const currentFile = editor?.document.uri.fsPath ?? "";
  const fileChanged = currentFile !== lastFile;

  // Send heartbeat if any of these are true:
  // 1. Waking from idle (instant presence recovery)
  // 2. File changed (user switched files)
  // 3. File saved (explicit action)
  // 4. 120s elapsed since last heartbeat (keepalive)
  const enoughTime = now - lastHeartbeatTime >= HEARTBEAT_THROTTLE_MS;
  if (!wasIdle && !fileChanged && !isWrite && !enoughTime) return;

  lastHeartbeatTime = now;
  lastFile = currentFile;

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const projectName = workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : undefined;

  const hb: RawHeartbeat = {
    timestamp: new Date(now).toISOString(),
    language: editor?.document.languageId,
    project: projectName,
    isWrite,
    activeSeconds: activeSecondsAccum,
    sessionId,
    editorName: "vscode",
    os: os.platform(),
  };

  activeSecondsAccum = 0;
  enqueue(sanitize(hb));
}

/** Send a heartbeat right now with current editor state. */
function sendHeartbeatNow() {
  const now = Date.now();
  lastHeartbeatTime = now;
  lastActivityTime = now;

  const editor = vscode.window.activeTextEditor;
  lastFile = editor?.document.uri.fsPath ?? "";

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
  const projectName = workspaceFolder ? path.basename(workspaceFolder.uri.fsPath) : undefined;

  const hb: RawHeartbeat = {
    timestamp: new Date(now).toISOString(),
    language: editor?.document.languageId,
    project: projectName,
    isWrite: false,
    activeSeconds: 0,
    sessionId,
    editorName: "vscode",
    os: os.platform(),
  };

  enqueue(sanitize(hb));
  resetIdleTimer();
}

// ─── Idle Timer ─────────────────────────────────────────────────

function resetIdleTimer() {
  clearIdleTimer();
  idleTimer = setTimeout(() => {
    if (state === "active") {
      transition("idle");
    }
  }, getConfig().idleTimeout);
}

function clearIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer);
    idleTimer = undefined;
  }
}
