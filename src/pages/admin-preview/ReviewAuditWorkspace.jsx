import { useEffect, useState } from 'react';
import { ArrowRight, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Link } from 'react-router-dom';
import SearchableDropdown from '../../components/SearchableDropdown';
import RecordLoading from './RecordLoading';
import { ReviewDialog } from './ReviewNavigationDialogs';
import { auditPageSize, loadAuditEvents, loadAuditPage } from './reviewAuditData';
import './ReviewSettingsWorkspace.css';

const categories = ['REGISTRATION', 'PAYMENT', 'DRAW', 'EVENT', 'ADMIN', 'SYSTEM'];

export default function ReviewAuditWorkspace({ client, permissions, scope, refreshRevision }) {
  const allowAll = permissions.role === 'super_admin' && scope.id === 'all';
  const [events, setEvents] = useState(null);
  const [eventId, setEventId] = useState('');
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [revision, setRevision] = useState(0);
  const [result, setResult] = useState(null);
  const [eventsError, setEventsError] = useState('');
  const [selected, setSelected] = useState(null);
  const requestKey = JSON.stringify([eventId, category, query, page, revision, refreshRevision]);

  useEffect(() => {
    const controller = new AbortController();
    setEvents(null);
    setEventsError('');
    setSelected(null);
    loadAuditEvents(client, permissions, scope, controller.signal).then(rows => {
      if (!controller.signal.aborted) {
        setEvents(rows);
        setEventId(current => rows.some(event => String(event.id) === current) ? current : allowAll ? '' : String(rows[0]?.id || ''));
      }
    }).catch(() => {
      if (!controller.signal.aborted) setEventsError('Event access could not be loaded.');
    });
    return () => controller.abort();
  }, [client, permissions, scope, allowAll, refreshRevision, revision]);

  useEffect(() => {
    if (!events || (!allowAll && !eventId)) return;
    const controller = new AbortController();
    setResult(null);
    loadAuditPage(client, { events, eventId, allowAll, category, search: query, offset: (page - 1) * auditPageSize, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setResult({ ...data, key: requestKey }); })
      .catch(() => { if (!controller.signal.aborted) setResult({ error: 'Audit records could not be loaded.', key: requestKey }); });
    return () => controller.abort();
  }, [client, events, eventId, allowAll, category, query, page, requestKey]);

  const view = result?.key === requestKey ? result : null;
  const error = eventsError || view?.error;
  const subject = id => events?.find(event => String(event.id) === String(id))?.event_name || `Event #${id}`;
  const date = value => new Intl.DateTimeFormat('en-ZA', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg' }).format(new Date(value));
  const pages = Math.max(1, Math.ceil((view?.count || 0) / auditPageSize));

  return <>
    <header className="ap-page-heading"><div><p className="ap-kicker">System</p><h1>Audit log</h1><p className="ap-lede">Review actions recorded for events in this workspace.</p></div>
      <button className="ap-secondary" onClick={() => { setRevision(value => value + 1); setPage(1); }}>Reload audit log</button>
    </header>
    <form className="ap-filter-bar" onSubmit={event => { event.preventDefault(); setQuery(search); setPage(1); }}>
      <label className="ap-filter-search"><Search size={16} /><span className="ap-visually-hidden">Search event activity</span>
        <input type="search" placeholder="Search activity" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      <label><span className="ap-visually-hidden">Event</span><SearchableDropdown value={eventId} disabled={!events} onChange={event => { setEventId(event.target.value); setPage(1); }}>
        {allowAll && <option value="">All events</option>}
        {events?.map(event => <option key={event.id} value={event.id}>{event.event_name}</option>)}
      </SearchableDropdown></label>
      <label><span className="ap-visually-hidden">Activity category</span><SearchableDropdown value={category} onChange={event => { setCategory(event.target.value); setPage(1); }}>
        <option value="">All categories</option>{categories.map(value => <option key={value} value={value}>{value}</option>)}
      </SearchableDropdown></label>
      <button className="ap-primary">Search audit log</button>
    </form>
    {error ? <p className="ap-data-notice" role="alert">{error}</p> : !allowAll && events?.length === 0 ? <p>No authorised event records are available.</p> : !view ? <RecordLoading label="Loading audit log…" /> :
      <section className="ap-section pp-table-wrap">
        <table className="pp-table"><thead><tr><th>Date</th><th>Event</th><th>Action</th><th>Actor</th><th>Details</th></tr></thead>
          <tbody>{view.rows.map(item => <tr key={item.id}><td>{date(item.created_at)}</td><td>{subject(item.event_id)}</td>
            <td>{item.summary}<small>{item.category}</small></td><td>{item.actor_email || item.actor_role}</td>
            <td><button className="ap-secondary" type="button" onClick={() => setSelected(item)}>Open activity <ArrowRight size={15}/></button></td></tr>)}</tbody>
        </table>
        {!view.rows.length && <p className="ap-settings-content">No activity matches these filters.</p>}
        <div className="ap-section-heading">
          <button className="ap-secondary" disabled={page === 1} onClick={() => setPage(value => value - 1)}><ChevronLeft size={15}/> Previous</button>
          <span>Page {page} of {pages} · {view.count} records</span>
          <button className="ap-secondary" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Next <ChevronRight size={15}/></button>
        </div>
      </section>}
    {selected && <ReviewDialog title="Event activity" onClose={() => setSelected(null)}>
      <div className="ap-settings-content"><h3>{selected.summary}</h3><p>{subject(selected.event_id)} · {date(selected.created_at)}</p>
        <dl className="ap-settings-quotes"><div><dt>Category</dt><dd>{selected.category}</dd></div><div><dt>Actor</dt><dd>{selected.actor_email || selected.actor_role}</dd></div></dl>
        {allowAll && selected.details && Object.keys(selected.details).length > 0 && <pre>{JSON.stringify(selected.details, null, 2)}</pre>}
        <footer><button className="ap-secondary" onClick={() => setSelected(null)}>Close</button>
          <Link className="ap-primary" to={`/admin-preview/event?event=${encodeURIComponent(selected.event_id)}`}>Open event</Link></footer>
      </div>
    </ReviewDialog>}
  </>;
}
