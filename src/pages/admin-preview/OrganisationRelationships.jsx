import { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { loadOrganisationRelationships, reviewOrganisationRelationship, saveOrganisationRelationship } from './organisationRelationships.js';

export default function OrganisationRelationships({ client, organisation, session, scopeId, onBusyChange }) {
  const [opened,setOpened]=useState(false),[revision,setRevision]=useState(0),[data,setData]=useState(null);
  const [review,setReview]=useState(null),[choice,setChoice]=useState({album:'',federation:''}),[feedback,setFeedback]=useState(null);
  const pending=useRef(null),userId=session?.user?.id;
  useEffect(()=>{
    if(!opened)return;
    const controller=new AbortController();
    loadOrganisationRelationships(client,organisation,{userId,scopeId,signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setData({revision,value});})
      .catch(error=>{if(!controller.signal.aborted)setData({revision,error:error.message});});
    return ()=>controller.abort();
  },[client,organisation,opened,revision,scopeId,userId]);
  useEffect(()=>()=>pending.current?.abort(),[client,organisation.id,scopeId,userId]);

  const busy=feedback?.busy===true;
  const current=data?.revision===revision?data:null;
  const inspect=(kind,id,action)=>{
    try{setReview(reviewOrganisationRelationship(current.value,kind,id,action));setFeedback(null);}
    catch(error){setFeedback({error:error.message});}
  };
  const confirm=async()=>{
    if(!review||pending.current||feedback?.error)return;
    const controller=new AbortController();
    pending.current=controller;setFeedback({busy:true});onBusyChange?.(true);
    try{
      await saveOrganisationRelationship(client,review,{userId,scopeId,signal:controller.signal});
      if(controller.signal.aborted)return;
      setFeedback({message:`${review.kind==='album'?'Album':'Federation'} ${review.action==='link'?'linked':'unlinked'}.`});
      setReview(null);setChoice({album:'',federation:''});setRevision(value=>value+1);
    }catch(error){if(!controller.signal.aborted)setFeedback({error:error.message});}
    finally{if(pending.current===controller)pending.current=null;onBusyChange?.(false);}
  };
  const picker=(kind,label,rows)=><div className="of-decision-actions">
    <label>{label}<SearchableDropdown disabled={busy} value={choice[kind]} onChange={event=>setChoice(previous=>({...previous,[kind]:event.target.value}))}>
      <option value="">Choose {label.toLowerCase()}</option>{rows.map(row=><option key={row.id} value={row.id}>{row.title||row.name}</option>)}
    </SearchableDropdown></label><button type="button" className="ap-secondary" disabled={!choice[kind]||busy} onClick={()=>inspect(kind,choice[kind],'link')}>Review {kind} link</button>
  </div>;
  return <details className="of-related" onToggle={event=>{if(event.currentTarget.open)setOpened(true);}}>
    <summary>Gallery and federation relationships</summary>
    {feedback?.message&&<p role="status">{feedback.message}</p>}
    {feedback?.error&&<p role="alert">{feedback.error}</p>}
    {opened&&!current?<p role="status">Loading relationships…</p>:current?.error?<p role="alert">{current.error}</p>:current?.value&&<div className="of-decision-list">
      <h3>Gallery albums</h3><ul>{current.value.albums.filter(row=>row.organisation_id===organisation.id).map(row=><li key={row.id}><span>{row.title}</span>
        <button type="button" className="ap-secondary" disabled={busy} onClick={()=>inspect('album',row.id,'unlink')}>Review album unlink</button></li>)}</ul>
      {picker('album','Unlinked album',current.value.albums.filter(row=>row.organisation_id==null))}
      <h3>Federation</h3>{current.value.organisation.federation_id ? <ul>{current.value.federations.filter(row=>row.id===current.value.organisation.federation_id).map(row=><li key={row.id}><span>{row.name}</span>
        <button type="button" className="ap-secondary" disabled={busy} onClick={()=>inspect('federation',row.id,'unlink')}>Review federation unlink</button></li>)}</ul>
        : picker('federation','Federation',current.value.federations)}
      {review&&<section className="of-notice" aria-label="Relationship review">
        <p>{review.action==='link'?'Link':'Unlink'} {review.target.title||review.target.name} {review.action==='link'?'to':'from'} {organisation.name}?</p>
        {review.kind==='federation'&&<p>This changes which federation staff can review the organisation’s eligible event amendments.</p>}
        <button type="button" className="ap-primary" disabled={busy||Boolean(feedback?.error)} onClick={confirm}>Confirm {review.kind} {review.action}</button>
        <button type="button" className="ap-secondary" disabled={busy} onClick={()=>setReview(null)}>Cancel review</button>
      </section>}
    </div>}
    {opened&&<button type="button" className="ap-secondary" disabled={busy||!current} onClick={()=>{setReview(null);setChoice({album:'',federation:''});setFeedback(null);setRevision(value=>value+1);}}>Refresh relationships</button>}
  </details>;
}
