local M = {}

M.DEFAULT_API_URL = "https://www.thegitcity.com"
M.HEARTBEAT_THROTTLE_MS = 2 * 60 * 1000 -- 2 minutes
M.FLUSH_INTERVAL_MS = 30 * 1000 -- 30 seconds
M.MAX_BATCH_SIZE = 25
M.IDLE_TIMEOUT_DEFAULT_MS = 5 * 60 * 1000 -- 5 minutes

return M
