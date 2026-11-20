import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const fixture = `
  import { createRoot } from 'react-dom/client';
  import ClubDetails from './src/pages/admin-preview/ClubDetails.jsx';
  import { delegatedClubMemberApi } from './src/pages/admin-preview/delegatedClubMembers.js';
  import { clubMemberArguments } from './src/pages/admin-preview/clubMemberRpc.js';

  const options=window.fixture;
  crypto.randomUUID ??= () => '00000000-0000-4000-8000-000000000023';
  const actor={id:'fixture-actor',email:'owner_scope@example.invalid'};
  const club={id:'club-a',name:'Scoped venue',status:options.nonpublic?'unclaimed':'published'};
  const second={id:'club-b',name:'Foreign venue',status:'published'};
  const session={user:actor};
  const date='2026-11-19T10:00:00Z';
  const targetMember={id:'member-staff',club_id:club.id,player_id:20,user_email:'staff@example.invalid',role:'staff',created_at:date};
  let members=[
    {id:'member-direct',club_id:club.id,player_id:7,user_email:options.noDirect?'other@example.invalid':actor.email,role:options.role || 'owner',created_at:date},
    targetMember,
    {...targetMember,id:'member-foreign',club_id:second.id,user_email:'foreign@example.invalid'},
  ];
  const players=[{id:32,name:'Scoped player',email:'new_player@example.invalid'},{id:33,name:'Unrelated player',email:'unrelated@example.invalid'}];
  const ok=data=>({data,error:null});
  const client={
    auth:{getUser:async()=>ok({user:actor})},
    async rpc(name,args){options.calls.push({rpc:name,args});
      if(name==='account_is_active')return ok(!options.inactive);
      if(name==='is_club_owner_or_admin')return ok(args.p_club_id===club.id&&!options.revoked);
      if(name==='can_manage_club')return ok(args.p_club_id===club.id&&!options.revoked);
      return ok(false);
    },
    from(table){
      let predicates=[],keys={},projection='',one=false,start=0,end=Infinity,operation=null,patch=null;
      const builder={
        select(fields){projection=fields;return builder;},order(){return builder;},abortSignal(){return builder;},
        eq(key,value){keys[key]=value;predicates.push(row=>row[key]===value);return builder;},
        is(key,value){keys[key]=value;predicates.push(row=>(row[key]??null)===value);return builder;},
        ilike(key,pattern){keys[key]=pattern;const expected=pattern.replace(/\\\\([%_*\\\\])/g,'$1').toLowerCase();predicates.push(row=>row[key]?.toLowerCase()===expected);return builder;},
        range(min,max){start=min;end=max+1;return builder;},limit(max){end=max;return builder;},
        update(fields){operation='update';patch=fields;return builder;},insert(fields){operation='insert';patch=fields;return builder;},
        delete(){operation='delete';return builder;},maybeSingle(){one=true;return builder;},single(){one=true;return builder;},
        then(resolve,reject){
          const data=table==='clubs'?[club,second]:table==='club_members'?members:table==='players'?players.filter(row=>row.id===32):[];
          let results=data.filter(row=>predicates.every(check=>check(row)));
          options.calls.push({table,keys,projection,operation,patch});
          if(operation==='update')results.forEach(row=>Object.assign(row,patch));
          if(operation==='delete')members=members.filter(row=>!results.includes(row));
          if(operation==='insert'){results=[{id:'member-added',created_at:date,...patch}];members.push(...results);}
          return Promise.resolve(ok(structuredClone(one?results[0]||null:results.slice(start,end)))).then(resolve,reject);
        },
      };
      return builder;
    },
  };
  const scopeId='club:'+club.id;
  window.badMutation=()=>delegatedClubMemberApi.submit({
    client,scopeId,userId:actor.id,
    args:clubMemberArguments({...targetMember,club_id:second.id},'remove',null,crypto.randomUUID())
  }).catch(error=>error.message);
  window.lateOwner=()=>{targetMember.role='owner';};
  const permissions=options.linked||options.nonpublic
    ? {role:options.linked?'org_owner':'club_admin',clubDirectoryClubs:[{
      id:club.id,directory_authority:options.linked?'organisation':'direct',member_role:options.linked?undefined:(options.role||'owner')
    }]}
    : {role:'club_admin',clubs:[{id:club.id,member_role:options.role||'owner'}]};
  createRoot(document.getElementById('root')).render(<ClubDetails client={client} session={session}
    permissions={permissions} scopeId={scopeId} club={club} onClose={()=>{}}/>);
`;

