import SearchableDropdown from "../../components/SearchableDropdown";
import RecordLoading from './RecordLoading.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Download, ExternalLink, LockKeyhole, Plus, RefreshCw, Search } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import DOMPurify from 'dompurify';
import { AnimatedCount, Dialog, Facts } from './PlayersWorkspace';
import { dateLabel, moneyLabel, textValue } from './playersData';
import { dayKey, eventPhase, filterCalendar, loadCalendar, loadCalendarDivisions, localToday, monthDays, occursOn, publicEventUrl, setupGaps, tierTone } from './calendarData';
import './CalendarWorkspace.css';
import AdvancedEventDetailsDialog from './AdvancedEventDetailsDialog';
import CreateEventDialog from './CreateEventDialog';
import CreateQuickEventDialog from './CreateQuickEventDialog';
import QuickEventDetailsDialog from './QuickEventDetailsDialog';
import { calendarEditMode } from './calendarEditing';

const Tag = ({ tone = 'neutral', children }) => <span className={`ap-status ap-status--${tone}`}>{children}</span>;
const phaseTone = phase => ({ Upcoming: 'positive', 'In progress': 'info', Cancelled: 'danger', Unscheduled: 'warning' }[phase] || 'neutral');
const flags = [['is_visible', 'Website visible'], ['featured_event', 'Homepage featured'], ['is_spotlight', 'Spotlight'], ['featured_live', 'Featured live'], ['featured_result', 'Featured result'], ['show_in_recent_results', 'Recent results'], ['is_league', 'League'], ['finance_managed', 'Finance managed'], ['allow_payments', 'Payments enabled']];
const setupFields = ['event_name', 'slug', 'start_date', 'end_date', 'start_time', 'end_time', 'city', 'venue', 'address', 'organiser_name', 'organiser_email', 'organiser_phone', 'organiser_website', 'sapa_status', 'entry_fee', 'early_bird_fee', 'early_bird_ends_at', 'registration_opens_at', 'registration_closes_at', 'rankedin_id', 'rankedin_url'];
const label = field => field.replaceAll('_', ' ').replace(/^./, c => c.toUpperCase());
const timestamp = value => value ? new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' }) : 'Not recorded';

function EventImage({ event, large = false }) {
  const [failed, setFailed] = useState(false);
  const src = event.custom_image_url || event.image_url || event._organisation?.logo_url;
  return <span className={`cw-image ${large ? 'cw-image--large' : ''}`}>{src && !failed ? <img src={src} width={large ? 160 : 42} height={large ? 100 : 42} alt="" loading="lazy" onError={() => setFailed(true)} /> : <CalendarDays size={large ? 34 : 19} aria-hidden="true" />}</span>;
}

