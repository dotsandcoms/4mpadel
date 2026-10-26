import SearchableDropdown from "../../components/SearchableDropdown";
import React, { useEffect, useRef, useState } from 'react';
import { saveAs } from 'file-saver';
import ClubDetails from './ClubDetails.jsx';
import CreateClubDialog from './CreateClubDialog.jsx';
import ClubGroupsView from './ClubGroupsView.jsx';
import { clubsExcel } from './clubsExport.js';
import { supabase } from '../../supabaseClient';
import { canReadClubDirectory, loadClubDirectory, clubStatusLabel, filterClubDirectory, clubDirectorySummary } from './clubsData.js';
import RecordLoading from './RecordLoading.jsx';
import './FinanceOverview.css';
import './ClubsWorkspace.css';

const emptyFilters = { query: '', status: '', province: '', verification: '' };
function ClubLogo({ club }) {
  const [failed, setFailed] = useState(false);
  return club.logo_url && !failed ? <img src={club.logo_url} alt="" loading="lazy" referrerPolicy="no-referrer" onError={() => setFailed(true)}/> : <span className="fo-avatar" aria-hidden="true">{(club.name || 'C').slice(0, 1).toUpperCase()}</span>;
}
const statusTone = status => ['published', '4m_approved', '4m_premium'].includes(status) ? 'positive' : ['in_review', 'pending'].includes(status) ? 'warning' : status === 'rejected' ? 'danger' : 'neutral';
const flagLabel = (value, yes, no) => value === true ? yes : value === false ? no : 'Not recorded';

