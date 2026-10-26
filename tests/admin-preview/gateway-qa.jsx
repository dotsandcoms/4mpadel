import React from 'react';
import {createRoot} from 'react-dom/client';
import PaystackGateway from '../../src/pages/admin-preview/PaystackGateway.jsx';
import '../../src/pages/AdminPreview.css';
const params=new URLSearchParams(location.search);
const session={user:{id:'synthetic'}};
const client={supabaseUrl:params.has('blocked') ? 'https://example.invalid':'https://cefmzkwabdqqoagxhekc.supabase.co',auth:{async getSession(){return {data:{session:{...session,access_token:'synthetic'}}};}},functions:{async invoke(name){
  const query=new URLSearchParams(name.split('?')[1]);
  await new Promise(resolve=>setTimeout(resolve,500));
  if(params.has('error'))return {error:{context:{status:504}}};
  const page=Number(query.get('page'));
  return {data:{environment:'test',pagination:{page,perPage:10,total:12,pageCount:2,hasMore:page<2},transactions:Array.from({length:page===1?10:2},(_,i)=>({reference:`SYNTHETIC-${page}-${i}`,createdAt:'2026-09-08T08:00:00Z',status:query.get('status')||['success','failed','abandoned'][i%3],channel:'card',amountMinor:65000,currency:'ZAR',environment:'test'}))}};
}}};
client.from=()=>{let start=0,refs=[];return {select(){return this;},eq(){return this;},in(_,values){refs=values;return this;},order(){return this;},abortSignal(){return this;},range(value){start=value;return this;},then(resolve){return Promise.resolve({data:start ? []:refs.slice(0,3).map((reference,id)=>({id,reference,is_test:true,payment_method:'paystack',amount:id===1?600:650,currency:id===2?null:'ZAR',status:id===1?'pending':id===2?'abandoned':'success',players:{name:'Synthetic Player'},calendar:{event_name:'Synthetic Coastal Open'}}))}).then(resolve);}};};
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><p>Synthetic gateway QA — no network or database calls</p><PaystackGateway client={client} session={session} permissions={{role:'super_admin'}} scopeId="all"/></div>);
