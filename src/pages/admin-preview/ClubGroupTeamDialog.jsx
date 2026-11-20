import { useEffect, useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { loadGroupTeamReview, saveGroupTeamAccess, searchGroupTeamPlayers } from './clubGroupTeam.js';

export default function ClubGroupTeamDialog({ client, session, scopeId, group, onClose, onSaved, onBusyChange }) {
  const [query,setQuery]=useState(''),[matches,setMatches]=useState(null),[player,setPlayer]=useState(null);
  const [role,setRole]=useState('admin'),[review,setReview]=useState(null),[preparing,setPreparing]=useState(false),[validation,setValidation]=useState('');
  const userId=session?.user?.id;
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,event:{id:group.id},session,scopeId,onClose,onSaved,onBusyChange});
  useEffect(()=>{
    if(query.trim().length<2)return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      searchGroupTeamPlayers({client,scopeId,userId,signal:controller.signal},query).then(rows=>{
        if(!controller.signal.aborted)setMatches({query,rows});
      }).catch(issue=>{if(!controller.signal.aborted)setMatches({query,error:issue.message});});
    },250);
    return()=>{clearTimeout(timer);controller.abort();};
  },[client,scopeId,userId,query]);

  const submit=async event=>{
    event.preventDefault();
    if (review) {run(checks=>saveGroupTeamAccess({client,scopeId,userId,...checks},review));return;}
    if (preparing || !player) return;
    setPreparing(true);setValidation('');
    try{setReview(await loadGroupTeamReview({client,scopeId,userId},group,player,role));}
    catch(issue){setValidation(issue.message);}
    finally{setPreparing(false);}
  };
  return <dialog ref={bindDialog} className="ap-payment-dialog of-dialog" aria-label="Assign club group team access"
    onCancel={event=>{event.preventDefault();if(!preparing)close();}}>
    <header><h2>Assign group team access</h2><button type="button" className="ap-secondary" aria-label="Close group team"
      disabled={busy||preparing} onClick={close}>×</button></header>
    <form onSubmit={submit}>
      {result?<p role="status">{result.changed.length} venue memberships updated. {result.preserved.length} existing roles preserved.</p>
        :review?<section className="of-notice"><h3>Review {role} access for {review.expected.player_name||review.expected.player_email}</h3>
          <p>{review.expected.player_email} · {group.name}</p><ul>{review.expected.venues.map(venue=><li key={venue.id}>
            {venue.name} · {venue.member?.role==='owner'?'Keep current owner':venue.member?.role===role?'Keep current role':`Assign ${role}`}
          </li>)}</ul><p>Current owners keep their access. This request applies to the reviewed venue list.</p>
        </section>:<fieldset className="of-fields" disabled={preparing}>
          <label>Find an existing player<input type="search" value={query} onChange={event=>{setPlayer(null);setQuery(event.target.value);}} /></label>
          <label>Group role<select value={role} onChange={event=>setRole(event.target.value)}><option value="admin">Admin</option><option value="owner">Owner</option></select></label>
          {matches?.query===query&&matches.error&&<p role="alert">{matches.error}</p>}
          {matches?.query===query&&matches.rows?.map(row=><button key={row.id} type="button" className="ap-secondary"
            aria-pressed={player?.id===row.id} onClick={()=>setPlayer(row)}>Select {row.name||row.email} ({row.email})</button>)}
        </fieldset>}
      {(validation||error)&&<p role="alert">{validation||error}</p>}
      <footer><button type="button" className="ap-secondary" disabled={busy||preparing} onClick={close}>{result?'Done':'Cancel'}</button>
        {review&&!result&&!error&&<button type="button" disabled={busy} className="ap-secondary" onClick={()=>setReview(null)}>Back</button>}
        {!result&&<button className="ap-primary" disabled={busy||preparing||Boolean(error)||!player}>
          {busy?'Saving…':preparing?'Checking venues…':review?'Confirm group team access':'Review group team access'}</button>}
      </footer>
    </form>
  </dialog>;
}
