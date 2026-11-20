import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

async function withRotationFixture(draft, assertions) {
    const temporary = await mkdtemp(path.join(tmpdir(), 'fourm-rotation-schedule-'));
    let browser;
    try {
        const output = path.join(temporary, 'fixture.js');
        await build({
            stdin: { loader: 'jsx', resolveDir: process.cwd(), contents: `
                import React from 'react';
                import { createRoot } from 'react-dom/client';
                import { MemoryRouter } from 'react-router-dom';
                import TournamentWorkspace from './src/pages/admin-preview/tournament/TournamentWorkspace.jsx';

                const privateMode = window.draftScenario;
                const user = { id: 'host-id', email: 'host@example.invalid' };
                const event = { id: 505, event_name: 'Court Scheduling Fixture', is_visible: true };
                const rotation = {
                    players: ['Alex', 'Bea', 'Cy', 'Dee'].map((name, number) => ({ id: 'player-' + number, name })),
                    points: 24, rounds: 2, courts: 1, fixtures: [
                        { id: 'r1-m1', round: 1, wave: 1, court: 1, one:['player-0','player-3'], two:['player-1','player-2'], score:privateMode?null:[13,11] },
                        { id: 'r2-m1', round: 2, wave: 1, court: 1, one:['player-0','player-2'], two:['player-1','player-3'], score:null },
                    ],
                };
                const draw = { id: 'rotation-a', draw_kind: 'main', division_id: 'division-a', format: 'americano',
                    status: privateMode?'draft':'in_progress', updated_at: 'draw-v1', _review_token:'draft-v1', scoring_rules: { americano: rotation } };
                const rows = [
                    { id:'match-1',draw_id:draw.id,round_number:1,americano_fixture_key:'r1-m1',status:privateMode?'pending':'completed',updated_at:'match-v1',
                      court_name:'Court 1',scheduled_start:privateMode?null:'2035-06-08T06:00:00Z',scheduled_end:privateMode?null:'2035-06-08T06:15:00Z' },
                    { id:'match-2',draw_id:draw.id,round_number:2,americano_fixture_key:'r2-m1',status:'pending',updated_at:'match-v1' },
                ];
                const snapshot = { event, organisationId:'org-a',hostDrawPreparation:true,capabilities:['draws','host_players_review','seeds'],
                    draws:[draw], matches:rows, divisions:[{id:'division-a',name:'Americano',is_active:true}],
                    confirmations:[], entries:[], registrations:[], standings:[], sets:[], players:[], finalisations:[], settings:{} };
                let savedPlan=[];
                const client = {
                    auth:{ getUser:async()=>({ data:{ user } }) },
                    async rpc(method, args) {
                        window.calls.push([method,args]);
                        if (method==='tm_host_draw_preparation' && args.p_action==='snapshot')
                            return { data:structuredClone(snapshot) };
                        if (args.p_organisation!=='org-a' || String(args.p_event)!=='505'
                            || args.p_payload.p_draw!=='rotation-a' || args.p_payload.p_expected!==draw.updated_at)
                            return { error:{message:'Wrong scheduling scope'} };
                        const receipt = {eventId:505,organisationId:'org-a',drawId:'rotation-a',action:args.p_action};
                        if (method==='tm_host_rotation_preparation' && args.p_action==='publish_draw') {
                            if (args.p_payload.p_draw_token!==draw._review_token) return {error:{message:'Wrong reviewed draw'}};
                            for (const b of savedPlan) {
                                Object.assign(rows.find(row=>row.id===b.matchId),{
                                    scheduled_start:b.starts,scheduled_end:b.finishes,court_name:b.court,status:'scheduled',updated_at:'published-v1',
                                });
                            }
                            draw.status='published';draw.updated_at='draw-published';savedPlan=[];
                            return {data:receipt};
                        }
                        if (method!=='tm_host_rotation_schedule') return {error:{message:'Unexpected court action'}};
                        if (args.p_action==='read_draft_rotation_schedule')
                            return {data:{...receipt,bookings:structuredClone(savedPlan),review:''}};
                        if (args.p_action==='discard_draft_rotation_schedule') {
                            savedPlan=[];draw.updated_at='draw-empty';draw._review_token='draft-empty';
                            return {data:{...receipt,bookings:[],review:''}};
                        }
                        const second = window.moveSlot ? '55' : '45';
                        const review = window.moveSlot ? 'review-v2' : 'review-v1';
                        const booking = { matchId:'match-2',round:2,wave:1,court:'Court 1',
                            starts:'2035-06-08T06:'+second+':00Z',finishes:window.moveSlot?'2035-06-08T07:10:00Z':'2035-06-08T07:00:00Z' };
                        if (args.p_action==='apply_rotation_schedule') {
                            if (args.p_payload.p_review!==review) return { error:{message:'The court plan changed. Preview the current times before saving'} };
                            if (privateMode) {
                                savedPlan=[{matchId:'match-1',round:1,wave:1,court:'Court 1',
                                    starts:'2035-06-08T06:20:00Z',finishes:'2035-06-08T06:35:00Z'},booking];
                            } else Object.assign(rows[1],{scheduled_start:booking.starts,scheduled_end:booking.finishes,court_name:booking.court,status:'scheduled',updated_at:'match-v2'});
                            draw.updated_at='draw-v2';draw._review_token='draft-v2';
                        }
                        const bookings = privateMode ? [{matchId:'match-1',round:1,wave:1,court:'Court 1',
                            starts:'2035-06-08T06:20:00Z',finishes:'2035-06-08T06:35:00Z'},booking] : [booking];
                        return {data:{...receipt,bookings,review}};
                    },
                };
                window.calls=[];
                createRoot(document.getElementById('root')).render(<MemoryRouter initialEntries={['/admin-preview/event?event=505&workspace=draws']}>
                    <TournamentWorkspace client={client} session={{user}} hostEvent={{id:505,organisationId:'org-a'}} scopeId="org:org-a"
                        returnHref="/admin-preview/event?event=505&tab=draws" />
                </MemoryRouter>);
            ` },
            outfile: output, bundle: true, jsx: 'automatic', define: { 'import.meta.env.DEV': 'false' },
            plugins: [{ name: 'offline-supabase', setup(builder) {
                builder.onResolve({ filter: /\/supabaseClient(?:\.js)?$/ }, () => ({ path: 'disabled', namespace: 'fixture' }));
                builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({
                    contents: 'export const supabase={}; export const isSupabaseConfigured=()=>false;',
                }));
            } }],
        });
        browser = await puppeteer.launch({ headless: true, protocolTimeout: 20000, args: ['--no-sandbox'] });
        const page = await browser.newPage();
        const panel = 'section[aria-label="Americano court schedule"]';
        const click = async label => {
            const element = await page.waitForFunction(text =>
                [...document.querySelectorAll('button')].find(button => button.textContent.trim() === text && !button.disabled), {}, label);
            await element.evaluate(button => button.click());
        };
        await page.setContent('<main id="root"></main>');
        await page.evaluate(value => { window.draftScenario = value; }, draft);
        await page.addScriptTag({ path: output });
        await page.waitForSelector(panel);
        await assertions({ page, panel, click });
    } finally {
        await browser?.close();
        await rm(temporary, { recursive: true, force: true });
    }
}

