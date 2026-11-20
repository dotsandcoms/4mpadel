import { Fragment, useEffect, useState } from 'react';
import { Dialog } from './PlayersWorkspace.jsx';
import RecordLoading from './RecordLoading.jsx';
import { formatAuditDate } from './reviewAuditData.js';
import { loadOrganisationActivity, loadOrganisationActivityDetails } from './organisationActivityData.js';

const title = 'Organisation activity log';
const humanLabel = value => String(value || '').replaceAll('.', ' ').replaceAll('_', ' ').replace(/^org /, 'Organisation ').replace(/^./, first => first.toUpperCase());
const detailValue = value => {
  if (value == null || value === '') return 'Not recorded';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return typeof value === 'object' ? JSON.stringify(value) : String(value);
};

function ActivityDetails({ client, userId, scopeId, id }) {
  const [result, setResult] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    loadOrganisationActivityDetails(client, { userId, scopeId, signal: controller.signal }, id)
      .then(details => { if (!controller.signal.aborted) setResult({ details }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ error: error.message }); });
    return () => controller.abort();
  }, [client, userId, scopeId, id]);

  if (result?.error) return <p role="alert">{result.error}</p>;
  if (!result) return <RecordLoading label="Loading activity details…" />;
  const { changes = {}, ...details } = result.details || {};
  const changedFields = Object.entries(changes || {});
  const metadata = Object.entries(details);
  if (!changedFields.length && !metadata.length) return <p>No additional details were recorded.</p>;
  return <>
    {metadata.length > 0 && <dl>{metadata.map(([field, value]) => <div key={field}>
      <dt>{humanLabel(field)}</dt><dd>{detailValue(value)}</dd>
    </div>)}</dl>}
    {changedFields.length > 0 && <dl>{changedFields.map(([field, change]) => <div key={field}>
      <dt>{humanLabel(field)}</dt><dd className="of-review-pair">
        <div><small>Before</small>{detailValue(change?.from)}</div>
        <div><small>After</small>{detailValue(change?.to)}</div>
      </dd>
    </div>)}</dl>}
  </>;
}

export default function OrganisationActivityLog({ client, session, scopeId, onClose }) {
  const userId = session?.user?.id;
  const [category, setCategory] = useState('');
  const [page, setPage] = useState(1);
  const [revision, reload] = useState(0);
  const [result, setResult] = useState(null);
  const [expanded, setExpanded] = useState(null);
  const requestKey = `${category}:${page}:${revision}`;

  useEffect(() => {
    const controller = new AbortController();
    loadOrganisationActivity(client, { userId, scopeId, signal: controller.signal }, category, page)
      .then(log => { if (!controller.signal.aborted) setResult({ ...log, requestKey }); })
      .catch(error => { if (!controller.signal.aborted) setResult({ error: error.message, requestKey }); });
    return () => controller.abort();
  }, [client, userId, scopeId, category, page, requestKey]);

  const current = result?.requestKey === requestKey ? result : null;
  const changePage = next => { setExpanded(null); setPage(next); };
  const refresh = () => { setExpanded(null); reload(value => value + 1); };

  return <Dialog title={title} kicker="Organisations" className="of-dialog of-audit-dialog" onClose={onClose}>
    <div className="of-audit-controls">
      <label>Record type <select value={category} onChange={event => { setCategory(event.target.value); changePage(1); }}>
        <option value="">All activity</option><option value="organisation">Organisations</option>
        <option value="member">Members</option><option value="event">Events and divisions</option>
      </select></label>
      <button className="ap-secondary" type="button" onClick={refresh}>Refresh activity</button>
    </div>
    {!current ? <RecordLoading label="Loading organisation activity…" /> : current.error ? <p role="alert">{current.error}</p> :
      <div className="of-table">
        {current.rows.length > 0 ? <table>
          <thead><tr><th scope="col">Time</th><th scope="col">Action</th><th scope="col">Actor</th><th scope="col">Details</th></tr></thead>
          <tbody>{current.rows.map(row => <Fragment key={row.id}>
            <tr><td>{formatAuditDate(row.created_at, true)}</td><td id={`organisation-audit-action-${row.id}`}>{humanLabel(row.action)}
              <small>{[row.event_name, row.division_name].filter(Boolean).join(' · ') || row.name || row.entity_id || row.organization_id}</small></td>
              <td>{row.actor_email || 'System'}</td><td>
                <button className="ap-secondary" type="button" aria-expanded={expanded === row.id}
                  aria-describedby={`organisation-audit-action-${row.id}`}
                  aria-controls={`organisation-audit-${row.id}`} onClick={() => setExpanded(expanded === row.id ? null : row.id)}>
                  {expanded === row.id ? 'Hide details' : 'View details'}
                </button>
              </td></tr>
            <tr id={`organisation-audit-${row.id}`} hidden={expanded !== row.id}><td colSpan={4}>
              {expanded === row.id && <ActivityDetails {...{ client, userId, scopeId }} id={row.id} />}
            </td></tr>
          </Fragment>)}</tbody>
        </table> : <p>No organisation activity on this page.</p>}
      </div>}
    <nav className="of-audit-controls" aria-label="Organisation activity pages">
      <button className="ap-secondary" type="button" disabled={page === 1 || !current} onClick={() => changePage(page - 1)}>Newer</button>
      <span role="status">Page {page}</span>
      <button className="ap-secondary" type="button" disabled={!current?.hasMore} onClick={() => changePage(page + 1)}>Older</button>
    </nav>
  </Dialog>;
}
