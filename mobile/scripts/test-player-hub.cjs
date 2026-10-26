const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, env = {}) { const mod={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>({}),...env});return mod.exports; }
const hub=load('src/lib/player-hub.ts');
const local=(id,category,rank)=>hub.localHubPlayer({id:String(id),name:`Player ${id}`,category,rank_label:String(rank),image_url:null,points:100,home_club:'Club'});
test('ranking updates require a known nonzero rank change, regardless of points changes',()=>{
 for(const player of [{},{rankChange:null},{rankChange:0,pointsChange:0},{rankChange:NaN},{pointsChange:Infinity},{rankChange:0,pointsChange:40},{pointsChange:-20}])assert.equal(hub.hasRankingUpdate(player),false);
 for(const player of [{rankChange:3},{rankChange:-2},{rankChange:2,pointsChange:0}])assert.equal(hub.hasRankingUpdate(player),true);
});
test('local ranking updates exclude unchanged standings and apply follows and gender before the limit',()=>{
 const rows=Array.from({length:8},(_,i)=>({...local(i+1,'Men',i+1),rankChange:i===0?0:i===1?null:i}));
 rows.push({...local(99,'Women',1),rankChange:20});
 rows.push({...local(100,'Men','Unranked'),rankChange:30});
 const followed=p=>['1','2','3','4','5','6','7'].includes(p.id);
 assert.deepEqual(Array.from(hub.localRankingUpdates(rows,'men',followed),p=>p.id),['7','6','5','4']);
 assert.deepEqual(Array.from(hub.localRankingUpdates(rows,'women',null),p=>p.id),['99']);
 assert.equal(hub.localRankingUpdates(rows,'women',followed).length,0);
 assert.equal(hub.localRankingUpdates(rows.slice(0,2),null,null).length,0);
});
test('local and pro numeric IDs remain distinct in a mixed follow list',()=>{
 const a=local(1,'Men',1),b=hub.proHubPlayer({id:1,name:'Pro',category:'men',rank:1,points:5});
 assert.notEqual(a.key,b.key);assert.equal(new Map([a,b].map(p=>[p.key,p])).size,2);
});
test('top 20 respects gender and official rank instead of cross-category points',()=>{
 const rows=Array.from({length:30},(_,i)=>local(i+1,'Men',30-i)); rows.push(local(99,'Women',1));rows.push(local(100,'Men','Unranked'));
 const top=hub.topLocalPlayers(rows,'men');assert.equal(top.length,20);assert.equal(top[0].rank,1);assert.equal(top[19].rank,20);
 assert.equal(hub.topLocalPlayers(rows,'women')[0].id,'99');
});
test('gender classification does not treat women as men; search ignores accents',()=>{
 const women=local(1,"Women's Open",1);women.name='Delfina Bréa';assert.equal(women.gender,'women');
 assert.equal(hub.filterHubPlayers([women],'brea','all','women').length,1);
 assert.equal(hub.filterHubPlayers([women],'','pro','women').length,0);
});
test('search proxy authenticates, paginates beyond 50 and caches identical reads',async()=>{
 let handler,user={id:'u1'},calls=0,lastUrl;
 load('supabase/functions/player-search/index.ts',{Deno:{env:{get:k=>k},serve:fn=>handler=fn},require:()=>({createClient:()=>({auth:{getUser:async()=>({data:{user}})}})}),Response,URL,AbortSignal,Map,Date,fetch:async url=>{calls++;lastUrl=String(url);return new Response(JSON.stringify({data:[{id:1422,name:'Alonso Villavicencio',category:'men',ranking:459,points:50}],meta:{last_page:3,total:120}}));}});
 const req=body=>({method:'POST',headers:new Headers(),json:async()=>body});
 let res=await handler(req({query:'Alonso',page:2,category:'men'}));assert.equal(res.status,200);let body=await res.json();assert.equal(body.players[0].rank,459);assert.equal(body.hasMore,true);assert.match(lastUrl,/page=2/);assert.match(lastUrl,/name=Alonso/);
 res=await handler(req({query:'Alonso',page:2,category:'men'}));assert.equal(res.status,200);assert.equal(calls,1);
 user=null;assert.equal((await handler(req({query:'Alonso'}))).status,401);
 user={id:'u2'};assert.equal((await handler(req({page:-1}))).status,400);
 assert.equal((await handler(req({id:'https://evil.example'}))).status,400);
});
test('player detail accepts the provider’s direct player response',async()=>{
 let handler;
 load('supabase/functions/player-search/index.ts',{Deno:{env:{get:k=>k},serve:fn=>handler=fn},require:()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'detail-user'}}})}})}),Response,URL,AbortSignal,Map,Date,fetch:async url=>{
   assert.match(String(url),/\/api\/players\/398$/);
   return Response.json({id:398,name:'Alejandra Alonso De Villa',category:'women',ranking:14,points:4000});
 }});
 const res=await handler({method:'POST',headers:new Headers(),json:async()=>({id:398})});
 assert.equal(res.status,200);
 const body=await res.json();assert.equal(body.players[0].name,'Alejandra Alonso De Villa');assert.equal(body.hasMore,false);
});

