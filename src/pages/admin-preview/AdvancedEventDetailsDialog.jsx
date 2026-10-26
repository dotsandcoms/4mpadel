import React, { useEffect, useLayoutEffect, useId, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import EventBuilder from '../../components/admin/EventBuilder';
import { loadEventAdvancedSnapshot, verifyEventAdvancedAccess } from './eventAdvancedGuard';
import RecordLoading from './RecordLoading';
import './EventDetailsDialog.css';
import { eventContinuation } from './eventContinuation';

// The exact live tabs, fields and workflow, presented with the preview theme.
export default function AdvancedEventDetailsDialog({ event, onClose, client = supabase, session, scopeId = 'all', load = loadEventAdvancedSnapshot, verify = verifyEventAdvancedAccess, Builder = EventBuilder }) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState('');
  const attempted = useRef(false);
  const live = useRef(null);
  useLayoutEffect(() => {
    let current = true;
    const token = { client, eventId: event.id, scopeId, userId: session?.user?.id };
    live.current = token;
    setSnapshot(null); setError('');
    (async () => {
      if (scopeId !== 'all') throw new Error('Event setup requires the all-workspaces scope.');
      const { data, error: authError } = await client.auth.getUser();
      if (authError || !data?.user?.id || (session?.user?.id && session.user.id !== data.user.id)) throw new Error('Sign in again before editing this event.');
      const value = await load(client, event.id);
      if (current) setSnapshot({ ...value, actorId: data.user.id, contextToken: token });
    })().catch(err => { if (current) setError(err.message); });
    return () => { current = false; live.current = null; };
  }, [client, event.id, load, scopeId, session?.user?.id]);
  const beforeSave = async (context = {}) => {
    if (client !== supabase && Builder === EventBuilder) throw new Error('This editor cannot write through a different database connection.');
    const assertCurrent = () => {
      if (!snapshot.contextToken || live.current !== snapshot.contextToken) throw new Error('The editor context changed. Close and reopen this event.');
    };
    assertCurrent();
    const verified = await verify({ client, original: snapshot.event, divisions: snapshot.divisions, siblings: snapshot.siblings, expectedUserId: snapshot.actorId, scopeId, checkDivisions: true, checkSiblings: Boolean(snapshot.event.is_weekly && snapshot.event.series_id) });
    assertCurrent();
    if ((context.event && String(context.event.id) !== String(snapshot.event.id)) || (context.form?.series_id && context.form.series_id !== snapshot.event.series_id)) throw new Error('The amendment changes the event or series identity. Close and review it before saving.');
    const ids = new Set(snapshot.divisions.map(row => String(row.id)));
    if ((context.removedDivisionIds || []).some(id => !ids.has(String(id))) || (context.divisions || []).some(row => row.id && !ids.has(String(row.id)))) throw new Error('An amendment references a division outside this event. Close and review the amendment before saving.');
    attempted.current = true;
    return { ...verified, verifyContinuing: eventContinuation({ client, actorId: snapshot.actorId, token: snapshot.contextToken, getCurrent: () => live.current }) };
  };
  if (!snapshot) return <EditorFrame event={event} onClose={() => onClose({ refresh: false })}>{error ? <p role="alert">{error}</p> : <RecordLoading label="Loading event workflows…" detail="Reading the event, divisions and any linked weekly occurrences."/>}</EditorFrame>;
  if (snapshot.event.is_quick_event) return <EditorFrame event={event} onClose={() => onClose({ refresh: true })}><p role="alert">This is a quick event. Close to refresh its editor selection, then reopen it.</p></EditorFrame>;
  if (snapshot.event.event_status === 'cancelled' || !snapshot.event.is_manual) return <EditorFrame event={event} onClose={() => onClose({ refresh: false })}><p role="alert">{snapshot.event.event_status === 'cancelled' ? 'This event is cancelled. Reopening it requires a separate workflow.' : 'Imported events are managed by their source system.'}</p></EditorFrame>;
  return <Builder isOpen theme="preview" editingEvent={snapshot.event} beforeSave={beforeSave}
    onClose={() => onClose({ refresh: attempted.current })}
    onSaved={async () => { attempted.current = true; try { const next = await load(client, event.id); if (live.current === snapshot.contextToken) setSnapshot({ ...next, actorId: snapshot.actorId, contextToken: snapshot.contextToken }); } catch { if (live.current === snapshot.contextToken) onClose({ refresh: true }); } }}/ >;
}

export function EditorFrame({ event, onClose, busy = false, children }) {
  const node = useRef(null), title = useId();
  useEffect(() => {
    const dialog = node.current, trigger = document.activeElement, overflow = document.body.style.overflow;
    dialog.showModal(); document.body.style.overflow = 'hidden';
    return () => { dialog.close(); document.body.style.overflow = overflow; if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={node} className="ap-payment-dialog ap-event-details-dialog" aria-labelledby={title} onCancel={e => { e.preventDefault(); if (!busy) onClose(); }}>
    <header><div><p>{event.event_name}</p><h2 id={title}>Edit event</h2></div><button type="button" className="ap-icon-button" disabled={busy} onClick={onClose} aria-label="Close event editor"><X size={20}/></button></header>{children}
  </dialog>;
}
