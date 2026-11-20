import { useId, useRef, useState } from 'react';
import { ChevronRight, Filter, Search } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { ReviewDialog } from './ReviewNavigationDialogs';
import { formatAuditDate } from './reviewAuditData';

const pageSize = 50;
const tones = { payment:'payment', player:'amber', admin:'violet', draw:'info', registration:'processed' };
const summary = row => row.summary || row.action || 'Event update';
const actor = (row, includePrivate) => (includePrivate && row.actor_email) || row.actor_role || 'System';

export default function EventActivityLog({ event, activity, includePrivate = false }) {
  const filtersId = useId();
  const heading = useRef(null);
  const [options, setOptions] = useState(false);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const records = activity.filter(row => String(row.event_id) === String(event.id));
  const categories = [...new Set(records.map(row => row.category).filter(Boolean))].sort();
  const search = query.trim().toLowerCase();
  const filtered = records.filter(row => (!category || row.category === category)
    && (!search || [summary(row), actor(row, includePrivate)].some(value => String(value).toLowerCase().includes(search))));
  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const offset = (current - 1) * pageSize;
  const selected = records.find(row => row.id === selectedId);
  function changePage(next) {
    setPage(next);
    heading.current?.scrollIntoView({ block:'start' });
    heading.current?.focus({ preventScroll:true });
  }

  return <>
    <div className="ap-tab-heading">
      <div><h2 ref={heading} tabIndex={-1}>Activity log</h2><p>Registration, payment, draw and event changes.</p></div>
      <button type="button" className="ap-secondary" aria-expanded={options} aria-controls={filtersId}
        onClick={() => setOptions(value => !value)}><Filter size={15} /> Log options</button>
    </div>
    <div id={filtersId} hidden={!options}>
      <div className="ap-event-toolbar">
        <label className="ap-filter-search"><Search size={16} /><span className="ap-visually-hidden">Search event activity</span>
          <input type="search" value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search action or actor" /></label>
        <SearchableDropdown aria-label="Activity category" value={category} onChange={e => { setCategory(e.target.value); setPage(1); }}>
          <option value="">All categories</option>{categories.map(value => <option key={value}>{value}</option>)}
        </SearchableDropdown>
        {(query || category) && <button type="button" className="ap-secondary" onClick={() => { setQuery(''); setCategory(''); setPage(1); }}>Clear activity filters</button>}
      </div>
    </div>
    {!filtered.length ? <p className="ap-data-notice" role="status">{records.length ? 'No activity matches these filters.' : 'No activity recorded for this event.'}</p> :
      <section className="ap-section ap-activity-table" aria-label="Event activity records">
        <div className="ap-activity-row ap-event-demo-head" aria-hidden="true"><span>Date</span><span>Change</span><span>Actor</span><span>Area</span><span /></div>
        {filtered.slice(offset, offset + pageSize).map(row => <button type="button" className="ap-activity-row" key={row.id}
          onClick={() => setSelectedId(row.id)}>
          <span><b>{formatAuditDate(row.created_at)}</b></span><span><b>{summary(row)}</b></span>
          <span>{actor(row, includePrivate)}</span>
          <span className={`ap-status ap-status--${tones[String(row.category).toLowerCase()] || 'neutral'}`}>{row.category || 'System'}</span>
          <ChevronRight size={16} aria-hidden="true" />
        </button>)}
      </section>}
    {filtered.length > 0 && <nav className="ap-pagination" aria-label="Activity log pages">
      <span role="status">Showing {offset + 1}–{Math.min(offset + pageSize, filtered.length)} of {filtered.length} entries</span>
      <div><button type="button" className="ap-secondary" disabled={current === 1} onClick={() => changePage(current - 1)}>Previous</button>
        <span>Page {current} of {pages}</span>
        <button type="button" className="ap-secondary" disabled={current === pages} onClick={() => changePage(current + 1)}>Next</button></div>
    </nav>}
    {selected && <ReviewDialog title="Event activity" onClose={() => setSelectedId(null)}>
      <div className="ap-settings-content">
        <h3>{summary(selected)}</h3><p>{event.event_name} · {formatAuditDate(selected.created_at, true)}</p>
        <dl className="ap-details-list"><div><dt>Category</dt><dd>{selected.category || 'System'}</dd></div>
          <div><dt>Actor</dt><dd>{actor(selected, includePrivate)}</dd></div></dl>
        {includePrivate && selected.details && Object.keys(selected.details).length > 0 && <pre style={{ overflowX:'auto' }}>{JSON.stringify(selected.details, null, 2)}</pre>}
        <footer><button type="button" className="ap-secondary" onClick={() => setSelectedId(null)}>Close</button></footer>
      </div>
    </ReviewDialog>}
  </>;
}
