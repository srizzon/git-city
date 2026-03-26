export const DEFAULT_API_URL = "https://www.thegitcity.com";
export const HEARTBEAT_THROTTLE_MS = 2 * 60 * 1000; // 2 minutes
export const FLUSH_INTERVAL_MS = 30 * 1000; // 30 seconds
export const MAX_BATCH_SIZE = 25;
export const IDLE_TIMEOUT_DEFAULT_MS = 5 * 60 * 1000; // 5 minutes
export const SESSION_END_TIMEOUT_MS = 15 * 60 * 1000; // 15 minutes
export const QUEUE_STORAGE_KEY = "gitCity.pendingHeartbeats";
export const ACTIVE_SECONDS_KEY = "gitCity.activeSeconds";
