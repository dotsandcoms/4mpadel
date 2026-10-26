import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

// Run the shared browser helper with storage/canvas fakes; no Supabase client or network.
function helper() {
  const uploads = [], encodings = [];
  const bucket = { upload: async (...args) => { uploads.push(args); return {}; }, getPublicUrl: path => ({ data: { publicUrl: `https://example.test/${path}` } }) };
  const canvas = { width: 0, height: 0, getContext: () => ({ clearRect() {}, drawImage() {} }), toBlob: (callback, type, quality) => { encodings.push({ width: canvas.width, height: canvas.height, type, quality }); callback({}); } };
  const source = readFileSync(new URL('../../src/utils/eventMedia.js', import.meta.url), 'utf8').replace(/^import .*;\n/, '').replaceAll('export const ', 'const ');
  const context = { supabase: { storage: { from: name => { assert.equal(name, 'gallery'); return bucket; } } }, Date, Math, document: { createElement: () => canvas }, File: class { constructor(parts, name, options) { this.name = name; this.type = options.type; } }, FileReader: class { readAsDataURL() { queueMicrotask(() => this.onload({ target: { result: 'data:image/png;base64,AA==' } })); } }, Image: class { width = 2400; height = 1200; set src(value) { queueMicrotask(() => this.onload()); } } };
  return { ...vm.runInNewContext(`${source}\n({ uploadToGallery, uploadEventAsset })`, context), uploads, encodings };
}
test('event media preserves logo transparency and existing resize settings/folders', async () => {
  const h = helper();
  await h.uploadToGallery({ name: 'Logo.webp' }, 'sponsors');
  await h.uploadToGallery({ name: 'Cover.png' }, 'covers');
  assert.match(h.uploads[0][0], /^sponsors\/sponsors_.*\.png$/);
  assert.match(h.uploads[1][0], /^covers\/covers_.*\.jpg$/);
  assert.deepEqual(h.encodings.map(row => ({ ...row })), [{ width: 1200, height: 600, type: 'image/png', quality: 0.8 }, { width: 1200, height: 600, type: 'image/jpeg', quality: 0.8 }]);
});
test('documents enforce existing 10MB limit before uploading', async () => {
  const h = helper();
  await assert.rejects(h.uploadEventAsset({ name: 'large.pdf', size: 10 * 1024 * 1024 + 1 }, 'event-posters'), /10 MB/);
  assert.equal(h.uploads.length, 0);
  const file = { name: 'Event Kit.PDF', size: 10, type: 'application/pdf' };
  const url = await h.uploadEventAsset(file, 'event-kits');
  assert.match(url, /event-kits\/.*event-kit\.pdf$/);
  assert.equal(h.uploads[0][1], file);
  assert.equal(h.uploads[0][2].upsert, false);
});
