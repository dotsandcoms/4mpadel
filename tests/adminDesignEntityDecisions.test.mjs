import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';
import { verifyEventAdvancedAccess } from '../src/pages/admin-preview/eventAdvancedGuard.js';

const mocked = `
const view=window.fixture.mode, actor={id:'fixture-account',email:'operator@example.invalid'};
const calls=window.fixture.calls;
const federation={id:'our-fed',name:'Our federation',slug:'our-fed',status:'published'};
const org={id:'our-org',name:'Fixture applicant',status:view.startsWith('organisation-profile')||view.startsWith('organisation-control')?'approved':'pending',contact_email:'applicant@example.invalid',created_by:7,federation_id:'our-fed'};
if(view==='organisation-rejected-feedback')Object.assign(org,{status:'rejected',rejection_notes:'Provide the signed venue agreement.'});
if(view==='organisation-profile-sponsor')org.sponsors=[
  {name:'Old partner',tier:'Official Partner',logo_url:''},
  {name:'Current partner',tier:'Official Partner',logo_url:''},
];
const sanction={id:10,event_name:'Fixture sanction',organisation_id:'our-org',federation_id:'our-fed',sanction_status:'pending',federation_sanction_status:'pending',is_visible:false};
const amendment={id:11,event_name:'Fixture amendment',city:'Old city',organisation_id:'our-org',federation_id:null,sanction_status:'approved',pending_changes_status:'pending',
 pending_changes_submitted_at:'2026-11-01T12:00:00Z',pending_changes:{payload:{city:'New city'},removed_division_ids:view.startsWith('federation-complex')?['division-5']:null},is_visible:true};
const data={albums:[{id:'album-a',title:'Fixture album',parent_album_id:null,organisation_id:null},{id:'album-other',title:'Foreign album',parent_album_id:null,organisation_id:'other-org'}],organisations:[org,{id:'other-org',name:'Foreign organisation',federation_id:'other-fed',status:'pending'}],
 federations:[federation,{id:'other-fed',name:'Foreign federation',slug:'other-fed',status:'published'}],
 calendar:[sanction,amendment,{...sanction,id:88,event_name:'Foreign event',organisation_id:'other-org',federation_id:'other-fed'}],
 federation_members:[{user_email:actor.email,federation_id:federation.id,role:view==='federation-staff'?'staff':'owner'}],
 organisation_members:view.startsWith('organisation-profile')?[{user_email:actor.email,organisation_id:org.id,role:'owner'}]:
  view.startsWith('organisation-control')?[{id:'owner-member',user_email:'owner@example.invalid',organisation_id:org.id,role:'owner',player_id:7}]:[],
 players:[{id:7,name:'Existing Owner',email:'owner@example.invalid'},{id:8,name:'Group Teammate',email:'teammate@example.invalid'}],admin_sidebar_permissions:[],tournament_divisions:[],
 org_audit_log:[{id:'audit-organisation',action:'org.approved',entity_type:'organization',name:'Reviewed organisation'},
   {id:'audit-member',action:'member.added',entity_type:'member',entity_id:'Approved member'},
   ...Array.from({length:27},(_,index)=>({id:'audit-event-'+index, action:index?'event.updated':'division.updated',entity_type:index?'event':'division',
     event_name:'Activity event '+index,created_at:'2026-11-01T12:00:00Z',actor_email:'operator@example.invalid',
     details:{changes:{city:{from:'Old audit city',to:'New audit city'}}}}))]};
window.fixture.data=data;
if(view==='organisation-rejected-feedback')Object.assign(data.organisations[1],{status:'rejected',rejection_notes:'Feedback for a different organisation.'});
export const client={
 auth:{async getUser(){return {data:{user:actor}}},async signInWithOtp(input){calls.push(['owner-invite',input]);return {data:{}}}},
 async rpc(name,args){calls.push(['rpc',name,args]);if(name==='admin_organisation_records'){
   if(args.p_action==='capability')return {data:{can_manage:view.startsWith('organisation-control')}};
   if(args.p_action==='create')data.organisations.push({id:args.p_organisation_id,name:args.p_data.name,status:'approved'});
   if(args.p_action==='add_member')data.organisation_members.push({id:'new-member',organisation_id:args.p_organisation_id,role:args.p_data.role,user_email:args.p_data.email,player_id:args.p_data.player_id});
   if(args.p_action==='delete')data.organisations=data.organisations.filter(org=>org.id!==args.p_organisation_id);
   return {data:{id:args.p_organisation_id,action:args.p_action}};
 }if(name==='admin_review_event_amendment'){
   if(view==='federation-complex')return {error:{code:'PGRST202',message:'Function unavailable'}};
   if(view==='federation-complex-denied')return {error:{code:'42501',message:'Calendar and division edit access is required for this event.'}};
   const token=(window.fixture.revision?'b':'a').repeat(64);
   if(!args.p_expected)return {data:{event_id:11,token,fields:{city:{from:'Old city',to:'New city'}},divisions:[
     {action:'update',id:'division-1',name:'Main Draw',changes:{entry_fee:{from:100,to:120}}},
     {action:'remove',id:'division-5',name:'Unused division'},
     {action:'add',id:null,name:'Mixed Open',changes:{entry_fee:{from:null,to:80}}},
   ]}};
   if(view==='federation-complex-rollback')return {error:{message:'The event update was rolled back.'}};
   if(args.p_event_id!==11 || args.p_entity_id!=='our-fed' || args.p_kind!=='federations' || args.p_expected!==token) return {error:{message:'Incorrect approved review'}};
   Object.assign(amendment,{city:'New city',pending_changes:null,pending_changes_status:null});
   return {data:{event_id:11,status:'approved'}};
 }if(name==='is_super_admin')return {data:view.startsWith('organisation')&&!view.startsWith('organisation-profile')&&!(['organisation-activity','organisation-rejected-feedback'].includes(view)&&window.fixture.revoked)};if(name==='is_organisation_admin')return {data:!window.fixture.revoked};return {data:true}},
 storage:{from(bucket){return {async upload(path,file,options){calls.push(['upload',bucket,path,file.type,options]);return {data:{path}}},getPublicUrl(path){return {data:{publicUrl:'https://fixture.invalid/'+path}}}}}},
 functions:{async invoke(name,args){calls.push(['function',name,args.body]);return {data:{messageId:'synthetic'}}}},
 from(table){
    const predicates=[],matches=[];let update,row,fields,from=0,to=Infinity;
    function execute(single=false){
      if(row){
        calls.push(['upsert',table,row]);
        if(view==='organisation-owner-failure')return {error:{message:'Synthetic denial'}};
        data[table].push(row);return {data:row};
      }
      const selected=(data[table]||[]).filter(item=>predicates.every(filter=>filter(item)));
      if(update){
        calls.push(['update',table,selected.map(item=>item.id),update]);
        for(const item of selected)Object.assign(item,update);
      }
      if(table==='org_audit_log'){
        calls.push(['audit-read',fields,from,to]);
        if(window.fixture.revokeDuringAuditRead)window.fixture.revoked=true;
        if(fields==='id,details')return {data:structuredClone(selected[0]||null)};
        return {data:structuredClone(selected.slice(from,to+1).map(({details,...record})=>record))};
      }
      if(view==='organisation-rejected-feedback'&&table==='organisations'){
        calls.push(['organisation-projection',fields]);
        if(fields==='id,rejection_notes') {
          calls.push(['feedback-read',matches]);
          return {data:structuredClone(selected[0]||null)};
        }
        return {data:structuredClone(single?selected.map(({rejection_notes,...record})=>record)[0]||null:
          selected.slice(from,to+1).map(({rejection_notes,...record})=>record))};
      }
      return {data:structuredClone(single?selected[0]||null:selected.slice(from,to+1))};
    }
    return {select(value){fields=value;return this},eq(key,val){matches.push([key,val]);predicates.push(item=>typeof item[key]==='object'&&item[key]!==null?JSON.stringify(item[key])===val:String(item[key])===String(val));return this},
      in(key,ids){predicates.push(item=>ids.includes(item[key]));return this},is(key,val){predicates.push(item=>(item[key]??null)===val);return this},ilike(){return this},
      or(){return this},not(){return this},limit(n){to=n-1;return this},order(){return this},range(start,end){from=start;to=end;return this},abortSignal(){return this},update(value){update=value;return this},upsert(value){row=value;return this},
      async maybeSingle(){return execute(true)},async single(){return execute(true)},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
    };
 }
};
`;
let browser,bundle;
before(async()=>{
    const result=await build({
      stdin:{contents:`
        import {createRoot} from 'react-dom/client';
        import Entity from './src/pages/admin-preview/OrganisationFederationWorkspace';
        import AdvancedEventDetailsDialog from './src/pages/admin-preview/AdvancedEventDetailsDialog';
        import { client } from 'synthetic-entity';
        const {mode}=window.fixture;
        const session={user:{id:'fixture-account'}};
        const root=createRoot(document.getElementById('root'));
        if(mode.startsWith('calendar-amendment')){
          const event={id:11,event_name:'Calendar amendment',is_manual:true,organisation_id:'our-org',
            federation_id:mode.endsWith('federation')?'our-fed':null,pending_changes_status:'pending',
            pending_changes:{payload:{city:'Proposed city'},divisions:mode.endsWith('field-only')?null:[{name:'New division'}]}};
          root.render(<AdvancedEventDetailsDialog event={event} client={client} session={session}
            onClose={()=>{}} load={async()=>({event,divisions:[],siblings:[]})}/>);
        }else{
          const kind=mode.startsWith('organisation')?'organisations':'federations';
          root.render(<Entity kind={kind} client={client} session={session} scopeId={mode.startsWith('organisation-profile')?'org:our-org':'all'} />);
        }
      `,resolveDir:process.cwd(),loader:'jsx',sourcefile:'entity-test.jsx'},
      write:false,bundle:true,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},
      plugins:[{name:'entity-test',setup(build){
        build.onResolve({filter:/^synthetic-entity$/},()=>({path:'synthetic',namespace:'fixture'}));
        build.onResolve({filter:/^\.\.\/\.\.\/components\/admin\/EventBuilder$/},()=>({path:'event-builder',namespace:'fixture'}));
        build.onResolve({filter:/^\.\.\/\.\.\/supabaseClient$/},()=>({path:'supabase',namespace:'fixture'}));
        build.onLoad({filter:/.*/,namespace:'fixture'},({path})=>path==='event-builder'
          ? {contents:'export default function FixtureBuilder(){return "Synthetic event builder"}'}
          : path==='supabase' ? {contents:'export const supabase = {}'} : {contents:mocked});
      }}],
    });
    bundle=result.outputFiles[0].text;
    browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close()});

