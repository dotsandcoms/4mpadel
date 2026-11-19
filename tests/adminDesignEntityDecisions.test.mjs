import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

const mocked = `
const view=window.fixture.mode, actor={id:'fixture-account',email:'operator@example.invalid'};
const calls=window.fixture.calls;
const federation={id:'our-fed',name:'Our federation',slug:'our-fed',status:'published'};
const org={id:'our-org',name:'Fixture applicant',status:'pending',contact_email:'applicant@example.invalid',created_by:7,federation_id:'our-fed'};
const sanction={id:10,event_name:'Fixture sanction',organisation_id:'our-org',federation_id:'our-fed',sanction_status:'pending',federation_sanction_status:'pending',is_visible:false};
const amendment={id:11,event_name:'Fixture amendment',city:'Old city',organisation_id:'our-org',federation_id:null,sanction_status:'approved',pending_changes_status:'pending',
 pending_changes_submitted_at:'2026-11-01T12:00:00Z',pending_changes:{payload:{city:'New city'},removed_division_ids:view==='federation-complex'?['division-5']:[]},is_visible:true};
const data={organisations:[org,{id:'other-org',name:'Foreign organisation',federation_id:'other-fed',status:'pending'}],
 federations:[federation,{id:'other-fed',name:'Foreign federation',slug:'other-fed',status:'published'}],
 calendar:[sanction,amendment,{...sanction,id:88,event_name:'Foreign event',organisation_id:'other-org',federation_id:'other-fed'}],
 federation_members:[{user_email:actor.email,federation_id:federation.id,role:view==='federation-staff'?'staff':'owner'}],
 organisation_members:[],players:[],admin_sidebar_permissions:[],tournament_divisions:[]};
window.fixture.data=data;
export const client={
 auth:{async getUser(){return {data:{user:actor}}}},
 async rpc(name){calls.push(['rpc',name]);if(name==='is_super_admin')return {data:view.startsWith('organisation')};return {data:true}},
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
      order(){return this},range(start,end){from=start;to=end;return this},abortSignal(){return this},update(value){update=value;return this},upsert(value){row=value;return this},
      async maybeSingle(){return execute(true)},then(resolve,reject){return Promise.resolve(execute()).then(resolve,reject)}
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
        createRoot(document.getElementById('root')).render(<Entity kind={kind} client={client} session={{user:{id:'fixture-account'}}} />);
      `,resolveDir:process.cwd(),loader:'jsx',sourcefile:'entity-test.jsx'},
      write:false,bundle:true,format:'iife',jsx:'automatic',loader:{'.css':'empty'},
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
        await page.setContent('<main id="root"></main>');
        await page.evaluate(mode=>{window.fixture={mode,calls:[]};},mode);
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
