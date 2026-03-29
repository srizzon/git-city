if vim.g.loaded_gitcity == 1 then
  return
end
vim.g.loaded_gitcity = 1

vim.api.nvim_create_user_command('GitCityLogin', function()
  require("gitcity").login()
end, { desc = "Pulse: Connect" })

vim.api.nvim_create_user_command('GitCityLogout', function()
  require("gitcity").logout()
end, { desc = "Pulse: Disconnect" })

vim.api.nvim_create_user_command('GitCityTogglePause', function()
  require("gitcity").toggle_pause()
end, { desc = "Pulse: Toggle" })

vim.api.nvim_create_user_command('GitCityShowDashboard', function()
  require("gitcity").show_dashboard()
end, { desc = "Pulse: Open City" })
