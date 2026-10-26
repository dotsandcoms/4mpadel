import SearchableDropdown from "../../components/SearchableDropdown";
import RecordLoading from './RecordLoading.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { animate, motion as Motion, useReducedMotion } from 'framer-motion';
import { ArrowRight, ChevronLeft, ChevronRight, Download, ExternalLink, LockKeyhole, RefreshCw, Search, UserRound, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { findPaymentForRegistration, getRegistrationEntryFeePaid, normalizePaymentMetadata, resolveRegistrationPaymentMethod, resolveRegistrationPayer } from '../../utils/paymentRegistrationMatch';
import { resolveRegistrationLicenseDisplay } from '../../utils/registrationLicense';
import { PAGE_SIZE, dateLabel, directoryLicense, distribution, filterPlayers, isPublicPlayer, loadDirectory, loadPlayerConnections, moneyLabel, playerStats, textValue } from './playersData';
import './PlayersWorkspace.css';
import PlayerProfileEditDialog from './PlayerProfileEditDialog';
import PlayerAccountDialog from './PlayerAccountDialog';

const Badge = ({ tone = 'neutral', children }) => <span className={`ap-status ap-status--${tone}`}>{children}</span>;
const paymentTone = status => ({ paid: 'positive', success: 'positive', pending: 'warning', unpaid: 'warning', failed: 'danger', refunded: 'info', withdrawn: 'withdrawn', comped: 'violet' }[String(status).toLowerCase()] || 'neutral');
const fullTone = kind => ({ full: 'positive', temp: 'info', active: 'violet', none: 'danger' }[kind] || 'neutral');
const eventUrl = id => `/admin-preview/event?event=${encodeURIComponent(id)}`;
const normalEmail = email => String(email || '').trim().toLowerCase();

function Avatar({ player, large = false }) {
  const [failed, setFailed] = useState(false);
  return <span className={`pp-avatar ${large ? 'pp-avatar--large' : ''}`}>
    {player.image_url && !failed ? <img src={player.image_url} alt="" width={large ? 72 : 40} height={large ? 72 : 40} loading="lazy" onError={() => setFailed(true)} /> : <UserRound size={large ? 30 : 18} aria-hidden="true" />}
  </span>;
}

export function Dialog({ title, children, onClose, drawer = false, kicker = '4M Padel · Player records', busy = false, className = '' }) {
  const ref = useRef(null);
  useEffect(() => {
    const dialog = ref.current;
    const active = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => { dialog.close(); document.body.style.overflow = overflow; active?.focus?.(); };
  }, []);
  return <dialog ref={ref} className={`pp-dialog ${drawer ? 'pp-dialog--drawer' : ''} ${className}`} aria-label={title} onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="pp-dialog-inner"><header className="pp-dialog-header"><div><p className="ap-kicker">{kicker}</p><h2>{title}</h2></div><button className="ap-icon-button" autoFocus disabled={busy} aria-label={`Close ${title}`} onClick={onClose}><X size={20} /></button></header>{children}</div>
  </dialog>;
}

export function Facts({ entries }) {
  return <dl className="pp-facts">{entries.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{textValue(value)}</dd></div>)}</dl>;
}

export function AnimatedCount({ value }) {
  const ref = useRef(null);
  const current = useRef(0);
  const reduceMotion = useReducedMotion();
  useEffect(() => {
    const render = number => {
      current.current = number;
      if (ref.current) ref.current.textContent = Math.round(number).toLocaleString();
    };
    if (reduceMotion) { render(value); return; }
    const controls = animate(current.current, value, { duration: .65, ease: 'easeOut', onUpdate: render });
    return () => controls.stop();
  }, [value, reduceMotion]);
  return <span className="pp-count" aria-label={value.toLocaleString()}><span ref={ref} aria-hidden="true">{value.toLocaleString()}</span></span>;
}

