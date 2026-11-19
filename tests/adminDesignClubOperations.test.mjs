import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const mock = `
const fixture=window.fixture;
const actor={id:'fixture-account',email:'operator@example.invalid'};
export const application={id:'club-a',name:'Fixture venue',status:'pending',contact_email:'applicant@example.invalid',contacts:null,created_by:7,
 city:'Fixture city',group_id:null,updated_at:'2026-11-02T00:00:00Z',website_url:null,logo_url:null};
const claim={id:'claim-a',club_id:'club-a',status:'pending',requester_email:'claimant@example.invalid',requester_player_id:8,full_name:'Claimant',
 primary_role:'owner',created_at:'2026-11-01T00:00:00Z'};
const group={id:'group-a',name:'Fixture group',slug:'fixture-group',status:'published',share_logo:true,share_website:true,logo_url:'https://example.invalid/group.png',website_url:'https://example.invalid/'};
if(['claim','stale-claim','queue'].includes(fixture.mode))application.status='unclaimed';
const member={id:'member-a',club_id:'club-a',player_id:9,user_email:'member@example.invalid',role:'staff',created_at:'2026-11-02T00:00:00Z',players:{name:'Original member'}};
const now='2026-11-01T00:00:00Z';
const database={organisations:[{id:'org-a',name:'Fixture organiser',status:'approved'}],club_organisations:[],clubs:[application,{...application,id:'club-b',name:'Other venue',status:'published'}],club_groups:[group],
 club_claim_requests:[claim,{...claim,id:'claim-b',club_id:'club-b',full_name:'Other claimant'}],club_claim_invites:[],
 club_members:[member,{...member,id:'member-b',club_id:'club-b',players:{name:'Other member'}}],
 players:[{id:7,name:'Applicant',email:'applicant@example.invalid'},{id:8,name:'Claimant',email:'claimant@example.invalid'},{id:10,name:'New teammate',email:'teammate@example.invalid'}]};
if (fixture.mode==='group-branding') for (const club of database.clubs) club.group_id=group.id;
fixture.data=database;
const base=value=>typeof value==='object'&&value!==null?JSON.stringify(value):String(value);
export const client={
 auth:{async getUser(){return {data:{user:actor}}},async signInWithOtp(params){fixture.calls.push(['otp',params]);return {data:{}}}},
 async rpc(name){fixture.calls.push(['rpc',name]);return {data:name==='is_super_admin'?fixture.mode!=='denied'&&!fixture.revoked:true}},
 storage:{from(bucket){return {async upload(path,file,options){fixture.calls.push(['upload',bucket,path,file.type,options]);return {data:{path}}},getPublicUrl(path){return {data:{publicUrl:'https://fixture.invalid/'+path}}}}}},
 functions:{async invoke(name,args){fixture.calls.push(['function',name,args.body]);return {data:{success:true}}}},
 from(table){
    const predicates=[]; let operation, patch, start=0, end=Infinity, projection;
    function select(row){
      const result=Object.fromEntries(projection.split(',').filter(field=>field in row).map(field=>[field,row[field]]));
      if(table==='club_claim_requests'&&projection.includes('clubs('))result.clubs=database.clubs.find(club=>club.id===row.club_id);
      if(table==='club_organisations'&&projection.includes('organisations('))result.organisations=database.organisations.find(org=>org.id===row.organisation_id);
      return result;
    }
    function execute(single=false){
      let selected=database[table].filter(row=>predicates.every(filter=>filter(row)));
      if(operation){
        fixture.calls.push([operation,table,selected.map(row=>row.id),patch]);
        if(operation==='insert'){
          if(table==='club_members'&&fixture.mode==='owner-failure')return {error:{message:'Mock denial'}};
          const row={id:'synthetic-new',created_at:now,...patch};
          if(table==='club_claim_invites'){row.status='pending';row.token='synthetic-invite-token'}
          selected=[row];database[table].push(row);
        }
        if(operation==='update')selected.forEach(row=>Object.assign(row,patch));
        if(operation==='delete')database[table]=database[table].filter(row=>!selected.includes(row));
      }
      const result=selected.slice(start,end+1).map(select);
      return {data:structuredClone(single?result[0]||null:result)};
    }
    return {select(fields){projection=fields;return this},eq(key,value){predicates.push(row=>base(row[key])===String(value));return this},
     is(key,value){predicates.push(row=>(row[key]??null)===value);return this},ilike(key,value){predicates.push(row=>String(row[key]).includes(value.replaceAll('%','')));return this},
     or(){return this},not(){return this},order(){return this},range(a,b){start=a;end=b;return this},limit(n){end=n-1;return this},abortSignal(){return this},
     update(value){operation='update';patch=value;return this},insert(value){operation='insert';patch=value;return this},delete(){operation='delete';return this},
     async maybeSingle(){return execute(true)},async single(){return execute(true)},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
    };
 }
};
`;

