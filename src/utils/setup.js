const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline/promises');
const { configPath, examplePath, isPackaged } = require('./config');

const interactive = Boolean(process.stdin.isTTY && process.stdout.isTTY);

function isPlaceholder(value) {
  return value === undefined
    || value === null
    || (typeof value === 'string' && (!value.trim() || value.includes('PASTE_') || value === 'CHANGE_THIS_PASSWORD'));
}

const isId = (v) => /^\d{15,25}$/.test(v);

// Required values the bot cannot start without.
const FIELDS = [
  {
    key: ['discord', 'token'],
    label: 'Discord bot token',
    help: 'Discord Developer Portal -> your application -> Bot -> Reset Token.',
    validate: (v) => v.length > 30 || 'That does not look like a bot token.',
  },
  {
    key: ['discord', 'clientId'],
    label: 'Discord application (client) ID',
    help: 'Developer Portal -> your application -> General Information -> Application ID.',
    validate: (v) => isId(v) || 'Must be a numeric Discord ID.',
  },
  {
    key: ['discord', 'guildId'],
    label: 'Discord server ID',
    help: 'Enable Developer Mode in Discord, right-click your server -> Copy Server ID.',
    validate: (v) => isId(v) || 'Must be a numeric Discord ID.',
  },
  {
    key: ['permissions', 'ownerUserIds'],
    label: 'Your Discord user ID (bot owner, full access)',
    help: 'Right-click your own name -> Copy User ID. Leave blank to skip.',
    optional: true,
    isMissing: (v) => !Array.isArray(v) || v.some(isPlaceholder),
    validate: (v) => !v || isId(v) || 'Must be a numeric Discord ID.',
    transform: (v) => (v ? [v] : []),
  },
  {
    key: ['dispatcher', 'baseUrl'],
    label: 'Advanced Dispatcher System URL',
    help: 'The address of the dispatcher server.',
    validate: (v) => /^https?:\/\/.+/i.test(v) || 'Must start with http:// or https://',
  },
  {
    key: ['dispatcher', 'username'],
    label: 'Dispatcher username',
  },
  {
    key: ['dispatcher', 'password'],
    label: 'Dispatcher password',
  },
];

function getAt(obj, keys) {
  return keys.reduce((acc, k) => (acc == null ? undefined : acc[k]), obj);
}

function setAt(obj, keys, value) {
  let cur = obj;
  for (const k of keys.slice(0, -1)) cur = cur[k] ??= {};
  cur[keys.at(-1)] = value;
}

function missingFields(config) {
  return FIELDS.filter((f) => (f.isMissing ? f.isMissing(getAt(config, f.key)) : isPlaceholder(getAt(config, f.key))));
}

async function prompt(rl, field, current) {
  const fallback = !isPlaceholder(current) && typeof current === 'string' ? current : '';
  if (field.help) console.log(`  (${field.help})`);
  for (;;) {
    const suffix = fallback ? ` [${fallback}]` : '';
    const answer = ((await rl.question(`> ${field.label}${suffix}: `)) || fallback).trim();
    if (!answer && !field.optional) {
      console.log('  This value is required.');
      continue;
    }
    const result = field.validate ? field.validate(answer) : true;
    if (result !== true) {
      console.log(`  ${result}`);
      continue;
    }
    return field.transform ? field.transform(answer) : answer;
  }
}

/**
 * Makes sure config/config.json exists and has the required values.
 * Creates it from the bundled template and runs an interactive wizard when needed.
 */
async function ensureConfig() {
  let created = false;
  if (!fs.existsSync(configPath)) {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, fs.readFileSync(examplePath, 'utf8'));
    created = true;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const missing = missingFields(config);
  if (!missing.length) return;

  if (!interactive) {
    throw new Error(`${created ? 'Created' : 'Please finish'} ${configPath}. Fill in: ${missing.map((f) => f.key.join('.')).join(', ')}`);
  }

  console.log('');
  console.log('==============================================');
  console.log('  Derail Valley Discord Dispatcher - Setup');
  console.log('==============================================');
  console.log(`Settings will be saved to:\n  ${configPath}`);
  console.log('You can change them later by editing that file.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    for (const field of missing) {
      setAt(config, field.key, await prompt(rl, field, getAt(config, field.key)));
      console.log('');
    }
  } finally {
    rl.close();
  }

  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  console.log('Settings saved. Starting the bot...\n');
}

/** Keeps a double-clicked console window open so users can read the error. */
async function waitForEnter(message = 'Press Enter to close this window...') {
  if (!isPackaged || !interactive) return;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await rl.question(`\n${message}`);
  rl.close();
}

module.exports = { ensureConfig, waitForEnter };

