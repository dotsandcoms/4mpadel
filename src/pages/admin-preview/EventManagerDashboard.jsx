import SearchableDropdown from "../../components/SearchableDropdown";
import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, ChevronRight, Search, Layers, Radio, CircleCheck, Check } from 'lucide-react';
import { AnimatedCount } from './PlayersWorkspace';
import { dateLabel } from './playersData';
import { tierTone } from './calendarData';
import { activeEventEntries, registrationWindow, compareEventDates } from './eventManagerData';
import './EventManagerDashboard.css';
import { supabase } from '../../supabaseClient';
import { loadEventSnapshots } from './eventSnapshots';
import { loadManagedEventCompletions, managedEventStage } from './eventManagementCompletion.js';

const Badge = ({ tone = 'neutral', children }) => <span className={`ap-status ap-status--${tone}`}>{children}</span>;
export default function EventManagerDashboard({ events, registrations, go, canReadSnapshots = false, client = supabase, session, scopeId = 'all' }) {
  const [query, setQuery] = useState('');
  const [phase, setPhase] = useState('Upcoming');
  const [page, setPage] = useState(1);
  const list = useRef(null);
  const [snapshotState, setSnapshotState] = useState({ key: '', data: {}, error: null });
  const [retry, setRetry] = useState(0);
  const [completionState, setCompletionState] = useState({ loading: true, map: new Map() });
  useEffect(() => {
    let alive = true; setCompletionState({ loading: true, map: new Map() });
    if (!canReadSnapshots) { setCompletionState({ loading: false, map: new Map() }); return; }
    (async () => {
      const { data, error } = await client.auth.getUser();
      if (error || !session?.user?.id || data?.user?.id !== session.user.id) throw new Error('Sign in again to load completion status.');
      const map = await loadManagedEventCompletions(client);
      if (alive) setCompletionState({ loading: false, map });
    })().catch(error => { if (alive) setCompletionState({ loading: false, map: new Map(), error: error.message }); });
    return () => { alive = false; };
  }, [client, session?.user?.id, scopeId, canReadSnapshots, events, retry]);
  const managedEvents = events.map(event => ({ ...event, management_completed_at: completionState.map.get(Number(event.id)) || null }));
  const stage = event => managedEventStage(event);
  const entries = useMemo(() => {
    const result = new Map();
    activeEventEntries(registrations).forEach(row => result.set(String(row.event_id), (result.get(String(row.event_id)) || 0) + 1));
    return result;
  }, [registrations]);
  const filtered = (completionState.loading || completionState.error ? [] : managedEvents).filter(event => (!phase || stage(event) === phase)
    && [event.event_name, event.venue, event.city, event.organisations?.name, event.organiser_name].some(value => String(value || '').toLowerCase().includes(query.toLowerCase())))
    .sort(compareEventDates);
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const current = Math.min(page, pages);
  const pageEvents = filtered.slice((current - 1) * 50, current * 50);
  const snapshotKey = JSON.stringify(pageEvents.map(event => event.id));
  useEffect(() => {
    if (!canReadSnapshots) return;
    const controller = new AbortController();
    const ids = new Set(JSON.parse(snapshotKey).map(String));
    loadEventSnapshots(client, events.filter(event => ids.has(String(event.id))), controller.signal)
      .then(data => { if (!controller.signal.aborted) setSnapshotState({ key: snapshotKey, data, error: null }); })
      .catch(error => { if (!controller.signal.aborted) setSnapshotState({ key: snapshotKey, data: {}, error: error.message }); });
    return () => controller.abort();
  }, [snapshotKey, client, events, canReadSnapshots, retry]);
  const filter = value => { setPhase(value); setPage(1); if (list.current) list.current.scrollTop = 0; };
  const stats = [['All events', '', events.length], ['In progress', 'In progress', managedEvents.filter(e => stage(e) === 'In progress').length], ['Upcoming', 'Upcoming', managedEvents.filter(e => stage(e) === 'Upcoming').length], ['Completed', 'Completed', managedEvents.filter(e => stage(e) === 'Completed').length]];
  return <div className="em-workspace">
    <header className="ap-page-heading"><div><p className="ap-kicker">Operate / Event manager</p><h1>Event manager</h1><p>Teams, registrations, draws and settlement — organised by event.</p></div><button className="ap-secondary" onClick={() => go('calendar')}><CalendarDays size={16} /> Calendar & setup <ArrowRight size={16} /></button></header>
    <div className="em-stats">{stats.map(([title, value, count]) => <button key={title} className="ap-section" data-state={value || 'all'} aria-pressed={phase === value} onClick={() => filter(value)}><span className="em-stat-label">{title}<span className="em-stat-icon" aria-hidden="true">{value === 'In progress' ? <Radio size={20} /> : value === 'Upcoming' ? <CalendarDays size={20} /> : value === 'Completed' ? <CircleCheck size={20} /> : <Layers size={20} />}</span></span><strong>{completionState.loading || completionState.error ? '—' : <AnimatedCount value={count} />}</strong><small>{phase === value ? <>Showing events <Check size={14} /></> : <>View events <ArrowRight size={14} /></>}</small></button>)}</div>
    <section className="ap-section em-guide"><div><h2>Inside each event</h2><p>Open an event to review its overview, players and teams, registrations, draws, income statement and activity log.</p></div><small>Completed is an explicit Event Manager status, independent of calendar dates.</small></section>
    <div className="ap-filter-bar"><label className="ap-filter-search"><Search size={17} /><span className="ap-visually-hidden">Search events</span><input value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder="Search event, organiser, venue or city" /></label><label>Event status <SearchableDropdown value={phase} onChange={e => filter(e.target.value)}><option value="">All statuses</option>{['Upcoming', 'In progress', 'Awaiting completion', 'Completed', 'Active'].map(value => <option key={value}>{value}</option>)}</SearchableDropdown></label></div>
    {completionState.error && <p role="alert">Completion status unavailable: {completionState.error} <button className="ap-text-button" onClick={() => setRetry(value => value + 1)}>Retry status</button></p>}
    <p className="em-note">Registration-fee snapshot · same basis as the existing Event Manager. Collected / billed is separate from the refund-adjusted income statement. Licences count unique players.</p>
    {snapshotState.key === snapshotKey && snapshotState.error && <p role="alert">Snapshot unavailable: {snapshotState.error} <button className="ap-text-button" onClick={() => setRetry(value => value + 1)}>Retry snapshots</button></p>}
    <div ref={list} className="ap-section pp-table-wrap"><table className="pp-table em-table"><thead><tr>{['Event / organiser', 'Dates / host club', 'Event tier', 'Entries', 'Collected / billed', 'Licence status', 'Registration window', 'Event status', ''].map((name, i) => <th key={i}>{name}</th>)}</tr></thead><tbody>{pageEvents.map(event => {
      const status = stage(event); const window = registrationWindow(event);
      const snapshot = canReadSnapshots && snapshotState.key === snapshotKey ? snapshotState.data[String(event.id)] : null;
      const pending = !canReadSnapshots ? 'Sign in to view' : snapshotState.key !== snapshotKey ? 'Loading…' : 'Unavailable';
      const money = amount => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', maximumFractionDigits: 0 }).format(amount);
      return <tr key={event.id} className="pp-player-row" onClick={e => { if (!e.target.closest('button,a') && !globalThis.getSelection()?.toString()) go('event', { event }); }}>
        <td><button className="ap-text-button" onClick={() => go('event', { event })}>{event.event_name || 'Unnamed event'}</button><small>{event.organisations?.name || event.organiser_name || 'Organiser not recorded'}</small></td>
        <td>{dateLabel(event.start_date)}<small>{event.clubs?.short_name || event.clubs?.name || event.venue || event.city || 'Venue not recorded'}</small></td><td><Badge tone={tierTone(event.sapa_status)}>{event.sapa_status || 'Untiered'}</Badge></td>
        <td><b>{snapshot ? snapshot.entries : canReadSnapshots ? pending : entries.get(String(event.id)) || 0}</b>{snapshot && <small><span className="em-paid">{snapshot.paid} paid</span> · <span className="em-comped">{snapshot.comped} comped</span></small>}</td>
        <td>{snapshot ? <><b className="em-money">{money(snapshot.collected)} / {money(snapshot.billed)}</b><small className={snapshot.outstanding > 0 ? 'em-outstanding' : ''}>{money(snapshot.outstanding)} outstanding</small></> : <small>{pending}</small>}</td>
        <td>{snapshot ? snapshot.entries ? <div className="em-licences"><span className="em-full"><b>{snapshot.full}</b><small>Full</small></span><span className="em-temp"><b>{snapshot.temp}</b><small>Temp</small></span><span className="em-none"><b>{snapshot.none}</b><small>None</small></span></div> : <small>No players</small> : <small>{pending}</small>}</td>
        <td><Badge tone={window.tone}>{window.label}</Badge></td><td><Badge tone={status === 'In progress' ? 'positive' : status === 'Cancelled' ? 'danger' : status === 'Upcoming' ? 'info' : 'neutral'}>{completionState.loading ? 'Loading status…' : completionState.error ? 'Status unavailable' : status}</Badge></td><td><button className="ap-icon-button" aria-label={`Open ${event.event_name || 'event'}`} onClick={() => go('event', { event })}><ChevronRight size={16} /></button></td>
      </tr>;
    })}</tbody></table>{!filtered.length && <div className="em-guide"><h2>{completionState.loading ? 'Loading event status…' : completionState.error ? 'Event status unavailable' : 'No matching events'}</h2><button className="ap-secondary" onClick={() => { setQuery(''); filter(''); }}>Clear filters</button></div>}</div>
    <nav className="ap-pagination" aria-label="Event pages"><span>{filtered.length ? (current - 1) * 50 + 1 : 0}–{Math.min(current * 50, filtered.length)} of {filtered.length} events</span><div><button className="ap-secondary" disabled={current === 1} onClick={() => { setPage(current - 1); list.current.scrollTop = 0; }}>Previous</button><span>Page {current} of {pages}</span><button className="ap-secondary" disabled={current === pages} onClick={() => { setPage(current + 1); list.current.scrollTop = 0; }}>Next</button></div></nav>
  </div>;
}
