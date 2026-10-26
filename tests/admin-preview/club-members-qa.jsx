import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubMemberDecision from '../../src/pages/admin-preview/ClubMemberDecision';
import { Dialog } from '../../src/pages/admin-preview/PlayersWorkspace';
import { CLUB_MEMBER_STAGING_URL, clubMemberApi } from '../../src/pages/admin-preview/clubMemberRpc';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const params=new URLSearchParams(location.search), config={enable:'staging'};
const state=window.clubMemberQA={calls:[],role:'super_admin',busy:false};
const record={id:'member',club_id:'club',player_id:null,user_email:'synthetic.owner@example.invalid',role:'owner',created_at:'2026-01-01T00:00:00Z',players:{name:'Synthetic club owner'}};
const client={supabaseUrl:CLUB_MEMBER_STAGING_URL,auth:{getUser:async()=>{await new Promise(resolve=>setTimeout(resolve,150));return{data:{user:{id:'actor',email:'qa@example.invalid'}}};}},from(){return{select(){return this;},ilike(){return this;},maybeSingle:async()=>({data:{role:state.role}})};},rpc:async(name,args)=>{if(name==='account_is_active')return{data:true};if(name==='is_super_admin')return{data:state.role==='super_admin'};state.calls.push({name,args});await new Promise(resolve=>setTimeout(resolve,300));return params.has('failure')?{error:new Error('Synthetic stale member')}:{data:{operation_id:args.p_operation_id,club_id:args.p_club_id,member_id:args.p_member_id,action:args.p_action,role:args.p_role,removed:args.p_action==='remove'}};}};
const api={enabled:c=>clubMemberApi.enabled(c,config),submit:args=>clubMemberApi.submit({...args,config})};
function App(){const[busy,setBusy]=React.useState(false),[closed,setClosed]=React.useState(false),[userId,setUserId]=React.useState('actor');state.changeContext=()=>setUserId('other');return <div className="ap-root" style={{display:'block'}}>{!closed&&<Dialog title="Club member access" className="fo-root clubs-root" busy={busy} onClose={()=>{if(!state.busy)setClosed(true);}}><ClubMemberDecision record={record} ownerCount={1} client={client} session={{user:{id:userId}}} scopeId="all" memberApi={params.has('preview')?clubMemberApi:api} onCancel={()=>setClosed(true)} onBusyChange={v=>{state.busy=v;setBusy(v);}} onSaved={v=>{state.saved=v;}}/></Dialog>}</div>;}
createRoot(document.getElementById('root')).render(<App/>);
