const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, dependencies = {}, globals = {}) {
  const module = { exports: {} };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
    module, exports: module.exports, require: name => dependencies[name] || {}, URL, Date, Intl, Response, Request, AbortSignal, Headers, setTimeout, clearTimeout, ...globals,
  });
  return module.exports;
}
const model = () => load('src/lib/pro-padel-live.ts');
const row = (id, status, draw = 'main', gender = 'men', courtOrder = null) => ({ draw, courtOrder, match: { id, category: gender, round: 8, status, teams: [[{ id: 1, name: 'A' }], [{ id: 2, name: 'B' }]], score: [], court: 'Court 1', scheduledAt: '2026-11-09T09:00:00Z' } });
test('overview includes the actual Dubai qualifying match and respects gender', () => {
  const { tournamentNowAndNext } = load('src/lib/pro-tournament.ts');
  const value = tournamentNowAndNext([row(14773, 'live', 'qualy'), row(2, 'live', 'main', 'women'), row(3, 'scheduled', 'qualy', 'men', 3), row(4, 'scheduled', 'main', 'men', 2)], 'men');
  assert.deepEqual(Array.from(value.live, r => r.match.id), [14773]);
  assert.deepEqual(Array.from(value.next, r => r.match.id), [4, 3]);
});
test('all-draw status filter includes qualifiers without leaking other competitions', () => {
  const { filterTournamentMatches } = load('src/lib/pro-tournament.ts');
  const values = [row(1, 'live', 'qualy'), row(2, 'scheduled'), row(3, 'live', 'main', 'women')];
  assert.deepEqual(Array.from(filterTournamentMatches(values, { category: 'men', draw: 'all', status: 'live', round: 'all', day: 'all' }), r => r.match.id), [1]);
});
test('match parser keeps court queue order; point score parser handles provider whitespace', () => {
  const { parseProviderMatch, parsePointFeed, liveScoreFromPointFeed } = model();
  assert.equal(parseProviderMatch({ id: 14773, category: 'men', court_order: 2, players: {} }).courtOrder, 2);
  assert.equal(liveScoreFromPointFeed(parsePointFeed({ id: 14773, sets: [{ set_number: 1, set_score: '6 - 4', games: [] }] }, 14773)).sets[0][0], '6');
  assert.equal(parsePointFeed({ id: 11, sets: [] }, 14773), null);
});
const feed = { status: 'live', sets: [{ set_number: 1, set_score: '6-4', games: [{ game_number: 1, game_score: '0-0', points: [] }] }, { set_number: 2, set_score: null, games: [{ game_number: 1, game_score: '0-0', points: [] }, { game_number: 2, game_score: '0-1', points: ['0:0','15:0'] }] }] };
test('live feed orders latest set/game first without mutating provider history', () => {
  const { liveFeedGames } = load('src/lib/pro-live-feed.ts');
  const games = liveFeedGames(feed);
  assert.deepEqual(Array.from(games, g => g.key), ['2:2','2:1','1:1']);
  assert.equal(games[0].current, true); assert.equal(games[1].current, false);
  assert.equal(feed.sets[0].set_number, 1);
  assert.equal(liveFeedGames(feed, 1).length, 1);
});
test('no inferred game winner across missing games or a score correction', () => {
  const { recordedGameWinner } = load('src/lib/pro-live-feed.ts');
  assert.equal(recordedGameWinner({ set_score: null, games: [{ game_number: 1, game_score: '0-0' }, { game_number: 3, game_score: '2-0' }] }, 0), null);
  assert.equal(recordedGameWinner({ set_score: '1-0', games: [{ game_number: 1, game_score: '0-0' }] }, 0), 0);
  assert.equal(recordedGameWinner({ set_score: '0-0', games: [{ game_number: 1, game_score: '1-0' }] }, 0), null);
});
test('point attribution handles deuce, tiebreaks and missing transitions exactly', () => {
  const { recordedPointWinner: winner } = load('src/lib/pro-live-feed.ts');
  assert.equal(winner('15:0','30:0',false), 0); assert.equal(winner('AD:40','40:40',false), 1);
  assert.equal(winner('40:A','40:40',false), 0); assert.equal(winner('6:6','6:7',true), 1);
  assert.equal(winner('0:0','30:0',false), null); assert.equal(winner('0:0','15:15',false), null);
  assert.equal(winner(undefined,'15:0',false), null); assert.equal(winner('bad','15:0',false), null);
});
test('performance preserves null, zero, negative deltas and overlapping windows separately', () => {
  const { parsePerformance } = load('src/lib/pro-padel-insights.ts');
  const value = parsePerformance({ matches_played: 0, expected_win_rate: null, actual_win_rate: 0, delta: null, trend: null, windows: { last_7_days: { matches_played: 2, delta: -8.5 } }, by_period: [{ delta: 3 }] });
  assert.equal(value.expected, null); assert.equal(value.actual, 0); assert.equal(value.delta, null); assert.equal(value.trend, null);
  assert.equal(value.windows[0].value.delta, -8.5); assert.equal(value.periods[0].delta, 3);
});
test('rival parser keeps player IDs and pair IDs distinct', () => {
  const { parseRivals } = load('src/lib/pro-padel-insights.ts');
  const value = { rivals_count: '2', rivals: [{ id: 1, name: 'Player', matches_played: 4 }, { id: '1-2', name: 'Pair', matches_played: 6 }] };
  assert.equal(parseRivals(value,'player').rivals[0].id, 1); assert.equal(parseRivals(value,'player').rivals.length, 1);
  assert.equal(parseRivals(value,'pair').rivals[0].id, '1-2'); assert.equal(parseRivals(value,'pair').rivals.length, 1);
});
test('insight request rejects mismatched subjects and accepts reversed pair identity', async () => {
  let output = { id: 66, matches_played: 3 };
  const { fetchProInsight } = load('src/lib/pro-padel-insights.ts', { './pro-padel-live': { invokeProResource: async () => output } });
  await assert.rejects(fetchProInsight('performance',{ player: 65 }), /different player/);
  output = { id: '2-1', matches_played: 3 };
  assert.equal((await fetchProInsight('performance',{ pair: '1-2' })).data.played, 3);
  output = { unavailable: true, reason: 'subscription' };
  assert.equal((await fetchProInsight('performance',{ player: 65 })).unavailable,'subscription');
});
function socketFixture() {
  const sockets=[], states=[], frames=[], sends=[], timers=new Map(); let next=0, resyncs=0;
  const connection = load('src/lib/pro-live-connection.ts', { './pro-padel-live': model() }, { setTimeout: fn => { timers.set(++next, fn); return next; }, clearTimeout: id => timers.delete(id) });
  const args = { id: 14773, channel: 'matches.aec8548570ed7c27', onFeed: feed => frames.push(feed), onState: s => states.push(s), onReconnect: () => resyncs++, createSocket: url => {
    assert.match(url,/^wss:\/\/ws-eu\.pusher\.com\/app\//); assert.doesNotMatch(url,/token|Bearer/);
    const socket={ send: text => sends.push(JSON.parse(text)), close() { this.closed=true; } }; sockets.push(socket); return socket;
  } };
  const emit = (event, data, channel=args.channel) => sockets.at(-1).onmessage({ data: JSON.stringify({ event, channel, data: JSON.stringify(data) }) });
  return { connection, args, emit, sockets, states, frames, sends, timers, get resyncs(){return resyncs;} };
}
test('stream subscribes only to provider-issued channel and validates match payload', () => {
  const f=socketFixture(), stop=f.connection.connectProLive(f.args);
  f.emit('pusher:connection_established',{ activity_timeout: 120 });
  assert.equal(f.sends[0].data.channel,f.args.channel);
  f.emit('pusher_internal:subscription_succeeded',{});
  f.emit('App\\PadelApi\\Events\\MatchLiveUpdated',{id:999,status:'live',sets:[]});
  f.emit('App\\PadelApi\\Events\\MatchLiveUpdated',{id:14773,status:'live',sets:[]},'matches.wrongchannel');
  assert.equal(f.frames.length,0);
  f.emit('App\\PadelApi\\Events\\MatchLiveUpdated',{id:14773,status:'live',sets:[]});
  assert.equal(f.frames.length,1); assert.equal(f.states.at(-1),'connected');
  stop(); assert.equal(f.timers.size,0); assert.equal(f.sockets[0].closed,true);
});
test('stream answers heartbeats, recovers after disconnect and closes on final confirmation', () => {
  const f=socketFixture(), stop=f.connection.connectProLive(f.args);
  f.emit('pusher:connection_established',{}); f.emit('pusher_internal:subscription_succeeded',{});
  f.emit('pusher:ping',{}); assert.equal(f.sends.at(-1).event,'pusher:pong');
  f.sockets[0].onclose(); assert.equal(f.states.at(-1),'reconnecting');
  const retry=[...f.timers.values()][0]; f.timers.clear(); retry();
  f.emit('pusher:connection_established',{}); f.emit('pusher_internal:subscription_succeeded',{}); assert.equal(f.resyncs,1);
  f.emit('App\\PadelApi\\Events\\MatchLiveUpdated',{id:14773,status:'ended',sets:[]}); assert.notEqual(f.sockets.at(-1).closed,true);
  f.emit('App\\PadelApi\\Events\\MatchLiveUpdated',{id:14773,status:'finished',sets:[]}); assert.equal(f.states.at(-1),'finished'); assert.equal(f.sockets.at(-1).closed,true);
  stop(); assert.equal(f.timers.size,0);
});
test('stream rejects guessed or malformed channels before opening a socket', () => {
  const f=socketFixture(); f.connection.connectProLive({...f.args,channel:'private-user.1'}); assert.equal(f.sockets.length,0);
});

test('cached REST data never rolls back a newer socket score, but fresh REST repairs reconnect gaps',()=>{
 const {newestPointFeed}=load('src/lib/pro-live-feed.ts');
 const pushed={status:'live',sets:[],freshness:{updatedAt:'2026-11-09T09:40:00Z'}},saved={status:'live',sets:[],freshness:{updatedAt:'2026-11-09T09:39:00Z'}};
 assert.equal(newestPointFeed(pushed,saved),pushed);
 const repaired={status:'ended',sets:[],freshness:{updatedAt:'2026-11-09T09:41:00Z'}};
 assert.equal(newestPointFeed(pushed,repaired),repaired);assert.equal(newestPointFeed(null,saved),saved);
});

test('calendar opens the same live tournament centre and keeps official FIP IDs separate',()=>{
 const {proTournamentDestination}=load('src/lib/pro-tournament.ts');
 assert.equal(proTournamentDestination({id:750}).pathname,'/pro/tournament/[id]');
 assert.equal(proTournamentDestination({id:750}).params.id,'750');
 assert.equal(proTournamentDestination({id:-73,matchesAvailable:false}).pathname,'/pro/fip/[id]');
 assert.equal(proTournamentDestination({id:-73,matchesAvailable:false}).params.id,'-73');
});

test('scoreboard short names retain full player identity for profiles and accessibility',()=>{
 const {parseProviderMatch}=model();const p=parseProviderMatch({id:14773,category:'men',players:{team_1:[{id:126,name:'Manuel Aragon Herrera',short_name:'Aragon'}]}}).match.teams[0][0];
 assert.equal(p.id,126);assert.equal(p.name,'Manuel Aragon Herrera');assert.equal(p.shortName,'Aragon');
});

test('finished game summary shows its actual end score and refuses to invent skipped games',()=>{
 const {recordedGameEndScore}=load('src/lib/pro-live-feed.ts');
 const set={set_score:'1-5',games:[{game_number:5,game_score:'1-3'},{game_number:6,game_score:'1-4'}]};
 assert.equal(recordedGameEndScore(set,0),'1-4');assert.equal(recordedGameEndScore(set,1),'1-5');
 assert.equal(recordedGameEndScore({set_score:null,games:[{game_number:1,game_score:'0-0'},{game_number:3,game_score:'2-0'}]},0),null);
});
test('professional portrait parsing projects only requested IDs and HTTPS public image fields',()=>{
 const {parseProPortraits}=load('src/lib/pro-player-portraits.ts');
 const result=parseProPortraits({players:[{id:1,photo_url:'https://example.test/1.jpg',nationality:'ZA',email:'private@example.test'},{id:2,photo_url:'http://bad.test/a'},{id:9,photo_url:'https://example.test/9.jpg'}]},[1,2]);
 assert.equal(result.length,2);assert.equal(result[0].photoUrl,'https://example.test/1.jpg');assert.equal(result[1].photoUrl,null);assert.equal('email' in result[0],false);
});
test('visible-player photo loads coalesce and deduplicate without one provider call per face',async()=>{
 let calls=0,requested;
 const {loadProPortraits}=load('src/lib/pro-player-portraits.ts',{'./pro-padel-live':{invokeProResource:async(kind,id,page,extra)=>{calls++;requested=extra.player_ids;assert.equal(kind,'player-portraits');return {players:requested.map(id=>({id,photo_url:`https://example.test/${id}.jpg`}))};}}});
 const [first,second]=await Promise.all([loadProPortraits([1,2]),loadProPortraits([2,3])]);
 assert.equal(calls,1);assert.equal(new Set(requested).size,3);assert.equal(first[1].id,2);assert.equal(second[0].id,2);
 await loadProPortraits([1,2,3]);assert.equal(calls,1);
});
test('professional short names never replace IDs or full accessible identities',()=>{
 const {proShortName,proInitials}=load('src/lib/pro-player-display.ts');
 const player={id:126,name:'Manuel Aragon Herrera',shortName:'Aragon'};
 assert.equal(proShortName(player),'Aragon');assert.equal(player.name,'Manuel Aragon Herrera');assert.equal(proInitials(player.name),'MH');
 assert.equal(proInitials(''),'??'.slice(0,1));assert.equal(proShortName({id:1,name:'Juan Cruz Belluati'}),'J. C. Belluati');
});

test('missing adjacent game score never falls back to a later final set score',()=>{
 const {recordedGameWinner,recordedGameEndScore}=load('src/lib/pro-live-feed.ts');
 const set={set_score:'6-4',games:[{game_number:9,game_score:'5-4'},{game_number:10,game_score:null}]};
 assert.equal(recordedGameWinner(set,0),null);assert.equal(recordedGameEndScore(set,0),null);
});

function entriesModel() { return load('src/lib/pro-tournament-entries.ts', { './pro-tournament': load('src/lib/pro-tournament.ts') }); }
const pair = n => [{id:n*2+1,name:`Player ${n} A`,nationality:'ES'},{id:n*2+2,name:`Player ${n} B`,nationality:'AR'}];
function drawRow(round,index,teams,status='scheduled',winner=null,draw='main',category='men',tournamentId=750) {
  return { bracketIndex:index,draw,seeds:[null,null],match:{id:round*100+index,round,teams,status,winner,category,tournamentId,score:[],roundName:null} };
}
const entryDraw = () => [drawRow(4,0,[pair(0),[]],'bye'),drawRow(4,1,[pair(1),pair(2)]),drawRow(4,2,[pair(3),pair(4)]),drawRow(4,3,[pair(5),pair(6)]),drawRow(2,0,[[],[]]),drawRow(2,1,[[],[]]),drawRow(1,0,[[],[]])];
test('partnerships use two canonical numeric IDs and never merge on a single player or name',()=>{
  const m=entriesModel();assert.equal(m.tournamentPairKey(pair(0)),'1-2');assert.equal(m.tournamentPairKey([...pair(0)].reverse()),'1-2');
  assert.equal(m.tournamentPairKey([pair(0)[0],pair(0)[0]]),null);assert.equal(m.tournamentPairKey([pair(0)[0]]),null);
  assert.equal(m.validTournamentPairKey('1-2'),true);assert.equal(m.validTournamentPairKey('2-1'),false);assert.equal(m.validTournamentPairKey('1-1'),false);
  assert.equal(m.tournamentPairKey([{id:1,name:'Same'},{id:3,name:'Same'}]),'1-3');
});
test('entries isolate tournament and competition, dedupe repeated pages, and parse only real numeric seeds',()=>{
  const m=entriesModel(),rows=entryDraw();rows[0].seeds=['WC',null];rows[4].match.teams=[pair(0),[]];rows[4].seeds=['1',null];
  const wrongGender=drawRow(4,0,[pair(20),pair(21)],'scheduled',null,'main','women');wrongGender.match.id=9991;
  const wrongEvent=drawRow(4,0,[pair(30),pair(31)],'scheduled',null,'main','men',751);wrongEvent.match.id=9992;
  const entries=m.tournamentEntries([...rows,rows[0],wrongGender,wrongEvent],750,'men');
  assert.equal(entries.length,7);assert.equal(entries[0].key,'1-2');assert.equal(entries[0].seed,1);assert.equal(entries[0].matches.length,2);
});
test('zero-indexed draw preserves the bye and lists every potential opponent without inventing a favourite',()=>{
  const result=entriesModel().tournamentPairJourney(entryDraw(),750,'men','1-2',true);
  assert.equal(result.stages.length,3);assert.equal(result.stages[0].outcome,'bye');assert.equal(result.stages[1].conditional,false);
  assert.deepEqual(Array.from(result.stages[1].opponents,t=>t[0].id),[3,5]);assert.equal(result.stages[2].conditional,true);
  assert.equal(result.stages[2].opponents.length,4);assert.equal(result.winsRemaining,2);assert.equal(result.notice,null);
});
test('a completed feeder removes its losing pair; published opponent is confirmed separately from future progression',()=>{
  const rows=entryDraw();rows[1].match.status='finished';rows[1].match.winner='team_2';rows[4].match.teams=[pair(0),pair(2)];
  const result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);
  assert.equal(result.stages[1].opponents.length,1);assert.equal(result.stages[1].opponents[0][0].id,5);assert.equal(result.stages[1].side,0);
  assert.equal(result.stages[2].opponents.length,4);assert.equal(result.stages[2].conditional,true);
});
test('missing player is not a bye; unpublished qualifier stays unknown',()=>{
  const rows=entryDraw();rows[0].match.status='scheduled';
  const result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);
  assert.equal(result.stages[0].outcome,'upcoming');assert.equal(result.stages[0].unknownOpponent,true);assert.equal(result.stages[1].conditional,true);assert.equal(result.winsRemaining,3);
});
test('incomplete or inconsistent bracket never fabricates projected rounds',()=>{
  const m=entriesModel(),rows=entryDraw();
  assert.equal(m.tournamentPairJourney(rows,750,'men','1-2',false).stages.length,1);
  assert.equal(m.tournamentPairJourney(rows.slice(1),750,'men','3-4',true).winsRemaining,null);
  rows[4].bracketIndex=1;
  const result=m.tournamentPairJourney(rows,750,'men','1-2',true);assert.equal(result.stages.length,1);assert.match(result.notice,/not verified/);
});
test('elimination stops the journey and retirement or walkover uses only the explicit winner',()=>{
  const rows=entryDraw();rows[0].match={...rows[0].match,teams:[pair(0),pair(7)],status:'retired',winner:'team_2'};
  const result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);
  assert.equal(result.stages.length,1);assert.equal(result.stages[0].outcome,'lost');assert.equal(result.eliminated,true);assert.equal(result.winsRemaining,null);
  rows[0].match.status='walkover';rows[0].match.winner='team_1';assert.equal(entriesModel().tournamentPairJourney(rows,750,'men','1-2',true).stages[0].outcome,'won');
});
test('qualifying stops at its published final and never guesses the main-draw slot',()=>{
  const rows=[drawRow(2,0,[pair(0),pair(1)],'finished','team_1','qualy'),drawRow(2,1,[pair(2),pair(3)],'finished','team_1','qualy')];
  const result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);
  assert.equal(result.stages.length,1);assert.equal(result.winsRemaining,null);assert.match(result.notice,/main-draw place/);
});
test('published final win is a title, while an unfinished final is not',()=>{
  const rows=entryDraw();rows[0].match.status='finished';rows[0].match.winner='team_1';rows[0].match.teams=[pair(0),pair(7)];
  rows[1].match.status='finished';rows[1].match.winner='team_1';rows[4].match.teams=[pair(0),pair(1)];rows[4].match.status='finished';rows[4].match.winner='team_1';
  rows[6].match.teams=[pair(0),[]];
  let result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);assert.equal(result.champion,false);assert.equal(result.winsRemaining,1);
  rows[6].match.status='finished';rows[6].match.winner='team_1';
  result=entriesModel().tournamentPairJourney(rows,750,'men','1-2',true);assert.equal(result.champion,true);assert.equal(result.winsRemaining,0);
});
test('parser retains bracket index zero and rejects malformed indices',()=>{
  const {parseProviderMatch}=model(),value={id:1,category:'men',players:{}};
  assert.equal(parseProviderMatch({...value,index:0}).bracketIndex,0);assert.equal(parseProviderMatch({...value,index:-1}).bracketIndex,null);assert.equal(parseProviderMatch({...value,index:'0'}).bracketIndex,null);
});
test('bounded tournament cache retains the draw for instant pair navigation without mixing event IDs',()=>{
  const {rememberTournament,readTournament}=load('src/lib/pro-tournament-cache.ts');
  for(let i=1;i<=7;i++) rememberTournament(i,{event:{id:i},matches:entryDraw(),complete:true});
  assert.equal(readTournament(1),undefined);assert.equal(readTournament(2).event.id,2);assert.equal(readTournament(7).complete,true);
});

