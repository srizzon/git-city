local M = {}

local config = require("gitcity.config")
local queue = require("gitcity.queue")
local sanitizer = require("gitcity.sanitizer")
local constants = require("gitcity.constants")
local api = require("gitcity.api")

local state = "idle"
local session_id = nil

local last_heartbeat_time = 0
local last_file = ""
local active_seconds_accum = 0
local last_activity_time = 0

local debounce_timer = nil
local idle_timer = nil
local active_seconds_timer = nil

local function current_time_ms()
  return vim.loop.now()
end

local function generate_uuid()
  local random = math.random
  local template ='xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'
  return string.gsub(template, '[xy]', function (c)
    local v = (c == 'x') and random(0, 0xf) or random(8, 0xb)
    return string.format('%x', v)
  end)
end

local function send_offline_signal()
  local hb = {
    timestamp = os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
    isWrite = false,
    activeSeconds = 0,
    sessionId = session_id,
    editorName = "neovim",
    os = vim.loop.os_uname().sysname,
    status = "offline"
  }
  queue.enqueue(hb)
end

local function transition(new_state)
  if state == new_state then return end
  local prev = state
  state = new_state
  
  if prev == "active" and (new_state == "idle" or new_state == "paused") then
    send_offline_signal()
  end
  
  if new_state ~= "active" then
    if idle_timer then 
      idle_timer:stop() 
      if not idle_timer:is_closing() then idle_timer:close() end
      idle_timer = nil
    end
  end
end

local function reset_idle_timer()
  if idle_timer then
    idle_timer:stop()
    if not idle_timer:is_closing() then idle_timer:close() end
  end
  idle_timer = vim.loop.new_timer()
  idle_timer:start(config.get().idleTimeout, 0, vim.schedule_wrap(function()
    if state == "active" then
      transition("idle")
    end
  end))
end

local function process_event(is_write)
  local now = current_time_ms()
  last_activity_time = now
  local was_idle = state == "idle"
  
  if state ~= "active" then
    transition("active")
  end
  
  reset_idle_timer()
  
  local buf = vim.api.nvim_get_current_buf()
  local current_file = vim.api.nvim_buf_get_name(buf)
  local file_changed = current_file ~= last_file
  
  local enough_time = (now - last_heartbeat_time) >= constants.HEARTBEAT_THROTTLE_MS
  
  if not was_idle and not file_changed and not is_write and not enough_time then
    return
  end
  
  last_heartbeat_time = now
  last_file = current_file
  
  -- Try get git root for project name
  local project_name = nil
  local git_dir = vim.fn.finddir('.git', current_file .. ';')
  if git_dir ~= '' then
    project_name = vim.fn.fnamemodify(git_dir, ':h:t')
  else
    project_name = vim.fn.fnamemodify(vim.fn.getcwd(), ':t')
  end
  
  local lang = vim.bo[buf].filetype
  if not lang or lang == "" then lang = nil end
  
  local hb = {
    timestamp = os.date("!%Y-%m-%dT%H:%M:%S.000Z"),
    language = lang,
    project = project_name,
    isWrite = is_write,
    activeSeconds = active_seconds_accum,
    sessionId = session_id,
    editorName = "neovim",
    os = vim.loop.os_uname().sysname
  }
  
  active_seconds_accum = 0
  queue.enqueue(sanitizer.sanitize(hb))
end

local function schedule_event(is_write)
  if state == "paused" or not config.get().enabled then return end
  
  if is_write then
    process_event(true)
    return
  end
  
  if debounce_timer then
    debounce_timer:stop()
    if not debounce_timer:is_closing() then debounce_timer:close() end
  end
  
  debounce_timer = vim.loop.new_timer()
  debounce_timer:start(50, 0, vim.schedule_wrap(function()
    process_event(false)
  end))
end

function M.init()
  session_id = generate_uuid()
  
  -- Set up autocmds
  local group = vim.api.nvim_create_augroup("GitCityTracker", { clear = true })
  
  vim.api.nvim_create_autocmd({"CursorMoved", "CursorMovedI", "TextChanged", "TextChangedI"}, {
    group = group,
    callback = function() schedule_event(false) end,
  })
  
  vim.api.nvim_create_autocmd("BufWritePost", {
    group = group,
    callback = function() schedule_event(true) end,
  })
  
  vim.api.nvim_create_autocmd("VimLeavePre", {
    group = group,
    callback = function()
      M.deactivate()
    end,
  })
  
  active_seconds_timer = vim.loop.new_timer()
  active_seconds_timer:start(1000, 1000, vim.schedule_wrap(function()
    if state ~= "active" then return end
    local now = current_time_ms()
    if last_activity_time > 0 and (now - last_activity_time) < config.get().idleTimeout then
      active_seconds_accum = active_seconds_accum + 1
    end
  end))
end

function M.set_paused(paused)
  if paused then
    transition("paused")
  else
    transition("active")
    -- Force immediate heartbeat
    process_event(false)
  end
end

function M.is_paused()
  return state == "paused"
end

function M.deactivate()
  if active_seconds_timer then
    active_seconds_timer:stop()
    if not active_seconds_timer:is_closing() then active_seconds_timer:close() end
  end
  queue.stop()
  send_offline_signal()
end

return M
