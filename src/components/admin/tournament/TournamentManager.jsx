import React, { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ArrowRight, CalendarDays, MapPin, RefreshCw, Trophy, Check, Circle, ChevronRight } from 'lucide-react';
import { tournamentClient } from '../../../services/tournament/client';
import { tournamentWorkflow, defaultSettings } from '../../../utils/tournament/workflow';
import { visibleWorkspaces, defaultWorkspace, CAPABILITIES, ROLE_PRESETS } from '../../../utils/tournament/permissions';
import { buildEventPlayDays } from '../../../utils/nativeDrawScheduler';
import { tournamentDivisionColors as divisionColorMap } from '../../../utils/tournament/colors';
import Preparation from './Preparation';
import Schedule from './Schedule';
import Results from './Results';
import './TournamentManager.css';

const EventBuilder = lazy(() => import('../EventBuilder'));
const PHASES = ['Setup', 'Prepare', 'Schedule', 'Live', 'Complete'];
export default function TournamentManager({ client = tournamentClient, demo = false, canBuildEvents = false }) {
    const [params, setParams] = useSearchParams();
    const eventId = params.get('event');
    const [builder, setBuilder] = useState(null);
    const [events, setEvents] = useState([]);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [search, setSearch] = useState('');
    const load = useCallback(async () => {
        if (eventId) {
            const result = await client.load(eventId);
            setData({ ...result, settings: { ...defaultSettings(result.divisions), ...result.settings } });
        } else { setEvents(await client.list()); setData(null); }
    }, [client, eventId]);
    useEffect(() => {
        let current = true;
        setLoading(true); setError(''); setMessage('');
        (eventId ? client.load(eventId) : client.list()).then(result => {
            if (!current) return;
            if (eventId) setData({ ...result, settings: { ...defaultSettings(result.divisions), ...result.settings } });
            else { setEvents(result); setData(null); }
        }).catch(e => { if (current) setError(e.message); }).finally(() => { if (current) setLoading(false); });
        return () => { current = false; };
    }, [client, eventId]);
    const act = async (operation, success = 'Saved') => {
        setBusy(true); setError(''); setMessage('');
        try { await operation(); await load(); setMessage(success); return true; }
        catch (e) { setError(e.message); return false; }
        finally { setBusy(false); }
    };
    const href = (workspace, division, target = eventId) => {
        const next = new URLSearchParams(params);
        next.set('tab', 'tournament-mgmt');
        if (target) next.set('event', target); else next.delete('event');
        if (workspace) next.set('workspace', workspace); else next.delete('workspace');
        if (division) next.set('division', division); else next.delete('division');
        return '?' + next.toString();
    };
    const go = (workspace, division) => setParams(href(workspace, division).slice(1));
    const caps = data?.capabilities || [];
    const tabs = visibleWorkspaces(caps);
    const requested = params.get('workspace') || defaultWorkspace(caps);
    const workspace = tabs.some(([id]) => id === requested) ? requested : defaultWorkspace(caps);
    const workflow = data ? tournamentWorkflow(data) : null;
    useEffect(() => {
        if (workspace !== 'results' || busy || !eventId) return;
        const timer = setInterval(() => { if (document.visibilityState === 'visible' && !document.querySelector('dialog[open]')) load().catch(e => setError(e.message)); }, 15000);
        return () => clearInterval(timer);
    }, [workspace, busy, eventId, load]);
    // Workspace navigation keeps the event mounted. Refresh audit data on entry
    // so an already-open event cannot keep showing an older snapshot's actors.
    useEffect(() => {
        if (!eventId || !['activity', 'overview'].includes(workspace)) return;
        load().catch(e => setError(e.message));
    }, [workspace, eventId, load]);
    return <div className="tm">
        {demo && <div className="tm-demo">Local demo · synthetic tournament data · changes stay in this browser</div>}
        {!demo && import.meta.env.DEV && <div className="tm-demo">Local app · connected to your shared tournament records · saved changes affect the existing system</div>}
        {!data || !eventId ? <>
            <header className="tm-header"><div className="tm-between"><div><p className="eyebrow">4M Padel / Operations</p><h1>Tournament Manager</h1><p className="muted" style={{ margin: '10px 0 24px' }}>Prepare the field. Plan the courts. Run the tournament.</p></div><Trophy size={32} color="#d7ff00" /></div></header>
            <main className="tm-body tm-stack">
                {error && <div role="alert" className="tm-notice">{error}</div>}
                {canBuildEvents && !demo && <button className="tm-button primary" onClick={() => setBuilder({})}>Create tournament</button>}
                <input aria-label="Search tournaments" className="tm-input tm-search" placeholder="Search tournament or venue…" value={search} onChange={e => setSearch(e.target.value)} />
                {loading ? <p role="status">Loading tournaments…</p> : <div className="tm-grid">{events.filter(e => (e.event_name + ' ' + e.venue).toLowerCase().includes(search.toLowerCase())).map(event =>
                    <Link key={event.id} className="tm-event-card" to={href(defaultWorkspace(event.capabilities || []), null, event.id)}>
                        <span className="tm-event-icon"><Trophy size={24} /></span><div style={{ flex: 1 }}><h2>{event.event_name}</h2><p className="muted">{event.start_date} · {event.venue || 'Venue to be confirmed'}</p></div><ArrowRight size={19} />
                    </Link>)}</div>}
                {!loading && !events.length && !error && <div className="tm-empty"><h2>No tournaments assigned</h2><p>A tournament administrator can give you access to an existing native event.</p></div>}
                {error && <button className="tm-button" onClick={() => act(load, 'Reloaded')}>Try again</button>}
            </main>
        </> : <>
            <header className="tm-header">
                <div className="tm-header-top"><Link className="tm-back" to={href(null, null, null)}><ArrowLeft size={13} style={{ display: 'inline', marginRight: 5 }} />All tournaments</Link><span className={'tm-status ' + (workflow.ready ? 'done' : '')}>{workflow.phase}</span></div>
                <div className="tm-between tm-event-heading"><div className="tm-event-identity"><span className="tm-event-art">{data.event.custom_image_url ? <img src={data.event.custom_image_url} alt="" /> : <Trophy size={24} />}</span><div><h1>{data.event.event_name}</h1><div className="tm-meta"><span><CalendarDays size={13} style={{ display: 'inline' }} /> {data.event.start_date} — {data.event.end_date}</span><span><MapPin size={13} style={{ display: 'inline' }} /> {data.event.venue || 'Venue to be confirmed'}</span></div></div></div><button className="tm-button quiet" disabled={busy} onClick={() => act(load, 'Tournament refreshed')}><RefreshCw size={14} />Refresh</button></div>
                <div className="tm-phases" aria-label="Tournament phase">{PHASES.map((phase, i) => <div key={phase} className={'tm-phase ' + (workflow.phase === phase ? 'current' : '')} aria-current={workflow.phase === phase ? 'step' : undefined}><span>{i + 1}</span>{phase}</div>)}</div>
            </header>
            <nav className="tm-tabs" aria-label="Tournament workspaces">{tabs.map(([id, label]) => <Link key={id} to={href(id)} aria-current={workspace === id ? 'page' : undefined}>{label}</Link>)}</nav>
            <main className="tm-body tm-stack">
                {error && <div role="alert" className="tm-notice">{error}</div>}
                {message && <div role="status" className="tm-notice info">{message}</div>}
                {loading ? <p role="status">Loading tournament…</p> : <>
                    {workspace === 'overview' && <Overview data={data} workflow={workflow} go={go} />}
                    {workspace === 'details' && canBuildEvents && !demo && <button className="tm-button" onClick={() => setBuilder(data.event)}>Edit event, entry fees & ranking settings</button>}
                    {workspace === 'details' && <Details key={data.settingsRevision} data={data} client={client} act={act} busy={busy} />}
                    {['players', 'divisions', 'draws'].includes(workspace) && <Preparation key={workspace + (params.get('division') || '')} workspace={workspace} selectedDivision={params.get('division')} data={data} client={client} act={act} busy={busy} error={error} go={go} />}
                    {workspace === 'schedule' && <Schedule key={data.event.id + ":" + (data.schedule?.revision || 0)} data={data} client={client} act={act} busy={busy} go={go} />}
                    {workspace === 'results' && <Results data={data} client={client} act={act} busy={busy} error={error} />}
                    {workspace === 'access' && <Access data={data} client={client} act={act} busy={busy} />}
                    {workspace === 'activity' && <Activity data={data} />}
                    {workspace === 'finances' && <Finances data={data} />}
                </>}
            </main>
        </>}
        {builder && <Suspense fallback={<p role="status">Opening event setup…</p>}><EventBuilder isOpen editingEvent={builder.id ? builder : null} onClose={() => setBuilder(null)} onSaved={async result => { await load(); if (result?.eventId) setParams(href('details', null, result.eventId).slice(1)); }} /></Suspense>}
    </div>;
}
function Overview({ data, workflow, go }) {
    const colours = divisionColorMap(data.divisions, data.settings.divisionColors);
    const published = workflow.rows.filter(r => r.published).length;
    const progress = ['Players', 'Seeds', 'Format', 'Draw', 'Results'];
    const canPrepare = data.capabilities.some(c => ['players', 'seeds', 'draws'].includes(c));
    return <div className="tm-stack">
        <section className="tm-panel tm-next tm-between"><div><p className="eyebrow">Next action · {workflow.blockers.length} divisions remaining</p><h3>{workflow.next.message}</h3><p className="muted">{workflow.ready ? 'The shared schedule is ready to prepare.' : 'Confirm every division’s draw to unlock the tournament schedule.'}</p></div>{visibleWorkspaces(data.capabilities).some(([id]) => id === workflow.next.workspace) && <button className="tm-button primary" onClick={() => go(workflow.next.workspace, workflow.next.divisionId)}>Continue <ArrowRight size={15} /></button>}</section>
        <div className="tm-stats">{[['Divisions', workflow.rows.length], ['Registered entries', canPrepare || data.capabilities.includes('finance') ? data.registrations.length : '—'], ['Draws published', published + ' / ' + workflow.rows.length], ['Matches resolved', workflow.rows.reduce((n, r) => n + r.resolved, 0)]].map(([label, value]) => <div key={label} className="tm-stat"><span>{label}</span><strong>{value}</strong></div>)}</div>
        <section className="tm-panel"><div className="tm-panel-head"><h2>Division progress</h2><small>All divisions · one shared schedule</small></div><div className="tm-table-wrap"><table className="tm-progress-table"><thead><tr><th>Division</th><th>Entries</th>{progress.map(p => <th key={p}>{p}</th>)}<th><span className="tm-sr-only">Open division</span></th></tr></thead><tbody>{workflow.rows.map(row => <tr key={row.division.id}><td><span className="tm-dot" style={{ background: colours.get(row.division.id)?.color }} />{row.division.name}</td><td>{canPrepare ? data.registrations.filter(r => r.division_id === row.division.id && r.status !== 'withdrawn').length : '—'}</td>{[row.players, row.seeds, row.format, row.published, row.finalised].map((done, i) => <td key={i}><span className={'tm-progress-mark ' + (done ? 'done' : '')} title={progress[i] + ': ' + (done ? 'Complete' : 'Not complete')} aria-label={progress[i] + ': ' + (done ? 'Complete' : 'Not complete')}>{done ? <Check size={12} strokeWidth={3} /> : <Circle size={15} />}</span></td>)}<td>{canPrepare && <button className="tm-button tm-icon-button quiet" aria-label={'Open ' + row.division.name} onClick={() => go(data.capabilities.includes('players') ? 'players' : data.capabilities.includes('seeds') ? 'divisions' : 'draws', row.division.id)}><ChevronRight size={16} /></button>}</td></tr>)}</tbody></table></div></section>

        <Activity data={data} compact />
    </div>;
}
function Details({ data, client, act, busy }) {
    const [divisionName, setDivisionName] = useState('');
    const [settings, setSettings] = useState(data.settings);
    const [days, setDays] = useState(data.playDays.length ? data.playDays : buildEventPlayDays(data.event));
    return <div className="tm-stack"><section className="tm-panel tm-stack"><h2>Divisions</h2>{data.divisions.map(d => <div className="tm-list-item" key={d.id}><strong>{d.name}</strong><span className="tm-status">{d.is_active === false ? 'Inactive' : 'Active'}</span></div>)}<form className="tm-field-row" onSubmit={async e => { e.preventDefault(); if (await act(() => client.saveDivision(data, null, divisionName, true), 'Division added')) setDivisionName(''); }}><label className="tm-field">New division<input className="tm-input" required value={divisionName} onChange={e => setDivisionName(e.target.value)} placeholder="e.g. Mixed Open" /></label><button className="tm-button" type="submit" disabled={busy}>Add division</button></form></section><section className="tm-panel tm-stack"><div><h2>Playing days & courts</h2><p className="muted">Set the available courts once. Scheduling uses these hours for every division.</p></div>
        {days.map((day, index) => <div className="tm-field-row" key={day.play_date}>
            <label className="tm-field">Playing date<span className="tm-input tm-date-display">{new Date(day.play_date + 'T12:00:00').toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></label>
            {['start_time', 'end_time', 'courts_count'].map(key => <label className="tm-field" key={key}>{({ start_time: 'Opens', end_time: 'Closes', courts_count: 'Courts' })[key]}<input className="tm-input" type={key === 'courts_count' ? 'number' : 'time'} min={key === 'courts_count' ? 1 : undefined} value={String(day[key]).slice(0, key === 'courts_count' ? 4 : 5)} onChange={e => setDays(old => old.map((d, i) => i === index ? { ...d, [key]: key === 'courts_count' ? Number(e.target.value) : e.target.value } : d))} /></label>)}
            <label className="tm-check"><input type="checkbox" checked={day.is_active} onChange={e => setDays(old => old.map((d, i) => i === index ? { ...d, is_active: e.target.checked } : d))} />Use this day</label>
        </div>)}
        <div className="tm-field-row"><label className="tm-field">Centre court<select className="tm-input" value={settings.centreCourt} onChange={e => setSettings(s => ({ ...s, centreCourt: e.target.value }))}>{Array.from({ length: Math.max(1, ...days.map(d => Number(d.courts_count))) }, (_, i) => <option key={i}>Court {i + 1}</option>)}</select></label></div>
        <p className="muted">Times are SAST. The default finals programme begins at 17:00 on the last day; leave enough time for both centre-court finals.</p>
        <button className="tm-button primary" disabled={busy} onClick={() => act(() => client.saveSettings(data, settings, days), 'Playing days and court availability saved')}>Save availability</button>
    </section></div>;
}
function Activity({ data, compact = false }) {
    return <section className="tm-panel"><div className="tm-panel-head"><h2>{compact ? 'Recent activity' : 'Activity log'}</h2><small>Recorded automatically</small></div><div className="tm-list">{data.audit.slice(0, compact ? 5 : 100).map(item => <div className="tm-list-item" key={item.id}><div>{item.action.replaceAll('.', ' · ').replaceAll('_', ' ')}<p className="tm-activity-actor">By {item.actor_name || (item.actor ? 'Unknown account' : 'System')}</p>{(item.details?.reason || item.details?.email) && <small>{item.details?.reason || item.details?.email}</small>}</div><small>{new Date(item.created_at).toLocaleString('en-ZA')}</small></div>)}{!data.audit.length && <p className="muted">Workflow decisions will appear here as the tournament progresses.</p>}</div></section>;
}
function Access({ data, client, act, busy }) {
    const [email, setEmail] = useState('');
    const [caps, setCaps] = useState(ROLE_PRESETS.results.capabilities);
    const [preset, setPreset] = useState('results');
    return <div className="tm-stack"><section className="tm-panel tm-stack"><h2>Tournament access</h2><p className="muted">Assign access to an existing account for this tournament. Global administrator permissions still apply.</p>
        <div className="tm-field-row"><label className="tm-field">Account email<input className="tm-input" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" /></label><label className="tm-field">Role preset<select className="tm-input" value={preset} onChange={e => { setPreset(e.target.value); setCaps(ROLE_PRESETS[e.target.value].capabilities); }}>{Object.entries(ROLE_PRESETS).map(([id, role]) => <option key={id} value={id}>{role.label}</option>)}</select></label></div>
        <div className="tm-grid">{Object.entries(CAPABILITIES).map(([cap, label]) => <label key={cap} className="tm-check"><input type="checkbox" checked={caps.includes(cap)} onChange={e => setCaps(current => e.target.checked ? [...current, cap] : current.filter(c => c !== cap))} />{label}</label>)}</div>
        <button className="tm-button primary" disabled={busy || !email.trim()} onClick={() => act(() => client.access(data, email, caps), 'Tournament access updated')}>Save access</button>
    </section><section className="tm-panel"><h2>Assigned staff</h2>{data.access.map(person => <div key={person.user_id} className="tm-list-item"><div><strong>{person.email}</strong><p className="muted">{person.capabilities.map(c => CAPABILITIES[c]).join(', ') || 'No tournament access'}</p>{person.inheritedAccess && <p className="tm-notice">This account also has broader inherited access.</p>}</div><button className="tm-button quiet" onClick={() => { setEmail(person.email); setCaps(person.capabilities); }}>Edit</button></div>)}{!data.access.length && <p className="muted" style={{ marginTop: 12 }}>No additional staff assigned. Super admins retain access.</p>}</section></div>;
}
function Finances({ data }) {
    return <section className="tm-panel tm-stack"><h2>Entry payments</h2><p className="muted">Registration payment status is shared with Event Manager. Settlement and refund processing continue through the existing finance workflow.</p><div className="tm-table-wrap"><table><thead><tr><th>Registration</th><th>Division</th><th>Status</th></tr></thead><tbody>{data.registrations.map(r => <tr key={r.id}><td>{r.full_name}</td><td>{data.divisions.find(d => d.id === r.division_id)?.name}</td><td><span className={'tm-status ' + (r.payment_status === 'paid' ? 'done' : 'warn')}>{r.payment_status || 'Unknown'}</span></td></tr>)}</tbody></table></div></section>;
}
