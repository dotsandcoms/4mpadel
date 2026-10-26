import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import PlayerProfileEditDialog from '../../src/pages/admin-preview/PlayerProfileEditDialog';
import PlayerAccountDialog from '../../src/pages/admin-preview/PlayerAccountDialog';
import '../../src/pages/AdminPreview.css';
const player = { id: 7, name: 'Synthetic Player', email: 'player@example.invalid' };
let setReceipt;
const client = { auth: { getUser: async () => ({ data: { user: { id:'qa', email:'qa@example.invalid' } } }), signInWithOtp: async () => { setReceipt('Synthetic invitation request accepted; no email sent.'); return {data:{}}; } }, rpc: async () => ({data:true}), from() {
  let payload;
  const query = { select:()=>query,not:()=>query,order:()=>query,eq:()=>query,range:async()=>({data:[]}),single:async()=>({data:payload?{id:8,...payload}:player}),insert:rows=>{payload=rows[0];return query;} }; return query;
} };
function App(){const[action,setAction]=useState(''),[receipt,updateReceipt]=useState('');setReceipt=updateReceipt;return <div className="ap-root"><div className="pp-workspace"><h1>Synthetic player account QA</h1><p>No real database, Auth or email calls.</p><button onClick={()=>setAction('create')}>Add player</button><button onClick={()=>setAction('Send login invite')}>Invite player</button><button onClick={()=>setAction('Reset password')}>Held reset</button><p role="status">{receipt}</p>{action==='create'?<PlayerProfileEditDialog creating client={client} userId="qa" scopeId="all" onClose={()=>setAction('')} onSaved={()=>{updateReceipt('Synthetic profile created; no Auth identity created.');setAction('');}}/>:action&&<PlayerAccountDialog action={action} player={player} client={client} userId="qa" scopeId="all" onClose={()=>setAction('')}/>}</div></div>}
createRoot(document.getElementById('root')).render(<App/>);
