import { readAll } from './playersData.js';

export const canReadFinanceOverview = (session, permissions, scopeId) => Boolean(session?.user?.id && permissions?.role === 'super_admin' && scopeId === 'all');

export async function loadFinanceOverview(client, session, permissions, scopeId, signal) {
  if (!canReadFinanceOverview(session, permissions, scopeId)) throw new Error('Platform Finance access is required.');
  const [payments, refunds] = await Promise.all([
    readAll(() => client.from('payments').select('id,amount,status,is_test,payment_type,created_at').eq('status', 'success').order('id'), signal),
    readAll(() => client.from('payment_refunds').select('id,payment_id,amount,status,created_at,processed_at').neq('status', 'failed').order('id'), signal),
  ]);
  return { payments, refunds };
}

const cents = value => {
  if (value == null || value === '' || !Number.isFinite(Number(value))) throw new Error('A payment amount is missing or invalid. Totals cannot be calculated reliably.');
  return Math.round(Number(value) * 100);
};
export const financeDate = value => {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'Africa/Johannesburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(type=>parts.find(p=>p.type===type).value).join('-');
};
const yearOf = value => financeDate(value)?.slice(0,4);
export const inFinancePeriod = (value, filter) => !filter || (typeof filter === 'string' ? yearOf(value) === filter : financeDate(value) >= filter.from && financeDate(value) <= filter.to);
export function financePeriod({mode='all',year='',month='',from='',to=''}) {
  if (mode === 'all') return {filter:'',label:'All time'};
  if (mode === 'year' && /^\d{4}$/.test(year)) return {filter:year,label:year};
  if (mode === 'month' && /^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
    const [y,m] = month.split('-').map(Number);
    const end = new Date(Date.UTC(y,m,0)).toISOString().slice(0,10);
    const previousStart = new Date(Date.UTC(y,m-2,1)).toISOString().slice(0,10);
    const previousEnd = new Date(Date.UTC(y,m-1,0)).toISOString().slice(0,10);
    const label = new Intl.DateTimeFormat('en-ZA',{month:'long',year:'numeric',timeZone:'UTC'}).format(new Date(`${month}-01T00:00:00Z`));
    return {filter:{from:`${month}-01`,to:end},previous:{from:previousStart,to:previousEnd},label};
  }
  const validDay = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0,10)===v;
  if (mode === 'range' && validDay(from) && validDay(to) && from<=to) return {filter:{from,to},label:`${from} to ${to}`};
  throw new Error(mode==='range' ? 'Choose a valid start and end date. End date must be on or after start date.' : 'Choose a valid reporting period.');
}

export function financeOverview(payments, refunds, year = '') {
  const valid = payments.filter(p => p.status === 'success' && !p.is_test);
  const byId = new Map(valid.map(p => [String(p.id), p]));
  const eligibleRefunds = refunds.filter(r => r.status !== 'failed' && r.status != null && byId.has(String(r.payment_id)));
  const selected = value => inFinancePeriod(value,year);
  const groups = new Map();
  const group = type => {
    const key = type || 'Not classified';
    if (!groups.has(key)) groups.set(key, { type: key, count: 0, gross: 0, refunds: 0, net: 0 });
    return groups.get(key);
  };
  valid.filter(p => selected(p.created_at)).forEach(p => {
    const row = group(p.payment_type); row.count++; row.gross += cents(p.amount);
  });
  eligibleRefunds.filter(r => selected(r.processed_at || r.created_at)).forEach(r => {
    group(byId.get(String(r.payment_id)).payment_type).refunds += cents(r.amount);
  });
  const rows = [...groups.values()].map(row => ({ ...row, net: row.gross - row.refunds })).sort((a,b) => b.net - a.net || a.type.localeCompare(b.type));
  const totals = rows.reduce((sum,row) => ({ count: sum.count + row.count, gross: sum.gross + row.gross, refunds: sum.refunds + row.refunds, net: sum.net + row.net }), {count:0,gross:0,refunds:0,net:0});
  const years = [...new Set([...valid.map(p => yearOf(p.created_at)), ...eligibleRefunds.map(r => yearOf(r.processed_at || r.created_at))].filter(Boolean))].sort().reverse();
  return { rows, totals, years };
}

