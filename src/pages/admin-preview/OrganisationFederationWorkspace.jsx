import {lazy,Suspense,useEffect,useState} from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import RecordLoading from './RecordLoading';
import {ENTITY_FIELDS,loadEntities,saveEntityProfile,entityPatch,entityEqual,loadEntityRelated} from './organisationFederationData';
import {useEventOperation} from './useEventOperation';
import FederationProfileFields from './FederationProfileFields';
import OrganisationProfileFields from './OrganisationProfileFields.jsx';
import OrganisationRecordDialog from './OrganisationRecordDialog.jsx';
import OrganisationRelationships from './OrganisationRelationships.jsx';
import { organisationRecordsAvailable } from './organisationRecords.js';
import { previousSponsorLogo, removeSponsorMedia, sponsorFileIndex } from './organisationSponsorMedia.js';
import { organisationLabels } from './organisationProfileFields.js';
import EntityProfileReviewValue from './EntityProfileReviewValue';
import EntityDecisionPanel from './EntityDecisionPanel';
import './EventPaymentDialog.css';
import './OrganisationFederationWorkspace.css';
import { canOpenOrganisationHostEvents } from './organisationHostEvents.js';

const OrganisationHostEventsWorkspace = lazy(() => import('./OrganisationHostEventsWorkspace.jsx'));