test('organiser rotation court preview uses SAST and preserves the first booking on stale refresh and save', () =>
    withRotationFixture(false, async ({ page, panel, click }) => {
        assert.match(await page.$eval(panel, node => node.textContent), /1 of 2 matches booked/);
        await click('Automatically assign courts & times');
        await page.waitForSelector('table[aria-label="Reviewed rotation court times"]');
        assert.match(await page.$eval(panel, node => node.textContent), /08:45/);
        assert.equal(await page.evaluate(() => window.calls.filter(([, args]) => args.p_action === 'apply_rotation_schedule').length), 0);

        await page.evaluate(() => { window.moveSlot = true; });
        await click('Save schedule');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=alert]')?.textContent.includes('court plan changed'));
        await click('Refresh');
        await click('Automatically assign courts & times');
        await page.waitForFunction(() => document.querySelector('table[aria-label="Reviewed rotation court times"]')?.textContent.includes('08:55'));
        await click('Save schedule');
        await page.waitForFunction(() => document.querySelector('.tm-body [role=status]')?.textContent === 'Rotation court schedule saved');
        assert.match(await page.$eval(panel, node => node.textContent), /2 of 2 matches booked/);
        const scheduleCalls = (await page.evaluate(() => window.calls)).filter(([method]) => method === 'tm_host_rotation_schedule');
        assert.deepEqual(scheduleCalls.map(([, args]) => args.p_action), [
            'preview_rotation_schedule','apply_rotation_schedule','preview_rotation_schedule','apply_rotation_schedule',
        ]);
        assert.deepEqual(scheduleCalls[3][1].p_payload, {
            p_draw: 'rotation-a', p_expected: 'draw-v1', p_minutes: 15, p_rest: 5,
            p_match_versions: { 'match-1': 'match-v1', 'match-2': 'match-v1' }, p_review: 'review-v2',
        });
    }));

test('hosts keep reviewed court times private until publishing the rotation', () =>
    withRotationFixture(true, async ({ page, panel, click }) => {
        assert.match(await page.$eval(panel, node => node.textContent), /Private Americano court schedule/);
        await click('Automatically assign courts & times');
        await page.waitForSelector('table[aria-label="Reviewed rotation court times"]');
        await click('Save private court times');
        await page.waitForFunction(() => document.querySelector('section[aria-label="Americano court schedule"]')?.textContent.includes('2 of 2 matches planned privately'));
        assert.equal(await page.$('section[aria-label="Americano results"]'), null);
        await click('Remove saved private court times');
        await click('Cancel');
        assert.equal(await page.evaluate(() => window.calls.filter(([,args])=>args.p_action==='discard_draft_rotation_schedule').length),0);
        await page.$eval('input[type=checkbox]', input=>input.click());
        await click('Publish draw');
        await page.waitForSelector('section[aria-label="Americano results"]');
        assert.match(await page.$eval(panel, node => node.textContent), /2 of 2 matches booked/);
        const changes=(await page.evaluate(()=>window.calls)).filter(([,args])=>['apply_rotation_schedule','publish_draw'].includes(args.p_action));
        assert.deepEqual(changes.map(([method,args])=>[method,args.p_action]), [
            ['tm_host_rotation_schedule','apply_rotation_schedule'], ['tm_host_rotation_preparation','publish_draw'],
        ]);
        assert.equal(changes[0][1].p_payload.p_review,'review-v1');
        assert.equal(changes[1][1].p_payload.p_draw_token,'draft-v2');
    }));
