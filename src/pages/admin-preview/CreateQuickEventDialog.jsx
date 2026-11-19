import React, { useRef } from 'react';
import QuickEventBuilder from '../../components/admin/QuickEventBuilder';
import { supabase } from '../../supabaseClient';
import { verifyEventCreationAccess } from './eventCreation';
import useEventEditorIdentity from './useEventEditorIdentity';

export default function CreateQuickEventDialog({ onClose, client = supabase, session, scopeId = 'all', Builder = QuickEventBuilder }) {
  const identity = useEventEditorIdentity(client, session, scopeId);
  const attempted = useRef(false), saved = useRef(null);
  return <Builder isOpen theme="preview"
    beforeSave={async context => {
      if (client !== supabase && Builder === QuickEventBuilder) throw new Error('This editor cannot write through a different database connection.');
      if (saved.current) throw new Error('This event has already been created.');
      const actor = await identity();
      await verifyEventCreationAccess(client, { ...context, ...actor });
      actor.assertCurrent();
      attempted.current = true;
      return { verifyContinuing: actor.verifyContinuing };
    }}
    onSaved={result => { saved.current = result; }}
    onClose={() => onClose({ refresh: attempted.current, ...(saved.current ? { eventId: saved.current.eventId } : {}) })}/>;
}
