import { useState } from 'react';
import TournamentWorkspace from './tournament/TournamentWorkspace.jsx';
import AdvancedEventDetailsDialog from './AdvancedEventDetailsDialog.jsx';
import CreateEventDialog from './CreateEventDialog.jsx';

// Calendar owns event setup; Tournament Manager owns its deployed tm_* workflow.
export default function TournamentAdminWorkspace({ client, session, scopeId, refreshRevision, canBuildEvents }) {
  const [editor, setEditor] = useState(null);
  const [revision, setRevision] = useState(0);
  const close = result => {
    setEditor(null);
    if (result?.refresh) setRevision(value => value + 1);
  };
  return <>
    <TournamentWorkspace client={client} session={session} scopeId={scopeId} refreshRevision={`${refreshRevision}:${revision}`}
      canBuildEvents={canBuildEvents}
      onCreateEvent={canBuildEvents ? () => setEditor({ mode: 'create' }) : undefined}
      onEditEvent={canBuildEvents ? event => setEditor({ mode: 'edit', event }) : undefined}/>
    {canBuildEvents && editor?.mode === 'create' && <CreateEventDialog client={client} session={session} scopeId={scopeId} onClose={close}/>}
    {canBuildEvents && editor?.mode === 'edit' && <AdvancedEventDetailsDialog client={client} session={session} scopeId={scopeId} event={editor.event} onClose={close}/>}
  </>;
}
