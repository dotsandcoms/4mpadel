import { fetchAllRows } from './fetchAllRows.js';

const DEFAULT_SAPA_STATUSES = ['Silver', 'Gold', 'Super Gold', 'S Gold', 'Major'];
const EVENT_COLUMNS = 'id, event_name, sapa_status, start_date, end_date, registration_closes_at, rankedin_id, rankedin_url, entry_fee, category_fees, early_bird_fee, early_bird_ends_at, finance_managed, is_manual, allow_payments, slug, venue, venues, event_status, organisation_id, club_id, organiser_interim_payments, organiser_settlement_confirmation, organiser_name, organiser_email, organisations:organisation_id(id, name, slug), clubs:club_id(id, name, short_name, slug)';

export function loadFinanceOverviewEvents(client, { isEventManagementModule, showBronze, allowedEventIds = [] }) {
    return fetchAllRows(() => {
        let query = client.from('calendar').select(EVENT_COLUMNS);
        if (isEventManagementModule) {
            query = query.eq('finance_managed', true)
                .in('sapa_status', showBronze ? [...DEFAULT_SAPA_STATUSES, 'Bronze'] : DEFAULT_SAPA_STATUSES);
        }
        if (allowedEventIds.length) query = query.in('id', allowedEventIds);
        return query.order('start_date', { ascending: false }).order('id', { ascending: true });
    });
}

// Summaries are the only financial payload downloaded by the list. The worker
// batches one database snapshot and runs the shared report rules server-side.
export async function loadFinanceOverviewSummaries(client, eventIds, onBatch) {
    for (let offset = 0; offset < eventIds.length; offset += 5) {
        const ids = eventIds.slice(offset, offset + 5);
        const { data, error } = await client.functions.invoke('event-finance-summary', { body: { event_ids: ids } });
        if (error || data?.error) {
            let detail = data?.error;
            if (!detail && error?.context?.json) {
                try { detail = (await error.context.json())?.error; } catch { /* Network errors have no JSON response. */ }
            }
            throw new Error(detail || error?.message || 'Could not load event summaries');
        }
        if (!Array.isArray(data?.summaries) || data.summaries.length !== ids.length
            || new Set(data.summaries.map(row => Number(row.id))).size !== ids.length
            || data.summaries.some(row => !ids.includes(Number(row.id)) || !validSummary(row))) {
            throw new Error('Incomplete event summaries. Please retry.');
        }
        onBatch(data.summaries);
    }
}

function validSummary({ stats, settlement }) {
    const numeric = value => typeof value === 'number' && Number.isFinite(value);
    return stats && settlement
        && ['entries', 'billed', 'collected', 'outstanding', 'paidCount', 'compedCount', 'uniquePlayersCount'].every(key => numeric(stats[key]))
        && ['full', 'temp', 'none'].every(key => numeric(stats.licenses?.[key]))
        && ['activeEntries', 'grossEntryFees', 'totalAmountBilled', 'pendingAmount', 'paid4M', 'paidClub', 'compedEntries',
            'commission', 'interimPaid', 'organiserRetained', 'entryFeesRefunded', 'dueToOrg'].every(key => numeric(settlement[key]))
        && Array.isArray(settlement.issues);
}
