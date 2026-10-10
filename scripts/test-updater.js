const assert = require('node:assert/strict');
const { compareVersions, fetchManifest, parseVersion, validateManifest } = require('../src/utils/updater');

assert.deepEqual(parseVersion('v1.2.3'), { numbers: [1, 2, 3], prerelease: [] });
assert.equal(parseVersion('not-a-version'), null);
assert.equal(compareVersions('1.0.4', '1.0.3'), 1);
assert.equal(compareVersions('1.0.3', '1.0.3'), 0);
assert.equal(compareVersions('1.0.2', '1.0.3'), -1);
assert.equal(compareVersions('2.0.0', '1.99.99'), 1);
assert.equal(compareVersions('1.0.0-beta.2', '1.0.0-beta.10'), -1);
assert.equal(compareVersions('1.0.0', '1.0.0-rc.1'), 1);

const manifest = validateManifest({
  schemaVersion: 1,
  version: '1.2.3',
  releasePage: 'https://example.test/releases',
  source: { repository: 'https://example.test/repository.git', branch: 'main' },
  assets: {
    'win32-x64': {
      version: '1.2.3',
      url: 'https://example.test/release.zip',
      format: 'zip',
      sha256: 'a'.repeat(64),
    },
  },
});
assert.equal(manifest.version, '1.2.3');
assert.throws(() => validateManifest({ ...manifest, version: 'latest' }), /Invalid update manifest version/);
assert.throws(() => validateManifest({
  ...manifest,
  assets: { 'win32-x64': { ...manifest.assets['win32-x64'], sha256: '' } },
}), /SHA-256/);
assert.throws(() => validateManifest({
  ...manifest,
  assets: { 'win32-x64': { ...manifest.assets['win32-x64'], version: '1.2.2' } },
}), /match the release version/);
assert.throws(() => validateManifest({
  ...manifest,
  source: { ...manifest.source, repository: 'http://example.test/repository.git' },
}), /repository must be an HTTPS URL/);
assert.throws(() => validateManifest({
  ...manifest,
  source: { ...manifest.source, branch: '--upload-pack=malicious' },
}), /source branch is invalid/);
assert.throws(() => validateManifest({
  ...manifest,
  assets: { 'win32-x64': { ...manifest.assets['win32-x64'], url: 'http://example.test/release.zip' } },
}), /asset "win32-x64" URL must be an HTTPS URL/);

async function testFetch() {
  const fetched = await fetchManifest('https://example.test/version.json', async (url, options) => {
    assert.equal(url, 'https://example.test/version.json');
    assert.equal(options.headers.Accept, 'application/json');
    return { ok: true, json: async () => manifest };
  });
  assert.equal(fetched.version, '1.2.3');
}

testFetch()
  .then(() => console.log('Updater tests passed.'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
