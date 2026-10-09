const { errorEmbed } = require('./embeds');

async function replyError(interaction, title, message, ephemeral = true) {
  const payload = { embeds: [errorEmbed(title, message)] };
  if (interaction.deferred || interaction.replied) return interaction.editReply(payload);
  return interaction.reply({ ...payload, ephemeral });
}

function defaultReplyOptions(config) {
  return { ephemeral: config.discord?.ephemeralResponses !== false };
}

module.exports = { replyError, defaultReplyOptions };
