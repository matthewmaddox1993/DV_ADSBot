const path = require('node:path');
const { REST, Routes, Collection, InteractionContextType } = require('discord.js');
const { loadConfig, validateConfig } = require('./utils/config');
const { loadCommands } = require('./handlers/loadCommands');

function serializeCommands(commands, report = console.log) {
  const body = [];

  for (const command of commands.values()) {
    try {
      body.push(command.data.toJSON());
      report(`[OK] Validated /${command.data.name}`);
    } catch (error) {
      const name = command.data?.name || 'unknown';
      throw new Error(`Slash-command validation failed for /${name}. Check that the command, every subcommand, and every option has both a name and description.`, { cause: error });
    }
  }

  return body;
}

async function deployCommands(config, commands, { rest, report = console.log } = {}) {
  validateConfig(config, { deploy: true });
  let body = serializeCommands(commands, report);
  if (!body.length) throw new Error('Refusing to deploy an empty slash-command collection.');
  const api = rest || new REST({ version: '10' }).setToken(config.discord.token);

  if (config.discord.deployGlobally) {
    body = body.map((command) => ({ ...command, contexts: [InteractionContextType.Guild] }));
    await api.put(Routes.applicationCommands(config.discord.clientId), { body });
    report(`Deployed ${body.length} global slash commands.`);
    return { count: body.length, scope: 'global' };
  }

  await api.put(Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId), { body });
  report(`Deployed ${body.length} guild slash commands to ${config.discord.guildId}.`);
  return { count: body.length, scope: 'guild', guildId: config.discord.guildId };
}

async function runCli() {
  const config = loadConfig();
  const fakeClient = { commands: new Collection() };
  loadCommands(fakeClient, path.join(__dirname, 'commands'));
  return deployCommands(config, fakeClient.commands);
}

if (require.main === module) {
  runCli().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}

module.exports = { deployCommands, serializeCommands, runCli };
