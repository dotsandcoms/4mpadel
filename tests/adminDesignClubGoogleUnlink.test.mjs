import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { build } from 'esbuild';
import puppeteer from 'puppeteer';

let browser, bundle;
const fixture = `
  import { createRoot } from 'react-dom/client';
  import ClubGoogleUnlinkReview from './src/pages/admin-preview/ClubGoogleUnlinkReview.jsx';
  const actor={id:'fixture-actor',email:'ops@example.invalid'};
  const source={id:'source',name:'Requested Club',slug:'requested-club'};
  const holder={id:'holder',name:'Actual Holder',slug:'actual-holder',match_id:'holder-match'};
  const decision=window.fixtureDelist?'delist':'conflict';
  const row={id:'source-match',club_id:source.id,clubs:source,google_place_id:'stored-place'};
  const result=data=>({data,error:null});
  window.unlinkCalls=[];
  window.unlinkReceipts=[];
  window.openedProfiles=[];
  const client={
    auth:{getUser:async()=>result({user:actor})},
    rpc:async(name,args)=>{
      if(name==='account_is_active')return result(!window.fixtureInactive);
      if(name==='is_super_admin')return result(!window.fixtureTenant&&!window.fixtureRevoked);
      if(name!=='review_club_google_unlink')return {error:{message:'Unexpected RPC'}};
      window.unlinkCalls.push(args);
      const identity={club_id:source.id,match_id:row.id,decision,source,
        place_id:decision==='conflict'?(args.p_place_id??row.google_place_id):null};
      const target=decision==='conflict'?holder:source;
      if(args.p_action.startsWith('review-')) {
        if(window.fixtureFree)return result({...identity,status:'available'});
        return result({...identity,target,status:'review',token:'fixture-token',patch:{google_place_id:null,opening_hours:{}},
          before:{google_place_id:'stored-place',opening_hours:{mon:{open:'09:00'}}},preserved:['contact_phone']});
      }
      if(window.fixtureStale)return {error:{message:'The club or Google listing changed. Review it again.'}};
      if(args.p_target_club_id!==target.id||args.p_expected!=='fixture-token')return {error:{message:'Bad target'}};
      return result({...identity,target,status:'unlinked'});
    },
  };
  createRoot(document.getElementById('root')).render(<ClubGoogleUnlinkReview client={client} scopeId="all" userId={actor.id}
    row={row} decision={decision} placeId={window.fixtureManualPlace}
    onClose={()=>window.closed=true} onUnlinked={result=>window.unlinkReceipts.push(result)}
    onOpenClub={(club,options)=>window.openedProfiles.push({club,options})}/>);
`;

before(async () => {
  const result=await build({
    stdin:{contents:fixture,resolveDir:process.cwd(),loader:'jsx'},bundle:true,write:false,format:'iife',jsx:'automatic',
    define:{'import.meta.env':'{}'},loader:{'.css':'empty'},
  });
  bundle=result.outputFiles[0].text;
  browser=await puppeteer.launch({headless:true,args:['--no-sandbox']});
});
after(async()=>{await browser?.close();});

async function open(t,flags={}){
  const page=await browser.newPage();
  t.after(()=>page.close());
  page.setDefaultTimeout(6000);
  await page.setRequestInterception(true);
  page.on('request',request=>/^https?:/.test(request.url())?request.abort():request.continue());
  await page.setContent('<div id="root"></div>');
  await page.evaluate(flags=>Object.assign(window,flags),flags);
  await page.addScriptTag({content:bundle});
  return page;
}
const seen=(page,label)=>page.waitForFunction(label=>document.body.innerText.includes(label),{},label);
async function click(page,label){
  await page.waitForFunction(label=>[...document.querySelectorAll('button')].some(button=>!button.disabled&&button.textContent.trim()===label),{},label);
  await page.evaluate(label=>[...document.querySelectorAll('button')].find(button=>!button.disabled&&button.textContent.trim()===label).click(),label);
}

test('conflict displays the exact holder and preserves candidate identity through review', async t=>{
  const page=await open(t,{fixtureManualPlace:'manual-fixture-place'});
  await seen(page,'Actual Holder currently holds the listing proposed for Requested Club.');
  await seen(page,'Kept on the club profile · Phone');
  assert.deepEqual(await page.evaluate(()=>window.unlinkCalls.map(call=>call.p_action)),['review-conflict']);
  await click(page,'Review merging Requested Club into Actual Holder');
  assert.deepEqual(await page.evaluate(()=>window.openedProfiles.map(link=>[link.club.id,link.options.mergeTarget.id])),[['source','holder']]);
  await click(page,'Unlink listing from Actual Holder');
  await seen(page,'Google listing unlinked.');
  assert.deepEqual(await page.evaluate(()=>window.unlinkCalls.map(call=>[call.p_action,call.p_place_id,call.p_target_club_id])),
    [['review-conflict','manual-fixture-place',null],['conflict','manual-fixture-place','holder']]);
  assert.deepEqual(await page.evaluate(()=>window.unlinkReceipts.map(receipt=>receipt.target.id)),['holder']);
});

test('delist requires a renewed review after the club changes', async t=>{
  const page=await open(t,{fixtureDelist:true,fixtureStale:true});
  await click(page,'Unlink listing from Requested Club');
  await seen(page,'The club or Google listing changed.');
  assert.deepEqual(await page.evaluate(()=>window.unlinkReceipts),[]);
  await page.evaluate(()=>{window.fixtureStale=false;});
  await click(page,'Reload unlink review');
  await click(page,'Unlink listing from Requested Club');
  await seen(page,'Google listing unlinked.');
  assert.deepEqual(await page.evaluate(()=>window.unlinkCalls.map(call=>call.p_action)),['review-delist','delist','review-delist','delist']);
});

test('an available listing and a tenant both hide the confirm action', async t=>{
  const available=await open(t,{fixtureFree:true});
  await seen(available,'This listing is available.');
  assert.doesNotMatch(await available.$eval('body',node=>node.innerText),/Unlink listing from/);
  const tenant=await open(t,{fixtureTenant:true});
  await seen(tenant,'A verified super-admin account is required');
  assert.deepEqual(await tenant.evaluate(()=>window.unlinkCalls),[]);
  assert.doesNotMatch(await tenant.$eval('body',node=>node.innerText),/Unlink listing from/);
});
