import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { generateGroupStageDraft, generateKnockoutDraft } from '../src/utils/nativeDrawGenerator.js';

const event = { id: 101, event_name: 'Tournament rehearsal', start_date: '2026-11-21', slug: 'draw-rehearsal', courts_count: 2 };
const divisions = [{ id: 'groups', name: 'Group rehearsal' }, { id: 'results', name: 'Group results' }];
const version = '2026-11-17T10:00:00Z';
const teams = prefix => Array.from({ length: 13 }, (_, index) => {
    const player_one_name = `Player ${index + 1}`;
    const player_two_name = index === 4 ? 'Gogoski Junior' : `Partner ${index + 1}`;
    return { id: `${prefix}-team-${index + 1}`, seed_number: index + 1, player_one_name, player_two_name, team_name: `${player_one_name} / ${player_two_name}` };
});
const rules = { seeded_team_count: 13, qualification: { mode: 'best_placed', extras: 2 } };
const tables = { draws: [], draw_groups: [], draw_entries: [], draw_matches: [], native_draw_edit_audit: [] };
const registrations = [];
for (const division of divisions) {
    const id = division.id;
    const complete = id === 'results';
    const entries = teams(id);
    registrations.push(...entries.map(team => ({
        id: team.id, division_id: id, full_name: team.player_one_name, partner_name: team.player_two_name,
        email: `${team.id}@example.test`, partner_email: `${team.id}-partner@example.test`, status: 'registered', payment_status: 'paid',
    })));
    const preview = generateGroupStageDraft(entries, { groupCount: 3 });
    tables.draws.push({
        id, event_id: event.id, division_id: id, draw_kind: 'main', format: 'group_knockout', status: complete ? 'published' : 'draft',
        group_count: 3, advancers_per_group: 2, scoring_rules: rules, generated_at: version, updated_at: version,
    });
    tables.draw_groups.push(...preview.groups.map(group => ({ id: `${id}-${group.key}`, name: group.name, display_order: group.display_order, draw_id: id })));
    tables.draw_entries.push(...preview.entries.map(entry => ({ ...entry, draw_id: id, group_id: `${id}-${entry.group_key}`, source_registration_id: entry.id })));
    tables.draw_matches.push(...preview.matches.map(match => ({
        ...match, id: `${id}-${match.key}`, draw_id: id, group_id: `${id}-${match.group_key}`,
        entry_one_id: match.entry_one.id, entry_two_id: match.entry_two.id, updated_at: version,
        status: complete ? 'completed' : 'scheduled', winner_entry_id: complete ? match.entry_one.id : null,
        result_summary: complete ? [2, 0] : null, court_name: 'Court 1',
    })));
}
const duplicateTeams = ['groups-team-1', 'groups-team-5'];
registrations.push(...duplicateTeams.map(id => {
    const team = registrations.find(row => row.id === id);
    return {
        ...team, id: `${id}-reciprocal`, full_name: team.partner_name, partner_name: team.full_name,
        email: team.partner_email.toUpperCase(), partner_email: team.email,
        payment_status: id === 'groups-team-5' ? 'pending' : 'paid',
    };
}));
const licensedPlayers = [...new Set(registrations.flatMap(row => [row.email, row.partner_email]).map(email => email.toLowerCase()))]
    .map((email, index) => [email, { id: index + 1, email, license_type: 'full' }]);
const opening = generateKnockoutDraft(teams('ko')).matches;