async function withPage(mode,run,openProfile=true){
    const page=await browser.newPage();
    page.setDefaultTimeout(6000);
    try{
        await page.setRequestInterception(true);
        page.on('request', request => /^https?:/.test(request.url()) ? request.abort() : request.continue());
        await page.setContent('<main id="root"></main>');
        await page.evaluate(mode=>{
          window.fixture={mode,calls:[]};
          if (!crypto.randomUUID) crypto.randomUUID=()=> '10000000-0000-4000-8000-000000000001';
        },mode);
        await page.addScriptTag({content:bundle});
        if(openProfile&&!mode.startsWith('calendar-amendment'))await click(page,'View profile');
        await run(page);
    } catch(error) {
        error.message+='\nSynthetic screen: '+await page.evaluate(()=>document.body.innerText);
        throw error;
    } finally { await page.close(); }
}
const calls=page=>page.evaluate(()=>window.fixture.calls);
const text=(page,value)=>page.waitForFunction(value=>document.body.innerText.includes(value),{},value);
async function click(page,name,selector='button'){
    await page.waitForFunction((name,selector)=>[...document.querySelectorAll(selector)].some(node=>node.textContent.trim().includes(name)&&!node.disabled),{polling:50},name,selector);
    await page.evaluate((name,selector)=>[...document.querySelectorAll(selector)].find(node=>node.textContent.trim().includes(name)&&!node.disabled).click(),name,selector);
}
async function notes(page,value){
    await page.$eval('.of-decision-feedback textarea',(node,value)=>{
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(node,value);
        node.dispatchEvent(new Event('input',{bubbles:true}));
    },value);
}
async function review(page,action){
    await click(page,'Pending decisions','summary');
    await click(page,action);
    await page.waitForSelector('section[aria-label="Decision review"]');
}

