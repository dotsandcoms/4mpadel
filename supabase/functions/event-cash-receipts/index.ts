import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.95.3';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...cors, 'Content-Type': 'application/json' },
});
const metadata = (value: unknown): Record<string, any> => {
  if (typeof value === 'string') { try { return metadata(JSON.parse(value)); } catch { return {}; } }
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
};

// Read-only verification of external Paystack references already recorded by
// an event administrator. This endpoint never changes payments or issues refunds.
export async function handleEventCashReceipts(req: Request) {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'Use POST' }, 405);
  const bearer = req.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: 'Sign in to view event receipts' }, 401);
  const url = Deno.env.get('SUPABASE_URL') || '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  const body = await req.json().catch(() => ({}));
  const eventId = Number(body.event_id);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) return json({ error: 'Choose an event' }, 400);
  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  let internalService = !!serviceKey && bearer === serviceKey;
  // A project can retain a valid legacy service JWT after changing its default
  // server key. Verify that credential with Auth's admin API before trusting it.
  if (!internalService) {
    try {
      const claims = JSON.parse(atob(bearer.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
      if (claims.role === 'service_role') {
        const serviceClient = createClient(url, bearer, { auth: { persistSession: false } });
        const check = await serviceClient.auth.admin.listUsers({ page: 1, perPage: 1 });
        internalService = !check.error;
      }
    } catch { /* Normal user tokens use the authenticated-user checks below. */ }
  }
  if (!internalService) {
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false } });
    const { data: { user }, error } = await userClient.auth.getUser();
    if (error || !user?.id) return json({ error: 'Sign in to view event receipts' }, 401);
    const permission = await userClient.rpc('can_manage_event', { p_event_id: eventId });
    if (permission.error || permission.data !== true) return json({ error: 'Event finance access denied' }, 403);
  }
  const { data: payments, error } = await admin.from('payments').select('id,reference,amount,created_at,payment_method,payment_type,status,is_test,metadata').order('reference', { ascending: true }).eq('event_id', eventId);
  if (error) return json({ error: 'Could not load event payments' }, 500);
  const refs = new Set<string>();
  const confirmationQuery = admin.from('calendar').select('organiser_settlement_confirmation').eq('id', eventId);
  const { data: calendarRows } = await confirmationQuery;
  for (const link of calendarRows?.[0]?.organiser_settlement_confirmation?.receipt_links || []) {
    if ((payments || []).some(p => p.id === link.payment_id) && /^T\d{10,}$/.test(link.reference || '')) refs.add(link.reference);
  }
  for (const payment of payments || []) {
    if (payment.is_test || payment.payment_type !== 'event_entry_fee') continue;
    const meta = metadata(payment.metadata);
    if (meta.is_test === true) continue;
    if (body.verify_all === true && payment.payment_method === 'paystack'
      && payment.reference && !/^MANUAL-ADMIN-/.test(payment.reference)) refs.add(payment.reference);
    if (!['success', 'refunded'].includes(payment.status)) continue;
    const text = `${meta.note || ''} ${meta.payment_note || ''}`;
    for (const ref of text.match(/\bT\d{10,}\b/g) || []) refs.add(ref);
    if (typeof meta.paystack_ref === 'string' && /^[a-zA-Z0-9._=-]{1,120}$/.test(meta.paystack_ref)) refs.add(meta.paystack_ref);
    if ((meta.marked_by_admin || meta.source === 'manual_event_admin') && /^T\d{10,}$/.test(payment.reference || '')) refs.add(payment.reference);
  }
  const allReferences = [...refs];
  const offset = body.verify_all === true ? Number(body.offset || 0) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0) return json({ error: 'Invalid receipt batch' }, 400);
  const references = body.verify_all === true ? allReferences.slice(offset, offset + 40) : allReferences;
  if (references.length > 60) return json({ error: 'Too many external references; review this event' }, 400);
  if (!refs.size && !(body.discover_missing === true && internalService)) return json({ event_id: eventId, receipts: [], unresolved: [], candidates: [], verified_at: new Date().toISOString() });
  const secret = Deno.env.get('PAYSTACK_SECRET_KEY') || '';
  if (!secret) return json({ error: 'Paystack receipt verification is unavailable' }, 503);
  const receipts: Record<string, unknown>[] = [];
  const reversals: Record<string, unknown>[] = [];
  const gatewayRefunds: Record<string, unknown>[] = [];
  const nonReceipts: Record<string, unknown>[] = [];
  const unresolved: Record<string, unknown>[] = [];
  for (let offset = 0; offset < references.length; offset += 5) {
    await Promise.all(references.slice(offset, offset + 5).map(async reference => {
      try {
        const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
          headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12000),
        });
        const payload = await response.json();
        const charge = payload?.data;
        const amount = Number(charge?.amount) / 100;
        if (response.ok && payload.status === true && ['failed', 'abandoned', 'ongoing', 'pending', 'processing', 'queued'].includes(charge?.status)) {
          nonReceipts.push({ reference, status: charge.status });
          return;
        }
        if (!response.ok && response.status < 500 && payload?.message === 'Transaction reference not found.') {
          nonReceipts.push({ reference, status: 'not_found' });
          return;
        }
        if (response.ok && payload.status === true && charge?.status === 'reversed'
          && charge.reference === reference && charge.id != null && charge.domain === 'live'
          && charge.currency === 'ZAR' && Number.isFinite(amount) && amount > 0) {
          reversals.push({ reference, provider_charge_id: String(charge.id), amount, currency: 'ZAR', status: 'reversed', verified: true });
          // Paystack also marks partially refunded transactions as reversed.
          // Read refund amounts; never infer that the entire charge was returned.
          {
            const refundResponse = await fetch(`https://api.paystack.co/refund?transaction=${encodeURIComponent(String(charge.id))}&perPage=100`, {
              headers: { Authorization: `Bearer ${secret}` }, signal: AbortSignal.timeout(12000),
            });
            const refundPayload = await refundResponse.json();
            if (!refundResponse.ok || refundPayload.status !== true || !Array.isArray(refundPayload.data) || refundPayload.data.length >= 100) {
              unresolved.push({ reference, reason: 'Refund amounts could not be completely verified' });
            } else for (const refund of refundPayload.data) {
              if (String(refund.transaction?.id ?? refund.transaction) !== String(charge.id) || refund.domain !== 'live' || refund.currency !== 'ZAR') continue;
              gatewayRefunds.push({ reference, provider_charge_id: String(charge.id), refund_id: String(refund.id),
                amount: Number(refund.amount) / 100, currency: 'ZAR', status: refund.status, refunded_at: refund.refunded_at || refund.createdAt });
            }
          }
          return;
        }
        if (!response.ok || payload?.status !== true || !['success', 'refunded'].includes(charge?.status)
          || charge?.reference !== reference || charge?.id == null || charge?.domain !== 'live'
          || charge?.currency !== 'ZAR' || !Number.isFinite(amount) || amount <= 0) {
          unresolved.push({ reference, reason: 'No successful live ZAR receipt verified', gateway_status: charge?.status || null });
          return;
        }
        receipts.push({ reference, provider_charge_id: String(charge.id), amount, currency: 'ZAR',
          status: charge.status, paid_at: charge.paid_at || charge.created_at, is_test: false,
          verified: true, payer_email: charge.customer?.email || null });
      } catch {
        unresolved.push({ reference, reason: 'Paystack verification could not complete' });
      }
    }));
  }
  // Optional audit aid: locate possible missing references for admin entries
  // explicitly recorded as Paystack. Candidates are never credited automatically.
  const candidates: Record<string, unknown>[] = [];
  if (body.discover_missing === true && internalService) {
    const known = new Set((payments || []).map(p => p.reference));
    const missing = (payments || []).filter(p => {
      const meta = metadata(p.metadata);
      return !p.is_test && !meta.is_test && p.status === 'success' && p.payment_type === 'event_entry_fee'
        && (p.payment_method === 'paystack' || body.discover_all_admin === true) && /^MANUAL-ADMIN-/.test(p.reference || '')
        && Number(p.amount) > 0 && meta.email && (body.discover_all_admin === true || !/\b(?:T\d{10,}|REGEV-[\w-]+)\b/.test(`${meta.note || ''} ${meta.payment_note || ''}`));
    }).slice(0, 30);
    for (const payment of missing) {
      const meta = metadata(payment.metadata);
      try {
        const headers = { Authorization: `Bearer ${secret}` };
        const customerResponse = await fetch(`https://api.paystack.co/customer/${encodeURIComponent(meta.email)}`, { headers, signal: AbortSignal.timeout(12000) });
        const customer = await customerResponse.json();
        if (!customerResponse.ok || customer.status !== true || !customer.data?.id) continue;
        const since = new Date(new Date(payment.created_at).getTime() - 60 * 86400000).toISOString();
        const params = new URLSearchParams({ customer: String(customer.data.id), from: since, status: 'success', perPage: '100' });
        const response = await fetch(`https://api.paystack.co/transaction?${params}`, { headers, signal: AbortSignal.timeout(12000) });
        const transactions = await response.json();
        for (const charge of response.ok && transactions.status === true && Array.isArray(transactions.data) ? transactions.data : []) {
          if (charge.domain !== 'live' || charge.status !== 'success' || charge.currency !== 'ZAR' || known.has(charge.reference)) continue;
          const chargeMeta = metadata(charge.metadata);
          if (chargeMeta.event_id != null && Number(chargeMeta.event_id) !== eventId) continue;
          if (Number(charge.amount) / 100 !== Number(payment.amount)) continue;
          candidates.push({ registration_id: meta.registration_id, recorded_reference: payment.reference,
            reference: charge.reference, provider_charge_id: String(charge.id), amount: Number(charge.amount) / 100,
            status: charge.status, paid_at: charge.paid_at || charge.created_at,
            payer_email: charge.customer?.email, event_metadata: { event_id: metadata(charge.metadata).event_id, event_name: metadata(charge.metadata).event_name } });
        }
      } catch { /* An audit candidate is optional; missing references remain unresolved. */ }
    }
  }
  return json({ event_id: eventId, receipts, reversals, gateway_refunds: gatewayRefunds, non_receipts: nonReceipts, unresolved, candidates,
    total_references: allReferences.length,
    next_offset: offset + references.length < allReferences.length ? offset + references.length : null,
    verified_at: new Date().toISOString() });
}

Deno.serve(handleEventCashReceipts);
