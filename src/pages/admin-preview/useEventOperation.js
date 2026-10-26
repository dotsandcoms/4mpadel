import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
// One attempt per review: a lost RPC response must be reconciled by reloading.
export function useEventOperation({client,event,session,scopeId,onClose,onSaved,onBusyChange,timeoutMs=30000}) {
  const ref=useRef(null), mounted=useRef(true), lock=useRef(false), attempted=useRef(false);
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null);
  const identity=useMemo(()=>({active:true,client,eventId:event.id,userId:session?.user?.id,scopeId}),[client,event.id,session?.user?.id,scopeId]);
  const [original]=useState(identity);
  useLayoutEffect(()=>{identity.active=true;return()=>{identity.active=false;};},[identity]);
  const isCurrent=()=>mounted.current && identity===original && identity.active;
  useEffect(()=>{mounted.current=true; const node=ref.current,trigger=document.activeElement,overflow=document.body.style.overflow; node.showModal();document.body.style.overflow='hidden';return()=>{mounted.current=false;node.close();document.body.style.overflow=overflow;trigger?.isConnected&&trigger.focus();};},[]);
  const close=()=>{if(!lock.current)onClose?.({refresh:attempted.current});};
  async function run(operation) {
    if(lock.current || error || result)return;
    if(!isCurrent()){setError('The workspace changed. Close and reopen this action.');return;}
    lock.current=true;setBusy(true);onBusyChange?.(true);let expired=false,timer;
    try{
      const data=await Promise.race([operation({isCurrent:()=>!expired&&isCurrent(),onAttempt:()=>{attempted.current=true;}}),new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error('The request timed out. Its outcome may be unknown.'));},timeoutMs);})]);
      if(isCurrent()){setResult(data);onSaved?.(data);}
    }catch(err){if(mounted.current)setError(`${err.message || 'The action could not be confirmed.'} Close and refresh before trying again.`);}
    finally{clearTimeout(timer);lock.current=false;if(mounted.current)setBusy(false);onBusyChange?.(false);}
  }
  const bindDialog=useCallback(node=>{ref.current=node;},[]);
  return {bindDialog,busy,error,result,close,run};
}
