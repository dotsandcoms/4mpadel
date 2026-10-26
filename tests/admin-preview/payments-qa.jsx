import React from 'react';
import {createRoot} from 'react-dom/client';
import PaymentsWorkspace from '../../src/pages/admin-preview/PaymentsWorkspace.jsx';
import '../../src/pages/AdminPreview.css';
const rows=Array.from({length:24},(_,id)=>({id,reference:`SYNTHETIC-${id}`,is_test:id===23 ? true:false,status:id%2?'success':'pending',amount:650,created_at:'2026-09-08',player_id:123,event_id:463,payment_type:'event_entry_fee'}));
rows.forEach((row,index)=>{if(index!==2){row.players={id:123,name:'Synthetic Player',image_url:index===0 ? '/missing-synthetic-avatar.png':null};row.calendar={id:463,event_name:'Synthetic Coastal Open'};}});
const client={from(table){return {select(){return this;},eq(field,id){this.paymentId=id;return this;},order(){return this;},range(offset,end){this.rows=(table==='payment_refunds' ? [{id:'synthetic-refund',payment_id:this.paymentId,amount:100,status:'pending',reason:'admin_removal',paystack_refund_id:'SYNTHETIC-RF-123',paystack_reference:'SYNTHETIC-ORIGINAL',created_at:'2026-09-08',processed_at:null}]:rows).slice(offset,new URLSearchParams(location.search).has('slow') ? offset+7:end+1);return this;},abortSignal(){return this;},async then(resolve){if(new URLSearchParams(location.search).has('slow'))await new Promise(done=>setTimeout(done,800));return Promise.resolve({data:this.rows}).then(resolve);}};}};
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{padding:24,display:'block'}}><PaymentsWorkspace client={client} session={{user:{id:'synthetic'}}} permissions={{role:'super_admin'}} scopeId="all"/></div>);