function Distribution({ title, values, total, onPick, tone = 'payment' }) {
  const reduceMotion = useReducedMotion();
  const storageKey = `4m:players:chart:${title}`;
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'collapsed'; } catch { return true; }
  });
  const toggle = event => {
    const next = event.currentTarget.open;
    setOpen(next);
    try { localStorage.setItem(storageKey, next ? 'expanded' : 'collapsed'); } catch { /* Browser storage is optional. */ }
  };
  return <details className="ap-section pp-distribution pp-chart" open={open} onToggle={toggle}>
    <summary><h2>{title}</h2><span className="pp-chart-toggle">{open ? 'Collapse' : 'Expand'}<ChevronRight size={16} aria-hidden="true" /></span></summary>
    {open && <div className="pp-chart-body">{values.length ? values.slice(0, 8).map(([name, count], index) => <button key={name} disabled={!onPick} onClick={() => onPick?.(name)} className="pp-bar-row"><span>{name}<b>{count.toLocaleString()}</b></span><Motion.span className="pp-bar-track" initial={reduceMotion ? 'visible' : 'hidden'} whileInView="visible" viewport={{ once: true, amount: 1 }}><Motion.i className={`pp-bar pp-bar--${tone}`} style={{ width: `${total ? count / total * 100 : 0}%`, transformOrigin: 'left' }} variants={{ hidden: { scaleX: 0 }, visible: { scaleX: 1 } }} transition={{ duration: reduceMotion ? 0 : .95, delay: reduceMotion ? 0 : index * .07, ease: [0.22, 1, 0.36, 1] }} /></Motion.span></button>) : <p>No records available.</p>}{values.length > 8 && <small>Top 8 of {values.length} groups. Use the directory filters for all groups.</small>}</div>}
  </details>;
}