function EventPoster({ src }) {
  const [failed, setFailed] = useState(false);
  const safe = typeof src === 'string' && (/^https?:\/\//i.test(src) || /^\/(?!\/)/.test(src));
  return <section className="cw-poster"><h3>Event poster</h3>{safe ? <a href={src} target="_blank" rel="noreferrer" aria-label="Open event poster full size">{failed ? <span>Poster preview unavailable. Open original image.</span> : <img src={src} alt="Event poster" loading="lazy" onError={() => setFailed(true)} />}<small>Open full-size poster <ExternalLink size={13} aria-hidden="true" /></small></a> : <p>{src ? 'Poster image unavailable.' : 'No event poster recorded.'}</p>}</section>;
}

function SponsorLogos({ logos }) {
  const [failed, setFailed] = useState({});
  const items = Array.isArray(logos) ? logos : [];
  return <section className="cw-sponsors"><h3>Sponsor logos</h3>{items.length ? <div className="cw-logo-grid">{items.map((src, index) => {
    const safe = typeof src === 'string' && (/^https?:\/\//i.test(src) || /^\/(?!\/)/.test(src));
    const name = index === 0 ? 'Main sponsor' : `Sponsor ${index + 1}`;
    return <div key={`${index}-${src}`} className="cw-logo-item">{safe ? <a href={src} target="_blank" rel="noreferrer" aria-label={`Open ${name.toLowerCase()} logo`}>{failed[src] ? <span>Image unavailable</span> : <img src={src} alt={`${name} logo`} width={140} height={88} loading="lazy" onError={() => setFailed(previous => ({ ...previous, [src]: true }))} />}</a> : <span className="cw-logo-unavailable">Image unavailable</span>}<small>{name}</small></div>;
  })}</div> : <p>No sponsor logos recorded.</p>}</section>;
}

function SetupPreview({ event, mode, onClose, onApply }) {
  const [draft, setDraft] = useState(() => {
    const initial = { ...event, is_visible: event.is_visible !== false, ...(mode === 'duplicate' ? { id: `demo-${Date.now()}`, event_name: `${event.event_name} (copy)`, slug: '', is_visible: false } : {}) };
    for (const field of ['registration_opens_at', 'registration_closes_at', 'early_bird_ends_at']) {
      if (initial[field] && !Number.isNaN(new Date(initial[field]).getTime())) initial[field] = new Date(initial[field]).toLocaleString('sv-SE', { timeZone: 'Africa/Johannesburg' }).replace(' ', 'T').slice(0,16);
    }
    return initial;
  });
  const [error, setError] = useState('');
  const [step, setStep] = useState('Details');
  const submit = e => {
    e.preventDefault();
    if (!draft.event_name?.trim()) return setError('An event name is required.');
    if (!dayKey(draft.start_date)) return setError('Choose a valid start date.');
    if (draft.end_date && draft.end_date < draft.start_date) return setError('The end date must be on or after the start date.');
    if (draft.registration_opens_at && draft.registration_closes_at && new Date(draft.registration_opens_at) >= new Date(draft.registration_closes_at)) return setError('Registration closing must follow opening.');
    const result = { ...draft, _demo: true };
    for (const field of ['registration_opens_at', 'registration_closes_at', 'early_bird_ends_at']) if (result[field]) result[field] = new Date(`${result[field]}:00+02:00`).toISOString();
    onApply(result);
  };
  return <Dialog title={`${mode === 'duplicate' ? 'Duplicate event' : mode === 'new' ? 'Create event' : 'Edit event'} · demo`} onClose={onClose}>
    <form className="cw-editor" onSubmit={submit}>
      <p className="pp-notice">This changes only your in-memory demo. No publishing, uploads, payments or database writes occur.</p>
      <nav className="pp-tabs" aria-label="Event setup sections">{['Details', 'Registration', 'Publishing'].map(s => <button type="button" key={s} aria-current={step === s ? 'page' : undefined} onClick={() => setStep(s)}>{s}</button>)}</nav>
      <div className="pp-form-grid">{step !== 'Publishing' && setupFields.filter(f => step === 'Registration' ? /fee|registration|early_bird/.test(f) : !/fee|registration|early_bird/.test(f)).map(field => <label key={field}>{label(field)}<input name={field} type={field.endsWith('_date') ? 'date' : field.endsWith('_time') ? 'time' : field.endsWith('_at') ? 'datetime-local' : field.includes('fee') ? 'number' : field.endsWith('_email') ? 'email' : field.endsWith('_url') || field.endsWith('_website') ? 'url' : 'text'} min={field.includes('fee') ? '0' : undefined} step={field.includes('fee') ? '.01' : undefined} value={draft[field] ?? ''} onChange={e => setDraft({ ...draft, [field]: e.target.value })} /></label>)}
      {step === 'Publishing' && [...flags, ['allow_temporary_license', 'Allow temporary licences'], ['license_required_default', 'Licence required by default']].map(([field, name]) => <label className="cw-checkbox" key={field}><input type="checkbox" checked={draft[field] === true} onChange={e => setDraft({ ...draft, [field]: e.target.checked })} />{name}</label>)}</div>
      {error && <p role="alert" className="cw-error">{error}</p>}
      <footer className="cw-actions"><button type="button" className="ap-secondary" onClick={onClose}>Discard</button><button className="ap-primary" type="submit">Apply to demo</button></footer>
    </form>
  </Dialog>;
}

function EventDrawer({ event, client, onClose, onAction, canManageEvents }) {
  const editMode = calendarEditMode(event, canManageEvents);
  const editLabel = editMode?.startsWith('live') ? 'Edit event details' : 'Preview edit';
  const [tab, setTab] = useState('Overview');
  const [divisions, setDivisions] = useState(() => String(event.id).startsWith('demo-') ? [] : null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [notice, setNotice] = useState('');
  const [actionsOpen, setActionsOpen] = useState(false);
  const actionsRef = useRef(null);
  useEffect(() => {
    if (!actionsOpen) return;
    const outside = e => { if (!actionsRef.current?.contains(e.target)) setActionsOpen(false); };
    const escape = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setActionsOpen(false); actionsRef.current?.querySelector('button')?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', escape, true);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape, true); };
  }, [actionsOpen]);
  useEffect(() => {
    const controller = new AbortController();
    if (String(event.id).startsWith('demo-')) return;
    loadCalendarDivisions(client, event.id, controller.signal).then(setDivisions).catch(() => { if (!controller.signal.aborted) setError('Divisions could not be loaded.'); });
    return () => controller.abort();
  }, [client, event.id, retry]);
  const url = publicEventUrl(event);
  const phase = eventPhase(event);
  const copy = async () => { try { await navigator.clipboard.writeText(new URL(url, window.location.origin).href); setNotice('Public event link copied.'); } catch { setNotice('Clipboard unavailable. Use the Public event link below.'); } };
  return <Dialog title="Calendar event" onClose={onClose} drawer>
    <div className="cw-record-heading"><EventImage event={event} large /><div><h3>{event.event_name || 'Unnamed event'}</h3><p>{dateLabel(event.start_date)}{event.end_date && event.end_date !== event.start_date ? ` – ${dateLabel(event.end_date)}` : ''}</p><dl className="cw-record-statuses">
      <div><dt>Event tier</dt><dd><Tag tone={tierTone(event.sapa_status)}>{event.sapa_status || 'Untiered'}</Tag></dd></div>
      <div><dt>Event status</dt><dd><Tag tone={phaseTone(phase)}>{phase}</Tag></dd></div>
      <div><dt>Website visibility</dt><dd><Tag tone={event.is_visible === false ? 'neutral' : 'positive'}>{event.is_visible === false ? 'Hidden' : 'Visible'}</Tag></dd></div>
      {event._demo && <div><dt>Preview</dt><dd><Tag tone="warning">Demo changes</Tag></dd></div>}
    </dl></div></div>
    <nav className="pp-tabs cw-record-tabs" aria-label="Calendar event sections">{['Overview', 'Registration', 'Divisions', 'Publishing', 'Source'].map(t => <button key={t} aria-current={t === tab ? 'page' : undefined} onClick={() => setTab(t)}>{t}</button>)}</nav>
    <div className="cw-record-body">
      {tab === 'Overview' && <><Facts entries={['city', 'venue', 'address', 'start_time', 'end_time', 'event_dates', 'organiser_name', 'organiser_email', 'organiser_phone', 'organiser_website'].map(k => [label(k), event[k]])} /><h3>Event description</h3><div className="cw-description" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(textValue(event.description), { ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'ul', 'ol', 'li', 'h3', 'h4'], ALLOWED_ATTR: [] }) }} /><h3>Setup checks</h3><p>Checks highlight missing fields, not a guarantee of readiness.</p>{setupGaps(event).length ? <ul>{setupGaps(event).map(g => <li key={g}>{g}</li>)}</ul> : <p>No missing fields found in these checks.</p>}</>}
      {tab === 'Registration' && <><p>Times shown in South African time. A missing setting is not assumed to mean registrations are open.</p><Facts entries={['registration_opens_at', 'registration_closes_at', 'early_bird_ends_at'].map(k => [label(k), timestamp(event[k])])} /><Facts entries={['entry_fee', 'early_bird_fee'].map(k => [label(k), moneyLabel(event[k])])} /><Facts entries={['category_fees', 'entry_fee_notes', 'allow_payments', 'finance_managed', 'payment_method', 'allow_temporary_license', 'license_required_default', 'partner_requirement', 'max_teams_capacity', 'registered_players'].map(k => [label(k), event[k]])} /><p>Registered players is the calendar’s stored value, not a reconciled Event Manager entry count.</p></>}
      {tab === 'Divisions' && <>{error ? <p role="alert">{error} <button className="ap-text-button" onClick={() => { setError(''); setRetry(v => v + 1); }}>Retry</button></p> : divisions === null ? <p role="status">Loading divisions…</p> : divisions.length ? divisions.map(d => <details className="cw-division cw-division--priced" key={d.id}><summary><strong>{d.name || d.division_name || d.category || 'Division'}</strong><span className="cw-division-fee"><small>Entry fee</small><b>{moneyLabel(d.entry_fee)}</b></span><ChevronRight size={16} aria-hidden="true" /></summary><Facts entries={Object.entries(d).filter(([k]) => !['id', 'event_id'].includes(k)).map(([k, v]) => [label(k), v])} /></details>) : <p>No division records returned. Legacy category fees may still be recorded under Registration.</p>}</>}
      {tab === 'Publishing' && <><Facts entries={flags.map(([k, name]) => [name, k === 'is_visible' ? event[k] !== false : event[k]])} /><Facts entries={['slug', 'tournament_tag', 'points', 'federation_id', 'federation_sanction_status', 'live_youtube_url', 'youtube_playlist_url', 'live_players', 'next_match', 'poster_document_url', 'organiser_kit_url', 'media_gallery_urls'].map(k => [label(k), event[k]])} /><EventPoster key={event.poster_image_url || 'no-poster'} src={event.poster_image_url} /><SponsorLogos logos={event.sponsor_logos} />{editMode && <button className="ap-secondary" onClick={() => onAction('edit', event)}>{editMode?.startsWith('live') ? 'Edit publishing settings' : 'Preview publishing changes'}</button>}</>}
      {tab === 'Source' && <><Facts entries={[["Source", event.rankedin_id ? 'RankedIn linked' : 'Manual'], ['Calendar ID', event.id], ['RankedIn ID', event.rankedin_id], ['RankedIn URL', event.rankedin_url], ['Organisation', event._organisation?.name || event.organisation_id], ['Created by', event._audit?.creator_name || event._audit?.creator_email], ['Created at', event._audit?.created_at], ['Quick event', event.is_quick_event], ['Weekly series', event.series_id]]} /><details className="cw-division"><summary>All recorded calendar fields <ChevronRight size={16} /></summary><Facts entries={Object.entries(event).filter(([k]) => !k.startsWith('_')).map(([k, v]) => [label(k), v])} /></details><p>Sync and automatic promotion are intentionally disabled in this read-only preview.</p><button className="ap-secondary" onClick={() => setNotice('Preview only: a RankedIn sync would update event dates, divisions and results. No sync was run.')}>Preview sync information</button></>}
      {notice && <p role="status" className="pp-notice">{notice}</p>}
    </div>
    <footer className="cw-record-footer"><div className="cw-record-action-row">{!String(event.id).startsWith('demo-') && <Link className="ap-primary" to={`/admin-preview/event?event=${encodeURIComponent(event.id)}`}>Event Manager <ArrowRight size={15} /></Link>}{url && <a href={url} className="ap-secondary" target="_blank" rel="noreferrer">Public event <ExternalLink size={15} /></a>}<div className="cw-more-actions" ref={actionsRef}><button className="ap-secondary" aria-expanded={actionsOpen} aria-controls="cw-event-actions" onClick={() => setActionsOpen(v => !v)}>More actions <ChevronRight size={15} style={{ transform: actionsOpen ? 'rotate(-90deg)' : 'rotate(90deg)' }} /></button>{actionsOpen && <div className="cw-action-menu" id="cw-event-actions">{url && <button onClick={() => { setActionsOpen(false); copy(); }}>Copy public link</button>}{editMode && <button onClick={() => onAction('edit', event)}>{editLabel}</button>}<button onClick={() => onAction('duplicate', event)}>Preview duplicate</button><button className="cw-action-delete" onClick={() => onAction('delete', event)}>Preview delete</button></div>}</div></div></footer>
  </Dialog>;
}

