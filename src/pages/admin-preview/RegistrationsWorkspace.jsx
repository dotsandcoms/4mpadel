import { useCallback, useEffect, useId, useState } from 'react';
import { AnimatePresence, motion as Motion } from 'framer-motion';
import { ArrowRight, ChevronRight, Download, Plus, Search, X } from 'lucide-react';
import { Link } from 'react-router-dom';
import SearchableDropdown from '../../components/SearchableDropdown';
import EventReplacementDialog from './EventReplacementDialog';
import EventPaymentDialog from './EventPaymentDialog.jsx';
import RecordLoading from './RecordLoading';
import RegistrationProfileNameDialog from './RegistrationProfileNameDialog.jsx';
import RegistrationRefundReview from './RegistrationRefundReview.jsx';
import { canAlignRegistrationProfile } from './registrationProfileName.js';
import { registrationRefundAction } from './registrationRefundReview.js';
import { saveWithdrawnRegistrationReceipt } from './withdrawnRegistrationReceipt.js';
import { downloadRegistrations } from './registrationExports.js';
import { filterRegistrationWorkspace, indexRegistrationLedger, loadRegistrationWorkspace, recordedRegistrationPayment, registrationDivisionLabel, registrationIsWithdrawn, registrationName, registrationPaymentState, saveRegistrationWhatsApp } from './registrationWorkspaceData.js';
import { useEventOperation } from './useEventOperation.js';
import './EventPaymentDialog.css';

const PAGE_SIZE = 50;
const EMPTY_FILTERS = { query: '', quick: 'All states', payment: '', licence: '', division: '', sort: 'division' };
const PAYMENT = {
  paid: ['Paid', 'positive'], manual: ['Manual', 'positive'], pending: ['Pending', 'warning'], failed: ['Failed', 'danger'],
  refunded: ['Refunded', 'neutral'], comped: ['Complimentary', 'violet'],
};
const LICENCE = { full: ['Full licence', 'positive'], temp: ['Temporary licence', 'info'], none: ['No licence', 'danger'], unknown: ['Not available', 'neutral'] };
const dateFormat = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
const moneyFormat = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' });
const eventName = event => event.event_name || event.title || 'Untitled event';
const sameId = (left, right) => left != null && right != null && String(left) === String(right);
const formatDate = value => value && Number.isFinite(Date.parse(value)) ? dateFormat.format(new Date(value)) : 'Date to confirm';
const eventHref = (eventId, options = {}) => `/admin-preview/event?${new URLSearchParams({ event: eventId, ...options })}`;

function Status({ value }) {
  return <span className={`ap-status ap-status--${value[1]}`}>{value[0]}</span>;
}

export default function RegistrationsWorkspace({ client, session, scopeId, eventId, events, initialRegistrationId, fixtureRows, canReadLedger, canOpenMessages, canOpenPlayer, go }) {
  const activeEvent = eventId == null ? events[0] : events.find(event => sameId(event.id, eventId));
  if (!activeEvent) return <section className="ap-section ap-live-loading"><h2>No event registrations are available</h2><button className="ap-secondary" onClick={() => go('events')}>Choose an event</button></section>;
  return <EventRegistrations key={`${session?.user?.id || 'preview'}:${scopeId}:${activeEvent.id}:${canReadLedger}:${initialRegistrationId || ''}`}
    {...{ client, session, scopeId, events, initialRegistrationId, fixtureRows, canReadLedger, canOpenMessages, canOpenPlayer, go }} event={activeEvent} />;
}

