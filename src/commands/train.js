const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe } = require('../utils/embeds');
const { canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { choices } = require('../utils/autocomplete');
const { num, yesNo } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('train')
    .setDescription('View Derail Valley trains and consists')
    .addSubcommand((s) => s.setName('list').setDescription('List detected trains').addIntegerOption((o) => o.setName('limit').setDescription('1-20 results').setMinValue(1).setMaxValue(20)))
    .addSubcommand((s) => s.setName('info').setDescription('Show a train or consist').addStringOption((o) => o.setName('id').setDescription('Train/consist ID').setRequired(true).setAutocomplete(true))),

  async autocomplete(interaction, ctx) {
    const focused = interaction.options.getFocused();
    await interaction.respond(choices(ctx.dispatcher.store.trains(), focused, (x) => x.id, (x) => `${x.name || x.id} • ${x.id}`));
  },

  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view trains.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const trains = ctx.dispatcher.store.trains();
    const sub = interaction.options.getSubcommand();
    if (sub === 'list') {
      const limit = interaction.options.getInteger('limit') || 15;
      const lines = trains.slice(0, limit).map((t) => `**${t.name || t.id}** \`${t.id}\` — ${num(Math.abs(t.speed), 1)} km/h • ${t.count} cars • track ${t.track1 || '—'}`);
      const embed = baseEmbed(`Trains (${trains.length})`).setDescription(lines.join('\n') || 'No trains are currently available.');
      return interaction.editReply({ embeds: [embed] });
    }
    const id = interaction.options.getString('id', true);
    const train = ctx.dispatcher.store.findTrain(id);
    if (!train) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Train not found', `No train/consist matched \`${id}\`.`)] });
    const embed = baseEmbed(train.name || train.id);
    addFieldsSafe(embed, [
      { name: 'Consist ID', value: train.id, inline: true },
      { name: 'Head', value: train.head || '—', inline: true },
      { name: 'Speed', value: `${num(Math.abs(train.speed), 1)} km/h`, inline: true },
      { name: 'Track', value: train.track1 || '—', inline: true },
      { name: 'Cars', value: String(train.count), inline: true },
      { name: 'Locomotives', value: String(train.locomotiveCount), inline: true },
      { name: 'Wagons', value: String(train.wagonCount), inline: true },
      { name: 'Length', value: `${num(train.length, 1)} m`, inline: true },
      { name: 'Derailed', value: yesNo(train.derailed), inline: true },
      { name: 'Car IDs', value: train.carIds.join(', ') || '—', inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
