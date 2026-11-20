import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, bundle;
const mock = `
  import { createRoot } from 'react-dom/client';
  import ClubsWorkspace from './src/pages/admin-preview/ClubsWorkspace.jsx';
  const session = { user:{ id:'google-operator', email:'operator@example.invalid' } };
  const venue = {id:'north-club',name:'North club',status:'published',city:'Cape Town'};
  const another = {id:'south-club',name:'South club',status:'published'};
  const rows = [
    {id:'north-match',club_id:venue.id,clubs:{...venue},review_status:'pending',match_status:'matched',
      google_place_id:'stored-north-place',google_name:'North Google fixture',google_address:'1 Fictional Street'},
    {id:'south-match',club_id:another.id,clubs:{...another},review_status:'pending',match_status:'no_match'},
    {id:'foreign-match',club_id:'foreign-club',clubs:{...venue},review_status:'pending',match_status:'matched'},
  ];
  const result = data => ({data,error:null});
  window.googleReads = [];
  window.googleOperations = [];
  const client = {
    auth:{getUser:async()=>result({user:session.user})},
    rpc:async (name,args)=>{
      if (name==='account_is_active') return result(true);
      if (name==='is_super_admin') return result(!window.googleTenant && !window.googleRevoked);
      if (name!=='review_club_google_match') return {error:{message:'Unexpected RPC'}};
      window.googleOperations.push(args);
      const row=rows.find(row=>row.id===args.p_match_id && row.club_id===args.p_club_id);
      if (!row) return {error:{message:'This pending Google match is no longer available.'}};
      const proposal=args.p_action.startsWith('review-');
      const decision=args.p_action.replace('review-','');
      const token='review-'+row.id+'-'+decision;
      if (proposal) return result({club_id:row.club_id,match_id:row.id,decision,token,
        patch:decision==='apply'?{address:'1 Fictional Street',google_place_id:row.google_place_id}:{}});
      if (window.googleStale || args.p_expected!==token) return {error:{message:'The club or Google match changed. Review it again.'}};
      row.review_status=decision==='apply'?'applied':'dismissed';
      if (decision==='apply') row.clubs.google_place_id=row.google_place_id;
      return result({club_id:row.club_id,match_id:row.id,decision});
    },
    from(table) {
      let first=0,last=Infinity,id;
      const query={select:()=>query,order:()=>query,abortSignal:()=>query,
        range(a,b){first=a;last=b+1;return query;},
        eq(key,value){if (key==='id') id=value;return query;},in:()=>query,
        then(resolve,reject){
          window.googleReads.push(table);
          const source=table==='clubs'?[venue,another]:table==='club_google_matches'?rows:[];
          return Promise.resolve(result(structuredClone(source.filter(row=>!id||row.id===id).slice(first,last)))).then(resolve,reject);
        }};
      return query;
    },
  };
  createRoot(document.getElementById('root')).render(<ClubsWorkspace client={client} session={session}
    scopeId={window.googleTenant?'club:north-club':'all'}
    permissions={window.googleTenant?{role:'club_admin',clubs:[{id:venue.id,member_role:'owner'}]}:{role:'super_admin'}}/>);
`;

before(async () => {
  const result = await build({
    stdin: {contents:mock,resolveDir:process.cwd(),loader:'jsx'}, bundle:true, write:false,
    format:'iife', jsx:'automatic', define:{'import.meta.env':'{}'}, loader:{'.css':'empty'},
    plugins:[{name:'fixture-supabase',setup(build) {
      build.onResolve({filter:/\/supabaseClient(?:\.js)?$/},()=>({path:'client',namespace:'fake'}));
      build.onLoad({filter:/.*/,namespace:'fake'},()=>({contents:'export const supabase=null; export const isSupabaseConfigured=()=>false;'}));
    }}],
  });
  bundle=result.outputFiles[0].text;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async () => { await browser?.close(); });

async function open(t, flags={}) {
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.setRequestInterception(true);
  page.on('request',request=>/^https?:/.test(request.url())?request.abort():request.continue());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags=>Object.assign(window,flags),flags);
  await page.addScriptTag({content:bundle});
  await page.waitForSelector('[aria-label="View club details for North club"]');
  return page;
}
async function click(page, label) {
  await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(button=>!button.disabled&&button.textContent.trim()===label),{},label);
  await page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>!button.disabled&&button.textContent.trim()===label).click(),label);
}
const text = (page, value) => page.waitForFunction(value=>document.body.innerText.includes(value),{},value);

test('Google Sync opens the existing recorded queue and requires explicit confirmation for each match', async t => {
  const page=await open(t);
  await click(page,'Google Sync');
  await click(page,'Review North club');
  await click(page,'Review field changes');
  await text(page,'1 Fictional Street');
  assert.deepEqual(await page.evaluate(()=>window.googleOperations.map(call=>call.p_action)),['review-apply']);
  await page.evaluate(()=>{window.googleStale=true;});
  await click(page,'Confirm Google match');
  await text(page,'The club or Google match changed. Review it again.');
  await page.evaluate(()=>{window.googleStale=false;});
  await click(page,'Review field changes');
  await click(page,'Confirm Google match');
  await text(page,'Google match applied.');
  await click(page,'Review South club');
  await click(page,'Review dismissal');
  await click(page,'Confirm dismissal');
  await text(page,'Google match dismissed.');
  assert.deepEqual(await page.evaluate(()=>window.googleOperations.map(call=>[call.p_action,call.p_club_id,call.p_match_id])),
    [['review-apply','north-club','north-match'],['apply','north-club','north-match'],
      ['review-apply','north-club','north-match'],['apply','north-club','north-match'],
      ['review-dismiss','south-club','south-match'],['dismiss','south-club','south-match']]);
});

test('a venue owner and a revoked platform account cannot read the recorded Google review queue', async t => {
  const tenant=await open(t,{googleTenant:true});
  assert.doesNotMatch(await tenant.$eval('body',node=>node.innerText),/Google Sync/);
  assert.equal(await tenant.evaluate(()=>window.googleReads.includes('club_google_matches')),false);
  const revoked=await open(t,{googleRevoked:true});
  await click(revoked,'Google Sync');
  await text(revoked,'A verified super-admin account is required');
  assert.equal(await revoked.evaluate(()=>window.googleReads.includes('club_google_matches')),false);
});
