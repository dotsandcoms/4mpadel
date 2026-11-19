import { calculateEventSettlement, eventPayoutRequestLimit, loadEventCashVerification } from '../../utils/eventSettlement.js';
import { fetchAllRows } from '../../utils/fetchAllRows.js';
import { organisationBanking } from '../../utils/organisationBanking.js';

const PAYOUT_ADMIN_EMAIL = 'markstillerman@gmail.com';
const accountRoles = ['owner', 'admin'];
export function payoutScope(session, permissions, scopeId) {
  if (!session?.user?.id) return null;
  const platform = permissions?.role === 'super_admin';
  const organisationId = scopeId?.startsWith('org:') ? scopeId.slice(4) : '';
  const authorised = permissions?.orgs?.find(org => org.id === organisationId && accountRoles.includes(org.member_role));
  if (organisationId && (authorised || platform)) return { platform, organisationId, organisation: authorised };
  return platform && scopeId === 'all' ? { platform } : null;
}

export async function verifyPayoutIdentity(client, session, signal) {
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  if (!session?.user?.id || auth.error || auth.data?.user?.id !== session.user.id) throw new Error('Sign in again to manage payouts.');
}

export async function loadPayoutWorkspace(client, session, organisationId, signal) {
  await verifyPayoutIdentity(client, session, signal);
  // The banking RPC validates the current session and the organisation's owner/admin role.
  const banking = await organisationBanking('summary', organisationId, {}, client);
  signal?.throwIfAborted();
  if (typeof banking?.saved !== 'boolean') throw new Error('Banking access could not be verified.');
  const [requests, events] = await Promise.all([
    organisationBanking('list', organisationId, {}, client),
    fetchAllRows(() => {
      signal?.throwIfAborted();
      return client.from('calendar').select('id, event_name, start_date')
        .eq('organisation_id', organisationId).eq('is_manual', true).order('start_date', { ascending: false }).order('id');
    }),
  ]);
  signal?.throwIfAborted();
  if (!Array.isArray(requests?.requests)) throw new Error('Payout requests could not be verified.');
  return { banking, requests: requests.requests, canProcess: requests.can_process === true, events };
}

export async function loadPayoutSettlement(client, organisationId, eventId, signal) {
  const id = Number(eventId);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Select an event.');
  const eventPromise = client.from('calendar')
    .select('id, organisation_id, is_manual, event_name, start_date, end_date, entry_fee, category_fees, early_bird_fee, early_bird_ends_at, organiser_interim_payments, organiser_settlement_confirmation')
    .eq('organisation_id', organisationId).eq('is_manual', true).eq('id', id).single();
  const { data: event, error: eventError } = await eventPromise;
  signal?.throwIfAborted();
  if (eventError || !event || event.organisation_id !== organisationId || Number(event.id) !== id) throw new Error('This event is unavailable for this organisation.');
  const { data: recorded, error } = await client.rpc('event_finance_overview_source', { p_event_ids: [id] });
  signal?.throwIfAborted();
  if (error || recorded?.events?.length !== 1 || Number(recorded.events[0].id) !== id
      || ['registrations', 'payments', 'divisions', 'refunds'].some(key => !Array.isArray(recorded[key]))) {
    throw new Error('Current event finances could not be verified.');
  }
  const verification = await loadEventCashVerification(client, id);
  signal?.throwIfAborted();
  if (!verification.complete) throw new Error('Paystack verification is incomplete. Refresh before requesting a payout.');
  const settlement = calculateEventSettlement({ ...recorded, event, verification });
  return { event, settlement, rules: eventPayoutRequestLimit(event, settlement) };
}