test('platform approval confirms publishing and scoped owner assignment before a notification',async()=>{
    await withPage('organisation-approve',async page=>{
        await review(page,'Review application');await click(page,'Approve');
        assert.equal((await calls(page)).some(([kind])=>kind==='update'),false);
        await click(page,'Confirm approval');await text(page,'Application decision saved.');
        const mutations=(await calls(page)).filter(([kind])=>['update','upsert','function'].includes(kind));
        assert.deepEqual(mutations.map(([kind,type])=>[kind,type]),[['update','organisations'],['upsert','organisation_members'],['function','send-email']]);
        assert.deepEqual(mutations[0][2],['our-org']);
        assert.equal(mutations[1][2].role,'owner');
    });
    await withPage('organisation-owner-failure',async page=>{
        await review(page,'Review application');await click(page,'Approve');await click(page,'Confirm approval');
        await text(page,'Owner access was not confirmed');
        assert.equal((await calls(page)).some(([kind])=>kind==='function'),false);
    });
});

test('application rejection saves explicit feedback and leaves owner membership untouched',async()=>{
    await withPage('organisation-reject',async page=>{
        await review(page,'Review application');await click(page,'Reject');
        assert.equal(await page.$eval('.of-decision-actions .ap-primary',node=>node.disabled),true);
        await notes(page,'Fixture feedback <review>');await click(page,'Confirm rejection');await text(page,'Application decision saved.');
        const result=(await calls(page)).filter(([kind])=>['update','upsert','function'].includes(kind));
        assert.deepEqual(result[0],['update','organisations',['our-org'],{status:'rejected',rejection_notes:'Fixture feedback <review>'}]);
        assert.equal(result[1][2].variables.notes,'Fixture feedback &lt;review&gt;');
        assert.equal(result.some(([kind])=>kind==='upsert'),false);
    });
});

