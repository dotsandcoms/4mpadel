const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
const crypto = require('node:crypto').webcrypto;
function load(file, requireFn = () => ({})) {
  const mod = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, { module: mod, exports: mod.exports, require: requireFn, URL, URLSearchParams, Date, Map, Set, crypto, TextEncoder, Uint8Array, AbortSignal });
  return mod.exports;
}
const model = load('supabase/functions/deliver-push/following-model.ts');
const routing = load('src/lib/notification-routing.ts', () => ({ NOTIFICATION_PATHS: {} }));
const feed = load('src/lib/following-feed.ts', () => routing);
const now = Date.parse('2026-10-07T12:00:00Z');
const mainScope = { ranking_source: 'sapa_main_v1', org: 'SAPA', ranking_id: 15809, age_group_id: 82, ranking_type: 3, age_group: 'Men-Main', match_type: 'Men-Doubles', ranking_scope: 'sapa:15809:3:82' };

test('local ranking posts require a verified SAPA Main source, not the displayed rank', () => {
  const row = { id: '00000000-0000-4000-8000-000000000001', kind: 'ranking', title: 'Charl moved', path: '/players/191', occurred_at: '2026-11-09T06:00:00Z' };
  for (const payload of [
    { before_rank: 17, rank: 9, points: 180 },
    { ...mainScope, ranking_id: 16482, org: 'SA Grand Tour', before_rank: 17, rank: 9 },
    { ...mainScope, age_group_id: 2, before_rank: 17, rank: 9 },
    { ...mainScope, ranking_type: 4, before_rank: 17, rank: 9 },
    { ...mainScope, match_type: 'Men-Singles', before_rank: 17, rank: 9 },
    { ...mainScope, before_rank: 17, rank: 17, points: 4000 },
  ]) {
    const page = feed.parseFeedPage({ items: [{ ...row, payload }], has_more: true });
    assert.equal(page.items.length, 0); assert.equal(page.cursor.id, row.id); assert.equal(page.hasMore, true);
  }
  const page = feed.parseFeedPage({ items: [{ ...row, payload: { ...mainScope, before_rank: 18, rank: 17, points: 3381 } }], has_more: false });
  assert.equal(page.items.length, 1);
  const change = feed.feedRankingChange(page.items[0]);
  assert.equal(change.label, 'SAPA Men-Main'); assert.equal(change.rank, 17); assert.equal(change.points, 3381);
});
test('Women-Main identity cannot be labelled as Men-Main or borrowed from another circuit', () => {
  const payload = { ...mainScope, age_group_id: 83, ranking_type: 4, age_group: 'Women-Main', match_type: 'Women-Doubles', ranking_scope: 'sapa:15809:4:83', before_rank: 8, rank: 6, points: 2000 };
  assert.equal(feed.feedRankingChange({ kind: 'ranking', path: '/players/192', payload }).label, 'SAPA Women-Main');
  assert.equal(feed.feedRankingChange({ kind: 'ranking', path: '/players/192', payload: { ...payload, age_group: 'Men-Main' } }), null);
});
test('ranking movement directions describe places gained or lost within the same SAPA Main scope', () => {
  for (const [before, rank, change] of [[40, 41, -1], [41, 39, 2]]) {
    const movement = feed.feedRankingChange({ kind: 'ranking', path: '/players/1', payload: { ...mainScope, before_rank: before, rank } });
    assert.equal(movement.change, change);
    assert.equal(movement.scope, 'sapa:15809:3:82');
    assert.equal(movement.label, 'SAPA Men-Main');
  }
});
test('Home player data is a separate followed-player list with independent local and FIP identities', () => {
  const page = feed.parseFeedPage({ items: [], has_more: false, followed_players: [
    { id: 191, name: 'Charl Vos', source: 'local', photo_url: 'https://test/charl.jpg', nationality: 'ZA', rank_label: 9, points: 180, email: 'private', main_rankings: [{ ...mainScope, rank: 17, points: 3381 }] },
    { id: 191, name: 'FIP player', source: 'pro', photo_url: 'https://test/fip.jpg', nationality: 'ES', pro_ranking: { category: 'men', rank: 7, points: 1555 } },
  ] });
  assert.equal(page.items.length, 0); assert.equal(page.followedPlayers.length, 2);
  assert.equal(page.followedPlayers[0].mainRankings[0].rank, 17); assert.equal(page.followedPlayers[0].mainRankings[0].points, 3381);
  assert.equal(page.followedPlayers[1].proRanking.rank, 7); assert.equal(page.followedPlayers[1].mainRankings, undefined);
  assert.equal(page.followedPlayers[0].proRanking, undefined); assert.ok(!JSON.stringify(page.followedPlayers).includes('private'));
});
test('ranking notification deep links keep the main division and reject extra or duplicate parameters', () => {
  const path = '/(tabs)/rankings?view=Rankings&source=4m&gender=women';
  assert.equal(routing.pathFromNotificationData({ path }), path);
  for (const bad of [path + '&gender=men', path + '&org=16482', path.replace('source=4m','source=pro')]) assert.equal(routing.pathFromNotificationData({ path: bad }), null);
});
const match = { id: 77, status: 'scheduled', scheduled_at: '2026-10-07T14:00:00Z', court: 'Court 2', players: { team_1: [{ id: 1, name: 'Mark' }, { id: 2, name: 'Paul' }], team_2: [{ id: 3, name: 'Brad' }, { id: 4, name: 'Jason' }] }, tournament: { name: 'SA Nationals' }, played_at: '2026-10-07', score: [{ team_1: 6, team_2: 0 }, { team_1: 6, team_2: 0 }], winner: 'team_1' };
test('two and three-set pro results preserve tie-break sets through the worker and feed', () => {
  for (const scores of [
    [{ team_1: '7', team_2: '6(3)' }, { team_1: '6', team_2: '4' }],
    [{ team_1: '6', team_2: '4' }, { team_1: '6(2)', team_2: '7' }, { team_1: '7', team_2: '6(8)' }],
  ]) {
    const item = model.proMatchActivity({ ...match, status: 'finished', score: scores }, match, now);
    assert.equal(item.payload.scores.length, scores.length);
    const parsed = feed.feedScores(item);
    assert.equal(parsed.scores.length, scores.length);
    scores.forEach((set, i) => assert.deepEqual(Array.from(parsed.scores[i], String), [set.team_1, set.team_2]));
    assert.ok(item.title.includes(scores.length === 2 ? '7–6(3), 6–4' : '6–4, 6(2)–7, 7–6(8)'));
  }
});
test('the feed rejects malformed set values without discarding valid tie-breaks', () => {
  const parsed = feed.feedScores({ payload: { teams: ['A', 'B'], scores: [[7, '6(3)'], ['hidden_free_plan', 2], [-1, 6], ['6(x)', 7]], winner: 0 } });
  assert.deepEqual(Array.from(parsed.scores, set => Array.from(set)), [[7, '6(3)']]);
});
const row = { Info: { EventName: 'SA Nationals', Date: '06/10/2026 14:00', Challenger: { Name: 'Mark', IsWinner: true }, Challenger1: { Name: 'Paul' }, Challenged: { Name: 'Brad', IsWinner: false }, Challenged1: { Name: 'Jason' } }, Score: { Score: [{ Score1: 6, Score2: 0 }, { Score1: 6, Score2: 0 }] } };
test('shared RankedIn results use one identity with the correct winner and score in either orientation', () => {
  const a = model.localResultActivity(row, { id: 407, name: 'Mark' }, now);
  const reverse = { ...row, Info: { ...row.Info, Challenger: row.Info.Challenged, Challenger1: row.Info.Challenged1, Challenged: row.Info.Challenger, Challenged1: row.Info.Challenger1 }, Score: { Score: row.Score.Score.map(s => ({ Score1: s.Score2, Score2: s.Score1 })) } };
  const b = model.localResultActivity(reverse, { id: 408, name: 'Brad' }, now);
  assert.equal(a.event_key, b.event_key); assert.equal(a.title, b.title); assert.match(a.title, /won 6–0, 6–0/);
  assert.equal(JSON.stringify(a.payload), JSON.stringify(b.payload));
  assert.equal(model.localResultActivity(row, { id: 9, name: 'Someone else' }, now), null);
});
test('unknown winners, future dates and results older than 90 days do not create posts', () => {
  assert.equal(model.localResultActivity({ ...row, Info: { ...row.Info, Challenger: { Name: 'Mark' }, Challenged: { Name: 'Brad' } } }, { id: 1, name: 'Mark' }, now), null);
  for (const Date of ['08/10/2026', '01/01/2026', 'invalid']) assert.equal(model.localResultActivity({ ...row, Info: { ...row.Info, Date } }, { id: 1, name: 'Mark' }, now), null);
});
test('set totals remain labelled as set totals', () => {
  const item = model.localResultActivity({ ...row, Score: { IsSummary: true, Score: [{ Score1: 2, Score2: 0 }] } }, { id: 1, name: 'Mark' }, now);
  assert.match(item.title, /2–0 in sets/); assert.equal(item.payload.is_summary, true);
});
test('starred matches start only on actual provider live status and point changes reuse one activity', () => {
  assert.equal(model.proMatchActivity(match, undefined, now), null);
  const a = model.proMatchActivity({ ...match, status: 'live' }, undefined, now);
  const b = model.proMatchActivity({ ...match, status: 'live', score: [{ team_1: 3, team_2: 4 }] }, match, now + 5000);
  assert.equal(a.event_key, b.event_key); assert.equal(JSON.stringify(a.payload), JSON.stringify(b.payload)); assert.match(a.title, /has started/);
});
test('known schedule changes and published final results have independent keys', () => {
  const scheduled = model.proMatchActivity({ ...match, court: 'Center Court' }, match, now);
  const result = model.proMatchActivity({ ...match, status: 'finished' }, match, now);
  assert.equal(scheduled.kind, 'match_schedule'); assert.equal(result.event_key, 'pro-result:77'); assert.equal(result.payload.winner, 0);
});
test('a newly assigned match time says Upcoming match with SAST time and court', () => {
  const item = model.proMatchActivity(match, { ...match, scheduled_at: null }, now);
  assert.equal(item.title, 'Upcoming match: Mark / Paul vs Brad / Jason');
  assert.equal(item.payload.schedule_update, 'upcoming');
  assert.equal(item.body, 'SA Nationals\n7 Oct, 16:00 SAST · Court 2');
  assert.equal(item.payload.scheduled_at, '2026-10-07T14:00:00.000Z');
  assert.equal(item.payload.scores.length, 0);
  assert.equal(feed.feedScheduleLabel(item), 'UPCOMING MATCH');
});
test('real reschedules identify time, court or both rather than a generic update', () => {
  const cases = [
    [{ ...match, scheduled_at: '2026-10-07T15:00:00Z' }, 'time', 'Match time changed', 'MATCH TIME CHANGED'],
    [{ ...match, court: 'Center Court' }, 'court', 'Court changed', 'COURT CHANGED'],
    [{ ...match, scheduled_at: '2026-10-07T15:00:00Z', court: 'Center Court' }, 'time_and_court', 'Match time and court changed', 'MATCH TIME & COURT CHANGED'],
  ];
  for (const [current, type, title, label] of cases) {
    const item = model.proMatchActivity(current, match, now);
    assert.equal(item.payload.schedule_update, type);
    assert.equal(item.title, `${title}: Mark / Paul vs Brad / Jason`);
    assert.equal(item.payload.before_scheduled_at, '2026-10-07T14:00:00.000Z');
    assert.equal(item.payload.before_court, 'Court 2');
    assert.equal(feed.feedScheduleLabel(item), label);
  }
});
test('unchanged matches and equivalent timestamp formats do not create a card', () => {
  assert.equal(model.proMatchActivity(match, match, now), null);
  assert.equal(model.proMatchActivity({ ...match, scheduled_at: '2026-10-07T16:00:00+02:00' }, match, now), null);
  assert.equal(model.proMatchActivity({ ...match, scheduled_at: '2026-10-07T14:00:00.000Z' }, match, now), null);
});
test('missing and redacted fields do not invent schedule changes', () => {
  for (const value of [null, '', 'hidden_free_plan', 'not a date']) {
    assert.equal(model.proMatchActivity({ ...match, scheduled_at: value }, match, now), null);
  }
  assert.equal(model.proMatchActivity({ ...match, court: 'hidden_free_plan' }, match, now), null);
  const item = model.proMatchActivity({ ...match, scheduled_at: 'hidden_free_plan' }, { ...match, scheduled_at: null, court: null }, now);
  assert.equal(item.payload.schedule_update, 'upcoming');
  assert.equal(item.body, 'SA Nationals\nTime to be confirmed · Court 2');
});
test('past schedules and first source snapshots do not generate upcoming cards', () => {
  assert.equal(model.proMatchActivity({ ...match, scheduled_at: '2026-10-07T11:00:00Z' }, match, now), null);
  assert.equal(model.proMatchActivity(match, undefined, now), null);
  assert.equal(feed.feedScheduleLabel({ payload: {} }), 'UPCOMING MATCH');
});
test('pro ranking and photo changes require a baseline and group by player and day', () => {
  const first = { id: 95, name: 'Javier Leal', ranking: 10, points: 900, photo_url: 'https://test/photo.jpg' };
  assert.equal(model.proProfileActivities(first, undefined, now).length, 0);
  const a = model.proProfileActivities({ ...first, ranking: 9, points: 1000, photo_url: 'https://test/new.jpg' }, first, now);
  assert.equal(a.length, 2); assert.equal(a[0].path, '/pro/player/95');
  const b = model.proProfileActivities({ ...first, ranking: 8 }, first, now + 300000);
  assert.equal(a[0].event_key, b[0].event_key);
});
test('unchanged or unknown ranking positions never produce ranking posts for points changes', () => {
  const previous = { id: 95, name: 'Javier', ranking: 10, points: 900 };
  for (const ranking of [10, '10', null, 0]) {
    assert.equal(model.proProfileActivities({ ...previous, ranking, points: 1000 }, previous, now).length, 0);
  }
  assert.equal(model.proProfileActivities({ ...previous, ranking: 9 }, { ...previous, ranking: null }, now).length, 0);
  assert.equal(model.proProfileActivities({ ...previous, points: 1000, photo_url: 'https://test/new.jpg' }, { ...previous, photo_url: 'https://test/old.jpg' }, now)[0].kind, 'profile');
  for (const ranking of [9, 11]) {
    const activity = model.proProfileActivities({ ...previous, ranking }, previous, now)[0];
    assert.equal(activity.kind, 'ranking');
    assert.equal(activity.title, `Javier moved to #${ranking}`);
  }
});
test('feed routes reject external URLs, auth screens, unknown queries and duplicate parameters', () => {
  for (const path of ['https://evil.test', '/(auth)/sign-in', '/events/3?next=https://evil.test', '/pro/match/-1', '/players/3/../4', '/events/3?tab=Draws&tab=Results']) assert.equal(feed.feedPath(path), null);
  assert.equal(feed.feedPath('/pro/player/95'), '/pro/player/95'); assert.equal(feed.feedPath('/events/3?tab=Draws'), '/events/3?tab=Draws');
});
test('feed pagination deduplicates ids and retains timestamp/id cursor', () => {
  const item = { id: '00000000-0000-4000-8000-000000000001', kind: 'entry', title: 'Mark entered SA Nationals', path: '/events/3', occurred_at: '2026-10-07T10:00:00Z' };
  const page = feed.parseFeedPage({ items: [item, item], has_more: true });
  assert.equal(page.items.length, 1); assert.equal(page.cursor.id, item.id); assert.equal(page.hasMore, true);
  assert.throws(() => feed.parseFeedPage({ items: [{ ...item, occurred_at: 'invalid' }], has_more: false }));
});
test('existing unchanged ranking posts are hidden without losing the raw pagination cursor', () => {
  const item = { id: '00000000-0000-4000-8000-000000000001', kind: 'ranking', title: 'Ranking update', path: '/pro/player/95', occurred_at: '2026-10-07T10:00:00Z' };
  for (const before_rank of [10, '#10', '10', null, '', 0, 'unknown']) {
    const page = feed.parseFeedPage({ items: [{ ...item, payload: { before_rank, rank: 10, before_points: 900, points: 1000 } }], has_more: true });
    assert.equal(page.items.length, 0); assert.equal(page.cursor.id, item.id); assert.equal(page.hasMore, true);
  }
  const page = feed.parseFeedPage({ items: [
    { ...item, payload: { before_rank: '#11', rank: '10' } },
    { ...item, id: '00000000-0000-4000-8000-000000000002', payload: { before_rank: 10, rank: 10 } },
  ], has_more: true });
  assert.equal(page.items.length, 1); assert.equal(page.cursor.id, '00000000-0000-4000-8000-000000000002');
});
test('match detail route only receives known public score and team fields', () => {
  const activity = model.localResultActivity(row, { id: 1, name: 'Mark' }, now);
  const result = feed.feedMatchResult({ ...activity, payload: { ...activity.payload, rankedin_match: { ...activity.payload.rankedin_match, secret: 'private', Info: { ...activity.payload.rankedin_match.Info, email: 'private' } } } });
  assert.ok(result); assert.ok(!result.includes('private')); assert.equal(JSON.parse(result).Score.Score[0].Score1, 0);
});
test('background collection releases failed leases and still saves another source', async () => {
  const worker = load('supabase/functions/deliver-push/following-activity.ts', () => model);
  const calls = [];
  const db = { rpc: async (name, args) => { calls.push({ name, args }); return { data: name === 'claim_following_sources' ? [{ source: 'pro_match', target_id: '77', source_key: 'pro_match:77', lease_id: 'one' }, { source: 'pro_match', target_id: '78', source_key: 'pro_match:78', lease_id: 'two' }] : null, error: null }; } };
  const result = await worker.refreshFollowingActivity(db, 'server-token', async url => { if (url.endsWith('/78')) throw Error('Unavailable'); return { ok: true, headers: new Headers(), json: async () => ({ data: { ...match, status: 'finished' } }) }; });
  assert.equal(result.processed, 1); assert.equal(result.failed, 1);
  assert.equal(calls.find(c => c.args?.p_key === 'pro_match:78').args.p_snapshot, null);
  assert.equal(calls.find(c => c.args?.p_key === 'pro_match:77').args.p_items[0].kind, 'result');
});

