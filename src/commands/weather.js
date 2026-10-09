const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { num } = require('../utils/format');

function findWeather(store) {
  return store.capabilities?.weather || store.capabilities?.conditions || store.capabilities?.environment || null;
}

module.exports = {
  data: new SlashCommandBuilder().setName('weather').setDescription('Show weather and rail conditions reported by Derail Valley'),
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view dispatcher data.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const w = findWeather(ctx.dispatcher.store);
    if (!w) return interaction.editReply({ embeds: [baseEmbed('Derail Valley Weather').setDescription('Weather data is not present in the current dispatcher capability snapshot. The game/mod may not be exposing it in this session.')] });
    if (typeof w === 'string') return interaction.editReply({ embeds: [baseEmbed('Derail Valley Weather').setDescription(w)] });
    const embed = baseEmbed('Derail Valley Weather');
    addFieldsSafe(embed, Object.entries(w).slice(0, 25).map(([k, v]) => ({ name: k, value: typeof v === 'number' ? num(v, 2) : typeof v === 'object' ? JSON.stringify(v) : String(v), inline: true })));
    return interaction.editReply({ embeds: [embed] });
  },
};
