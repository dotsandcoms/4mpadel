const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const vm = require('node:vm');
function load(file, modules) {
 const source = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
 const exports = {}; vm.runInNewContext(source, { exports, require: name => modules[name], URL }); return exports;
}
const players = load('src/lib/players.ts', { '@/lib/supabase': { supabase: {} } });
const preferences = load('src/lib/player-preferences.ts', {});
test('court side and playing hand labels match the profile selections', () => {
 assert.equal(preferences.courtSideLabel('either'), 'Either');
 assert.equal(preferences.courtSideLabel('left'), 'Left');
 assert.equal(preferences.playingHandLabel('right'), 'Right-handed');
 assert.equal(preferences.playingHandLabel('left'), 'Left-handed');
 assert.equal(preferences.playingHandLabel(null), null);
});

function signupPreferences({ updateError = null, updatedRow = { id: 42 } } = {}) {
 const requests = [], updates = [], storage = new Map();
 const api = load('src/lib/profile.ts', {
  '@/lib/player-preferences': preferences,
  '@/lib/sponsors': {}, './matches': {}, '@/theme/tokens': {},
  '@/lib/welcome-email': { queueWelcomeEmail: async () => requests.push(['welcome']) },
  './signup-source': { resolveSignupSource: () => 'mobile', collectSignupDevice: () => 'ios' },
  './profile-draft-storage': { saveDraftText: async (key, value) => storage.set(key, value), loadDraftText: async key => storage.get(key) ?? null, clearDraftText: async key => storage.delete(key) },
  './supabase': { supabase: {
   rpc: async (name, payload) => { requests.push([name, payload]); return { error: null }; },
   auth: { getUser: async () => ({ data: { user: { user_metadata: {} } } }) },
   from(table) {
    assert.equal(table, 'players');
    const q = { update(value) { updates.push(value); return q; }, eq(key, value) { assert.equal(key, 'email'); assert.equal(value, 'player@example.com'); return q; }, select() { return q; }, maybeSingle: async () => ({ data: updatedRow, error: updateError }) };
    return q;
   },
  } },
 });
 const draft = { firstName: 'Test', lastName: 'Player', email: 'player@example.com', contactNumber: '0123456789', gender: 'Male', nationality: 'South Africa', idNumber: 'test', region: 'Gauteng', category: 'Men', clubId: '', customClub: '', bio: 'Padel player', instagramLink: '', sponsors: '', racketBrand: 'Adidas', customRacketBrand: '' };
 return { api, draft, requests, updates };
}
test('registration persists selected playing preferences and restores them from the account draft', async () => {
 const h = signupPreferences();
 const draft = { ...h.draft, courtSide: 'either', playingHand: 'left' };
 await h.api.saveProfileDraft(draft);
 const restored = await h.api.loadProfileDraft(draft.email);
 assert.equal(restored.courtSide, 'either'); assert.equal(restored.playingHand, 'left');
 assert.equal(h.api.draftHasProgress({ playingHand: 'left' }), true);
 await h.api.createPlayerProfile(restored, []);
 assert.equal(h.requests[0][0], 'create_player_profile');
 assert.deepEqual({ ...h.updates[0] }, { court_side: 'either', playing_hand: 'left' });
 assert.equal(h.requests[1][0], 'welcome');
});
test('registration keeps optional preferences unset for older drafts and saves either field independently', async () => {
 const old = signupPreferences();
 await old.api.createPlayerProfile(old.draft, []);
 assert.equal(old.updates.length, 0);
 const hand = signupPreferences();
 await hand.api.createPlayerProfile({ ...hand.draft, playingHand: 'right' }, []);
 assert.deepEqual({ ...hand.updates[0] }, { playing_hand: 'right' });
});
test('registration rejects invalid preferences before creating a profile and reports unsaved selections', async () => {
 const invalid = signupPreferences();
 await assert.rejects(invalid.api.createPlayerProfile({ ...invalid.draft, playingHand: 'both' }, []), /valid playing hand/);
 assert.equal(invalid.requests.length, 0);
 for (const options of [{ updateError: new Error('offline') }, { updatedRow: null }]) {
  const failed = signupPreferences(options);
  await assert.rejects(failed.api.createPlayerProfile({ ...failed.draft, courtSide: 'left' }, []), /preferences could not be saved/);
  assert.ok(!failed.requests.some(([name]) => name === 'welcome'));
 }
});
test('directory filters combine name, category and club without confusing list positions with rank', () => {
 const rows = [{ id:'1', name:'Brad Elin', category:'Men', home_club:'KCC' }, { id:'2', name:'Brad Other', category:'Men', home_club:'City' }, {id:'3', name:'Sarah', category:'Women', home_club:'KCC'}];
 assert.deepEqual(Array.from(players.filterPlayers(rows, ' BRAD ', 'Men', 'KCC'), x=>x.id), ['1']);
 assert.equal(players.filterPlayers(rows, '', '', '').length, 3);
 assert.equal(players.publicRank(null), 'Unranked'); assert.equal(players.publicRank('Unranked'), 'Unranked'); assert.equal(players.publicRank('0'), 'Unranked'); assert.equal(players.publicRank('5'), '#5');
});
test('profile handles legacy gallery/sponsor formats and absent points', () => {
 assert.deepEqual(Array.from(players.stringList('["A","B"]')), ['A','B']);
 assert.deepEqual(Array.from(players.stringList('A, B')), ['A','B']);
 assert.equal(players.playerPoints(null), '—'); assert.equal(players.playerPoints(0), '0');
});
test('player profile defaults rank and points to the SAPA main doubles ranking', () => {
 const aidan = { category: "Men's Open (Pro/Elite)", points: 1000, rankings: [
  { org: 'SA Grand Tour', age_group: 'Men-Main', match_type: 'Men-Doubles', rank: '1', points: '1000' },
  { org: 'SAPA ranking', ranking_id: 15809, age_group: 'Men-Main', match_type: 'Men-Doubles', rank: '6', points: '7672' },
  { org: 'SAPA ranking', ranking_id: 15809, age_group: 'Men-Over 35', match_type: 'Men-Doubles', rank: '2', points: '400' },
 ] };
 const ranking = players.sapaMainRanking(aidan);
 assert.equal(players.publicRank(ranking.rank), '#6');
 assert.equal(players.playerPoints(ranking.points), Number(7672).toLocaleString('en-ZA'));
 assert.equal(players.sapaMainRanking({ category: "Women's Open", rankings: [
  { org: 'SAPA ranking', age_group: 'Men-Main', rank: '4' },
  { org: 'SAPA ranking', age_group: 'Women-Main', match_type: 'Women-Doubles', rank: '2', points: 1200 },
 ] }).rank, '2');
 assert.equal(players.sapaMainRanking({ category: "Men's Open", rankings: aidan.rankings.slice(0, 1) }), null);
});
test('directory reads only public columns and loads beyond the Supabase row cap', async () => {
 const ranges = []; const fields = [];
 const api = load('src/lib/players.ts', { '@/lib/supabase': { supabase: { from(table) {
  assert.equal(table,'players_public');
  const q = { select(value) { fields.push(value); return q; }, order() { return q; }, async range(from,to) { ranges.push([from,to]); return {data: from === 0 ? Array.from({length:1000},(_,id)=>({id,name:'Player'})) : [{id:1000,name:'Last player'}]}; }}; return q;
 } } } });
 const rows = await api.fetchDirectory(); assert.equal(rows.length,1001); assert.equal(rows.at(-1).id,'1000'); assert.deepEqual(ranges,[[0,999],[1000,1999]]); assert.ok(fields.every(s=>!s.includes('*') && !s.includes('email') && !s.includes('contact')));
});
test('a failed directory page is surfaced instead of returning an incomplete list', async () => {
 const api = load('src/lib/players.ts', {'@/lib/supabase':{supabase:{from(){const q={select(){return q},order(){return q},range:async()=>({error:new Error('offline')})};return q;}}}});
 await assert.rejects(api.fetchDirectory(),/offline/);
});
test('player website links open the native directory or selected profile', async () => {
 const routes=[], browsers=[];
 const api=load('src/lib/site.ts',{'expo-router':{router:{push:route=>routes.push(route)}},'expo-web-browser':{openBrowserAsync:url=>browsers.push(url),WebBrowserPresentationStyle:{AUTOMATIC:0}}});
 await api.openSitePath('/players'); await api.openSitePath('/players?id=42');
 assert.equal(routes[0],'/players');assert.equal(routes[1].pathname,'/players/[id]');assert.equal(routes[1].params.id,'42');assert.equal(browsers.length,0);
 await api.openSitePath('/players',{forceBrowser:true});assert.equal(browsers.length,1);
});
test('profile loads the selected public ID and normalizes optional detail data', async () => {
 let selected;
 const api=load('src/lib/players.ts',{'@/lib/supabase':{supabase:{from(table){assert.equal(table,'players_public');const q={select(fields){assert.ok(!fields.includes('email'));assert.ok(fields.includes('court_side,playing_hand'));return q},eq(field,id){selected=[field,id];return q},maybeSingle:async()=>({data:{id:42,name:'Player',court_side:'either',playing_hand:'left',rankings:null,sponsors:'A, B',additional_images:'["https://example.com/photo.jpg","javascript:bad"]'}})};return q;}}}});
 const player=await api.fetchPublicPlayer('42'); assert.deepEqual(selected,['id','42']);assert.equal(player.id,'42');assert.equal(player.rankings.length,0);assert.equal(player.sponsors.length,2);assert.equal(player.additional_images.length,1);
 assert.equal(player.court_side,'either');assert.equal(player.playing_hand,'left');
 await assert.rejects(api.fetchPublicPlayer('invalid'),/Player not found/);
});
test('points gains retain signs and missing values are not invented', () => {
 assert.equal(players.pointsGain(234), '+234 PTS');
 assert.equal(players.pointsGain(-12), '-12 PTS');
 assert.equal(players.pointsGain(0), '0 PTS');
 assert.equal(players.pointsGain(null), '—');
});
test('Form accepts published wins and losses and rejects placeholder text', () => {
 assert.deepEqual(Array.from(players.playerForm('W / L W unknown L W L')), ['W','L','W','L','W']);
 assert.equal(players.playerForm(null).length, 0);
});
test('Instagram handles and links resolve only to Instagram profiles', () => {
 assert.equal(players.instagramUrl('@brad.elin'), 'https://www.instagram.com/brad.elin/');
 assert.equal(players.instagramUrl('https://instagram.com/brad/'), 'https://www.instagram.com/brad/');
 assert.equal(players.instagramUrl(null), null);
 assert.equal(players.instagramUrl('https://instagram.com.evil.example/brad'), null);
 assert.equal(players.instagramUrl('javascript:alert(1)'), null);
});
