import React, { useId, useState } from 'react';
import { useEventOperation } from './useEventOperation';
import './EventPaymentDialog.css';
import './EventTeamManagementDialog.css';
import { setManagedEventCompleted } from './eventManagementCompletion.js';

function CompletionDialog(props) {
  const {event,client,session,scopeId='all',verifyAccess}=props, title=useId();
  const [completed]=useState(!event.management_completed_at);
  const {bindDialog,busy,error,result,close,run}=useEventOperation(props);
  const submit=e=>{e.preventDefault();run(checks=>setManagedEventCompleted({client,event,completed,expectedUserId:session?.user?.id,scopeId,verifyAccess,...checks}));};
  return <dialog ref={bindDialog} className="ap-payment-dialog ap-team-management-dialog" aria-labelledby={title} onCancel={e=>{e.preventDefault();close();}}><header><div><p>{event.event_name}</p><h2 id={title}>{completed?'Mark event complete':'Reopen event'}</h2></div><button type="button" aria-label="Close completion dialog" disabled={busy} onClick={close}>×</button></header><form onSubmit={submit}>
    {result?<p role="status">{completed?'Event marked complete.':'Event reopened in Event Manager.'}</p>:<><p>{completed?'Move this event to Completed in Event Manager?':'Move this event back to the active Event Manager list?'}</p><p>This is an administrative status only. Calendar dates, public event status, registrations and payments are unchanged.</p>{error&&<p role="alert">{error}</p>}</>}
    <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result?'Done':'Cancel'}</button>{!result&&<button className="ap-primary" disabled={busy||Boolean(error)}>{busy?'Saving…':completed?'Mark complete':'Reopen event'}</button>}</footer>
  </form></dialog>;
}
export default function EventCompletionControl({disabled=false,onClose,...props}) {
  const [open,setOpen]=useState(false);
  // MAIN's management list only contains finance-managed events; the preview's
  // broader calendar list must not offer an action the deployed RPC will reject.
  if (props.event.finance_managed !== true) return null;
  return <><button type="button" className="ap-secondary" disabled={disabled} onClick={()=>setOpen(true)}>{props.event.management_completed_at?'Reopen event':'Mark complete'}</button>{open&&<CompletionDialog {...props} onClose={result=>{setOpen(false);onClose?.(result);}}/>}</>;
}
