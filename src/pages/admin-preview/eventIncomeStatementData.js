import { scopeCalendarQuery } from '../../utils/adminCalendarScope.js';
import { activeSettlementRegistrations, calculateEventSettlement, loadEventCashVerification } from '../../utils/eventSettlement.js';
import { buildFinanceAllocations, findFinancePayment, loadEventRefunds } from '../../utils/eventFinanceReconciliation.js';
import { buildEventIncomeWorkbookPayload, formatEventIncomePaymentStatus, getEventIncomePaymentDetails } from '../../utils/eventIncomeStatement.js';
import { formatRegistrationLicenseLabel } from '../../utils/registrationLicense.js';
import { resolveRegistrationDivision } from '../../utils/registrationDivision.js';
import { verifyEventOperationAccess } from './eventOperationAccess.js';

const normalEmail = value => String(value || '').trim().toLowerCase();

async function verifyStatementAccess({ client, session, scopeId, eventId, signal }) {
    const { user, event } = await verifyEventOperationAccess({ client, eventId, expectedUserId: session?.user?.id, scopeId, signal });
    const [active, role] = await Promise.all([
        client.rpc('account_is_active'),
        client.rpc('is_super_admin', { user_email: user.email }),
    ]);
    signal?.throwIfAborted();
    if (active.error || active.data !== true) throw new Error('An active account is required.');
    const platform = role.data === true && !role.error;
    if (!platform) {
        if (!scopeId?.startsWith('org:')) throw new Error('Authorised event finance access is required.');
        const { data, error } = await client.rpc('is_organisation_admin', { p_organisation_id: event.organisation_id });
        signal?.throwIfAborted();
        if (error || data !== true) throw new Error('Current organisation owner or admin access is required.');
    }
    if (!event.is_manual) throw new Error('Choose a directly managed event.');
    return { platform };
}

export async function loadEventIncomeStatement({ client, session, scopeId, eventId, signal }) {
    const { platform } = await verifyStatementAccess({ client, session, scopeId, eventId, signal });
    const id = Number(eventId);
    const [record, result] = await Promise.all([
        scopeCalendarQuery(client.from('calendar')
            .select('id,event_name,organiser_name,organiser_email,start_date,end_date,is_manual,organisation_id,club_id').eq('id', id), scopeId).single(),
        client.rpc('event_finance_overview_source', { p_event_ids: [id] }),
    ]);
    signal?.throwIfAborted();
    const data = result.data;
    if (record.error || Number(record.data?.id) !== id || !record.data.is_manual
        || result.error || !Array.isArray(data?.events) || data.events.length !== 1 || Number(data.events[0].id) !== id
        || ['registrations', 'payments', 'divisions'].some(key => !Array.isArray(data[key]))
        || ['registrations', 'payments', 'divisions'].some(key => data[key].some(row => Number(row.event_id) !== id))) {
        throw new Error('Current event finance records could not be verified.');
    }
    const event = { ...data.events[0], ...record.data };
    const { registrations, divisions, payments } = data;
    const refunds = await loadEventRefunds(client, registrations, payments);
    signal?.throwIfAborted();
    buildFinanceAllocations(registrations, payments, refunds);
    const settlement = calculateEventSettlement({ event, registrations, divisions, payments, refunds });
    return { platform, event, registrations, divisions, payments, refunds, settlement, licenses: data.licenses || [] };
}

export async function prepareEventIncomeWorkbook({ client, session, scopeId, eventId, signal, reportType }) {
    if (!['full', 'organiser'].includes(reportType)) throw new Error('Choose an event report.');
    const current = await loadEventIncomeStatement({ client, session, scopeId, eventId, signal });
    if (reportType === 'full' && !current.platform) throw new Error('Only platform super admins can download the full event report.');
    const { event, registrations, divisions, payments, refunds, licenses } = current;
    const verification = await loadEventCashVerification(client, event.id);
    signal?.throwIfAborted();
    if (!verification.complete) throw new Error('Payment verification is incomplete. Refresh and try the export again.');
    const { platform } = await verifyStatementAccess({ client, session, scopeId, eventId, signal });
    if (reportType === 'full' && !platform) throw new Error('Only platform super admins can download the full event report.');
    const reportStats = calculateEventSettlement({ event, registrations, divisions, payments, refunds, verification });
    const refundByReg = new Map();
    for (const row of refunds) {
        const refund = refundByReg.get(row.event_registration_id) || { amount: 0, statuses: [], rows: [] };
        refund.amount += Number(row.amount || 0);
        refund.statuses.push(row.status);
        refund.rows.push(row);
        refundByReg.set(row.event_registration_id, refund);
    }
    const eligibility = new Map(licenses.filter(row => Number(row.event_id) === Number(event.id) && row.eligibility)
        .map(row => [normalEmail(row.identity), { event_license: row.eligibility }]));
    const uniquePlayers = new Set(activeSettlementRegistrations(registrations, divisions).map(row => normalEmail(row.email)).filter(Boolean)).size;
    const payload = buildEventIncomeWorkbookPayload({
        event, registrations, divisions, payments, refunds, reportStats, normalizedReportType: reportType,
        uniquePlayers, refundByReg,
        formatLicenseForExport: row => formatRegistrationLicenseLabel(row.email, event.id, eligibility.get(normalEmail(row.email)), payments),
        formatPaymentStatusForExport: row => formatEventIncomePaymentStatus(row, findFinancePayment(payments, row, refunds), registrations),
        getPaymentDetails: row => getEventIncomePaymentDetails(row, { registrations, payments, refunds, refundByReg }),
        divFee: row => Number(resolveRegistrationDivision(row, divisions)?.entry_fee ?? event.category_fees?.[row.division] ?? event.entry_fee ?? 0),
    });
    return { payload, data: { ...current, platform, settlement: reportStats } };
}