test('missing PadelAPI player is offered from a matching official FIP profile without inventing a rank',async()=>{
 let handler, calls=[];
 load('supabase/functions/player-search/index.ts',{Deno:{env:{get:k=>k},serve:fn=>handler=fn},require:()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'official-user'}}})}})}),Response,URL,AbortSignal,Map,Date,fetch:async url=>{
   calls.push(String(url));
   if (String(url).includes('padelapi.org')) return Response.json({data:[],meta:{total:0,last_page:1}});
   return new Response('<title>Mark Stillerman Official Profile 2026 | Padel FIP</title><span class="player__number"></span><div role="tabpanel" class="tab__content activeContent" data-trim="premier-padel"><div class="tab__row tab__career"><p class="tab__title">Best Rank</p><span class="tab__value">1232</span></div></div><div role="tabpanel" class="tab__content" data-trim="fip-tour"><div class="tab__row tab__career"><p class="tab__title">Best Rank</p><span class="tab__value">2</span></div></div>',{headers:{'content-type':'text/html'}});
 }});
 const res=await handler({method:'POST',headers:new Headers(),json:async()=>({query:'Mark Stillerman'})});
 const body=await res.json();
 assert.equal(res.status,200);assert.equal(body.players.length,0);
 assert.equal(body.officialProfiles[0].url,'https://www.padelfip.com/player/mark-stillerman/');
 assert.equal(body.officialProfiles[0].name,'Mark Stillerman');
 assert.equal(body.officialProfiles[0].rank,null);
 assert.equal(body.officialProfiles[0].premierBestRank,1232);
 assert.equal(calls.length,2);
});

test('official FIP URL lookup checks the exact host and page title',async()=>{
 let handler, calls=0;
 load('supabase/functions/player-search/index.ts',{Deno:{env:{get:k=>k},serve:fn=>handler=fn},require:()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'url-user'}}})}})}),Response,URL,AbortSignal,Map,Date,fetch:async()=>{calls++;return new Response('<title>Mark Stillerman Official Profile 2026 | Padel FIP</title>',{headers:{'content-type':'text/html'}});}});
 const req=fipUrl=>({method:'POST',headers:new Headers(),json:async()=>({fipUrl})});
 assert.equal((await handler(req('https://www.padelfip.com.evil.example/player/mark-stillerman/'))).status,400);
 assert.equal(calls,0);
 const response=await handler(req('https://www.padelfip.com/player/mark-stillerman/'));
 assert.equal(response.status,200);
 assert.equal((await response.json()).officialProfile.name,'Mark Stillerman');
});

test('official current FIP rank is separate from Premier Padel career best',async()=>{
 let handler;
 load('supabase/functions/player-search/index.ts',{Deno:{env:{get:k=>k},serve:fn=>handler=fn},require:()=>({createClient:()=>({auth:{getUser:async()=>({data:{user:{id:'rank-user'}}})}})}),Response,URL,AbortSignal,Map,Date,fetch:async()=>new Response('<title>Example Player Official Profile 2026 | Padel FIP</title><span class="player__number">725</span><div role="tabpanel" class="tab__content activeContent" data-trim="premier-padel"><div class="tab__row tab__career"><p class="tab__title">Best Rank</p><span class="tab__value">1232</span></div></div>',{headers:{'content-type':'text/html'}})});
 const response=await handler({method:'POST',headers:new Headers(),json:async()=>({fipUrl:'https://www.padelfip.com/player/example-player/'})});
 const {officialProfile}=await response.json();
 assert.equal(officialProfile.rank,725);
 assert.equal(officialProfile.premierBestRank,1232);
});

