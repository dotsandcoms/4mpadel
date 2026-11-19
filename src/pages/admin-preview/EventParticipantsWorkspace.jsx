import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useState } from 'react';
import { ArrowLeft, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import ImportedParticipantDialog from './ImportedParticipantDialog';
import EventCompletionControl from './EventCompletionControl';
import { loadManagedEventCompletions } from './eventManagementCompletion';
import { verifyEventOperationAccess } from './eventOperationAccess';
import { verifyImportedParticipantWrite } from './importedParticipantActions';
import RecordLoading from './RecordLoading';
import { readEventParticipants, participantSnapshot, participantLicence } from './eventParticipants';
import './PlayersWorkspace.css';

export default function EventParticipantsWorkspace({ event, go, client = supabase, session, scopeId = 'all', onRefresh }) {
  const [retry,setRetry]=useState(0);
  const userId=session?.user?.id;
  const [identity,setIdentity]=useState({client,eventId:event.id,userId,scopeId,retry,generation:0});
  if(identity.client!==client||identity.eventId!==event.id||identity.userId!==userId||identity.scopeId!==scopeId||identity.retry!==retry){
    setIdentity({client,eventId:event.id,userId,scopeId,retry,generation:identity.generation+1});
    return null;
  }
  return <EventParticipantsContent key={identity.generation} {...{event,go,client,session,scopeId,onRefresh,setRetry}}/>;
}

function EventParticipantsContent({event,go,client,session,scopeId,onRefresh,setRetry}) {
  const [state, setState] = useState({ loading: true, rows: [], error: '' });
  const [action,setAction]=useState(null),[busy,setBusy]=useState(false),[writeAccess,setWriteAccess]=useState(false),[completion,setCompletion]=useState({loading:true});
  const [query, setQuery] = useState(''), [division, setDivision] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    (async()=>{
      await verifyEventOperationAccess({client,eventId:event.id,expectedUserId:session?.user?.id,scopeId,signal:controller.signal});
      const rows=await readEventParticipants(client,event.id,controller.signal);
      if(!controller.signal.aborted)setState({loading:false,rows,error:''});
      try{await verifyImportedParticipantWrite({client,eventId:event.id,expectedUserId:session?.user?.id,scopeId,signal:controller.signal});if(!controller.signal.aborted)setWriteAccess(true);}catch{/* Delegated source access is read-only for participant writes. */}
      try{const map=await loadManagedEventCompletions(client);if(!controller.signal.aborted)setCompletion({loading:false,value:map.get(Number(event.id))||null});}catch(error){if(!controller.signal.aborted)setCompletion({loading:false,error:error.message});}
    })()
      .catch(error => { if (!controller.signal.aborted) setState({ loading: false, rows: [], error: error.message }); });
    return () => controller.abort();
  }, [client, event.id, session?.user?.id, scopeId]);
  const snapshot = participantSnapshot(event, state.rows);
  const divisions = [...new Set(state.rows.map(row => row.class_name).filter(Boolean))].sort();
  const rows = state.rows.filter(row => (!division || row.class_name === division)
    && [row.full_name, row.email, row.players?.name, row.players?.email, row.class_name].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())))
    .sort((a, b) => String(a.class_name || '').localeCompare(String(b.class_name || '')) || String(a.full_name || '').localeCompare(String(b.full_name || '')));
  return <>
    <button disabled={busy} className="ap-back-button" onClick={() => go('events')}><ArrowLeft size={16} /> Events</button>
    <header className="ap-page-heading"><div><p className="ap-kicker">RankedIn event · Imported participants</p><h1>{event.event_name}</h1><p>{event.venue}</p></div><div className="ap-imported-actions">{event.finance_managed===true&&!completion.loading&&!completion.error&&<EventCompletionControl client={client} event={{...event,management_completed_at:completion.value}} session={session} scopeId={scopeId} disabled={busy} onBusyChange={setBusy} onSaved={receipt=>setCompletion({loading:false,value:receipt.completed_at})} onClose={result=>{if(result?.refresh){setRetry(v=>v+1);onRefresh?.();}}}/>}<button className="ap-secondary" disabled={state.loading||busy} onClick={() => setRetry(value => value + 1)}><RefreshCw size={16} /> Reload records</button><button className="ap-secondary" disabled={state.loading||busy||Boolean(state.error)} onClick={()=>setAction({type:'sync'})}>Review RankedIn sync</button></div></header>
    {state.loading ? <section className="ap-section"><RecordLoading label="Loading event participants…" detail="Reading the same imported participant records used by the Event Manager entry count." /></section>
      : state.error ? <section className="ap-section ap-live-loading" role="alert"><h2>Participants could not be loaded</h2><p>{state.error}</p><button className="ap-secondary" onClick={() => setRetry(value => value + 1)}>Try again</button></section> : <>
        <section className="ap-section"><div className="ap-health-grid"><div><strong>{snapshot.entries}</strong><span>Imported entries</span></div><div><strong>{snapshot.paid}</strong><span>Recorded paid</span></div><div><strong>{divisions.length}</strong><span>Divisions</span></div></div></section>
        <p className="ap-lede">These are the participant records currently stored in 4M, not the 4M-hosted registration ledger. Reload reads saved records; it does not import new entries from RankedIn. Imported payment flags are not proof of a Paystack payment.</p>
        {!writeAccess&&<p className="ap-lede">Profile links and WhatsApp checklist changes require super-admin access. Payment changes and RankedIn importing are review-only while their non-atomic source workflows are being protected.</p>}<div className="ap-filter-bar" style={{ marginTop: 20 }}><label className="ap-filter-search"><Search size={17} /><span className="ap-visually-hidden">Search participants</span><input disabled={busy} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search participant, email or division" /></label><label>Division <SearchableDropdown disabled={busy} value={division} onChange={e => setDivision(e.target.value)}><option value="">All divisions</option>{divisions.map(name => <option key={name}>{name}</option>)}</SearchableDropdown></label></div>
        <section className="ap-section pp-table-wrap"><table className="pp-table"><thead><tr><th>Participant</th><th>Division</th><th>Recorded payment</th><th>Licence</th><th>WhatsApp group</th><th>Actions</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td><b>{row.full_name || row.players?.name || 'Name not recorded'}</b><small>{row.email || row.players?.email || 'Email not recorded'}</small></td><td>{row.class_name || 'Division not recorded'}</td><td><span className={`ap-status ap-status--${row.is_paid ? 'positive' : 'neutral'}`}>{row.is_paid ? 'Recorded paid' : 'Not marked paid'}</span></td><td>{participantLicence(row, event.id)}</td><td>{row.whatsapp_added?'Recorded on group':'Not recorded on group'}</td><td><div className="ap-imported-actions"><button className="ap-secondary" disabled={busy||!writeAccess} onClick={()=>setAction({type:'profile',participant:row})}>{row.profile_id?'Change profile':'Link profile'}</button><button className="ap-secondary" disabled={busy||!writeAccess} onClick={()=>setAction({type:'whatsapp',participant:row})}>Update group record</button><button className="ap-secondary" disabled={busy} onClick={()=>setAction({type:'payment',participant:row})}>Review payment</button></div></td></tr>)}</tbody></table>{!rows.length && <p className="ap-empty-inline">No participants match these filters.</p>}</section>
        <p className="ap-table-foot">Showing {rows.length} of {state.rows.length} imported entries. Participant records are shown individually; pairings are not inferred from names.</p>
      </>}
    {action&&<ImportedParticipantDialog key={[event.id,session?.user?.id,scopeId,action.type,action.participant?.id].join(':')} client={client} event={event} session={session} scopeId={scopeId} action={action.type} participant={action.participant} onBusyChange={setBusy} onClose={result=>{setAction(null);if(result?.refresh){setRetry(v=>v+1);onRefresh?.();}}}/>}
  </>;
}
