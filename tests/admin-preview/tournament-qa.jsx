import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import TournamentWorkspace from '../../src/pages/admin-preview/tournament/TournamentWorkspace';
import { sampleTournament } from './tournament-data';
import '../../src/index.css';
import '../../src/pages/AdminPreview.css';
const params=new URLSearchParams(location.search);
const state=sampleTournament(params.get('scenario')==='seed-review'?'prepare':params.get('scenario')||'schedule');
if(params.get('scenario')==='seed-review')state.confirmations=state.divisions.map(d=>({division_id:d.id,revision:1,review:{excluded:[],exceptions:{},seeds:[]},configuration:{format:'knockout'},players_confirmed_at:'2026-10-01',players_valid:true,format_confirmed_at:'2026-10-01'}));
if(params.has('role')) state.capabilities=[params.get('role')];
const qa=window.tournamentQA={writes:[],loads:0,fail:false,loadFail:false};
const client={
 list:async()=>[{...state.event,capabilities:state.capabilities}],
 load:async()=>{qa.loads++;if(qa.loadFail)throw new Error('Synthetic refresh rejected');if(qa.holdLoad)return new Promise(resolve=>{qa.releaseLoad=()=>resolve(structuredClone(state));});return structuredClone(state);},
 saveSchedule:async(_,plan)=>{qa.writes.push('saveSchedule');if(qa.holdSave)await new Promise(resolve=>{qa.releaseSave=resolve;}); if(qa.fail)throw new Error('Synthetic save rejected'); state.schedule={...structuredClone(plan),revision:(state.schedule?.revision||0)+1,status:'draft',source_fingerprint:state.sourceFingerprint};qa.saveFinished=true;},
 publishSchedule:async()=>{qa.writes.push('publishSchedule');state.schedule.status='published';},
};
for(const name of ['saveRegistration','saveDivision','qualify','saveSettings','confirm','saveDraw','publishDraw','result','finalise','access'])client[name]=async()=>{qa.writes.push(name);throw new Error('Synthetic write rejected for review');};
client.confirm=async(_,division,kind,payload)=>{qa.writes.push('confirm:'+kind);if(kind==='format'){const c=state.confirmations.find(c=>c.division_id===division);c.configuration=payload;c.revision++;return;}throw new Error('Synthetic second step rejected');};
function Fixture(){
 const [connection,setConnection]=useState(client);
 qa.switchClient=()=>setConnection({...client,load:async()=>({...structuredClone(state),event:{...state.event,event_name:'Replacement connection tournament'}})});
 return <TournamentWorkspace client={connection} demo/>;
}
createRoot(document.getElementById('root')).render(<BrowserRouter><div className="admin-preview" style={{padding:24,minHeight:'100vh',background:'#f4f5f1'}}><Fixture/></div></BrowserRouter>);
