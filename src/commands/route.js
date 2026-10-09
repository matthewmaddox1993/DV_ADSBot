const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe, errorEmbed } = require('../utils/embeds');
const { canView, canDispatch } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices, commaSeparatedChoices } = require('../utils/autocomplete');
const { num, unixTime } = require('../utils/format');

function splitVia(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('route')
    .setDescription('View, preview, and plan dispatcher routes')
    .addSubcommand((s) => s.setName('list').setDescription('List routes').addBooleanOption((o) => o.setName('active').setDescription('Only active routes')).addIntegerOption((o) => o.setName('limit').setDescription('Maximum number of routes to show').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show route details').addStringOption((o) => o.setName('id').setDescription('Route ID').setRequired(true).setAutocomplete(true)))
    .addSubcommand((s) => s.setName('preview').setDescription('Preview a route without creating it').addStringOption((o) => o.setName('from').setDescription('Start track ID').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('to').setDescription('Destination track ID').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('train').setDescription('Optional train/consist ID').setAutocomplete(true)).addStringOption((o) => o.setName('via').setDescription('Comma-separated track IDs; add one at a time').setAutocomplete(true)))
    .addSubcommand((s) => s.setName('plan').setDescription('Create a planned route in Advanced Dispatcher System').addStringOption((o) => o.setName('from').setDescription('Start track ID').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('to').setDescription('Destination track ID').setRequired(true).setAutocomplete(true)).addStringOption((o) => o.setName('train').setDescription('Optional train/consist ID').setAutocomplete(true)).addStringOption((o) => o.setName('via').setDescription('Comma-separated track IDs; add one at a time').setAutocomplete(true))),

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused(true);
    if (focused.name === 'id') return interaction.respond(choices(ctx.dispatcher.store.routes, focused.value, (x) => x.id, (x) => `${x.name || x.id} • ${x.lifecycle || x.status || 'route'}`));
    if (focused.name === 'train') return interaction.respond(choices(ctx.dispatcher.store.trains(), focused.value, (x) => x.id, (x) => `${x.name || x.id} • ${x.id}`));
    if (focused.name === 'via') return interaction.respond(commaSeparatedChoices([...ctx.dispatcher.store.tracks.values()], focused.value, (x) => x.id, (x) => `${x.name || x.id} • ${x.id}`));
    return interaction.respond(choices([...ctx.dispatcher.store.tracks.values()], focused.value, (x) => x.id, (x) => `${x.name || x.id} • ${x.id}`));
  },

  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view routes.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    const store = ctx.dispatcher.store;

    if (sub === 'list') {
      let routes = [...store.routes];
      if (interaction.options.getBoolean('active')) routes = routes.filter((r) => !r.endedAt);
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = routes.slice(0, limit).map((r) => `**${r.name || r.id}** \`${r.id}\` — ${r.lifecycle || r.status || 'planned'}${r.reservationState ? ` • ${r.reservationState}` : ''}${r.train ? ` • train ${r.train}` : ''}`);
      return interaction.editReply({ embeds: [baseEmbed(`Routes (${routes.length})`).setDescription(lines.join('\n') || 'No routes available.')] });
    }

    if (sub === 'info') {
      const id = interaction.options.getString('id', true);
      const r = store.findRoute(id);
      if (!r) return interaction.editReply({ embeds: [errorEmbed('Route not found', `No route matched \`${id}\`.`)] });
      const embed = baseEmbed(r.name || r.id);
      addFieldsSafe(embed, [
        { name: 'ID', value: r.id, inline: true },
        { name: 'Lifecycle', value: r.lifecycle || r.status || '—', inline: true },
        { name: 'Reservation', value: r.reservationState || r.reservationMode || 'none', inline: true },
        { name: 'Train', value: r.train || r.consist || '—', inline: true },
        { name: 'Length', value: r.length !== undefined ? `${num(r.length, 1)} m` : '—', inline: true },
        { name: 'Ended', value: r.endedAt ? unixTime(r.endedAt) : 'Active', inline: true },
        { name: 'Tracks', value: (r.tracks || []).join(' → ') || '—', inline: false },
        { name: 'Warnings', value: (r.warnings || r.conflicts || []).map((x) => typeof x === 'string' ? x : x.code || JSON.stringify(x)).join('\n') || 'None', inline: false },
      ]);
      return interaction.editReply({ embeds: [embed] });
    }

    const from = interaction.options.getString('from', true);
    const to = interaction.options.getString('to', true);
    const train = interaction.options.getString('train') || '';
    const via = splitVia(interaction.options.getString('via'));

    if (sub === 'preview') {
      try {
        const preview = await ctx.dispatcher.previewRoute({ from, to, train, via });
        const embed = baseEmbed('Route Preview');
        addFieldsSafe(embed, [
          { name: 'From', value: from, inline: true },
          { name: 'To', value: to, inline: true },
          { name: 'Train', value: train || 'None', inline: true },
          { name: 'Length', value: preview.length !== undefined ? `${num(preview.length, 1)} m` : '—', inline: true },
          { name: 'Tracks', value: (preview.tracks || []).join(' → ') || '—', inline: false },
          { name: 'Conflicts / Warnings', value: (preview.conflicts || preview.warnings || []).map((x) => typeof x === 'string' ? x : x.code || JSON.stringify(x)).join('\n') || 'None', inline: false },
        ]);
        return interaction.editReply({ embeds: [embed] });
      } catch (error) {
        return interaction.editReply({ embeds: [errorEmbed('Route preview failed', error.code || error.message)] });
      }
    }

    if (!canDispatch(interaction, ctx.config)) return interaction.editReply({ embeds: [errorEmbed('Permission denied', 'Dispatcher permission is required to create a route plan.')] });
    const result = await ctx.dispatcher.planRoute({ from, to, train: train || null, via });
    const embed = baseEmbed('Route Plan Result', result.status === 'applied' ? 0x38b000 : 0xd90429);
    addFieldsSafe(embed, [
      { name: 'Status', value: result.status || 'unknown', inline: true },
      { name: 'Code', value: result.code || '—', inline: true },
      { name: 'Route ID', value: result.target || result.route?.id || '—', inline: true },
      { name: 'Warnings', value: (result.warnings || []).join('\n') || 'None', inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
