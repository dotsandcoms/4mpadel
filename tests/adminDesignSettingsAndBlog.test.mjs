import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const source = `
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Blog from './src/pages/admin-preview/ReviewBlogWorkspace.jsx';
import Settings from './src/pages/admin-preview/ReviewSettingsWorkspace.jsx';

const user = { id: 'fixture-admin', email: 'admin@example.test' };
const site = { instagram: 'https://example.test/instagram', youtube: '', facebook: '', whatsapp: '' };
let commerce = { id: 'default', updated_at: '2026-01-01T00:00:00Z', fee_label: 'Service fee', license_fee_percent: 0, event_fee_percent: 0 };
const posts = Array.from({ length: 51 }, (_, index) => ({ id: index + 1, title: 'Fixture news ' + (index + 1), content: 'Old body', status: 'Published', category: 'Club news', date: '2026-11-19', slug: 'fixture-news-' + (index + 1) }));
const writes = [];
window.fixtureWrites = writes;
window.fixtureAllowed = true;
Object.defineProperty(crypto, 'randomUUID', { value: () => '11111111-1111-4111-8111-111111111111' });

const client = {
  auth: { getUser: async () => ({ data: { user } }) },
  rpc: async name => ({ data: name === 'account_is_active' || (name === 'is_super_admin' && window.fixtureAllowed) }),
  storage: { from: name => ({
    upload: async (path, file) => { writes.push(['upload', name, file.name]); return { data: { path } }; },
    getPublicUrl: path => ({ data: { publicUrl: 'https://example.test/images/' + path } }),
    remove: async () => ({}),
  }) },
  from(table) {
    let id, start = 0, end = Infinity, mutation, patch;
    const execute = () => {
      if (mutation) {
        writes.push([table, mutation, patch, id]);
        if (table === 'settings') for (const row of patch) site[row.key] = row.value;
        if (table === 'commerce_config') commerce = { ...commerce, ...patch };
        if (table === 'blogs' && mutation === 'insert') posts.unshift({ id: 100, ...patch });
        if (table === 'blogs' && mutation === 'update') posts[posts.findIndex(row => row.id === id)] = { id, ...patch };
        if (table === 'blogs' && mutation === 'delete') posts.splice(posts.findIndex(row => row.id === id), 1);
        return { id: id || 'default' };
      }
      if (table === 'settings') return Object.entries(site).map(([key, value]) => ({key, value}));
      if (table === 'commerce_config') return commerce;
      if (table === 'blogs') return posts.slice(start, end + 1);
      return [];
    };
    const chain = {
      select: () => chain, ilike: () => chain, in: () => chain, is: () => chain,
      order: () => chain, abortSignal: () => chain,
      eq: (field, value) => { if (field === 'id') id = value; return chain; },
      range: (min, max) => { start = min; end = max; return chain; },
      insert: data => { mutation = 'insert'; patch = data; return chain; },
      update: data => { mutation = 'update'; patch = data; return chain; },
      upsert: data => { mutation = 'upsert'; patch = data; return chain; },
      delete: () => { mutation = 'delete'; return chain; },
      maybeSingle: async () => { const data = execute(); return {data: Array.isArray(data) ? data[0] || null : data}; },
      then: resolve => resolve({ data: execute(), error: null }),
    };
    return chain;
  },
};

const Component = window.fixturePage === 'blog' ? Blog : Settings;
createRoot(document.getElementById('root')).render(<MemoryRouter><Component client={client} session={{user}} mayOpenLicences /></MemoryRouter>);
`;

async function browse(page, label, selector = 'button') {
  await page.waitForFunction((name, css) => [...document.querySelectorAll(css)].some(el =>
    (el.getAttribute('aria-label') || el.textContent.trim()) === name), {}, label, selector);
  await page.evaluate((name, css) => [...document.querySelectorAll(css)].find(el =>
    (el.getAttribute('aria-label') || el.textContent.trim()) === name).click(), label, selector);
}

async function fill(page, selector, value) {
  await page.waitForSelector(selector);
  await page.click(selector, { clickCount: 3 });
  await page.keyboard.press('Backspace');
  await page.type(selector, value);
}

