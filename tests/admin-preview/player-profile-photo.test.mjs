import { test } from 'node:test';
import assert from 'node:assert/strict';
import { uploadPlayerProfilePhoto } from '../../src/pages/admin-preview/playerProfilePhoto.js';

async function fixture(run, options = {}) {
  const previous = { FileReader: globalThis.FileReader, Image: globalThis.Image, document: globalThis.document };
  const state = { grants: 0, writes: [], canvas: null };
  globalThis.FileReader = class { readAsDataURL() { this.result = 'data:image/png;base64,mocked'; queueMicrotask(() => this.onload?.()); } };
  globalThis.Image = class { naturalWidth = options.width || 2400; naturalHeight = options.height || 1200; set src(value) { queueMicrotask(() => options.decodeError ? this.onerror?.() : this.onload?.()); } };
  globalThis.document = { createElement() { const canvas = { getContext: () => ({ drawImage() {} }), toBlob(callback, mime, quality) { state.mime = mime; state.quality = quality; callback(options.emptyBlob ? null : new Blob(['mockjpeg'], { type: mime })); } }; state.canvas = canvas; return canvas; } };
  const client = {
    auth: { async getUser() { return { data: { user: { email: 'admin@example.test' } } }; } },
    from() { const query = { select() { return query; }, ilike() { return query; }, async maybeSingle() { state.grants += 1; return { data: { role: options.denied || (options.revoke && state.grants > 1) ? 'custom' : 'super_admin' } }; } }; return query; },
    storage: { from(bucket) { assert.equal(bucket, 'profile-pics'); return { async upload(path, blob, args) { state.writes.push({ path, blob, args }); return { error: options.uploadError ? { message: 'Denied' } : null }; }, getPublicUrl(path) { return { data: { publicUrl: `https://storage.example.test/${path}` } }; } }; } },
  };
  try { await run({ client, state, file: new Blob(['image'], { type: 'image/png' }) }); }
  finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
}

test('photo upload preserves MAIN JPEG sizing/path and does not update player row', async () => fixture(async ({ client, state, file }) => {
  const url = await uploadPlayerProfilePhoto(client, 123, file);
  assert.match(url, /players\/123_\d+\.jpg$/);
  assert.equal(state.canvas.width, 1200); assert.equal(state.canvas.height, 600);
  assert.equal(state.mime, 'image/jpeg'); assert.equal(state.quality, 0.8);
  assert.equal(state.grants, 2); assert.equal(state.writes.length, 1);
  assert.deepEqual(state.writes[0].args, { contentType: 'image/jpeg', upsert: false });
}));
test('small photo dimensions are not enlarged', async () => fixture(async ({ client, state, file }) => {
  await uploadPlayerProfilePhoto(client, 'player-id', file);
  assert.equal(state.canvas.width, 600); assert.equal(state.canvas.height, 900);
}, { width: 600, height: 900 }));
test('identity changed while processing a photo blocks storage write', async () => fixture(async ({ client, state, file }) => {
  let checks = 0;
  client.auth.getUser = async () => ({data:{user:{id:++checks > 2 ? 'changed' : 'original',email:'admin@example.test'}}});
  await assert.rejects(uploadPlayerProfilePhoto(client,123,file,{userId:'original',scopeId:'all',isCurrent:()=>true}),/signed-in account changed/);
  assert.equal(state.writes.length,0);
}));
test('invalid files, access denial and mid-processing revocation never upload', async () => {
  for (const options of [{ denied: true }, { revoke: true }]) await fixture(async ({ client, state, file }) => {
    await assert.rejects(uploadPlayerProfilePhoto(client, 123, file), /grant/); assert.equal(state.writes.length, 0);
  }, options);
  await fixture(async ({ client, state }) => {
    await assert.rejects(uploadPlayerProfilePhoto(client, 123, new Blob(['text'], { type: 'text/plain' })), /image file/);
    await assert.rejects(uploadPlayerProfilePhoto(client, '../other', new Blob(['image'], { type: 'image/png' })), /saved player/);
    assert.equal(state.writes.length, 0);
  });
});
test('decode, empty encoding and storage failures surface errors', async () => {
  for (const options of [{ decodeError: true }, { emptyBlob: true }, { uploadError: true }]) await fixture(async ({ client, state, file }) => {
    await assert.rejects(uploadPlayerProfilePhoto(client, 123, file));
    assert.equal(state.writes.length, options.uploadError ? 1 : 0);
  }, options);
});
