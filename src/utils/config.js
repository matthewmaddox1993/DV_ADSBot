const fs = require('node:fs');
const path = require('node:path');

const isPackaged = Boolean(process.pkg);
// Writable app folder: next to the .exe when packaged, otherwise the project root.
const rootDir = isPackaged ? path.dirname(process.execPath) : path.resolve(__dirname, '..', '..');
const configPath = path.join(rootDir, 'config', 'config.json');
// Bundled template (inside the snapshot when packaged).
const examplePath = path.resolve(__dirname, '..', '..', 'config', 'config.example.json');

function loadConfig() {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Missing ${configPath}. Copy config.example.json to config.json first.`);
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.__rootDir = rootDir;
  config.__configPath = configPath;
  return config;
}

function permissionId(value, kind) {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (/^\d+$/.test(text)) return text;
  const pattern = kind === 'user' ? /^<@(\d+)>$/ : /^<@&(\d+)>$/;
  return text.match(pattern)?.[1] || null;
}

function validatePermissionConfig(config) {
  const permissions = config.permissions || {};
  const definitions = [
    ['ownerUserIds', 'user'],
    ['viewerRoleIds', 'role'],
    ['dispatcherRoleIds', 'role'],
    ['adminRoleIds', 'role'],
  ];
  const parsed = {};
  const problems = [];

  for (const [name, kind] of definitions) {
    const values = permissions[name] ?? [];
    if (!Array.isArray(values)) {
      problems.push(`permissions.${name} must be an array`);
      parsed[name] = [];
      continue;
    }
    parsed[name] = values.map((value) => permissionId(value, kind));
    if (parsed[name].some((value) => !value)) problems.push(`permissions.${name} must contain only string Discord ${kind} IDs`);
    const valid = parsed[name].filter(Boolean);
    if (new Set(valid).size !== valid.length) problems.push(`permissions.${name} contains duplicate IDs`);
  }

  if (permissions.allowEveryoneView !== undefined && typeof permissions.allowEveryoneView !== 'boolean') {
    problems.push('permissions.allowEveryoneView must be true or false');
  }

  const roleLists = ['viewerRoleIds', 'dispatcherRoleIds', 'adminRoleIds'];
  for (let left = 0; left < roleLists.length; left += 1) {
    for (let right = left + 1; right < roleLists.length; right += 1) {
      const first = roleLists[left];
      const second = roleLists[right];
      if (parsed[first].filter(Boolean).some((id) => parsed[second].includes(id))) {
        problems.push(`permissions.${first} and permissions.${second} must not overlap`);
      }
    }
  }

  const ownerIds = new Set(parsed.ownerUserIds.filter(Boolean));
  const roleIds = roleLists.flatMap((name) => parsed[name].filter(Boolean));
  if (roleIds.some((id) => ownerIds.has(id))) problems.push('owner user IDs must not also be configured as role IDs');

  const guildId = permissionId(config.discord?.guildId, 'role');
  if (guildId && roleIds.includes(guildId)) problems.push('the guild/@everyone ID cannot be used as a permission role');

  if (problems.length) throw new Error(`Invalid permission configuration: ${problems.join('; ')}`);
}

function validateConfig(config, { deploy = false } = {}) {
  const missing = [];
  if (!config.discord?.token || config.discord.token.includes('PASTE_')) missing.push('discord.token');
  if (!config.discord?.clientId || config.discord.clientId.includes('PASTE_')) missing.push('discord.clientId');
  if (!config.discord?.guildId || config.discord.guildId.includes('PASTE_')) missing.push('discord.guildId');
  if (!config.dispatcher?.baseUrl) missing.push('dispatcher.baseUrl');
  if (!config.dispatcher?.username) missing.push('dispatcher.username');
  if (!config.dispatcher?.password || config.dispatcher.password === 'CHANGE_THIS_PASSWORD') missing.push('dispatcher.password');
  if (missing.length) throw new Error(`Configure these values in config/config.json: ${missing.join(', ')}`);
  validatePermissionConfig(config);
}

module.exports = { loadConfig, validateConfig, validatePermissionConfig, rootDir, configPath, examplePath, isPackaged };
