const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { yesNo } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('signal')
    .setDescription('View railway signal state')
    .addSubcommand((s) => s.setName('list').setDescription('List signals').addIntegerOption((o) => o.setName('limit').setDescription('Maximum number of signals to show').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show signal details').addStringOption((o) => o.setName('id').setDescription('Signal ID').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction, ctx) {
    await interaction.respond(choices([...ctx.dispatcher.store.signals.values()], interaction.options.getFocused(), (x) => x.id, (x) => `${x.name || x.id} • ${x.aspect || 'signal'}`));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view signals.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const signals = [...ctx.dispatcher.store.signals.values()];
    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = signals.slice(0, limit).map((s) => `**${s.name || s.id}** \`${s.id}\` — ${s.aspect || 'Unknown'}${s.stop ? ' • STOP' : ''}${s.reserved ? ' • Reserved' : ''}`);
      return interaction.editReply({ embeds: [baseEmbed(`Signals (${signals.length})`).setDescription(lines.join('\n') || 'No signals available.')] });
    }
    const id = interaction.options.getString('id', true);
    const s = ctx.dispatcher.store.findMapItem('signals', id);
    if (!s) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Signal not found', `No signal matched \`${id}\`.`)] });
    const embed = baseEmbed(s.name || s.id);
    addFieldsSafe(embed, [
      { name: 'ID', value: s.id, inline: true },
      { name: 'Aspect', value: s.aspect || '—', inline: true },
      { name: 'Mode', value: s.mode || '—', inline: true },
      { name: 'Track', value: s.track || '—', inline: true },
      { name: 'Stop', value: yesNo(s.stop), inline: true },
      { name: 'Reserved', value: yesNo(s.reserved), inline: true },
      { name: 'Shunting', value: yesNo(s.shunting), inline: true },
      { name: 'Direction', value: s.direction !== undefined ? String(s.direction) : '—', inline: true },
      { name: 'Controller', value: s.controller || '—', inline: true },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
