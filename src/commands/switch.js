const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe, errorEmbed } = require('../utils/embeds');
const { canView, canDispatch } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');

function allSwitches(store) {
  const defs = store.junctions ? [...store.junctions.values()] : [];
  return defs.map((d) => ({ ...d, ...(store.switches.get(d.id) || {}) }));
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('switch')
    .setDescription('View or control railway turnouts')
    .addSubcommand((s) => s.setName('list').setDescription('List turnouts').addIntegerOption((o) => o.setName('limit').setDescription('Maximum number of turnouts to show').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show turnout details').addStringOption((o) => o.setName('id').setDescription('Turnout ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('set').setDescription('Set a turnout branch').addStringOption((o) => o.setName('id').setDescription('Turnout ID').setRequired(true).setAutocomplete(true)).addIntegerOption((o) => o.setName('branch').setDescription('Branch number shown in ADS (starts at 1)').setRequired(true).setMinValue(1))),
  async autocomplete(interaction, ctx) {
    await interaction.respond(choices(allSwitches(ctx.dispatcher.store), interaction.options.getFocused(), (x) => x.id, (x) => `${x.name || x.id} • branch ${(x.branch ?? -1) + 1}`));
  },
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view turnouts.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const switches = allSwitches(ctx.dispatcher.store);
    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = switches.slice(0, limit).map((s) => `**${s.name || s.id}** \`${s.id}\` — branch ${Number.isInteger(s.branch) ? s.branch + 1 : 'unknown'} • ${s.branches?.length || 0} choices`);
      return interaction.editReply({ embeds: [baseEmbed(`Turnouts (${switches.length})`).setDescription(lines.join('\n') || 'No turnouts available.')] });
    }
    const id = interaction.options.getString('id', true);
    const sw = switches.find((x) => x.id === id || x.name === id);
    if (!sw) return interaction.editReply({ embeds: [errorEmbed('Turnout not found', `No turnout matched \`${id}\`.`)] });
    if (sub === 'set') {
      if (!canDispatch(interaction, ctx.config)) return interaction.editReply({ embeds: [errorEmbed('Permission denied', 'Dispatcher permission is required to move a turnout.')] });
      const requested = interaction.options.getInteger('branch', true);
      const zeroBased = requested - 1;
      if (zeroBased < 0 || zeroBased >= (sw.branches?.length || 0)) return interaction.editReply({ embeds: [errorEmbed('Invalid branch', `This turnout has ${sw.branches?.length || 0} branches. Use 1-${sw.branches?.length || 0}.`)] });
      const result = await ctx.dispatcher.setSwitch(sw.id, zeroBased, sw.revision);
      const embed = baseEmbed('Turnout command result', result.status === 'applied' ? 0x38b000 : 0xd90429);
      addFieldsSafe(embed, [
        { name: 'Turnout', value: sw.id, inline: true },
        { name: 'Requested branch', value: String(requested), inline: true },
        { name: 'Status', value: result.status || 'unknown', inline: true },
        { name: 'Code', value: result.code || '—', inline: false },
      ]);
      return interaction.editReply({ embeds: [embed] });
    }
    const embed = baseEmbed(sw.name || sw.id);
    addFieldsSafe(embed, [
      { name: 'ID', value: sw.id, inline: true },
      { name: 'Current Branch', value: Number.isInteger(sw.branch) ? String(sw.branch + 1) : 'Unknown', inline: true },
      { name: 'Revision', value: sw.revision !== undefined ? String(sw.revision) : '—', inline: true },
      { name: 'Incoming', value: sw.incoming || '—', inline: false },
      { name: 'Branches', value: (sw.branches || []).map((x, i) => `${i + 1}: ${x}`).join('\n') || '—', inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