function EventRegistrations({ client, session, scopeId, event, events, initialRegistrationId, fixtureRows, canReadLedger, canOpenMessages, canOpenPlayer, go }) {
  const [view, setView] = useState(null);
  const [revision, setRevision] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [selected, setSelected] = useState([]);
  const [drawerId, setDrawerId] = useState(initialRegistrationId);
  const [operation, setOperation] = useState(null);
  const [page, setPage] = useState(1);
  const userId = session?.user?.id;
  const reload = () => setRevision(current => current + 1);
  const changeFilter = (key, value) => { setFilters(previous => ({ ...previous, [key]: value })); setPage(1); };
  const closeDrawer = useCallback(() => setDrawerId(null), []);
  useEffect(() => {
    if (fixtureRows) return undefined;
    const controller = new AbortController();
    loadRegistrationWorkspace({ client, eventId: event.id, expectedUserId: userId, scopeId, canReadLedger, signal: controller.signal })
      .then(record => { if (!controller.signal.aborted) setView({ client, revision, record }); })
      .catch(error => { if (!controller.signal.aborted) setView({ client, revision, error: error.message }); });
    return () => controller.abort();
  }, [client, event.id, userId, scopeId, canReadLedger, revision, fixtureRows]);

  const fixture = fixtureRows?.filter(row => sameId(row.event_id, event.id));
  const current = fixtureRows ? { record: { event, rows: fixture, divisions: [], ledger: indexRegistrationLedger(fixture, [], []), canOperate: false } }
    : view?.client === client && view.revision === revision ? view : null;
  const { rows = [], divisions = [], ledger, canOperate = false } = current?.record || {};
  const programEvent = current?.record?.event;
  const visible = ledger ? filterRegistrationWorkspace(rows, filters, divisions, ledger) : [];
  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageRows = visible.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const rowIds = new Set(rows.map(row => String(row.id)));
  const selectedIds = new Set(selected.filter(id => rowIds.has(id)));
  const drawer = rows.find(row => sameId(row.id, drawerId));
  const withdrawnReceipt = drawer && ledger.withdrawnReceipts.get(String(drawer.id));
  const divisionOptions = [...new Set(rows.map(row => registrationDivisionLabel(row, divisions)))].sort();
  const exportRows = toExport => downloadRegistrations(event.id, toExport.map(row => ({ ...row, division: registrationDivisionLabel(row, divisions) })));
  const updateSelected = (ids, checked) => setSelected(previous => checked ? [...new Set([...previous, ...ids])] : previous.filter(id => !ids.includes(id)));
  const changePage = value => { setPage(value); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const closeOperation = result => { setOperation(null); if (result?.refresh) reload(); };

  return <>
    <div className="ap-page-heading">
      <div><p className="ap-eyebrow">{eventName(event)} / Operate</p><h1>Registrations</h1><p className="ap-lede">Review entries, payment state, eligibility and partner completion.</p></div>
      <div className="ap-heading-actions">
        <button className="ap-secondary" disabled={!visible.length} onClick={() => exportRows(visible)}><Download size={16} /> Export view</button>
        {canOperate && <Link className="ap-primary" to={eventHref(event.id, { action: 'add' })}><Plus size={16} /> Add registration</Link>}
      </div>
    </div>
    <div className="ap-filter-bar">
      <SearchableDropdown value={String(event.id)} onChange={change => { const choice = events.find(item => sameId(item.id, change.target.value)); if (choice) go('registrations', { event: choice }); }} aria-label="Registration event">
        {events.map(item => <option key={item.id} value={String(item.id)}>{eventName(item)}</option>)}
      </SearchableDropdown>
      <label className="ap-filter-search"><Search size={17} /><span className="ap-visually-hidden">Search registrations</span><input value={filters.query} onChange={change => changeFilter('query', change.target.value)} placeholder="Search player, team, email or division" /></label>
      <div className="ap-filter-tabs" role="group" aria-label="Registration state filter">
        {['All states', 'Needs review', 'Payment issues', 'Paid'].map(item => <button key={item} aria-pressed={filters.quick === item} onClick={() => changeFilter('quick', item)}>{item}</button>)}
      </div>
    </div>
    {!current ? <section className="ap-section"><RecordLoading label="Loading registrations…" detail="Reading registrations for the selected event." /></section>
      : current.error ? <section className="ap-section ap-live-loading" role="alert"><h2>Registrations could not be loaded</h2><p>{current.error}</p><button className="ap-secondary" onClick={reload}>Try again</button></section>
      : programEvent?.is_manual === false ? <section className="ap-section ap-live-loading"><h2>Imported participants</h2><Link className="ap-primary" to={eventHref(event.id)}>Open imported participants <ArrowRight size={16} /></Link></section>
      : <>
        <div className="ap-filter-bar">
          <SearchableDropdown value={filters.payment} onChange={change => changeFilter('payment', change.target.value)} aria-label="Filter by recorded payment">
            <option value="">All payment states</option>{Object.entries(PAYMENT).map(([value, props]) => <option key={value} value={value}>{props[0]}</option>)}<option value="withdrawn">Withdrawn</option>
          </SearchableDropdown>
          <SearchableDropdown value={filters.licence} onChange={change => changeFilter('licence', change.target.value)} aria-label="Filter by registration licence">
            <option value="">All licences</option>{Object.entries(LICENCE).map(([value, props]) => <option key={value} value={value}>{props[0]}</option>)}
          </SearchableDropdown>
          <SearchableDropdown value={filters.division} onChange={change => changeFilter('division', change.target.value)} aria-label="Filter registration division">
            <option value="">All divisions</option>{divisionOptions.map(name => <option key={name} value={name}>{name}</option>)}
          </SearchableDropdown>
          <SearchableDropdown value={filters.sort} onChange={change => changeFilter('sort', change.target.value)} aria-label="Sort registrations">
            <option value="division">Sort by division</option><option value="name">Sort by player</option><option value="recent">Most recent</option>
          </SearchableDropdown>
        </div>
        <AnimatePresence initial={false}>{selectedIds.size > 0 && <Motion.div className="ap-bulk-bar" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}>
          <strong>{selectedIds.size} selected</strong>
          <button onClick={() => exportRows(rows.filter(row => selectedIds.has(String(row.id))))}>Export selected</button>
          {canOpenMessages && <button onClick={() => go('messaging', { event })}>Open event messages</button>}
          <button onClick={() => setSelected([])}>Clear selection</button>
        </Motion.div>}</AnimatePresence>
        <section className="ap-section ap-registration-table">
          <div className="ap-registration-row ap-registration-head">
            <span><input type="checkbox" aria-label="Select all registrations on this page" checked={!!pageRows.length && pageRows.every(row => selectedIds.has(String(row.id)))} onChange={change => updateSelected(pageRows.map(row => String(row.id)), change.target.checked)} /></span>
            <span>Player / team</span><span>Division</span><span>Submitted</span><span>Payment</span><span>Eligibility</span><span>Status</span><span />
          </div>
          {pageRows.map(row => {
            const name = registrationName(row);
            const checked = selectedIds.has(String(row.id));
            const payment = registrationPaymentState(row, ledger.payments.get(String(row.id)), ledger.refunds.get(String(row.id)));
            return <div key={row.id} className={`ap-registration-row ${checked ? 'is-selected' : ''}`}>
              <span><input type="checkbox" aria-label={`Select ${name}`} checked={checked} onChange={change => updateSelected([String(row.id)], change.target.checked)} /></span>
              <button className="ap-person-cell" onClick={() => setDrawerId(row.id)}><i>{name.slice(0, 1)}</i><span><b>{name}</b><small>{row.partner_name ? `with ${row.partner_name}` : 'Partner needed'}</small></span></button>
              <span><b>{registrationDivisionLabel(row, divisions)}</b><small>{row.id}</small></span><span><b>{formatDate(row.created_at)}</b></span>
              <span><Status value={PAYMENT[payment]} /></span><span><Status value={LICENCE[row._licenseCategory] || LICENCE.unknown} /></span>
              <span><Status value={[String(row.status || 'submitted').replaceAll('_', ' '), 'neutral']} /></span>
              <button className="ap-icon-button" onClick={() => setDrawerId(row.id)} aria-label={`Open ${name} registration`}><ChevronRight size={17} /></button>
            </div>;
          })}
          {!visible.length && <div className="ap-empty"><Search size={28} /><h3>No registrations match this view</h3><button className="ap-secondary" onClick={() => { setFilters(EMPTY_FILTERS); setPage(1); }}>Clear filters</button></div>}
        </section>
        {visible.length > 0 && <nav className="ap-pagination" aria-label="Registration pages"><span>Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, visible.length)} of {visible.length}</span>
          <div><button className="ap-secondary" disabled={currentPage === 1} onClick={() => changePage(currentPage - 1)}>Previous</button><span>Page {currentPage} of {pageCount}</span><button className="ap-secondary" disabled={currentPage === pageCount} onClick={() => changePage(currentPage + 1)}>Next</button></div>
        </nav>}
      </>}
    {drawer && <RegistrationDrawer key={drawer.id} row={drawer} payment={ledger.payments.get(String(drawer.id))} refunds={ledger.refunds.get(String(drawer.id))}
      withdrawnReceipt={withdrawnReceipt} division={registrationDivisionLabel(drawer, divisions)}
      {...{ event, go, canOperate, canOpenPlayer, closeDrawer }} operation={operation} setOperation={setOperation} />}
    {drawer && operation?.refund && <RegistrationRefundReview {...{ client, session, scopeId, event }} row={drawer} refund={operation.refund} action={operation.action} onClose={closeOperation} />}
    {drawer && canOperate && operation === 'whatsapp' && <RegistrationGroupDialog {...{ client, session, scopeId, event }} row={drawer} onClose={closeOperation} />}
    {drawer && canOperate && operation === 'replacement' && <EventReplacementDialog {...{ client, session, scopeId, event }} team={[drawer]} initialRegistrationId={drawer.id} onClose={closeOperation} />}
    {drawer && canOperate && operation === 'profile-name' && <RegistrationProfileNameDialog {...{ client, session, scopeId, event }} registration={drawer} onClose={closeOperation} />}
    {drawer && withdrawnReceipt && operation === 'withdrawn-receipt' && <EventPaymentDialog {...{ client, session, scopeId, event, divisions }}
      action={{ type: 'correct', registration: { ...drawer, _editablePayment: withdrawnReceipt } }} save={saveWithdrawnRegistrationReceipt} onClose={closeOperation} />}
  </>;
}

