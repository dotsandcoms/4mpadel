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
 const api=load('src/lib/players.ts',{'@/lib/supabase':{supabase:{from(table){assert.equal(table,'players_public');const q={select(fields){assert.ok(!fields.includes('email'));return q},eq(field,id){selected=[field,id];return q},maybeSingle:async()=>({data:{id:42,name:'Player',rankings:null,sponsors:'A, B',additional_images:'["https://example.com/photo.jpg","javascript:bad"]'}})};return q;}}}});
 const player=await api.fetchPublicPlayer('42'); assert.deepEqual(selected,['id','42']);assert.equal(player.id,'42');assert.equal(player.rankings.length,0);assert.equal(player.sponsors.length,2);assert.equal(player.additional_images.length,1);
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
