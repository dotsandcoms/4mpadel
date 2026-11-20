import { useLayoutEffect, useRef, useState } from 'react';
import EventBuilder from '../../components/admin/EventBuilder';
import QuickEventBuilder from '../../components/admin/QuickEventBuilder';
import { supabase } from '../../supabaseClient';
import { EditorFrame } from './AdvancedEventDetailsDialog.jsx';
import RecordLoading from './RecordLoading.jsx';
import { hasPendingDivisionAmendment } from './eventAdvancedGuard.js';
import { loadOrganisationHostEditor, reloadSavedOrganisationHostEvent, verifyOrganisationHostBuilder, verifyOrganisationHostEdit } from './organisationHostEvents.js';

export default function OrganisationHostEventEditor({
  client, session, scopeId, organisationId, event, weeklyDraft, quick = false, onClose,
  FullBuilder = EventBuilder, QuickBuilder = QuickEventBuilder,
}) {
  const [opened, setOpened] = useState(null);
  const [error, setError] = useState('');
  const live = useRef(null);
  const attempted = useRef(false);
  const saved = useRef(false);
  const actorId = session?.user?.id;

  useLayoutEffect(() => {
    const token = { client, actorId, organisationId, scopeId, eventId: event?.id };
    live.current = token;
    attempted.current = false;
    saved.current = false;
    setOpened(null);
    setError('');
    const isCurrent = () => live.current === token;
    loadOrganisationHostEditor({ client, organisationId, scopeId, actorId, isCurrent, event })
      .then(result => {
        if (isCurrent()) setOpened({ ...result, initialSnapshot: result.snapshot, token });
      })
      .catch(problem => { if (isCurrent()) setError(problem.message || 'The event editor could not be opened.'); });
    return () => { if (isCurrent()) live.current = null; };
  }, [client, organisationId, scopeId, actorId, event, weeklyDraft?.id]);

  const close = () => onClose({ refresh: attempted.current });
  if (!opened) return <EditorFrame event={event || { event_name: 'Organisation host events' }} onClose={close}>
    {error ? <p role="alert">{error}</p> : <RecordLoading label="Checking the organisation and calendar event…"/>}
  </EditorFrame>;

  const { snapshot, initialSnapshot, capability } = opened;
  const useQuick = initialSnapshot ? initialSnapshot.event.is_quick_event === true : quick;
  const Builder = useQuick ? QuickBuilder : FullBuilder;
  if (hasPendingDivisionAmendment(snapshot?.event)) return <EditorFrame event={snapshot.event} onClose={close}>
    <p role="status">This event has a division amendment awaiting review. Check the request under Pending decisions before editing.</p>
  </EditorFrame>;
  const editingEvent = initialSnapshot?.event.is_quick_event
    ? { ...initialSnapshot.event, _quickDivision: initialSnapshot.divisions[0] }
    : initialSnapshot?.event;

  const beforeSave = async context => {
    if (client !== supabase && (Builder === EventBuilder || Builder === QuickEventBuilder)) {
      throw new Error('This editor cannot write through a different database connection.');
    }
    const isCurrent = () => live.current === opened.token;
    if (!isCurrent()) throw new Error('This editor has changed. Close and reopen it.');
    if (saved.current) throw new Error('This event has been saved. Close and reopen it to make further changes.');
    const access = { client, organisationId, scopeId, actorId, isCurrent };
    await verifyOrganisationHostEdit({ ...access, snapshot, context });
    if (!isCurrent()) throw new Error('This editor has changed. Close and reopen it.');
    attempted.current = true;
    return { verifyContinuing: () => verifyOrganisationHostBuilder({ ...access, event: snapshot?.event }) };
  };

  const reloadSavedEvent = async savedId => {
    const isCurrent = () => live.current === opened.token;
    const next = await reloadSavedOrganisationHostEvent({ client, organisationId, scopeId, actorId, isCurrent,
      savedId, previous: snapshot });
    setOpened(current => current?.token === opened.token ? { ...current, snapshot: next } : current);
    return next.event;
  };

  return <Builder isOpen theme="preview" organisation={capability.organisation} organisationClubs={capability.clubs}
    editingEvent={editingEvent} reviewedWeeklySeries={snapshot?.siblings} beforeSave={beforeSave}
    {...(!useQuick && { reloadSavedEvent, allowWeeklyDrafts: true, weeklyDraft })}
    onSaved={result => {
      saved.current = useQuick;
      attempted.current = true;
      if (result?.weeklyDraftId) close();
    }}
    onClose={close}/>;
}