test('tournament page binds the requested parent when omitted and rejects a conflicting parent',async()=>{
  const data=[{id:1,category:'men',players:{}},{id:2,category:'men',players:{},tournament:{id:751}}];
  const api=load('src/lib/pro-padel-live.ts',{'@/lib/supabase':{supabase:{functions:{invoke:async()=>({data:{data,meta:{last_page:1,total:2}}})}}}});
  const result=await api.fetchTournamentMatches(750);assert.equal(result.matches.length,1);assert.equal(result.matches[0].match.tournamentId,750);
});
test('projected opponent follows explicit seeding and never mutates the actual draw',()=>{
  const e=entriesModel(),rows=entryDraw(),stage=e.tournamentPairJourney(rows,750,'men','1-2',true).stages[1];
  const model=load('src/lib/pro-journey-prediction.ts',{'./pro-tournament-entries':e});
  const entries=e.tournamentEntries(rows,750,'men');entries.find(p=>p.key==='5-6').seedsByDraw.main=3;
  assert.equal(model.projectedOpponent(stage,entries)[0].id,5);assert.equal(stage.opponents.length,2);assert.equal(rows[4].match.teams[0].length,0);
});
test('win estimates coalesce, serialize, preserve zero, and reject invalid probabilities or repeated players',async()=>{
  const e=entriesModel();let calls=0,inFlight=0,peak=0,output={team1:0,team2:100};
  const model=load('src/lib/pro-journey-prediction.ts',{'./pro-tournament-entries':e,'./pro-padel-live':{fetchMatchPrediction:async details=>{calls++;inFlight++;peak=Math.max(peak,inFlight);assert.equal(details.match.teams[0][0].id,1);await Promise.resolve();inFlight--;return output;}}},{setTimeout:fn=>{fn();return 1;}});
  const row=entryDraw()[4];
  const results=await Promise.all([model.journeyWinEstimate(row,pair(0),pair(1),'2026-11-08'),model.journeyWinEstimate(row,pair(0),pair(1),'2026-11-08'),model.journeyWinEstimate(row,pair(0),pair(2),'2026-11-08')]);
  assert.deepEqual(Array.from(results),[0,0,0]);assert.equal(calls,2);assert.equal(peak,1);
  await model.journeyWinEstimate(row,pair(0),pair(1),'2026-11-08');assert.equal(calls,2);
  assert.equal(await model.journeyWinEstimate(row,pair(0),pair(0),'2026-11-08'),null);assert.equal(calls,2);
  output={team1:150,team2:-50};assert.equal(await model.journeyWinEstimate(row,pair(0),pair(3),'2026-11-08'),null);
});
test('cancelled estimate leaves provider quota untouched and another active subscriber can retain a shared request',async()=>{
  const e=entriesModel();let calls=0;
  const model=load('src/lib/pro-journey-prediction.ts',{'./pro-tournament-entries':e,'./pro-padel-live':{fetchMatchPrediction:async()=>{calls++;return {team1:60,team2:40};}}},{setTimeout:fn=>{fn();return 1;}});
  const row=entryDraw()[4];assert.equal(await model.journeyWinEstimate(row,pair(0),pair(1),'2026-11-08',()=>false),null);assert.equal(calls,0);
  const a=model.journeyWinEstimate(row,pair(0),pair(2),'2026-11-08',()=>false),b=model.journeyWinEstimate(row,pair(0),pair(2),'2026-11-08',()=>true);
  assert.equal(await a,60);assert.equal(await b,60);assert.equal(calls,1);
});
test('rounded win estimates never turn a near-certainty into a displayed 100 percent',()=>{
  const {winEstimateLabel}=load('src/lib/pro-journey-prediction.ts');
  assert.equal(winEstimateLabel(99.98),'>99%');assert.equal(winEstimateLabel(.2),'<1%');assert.equal(winEstimateLabel(0),'0%');assert.equal(winEstimateLabel(100),'100%');assert.equal(winEstimateLabel(65.2),'65%');
});
test('device accepts a probability only for the selected four players, category and Elo reference date',()=>{
  const {parseMatchPrediction}=model();
  const value={probability:{team_1:95.38,team_2:4.62},teams:{team_1:[66,65],team_2:[93,18]},category:'men',referenceDate:'2026-11-08',source:'padel-api',model:'elo'};
  assert.equal(parseMatchPrediction(value,[[65,66],[18,93]],'2026-11-08','men').team1,95.38);
  assert.throws(()=>parseMatchPrediction(value,[[65,66],[17,98]],'2026-11-08','men'),/could not be verified/);
  assert.throws(()=>parseMatchPrediction(value,[[65,66],[18,93]],'2026-11-09','men'),/could not be verified/);
  assert.throws(()=>parseMatchPrediction(value,[[65,66],[18,93]],'2026-11-08','women'),/could not be verified/);
  assert.throws(()=>parseMatchPrediction({...value,source:'unknown'},[[65,66],[18,93]],'2026-11-08','men'),/could not be verified/);
  assert.throws(()=>parseMatchPrediction({...value,probability:{team_1:89,team_2:4.62}},[[65,66],[18,93]],'2026-11-08','men'),/could not be verified/);
  assert.equal(parseMatchPrediction({unavailable:true},[[65,66],[18,93]],'2026-11-08','men'),null);
});
test('a refreshed opponent never paints the prior percentage; a manual refresh can retry the same matchup',async()=>{
  const slots=[],effects=[],requests=[];let cursor=0,opponent=pair(1),revision=0;
  const same=(a,b)=>a&&b&&a.length===b.length&&a.every((value,index)=>Object.is(value,b[index]));
  const react={
    useState(initial){const i=cursor++;if(!(i in slots))slots[i]={value:initial};return[slots[i].value,value=>{slots[i].value=value;}];},
    useEffect(fn,deps){const i=cursor++;if(!same(slots[i]?.deps,deps)){const previous=slots[i];slots[i]={deps,cleanup:previous?.cleanup};effects.push(()=>{previous?.cleanup?.();slots[i].cleanup=fn();});}},
  };
  const hook=load('src/hooks/use-journey-win-estimate.ts',{
    react,'./use-screen-active':{useScreenActive:()=>true},'@/lib/pro-tournament-entries':entriesModel(),
    '@/lib/pro-journey-prediction':{journeyWinEstimate:()=>new Promise(resolve=>requests.push(resolve))},
  });
  const render=()=>{cursor=0;return hook.useJourneyWinEstimate(entryDraw()[4],pair(0),opponent,'2026-11-08',true,revision);};
  const flush=async()=>{while(effects.length)effects.shift()();await Promise.resolve();await Promise.resolve();};
  render();await flush();requests[0](95.38);await flush();assert.equal(render().value,95.38);
  opponent=pair(2);assert.equal(render().value,null);await flush();
  opponent=pair(3);assert.equal(render().value,null);await flush();
  requests[2](62);await flush();assert.equal(render().value,62);
  requests[1](99);await flush();assert.equal(render().value,62);
  revision++;assert.equal(render().value,null);await flush();assert.equal(requests.length,4);
  requests[3](63);await flush();assert.equal(render().value,63);
});
test('qualifying seeds and status never contaminate a main-draw entry or projection',()=>{
  const e=entriesModel(),main=drawRow(4,0,[pair(0),pair(1)]),qualy=drawRow(2,0,[pair(0),pair(2)],'finished','team_1','qualy');
  qualy.match.id=9200;qualy.seeds=['1',null];
  const entries=e.tournamentEntries([main,qualy],750,'men'),entry=entries.find(p=>p.key==='1-2');
  assert.equal(entry.seed,null);assert.equal(entry.seedsByDraw.qualy,1);assert.equal(entry.seedsByDraw.main,null);
  assert.equal(e.tournamentEntriesForDraw(entries,'main').find(p=>p.key==='1-2').seed,null);
  assert.equal(e.tournamentEntriesForDraw(entries,'qualy').find(p=>p.key==='1-2').seed,1);
  const model=load('src/lib/pro-journey-prediction.ts',{'./pro-tournament-entries':e});
  const branch={draw:'main',opponents:[pair(1),pair(0)]};
  entries.find(p=>p.key==='3-4').seedsByDraw.main=4;
  assert.equal(model.projectedOpponent(branch,entries)[0].id,3);
});
test('coming-up cards exclude ongoing duplicates and completed events',()=>{
  const {upcomingTourEvents}=load('src/lib/home-tour-presentation.ts');
  const events=[{id:750,startDate:'2026-11-08',status:'live'},{id:751,startDate:'2026-11-10',status:'scheduled'},{id:752,startDate:'2026-11-12',status:'finished'}];
  assert.deepEqual(Array.from(upcomingTourEvents(events,[events[0]],Date.parse('2026-11-09T10:00:00Z')),e=>e.id),[751]);
});
test('today match count is event-scoped, deduplicated, timezone-aware, and excludes byes',()=>{
  const {tourMatchesToday}=load('src/lib/home-tour-presentation.ts');
  const a={id:1,tournamentId:750,scheduledAt:'2026-11-08T23:00:00Z',status:'scheduled'},b={id:2,tournamentId:751,scheduledAt:'2026-11-09T10:00:00Z',status:'scheduled'};
  assert.equal(tourMatchesToday([a,a,b,{...a,id:3,status:'bye'},{...a,id:4,scheduledAt:'bad'}],750,Date.parse('2026-11-09T10:00:00Z')),1);
});
