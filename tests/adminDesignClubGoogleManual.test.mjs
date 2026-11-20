import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, bundle;
const fixture = `
  import { createRoot } from 'react-dom/client';
  import ClubGoogleSyncWorkspace from './src/pages/admin-preview/ClubGoogleSyncWorkspace.jsx';
  const session={user:{id:'manual-operator',email:'ops@example.invalid'}};
  const row={id:'north-match',club_id:'north',match_status:'no_match',review_status:'pending',
    clubs:{id:'north',name:'North club',city:'Cape Town'}};
  const result=data=>({data,error:null});
  window.providerCalls=[];
  window.reviewCalls=[];
  const client={
    auth:{getUser:async()=>result({user:session.user})},
    rpc:async(name,args)=>{
      if(name==='account_is_active')return result(true);
      if(name==='is_super_admin')return result(!window.revokeGoogle);
      if(name!=='review_manual_club_google_match')return {error:{message:'Unexpected RPC'}};
      window.reviewCalls.push(args);
      if(args.p_match_id!==row.id||args.p_club_id!==row.club_id)return {error:{message:'Incorrect record'}};
      const token='exact-'+args.p_candidate.kind;
      const id={club_id:row.club_id,match_id:row.id,decision:'apply'};
      if(args.p_action==='review-apply')return result({...id,token,patch:args.p_candidate.kind==='link'
        ? {google_maps_url:args.p_candidate.url} : {google_place_id:args.p_candidate.place_id,address:args.p_candidate.fields.address}});
      if(args.p_expected!==token)return {error:{message:'Reviewed proposal changed'}};
      row.review_status='applied';
      return result(id);
    },
    from(){
      let start=0;
      const query={select:()=>query,order:()=>query,abortSignal:()=>query,range(first){start=first;return query;},
        then(resolve){return Promise.resolve(result(start?[]:[row])).then(resolve);}};
      return query;
    },
  };
  createRoot(document.getElementById('root')).render(<ClubGoogleSyncWorkspace client={client}
    scopeId="all" session={session}/>);
`;
const provider = `
  export async function searchPlacesText(query) {
    window.providerCalls.push(['text',query]);
    return [{place_id:'exact-place',name:'North Places Result',formatted_address:'1 Fictional Road'}];
  }
  export async function getPlaceDetails(id) {
    window.providerCalls.push(['details',id]);
    return {place_id:window.wrongPlace?'different-place':id,name:'North Places Result',formatted_address:'1 Fictional Road',
      geometry:{location:{lat:()=>0,lng:()=>1}}, url:'https://maps.google.com/?cid=1',rating:4.2};
  }
`;

before(async () => {
  const result=await build({
    stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',
    jsx:'automatic',define:{'import.meta.env':'{}'},loader:{'.css':'empty'},plugins:[{name:'fake-places',setup(build){
      build.onResolve({filter:/\/googleMaps(?:\.js)?$/},()=>({path:'places',namespace:'fixture'}));
      build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:provider}));
    }}],
  });
  bundle=result.outputFiles[0].text;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

async function click(page,label){
  await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(button=>!button.disabled&&button.textContent.trim()===label),{},label);
  await page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>!button.disabled&&button.textContent.trim()===label).click(),label);
}
const seen=(page,label)=>page.waitForFunction(label=>document.body.innerText.includes(label),{},label);
async function open(t){
  const page=await browser.newPage();
  t.after(()=>page.close());
  await page.setRequestInterception(true);
  page.on('request',request=>/^https?:/.test(request.url())?request.abort():request.continue());
  await page.setContent('<div id="root"></div>');
  await page.addScriptTag({content:bundle});
  await click(page,'Review North club');
  await click(page,'Find Google match');
  return page;
}

test('manual Places search resolves the selected exact ID and commits only after review',async t=>{
  const page=await open(t);
  assert.deepEqual(await page.evaluate(()=>window.providerCalls),[]);
  await click(page,'Search places');
  await click(page,'Review North Places Result');
  await seen(page,'Proposed · 1 Fictional Road');
  assert.deepEqual(await page.evaluate(()=>window.providerCalls),[['text','North club padel Cape Town South Africa'],['details','exact-place']]);
  assert.deepEqual(await page.evaluate(()=>window.reviewCalls.map(call=>call.p_action)),['review-apply']);
  await click(page,'Confirm Google match');
  await seen(page,'Google match applied.');
  const calls=await page.evaluate(()=>window.reviewCalls);
  assert.deepEqual(calls.map(call=>[call.p_action,call.p_club_id,call.p_match_id,call.p_candidate.place_id,call.p_candidate.fields.lat]),
    [['review-apply','north','north-match','exact-place',0],['apply','north','north-match','exact-place',0]]);
});

test('a pasted HTTPS provider link is reviewed exactly and makes no provider request',async t=>{
  const page=await open(t);
  const field='input[type=url]';
  await page.type(field,'https://example.invalid/maps');
  await click(page,'Review pasted link');
  await seen(page,'Paste a complete HTTPS Google Maps link.');
  assert.deepEqual(await page.evaluate(()=>window.reviewCalls),[]);
  await page.$eval(field,node=>node.select());
  const link='https://maps.app.goo.gl/FictionalPath?source=fixture';
  await page.type(field,link);
  await click(page,'Review pasted link');
  await seen(page,link);
  await click(page,'Confirm Google Maps link');
  await seen(page,'Google Maps link saved.');
  assert.deepEqual(await page.evaluate(()=>window.providerCalls),[]);
  assert.deepEqual(await page.evaluate(()=>window.reviewCalls.map(call=>call.p_candidate)),[{kind:'link',url:link},{kind:'link',url:link}]);
});

test('revocation prevents provider search and a mismatched provider response cannot open a review',async t=>{
  const page=await open(t);
  await page.evaluate(()=>{window.revokeGoogle=true;});
  await click(page,'Search places');
  await seen(page,'A verified super-admin account is required');
  assert.deepEqual(await page.evaluate(()=>window.providerCalls),[]);
  await page.evaluate(()=>{window.revokeGoogle=false;window.wrongPlace=true;});
  await click(page,'Search places');
  await click(page,'Review North Places Result');
  await seen(page,'Google returned a different listing');
  assert.deepEqual(await page.evaluate(()=>window.reviewCalls),[]);
});
