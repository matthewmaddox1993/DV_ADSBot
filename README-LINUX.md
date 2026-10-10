# Derail Valley Discord Dispatcher for Linux

This guide covers the standalone Linux x64 build and running the bot from source.

## Before you begin

You need:

- A 64-bit Linux system
- Derail Valley with Advanced Dispatcher System (ADS) and its Web Host enabled on a reachable computer
- A Discord application and bot
- A dedicated ADS web profile for the bot
- Network access to Discord and the ADS Web Host

The standalone build includes Node.js. A source installation requires Node.js 22 or newer.

The Linux GitHub Release contains the standalone `DerailValleyBot` executable. It is a packaged application and is not an npm source installation. To use `npm start`, download the repository's source-code archive or clone the repository from GitHub instead.

## Option 1: Standalone Linux build

1. Download and extract the Linux release on the computer that will run the bot.
2. Open a terminal in the extracted directory.
3. Make the executable runnable and start it:

   ```bash
   chmod +x ./DerailValleyBot
   ./DerailValleyBot
   ```

4. Complete the setup prompts for the Discord token, application ID, server ID, and ADS login.
5. If ADS uses its private certificate authority, copy `dispatcher-ca.cer` into the `config` directory.

Your private settings are saved as `config/config.json`. Keep that file private because it contains the Discord token and ADS password.

Run `./DerailValleyBot` to start the bot later. Keep the process running while the bot is in use and press `Ctrl+C` to stop it.

## Option 2: Run from source

Download or clone the source files from the main GitHub repository—not the standalone Linux release package. Install Git and Node.js 22 or newer, then run:

```bash
git clone https://github.com/matthewmaddox1993/DV_ADSBot.git
cd DV_ADSBot
npm ci
cp config/config.example.json config/config.json
${EDITOR:-nano} config/config.json
chmod +x start.sh
./start.sh
```

You can use `npm start` instead of `./start.sh`.

If you downloaded a source archive instead of cloning with Git, extract it first, open a terminal in that directory, and begin with `npm ci`.

## Updating

The bot checks `version.json` on GitHub whenever it starts. A standalone build downloads the Linux archive, verifies its SHA-256 checksum, installs it after the current process exits, and restarts automatically.

A source Git clone fetches and fast-forwards to the configured release branch, runs `npm ci`, and restarts. Tracked files must be clean and the branch must not have diverged from GitHub.

If automatic updating is disabled or skipped, update a source clone manually with:

```bash
git pull --ff-only
npm ci
```

For a source archive or manual standalone update, download the newer release and replace the application files while preserving:

- `config/config.json`
- `config/dispatcher-ca.cer` and any other user-supplied certificate
- Everything under `data/`

Review `config/config.example.json` and [CHANGELOG.md](CHANGELOG.md) after updating.

## Running as a service

For an always-on installation, run the bot under a dedicated unprivileged user with systemd or another process supervisor. Set its working directory to the extracted project/release directory and start either `npm start` for a source installation or `./DerailValleyBot` for the standalone build.

Do not place the Discord token or ADS password directly in a world-readable service file. Keep them in `config/config.json` and restrict that file to the service account.

## Common Linux problems

- `Permission denied`: run `chmod +x ./DerailValleyBot` or `chmod +x ./start.sh`.
- `node: command not found`: install Node.js 22 or use the standalone build.
- ADS at `localhost` is reachable only when the bot and ADS Web Host run on the same computer; otherwise use the ADS host's LAN or VPN address.
- For TLS failures, copy the current `dispatcher-ca.cer` from the ADS host and make sure its hostname or IP matches `dispatcher.baseUrl`.
- If commands do not appear, confirm the Discord application and server IDs, then restart the bot.

See the main [README](README.md) for configuration, permissions, commands, and detailed troubleshooting.
