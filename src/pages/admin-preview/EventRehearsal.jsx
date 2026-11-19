import { useEffect, useId, useRef, useState } from 'react';
import { FlaskConical, RefreshCw } from 'lucide-react';
import { rehearsalStorageKey } from '../../utils/privateDrawRehearsal.js';
import './EventPaymentDialog.css';
import './EventRehearsal.css';

const matchesSnapshot = (value, owner, eventId) => value?.version === 1 && value.owner_id === owner && String(value.event?.id) === String(eventId);

export default function EventRehearsal({ client, session, event, onClose }) {
  const dialog = useRef(null);
  const frame = useRef(null);
  const storageKey = useRef(null);
  const title = useId();
  const [revision, setRevision] = useState(0);
  const [snapshot, setSnapshot] = useState(null);
  const [error, setError] = useState('');
  const [storageError, setStorageError] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const userId = session?.user?.id;
  const eventId = event.id;

  useEffect(() => {
    const node = dialog.current;
    const invoking = document.activeElement;
    node.showModal();
    return () => { node.close(); if (invoking?.isConnected) invoking.focus(); };
  }, []);

  useEffect(() => {
    let active = true;
    async function load() {
      try {
        const { data: auth, error: authError } = await client.auth.getUser();
        if (!active) return;
        if (authError || !userId || auth?.user?.id !== userId) throw new Error('Sign in again before starting a rehearsal.');
        const { data, error: snapshotError } = await client.rpc('private_draw_rehearsal_snapshot', { p_event_id: eventId });
        if (!active) return;
        if (snapshotError) throw snapshotError;
        if (!matchesSnapshot(data, userId, eventId)) throw new Error('The private event snapshot could not be verified.');
        storageKey.current = rehearsalStorageKey(userId, eventId);
        let saved;
        try { saved = JSON.parse(localStorage.getItem(storageKey.current)); } catch { /* Start with the fresh snapshot. */ }
        setSnapshot(matchesSnapshot(saved, userId, eventId) ? saved : data);
      } catch (failure) {
        if (active) setError(failure.message);
      }
    }
    load();
    return () => { active = false; };
  }, [client, eventId, revision, userId]);

  useEffect(() => {
    if (!snapshot) return;
    function receive(message) {
      // An opaque sandbox has origin "null". Match the mounted frame's window.
      if (message.source !== frame.current?.contentWindow) return;
      if (message.data?.type === '4m-rehearsal-ready') {
        frame.current.contentWindow.postMessage({ type: '4m-rehearsal-init', snapshot }, '*');
      }
      if (message.data?.type === '4m-rehearsal-save' && matchesSnapshot(message.data.snapshot, userId, eventId)) {
        try { localStorage.setItem(storageKey.current, JSON.stringify(message.data.snapshot)); setStorageError(''); }
        catch { setStorageError('This browser could not save this rehearsal. Keep the window open to continue.'); }
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [snapshot, userId, eventId]);

  function restart() {
    try { localStorage.removeItem(storageKey.current); }
    catch { setStorageError('Could not clear this rehearsal. Check browser storage and try again.'); return; }
    setConfirmReset(false);
    setSnapshot(null);
    setError('');
    setStorageError('');
    setRevision(value => value + 1);
  }

  return <dialog ref={dialog} className="ap-payment-dialog ap-rehearsal-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}><FlaskConical size={20} /> Private draw rehearsal</h2><p>Practise draws, scheduling and scores on a private copy saved in this browser.</p></div>
      <div className="ap-player-payment-actions"><button type="button" className="ap-secondary" disabled={!snapshot} onClick={() => setConfirmReset(true)}><RefreshCw size={16} /> Start fresh copy</button>
        <button type="button" className="ap-secondary" onClick={onClose}>Leave rehearsal</button></div></header>
    {confirmReset && <section className="ap-rehearsal-status" aria-label="Replace the private copy">
      <p>Replace your saved rehearsal with a fresh copy of the event?</p>
      <button type="button" className="ap-secondary" onClick={() => setConfirmReset(false)}>Keep rehearsal</button>
      <button type="button" className="ap-primary" onClick={restart}>Replace private copy</button>
    </section>}
    {storageError && <p className="ap-rehearsal-status" role="alert">{storageError}</p>}
    {error ? <div className="ap-rehearsal-status"><p role="alert">{error}</p><button type="button" className="ap-secondary" onClick={() => { setError(''); setRevision(value => value + 1); }}>Retry</button></div>
      : snapshot ? <iframe ref={frame} key={revision} title="Private draw workspace" src="/private-draw-rehearsal/index.html" sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" />
      : <p className="ap-rehearsal-status" role="status">Copying event for rehearsal…</p>}
  </dialog>;
}

export function EventRehearsalWorkspace({ client, session }) {
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState(null);
  const userId = session?.user?.id;
  useEffect(() => {
    let active = true;
    (async () => {
      const { data: auth, error: authError } = await client.auth.getUser();
      if (!active) return;
      if (authError || !userId || auth?.user?.id !== userId) throw new Error('Sign in again to list private rehearsal events.');
      const { data, error: eventError } = await client.rpc('list_private_draw_rehearsal_events');
      if (!active) return;
      if (eventError) throw eventError;
      setEvents(data || []);
    })().catch(err => { if (active) setError(err.message); });
    return () => { active = false; };
  }, [client, userId]);
  return <section className="ap-section ap-rehearsal-status">
    <h1>Private draw rehearsal</h1>
    {error ? <p role="alert">{error}</p> : !events ? <p role="status">Loading eligible events…</p> : !events.length ? <p>No eligible events are available.</p> :
      <ul className="ap-rehearsal-events">{events.map(event => <li key={event.id}><span>{event.event_name}</span>
        <button type="button" className="ap-secondary" onClick={() => setSelected(event)}>Start private rehearsal</button></li>)}</ul>}
    {selected && <EventRehearsal client={client} session={session} event={selected} onClose={() => setSelected(null)} />}
  </section>;
}
