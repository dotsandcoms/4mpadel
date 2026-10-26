import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { build } from 'esbuild';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import test from 'node:test';
import assert from 'node:assert/strict';

// Render the real event-manager header during its asynchronous loading stages.
// Effects and API calls do not run during SSR; unrelated panels are stubbed.
const root = process.env.FINANCE_EXPORT_TEST_ROOT || process.cwd();
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), '4m-export-ready-'));
const require = createRequire(import.meta.url);
const output = path.join(temporary, 'manager.mjs');
await build({ entryPoints: [`${root}/src/components/admin/ManualEventRegistrations.jsx`], outfile: output,
    bundle: true, platform: 'node', format: 'esm', packages: 'external',
    plugins: [{ name: 'export-loading-fixture', setup(builder) {
        builder.onResolve({ filter: /^(react|react-dom\/server|framer-motion|lucide-react|sonner)$/ }, args => ({ path: require.resolve(args.path), external: true }));
        builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'stub' }));
        builder.onResolve({ filter: /useAdminPermissions$/ }, () => ({ path: 'permissions', namespace: 'stub' }));
        builder.onResolve({ filter: /\/utils\/emails$/ }, () => ({ path: 'email', namespace: 'stub' }));
        builder.onResolve({ filter: /\/utils\/eventFinanceExport$/ }, () => ({ path: 'export', namespace: 'stub' }));
        builder.onResolve({ filter: /^(\.\/|\.\.\/)[^/]*[A-Z][^/]*$/ }, args => args.importer.endsWith('ManualEventRegistrations.jsx') ? ({ path: 'component', namespace: 'stub' }) : null);
        builder.onLoad({ filter: /.*/, namespace: 'stub' }, args => ({ contents: {
            supabase: 'export const supabase = {};',
            permissions: "export const useAdminPermissions = () => ({permissions:{role:'super_admin'}});",
            email: 'export const sendEmail = async()=>{};',
            export: 'export const downloadEventFinanceWorkbook = async()=>{};',
        }[args.path] || 'export default function Component(){return null;}', loader: 'js' }));
        builder.onLoad({ filter: /ManualEventRegistrations\.jsx$/ }, args => {
            let source = fs.readFileSync(args.path, 'utf8');
            for (const [state, value] of Object.entries({ loading: 'globalThis.__exportReadyFixture.loading',
                exportingFinance: 'globalThis.__exportReadyFixture.exporting', cashVerification: 'globalThis.__exportReadyFixture.verification',
                exportMenuOpen: 'true', activeTab: "'overview'" })) {
                const pattern = new RegExp(`(const \\[${state},[^\\]]+\\] = useState\\()[^;]+(\\);)`);
                assert.ok(pattern.test(source), `Missing fixture state ${state}`);
                source = source.replace(pattern, `$1${value}$2`);
            }
            return { contents: source, loader: 'jsx', resolveDir: `${root}/src/components/admin` };
        });
    } }],
});
const { default: EventManager } = await import(pathToFileURL(output));
const buttons = fixture => {
    globalThis.__exportReadyFixture = fixture;
    const html = renderToStaticMarkup(React.createElement(EventManager, { variant: 'inline', isOpen: true, event: { id: 479, event_name: 'Test event', start_date: '2026-10-16' } }));
    return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g)].map(m => ({ attributes: m[1], text: m[2].replace(/<[^>]*>/g, '') }));
};

test('entry loading disables export without claiming a report is being generated', () => {
    const list = buttons({ loading: true, exporting: false, verification: null });
    const exportButtons = list.filter(b => b.text.includes('Export Excel') || b.attributes.includes('role="menuitem"'));
    assert.ok(exportButtons.length >= 3);
    assert.ok(exportButtons.every(b => b.attributes.includes('disabled=""')));
    assert.ok(list.some(b => b.text.includes('Export Excel') && b.attributes.includes('aria-busy="true"')));
});
test('loading entries enables both reports before any receipt verification', () => {
    const list = buttons({ loading: false, exporting: false, verification: null });
    const exportButtons = list.filter(b => b.text.includes('Export Excel') || b.attributes.includes('role="menuitem"'));
    assert.ok(exportButtons.length >= 3);
    assert.ok(exportButtons.every(b => !b.attributes.includes('disabled=""')));
    assert.ok(list.some(b => b.text.includes('Export Excel') && b.attributes.includes('aria-busy="false"')));
});
test('generating a report prevents duplicate downloads and communicates progress', () => {
    const list = buttons({ loading: false, exporting: true, verification: { complete: true } });
    assert.ok(list.some(b => b.text.includes('Preparing report…') && b.attributes.includes('disabled=""')));
    assert.ok(list.filter(b => b.attributes.includes('role="menuitem"')).every(b => b.attributes.includes('disabled=""')));
});

process.on('exit', () => fs.rmSync(temporary, { recursive: true, force: true }));
