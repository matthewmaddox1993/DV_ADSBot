const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { baseEmbed, errorEmbed, COLORS } = require('../utils/embeds');
const { canAdmin, canView } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('board')
    .setDescription('Manage the live Derail Valley dispatch board')
    .addSubcommand((s) => s.setName('setup').setDescription('Create the live dispatch board').addChannelOption((o) => o.setName('channel').setDescription('Channel for the board').addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement).setRequired(true)))
    .addSubcommand((s) => s.setName('refresh').setDescription('Refresh the configured dispatch board now'))
    .addSubcommand((s) => s.setName('disable').setDescription('Forget the configured dispatch board message')),
  async execute(interaction, ctx) {
    if (!canView(interaction, ctx.config)) return replyError(interaction, 'Permission denied', 'You do not have permission to use this command.');
    await interaction.deferReply(defaultReplyOptions(ctx.config));
    const sub = interaction.options.getSubcommand();
    if (sub === 'refresh') {
      const ok = await ctx.board.refresh();
      return interaction.editReply({ embeds: [ok ? baseEmbed('Dispatch board refreshed', COLORS.ok) : errorEmbed('Dispatch board not configured', 'Run `/board setup` first or verify the stored channel/message still exists.')] });
    }
    if (!canAdmin(interaction, ctx.config)) return interaction.editReply({ embeds: [errorEmbed('Permission denied', 'Bot administrator permission is required.')] });
    if (sub === 'disable') {
      ctx.board.disable();
      return interaction.editReply({ embeds: [baseEmbed('Dispatch board disabled', COLORS.ok).setDescription('The bot forgot the stored board message. The existing Discord message was left in place.')] });
    }
    const channel = interaction.options.getChannel('channel', true);
    try {
      const msg = await ctx.board.setup(channel);
      return interaction.editReply({ embeds: [baseEmbed('Dispatch board created', COLORS.ok).setDescription(`Created ${msg.url}`)] });
    } catch (error) {
      return interaction.editReply({ embeds: [errorEmbed('Board setup failed', error.message)] });
    }
  },
};
