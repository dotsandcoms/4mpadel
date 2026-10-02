const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(file, env = {}) { const mod={exports:{}}; vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:mod,exports:mod.exports,require:()=>({}),...env});return mod.exports; }
const hub=load('src/lib/player-hub.ts');
const local=(id,category,rank)=>hub.localHubPlayer({id:String(id),name:`Player ${id}`,category,rank_label:String(rank),image_url:null,points:100,home_club:'Club'});
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
