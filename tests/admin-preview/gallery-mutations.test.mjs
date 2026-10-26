import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGalleryAlbum, removeGalleryAlbum, removeGalleryPhotos, setGalleryCover, uploadGalleryPhotos, isGalleryWriteEnabled } from '../../src/pages/admin-preview/galleryMutations.js';
import { galleryAlbumDraft, GALLERY_FIELDS } from '../../src/pages/admin-preview/galleryData.js';

const staging = 'https://cefmzkwabdqqoagxhekc.supabase.co';
const album = { id: 'album-1', ...galleryAlbumDraft({ title: 'Dream Padel', slug: 'dream-padel' }), event_id: null, organisation_id: null, parent_album_id: null, album_date: null, updated_at: '2026-10-02T09:00:00Z' };
const photo = id => ({ id, album_id: album.id, image_url: `https://example.invalid/${id}.jpg`, thumbnail_url: null, caption: null, sort_order: 1, created_at: '2026-10-02T09:00:00Z' });
function fixture({ grant, changedAlbum, failDelete, failUpload, failInsert, zeroUpdate = false, userId = 'actor' } = {}) {
  const rows = { albums: [structuredClone(changedAlbum || album)], gallery_images: [photo('photo-1'), photo('photo-2')], admin_sidebar_permissions: grant ? [grant] : [] };
  const calls = [], uploads = [];
  const client = { supabaseUrl: staging, auth: { getUser: async () => ({ data: { user: { id: userId, email: grant?.email || 'admin@4mpadel.co.za' } } }) },
    from(table) {
      const q = { table, action: 'read', filters: [], offset: 0, limit: 499,
        select(columns) { this.columns = columns; return this; }, order() { return this; }, ilike() { return this; },
        eq(key, value) { this.filters.push(row => row[key] === value); return this; },
        is(key, value) { this.filters.push(row => (row[key] ?? null) === value); return this; },
        in(key, values) { this.filters.push(row => values.includes(row[key])); return this; },
        range(start, end) { this.offset = start; this.limit = end - start + 1; return this; },
        update(payload) { this.action = 'update'; this.payload = payload; return this; },
        insert(payload) { this.action = 'insert'; this.payload = payload; return this; },
        delete() { this.action = 'delete'; return this; },
        single() { this.one = true; return this; }, maybeSingle() { this.one = true; return this; },
        then(resolve, reject) {
          calls.push({ table, action: this.action, payload: this.payload, predicates: this.filters.length });
          let data = rows[table].filter(row => this.filters.every(matches => matches(row))), error = null;
          if (this.action === 'insert') {
            if (failInsert?.(this.payload)) error = { message: 'Registration failed' };
            else { data = [{ caption: null, thumbnail_url: null, created_at: '2026-10-02T09:00:00Z', ...this.payload }]; rows[table].push(...data); }
          } else if (this.action === 'delete') {
            if (failDelete?.(data[0])) error = { message: 'Removal failed' };
            else rows[table] = rows[table].filter(row => !data.includes(row));
          } else if (this.action === 'update') {
            if (zeroUpdate) data = [];
            else data.forEach(row => Object.assign(row, this.payload));
          }
          data = this.one ? data[0] || null : data.slice(this.offset, this.offset + this.limit);
          return Promise.resolve({ data: structuredClone(data), error }).then(resolve, reject);
        }
      }; return q;
    }, storage: { from(bucket) { assert.equal(bucket, 'gallery'); return {
      upload: async (path, blob, config) => { uploads.push({ path, blob, config }); return { error: failUpload?.(path) ? { message: 'Storage failed' } : null }; },
      getPublicUrl: path => ({ data: { publicUrl: `https://example.invalid/${path}` } }),
      remove: () => { throw Error('Original storage must never be deleted'); }
    }; } } };
  return { client, calls, uploads, rows, options: { client, session: { user: { id: 'actor' } }, scopeId: 'all', config: { enable: 'staging' } } };
}
const mutations = f => f.calls.filter(call => call.action !== 'read');
test('gallery writes require exact staging host, explicit flag and current authenticated context', async () => {
  const f = fixture(); assert.equal(isGalleryWriteEnabled(f.client, { enable: 'staging' }), true);
  assert.equal(isGalleryWriteEnabled({ supabaseUrl: 'https://uzglrpbixubfijvjbtgz.supabase.co' }, { enable: 'staging' }), false);
  for (const extra of [{ config: {} }, { isCurrent: () => false }, { scopeId: 'club:1' }]) await assert.rejects(saveGalleryAlbum({ ...f.options, ...extra, original: album, draft: galleryAlbumDraft(album) }));
  const changed = fixture({ userId: 'other' }); await assert.rejects(removeGalleryAlbum({ ...changed.options, album }), /account changed/);
  assert.equal(mutations(f).length + mutations(changed).length, 0);
});
test('album assignments permit assigned photo actions but not album management', async () => {
  const f = fixture({ grant: { email: 'operator@example.invalid', role: 'custom', allowed_tabs: [], module_permissions: { gallery: { allowedAlbums: [album.id] } } } });
  await assert.rejects(saveGalleryAlbum({ ...f.options, original: album, draft: galleryAlbumDraft(album) }), /assignment/);
  await assert.rejects(removeGalleryAlbum({ ...f.options, album }), /assignment/);
  await assert.rejects(removeGalleryPhotos({ ...f.options, album: { ...album, id: 'other' }, photos: [] }), /assignment/);
  assert.equal(mutations(f).length, 0);
  assert.equal((await setGalleryCover({ ...f.options, album, photo: photo('photo-1') })).cover_image_url, photo('photo-1').image_url);
});
test('album updates match all live editable fields and guard their original snapshot', async () => {
  const f = fixture(), draft = { ...galleryAlbumDraft(album), title: 'Updated title' };
  assert.equal((await saveGalleryAlbum({ ...f.options, original: album, draft })).title, draft.title);
  const write = mutations(f)[0]; assert.deepEqual(Object.keys(write.payload), GALLERY_FIELDS); assert.equal(write.predicates, GALLERY_FIELDS.length + 2);
  const changed = fixture({ changedAlbum: { ...album, title: 'Changed elsewhere' } });
  await assert.rejects(saveGalleryAlbum({ ...changed.options, original: album, draft }), /album changed/); assert.equal(mutations(changed).length, 0);
  const raced = fixture({ zeroUpdate: true }); await assert.rejects(saveGalleryAlbum({ ...raced.options, original: album, draft }), /original record changed/);
});
test('new albums retain the reviewed operation ID and source nullable fields', async () => {
  const f = fixture(); await assert.rejects(saveGalleryAlbum({ ...f.options, draft: galleryAlbumDraft(album) }), /Review/);
  const created = await saveGalleryAlbum({ ...f.options, operationId: 'reviewed-id', draft: galleryAlbumDraft(album) });
  assert.equal(created.id, 'reviewed-id'); for (const key of ['event_id', 'organisation_id', 'parent_album_id', 'album_date']) assert.equal(created[key], null);
});
test('photo removals validate snapshots and report partial outcomes without deleting storage', async () => {
  const f = fixture({ failDelete: p => p?.id === 'photo-2' });
  await assert.rejects(removeGalleryPhotos({ ...f.options, album, photos: [photo('photo-1'), photo('photo-2')] }), error => {
    assert.deepEqual(error.removed_ids, ['photo-1']); assert.equal(error.retained_storage, true); return /Removal failed/.test(error.message);
  });
  assert.deepEqual(f.rows.gallery_images.map(p => p.id), ['photo-2']);
  const changed = fixture(); await assert.rejects(removeGalleryPhotos({ ...changed.options, album, photos: [{ ...photo('photo-1'), caption: 'stale' }] }), /Selected photos changed/);
  assert.equal(mutations(changed).length, 0);
  assert.deepEqual(await removeGalleryAlbum({ ...changed.options, album }), { album_id: album.id, retained_storage: true });
});
test('cover updates reject photos from other albums and stale image snapshots', async () => {
  const f = fixture(); await assert.rejects(setGalleryCover({ ...f.options, album, photo: { ...photo('photo-1'), image_url: 'https://example.invalid/stale.jpg' } }), /selected photo changed/);
  await assert.rejects(setGalleryCover({ ...f.options, album, photo: photo('unknown') }), /selected photo changed/); assert.equal(mutations(f).length, 0);
});
test('upload keeps source resizing/storage rules and reports individual failures before setting first successful cover', async () => {
  let fullCalls = 0;
  const f = fixture({ failUpload: path => path.endsWith('_full.jpg') && ++fullCalls === 1 }), sizes = [], progress = [];
  const result = await uploadGalleryPhotos({ ...f.options, album, files: [{ type: 'image/png' }, { type: 'image/jpeg' }], resize: async (file, width, quality) => { sizes.push([width, quality]); return new Blob(['jpeg']); }, onProgress: step => progress.push(step) });
  assert.deepEqual(sizes, [[1920, .82], [600, .7], [1920, .82], [600, .7]]);
  assert.equal(result.attempted, 2); assert.equal(result.photos.length, 1); assert.equal(result.failures.length, 1); assert.equal(result.failures[0].index, 1);
  assert.equal(result.album.cover_image_url, result.photos[0].image_url); assert.equal(result.photos[0].sort_order, 2);
  assert.equal(f.uploads.length, 4); for (const uploaded of f.uploads) { assert.match(uploaded.path, /^dream-padel\/.+_(full|thumb)\.jpg$/); assert.deepEqual(uploaded.config, { cacheControl: '3600', upsert: false }); }
  assert.deepEqual(progress, [{ current: 1, total: 2 }, { current: 2, total: 2 }]);
});
test('unregistered uploads and changed contexts are explicit, retain assets and never silently retry', async () => {
  const f = fixture({ failInsert: () => true });
  const result = await uploadGalleryPhotos({ ...f.options, album, files: [{ type: 'image/png' }], resize: async () => new Blob(['jpeg']) });
  assert.equal(result.photos.length, 0); assert.equal(result.failures.length, 1); assert.match(result.failures[0].message, /Registration failed/); assert.equal(f.uploads.length, 2); assert.equal(mutations(f).length, 1);
  const changed = fixture(); let current = true;
  const stopped = await uploadGalleryPhotos({ ...changed.options, album, files: [{ type: 'image/png' }, { type: 'image/png' }], isCurrent: () => current, resize: async () => { current = false; return new Blob(['jpeg']); } });
  assert.equal(stopped.attempted, 1); assert.equal(stopped.photos.length, 0); assert.equal(stopped.failures.length, 1); assert.equal(changed.uploads.length, 0);
});