let browser, bundle;
before(async () => {
  const result=await build({
    stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},
    bundle:true,write:false,format:'iife',jsx:'automatic',define:{'import.meta.env':'{}'},loader:{'.css':'empty'},
    plugins:[{name:'fixture-client',setup(build){
      build.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'client',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const supabase=null; export const isSupabaseConfigured=()=>false;'}));
    }}],
  });
  bundle=result.outputFiles[0].text;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

async function open(t, flags={}) {
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.setRequestInterception(true);
  page.on('request',request=>/^https?:/.test(request.url())?request.abort():request.continue());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags=>{window.fixture={calls:[],...flags};},flags);
  await page.addScriptTag({content:bundle});
  if (!flags.linked) await click(page,'Load club members');
  return page;
}

async function click(page,label,selector='button') {
  await page.waitForFunction((selector,label)=>[...document.querySelectorAll(selector)].some(node=>node.textContent.trim()===label&&!node.disabled),{},selector,label);
  await page.evaluate((selector,label)=>[...document.querySelectorAll(selector)].find(node=>node.textContent.trim()===label&&!node.disabled).click(),selector,label);
}
const bodyIncludes=(page,text)=>page.waitForFunction(text=>document.body.innerText.includes(text),{},text);
const writes=page=>page.evaluate(()=>window.fixture.calls.filter(call=>call.operation));
async function dropdown(page,label,option) {
  await page.evaluate(label=>[...document.querySelectorAll('label')].find(node=>node.firstChild?.textContent===label).querySelector('button').click(),label);
  await click(page,option,'[role=option]');
}
const manageFirstMember=page=>click(page,'Manage member','.clubs-management-list li:has(p) button');

test('an organisation-linked venue opens its reviewed profile editor without club membership controls', async t => {
  const page = await open(t, { linked: true });
  await click(page, 'Edit club details');
  await bodyIncludes(page, 'Edit the club profile, facilities and media');
  const calls = await page.evaluate(() => window.fixture.calls);
  assert.ok(calls.filter(call => call.rpc === 'can_manage_club').length >= 2);
  assert.ok(calls.filter(call => call.table === 'clubs').every(call => call.keys.id === 'club-a'));
  assert.ok(!calls.some(call => call.table === 'club_members'));
  assert.doesNotMatch(await page.$eval('body', node => node.innerText), /Load club members|Delete club|Merge duplicate club/);
});

test('an unclaimed venue with a direct owner still offers exact membership controls', async t => {
  const page = await open(t, { nonpublic: true });
  await bodyIncludes(page, 'Unclaimed');
  await bodyIncludes(page, 'staff@example.invalid');
});

test('direct club admin sees its own members and can review a role change without opening claims or the player directory', async t=>{
  const page=await open(t,{role:'admin'});
  await bodyIncludes(page,'staff@example.invalid');
  assert.equal(await page.evaluate(()=>document.body.textContent.includes('foreign@example.invalid')),false);
  assert.equal(await page.evaluate(()=>document.body.textContent.includes('Load linked organisations')),false);
  await page.evaluate(()=>[...document.querySelectorAll('.clubs-management-list li')].find(row=>row.textContent.includes('staff@example.invalid')).querySelector('button').click());
  await dropdown(page,'New role','admin');
  await click(page,'Review member change');
  assert.deepEqual(await writes(page),[]);
  await click(page,'Confirm member change');
  await bodyIncludes(page,'Member role updated.');
  const [write]=await writes(page);
  assert.deepEqual(write.keys,{id:'member-staff',club_id:'club-a',player_id:20,user_email:'staff@example.invalid',role:'staff',created_at:'2026-11-19T10:00:00Z'});
  assert.deepEqual(write.patch,{role:'admin'});
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(call=>['players','club_claim_requests','club_claim_invites','club_groups'].includes(call.table))),false);
  const authority=await page.evaluate(()=>window.fixture.calls.find(call=>call.rpc==='is_club_owner_or_admin'));
  assert.deepEqual(authority.args,{p_club_id:'club-a',p_email:'owner\\_scope@example.invalid'});
});

