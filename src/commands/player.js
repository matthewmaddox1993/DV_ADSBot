const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { num, yesNo } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('player')
    .setDescription('View multiplayer players reported by the dispatcher')
    .addSubcommand((s) => s.setName('list').setDescription('List players'))
    .addSubcommand((s) => s.setName('info').setDescription('Show player details').addStringOption((o) => o.setName('id').setDescription('Player ID').setRequired(true).setAutocomplete(true))),
  async autocomplete(interaction, ctx) {
    await interaction.respond(choices([...ctx.dispatcher.store.players.values()], interaction.options.getFocused(), (x) => x.id, (x) => `${x.name || x.id} • ${x.id}`));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view players.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const players = [...ctx.dispatcher.store.players.values()];
    if (sub === 'list') {
      const lines = players.slice(0, 25).map((p) => `**${p.name || p.id}** \`${p.id}\` — ${p.host ? 'Host' : 'Client'}${p.car ? ` • car ${p.car}` : ''}`);
      return interaction.editReply({ embeds: [baseEmbed(`Players (${players.length})`).setDescription(lines.join('\n') || 'No players are currently reported.')] });
    }
    const id = interaction.options.getString('id', true);
    const p = ctx.dispatcher.store.findMapItem('players', id);
    if (!p) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Player not found', `No player matched \`${id}\`.`)] });
    const embed = baseEmbed(p.name || p.id);
    addFieldsSafe(embed, [
      { name: 'Player ID', value: p.id, inline: true },
      { name: 'Host', value: yesNo(p.host), inline: true },
      { name: 'Car', value: p.car || '—', inline: true },
      { name: 'X', value: num(p.x, 1), inline: true },
      { name: 'Z', value: num(p.z, 1), inline: true },
      { name: 'Facing', value: p.yaw !== undefined ? `${num(p.yaw, 1)}°` : '—', inline: true },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