test('featured local ranks use national category and stable identity, not profile age-group rank',()=>{
 const players=[{id:'1',name:'Aidan',rankedin_id:'rk1',category:'Men Over 35',rank_label:'1',points:999},{id:'2',name:'Adam',rankedin_id:'rk2',category:'Men',rank_label:'1',points:1000},{id:'3',name:'Unlinked',category:'Men',rank_label:'1'}];
 const rows=hub.rankedLocalPlayers(players,[{rankedinId:'rk1',name:'Aidan',rank:6,points:7672},{rankedinId:'rk2',name:'Adam',rank:1,points:12620}],[]);
 assert.equal(rows[0].rank,6);assert.equal(rows[0].points,7672);assert.equal(rows[2].rank,null);
 assert.equal(hub.topLocalPlayers(rows,'men')[0].id,'2');
 const duplicate=[{id:'3',name:'Same name'},{id:'4',name:'Same name'}];
 assert.ok(hub.rankedLocalPlayers(duplicate,[{name:'Same name',rank:1,points:1}],[]).every(p=>p.rank===null));
});

test('Home offers local suggestions when only Pro players are followed',()=>{
 const suggestions=[local(1,'Men',1),local(2,'Women',2)];
 const result=hub.homePlayerSelection(true,[],suggestions);
 assert.equal(result.showingFollowed,false);
 assert.deepEqual(result.players,suggestions);
});
test('Home preserves matching follows, including unranked players, and Tour discovery',()=>{
 const followed=[local(3,'Men','Unranked')], suggestions=[local(1,'Men',1)];
 const result=hub.homePlayerSelection(true,followed,suggestions);
 assert.equal(result.showingFollowed,true);assert.deepEqual(result.players,followed);
 assert.deepEqual(hub.homePlayerSelection(false,followed,suggestions).players,suggestions);
});

test('a requested FIP link adds a labelled rank to the editable 4M card without hiding the official FIP card',()=>{
 const localPlayer=local(401,'Men',2);
 const fip=hub.proHubPlayer({id:725,name:'Luan Krige',category:'men',rank:725,points:100});
 const link={local_player_id:401,fip_player_id:725,fip_player_name:'Luan Krige',fip_category:'men',fip_rank:725,status:'pending'};
 const result=hub.mergeLinkedPlayers([localPlayer],[fip],[link]);
 assert.equal(result.locals[0].key,'4m:401');
 assert.equal(hub.playerRankLabel(result.locals[0]),'SAPA #2 · FIP #725');
 assert.equal(result.locals[0].fipUnverified,true);
 assert.equal(result.pros.length,1);
 assert.equal(hub.filterHubPlayers(result.locals,'Luan','pro','men').length,1);
});

test('a verified FIP link makes the 4M profile the only card for that player',()=>{
 const localPlayer=local(401,'Men',2);
 const fip=hub.proHubPlayer({id:725,name:'Luan Krige',category:'men',rank:725,points:100});
 const result=hub.mergeLinkedPlayers([localPlayer],[fip],[{local_player_id:401,fip_player_id:725,fip_player_name:'Luan Krige',fip_category:'men',fip_rank:725,status:'verified'}]);
 assert.equal(result.pros.length,0);
 assert.equal(result.locals[0].fipUnverified,false);
});

test('official FIP URL without PadelAPI ID remains a searchable unverified 4M card',()=>{
 const linked=hub.mergeLinkedPlayers([local(401,'Men',2)],[],[{local_player_id:401,fip_player_id:null,fip_profile_url:'https://www.padelfip.com/player/mark-stillerman/',fip_player_name:'Mark Stillerman',fip_category:'men',fip_rank:null,status:'pending'}]);
 assert.equal(linked.locals[0].fipProfileUrl,'https://www.padelfip.com/player/mark-stillerman/');
 assert.equal(linked.locals[0].fipUnverified,true);
 assert.equal(hub.playerRankLabel(linked.locals[0]),'SAPA #2 · FIP rank not listed');
 assert.equal(hub.filterHubPlayers(linked.locals,'Mark','pro','men').length,1);
});

