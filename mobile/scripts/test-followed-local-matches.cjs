const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), ts = require('typescript');
function load(fetchPlayerMatches) {
 const module={exports:{}};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/followed-local-matches.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module,exports:module.exports,require:()=>({fetchPlayerMatches,parseMatchDate:s=>new Date(s)})});
 return module.exports;
}
const player=id=>({id:String(id),key:`4m:${id}`,source:'4m',rankedinId:`rk${id}`});
const match=(date='2030-10-02T10:00:00Z',reverse=false)=>({Info:{EventName:'Open',Date:date,Court:'1',Challenger:{Name:reverse?'C':'A'},Challenger1:{Name:reverse?'D':'B'},Challenged:{Name:reverse?'A':'C'},Challenged1:{Name:reverse?'B':'D'}}});
test('shared fixture appears once with both followed players, sorted by start',()=>{
 const result=load().mergeFollowedFixtures([{player:player(1),matches:[match(),match('2030-10-01T10:00:00Z')]},{player:player(2),matches:[match(undefined,true)]}]);
 assert.equal(result.length,2);assert.equal(result[1].players.length,2);assert.equal(result[0].match.Info.Date,'2030-10-01T10:00:00Z');
});
test('loads stable RankedIn IDs, bounds concurrency, retains successes and reports unavailable links',async()=>{
 let active=0,max=0;const calls=[];
 const api=load(async(id,options)=>{calls.push(id);assert.equal(options.requireUpcoming,true);active++;max=Math.max(max,active);await new Promise(resolve=>setTimeout(resolve,2));active--;if(id==='rk2')throw Error('offline');return {upcoming:[match()]};});
 const result=await api.fetchFollowedLocalFixtures([...Array.from({length:5},(_,i)=>player(i+1)),{...player(6),rankedinId:undefined}]);
 assert.equal(calls.length,5);assert.ok(max<=3);assert.equal(result.failed,1);assert.equal(result.unlinked,1);assert.equal(result.fixtures.length,1);assert.equal(result.fixtures[0].players.length,4);
});

const presentationModule = {exports:{}};
vm.runInNewContext(ts.transpileModule(fs.readFileSync('src/lib/local-match-presentation.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:presentationModule,exports:presentationModule.exports,URL});
const participants = presentationModule.exports.localMatchParticipants;
test('portraits and country data resolve from the whole approved directory, including opponents',()=>{
 const directory = ['A','B','C','D'].map((name,i)=>({...player(i+1),name,photo:`https://example.com/${i+1}.jpg`,nationality:i===2?'GB':'South African'}));
 const teams=participants({match:match(),players:[directory[1]]},directory);
 assert.equal(teams[0][0].photo,'https://example.com/1.jpg');assert.equal(teams[0][1].followed,true);
 assert.equal(teams[1][0].nationality,'GB');assert.equal(teams[1][1].profileId,'4');assert.equal(teams[1][1].followed,false);
});
test('duplicate approved names never assign an arbitrary face, nationality or profile',()=>{
 const a={...player(1),name:'A',photo:'https://example.com/a.jpg',nationality:'ZA'};
 const teams=participants({match:match(),players:[a]},[a,{...a,id:'5',key:'4m:5'}]);
 assert.equal(teams[0][0].photo,null);assert.equal(teams[0][0].nationality,null);assert.equal(teams[0][0].profileId,null);
 assert.equal(teams[0][0].followed,false);
});
test('unknown players retain their names and unsafe image URLs are omitted',()=>{
 const teams=participants({match:match(),players:[]},[{...player(1),name:'A',photo:'javascript:alert(1)',nationality:'ZA'}]);
 assert.equal(teams[0][0].photo,null);assert.equal(teams[1][0].name,'C');assert.equal(teams[1][0].profileId,null);
});
test('directory duplicates of a followed ID still produce one correctly followed player',()=>{
 const a={...player(1),name:'A',photo:'https://example.com/a.jpg',nationality:'ZA'};
 assert.equal(participants({match:match(),players:[a]},[a])[0][0].followed,true);
 const accented={...a,name:'Á'};
 assert.equal(participants({match:match(),players:[]},[accented])[0][0].profileId,'1');
});
test('published RankedIn identity disambiguates duplicate names and supplies country flags',()=>{
 const a={...player(1),name:'A',photo:'https://example.com/a.jpg',nationality:null};
 const fixture=match();fixture.Info.Challenger={Name:'A',RankedinId:'rk1',CountryShort:'za'};
 const person=participants({match:fixture,players:[a]},[a,{...a,id:'5',key:'4m:5',rankedinId:'rk5'}])[0][0];
 assert.equal(person.profileId,'1');assert.equal(person.photo,'https://example.com/a.jpg');assert.equal(person.nationality,'ZA');
});
test('a provider ID that does not match never borrows a namesake’s photo',()=>{
 const fixture=match();fixture.Info.Challenger={Name:'A',RankedinId:'other-id',CountryShort:'gb'};
 const person=participants({match:fixture,players:[]},[{...player(1),name:'A',photo:'https://example.com/a.jpg',nationality:'ZA'}])[0][0];
 assert.equal(person.profileId,null);assert.equal(person.photo,null);assert.equal(person.nationality,'GB');
});
