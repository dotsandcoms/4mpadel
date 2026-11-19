import { useEffect, useState } from 'react';
import { sendPlayerLoginInvitation } from './playerAccountActions.js';
import { useEventOperation } from './useEventOperation.js';
import { findOrganisationPlayers, loadOrganisationMembers, organisationRoles, organisationSlug, organisationWorkflowReview, submitOrganisationRecord } from './organisationRecords.js';

const titles = {create:'Create organisation',delete:'Delete organisation',team:'Organisation members'};
const actions = {create:'Create organisation',delete:'Delete organisation',add_member:'Add member',change_role:'Change role',remove_member:'Remove member',invite_owner:'Send owner login invitation'};

export default function OrganisationRecordDialog({ client, session, scopeId, mode, organisation, onClose, onSaved, onBusyChange }) {
  const [id]=useState(()=>organisation?.id||crypto.randomUUID());
  const [details,setDetails]=useState({name:'',slug:'',confirmation:'',role:'admin'});
  const [data,setData]=useState(null),[review,setReview]=useState(null),[validation,setValidation]=useState('');
  const [query,setQuery]=useState(''),[search,setSearch]=useState(null),[selected,setSelected]=useState(null);
  const userId=session?.user?.id;
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,event:{id},session,scopeId,onClose,onSaved,onBusyChange});
  const update=(key,value)=>{setDetails(current=>({...current,[key]:value}));setValidation('');};
  useEffect(()=>{
    if(mode!=='team')return;
    const controller=new AbortController();
    loadOrganisationMembers(client,organisation,{scopeId,userId,signal:controller.signal}).then(rows=>{
      if(!controller.signal.aborted)setData({rows});
    }).catch(issue=>{if(!controller.signal.aborted)setData({error:issue.message});});
    return ()=>controller.abort();
  },[client,organisation,mode,scopeId,userId]);
  const members=data?.rows;
  useEffect(()=>{
    if(query.trim().length<2 || mode==='delete' || (mode==='team'&&!members))return;
    const controller=new AbortController();
    const timer=setTimeout(()=>{
      findOrganisationPlayers(client,{scopeId,userId,signal:controller.signal},query,members).then(rows=>{
        if(!controller.signal.aborted)setSearch({query,rows});
      }).catch(issue=>{if(!controller.signal.aborted)setSearch({query,error:issue.message});});
    },250);
    return ()=>{clearTimeout(timer);controller.abort();};
  },[client,scopeId,userId,query,mode,members]);
  const choose=(action,input)=>{
    try {setReview(organisationWorkflowReview(action,organisation||{id},input));setValidation('');}
    catch(issue){setValidation(issue.message);}
  };
  const submit=event=>{
    event.preventDefault();
    if(review?.action==='invite_owner'){
      run(async checks=>{
        checks.onAttempt();
        await sendPlayerLoginInvitation(client,review.player,'https://4mpadel.co.za',{scopeId,userId,...checks});
        return {action:'invite_owner'};
      });
    }else if(review)run(checks=>submitOrganisationRecord(client,review,{scopeId,userId,...checks}));
    else choose(mode==='team'?'add_member':mode,{...details,player:selected});
  };
  const roleSelect=(label,value,onChange)=><label>{label}<select value={value} onChange={onChange}>{organisationRoles.map(role=><option key={role} value={role}>{role}</option>)}</select></label>;
  const playerPicker=<div className="of-nested">
    <label>{mode==='create'?'Find an existing owner':'Find an existing player'}<input type="search" value={query} onChange={event=>{setSelected(null);setQuery(event.target.value);}} /></label>
    {search?.query===query&&search.error&&<p role="alert">{search.error}</p>}
    {search?.query===query&&search.rows?.map(player=><button key={player.id} type="button" className="ap-secondary"
      aria-pressed={selected?.id===player.id} onClick={()=>setSelected(player)}>Select {player.name||player.email} ({player.email})</button>)}
    {selected&&<p role="status">Selected {selected.name||selected.email}</p>}
  </div>;
  return <dialog ref={bindDialog} className="ap-payment-dialog of-dialog" aria-label={titles[mode]} onCancel={event=>{event.preventDefault();close();}}>
    <header><h2>{titles[mode]}</h2><button type="button" aria-label="Close organisation action" className="ap-secondary" onClick={close} disabled={busy}>×</button></header>
    <form onSubmit={submit}>
      {result ? <div role="status"><p>{result.action==='invite_owner'?'Login link requested. After the owner signs in, return to create their organisation.':'Organisation action confirmed.'}</p>
        {result.email === 'submitted' && <p>Owner approval email submitted.</p>}
        {result.email === 'unconfirmed' && <p>Owner approval email delivery could not be confirmed.</p>}</div> : review ? <section className="of-notice">
        <h3>Review {actions[review.action].toLowerCase()}</h3><p>{review.input?.name||organisation?.name||review.player?.email}</p>
        {review.label&&<p>{review.label} {review.input?.role&&`· ${review.input.role}`}</p>}
        {review.action==='invite_owner'&&<p>The selected account will receive the usual 4M Padel sign-in link. The organisation can be created after the owner confirms their login.</p>}
        {review.action==='create'&&<p>The organisation will be published. The selected account will receive owner access and an approval email.</p>}
        {review.action==='delete'&&<p>Linked albums and events will be unlinked. Membership and club access links will be removed. Organisations with banking or payout records cannot be deleted.</p>}
      </section> : mode==='create' ? <fieldset className="of-fields">
        <label>Organisation name<input name="name" required value={details.name} onChange={event=>update('name',event.target.value)}/></label>
        <label>Public page slug<input name="slug" required value={details.slug} onChange={event=>update('slug',event.target.value)}/></label>
        <button className="ap-secondary" type="button" onClick={()=>update('slug',organisationSlug(details.name))}>Generate slug</button>
        {playerPicker}
        {selected&&<button type="button" className="ap-secondary" onClick={()=>setReview({action:'invite_owner',player:selected,label:selected.name})}>Review owner login invitation</button>}
      </fieldset> : mode==='delete' ? <section className="of-notice">
        <p>Type {organisation.name} exactly to review permanent deletion.</p>
        <label>Organisation name confirmation<input value={details.confirmation} onChange={event=>update('confirmation',event.target.value)}/></label>
      </section> : <>{data?.error ? <p role="alert">{data.error}</p> : !members ? <p role="status">Loading members…</p> : <>
        <h3>{organisation.name}</h3><div className="of-decision-list"><ul>{members.map(member=>{
          const lastOwner=member.role==='owner'&&members.filter(row=>row.role==='owner').length===1;
          return <li key={member.id}><strong>{member.players?.name||member.user_email}</strong><span>{member.user_email} · {member.role}</span>
            {roleSelect(`Role for ${member.user_email}`,details[member.id]||member.role,event=>update(member.id,event.target.value))}
            <button type="button" className="ap-secondary" disabled={lastOwner||!details[member.id]||details[member.id]===member.role}
              onClick={()=>choose('change_role',{member,role:details[member.id]})}>Review role change</button>
            <button type="button" className="ap-secondary" disabled={lastOwner} onClick={()=>choose('remove_member',{member})}>Review member removal</button></li>;
        })}</ul></div>{playerPicker}{roleSelect('New member role',details.role,event=>update('role',event.target.value))}
      </>}</>}
      {(validation||error)&&<p role="alert">{validation||error}</p>}
      <footer><button className="ap-secondary" type="button" onClick={close} disabled={busy}>{result?'Done':'Cancel'}</button>
        {review&&!result&&<button type="button" className="ap-secondary" disabled={busy||Boolean(error)} onClick={()=>setReview(null)}>Back</button>}
        {!result&&<button className={mode==='delete'?'ap-danger':'ap-primary'} disabled={busy||Boolean(error)||(!review&&mode==='team'&&!selected)}>
          {busy?'Saving…':review?`Confirm ${actions[review.action].toLowerCase()}`:mode==='team'?'Review member addition':mode==='create'?'Review organisation creation':'Review organisation deletion'}
        </button>}
      </footer>
    </form>
  </dialog>;
}
