const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript'), crypto = require('node:crypto');
function setup() {
  const secure = new Map(), plain = new Map(), writes = []; let fail = false;
  const SecureStore = { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 7,
    getItemAsync: async key => secure.get(key) ?? null,
    setItemAsync: async (key, value, options) => { writes.push({ key, value, options }); if (fail) throw new Error('Keychain unavailable'); secure.set(key, value); },
    deleteItemAsync: async key => secure.delete(key),
  };
  const storage = { getItem: async key => plain.get(key) ?? null, setItem: async (key, value) => plain.set(key, value), removeItem: async key => plain.delete(key), getAllKeys: async () => [...plain.keys()] };
  const modules = {
    'expo-secure-store': SecureStore, 'react-native': { Platform: { OS: 'ios' } },
    'expo-crypto': { CryptoDigestAlgorithm: { SHA256: 'sha256' }, digestStringAsync: async (_, value) => crypto.createHash('sha256').update(value).digest('hex'), randomUUID: crypto.randomUUID },
    '@react-native-async-storage/async-storage': { __esModule: true, default: storage },
  };
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/profile-draft-storage.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: mod, exports: mod.exports, require: name => modules[name] });
  return { ...mod.exports, secure, plain, writes, fail: value => { fail = value; } };
}
test('native drafts and key names expose no personal data in ordinary storage', async () => {
  const h = setup(), text = JSON.stringify({ idNumber: 'test-id', contactNumber: 'test-phone' });
  await h.saveDraftText(' Player@Example.com ', text);
  assert.equal(h.plain.size, 0); assert.equal(await h.loadDraftText('player@example.com'), text);
  assert.ok([...h.secure.keys()].every(key => !key.includes('@') && !key.includes('test-id')));
  assert.ok(h.writes.every(write => write.options.keychainAccessible === 7));
});
test('large Unicode drafts round-trip through bounded native values and clear fully', async () => {
  const h = setup(), text = JSON.stringify({ bio: '🎾'.repeat(3200) });
  await h.saveDraftText('a@example.com', text); assert.equal(await h.loadDraftText('a@example.com'), text);
  assert.ok(h.writes.every(write => Buffer.byteLength(write.value, 'utf8') <= 2000));
  await h.clearDraftText('a@example.com'); assert.equal(h.secure.size, 0);
});
test('all previous account drafts migrate without touching unrelated storage', async () => {
  const h = setup(); h.plain.set('player_profile_draft_v1:a@example.com', '{"idNumber":"old-a"}'); h.plain.set('player_profile_draft_v1:b@example.com', '{"idNumber":"old-b"}'); h.plain.set('unrelated', 'keep');
  await h.migrateLegacyDrafts(); assert.deepEqual([...h.plain.keys()], ['unrelated']);
  assert.equal(await h.loadDraftText('a@example.com'), '{"idNumber":"old-a"}'); assert.equal(await h.loadDraftText('b@example.com'), '{"idNumber":"old-b"}');
});
test('failed migration never discards the existing draft', async () => {
  const h = setup(); h.plain.set('player_profile_draft_v1:a@example.com', 'old'); h.fail(true);
  await assert.rejects(h.migrateLegacyDrafts(), /Keychain/); assert.equal(h.plain.get('player_profile_draft_v1:a@example.com'), 'old');
});
test('failed replacement preserves the committed draft; concurrent replacements serialize', async () => {
  const h = setup(); await h.saveDraftText('a@example.com', 'old'); h.fail(true);
  await assert.rejects(h.saveDraftText('a@example.com', 'new'), /Keychain/); h.fail(false); assert.equal(await h.loadDraftText('a@example.com'), 'old');
  await Promise.all([h.saveDraftText('a@example.com', 'first'), h.saveDraftText('a@example.com', 'last')]);
  assert.equal(await h.loadDraftText('a@example.com'), 'last'); assert.equal(h.secure.size, 2);
});
test('accounts are isolated and missing native parts never return partial data', async () => {
  const h = setup(); await h.saveDraftText('a@example.com', 'A'); await h.saveDraftText('b@example.com', 'B');
  await h.clearDraftText('a@example.com'); assert.equal(await h.loadDraftText('b@example.com'), 'B');
  const part = [...h.secure.keys()].find(key => /-0$/.test(key)); h.secure.delete(part);
  await assert.rejects(h.loadDraftText('b@example.com'), /incomplete/);
});
