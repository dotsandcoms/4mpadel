import React, { useId, useState } from 'react';
import { useEventOperation } from './useEventOperation';
import SearchableDropdown from '../../components/SearchableDropdown';
import { eligibleRegistrationTeamPartners, findRegistrationTeammate, saveRegistrationTeam } from './registrationTeamManagement.js';
import './EventPaymentDialog.css';
import './EventTeamManagementDialog.css';


export default function EventTeamManagementDialog({client,event,registration,registrations=[],divisions=[],action='merge',session,scopeId='all',verifyAccess,onClose,onSaved,onBusyChange,timeoutMs}) {
  const title=useId(), description=useId();
  const [selectedId,setSelectedId]=useState('');
  const {bindDialog,busy,error,result,close,run}=useEventOperation({client,event,session,scopeId,onClose,onSaved,onBusyChange,timeoutMs});
  const splitting=action==='split', candidates=eligibleRegistrationTeamPartners(registration,registrations,divisions);
  const other=splitting?findRegistrationTeammate(registration,registrations,divisions):candidates.find(row=>String(row.id)===selectedId);
  const submit=e=>{e.preventDefault();if(other)run(checks=>saveRegistrationTeam({client,event,registration,other,action,expectedUserId:session?.user?.id,scopeId,verifyAccess,...checks}));};
  return <dialog ref={bindDialog} className="ap-payment-dialog ap-team-management-dialog" aria-labelledby={title} aria-describedby={description} onCancel={e=>{e.preventDefault();close();}}>
    <header><div><p>{event.event_name}</p><h2 id={title}>{splitting?'Split team':'Merge solo entries'}</h2></div><button type="button" aria-label="Close team dialog" disabled={busy} onClick={close}>×</button></header>
    <form onSubmit={submit}>
      <div className="ap-payment-person"><strong>{registration.full_name || registration.email}</strong><span>{registration.division}</span></div>
      <p id={description}>{splitting?'Both players will become solo entries. Splitting requires an additional team place.':'Choose another entry in this division. You can complete a one-way reservation between these players, or replace a named partner who has not entered.'} Each player keeps their registration, payment and licence details. No emails are sent.</p>
      {result?<p role="status">{splitting?'Team split into two solo entries.':'Entries merged into one team.'}</p>:<>
        {!splitting&&<label>Partner in this division<SearchableDropdown value={selectedId} required disabled={busy||Boolean(error)} onChange={e=>setSelectedId(e.target.value)}><option value="">Select an entry</option>{candidates.map(row=><option value={row.id} key={row.id}>{row.full_name || row.email} · {row.email}</option>)}</SearchableDropdown></label>}
        {other?<div className="ap-team-management-review"><strong>{registration.full_name || registration.email}</strong><span>{splitting?'Split from':'Merge with'}</span><strong>{other.full_name || other.email}</strong></div>:<p>{splitting?'No linked active registration is available.':'No partner selected.'}</p>}
        <p className="ap-payment-live-note">The server checks current entries, division capacity and existing draws before saving.</p>
        {error&&<p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result?'Done':'Cancel'}</button>{!result&&<button className="ap-primary" disabled={!other||busy||Boolean(error)}>{busy?'Saving…':splitting?'Split into solo entries':'Merge into team'}</button>}</footer>
    </form>
  </dialog>;
}