function RegistrationDrawer({ row, payment, refunds = [], withdrawnReceipt, division, event, go, canOperate, canOpenPlayer, closeDrawer, operation, setOperation }) {
  const title = useId();
  const paymentState = registrationPaymentState(row, payment, refunds);
  const record = recordedRegistrationPayment(row, payment);
  const canChange = canOperate && !registrationIsWithdrawn(row);
  const canResolve = ['failed','pending'].includes(paymentState) && row.status === 'registered' && event.event_status !== 'cancelled';
  const phone = String(row.phone || row.contact_number || row._player?.contact_number || '').replace(/[^\d+]/g, '');
  useEffect(() => {
    if (operation) return undefined;
    const key = event => { if (event.key === 'Escape') closeDrawer(); };
    document.addEventListener('keydown', key);
    return () => document.removeEventListener('keydown', key);
  }, [closeDrawer, operation]);
  return <>
    <Motion.button className="ap-drawer-scrim" aria-label="Dismiss registration details" tabIndex={-1} onClick={closeDrawer} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
    <Motion.aside className="ap-drawer" role="dialog" aria-modal="true" aria-labelledby={title} initial={{ x: 36, opacity: 0 }} animate={{ x: 0, opacity: 1 }}>
      <div className="ap-drawer-head"><div><p className="ap-kicker">Registration {row.id}</p><h2 id={title}>{registrationName(row)}</h2></div><button autoFocus className="ap-icon-button" onClick={closeDrawer} aria-label="Close registration details"><X size={19} /></button></div>
      <div className="ap-drawer-body">
        <div className="ap-drawer-status"><Status value={PAYMENT[paymentState]} /><Status value={LICENCE[row._licenseCategory] || LICENCE.unknown} /></div>
        <dl className="ap-details-list"><div><dt>Event</dt><dd>{eventName(event)}</dd></div><div><dt>Division</dt><dd>{division}</dd></div><div><dt>Status</dt><dd>{String(row.status || 'submitted').replaceAll('_', ' ')}</dd></div><div><dt>Submitted</dt><dd>{formatDate(row.created_at)}</dd></div><div><dt>Partner</dt><dd>{row.partner_name || 'Partner needed'}{row.partner_email && <> · {row.partner_email}</>}</dd></div>{row.email && <div><dt>Email</dt><dd>{row.email}</dd></div>}{phone.length > 2 && <div><dt>Phone</dt><dd><a href={`tel:${phone}`}>{phone}</a></dd></div>}</dl>
        <section><h3>Player profile</h3>
          {canOpenPlayer && row._player ? <button className="ap-linked-record" onClick={() => go('player', { registration: row, event })}><span className="ap-avatar">{registrationName(row).slice(0, 1)}</span><span><b>{row._player.name || registrationName(row)}</b><small>Open player record</small></span><ChevronRight size={17} /></button> : <p>{row._player?.name || 'No matching profile'}</p>}
          {canChange && row.email && <button className="ap-secondary" onClick={() => setOperation('replacement')}>Replace player / Change profile</button>}
          {canChange && canAlignRegistrationProfile(row) && <button className="ap-secondary" onClick={() => setOperation('profile-name')}>Match profile name</button>}
        </section>
        <section><h3>Recorded payment</h3><dl className="ap-details-list">{record.method && <div><dt>Method</dt><dd>{record.method}</dd></div>}{record.reference && <div><dt>Reference</dt><dd>{record.reference}</dd></div>}{record.recipient && <div><dt>Received by</dt><dd>{record.recipient}</dd></div>}{record.note && <div><dt>Notes</dt><dd>{record.note}</dd></div>}{payment?.amount != null && <div><dt>Amount</dt><dd>{moneyFormat.format(payment.amount)}</dd></div>}</dl>
          {withdrawnReceipt && <button className="ap-secondary" onClick={() => setOperation('withdrawn-receipt')}>Correct withdrawn receipt</button>}
          {refunds.length > 0 && <ul>{refunds.map(refund => {
            const next = registrationRefundAction(refund);
            return <li key={refund.id}>{moneyFormat.format(refund.amount)} · {String(refund.status).replaceAll('_', ' ')}{refund.reason && <> · {refund.reason.replaceAll('_', ' ')}</>}
              {next && <button className="ap-secondary" onClick={() => setOperation({ refund, action: next })}>{next === 'reconcile' ? 'Check Paystack status' : ['cash', 'manual'].includes(refund._paymentMethod) ? 'Record cash refund' : 'Retry failed refund'}</button>}
              {!next && refund.status === 'failed' && <small>Manual refund review required.</small>}
            </li>;
          })}</ul>}
        </section>
        <section><h3>WhatsApp group</h3><p>{row.whatsapp_added ? 'Recorded on group' : 'Not recorded on group'}</p>{canChange && <button className="ap-secondary" onClick={() => setOperation('whatsapp')}>Update group record</button>}</section>
      </div>
      <div className="ap-drawer-actions">{canResolve && <button className="ap-primary" onClick={() => go('payment', { registration: row, event })}>Resolve payment <ArrowRight size={16} /></button>}
        <Link className="ap-secondary" to={eventHref(event.id, { registration: row.id })}>Manage this entry</Link>
      </div>
    </Motion.aside>
  </>;
}