export default function ClubsWorkspace({ session, permissions, scopeId, client = supabase, refreshRevision = 0 }) {
  const allowed = canReadClubDirectory(session, permissions, scopeId);
  const [state, setState] = useState({ loading: true });
  const [reload, setReload] = useState(0);
  const [filters, setFilters] = useState(emptyFilters);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [creating, setCreating] = useState(null);
  const [view, setView] = useState('clubs');
  const [exporting, setExporting] = useState(false), [exportStatus, setExportStatus] = useState('');
  const exportContext = useRef(null);
  const context = `${session?.user?.id}-${permissions?.role}-${scopeId}-${reload}-${refreshRevision}`;
  useEffect(() => {
    const token = { active: allowed }; exportContext.current = token;
    setSelected(null); setCreating(null); setExporting(false); setExportStatus('');
    return () => { token.active = false; };
  }, [context, client, allowed]);
  useEffect(() => {
    if (!allowed) return;
    const controller = new AbortController();
    setState({ context, loading: true });
    const timer = setTimeout(() => { controller.abort(); setState({ context, error: 'Loading took too long. Please try again.' }); }, 45000);
    loadClubDirectory(client, session, permissions, scopeId, controller.signal, count => {
      if (!controller.signal.aborted) setState({ context, loading: true, count });
    }).then(rows => { if (!controller.signal.aborted) setState({ context, rows }); })
      .catch(error => { if (!controller.signal.aborted) setState({ context, error: error.message }); })
      .finally(() => clearTimeout(timer));
    return () => { controller.abort(); clearTimeout(timer); };
  }, [client, allowed, context]);
  if (!allowed) return <section className="ap-section clubs-notice"><h1>Clubs</h1><p>Platform super-admin access in All 4M Padel is required. Delegated club access is not yet enabled.</p></section>;
  const loading = state.context !== context || state.loading;
  const all = state.context === context ? state.rows || [] : [];
  const rows = filterClubDirectory(all, filters);
  const summary = clubDirectorySummary(all);
  const pages = Math.max(1, Math.ceil(rows.length / 10)), current = Math.min(page, pages);
  const update = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const options = key => [...new Set(all.map(row => row[key]).filter(Boolean))].sort();
  const exportRows = async () => {
    const token = exportContext.current;
    if (!token?.active || loading || exporting || !rows.length) return;
    setExporting(true); setExportStatus('');
    try {
      const buffer = await clubsExcel(rows, filters);
      if (!token.active) return;
      saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), '4m-clubs.xlsx');
      setExportStatus(`Excel prepared with ${rows.length} matching clubs across all pages, using filters at export start.`);
    } catch (error) { if (token.active) setExportStatus(error.message); }
    finally { if (token.active) setExporting(false); }
  };
  return <section className="fo-root clubs-root">
    <header className="fo-heading"><div><p className="ap-kicker">Network / Clubs</p><h1>Club directory</h1><p>Find clubs and review their recorded status.</p></div><div className="fo-report-actions"><button className="ap-primary" disabled={loading} onClick={() => setCreating(context)}>Create club</button><button className="ap-secondary" disabled={loading || exporting || !rows.length} onClick={exportRows}>{exporting ? 'Preparing Excel…' : 'Export Excel'}</button><button className="ap-secondary" disabled={loading} onClick={() => setReload(n => n + 1)}>Refresh clubs</button></div></header>
    {exportStatus && <p className="fo-note" role="status">{exportStatus}</p>}
    <nav className="fo-report-actions" aria-label="Club views"><button className={view === 'clubs' ? 'ap-primary' : 'ap-secondary'} aria-pressed={view === 'clubs'} onClick={() => setView('clubs')}>Clubs</button><button className={view === 'groups' ? 'ap-primary' : 'ap-secondary'} aria-pressed={view === 'groups'} onClick={() => setView('groups')}>Club groups</button></nav>
    <details className="clubs-notice"><summary>Integration availability</summary><p>Full profiles, media and club creation are connected. Club groups and organisation links can be inspected; access-affecting changes remain held pending server protection. Group administration, permanent club deletion, a consolidated pending-claims queue and per-club membership / invitation metrics are not connected. Decision, membership and invitation mutations require their separate staging gates.</p></details>
    <p className="fo-note">All 4M Padel · Create clubs or edit their full profiles. Publishing a new club makes it public and verified. Applications, claims and membership decisions remain separate workflows.</p>
    {loading ? <section className="ap-section"><RecordLoading label="Loading club records…" count={state.context === context ? state.count : undefined} detail="Reading accessible clubs and their directory details. The directory will appear when loading is complete."/></section> : state.error ? <section className="ap-section clubs-notice" role="alert"><h2>Clubs could not be loaded</h2><p>{state.error}</p><button className="ap-secondary" onClick={() => setReload(n => n + 1)}>Try again</button></section> : <>
      {view === 'groups' ? <ClubGroupsView key={context} client={client} session={session} scopeId={scopeId} onOpenClub={club => setSelected({ club: all.find(row => String(row.id) === String(club.id)) || club, context })}/> : <><div className="fo-cards clubs-cards">{[['Clubs', summary.total], ['Verified', summary.verified], ['Pending / in review', summary.inReview], ['SAPA registered', summary.sapaRegistered]].map(([label, count]) => <article className="fo-card" key={label}><h2>{label}</h2><strong>{count}</strong></article>)}</div>
      <section className="ap-section fo-breakdown">
        <div className="fo-ledger-filters"><label className="fo-search"><input aria-label="Search clubs" placeholder="Search club, location or ID…" value={filters.query} onChange={e => update('query', e.target.value)}/></label>
          <label className="fo-status-filter">Club status<SearchableDropdown value={filters.status} onChange={e => update('status', e.target.value)}><option value="">All statuses</option>{options('status').map(value => <option key={value} value={value}>{clubStatusLabel(value)}</option>)}</SearchableDropdown></label>
          <label className="fo-status-filter">Province<SearchableDropdown value={filters.province} onChange={e => update('province', e.target.value)}><option value="">All provinces</option>{options('province').map(value => <option key={value}>{value}</option>)}</SearchableDropdown></label>
          <label className="fo-status-filter">Verification<SearchableDropdown value={filters.verification} onChange={e => update('verification', e.target.value)}><option value="">All verification records</option><option value="verified">Verified</option><option value="unverified">Not verified</option></SearchableDropdown></label>
          <button className="ap-secondary" onClick={() => { setFilters(emptyFilters); setPage(1); }}>Reset filters</button>
        </div>
        <p className="fo-note" role="status">{rows.length} matching clubs · Sorted by name</p>
        {rows.length > 0 && <p className="fo-note clubs-scroll-hint">Swipe or scroll the table sideways to see location and status details →</p>}
        {rows.length ? <div className="fo-table-scroll" role="region" aria-label="Club directory" tabIndex={0}><table className="fo-detail-table clubs-table"><colgroup>{[32, 23, 18, 13, 14].map(width => <col key={width} style={{ width: `${width}%` }}/>)}</colgroup><thead><tr><th scope="col">Club</th><th scope="col">Location</th><th scope="col">Club status</th><th scope="col">Verification</th><th scope="col">SAPA registration</th></tr></thead><tbody>{rows.slice((current - 1) * 10, current * 10).map(club => <tr key={club.id} className="clubs-open-row" onClick={event => { if (!event.target.closest('button,a,input,select')) setSelected({ club, context }); }}>
          <td><div className="fo-player"><ClubLogo key={`${club.id}-${club.logo_url}`} club={club}/><div className="fo-player-copy"><button className="fo-type-link" aria-label={`View club details for ${club.name || 'Unnamed club'}`} onClick={() => setSelected({ club, context })}>{club.name || 'Unnamed club'} →</button>{club.short_name && club.short_name !== club.name && <small>{club.short_name}</small>}<small>{club.club_type || 'Club type not recorded'}</small></div></div></td>
          <td>{[club.city, club.province].filter(Boolean).join(', ') || 'Location not recorded'}<small>{club.country || 'Country not recorded'}</small></td>
          <td><span className={`ap-status ap-status--${statusTone(club.status)}`}>{clubStatusLabel(club.status)}</span></td>
          <td>{flagLabel(club.verified, 'Verified', 'Not verified')}</td><td>{flagLabel(club.sapa_registered, 'Registered', 'Not registered')}</td>
        </tr>)}</tbody></table></div> : <div className="clubs-empty"><h2>{all.length ? 'No matching clubs' : 'No clubs available'}</h2><p>{all.length ? 'Try a different search or reset the filters.' : 'No club records were returned for your account.'}</p></div>}
        <nav className="fo-pagination" aria-label="Club pages"><span>{rows.length ? (current - 1) * 10 + 1 : 0}–{Math.min(current * 10, rows.length)} of {rows.length}</span><button className="ap-secondary" disabled={current === 1} onClick={() => setPage(current - 1)}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current === pages} onClick={() => setPage(current + 1)}>Next</button></nav>
      </section></>}
      {selected?.context === context && <ClubDetails key={selected.club.id} club={selected.club} client={client} session={session} permissions={permissions} scopeId={scopeId} onClose={() => setSelected(null)} onUpdated={record => setState(previous => ({ ...previous, rows: previous.rows?.map(row => String(row.id) === String(record.id) ? { ...row, ...record } : row) }))}/>}
      {creating === context && <CreateClubDialog key={context} client={client} scopeId={scopeId} session={session} onClose={() => setCreating(null)} onComplete={record => {
        setCreating(null);
        setState(previous => ({ ...previous, rows: [...(previous.rows || []).filter(row => String(row.id) !== String(record.id)), record].sort((a, b) => (a.name || '').localeCompare(b.name || '')) }));
        setSelected({ club: record, context });
      }} onOpenExisting={id => {
        const club = all.find(row => String(row.id) === String(id));
        if (club) { setCreating(null); setSelected({ club, context }); return true; }
        return false;
      }}/>}
    </>}
  </section>;
}
