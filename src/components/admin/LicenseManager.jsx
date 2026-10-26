import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight, ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { licenseRpc, licenseLabel } from '../../utils/licenses';
import { licenseStartDate } from '../../utils/licenseDates';
import { grantTemporaryLicense } from '../../utils/temporaryLicenseAssignment';
import TemporaryLicenseSales from './TemporaryLicenseSales';

const input = 'w-full rounded-md border border-white/15 bg-[#111] px-3 py-2 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green';
const primary = 'inline-flex items-center justify-center gap-2 rounded-md bg-padel-green px-4 py-2.5 text-sm font-semibold text-black disabled:opacity-40';
const secondary = 'inline-flex items-center justify-center gap-2 rounded-md border border-white/15 px-3 py-2.5 text-sm text-gray-300 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green disabled:opacity-40';
const currentYear = () => Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date()));
const money = (n, currency = 'ZAR') => new Intl.NumberFormat('en-ZA', { style: 'currency', currency }).format(Number(n || 0));
const sourceLabel = source => ({ legacy: 'Legacy import', payment: 'Payment', manual: 'Manual payment', complimentary: 'Complimentary' }[source] || source);
const manage = (action, data = {}) => licenseRpc('manage_license', { p_action: action, p_input: data });
const shortDate = value => value ? new Date(`${String(value).slice(0, 10)}T12:00:00+02:00`).toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }) : 'Unknown';
const timestamp = value => value ? new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Africa/Johannesburg' }) : 'Unknown';
function Field({ label, children }) {
  return <label className="block min-w-0 text-xs text-gray-400"><span className="mb-1.5 block">{label}</span>{children}</label>;
}
function Status({ value }) {
  const tone = ['active', 'success'].includes(value) ? 'text-padel-green' : ['revoked', 'failed', 'refunded'].includes(value) ? 'text-red-300' : 'text-gray-400';
  return <span className={`inline-flex items-center gap-2 whitespace-nowrap text-xs ${tone}`}><span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />{value?.charAt(0).toUpperCase() + value?.slice(1)}</span>;
}
function PurchaseDate({ row }) {
  if (row.source === 'complimentary') return <span className="text-gray-400">{shortDate(row.granted_on)}<span className="mt-0.5 block text-[11px] text-gray-500">Complimentary grant</span></span>;
  return <span className="whitespace-nowrap text-gray-300">{shortDate(row.purchased_on)}{!row.purchased_on && <span className="mt-0.5 block text-[11px] text-gray-500">Payment match needed</span>}</span>;
}
function PaymentHistory({ payments }) {
  return <section className="mt-8" aria-labelledby="license-payments-title">
    <div className="mb-3 flex items-center gap-3"><h3 id="license-payments-title" className="font-semibold text-white">License payments</h3><span className="text-xs tabular-nums text-gray-500">{payments.length} records</span></div>
    {payments.length ? <><div className="overflow-x-auto border-y border-white/10"><table className="w-full min-w-[650px] text-left text-sm">
      <thead className="text-xs text-gray-500"><tr>{['Paid / recorded', 'Payment', 'Method', 'Amount', 'Status'].map(h => <th key={h} className="py-3 pr-5 font-normal">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-white/[0.07]">{payments.map(p => <tr key={p.id}>
        <td className="py-3 pr-5 whitespace-nowrap text-gray-300">{timestamp(p.created_at)}</td>
        <td className="py-3 pr-5"><p className="text-gray-200">{p.bundled ? 'Event checkout with license' : p.payment_type === 'temp_license' ? 'Temporary license' : 'Full license'}{p.license_year ? ` · ${p.license_year}` : ''}{p.is_test && <span className="ml-2 text-amber-300">Test</span>}</p><p className="mt-1 font-mono text-[11px] text-gray-500 break-all">{p.reference || p.id}</p>{p.event_name && <p className="mt-0.5 text-xs text-gray-500">{p.event_name}</p>}<p className="mt-0.5 text-[11px] text-gray-500">{p.linked ? 'Linked to license' : 'Historical payment record'}</p></td>
        <td className="py-3 pr-5 text-xs uppercase text-gray-400">{p.payment_method || '—'}</td>
        <td className="py-3 pr-5 whitespace-nowrap tabular-nums text-white">{money(p.amount, p.currency || 'ZAR')}{p.bundled && <span className="block text-[11px] text-gray-500">Checkout total</span>}</td>
        <td className="py-3"><Status value={p.status} /></td>
      </tr>)}</tbody></table></div><p className="mt-3 text-xs leading-relaxed text-gray-500">All matching license payment records are shown. Historical records may include splits or duplicates; they do not issue extra coverage.</p></> : <p className="border-y border-white/10 py-6 text-sm text-gray-500">No license payments found for this player.</p>}
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
  return <div className="text-white">
    {onBack && <button type="button" onClick={onBack} className="mb-6 flex items-center gap-2 py-2 text-sm text-gray-400 hover:text-white"><ArrowLeft size={15} />All licenses</button>}
    {error && <p role="alert" className="mb-5 border border-red-400/30 p-3 text-sm text-red-300">{error}</p>}
    {!data ? <p role="status" className="py-10 text-gray-400">Loading player licenses…</p> : <>
      <header className="flex flex-wrap items-start justify-between gap-5 border-b border-white/10 pb-6">
        <div><div className="flex flex-wrap items-center gap-4"><h2 className="text-2xl font-semibold tracking-tight">{data.name}</h2><span className="font-mono text-sm text-padel-green">{data.license_number || 'No license number yet'}</span></div><p className="mt-2 text-sm text-gray-400">{data.email}</p></div>
        <button type="button" onClick={() => openEditor({ action: 'grant' })} className={primary}><Plus size={16} />Add license</button>
      </header>
      <div className={`mt-6 grid gap-8 ${editor ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
        <div className="min-w-0">
          <section aria-labelledby="player-coverage-title"><h3 id="player-coverage-title" className="mb-3 font-semibold">Coverage</h3>
            {data.licenses.length ? <div className="overflow-x-auto border-y border-white/10"><table className="w-full min-w-[640px] text-left text-sm"><thead className="text-xs text-gray-500"><tr>{['License', 'Purchased / granted', 'Valid until', 'Status', ''].map((h, i) => <th key={i} className="py-3 pr-4 font-normal">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.07]">{data.licenses.map(row => <tr key={row.id}><td className="py-4 pr-4"><p>{licenseLabel(row)}</p><p className="mt-1 text-xs text-gray-500">{sourceLabel(row.source)}</p><p className="mt-0.5 text-xs text-gray-500">From {shortDate(licenseStartDate(row))}</p></td><td className="py-4 pr-4 text-xs"><PurchaseDate row={row} /></td><td className="py-4 pr-4 text-xs text-gray-400 whitespace-nowrap">{shortDate(row.ends_on)}</td><td className="py-4 pr-4"><Status value={row.status} /></td><td className="py-4 text-right"><button type="button" onClick={() => openEditor({ action: row.status === 'revoked' ? 'restore' : 'revoke', id: row.id, license_type: row.license_type, label: licenseLabel(row) })} className="py-2 text-xs text-gray-400 underline decoration-white/20 underline-offset-4 hover:text-white">{row.status === 'revoked' ? 'Restore' : 'Revoke'}</button></td></tr>)}</tbody></table></div> : <p className="border-y border-white/10 py-6 text-sm text-gray-500">No licenses on file.</p>}
          </section>
          <PaymentHistory payments={data.payments} />
          <details className="mt-8 border-y border-white/10 py-4"><summary className="cursor-pointer text-sm font-semibold text-gray-300">Change history <span className="ml-2 font-normal text-gray-500">{data.history.length}</span></summary><div className="mt-3 divide-y divide-white/[0.07]">{data.history.map(h => <div key={h.id} className="py-3 text-sm"><div className="flex flex-wrap justify-between gap-2"><p className="capitalize text-gray-300">{h.action.replaceAll('_', ' ')}</p><time className="text-xs text-gray-500">{timestamp(h.created_at)}</time></div><p className="mt-1 text-xs text-gray-400">{h.reason}</p><p className="mt-1 text-xs text-gray-500">{h.actor_email || 'System'}</p></div>)}</div></details>
        </div>
        {editor && <aside ref={editorRef} className="self-start border border-white/15 bg-[#101010] p-5 scroll-mt-5"><form onSubmit={save} className="space-y-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold">{editor.action === 'grant' ? 'Add license' : editor.action === 'revoke' ? 'Revoke coverage' : 'Restore coverage'}</h3><button type="button" onClick={() => setEditor(null)} aria-label="Close license editor" className="p-2 text-gray-400"><X size={16} /></button></div>
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
  return <section className="max-w-4xl py-6 text-white"><h2 className="text-lg font-semibold">Sales and prices</h2><p className="mt-2 text-sm text-gray-500">New Full licenses and renewals have separate prices. Renewals are for previous Full holders. Coverage starts on purchase or the date below, whichever is later.</p>
    {error && <p role="alert" className="mt-4 text-sm text-red-300">{error}</p>}
    <div className="my-6 max-w-lg"><Field label="Reason for settings changes"><input className={input} value={reason} onChange={e => setReason(e.target.value)} /></Field></div>
    {message && <p role="status" className="mb-4 text-sm text-padel-green">{message}</p>}
    <div className="divide-y divide-white/10 border-y border-white/10">{seasons.filter(season => !season.archived_at).map(season => <div key={season.year} className="py-4">
      <div className="grid grid-cols-2 items-end gap-3 sm:grid-cols-[100px_1fr_1fr] lg:grid-cols-[90px_1fr_1fr_1.4fr_110px]">
        <p className="self-center text-sm font-medium">{season.year} Full</p>
        <Field label="New Full (R)"><input type="number" min="0.01" step="0.01" className={input} value={season.price} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, price: e.target.value } : row))} /></Field>
        <Field label="Renewal (R)"><input type="number" min="0.01" step="0.01" className={input} value={season.renewal_price ?? 500} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, renewal_price: e.target.value } : row))} /></Field>
        <Field label="Coverage can start from"><input type="date" className={input} value={season.coverage_starts_on || `${season.year}-01-01`} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, coverage_starts_on: e.target.value } : row))} /></Field>
        <label className="flex items-center gap-2 py-2.5 text-sm text-gray-400"><input type="checkbox" checked={season.sales_open} onChange={e => setSeasons(v => v.map(row => row.year === season.year ? { ...row, sales_open: e.target.checked } : row))} />Sales open</label>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3">
        <button className={secondary} type="button" disabled={busy || !reason.trim()} onClick={() => save('save_season', season)}>Save {season.year}</button>
        <button className="rounded-md px-3 py-2.5 text-sm text-gray-400 underline underline-offset-4 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green disabled:opacity-40" type="button" disabled={busy} aria-expanded={removing === season.year} onClick={() => setRemoving(removing === season.year ? null : season.year)}>Remove {season.year}</button>
      </div>
      {removing === season.year && <div className="mt-3 rounded-md border border-white/15 bg-white/[0.025] p-4">
        <p className="text-sm font-medium">Remove {season.year} from offerings?</p><p className="mt-1 text-sm text-gray-400">This closes sales and removes the year from purchase choices. Existing licenses stay valid and all history is kept.</p>
        {!reason.trim() && <p className="mt-2 text-xs text-gray-400">Enter a reason above to remove this year.</p>}
        <div className="mt-3 flex flex-wrap gap-3"><button type="button" className={secondary} disabled={busy || !reason.trim()} onClick={() => save('archive_season', { year: season.year })}>Remove year {season.year}</button><button type="button" className={secondary} disabled={busy} onClick={() => setRemoving(null)}>Cancel</button></div>
      </div>}
    </div>)}</div>
    {!seasons.some(season => !season.archived_at) && <p className="py-4 text-sm text-gray-400">No annual license years are currently offered.</p>}
    {seasons.some(season => season.archived_at) && <details className="mt-4 border-b border-white/10 pb-4"><summary className="cursor-pointer py-2 text-sm text-gray-400">Removed years</summary><p className="mt-2 text-xs text-gray-500">Past licenses remain in the register. Restoring a year leaves sales closed.</p><div className="mt-2 divide-y divide-white/10">{seasons.filter(season => season.archived_at).map(season => <div key={season.year} className="flex items-center justify-between gap-4 py-3"><span className="text-sm text-gray-300">{season.year} Full</span><button type="button" className={secondary} disabled={busy || !reason.trim()} onClick={() => save('restore_season', { year: season.year })}>Restore {season.year}</button></div>)}</div></details>}
    <div className="flex flex-wrap items-end gap-4 py-5"><div className="w-36"><Field label="Add calendar year"><input className={input} type="number" min="2026" max="2200" value={newYear} onChange={e => setNewYear(Number(e.target.value))} /></Field></div><button className={secondary} type="button" disabled={busy || !reason.trim() || seasons.some(s => s.year === newYear)} onClick={() => save('save_season', { year: newYear, price: 650, renewal_price: 500, coverage_starts_on: `${newYear}-01-01`, sales_open: false })}><Plus size={15} />Add year</button><p className="pb-2 text-xs text-gray-500">New years start with sales closed.</p></div>
    <div className="grid grid-cols-2 sm:grid-cols-[1fr_150px_140px_120px] items-end gap-4 border-y border-white/10 py-5"><p className="self-center text-sm font-medium">Temporary event</p><Field label="Price (R)"><input className={input} type="number" min="0.01" step="0.01" value={temp.price} onChange={e => setTemp(v => ({ ...v, price: e.target.value }))} /></Field><label className="flex items-center gap-2 py-2.5 text-sm text-gray-400"><input type="checkbox" checked={temp.sales_open} onChange={e => setTemp(v => ({ ...v, sales_open: e.target.checked }))} />Sales open</label><button className={secondary} type="button" disabled={busy || !reason.trim()} onClick={() => save('save_temporary', temp)}>Save temporary</button></div>
  </section>;
}

export default function LicenseManager() {
  const [filters, setFilters] = useState(() => ({ year: String(currentYear()), type: '', status: '', source: '', search: '', page: 0 }));
  const [result, setResult] = useState(null), [error, setError] = useState(''), [loading, setLoading] = useState(false), [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState('register'), [seasons, setSeasons] = useState([]), [players, setPlayers] = useState([]), [lookup, setLookup] = useState('');
  const [player, setPlayer] = useState(() => new URLSearchParams(window.location.search).get('player'));
  const request = useRef(0);
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
    const sync = () => setPlayer(new URLSearchParams(window.location.search).get('player'));
    window.addEventListener('popstate', sync); return () => window.removeEventListener('popstate', sync);
  }, []);
  useEffect(() => {
    if (lookup.trim().length < 2) { setPlayers([]); return; }
    let live = true;
    const timer = setTimeout(() => manage('players', { search: lookup.trim() }).then(rows => { if (live) setPlayers(rows); }).catch(e => { if (live) setError(e.message); }), 250);
    return () => { live = false; clearTimeout(timer); };
  }, [lookup]);
  function patch(change) { setFilters(v => ({ ...v, ...change, page: 0 })); }
  function openPlayer(id) { setPlayer(String(id)); window.history.pushState(null, '', `/admin?tab=licenses&player=${id}`); }
  function back() { setPlayer(null); window.history.replaceState(null, '', '/admin?tab=licenses'); void load(); }
  async function download() {
    setExporting(true);
    try {
      const rows = [];
      for (let page = 0;; page++) { const data = await manage('list', { ...filters, year: filters.year ? Number(filters.year) : null, page }); rows.push(...data.rows); if (rows.length >= data.total || !data.rows.length) break; }
      const fields = ['license_number', 'name', 'email', 'license_type', 'season_year', 'status', 'source', 'purchased_on', 'granted_on', 'starts_on', 'ends_on', 'event_name'];
      const cell = value => '"' + String(value ?? '').replaceAll('"', '""').replace(/^[=+@-]/, "'$&") + '"';
      const csv = [fields.map(cell).join(','), ...rows.map(row => fields.map(key => cell(key === 'starts_on' ? licenseStartDate(row) : row[key])).join(','))].join('\r\n');
      const url = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' }));
      const link = document.createElement('a'); link.href = url; link.download = '4M-licenses.csv'; link.click(); URL.revokeObjectURL(url);
    } catch (e) { setError(e.message); } finally { setExporting(false); }
  }
  if (player) return <LicensePlayerPanel playerId={player} onBack={back} onSaved={load} />;
  return <div className="text-white">
    <header className="mb-6 flex flex-wrap items-start justify-between gap-4"><div><h1 className="text-2xl font-semibold tracking-tight">Licenses</h1><p className="mt-1.5 text-sm text-gray-500">Player coverage and payment records</p></div><button type="button" disabled={exporting || !result} onClick={download} className={secondary}><Download size={15} />{exporting ? 'Exporting…' : 'Export CSV'}</button></header>
    <nav aria-label="License management" className="flex gap-6 border-b border-white/15 text-sm">{[['register', 'Register'], ['sales', 'Temporary sales history'], ['settings', 'Sales and prices']].map(([value, label]) => <button type="button" key={value} aria-current={tab === value ? 'page' : undefined} onClick={() => setTab(value)} className={`border-b-2 pb-3 pt-1 ${tab === value ? 'border-padel-green text-white' : 'border-transparent text-gray-500 hover:text-gray-200'}`}>{label}</button>)}</nav>
    {error && <p role="alert" className="my-4 border border-red-400/30 p-3 text-sm text-red-300">{error}</p>}
    {tab === 'settings' ? <SeasonSettings onSaved={load} /> : tab === 'sales' ? <div className="pt-5"><TemporaryLicenseSales /></div> : <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-white/10 py-4 text-xs text-gray-500" role="status"><span className="mr-auto text-sm text-gray-300">{filters.year || 'All years'} <span className="ml-1.5 tabular-nums text-gray-500">{result?.total ?? '—'} licenses</span></span>{['active', 'upcoming', 'expired', 'revoked'].map(key => <span key={key}><strong className="mr-1.5 font-medium tabular-nums text-gray-300">{result?.counts?.[key] ?? '—'}</strong>{key.charAt(0).toUpperCase() + key.slice(1)}</span>)}</div>
      <div className="grid grid-cols-2 gap-3 py-4 sm:grid-cols-4 xl:grid-cols-[minmax(220px,1fr)_105px_130px_140px_165px]">
        <div className="col-span-2 sm:col-span-4 xl:col-span-1"><Field label="Search register"><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-gray-500" /><input className={`${input} pl-9`} value={filters.search} onChange={e => patch({ search: e.target.value })} placeholder="Name, email or license number…" /></div></Field></div>
        {[['year', 'Year', [['', 'All years'], ...seasons.map(s => [String(s.year), String(s.year)])]], ['type', 'Type', [['', 'All types'], ['full', 'Full'], ['temporary', 'Temporary']]], ['status', 'Status', [['', 'All statuses'], ...['active', 'upcoming', 'expired', 'revoked'].map(s => [s, s.charAt(0).toUpperCase() + s.slice(1)])]], ['source', 'Payment source', [['', 'All sources'], ...['payment', 'manual', 'complimentary', 'legacy'].map(s => [s, sourceLabel(s)])]]].map(([key, label, options]) => <Field key={key} label={label}><select className={input} value={filters[key]} onChange={e => patch({ [key]: e.target.value })}>{options.map(([value, text]) => <option key={value} value={value}>{text}</option>)}</select></Field>)}
      </div>
      <div className="overflow-x-auto border-y border-white/15"><table className="w-full min-w-[850px] text-left text-sm" aria-label="License register"><thead className="bg-white/[0.025] text-xs text-gray-500"><tr>{['Player', 'License', 'Purchased', 'Coverage', 'Status', 'Source', ''].map((h, i) => <th key={i} className="px-3 py-3 font-normal first:pl-0 last:pr-0">{h}</th>)}</tr></thead><tbody className="divide-y divide-white/[0.07]">{result?.rows.map(row => <tr key={row.id} className="group cursor-pointer transition-colors hover:bg-white/[0.035] focus-within:bg-white/[0.035]" onClick={e => { if (!e.target.closest('a,button,input,select')) openPlayer(row.player_id); }}><td className="py-3 pl-0 pr-3"><a href={`/admin?tab=licenses&player=${row.player_id}`} onClick={e => { if (!e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) { e.preventDefault(); openPlayer(row.player_id); } }} className="font-medium text-gray-100 group-hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-padel-green">{row.name}</a><p className="mt-1 text-[11px] text-gray-500">{row.email}</p><p className="mt-1 font-mono text-[11px] text-gray-400">{row.license_number}</p></td><td className="px-3 py-3 text-xs text-gray-300">{licenseLabel(row)}</td><td className="px-3 py-3 text-xs"><PurchaseDate row={row} /></td><td className="px-3 py-3 text-xs text-gray-500 whitespace-nowrap">{shortDate(licenseStartDate(row))}<span className="mt-1 block text-gray-400">{shortDate(row.ends_on)}</span></td><td className="px-3 py-3"><Status value={row.status} /></td><td className="px-3 py-3 text-xs text-gray-500">{sourceLabel(row.source)}</td><td className="py-3 pl-3 text-right"><ChevronRight size={16} aria-hidden="true" className="ml-auto text-gray-600 group-hover:text-padel-green" /></td></tr>)}</tbody></table>{!result?.rows.length && <p role="status" className="py-12 text-center text-sm text-gray-500">{loading ? 'Loading licenses…' : 'No licenses match these filters.'}</p>}</div>
      <footer className="flex items-center justify-between gap-4 border-b border-white/10 py-3 text-xs text-gray-500"><span>{result?.total ? `${filters.page * 50 + 1}–${Math.min((filters.page + 1) * 50, result.total)} of ${result.total}` : '0 licenses'}{loading && ' · Updating…'}</span><div className="flex items-center gap-4"><button type="button" disabled={!filters.page || loading} onClick={() => setFilters(v => ({ ...v, page: v.page - 1 }))} className="py-2 text-gray-300 disabled:opacity-30">Previous</button><span>Page {filters.page + 1}</span><button type="button" disabled={!result || (filters.page + 1) * 50 >= result.total || loading} onClick={() => setFilters(v => ({ ...v, page: v.page + 1 }))} className="py-2 text-gray-300 disabled:opacity-30">Next</button></div></footer>
      <div className="mt-6 flex flex-wrap items-start gap-x-6 gap-y-3"><div className="pt-2"><h2 className="text-sm font-medium text-gray-300">Find any player</h2><p className="mt-1 text-xs text-gray-500">Including players without a license</p></div><div className="w-full max-w-md"><label className="sr-only" htmlFor="license-player-lookup">Find any player</label><div className="relative"><Search size={15} className="pointer-events-none absolute left-3 top-2.5 text-gray-500" /><input id="license-player-lookup" className={`${input} pl-9`} value={lookup} onChange={e => setLookup(e.target.value)} placeholder="Name, email or license number…" /></div>{players.length > 0 && <div className="mt-1 max-h-64 overflow-auto border border-white/15 bg-[#111]">{players.map(p => <button type="button" key={p.id} onClick={() => openPlayer(p.id)} className="flex w-full items-center justify-between border-b border-white/5 px-3 py-3 text-left hover:bg-white/5"><span className="text-sm">{p.name}<span className="mt-1 block text-xs text-gray-500">{p.email}</span></span><ArrowUpRight size={14} className="text-gray-500" /></button>)}</div>}</div></div>
      {!!result?.reviews?.length && <details className="mt-6 border-t border-white/10 pt-4"><summary className="cursor-pointer text-sm text-amber-200">Payments needing review <span className="ml-2 text-amber-200/60">{result.reviews.length}</span></summary><div className="mt-3 divide-y divide-white/[0.07]">{result.reviews.map((review, i) => <button type="button" key={i} onClick={() => openPlayer(review.player_id)} className="flex w-full items-center justify-between gap-4 py-3 text-left text-sm"><span>{review.name}<span className="mt-1 block text-xs text-gray-500">{review.reason}</span></span><ChevronRight size={15} className="text-gray-500" /></button>)}</div></details>}
    </>}
  </div>;
}
