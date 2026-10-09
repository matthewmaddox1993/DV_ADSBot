const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { unixTime } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('event')
    .setDescription('View recent dispatcher event log entries')
    .addSubcommand((s) => s.setName('recent').setDescription('Show recent events').addIntegerOption((o) => o.setName('limit').setDescription('Maximum number of events to show').setMinValue(1).setMaxValue(20))),
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view dispatcher events.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const limit = interaction.options.getInteger('limit') || 10;
    const events = [...ctx.dispatcher.store.events].slice(-limit).reverse();
    const lines = events.map((e) => `${e.time ? unixTime(e.time) : ''} **${e.code || e.type || 'Event'}**${e.target ? ` • \`${e.target}\`` : ''}${e.detail ? ` — ${String(e.detail).slice(0, 160)}` : ''}`);
    return interaction.editReply({ embeds: [baseEmbed(`Recent Dispatcher Events (${events.length})`).setDescription(lines.join('\n') || 'No events have been received.')] });
  },
};
