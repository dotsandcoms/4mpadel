import React,{useEffect,useId,useState} from 'react';
import {useEventOperation} from './useEventOperation';
import {saveImportedParticipant,searchImportedProfiles,importedHeldAction} from './importedParticipantActions';
import './EventPaymentDialog.css';
import './ImportedParticipantDialog.css';

export default function ImportedParticipantDialog({client,event,participant,action,session,scopeId='all',onClose,onSaved,onBusyChange}){
  const title=useId();
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,event,session,scopeId,onClose,onSaved,onBusyChange});
  const [query,setQuery]=useState(''),[results,setResults]=useState([]),[searchError,setSearchError]=useState(''),[searching,setSearching]=useState(false),[profile,setProfile]=useState(null),[note,setNote]=useState('');
  const held=['sync','payment'].includes(action);
  useEffect(()=>{const controller=new AbortController();if(action!=='profile'||query.trim().length<2)return()=>controller.abort();const timer=setTimeout(()=>searchImportedProfiles({client,eventId:event.id,expectedUserId:session?.user?.id,scopeId,query,signal:controller.signal}).then(rows=>{if(!controller.signal.aborted)setResults(rows);}).catch(error=>{if(!controller.signal.aborted)setSearchError(error.message);}).finally(()=>{if(!controller.signal.aborted)setSearching(false);}),300);return()=>{clearTimeout(timer);controller.abort();};},[client,event.id,session?.user?.id,scopeId,query,action]);
  const submit=e=>{e.preventDefault();if(held)return;run(checks=>saveImportedParticipant({client,eventId:event.id,expectedUserId:session?.user?.id,scopeId,participant,action,profile,...checks}));};
  const label=action==='sync'?'Review RankedIn sync':action==='payment'?'Review recorded payment':action==='profile'?'Link player profile':'Update WhatsApp group record';
  return <dialog ref={bindDialog} className="ap-payment-dialog ap-imported-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();close();}}><header><div><p>{event.event_name}</p><h2 id={title}>{label}</h2></div><button type="button" disabled={busy} onClick={close} aria-label="Close imported action">×</button></header><form onSubmit={submit}>
    {participant&&<div className="ap-payment-person"><strong>{participant.full_name}</strong><span>{participant.class_name}</span></div>}
    {result?<p role="status">Record updated. Close to reload the authoritative participant and licence details.</p>:<>
      {held?<><p role="status">{importedHeldAction(action)}</p>{action==='sync'?<p>Source workflow: fetch every RankedIn division, match profiles and recorded payments, upsert entries, then remove entries no longer present. RankedIn ID: {event.rankedin_id||'Not recorded'}.</p>:<><p>{participant.is_paid?'Unmarking also resets linked registrations and cancels matching payment records. It is not a refund.':'Marking paid also records a successful manual entry-fee payment using the event entry fee.'} This is not a Paystack payment confirmation.</p><label>Payment note for local review<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="EFT, cash or complimentary entry…"/></label></>}</>:action==='profile'?<>
        <label>Search 4M player profiles<input type="search" value={query} disabled={busy||Boolean(error)} onChange={e=>{setQuery(e.target.value);setProfile(null);setResults([]);setSearchError('');setSearching(e.target.value.trim().length>=2);}} placeholder="Name or email…"/></label>
        <div className="ap-imported-results" aria-label="Matching profiles">{searching?<p role="status">Searching profiles…</p>:query.trim().length<2?<p>Type at least 2 characters.</p>:!results.length?<p>No matching profiles.</p>:results.map(row=><label key={row.id}><input type="radio" name="imported-profile" checked={profile?.id===row.id} disabled={busy||Boolean(error)} onChange={()=>setProfile({...row})}/><span><strong>{row.name||'Name not recorded'}</strong><small>{row.email||'Email not recorded'}</small></span></label>)}</div>{searchError&&<p role="alert">{searchError}</p>}
        {profile&&<p>Link to <strong>{profile.name||profile.email}</strong>? This changes only the linked profile; it does not change payments or send messages.</p>}
      </>:<p>{participant.whatsapp_added?'Mark this participant as not on the WhatsApp group?':'Mark this participant as already added to the WhatsApp group?'} This only changes the internal checklist. It does not add anyone to WhatsApp or send a message.</p>}
      {error&&<p role="alert">{error}</p>}
    </>}
    <footer><button className="ap-secondary" type="button" disabled={busy} onClick={close}>{result||held?'Close':'Cancel'}</button>{!held&&!result&&<button className="ap-primary" disabled={busy||Boolean(error)||(action==='profile'&&!profile)}>{busy?'Saving…':action==='profile'?'Confirm profile link':'Confirm group record'}</button>}{held&&<button className="ap-primary" type="button" disabled>Save unavailable</button>}</footer>
  </form></dialog>;
}
