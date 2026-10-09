const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [];

function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.js')) files.push(full);
  }
}

walk(root);
for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
console.log(`Syntax check passed for ${files.length} JavaScript files.`);

try {
  require.resolve('discord.js', { paths: [root] });
  const { Collection } = require('discord.js');
  const { loadCommands } = require(path.join(root, 'src', 'handlers', 'loadCommands'));
  const fakeClient = { commands: new Collection() };
  loadCommands(fakeClient, path.join(root, 'src', 'commands'));

  for (const command of fakeClient.commands.values()) {
    try {
      command.data.toJSON();
      console.log(`[OK] Slash command /${command.data.name}`);
    } catch (error) {
      console.error(`[ERROR] Slash command /${command.data?.name || 'unknown'} failed builder validation.`);
      throw error;
    }
  }

  console.log(`Slash-command validation passed for ${fakeClient.commands.size} commands.`);
} catch (error) {
  if (error?.code === 'MODULE_NOT_FOUND' && String(error.message).includes('discord.js')) {
    console.log('discord.js is not installed; skipped slash-command builder validation. Run npm install, then npm run check.');
  } else {
    throw error;
  }
}
