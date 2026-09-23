const test = require('node:test');
const assert = require('node:assert/strict');
const ts = require('typescript');
const fs = require('node:fs');
const vm = require('node:vm');
function uploadHarness({ canceled = false, size = 128, type = 'image/png', failure = null } = {}) {
  const uploads = [], pickerOptions = [];
  const buffer = new ArrayBuffer(size);
  const source = ts.transpileModule(fs.readFileSync('src/lib/sponsor-logo.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  const storage = { upload: async (...args) => { uploads.push(args); return { error: failure }; }, getPublicUrl: path => ({ data: { publicUrl: `https://storage.example/${path}` } }) };
  const modules = {
    'expo-document-picker': { getDocumentAsync: async options => { pickerOptions.push(options); return canceled ? { canceled: true } : { canceled: false, assets: [{ name: 'sponsor.png', uri: 'file:///cache/sponsor.png', mimeType: type }] }; } },
    'expo-file-system': { File: class { size = size; type = type; arrayBuffer = async () => buffer; } },
    'expo-crypto': { randomUUID: () => 'unique-upload' },
    './supabase': { supabase: { storage: { from: bucket => { assert.equal(bucket, 'profile-pics'); return storage; } } } },
  };
  vm.runInNewContext(source, { exports, require: name => modules[name] });
  return { ...exports, uploads, pickerOptions, buffer };
}
test('picker cancellation leaves the existing logo unchanged and makes no upload', async () => {
  const h = uploadHarness({ canceled: true });
  assert.equal(await h.pickSponsorLogo(524, 'player@example.com'), null);
  assert.equal(h.uploads.length, 0);
});
test('logo upload uses ArrayBuffer and the website event storage folder', async () => {
  const h = uploadHarness();
  const result = await h.pickSponsorLogo(524, 'player@example.com');
  assert.equal(result, 'https://storage.example/tshirt-logos/524/player@example.com_unique-upload.png');
  assert.equal(h.uploads[0][1], h.buffer);
  assert.equal(h.uploads[0][2].contentType, 'image/png');
  assert.equal(h.uploads[0][2].upsert, false);
  assert.equal(h.pickerOptions[0].copyToCacheDirectory, true);
});
test('images larger than 2MB are rejected before upload', async () => {
  const h = uploadHarness({ size: 2 * 1024 * 1024 + 1 });
  await assert.rejects(h.pickSponsorLogo(524, 'p@example.com'), /2MB/);
  assert.equal(h.uploads.length, 0);
});
test('non-image and empty files are rejected before upload', async () => {
  for (const opts of [{ type: 'application/pdf' }, { size: 0 }]) {
    const h = uploadHarness(opts);
    await assert.rejects(h.pickSponsorLogo(524, 'p@example.com'));
    assert.equal(h.uploads.length, 0);
  }
});
test('storage failure does not return a replacement logo URL', async () => {
  const h = uploadHarness({ failure: new Error('Upload denied') });
  await assert.rejects(h.pickSponsorLogo(524, 'p@example.com'), /Upload denied/);
});
