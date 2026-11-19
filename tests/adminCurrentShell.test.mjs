import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const wrapperNames = {
  CurrentEvents: ['CurrentEvents', 'CurrentCalendar'],
  CurrentCommunications: ['CurrentMessaging', 'CurrentHelp', 'CurrentSecurity'],
  CurrentFinance: ['CurrentFinance', 'CurrentLicences'],
};

const mock = {
  useAdminPermissions: `export const useAdminPermissions = () => {
    const permissions = {role: 'super_admin', orgs: [{id: 'org1', name: 'Fixture organiser'}]};
    return {permissions, loading: false, hasPermission: () => true};
  };`,
  useAdminFeedNotifications: `export const useAdminFeedNotifications = () => ({notifications: [{id:'p', type:'payment', title:'Received a payment', subtitle:'Fixture only', timeAgo:'1 minute ago'}]});`,
  supabaseClient: `export const supabase = {auth: {signOut: async () => {window.logoutCalled = true; return {};}}};`,
};

async function choose(page, text, selector = 'button') {
  await page.waitForFunction((name, match) => [...document.querySelectorAll(match)].some(node => (node.getAttribute('aria-label') || node.textContent.trim()) === name), {}, text, selector);
  await page.evaluate((name, match) => [...document.querySelectorAll(match)].find(node => (node.getAttribute('aria-label') || node.textContent.trim()) === name).click(), text, selector);
}

async function workspace(page, name, scope, pageName = '') {
  await page.waitForFunction((name, scope, pageName) => {
    const panel = document.querySelector(`[data-workspace="${name}"]`);
    return panel?.dataset.scope === scope && (!pageName || panel.dataset.page === pageName);
  }, {}, name, scope, pageName);
}

test('review navigation, create, notifications, refresh and scope reach the current controllers', async () => {
  const directory = await mkdtemp(join(tmpdir(), '4m-admin-shell-'));
  let browser;
  try {
    const bundle = join(directory, 'fixture.js');
    await build({
      bundle: true,
      platform: 'browser',
      format: 'iife',
      jsx: 'automatic',
      outfile: bundle,
      stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {MemoryRouter} from 'react-router-dom'; import Admin from './src/pages/AdminPreview.jsx';
        createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin-preview/events']}><Admin session={{user:{id:'fixture', email:'admin@fixture.invalid'}}} currentAdminUrl="https://4mpadel.co.za/admin" /></MemoryRouter>);`, resolveDir: process.cwd(), loader: 'jsx' },
      loader: { '.css': 'empty' },
      plugins: [{ name: 'isolated-admin-controllers', setup(builder) {
        builder.onResolve({ filter: /(?:CurrentEvents|CurrentCommunications|CurrentFinance)\.jsx$/ }, ({ path }) => ({ path, namespace: 'controller' }));
        builder.onResolve({ filter: /\/(useAdminPermissions|useAdminFeedNotifications|supabaseClient)$/ }, ({ path }) => ({ path, namespace: 'context' }));
        builder.onResolve({ filter: /^\.\.\/components\/admin\// }, ({ path }) => ({ path, namespace: 'legacy' }));
        builder.onLoad({ filter: /.*/, namespace: 'context' }, ({ path }) => ({ contents: mock[path.split('/').at(-1)], loader: 'js' }));
        builder.onLoad({ filter: /.*/, namespace: 'legacy' }, () => ({ contents: 'export default function Module(){return null}', loader: 'js' }));
        builder.onLoad({ filter: /.*/, namespace: 'controller' }, ({ path }) => ({
          loader: 'jsx', resolveDir: process.cwd(),
          contents: `import React from 'react'; import {useLocation} from 'react-router-dom'; ${wrapperNames[path.split('/').at(-1).replace('.jsx', '')].map(name => `export function ${name}({page, scopeId, refreshRevision}) { const {search} = useLocation(); return <div data-workspace="${name}" data-scope={scopeId} data-page={page} data-revision={refreshRevision} data-search={search}>${name}</div>; }`).join('\n')}`,
        }));
      } }],
    });
    browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
    const page = await browser.newPage();
    page.setDefaultTimeout(5000);
    await page.setRequestInterception(true);
    page.on('request', request => request.abort());
    await page.setContent('<div id="root"></div>');
    await page.addScriptTag({ path: bundle });

    await workspace(page, 'CurrentEvents', 'all');
    await page.select('select', 'org:org1');
    await workspace(page, 'CurrentEvents', 'org:org1');
    await choose(page, 'Reload workspace');
    await page.waitForSelector('[data-workspace="CurrentEvents"][data-revision="1"]');
    await choose(page, 'Registrations');
    await workspace(page, 'CurrentEvents', 'org:org1', 'registrations');
    await choose(page, 'Licences');
    await workspace(page, 'CurrentLicences', 'all');
    await choose(page, 'Find a workspace');
    await page.type('dialog input', 'secur');
    await choose(page, 'Account security', 'dialog button');
    await workspace(page, 'CurrentSecurity', 'all');
    await choose(page, 'Messaging');
    await workspace(page, 'CurrentMessaging', 'all');
    await choose(page, 'Help requests');
    await workspace(page, 'CurrentHelp', 'all');
    await choose(page, 'Payouts');
    await workspace(page, 'CurrentFinance', 'org:org1', 'payouts');
    await choose(page, 'Open notifications');
    await choose(page, 'Open', 'dialog button');
    await workspace(page, 'CurrentFinance', 'org:org1', 'payments');
    await choose(page, 'Finance reports');
    await workspace(page, 'CurrentFinance', 'org:org1', 'reports');
    await choose(page, 'Create an event');
    await choose(page, 'Quick event', 'dialog button');
    await workspace(page, 'CurrentCalendar', 'org:org1');
    assert.equal(await page.$eval('[data-workspace="CurrentCalendar"]', panel => panel.dataset.search), '?create=quick');
    await choose(page, 'Log out');
    await page.waitForFunction(() => window.logoutCalled);
  } finally {
    await browser?.close();
    await rm(directory, { recursive: true, force: true });
  }
});