const mockDb = `
const tables = ${JSON.stringify(tables)};
window.calls = [];
export const supabase = {
    auth: { getUser: async () => ({ data: { user: { id: 'director', email: 'director@example.test' } } }) },
    from(name) {
        const filters = [];
        const read = () => (tables[name] || []).filter(row => filters.every(fn => fn(row)));
        const query = {
            select: () => query, order: () => query,
            eq(key, value) { if (!key.startsWith('draws.')) filters.push(row => row[key] === value); return query; },
            in(key, values) { filters.push(row => values.includes(row[key])); return query; },
            upsert: async row => {
                if (name !== 'draw_player_reviews') throw new Error('Unexpected write to ' + name);
                tables[name] = [row];
                window.confirmedReview = row.state;
                return { error: null };
            },
            maybeSingle: async () => ({ data: read()[0] || null }),
            then(resolve) { return Promise.resolve({ data: read() }).then(resolve); },
        };
        return query;
    },
    async rpc(name, args) {
        window.calls.push({ name, args });
        if (name === 'native_apply_group_edit') {
            const { p_draw, p_source, p_target, p_two_groups, p_fixtures, p_undo } = args;
            const source = tables.draw_entries.find(entry => entry.id === p_source);
            const target = tables.draw_entries.find(entry => entry.id === p_target);
            const describe = (entry, group) => ({ id: entry?.id, name: entry?.team_name, group: tables.draw_groups.find(row => row.id === group).name });
            const details = { source: describe(source, p_two_groups[0]), target: describe(target, p_two_groups[1]) };
            source.group_id = p_two_groups[1];
            if (target) target.group_id = p_two_groups[0];
            const retained = new Set(p_fixtures.map(fixture => fixture.id).filter(Boolean));
            tables.draw_matches = tables.draw_matches.filter(match => !p_two_groups.includes(match.group_id) || retained.has(match.id));
            for (const [index, fixture] of p_fixtures.entries()) {
                if (fixture.id) Object.assign(tables.draw_matches.find(match => match.id === fixture.id), fixture);
                else tables.draw_matches.push({ ...fixture, id: 'fixture-' + window.calls.length + '-' + index, draw_id: p_draw,
                    stage: 'group', status: 'pending', updated_at: '${version}' });
            }
            tables.native_draw_edit_audit.unshift({ id: 'audit-' + window.calls.length, draw_id: p_draw, details,
                action: p_undo ? 'group_undo' : 'group_edit', undo_of: p_undo, generation: '${version}', created_at: '${version}', actor_email: 'director@example.test' });
            return { data: 0 };
        }
        if (name === 'native_create_group_elimination') {
            const { p_draw, p_matches, p_qualification } = args;
            for (const match of p_matches) tables.draw_matches.push({ ...match, draw_id: p_draw, status: 'pending' });
            tables.native_draw_edit_audit.unshift({ draw_id: p_draw, action: 'qualification_override', details: p_qualification, actor_email: 'director@example.test' });
            return { data: null };
        }
        throw new Error('Unexpected RPC ' + name);
    },
};`;

const clickButton = async (page, label, selector = 'button') => {
    await page.waitForFunction((selector, label) => [...document.querySelectorAll(selector)]
        .some(button => !button.disabled && button.getClientRects().length > 0 && button.textContent.includes(label)), {}, selector, label);
    await page.evaluate((selector, label) => [...document.querySelectorAll(selector)]
        .find(button => !button.disabled && button.getClientRects().length > 0 && button.textContent.includes(label)).click(), selector, label);
};

