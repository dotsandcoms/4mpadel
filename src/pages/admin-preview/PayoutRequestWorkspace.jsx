import { useEffect, useRef, useState } from 'react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { fetchAllRows } from '../../utils/fetchAllRows';
import { formatBankingDestination } from '../../utils/organisationBanking';
import { southAfricanToday } from '../../utils/licenseReporting';
import { FreshPreviewVerification } from './PreviewAuthenticator';
import { financeDate } from './financeOverviewData';
import { loadPayoutSettlement, loadPayoutWorkspace, payoutScope, submitPayoutAction, verifyPayoutIdentity } from './payoutOperations';
import RecordLoading from './RecordLoading';

const rand = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
const bankFields = [
  ['bank_name', 'Bank name', 2, 80], ['account_holder', 'Account holder', 2, 120],
  ['account_number', 'Account number', 6, 20, '[0-9]{6,20}'],
  ['confirmation', 'Confirm account number', 6, 20, '[0-9]{6,20}'],
  ['branch_code', 'Branch code', 6, 6, '[0-9]{6}'],
];

function BankingEditor({ summary, onReview, onCancel }) {
  const [type, setType] = useState('');
  const [error, setError] = useState('');
  function review(event) {
    event.preventDefault();
    const input = Object.fromEntries(new FormData(event.currentTarget));
    if (input.account_number !== input.confirmation) {
      setError('The account numbers do not match.');
      event.currentTarget.elements.confirmation.focus();
      return;
    }
    delete input.confirmation;
    delete input.acknowledged;
    onReview({ kind: 'save', purpose: 'save banking details', input: { ...input, account_type: type, expected_version: summary.version || null } });
    event.currentTarget.reset();
  }
  return <form className="lw-editor" onSubmit={review} autoComplete="off">
    <h3>{summary.saved ? 'Replace banking details' : 'Add banking details'}</h3>
    <div className="lw-fields">{bankFields.map(([field, label, minLength, maxLength, pattern]) => (
      <label key={field} className="lw-field"><span>{label}</span><input name={field} required minLength={minLength} maxLength={maxLength}
        pattern={pattern} inputMode={pattern ? 'numeric' : undefined} type={field === 'account_number' || field === 'confirmation' ? 'password' : 'text'}
        autoComplete="off" spellCheck={false} /></label>
    ))}
      <label className="lw-field"><span>Account type</span><SearchableDropdown value={type} onChange={event => setType(event.target.value)} required>
        <option value="">Select account type</option><option value="current">Current / cheque</option><option value="savings">Savings</option><option value="transmission">Transmission</option>
      </SearchableDropdown></label>
    </div>
    <label className="lw-check"><input type="checkbox" name="acknowledged" required />I confirm these are the organisation’s authorised payout details.</label>
    {error && <p role="alert">{error}</p>}
    <div className="lw-actions"><button className="ap-primary" disabled={!type}>Review banking details</button><button type="button" className="ap-secondary" onClick={onCancel}>Cancel</button></div>
  </form>;
}

