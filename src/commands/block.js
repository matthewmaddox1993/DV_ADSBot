const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { num, yesNo } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('block')
    .setDescription('View track blocks and occupancy')
    .addSubcommand((s) => s.setName('list').setDescription('List blocks').addIntegerOption((o) => o.setName('limit').setDescription('Maximum number of blocks to show').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show block details').addStringOption((o) => o.setName('id').setDescription('Block ID').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction, ctx) {
    await interaction.respond(choices([...ctx.dispatcher.store.blocks.values()], interaction.options.getFocused(), (x) => x.id, (x) => `${x.name || x.id} • ${x.occupied ? 'occupied' : 'clear'}`));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view blocks.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const blocks = [...ctx.dispatcher.store.blocks.values()];
    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = blocks.slice(0, limit).map((b) => `**${b.name || b.id}** \`${b.id}\` — ${b.occupied ? '🔴 occupied' : '🟢 clear'}${b.reserved ? ' • reserved' : ''}`);
      return interaction.editReply({ embeds: [baseEmbed(`Blocks (${blocks.length})`).setDescription(lines.join('\n') || 'No native blocks are currently available.')] });
    }
    const id = interaction.options.getString('id', true);
    const b = ctx.dispatcher.store.findMapItem('blocks', id);
    if (!b) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Block not found', `No block matched \`${id}\`.`)] });
    const embed = baseEmbed(b.name || b.id);
    addFieldsSafe(embed, [
      { name: 'ID', value: b.id, inline: true },
      { name: 'Source', value: b.source || '—', inline: true },
      { name: 'Quality', value: b.quality || '—', inline: true },
      { name: 'Occupied', value: yesNo(b.occupied), inline: true },
      { name: 'Reserved', value: yesNo(b.reserved), inline: true },
      { name: 'Length', value: `${num(b.length, 1)} m`, inline: true },
      { name: 'Tracks', value: (b.tracks || []).join(', ') || '—', inline: false },
      { name: 'Trains', value: (b.trains || []).join(', ') || '—', inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