let browser, bundle;
before(async () => {
  const result = await build({
    stdin: { contents: `
      import {createRoot} from 'react-dom/client';
      import ClubApplicationDecision from './src/pages/admin-preview/ClubApplicationDecision.jsx';
      import ClubManagement from './src/pages/admin-preview/ClubManagement.jsx';
      import ClubInvitations from './src/pages/admin-preview/ClubInvitations.jsx';
      import ClubGroupsView from './src/pages/admin-preview/ClubGroupsView.jsx';
      import ClubOrganisations from './src/pages/admin-preview/ClubOrganisations.jsx';
      import ClubClaimsQueue from './src/pages/admin-preview/ClubClaimsQueue.jsx';
      import {liveClubDecisionApi,liveClubMemberApi,liveClubMemberAddApi,liveClubInvitationApi} from './src/pages/admin-preview/liveClubOperations.js';
      import {application,client} from 'fixture-club';
      const context={client,scopeId:'all',session:{user:{id:'fixture-account'}},permissions:{role:'super_admin'}};
      const {mode}=window.fixture;
      const component=mode==='relationship'? <ClubOrganisations {...context} club={application}/> : mode==='queue'? <ClubClaimsQueue {...context}/>: mode.startsWith('group')? <ClubGroupsView {...context}/> : mode==='invitation'? <ClubInvitations {...context} clubId={application.id} creationApi={liveClubInvitationApi}/>
        : mode.startsWith('application')||mode==='owner-failure'||mode==='denied' ? <ClubApplicationDecision {...context} record={application} decisionApi={liveClubDecisionApi}/>
        : <ClubManagement {...context} clubId={application.id} decisionApi={liveClubDecisionApi} memberApi={liveClubMemberApi} addApi={liveClubMemberAddApi}/>;
      createRoot(document.getElementById('root')).render(component);
    `, resolveDir: process.cwd(), loader: 'jsx', sourcefile: 'club-test.jsx' },
    write: false, bundle: true, format:'iife', jsx: 'automatic', loader: { '.css': 'empty' }, logLevel: 'silent',
    plugins: [{ name: 'club-fixture', setup(build) {
      build.onResolve({ filter: /^fixture-club$/ }, () => ({ path: 'synthetic', namespace: 'club' }));
      build.onLoad({ filter: /.*/, namespace: 'club' }, () => ({ contents: mock }));
    } }],
  });
  bundle = result.outputFiles[0].text;
  browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox'] });
});
after(async () => { await browser?.close(); });

async function withPage(mode, run) {
  const page = await browser.newPage();
  page.setDefaultTimeout(6000);
  try {
    await page.setRequestInterception(true);
    page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
    await page.setContent('<main id="root"></main>');
    await page.evaluate(mode => {
      window.fixture={mode,calls:[]};
      let nextId = 0;
      if (!crypto.randomUUID) crypto.randomUUID = () => `fixture-operation-${++nextId}`;
    }, mode);
    await page.addScriptTag({ content: bundle });
    await run(page);
  } catch (error) {
    error.message += '\nSynthetic screen: ' + await page.evaluate(() => document.body.innerText);
    throw error;
  } finally { await page.close(); }
}