function EventPayoutForm({ client, organisationId, data, onReview, initialEventId }) {
  const [eventId, setEventId] = useState(() => {
    const id = Number(initialEventId);
    return Number.isSafeInteger(id) && id > 0 && data.events.some(event => Number(event.id) === id) ? String(id) : '';
  });
  const [amount, setAmount] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [manual, setManual] = useState({ amount:'', note:'', paidAt:southAfricanToday() });
  const [snapshot, setSnapshot] = useState(null);
  const [retry, setRetry] = useState(0);
  const key = `${eventId}:${retry}`;
  const reply = snapshot?.key === key ? snapshot : null;
  useEffect(() => {
    if (!eventId) return;
    const request = new AbortController();
    loadPayoutSettlement(client, organisationId, eventId, request.signal)
      .then(result => { if (!request.signal.aborted) setSnapshot({ key, result }); })
      .catch(error => { if (!request.signal.aborted) setSnapshot({ key, error: error.message }); });
    return () => request.abort();
  }, [client, eventId, organisationId, key]);
  const settlement = reply?.result?.settlement;
  const rules = reply?.result?.rules;
  const requested = Number(amount);
  const pending = data.requests.some(request => String(request.event_id) === eventId && request.status === 'pending');
  const canSubmit = confirmed && data.banking.saved && !pending && rules?.canRequest && requested > 0 && requested <= rules.maxRequestable;
  function review(event) {
    event.preventDefault();
    if (!canSubmit) return;
    onReview({
      kind: 'request', purpose: 'send this payout request',
      input: { event_id: Number(eventId), amount: requested, request_id: crypto.randomUUID(), expected_version: data.banking.version },
    });
  }
  return <section className="lw-editor"><h2>Request event payout</h2>
    <label className="lw-field"><span>Event</span><SearchableDropdown value={eventId} onChange={event => { setEventId(event.target.value); setAmount(''); setConfirmed(false); }}>
      <option value="">Select a manual event</option>{data.events.map(event => <option key={event.id} value={String(event.id)}>{event.event_name}</option>)}
    </SearchableDropdown></label>
    {eventId && !reply && <p role="status">Verifying current event receipts…</p>}
    {reply?.error && <div role="alert"><p>{reply.error}</p><button type="button" className="ap-secondary" onClick={() => setRetry(n => n + 1)}>Retry settlement</button></div>}
    {settlement && <form onSubmit={review}>
      <div className="lw-counts">{[['Current entry payments', 'grossEntryFees'], ['Platform fees', 'commission'], ['Paid out', 'interimPaid'], ['Balance due', 'dueToOrg']].map(([title, field]) => <div key={field}><small>{title}</small><strong>{rand(settlement[field])}</strong></div>)}</div>
      <p>{pending ? 'This event already has a pending payout request.' : rules.blockedReason || rules.helperText}</p>
      {rules.canRequest && !pending && data.banking.saved && <>
        <label className="lw-field"><span>Payout amount (R), up to {rand(rules.maxRequestable)}</span><input type="number" required min="0.01" max={rules.maxRequestable} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} /></label>
        <label className="lw-check"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Use {formatBankingDestination(data.banking)}</label>
        <button type="submit" className="ap-primary" disabled={!canSubmit}>Review payout request</button>
      </>}
      {!data.banking.saved && <p>Add banking details before requesting a payout.</p>}
    </form>}
    {data.canProcess && reply?.result?.event && <details>
      <summary>Recorded interim payments</summary>
      {(reply.result.event.organiser_interim_payments || []).map(row => <div className="lw-actions" key={row.id}>
        <p>{row.paid_at} · {rand(row.amount)} {row.note && `· ${row.note}`}</p>
        {row.id && !row.request_id && !String(row.note || '').startsWith('Manual payout request ') && <button type="button" className="ap-secondary" onClick={()=>onReview({
          kind:'remove_interim', purpose:'remove this interim payment record', input:{eventId:Number(eventId), recordId:row.id, amount:Number(row.amount)},
        })}>Remove recorded payment</button>}
      </div>)}
      <form onSubmit={event=>{
        event.preventDefault();
        onReview({kind:'record_interim', purpose:'record this interim payment', input:{...manual, amount:Number(manual.amount), eventId:Number(eventId)}});
      }}>
        <div className="lw-fields">
          <label className="lw-field"><span>Interim amount (R)</span><input required type="number" min="0.01" step="0.01" value={manual.amount} onChange={e=>setManual(value=>({...value,amount:e.target.value}))}/></label>
          <label className="lw-field"><span>Date paid</span><input type="date" required value={manual.paidAt} onChange={e=>setManual(value=>({...value,paidAt:e.target.value}))}/></label>
          <label className="lw-field"><span>Payout note</span><input value={manual.note} onChange={e=>setManual(value=>({...value,note:e.target.value}))}/></label>
        </div>
        <button type="submit" className="ap-secondary">Review recorded payment</button>
      </form>
    </details>}
  </section>;
}

