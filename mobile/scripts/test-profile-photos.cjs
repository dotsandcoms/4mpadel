const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');

function photoHarness({ canceled = false, gallery = [], size = 128, width = 4032, height = 3024,
  uploadError = null, saveError = null, savedRow = { id: 42 }, os = 'ios' } = {}) {
  const uploads = [], updates = [], pickerOptions = [], resizes = [], saves = [], queries = [];
  const bytes = new ArrayBuffer(size);
  let cachedFileDeleted = false, releases = 0;
  const storage = {
    upload: async (...args) => { uploads.push(args); return { error: uploadError }; },
    getPublicUrl: path => ({ data: { publicUrl: `https://storage.example/${path}` } }),
  };
  const supabase = {
    storage: { from: bucket => { assert.equal(bucket, 'profile-pics'); return storage; } },
    from: table => {
      assert.equal(table, 'players');
      let isUpdate = false;
      const query = {
        update: value => { isUpdate = true; updates.push(value); return query; },
        select: value => { queries.push(value); return query; },
        eq: (key, value) => { assert.equal(key, 'id'); assert.equal(value, 42); return query; },
        single: async () => ({ data: { additional_images: gallery }, error: null }),
        maybeSingle: async () => { assert.ok(isUpdate); return { data: savedRow, error: saveError }; },
      };
      return query;
    },
  };
  function load(path, modules) {
    const source = ts.transpileModule(fs.readFileSync(path, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const exports = {};
    vm.runInNewContext(source, { exports, require: name => modules[name] ?? {}, fetch: async () => ({ arrayBuffer: async () => bytes }) });
    return exports;
  }
  const profile = load('src/lib/profile.ts', { './supabase': { supabase } });
  const rendered = {
    saveAsync: async options => { saves.push(options); return { uri: 'file:///cache/compressed.jpg' }; },
    release: () => { releases++; },
  };
  const context = {
    resize: options => { resizes.push(options); },
    renderAsync: async () => rendered,
    release: () => { releases++; },
  };
  const photos = load('src/lib/profile-photos.ts', {
    './profile': profile,
    './supabase': { supabase },
    'expo-crypto': { randomUUID: () => 'fresh-photo' },
    'expo-image-picker': { launchImageLibraryAsync: async options => {
      pickerOptions.push(options);
      return canceled ? { canceled: true, assets: null } : { canceled: false, assets: [{ uri: 'file:///photo.heic', width, height }] };
    } },
    'expo-image-manipulator': { ImageManipulator: { manipulate: () => context }, SaveFormat: { JPEG: 'jpeg' } },
    'expo-file-system': { File: class { exists = true; arrayBuffer = async () => bytes; delete() { cachedFileDeleted = true; } } },
    'react-native': { Platform: { OS: os } },
  });
  return { ...photos, uploads, updates, pickerOptions, resizes, saves, queries, bytes,
    get cachedFileDeleted() { return cachedFileDeleted; }, get releases() { return releases; } };
}

test('canceling either native picker leaves photos and storage untouched', async () => {
  const h = photoHarness({ canceled: true });
  assert.equal(await h.changeProfilePhoto(42), null);
  assert.equal(await h.addGalleryPhoto(42), null);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.updates.length, 0);
  assert.equal(h.queries.length, 0);
});

test('profile replacement saves JPEG bytes to the existing player folder with square crop', async () => {
  const h = photoHarness();
  const url = await h.changeProfilePhoto(42);
  assert.equal(url, 'https://storage.example/42/profile_fresh-photo.jpg');
  assert.equal(h.uploads[0][1], h.bytes);
  assert.equal(h.uploads[0][2].contentType, 'image/jpeg');
  assert.equal(h.uploads[0][2].upsert, false);
  assert.equal(h.pickerOptions[0].allowsEditing, true);
  assert.deepEqual(Array.from(h.pickerOptions[0].mediaTypes), ['images']);
  assert.deepEqual(Array.from(h.pickerOptions[0].aspect), [1, 1]);
  assert.equal(h.resizes[0].width, 1024);
  assert.equal(h.saves[0].format, 'jpeg');
  assert.equal(h.updates[0].image_url, url);
  assert.equal(Object.keys(h.updates[0]).length, 1);
  assert.equal(h.cachedFileDeleted, true);
  assert.equal(h.releases, 2);
});

test('gallery appends to saved JSON data and preserves the existing four photos', async () => {
  const existing = ['one', 'two', 'three', 'four'];
  const h = photoHarness({ gallery: JSON.stringify(existing), width: 3024, height: 4032 });
  const urls = await h.addGalleryPhoto(42);
  assert.deepEqual(Array.from(urls), [...existing, 'https://storage.example/42/gallery_fresh-photo.jpg']);
  assert.deepEqual(JSON.parse(h.updates[0].additional_images), Array.from(urls));
  assert.equal(h.pickerOptions[0].allowsEditing, false);
  assert.equal(h.pickerOptions[0].allowsMultipleSelection, false);
  assert.equal(h.resizes[0].height, 2048);
});

test('a full gallery rejects additions before uploading or replacing saved photos', async () => {
  const h = photoHarness({ gallery: ['one', 'two', 'three', 'four', 'five'] });
  await assert.rejects(h.addGalleryPhoto(42), /gallery is full/);
  assert.equal(h.uploads.length, 0);
  assert.equal(h.updates.length, 0);
});

test('upload failures never update the player and release temporary images', async () => {
  for (const operation of ['changeProfilePhoto', 'addGalleryPhoto']) {
    const h = photoHarness({ uploadError: { message: 'Upload denied' } });
    await assert.rejects(h[operation](42), /Upload denied/);
    assert.equal(h.updates.length, 0);
    assert.equal(h.cachedFileDeleted, true);
    assert.equal(h.releases, 2);
  }
});

test('database errors and zero updated rows are reported as failures for both photo types', async () => {
  for (const operation of ['changeProfilePhoto', 'addGalleryPhoto']) {
    for (const options of [{ saveError: { message: 'Save denied' } }, { savedRow: null }]) {
      const h = photoHarness(options);
      await assert.rejects(h[operation](42), /Save denied|Unable to save/);
    }
  }
});

test('empty or oversized compressed images are rejected before uploading', async () => {
  for (const size of [0, 5 * 1024 * 1024 + 1]) {
    const h = photoHarness({ size });
    await assert.rejects(h.changeProfilePhoto(42), /could not be read|smaller photo/);
    assert.equal(h.uploads.length, 0);
    assert.equal(h.updates.length, 0);
  }
});

test('small images retain their dimensions, and the web picker also uploads bytes', async () => {
  const h = photoHarness({ width: 640, height: 480, os: 'web' });
  await h.changeProfilePhoto(42);
  assert.equal(h.resizes.length, 0);
  assert.equal(h.uploads[0][1], h.bytes);
});