const writes = page => page.evaluate(() => window.fixture.calls.filter(([kind]) => kind !== 'rpc'));
const text = (page, value) => page.waitForFunction(value => document.body.innerText.includes(value), {}, value);
async function click(page, label, selector='button') {
  await page.waitForFunction((label,selector) => [...document.querySelectorAll(selector)].some(node =>
    node.textContent.trim() === label && !node.matches(':disabled') && node.offsetWidth > 0), {},label,selector);
  await page.evaluate((label,selector) => [...document.querySelectorAll(selector)].find(node =>
    node.textContent.trim() === label && !node.matches(':disabled') && node.offsetWidth > 0).click(), label, selector);
}
async function dropdown(page, field, value) {
  const label = await page.evaluateHandle(field => [...document.querySelectorAll('label')].find(node => node.firstChild?.textContent.trim() === field),field);
  const trigger = await label.asElement().$('button');
  await trigger.click();
  await click(page,value,'[role=option]');
  await label.dispose();
}
async function expectNoMutation(page) {
  assert.deepEqual(await writes(page), []);
}

test('application approval publishes, assigns the reviewed owner, and sends the existing template', async () => {
  await withPage('application-approve', async page => {
    await click(page,'Review decision');
    await text(page,'applicant@example.invalid');
    await expectNoMutation(page);
    await click(page,'Confirm decision');
    await text(page,'Notification submitted.');
    const actions = await writes(page);
    assert.deepEqual(actions.map(([action,table]) => [action,table]),[['update','clubs'],['insert','club_members'],['function','send-email']]);
    assert.deepEqual(actions[0][2],['club-a']);
    assert.equal(actions[1][3].role,'owner');
    assert.equal(actions[2][2].template,'club_approved');
  });
  await withPage('owner-failure', async page => {
    await click(page,'Review decision'); await click(page,'Confirm decision');
    await text(page,'Decision saved. Check club publication');
    assert.equal((await writes(page)).some(([kind])=>kind==='function'),false);
  });
});
test('claim rejection saves escaped feedback, and a changed claim cannot grant access', async () => {
  await withPage('claim', async page => {
    await click(page,'Load members and claims'); await click(page,'Claims (1)'); await click(page,'Review claim');
    await dropdown(page,'Decision','Reject claim');
    await page.locator('textarea').fill('Review <feedback>');
    await click(page,'Review decision'); await click(page,'Confirm decision'); await text(page,'Notification submitted.');
    const actions=await writes(page);
    assert.deepEqual(actions[0].slice(0,3),['update','club_claim_requests',['claim-a']]);
    assert.equal(actions[0][3].rejection_notes,'Review <feedback>');
    assert.equal(actions[1][2].variables.notes,'Review &lt;feedback&gt;');
  });
  await withPage('stale-claim', async page => {
    await click(page,'Load members and claims'); await click(page,'Claims (1)'); await click(page,'Review claim'); await click(page,'Review decision');
    await page.evaluate(()=>{window.fixture.data.club_claim_requests[0].status='rejected'});
    await click(page,'Confirm decision'); await text(page,'The decision could not be confirmed.');
    assert.deepEqual((await writes(page)).map(row=>row.slice(0,3)),[['update','club_claim_requests',[]]]);
  });
});
test('club members can be added, changed and removed without touching a different club', async () => {
  await withPage('members',async page=>{
    await click(page,'Load members and claims'); await click(page,'Add member');
    await page.locator('input[placeholder="Name or email…"]').fill('New teammate');
    await text(page,'New teammate');
    await page.evaluate(()=>[...document.querySelectorAll('.clubs-management-list li')].find(row=>row.textContent.includes('New teammate')).querySelector('button').click());
    await click(page,'Review new member'); await click(page,'Confirm member addition'); await text(page,'Member added.');
    await click(page,'Close new member');
    await click(page,'Manage member'); await dropdown(page,'New role','admin');
    await click(page,'Review member change'); await click(page,'Confirm member change'); await text(page,'Member role updated.');
    await click(page,'Close member review'); await click(page,'Manage member');
    await dropdown(page,'Member action','Remove member'); await click(page,'Review member change'); await click(page,'Confirm member change'); await text(page,'Member removed');
    const actions = await writes(page);
    assert.equal(actions[0][3].user_email,'teammate@example.invalid');
    assert.equal(actions[1][2].template,'club_member_added');
    assert.deepEqual(actions.slice(2).map(row=>row.slice(0,3)),[['update','club_members',['member-a']],['delete','club_members',['member-a']]]);
  });
});
test('claim invitation submits the correct recipient and setup link without rendering a token', async () => {
  await withPage('invitation',async page=>{
    await click(page,'Load claim invitations');
    await page.locator('form input[placeholder="Search players or enter an email…"]').fill('new-claimant@example.invalid');
    await click(page,'Review invitation'); await text(page,'No player profile was found');
    await expectNoMutation(page);
    await click(page,'Confirm and send invitation'); await text(page,'Profile-setup email submitted.');
    const actions=await writes(page);
    assert.equal(actions[0][3].club_id,'club-a');
    assert.equal(actions[1][2].to,'new-claimant@example.invalid');
    assert.equal(actions[1][2].variables.accept_url,'https://4mpadel.co.za/claim-club?token=synthetic-invite-token');
    assert.equal(actions[2][1].options.emailRedirectTo,'https://4mpadel.co.za/profile?new_invite=true&claim_token=synthetic-invite-token');
    assert.equal(await page.$eval('#root', root => root.innerHTML.includes('synthetic-invite-token')),false);
    await click(page,'Review another invitation');
    await page.locator('form input[placeholder="Search players or enter an email…"]').fill('new-claimant@example.invalid');
    await click(page,'Review invitation'); await click(page,'Confirm and send invitation'); await text(page,'Existing invitation confirmed.');
    assert.equal((await writes(page)).length,3);
  });
});
test('group membership links with branding and unlinks while retaining the venue record', async () => {
  await withPage('group',async page=>{
    await click(page,'Fixture group0 venues · Published','summary');
    await click(page,'Link venue'); await dropdown(page,'Venue','Fixture venue · Fixture city');
    await click(page,'Review group membership'); await text(page,'The group logo will be copied');
    await expectNoMutation(page);
    await click(page,'Confirm link venue'); await text(page,'Fixture venue linked to Fixture group.');
    await click(page,'Fixture group1 venues · Published','summary');
    await click(page,'Unlink venue'); await click(page,'Review group membership'); await click(page,'Confirm unlink venue');
    await text(page,'Fixture venue unlinked from Fixture group.');
    const actions=await writes(page);
    assert.deepEqual(actions.map(row=>row.slice(0,3)),[['update','clubs',['club-a']],['update','clubs',['club-a']]]);
    assert.equal(actions[0][3].logo_url,'https://example.invalid/group.png');
    assert.equal(actions[1][3].group_id,null);
    assert.equal('logo_url' in actions[1][3],false);
  });
});
test('server-denied platform identity cannot reach club mutations', async () => {
  await withPage('denied',async page=>{
    await click(page,'Review decision');
    await text(page,'verified super-admin account is required');
    await expectNoMutation(page);
  });
});