function OrganisationPayouts({ client, session, organisationId, revision, initialEventId }) {
  const [reply, setReply] = useState(null);
  const [refresh, setRefresh] = useState(0);
  const [editing, setEditing] = useState(false);
  const [action, setAction] = useState(null);
  const [revealed, setRevealed] = useState(null);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lifetime = useRef(null);
  const revealEpoch = useRef(0);
  const running = useRef(false);
  const requestKey = `${revision}:${refresh}`;
  const answer = reply?.requestKey === requestKey ? reply : null;
  const data = answer?.data;
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller.signal;
    const hideBank = () => {
      if (document.hidden) { revealEpoch.current++; setRevealed(null); }
    };
    document.addEventListener('visibilitychange', hideBank);
    return () => { controller.abort(); document.removeEventListener('visibilitychange', hideBank); };
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    loadPayoutWorkspace(client, session, organisationId, controller.signal)
      .then(result => { if (!controller.signal.aborted) setReply({ requestKey, data: result }); })
      .catch(error => { if (!controller.signal.aborted) setReply({ requestKey, error: error.message }); });
    return () => controller.abort();
  }, [client, session, organisationId, requestKey]);
  useEffect(() => {
    if (!revealed) return;
    const timer = setTimeout(() => setRevealed(null), 60000);
    return () => clearTimeout(timer);
  }, [revealed]);
  function review(next) { setAction(next); setEditing(false); setNotice(''); setError(''); setRevealed(null); }
  async function confirm() {
    if (!action || running.current || lifetime.current?.aborted) return;
    running.current = true;
    setBusy(true);
    const signal = lifetime.current;
    const epoch = revealEpoch.current;
    try {
      const result = await submitPayoutAction(client, session, organisationId, action, signal);
      if (signal.aborted) return;
      if (action.kind === 'reveal') {
        if (epoch === revealEpoch.current && !document.hidden) setRevealed(result);
      } else {
        setNotice(action.kind === 'request'
          ? (result.notified ? 'Payout request saved and sent to 4M admin.' : 'Payout request saved. 4M can view it in payout requests.')
          : action.kind === 'resolve' ? 'Payout status updated.' : action.kind === 'record_interim' ? 'Interim payment recorded.'
          : action.kind === 'remove_interim' ? 'Interim payment removed.' : 'Banking details updated.');
        setRefresh(n => n + 1);
      }
      setAction(null);
    } catch (failure) {
      if (!signal.aborted) { setError(failure.message || 'The secure action could not be completed.'); setAction(null); }
    } finally {
      running.current = false;
      if (!signal.aborted) setBusy(false);
    }
  }

  if (!answer) return <RecordLoading label="Loading secure payout details…" />;
  if (!data) return <section role="alert"><p>{answer.error}</p><button className="ap-secondary" onClick={() => setRefresh(n => n + 1)}>Retry secure payouts</button></section>;
  return <div className="fo-root">
    {notice && <p role="status">{notice}</p>}{error && <p role="alert">{error}</p>}
    <section className="lw-editor" data-private="true">
      <header className="lw-actions"><div><h2>Payout banking details</h2><p>{formatBankingDestination(data.banking)}</p></div>
        {!editing && !action && <div className="lw-actions"><button className="ap-secondary" onClick={() => setEditing(true)}>{data.banking.saved ? 'Replace banking details' : 'Add banking details'}</button>
          {data.banking.saved && <button className="ap-secondary" onClick={() => review({ kind: 'remove', purpose: 'remove the saved payout account', input: { expected_version: data.banking.version } })}>Remove saved account</button>}
        </div>}
      </header>
      {editing && <BankingEditor summary={data.banking} onReview={review} onCancel={() => setEditing(false)} />}
      {!editing && !action && <p className="fo-note">Banking details are private. Existing requests retain the destination confirmed when they were submitted.</p>}
      {action && <div className="lw-review">
        <h3>{['record_interim','remove_interim'].includes(action.kind) ? 'Review recorded payout' : `Verify to ${action.purpose}`}</h3>
        {action.kind === 'resolve' && action.input.status === 'paid' && <p>Only continue once the bank transfer has completed.</p>}
        {action.kind === 'request' && <p>Request {rand(action.input.amount)} to {formatBankingDestination(data.banking)} for manual processing.</p>}
        {['record_interim','remove_interim'].includes(action.kind) ? <>
          <p>{action.kind === 'record_interim' ? 'Record this completed bank payment' : 'Remove this recorded payment'} · {rand(action.input.amount)}</p>
          <div className="lw-actions"><button className="ap-primary" disabled={busy} onClick={confirm}>{busy ? 'Saving…' : 'Confirm recorded payout change'}</button>
            <button className="ap-secondary" disabled={busy} onClick={()=>setAction(null)}>Cancel</button></div>
        </> : <FreshPreviewVerification key={action.purpose} client={client} actorId={session.user.id} purpose={action.purpose}
          onVerified={confirm} onCancel={() => { if (!running.current) setAction(null); }} allowEnrollment />}
      </div>}
    </section>
    {!editing && !action && <EventPayoutForm client={client} organisationId={organisationId} data={data} onReview={review} initialEventId={initialEventId} />}
    <section className="lw-editor"><header className="lw-actions"><div><h2>Payout requests</h2><p>4M processes bank transfers manually.</p></div>
      <button className="ap-secondary" disabled={Boolean(action)} onClick={() => { setRevealed(null); setRefresh(n => n + 1); }}>Refresh requests</button></header>
      {revealed && <div className="lw-review" data-private="true"><header className="lw-actions"><h3>Confidential payout destination</h3><button className="ap-secondary" onClick={() => setRevealed(null)}>Hide account details</button></header>
        <dl>{[['Bank','bank_name'],['Account holder','account_holder'],['Account number','account_number'],['Branch code','branch_code'],['Account type','account_type']].map(([label, key]) => (
          <div key={key}><dt>{label}</dt><dd>{revealed[key]}</dd></div>
        ))}</dl><p>These details hide after 60 seconds.</p></div>}
      <div className="fo-table-scroll"><table className="fo-detail-table" aria-label="Organiser payout requests"><thead><tr><th>Event</th><th>Requested</th><th>Amount</th><th>Destination</th><th>Status</th>{data.canProcess && <th>Actions</th>}</tr></thead>
        <tbody>{data.requests.map(request => <tr key={request.id}><td>{request.event_name}</td><td>{financeDate(request.created_at)}</td><td>{rand(request.amount)}</td><td>Ending {request.last_four}{request.account_changed && <small>Account changed</small>}</td><td>{request.status}</td>
          {data.canProcess && <td>{request.status === 'pending' && <div className="fo-report-actions">
            <button className="ap-secondary" disabled={Boolean(action)} onClick={() => review({ kind: 'reveal', purpose: 'view banking details', input: { request_id: request.id } })}>Reveal</button>
            <button className="ap-secondary" disabled={Boolean(action)} onClick={() => review({ kind: 'resolve', purpose: 'mark this payout paid', input: { request_id: request.id, status: 'paid' } })}>Mark paid</button>
            <button className="ap-secondary" disabled={Boolean(action)} onClick={() => review({ kind: 'resolve', purpose: 'cancel this payout request', input: { request_id: request.id, status: 'cancelled' } })}>Cancel request</button>
          </div>}</td>}</tr>)}</tbody></table></div>
      {!data.requests.length && <p>No payout requests yet.</p>}
    </section>
  </div>;
}

