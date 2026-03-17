local M = {}
local config = require("gitcity.config")

function M.sanitize(hb)
  local cfg = config.get()
  local sanitized = vim.deepcopy(hb)
  
  if not cfg.privacy.shareLanguage then
    sanitized.language = nil
  end
  
  if not cfg.privacy.shareProject then
    sanitized.project = nil
    sanitized.branch = nil
  end

  if sanitized.project and cfg.privacy.excludeProjects and #cfg.privacy.excludeProjects > 0 then
    local lower_proj = string.lower(sanitized.project)
    for _, exclude_item in ipairs(cfg.privacy.excludeProjects) do
      if string.find(lower_proj, string.lower(exclude_item), 1, true) then
        sanitized.project = nil
        sanitized.branch = nil
        break
      end
    end
  end

  return sanitized
end

return M
