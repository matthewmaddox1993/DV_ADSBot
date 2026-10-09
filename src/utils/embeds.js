const { EmbedBuilder } = require('discord.js');
const { clampText } = require('./format');

const COLORS = {
  ok: 0x38b000,
  info: 0x3a86ff,
  warn: 0xffb703,
  error: 0xd90429,
  neutral: 0x5865f2,
};

function baseEmbed(title, color = COLORS.info) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(clampText(title, 256))
    .setTimestamp()
    .setFooter({ text: 'Derail Valley • Advanced Dispatcher System' });
}

function addFieldsSafe(embed, fields) {
  const safe = fields
    .filter((f) => f && f.value !== undefined)
    .slice(0, 25)
    .map((f) => ({
      name: clampText(f.name, 256),
      value: clampText(f.value, 1024),
      inline: Boolean(f.inline),
    }));
  if (safe.length) embed.addFields(safe);
  return embed;
}

function errorEmbed(title, description) {
  return baseEmbed(title, COLORS.error).setDescription(clampText(description, 4096));
}

module.exports = { COLORS, baseEmbed, addFieldsSafe, errorEmbed };
