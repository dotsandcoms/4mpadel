import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Download, LayoutDashboard, List, Plus, RefreshCw, Search, Settings2, ShieldCheck, Ticket, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { licenseRpc, licenseLabel } from '../../utils/licenses';
import { licenseStartDate } from '../../utils/licenseDates';
import { grantTemporaryLicense } from '../../utils/temporaryLicenseAssignment';
import TemporaryLicenseSales from './TemporaryLicenseSales';
import LicenseOverview from './LicenseOverview';
import { coverageStatus, groupLicensePayments } from '../../utils/licenseReporting';
import './license-dashboard.css';

const input = 'license-input';
const primary = 'license-button license-button-primary';
const secondary = 'license-button license-button-secondary';
const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date()));
const money = (n, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(Number(n || 0));
const sourceLabel = source => ({ legacy: 'Legacy import', payment: 'Payment', manual: 'Manual payment', complimentary: 'Complimentary' }[source] || source);
const manage = (action, data = {}) => licenseRpc('manage_license', { p_action: action, p_input: data });
const shortDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : 'Not recorded';
const timestamp = value => value ? new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : 'Not recorded';
function Field({ label, children }) {
  return <label className="license-field"><span>{label}</span>{children}</label>;
}
function Status({ value }) {
  const label = ({ success: 'Paid', processing: 'Processing', pending: 'Pending', upcoming: 'Upcoming', revoked: 'Revoked' })[value] || (value ? value.charAt(0).toUpperCase() + value.slice(1) : 'Unknown');
  return <span className={`license-status license-status-${value || 'pending'}`}><i aria-hidden="true" />{label}</span>;
}
function LicenseType({ row }) {
  return <span className={`license-type license-type-${row.license_type}`}>{row.license_type === 'full' ? 'Full' : 'Temporary'}</span>;
}
function FullPurchaseKind({ row }) {
  if (row.license_type !== 'full') return null;
  const label = row.is_renewal ? row.renewed_from_year ? `Renewed from ${row.renewed_from_year}` : 'Full renewal' : row.source === 'complimentary' ? 'Complimentary' : row.purchased_on ? 'New Full purchase' : 'Imported coverage';
  return <p className="license-purchase-kind">{label}</p>;
}

function PlayerAvatar({ name, src, small = false }) {
  const [failedSrc, setFailedSrc] = useState(null);
  const initials = name?.split(' ').filter(Boolean).map(part => part[0]).slice(0, 2).join('') || '?';
  return <span className={`license-avatar ${small ? 'license-avatar-small' : ''}`} aria-hidden="true">{initials}{src && failedSrc !== src && <img src={src} alt="" loading="lazy" decoding="async" onError={() => setFailedSrc(src)} />}</span>;
}
function RegisterPagination({ page, pageSize, total, loading, onPage, onPageSize, position }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const visiblePages = [...new Set([0, page - 1, page, page + 1, pages - 1])].filter(value => value >= 0 && value < pages).sort((a, b) => a - b);
  return <div className={`license-pagination license-pagination-${position}`}>
    <div className="license-pagination-info"><span>{total ? `${(page * pageSize + 1).toLocaleString('en-ZA')}–${Math.min((page + 1) * pageSize, total).toLocaleString('en-ZA')} of ${total.toLocaleString('en-ZA')} licenses` : '0 licenses'}{loading && ' · Updating…'}</span><label>Rows per page<select value={pageSize} disabled={loading} onChange={e => onPageSize(Number(e.target.value))}>{[10, 25, 50].map(size => <option key={size} value={size}>{size}</option>)}</select></label></div>
    <nav aria-label={`Register pages ${position}`}><span className="license-page-count">Page {page + 1} of {pages}</span><button type="button" aria-label="Previous page" disabled={page === 0 || loading} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /></button>{visiblePages.map((value, index) => <React.Fragment key={value}>{index > 0 && value - visiblePages[index - 1] > 1 && <span aria-hidden="true" className="license-page-gap">…</span>}<button type="button" disabled={loading} aria-label={`Page ${value + 1}`} aria-current={page === value ? 'page' : undefined} onClick={() => onPage(value)}>{value + 1}</button></React.Fragment>)}<button type="button" aria-label="Next page" disabled={page + 1 >= pages || loading} onClick={() => onPage(page + 1)}><ChevronRight size={16} /></button></nav>
  </div>;
}
function PurchaseDate({ row }) {
  if (row.source === 'complimentary') return <span className="text-gray-400">{shortDate(row.granted_on)}<span className="mt-0.5 block text-[11px] text-gray-400">Complimentary grant</span></span>;
  return <span className="whitespace-nowrap text-gray-200">{shortDate(row.purchased_on)}{!row.purchased_on && <span className="mt-0.5 block text-[11px] text-gray-400">Payment match needed</span>}</span>;
}
function PaymentHistory({ payments = [] }) {
  const groups = groupLicensePayments(payments);
  const paid = groups.filter(p => p.status === 'success' && !p.is_test).length;
  const attempts = groups.filter(p => !['success', 'refunded'].includes(p.status)).length;
  return <section className="license-surface mt-6" aria-labelledby="license-payments-title">
    <div className="license-panel-heading"><div><h3 id="license-payments-title">Payments & checkout activity</h3><p>{paid} successful {paid === 1 ? 'checkout' : 'checkouts'}{attempts > 0 ? ` · ${attempts} other ${attempts === 1 ? 'attempt' : 'attempts'}` : ''} · {payments.length} underlying records</p></div></div>
    {groups.length ? <><div className="license-payment-list">{groups.map(p => {
      const allocations = p.allocations;
      const successful = ['success', 'refunded'].includes(p.status);
      return <article key={p.id} className={`license-payment-card ${successful ? '' : 'license-payment-attempt'}`}>
        <div className="license-payment-main"><div><h4>{p.bundled ? 'Event checkout' : p.payment_type === 'temp_license' ? 'Temporary license payment' : 'Full license payment'}{p.license_year ? ` · ${p.license_year}` : ''}{p.is_test && <span className="ml-2 text-amber-300">Test</span>}</h4><time>{timestamp(p.created_at)}</time></div><div className="license-payment-amount"><strong>{money(p.checkout_amount ?? p.amount, p.currency || 'ZAR')}</strong><span>{p.bundled ? p.checkout_amount != null ? 'Checkout total' : 'Recorded event amount' : 'License payment'}</span></div></div>
        {p.event_name && <p className="license-payment-context">{p.event_name}</p>}
        <div className="license-payment-status"><Status value={p.status} /><span className="uppercase">{p.payment_method || 'Method unknown'}</span><span>{p.is_test ? 'Test payment · excluded from sales' : successful ? p.linked ? 'Connected to coverage' : 'Historical payment record' : 'Payment attempt · no confirmed sale'}</span></div>
        {allocations.map(child => <div key={child.id} className="license-payment-allocation"><div><strong>{child.payment_type === 'temp_license' ? 'Temporary license' : 'Full license'} · same checkout</strong><p>{p.split_recorded ? `Event entry: ${money(p.amount, p.currency || 'ZAR')} · license portion shown here.` : p.checkout_amount != null ? 'Included in the checkout total above.' : 'Linked license record. Review the references for the full breakdown.'}</p></div><strong>{money(child.amount, child.currency || 'ZAR')}</strong><Status value={child.status} /></div>)}
        {p.bundled && !allocations.length && successful && <p className="license-payment-context">This amount may include event entry and license fees. It is not a license-only total.</p>}
        <details className="license-payment-details"><summary>Payment references</summary><code>Checkout: {p.reference || p.id}</code>{allocations.map(child => <code key={child.id}>License portion: {child.reference || child.id}</code>)}</details>
      </article>;
    })}</div><p className="license-payment-explainer">A checkout and its linked license portion are shown together. Pending attempts are separate. Only issued licenses with verified payment evidence count towards sales.</p></> : <p className="license-empty">No license payments found for this player.</p>}
  </section>;
}

export function LicensePlayerPanel({ playerId, onBack, onSaved }) {
  const [data, setData] = useState(null), [events, setEvents] = useState([]), [seasons, setSeasons] = useState([]);
  const [tempPrice, setTempPrice] = useState(120);
  const [editor, setEditor] = useState(null), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const editorRef = useRef(null);
  const [form, setForm] = useState({ license_type: 'full', year: currentYear(), event_id: '', source: 'manual', amount: 650, payment_method: 'eft', receipt: '', reason: '' });
  const patch = change => setForm(v => ({ ...v, ...change }));
  const load = useCallback(async () => {
    const [bundle, calendar, years, prices] = await Promise.all([
      licenseRpc('get_player_licenses', { p_player_id: Number(playerId) }),
      supabase.from('calendar').select('id,event_name,start_date').order('start_date', { ascending: false }).limit(250),
      supabase.from('license_seasons').select('*').is('archived_at', null).order('year', { ascending: false }),
      supabase.from('commerce_config').select('temp_license_price').eq('id', 'default').maybeSingle()
    ]);
    if (!bundle) throw new Error('Player not found.');
    if (calendar.error) throw calendar.error;
    if (years.error) throw years.error;
    if (prices.error) throw prices.error;
    const offered = years.data || [];
    setData(bundle); setEvents(calendar.data || []); setSeasons(offered);
    setForm(previous => {
      if (offered.some(season => season.year === Number(previous.year))) return previous;
      const next = offered[0];
      const renewal = bundle.licenses.some(license => license.license_type === 'full' && license.status !== 'revoked' && license.season_year < next?.year);
      return { ...previous, year: next?.year || '', amount: Number((renewal ? next?.renewal_price : next?.price) ?? 650) };
    });
    setTempPrice(Number(prices.data?.temp_license_price ?? 120));
  }, [playerId]);
  useEffect(() => { setData(null); setEditor(null); load().catch(e => setError(e.message)); }, [load]);
  useEffect(() => {
    if (!editor) return;
    editorRef.current?.querySelector('select,input,textarea')?.focus();
    if (window.innerWidth < 1024) editorRef.current?.scrollIntoView({ block: 'start' });
  }, [editor]);
  function fullPriceFor(year) { const renewal = data?.licenses.some(l => l.license_type === 'full' && l.status !== 'revoked' && l.season_year < Number(year)); const season = seasons.find(s => s.year === Number(year)); return Number((renewal ? season?.renewal_price : season?.price) ?? (renewal ? 500 : 650)); }
  function openEditor(next) { patch({ reason: '', ...(next.action === 'grant' ? { amount: form.license_type === 'temporary' ? tempPrice : fullPriceFor(form.year) } : {}) }); setEditor(next); }
  async function save(e) {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const values = { ...form, player_id: Number(playerId), year: Number(form.year), event_id: form.license_type === 'temporary' ? Number(form.event_id) : null, amount: Number(form.amount), ...(editor.id ? { id: editor.id, license_type: editor.license_type } : {}) };
      if (editor.action === 'grant' && form.license_type === 'temporary') await grantTemporaryLicense(supabase, values);
      else await manage(editor.action, values);
      setEditor(null); patch({ reason: '' }); await load(); onSaved?.();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const licenses = data?.licenses || [];
  const active = licenses.filter(row => coverageStatus(row) === 'active');
  const upcoming = licenses.filter(row => coverageStatus(row) === 'upcoming');
  const full = active.find(row => row.license_type === 'full');
  const next = [...upcoming].sort((a, b) => String(a.starts_on).localeCompare(String(b.starts_on)))[0];
  return <div className="license-workspace">
    {onBack && <button type="button" onClick={onBack} className="license-text-button mb-6"><ArrowLeft size={15} />Back to licenses</button>}
    {error && <p role="alert" className="license-error">{error}</p>}
    {!data ? <p role="status" className="license-loading">Loading player licenses…</p> : <>
      <header className="license-player-header">
        <div className="license-player-identity"><PlayerAvatar name={data.name} src={data.image_url || data.licenses[0]?.image_url} /><div className="min-w-0"><h2>{data.name}</h2><p>{data.email}</p><span className="license-player-id">{data.license_number || 'No license number yet'}</span></div></div>
        <button type="button" onClick={() => openEditor({ action: 'grant' })} className={primary}><Plus size={16} />Add license</button>
      </header>
      <div className="license-player-summary">
        <div><p>Coverage right now</p><strong>{full ? `${full.season_year} Full license` : active.length ? 'Event coverage active' : next ? 'Coverage starts soon' : 'No active coverage'}</strong><span>{full ? `Valid until ${shortDate(full.ends_on)}` : next && !active.length ? `Starts ${shortDate(next.starts_on)}` : active.length ? `${active.length} active event ${active.length === 1 ? 'license' : 'licenses'}` : 'Review the licenses below'}</span></div>
        <div><p>Full licenses on file</p><strong>{licenses.filter(row => row.license_type === 'full').length}</strong><span>Across all coverage years</span></div>
        <div><p>Temporary licenses on file</p><strong>{licenses.filter(row => row.license_type === 'temporary').length}</strong><span>All event licenses, including history</span></div>
      </div>
      <div className={`grid gap-6 ${editor ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : 'xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]'}`}>
        <div className="min-w-0">
          <section className="license-surface" aria-labelledby="player-coverage-title"><div className="license-panel-heading"><div><h3 id="player-coverage-title">Licenses & coverage</h3><p>What this player can use, and when.</p></div></div>
            {licenses.length ? <div className="license-coverage-list">{licenses.map(row => <article key={row.id} className="license-coverage-card">
              <div className="license-coverage-top"><div><LicenseType row={row} /><Status value={coverageStatus(row)} /></div><button type="button" onClick={() => openEditor({ action: row.status === 'revoked' ? 'restore' : 'revoke', id: row.id, license_type: row.license_type, label: licenseLabel(row) })} className="license-text-button !min-h-0 !text-[11px]">{row.status === 'revoked' ? 'Restore' : 'Revoke'}</button></div>
              <h4>{row.license_type === 'temporary' ? row.event_name || 'Event license' : `${row.season_year} annual Full license`}</h4>
              <dl className="license-coverage-dates"><div><dt>License year</dt><dd>{row.season_year || 'Not recorded'}</dd></div><div><dt>Valid from</dt><dd>{shortDate(licenseStartDate(row))}</dd></div><div><dt>Valid until</dt><dd>{shortDate(row.ends_on)}</dd></div><div><dt>{row.source === 'complimentary' ? 'Date granted' : 'Date bought'}</dt><dd><PurchaseDate row={row} /></dd></div></dl>
              <FullPurchaseKind row={row} /><p className="license-coverage-source">{sourceLabel(row.source)}{coverageStatus(row) === 'upcoming' ? ' · Not yet valid for play' : row.status === 'revoked' ? ' · Coverage has been removed' : ''}</p>
            </article>)}</div> : <p className="license-empty">No licenses on file. Add a license to give this player coverage.</p>}
          </section>
          {editor && <PaymentHistory payments={data.payments} />}
          <details className="license-surface mt-6 p-5"><summary className="cursor-pointer text-sm font-semibold text-gray-300">Change history <span className="ml-2 font-normal text-gray-400">{data.history.length}</span></summary><div className="mt-3 divide-y divide-white/[0.07]">{data.history.map(h => <div key={h.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="capitalize text-gray-200">{h.action.replaceAll('_', ' ')}</p><time className="text-xs text-gray-400">{timestamp(h.created_at)}</time></div><p className="mt-1 text-xs text-gray-300">{h.reason}</p><p className="mt-1 text-xs text-gray-400">{h.actor_email || 'System'}</p></div>)}</div></details>
        </div>
        {!editor && <div className="min-w-0 [&>section]:!mt-0"><PaymentHistory payments={data.payments} /></div>}
        {editor && <aside ref={editorRef} className="license-editor"><form onSubmit={save} className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{editor.action === 'grant' ? 'Add license' : editor.action === 'revoke' ? 'Revoke coverage' : 'Restore coverage'}</h3><button type="button" onClick={() => setEditor(null)} aria-label="Close license editor" className="p-2 text-gray-400"><X size={16} /></button></div>
          {editor.label && <p className="text-sm text-gray-400">{editor.label}</p>}
          {editor.action === 'grant' && <><Field label="License type"><select className={input} value={form.license_type} onChange={e => patch({ license_type: e.target.value, amount: e.target.value === 'temporary' ? tempPrice : fullPriceFor(form.year) })}><option value="full">Full annual</option><option value="temporary">Temporary event</option></select></Field>
            {form.license_type === 'full' ? <Field label="Calendar year"><select required disabled={!seasons.length} className={input} value={form.year} onChange={e => patch({ year: Number(e.target.value), amount: fullPriceFor(e.target.value) })}>{!seasons.length && <option value="">No years offered</option>}{seasons.map(s => <option key={s.year} value={s.year}>{s.year}</option>)}</select></Field> : <Field label="Event"><select required className={input} value={form.event_id} onChange={e => patch({ event_id: e.target.value })}><option value="">Select event</option>{events.map(event => <option key={event.id} value={event.id}>{event.event_name}</option>)}</select></Field>}
            <Field label="Source"><select className={input} value={form.source} onChange={e => patch({ source: e.target.value })}><option value="manual">Manual payment received</option><option value="complimentary">Complimentary</option></select></Field>
            {form.source === 'manual' && <><div className="grid grid-cols-2 gap-3"><Field label="Amount (R)"><input type="number" required min="0.01" step="0.01" value={form.amount} onChange={e => patch({ amount: e.target.value })} className={input} /></Field><Field label="Method"><select value={form.payment_method} onChange={e => patch({ payment_method: e.target.value })} className={input}><option value="eft">EFT</option><option value="cash">Cash</option></select></Field></div><Field label="Receipt / bank reference"><input value={form.receipt} onChange={e => patch({ receipt: e.target.value })} className={input} /></Field></>}
          </>}
          <Field label="Reason for change"><textarea required rows={3} value={form.reason} onChange={e => patch({ reason: e.target.value })} className={input} /></Field>
          {editor.action === 'revoke' && <p className="text-xs leading-relaxed text-gray-400">Revoking coverage keeps the payment history. Refunds are handled in Finance.</p>}
          <button disabled={busy} className={`${primary} w-full`}>{busy ? 'Saving…' : editor.action === 'grant' ? 'Save license' : editor.action === 'revoke' ? 'Revoke coverage' : 'Restore coverage'}</button>
        </form></aside>}
      </div>
    </>}
  </div>;
}

function SeasonSettings({ onSaved }) {
  const [seasons, setSeasons] = useState([]), [temp, setTemp] = useState({ price: 120, sales_open: true }), [newYear, setNewYear] = useState(currentYear() + 2);
  const [reason, setReason] = useState(''), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState(null), [message, setMessage] = useState('');
  const load = useCallback(async () => {
    const [years, config] = await Promise.all([supabase.from('license_seasons').select('*').order('year'), supabase.from('commerce_config').select('temp_license_price,temp_license_enabled').eq('id', 'default').single()]);
    if (years.error) throw years.error;
    if (config.error) throw config.error;
    setSeasons(years.data); setTemp({ price: config.data.temp_license_price, sales_open: config.data.temp_license_enabled });
  }, []);
  useEffect(() => { load().catch(e => setError(e.message)); }, [load]);
  async function save(action, values) {
    setBusy(true); setError(''); setMessage('');
    try {
      await manage(action, { ...values, reason }); await load(); onSaved(); setRemoving(null);
      setMessage(action === 'archive_season' ? `${values.year} removed from offerings. Existing licenses and history are preserved.` : action === 'restore_season' ? `${values.year} restored with sales closed.` : 'Settings saved.');
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  return <section className="license-settings">
    <div className="license-section-heading"><div><p className="license-eyebrow">License offerings</p><h2>Prices & availability</h2><p>Set your prices and choose which licenses players can buy.</p></div></div>
    {error && <p role="alert" className="license-error">{error}</p>}
    {message && <p role="status" className="rounded-lg border border-padel-green/20 bg-padel-green/5 p-4 text-sm text-padel-green">{message}</p>}
    <div className="license-surface license-settings-reason"><div><strong>Record why you’re making a change</strong><p>A reason is required to save prices, change availability or remove a year.</p></div><Field label="Reason for settings changes"><input className={input} value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Annual pricing review" /></Field></div>
    <div className="license-settings-grid">{seasons.filter(season => !season.archived_at).sort((a, b) => b.year - a.year).map(season => <article key={season.year} className="license-surface license-season-card">
      <div className="license-season-card-header"><div><p className="license-eyebrow">Annual license</p><h3>{season.year} Full</h3><p>Coverage through 31 December {season.year}</p></div><span className={`license-status license-status-${season.sales_open ? 'active' : 'expired'}`}><i />{season.sales_open ? 'Sales open' : 'Sales closed'}</span></div>
      <div className="license-season-fields">
        <Field label="New Full license (R)"><input type="number" min="0.01" step="0.01" className={input} value={season.price} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, price: e.target.value } : row))} /></Field>
        <Field label="Returning Full holder / renewal (R)"><input type="number" min="0.01" step="0.01" className={input} value={season.renewal_price ?? 500} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, renewal_price: e.target.value } : row))} /></Field>
        <Field label="Earliest coverage start date"><input type="date" className={input} value={season.coverage_starts_on || `${season.year}-01-01`} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, coverage_starts_on: e.target.value } : row))} /></Field>
      </div>
      <p className="license-footnote !mt-3">Coverage starts on the purchase date or this date, whichever is later.</p>
      <label className="license-sales-toggle"><input type="checkbox" checked={season.sales_open} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, sales_open: e.target.checked } : row))} /><span>Open for purchases<small>Players can buy this license when sales are open.</small></span></label>
      <div className="license-season-actions"><button className={primary} type="button" disabled={busy || !reason.trim()} onClick={() => save('save_season', season)}>Save {season.year}</button><button className="license-text-button" type="button" disabled={busy} aria-expanded={removing === season.year} onClick={() => setRemoving(removing === season.year ? null : season.year)}>Remove year</button></div>
      {removing === season.year && <div className="license-confirm-remove"><p>Remove {season.year} from purchase choices?</p><p>Sales will close. Existing licenses stay valid and all history is kept.</p>{!reason.trim() && <p>Enter a reason above to continue.</p>}<div><button type="button" className={secondary} disabled={busy || !reason.trim()} onClick={() => save('archive_season', { year: season.year })}>Remove {season.year}</button><button type="button" className="license-text-button" disabled={busy} onClick={() => setRemoving(null)}>Cancel</button></div></div>}
    </article>)}
      <article className="license-surface license-season-card"><div className="license-season-card-header"><div><p className="license-eyebrow">One player · one event</p><h3>Temporary license</h3><p>Event coverage for players without a Full license.</p></div><Ticket size={22} className="text-[#b8b3ff]" /></div><Field label="Price per event license (R)"><input className={input} type="number" min="0.01" step="0.01" value={temp.price} onChange={e => setTemp(v => ({ ...v, price: e.target.value }))} /></Field><label className="license-sales-toggle"><input type="checkbox" checked={temp.sales_open} onChange={e => setTemp(v => ({ ...v, sales_open: e.target.checked }))} /><span>Open for purchases<small>Available during eligible event checkouts.</small></span></label><div className="license-season-actions"><button className={primary} type="button" disabled={busy || !reason.trim()} onClick={() => save('save_temporary', temp)}>Save temporary price</button><span className="text-xs text-gray-400">{temp.sales_open ? 'Sales open' : 'Sales closed'}</span></div></article>
    </div>
    <div className="license-surface license-settings-add"><div><h3>Add another license year</h3><p>New years start with sales closed, so you can review the prices first.</p></div><Field label="Calendar year"><input className={input} type="number" min="2026" max="2200" value={newYear} onChange={e => setNewYear(Number(e.target.value))} /></Field><button className={secondary} type="button" disabled={busy || !reason.trim() || seasons.some(s => s.year === newYear)} onClick={() => save('save_season', { year: newYear, price: 650, renewal_price: 500, coverage_starts_on: `${newYear}-01-01`, sales_open: false })}><Plus size={15} />Add year</button></div>
    {seasons.some(season => season.archived_at) && <details className="license-surface p-5"><summary className="cursor-pointer text-sm font-semibold text-gray-300">Removed license years</summary><p className="license-footnote">Past licenses remain in the register. Restoring a year leaves sales closed.</p><div className="mt-3 divide-y divide-white/10">{seasons.filter(season => season.archived_at).map(season => <div key={season.year} className="flex items-center justify-between gap-4 py-3"><span className="text-sm text-gray-300">{season.year} Full</span><button type="button" className={secondary} disabled={busy || !reason.trim()} onClick={() => save('restore_season', { year: season.year })}>Restore {season.year}</button></div>)}</div></details>}
  </section>;
}

