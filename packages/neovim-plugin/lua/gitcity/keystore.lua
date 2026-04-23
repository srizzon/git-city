local M = {}
local api = vim.api

local data_dir = vim.fn.stdpath("data")
local key_file = data_dir .. "/gitcity_auth.json"

local cached_key = nil

-- Simple secure JSON reading
local function read_keyfile()
  local f = io.open(key_file, "r")
  if not f then return nil end
  local content = f:read("*a")
  f:close()
  
  if content and content ~= "" then
    local ok, parsed = pcall(vim.json.decode, content)
    if ok and type(parsed) == "table" then
      return parsed.api_key
    end
  end
  return nil
end

-- Simple secure JSON writing
local function write_keyfile(key)
  -- Ensure directory exists
  vim.fn.mkdir(data_dir, "p")
  
  local f = io.open(key_file, "w")
  if not f then 
    vim.notify("Git City: Could not write auth key to " .. key_file, vim.log.levels.ERROR)
    return false 
  end
  
  -- Set secure permissions if on unix (best effort in Lua without external dependencies)
  if vim.fn.has("unix") == 1 then
    os.execute("chmod 600 " .. vim.fn.shellescape(key_file) .. " 2>/dev/null")
  end
  
  local data = vim.json.encode({ api_key = key })
  f:write(data)
  f:close()
  return true
end

function M.init()
  cached_key = read_keyfile()
end

function M.get_key()
  return cached_key or read_keyfile()
end

function M.set_key(key)
  if write_keyfile(key) then
    cached_key = key
    return true
  end
  return false
end

function M.delete_key()
  if vim.fn.filereadable(key_file) == 1 then
    vim.fn.delete(key_file)
  end
  cached_key = nil
end

return M
