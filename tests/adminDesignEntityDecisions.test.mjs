import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const mocked = `
const view=window.fixture.mode, actor={id:'fixture-account',email:'operator@example.invalid'};
const calls=window.fixture.calls;
const federation={id:'our-fed',name:'Our federation',slug:'our-fed',status:'published'};
const org={id:'our-org',name:'Fixture applicant',status:view.startsWith('organisation-profile')||view.startsWith('organisation-control')?'approved':'pending',contact_email:'applicant@example.invalid',created_by:7,federation_id:'our-fed'};
if(view==='organisation-profile-sponsor')org.sponsors=[
  {name:'Old partner',tier:'Official Partner',logo_url:''},
  {name:'Current partner',tier:'Official Partner',logo_url:''},
];
const sanction={id:10,event_name:'Fixture sanction',organisation_id:'our-org',federation_id:'our-fed',sanction_status:'pending',federation_sanction_status:'pending',is_visible:false};
const amendment={id:11,event_name:'Fixture amendment',city:'Old city',organisation_id:'our-org',federation_id:null,sanction_status:'approved',pending_changes_status:'pending',
 pending_changes_submitted_at:'2026-11-01T12:00:00Z',pending_changes:{payload:{city:'New city'},removed_division_ids:view==='federation-complex'?['division-5']:[]},is_visible:true};
const data={albums:[{id:'album-a',title:'Fixture album',parent_album_id:null,organisation_id:null},{id:'album-other',title:'Foreign album',parent_album_id:null,organisation_id:'other-org'}],organisations:[org,{id:'other-org',name:'Foreign organisation',federation_id:'other-fed',status:'pending'}],
 federations:[federation,{id:'other-fed',name:'Foreign federation',slug:'other-fed',status:'published'}],
 calendar:[sanction,amendment,{...sanction,id:88,event_name:'Foreign event',organisation_id:'other-org',federation_id:'other-fed'}],
 federation_members:[{user_email:actor.email,federation_id:federation.id,role:view==='federation-staff'?'staff':'owner'}],
 organisation_members:view.startsWith('organisation-profile')?[{user_email:actor.email,organisation_id:org.id,role:'owner'}]:
  view.startsWith('organisation-control')?[{id:'owner-member',user_email:'owner@example.invalid',organisation_id:org.id,role:'owner',player_id:7}]:[],
 players:[{id:7,name:'Existing Owner',email:'owner@example.invalid'},{id:8,name:'Group Teammate',email:'teammate@example.invalid'}],admin_sidebar_permissions:[],tournament_divisions:[]};
window.fixture.data=data;
export const client={
 auth:{async getUser(){return {data:{user:actor}}},async signInWithOtp(input){calls.push(['owner-invite',input]);return {data:{}}}},
 async rpc(name,args){calls.push(['rpc',name,args]);if(name==='admin_organisation_records'){
   if(args.p_action==='capability')return {data:{can_manage:view.startsWith('organisation-control')}};
   if(args.p_action==='create')data.organisations.push({id:args.p_organisation_id,name:args.p_data.name,status:'approved'});
   if(args.p_action==='add_member')data.organisation_members.push({id:'new-member',organisation_id:args.p_organisation_id,role:args.p_data.role,user_email:args.p_data.email,player_id:args.p_data.player_id});
   if(args.p_action==='delete')data.organisations=data.organisations.filter(org=>org.id!==args.p_organisation_id);
   return {data:{id:args.p_organisation_id,action:args.p_action}};
 }if(name==='is_super_admin')return {data:view.startsWith('organisation')&&!view.startsWith('organisation-profile')};if(name==='is_organisation_admin')return {data:!window.fixture.revoked};return {data:true}},
 storage:{from(bucket){return {async upload(path,file,options){calls.push(['upload',bucket,path,file.type,options]);return {data:{path}}},getPublicUrl(path){return {data:{publicUrl:'https://fixture.invalid/'+path}}}}}},
 functions:{async invoke(name,args){calls.push(['function',name,args.body]);return {data:{messageId:'synthetic'}}}},
 from(table){
    const predicates=[];let update,row,from=0,to=Infinity;
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
      return {data:structuredClone(single?selected[0]||null:selected.slice(from,to+1))};
    }
    return {select(){return this},eq(key,val){predicates.push(item=>typeof item[key]==='object'&&item[key]!==null?JSON.stringify(item[key])===val:String(item[key])===String(val));return this},
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
        import { client } from 'synthetic-entity';
        const kind=window.fixture.mode.startsWith('organisation')?'organisations':'federations';
        createRoot(document.getElementById('root')).render(<Entity kind={kind} client={client} session={{user:{id:'fixture-account'}}} scopeId={window.fixture.mode.startsWith('organisation-profile')?'org:our-org':'all'} />);
      `,resolveDir:process.cwd(),loader:'jsx',sourcefile:'entity-test.jsx'},
      write:false,bundle:true,format:'iife',jsx:'automatic',loader:{'.css':'empty'},define:{'import.meta.env':'{}'},
      plugins:[{name:'entity-test',setup(build){
        build.onResolve({filter:/^synthetic-entity$/},()=>({path:'synthetic',namespace:'fixture'}));
        build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:mocked}));
      }}],
    });
    bundle=result.outputFiles[0].text;
    browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close()});

async function withPage(mode,run){
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
        await click(page,'View profile');
        await run(page);
    } catch(error) {
        error.message+='\nSynthetic screen: '+await page.evaluate(()=>document.body.innerText);
        throw error;
    } finally { await page.close(); }
}
const calls=page=>page.evaluate(()=>window.fixture.calls);
const text=(page,value)=>page.waitForFunction(value=>document.body.innerText.includes(value),{},value);
async function click(page,name,selector='button'){
    await page.waitForFunction((name,selector)=>[...document.querySelectorAll(selector)].some(node=>node.textContent.trim().includes(name)&&!node.disabled),{},name,selector);
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
