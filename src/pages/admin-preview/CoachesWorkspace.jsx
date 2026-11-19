import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import CoachApplicationDrawer from './CoachApplicationDrawer';
import RecordLoading from './RecordLoading';
import { dateLabel } from './playersData';
import { canReadCoaches, loadCoaches, filterCoaches, coachLink } from './coachesData';
import './CoachesWorkspace.css';

function Portrait({ row }) {
  const [failed, setFailed] = useState(false);
  const url = coachLink(row.profile_pic_url);
  return url && !failed ? <img src={url} alt="" width={44} height={44} loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="co-initial" aria-hidden="true">{(row.full_name || '?').slice(0, 1)}</span>;
}
const Status = ({ value }) => <span className={`ap-status ap-status--${({ approved: 'positive', pending: 'warning', rejected: 'danger' })[value] || 'neutral'}`}>{value || 'Not recorded'}</span>;

export default function CoachesWorkspace({ session, permissions, scopeId, client = supabase }) {
  const allowed = canReadCoaches(session, permissions, scopeId);
  const [params, setParams] = useSearchParams();
  const [reload, setReload] = useState(0), [state, setState] = useState({});
  const context = JSON.stringify([session?.user?.id, permissions?.role, permissions?.allowed_tabs, scopeId, reload]);
  const update = changes => setParams(previous => { const next = new URLSearchParams(previous); Object.entries(changes).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); return next; });
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setState({ context, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, error: 'Loading took too long. Please try again.' }); }, 45000);
    loadCoaches(client, session, permissions, scopeId, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setState({ context, rows }); })
      .catch(() => { if (!controller.signal.aborted) setState({ context, error: 'Coach applications could not be loaded. Check your access and try again.' }); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, allowed, context]);
  if (!allowed) return <section className="ap-section co-panel"><h1>Coaches</h1><p>Coaches admin access in All 4M Padel is required. No applications have been requested.</p></section>;
  const loading = state.context !== context || state.loading;
  const rows = state.context === context ? state.rows || [] : [];
  const filters = { query: params.get('coach_q') || '', status: params.get('coach_status') || '', gender: params.get('coach_gender') || '' };
  const filtered = filterCoaches(rows, filters);
  const pages = Math.max(1, Math.ceil(filtered.length / 25));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get('coach_page'))) || 1));
  const selected = rows.find(row => String(row.id) === params.get('coach'));
  const filter = (key, value) => update({ [key]: value, coach_page: '' });
  return <div className="co-workspace"><header className="pp-heading"><div><p className="ap-eyebrow">Network / Coaches</p><h1>Coaches</h1><p>Applications, coaching locations and contact details.</p></div><button className="ap-secondary" disabled={loading} onClick={() => setReload(value => value + 1)}>Refresh coaches</button></header>
    <p className="pp-notice">Review applications, edit coach profiles and manage approval status. Changes are saved only after confirmation.</p>
    {loading ? <RecordLoading label="Loading coach applications…"/> : state.error ? <p role="alert">{state.error}</p> : <>
      <div className="co-counts" role="group" aria-label="Application status totals">{[['', 'All applications'], ['pending', 'Pending'], ['approved', 'Approved'], ['rejected', 'Rejected']].map(([value, label]) => <button className="ap-secondary" key={label} aria-pressed={filters.status === value} onClick={() => filter('coach_status', value)}>{label} <b>{value ? rows.filter(row => row.status === value).length : rows.length}</b></button>)}</div>
      <div className="co-filters"><label>Search coaches<input value={filters.query} placeholder="Name or email…" onChange={event => filter('coach_q', event.target.value)}/></label><label>Status<SearchableDropdown value={filters.status} onChange={event => filter('coach_status', event.target.value)}><option value="">All statuses</option>{['pending', 'approved', 'rejected'].map(value => <option key={value}>{value}</option>)}</SearchableDropdown></label><label>Gender<SearchableDropdown value={filters.gender} onChange={event => filter('coach_gender', event.target.value)}><option value="">All genders</option><option>Male</option><option>Female</option></SearchableDropdown></label></div>
      <div className="ap-section pp-table-wrap"><table className="pp-table"><caption className="ap-visually-hidden">Coach applications</caption><thead><tr>{['Coach', 'Gender', 'City', 'Coaching location', 'Applied', 'Status'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{filtered.slice((page - 1) * 25, page * 25).map(row => <tr key={row.id} className="pp-player-row" onClick={event => { if (!event.target.closest('button, a, input, select, textarea') && !window.getSelection()?.toString()) update({ coach: String(row.id) }); }}><td><button className="co-person" onClick={() => update({ coach: String(row.id) })}><Portrait row={row}/><span><b>{row.full_name || 'Name not recorded'}</b><small>{row.email || 'Email not recorded'}</small></span></button></td><td>{row.gender || '—'}</td><td>{row.city || '—'}</td><td>{row.coaching_location || '—'}</td><td>{dateLabel(row.created_at)}</td><td><Status value={row.status}/></td></tr>)}</tbody></table>{!filtered.length && <p className="co-panel">No coach applications match these filters.</p>}</div>
      <footer className="co-pagination"><span>{filtered.length} matching applications · Page {page} of {pages}</span><button className="ap-secondary" disabled={page === 1} onClick={() => update({ coach_page: String(page - 1) })}>Previous</button><button className="ap-secondary" disabled={page === pages} onClick={() => update({ coach_page: String(page + 1) })}>Next</button></footer>
      {selected && <CoachApplicationDrawer key={`${context}:${selected.id}`} row={selected} client={client} scopeId={scopeId} onClose={() => update({ coach: '' })} onSaved={saved => setState(current => current.context === context ? { ...current, rows: current.rows.map(row => String(row.id) === String(saved.id) ? { ...row, ...saved } : row) } : current)}/>}
    </>}
  </div>;
}