test('published tournament results keep the authoritative individual score and exclude other matches', () => {
  const event={Id:5,Name:'SA Nationals',StartDate:'2026-10-06'};
  const fixture={Id:7,Date:'06/10/2026 14:00',Challenger:{Player1Id:407,Name:'Mark',Player2Name:'Paul'},Challenged:{Player1Id:9,Name:'Brad',Player2Name:'Jason'},MatchResult:{IsPlayed:true,IsFirstParticipantWinner:false,Score:{IsFirstParticipantWinner:true,FirstParticipantScore:2,SecondParticipantScore:0,DetailedScoring:[{FirstParticipantScore:6,SecondParticipantScore:0},{FirstParticipantScore:6,SecondParticipantScore:0}]}}};
  const parsed=model.localTournamentResult(event,fixture,407);
  assert.equal(parsed.Score.IsSummary,false); assert.equal(parsed.Info.Challenger.IsWinner,true);
  assert.match(model.localResultActivity(parsed,{id:407,name:'Mark'},now).title,/won 6–0, 6–0/);
  assert.equal(model.localTournamentResult(event,fixture,999),null);
  assert.equal(model.localTournamentResult(event,{...fixture,MatchResult:{IsPlayed:false}},407),null);
  assert.equal(model.tournamentFixtureRows([{Matches:{Matches:[fixture]}}]).length,1);
});
test('ranking rollups retain the first position of the day', () => {
  const before={id:95,name:'Javier',ranking:9,points:1000,_followingRankDay:'2026-10-07',_followingBeforeRank:12,_followingBeforePoints:800};
  const update=model.proProfileActivities({...before,ranking:8,points:1200},before,now)[0];
  assert.equal(update.payload.before_rank,12); assert.equal(update.payload.before_points,800); assert.equal(update.payload.rank,8);
});
test('a player returning to the starting rank produces no visible ranking update', () => {
  const before = { id: 95, name: 'Javier', ranking: 9, points: 1000, _followingRankDay: '2026-10-07', _followingBeforeRank: 10, _followingBeforePoints: 800 };
  const activity = model.proProfileActivities({ ...before, ranking: 10 }, before, now)[0];
  const page = feed.parseFeedPage({ items: [{ ...activity, id: '00000000-0000-4000-8000-000000000001' }], has_more: false });
  assert.equal(page.items.length, 0); assert.equal(page.hasMore, false);
});

