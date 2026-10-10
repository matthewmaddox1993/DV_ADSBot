# Derail Valley Discord Dispatcher

A self-hosted Discord bot that brings live **Derail Valley** railway information and selected dispatcher controls into your server through the **Advanced Dispatcher System (ADS)** web API.

The bot uses ADS's authenticated HTTP API and WebSocket stream directly—there is no screen scraping. It provides slash commands, live autocomplete, role-based access, an automatically refreshed dispatch board, and optional connection/event alerts.

> [!IMPORTANT]
> This is a companion application, not a standalone in-game mod. Derail Valley and the Advanced Dispatcher System Web Host must be running for live data and controls to be available.

## Features

- Live trains, players, jobs, signals, blocks, routes, switches, turntables, events, and weather/rail conditions when ADS exposes them
- Route previews plus verified route-plan, switch, and turntable control commands
- Three bot access levels: Viewer, Dispatcher, and Admin
- Live Discord dispatch board with configurable refresh timing
- Optional ADS connection and dispatcher-event alerts
- Autocomplete backed by the current ADS snapshot
- Automatic session renewal, reconnect, state resynchronization, and gzip WebSocket support
- HTTPS/WSS certificate verification with support for the ADS public CA certificate
- Guild-specific or global Discord command registration, with runtime access locked to one configured server
- No privileged Discord gateway intents required

## Requirements