test('pending queue reviews and approves only the selected venue claim', async () => {
  await withPage('queue', async page => {
    await text(page,'2 matching claims');
    await page.locator('input[aria-label="Search pending claims"]').fill('Fixture venue');
    await text(page,'1 matching claims');
    assert.equal(await page.$eval('#root', node => node.innerText.includes('Other venue')),false);
    await click(page,'Review claim');
    await click(page,'Review decision');
    await text(page,'Reviewed club');
    await expectNoMutation(page);
    await click(page,'Confirm decision');
    await text(page,'Decision saved. Notification submitted.');
    const actions=await writes(page);
    assert.deepEqual(actions.map(row=>row.slice(0,2)),[['update','club_claim_requests'],['update','clubs'],['insert','club_members'],['function','send-email']]);
    assert.deepEqual(actions[0][2],['claim-a']);
    assert.deepEqual(actions[1][2],['club-a']);
    assert.equal(actions[1][3].status,'published');
    assert.deepEqual(actions[2][3],{club_id:'club-a',player_id:8,role:'owner',user_email:'claimant@example.invalid'});
    assert.equal(actions[3][2].template,'club_claim_approved');
    await click(page,'Close decision');
    await text(page,'No pending claims match this view.');
    await page.locator('input[aria-label="Search pending claims"]').fill('Other venue');
    await text(page,'Other venue');
  });
});

