import React, { useLayoutEffect, useMemo, useRef, useState } from 'react';
import QuickEventBuilder from '../../components/admin/QuickEventBuilder';
import { supabase } from '../../supabaseClient';
import { EditorFrame } from './AdvancedEventDetailsDialog';
import RecordLoading from './RecordLoading';
import { loadQuickEventSnapshot, verifyQuickEventAccess } from './quickEventEditing';
import { eventContinuation } from './eventContinuation';

export default function QuickEventDetailsDialog({ event, onClose, client = supabase, session, scopeId = 'all', Builder = QuickEventBuilder }) {
  const [snapshot, setSnapshot] = useState(null), [error, setError] = useState('');
  const attempted = useRef(false), saved = useRef(false);
  const live = useRef(null);
  useLayoutEffect(() => {
    let current = true;
    const token = { client, eventId: event.id, scopeId, userId: session?.user?.id };
    live.current = token;
    setSnapshot(null); setError(''); saved.current = false;
    (async () => {
      if (scopeId !== 'all') throw new Error('Event setup requires the all-workspaces scope.');
      const { data, error: authError } = await client.auth.getUser();
      if (authError || !data?.user?.id || (session?.user?.id && session.user.id !== data.user.id)) throw new Error('Sign in again before editing this event.');
      const value = await loadQuickEventSnapshot(client, event.id);
      if (current) setSnapshot({ ...value, actorId: data.user.id, scopeId, contextToken: token });
    })().catch(err => { if (current) setError(err.message); });
    return () => { current = false; live.current = null; };
  }, [client, event.id, scopeId, session?.user?.id]);
  const editingEvent = useMemo(() => snapshot && ({ ...snapshot.event, _quickDivision: snapshot.divisions[0] }), [snapshot]);
  const close = () => onClose({ refresh: attempted.current });
  if (!snapshot) return <EditorFrame event={event} onClose={close}>{error ? <p role="alert">{error}</p> : <RecordLoading label="Loading quick event…" detail="Reading the event and its existing division."/>}</EditorFrame>;
  return <Builder isOpen theme="preview" editingEvent={editingEvent}
    beforeSave={async context => {
      if (client !== supabase && Builder === QuickEventBuilder) throw new Error('This editor cannot write through a different database connection.');
      const assertCurrent = () => {
        if (!snapshot.contextToken || live.current !== snapshot.contextToken) throw new Error('The editor context changed. Close and reopen this event.');
      };
      assertCurrent();
      if (saved.current) throw new Error('This event has already been saved. Close and reopen it to make further changes.');
      await verifyQuickEventAccess(client, snapshot, context);
      assertCurrent();
      if (context.operation === 'save') attempted.current = true;
      return { verifyContinuing: eventContinuation({ client, actorId: snapshot.actorId, token: snapshot.contextToken, getCurrent: () => live.current }) };
    }}
    onSaved={() => { saved.current = true; }} onClose={close}/>;
}