export function financeTypeEntries(payments,refunds,type,filter) {
  const matches=payments.filter(p=>p.status==='success' && !p.is_test && (type == null || (p.payment_type || 'Not classified')===type));
  const ids=new Set(matches.map(p=>String(p.id)));
  const types=new Map(matches.map(p=>[String(p.id),p.payment_type || 'Not classified']));
  return [
    ...matches.filter(p=>inFinancePeriod(p.created_at,filter)).map(p=>({id:`payment-${p.id}`,paymentId:p.id,date:p.created_at,kind:'Receipt',status:p.status,amount:cents(p.amount)})),
    ...refunds.filter(r=>r.status!=null && r.status!=='failed' && ids.has(String(r.payment_id)) && inFinancePeriod(r.processed_at || r.created_at,filter)).map(r=>({id:`refund-${r.id}`,paymentId:r.payment_id,date:r.processed_at || r.created_at,kind:'Refund',status:r.status,amount:-cents(r.amount)})),
  ].map(entry=>({...entry,paymentType:types.get(String(entry.paymentId))}))
    .sort((a,b)=>String(b.date || '').localeCompare(String(a.date || '')) || a.id.localeCompare(b.id));
}

// Owned by one mounted report snapshot; never persisted or shared globally.
export function createFinanceLinkCache(client,session,permissions,scopeId) {
  return {client,userId:session?.user?.id,role:permissions?.role,scopeId,rows:new Map()};
}

export async function loadFinancePaymentLinks(client,session,permissions,scopeId,ids,signal,onProgress,cache) {
  if(!canReadFinanceOverview(session,permissions,scopeId)) throw new Error('Platform Finance access is required.');
  const unique=[...new Set(ids)];
  const cached=cache?.client===client && cache.userId===session?.user?.id && cache.role===permissions?.role && cache.scopeId===scopeId ? cache.rows : new Map();
  const missing=unique.filter(id=>!cached.has(String(id)));
  const controller=new AbortController();
  const cancel=()=>controller.abort();
  if(signal?.aborted)cancel();
  signal?.addEventListener('abort',cancel,{once:true});
  const batches=Array.from({length:Math.ceil(missing.length/50)},(_,i)=>missing.slice(i*50,i*50+50));
  const results=new Array(batches.length);
  let next=0,completed=unique.length-missing.length;
  const check=()=>{if(controller.signal.aborted)throw new DOMException('Cancelled','AbortError');};
  try {
    check();onProgress?.({completed,total:unique.length});
    await Promise.all(Array.from({length:Math.min(4,batches.length)},async()=>{
      while(next<batches.length) {
        check();const index=next++;const batch=batches[index];const rows=[];
        // A primary-key batch cannot return more rows than its requested IDs.
        // Continue short pages for smaller server caps, but skip a needless empty
        // request once every requested record has been returned.
        while(rows.length<batch.length) {
          check();
          const {data,error}=await client.from('payments').select('id,reference,payment_method,players!payments_player_id_fkey(id,name,image_url),calendar!payments_event_id_fkey(id,event_name)').in('id',batch).order('id').range(rows.length,batch.length-1).abortSignal(controller.signal);
          check();if(error)throw error;
          if(!data?.length)break;
          rows.push(...data);
        }
        results[index]=rows;completed+=batch.length;
        onProgress?.({completed,total:unique.length});
      }
    }));
    check();
    // Commit only a fully successful load, including confirmed missing joins.
    const loaded=new Map(results.flat().map(row=>[String(row.id),row]));
    for(const id of missing)cached.set(String(id),loaded.get(String(id)) || null);
    return unique.map(id=>cached.get(String(id))).filter(Boolean);
  } finally {
    controller.abort();signal?.removeEventListener('abort',cancel);
  }
}

export function financePlayerSummary(entries,links) { return financeGroupedSummary(entries,links,'player'); }
export function financeEventSummary(entries,links) { return financeGroupedSummary(entries,links,'event'); }
function financeGroupedSummary(entries,links,kind) {
  const groups=new Map();
  for(const entry of entries) {
    const link=links.get(String(entry.paymentId));
    const profile=kind==='event' ? link?.calendar && {id:link.calendar.id,name:link.calendar.event_name} : link?.players;
    // Missing joins cannot be safely attributed, even when names happen to match.
    const key=profile?.id!=null ? `${kind}:${profile.id}` : `unlinked:${entry.paymentId}`;
    if(!groups.has(key))groups.set(key,{key,profile,name:profile?.id!=null ? profile.name || `Unnamed ${kind}` : 'Unlinked payment',paymentIds:new Set(),count:0,gross:0,refunds:0,net:0});
    const group=groups.get(key);
    group.paymentIds.add(String(entry.paymentId));
    if(entry.kind==='Receipt'){group.count++;group.gross+=entry.amount;}
    else group.refunds-=entry.amount;
    group.net+=entry.amount;
  }
  return [...groups.values()].sort((a,b)=>a.name.localeCompare(b.name) || a.key.localeCompare(b.key));
}
