import { useEffect, useRef, useState } from 'react';
import { verifyPlatformClubAction } from './liveClubOperations.js';

const batchSize = 12;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function verifyScanAccess(client, scopeId, userId, signal) {
  try {
    await verifyPlatformClubAction(client, scopeId, userId, () => !signal.aborted);
  } catch {
    signal.throwIfAborted();
    throw new Error('Active platform Clubs access is required for scanning.');
  }
  const result = await client.rpc('club_google_scan_authorised');
  signal.throwIfAborted();
  if (result.error || result.data !== true) throw new Error('Active platform Clubs access is required for scanning.');
}

async function scanGoogleClubs(client, scopeId, userId, after, signal) {
  await verifyScanAccess(client, scopeId, userId, signal);
  const { data, error } = await client.functions.invoke('scan-club-google-reviewed', {
    body:{limit:batchSize,after}, signal, timeout:90000,
  });
  signal.throwIfAborted();
  if (error || data?.scan_version !== 1 || ![data.processed,data.queued,data.skipped].every(value => Number.isInteger(value) && value >= 0)
    || data.processed > batchSize || !Array.isArray(data.errors) || data.queued + data.skipped + data.errors.length !== data.processed
    || (data.next_cursor !== null && (!uuid.test(data.next_cursor) || data.next_cursor <= (after || '')))) {
    throw new Error('The Google scan could not be confirmed. Refresh matches or retry this batch.');
  }
  await verifyScanAccess(client, scopeId, userId, signal);
  return data;
}

export default function ClubGoogleScan({ client, scopeId, userId, disabled, onScanned, onBusyChange }) {
  const key = JSON.stringify([scopeId,userId]);
  const [access,setAccess] = useState(null);
  const [outcome,setOutcome] = useState(null);
  const request = useRef(null);
  const available = access?.key === key && access?.client === client;
  const current = outcome?.key === key && outcome?.client === client ? outcome : null;
  const last = current?.result;
  const busy = current?.busy === true;
  useEffect(() => {
    if (scopeId !== 'all' || !userId) return;
    const controller = new AbortController();
    verifyScanAccess(client,scopeId,userId,controller.signal)
      .then(() => { if (!controller.signal.aborted) setAccess({key,client}); })
      .catch(() => {});
    return () => {
      controller.abort();
      if (request.current) {
        request.current.abort();
        request.current = null;
        onBusyChange?.(false);
      }
    };
  },[client,scopeId,userId,key,onBusyChange]);

  async function run() {
    if (!available || disabled || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setOutcome({key,client,result:last,busy:true});
    onBusyChange?.(true);
    try {
      const result = await scanGoogleClubs(client,scopeId,userId,last?.next_cursor || null,controller.signal);
      setOutcome({key,client,result});
      onScanned?.();
    } catch (error) {
      if (!controller.signal.aborted) setOutcome({key,client,result:last,error:error.message});
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) onBusyChange?.(false);
    }
  }

  if (!available) return null;
  const label = current?.error ? 'Retry Google scan' : last?.next_cursor ? 'Scan next batch' : last ? 'Scan again' : 'Scan from Google';
  return <div className="fo-report-actions" aria-label="Scan Google listings">
    <button type="button" className="ap-secondary" disabled={disabled || busy} onClick={run}>
      {busy ? 'Scanning clubs…' : label}
    </button>
    {last && <p role="status">Checked {last.processed} · Queued {last.queued} · Skipped {last.skipped} · Failed {last.errors.length}
      {!last.next_cursor && ' · Scan complete'}</p>}
    {current?.error && <p role="alert">{current.error}</p>}
  </div>;
}
