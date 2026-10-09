const path = require('node:path');
const {
  Client,
  Collection,
  GatewayIntentBits,
  Events,
  ActivityType,
} = require('discord.js');
const { loadConfig, validateConfig } = require('./utils/config');
const { ensureConfig, waitForEnter } = require('./utils/setup');
const { loadCommands } = require('./handlers/loadCommands');
const { deployCommands } = require('./deploy-commands');
const DispatcherClient = require('./services/dispatcher/DispatcherClient');
const BoardService = require('./services/BoardService');
const AlertService = require('./services/AlertService');
const { replyError } = require('./utils/replies');
const { canView, isAllowedGuild } = require('./utils/permissions');
const logger = require('./utils/logger');

let client = null;

async function main() {
  await ensureConfig();
  const config = loadConfig();
  validateConfig(config);

  client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.commands = new Collection();
  loadCommands(client, path.join(__dirname, 'commands'));

  const dispatcher = new DispatcherClient(config);
  const board = new BoardService(client, dispatcher, config);
  const alerts = new AlertService(client, dispatcher, config);
  const context = { client, config, dispatcher, board, alerts };

  client.once(Events.ClientReady, async (readyClient) => {
    logger.info(`Discord ready as ${readyClient.user.tag}`);
    readyClient.user.setActivity(config.discord.activity || 'Derail Valley dispatch', { type: ActivityType.Watching });
    alerts.start();
    board.start();
    try {
      await dispatcher.start();
    } catch (error) {
      logger.error('Initial dispatcher connection failed', error.message);
      dispatcher.enabled = true;
      dispatcher.scheduleReconnect();
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (interaction.isAutocomplete()) {
        const command = client.commands.get(interaction.commandName);
        if (!command?.autocomplete) return interaction.respond([]);
        if (!isAllowedGuild(interaction, config)) return interaction.respond([]);
        if (interaction.commandName !== 'help' && !canView(interaction, config, { logDenied: false })) return interaction.respond([]);
        return command.autocomplete(interaction, context);
      }
      if (!interaction.isChatInputCommand()) return;
      const command = client.commands.get(interaction.commandName);
      if (!command) return;
      if (!isAllowedGuild(interaction, config)) {
        return replyError(interaction, 'Command unavailable', 'This bot is not configured for this Discord server.');
      }
      if (interaction.commandName !== 'help' && !canView(interaction, config)) {
        return replyError(interaction, 'Permission denied', 'You do not have a configured bot role.');
      }
      await command.execute(interaction, context);
    } catch (error) {
      logger.error(`Interaction failed: ${interaction.commandName || 'unknown'}`, error.stack || error.message);
      if (interaction.isRepliable()) {
        await replyError(interaction, 'Command failed', error.message || 'An unexpected error occurred.').catch(() => {});
      }
    }
  });

  async function shutdown(signal) {
    logger.info(`Received ${signal}; shutting down.`);
    board.stop();
    alerts.stop();
    await dispatcher.stop().catch(() => {});
    client.destroy();
    process.exit(0);
  }

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  logger.info('Validating and deploying Discord slash commands.');
  await deployCommands(config, client.commands, { report: (message) => logger.info(message) });
  await client.login(config.discord.token);
  logger.info('Bot is running. Press Ctrl+C to stop.');
}

process.on('unhandledRejection', (error) => logger.error('Unhandled rejection', error?.stack || String(error)));
process.on('uncaughtException', (error) => logger.error('Uncaught exception', error?.stack || String(error)));

main().catch(async (error) => {
  logger.error('Bot startup failed', error?.stack || error?.message || String(error));
  if (error?.status === 401 || error?.code === 'TokenInvalid') {
    logger.error('Discord rejected the bot token. Fix "token" in config/config.json (or delete that file to run setup again).');
  }
  client?.destroy();
  process.exitCode = 1;
  await waitForEnter();
});