test('returning to a paginated feed refreshes its loaded depth with bounded cursor requests', async () => {
  const calls=[];
  const entries=Array.from({length:80},(_,i)=>({id:`00000000-0000-4000-8000-${String(i+1).padStart(12,'0')}`,kind:'entry',title:'Public entry',path:'/events/3',occurred_at:new Date(now-i*1000).toISOString()}));
  const api=load('src/lib/following-feed.ts',name=>name.includes('supabase')?{supabase:{rpc:async (_name,args)=>{calls.push(args);const offset=args.p_before_id?entries.findIndex(row=>row.id===args.p_before_id)+1:0;return {data:{items:entries.slice(offset,offset+args.p_limit),has_more:offset+args.p_limit<entries.length},error:null};}}}:routing);
  const page=await api.fetchFollowingWindow('all',80);
  assert.equal(page.items.length,80); assert.equal(calls.length,2); assert.equal(calls[0].p_limit,50); assert.equal(calls[1].p_limit,30); assert.equal(calls[1].p_before_id,entries[49].id);
});
test('an invalidated account request does not continue collecting personal feed pages', async () => {
  let calls=0;
  const api=load('src/lib/following-feed.ts',name=>name.includes('supabase')?{supabase:{rpc:async()=>{calls++;return {data:{items:[{id:'00000000-0000-4000-8000-000000000001',kind:'entry',title:'Public entry',path:'/events/3',occurred_at:'2026-10-07T10:00:00Z'}],has_more:true},error:null};}}}:routing);
  await api.fetchFollowingWindow('all',80,()=>false); assert.equal(calls,1);
});
test('feed windows and load more skip unchanged ranking pages to reach real updates', async () => {
  const calls = [];
  const entries = Array.from({ length: 5 }, (_, i) => ({ id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`, kind: 'ranking', title: 'Ranking update', path: '/pro/player/95', occurred_at: new Date(now - i * 1000).toISOString(), payload: { before_rank: 10, rank: i < 3 ? 10 : 9 } }));
  const api = load('src/lib/following-feed.ts', name => name.includes('supabase') ? { supabase: { rpc: async (_name, args) => {
    calls.push(args);
    const offset = args.p_before_id ? entries.findIndex(row => row.id === args.p_before_id) + 1 : 0;
    return { data: { items: entries.slice(offset, offset + args.p_limit), has_more: offset + args.p_limit < entries.length }, error: null };
  } } } : routing);
  const first = await api.fetchFollowingWindow('all', 1);
  assert.equal(first.items.length, 1); assert.equal(first.items[0].id, entries[3].id); assert.equal(calls.length, 4); assert.equal(first.hasMore, true);
  const more = await api.fetchFollowingWindow('all', 1, () => true, first.cursor);
  assert.equal(more.items[0].id, entries[4].id); assert.equal(more.hasMore, false);
});

test('match cards preserve all exact player portraits and countries without unsafe image URLs', () => {
  const activity=model.proMatchActivity({...match,status:'finished',players:{team_1:[{id:1,name:'Mark',photo_url:'https://photos.test/mark.jpg',nationality:'ZA'},{id:2,name:'Paul',photo_url:'http://unsafe.test/photo',nationality:'South African'}],team_2:match.players.team_2}},match,now);
  const players=feed.feedParticipants(activity);
  assert.equal(players.length,2);assert.equal(players[0][0].photo,'https://photos.test/mark.jpg');assert.equal(players[0][0].country,'ZA');
  assert.equal(players[0][1].photo,null);assert.equal(players[0][1].country,null);
  const fallback=feed.feedParticipants({...activity,payload:{...activity.payload,participants:null}});
  assert.equal(fallback[1][0].name,'Brad');assert.equal(fallback[1][0].photo,null);
});
test('entry timers use current structured deadlines and distinguish closed, future and invalid dates', () => {
  const item={kind:'tournament',body:'Entries close: old date',payload:{registration_closes_at:'2026-10-08T11:00:00Z',changes:[{field:'registration_closes_at',after:'old date'}]}};
  assert.equal(feed.feedDeadline(item),'2026-10-08T11:00:00.000Z');
  const countdown=feed.feedCountdown(feed.feedDeadline(item),now);
  assert.equal(countdown.closed,false);assert.equal(countdown.days,0);assert.equal(countdown.hours,23);
  assert.equal(feed.feedCountdown('2026-10-06T10:00:00Z',now).closed,true);
  assert.equal(feed.feedCountdown('invalid',now),null);
  assert.equal(feed.feedDeadline({...item,payload:{changes:item.payload.changes}}),null);
  assert.equal(feed.feedDeadline({...item,payload:{...item.payload,registration_closes_at:'invalid'}}),null);
  assert.equal(feed.feedDeadline({...item,payload:{...item.payload,changes:[{field:'venue'}]}}),null);
  assert.equal(feed.feedDeadline({...item,kind:'entry'}),null);
});
test('media lookups match provider player IDs and cannot assign another person’s portrait', async () => {
  const worker=load('supabase/functions/deliver-push/following-activity.ts',()=>model);let saved;
  const db={rpc:async(name,args)=>{if(name==='finish_following_source')saved=args;return {data:name==='claim_following_sources'?[{source:'pro_match',target_id:'77',source_key:'pro_match:77',lease_id:'one'}]:null,error:null};}};
  await worker.refreshFollowingActivity(db,'server-token',async url=>({ok:true,headers:new Headers(),json:async()=>String(url).includes('/api/players?')?{data:[{id:1,name:'Mark',photo_url:'https://photos.test/mark.jpg',nationality:'ZA'},{id:999,name:'Paul',photo_url:'https://photos.test/wrong.jpg',nationality:'GB'}]}:{data:{...match,status:'finished'}}}));
  const players=saved.p_items[0].payload.participants;
  assert.equal(players[0][0].photo_url,'https://photos.test/mark.jpg');assert.equal(players[0][0].nationality,'ZA');assert.equal(players[0][1].photo_url,null);
});


test('saved provider data cannot generate fresh Following updates',async()=>{
 const worker=load('supabase/functions/deliver-push/following-activity.ts',()=>model);const finished=[];
 const db={rpc:async(name,args)=>{if(name==='claim_following_sources')return{data:[{source_key:'pro-match:77',source:'pro_match',target_id:'77',name:'Match',snapshot:null,lease_id:'lease'}]};if(name==='finish_following_source')finished.push(args);return{data:[]};}};
 const result=await worker.refreshFollowingActivity(db,'server-token',async()=>Response.json({...match,status:'live'},{headers:{'x-4m-cache':'stale'}}));
 assert.equal(result.processed,0);assert.equal(result.failed,1);assert.equal(finished.length,1);assert.equal(finished[0].p_snapshot,null);assert.equal(finished[0].p_items.length,0);
});