test('federation owner can review its sanctioned event and apply only documented event fields',async()=>{
    await withPage('federation-owner',async page=>{
        await review(page,'Review sanction');
        assert.equal((await page.evaluate(()=>document.body.innerText)).includes('Foreign event'),false);
        await click(page,'Approve');await click(page,'Confirm approval');await text(page,'Sanction request approved.');
        await click(page,'Review amendment');await text(page,'New city');
        await click(page,'Approve');await click(page,'Confirm approval');await text(page,'Amendment approved.');
        const updates=(await calls(page)).filter(([kind])=>kind==='update');
        assert.deepEqual(updates.map(([,table,ids])=>[table,ids]),[['calendar',[10]],['calendar',[11]]]);
        assert.equal(updates[1][3].city,'New city');
        assert.equal(updates[1][3].pending_changes,null);
    });
});

test('division amendments can be rejected with feedback while the live event and draft are retained',async()=>{
    await withPage('federation-complex',async page=>{
        await review(page,'Review amendment');await text(page,'Division changes require an atomic');
        assert.equal(await page.$eval('section[aria-label="Decision review"] button',node=>node.disabled),true);
        await click(page,'Reject');await notes(page,'Review divisions');await click(page,'Confirm rejection');await text(page,'Amendment rejected.');
        const event=await page.evaluate(()=>window.fixture.data.calendar.find(row=>row.id===11));
        assert.equal(event.city,'Old city');
        assert.equal(event.pending_changes.payload.city,'New city');
        assert.equal(event.pending_changes_notes,'Review divisions');
    });
});

test('division approval displays all operations and sends one reviewed transaction for the exact event',async()=>{
    await withPage('federation-complex-approval',async page=>{
        await review(page,'Review amendment');await text(page,'New city');
        await text(page,'Update Main Draw');await text(page,'Remove Unused division');await text(page,'Add Mixed Open');
        await text(page,'120');
        await click(page,'Approve');await click(page,'Confirm approval');await text(page,'Amendment approved.');
        const activity=await calls(page);
        const amendments=activity.filter(([kind,name])=>kind==='rpc'&&name==='admin_review_event_amendment');
        assert.deepEqual(amendments.map(entry=>entry[2]),[
          {p_kind:'federations',p_entity_id:'our-fed',p_event_id:11,p_expected:null},
          {p_kind:'federations',p_entity_id:'our-fed',p_event_id:11,p_expected:null},
          {p_kind:'federations',p_entity_id:'our-fed',p_event_id:11,p_expected:'a'.repeat(64)},
        ]);
        assert.equal(activity.filter(([kind])=>kind==='update').length,0);
        assert.equal(activity.filter(([kind,name])=>kind==='function'&&name==='send-email').length,1);
    });
});

test('a changed division token requires fresh review before any write or notification',async()=>{
    await withPage('federation-complex-stale',async page=>{
        await review(page,'Review amendment');await text(page,'Add Mixed Open');
        await page.evaluate(()=>{window.fixture.revision=1});
        await click(page,'Approve');await click(page,'Confirm approval');
        await text(page,'The reviewed amendment changed.');
        const activity=await calls(page);
        assert.equal(activity.some(([kind,name,args])=>kind==='update'||kind==='function'||(kind==='rpc'&&name==='admin_review_event_amendment'&&args.p_expected)),false);
    });
});