test('admin Draw workspace handles reciprocal teams, accessible swaps, saved undo and qualification overrides', { timeout: 45000 }, async () => {
    const bundle = await build({
        stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
            import Manager from './src/components/admin/NativeDrawManager.jsx';
            import Bracket from './src/components/admin/DrawBracketPreview.jsx';
            const root = createRoot(document.getElementById('root'));
            if (location.pathname === '/bracket') root.render(<Bracket matches={${JSON.stringify(opening)}} onSwapPositions={(a,b)=>window.selected=[a.position,b.position]}/>);
            else root.render(<Manager event={${JSON.stringify(event)}} divisions={${JSON.stringify(divisions)}} registrations={${JSON.stringify(registrations)}} playersByEmail={new Map(${JSON.stringify(licensedPlayers)})} />);`,
        resolveDir: process.cwd(), loader: 'jsx' },
        write: false, outfile: 'browser.js', bundle: true, platform: 'browser', format: 'iife',
        define: { 'process.env.NODE_ENV': '"test"' },
        plugins: [{ name: 'draw-fixture', setup(builder) {
            builder.onResolve({ filter: /supabaseClient$/ }, () => ({ path: 'supabase', namespace: 'mock' }));
            builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: mockDb, loader: 'js' }));
        } }],
    });
    let css = bundle.outputFiles.find(file => file.path.endsWith('.css'))?.text || '';
    const builtCss = (await readdir('dist/assets').catch(() => [])).find(file => /^index-.*\.css$/.test(file));
    if (builtCss) css = (await readFile(`dist/assets/${builtCss}`, 'utf8')).replace(/@import\s*(?:url\([^)]*\)|"[^"]*"|\'[^\']*\')\s*;/g, '');
    const server = createServer((request, response) => {
        if (request.url === '/browser.js') {
            response.setHeader('content-type', 'text/javascript');
            response.end(bundle.outputFiles.find(file => file.path.endsWith('.js')).text);
        } else if (request.url === '/browser.css') {
            response.setHeader('content-type', 'text/css');
            response.end(css);
        } else {
            response.setHeader('content-type', 'text/html');
            response.end('<!doctype html><html><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/browser.css"><body style="background:#080808"><div id="root"></div><script src="/browser.js"></script></body></html>');
        }
    });
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    let browser;
    try {
        browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        await page.setViewport({ width: 1400, height: 900 });
        await page.goto(url);
        await clickButton(page, 'Group rehearsal', '.draw-overview-row');
        await clickButton(page, 'Draw', 'nav[aria-label="Draw workflow"] button');
        const source = '[aria-label="Swap Player 1 / Partner 1 in Group A"]';
        await page.waitForSelector(source);
        await page.click(source);
        const search = 'dialog[open] input[role="combobox"]';
        await page.waitForSelector(search);
        assert.equal(await page.$eval(search, input => document.activeElement === input), true);
        assert.equal(await page.$$eval('dialog[open] [role="option"]', rows => rows.some(row => row.textContent.includes('Player 1 / Partner 1'))), false);
        await page.keyboard.type('gOG');
        assert.deepEqual(await page.$$eval('dialog[open] [role="option"]', rows => rows.map(row => row.textContent)), ['Player 5 / Gogoski JuniorGroup B · Seed #5']);
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        assert.match(await page.$eval('dialog[open]', dialog => dialog.textContent), /both top seeds/);
        await page.keyboard.press('Escape');
        await page.waitForFunction(() => !document.querySelector('dialog[open]'));
        assert.equal(await page.$eval(source, button => document.activeElement === button), true);

        await page.setViewport({ width: 390, height: 844 });
        await page.click(source);
        await page.waitForSelector(search);
        await page.keyboard.type('gog');
        assert.equal(await page.$eval('dialog[open]', dialog => dialog.scrollWidth <= dialog.clientWidth), true);
        await page.keyboard.press('Enter');
        await clickButton(page, 'Swap teams', 'dialog[open] button');
        await page.waitForSelector('[aria-label="Swap Player 1 / Partner 1 in Group B"]');
        await clickButton(page, 'Undo last group edit');
        await page.waitForSelector(source);
        assert.deepEqual(await page.evaluate(() => window.calls.map(call => call.args.p_undo)), [null, 'audit-1']);

        const mover = '[aria-label="Swap Player 13 / Partner 13 in Group A"]';
        await page.click(mover);
        await page.waitForSelector(search);
        await page.keyboard.type('open spot group c');
        await page.keyboard.press('Enter');
        await clickButton(page, 'Move team', 'dialog[open] button');
        await page.waitForSelector('[aria-label="Swap Player 13 / Partner 13 in Group C"]');
        await clickButton(page, 'Undo last group edit');
        await page.waitForSelector(mover);
        assert.deepEqual(await page.evaluate(() => window.calls.slice(2).map(call => [call.args.p_target, call.args.p_undo])), [[null, null], [null, 'audit-3']]);

        await clickButton(page, 'Edit draw options');
        await page.waitForSelector('select:has(option[value="all"])');
        const setting = 'select:has(option[value="all"])';
        assert.match(await page.$eval(setting, select => select.closest('div').textContent), /8 advancing · 8-slot bracket/);
        await page.select(setting, 'all');
        assert.match(await page.$eval(setting, select => select.closest('div').textContent), /13 advancing · 16-slot bracket · 3 byes/);
        await page.select(setting, 'best_placed');
        await page.evaluate(() => {
            const field = [...document.querySelectorAll('select')].find(select => select.parentElement.textContent.includes('Extra teams'));
            field.value = '1';
            field.dispatchEvent(new Event('change', { bubbles: true }));
        });
        assert.match(await page.$eval(setting, select => select.closest('div').textContent), /A full bracket needs 4, 8, 16 or 32/);

        await clickButton(page, 'Group results', 'aside button');
        await page.waitForFunction(() => document.body.textContent.includes('Why they qualified'));
        await clickButton(page, 'Override selection');
        const checked = 'table input[type="checkbox"]:checked';
        const unchecked = 'table input[type="checkbox"]:not(:checked)';
        const no = await page.$(unchecked);
        await page.click(checked);
        await no.click();
        assert.equal(await page.$$eval('button', buttons => buttons.find(button => button.textContent === 'Create elimination phase').disabled), true);
        await page.type('textarea', 'Referee confirmed the corrected ranking');
        await clickButton(page, 'Create elimination phase');
        await page.waitForFunction(() => document.body.textContent.includes('Override by director@example.test'));
        const request = await page.evaluate(() => window.calls.at(-1));
        assert.equal(request.args.p_matches.length, 7);
        assert.equal(request.args.p_qualification.reason, 'Referee confirmed the corrected ranking');
        assert.equal(request.args.p_qualification.comparison.length, 3);

        await page.goto(url + '/bracket');
        await page.waitForSelector('[aria-label^="Swap position"]');
        await page.click('[aria-label^="Swap position 1:"]');
        await page.waitForSelector(search);
        await page.keyboard.type('gog');
        assert.match(await page.$eval('[role="option"]', row => row.textContent), /Bracket slot .*Seed #5/);
        await page.keyboard.press('Enter');
        await page.keyboard.press('Enter');
        await page.waitForFunction(() => window.selected?.length === 2);

        await page.setViewport({ width: 1400, height: 900 });
        await page.goto(url);
        await clickButton(page, 'Group rehearsal', '.draw-overview-row');
        await clickButton(page, 'Teams & seeds', 'nav[aria-label="Draw workflow"] button');
        await clickButton(page, 'Show all 13 teams');
        const reviewRows = '#draw-player-list > div';
        const names = await page.$$eval(`${reviewRows} > label`, labels => labels.map(label => [...label.childNodes]
            .filter(node => node.nodeType === Node.TEXT_NODE).map(node => node.textContent).join('').trim()));
        assert.equal(names.length, 13, 'two pairs entered twice have one review row each');
        assert.equal(names.filter(name => ['Player 1 / Partner 1', 'Partner 1 / Player 1'].some(pair => name.includes(pair))).length, 1);
        assert.equal(names.filter(name => ['Player 5 / Gogoski Junior', 'Gogoski Junior / Player 5'].some(pair => name.includes(pair))).length, 1);
        assert.match(await page.$eval('#draw-player-list', list => list.textContent), /Exception reason for Gogoski Junior/);
        await page.type('#draw-player-list input[placeholder="Why this player may participate"]', 'Director approved');
        await page.evaluate(selector => [...document.querySelectorAll(selector)].find(row => row.textContent.includes('Player 1 / Partner 1'))
            .querySelector('input[type="checkbox"]').click(), reviewRows);
        await page.waitForFunction(() => document.body.textContent.includes('12 teams included'));
        await clickButton(page, 'Confirm teams & continue');
        await page.waitForFunction(() => window.confirmedReview);
        const review = await page.evaluate(() => window.confirmedReview);
        assert.deepEqual([...review.excluded].sort(), ['groups-team-1', 'groups-team-1-reciprocal']);
        assert.equal(review.seeds.length, 12);
        assert.equal(review.exceptions['groups-team-5-reciprocal'], 'Director approved');
        await clickButton(page, 'Regenerate preview');
        await page.waitForFunction(() => document.body.textContent.includes('12 teams · 3 groups'));
        assert.equal(await page.$('[aria-label^="Swap Player 1 / Partner 1"]'), null);
        assert.deepEqual(errors, []);
    } finally {
        await browser?.close();
        server.close();
    }
});
