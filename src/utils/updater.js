const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { Readable } = require('node:stream');
const { pipeline } = require('node:stream/promises');
const { execFileSync, spawn } = require('node:child_process');
const pkg = require('../../package.json');
const logger = require('./logger');
const { isPackaged, rootDir } = require('./config');

const DEFAULT_MANIFEST_URL = 'https://raw.githubusercontent.com/matthewmaddox1993/DV_ADSBot/main/version.json';
const MAX_DOWNLOAD_BYTES = 250 * 1024 * 1024;

function parseVersion(value) {
  const match = String(value || '').trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return {
    numbers: match.slice(1, 4).map(Number),
    prerelease: match[4] ? match[4].split('.') : [],
  };
}

function comparePrerelease(left, right) {
  if (!left.length && !right.length) return 0;
  if (!left.length) return 1;
  if (!right.length) return -1;
  for (let i = 0; i < Math.max(left.length, right.length); i += 1) {
    if (left[i] === undefined) return -1;
    if (right[i] === undefined) return 1;
    if (left[i] === right[i]) continue;
    const leftNumber = /^\d+$/.test(left[i]);
    const rightNumber = /^\d+$/.test(right[i]);
    if (leftNumber && rightNumber) return Number(left[i]) > Number(right[i]) ? 1 : -1;
    if (leftNumber !== rightNumber) return leftNumber ? -1 : 1;
    return left[i] > right[i] ? 1 : -1;
  }
  return 0;
}

function compareVersions(leftValue, rightValue) {
  const left = parseVersion(leftValue);
  const right = parseVersion(rightValue);
  if (!left || !right) throw new Error(`Invalid version comparison: "${leftValue}" and "${rightValue}"`);
  for (let i = 0; i < 3; i += 1) {
    if (left.numbers[i] !== right.numbers[i]) return left.numbers[i] > right.numbers[i] ? 1 : -1;
  }
  return comparePrerelease(left.prerelease, right.prerelease);
}

function validateHttpsUrl(value, label) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) throw new Error();
  } catch {
    throw new Error(`${label} must be an HTTPS URL.`);
  }
}

function validateManifest(manifest) {
  if (!manifest || typeof manifest !== 'object') throw new Error('Update manifest must be a JSON object.');
  if (manifest.schemaVersion !== 1) throw new Error(`Unsupported update manifest schema: ${manifest.schemaVersion}`);
  if (!parseVersion(manifest.version)) throw new Error(`Invalid update manifest version: ${manifest.version}`);
  if (!manifest.source?.repository || !manifest.source?.branch) throw new Error('Update manifest is missing source repository details.');
  validateHttpsUrl(manifest.source.repository, 'Update source repository');
  if (!/^(?!-)(?!.*(?:\.\.|\/\/|@\{|[~^:?*\\]))[A-Za-z0-9._/-]+$/.test(manifest.source.branch)
      || manifest.source.branch.endsWith('/') || manifest.source.branch.endsWith('.lock')) {
    throw new Error('Update source branch is invalid.');
  }
  if (manifest.releasePage !== undefined) validateHttpsUrl(manifest.releasePage, 'Update release page');
  if (!manifest.assets || typeof manifest.assets !== 'object' || Array.isArray(manifest.assets)) {
    throw new Error('Update manifest assets must be an object.');
  }
  for (const [name, asset] of Object.entries(manifest.assets)) {
    if (asset?.version !== manifest.version || !asset.url || !['zip', 'tar.gz'].includes(asset.format) || !/^[a-f\d]{64}$/i.test(asset.sha256 || '')) {
      throw new Error(`Update manifest asset "${name}" must match the release version and have a URL, supported format, and SHA-256 hash.`);
    }
    validateHttpsUrl(asset.url, `Update manifest asset "${name}" URL`);
  }
  return manifest;
}

async function fetchManifest(url, fetchImpl = global.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetchImpl(url, {
      headers: { Accept: 'application/json', 'User-Agent': `DV-ADSBot/${pkg.version}` },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
    return validateManifest(await response.json());
  } finally {
    clearTimeout(timeout);
  }
}

function run(command, args, options = {}) {
  const { capture = false, ...childOptions } = options;
  return execFileSync(command, args, {
    cwd: rootDir,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
    ...childOptions,
  });
}

function ensureCleanSourceTree() {
  if (!fs.existsSync(path.join(rootDir, '.git'))) throw new Error('This source installation is not a Git checkout.');
  const changes = run('git', ['status', '--porcelain', '--untracked-files=no'], { capture: true }).trim();
  if (changes) throw new Error('Local tracked files have changes; automatic update was skipped to protect them.');
}

function updateSource(manifest) {
  ensureCleanSourceTree();
  logger.info(`Downloading source update ${pkg.version} -> ${manifest.version}.`);
  run('git', ['fetch', '--quiet', '--no-tags', manifest.source.repository, manifest.source.branch]);
  const remotePackage = JSON.parse(run('git', ['show', 'FETCH_HEAD:package.json'], { capture: true }));
  if (remotePackage.version !== manifest.version) {
    throw new Error(`Remote package version ${remotePackage.version} does not match manifest ${manifest.version}.`);
  }
  try {
    run('git', ['merge-base', '--is-ancestor', 'HEAD', 'FETCH_HEAD'], { capture: true });
  } catch {
    throw new Error('The local branch has diverged from the release branch; automatic update was skipped.');
  }
  run('git', ['merge', '--ff-only', 'FETCH_HEAD']);
  const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  run(npmCommand, ['ci']);
}

function restartSource() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [...process.execArgv, ...process.argv.slice(1)], {
      cwd: rootDir,
      env: { ...process.env, DV_ADSBOT_SKIP_UPDATE_ONCE: '1' },
      stdio: 'inherit',
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (signal) logger.warn(`Updated bot stopped with signal ${signal}.`);
      resolve(code ?? 1);
    });
  });
}

