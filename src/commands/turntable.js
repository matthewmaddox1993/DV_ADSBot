const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe, errorEmbed } = require('../utils/embeds');
const { canView, canDispatch } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { num, yesNo } = require('../utils/format');

function allTables(store) {
  const defs = store.turntableDefinitions ? [...store.turntableDefinitions.values()] : [];
  return defs.map((d) => ({ ...d, ...(store.turntables.get(d.id) || {}) }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('turntable')
    .setDescription('View or control turntables')
    .addSubcommand((s) => s.setName('list').setDescription('List turntables'))
    .addSubcommand((s) => s.setName('info').setDescription('Show turntable details').addStringOption((o) => o.setName('id').setDescription('Turntable ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('set').setDescription('Align a turntable to an end').addStringOption((o) => o.setName('id').setDescription('Turntable ID').setRequired(true).setAutocomplete(true)).addIntegerOption((o) => o.setName('end').setDescription('End number shown by /turntable info (starts at 1)').setRequired(true).setMinValue(1))),
  async autocomplete(interaction, ctx) {
    await interaction.respond(choices(allTables(ctx.dispatcher.store), interaction.options.getFocused(), (x) => x.id, (x) => x.name || x.id));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view turntables.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const tables = allTables(ctx.dispatcher.store);
    if (sub === 'list') {
      const lines = tables.slice(0, 20).map((t) => `**${t.name || t.id}** \`${t.id}\` — ${num(t.angle, 1)}° • ${t.moving ? 'moving' : t.available ? 'ready' : t.reason || 'unavailable'}`);
      return interaction.editReply({ embeds: [baseEmbed(`Turntables (${tables.length})`).setDescription(lines.join('\n') || 'No turntables available.')] });
    }
    const id = interaction.options.getString('id', true);
    const table = tables.find((x) => x.id === id || x.name === id);
    if (!table) return interaction.editReply({ embeds: [errorEmbed('Turntable not found', `No turntable matched \`${id}\`.`)] });
    if (sub === 'set') {
      if (!canDispatch(interaction, ctx.config)) return interaction.editReply({ embeds: [errorEmbed('Permission denied', 'Dispatcher permission is required to move a turntable.')] });
      const requested = interaction.options.getInteger('end', true);
      const index = requested - 1;
      if (index < 0 || index >= (table.ends?.length || 0)) return interaction.editReply({ embeds: [errorEmbed('Invalid end', `This turntable has ${table.ends?.length || 0} selectable ends.`)] });
      const result = await ctx.dispatcher.setTurntable(table.id, index, table.revision);
      return interaction.editReply({ embeds: [baseEmbed('Turntable command result', result.status === 'applied' ? 0x38b000 : 0xd90429).setDescription(`**${table.id}** → end **${requested}**\nStatus: **${result.status}**\nCode: \`${result.code || '—'}\``)] });
    }
    const embed = baseEmbed(table.name || table.id);
    addFieldsSafe(embed, [
      { name: 'ID', value: table.id, inline: true },
      { name: 'Angle', value: `${num(table.angle, 1)}°`, inline: true },
      { name: 'Moving', value: yesNo(table.moving), inline: true },
      { name: 'Available', value: yesNo(table.available), inline: true },
      { name: 'Front', value: table.front || '—', inline: true },
      { name: 'Rear', value: table.rear || '—', inline: true },
      { name: 'Ends', value: (table.ends || []).map((e, i) => `${i + 1}: ${e.track || 'track?'} • ${num(e.angle, 1)}°`).join('\n') || '—', inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
