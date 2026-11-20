import test from 'node:test';
import assert from 'node:assert/strict';
import { saveGalleryAlbum, removeGalleryAlbum, removeGalleryPhotos, setGalleryCover, setGalleryVisibility, uploadGalleryPhotos, isGalleryWriteEnabled } from '../src/pages/admin-preview/galleryMutations.js';
import { galleryAlbumDraft, GALLERY_FIELDS } from '../src/pages/admin-preview/galleryData.js';

const fakeProject = 'https://gallery.example.test';
const album = { id: '30000000-0000-4000-8000-000000000001', ...galleryAlbumDraft({ title: 'Dream Padel', slug: 'dream-padel' }), event_id: null, organisation_id: null, parent_album_id: null, album_date: null, updated_at: '2026-10-02T09:00:00Z' };
const photo = id => ({ id, album_id: album.id, image_url: `https://example.invalid/${id}.jpg`, thumbnail_url: null, caption: null, sort_order: 1, created_at: '2026-10-02T09:00:00Z' });
const owned = name => fakeProject + '/storage/v1/object/public/gallery/albums/' + album.id + '/' + name;
const key = value => value.split('/gallery/')[1];
const file = 'abcdef_1760000000000_full.jpg';
const thumb = 'abcdef_1760000000000_thumb.jpg';
function fixture({ grant, changedAlbum, failDelete, failUpload, failInsert, failCleanup, failRead, zeroUpdate = false, userId = 'actor', active = true, platform = false } = {}) {
  grant ??= { email: 'gallery-operator@example.test', role: 'custom', allowed_tabs: ['gallery'] };
  const rows = { albums: [structuredClone(changedAlbum || album)], gallery_images: [photo('photo-1'), photo('photo-2')], players: [], admin_sidebar_permissions: grant ? [grant] : [] };
  const calls = [], uploads = [], removals = [], stored = new Set();
  const client = { supabaseUrl: fakeProject, rpc: async name => ({ data: name === 'account_is_active'
    ? (typeof active === 'function' ? active(rows) : active) : platform }), auth: { getUser: async () => ({ data: { user: { id: userId, email: grant.email } } }) },
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
          if (this.action === 'read' && failRead?.(table)) error = { message: 'Read unavailable' };
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
      remove: async paths => {
        removals.push(paths);
        const data = paths.filter(path => !failCleanup?.(path, removals.length) && stored.delete(path)).map(name => ({ name }));
        return { data, error: null };
      },
      exists: async path => ({ data: stored.has(path), error: null }),
    }; } } };
  return { client, calls, uploads, removals, stored, rows, options: { client, session: { user: { id: 'actor', email: grant.email } }, scopeId: 'all' } };
}
const mutations = f => f.calls.filter(call => call.action !== 'read');
test('gallery writes require an active actor, a current grant and a current application context', async () => {
  const f = fixture(); assert.equal(isGalleryWriteEnabled(f.client), true);
  assert.equal(isGalleryWriteEnabled({}), false);
  for (const extra of [{ isCurrent: () => false }, { scopeId: 'club:1' }]) await assert.rejects(saveGalleryAlbum({ ...f.options, ...extra, original: album, draft: galleryAlbumDraft(album) }));
  const changed = fixture({ userId: 'other' }); await assert.rejects(removeGalleryAlbum({ ...changed.options, album }), /account changed/);
  const inactive = fixture({ active: false });
  await assert.rejects(removeGalleryAlbum({ ...inactive.options, album }), /active account/);
  assert.equal(mutations(f).length + mutations(changed).length + mutations(inactive).length, 0);
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
test('photo removals validate snapshots and identify confirmed rows after a partial failure', async () => {
  const f = fixture({ failDelete: p => p?.id === 'photo-2' });
  const partial = await removeGalleryPhotos({ ...f.options, album, photos: [photo('photo-1'), photo('photo-2')] });
  assert.deepEqual(partial.removed_ids, ['photo-1']);
  assert.match(partial.failure, /Removal failed/);
  assert.equal(partial.cleanup.retained, 1);
  assert.deepEqual(f.rows.gallery_images.map(p => p.id), ['photo-2']);
  assert.deepEqual(f.removals, []);
  const changed = fixture(); await assert.rejects(removeGalleryPhotos({ ...changed.options, album, photos: [{ ...photo('photo-1'), caption: 'stale' }] }), /Selected photos changed/);
  assert.equal(mutations(changed).length, 0);
  assert.deepEqual(await removeGalleryAlbum({ ...changed.options, album }), { album_id: album.id, retained_storage: true });
});

test('photo removal clears owned JPEGs and retains copies shared by records, covers or either profile format', async () => {
  const f = fixture({ platform: true });
  const name = suffix => owned('abcdef_176000000000' + suffix + '_full.jpg');
  const retained = [name(1), name(2), name(3), name(4), name(5)];
  f.rows.gallery_images = [
    { ...photo('selected-1'), image_url: owned(file), thumbnail_url: owned(thumb) },
    ...retained.map((value, index) => ({ ...photo('selected-' + (index+2)), image_url: value })),
    { ...photo('other-album'), album_id: 'different-album', thumbnail_url: retained[0] + '?download=' },
  ];
  f.rows.albums.push({ id: 'another-album', cover_image_url: retained[1] });
  f.rows.players.push({ id: 1, additional_images: [retained[2]] },
    { id: 2, additional_images: JSON.stringify([retained[3]]) },
    { id: 3, image_url: retained[4].replace('/object/', '/render/image/') + '?height=80' });
  for (const value of [owned(file), owned(thumb), ...retained]) f.stored.add(key(value));
  const result = await removeGalleryPhotos({ ...f.options, album, photos: f.rows.gallery_images.slice(0, 6) });
  assert.equal(result.removed_ids.length, 6);
  assert.deepEqual(f.removals, [[key(owned(file)), key(owned(thumb))]]);
  assert.deepEqual(result.cleanup, { cleaned: 2, retained: 5, pending: 0, retry: null });
  assert.equal(f.stored.size, 5);
});

test('photo rows can be removed while foreign, legacy and unverified profile visibility retain files', async () => {
  const f = fixture({ platform: true });
  const other = '10000000-0000-4000-8000-000000000001';
  const unsafe = [
    owned(file).replace(fakeProject, 'https://other.example.test'),
    owned(thumb).replace(album.id, other),
    owned(file).replace('/albums/' + album.id, '/old-title'),
    owned(file).replace('/' + file, '/folder/../' + file),
    owned(file) + '?download',
    owned(file).replace('/object/public/', '/object/sign/'),
  ];
  f.rows.gallery_images = unsafe.map((value, index) => ({ ...photo('unsafe-' + index), image_url: value }));
  const result = await removeGalleryPhotos({ ...f.options, album, photos: f.rows.gallery_images });
  assert.deepEqual(result.cleanup, { cleaned: 0, retained: 6, pending: 0, retry: null });
  assert.deepEqual(f.removals, []);
  const scoped = fixture({ grant: { email: 'limited@example.test', role: 'custom', allowed_tabs: [], module_permissions: { gallery: { allowedAlbums: [album.id] } } } });
  scoped.rows.gallery_images[0].image_url = owned(file);
  const restricted = await removeGalleryPhotos({ ...scoped.options, album, photos: [scoped.rows.gallery_images[0]] });
  assert.equal(restricted.cleanup.retained, 1);
  assert.deepEqual(scoped.removals, []);
  assert.equal(scoped.calls.some(call => call.table === 'players'), false);
});

test('retry rechecks references and only attempts keys left from confirmed row removal', async () => {
  const f = fixture({ platform: true, failCleanup: (path, attempt) => attempt === 1 && path.endsWith('_thumb.jpg') });
  const selected = f.rows.gallery_images[0];
  selected.image_url = owned(file);
  selected.thumbnail_url = owned(thumb);
  for (const value of [selected.image_url, selected.thumbnail_url]) f.stored.add(key(value));
  const result = await removeGalleryPhotos({ ...f.options, album, photos: [selected] });
  assert.equal(result.cleanup.cleaned, 1);
  assert.equal(result.cleanup.pending, 1);
  f.rows.albums[0].cover_image_url = selected.thumbnail_url;
  const retried = await result.cleanup.retry(() => true);
  assert.deepEqual(retried, { cleaned: 0, retained: 1, pending: 0, retry: null });
  assert.equal(f.removals.length, 1);
});

test('reference read failures retain files until a fresh retry can prove the asset is gone', async () => {
  let unavailable = true;
  const f = fixture({ platform: true, failRead: table => table === 'players' && unavailable });
  const selected = { ...f.rows.gallery_images[0], image_url: owned(file) };
  f.rows.gallery_images[0] = selected;
  const result = await removeGalleryPhotos({ ...f.options, album, photos: [selected] });
  assert.equal(result.cleanup.pending, 1);
  assert.deepEqual(f.removals, []);
  unavailable = false;
  const retried = await result.cleanup.retry(() => true);
  assert.deepEqual(retried, { cleaned: 1, retained: 0, pending: 0, retry: null });
  assert.deepEqual(f.removals, [[key(selected.image_url)]]);
});

test('loss of active account blocks later row and file mutations after a partial removal', async () => {
  const f = fixture({ platform: true, active: rows => rows.gallery_images.length === 2 });
  f.rows.gallery_images[0].image_url = owned(file);
  f.stored.add(key(owned(file)));
  const result = await removeGalleryPhotos({ ...f.options, album, photos: f.rows.gallery_images });
  assert.deepEqual(result.removed_ids, ['photo-1']);
  assert.match(result.failure, /active account/);
  assert.equal(result.cleanup.pending, 1);
  assert.equal(f.removals.length, 0);
  assert.equal(f.stored.size, 1);
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
  assert.equal(f.uploads.length, 4); for (const uploaded of f.uploads) { assert.match(uploaded.path, /^albums\/30000000-0000-4000-8000-000000000001\/.+_(full|thumb)\.jpg$/); assert.deepEqual(uploaded.config, { cacheControl: '3600', upsert: false }); }
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

test('quick visibility action checks current assignment and the reviewed album', async () => {
  const f = fixture();
  assert.equal((await setGalleryVisibility({ ...f.options, album }, false)).is_active, false);
  assert.deepEqual(mutations(f)[0].payload, { is_active: false });
  const scoped = fixture({ grant: { email: 'scoped-gallery@example.test', allowed_tabs: [], module_permissions: { gallery: { allowedAlbums: [album.id] } } } });
  await assert.rejects(setGalleryVisibility({ ...scoped.options, album }, false), /assignment/);
  assert.deepEqual(mutations(scoped), []);
});
