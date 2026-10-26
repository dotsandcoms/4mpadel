import React from 'react';
import {createRoot} from 'react-dom/client';
import FinanceOverview from '../../src/pages/admin-preview/FinanceOverview.jsx';
import '../../src/pages/AdminPreview.css';
const tables={payments:Array.from({length:8},(_,i)=>({id:i,amount:12345.67+i*300,status:'success',payment_type:['event_entry_fee','full_license','temp_license','membership','other','manual','registration','unknown'][i],created_at:'2026-09-01'})),payment_refunds:[{id:1,payment_id:0,amount:600,status:'pending',created_at:'2026-09-02'}]};
tables.payments.forEach(p=>{p.reference=`TEST-${p.id}-1788854067446`;p.payment_method='paystack';p.players=p.id%2 ? {id:`qa-player-${p.id}`,name:'Synthetic linked player'} : null;p.calendar={id:p.id%2 ? 1:2,event_name:'Synthetic Coastal Open — National Grand Tour Championship'};});
const client={from(table){let start=0,end=0,ids=null;return {select(){return this;},eq(){return this;},neq(){return this;},in(field,values){ids=values;return this;},order(){return this;},abortSignal(){return this;},range(a,b){start=a;end=b;return this;},then(resolve){return Promise.resolve({data:tables[table].filter(r=>!ids || ids.includes(r.id)).slice(start,end+1)}).then(resolve);}};}};
if (new URLSearchParams(location.search).has('slow')) {
  const from = client.from.bind(client);
  client.from = table => {
    const query = from(table);
    const then = query.then.bind(query);
    query.then = resolve => new Promise(done => setTimeout(done, 1500)).then(() => then(resolve));
    return query;
  };
}
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><p>SYNTHETIC QA — no database requests</p><FinanceOverview session={{user:{id:'qa'}}} permissions={{role:'super_admin'}} scopeId="all" client={client}/></div>);
