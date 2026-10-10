# Derail Valley Discord Dispatcher for Windows

This guide covers the standalone Windows executable and running the bot from source in Command Prompt or PowerShell.

## Before you begin

You need:

- Windows 10 or 11 x64
- Derail Valley with Advanced Dispatcher System (ADS) and its Web Host enabled
- A Discord application and bot
- A dedicated ADS web profile for the bot
- Network access to Discord and the ADS Web Host

The standalone executable includes Node.js. A source installation requires Node.js 22 or newer.

The Windows GitHub Release ZIP contains `DerailValleyBot.exe` for users who want to run the bot directly. It is a packaged application and is not an npm source installation. To use `npm start`, download the repository's source-code archive or clone the repository from GitHub instead.

## Option 1: Standalone executable

1. Download [`DerailValleyBot-1.0.0-win.zip`](https://github.com/matthewmaddox1993/DV_ADSBot/releases/download/v1.0.0/DerailValleyBot-1.0.0-win.zip) from the project's GitHub Releases page.
2. Extract the complete ZIP to a permanent folder. Do not run the executable from inside the ZIP viewer.
3. Run `DerailValleyBot.exe`.
4. Complete the setup prompts for the Discord token, application ID, server ID, and ADS login.
5. If ADS uses its private certificate authority, copy `dispatcher-ca.cer` into the `config` folder.

Your private settings are saved as `config\config.json`. Keep that file private because it contains the Discord token and ADS password.

To start the bot later, run `DerailValleyBot.exe` again. Keep its console window open while the bot is in use. Press `Ctrl+C` or close the window to stop it.

## Option 2: Run from source in Command Prompt

Download or clone the source files from the main GitHub repository—not the standalone Windows release ZIP. Install Node.js 22 or newer, then run:

```bat
git clone https://github.com/matthewmaddox1993/DV_ADSBot.git
cd DV_ADSBot
npm ci
copy config\config.example.json config\config.json
notepad config\config.json
start.bat
```

You can use `npm start` instead of `start.bat`. The batch file keeps the window open so startup errors remain visible.

If you downloaded a source ZIP instead of cloning with Git, extract it first, open Command Prompt in that folder, and begin with `npm ci`.

## PowerShell equivalents

```powershell
git clone https://github.com/matthewmaddox1993/DV_ADSBot.git
Set-Location .\DV_ADSBot
npm ci
Copy-Item .\config\config.example.json .\config\config.json
notepad .\config\config.json
npm start
```

## Updating

The bot checks `version.json` on GitHub whenever it starts. A standalone executable downloads the Windows ZIP, verifies its SHA-256 checksum, installs it after the current process exits, and restarts automatically.

A source Git clone fetches and fast-forwards to the configured release branch, runs `npm ci`, and restarts. Tracked files must be clean and the branch must not have diverged from GitHub.

If automatic updating is disabled or skipped, update a source clone manually with:

```bat
git pull --ff-only
npm ci
```

For a source ZIP or manual standalone update, download the newer release and replace the application files while preserving:

- `config\config.json`
- `config\dispatcher-ca.cer` and any other user-supplied certificate
- Everything under `data\`

Review `config\config.example.json` and [CHANGELOG.md](CHANGELOG.md) after updating.

## Common Windows problems

- If `node` or `npm` is not recognized, install Node.js 22 and open a new terminal.
- If Windows blocks a downloaded executable, confirm it came from the official GitHub Releases page before allowing it.
- If Discord rejects the token, update `discord.token` in `config\config.json`.
- If ADS TLS validation fails, copy the current `dispatcher-ca.cer` from the ADS host and make sure its hostname or IP matches `dispatcher.baseUrl`.
- If commands do not appear, confirm the application and server IDs, then restart the bot.

See the main [README](README.md) for configuration, permissions, commands, and detailed troubleshooting.