async function downloadAsset(asset, destination, fetchImpl = global.fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  try {
    const response = await fetchImpl(asset.url, {
      headers: { Accept: 'application/octet-stream', 'User-Agent': `DV-ADSBot/${pkg.version}` },
      signal: controller.signal,
      redirect: 'follow',
    });
    if (!response.ok) throw new Error(`Release download returned HTTP ${response.status}`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    if (declaredSize > MAX_DOWNLOAD_BYTES) throw new Error('Release archive is larger than the 250 MB safety limit.');

    let received = 0;
    const hash = crypto.createHash('sha256');
    const verifier = new (require('node:stream').Transform)({
      transform(chunk, encoding, callback) {
        received += chunk.length;
        if (received > MAX_DOWNLOAD_BYTES) return callback(new Error('Release archive exceeded the 250 MB safety limit.'));
        hash.update(chunk);
        callback(null, chunk);
      },
    });
    await pipeline(Readable.fromWeb(response.body), verifier, fs.createWriteStream(destination, { flags: 'wx' }));
    const actualHash = hash.digest('hex');
    if (actualHash.toLowerCase() !== asset.sha256.toLowerCase()) {
      throw new Error(`Release archive checksum mismatch (received ${actualHash}).`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function writeWindowsHelper(file) {
  fs.writeFileSync(file, [
    'param([string]$InstallDir,[string]$Archive,[string]$Executable,[int]$ParentProcessId)',
    "$ErrorActionPreference = 'Stop'",
    '$Log = Join-Path (Split-Path -Parent $Archive) "update.log"',
    'try {',
    '  Wait-Process -Id $ParentProcessId -ErrorAction SilentlyContinue',
    '  $Stage = Join-Path (Split-Path -Parent $Archive) "extracted"',
    '  New-Item -ItemType Directory -Path $Stage -Force | Out-Null',
    '  Expand-Archive -LiteralPath $Archive -DestinationPath $Stage -Force',
    '  $Entries = @(Get-ChildItem -LiteralPath $Stage)',
    '  $Payload = if ($Entries.Count -eq 1 -and $Entries[0].PSIsContainer) { $Entries[0].FullName } else { $Stage }',
    '  Copy-Item -Path (Join-Path $Payload "*") -Destination $InstallDir -Recurse -Force',
    '  Start-Process -FilePath $Executable -WorkingDirectory $InstallDir',
    '  "Update completed at $(Get-Date -Format o)" | Set-Content -LiteralPath $Log',
    '} catch {',
    '  $_ | Out-String | Set-Content -LiteralPath $Log',
    '  exit 1',
    '}',
  ].join('\r\n'));
}

function writeLinuxHelper(file) {
  fs.writeFileSync(file, [
    '#!/usr/bin/env sh',
    'set -eu',
    'install_dir="$1"',
    'archive="$2"',
    'executable="$3"',
    'parent_pid="$4"',
    'while kill -0 "$parent_pid" 2>/dev/null; do sleep 1; done',
    'stage="$(dirname "$archive")/extracted"',
    'mkdir -p "$stage"',
    'tar -xzf "$archive" -C "$stage"',
    'payload="$stage"',
    'set -- "$stage"/*',
    '[ "$#" -eq 1 ] && [ -d "$1" ] && payload="$1"',
    'cp -a "$payload"/. "$install_dir"/',
    'chmod +x "$executable"',
    'nohup "$executable" >"$(dirname "$archive")/restart.log" 2>&1 &',
  ].join('\n'));
  fs.chmodSync(file, 0o700);
}

async function stagePackagedUpdate(manifest, fetchImpl) {
  const key = `${process.platform}-${process.arch}`;
  const asset = manifest.assets[key];
  if (!asset) throw new Error(`Release ${manifest.version} has no ${key} download.`);
  if ((process.platform === 'win32' && asset.format !== 'zip') || (process.platform !== 'win32' && asset.format !== 'tar.gz')) {
    throw new Error(`Release ${manifest.version} uses an unsupported archive for ${key}.`);
  }

  const updateDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dv-adsbot-update-'));
  const archive = path.join(updateDir, asset.format === 'zip' ? 'release.zip' : 'release.tar.gz');
  logger.info(`Downloading verified ${key} update ${pkg.version} -> ${manifest.version}.`);
  await downloadAsset(asset, archive, fetchImpl);

  const executable = process.execPath;
  let child;
  if (process.platform === 'win32') {
    const helper = path.join(updateDir, 'apply-update.ps1');
    writeWindowsHelper(helper);
    child = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', helper,
      '-InstallDir', rootDir, '-Archive', archive, '-Executable', executable,
      '-ParentProcessId', String(process.pid),
    ], { detached: true, stdio: 'ignore', windowsHide: true });
  } else {
    const helper = path.join(updateDir, 'apply-update.sh');
    writeLinuxHelper(helper);
    child = spawn('/bin/sh', [helper, rootDir, archive, executable, String(process.pid)], {
      detached: true,
      stdio: 'ignore',
    });
  }
  await new Promise((resolve, reject) => {
    child.once('spawn', resolve);
    child.once('error', reject);
  });
  child.unref();
}

async function autoUpdate(settings = {}, options = {}) {
  if (settings.enabled === false || process.env.DV_ADSBOT_SKIP_UPDATE_ONCE === '1') return { updated: false };
  const manifestUrl = settings.manifestUrl || DEFAULT_MANIFEST_URL;
  try {
    logger.info(`Checking for updates (current version ${pkg.version}).`);
    const manifest = await fetchManifest(manifestUrl, options.fetchImpl);
    const comparison = compareVersions(manifest.version, pkg.version);
    if (comparison <= 0) {
      logger.info(`Bot is up to date (version ${pkg.version}).`);
      return { updated: false, manifest };
    }

    if (isPackaged) {
      await stagePackagedUpdate(manifest, options.fetchImpl);
      logger.info(`Update ${manifest.version} is ready; restarting the bot.`);
      return { updated: true, exit: true, manifest };
    }

    updateSource(manifest);
    logger.info(`Update ${manifest.version} installed; starting the new version.`);
    const exitCode = await restartSource();
    return { updated: true, exit: true, exitCode, manifest };
  } catch (error) {
    logger.warn(`Automatic update skipped: ${error.message}`);
    return { updated: false, error };
  }
}

module.exports = {
  DEFAULT_MANIFEST_URL,
  autoUpdate,
  compareVersions,
  fetchManifest,
  parseVersion,
  validateManifest,
};
