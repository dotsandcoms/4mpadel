/* eslint-disable react-hooks/set-state-in-effect -- reset this identity-scoped request */
import React, { useEffect, useState } from 'react';
import ClubApplicationDecision from './ClubApplicationDecision.jsx';
import RecordLoading from './RecordLoading.jsx';
import { liveClubDecisionApi, loadPendingClubClaims } from './liveClubOperations.js';

const pageSize = 10;
export default function ClubClaimsQueue({ client, session, scopeId, onOpenClub, onClubUpdated }) {
  const [state, setState] = useState({ loading: true }), [reload, setReload] = useState(0);
  const [query, setQuery] = useState(''), [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null), [busy, setBusy] = useState(false), [outcome, setOutcome] = useState(null);
  const userId = session?.user?.id;
  useEffect(() => {
    const controller = new AbortController();
    setState({ loading: true });
    const timer = setTimeout(() => {
      controller.abort();
      setState({ error: 'Loading pending claims took too long.' });
    }, 20000);
    loadPendingClubClaims({ client, scopeId, userId, signal: controller.signal })
      .then(rows => { if (!controller.signal.aborted) setState({ rows }); })
      .catch(error => { if (!controller.signal.aborted) setState({ error: error.message }); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, scopeId, userId, reload]);
  const needle = query.trim().toLowerCase();
  const rows = (state.rows || []).filter(row => [row.full_name, row.requester_email, row.clubs?.name].some(value => String(value || '').toLowerCase().includes(needle)));
  const pages = Math.max(Math.ceil(rows.length / pageSize), 1), current = Math.min(pages, page);
  const dismiss = () => {
    if (outcome) setState(previous => ({ ...previous, rows: previous.rows?.filter(row => row.id !== selected.id) }));
    setSelected(null); setOutcome(null);
  };
  return <section className="clubs-groups ap-section" aria-label="Pending club claims">
    <h2>Pending club claims</h2>
    <div className="fo-report-actions">
      <label className="fo-search"><input type="search" aria-label="Search pending claims" placeholder="Search claimant or club…" value={query} onChange={event => { setQuery(event.target.value); setPage(1); }}/></label>
      <button type="button" className="ap-secondary" disabled={busy || state.loading} onClick={() => { setSelected(null); setOutcome(null); setReload(value => value + 1); }}>Refresh claims</button>
    </div>
    {state.loading ? <RecordLoading label="Loading pending claims…"/> : state.error ? <p role="alert">{state.error}</p> : <>
      <p role="status">{rows.length} matching claims</p>
      <ul className="clubs-management-list">
        {rows.slice((current - 1) * pageSize, current * pageSize).map(row => <li key={row.id}>
          <div><strong>{row.clubs?.name || 'Club name unavailable'}</strong><p>{row.full_name || row.requester_email}</p><small>{row.requester_email}</small></div>
          <div className="fo-report-actions">
            {row.clubs?.id === row.club_id && <button type="button" className="ap-secondary" disabled={busy} onClick={() => onOpenClub(row.clubs)}>View club</button>}
            <button type="button" className="ap-secondary" disabled={busy || row.id === selected?.id} onClick={() => { dismiss(); setSelected(row); }}>Review claim</button>
          </div>
        </li>)}
      </ul>
      {!rows.length && <p>No pending claims match this view.</p>}
      {pages > 1 && <div className="fo-pagination" aria-label="Claim queue pages">
        <button type="button" className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous claims</button>
        <span>Page {current} of {pages}</span>
        <button type="button" className="ap-secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next claims</button>
      </div>}
      {selected && <ClubApplicationDecision key={selected.id} kind="claim" record={selected} client={client} scopeId={scopeId} session={session}
        decisionApi={liveClubDecisionApi} onBusyChange={setBusy} onCancel={dismiss} onSaved={result => { setOutcome(result); if (result.clubUpdate) onClubUpdated?.(result.clubUpdate); }}/>}
    </>}
  </section>;
}
