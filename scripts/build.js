// Builds a standalone executable that end users can run without installing Node.js.
// Usage: npm run build            (Windows x64)
//        npm run build -- linux   (Linux x64)
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkgJson = require(path.join(root, 'package.json'));
const platform = (process.argv[2] || 'win').toLowerCase();
const targets = { win: 'node22-win-x64', linux: 'node22-linux-x64' };
if (!targets[platform]) throw new Error(`Unknown platform "${platform}". Use: ${Object.keys(targets).join(', ')}`);

const appName = 'DerailValleyBot';
const outDir = path.join(root, 'dist', `${appName}-${pkgJson.version}-${platform}`);
const exeName = platform === 'win' ? `${appName}.exe` : appName;

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(path.join(outDir, 'config'), { recursive: true });
fs.mkdirSync(path.join(outDir, 'data'), { recursive: true });

console.log(`Building ${exeName} (${targets[platform]})...`);
const pkgCli = require.resolve('@yao-pkg/pkg/lib-es5/bin.js', { paths: [root] });
execFileSync(process.execPath, [
  pkgCli, '.',
  '--targets', targets[platform],
  '--output', path.join(outDir, exeName),
  '--no-bytecode', '--public-packages', '*', '--public',
  '--compress', 'GZip',
], { cwd: root, stdio: 'inherit' });

fs.copyFileSync(path.join(root, 'config', 'config.example.json'), path.join(outDir, 'config', 'config.example.json'));
fs.copyFileSync(path.join(root, 'LICENSE'), path.join(outDir, 'LICENSE.txt'));

const run = platform === 'win' ? `Double-click ${exeName}` : `Run ./${exeName} in a terminal`;
fs.writeFileSync(path.join(outDir, 'READ ME FIRST.txt'), [
  `Derail Valley Discord Dispatcher v${pkgJson.version}`,
  '================================================',
  '',
  'No installation required - Node.js is NOT needed.',
  '',
  'FIRST RUN',
  `  1. ${run}.`,
  '  2. A setup window will ask for your Discord bot token, application ID,',
  '     server ID and Advanced Dispatcher System login.',
  '  3. Your answers are saved to config\\config.json and the bot starts.',
  '',
  'AFTER THAT',
  `  ${run} any time to start the bot. Close the window or press Ctrl+C to stop it.`,
  '',
  'CHANGING SETTINGS',
  '  Edit config\\config.json with Notepad (roles, alert channel, board, etc.).',
  '  Delete config\\config.json to run the setup again from scratch.',
  '  If your dispatcher uses a self-signed certificate, put it at',
  '  config\\dispatcher-ca.cer (or change "caFile" in config.json).',
  '',
  'Keep config\\config.json private - it contains your bot token and password.',
  '',
].join('\r\n'));

if (platform === 'win') {
  const zip = `${outDir}.zip`;
  fs.rmSync(zip, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zip}'`], { stdio: 'inherit' });
  console.log(`\nDone! Share this zip with users:\n  ${zip}`);
} else {
  console.log(`\nDone! Output folder:\n  ${outDir}`);
}

