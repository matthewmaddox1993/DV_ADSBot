const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  });
}

function loadCommands(client, commandsDir) {
  client.commands.clear();
  for (const file of walk(commandsDir)) {
    delete require.cache[require.resolve(file)];
    const command = require(file);
    if (!command?.data?.name || typeof command.execute !== 'function') throw new Error(`Invalid command module: ${file}`);
    client.commands.set(command.data.name, command);
  }
  return client.commands;
}

module.exports = { loadCommands };
