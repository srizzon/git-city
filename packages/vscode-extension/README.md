# Git City: Pulse

Your building's transmitter. When you code, it pulses. The city lights up.

## How it works

1. Generate your API key at [thegitcity.com](https://www.thegitcity.com) (click "coding now" in the top bar)
2. Install this extension
3. Run `Cmd+Shift+P` > "Pulse: Connect" and paste your key
4. Start coding. Your building starts transmitting in ~30 seconds.

When you're coding, your building glows in the city and you appear in the live feed. Stop coding and it fades after a few minutes.

## Commands

| Command | Description |
|---------|-------------|
| `Pulse: Connect` | Link your building to the city |
| `Pulse: Disconnect` | Unlink your building |
| `Pulse: Toggle` | Pause/resume your transmitter |
| `Pulse: Open City` | Open Git City in your browser |

## Status bar

The status bar shows your transmitter state:

- `$(broadcast) Pulse: Transmitting` - Your building is live in the city
- `$(circle-outline) Pulse: Standby` - Waiting for you to code
- `$(circle-slash) Pulse: Off` - Transmitter paused
- `$(plug) Pulse: Disconnected` - No API key set

Click the status bar item to toggle your transmitter on/off.

## Privacy

**You control what gets transmitted.**

| Data | Public? | Can disable? |
|------|---------|-------------|
| Username | Yes (your GitHub login) | No (identifies your building) |
| Language | Yes (e.g. "TypeScript") | Yes, via `gitCity.privacy.shareLanguage` |
| Project name | **No, never public** | Yes, via `gitCity.privacy.shareProject` |
| Branch name | **No, never public** | Excluded with project |
| File paths | **Never sent** | N/A |
| Code contents | **Never sent** | N/A |

**What is never collected:** file contents, code, diffs, clipboard, terminal output, file paths, or any intellectual property.

**Project names** are stored server-side for your personal analytics only. They are never shown to other users, never included in any public API, and never broadcast. You can disable sending them entirely.

### Privacy settings

Open VS Code Settings (`Cmd+,`) and search for "Git City":

- `gitCity.privacy.shareLanguage` - Share the programming language (default: on)
- `gitCity.privacy.shareProject` - Send project name for personal analytics (default: on)
- `gitCity.privacy.excludeProjects` - List of project names to never track (e.g. `["secret-project", "client-work"]`)
- `gitCity.enabled` - Disable all transmission entirely
- `gitCity.idleTimeout` - Seconds of inactivity before standby (default: 300)
