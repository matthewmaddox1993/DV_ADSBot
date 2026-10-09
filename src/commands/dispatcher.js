const { SlashCommandBuilder } = require('discord.js');
const { baseEmbed, addFieldsSafe, COLORS } = require('../utils/embeds');
const { canView, canAdmin } = require('../utils/permissions');
const { replyError, defaultReplyOptions } = require('../utils/replies');
const { num } = require('../utils/format');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('dispatcher')
    .setDescription('Advanced Dispatcher System connection tools')
    .addSubcommand((s) => s.setName('status').setDescription('Show live dispatcher connection status'))
    .addSubcommand((s) => s.setName('reconnect').setDescription('Force the bot to re-authenticate and reconnect')),

  async execute(interaction, ctx) {
    const { config, dispatcher } = ctx;
    const sub = interaction.options.getSubcommand();
    if (!canView(interaction, config)) return replyError(interaction, 'Permission denied', 'You do not have permission to view dispatcher data.');
    await interaction.deferReply(defaultReplyOptions(config));

    if (sub === 'reconnect') {
      if (!canAdmin(interaction, config)) return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Permission denied', 'Bot administrator permission is required.')] });
      try {
        await dispatcher.reconnect();
        return interaction.editReply({ embeds: [baseEmbed('Dispatcher reconnect started', COLORS.ok).setDescription('The bot re-authenticated and started a fresh WebSocket connection.')] });
      } catch (error) {
        return interaction.editReply({ embeds: [require('../utils/embeds').errorEmbed('Reconnect failed', error.message)] });
      }
    }

    let health = null;
    try { health = await dispatcher.health(); } catch {}
    const store = dispatcher.store;
    const embed = baseEmbed('Advanced Dispatcher System Status', dispatcher.status === 'connected' ? COLORS.ok : COLORS.warn);
    addFieldsSafe(embed, [
      { name: 'WebSocket', value: dispatcher.status, inline: true },
      { name: 'Account', value: dispatcher.user ? `${dispatcher.user.name || 'Unknown'} (${dispatcher.user.role || 'unknown'})` : 'Not authenticated', inline: true },
      { name: 'Control Authority', value: store.capabilities?.authority ? 'Yes' : 'No', inline: true },
      { name: 'State', value: store.capabilities?.status || 'unknown', inline: true },
      { name: 'Server Epoch', value: store.serverEpoch || '—', inline: true },
      { name: 'Sequence', value: store.seq.toString(), inline: true },
      { name: 'State Age', value: store.lastMessageAt ? `${num((Date.now() - store.lastMessageAt) / 1000, 1)} seconds` : '—', inline: true },
      { name: 'Web Clients', value: health?.clients ?? '—', inline: true },
      { name: 'Host Mode', value: store.capabilities?.mode || '—', inline: true },
      { name: 'Objects', value: `Tracks: ${store.tracks.size}\nCars: ${store.cars.size}\nSignals: ${store.signals.size}\nPlayers: ${store.players.size}`, inline: false },
    ]);
    return interaction.editReply({ embeds: [embed] });
  },
};
