import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, directory, bundle;
const albumId = '50000000-0000-4000-8000-000000000001';
const fixture = `
  import { createRoot } from 'react-dom/client';
  import { MemoryRouter } from 'react-router-dom';
  import GalleryWorkspace from './src/pages/admin-preview/GalleryWorkspace.jsx';
  import CoachesWorkspace from './src/pages/admin-preview/CoachesWorkspace.jsx';
  const actor = { id: 'fictional-operator', email: 'reviewer@example.test' };
  const grant = { role: 'custom', email: actor.email, allowed_tabs: ['gallery', 'coaches'], module_permissions: {} };
  const date = '2026-01-02T00:00:00Z';
  const origin = 'https://media.example.test';
  const result = data => ({ data, error: null });
  const image = name => origin + '/storage/v1/object/public/gallery/albums/${albumId}/photo' + name + '_1760000000000_full.jpg';
  const tables = {
    admin_sidebar_permissions: [grant],
    calendar: [], organisations: [], players: [],
    albums: [{ id: '${albumId}', title: 'Fictional gallery', description: '', is_active: true, slug: 'fictional-gallery',
      event_id: null, updated_at: date, created_at: date }],
    gallery_images: [1, 2].map(id => ({ id: 'photo-' + id, album_id: '${albumId}', image_url: image(id), thumbnail_url: null, sort_order: id, created_at: date })),
    coach_applications: [{ id: 'coach-a', full_name: 'Fictional coach', email: 'coach@example.test', created_at: date, status: 'approved',
      profile_pic_url: origin + '/storage/v1/object/public/coach-profiles/real-coach.jpg' }],
  };
  if (window.sharedPhoto) {
    tables.coach_applications.push({ ...tables.coach_applications[0], id: 'coach-b', full_name: 'Second coach', email: 'second-coach@example.test' });
  }
  window.calls = [];
  const stored = new Set([1, 2].map(id => image(id).split('/gallery/')[1]));
  let galleryRemovals = 0;
  const client = {
    supabaseUrl: origin,
    auth: { getUser: async () => result({ user: actor }) },
    rpc: async name => result(name === 'account_is_active' ? window.active !== false : name === 'is_super_admin' && !window.useCoaches),
    from(table) {
      let offset = 0, count = Number.MAX_SAFE_INTEGER, single = false, criteria = [], action = 'read', payload;
      const query = {
        select() { return query; }, ilike() { return query; }, order() { return query; }, abortSignal() { return query; },
        eq(key, value) { criteria.push(row => row[key] === value); return query; },
        is(key, value) { criteria.push(row => (row[key] ?? null) === value); return query; },
        in(key, values) { criteria.push(row => values.includes(row[key])); return query; },
        range(start, end) { offset = start; count = end - start + 1; return query; },
        limit(limit) { count = limit; return query; },
        single() { single = true; return query; }, maybeSingle() { single = true; return query; },
        delete() { action = 'delete'; return query; },
        update(fields) { action = 'update'; payload = fields; return query; },
        insert(fields) { action = 'insert'; payload = fields; return query; },
        then(resolve) {
          let rows = tables[table].filter(row => criteria.every(predicate => predicate(row)));
          if (action !== 'read') window.calls.push({ table, action, ids: rows.map(row => row.id), payload });
          if (action === 'delete') tables[table] = tables[table].filter(row => !rows.includes(row));
          if (action === 'update') rows.forEach(row => Object.assign(row, payload));
          if (action === 'insert') { rows = [{ ...payload, created_at: date, updated_at: date }]; tables[table].push(...rows); }
          resolve(result(structuredClone(single ? rows[0] || null : rows.slice(offset, offset + count))));
        },
      };
      return query;
    },
    storage: { from(bucket) { return {
      remove: async paths => {
        window.calls.push({ table: bucket, action: 'storage-remove', paths });
        if (bucket !== 'gallery') return result(paths);
        galleryRemovals++;
        const removed = paths.filter(path => !(window.failGalleryCleanup && galleryRemovals === 1 && path.includes('photo1_')) && stored.delete(path));
        return result(removed.map(name => ({ name })));
      },
      exists: async path => result(stored.has(path)),
      upload: async path => { window.calls.push({ table: bucket, action: 'storage-upload', path }); return result({ path }); },
      getPublicUrl: path => result({ publicUrl: origin + '/storage/v1/object/public/' + bucket + '/' + path }),
    }; } },
  };
  createRoot(document.getElementById('root')).render(<MemoryRouter><div className="ap-root">
    {window.useCoaches ? <CoachesWorkspace client={client} session={{ user: actor }} permissions={grant} scopeId="all" />
      : <GalleryWorkspace client={client} session={{ user: actor }} permissions={grant} scopeId="all" />}
  </div></MemoryRouter>);
`;

