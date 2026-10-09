const { ApplicationCommandOptionType, SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe, errorEmbed, COLORS } = require('../utils/embeds');
const { accessLevel } = require('../utils/permissions');
const { defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');

const ACCESS_OVERRIDES = {
  help: { default: 'Everyone' },
  board: { setup: 'Admin', refresh: 'Viewer', disable: 'Admin' },
  dispatcher: { status: 'Viewer', reconnect: 'Admin' },
  route: { plan: 'Dispatcher' },
  switch: { set: 'Dispatcher' },
  turntable: { set: 'Dispatcher' },
};

const COMMAND_NOTES = {
  block: 'Lists show 15 results by default. Block data is only available when ADS exposes native blocks.',
  board: '`refresh` needs Viewer access. `setup` and `disable` need Admin access. Disabling the board forgets it but does not delete its Discord message.',
  dispatcher: 'Use `status` to check the ADS connection and control authority. `reconnect` signs in again and starts a fresh WebSocket connection.',
  event: 'Shows the newest events first, with 10 results by default and at most 20.',
  help: 'Leave `command` empty for the full directory, or select a command to see every subcommand and option.',
  job: 'Use `active` to show only jobs in progress. Status and job ID options autocomplete from live ADS data. Lists show 15 results by default.',
  player: 'The player list shows at most 25 players.',
  route: '`preview` is read-only. `plan` creates an ADS route plan. For `via`, select track IDs one at a time in travel order; autocomplete keeps the comma-separated list.',
  signal: 'Lists show 15 results by default.',
  switch: 'Branch numbers shown in Discord start at 1. The bot converts them to the zero-based branch index expected by ADS.',
  train: 'Lists show 15 results by default. A train ID represents the detected consist.',
  turntable: 'The list shows at most 20 turntables. End numbers shown in Discord start at 1.',
  weather: 'Weather appears only when the current ADS capability snapshot exposes weather or rail-condition data.',
};

const OPTION_TYPES = {
  [ApplicationCommandOptionType.String]: 'text',
  [ApplicationCommandOptionType.Integer]: 'integer',
  [ApplicationCommandOptionType.Boolean]: 'true/false',
  [ApplicationCommandOptionType.User]: 'user',
  [ApplicationCommandOptionType.Channel]: 'channel',
  [ApplicationCommandOptionType.Role]: 'role',
  [ApplicationCommandOptionType.Mentionable]: 'mention',
  [ApplicationCommandOptionType.Number]: 'number',
  [ApplicationCommandOptionType.Attachment]: 'file',
};

function commandJson(command) {
  return command.data.toJSON();
}

function sortedCommands(ctx) {
  return [...ctx.client.commands.values()]
    .map(commandJson)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function commandEntries(command) {
  const options = command.options || [];
  const entries = [];

  for (const option of options) {
    if (option.type === ApplicationCommandOptionType.Subcommand) {
      entries.push({
        name: option.name,
        path: `/${command.name} ${option.name}`,
        description: option.description,
        options: option.options || [],
      });
    }

    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
      for (const subcommand of option.options || []) {
        entries.push({
          name: subcommand.name,
          path: `/${command.name} ${option.name} ${subcommand.name}`,
          description: subcommand.description,
          options: subcommand.options || [],
        });
      }
    }
  }

  if (entries.length) return entries;
  return [{
    name: null,
    path: `/${command.name}`,
    description: command.description,
    options: options.filter((option) => ![
      ApplicationCommandOptionType.Subcommand,
      ApplicationCommandOptionType.SubcommandGroup,
    ].includes(option.type)),
  }];
}

function requiredAccess(commandName, subcommandName) {
  const overrides = ACCESS_OVERRIDES[commandName] || {};
  return overrides[subcommandName] || overrides.default || 'Viewer';
}

function accessSummary(command) {
  const grouped = new Map();
  for (const entry of commandEntries(command)) {
    const level = requiredAccess(command.name, entry.name);
    if (!grouped.has(level)) grouped.set(level, []);
    if (entry.name) grouped.get(level).push(entry.name);
  }

  if (grouped.size === 1) return grouped.keys().next().value;
  return [...grouped.entries()]
    .map(([level, names]) => `${level}: ${names.join(', ')}`)
    .join(' | ');
}

function optionPlaceholder(option) {
  if (option.choices?.length) return option.choices.map((choice) => choice.value).join('|');
  if (option.type === ApplicationCommandOptionType.Boolean) return 'true|false';
  if (option.type === ApplicationCommandOptionType.Integer || option.type === ApplicationCommandOptionType.Number) return 'number';
  if (option.type === ApplicationCommandOptionType.User) return '@user';
  if (option.type === ApplicationCommandOptionType.Channel) return '#channel';
  if (option.type === ApplicationCommandOptionType.Role) return '@role';
  if (option.type === ApplicationCommandOptionType.Mentionable) return '@mention';
  if (option.type === ApplicationCommandOptionType.Attachment) return 'file';
  return option.name;
}

function optionUsage(option) {
  const text = `${option.name}:<${optionPlaceholder(option)}>`;
  return option.required ? text : `[${text}]`;
}

function optionDetails(option) {
  const traits = [OPTION_TYPES[option.type] || 'value', option.required ? 'required' : 'optional'];
  if (option.autocomplete) traits.push('autocomplete');
  if (option.min_value !== undefined || option.max_value !== undefined) {
    traits.push(`range ${option.min_value ?? '-infinity'} to ${option.max_value ?? 'infinity'}`);
  }
  if (option.choices?.length) traits.push(`choices: ${option.choices.map((choice) => choice.name).join(', ')}`);
  return `\`${option.name}\` (${traits.join(', ')}) - ${option.description}`;
}

function entryField(commandName, entry) {
  const usage = [entry.path, ...entry.options.map(optionUsage)].join(' ');
  const value = [entry.description, `**Usage:** \`${usage}\``];
  if (entry.options.length) value.push(`**Options:**\n${entry.options.map(optionDetails).join('\n')}`);
  return {
    name: `${entry.path} | ${requiredAccess(commandName, entry.name)}`,
    value: value.join('\n'),
    inline: false,
  };
}

function overviewEmbed(interaction, ctx, commandCount) {
  const level = accessLevel(interaction, ctx.config);
  const levelName = {
    none: 'No configured bot role',
    viewer: 'Viewer',
    dispatcher: 'Dispatcher',
    admin: 'Admin',
  }[level] || level;

  const embed = baseEmbed('Derail Valley Dispatcher Help', COLORS.neutral)
    .setDescription(`Reference for all ${commandCount} slash commands. Run \`/help command:<name>\` for exact syntax, options, limits, and access requirements.`);

  addFieldsSafe(embed, [
    {
      name: 'Quick start',
      value: '1. Run `/dispatcher status` to confirm the game connection.\n2. Use a `list` command to find an item.\n3. Use autocomplete when entering IDs.\n4. Use the matching `info` command for full details.',
      inline: false,
    },
    {
      name: 'How syntax is shown',
      value: '`name:<value>` is required. `[name:<value>]` is optional. Autocomplete options accept a suggested item or an exact ID.',
      inline: false,
    },
    {
      name: 'Permission levels',
      value: '**Viewer** reads live data. **Dispatcher** also plans routes and moves switches/turntables. **Admin** also manages the connection and board. Configured owner IDs count as Admin; Discord Administrator alone does not. `/help` is available to everyone in the configured server.',
      inline: false,
    },
    {
      name: 'Your access',
      value: `**${levelName}**. Control commands also require the bot's ADS profile to be a Dispatcher with current control authority.`,
      inline: false,
    },
    {
      name: 'Live data',
      value: 'Results come from the current Advanced Dispatcher System snapshot. Empty or unavailable data can mean ADS is disconnected, the game is not ready, or that capability is not exposed in this session.',
      inline: false,
    },
  ]);
  return embed;
}

function directoryEmbeds(commands) {
  const fields = commands.map((command) => ({
    name: `/${command.name}`,
    value: `${command.description}\n**Access:** ${accessSummary(command)}`,
    inline: false,
  }));
  const pages = [];

  for (let index = 0; index < fields.length; index += 25) {
    const page = baseEmbed(
      fields.length > 25 ? `Command Directory (${Math.floor(index / 25) + 1}/${Math.ceil(fields.length / 25)})` : 'Command Directory',
      COLORS.info,
    ).setDescription('Choose a command with `/help command:<name>` to see every subcommand and option.');
    addFieldsSafe(page, fields.slice(index, index + 25));
    pages.push(page);
  }

  return pages;
}

function detailedEmbed(command) {
  const embed = baseEmbed(`Help: /${command.name}`, COLORS.neutral)
    .setDescription(command.description);
  addFieldsSafe(embed, commandEntries(command).map((entry) => entryField(command.name, entry)));
  if (COMMAND_NOTES[command.name]) {
    addFieldsSafe(embed, [{ name: 'Notes', value: COMMAND_NOTES[command.name], inline: false }]);
  }
  return embed;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Explain every bot command, option, and permission level')
    .addStringOption((option) => option
      .setName('command')
      .setDescription('Command to explain; leave blank for the full directory')
      .setAutocomplete(true)),

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused();
    const commands = sortedCommands(ctx);
    return interaction.respond(choices(
      commands,
      focused,
      (command) => command.name,
      (command) => `/${command.name} - ${command.description}`,
    ));
  },

  async execute(interaction, ctx) {
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const commands = sortedCommands(ctx);
    const requested = interaction.options.getString('command')?.trim().toLowerCase();

    if (requested) {
      const command = commands.find((candidate) => candidate.name === requested.replace(/^\//, ''));
      if (!command) {
        return interaction.editReply({
          embeds: [errorEmbed('Unknown command', `No command matched \`${requested}\`. Run \`/help\` to see the complete directory.`)],
        });
      }
      return interaction.editReply({ embeds: [detailedEmbed(command)] });
    }

    return interaction.editReply({
      embeds: [overviewEmbed(interaction, ctx, commands.length), ...directoryEmbeds(commands)],
    });
  },
};