function PlayerDrawer({ player, events, onClose, onAction, onPlayer, client, initialTab }) {
  const [tab, setTab] = useState(initialTab || 'Profile');
  const [retry, setRetry] = useState(0);
  const [connections, setConnections] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    loadPlayerConnections(client, player, controller.signal).then(result => { if (!controller.signal.aborted) setConnections(result); }).catch(err => { if (!controller.signal.aborted) setError(err.message || 'Unable to read linked records'); });
    return () => controller.abort();
  }, [player, retry, client]);
  const licence = directoryLicense(player);
  const selectedPayments = connections ? [...new Map([...connections.ownPayments, ...connections.registrations.map(r => findPaymentForRegistration(connections.payments, r)).filter(Boolean)].map(p => [p.id, p])).values()].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) : [];
  const ledgerPayments = selectedPayments.map(p => ({ ...p, metadata: normalizePaymentMetadata(p.metadata) }));
  const eventName = id => [...(connections?.events || []), ...events].find(e => String(e.id) === String(id))?.event_name || `Event ${id}`;
  return <Dialog title="Player record" drawer onClose={onClose}>
    <div className="pp-profile-heading"><Avatar player={player} large /><div><h3>{player.name || 'Unnamed player'}</h3><p>{player.rank_label || 'Rank not recorded'} · {player.points == null ? 'Points not recorded' : `${Number(player.points).toLocaleString()} points`}</p><Badge tone={licence.tone}>{licence.label}</Badge> <Badge tone={isPublicPlayer(player) ? 'positive' : 'neutral'}>{isPublicPlayer(player) ? 'Publicly visible' : 'Hidden profile'}</Badge></div></div>
    <nav className="pp-tabs" aria-label="Player record sections">{['Profile', 'Events & teams', 'Licences', 'Payments', 'Manage'].map(item => <button key={item} aria-current={tab === item ? 'page' : undefined} onClick={() => setTab(item)}>{item}</button>)}</nav>
    <div className="pp-drawer-body">
      {tab === 'Profile' && <><section><h3>Contact & identity</h3><Facts entries={[["Player ID", player.id], ['Email', player.email], ['Phone', player.contact_number], ['Account type', player.account_type], ['Registered', dateLabel(player.created_at)], ['Last login', dateLabel(player.last_login)]]} /></section><section><h3>On court</h3><Facts entries={[["Club", player.home_club], ['Club ID', player.club_id], ['Region', player.region], ['Category', player.category], ['Gender', player.gender], ['Age group', player.age_group], ['Nationality', player.nationality], ['Level', player.level], ['Rank', player.rank_label], ['Points', player.points], ['Win rate', player.win_rate], ['RankedIn ID', player.rankedin_id], ['Playing hand', ({ right: 'Right-handed', left: 'Left-handed' })[player.playing_hand]], ['Court side', ({ left: 'Left', right: 'Right', either: 'Either' })[player.court_side]], ['Racket brand', player.racket_brand], ['Sponsors', player.sponsors]]} /></section><section><h3>About</h3><p className="pp-prose">{textValue(player.bio, 'No biography recorded.')}</p></section><div className="pp-notice">Public visibility follows the existing admin: approved, paid registration and a full licence are all required.</div></>}
      {['Events & teams', 'Payments'].includes(tab) && !connections && !error && <p role="status">Reading linked registrations and payments…</p>}
      {error && <div role="alert" className="pp-notice">{error}<button className="ap-secondary" onClick={() => { setError(''); setRetry(r => r + 1); }}>Retry</button></div>}
      {tab !== 'Profile' && connections?.warnings.map(w => <div role="status" className="pp-notice" key={w}>{w}</div>)}
      {tab === 'Events & teams' && connections && <>{connections.registrations.length === 0 && <p>No matching registrations returned for this profile’s email.</p>}{connections.registrations.map(reg => {
        const partner = connections.partners.find(p => normalEmail(p.email) === normalEmail(reg.partner_email));
        const partnerReg = connections.teamRegistrations.find(r => normalEmail(r.email) === normalEmail(reg.partner_email) && String(r.event_id) === String(reg.event_id) && r.division === reg.division && r.status !== 'withdrawn');
        return <details className="pp-team" key={reg.id}><summary><span><strong>{eventName(reg.event_id)}</strong><span className="pp-team-meta">{textValue(reg.division)} · {dateLabel(reg.created_at)}</span><Badge tone={paymentTone(reg.status)}>{reg.status || 'Status not recorded'}</Badge></span><span className="pp-team-toggle"><span className="pp-team-expand">Show details</span><span className="pp-team-collapse">Hide details</span><ChevronRight size={16} aria-hidden="true" /></span></summary><div className="pp-team-event-link"><Link to={eventUrl(reg.event_id)}>Open event <ArrowRight size={16} /></Link></div>{[{ profile: player, entry: reg }, ...(reg.partner_name || reg.partner_email ? [{ profile: partner || { name: reg.partner_name || reg.partner_email, email: reg.partner_email }, entry: partnerReg }] : [])].map(({ profile, entry }, index) => {
          const payment = entry ? findPaymentForRegistration(connections.payments, entry) : null;
          const payer = entry ? resolveRegistrationPayer(payment, entry) : {};
          const method = entry ? resolveRegistrationPaymentMethod(entry, payment) : '';
          const amount = payment && entry ? getRegistrationEntryFeePaid(payment, entry, 0) : null;
          const licenceDisplay = profile.id ? resolveRegistrationLicenseDisplay(profile.email, reg.event_id, profile, connections.payments.map(p => ({ ...p, metadata: normalizePaymentMetadata(p.metadata) }))) : null;
          return <div className="pp-team-member" key={`${reg.id}-${index}`}><button className="pp-person" disabled={!profile.id || profile.id === player.id} onClick={() => onPlayer(profile.id)}><Avatar player={profile} /><span><b>{profile.name}</b><small>{profile.points != null ? `${Number(profile.points).toLocaleString()} points` : 'Points not recorded'}</small></span></button><Facts entries={[["Email", profile.email], ['Phone', profile.contact_number || entry?.phone], ['Registration', entry?.id], ['Amount paid', moneyLabel(amount)], ['Payment source', payer.isPartnerPaid ? `Paid by ${payer.payerEmail}` : method || 'Not available']]} /><div className="pp-tags"><Badge tone={paymentTone(entry?.payment_status)}>{entry?.payment_status || 'Payment not available'}</Badge><Badge tone={licenceDisplay ? fullTone(licenceDisplay.kind) : 'neutral'}>{licenceDisplay?.text || 'Licence not available'}</Badge></div></div>;
        })}{!reg.partner_name && !reg.partner_email && <p>Partner not recorded.</p>}</details>;
      })}</>}
      {tab === 'Licences' && <section><h3>Licence coverage and history</h3><p>Open the licence register for this player’s permanent number, annual and event coverage, purchase dates, payments and change history. Licence changes remain on release hold.</p><Link className="ap-primary" to={`/admin-preview/licenses?license_player=${encodeURIComponent(player.id)}`}>Open player licences <ArrowRight size={16}/></Link></section>}
      {tab === 'Payments' && connections && <><div className="pp-notice">Transactions linked by player ID or the existing registration-payment matcher. Shared payments show the whole transaction amount, not a per-player balance. Refunds and organiser payouts belong in the event income statement.</div>{!ledgerPayments.length && <p>No linked payment transactions returned.</p>}{ledgerPayments.map(p => <details className="pp-payment-record" key={p.id}><summary><span>{textValue(p.payment_type, 'Payment')}<small>{dateLabel(p.created_at)} · {p.reference || p.id}</small></span><strong>{moneyLabel(p.amount)}</strong><Badge tone={paymentTone(p.status)}>{p.status || 'Unknown'}</Badge></summary><Facts entries={[["Reference", p.reference], ['Payment ID', p.id], ['Method', p.payment_method], ['Amount (whole transaction)', moneyLabel(p.amount)], ['Recorded', dateLabel(p.created_at)]]} />{p.event_id && <Link to={eventUrl(p.event_id)}>Open {eventName(p.event_id)} <ArrowRight size={15} /></Link>}</details>)}</>}
{tab === 'Manage' && <><div className="pp-notice"><LockKeyhole size={18} />Profile details can be saved after review. Login invitations require super-admin confirmation. Password reset, impersonation and deletion remain on security hold.</div><Link className="ap-secondary" to={`/admin-preview/licenses?license_player=${encodeURIComponent(player.id)}`}>Open player licences</Link><div className="pp-manage-grid">{['Edit profile', 'Send login invite', 'Reset password', 'Test login', 'Delete player'].map(action => <button key={action} className={`ap-secondary ${action === 'Delete player' ? 'pp-danger' : ''}`} onClick={() => onAction(action, player)}>{action}<ChevronRight size={16} /></button>)}</div></>}
    </div><footer className="pp-drawer-footer"><a href={`/players?id=${encodeURIComponent(player.id)}`} className="ap-secondary" target="_blank" rel="noreferrer">Public profile <ExternalLink size={15} /></a><button className="ap-primary" onClick={() => onAction('Edit profile', player)}>Edit profile</button></footer>
  </Dialog>;
}

