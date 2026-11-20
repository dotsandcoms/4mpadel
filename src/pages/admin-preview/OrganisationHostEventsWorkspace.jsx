import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronLeft, Plus } from 'lucide-react';
import { dateLabel } from './playersData.js';
import { publicEventUrl } from './calendarData.js';
import RecordLoading from './RecordLoading.jsx';
import OrganisationHostEventEditor from './OrganisationHostEventEditor.jsx';
import OrganisationSanctionRevocationDialog from './OrganisationSanctionRevocationDialog.jsx';
import WeeklyEventDraftsDialog from './WeeklyEventDraftsDialog.jsx';
import { loadOrganisationHosts } from './organisationHostEvents.js';

const sanctionStatus = event => {
  if (event.sanction_status === 'rejected') return 'Sanction declined';
  if (!event.sanction_requested) return 'No sanction requested';
  const status = event.federation_sanction_status;
  return { approved: 'Federation approved', rejected: 'Federation declined', pending: 'Federation review pending' }[status] || 'Sanction requested';
};

export default function OrganisationHostEventsWorkspace({
  client, session, scopeId, organisation, onBack, Editor = OrganisationHostEventEditor,
}) {
  const [records, setRecords] = useState(null);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState(null);
  const [revision, setRevision] = useState(0);
  const actorId = session?.user?.id, organisationId = organisation.id;
  useEffect(() => {
    const controller = new AbortController();
    setRecords(null);
    setError('');
    loadOrganisationHosts({ client, organisationId, scopeId, actorId, signal: controller.signal })
      .then(result => { if (!controller.signal.aborted) setRecords(result); })
      .catch(problem => { if (!controller.signal.aborted) setError(problem.message || 'Host events could not be loaded.'); });
    return () => controller.abort();
  }, [client, organisationId, scopeId, actorId, revision]);

  const close = result => {
    setEditor(null);
    if (result?.refresh) setRevision(value => value + 1);
  };

  return <div className="of-workspace">
    <header className="ap-page-heading"><div><p className="ap-kicker">Organisations</p>
      <h1>{organisation.name} host events</h1><p>Create and manage events hosted by this organisation.</p></div>
      <div className="ap-heading-actions">
        <button className="ap-secondary" type="button" onClick={onBack}><ChevronLeft size={16}/> Organisations</button>
        {records && <><button className="ap-secondary" type="button" onClick={() => setEditor({ draftList: true })}>Weekly drafts</button>
          <button className="ap-secondary" type="button" onClick={() => setEditor({ quick: true })}>Quick event</button>
          <button className="ap-primary" type="button" onClick={() => setEditor({ quick: false })}><Plus size={16}/> Create event</button></>}
      </div>
    </header>
    {error && <p role="alert" className="of-notice">{error}</p>}
    {!records && !error && <RecordLoading label="Loading the organisation’s events…"/>}
    {records && <section className="ap-section of-table"><table>
      <thead><tr><th>Event</th><th>Date and venue</th><th>Public status</th><th>Sanctioning</th><th>Actions</th></tr></thead>
      <tbody>{records.events.map(event => {
        const editable = event.is_manual && event.event_status !== 'cancelled';
        const url = publicEventUrl(event);
        const declined = event.sanction_status === 'rejected' || (event.sanction_requested && event.federation_sanction_status === 'rejected');
        const feedback = declined && event.rejection_notes?.trim();
        return <tr key={event.id}>
          <td><strong>{event.event_name}</strong><small>{event.is_quick_event ? 'Quick event' : event.is_weekly ? 'Weekly series' : 'Event'}</small></td>
          <td>{dateLabel(event.start_date)}<small>{event.venue || 'Venue not recorded'}</small></td>
          <td>{event.event_status === 'cancelled' ? 'Cancelled' : event.is_visible === false ? 'Hidden' : 'Visible'}</td>
          <td>{sanctionStatus(event)}{feedback && <p className="of-rejection-feedback"><strong>Rejection feedback</strong><br />{feedback}</p>}</td>
          <td><div className="of-decision-actions">
            {editable && <button className="ap-secondary" type="button" onClick={() => setEditor({ event })}>
              {event.is_weekly && event.series_id ? 'Edit weekly series' : event.is_quick_event ? 'Edit quick event' : 'Edit event'}
            </button>}
            {event.sanction_status === 'approved' && <Link className="ap-secondary" to={`/admin-preview/event?event=${event.id}`}>Manage event</Link>}
            {event.sanction_status === 'approved' && records.platform === true && scopeId === 'all' &&
              <button className="ap-secondary" type="button" onClick={() => setEditor({ sanction: event })}>Revoke sanction</button>}
            {url && <a className="ap-secondary" href={url} target="_blank" rel="noreferrer">Public event</a>}
          </div></td>
        </tr>;
      })}</tbody>
    </table>{!records.events.length && <p className="of-notice">This organisation has no events.</p>}</section>}
    {editor?.sanction ? <OrganisationSanctionRevocationDialog client={client} session={session} scopeId={scopeId}
      organisationId={organisationId} event={editor.sanction} onClose={close}/>
      : editor?.draftList ? <WeeklyEventDraftsDialog key={`${actorId}:${scopeId}:${organisationId}`} client={client} host={organisationId}
      onOpen={weeklyDraft => setEditor({ weeklyDraft })} onClose={close}/>
      : editor && <Editor client={client} session={session} scopeId={scopeId} organisationId={organisationId} {...editor} onClose={close}/>}
  </div>;
}