test('federation membership without event-edit authority cannot approve a multi-table draft',async()=>{
    await withPage('federation-complex-denied',async page=>{
        await review(page,'Review amendment');await text(page,'Calendar and division edit access is required for this event.');
        assert.equal(await page.$eval('section[aria-label="Decision review"] button',node=>node.disabled),true);
        assert.equal((await calls(page)).some(([kind,name,args])=>kind==='update'||kind==='function'||(kind==='rpc'&&name==='admin_review_event_amendment'&&args.p_expected)),false);
    });
});

test('a failed transaction leaves the draft available and skips notification',async()=>{
    await withPage('federation-complex-rollback',async page=>{
        await review(page,'Review amendment');await text(page,'Add Mixed Open');
        await click(page,'Approve');await click(page,'Confirm approval');await text(page,'The event update was rolled back.');
        const event=await page.evaluate(()=>window.fixture.data.calendar.find(row=>row.id===11));
        assert.equal(event.city,'Old city');
        assert.equal(event.pending_changes_status,'pending');
        assert.equal((await calls(page)).some(([kind])=>kind==='function'||kind==='update'),false);
    });
});

test('Calendar routes pending division changes to the appropriate light review workspace',async()=>{
    for(const [mode,path] of [['federation','/admin-preview/federations'],['organisation','/admin-preview/organisations']]){
        await withPage('calendar-amendment-'+mode,async page=>{
            await text(page,'This event has a pending division amendment.');
            assert.equal(await page.$eval('dialog a',link=>link.getAttribute('href')),path);
            assert.equal(await page.evaluate(()=>document.body.innerText.includes('Synthetic event builder')),false);
            assert.equal((await calls(page)).some(([kind])=>kind==='update'||kind==='function'),false);
        });
    }
    await withPage('calendar-amendment-field-only',async page=>{
        await text(page,'Synthetic event builder');
        assert.equal(await page.$('dialog a'),null);
    });
});

test('a multi-table draft submitted after an editor opens aborts Calendar save preflight',async()=>{
    const original={id:11,is_manual:true};
    const pending={...original,pending_changes_status:'pending',pending_changes:{payload:{city:'New city'},removed_division_ids:['fixture-division']}};
    const client={
        auth:{getUser:async()=>({data:{user:{id:'test-user',email:'fixture@example.invalid'}}})},
        from(table){
            return {select(){return this},eq(){return this},order(){return this},
                async maybeSingle(){assert.equal(table,'admin_sidebar_permissions');return {data:{role:'super_admin'}}},
                async single(){assert.equal(table,'calendar');return {data:pending}},
                async range(){assert.equal(table,'tournament_divisions');return {data:[]}},
            };
        },
    };
    await assert.rejects(verifyEventAdvancedAccess({
        client,original,divisions:[],siblings:[],expectedUserId:'test-user',scopeId:'all',
    }),/Review the pending division amendment before editing this event/);
});

test('federation staff sees only its records and receives no decision controls',async()=>{
    await withPage('federation-staff',async page=>{
        await text(page,'Current profile-edit authority');
        await page.waitForSelector('details.of-related');
        assert.equal((await page.evaluate(()=>document.body.innerText)).includes('Foreign federation'),false);
        assert.equal((await page.evaluate(()=>document.body.innerText)).includes('Review sanction'),false);
        assert.equal((await calls(page)).some(([kind])=>kind==='update'),false);
    });
});

const orgActions=async page=>(await calls(page)).filter(([kind,name,args])=>kind==='rpc'&&name==='admin_organisation_records'&&args.p_action!=='capability');
test('organisation creation reviews an existing owner before one atomic RPC',async()=>{
    await withPage('organisation-control-create',async page=>{
        await page.$eval('[aria-label="Close profile"]',button=>button.click());
        await click(page,'Create organisation');
        await fillField(page,'dialog [name=name]','Fixture Training Organisation');
        await click(page,'Generate slug');
        await fillField(page,'dialog [type=search]','Existing Owner');
        await click(page,'Select Existing Owner');
        await click(page,'Review organisation creation');
        assert.deepEqual(await orgActions(page),[]);
        await click(page,'Confirm create organisation');
        await text(page,'Organisation action confirmed.');
        const [[,,payload]]=await orgActions(page);
        assert.equal(payload.p_data.player_id,7);
        assert.equal(payload.p_data.slug,'fixture-training-organisation');
        assert.equal(payload.p_data.email,'owner@example.invalid');
        await text(page,'Owner approval email submitted.');
        const [notice] = (await calls(page)).filter(([kind]) => kind === 'function');
        assert.deepEqual(notice, ['function','send-email',{to:'owner@example.invalid',template:'org_approved',variables:{orgName:payload.p_data.name}}]);
    });
});