function RegistrationGroupDialog({ client, session, scopeId, event, row, onClose }) {
  const title = useId();
  const { bindDialog, busy, error, result, close, run } = useEventOperation({ client, event, session, scopeId, onClose });
  const confirm = form => {
    form.preventDefault();
    run(checks => saveRegistrationWhatsApp({ client, eventId: event.id, registration: row, expectedUserId: session?.user?.id, scopeId, ...checks }));
  };
  return <dialog ref={bindDialog} className="ap-payment-dialog" aria-labelledby={title} onCancel={event => { event.preventDefault(); close(); }}>
    <header><div><p>{eventName(event)}</p><h2 id={title}>Update WhatsApp group record</h2></div><button type="button" className="ap-icon-button" disabled={busy} onClick={close} aria-label="Close group record">×</button></header>
    <form onSubmit={confirm}>
      {result ? <p role="status">WhatsApp group record updated for {registrationName(row)}.</p> : <>
        <p>Mark {registrationName(row)} as {row.whatsapp_added ? 'not on the event WhatsApp group' : 'on the event WhatsApp group'}.</p>
        {error && <p role="alert">{error}</p>}
      </>}
      <footer><button type="button" className="ap-secondary" disabled={busy} onClick={close}>{result ? 'Done' : 'Cancel'}</button>
        {!result && <button type="submit" className="ap-primary" disabled={busy || !!error}>{busy ? 'Saving…' : 'Save group record'}</button>}
      </footer>
    </form>
  </dialog>;
}