export default function LicenseManager() {
  const [filters, setFilters] = useState(() => ({ year: String(currentYear()), type: '', status: '', source: '', search: '', purchase_year: '', renewed_from_year: '', page: 0, page_size: 10 }));
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState('overview'), [seasons, setSeasons] = useState([]), [players, setPlayers] = useState([]), [lookup, setLookup] = useState('');
  const [player, setPlayer] = useState(() => new URLSearchParams(window.location.search).get('player'));
  const [salesYear, setSalesYear] = useState(String(currentYear())), [refreshKey, setRefreshKey] = useState(0);
  const request = useRef(0);
  const registerRef = useRef(null);
  const load = useCallback(async () => {
    const version = ++request.current;
    setLoading(true); setError('');
    try {
      const [register, years] = await Promise.all([manage('list', { ...filters, year: filters.year ? Number(filters.year) : null }), supabase.from('license_seasons').select('*').order('year', { ascending: false })]);
      if (years.error) throw years.error;
      if (version !== request.current) return;
      setResult(register); setSeasons(years.data || []);
    } catch (e) { if (version === request.current) setError(e.message); } finally { if (version === request.current) setLoading(false); }
  }, [filters]);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    const refreshOnFocus = () => { if (document.visibilityState === 'visible') void load(); };
    window.addEventListener('focus', refreshOnFocus);
    return () => window.removeEventListener('focus', refreshOnFocus);
  }, [load]);
  useEffect(() => {
    const sync = () => setPlayer(new URLSearchParams(window.location.search).get('player'));
    window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (lookup.trim().length < 2) { setPlayers([]); return; }
    let live = true;
    const timer = setTimeout(() => manage('players', { search: lookup.trim() }).then(rows => { if (live) setPlayers(rows); }).catch(e => { if (live) setError(e.message); }), 250);
    return () => { live = false; clearTimeout(timer); };
  }, [lookup]);
  function patch(change) { setFilters(v => ({ ...v, ...change, ...('year' in change && !('renewed_from_year' in change) ? { renewed_from_year: '' } : {}), ...('type' in change && change.type !== 'renewal' ? { renewed_from_year: '' } : {}), page: 0 })); }
  function changePage(page) { setFilters(v => ({ ...v, page })); registerRef.current?.scrollIntoView({ block: 'start' }); }
  function openPlayer(id) { setPlayer(String(id)); window.history.pushState(null, '', `/admin?tab=licenses&player=${id}`); }
  function back() { setPlayer(null); window.history.replaceState(null, '', '/admin?tab=licenses'); void load(); }
  async function download() {
    setExporting(true);
    try {
      const rows = [];
      for (let page = 0;; page++) { const data = await manage('list', { ...filters, year: filters.year ? Number(filters.year) : null, page, page_size: 50 }); rows.push(...data.rows); if (rows.length >= data.total || !data.rows.length) break; }
      const fields = ['license_number', 'name', 'email', 'license_type', 'season_year', 'purchase_year', 'is_renewal', 'renewed_from_year', 'status', 'source', 'purchased_on', 'granted_on', 'starts_on', 'ends_on', 'event_name'];
      const cell = value => '"' + String(value ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"';
      const csv = [fields.map(cell).join(','), ...rows.map(row => fields.map(key => cell(key === 'starts_on' ? licenseStartDate(row) : key === 'purchase_year' ? row.purchased_on?.slice(0, 4) : row[key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = '4M-licenses.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); } finally { setExporting(false); }
  }
  function refresh() { void load(); setRefreshKey(value => value + 1); }
  if (player) return <LicensePlayerPanel playerId={player} onBack={back} onSaved={refresh} />;
  const salesYears = [...new Set([currentYear(), ...seasons.map(season => Number(season.year))])].sort((a, b) => b - a);
  return <div className="license-workspace">
    <header className="license-page-heading"><div><h1>Licenses</h1><p>License years, purchases and player coverage</p></div>{tab === 'register' && <div className="flex gap-2"><button type="button" disabled={loading} onClick={refresh} className={secondary} aria-label="Refresh register and active counts"><RefreshCw size={15} /><span>Refresh</span></button><button type="button" disabled={exporting || !result} onClick={download} className={secondary}><Download size={15} /><span>{exporting ? 'Exporting…' : 'Export register'}</span></button></div>}</header>
    <nav aria-label="License management" className="license-tabs">{[['overview', 'Overview', LayoutDashboard], ['register', 'Register', List], ['sales', 'Temporary sales', BarChart3], ['settings', 'Prices & availability', Settings2]].map(([value, label, Icon]) => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)}>{React.createElement(Icon, { size: 15 })}{label}</button>)}</nav>
    {error && <p role="alert" className="license-error">{error}</p>}
    {tab === 'overview' ? <LicenseOverview year={salesYear} onYearChange={setSalesYear} years={salesYears} refreshKey={refreshKey} onRegister={values => { patch({ year: '', purchase_year: '', renewed_from_year: '', type: '', status: '', source: '', search: '', ...values }); setTab('register'); }} onTemporary={() => setTab('sales')} /> : tab === 'settings' ? <SeasonSettings onSaved={refresh} /> : tab === 'sales' ? <TemporaryLicenseSales /> : <>
      <section ref={registerRef} className="license-surface scroll-mt-6" aria-label="Player license register" aria-busy={loading}>
        <div className="license-register-heading"><div><h2>Player register</h2><p>{filters.year ? `${filters.year} license year` : 'All coverage years'} · {Number(result?.total || 0).toLocaleString('en-ZA')} licenses{filters.search || filters.type || filters.status || filters.source || filters.purchase_year || filters.renewed_from_year ? ' matching your filters' : ' on file'}</p></div><div className="license-coverage-counts" role="status">{['upcoming', 'expired', 'revoked'].map(key => <span key={key}><strong>{result?.counts?.[key] ?? '—'}</strong>{key.charAt(0).toUpperCase() + key.slice(1)}</span>)}</div></div>
        <div className="license-active-summary" aria-label="Current license breakdown">
          <div className="license-active-heading"><h3>Current licenses</h3><span>All coverage years · includes licenses bought for upcoming events</span></div>
          <div className="license-active-metrics">{[
            { label: 'Current total', key: 'total', type: '', icon: LayoutDashboard, tone: 'total', note: 'Full + temporary, including upcoming' },
            { label: 'Full licenses', key: 'full', type: 'full', icon: ShieldCheck, tone: 'full', note: 'One current Full license per player' },
            { label: 'Temporary licenses', key: 'temporary', type: 'temporary', icon: Ticket, tone: 'temporary', note: `${result?.current_counts?.temporary_holders ?? '—'} players · ${result?.current_counts?.temporary_upcoming ?? '—'} for upcoming events` },
            { label: 'Renewed Full', key: 'renewals', type: 'renewal', icon: RefreshCw, tone: 'renewal', note: 'Part of the Full total' },
          ].map(metric => <button type="button" key={metric.key} className={`license-active-metric license-active-metric-${metric.tone}`} onClick={() => patch({ year: '', purchase_year: '', renewed_from_year: '', search: '', source: '', status: 'current', type: metric.type })} title={`Show ${metric.label.toLowerCase()}`}><span>{metric.label}<ArrowUpRight size={16} strokeWidth={1.5} /></span><strong>{result?.current_counts?.[metric.key] == null ? '—' : Number(result.current_counts[metric.key]).toLocaleString('en-ZA')}</strong><small>{metric.note}</small></button>)}</div>
        </div>
        <div className="license-register-filters">
          <Field label="Search players"><div className="license-search"><Search size={15} /><input className={input} value={filters.search} onChange={e => patch({ search: e.target.value })} placeholder="Search name, email or license number" /></div></Field>
          {[['year', 'License year', [['', 'All years'], ...seasons.map(s => [String(s.year), String(s.year)])]], ['purchase_year', 'Bought in', [['', 'All years'], ...salesYears.map(value => [String(value), String(value)])]], ['type', 'License type', [['', 'All types'], ['full', 'Full · all records'], ['paid_full', 'Paid Full sales'], ['new_full', 'New Full sales'], ['temporary', 'Temporary'], ['renewal', 'Full renewals']]], ['status', 'Date status', [['', 'All statuses'], ['current', 'Current · incl. upcoming'], ...['active', 'upcoming', 'expired', 'revoked'].map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)])]], ['source', 'Payment source', [['', 'All sources'], ...['payment', 'manual', 'complimentary', 'legacy'].map(s => [s, sourceLabel(s)])]]].map(([key, label, options]) => <Field key={key} label={label}><select className={input} value={filters[key]} onChange={e => patch({ [key]: e.target.value })}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>)}
        </div>
        {(filters.purchase_year || filters.renewed_from_year) && <div className="license-register-context">{filters.purchase_year && <span>Bought in {filters.purchase_year}</span>}{filters.renewed_from_year && <span>Renewed from {filters.renewed_from_year}</span>}<button type="button" className="license-text-button" onClick={() => patch({ purchase_year: '', renewed_from_year: '' })}>Clear purchase filters <X size={16} strokeWidth={1.5} /></button></div>}
        <RegisterPagination position="top" page={filters.page} pageSize={filters.page_size} total={result?.total || 0} loading={loading} onPage={changePage} onPageSize={size => patch({ page_size: size })} />
        <div className="license-table-scroll"><table className="license-table license-register-table" aria-label="License register"><thead><tr>{['Player', 'License', 'License year', 'Date bought', 'Valid from / to', 'Status', 'Source', ''].map((h, i) => <th key={i}>{h}</th>)}</tr></thead><tbody>{result?.rows.map(row => <tr key={row.id} onClick={e => { if (!e.target.closest('a,button,input,select')) openPlayer(row.player_id); }}><td><div className="license-register-player"><PlayerAvatar name={row.name} src={row.image_url} small /><div><a href={`/admin?tab=licenses&player=${row.player_id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); openPlayer(row.player_id); } }} className="license-player-link">{row.name}</a><p className="license-player-email">{row.email}</p><p className="license-player-number">{row.license_number}</p></div></div></td><td><LicenseType row={row} /><FullPurchaseKind row={row} />{row.license_type === 'temporary' && <p className="license-event-name">{row.event_name || 'Event license'}</p>}</td><td className="license-register-year">{row.season_year || 'Not recorded'}</td><td className="text-xs"><PurchaseDate row={row} /></td><td className="whitespace-nowrap text-xs"><span className="license-muted">{shortDate(licenseStartDate(row))}</span><span className="mt-1 block">to {shortDate(row.ends_on)}</span></td><td><Status value={row.status} /></td><td className="!text-xs license-muted">{sourceLabel(row.source)}</td><td><ChevronRight size={15} aria-hidden="true" className="text-gray-400" /></td></tr>)}</tbody></table>{!result?.rows.length && <p role="status" className="license-empty">{loading ? 'Loading licenses…' : 'No licenses match these filters.'}</p>}</div>
        <RegisterPagination position="bottom" page={filters.page} pageSize={filters.page_size} total={result?.total || 0} loading={loading} onPage={changePage} onPageSize={size => patch({ page_size: size })} />
      </section>
      <div className="license-surface license-find-player"><div><h3>Find any player</h3><p>Look up a player to add or manage their licenses.</p></div><div className="license-lookup"><label className="sr-only" htmlFor="license-player-lookup">Find any player</label><div className="license-search"><Search size={15} /><input id="license-player-lookup" className={input} value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Search name, email or license number" /></div>{players.length > 0 && <div className="license-lookup-results">{players.map(p => <button type="button" key={p.id} onClick={() => openPlayer(p.id)}><span className="license-register-player"><PlayerAvatar name={p.name} src={p.image_url} small /><span>{p.name}<span className="license-player-email block">{p.email}</span></span></span><ArrowUpRight size={14} className="text-gray-400" /></button>)}</div>}</div></div>
      {!!result?.reviews?.length && <details className="license-surface mt-5 p-5"><summary className="cursor-pointer text-sm text-amber-200">Payments needing review <span className="ml-2">{result.reviews.length}</span></summary><div className="mt-3 divide-y divide-white/[0.07]">{result.reviews.map((review, i) => <button type="button" key={i} onClick={() => openPlayer(review.player_id)} className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm"><span>{review.name}<span className="mt-1 block text-xs text-gray-400">{review.reason}</span></span><ChevronRight size={15} className="text-gray-400" /></button>)}</div></details>}
    </>}
  </div>;
}