test('organisation team protects the last owner and scopes reviewed additions',async()=>{
    await withPage('organisation-control-team',async page=>{
        await click(page,'Manage members');
        await text(page,'owner@example.invalid');
        assert.equal(await page.$eval('dialog button.ap-secondary:disabled',node=>node.textContent.trim()),'Review role change');
        await fillField(page,'dialog [type=search]','Teammate');
        await click(page,'Select Group Teammate');
        await click(page,'Review member addition');
        assert.deepEqual(await orgActions(page),[]);
        await click(page,'Confirm add member');
        await text(page,'Organisation action confirmed.');
        const [[,,payload]]=await orgActions(page);
        assert.equal(payload.p_organisation_id,'our-org');
        assert.equal(payload.p_data.role,'admin');
        assert.equal(payload.p_data.player_id,8);
    });
});

test('organisation deletion requires the exact reviewed name and never makes browser cascade writes',async()=>{
    await withPage('organisation-control-delete',async page=>{
        await click(page,'Delete organisation');
        await fillField(page,'dialog input','Incorrect');
        await click(page,'Review organisation deletion');
        await text(page,'Type the organisation name exactly.');
        assert.deepEqual(await orgActions(page),[]);
        await fillField(page,'dialog input','Fixture applicant');
        await click(page,'Review organisation deletion');
        assert.deepEqual(await orgActions(page),[]);
        await click(page,'Confirm delete organisation');
        await text(page,'Organisation action confirmed.');
        const [[,,payload]]=await orgActions(page);
        assert.equal(payload.p_organisation_id,'our-org');
        assert.deepEqual(payload.p_expected,{name:'Fixture applicant',status:'approved'});
        assert.equal((await calls(page)).some(([kind])=>kind==='update'||kind==='upsert'),false);
    });
});

async function fillField(page,selector,value) {
    await page.$eval(selector,(element,value)=>{
        Object.getOwnPropertyDescriptor(element.constructor.prototype,'value').set.call(element,value);
        element.dispatchEvent(new Event('input',{bubbles:true}));
    },value);
}
async function stageLogo(page) {
    await click(page, 'Branding and images', 'summary');
    await page.$eval('input[type=file]', input => {
      const files = new DataTransfer();
      files.items.add(new File(['fixture'], 'review-logo.png', { type: 'image/png' }));
      input.files=files.files;
      input.dispatchEvent(new Event('change',{bubbles:true}));
    });
}

test('organisation owner reviews public profile and uploads the exact logo only after confirmation',async()=>{
    await withPage('organisation-profile-update',async page=>{
        assert.equal(await page.evaluate(()=>document.body.innerText.includes('Foreign organisation')),false);
        await fillField(page,'[name=coverage]','Cape Town');
        await fillField(page,'[name=year_established]','2024');
        await stageLogo(page);
        await click(page,'Review changes');
        await text(page,'Upload review-logo.png');
        assert.equal((await calls(page)).some(([kind])=>kind==='upload'||kind==='update'),false);
        await click(page,'Confirm profile changes');
        await text(page,'Profile changes saved.');
        const changes=(await calls(page)).filter(([kind])=>kind==='upload'||kind==='update');
        assert.equal(changes[0][1],'profile-pics');
        assert.match(changes[0][2],/^organisations\/logos\/our-org_.*\.png$/);
        assert.equal(changes[0][4].upsert,false);
        assert.deepEqual(changes[1].slice(0,3),['update','organisations',['our-org']]);
        assert.equal(changes[1][3].coverage,'Cape Town');
        assert.equal(changes[1][3].year_established,2024);
        assert.equal(Object.keys(changes[1][3]).includes('payment_account_number'),false);
    });
});

