import React from 'react';
import { createRoot } from 'react-dom/client';
import ClubMemberAdd from '../../src/pages/admin-preview/ClubMemberAdd.jsx';
import { Dialog } from '../../src/pages/admin-preview/PlayersWorkspace';
import { clubMemberAddApi } from '../../src/pages/admin-preview/clubMemberAdd';
import { CLUB_MEMBER_STAGING_URL } from '../../src/pages/admin-preview/clubMemberRpc';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
import '../../src/pages/admin-preview/FinanceOverview.css';
import '../../src/pages/admin-preview/ClubsWorkspace.css';
const params=new URLSearchParams(location.search),config={enable:'staging'},members=[{user_email:'existing@example.invalid'}];
const state=window.clubAddQA={calls:[],searches:[],role:'super_admin',busy:false};
const client={supabaseUrl:CLUB_MEMBER_STAGING_URL,auth:{getUser:async()=>{await new Promise(r=>setTimeout(r,100));return{data:{user:{id:'actor',email:'qa@example.invalid'}}};}},from(){let query='';return{select(){return this;},ilike(){return this;},maybeSingle:async()=>({data:{role:state.role}}),or(q){query=q;state.searches.push(q);return this;},not(){return this;},limit(){return this;},abortSignal:async()=>{await new Promise(r=>setTimeout(r,query.includes('slow')?700:50));return{data:[{id:12,name:query.includes('slow')?'Old result':'Synthetic Player',email:'player@example.invalid'},{id:13,name:'Existing member',email:'EXISTING@example.invalid'}]};}};},rpc:async(name,args)=>{if(name==='account_is_active')return{data:true};if(name==='is_super_admin')return{data:state.role==='super_admin'};state.calls.push({name,args});await new Promise(r=>setTimeout(r,300));return params.has('failure')?{error:new Error('Synthetic stale player')}:{data:{operation_id:args.p_operation_id,club_id:args.p_club_id,member_id:'newmember',notification:'pending',member:{id:'newmember',club_id:args.p_club_id,player_id:args.p_player_id,role:args.p_role,user_email:args.p_expected_player.email}}};}};
const api={enabled:c=>clubMemberAddApi.enabled(c,config),search:clubMemberAddApi.search,submit:a=>clubMemberAddApi.submit({...a,config})};
function App(){const[busy,setBusy]=React.useState(false),[closed,setClosed]=React.useState(false),[userId,setUserId]=React.useState('actor');state.context=()=>setUserId('other');return <div className="ap-root" style={{display:'block'}}>{!closed&&<Dialog title="Add club member" className="fo-root clubs-root" busy={busy} onClose={()=>{if(!state.busy)setClosed(true);}}><ClubMemberAdd clubId="club" members={members} client={client} session={{user:{id:userId}}} scopeId="all" addApi={params.has('preview')?clubMemberAddApi:api} onCancel={()=>setClosed(true)} onBusyChange={v=>{state.busy=v;setBusy(v);}} onSaved={v=>{state.saved=v;}}/></Dialog>}</div>;}
createRoot(document.getElementById('root')).render(<App/>);
