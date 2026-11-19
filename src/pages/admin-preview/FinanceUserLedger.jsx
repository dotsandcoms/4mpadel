import { useEffect, useMemo, useState } from 'react';
import { fetchAllRows } from '../../utils/fetchAllRows';
import { financeDate } from './financeOverviewData';
import { licenseCsvCell } from './licenseData';
import RecordLoading from './RecordLoading';

const PAGE_SIZE = 20;
const cash = value => new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR' }).format(value);
const columns = ['Date', 'Reference', 'Type', 'Event', 'Payment method', 'Status', 'Amount', 'Environment'];
const reportRow = row => [financeDate(row.created_at), row.reference, row.payment_type, row.calendar?.event_name, row.payment_method, row.status, row.amount, row.is_test ? 'Test' : 'Live / unspecified'];
function saveCsv(name, rows) {
  const file = new Blob(['\uFEFF', rows.map(row => row.map(licenseCsvCell).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); URL.revokeObjectURL(url);
}

async function requirePlatformLedger(client, session, signal) {
  signal?.throwIfAborted();
  const auth = await client.auth.getUser();
  const user = auth.data?.user;
  if (auth.error || !user?.id || user.id !== session?.user?.id || !user.email) throw new Error('Sign in again to open the User Ledger.');
  const result = await client.rpc('is_super_admin', { user_email: user.email });
  signal?.throwIfAborted();
  if (result.error || result.data !== true) throw new Error('Platform super-admin access is required.');
}

async function loadUserLedger(client, session, signal) {
  await requirePlatformLedger(client, session, signal);
  const read = (table, fields) => fetchAllRows(() => {
    signal.throwIfAborted();
    return client.from(table).select(fields).order('id');
  });
  return await Promise.all([
    read('players','id,name,email'),
    read('payments','id,player_id,created_at,reference,payment_type,payment_method,status,amount,is_test,calendar(event_name)'),
  ]);
}

export default function FinanceUserLedger({ session, client, refreshRevision = 0 }) {
  const [response, setResponse] = useState(null);
  const [filter, setFilter] = useState('');
  const [sort, setSort] = useState({ field:'name', direction:1 });
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(null);
  const [review, setReview] = useState(null);
  const [retry, setRetry] = useState(0);
  const [action, setAction] = useState(null);
  const userId = session?.user?.id;
  const key = JSON.stringify([userId, refreshRevision, retry]);
  const reply = response?.key === key ? response : null;
  useEffect(() => {
    const controller = new AbortController();
    loadUserLedger(client, { user:{ id:userId } }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setResponse({ key, data }); })
      .catch(error => { if (!controller.signal.aborted) setResponse({ key, error:error.message }); });
    return () => controller.abort();
  }, [key, client, userId]);
  const users = useMemo(() => {
    if (!reply?.data) return [];
    const [players, ledger] = reply.data;
    const payments = new Map();
    for (const row of ledger) {
      if (!payments.has(row.player_id)) payments.set(row.player_id, []);
      payments.get(row.player_id).push(row);
    }
    const search = filter.trim().toLowerCase();
    return players.filter(row => !search || [row.name, row.email].some(value => String(value || '').toLowerCase().includes(search))).map(row => {
      const entries = [...(payments.get(row.id) || [])].sort((a,b)=>Date.parse(b.created_at)-Date.parse(a.created_at));
      const collected = entries.filter(entry => entry.status === 'success' && !entry.is_test);
      return { ...row, entries, total: collected.reduce((sum, entry) => sum + Number(entry.amount || 0), 0), last: collected[0] || entries[0] };
    }).sort((a,b) => (sort.field==='name' ? String(a.name).localeCompare(String(b.name)) : a.total-b.total) * sort.direction);
  }, [reply, filter, sort]);
  const [players, paymentRows] = reply?.data || [];
  const selectedPlayer = users.find(row => row.id === selected);
  const maxPage = Math.max(1, Math.ceil(users.length / PAGE_SIZE));
  const current = Math.min(page, maxPage);
  async function removePayment() {
    if (!review || action?.busy) return;
    setAction({ busy:true });
    try {
      await requirePlatformLedger(client, session);
      const result = await client.from('payments').delete().eq('id', review.id).eq('player_id', review.player_id).select('id').maybeSingle();
      if (result.error || result.data?.id !== review.id) throw new Error('The ledger record could not be deleted. Refresh and check your permissions.');
      setReview(null);
      setAction({ message:'Ledger record deleted.' });
      setRetry(value => value + 1);
    } catch (error) { setAction({ error: error.message }); }
  }
  return <section className="fo-root">
    <header className="fo-heading"><div><p className="ap-kicker">Money / Finance reports</p><h1>User ledger</h1><p>Review individual payment records, including unsuccessful attempts.</p></div></header>
    <div className="fo-ledger-filters"><label className="fo-search"><input aria-label="Search ledger players" value={filter} onChange={e=>{setFilter(e.target.value);setPage(1);setSelected(null);setReview(null);}} placeholder="Search by name or email…" /></label>
      <button className="ap-secondary" disabled={!reply?.data} onClick={()=>saveCsv('4M-player-payments.csv',[['Name','Email','Collected (R)','Last payment'],...users.map(row=>[row.name,row.email,row.total,financeDate(row.last?.created_at)])])}>Export player summary CSV</button>
      <button className="ap-secondary" disabled={!reply?.data} onClick={()=>{
        const playerById = new Map(players.map(row => [row.id,row]));
        saveCsv('4M-detailed-payment-ledger.csv',[['Player','Email',...columns],...paymentRows.map(row=>[playerById.get(row.player_id)?.name,playerById.get(row.player_id)?.email,...reportRow(row)])]);
      }}>Export detailed ledger CSV</button>
      <button className="ap-secondary" onClick={()=>setRetry(value=>value+1)}>Refresh ledger</button>
    </div>
    {action?.message && <p role="status">{action.message}</p>}{action?.error && <p role="alert">{action.error}</p>}
    {!reply && <RecordLoading label="Loading user ledger…" />}
    {reply?.error && <p role="alert">{reply.error}</p>}
    {reply?.data && !selectedPlayer && <>
      <div className="fo-table-scroll"><table className="fo-detail-table" aria-label="Players in ledger"><thead><tr>
        <th aria-sort={sort.field==='name' ? (sort.direction===1?'ascending':'descending'):'none'}><button className="fo-type-link" onClick={()=>setSort(value=>({field:'name',direction:value.field==='name'?-value.direction:1}))}>Player</button></th>
        <th aria-sort={sort.field==='total' ? (sort.direction===1?'ascending':'descending'):'none'}><button className="fo-type-link" onClick={()=>setSort(value=>({field:'total',direction:value.field==='total'?-value.direction:-1}))}>Collected</button></th><th>Last payment</th><th>Action</th></tr></thead>
        <tbody>{users.slice((current-1)*PAGE_SIZE,current*PAGE_SIZE).map(row=><tr key={row.id}><td>{row.name}<small>{row.email}</small></td><td>{cash(row.total)}</td><td>{financeDate(row.last?.created_at)||'—'}</td>
          <td><button className="fo-type-link" onClick={()=>setSelected(row.id)}>View ledger</button></td></tr>)}</tbody></table></div>
      {!users.length && <p>No players match your search.</p>}
      <nav className="fo-pagination" aria-label="User ledger pages"><span>Page {current} of {maxPage}</span>
        <button className="ap-secondary" disabled={current===1} onClick={()=>setPage(current-1)}>Previous</button>
        <button className="ap-secondary" disabled={current===maxPage} onClick={()=>setPage(current+1)}>Next</button>
      </nav>
    </>}
    {selectedPlayer && <section className="ap-section" style={{padding:18}}><header className="fo-heading"><div><h2>{selectedPlayer.name}</h2><p>{selectedPlayer.email}</p></div>
      <button className="ap-secondary" disabled={action?.busy} onClick={()=>{setSelected(null);setReview(null);}}>Back to users</button></header>
      {review && <section aria-label="Confirm payment record deletion"><h3>Delete payment record?</h3><p>{review.reference || review.id} · {cash(review.amount)} · {review.status}. This permanently removes the ledger record.</p>
        <div className="fo-report-actions"><button className="ap-primary" disabled={action?.busy} onClick={removePayment}>{action?.busy?'Deleting…':'Confirm delete'}</button>
          <button className="ap-secondary" disabled={action?.busy} onClick={()=>setReview(null)}>Cancel</button></div></section>}
      <div className="fo-table-scroll"><table className="fo-detail-table" aria-label="Selected player payment records"><thead><tr>{columns.map(label=><th key={label}>{label}</th>)}<th>Action</th></tr></thead>
        <tbody>{selectedPlayer.entries.map(row=><tr key={row.id}>{reportRow(row).map((value,index)=><td key={index}>{value ?? '—'}</td>)}
          <td><button className="fo-type-link" disabled={action?.busy} onClick={()=>setReview(row)}>Delete record</button></td></tr>)}</tbody></table></div>
      {!selectedPlayer.entries.length && <p>No payments recorded for this player.</p>}
    </section>}
  </section>;
}
