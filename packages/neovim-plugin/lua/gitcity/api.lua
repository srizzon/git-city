local M = {}
local config = require("gitcity.config")
local keystore = require("gitcity.keystore")

-- Uses curl to send requests as Neovim's standard way of async HTTP requests without extra deps
local function curl_request(url, method, headers, json_body, callback)
  local args = { "curl", "-s", "-X", method }
  
  for k, v in pairs(headers) do
    table.insert(args, "-H")
    table.insert(args, string.format("%s: %s", k, v))
  end
  
  -- Add connection timeout to 10s
  table.insert(args, "--connect-timeout")
  table.insert(args, "10")
  table.insert(args, "-w")
  table.insert(args, "%{http_code}")
  
  -- For body
  table.insert(args, "-d")
  table.insert(args, json_body)
  table.insert(args, url)
  
  -- Execute async via vim.system (Neovim 0.10+)
  if vim.system then
    vim.system(args, { text = true }, function(obj)
      local status = tonumber(obj.stdout:sub(-3))
      if callback then
        callback(status, obj.stdout:sub(1, -4), obj.stderr)
      end
    end)
  else
    -- Fallback for Neovim 0.9.x using vim.fn.jobstart
    vim.fn.jobstart(args, {
      stdout_buffered = true,
      on_stdout = function(_, data)
        if data and #data > 0 and callback then
          local output = table.concat(data, "\n")
          local status_str = output:match("(%d%d%d)$")
          local status = tonumber(status_str)
          callback(status, output:sub(1, -4), nil)
        end
      end
    })
  end
end

-- Sends a batch of heartbeats
function M.send_heartbeats(heartbeats, callback)
  local key = keystore.get_key()
  if not key or not heartbeats or #heartbeats == 0 then
    if callback then callback(false) end
    return
  end
  
  local url = config.get().apiUrl .. "/api/heartbeats"
  local body = vim.json.encode(heartbeats)
  local headers = {
    ["Content-Type"] = "application/json",
    ["X-API-Key"] = key
  }
  
  -- Note: We omit complex backoff retry logic here to keep the plugin lightweight.
  -- Neovim handles curl asynchronously, so we make a best-effort HTTP request.
  curl_request(url, "POST", headers, body, function(status, _, err)
    if err and type(err) == "string" and #err > 0 then
      if callback then callback(false) end
      return
    end
    
    local success = type(status) == "number" and status >= 200 and status < 300
    if callback then callback(success) end
  end)
end

-- Used mainly for explicit offline signals quickly
function M.send_direct(heartbeat, cached_key, callback)
  local key = cached_key or keystore.get_key()
  if not key then 
    if callback then callback(false) end
    return 
  end
  
  local url = config.get().apiUrl .. "/api/heartbeats"
  local body = vim.json.encode({ heartbeat })
  local headers = {
    ["Content-Type"] = "application/json",
    ["X-API-Key"] = key
  }
  
  curl_request(url, "POST", headers, body, function(status, _, _)
    local success = type(status) == "number" and status >= 200 and status < 300
    if callback then callback(success) end
  end)
end

return M