test('organisation owner revocation blocks staged upload and profile update',async()=>{
    await withPage('organisation-profile-revoke',async page=>{
        await stageLogo(page);
        await click(page,'Review changes');
        await page.evaluate(()=>{window.fixture.revoked=true;});
        await click(page,'Confirm profile changes');
        await text(page,'Organisation administration permission was not confirmed.');
        assert.equal((await calls(page)).some(([kind])=>kind==='upload'||kind==='update'),false);
    });
});

async function chooseRelationship(page,label,value) {
    await page.evaluate(label=>{
      const group=[...document.querySelectorAll('label')].find(node=>node.firstChild?.textContent===label);
      group.querySelector('button').click();
    },label);
    await click(page,value,'[role=option]');
}
test('organisation relationships unlink and link exact gallery albums and federations',async()=>{
    await withPage('organisation-relationship',async page=>{
        await click(page,'Gallery and federation relationships','summary');
        await text(page,'Unlinked album');
        assert.equal(await page.evaluate(()=>document.body.textContent.includes('Foreign album')),false);
        await chooseRelationship(page,'Unlinked album','Fixture album');
        await click(page,'Review album link');
        const linkWrites=async()=> (await calls(page)).filter(([kind])=>kind==='update');
        assert.deepEqual(await linkWrites(),[]);
        await click(page,'Confirm album link');
        await text(page,'Album linked.');
        await click(page,'Review album unlink');
        await click(page,'Confirm album unlink');
        await text(page,'Album unlinked.');
        await click(page,'Review federation unlink');
        await click(page,'Confirm federation unlink');
        await text(page,'Federation unlinked.');
        await chooseRelationship(page,'Federation','Our federation');
        await click(page,'Review federation link');
        await click(page,'Confirm federation link');
        await text(page,'Federation linked.');
        assert.deepEqual(await linkWrites(),[
         ['update','albums',['album-a'],{organisation_id:'our-org'}], ['update','albums',['album-a'],{organisation_id:null}],
         ['update','organisations',['our-org'],{federation_id:null}], ['update','organisations',['our-org'],{federation_id:'our-fed'}],
        ]);
    });
});

test('sponsor logo follows its sponsor if a prior sponsor is removed before confirmation',async()=>{
    await withPage('organisation-profile-sponsor',async page=>{
        await click(page,'Sponsors and partners','summary');
        await page.evaluate(()=>{
          const label=[...document.querySelectorAll('label')].find(node=>node.textContent.trim()==='Upload sponsor 2 logo');
          const input=label.querySelector('input');
          const transfer=new DataTransfer();
          transfer.items.add(new File(['fixture'],'sponsor.webp',{type:'image/webp'}));
          input.files=transfer.files;
          input.dispatchEvent(new Event('change',{bubbles:true}));
        });
        await click(page,'Remove sponsor');
        await click(page,'Review changes');
        await text(page,'Upload sponsor.webp');
        assert.equal((await calls(page)).some(([kind])=>kind==='upload'||kind==='update'),false);
        await click(page,'Confirm profile changes');
        await text(page,'Profile changes saved.');
        const results=(await calls(page)).filter(([kind])=>kind==='upload'||kind==='update');
        assert.match(results[0][2],/^organisations\/sponsors\/our-org_.*\.webp$/);
        assert.deepEqual(results[1][3].sponsors,[{name:'Current partner',tier:'Official Partner',logo_url:'https://fixture.invalid/'+results[0][2]}]);
    });
});

test('owner login invitation uses reviewed OTP recipient and never invokes a password or creates the organisation',async()=>{
    await withPage('organisation-control-create',async page=>{
        await page.$eval('[aria-label="Close profile"]',button=>button.click());
        await click(page,'Create organisation');
        await fillField(page,'dialog [type=search]','Existing Owner');
        await click(page,'Select Existing Owner');
        await click(page,'Review owner login invitation');
        assert.equal((await calls(page)).some(([kind])=>kind==='owner-invite'),false);
        await click(page,'Confirm send owner login invitation');
        await text(page,'Login link requested.');
        assert.deepEqual((await calls(page)).filter(([kind])=>kind==='owner-invite'),[
          ['owner-invite',{email:'owner@example.invalid',options:{emailRedirectTo:'https://4mpadel.co.za/profile?new_invite=true'}}],
        ]);
        assert.deepEqual(await orgActions(page),[]);
        assert.equal((await calls(page)).some(([kind,name])=>kind==='function'&&name==='admin-set-password'),false);
    });
});