export default function PayoutRequestWorkspace({ client, session, permissions, scopeId, refreshRevision = 0, initialEventId, initialOrganisationId }) {
  const scope = payoutScope(session, permissions, scopeId);
  const [reply, setReply] = useState(null);
  const [organisation, setOrganisation] = useState(() => String(initialOrganisationId || ''));
  const [retry, setRetry] = useState(0);
  const platformPicker = scope?.platform && !scope.organisationId;
  const userId = session?.user?.id;
  const requestKey = `${userId}:${retry}:${refreshRevision}`;
  const replyForScope = reply?.key === requestKey ? reply : null;
  useEffect(() => {
    if (!platformPicker) return;
    const controller = new AbortController();
    verifyPayoutIdentity(client, { user: { id: userId } }, controller.signal)
      .then(() => fetchAllRows(() => client.from('organisations').select('id,name').eq('status','approved').order('name').order('id')))
      .then(rows => { if (!controller.signal.aborted) setReply({ key: requestKey, rows }); })
      .catch(error => { if (!controller.signal.aborted) setReply({ key: requestKey, error: error.message }); });
    return () => controller.abort();
  }, [client, platformPicker, requestKey, userId]);
  if (!scope) return <section className="ap-section"><h1>Payouts</h1><p>Select an organisation you own or administer.</p></section>;
  const selected = scope.organisationId || replyForScope?.rows?.find(row => row.id === organisation)?.id;
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Payouts</p><h1>Organiser payouts</h1></div></header>
    {platformPicker && <label className="lw-field"><span>Organisation</span><SearchableDropdown value={organisation} onChange={event => setOrganisation(event.target.value)} disabled={!replyForScope?.rows}>
      <option value="">Choose an organisation</option>{(replyForScope?.rows || []).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}
    </SearchableDropdown></label>}
    {platformPicker && !replyForScope && <p role="status">Loading organisations…</p>}
    {platformPicker && replyForScope?.error && <p role="alert">{replyForScope.error} <button className="ap-secondary" onClick={() => setRetry(n => n + 1)}>Retry organisations</button></p>}
    {selected && <OrganisationPayouts key={`${userId}:${selected}`} client={client} session={session} organisationId={selected} revision={refreshRevision}
      initialEventId={(!initialOrganisationId || selected === initialOrganisationId) ? initialEventId : null} />}
  </section>;
}