- [Node.js](https://nodejs.org/en/download) 22 or newer (npm is included)
- Derail Valley with Advanced Dispatcher System and its Web Host enabled
- A dedicated named ADS web profile for the bot
- A Discord server where you can install an application
- Network access from the bot host to Discord and the ADS Web Host

The bot may run on the Derail Valley computer or another machine on the same network. It must remain running while you want Discord commands, the board, or alerts to work.

## Quick start

Choose the guide for the computer that will run the bot:

- [Windows installation and operation](README-WINDOWS.md)
- [Linux installation and operation](README-LINUX.md)

The GitHub Release download contains a standalone executable and does not require Node.js or npm. If you want to run the bot with `npm start`, download or clone the repository's source files from GitHub instead of using the standalone release package, then install Node.js 22 or newer and run `npm ci`.

Both platform guides cover these two installation methods. In either case, first create a Discord application and a dedicated ADS web profile, then keep the generated `config/config.json` private.

## Discord setup

### 1. Create and install the bot

In the Discord Developer Portal:

1. Create an application.
2. On **General Information**, copy the **Application ID** into `discord.clientId`.
3. On **Bot**, create/reset and copy the token into `discord.token`.
4. On **Installation**, configure a server/guild install and add the bot to your Discord server.
5. Select the `bot` and [`applications.commands`](https://docs.discord.com/developers/docs/interactions/slash-commands) scopes if the portal presents both.

The bot does not need Discord Administrator, Manage Channels, Manage Messages, or privileged gateway intents. Grant these channel permissions where the bot will be used:

- View Channels
- Send Messages
- Embed Links
- Read Message History (required to find and update a saved dispatch-board message)

Members also need **Use Application Commands** in channels where commands should be available. The configured alerts and board channels must allow the bot to send messages and embeds.

### 2. Collect Discord IDs

Enable **User Settings → Advanced → Developer Mode**, then use Discord's **Copy ID** action to collect:

- Server ID → `discord.guildId`
- Your user ID → `permissions.ownerUserIds`
- Role IDs → the appropriate permission arrays
- Optional alerts channel ID → `channels.alerts`

Discord IDs must be quoted strings in JSON. Do not enter them as numbers.

### 3. Choose command deployment scope

Keep `discord.deployGlobally` set to `false` for initial setup. Guild commands are registered only in `discord.guildId` and are normally easier to iterate on.

Setting it to `true` registers commands globally, but this does **not** make the bot multi-server: runtime checks still reject commands outside the one configured `guildId`, and `guildId` remains required.

Changing this setting only deploys to the newly selected scope; it does not remove commands already registered in the other scope. If you switch after a deployment, remove the stale registration through Discord's [application-command API](https://docs.discord.com/developers/docs/interactions/slash-commands) so users do not see duplicate guild and global entries.

## Advanced Dispatcher System setup

### Use a dedicated profile

Create a named ADS web profile used only by this bot. An ADS profile permits one independent active session, so sharing the same profile with a browser can invalidate either session.

- Use a **Viewer** ADS profile for read-only commands.
- Use a **Dispatcher** ADS profile for `/switch set`, `/turntable set`, and `/route plan`.

The included command set does not require a Local Owner/admin locomotive profile. Profile names are case-sensitive.

### Set the ADS address

When the bot runs on the game computer, use:

```json
"baseUrl": "https://localhost:7246"
```

When it runs on another computer, use the hostname or LAN/VPN address advertised by the ADS Web Host, for example:

```json
"baseUrl": "https://192.168.1.50:7246"
```

The remote address must be present in the ADS server certificate. If the host address changes, restart/reconfigure the ADS Web Host so it can issue a matching certificate. A firewall may also need to allow the configured ADS port (7246 by default).

### Trust the ADS certificate

ADS creates a public CA certificate for HTTPS/WSS clients. On the Derail Valley host it is normally found under:

```text
Mods/AdvancedDispatcherSystem/Host/data/dispatcher-ca.cer
```

Copy that public file to:

```text
config/dispatcher-ca.cer
```

The bot accepts PEM or DER certificate encoding and logs the loaded certificate's SHA-256 fingerprint. Never copy or distribute `server.pfx`, a private key, or any other private certificate bundle.

For a short diagnostic test only, `dispatcher.rejectUnauthorized` can be set to `false`. That disables certificate and hostname verification; turn it back on after diagnosing the connection.

## Configuration

The complete copy-ready template is [`config/config.example.json`](config/config.example.json). The live file is always `config/config.json`.

Configuration is strict JSON:

- Comments and trailing commas are not supported.
- Discord IDs must be strings in double quotes.
- Times are in milliseconds unless a field explicitly says seconds.
- Relative file paths are resolved from the project root.
- `config/config.json` contains secrets and is intentionally excluded from source control.

### `discord`

| Key | Type / template value | Description |
|---|---|---|
| `token` | string, required | Secret bot token from the Developer Portal. Never publish it. |
| `clientId` | string, required | Discord application ID. |
| `guildId` | string, required | The only Discord server in which the bot accepts commands. Required even for global deployment. |
| `deployGlobally` | boolean, `false` | `false` registers commands only in `guildId`; `true` registers globally but does not remove the runtime guild restriction. |
| `ephemeralResponses` | boolean, `true` | When `true`, normal command replies are visible only to the user who ran them. |
| `activity` | string, `"Derail Valley dispatch"` | Text shown in the bot's Discord activity. |

### `dispatcher`

| Key | Type / template value | Description |
|---|---|---|
| `baseUrl` | URL, required | ADS Web Host origin, normally `https://localhost:7246` locally or the advertised host address remotely. |
| `username` | string, required | Dedicated ADS named-profile username. |
| `password` | string, required | Secret password for that ADS profile. |
| `caFile` | path, `./config/dispatcher-ca.cer` | Public ADS CA certificate. Omitting it disables custom-CA loading; for ADS's private CA, supplying this file is recommended. An empty value is appropriate only when Node's active CA set already trusts the host or verification is intentionally disabled. |
| `rejectUnauthorized` | boolean, `true` | Verifies the HTTPS/WSS certificate and hostname. Only exact `false` disables verification. |
| `connectTimeoutMs` | number, `10000` | Timeout for ordinary ADS HTTP connections and the WebSocket handshake. |
| `commandTimeoutMs` | number, `22000` | Receipt timeout for ordinary dispatcher control commands. |
| `longCommandTimeoutMs` | number, `240000` | Receipt timeout for long-running route commands. |
| `reconnectMinMs` | number, `1000` | Initial automatic reconnect delay. |
| `reconnectMaxMs` | number, `15000` | Maximum reconnect delay after exponential backoff. Keep this at or above `reconnectMinMs`. |

Route previews use a 30-second request timeout, and turntable commands use a fixed 50-second receipt timeout.

### `permissions`

| Key | Type / template value | Description |
|---|---|---|
| `allowEveryoneView` | boolean, `false` | Grants Viewer access to everyone only when all three role-ID arrays are empty. Owner user IDs may still be configured. |
| `ownerUserIds` | string array, placeholder | Discord user IDs that always receive bot Admin access. Replace the example placeholder with your ID, or remove it. |
| `viewerRoleIds` | string array, `[]` | Roles allowed to run read-only commands. |
| `dispatcherRoleIds` | string array, `[]` | Roles with Viewer access plus switch, turntable, and route-plan controls. |
| `adminRoleIds` | string array, `[]` | Roles with Dispatcher access plus bot connection and board management. |

Permission lists fail closed. If the role arrays are empty and `allowEveryoneView` is `false`, only configured owner IDs can use commands other than `/help`.

Additional rules:

- Put a role ID in only its highest tier; access inherits downward.
- Role arrays cannot overlap or contain duplicate IDs.
- Do not place the server/`@everyone` ID in a role array.
- `ownerUserIds` contains user IDs, not role IDs.
- Discord server ownership and Discord's built-in Administrator permission do not bypass these lists.
- Discord may display a slash command to someone whom the bot later denies; the runtime check is authoritative.

### `channels`, `board`, and `alerts`

| Key | Type / template value | Description |
|---|---|---|
| `channels.alerts` | string, `""` | Optional Discord text-channel ID for alerts. Leave empty to send none. |
| `board.enabled` | boolean, `true` | Enables scheduled refresh of a board previously created with `/board setup`. Omitting it disables the scheduler; manual board commands still work. |
| `board.refreshSeconds` | number, `15` | Board refresh interval. Values below 10 are clamped to 10 seconds. |
| `alerts.enabled` | boolean, `false` | Master switch for alert listeners. Also set `channels.alerts` before enabling it. |
| `alerts.connectionChanges` | boolean, `true` | Posts ADS connected/offline transitions when enabled; omitted values are disabled. |
| `alerts.dispatcherEvents` | boolean, `true` | Posts dispatcher events received from ADS when enabled; omitted values are disabled. |

The board's channel and message IDs are created by `/board setup` and stored automatically in `data/board.json`; do not add them to the config.

### `updates`

| Key | Type / template value | Description |
|---|---|---|
| `enabled` | boolean, `true` | Checks GitHub at startup and installs a newer semantic version automatically. Set this to `false` to opt out. |
| `manifestUrl` | HTTPS URL | Public `version.json` location. Keep the template URL unless you maintain a fork. |

Source Git clones update only when tracked files are clean and the release branch can be fast-forwarded. Standalone builds download the matching platform archive, verify its SHA-256 checksum, install it after the running process exits, and restart. Private configuration, certificates, and runtime data are preserved.

### Debug logging

Set the `DEBUG` environment variable to any non-empty value before launch to enable extra console logging. Unset it again for normal operation. There is no Discord log-channel setting in this release.

## Access model

| Level | Capabilities |
|---|---|
| Everyone in the configured guild | `/help` |
| Viewer | Live status and all read/list/info commands, route preview, event history, weather, and manual board refresh |
| Dispatcher | All Viewer capabilities plus route planning and switch/turntable control |
| Admin / configured owner | All Dispatcher capabilities plus ADS reconnect and board setup/disable |

Control actions require permission in both places: the Discord member needs Dispatcher/Admin access in this bot, and the bot's ADS profile needs Dispatcher access with current control authority.

## Commands

Square brackets below indicate optional options. Run `/help` in Discord for the built-in directory, or `/help command:<name>` for exact syntax and limits.

| Command | Purpose | Access |
|---|---|---|
| `/help [command]` | Show the command directory or detailed help for one command. | Everyone |
| `/dispatcher status` | Show ADS connection, account, authority, health, and snapshot state. | Viewer |
| `/dispatcher reconnect` | Re-authenticate and open a fresh ADS WebSocket connection. | Admin |
| `/train list [limit]`, `/train info id:<train>` | List detected consists or inspect one train. | Viewer |
| `/player list`, `/player info id:<player>` | View multiplayer players reported by ADS. | Viewer |
| `/job list [status] [limit]`, `/job active [limit]`, `/job info id:<job>` | Browse jobs/orders and current work. | Viewer |
| `/signal list [limit]`, `/signal info id:<signal>` | View signal state. | Viewer |
| `/block list [limit]`, `/block info id:<block>` | View native blocks and occupancy when available. | Viewer |
| `/switch list [limit]`, `/switch info id:<switch>` | View turnout state. | Viewer |
| `/switch set id:<switch> branch:<number>` | Move a turnout. Branch numbers displayed in Discord start at 1. | Dispatcher |
| `/turntable list`, `/turntable info id:<turntable>` | View turntable state and selectable ends. | Viewer |
| `/turntable set id:<turntable> end:<number>` | Align a turntable. End numbers displayed in Discord start at 1. | Dispatcher |
| `/route list [active] [limit]`, `/route info id:<route>` | Browse current and completed routes. | Viewer |
| `/route preview from:<track> to:<track> [train] [via]` | Preview a route without creating it. | Viewer |
| `/route plan from:<track> to:<track> [train] [via]` | Create an ADS route plan. | Dispatcher |
| `/event recent [limit]` | Show the newest received dispatcher events. | Viewer |
| `/weather` | Show weather/rail conditions when exposed by ADS. | Viewer |
| `/board setup channel:<channel>` | Create and remember a live dispatch-board message. | Admin |
| `/board refresh` | Refresh the remembered board immediately. | Viewer |
| `/board disable` | Forget the saved board; the existing Discord message is not deleted. | Admin |

Route fields provide live autocomplete. For `via`, select track IDs one at a time in travel order; each selection preserves the existing comma-separated list.

## Live board and alerts

The dispatch board summarizes the ADS connection, account authority, trains, players, active jobs/routes, occupied blocks, signals, tracks, cars, state age, and weather when present.

Create it with:

```text
/board setup channel:#dispatch-board
```

The bot process needs write access to the `data` folder. If the selected channel or message is later deleted, run `/board setup` again.

To enable alerts, set a channel and turn on the master switch:

```json
"channels": {
  "alerts": "PASTE_ALERT_CHANNEL_ID_HERE"
},
"alerts": {
  "enabled": true,
  "connectionChanges": true,
  "dispatcherEvents": true
}
```

## Running and maintenance

| Command | Use |
|---|---|
| `npm start` | Validate/deploy commands and start the bot. |
| `npm run dev` | Start with Node's file-watching mode for development. |
| `npm run deploy` | Validate and deploy slash commands without starting the bot. A complete valid config is still required. |
| `npm run check` | Syntax-check the source and validate every slash-command definition. |
| `npm run test:updater` | Test version comparison and update-manifest validation. |

At every normal startup, the bot checks the public [`version.json`](version.json). A failed check or update is logged and does not prevent the installed version from starting. Set `updates.enabled` to `false` for fully manual updates.

## Troubleshooting

### The bot reports a missing config or invalid JSON

Copy `config/config.example.json` to `config/config.json`. Make sure every placeholder is replaced or removed, all keys/strings use double quotes, and there are no comments or trailing commas.

### Commands do not appear in Discord

- Confirm `discord.clientId` and `discord.guildId` are correct.
- Confirm the application was installed in that server with bot/application-command access.
- Restart the bot and look for `Deployed ... slash commands` in the console.
- Keep `deployGlobally` set to `false` while setting up.
- Run `npm run deploy` after correcting the config if you want to retry deployment separately.

### A member receives `Permission denied`

- Confirm the command was run in the configured `guildId`.
- Copy the member's actual role IDs with Discord Developer Mode and compare them with the configured arrays.
- Make sure IDs are quoted strings and each role appears in only one tier.
- Remember that Discord Administrator/server owner status is not an automatic bypass.
- If using `allowEveryoneView`, all three role arrays must be empty for it to take effect.

### ADS login returns HTTP 401

The ADS profile name or password is incorrect. Profile names are case-sensitive.

### ADS login returns HTTP 403

ADS is reachable but refused the session. Use a dedicated bot profile and sign that profile out of any browser session. Restarting the ADS Web Host invalidates old web sessions. The console includes the response code/text supplied by ADS when available.

### ADS login returns HTTP 429

ADS is rate-limiting repeated login attempts. Stop the bot, fix the underlying credentials/session issue, wait for the limit to clear, and try again.

### TLS or certificate validation fails

- Copy `dispatcher-ca.cer` from the same ADS host the bot connects to.
- Verify `dispatcher.caFile` points to that public certificate.
- Use a hostname/IP present in the server certificate.
- Restart the ADS Web Host after changing its network address.
- Use `rejectUnauthorized: false` only long enough to confirm that certificate validation is the cause.

### The WebSocket repeatedly disconnects

- Confirm Derail Valley and the ADS Web Host are running.
- When the bot is remote, do not point it at its own `localhost`.
- Confirm the firewall permits the ADS port.
- Check that the CA certificate and hostname match the current ADS host.
- Do not use the bot's named ADS profile in a browser at the same time.

### A control command returns `FORBIDDEN`

The Discord user must have Dispatcher/Admin access, the ADS bot profile must be a Dispatcher rather than a Viewer, and ADS must currently report control authority.

### A command returns `GAME_DISCONNECTED`

The ADS WebSocket is offline or ADS does not currently have game authority/state. Run `/dispatcher status`, then use `/dispatcher reconnect` after correcting the game/host connection.

### Board or alert messages fail

Confirm the bot can view the target channel, send messages, embed links, and read message history. If a saved board message was deleted, run `/board setup` again.

## Compatibility and integration details

No formally tested Derail Valley/ADS version pair is recorded for this source release. Compatibility is therefore based on the interface contract below; include both installed versions in any support report.

This release expects the authenticated ADS interface to provide:

- `POST /api/login` and `POST /api/logout`
- `GET /api/me`
- `GET /api/health`
- `GET /api/route`
- `WS/WSS /api/ws`
- WebSocket `snapshot`, `delta`, `routes`, `event`, `capabilities`, and `receipt` messages
- `setSwitch`, `setTurntable`, and `planRoute` command kinds

ADS capabilities and data shapes may vary by game/mod version and session. Commands report unavailable or empty data when the current snapshot does not expose a capability. If a stream sequence becomes inconsistent, the bot clears its resume cursor and reconnects for a fresh snapshot.

The project intentionally does not send undocumented reservation/cancellation payloads.

## Security and privacy

- Never publish `config/config.json`, the Discord token, or the ADS password.
- Never distribute `.pfx`, `.p12`, `.key`, or other private-key files.
- The ADS `.cer` file used here is a public CA certificate; each installation should supply its own.
- Keep TLS verification enabled and grant both Discord and ADS accounts only the access they need.
- The session cookie remains in memory; board channel/message IDs are stored in `data/board.json`.
- Permission-denial diagnostics may write Discord user and role IDs to the local console.
- No separate analytics or telemetry service is implemented; network traffic is between this process, Discord, and the configured ADS host.

If a config was ever shared, reset the Discord bot token and change the ADS profile password. If a private certificate bundle was shared, replace the ADS server certificate/private key.

## Project layout

```text
config/
  config.example.json   Public configuration template
  config.json           User-created private configuration (not shipped)
  dispatcher-ca.cer     User-supplied public ADS CA (not shipped)
data/
  .gitkeep
  board.json            Runtime board state (created automatically)
scripts/
  build.js             Build standalone releases
  check-project.js
src/
  commands/             Discord slash commands
  handlers/             Command loading
  services/             ADS client, alerts, and board services
  utils/                Config, permissions, embeds, logging, and formatting
  deploy-commands.js
  index.js
CHANGELOG.md           Release history
README-LINUX.md        Linux installation and operation
README-WINDOWS.md      Windows installation and operation
```

## Getting support

When reporting a problem on the download page or project issue tracker, include:

- Bot release version (currently `1.0.0`)
- Node.js version from `node --version`
- Derail Valley and ADS versions
- Relevant console output
- Whether the bot and game run on the same computer
- A redacted config showing structure and non-secret options

Remove tokens, passwords, cookies, private certificates, and identifying IDs before posting logs or config files.

## Packaging a public release

Create releases from a clean, allowlisted staging folder—not by compressing a working installation. Do not include:

- `node_modules/`
- `config/config.json`
- Any certificate/private-key files under `config/`
- `data/board.json`
- Logs or debug output

Keep `package.json` and `package-lock.json` in the release so users can install the pinned dependencies with `npm ci`. Users provide their own config and ADS public CA.

## License

Released under the [MIT License](LICENSE).