before(async () => {
  directory = await mkdtemp(join(tmpdir(), '4m-gallery-coaches-'));
  bundle = join(directory, 'fixture.js');
  await build({
    stdin: { contents: fixture, resolveDir: process.cwd(), loader: 'jsx' }, outfile: bundle,
    bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', define: { 'import.meta.env': '{}' },
    plugins: [{ name: 'synthetic-gallery-coaches', setup(builder) {
      builder.onResolve({ filter: /supabaseClient(?:\.js)?$/ }, () => ({ path: 'client', namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const supabase = null;' }));
    } }],
  });
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

async function open(useCoaches, sharedPhoto = false, failGalleryCleanup = false) {
  const page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.setRequestInterception(true);
  page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
  await page.setContent('<div id="root"></div>');
  await page.addStyleTag({ path: bundle.replace(/\.js$/, '.css') });
  await page.evaluate((coachMode, shared, fail) => {
    window.useCoaches = coachMode; window.sharedPhoto = shared; window.failGalleryCleanup = fail;
  }, useCoaches, sharedPhoto, failGalleryCleanup);
  await page.addScriptTag({ path: bundle });
  return page;
}

async function click(page, label) {
  await page.waitForFunction(text => [...document.querySelectorAll('button')].some(button => !button.disabled && button.textContent.trim() === text), {}, label);
  await page.evaluate(text => [...document.querySelectorAll('button')].find(button => !button.disabled && button.textContent.trim() === text).click(), label);
}

test('Gallery confirms publish and hide, then removes selected rows and owned unreferenced originals', async () => {
  const page = await open(false);
  try {
    await page.waitForSelector('.gw-album');
    await page.click('.gw-album');
    await click(page, 'Hide album');
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    await click(page, 'Cancel');
    await click(page, 'Hide album');
    await click(page, 'Confirm change');
    await click(page, 'Publish album');
    await click(page, 'Confirm change');
    await page.waitForFunction(() => document.body.textContent.includes('Album published.'));
    assert.deepEqual(await page.evaluate(() => window.calls.map(call => call.payload)), [{ is_active: false }, { is_active: true }]);
    await click(page, 'Select all photos');
    await click(page, 'Clear selection');
    await click(page, 'Select all photos');
    await click(page, 'Remove selected (2)');
    await click(page, 'Confirm change');
    await page.waitForFunction(() => document.body.textContent.includes('2 photo records removed.'));
    const deletions = await page.evaluate(() => window.calls.filter(call => call.action.includes('remove') || call.action === 'delete'));
    assert.deepEqual(deletions.map(item => [item.table, item.action]), [['gallery_images', 'delete'], ['gallery_images', 'delete'], ['gallery', 'storage-remove']]);
    assert.deepEqual(deletions.at(-1).paths, [1, 2].map(id => `albums/${albumId}/photo${id}_1760000000000_full.jpg`));
  } finally { await page.close(); }
});

test('Gallery offers a storage-only retry after confirming a single photo removal', async () => {
  const page = await open(false, false, true);
  try {
    await page.waitForSelector('.gw-album');
    await page.click('.gw-album');
    await page.waitForSelector('[aria-label="Open photo 1"]', { visible: true });
    await page.$eval('[aria-label="Open photo 1"]', button => button.click());
    await page.waitForSelector('dialog[open][aria-label="Photo details"]');
    await click(page, 'Remove photo');
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    await click(page, 'Confirm change');
    await click(page, 'Retry file cleanup');
    await page.waitForFunction(() => document.body.textContent.includes('owned image file cleared'));
    const calls = await page.evaluate(() => window.calls.map(item => [item.table, item.action]));
    assert.deepEqual(calls, [['gallery_images', 'delete'], ['gallery', 'storage-remove'], ['gallery', 'storage-remove']]);
    assert.equal(await page.evaluate(() => document.body.textContent.includes('Retry file cleanup')), false);
  } finally { await page.close(); }
});

test('Coaches restores application charts and confirms record deletion before removing the owned photo', async () => {
  const page = await open(true);
  try {
    await page.waitForSelector('.co-charts');
    assert.match(await page.$eval('.co-charts', chart => chart.textContent), /Application status.*Approved1.*Recent applications/s);
    await page.click('.co-person');
    await click(page, 'Delete application');
    assert.equal(await page.evaluate(() => window.calls.length), 0);
    await click(page, 'Cancel');
    await click(page, 'Delete application');
    await click(page, 'Confirm delete application');
    await page.waitForFunction(() => document.body.textContent.includes('Coach application deleted.'));
    assert.deepEqual(await page.evaluate(() => window.calls.map(call => [call.table, call.action])), [['coach_applications', 'delete'], ['coach-profiles', 'storage-remove']]);
    assert.equal(await page.$('.co-person'), null);
  } finally { await page.close(); }
});

test('a revoked Coaches account cannot delete and a shared photo stays with its remaining record', async () => {
  const revoked = await open(true);
  try {
    await revoked.waitForSelector('.co-person');
    await revoked.click('.co-person');
    await click(revoked, 'Delete application');
    await revoked.evaluate(() => { window.active = false; });
    await click(revoked, 'Confirm delete application');
    await revoked.waitForFunction(() => document.body.textContent.includes('An active Coaches administrator is required.'));
    assert.equal(await revoked.evaluate(() => window.calls.length), 0);
  } finally { await revoked.close(); }

  const shared = await open(true, true);
  try {
    await shared.waitForSelector('.co-person');
    await shared.click('.co-person');
    await click(shared, 'Delete application');
    await click(shared, 'Confirm delete application');
    await shared.waitForFunction(() => document.body.textContent.includes('Its original photo file was retained.'));
    assert.deepEqual(await shared.evaluate(() => window.calls.map(call => call.action)), ['delete']);
    assert.match(await shared.$eval('.co-person', row => row.textContent), /Second coach/);
  } finally { await shared.close(); }
});