test('scoped member addition searches only the complete visible email and grants reviewed access',async t=>{
  const page=await open(t);
  await click(page,'Add member');
  await page.type('section[aria-label="Add club member"] input[type=search]','Scoped');
  await bodyIncludes(page,'Enter the full email');
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(call=>call.table==='players')),false);
  const searchEmail = value => page.$eval('section[aria-label="Add club member"] input[type=search]', (input,value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,value);
    input.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
  await searchEmail('unrelated@example.invalid');
  await page.waitForFunction(()=>window.fixture.calls.some(call=>call.table==='players'&&call.keys.email==='unrelated@example.invalid'));
  assert.equal(await page.evaluate(()=>document.body.textContent.includes('Unrelated player')),false);
  await searchEmail('new_player@example.invalid');
  await click(page,'Select player');
  await click(page,'Review new member');
  assert.deepEqual(await writes(page),[]);
  await click(page,'Confirm member addition');
  await bodyIncludes(page,'Member added.');
  assert.deepEqual((await writes(page))[0].patch,{club_id:'club-a',player_id:32,user_email:'new_player@example.invalid',role:'staff'});
  const playerQueries=await page.evaluate(()=>window.fixture.calls.filter(call=>call.table==='players'));
  assert.deepEqual(playerQueries.map(call=>call.keys),[{email:'unrelated@example.invalid'},{email:'new\\_player@example.invalid'},{id:32}]);
});

test('a direct membership is required even when the hosted role helper returns true',async t=>{
  const page=await open(t,{noDirect:true});
  await bodyIncludes(page,'Current direct club owner or admin access is required.');
  assert.equal(await page.evaluate(()=>window.fixture.calls.some(call=>call.table==='club_members'&&call.projection.includes('players!'))),false);
  assert.equal(await page.evaluate(()=>document.body.textContent.includes('staff@example.invalid')),false);
});

test('foreign requests, revoked authority and current owner rows cannot be changed',async t=>{
  const page=await open(t);
  await bodyIncludes(page,'staff@example.invalid');
  assert.match(await page.evaluate(()=>window.badMutation()),/matching club workspace/);
  assert.deepEqual(await writes(page),[]);
  await manageFirstMember(page);
  await dropdown(page,'Member action','Remove member');
  await click(page,'Review member change');
  await bodyIncludes(page,'Existing owner changes require a platform super admin.');
  assert.equal(await page.$eval('[aria-label="Member access review"] button.ap-danger-button',button=>button.disabled),true);
  await click(page,'Discard member change');
  await page.evaluate(()=>[...document.querySelectorAll('.clubs-management-list li')].find(row=>row.textContent.includes('staff@example.invalid')).querySelector('button').click());
  await dropdown(page,'Member action','Remove member');
  await click(page,'Review member change');
  await page.evaluate(()=>{window.fixture.revoked=true;});
  await click(page,'Confirm member change');
  await bodyIncludes(page,'Current direct club owner or admin access is required.');
  await bodyIncludes(page,'staff@example.invalid');
  assert.deepEqual(await writes(page),[]);
});

test('a member promoted elsewhere after review keeps its owner role and the review shows the stale result',async t=>{
  const page=await open(t);
  await bodyIncludes(page,'staff@example.invalid');
  await page.evaluate(()=>[...document.querySelectorAll('.clubs-management-list li')].find(row=>row.textContent.includes('staff@example.invalid')).querySelector('button').click());
  await dropdown(page,'Member action','Remove member');
  await click(page,'Review member change');
  await page.evaluate(()=>window.lateOwner());
  await click(page,'Confirm member change');
  await bodyIncludes(page,'The reviewed member changed');
  await bodyIncludes(page,'Close and reload members');
});

test('a delegated owner can remove the exact staff membership after confirming',async t=>{
  const page=await open(t);
  await bodyIncludes(page,'staff@example.invalid');
  await page.evaluate(()=>[...document.querySelectorAll('.clubs-management-list li')].find(row=>row.textContent.includes('staff@example.invalid')).querySelector('button').click());
  await dropdown(page,'Member action','Remove member');
  await click(page,'Review member change');
  assert.deepEqual(await writes(page),[]);
  await click(page,'Confirm member change');
  await bodyIncludes(page,'Member removed from this club.');
  const [write]=await writes(page);
  assert.equal(write.operation,'delete');
  assert.deepEqual(write.keys,{id:'member-staff',club_id:'club-a',player_id:20,user_email:'staff@example.invalid',role:'staff',created_at:'2026-11-19T10:00:00Z'});
  assert.equal(await page.evaluate(()=>document.querySelector('.clubs-management-list').textContent.includes('staff@example.invalid')),false);
});