const safeMedia=value=>{try{const url=new URL(value);return ['https:','http:'].includes(url.protocol)?url.href:undefined;}catch{return undefined;}};
const labels={...organisationLabels,status:'Publishing status',verified:'Verified federation',is_national_governing_body:'National governing body',socials:'Social links',personnel:'Personnel',committees:'Committees',name:'Name',short_name:'Short name',slug:'Public page slug',about:'About',website_url:'Website',brand_color:'Brand colour',contact_email:'Contact email',contact_phone:'Contact phone',whatsapp_number:'WhatsApp number',logo_url:'Logo URL',cover_image_url:'Cover image URL',rankedin_events_org_id:'RankedIn events organisation ID',rankedin_rankings_org_id:'RankedIn rankings organisation ID'};
export default function OrganisationFederationWorkspace({kind,client,session,scopeId='all',refreshRevision=0,onOpenPayouts}){
  const [reload,setReload]=useState(0),userId=session?.user?.id;
  const [identity,setIdentity]=useState({kind,client,userId,scopeId,refreshRevision,reload,key:0});
  if(identity.kind!==kind||identity.client!==client||identity.userId!==userId||identity.scopeId!==scopeId||identity.refreshRevision!==refreshRevision||identity.reload!==reload){setIdentity({kind,client,userId,scopeId,refreshRevision,reload,key:identity.key+1});return null;}
  return <Directory key={identity.key} {...{kind,client,session,scopeId,setReload,onOpenPayouts}}/>;
}
function Directory({kind,client,session,scopeId,setReload,onOpenPayouts}){
  const [data,setData]=useState(null),[error,setError]=useState(''),[query,setQuery]=useState(''),[status,setStatus]=useState(''),[selected,setSelected]=useState(null),[busy,setBusy]=useState(false),[notice,setNotice]=useState('');
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{controller.abort();setError('Loading timed out. Reload records to try again.');},30000);loadEntities(client,kind,{userId:session?.user?.id,scopeId,signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setData(value);}).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>clearTimeout(timer));return()=>{clearTimeout(timer);controller.abort();};},[client,kind,session?.user?.id,scopeId]);
  const [canManageRecords,setCanManageRecords]=useState(false),[recordDialog,setRecordDialog]=useState(null);
  const [hostOrganisation,setHostOrganisation]=useState(null);
  const userId=session?.user?.id;
  const platformOrganisations=kind==='organisations'&&scopeId==='all'&&data?.superAdmin===true;
  useEffect(()=>{
    if(!platformOrganisations)return;
    const controller=new AbortController();
    organisationRecordsAvailable(client,{userId,scopeId,signal:controller.signal})
      .then(value=>{if(!controller.signal.aborted)setCanManageRecords(value);})
      .catch(()=>{if(!controller.signal.aborted)setCanManageRecords(false);});
    return ()=>controller.abort();
  },[client,platformOrganisations,scopeId,userId]);
  const openRecordAction=(mode,organisation)=>{setSelected(null);setRecordDialog({mode,organisation});};
  const canOpenHost = organisation => kind === 'organisations' && canOpenOrganisationHostEvents(organisation, {
    scopeId, userId, superAdmin:data?.superAdmin, editableIds:data?.editableIds,
  });
  const openHost = () => { setHostOrganisation(selected); setSelected(null); };
  if (hostOrganisation && canOpenHost(hostOrganisation)) return <Suspense fallback={<RecordLoading label="Loading host events…"/>}>
    <OrganisationHostEventsWorkspace client={client} session={session} scopeId={scopeId} organisation={hostOrganisation} onBack={() => setHostOrganisation(null)}/>
  </Suspense>;
  const title=kind==='organisations'?'Organisations':'Federations';
  const rows=(data?.rows||[]).filter(row=>(!status||row.status===status)&&[row.name,row.short_name,row.contact_email].some(value=>String(value||'').toLowerCase().includes(query.toLowerCase())));
  return <div className="of-workspace"><header className="ap-page-heading"><div><p className="ap-kicker">Administration</p><h1>{title}</h1><p>Profiles and contact details from the existing {title.toLowerCase()} register.</p></div><div className="ap-heading-actions">{platformOrganisations&&canManageRecords&&<button type="button" className="ap-primary" disabled={busy} onClick={()=>openRecordAction('create',null)}>Create organisation</button>}<button className="ap-secondary" disabled={busy} onClick={()=>setReload(value=>value+1)}>Reload records</button></div></header>
    {notice&&<p role="status" className="of-notice">{notice}</p>}
    {!data&&!error?<RecordLoading label={`Loading ${title.toLowerCase()}…`}/>:error?<p role="alert" className="of-notice">{error}</p>:<><div className="ap-filter-bar"><label className="of-search">Search {title.toLowerCase()}<input type="search" value={query} disabled={busy} onChange={e=>setQuery(e.target.value)} placeholder="Name or contact email…"/></label><label>Status<SearchableDropdown value={status} disabled={busy} onChange={e=>setStatus(e.target.value)}><option value="">All statuses</option>{[...new Set(data.rows.map(row=>row.status).filter(Boolean))].sort().map(value=><option key={value}>{value}</option>)}</SearchableDropdown></label></div>
    <section className="ap-section of-table"><table><thead><tr><th>Name</th><th>Contact</th><th>Status</th><th>Profile</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td><div className="of-name">{row.logo_url&&<img src={safeMedia(row.logo_url)} referrerPolicy="no-referrer" width="44" height="44" alt="" loading="lazy"/>}<span><strong>{row.name}</strong><small>{row.short_name||row.slug||'No short name recorded'}</small></span></div></td><td>{row.contact_email||'No contact email'}<small>{row.contact_phone}</small></td><td><span className="ap-status">{row.status||'Not recorded'}</span></td><td><button className="ap-secondary" disabled={busy} onClick={()=>setSelected(row)}>View profile</button></td></tr>)}</tbody></table>{!rows.length&&<p className="of-notice">No records match these filters.</p>}</section><p>{rows.length} of {data.rows.length} records</p></>}

    {selected&&<ProfileDialog key={selected.id} {...{kind,client,session,scopeId}} row={selected} canManageLinks={platformOrganisations} onRecordAction={platformOrganisations&&canManageRecords ? mode=>openRecordAction(mode,selected) : undefined} onOpenPayouts={onOpenPayouts} onOpenHost={canOpenHost(selected) ? openHost : undefined} readOnly={!data.superAdmin&&(!data.editableIds.includes(String(selected.id))||selected.status!=='approved')} onBusyChange={setBusy} onClose={({refresh})=>{setSelected(null);if(refresh)setReload(value=>value+1);}} onSaved={saved=>{setData(current=>({...current,rows:current.rows.map(row=>row.id===saved.id?saved:row)}));setNotice('Profile saved.');}} onDecisionSaved={result=>{
      setNotice(result.message);
      if(kind==='organisations'&&result.action==='application')setData(current=>({...current,rows:current.rows.map(row=>String(row.id)===String(result.targetId)?{...row,status:result.status}:row)}));
    }}/>}
    {recordDialog&&<OrganisationRecordDialog key={recordDialog.mode+':'+(recordDialog.organisation?.id||'new')} client={client} session={session}
      scopeId={scopeId} {...recordDialog} onBusyChange={setBusy}
      onClose={({refresh})=>{setRecordDialog(null);if(refresh)setReload(value=>value+1);}}
      onSaved={result=>{if(result.action==='delete')setData(current=>({...current,rows:current.rows.filter(row=>row.id!==result.id)}));}}/>}
  </div>;
}
function ProfileDialog({kind,client,session,scopeId,row,readOnly,onOpenPayouts,onOpenHost,onRecordAction,canManageLinks,onClose,onSaved,onBusyChange,onDecisionSaved}){
  const [related,setRelated]=useState(null),[relatedError,setRelatedError]=useState('');
  useEffect(()=>{const controller=new AbortController();const timer=setTimeout(()=>{controller.abort();setRelatedError('Linked records timed out. Close and reopen to retry.');},30000);loadEntityRelated(client,kind,row,{userId:session?.user?.id,scopeId,signal:controller.signal}).then(value=>{if(!controller.signal.aborted)setRelated(value);}).catch(err=>{if(!controller.signal.aborted)setRelatedError(err.message);}).finally(()=>clearTimeout(timer));return()=>{clearTimeout(timer);controller.abort();};},[client,kind,row,session?.user?.id,scopeId]);
  const [draft,setDraft]=useState({...row}),[files,setFiles]=useState({}),[review,setReview]=useState(false),[validation,setValidation]=useState('');
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,event:{id:row.id},session,scopeId,onClose,onSaved,onBusyChange});
  const change=(key,value)=>{setDraft(current=>({...current,[key]:value}));setValidation('');};
  const onFile=(key,file)=>{
    setFiles(current=>Object.fromEntries([...Object.entries(current).filter(([field])=>field!==key),...(file ? [[key,file]] : [])]));
    setValidation('');
  };
  const submit=e=>{
    e.preventDefault();
    if(readOnly||decisionBusy||decisionDone)return;
    try{
      const patch=entityPatch(kind,row,draft);
      if(Object.keys(files).some(key=>sponsorFileIndex(key)!=null&&!String(draft.sponsors?.[sponsorFileIndex(key)]?.name||'').trim())){
        setValidation('Name each sponsor with a staged logo.');
        return;
      }
      if(!Object.keys(patch).length&&!Object.keys(files).length){setValidation('No changes to save.');return;}
      if(!review){setReview(true);return;}
      run(checks=>saveEntityProfile(client,kind,row,draft,{userId:session?.user?.id,scopeId,files,isCurrent:checks.isCurrent,onAttempt:checks.onAttempt}));
    }catch(err){setValidation(err.message);}
  };
  const dirty=Object.keys(files).length>0||ENTITY_FIELDS[kind].some(key=>!entityEqual(draft[key]??'',row[key]??''));
  useEffect(()=>{if(!dirty)return;const handler=e=>{e.preventDefault();e.returnValue='';};window.addEventListener('beforeunload',handler);return()=>window.removeEventListener('beforeunload',handler);},[dirty]);
  const [discard,setDiscard]=useState(false),[decisionBusy,setDecisionBusy]=useState(false),[decisionDone,setDecisionDone]=useState(false);
  const changeDecisionBusy=value=>{setDecisionBusy(value);onBusyChange?.(value);};
  const requestClose=()=>{if(busy||decisionBusy)return;if(dirty&&!result)setDiscard(true);else close();};
  return <dialog ref={bindDialog} className="ap-payment-dialog of-dialog" aria-labelledby="of-profile-title" onCancel={e=>{e.preventDefault();requestClose();}}><header><div><p>{kind==='organisations'?'Organisation':'Federation'} profile</p><h2 id="of-profile-title">{row.name}</h2></div><button type="button" disabled={busy||decisionBusy} onClick={requestClose} aria-label="Close profile">×</button></header>
    <form onSubmit={submit}>{readOnly&&<p className="of-notice">Read-only profile. Current profile-edit authority is required to save changes.</p>}{result?<p role="status">Profile changes saved.</p>:<><p>Status: {row.status||'Not recorded'}. {kind==='federations'?'Publishing status and verification can be edited below.':'Approval is unchanged by this editor.'} Membership is unchanged.</p>{review?<><h3>Review profile changes</h3><dl>{Object.entries({...entityPatch(kind,row,draft),...files}).map(([key,value])=><div key={key}><dt>{labels[key]||(sponsorFileIndex(key)!=null?`${draft.sponsors?.[sponsorFileIndex(key)]?.name||'Sponsor'} logo`:key)}</dt><dd className="of-review-pair"><div><small>Current</small><EntityProfileReviewValue field={sponsorFileIndex(key)!=null?'logo_url':key} value={sponsorFileIndex(key)!=null?previousSponsorLogo(row.sponsors,draft.sponsors?.[sponsorFileIndex(key)]?.name):row[key]}/></div><div><small>After saving</small>{files[key] ? <span>Upload {value.name}</span> : <EntityProfileReviewValue field={key} value={value}/>}</div></dd></div>)}</dl></>:<fieldset disabled={readOnly||busy||decisionBusy||decisionDone||!!error} className="of-fields">{kind==='organisations' ? <OrganisationProfileFields draft={draft} onChange={change} files={files} onFile={onFile} onRemoveSponsor={index=>setFiles(previous=>removeSponsorMedia(previous,index))} onValidation={setValidation} /> : <>{ENTITY_FIELDS[kind].filter(key=>!['status','verified','is_national_governing_body','socials','personnel','committees'].includes(key)).map(key=><label key={key}>{labels[key]}{key==='about'?<textarea rows="5" value={draft[key]||''} onChange={e=>change(key,e.target.value)}/>:<input name={key} required={key==='name'||key==='slug'||(kind==='organisations'&&key==='contact_email')} type={key.includes('email')?'email':key.endsWith('_url')?'url':'text'} value={draft[key]||''} onChange={e=>change(key,e.target.value)}/>} {['logo_url','cover_image_url'].includes(key)&&draft[key]&&<img src={safeMedia(draft[key])} referrerPolicy="no-referrer" width="160" height="90" alt={`${labels[key]} preview`}/>}</label>)}<FederationProfileFields draft={draft} onChange={change}/></>}</fieldset>}
    {(validation||error)&&<p role="alert">{validation||error}</p>}</>}
    <details className="of-related"><summary>Linked records</summary>{relatedError?<p role="alert">{relatedError}</p>:!related?<p>Loading linked records…</p>:<>{kind==='federations'&&<><h3>Organisations ({related.organisations.length})</h3>{related.organisations.map(item=><p key={item.id}>{item.name} · {item.status}</p>)}</>}<h3>Events ({related.events.length})</h3>{related.events.map(item=><p key={item.id}>{item.event_name} · {item.start_date||'Date not recorded'} · {item.federation_sanction_status||item.sanction_status||'Status not recorded'}{item.pending_changes_status==='pending'?' · Amendment pending':''}</p>)}</>}</details>
    {!dirty&&!result&&!review&&!decisionDone&&<EntityDecisionPanel kind={kind} client={client} session={session} scopeId={scopeId} entity={row}
      profileBusy={busy} onBusyChange={changeDecisionBusy} onSaved={outcome=>{onDecisionSaved?.(outcome);if(kind==='organisations'&&outcome.action==='application')setDecisionDone(true);}}/>}
    {onOpenHost&&!dirty&&!busy&&!decisionBusy&&<button className="ap-secondary" type="button" onClick={onOpenHost}>Open host events</button>}
    {kind==='organisations'&&row.status==='approved'&&onOpenPayouts&&!dirty&&!busy&&!decisionBusy&&
        <button className="ap-secondary" type="button" onClick={()=>onOpenPayouts(row)}>Banking and payouts</button>}
    {kind==='organisations'&&canManageLinks&&!dirty&&!result&&!review&&!decisionDone&&<OrganisationRelationships client={client} organisation={row} session={session}
      scopeId={scopeId} onBusyChange={changeDecisionBusy}/>}
    {kind==='organisations'&&onRecordAction&&!dirty&&!busy&&!decisionBusy&&!decisionDone&&<div className="of-decision-actions">
      <button className="ap-secondary" type="button" onClick={()=>onRecordAction('team')}>Manage members</button>
      <button className="ap-danger" type="button" onClick={()=>onRecordAction('delete')}>Delete organisation</button>
    </div>}
    {kind==='organisations'&&row.status==='approved'&&row.slug&&<a className="ap-secondary" target="_blank" rel="noopener noreferrer" href={`https://4mpadel.co.za/organisations/${encodeURIComponent(row.slug)}`}>View public page</a>}
    {decisionDone&&<p role="status">Application decision saved. Close to return to the updated register.</p>}
    {discard&&<div className="of-notice"><p>Discard these unsaved profile changes?</p><button className="ap-secondary" type="button" onClick={()=>setDiscard(false)}>Keep editing</button><button className="ap-secondary" type="button" onClick={close}>Discard changes</button></div>}
    <footer><button className="ap-secondary" type="button" disabled={busy||decisionBusy} onClick={requestClose}>{result?'Done':'Close'}</button>{review&&!result&&<button type="button" className="ap-secondary" disabled={busy||!!error} onClick={()=>setReview(false)}>Back to editing</button>}{!result&&!readOnly&&!decisionDone&&<button className="ap-primary" disabled={busy||decisionBusy||!!error}>{busy?'Saving…':review?'Confirm profile changes':'Review changes'}</button>}</footer></form></dialog>;
}
