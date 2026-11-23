import { useState } from 'react';
import { useEventOperation } from './useEventOperation.js';
import { organisationImageExtension } from './organisationProfileFields.js';
import { groupFields, groupProfilePatch, groupSocials, groupStatuses, groupSlug, saveClubGroupBranding, saveClubGroupProfile } from './clubGroupProfile.js';
import './OrganisationFederationWorkspace.css';

export default function ClubGroupProfileDialog({ client, session, scopeId, group, branding, onClose, onSaved, onBusyChange }) {
  const [id] = useState(()=>group?.id || crypto.randomUUID());
  const [draft,setDraft]=useState(()=>({...group,status:group?.status || 'published'}));
  const [files,setFiles]=useState({}),[review,setReview]=useState(null),[validation,setValidation]=useState('');
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,session,scopeId,event:{id},onClose,onBusyChange,
    onSaved: saved => onSaved(branding ? saved.warning || `Updated branding for ${saved.applied.length} venues.` : group ? 'Club group saved.' : 'Club group created.')});
  const change=(key,value)=>{
    setDraft(current=>({...current,[key]:value}));
    if (files[key]) setFiles(current=>Object.fromEntries(Object.entries(current).filter(([field])=>field!==key)));
    setValidation('');
  };
  const selectImage=(key,event)=>{
    const file=event.target.files?.[0];event.target.value='';
    if(!file)return;
    try{organisationImageExtension(key,file);setFiles(previous=>({...previous,[key]:file}));setValidation('');}
    catch(issue){setValidation(issue.message);}
  };
  const options=checks=>({client,scopeId,userId:session?.user?.id,...checks});
  const submit=event=>{
    event.preventDefault();
    if(branding){run(checks=>saveClubGroupBranding(options(checks),branding));return;}
    if(review){run(checks=>saveClubGroupProfile(options(checks),group,draft,files,id));return;}
    try{
      const patch=groupProfilePatch(group,draft);
      if(!Object.keys(patch).length&&!Object.keys(files).length){setValidation('No group changes to save.');return;}
      setReview({...patch,...Object.fromEntries(Object.entries(files).map(([key,file])=>[key,`Upload ${file.name}`]))});
    }catch(issue){setValidation(issue.message);}
  };
  const title=branding?'Review shared branding':group?'Edit club group':'Create club group';
  return <dialog ref={bindDialog} className="ap-payment-dialog of-dialog" aria-label={title} onCancel={event=>{event.preventDefault();close();}}>
    <header><h2>{title}</h2><button type="button" aria-label="Close group review" className="ap-secondary" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={submit}>
      {result ? <p role={result.warning?'alert':'status'}>{result.warning || 'Confirmed. Close to refresh groups.'}</p> : branding ? <><p>Apply the group’s shared logo and website to the reviewed venues.</p>
        <ul>{branding.venues.map(venue=><li key={venue.id}>{venue.name}</li>)}</ul>
        <dl>{Object.entries(branding.shared).map(([field,value])=><div key={field}><dt>{groupFields[field]}</dt><dd>{value}</dd></div>)}</dl></>
        : review ? <><h3>Review group changes</h3><dl>{Object.entries(review).map(([field,value])=><div key={field}><dt>{groupFields[field]||'Social links'}</dt><dd>{typeof value==='object'&&value?Object.entries(value).map(([key,text])=>`${key} ${text}`).join(' · '):String(value??'Clear')}</dd></div>)}</dl></>
        : <fieldset className="of-fields" disabled={busy||Boolean(error)}>
          {Object.entries(groupFields).map(([field,label])=><div key={field}>
            {field.startsWith('share_') ? <label className="of-checkbox"><input type="checkbox" checked={Boolean(draft[field])} onChange={event=>change(field,event.target.checked)}/>{label}</label>
              : <label>{label}{field==='about'?<textarea value={draft[field]||''} onChange={event=>change(field,event.target.value)} />:
                field==='status'?<select value={draft[field]} onChange={event=>change(field,event.target.value)}>{Object.entries(groupStatuses).map(([value,text])=><option key={value} value={value}>{text}</option>)}</select>:
                <input name={field} value={draft[field]||''} required={field==='name'||field==='slug'} onChange={event=>change(field,event.target.value)}/>}</label>}
            {field==='slug'&&<button className="ap-secondary" type="button" onClick={()=>change('slug',groupSlug(draft.name))}>Generate group slug</button>}
            {['logo_url','cover_image_url'].includes(field)&&<><label>{field==='logo_url'?'Upload group logo':'Upload group cover'}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event=>selectImage(field,event)}/></label>{files[field]&&<p>{files[field].name}</p>}</>}
          </div>)}
          {groupSocials.map(field=><label key={field}>{field}<input value={draft.socials?.[field]||''} onChange={event=>change('socials',{...draft.socials,[field]:event.target.value})}/></label>)}
        </fieldset>}
      {(validation||error)&&<p role="alert">{validation||error}</p>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result?'Done':'Cancel'}</button>
        {review&&!result&&<button type="button" className="ap-secondary" disabled={busy||Boolean(error)} onClick={()=>setReview(null)}>Back to editing</button>}
        {!result&&<button className="ap-primary" disabled={busy||Boolean(error)}>{busy?'Saving…':branding?'Confirm shared branding':review?'Confirm group changes':'Review group changes'}</button>}
      </footer>
    </form>
  </dialog>;
}