test('local ranking movements belong to the same matched national player and edition',()=>{
 const directory=[{id:'407',name:'Mark',rankedin_id:'R407',category:'Men',rank_label:'50',points:100,image_url:null}];
 const standings=[{rankedinId:'R407',name:'Mark',rank:33,points:1729,change:-4,changeKnown:true}];
 const player=hub.rankedLocalPlayers(directory,standings,[])[0];
 assert.equal(player.rank,33);assert.equal(player.points,1729);assert.equal(player.rankChange,-4);
 assert.equal(hub.rankedLocalPlayers(directory,[{...standings[0],change:0,changeKnown:false}],[])[0].rankChange,null);
 assert.equal(hub.rankedLocalPlayers(directory,[{...standings[0],rankedinId:'R999'}],[])[0].rankChange,null);
});
test('local country flags use declared nationalities and omit ambiguous or invalid values',()=>{
 assert.equal(hub.localPlayerCountryFlag(' South African '),'🇿🇦');assert.equal(hub.localPlayerCountryFlag('RSA'),'🇿🇦');assert.equal(hub.localPlayerCountryFlag('British'),'🇬🇧');
 assert.equal(hub.localPlayerCountryFlag('Argentina'),'🇦🇷');assert.equal(hub.localPlayerCountryFlag('South Africa / Portugal'),'');assert.equal(hub.localPlayerCountryFlag('1234567890'),'');
 assert.equal(hub.playerCountryFlag('SA'),'🇸🇦');
});

test('follower counts use the aggregate endpoint, including zero and numeric bigint responses', async () => {
 for (const data of [0, 1, 12000, '12000']) {
  const api = load('src/lib/player-hub.ts', { require: () => ({ supabase: { rpc: async (name, args) => {
   assert.equal(name, 'get_player_follower_count'); assert.equal(args.p_player_id, '407'); return { data, error: null };
  } } }) });
  assert.equal(await api.fetchLocalFollowerCount('407'), Number(data));
 }
});
test('follower count failures and invalid responses never become a false zero', async () => {
 for (const data of [null, undefined, '', ' ', -1, 1.2, 'not a count', {}, true, Number.MAX_SAFE_INTEGER + 1]) {
  const api = load('src/lib/player-hub.ts', { require: () => ({ supabase: { rpc: async () => ({ data, error: null }) } }) });
  await assert.rejects(api.fetchLocalFollowerCount('407'), /unavailable/);
 }
 const api = load('src/lib/player-hub.ts', { require: () => ({ supabase: { rpc: async () => ({ error: new Error('offline') }) } }) });
 await assert.rejects(api.fetchLocalFollowerCount('407'), /offline/);
 await assert.rejects(api.fetchLocalFollowerCount('invalid'), /Invalid player/);
});