export default function PlayersWorkspace({ session, client = supabase, scopeId }) {
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refresh, setRefresh] = useState(0);
  const [action, setAction] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState('');
  const sessionId = session?.user?.id;
  useEffect(() => { setAction(null); }, [sessionId, scopeId, client]);
  useEffect(() => {
    if (!sessionId) { setData(null); setNotice(''); return; }
    const controller = new AbortController();
    loadDirectory(client, controller.signal).then(result => { if (!controller.signal.aborted) { setData(result); setError(''); setLoading(false); } }).catch(err => { if (!controller.signal.aborted) { setError(err.message || 'Unable to load players'); setLoading(false); } });
    return () => controller.abort();
  }, [sessionId, refresh, client]);
  const update = (values, replace = false) => setParams(current => { const next = new URLSearchParams(current); Object.entries(values).forEach(([key, value]) => value ? next.set(key, value) : next.delete(key)); return next; }, { replace });
  const view = ['dashboard', 'directory', 'licences'].includes(params.get('view')) ? params.get('view') : 'dashboard';
  const filters = Object.fromEntries(['q', 'licence', 'visibility', 'region', 'category', 'sort'].map(key => [key, params.get(key) || '']));
  const players = data?.players || [];
  const filtered = filterPlayers(players, filters);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(pageCount, Math.max(1, Math.floor(Number(params.get('p'))) || 1));
  const currentRows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const stats = playerStats(players);
  const selected = players.find(p => String(p.id) === params.get('player'));
  const latestPayment = useMemo(() => { const map = new Map(); for (const p of data?.membershipPayments || []) if (!map.has(p.player_id) || map.get(p.player_id) < p.created_at) map.set(p.player_id, p.created_at); return map; }, [data]);
  const filter = values => update({ ...values, p: '', view: 'directory' });
  const reload = () => { setLoading(true); setRefresh(r => r + 1); };
  async function exportPlayers() {
    const exportRows = view === 'licences' ? players : filtered;
    setExporting(true); setNotice('');
    try {
      const { default: ExcelJS } = await import('exceljs');
      const book = new ExcelJS.Workbook();
      const sheet = book.addWorksheet('Players');
      const fields = ['id', 'name', 'email', 'contact_number', 'region', 'home_club', 'category', 'gender', 'age_group', 'nationality', 'rankedin_id', 'points', 'rank_label', 'win_rate', 'license_type', 'paid_registration', 'approved', 'created_at', 'last_login', 'racket_brand'];
      sheet.addRow([...fields.map(f => f.replaceAll('_', ' ')), 'Public visibility', 'Full licence paid at']);
      exportRows.forEach(p => sheet.addRow([...fields.map(f => textValue(p[f], '')), isPublicPlayer(p) ? 'Visible' : 'Hidden', dateLabel(latestPayment.get(p.id))]));
      sheet.getRow(1).font = { bold: true };
      sheet.views = [{ state: 'frozen', ySplit: 1 }];
      sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: fields.length + 2 } };
      sheet.columns.forEach(col => { col.width = 24; });
      const licences = book.addWorksheet('Temporary licences');
      licences.addRow(['Player ID', 'Name', 'Event ID', 'Event', 'Event date', 'Recorded']);
      exportRows.forEach(p => (p.temporary_licenses || []).forEach(l => licences.addRow([String(p.id), p.name, l.event_id, l.event_name, l.event_date, l.created_at])));
      licences.columns.forEach(col => { col.width = 24; });
      const url = URL.createObjectURL(new Blob([await book.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
      const a = document.createElement('a'); a.href = url; a.download = `4M-players-${new Date().toISOString().slice(0, 10)}.xlsx`; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(`Exported ${exportRows.length.toLocaleString()} players and their temporary licences. No database changes.`);
    } catch { setNotice('Export failed. Please try again.'); } finally { setExporting(false); }
  }
  return <div className="pp-workspace"><header className="pp-heading"><div><p className="ap-eyebrow">Network / Players</p><h1>Players</h1><p>Membership, profiles and the events that connect them.</p></div><div className="pp-actions"><button className="ap-secondary" disabled={!data || loading || exporting} onClick={exportPlayers}><Download size={16} />{exporting ? 'Exporting…' : 'Export Excel'}</button><button className="ap-primary" disabled={!sessionId} onClick={() => setAction({ name: 'Add player' })}>Add player</button></div></header>
    <div className="pp-notice"><LockKeyhole size={16} /><span>Profile details can be saved by verified Players admins. Creation and invitations require verified super-admin access; sensitive account actions remain on hold.</span></div>
    <nav className="pp-tabs" aria-label="Players module sections">{[['dashboard', 'Dashboard'], ['directory', 'Player directory']].map(([id, label]) => <button key={id} aria-current={view === id ? 'page' : undefined} onClick={() => update({ view: id, p: '' })}>{label}</button>)}<Link to="/admin-preview/licenses">Licences & membership</Link></nav>
    {!sessionId ? <section className="ap-section pp-gate"><LockKeyhole size={32} /><h2>Sign in to read the full Players module</h2><p>Private profiles, licences and payments use your existing admin permissions. This preview does not replace protected records with sample data.</p><a href="/admin" target="_blank" rel="noreferrer" className="ap-primary">Open local admin sign-in <ExternalLink size={16} /></a><p>After signing in, return here. The module loads automatically.</p></section> : loading ? <section className="ap-section"><RecordLoading label="Loading player records…" detail="Reading accessible profiles and linked licence records. The directory will appear when loading is complete."/></section> : error ? <section className="ap-section pp-gate" role="alert"><h2>Players could not be loaded</h2><p>{error}</p><button className="ap-primary" onClick={reload}>Try again</button></section> : <>
      <div className="pp-load-status"><span>{players.length.toLocaleString()} accessible profiles · {dateLabel(new Date())}</span><button className="ap-text-button" onClick={reload}><RefreshCw size={14} />Refresh players</button></div>
      {data?.warnings.map(w => <div className="pp-notice" key={w}>{w}</div>)}
      {notice && <div className="pp-notice" role="status">{notice}</div>}
      {view !== 'directory' && <div className="pp-stat-grid">{[['All players', stats.total, '', 'neutral'], ['Full licences', stats.full, 'full', 'payment'], ['Temporary licences', stats.temporary, 'temporary', 'info'], ['Unpaid / no licence', stats.unpaid, 'unpaid', 'warning']].map(([label, value, licence, tone]) => <button className={`pp-stat pp-stat--${tone}`} key={label} onClick={() => filter({ licence, visibility: '', q: '', region: '', category: '' })}><span>{label}<ArrowRight size={16} /></span><strong><AnimatedCount value={value} /></strong><small>View matching players</small></button>)}</div>}
      {view === 'dashboard' && <><div className="pp-dashboard-grid"><Distribution title="Players by region" values={distribution(players, 'region')} total={players.length} onPick={region => filter({ region: region === 'Unassigned' ? '__unassigned' : region })} /><Distribution title="Playing categories" values={distribution(players, 'category')} total={players.length} onPick={category => filter({ category: category === 'Unassigned' ? '__unassigned' : category })} tone="info" /><Distribution title="Gender" values={distribution(players, 'gender')} total={players.length} tone="info" /><Distribution title="New profiles by month" values={distribution(players.filter(p => p.created_at), 'created_at').reduce((acc, [date, count]) => { const month = date.slice(0, 7); const found = acc.find(a => a[0] === month); if (found) found[1] += count; else acc.push([month, count]); return acc; }, []).sort((a, b) => b[0].localeCompare(a[0]))} total={players.length} /></div><div className="pp-section-title"><h2>Recently registered</h2><button className="ap-text-button" onClick={() => update({ view: 'directory' })}>All players <ArrowRight size={16} /></button></div></>}
      {view === 'licences' && <section className="ap-section"><h2>Licences have moved to the register</h2><p>View annual coverage, purchase dates, temporary event licences and full change history in the dedicated module.</p><Link className="ap-primary" to="/admin-preview/licenses">Open licence register <ArrowRight size={16}/></Link></section>}
      {view === 'directory' && <div className="pp-filters"><label className="pp-search"><Search size={17} /><span className="ap-visually-hidden">Search players</span><input placeholder="Name, email, phone, club or player ID…" value={filters.q} onChange={e => update({ q: e.target.value, p: '' }, true)} /></label><label>Licence<SearchableDropdown value={filters.licence} onChange={e => update({ licence: e.target.value, p: '' })}><option value="">All licences</option><option value="full">Full</option><option value="temporary">Temporary</option><option value="unpaid">Unpaid / none</option><option value="unknown">Needs checking</option></SearchableDropdown></label><label>Visibility<SearchableDropdown value={filters.visibility} onChange={e => update({ visibility: e.target.value, p: '' })}><option value="">All profiles</option><option value="visible">Visible</option><option value="hidden">Hidden</option></SearchableDropdown></label>{['region', 'category'].map(field => <label key={field}>{field}<SearchableDropdown value={filters[field]} onChange={e => update({ [field]: e.target.value, p: '' })}><option value="">All {field === 'region' ? 'regions' : 'categories'}</option><option value="__unassigned">Unassigned</option>{distribution(players, field).filter(([name]) => name !== 'Unassigned').sort((a, b) => a[0].localeCompare(b[0])).map(([name]) => <option key={name}>{name}</option>)}</SearchableDropdown></label>)}<label>Sort<SearchableDropdown value={filters.sort} onChange={e => update({ sort: e.target.value, p: '' })}><option value="">Newest first</option><option value="name">Name A–Z</option><option value="points">Points: highest</option></SearchableDropdown></label><button className="ap-text-button" onClick={() => update({ q: '', licence: '', visibility: '', category: '', region: '', sort: '', p: '' })}>Clear filters</button></div>}
      {view !== 'licences' && <div className="ap-section pp-table-wrap"><table className="pp-table"><thead><tr>{['Player', 'Licence', 'Visibility', 'Registered / last login', 'Category / region', 'Home club', 'Points', ''].map((h, i) => <th key={i} scope="col">{h}</th>)}</tr></thead><tbody>{(view === 'dashboard' ? filterPlayers(players, {}).slice(0, 6) : currentRows).map(player => { const licence = directoryLicense(player); return <tr key={player.id} className="pp-player-row" onClick={event => {
        if (event.target.closest('button, a, input, select, textarea')) return;
        if (window.getSelection()?.toString()) return;
        update({ player: player.id, detail: '' });
      }}><td><button className="pp-person" onClick={() => update({ player: player.id })}><Avatar player={player} /><span><b>{player.name || 'Unnamed player'}</b><small>{player.email || `ID ${player.id}`}</small></span></button></td><td><Badge tone={licence.tone}>{licence.label}</Badge>{player.license_type === 'temporary' && <small>{player.temporary_licenses?.length || 0} event licence records</small>}{latestPayment.has(player.id) && <small>Paid {dateLabel(latestPayment.get(player.id))}</small>}</td><td><Badge tone={isPublicPlayer(player) ? 'positive' : 'neutral'}>{isPublicPlayer(player) ? 'Visible' : 'Hidden'}</Badge></td><td>{dateLabel(player.created_at)}<small>Login: {dateLabel(player.last_login)}</small></td><td>{textValue(player.category, '—')}<small>{textValue(player.region, '—')}</small></td><td>{textValue(player.home_club, '—')}</td><td className="pp-points">{player.points == null ? '—' : Number(player.points).toLocaleString()}</td><td><button className="ap-icon-button" aria-label={`View ${player.name || 'player'}`} onClick={() => update({ player: player.id })}><ChevronRight size={18} /></button></td></tr>; })}</tbody></table>{(view === 'dashboard' ? !players.length : !filtered.length) && <div className="pp-gate"><h3>No players found</h3><p>{players.length ? 'Try clearing the filters or searching another name.' : 'Your current permissions returned no player records.'}</p></div>}</div>}
      {view === 'directory' && <nav className="ap-pagination" aria-label="Player pages"><span>{filtered.length ? `${(page - 1) * PAGE_SIZE + 1}–${Math.min(page * PAGE_SIZE, filtered.length)}` : '0'} of {filtered.length.toLocaleString()} players · 50 per page</span><div><button className="ap-secondary" disabled={page === 1} onClick={() => update({ p: page - 1 })}><ChevronLeft size={16} />Previous</button><span>Page {page} of {pageCount}</span><button className="ap-secondary" disabled={page >= pageCount} onClick={() => update({ p: page + 1 })}>Next<ChevronRight size={16} /></button></div></nav>}
      {params.has('player') && !selected && <div className="pp-notice">This player is not available to the current account.<button className="ap-text-button" onClick={() => update({ player: '' })}>Dismiss</button></div>}
      {selected && <PlayerDrawer initialTab={params.get('detail') === 'Licences' ? 'Licences' : 'Profile'} client={client} key={selected.id} player={selected} events={data?.events || []} onClose={() => update({ player: '', detail: '' })} onPlayer={id => update({ player: id })} onAction={(name, player) => setAction({ name, player })} />}
    </>}
{sessionId && (['Edit profile', 'Add player'].includes(action?.name) ? <PlayerProfileEditDialog key={`${sessionId}:${scopeId}:${action.player?.id || "new"}`} client={client} creating={action.name === "Add player"} userId={sessionId} scopeId={scopeId} player={action.player} onClose={() => setAction(null)} onSaved={saved => { setData(current => current ? ({ ...current, players: action.name === "Add player" ? [saved, ...current.players] : current.players.map(player => String(player.id) === String(saved.id) ? { ...player, ...saved } : player) }) : current); setAction(null); setNotice('Player profile changes saved. No payment was collected or sign-in account migrated.'); }}/> : action && <PlayerAccountDialog client={client} userId={sessionId} scopeId={scopeId} key={`${sessionId}:${scopeId}:${action.name}:${action.player?.id}`} action={action.name} player={action.player} onClose={() => setAction(null)} />)}
  </div>;
}
