const test=require('node:test'), assert=require('node:assert/strict'), fs=require('node:fs'), vm=require('node:vm'), ts=require('typescript');
function load(file, deps={}){const m={exports:{}};vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:m,exports:m.exports,require:id=>deps[id]||{},URL,Date,Intl});return m.exports;}
const parser=load('src/lib/tournament-draw.ts');
const event={id:521,is_visible:true,registration_access:'public',sanction_status:'approved',is_manual:true,rankedin_id:'75763'};
const choice=(id,source='rankedin')=>({id,classId:id,name:`Division ${id}`,stage:0,strength:0,source,key:`${source}:${id}`});
const catalog=choices=>({eventId:event.id,choices,warning:null});
const match=(id,patch={})=>({id,round:1,order:1,one:{players:[{name:'A'}],placeholder:null},two:{players:[{name:'B'}],placeholder:null},start:null,court:null,status:'Final score',completed:true,scores:[[6,4],[6,3]],summary:false,winner:1,...patch});
const sections=matches=>[{id:'draw',name:'Main draw',rounds:[{id:'final',name:'Final',matches}]}];
function setup({choices={},draw=async()=>({sections:[],stale:false}),rejectSources=[]}={}){const calls=[];const model=load('src/lib/event-match-updates.ts',{'./event-draws':{rankedinEventId:e=>e.rankedin_id||null},'./tournament-draw-data':{fetchTournamentDrawChoices:async(e,source)=>{calls.push(['choices',e.id,source]);if(rejectSources.includes(source))throw Error('offline');return choices[source]||[];},fetchTournamentDraw:async(e,source,c,people)=>{calls.push(['draw',e.id,source,c.id]);return draw(e,source,c,people);}}});return {model,calls};}
test('a hybrid event discovers only published choices for this event and includes both sources in the first batch',async()=>{
 const s=setup({choices:{native:[choice('n1','native'),choice('n2','native')],rankedin:[choice('r1'),choice('r2')]}});
 const c=await s.model.fetchMatchUpdateCatalog(event);assert.equal(c.eventId,521);assert.deepEqual(Array.from(c.choices,x=>x.key),['native:n1','rankedin:r1','native:n2','rankedin:r2']);
 assert.deepEqual(s.calls,[['choices',521,'native'],['choices',521,'rankedin']]);
});
test('an event without a RankedIn identity never makes a RankedIn request',async()=>{const s=setup();await s.model.fetchMatchUpdateCatalog({...event,rankedin_id:null});assert.equal(s.calls.length,1);assert.equal(s.calls[0][2],'native');});
test('hidden, code-protected, unapproved and unknown visibility events are rejected before any reader runs',async()=>{
 const s=setup();for(const patch of [{id:-1},{is_visible:false},{is_visible:undefined},{registration_access:'code'},{registration_access:'private'},{sanction_status:'pending'}])await assert.rejects(s.model.fetchMatchUpdateCatalog({...event,...patch}),/unavailable/);assert.equal(s.calls.length,0);
});
test('a catalog from another event cannot be applied to this event',async()=>{const s=setup();await assert.rejects(s.model.fetchMatchUpdateBatch(event,[],{...catalog([choice('r1')]),eventId:999}),/different event/);assert.equal(s.calls.length,0);});
test('one failing source is reported without discarding another source; both failing is an error',async()=>{
 const s=setup({choices:{rankedin:[choice('r1')]},rejectSources:['native']});const c=await s.model.fetchMatchUpdateCatalog(event);assert.equal(c.choices.length,1);assert.match(c.warning,/4M/);
 await assert.rejects(setup({rejectSources:['native','rankedin']}).model.fetchMatchUpdateCatalog(event),/could not load/);
});
test('batches issue at most two draw requests and advance without losing later choices',async()=>{
 let active=0,max=0;const s=setup({draw:async(e,source,c)=>{active++;max=Math.max(max,active);await Promise.resolve();active--;return {sections:sections([match(c.id)]),stale:false};}});
 const c=catalog([choice('a'),choice('b'),choice('c')]);const first=await s.model.fetchMatchUpdateBatch(event,[],c);assert.equal(first.next,2);assert.equal(first.items.length,2);
 const second=await s.model.fetchMatchUpdateBatch(event,[],c,first.next);assert.equal(second.next,3);assert.equal(second.items[0].match.id,'c');assert.ok(max<=2);
 for(const offset of [-1,1.5,4])await assert.rejects(s.model.fetchMatchUpdateBatch(event,[],c,offset),/Invalid/);
});
test('normalization deduplicates mirrored cells and hides cancelled matches and unresolved future slots',()=>{
 const s=setup();const input=[match('a'),match('a'),match('cancel',{status:'Cancelled'}),match('future',{completed:false,one:{players:[]},two:{players:[]}}),match('one-sided',{completed:false,two:{players:[]}})];
 const updates=s.model.matchUpdatesFromDraw(521,choice('c'),sections(input));assert.equal(updates.length,1);assert.equal(updates[0].match.id,'a');assert.equal(updates[0].match.start,null,'unknown completion time is not fabricated');
});
test('live, scheduled and completed native fixtures remain distinct and score orientation is preserved',()=>{
 const s=setup(),c=choice('n1','native');const fixture={...match('live'),completed:false,status:'Live',scores:[[4,6],[3,2]],winner:null};
 const items=s.model.matchUpdatesFromDraw(521,c,sections([fixture,match('scheduled',{completed:false,status:'Upcoming match',start:'2026-11-10T10:00:00Z'}),match('completed')]));
 const sorted=s.model.sortMatchUpdates(items);assert.deepEqual(Array.from(sorted,x=>x.match.id),['live','scheduled','completed']);assert.equal(sorted[0].choice.source,'native');assert.deepEqual(Array.from(sorted[0].match.scores,set=>Array.from(set)),[[4,6],[3,2]]);
});
test('actual published RankedIn fixtures with false cell flags still produce completed match updates',()=>{
 const s=setup(), fixture=require('./fixtures/tournament-draw-adidas.json');const updates=s.model.matchUpdatesFromDraw(521,choice('178811'),parser.rankedinDrawSections(fixture.knockout));
 const row=updates.find(x=>x.match.id==='6983376');assert.ok(row);assert.equal(row.match.winner,2);assert.deepEqual(Array.from(row.match.scores,set=>Array.from(set)),[[4,6],[3,6]]);
});
test('partial draw failure and stale snapshots are visible; complete failures are not shown as an empty feed',async()=>{
 const s=setup({draw:async(e,source,c)=>{if(c.id==='fail')throw Error('offline');return {sections:sections([match('m')]),stale:true};}});
 const partial=await s.model.fetchMatchUpdateBatch(event,[],catalog([choice('ok'),choice('fail')]));assert.equal(partial.items.length,1);assert.equal(partial.stale,true);assert.ok(partial.warning);
 await assert.rejects(s.model.fetchMatchUpdateBatch(event,[],catalog([choice('fail')])),/could not load/);
});
test('same numeric IDs from different event/source identities cannot collide',()=>{
 const s=setup();const a=s.model.matchUpdatesFromDraw(521,choice('c'),sections([match('1')])),b=s.model.matchUpdatesFromDraw(522,choice('c'),sections([match('1')])),n=s.model.matchUpdatesFromDraw(521,choice('n','native'),sections([match('1')]));
 assert.equal(s.model.sortMatchUpdates([...a,...b,...n]).length,3);
});
