local M = {}
local api = require("gitcity.api")
local constants = require("gitcity.constants")

local queue = {}
local timer = nil

local function flush()
  if #queue == 0 then return end
  
  -- Take up to MAX_BATCH_SIZE items
  local batch_size = math.min(#queue, constants.MAX_BATCH_SIZE)
  local batch = {}
  for i=1, batch_size do
    table.insert(batch, queue[i])
  end
  
  api.send_heartbeats(batch, function(success)
    if success then
      -- Remove sent items on success
      local new_q = {}
      for i=batch_size+1, #queue do
        table.insert(new_q, queue[i])
      end
      queue = new_q
    end
  end)
end

function M.enqueue(heartbeat)
  table.insert(queue, heartbeat)
  if #queue >= constants.MAX_BATCH_SIZE then
    flush()
  end
end

function M.start()
  if timer then timer:stop() timer:close() end
  timer = vim.loop.new_timer()
  timer:start(constants.FLUSH_INTERVAL_MS, constants.FLUSH_INTERVAL_MS, vim.schedule_wrap(function()
    flush()
  end))
end

function M.stop()
  if timer then
    timer:stop()
    if not timer:is_closing() then
      timer:close()
    end
    timer = nil
  end
  flush() -- Final flush before closing
end

return M