function followerComponent() {
 const requests = [], values = [];
 let cursor = 0, dependencyKey, cleanup, effect;
 const modules = {
  react: {
   useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value; }]; },
   useCallback(fn, deps) { const key = JSON.stringify(deps); return { fn, key }; },
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }), Fragment: 'Fragment' },
  'react-native': { Text: 'Text', Pressable: 'Pressable' }, '@/theme/tokens': { lightBrand: {} },
  'expo-router': { useFocusEffect(callback) { if (callback.key !== dependencyKey) { dependencyKey = callback.key; effect = callback.fn; cleanup?.(); cleanup = effect(); } } },
  '@/lib/player-hub': { fetchLocalFollowerCount: id => new Promise((resolve, reject) => requests.push({ id, resolve, reject })) },
 };
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/players/player-follower-count.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
 return {
  requests,
  render(playerId = '407', refreshKey = 0, onPress) { cursor = 0; return exports.PlayerFollowerCount({ playerId, refreshKey, onPress }); },
  refocus() { cleanup?.(); cleanup = effect(); },
  flush: () => new Promise(resolve => setImmediate(resolve)),
 };
}
test('the profile displays zero, singular and plural counts and refreshes after following or returning', async () => {
 const h = followerComponent();
 assert.equal(h.render().props.accessibilityLabel, 'Loading follower count');
 h.requests[0].resolve(0); await h.flush();
 assert.equal(h.render().props.accessibilityLabel, '0 followers');
 h.render('407', 1); h.requests[1].resolve(1); await h.flush();
 assert.equal(h.render('407', 1).props.accessibilityLabel, '1 follower');
 h.refocus(); h.requests[2].resolve(2); await h.flush();
 assert.equal(h.render('407', 1).props.accessibilityLabel, '2 followers');
});
test('late requests cannot show another player’s count or replace a newer refresh', async () => {
 const h = followerComponent(); h.render('407');
 assert.equal(h.render('408').props.accessibilityLabel, 'Loading follower count');
 h.requests[1].resolve(7); await h.flush(); h.requests[0].resolve(99); await h.flush();
 assert.equal(h.render('408').props.accessibilityLabel, '7 followers');
 h.render('408', 1); h.render('408', 2);
 h.requests[3].resolve(8); await h.flush(); h.requests[2].resolve(6); await h.flush();
 assert.equal(h.render('408', 2).props.accessibilityLabel, '8 followers');
});
test('an unavailable count leaves the profile readable without claiming zero followers', async () => {
 const h = followerComponent(); h.render(); h.requests[0].reject(new Error('offline')); await h.flush();
 assert.equal(h.render().props.accessibilityLabel, 'Follower count unavailable');
});
test('the account follower count exposes an accessible button and opens the list when pressed', async () => {
 const h = followerComponent(); let opened = 0; const onPress = () => opened++;
 h.render('407', 0, onPress); h.requests[0].resolve(2); await h.flush();
 const button = h.render('407', 0, onPress);
 assert.equal(button.type, 'Pressable'); assert.equal(button.props.accessibilityRole, 'button');
 assert.equal(button.props.accessibilityLabel, '2 followers'); button.props.onPress(); assert.equal(opened, 1);
});
test('the follow control refreshes the count after successful follows and unfollows, and preserves it on failure', async () => {
 const values = []; let cursor = 0, mounted = false, changed = 0, fail = false;
 const modules = {
  react: {
   useState(initial) { const i = cursor++; if (!(i in values)) values[i] = initial; return [values[i], value => { values[i] = value; }]; },
   useRef(initial) { const i = cursor++; if (!(i in values)) values[i] = { current: initial }; return values[i]; },
   useCallback: fn => fn,
  },
  'react/jsx-runtime': { jsx: (type, props) => ({ type, props }), jsxs: (type, props) => ({ type, props }) },
  'react-native': { View: 'View', Text: 'Text', Pressable: 'Pressable', Alert: { alert() {} } },
  '@expo/vector-icons': { Ionicons: 'Ionicons' },
  'expo-router': { useRouter: () => ({}), useFocusEffect(fn) { if (!mounted) { mounted = true; fn(); } } },
  '@/lib/supabase': { supabase: { auth: {
   getSession: async () => ({ data: { session: { user: { id: 'u1' } } } }),
   onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  } } },
  '@/lib/player-hub': { fetchLocalFollows: async () => [], setLocalFollow: async () => { if (fail) throw new Error('offline'); } },
 };
 const exports = {};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/components/players/local-follow-button.tsx', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText, { exports, require: name => modules[name] });
 const render = () => { cursor = 0; return exports.LocalFollowButton({ playerId: '407', name: 'Player', onFollowChange: () => changed++ }).props.children[0]; };
 const flush = () => new Promise(resolve => setImmediate(resolve));
 render(); await flush();
 assert.equal(render().props.accessibilityState.selected, false);
 render().props.onPress(); await flush();
 assert.equal(render().props.accessibilityState.selected, true); assert.equal(changed, 1);
 render().props.onPress(); await flush();
 assert.equal(render().props.accessibilityState.selected, false); assert.equal(changed, 2);
 fail = true; render().props.onPress(); await flush();
 assert.equal(render().props.accessibilityState.selected, false); assert.equal(changed, 2);
});
