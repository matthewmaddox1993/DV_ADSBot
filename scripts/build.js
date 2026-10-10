// Builds a standalone executable that end users can run without installing Node.js.
// Usage: npm run build            (Windows x64)
//        npm run build -- linux   (Linux x64)
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const pkgJson = require(path.join(root, 'package.json'));
const platform = (process.argv[2] || 'win').toLowerCase();
const targets = { win: 'node22-win-x64', linux: 'node22-linux-x64' };
if (!targets[platform]) throw new Error(`Unknown platform "${platform}". Use: ${Object.keys(targets).join(', ')}`);

const appName = 'DerailValleyBot';
const outDir = path.join(root, 'dist', `${appName}-${pkgJson.version}-${platform}`);
const exeName = platform === 'win' ? `${appName}.exe` : appName;
const manifestPath = path.join(root, 'version.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.version !== pkgJson.version) {
  throw new Error(`version.json (${manifest.version}) must match package.json (${pkgJson.version}) before building.`);
}
manifest.assets ||= {};
for (const [key, asset] of Object.entries(manifest.assets)) {
  if (asset.version !== pkgJson.version) delete manifest.assets[key];
}

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
fs.copyFileSync(path.join(root, 'version.json'), path.join(outDir, 'version.json'));
const platformReadme = platform === 'win' ? 'README-WINDOWS.md' : 'README-LINUX.md';
fs.copyFileSync(path.join(root, platformReadme), path.join(outDir, 'READ ME FIRST.md'));
fs.copyFileSync(path.join(root, 'README.md'), path.join(outDir, 'README.md'));
fs.copyFileSync(path.join(root, 'CHANGELOG.md'), path.join(outDir, 'CHANGELOG.md'));

let archive;
let format;
if (platform === 'win') {
  archive = `${outDir}.zip`;
  format = 'zip';
  fs.rmSync(archive, { force: true });
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${archive}'`], { stdio: 'inherit' });
} else {
  archive = `${outDir}.tar.gz`;
  format = 'tar.gz';
  fs.rmSync(archive, { force: true });
  execFileSync('tar', ['-czf', archive, '-C', outDir, '.'], { stdio: 'inherit' });
}

const assetName = path.basename(archive);
const assetKey = platform === 'win' ? 'win32-x64' : 'linux-x64';
manifest.assets[assetKey] = {
  version: pkgJson.version,
  url: `https://github.com/matthewmaddox1993/DV_ADSBot/releases/download/v${pkgJson.version}/${assetName}`,
  format,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(archive)).digest('hex'),
};
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`\nDone! Release archive:\n  ${archive}`);
console.log(`Updated ${manifestPath} with the ${assetKey} URL and SHA-256 hash.`);

