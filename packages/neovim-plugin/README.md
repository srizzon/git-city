# gitcity.nvim

Keep your city alive inside [Neovim](https://neovim.io/). When you code, your building glows and powers the signal on [The Git City](https://www.thegitcity.com).

This is a Neovim port of the official [VS Code Git City Pulse](https://github.com/srizzon/git-city/tree/main/packages/vscode-extension) extension. Privacy-first: you control what gets shared.

## Features
- Minimal overhead using debounced `CursorMoved`, `TextChanged`, and `BufWritePost` autocommands to track your pulse.
- Asynchronous API communication using `curl` directly via `vim.system()` or `vim.fn.jobstart()`.
- Built-in `vim.ui.input` prompt to securely setup your API key.

## Installation

### lazy.nvim
```lua
{
  "srizzon/gitcity.nvim", -- Update with your GitHub repo once published
  config = function()
    require("gitcity").setup({
      -- Options go here
    })
  end
}
```

### vim-plug
```vim
Plug 'srizzon/gitcity.nvim'

" After plug#end()
lua << EOF
require("gitcity").setup({
  -- Options go here
})
EOF
```

### packer.nvim
```lua
use {
  "srizzon/gitcity.nvim",
  config = function()
    require("gitcity").setup({
      -- Options go here
    })
  end
}
```

## Configuration

You can customize Git City by overriding the default settings in `setup()`:

```lua
require("gitcity").setup({
  enabled = true,
  apiUrl = "https://www.thegitcity.com",
  idleTimeout = 300, -- 5 mins of no typing = idle
  privacy = {
    shareLanguage = true, -- Share the programming language publicly
    shareProject = true,  -- Send project name for personal analytics
    excludeProjects = {}, -- E.g. { "secret-project", "client-work" }
  }
})
```

## Commands

- `:GitCityLogin` - Prompts for your Git City API key.
- `:GitCityLogout` - Removes your API key.
- `:GitCityTogglePause` - Pauses or resumes pulse tracking.
- `:GitCityShowDashboard` - Opens [The Git City](https://www.thegitcity.com) in your browser.

## Requirements
- Neovim 0.9.0+
- `curl` installed and in `$PATH`