test('club organisation link and unlink change the exact association only after review', async () => {
  await withPage('relationship', async page => {
    await click(page,'Load linked organisations');
    await dropdown(page,'Approved organisation','Fixture organiser');
    await click(page,'Review link');
    await expectNoMutation(page);
    await click(page,'Confirm link');
    await text(page,'Organisation linked.');
    await click(page,'Review unlink');
    assert.deepEqual(await writes(page), [['insert','club_organisations',[],{club_id:'club-a',organisation_id:'org-a'}]]);
    await click(page,'Confirm unlink');
    await text(page,'Organisation unlinked.');
    assert.deepEqual((await writes(page)).at(-1), ['delete','club_organisations',['synthetic-new'],null]);
  });
});

test('club organisation confirmation fails closed when platform authority is revoked', async () => {
  await withPage('relationship', async page => {
    await click(page,'Load linked organisations');
    await dropdown(page,'Approved organisation','Fixture organiser');
    await click(page,'Review link');
    await page.evaluate(() => { window.fixture.revoked=true; });
    await click(page,'Confirm link');
    await text(page,'Current super-admin authority is required.');
    await expectNoMutation(page);
  });
});

async function fillGroup(page, field, value) {
  await page.$eval('dialog [name="'+field+'"]', (node, value)=>{
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(node,value);
    node.dispatchEvent(new Event('input',{bubbles:true}));
  },value);
}

test('platform creates and edits a club group with a reviewed media upload', async () => {
  await withPage('group', async page => {
    await click(page,'Create club group');
    await fillGroup(page,'name','Synthetic group');
    await click(page,'Generate group slug');
    await page.$eval('dialog input[type=file]', node=>{
      const transfer=new DataTransfer();
      transfer.items.add(new File(['fixture'],'group-logo.webp',{type:'image/webp'}));
      node.files=transfer.files;
      node.dispatchEvent(new Event('change',{bubbles:true}));
    });
    await click(page,'Review group changes');
    await expectNoMutation(page);
    await click(page,'Confirm group changes');
    await click(page,'Done');
    await text(page,'Synthetic group');
    const writesAfterCreate=await writes(page);
    assert.deepEqual(writesAfterCreate.map(([action,table])=>[action,table]), [['upload','profile-pics'],['insert','club_groups']]);
    assert.match(writesAfterCreate[0][2],/^club-groups\/.+\/logo-.+\.webp$/);
    assert.equal(writesAfterCreate[1][3].slug,'synthetic-group');
    await page.evaluate(()=>[...document.querySelectorAll('summary')].find(node=>node.textContent.includes('Synthetic group')).click());
    await page.evaluate(()=>{
      const group=[...document.querySelectorAll('details.clubs-group')].find(node=>node.querySelector('summary').textContent.includes('Synthetic group'));
      [...group.querySelectorAll('button')].find(node=>node.textContent.trim()==='Edit club group').click();
    });
    await fillGroup(page,'city','Cape Town');
    await click(page,'Review group changes');
    await click(page,'Confirm group changes');
    await text(page,'Club group saved.');
    const change=(await writes(page)).at(-1);
    assert.equal(change[0],'update');
    assert.equal(change[1],'club_groups');
    assert.deepEqual(change[2],[writesAfterCreate[1][3].id]);
    assert.equal(change[3].city,'Cape Town');
  });
});

test('reviewed bulk group branding reports a partial result and preserves a changed venue', async () => {
  await withPage('group-branding', async page => {
    await page.waitForSelector('.clubs-group summary');
    await page.click('.clubs-group summary');
    await click(page,'Review shared branding');
    await text(page,'Fixture venue');
    await text(page,'Other venue');
    await page.evaluate(()=>{window.fixture.data.clubs[1].updated_at='2030-01-01T11:00:00Z';});
    await click(page,'Confirm shared branding');
    await text(page,'Only 1 venue updates were confirmed.');
    const clubs=await page.evaluate(()=>window.fixture.data.clubs);
    assert.equal(clubs[0].logo_url,'https://example.invalid/group.png');
    assert.equal(clubs[1].logo_url,null);
  });
});
