local M = {}

local config = require("gitcity.config")
local keystore = require("gitcity.keystore")
local queue = require("gitcity.queue")
local tracker = require("gitcity.tracker")

function M.setup(opts)
  -- Initialize config
  config.setup(opts)
  
  if not config.get().enabled then return end
  
  -- Initialize modules
  keystore.init()
  queue.start()
  tracker.init()
  
  -- Notify state
  local key = keystore.get_key()
  if not key then
    -- Not logged in yet
  else
    -- Logged in and active
  end
end

function M.login()
  vim.ui.input({ prompt = "Paste your API key from thegitcity.com: ", default = "" }, function(input)
    if input and input ~= "" then
      if keystore.set_key(input) then
        vim.notify("Git City: Pulse connected. Your building is powering the city.", vim.log.levels.INFO)
        tracker.set_paused(false) -- force a heartbeat
      else
        vim.notify("Git City: Failed to save API key.", vim.log.levels.ERROR)
      end
    end
  end)
end

function M.logout()
  keystore.delete_key()
  tracker.deactivate()
  vim.notify("Git City: Pulse disconnected.", vim.log.levels.INFO)
end

function M.toggle_pause()
  local is_paused = tracker.is_paused()
  tracker.set_paused(not is_paused)
  if not is_paused then
    vim.notify("Git City: Pulse paused.", vim.log.levels.INFO)
  else
    vim.notify("Git City: Pulse resumed.", vim.log.levels.INFO)
  end
end

function M.show_dashboard()
  local url = config.get().apiUrl
  
  local os_name = vim.loop.os_uname().sysname
  local cmd
  if os_name == "Darwin" then
    cmd = "open"
  elseif os_name == "Windows_NT" then
    cmd = "start"
  else
    cmd = "xdg-open"
  end
  
  -- Run asynchronous without callback
  if vim.system then
    vim.system({ cmd, url })
  else
    vim.fn.jobstart({ cmd, url })
  end
end

return M