test('New Admin Settings and Blog use the preview layout and exercise existing writes with synthetic accounts', async () => {
  const directory = await mkdtemp(join(tmpdir(), '4m-admin-settings-blog-'));
  let browser;
  try {
    const script = join(directory, 'fixture.js');
    await build({
      bundle: true, platform: 'browser', format: 'iife', jsx: 'automatic', outfile: script,
      stdin: { contents: source, resolveDir: process.cwd(), loader: 'jsx' },
      loader: { '.css': 'empty' },
      plugins: [{ name: 'isolated-supabase', setup(builder) {
        builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, ({ path }) => ({ path, namespace: 'isolated' }));
        builder.onLoad({ filter: /.*/, namespace: 'isolated' }, () => ({ contents: 'export const supabase = null;' }));
      } }],
    });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const open = async fixturePage => {
      const page = await browser.newPage();
      page.setDefaultTimeout(7000);
      await page.setRequestInterception(true);
      page.on('request', request => request.abort());
      await page.setContent('<div id="root"></div>');
      await page.evaluate(name => { window.fixturePage = name; }, fixturePage);
      await page.addScriptTag({ path: script });
      return page;
    };

    const settings = await open('settings');
    await settings.waitForSelector('input[step="0.1"]');
    assert.equal(await settings.$eval('a[href="/admin-preview/licenses"]', node => node.textContent), 'Open Licences');
    await fill(settings, 'input[maxlength="40"]', 'Booking');
    await fill(settings, 'label:nth-of-type(2) input[type="number"]', '5');
    await fill(settings, 'label:nth-of-type(3) input[type="number"]', '10');
    await settings.waitForFunction(() => document.body.textContent.includes('10% booking') && document.body.textContent.includes('660.00'));
    await browse(settings, 'Save fee settings');
    await settings.waitForFunction(() => document.body.textContent.includes('Checkout fees saved.'));
    await fill(settings, 'input[type="url"]', 'https://example.test/new');
    await browse(settings, 'Save site links');
    await settings.waitForFunction(() => document.body.textContent.includes('Site links saved.'));
    const saved = await settings.evaluate(() => window.fixtureWrites);
    assert.equal(saved[0][0], 'commerce_config');
    assert.equal(saved[0][2].event_fee_percent, 10);
    assert.equal(saved[1][0], 'settings');
    assert.deepEqual(saved[1][2].map(({key, value}) => [key, value]), [['instagram', 'https://example.test/new']]);
    await settings.evaluate(() => { window.fixtureAllowed = false; });
    await browse(settings, 'Reload settings');
    await settings.waitForSelector('[role=alert]');
    assert.equal(await settings.$('input[type="url"]'), null);

    const blog = await open('blog');
    await blog.waitForSelector('table');
    await browse(blog, 'Next');
    await blog.waitForFunction(() => document.body.textContent.includes('Page 2 of 2'));
    await browse(blog, 'Previous');
    await blog.type('input[type="search"]', 'Fixture news 19');
    await blog.waitForFunction(() => document.querySelectorAll('tbody tr').length === 1);
    assert.equal(await blog.$eval('td a', node => node.getAttribute('href')), 'https://4mpadel.co.za/blog/fixture-news-19');
    await browse(blog, 'Edit Fixture news 19');
    await blog.waitForSelector('dialog[open] textarea');
    await fill(blog, 'dialog textarea', 'Updated body');
    await browse(blog, 'Save post', 'dialog button');
    await blog.waitForFunction(() => document.body.textContent.includes('Blog post saved.'));
    await browse(blog, 'New post');
    await blog.waitForSelector('dialog[open] input');
    await blog.type('dialog input[required]', 'Club update');
    await blog.type('dialog textarea', 'A fixture announcement');
    const png = join(directory, 'fixture.png');
    await writeFile(png, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j9FsAAAAASUVORK5CYII=', 'base64'));
    const cover = await blog.$('dialog input[type="file"]');
    await cover.uploadFile(png);
    await blog.select('dialog select', 'Published');
    await browse(blog, 'Save post', 'dialog button');
    await blog.waitForFunction(() => window.fixtureWrites.some(write => write[1] === 'insert'));
    await fill(blog, 'input[type="search"]', 'Club update');
    await browse(blog, 'Delete Club update');
    await browse(blog, 'Cancel', 'dialog button');
    assert.equal(await blog.evaluate(() => window.fixtureWrites.some(write => write[1] === 'delete')), false);
    await browse(blog, 'Delete Club update');
    await browse(blog, 'Delete post', 'dialog button');
    await blog.waitForFunction(() => document.body.textContent.includes('Blog post deleted.'));
    const writes = await blog.evaluate(() => window.fixtureWrites);
    assert.deepEqual(writes.map(write => write.slice(0, 2)), [['blogs', 'update'], ['upload', 'blog-images'], ['blogs', 'insert'], ['blogs', 'delete']]);
    assert.equal(writes[2][2].slug, 'club-update');
    assert.ok(writes[2][2].image_url.startsWith('https://example.test/images/'));
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
