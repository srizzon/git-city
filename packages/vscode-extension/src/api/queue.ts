import * as vscode from "vscode";
import { sendHeartbeats } from "./client";
import { FLUSH_INTERVAL_MS, MAX_BATCH_SIZE, QUEUE_STORAGE_KEY } from "../constants";
import type { RawHeartbeat } from "../privacy/sanitizer";

let queue: RawHeartbeat[] = [];
let flushTimer: ReturnType<typeof setInterval> | undefined;
let globalState: vscode.Memento;

export function initQueue(context: vscode.ExtensionContext) {
  globalState = context.globalState;

  // Restore persisted queue
  const persisted = globalState.get<RawHeartbeat[]>(QUEUE_STORAGE_KEY, []);
  if (persisted.length > 0) {
    queue.push(...persisted);
  }

  startFlushing();
}

export function enqueue(heartbeat: RawHeartbeat) {
  const wasEmpty = queue.length === 0;
  queue.push(heartbeat);
  persist();
  // Flush immediately when first heartbeat arrives (instant feedback)
  if (wasEmpty) {
    flush();
  }
}

export function flushNow() {
  flush();
}

export function stopQueue() {
  if (flushTimer) {
    clearInterval(flushTimer);
    flushTimer = undefined;
  }
  flush(); // Final flush
}

function startFlushing() {
  flushTimer = setInterval(flush, FLUSH_INTERVAL_MS);
}

async function flush() {
  if (queue.length === 0) return;

  const batch = queue.splice(0, MAX_BATCH_SIZE);
  const ok = await sendHeartbeats(batch);

  if (!ok) {
    // Put failed batch back at front
    queue.unshift(...batch);
  }

  persist();
}

function persist() {
  globalState.update(QUEUE_STORAGE_KEY, queue).then(() => {});
}
