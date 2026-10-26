import React, { useRef } from 'react';
import EventBuilder from '../../components/admin/EventBuilder';
import { supabase } from '../../supabaseClient';
import { verifyEventCreationAccess } from './eventCreation';
import useEventEditorIdentity from './useEventEditorIdentity';

export default function CreateEventDialog({ onClose, client = supabase, session, scopeId = 'all', Builder = EventBuilder, verify = verifyEventCreationAccess }) {
  const identity = useEventEditorIdentity(client, session, scopeId);
  const attempted = useRef(false);
  const complete = useRef(false);
  const beforeSave = async context => {
    if (client !== supabase && Builder === EventBuilder) throw new Error('This editor cannot write through a different database connection.');
    if (complete.current) throw new Error('This event has already been created. Open its details to edit it.');
    const actor = await identity();
    await verify(client, { ...context, ...actor });
    actor.assertCurrent();
    attempted.current = true;
    return { verifyContinuing: actor.verifyContinuing };
  };
  return <Builder isOpen theme="preview" beforeSave={beforeSave}
    onClose={() => onClose({ refresh: attempted.current })}
    onSaved={result => {
      if (complete.current) return;
      complete.current = true;
      onClose({ refresh: true, eventId: result.eventId });
    }}/ >;
}
