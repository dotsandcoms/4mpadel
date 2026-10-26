import {readAll} from './playersData.js';
import {canReadFinanceOverview,financeDate} from './financeOverviewData.js';
import {matchesFinanceStatus} from './financePresentation.js';

export async function loadRecordedRefunds(client,session,permissions,scopeId,paymentId,signal) {
  if(!canReadFinanceOverview(session,permissions,scopeId))throw new Error('Platform Payments access is required.');
  if(paymentId==null || String(paymentId).trim()==='')throw new Error('A payment ID is required.');
  return readAll(()=>client.from('payment_refunds').select('id,payment_id,amount,status,created_at,processed_at,reason,paystack_refund_id,paystack_reference').eq('payment_id',paymentId).order('id'),signal);
}

export function recordedRefundReason(value) {
  const reason = String(value || '').trim();
  if (!reason) return 'Not recorded';
  return reason.replaceAll('_', ' ').replace(/^./, letter => letter.toUpperCase());
}

export async function loadRecordedPaystackPayments(client,session,permissions,scopeId,signal,onProgress) {
  if(!canReadFinanceOverview(session,permissions,scopeId))throw new Error('Platform Payments access is required.');
  return readAll(()=>client.from('payments')
    .select('id,reference,amount,status,is_test,created_at,payment_type,player_id,event_id,players!payments_player_id_fkey(id,name,image_url),calendar!payments_event_id_fkey(id,event_name)')
    .eq('payment_method','paystack').order('id'),signal,onProgress);
}

export function filterRecordedPayments(rows,{query='',status='',environment='live',from='',to=''}={}) {
  const needle=query.trim().toLowerCase();
  return rows.filter(row=>{
    const mode=row.is_test===true ? 'test' : row.is_test===false ? 'live':'unknown';
    const date=financeDate(row.created_at);
    return (environment==='all' || environment===mode) && matchesFinanceStatus(row,status)
      && (!from || date>=from) && (!to || Boolean(date && date<=to))
      && (!needle || [row.id,row.reference,row.payment_type,row.player_id,row.event_id,row.players?.name,row.calendar?.event_name].some(value=>String(value ?? '').toLowerCase().includes(needle)));
  }).sort((a,b)=>(Date.parse(b.created_at)||0)-(Date.parse(a.created_at)||0) || String(a.id).localeCompare(String(b.id)));
}

export function sortRecordedPayments(rows,sort='date-desc') {
  const [field,direction]=sort.split('-');
  const value=row=>{
    if(field==='amount')return row.amount==null || String(row.amount).trim()==='' || !Number.isFinite(Number(row.amount)) ? null:Number(row.amount);
    if(field==='player')return row.players?.name?.trim() || null;
    if(field==='event')return row.calendar?.event_name?.trim() || null;
    const date=Date.parse(row.created_at);return Number.isFinite(date) ? date:null;
  };
  return [...rows].sort((a,b)=>{
    const left=value(a),right=value(b);
    if(left==null && right!=null)return 1;
    if(right==null && left!=null)return -1;
    const comparison=left==null ? 0:typeof left==='number' ? left-right:left.localeCompare(right);
    return comparison*(direction==='asc' ? 1:-1) || String(a.id).localeCompare(String(b.id));
  });
}