export default function CalendarWorkspace({ session, scopeId = 'all', client = supabase, canManageEvents = false, DetailsDialog = AdvancedEventDetailsDialog, CreationDialog = CreateEventDialog, QuickCreationDialog = CreateQuickEventDialog, QuickDetailsDialog = QuickEventDetailsDialog }) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null), [error, setError] = useState(''), [refresh, setRefresh] = useState(0), [loading, setLoading] = useState(true);
  const [overrides, setOverrides] = useState({}), [action, setAction] = useState(null), [notice, setNotice] = useState(''), [exporting, setExporting] = useState(false);
  const listRef = useRef(null);
  const today = localToday();
  const view = ['dashboard', 'month', 'list'].includes(params.get('calView')) ? params.get('calView') : 'dashboard';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.get('month') || '') ? params.get('month') : today.slice(0, 7);
  const update = values => setParams(previous => { const next = new URLSearchParams(previous); Object.entries(values).forEach(([k, v]) => v ? next.set(k, v) : next.delete(k)); return next; });
  const sessionId = session?.user?.id;
  useEffect(() => {
    if (!sessionId) { setLoading(false); return; }
    const controller = new AbortController(); setLoading(true); setError('');
    loadCalendar(client, controller.signal).then(result => { if (!controller.signal.aborted) setData(result); }).catch(() => { if (!controller.signal.aborted) setError('The calendar could not be loaded. Check your access and try again.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [sessionId, client, refresh]);
  const events = useMemo(() => [...(data?.events || []).map(e => overrides[e.id] || e), ...Object.values(overrides).filter(e => String(e.id).startsWith('demo-'))], [data, overrides]);
  const filters = Object.fromEntries(['q', 'phase', 'tier', 'visibility', 'source', 'flag', 'sort'].map(k => [k, params.get(`cal_${k}`) || '']));
  const filtered = filterCalendar(events, filters, today);
  const pickFilter = values => update({ ...Object.fromEntries(Object.keys(filters).map(k => [`cal_${k}`, ''])), ...Object.fromEntries(Object.entries(values).map(([k,v]) => [`cal_${k}`, v])), calView: 'list', calPage: '' });
  const pages = Math.max(1, Math.ceil(filtered.length / 50));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(params.get('calPage'))) || 1));
  const filterKey = JSON.stringify(filters);
  useEffect(() => { if (listRef.current) listRef.current.scrollTop = 0; }, [page, filterKey]);
  const selected = events.find(e => String(e.id) === params.get('calendarEvent'));
  const selectedDay = dayKey(params.get('day'));
  const upcoming = events.filter(e => ['Upcoming', 'In progress'].includes(eventPhase(e, today))).sort((a,b) => String(a.start_date).localeCompare(String(b.start_date)));
  const open = event => update({ calendarEvent: String(event.id) });
  const chooseAction = (mode, event) => {
    if (mode === 'edit' && !calendarEditMode(event, canManageEvents)) return;
    if (mode !== 'edit') update({ calendarEvent: '' });
    setAction({ mode, event });
  };
  const closeEditor = result => {
    setAction(null);
    if (result?.eventId) update({ calendarEvent: String(result.eventId), day: '' });
    if (result?.refresh) {
      setNotice('Reloading event records after an attempted change. Review the refreshed details.');
      setRefresh(value => value + 1);
    }
  };
  const newEvent = quick => chooseAction(canManageEvents ? (quick ? 'create-quick' : 'create') : 'new', { id: `demo-${Date.now()}`, event_name: '', start_date: selectedDay || today, is_visible: false, is_quick_event: quick, is_manual: true });
  const shiftMonth = delta => { const date = new Date(`${month}-01T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + delta); update({ month: date.toISOString().slice(0,7), day: '' }); };
  const exportCalendar = async () => {
    setExporting(true);
    try {
      const { default: ExcelJS } = await import('exceljs'); const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet('Calendar');
      const fields = ['id', ...setupFields, ...flags.map(([k]) => k), 'event_status'];
      sheet.addRow([...fields.map(label), 'Demo changes']);
      filtered.forEach(e => sheet.addRow([...fields.map(k => textValue(e[k], '')), e._demo ? 'Yes' : 'No']));
      sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: 'frozen', ySplit: 1 }]; sheet.columns.forEach(c => { c.width = 24; });
      const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `4M-calendar-${today}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); setNotice(`Exported ${filtered.length} matching events.`);
    } catch { setNotice('Export failed. Please try again.'); } finally { setExporting(false); }
  };
  if (!sessionId) return <section className="pp-gate"><LockKeyhole size={28} /><h1>Calendar</h1><p>Sign in to read the calendar using your existing admin permissions.</p><a className="ap-primary" href="/admin">Sign in</a></section>;
  return <div className="cw-workspace"><header className="pp-heading"><div><p className="ap-eyebrow">Operate / Calendar</p><h1>Calendar</h1><p>Plan dates. Check setup. Control what players see.</p></div><div className="cw-actions"><button className="ap-secondary" disabled={!data || exporting} onClick={exportCalendar}><Download size={16} />{exporting ? 'Exporting…' : 'Export Excel'}</button><button className="ap-secondary" onClick={() => newEvent(true)}>{canManageEvents ? 'Create quick event' : 'Preview quick event'}</button><button className="ap-primary" onClick={() => newEvent(false)}><Plus size={16} />{canManageEvents ? 'Create event' : 'Preview create event'}</button></div></header>
    <div className="pp-notice"><LockKeyhole size={16} />{canManageEvents ? 'Create events and edit existing manual events with the live event editor. Saving, publishing and uploads affect live records. Duplication and deletion remain labelled previews; sync does not run here.' : 'Read-only calendar connection. Actions labelled Preview are local demonstrations and do not save or publish records.'}</div>
    {Object.keys(overrides).length > 0 && <div className="pp-notice">{Object.keys(overrides).length} local demo changes <button className="ap-text-button" onClick={() => { setOverrides({}); setNotice('Demo reset. Original records restored.'); }}>Reset demo</button></div>}
    <nav className="pp-tabs" aria-label="Calendar views">{[['dashboard','Dashboard'], ['month','Month view'], ['list','All events']].map(([id,name]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => update({ calView: id, calPage: '' })}>{name}</button>)}</nav>
    <div className="pp-load-status"><span role="status">{loading ? 'Reading calendar records…' : `${events.length.toLocaleString()} accessible events`}</span><button className="ap-text-button" disabled={loading} onClick={() => setRefresh(n => n + 1)}><RefreshCw size={14} />Refresh calendar</button></div>
    {loading && <RecordLoading label="Loading calendar records…" detail="Reading accessible events and linked setup records. Existing results remain visible while refreshing."/>}
    {error && <p role="alert" className="cw-error">{error}</p>}{data?.warnings.map(w => <p className="pp-notice" key={w}>{w}</p>)}{notice && <p role="status" className="pp-notice">{notice}</p>}
    {data && <>{view === 'dashboard' ? <><div className="pp-stat-grid">{[['All events',events.length,{},'neutral'], ['Upcoming',events.filter(e=>eventPhase(e,today)==='Upcoming').length,{phase:'Upcoming'},'payment'], ['Homepage featured',events.filter(e=>e.featured_event).length,{flag:'featured_event'},'warning'], ['Featured live',events.filter(e=>e.featured_live).length,{flag:'featured_live'},'info']].map(([name,count,filter,tone]) => <button key={name} className={`pp-stat pp-stat--${tone}`} onClick={() => { update({cal_phase:'',cal_flag:'',cal_q:'',cal_tier:'',cal_source:'',cal_visibility:'',calView:'list',calPage:'',...Object.fromEntries(Object.entries(filter).map(([k,v])=>[`cal_${k}`,v]))}); }}><span>{name}<ArrowRight size={16} /></span><strong><AnimatedCount value={count} /></strong><small>{name==='Upcoming' ? 'Open upcoming events' : 'View matching events'}</small></button>)}</div>
    <div className="cw-dashboard"><section className="ap-section cw-panel"><div className="pp-section-title"><h2>Next on the calendar</h2><button className="ap-text-button" onClick={()=>update({calView:'month'})}>Month view <ArrowRight size={15}/></button></div>{upcoming.slice(0,8).map(e=><button className="cw-agenda-row" key={e.id} onClick={()=>open(e)}><span className="cw-date">{dateLabel(e.start_date)}</span><span><strong>{e.event_name}</strong><small>{e.venue || 'Venue not recorded'} · {e.city || 'City not recorded'}</small></span><Tag tone={tierTone(e.sapa_status)}>{e.sapa_status || 'Untiered'}</Tag><ChevronRight size={16}/></button>)}{!upcoming.length && <p>No upcoming dated events returned.</p>}</section><section className="ap-section cw-panel"><h2>Publishing & setup</h2><p>Calendar flags are separate from registration and payment status.</p>{[['Hidden events',events.filter(e=>e.is_visible===false).length,{visibility:'hidden'}],['Setup gaps',events.filter(e=>setupGaps(e).length).length,{flag:'gaps'}],['Past events',events.filter(e=>eventPhase(e,today)==='Past').length,{phase:'Past'}],['Unscheduled',events.filter(e=>eventPhase(e,today)==='Unscheduled').length,{phase:'Unscheduled'}],['Leagues',events.filter(e=>e.is_league).length,{flag:'is_league'}]].map(([name,count,f])=><button key={name} className="pp-summary-link" onClick={()=>pickFilter(f)}><span>{name}</span><strong>{count}</strong><ChevronRight size={15}/></button>)}</section></div></> : <>
    <div className="cw-filters"><label className="cw-search"><Search size={16}/><input aria-label="Search calendar" placeholder="Search event, venue, organiser…" value={filters.q} onChange={e=>update({cal_q:e.target.value,calPage:''})}/></label>{[['phase','Event timing',['Upcoming','In progress','Past','Unscheduled','Cancelled']],['tier','SAPA tier',[...new Set(events.map(e=>e.sapa_status||'None'))].sort()],['visibility','Visibility',['visible','hidden']],['source','Source',['rankedin','manual']],['flag','Event flags',['featured_event','featured_live','is_spotlight','is_league','finance_managed','allow_payments','gaps']]].map(([key,name,options])=><label key={key}>{name}<SearchableDropdown value={filters[key]} onChange={e=>update({[`cal_${key}`]:e.target.value,calPage:''})}><option value="">All</option>{options.map(o=><option key={o} value={o}>{label(o)}</option>)}</SearchableDropdown></label>)}<button className="ap-text-button" onClick={()=>update(Object.fromEntries(Object.keys(filters).map(k=>[`cal_${k}`,''])))}>Clear filters</button></div>
    {view === 'month' ? <><div className="cw-month-heading"><div className="cw-actions"><button className="ap-secondary" aria-label="Previous month" onClick={()=>shiftMonth(-1)}><ChevronLeft size={16}/></button><h2>{new Date(`${month}-01T12:00:00Z`).toLocaleDateString('en-ZA',{month:'long',year:'numeric',timeZone:'UTC'})}</h2><button className="ap-secondary" aria-label="Next month" onClick={()=>shiftMonth(1)}><ChevronRight size={16}/></button></div><div className="cw-actions"><label>Jump to month <input aria-label="Jump to month" type="month" value={month} onChange={e=>update({month:e.target.value,day:''})}/></label><button className="ap-secondary" onClick={()=>update({month:today.slice(0,7),day:today})}>Today</button></div></div><div className="cw-month-scroll"><div className="cw-month-grid">{['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=><div className="cw-weekday" key={d}>{d}</div>)}{monthDays(month).map(day=>{const matches=filtered.filter(e=>occursOn(e,day));return <div key={day} className={`cw-day ${day.slice(0,7)!==month?'cw-day--outside':''} ${day===today?'cw-day--today':''}`}><button className="cw-day-number" aria-label={`Show events on ${dateLabel(day)}`} onClick={()=>update({day})}>{Number(day.slice(8))}</button>{matches.slice(0,3).map(e=><button className={`cw-month-event cw-tier-${tierTone(e.sapa_status)}`} title={e.event_name} key={e.id} onClick={()=>open(e)}>{e.event_name}</button>)}{matches.length>3&&<button className="ap-text-button" onClick={()=>update({day})}>+{matches.length-3} more</button>}</div>;})}</div></div>{selectedDay&&!selected&&!action&&<Dialog title={dateLabel(selectedDay)} onClose={()=>update({day:''})}><div className="cw-panel cw-day-list">{filtered.filter(e=>occursOn(e,selectedDay)).map(e=><button className="cw-agenda-row" key={e.id} onClick={()=>open(e)}><strong>{e.event_name}</strong><span>{e.venue}</span><ChevronRight size={16}/></button>)}{!filtered.some(e=>occursOn(e,selectedDay))&&<p>No matching events on this date.</p>}<button className="ap-secondary" onClick={()=>newEvent(false)}>{canManageEvents ? 'Create event' : 'Preview event on this date'}</button></div></Dialog>}<p className="cw-footnote">Multi-day events appear on each scheduled day. Unscheduled events remain in All events.</p></> : <><div className="cw-list-heading"><p>{filtered.length} matching events</p><label>Sort <SearchableDropdown value={filters.sort} onChange={e=>update({cal_sort:e.target.value,calPage:''})}><option value="">Newest date first</option><option value="oldest">Oldest date first</option><option value="name">Event name</option></SearchableDropdown></label></div><div ref={listRef} className="ap-section pp-table-wrap"><table className="pp-table cw-table"><thead><tr>{['Event','Dates / timing','Location','Tier / source','Publishing','Created by',''].map((h,i)=><th key={i}>{h}</th>)}</tr></thead><tbody>{filtered.slice((page-1)*50,page*50).map(e=><tr className="pp-player-row" key={e.id} onClick={ev=>{if(!ev.target.closest('button,a')&&!window.getSelection()?.toString())open(e);}}><td><button className="pp-person" onClick={()=>open(e)}><EventImage event={e}/><span><b>{e.event_name||'Unnamed event'}</b><small>{e._organisation?.name||e.organiser_name||'Organiser not recorded'}</small></span></button></td><td>{dateLabel(e.start_date)}{e.end_date&&e.end_date!==e.start_date&&<small>to {dateLabel(e.end_date)}</small>}<Tag tone={phaseTone(eventPhase(e,today))}>{eventPhase(e,today)}</Tag></td><td>{e.city||'Not recorded'}<small>{e.venue||'Venue not recorded'}</small></td><td><Tag tone={tierTone(e.sapa_status)}>{e.sapa_status||'Untiered'}</Tag><small>{e.rankedin_id?`RankedIn · ${e.rankedin_id}`:'Manual'}</small></td><td><div className="pp-tags"><Tag tone={e.is_visible===false?'neutral':'positive'}>{e.is_visible===false?'Hidden':'Visible'}</Tag>{e.featured_event&&<Tag tone="warning">Featured</Tag>}{e.featured_live&&<Tag tone="violet">Live feature</Tag>}{e.is_league&&<Tag tone="info">League</Tag>}{e._demo&&<Tag tone="warning">Demo</Tag>}</div></td><td>{e._audit?.creator_name||e._audit?.creator_email||'Not recorded'}</td><td><button className="ap-icon-button" aria-label={`Open ${e.event_name}`} onClick={()=>open(e)}><ChevronRight size={16}/></button></td></tr>)}</tbody></table>{!filtered.length&&<p className="cw-panel">No matching events. Clear filters to see all accessible records.</p>}</div><div className="cw-pagination"><span>{filtered.length?`${(page-1)*50+1}–${Math.min(page*50,filtered.length)}`:'0'} of {filtered.length}</span><div className="cw-actions"><button className="ap-secondary" disabled={page===1} onClick={()=>update({calPage:String(page-1)})}>Previous</button><span>Page {page} of {pages}</span><button className="ap-secondary" disabled={page===pages} onClick={()=>update({calPage:String(page+1)})}>Next</button></div></div></>}
    </>}</>}
    {selected && !action && <EventDrawer key={selected.id} event={selected} client={client} canManageEvents={canManageEvents} onClose={()=>update({calendarEvent:''})} onAction={chooseAction}/>}
    {action?.mode === 'create' && canManageEvents && <CreationDialog client={client} session={session} scopeId={scopeId} onClose={closeEditor}/>}
    {action?.mode === 'create-quick' && canManageEvents && <QuickCreationDialog client={client} session={session} scopeId={scopeId} onClose={closeEditor}/>}
    {action?.mode === 'edit' && calendarEditMode(action.event, canManageEvents) === 'live-quick' && <QuickDetailsDialog key={action.event.id} event={action.event} client={client} session={session} scopeId={scopeId} onClose={closeEditor}/>}
    {action?.mode === 'edit' && calendarEditMode(action.event, canManageEvents) === 'live' && <DetailsDialog key={action.event.id} event={action.event} client={client} session={session} scopeId={scopeId} onClose={closeEditor}/>}
    {action && !['delete', 'create', 'create-quick'].includes(action.mode) && (action.mode !== 'edit' || calendarEditMode(action.event, canManageEvents) === 'preview') && <SetupPreview key={action.event.id} event={action.event} mode={action.mode} onClose={()=>setAction(null)} onApply={draft=>{setOverrides(v=>({...v,[draft.id]:draft}));setAction(null);setNotice('Applied to this demo only. Reload or Reset demo to discard.');update({calendarEvent:String(draft.id)});}}/>}
    {action?.mode === 'delete' && <Dialog title="Delete event · preview" onClose={()=>setAction(null)}><div className="cw-panel"><p>Deleting <strong>{action.event.event_name}</strong> could affect connected registrations, divisions and results.</p><p>This preview does not delete or hide the event.</p><button className="ap-primary" onClick={()=>{setNotice('Delete confirmation reviewed. No event was deleted.');setAction(null);}}>Finish preview without deleting</button></div></Dialog>}
  </div>;
}
