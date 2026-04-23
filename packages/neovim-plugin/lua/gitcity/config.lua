local M = {}

M.options = {
  enabled = true,
  apiUrl = "https://www.thegitcity.com",
  privacy = {
    shareLanguage = true,
    shareProject = true,
    excludeProjects = {},
  },
  idleTimeout = 300, -- seconds
}

function M.setup(opts)
  if opts then
    -- Merge top level options
    M.options.enabled = opts.enabled ~= nil and opts.enabled or M.options.enabled
    M.options.apiUrl = opts.apiUrl or M.options.apiUrl
    M.options.idleTimeout = opts.idleTimeout or M.options.idleTimeout
    
    -- Merge privacy options
    if opts.privacy then
      M.options.privacy.shareLanguage = opts.privacy.shareLanguage ~= nil and opts.privacy.shareLanguage or M.options.privacy.shareLanguage
      M.options.privacy.shareProject = opts.privacy.shareProject ~= nil and opts.privacy.shareProject or M.options.privacy.shareProject
      M.options.privacy.excludeProjects = opts.privacy.excludeProjects or M.options.privacy.excludeProjects
    end
  end
end

function M.get()
  return M.options
end

return M
