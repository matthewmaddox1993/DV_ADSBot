const logger = require('./logger');

function normalizeDiscordId(value) {
  if (value === null || value === undefined) return null;

  // Discord snowflakes exceed Number.MAX_SAFE_INTEGER. A numeric value may
  // already have lost precision by the time JSON.parse returns it, so never
  // try to "fix" an unsafe number here.
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return null;
    return String(value);
  }

  const text = String(value).trim();
  if (!text) return null;

  // Allow users to paste a raw role/user mention as well as a plain snowflake.
  const mention = text.match(/^<@&?(\d+)>$/);
  if (mention) return mention[1];

  return /^\d+$/.test(text) ? text : null;
}

function normalizeIdList(values = []) {
  if (!Array.isArray(values)) return [];
  return values.map(normalizeDiscordId).filter(Boolean);
}

function memberRoleIds(interaction) {
  const ids = new Set();
  const member = interaction.member;

  // Cached GuildMember path.
  const cache = member?.roles?.cache;
  if (cache?.keys) {
    for (const id of cache.keys()) ids.add(String(id));
  }

  // Raw APIInteractionGuildMember path used by interactions when a GuildMember
  // object is not available in cache.
  if (Array.isArray(member?.roles)) {
    for (const id of member.roles) ids.add(String(id));
  }

  // discord.js GuildMember keeps the raw assigned role snowflakes here. Using
  // this as an additional source makes permission checks resilient even when a
  // role object itself is not cached.
  if (Array.isArray(member?._roles)) {
    for (const id of member._roles) ids.add(String(id));
  }

  // @everyone is represented by the guild ID and may not appear in _roles.
  if (interaction.guildId) ids.add(String(interaction.guildId));

  return ids;
}

function hasAny(memberIds, configuredValues = []) {
  const configured = normalizeIdList(configuredValues);
  return configured.some((id) => memberIds.has(id));
}

function configuredRoleIds(config) {
  return normalizeIdList([
    ...(Array.isArray(config.permissions?.viewerRoleIds) ? config.permissions.viewerRoleIds : []),
    ...(Array.isArray(config.permissions?.dispatcherRoleIds) ? config.permissions.dispatcherRoleIds : []),
    ...(Array.isArray(config.permissions?.adminRoleIds) ? config.permissions.adminRoleIds : []),
  ]);
}

function isAllowedGuild(interaction, config) {
  const configuredGuildId = normalizeDiscordId(config.discord?.guildId);
  return Boolean(configuredGuildId && interaction.guildId && String(interaction.guildId) === configuredGuildId);
}

function accessLevel(interaction, config, { logDenied = true } = {}) {
  if (!isAllowedGuild(interaction, config)) return 'none';

  const userId = String(interaction.user.id);
  if (normalizeIdList(config.permissions?.ownerUserIds).includes(userId)) return 'admin';

  const roles = memberRoleIds(interaction);
  if (hasAny(roles, config.permissions?.adminRoleIds)) return 'admin';
  if (hasAny(roles, config.permissions?.dispatcherRoleIds)) return 'dispatcher';
  if (hasAny(roles, config.permissions?.viewerRoleIds)) return 'viewer';

  const configured = configuredRoleIds(config);

  // Public read access must be explicitly enabled. Missing or invalid role
  // mappings otherwise fail closed instead of silently opening data to everyone.
  if (configured.length === 0 && config.permissions?.allowEveryoneView === true) return 'viewer';

  // This diagnostic is intentionally role-ID-only. It contains no tokens,
  // passwords, or other secrets and makes bad role mappings immediately visible.
  if (logDenied) {
    logger.warn(
      `Permission denied for Discord user ${userId}. ` +
      `Member role IDs: [${[...roles].join(', ')}]. ` +
      `Configured viewer/dispatcher/admin role IDs: [${configured.join(', ')}].`
    );
  }

  return 'none';
}

function canView(interaction, config, options) {
  return ['viewer', 'dispatcher', 'admin'].includes(accessLevel(interaction, config, options));
}

function canDispatch(interaction, config) {
  return ['dispatcher', 'admin'].includes(accessLevel(interaction, config));
}

function canAdmin(interaction, config) {
  return accessLevel(interaction, config) === 'admin';
}

module.exports = {
  accessLevel,
  canView,
  canDispatch,
  canAdmin,
  isAllowedGuild,
  memberRoleIds,
  normalizeDiscordId,
  normalizeIdList,
};
