import React from 'react';import {createRoot} from 'react-dom/client';
import EventParticipantsWorkspace from '../../src/pages/admin-preview/EventParticipantsWorkspace';
import '../../src/index.css';import '../../src/pages/AdminPreview.css';
const state=window.importedQA={writes:[],rpcCalls:[],admin:true,fail:false};
const profile={id:2,name:'Synthetic Player',email:'player@example.invalid',license_type:'full'};
let participant={id:'p',event_id:7,full_name:'Synthetic Player',email:'player@example.invalid',class_name:'Open',rankedin_participant_id:'123',profile_id:null,whatsapp_added:false,is_paid:false,players:null};
const event={id:7,event_name:'Synthetic RankedIn Open',rankedin_id:123,finance_managed:true,is_manual:false};
const client={auth:{getUser:async()=>({data:{user:{id:'actor',email:'admin@example.invalid'}}})},rpc(name,args){state.rpcCalls.push({name,args});const request=Promise.resolve({data:name==='is_super_admin'?state.admin:name==='can_manage_event'?true:name==='event_license_status'?(args.p_player_ids||[]).map(player_id=>({player_id,eligibility:{full:true,temporary:false}})):[]});request.abortSignal=()=>request;return request;},from(table){let patch=null,start=0;return{select(){return this;},update(value){patch=value;return this;},eq(){return this;},is(){return this;},order(){return this;},range(value){start=value;return this;},abortSignal(){return this;},single(){if(patch){state.writes.push({table,patch});if(state.fail)return Promise.reject(Error('Synthetic lost response'));participant={...participant,...patch,players:patch.profile_id?profile:participant.players};return Promise.resolve({data:participant});}return Promise.resolve({data:table==='calendar'?event:table==='players'?profile:participant});},then(resolve){return Promise.resolve({data:start?[]:table==='players'?[profile]:table==='tournament_participants'?[participant]:[]}).then(resolve);}};}};
const fixtureRpc=client.rpc;
client.rpc=(name,args)=>{
  if(name!=='account_is_active')return fixtureRpc(name,args);
  state.rpcCalls.push({name,args});
  const request=Promise.resolve({data:state.active!==false});request.abortSignal=()=>request;return request;
};
createRoot(document.getElementById('root')).render(<div className="ap-root" style={{display:'block',padding:24}}><EventParticipantsWorkspace event={event} client={client} session={{user:{id:'actor'}}} scopeId="all" go={()=>{}}/></div>);