test('organisation activity verifies the platform role, filters, pages and loads only the expanded record details', async()=>{
    await withPage('organisation-activity',async page=>{
        assert.equal((await calls(page)).some(([name])=>name==='audit-read'),false);
        await page.evaluate(()=>[...document.querySelectorAll('button')].find(button=>button.textContent==='Activity log').focus());
        await page.keyboard.press('Enter');
        await text(page,'Reviewed organisation');
        const auditReads=()=>calls(page).then(actions=>actions.filter(([name])=>name==='audit-read'));
        const first=(await auditReads())[0];
        assert.match(first[1], /details->>event_name/);
        assert.doesNotMatch(first[1], /(^|,)details(,|$)/);
        assert.deepEqual(first.slice(2),[0,25]);
        await page.select('dialog[aria-label="Organisation activity log"] select','event');
        await page.waitForFunction(()=>!document.body.innerText.includes('Reviewed organisation')&&document.body.innerText.includes('Activity event 0'));
        assert.match(await page.evaluate(()=>document.body.innerText), /Division updated/);
        assert.doesNotMatch(await page.evaluate(()=>document.body.innerText), /Approved member|Old audit city/);
        await click(page,'Older');
        await text(page,'Activity event 26');
        assert.deepEqual((await auditReads()).at(-1).slice(2),[25,50]);
        await click(page,'Newer');
        await text(page,'Activity event 0');
        await click(page,'View details');
        await text(page,'New audit city');
        const fields=await page.$$eval('#organisation-audit-audit-event-0 .of-review-pair > div',nodes=>nodes.map(node=>node.textContent));
        assert.deepEqual(fields,['BeforeOld audit city','AfterNew audit city']);
        assert.equal((await auditReads()).filter(([,fields])=>fields==='id,details').length,1);
        await click(page,'Hide details');
        assert.doesNotMatch(await page.evaluate(()=>document.body.innerText), /New audit city/);
        await page.select('dialog[aria-label="Organisation activity log"] select','organisation');
        await text(page,'Reviewed organisation');
        await page.select('dialog[aria-label="Organisation activity log"] select','member');
        await text(page,'Approved member');
        const readsBeforeRefresh=(await auditReads()).length;
        await click(page,'Refresh activity');
        await page.waitForFunction(count=>window.fixture.calls.filter(([name])=>name==='audit-read').length>count,{},readsBeforeRefresh);
        await text(page,'Approved member');
        assert.deepEqual((await auditReads()).at(-1).slice(2),[0,25]);
        await page.keyboard.press('Escape');
        await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
        assert.equal(await page.evaluate(()=>document.activeElement.textContent),'Activity log');
        await click(page,'Activity log');
        await text(page,'Reviewed organisation');
        await page.evaluate(()=>{window.fixture.revokeDuringAuditRead=true;});
        await click(page,'Refresh activity');
        await text(page,'A current module or membership permission is required.');
        assert.doesNotMatch(await page.evaluate(()=>document.body.innerText), /Reviewed organisation/);
    },false);
    await withPage('organisation-profile-audit',async page=>{
        await text(page,'Fixture applicant');
        assert.equal(await page.evaluate(()=>[...document.querySelectorAll('button')].some(button=>button.textContent==='Activity log')),false);
        assert.equal((await calls(page)).some(([name])=>name==='audit-read'),false);
    },false);
});

test('organisation application feedback loads only inside the exact rejected profile with current platform access',async()=>{
    await withPage('organisation-rejected-feedback',async page=>{
        await text(page,'Fixture applicant');
        assert.equal((await calls(page)).some(([name,fields])=>name==='organisation-projection'&&fields.includes('rejection_notes')),false);
        await click(page,'View profile');
        await text(page,'Provide the signed venue agreement.');
        const reads=(await calls(page)).filter(([name])=>name==='feedback-read');
        assert.deepEqual(reads,[['feedback-read',[['id','our-org'],['status','rejected']]]]);
        assert.doesNotMatch(await page.evaluate(()=>document.body.innerText), /Feedback for a different organisation/);
    },false);
    await withPage('organisation-rejected-feedback',async page=>{
        await text(page,'Fixture applicant');
        await page.evaluate(()=>{window.fixture.revoked=true;});
        await click(page,'View profile');
        await text(page,'A current module or membership permission is required.');
        assert.equal((await calls(page)).some(([name])=>name==='feedback-read'),false);
        assert.doesNotMatch(await page.evaluate(()=>document.body.innerText), /Provide the signed venue agreement/);
    },false);
});
