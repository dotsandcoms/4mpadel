import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import * as results from '../scripts/lib/rankedin-results.mjs';
import { findPreferredRanking } from '../src/utils/playerRankingSelection.js';

const hit = { Name:'Adam Van Harte', RankedinId:'R000258011', Standing:1, Participant:{Id:201351}, ParticipantPoints:{Points:14320, RankingDate:'2026-10-19'} };
const old = { org:'SAPA ranking', ranking_id:15809, age_group:'Men-Main', age_group_id:82, ranking_type:3, ranking_participant_id:201351, points:'12620', details:[{name:'Old edition',points:12620}], ranking_date:'2026-10-12', synced_at:new Date().toISOString() };
const other = { org:'Club ranking', details:[{name:'Club win',place:1}] };

function syncHarness({fail=false}={}) {
    const updates=[], invalidations=[];
    const player={id:293, name:hit.Name, rankedin_id:hit.RankedinId, rankings:[old,other]};
    const query={select(){return this;},eq(){return this;},async maybeSingle(){return {data:player};},async upsert(){return {};},delete(){return {in:async(...args)=>{invalidations.push(args);return {};}};},update(patch){updates.push(patch);return {eq:async()=>({})};}};
    const source=fs.readFileSync(new URL('../scripts/syncRankedinRankings.js',import.meta.url),'utf8');
    const code=source.slice(source.indexOf('async function syncCategory('),source.indexOf('async function run()'));
    const context={...results,syncFailures:0,supabase:{from:()=>query},shouldWriteFlatPoints:()=>true,rankedInAgeGroupLabel:()=> 'Men-Main',fetch:async()=>({ok:true,json:async()=>({Payload:[hit]})}),console:{log(){},error(){}},Date,
        fetchCountedResults:async()=>{if(fail)throw new Error('Provider unavailable');return [{name:'Nationals',points:2600},{name:'Other counted events',points:11720}];},
    };
    vm.createContext(context);vm.runInContext(code,context);
    return {updates,invalidations,context,run:()=>context.syncCategory(15809,3,82,'SAPA Main')};
}

test('interday sync updates headline and saved Best 8 in the same player write',async()=>{
    const h=syncHarness();await h.run();assert.equal(h.updates.length,1);
    const patch=h.updates[0];assert.equal(patch.points,14320);assert.equal(patch.rankings[0].points,'14320');
    assert.equal(patch.rankings[0].details.reduce((sum,r)=>sum+r.points,0),14320);
    assert.equal(patch.rankings[0].ranking_participant_id,201351);assert.equal(patch.rankings[1],other);
    assert.equal(h.invalidations[0][1].length,2);assert.match(h.invalidations[0][1][1],/showAll=true/);
    assert.equal(h.context.syncFailures,0);
});

test('a failed results fetch preserves the existing player snapshot and fails the job',async()=>{
    const h=syncHarness({fail:true});await h.run();assert.equal(h.updates.length,0);assert.equal(h.invalidations.length,0);assert.equal(h.context.syncFailures,1);
});

test('daily repair identity omissions force a refresh even when total points match',()=>{
    const current={...old,points:'14320',ranking_date:hit.ParticipantPoints.RankingDate,results_synced_at:new Date().toISOString()};
    assert.equal(results.needsResultsRefresh(current,hit),false);
    assert.equal(results.needsResultsRefresh({...current,ranking_participant_id:undefined},hit),true);
    assert.equal(results.needsResultsRefresh({...current,results_synced_at:'invalid',synced_at:null},hit),true);
    assert.equal(results.needsResultsRefresh({...current,results_synced_at:new Date(Date.now()-6*3600000).toISOString()},hit),true);
});

test('counted detail fetch paginates and rejects failures instead of substituting empty results',async()=>{
    const calls=[];const page=Array.from({length:100},()=>({EventPoint:{Points:10,Standing:1}}));
    const rows=await results.fetchCountedResults(201351,82,async url=>{calls.push(url);return {ok:true,json:async()=>({ParticipantWithPoints:{EventPoints:{Payload:calls.length===1?page:[]}}})};});
    assert.equal(rows.length,100);assert.equal(calls.length,2);assert.match(calls[1],/skip=100/);
    await assert.rejects(results.fetchCountedResults(201351,82,async()=>({ok:false,status:503}),async()=>{}),/503/);
    await assert.rejects(results.fetchCountedResults(201351,82,async()=>({ok:true,json:async()=>({})})),/Malformed/);
});

test('counted detail fetch retries timeouts with a fresh signal and keeps pagination intact', async () => {
    const calls = [], waits = [];
    const firstPage = Array.from({ length: 100 }, () => ({ EventPoint: { Points: 10 } }));
    const rows = await results.fetchCountedResults(201351, 82, async (url, { signal }) => {
        calls.push({ url, signal });
        if (calls.length === 1) throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
        if (calls.length === 3) return { ok: false, status: 503 };
        return { ok: true, json: async () => ({ ParticipantWithPoints: { EventPoints: {
            Payload: calls.length === 2 ? firstPage : [{ EventPoint: { Points: 5 } }],
        } } }) };
    }, async (ms) => waits.push(ms));

    assert.equal(rows.length, 101);
    assert.equal(rows.reduce((sum, row) => sum + row.points, 0), 1005);
    assert.equal(calls.length, 4);
    assert.equal(calls[0].url, calls[1].url);
    assert.equal(calls[2].url, calls[3].url);
    assert.match(calls[2].url, /skip=100/);
    assert.equal(new Set(calls.map(call => call.signal)).size, 4);
    assert.deepEqual(waits, [1000, 1000]);
});