async function updateRecordedPayout(client, session, organisationId, action, signal) {
  const auth = await client.auth.getUser();
  signal?.throwIfAborted();
  const user = auth.data?.user;
  if (auth.error || !user?.email || user.id !== session.user.id) throw new Error('Sign in again to edit recorded payouts.');
  const access = await client.rpc('is_super_admin', { user_email: user.email });
  signal?.throwIfAborted();
  if (access.error || access.data !== true) throw new Error('Platform super-admin access is required to edit recorded payouts.');

  const { eventId } = action.input;
  const { data: event, error } = await client.from('calendar').select('organiser_interim_payments')
    .eq('organisation_id', organisationId).eq('id', eventId).maybeSingle();
  signal?.throwIfAborted();
  if (error || !event) throw new Error('The selected event payout history is unavailable.');
  const original = event.organiser_interim_payments;
  if (original !== null && !Array.isArray(original)) throw new Error('The event payout history needs review.');
  const rows = original || [];
  let next, row;
  if (action.kind === 'record_interim') {
    const { amount, paidAt, note } = action.input;
    if (!Number.isFinite(amount) || amount <= 0 || Math.round(amount * 100) / 100 !== amount || !/^\d{4}-\d{2}-\d{2}$/.test(paidAt)) {
      throw new Error('Enter a valid amount and payment date.');
    }
    row = { id: crypto.randomUUID(), amount, paid_at: paidAt, note: note.trim() || null, created_at: new Date().toISOString() };
    next = [...rows, row].sort((a,b) => String(a.paid_at || '').localeCompare(String(b.paid_at || '')));
  } else {
    row = rows.find(item => item.id === action.input.recordId);
    if (!row || row.request_id || String(row.note || '').startsWith('Manual payout request ')) {
      throw new Error('This record is unavailable or linked to a processed payout request.');
    }
    next = rows.filter(item => item.id !== row.id);
  }
  await verifyPayoutIdentity(client, session, signal);
  let query = client.from('calendar').update({ organiser_interim_payments: next }).eq('organisation_id', organisationId).eq('id', eventId);
  query = original == null ? query.is('organiser_interim_payments', null) : query.eq('organiser_interim_payments', JSON.stringify(original));
  const saved = await query.select('organiser_interim_payments').maybeSingle();
  if (saved.error || !saved.data) throw new Error('Payout history changed. Refresh before retrying.');
  if (!signal?.aborted) {
    try {
      await client.rpc('log_event_activity', {
        p_event_id: Number(eventId), p_category: 'FINANCE', p_actor_role: 'ADMIN',
        p_action: action.kind === 'record_interim' ? 'interim_payment_added' : 'interim_payment_removed',
        p_summary: `${action.kind === 'record_interim' ? 'Recorded' : 'Removed'} interim payment of R ${Number(row.amount).toFixed(2)}`,
        p_details: row,
      });
    } catch { /* The payout history is already saved. */ }
  }
  return saved.data;
}

export async function submitPayoutAction(client, session, organisationId, action, signal) {
  await verifyPayoutIdentity(client, session, signal);
  if (['record_interim', 'remove_interim'].includes(action.kind)) return updateRecordedPayout(client, session, organisationId, action, signal);
  if (action.kind !== 'request') {
    if (!['save','remove','reveal','resolve'].includes(action.kind)) throw new Error('Choose a supported payout action.');
    return await organisationBanking(action.kind, organisationId, action.input, client);
  }
  const { event_id: eventId, amount } = action.input;
  const { rules, settlement } = await loadPayoutSettlement(client, organisationId, eventId, signal);
  if (!rules.canRequest || !Number.isFinite(amount) || amount > rules.maxRequestable || amount <= 0) {
    throw new Error(rules.blockedReason || 'The available payout changed. Review the updated event balance.');
  }
  await verifyPayoutIdentity(client, session, signal);
  const saved = await organisationBanking('request', organisationId, action.input, client);
  if (!saved?.request_id) throw new Error('Payout submission was not confirmed. Refresh requests before retrying.');
  let notified = false;
  try {
    await verifyPayoutIdentity(client, session, signal);
    const response = await client.functions.invoke('send-email', {
      body: { to: PAYOUT_ADMIN_EMAIL, template: 'organiser_payout_request', variables: { payoutRequestId: saved.request_id } },
    });
    notified = !response.error && !response.data?.error;
    await client.rpc('log_event_activity', {
      p_event_id: Number(eventId), p_action: 'payout_requested', p_category: 'FINANCE', p_actor_role: 'ADMIN',
      p_summary: `Payout requested: R ${amount.toFixed(2)} (${rules.phase === 'first' ? 'first request' : 'final balance'})`,
      p_details: { amountRequested: amount, maxRequestable: rules.maxRequestable, requestPhase: rules.phase, dueToOrganiser: settlement.dueToOrg },
    });
  } catch {
    // The request is already stored and is visible in the processing queue.
  }
  return { ...saved, notified };
}