test('counted detail fetch bounds retries for temporary provider failures', async () => {
    for (const failure of [
        new DOMException('Timed out', 'TimeoutError'),
        new DOMException('Aborted', 'AbortError'),
        new TypeError('fetch failed'),
        ...[408, 429, 500, 502, 503, 504].map(status => ({ ok: false, status })),
    ]) {
        let calls = 0;
        const waits = [];
        await assert.rejects(results.fetchCountedResults(201351, 82, async () => {
            calls++;
            if (failure instanceof Error) throw failure;
            return failure;
        }, async (ms) => waits.push(ms)));
        assert.equal(calls, 3);
        assert.deepEqual(waits, [1000, 2000]);
    }
});

test('counted detail fetch does not retry permanent errors or invalid data', async () => {
    for (const response of [
        { ok: false, status: 400 },
        { ok: false, status: 401 },
        { ok: false, status: 404 },
        { ok: true, json: async () => ({}) },
        { ok: true, json: async () => { throw new SyntaxError('Invalid JSON'); } },
    ]) {
        let calls = 0;
        await assert.rejects(results.fetchCountedResults(201351, 82, async () => {
            calls++;
            return response;
        }, async () => assert.fail('Permanent errors must not be retried')));
        assert.equal(calls, 1);
    }
});

test('merging a category preserves uncovered ranking rows',()=>{
    const previous=results.findResultRanking([other,old],{orgId:15809,orgName:'SAPA ranking',age:82,type:3,ageLabel:'Men-Main'});
    assert.equal(previous,old);
    const updated=results.mergeResultRanking([other,old],previous,{...old,points:'14320'});
    assert.equal(updated.length,2);assert.equal(updated[0],other);assert.equal(updated[1].points,'14320');
});

function repairHarness({fail=false,skipDetails=false,playerOverrides={}}={}) {
    const updates=[];
    const player={id:293,name:hit.Name,rankedin_id:hit.RankedinId,category:'Men',rankings:[old,other],...playerOverrides};
    const query={select(){return this;},eq(){return this;},async range(){return {data:[player]};},delete(){return {in:async()=>({})};},update(patch){updates.push(patch);return {eq:async()=>({})};}};
    const source=fs.readFileSync(new URL('../scripts/repairAllPlayerRankings.js',import.meta.url),'utf8');
    const code=source.slice(source.indexOf('async function run()'),source.indexOf('\nrun().catch'));
    const context={...results,process:{argv:['node','repair',...(skipDetails?['--skip-details']:[])],stdout:{write(){}},exitCode:undefined},console:{log(){},error(){}},supabase:{from:()=>query},Date,
        LISTS:[{orgId:15809,orgName:'SAPA ranking',type:3,age:82,ageLabel:'Men-Main',match:'Men-Doubles'}],
        fetchList:async()=>[hit],sleep:async()=>{},keepUncoveredRows:rows=>rows.filter(row=>row.org!=='SAPA ranking'),
        findPreferredRanking,rankingRowKey:row=>`${row.org}|${row.age_group}|${row.match_type}`,
        fetchCountedResults:async()=>{if(fail)throw new Error('Provider unavailable');return [{name:'Nationals',points:2600}];},
    };
    vm.createContext(context);vm.runInContext(code,context);
    return {updates,context,run:()=>context.run()};
}

test('daily repair retains the participant identity and existing details when explicitly skipping details',async()=>{
    const h=repairHarness({skipDetails:true});await h.run();
    const ranking=h.updates[0].rankings.find(row=>row.org==='SAPA ranking');
    assert.equal(ranking.ranking_participant_id,201351);assert.equal(ranking.details,old.details);
});

test('daily repair reports partial failures and never wipes a player on provider failure',async()=>{
    const h=repairHarness({fail:true});await h.run();
    assert.equal(h.updates.length,0);assert.equal(h.context.process.exitCode,1);
});

test('daily repair rounds decimal preferred points for the integer column and preserves the ranking', async () => {
    for (const [points, expected] of [['302.84', 303], ['142.623', 143], ['204.11', 204]]) {
        const preferred = { org: 'Club ranking', age_group: 'Men-Main', match_type: 'Men-Doubles', rank: '8', points };
        const preference = 'Club ranking|Men-Main|Men-Doubles';
        const h = repairHarness({ playerOverrides: { rankings: [old, preferred], preferred_ranking: preference } });
        await h.run();
        assert.equal(h.updates.length, 1);
        const patch = h.updates[0];
        assert.equal(patch.points, expected);
        assert.ok(Number.isInteger(patch.points));
        assert.equal(patch.rankings[0], preferred);
        assert.equal(patch.rankings[0].points, points);
        assert.equal(patch.rank_label, '8');
        assert.equal(patch.active_ranking_label, 'Club ranking - Men-Main');
        assert.equal(patch.preferred_ranking, undefined);
        assert.equal(h.context.process.exitCode, undefined);
    }
});
