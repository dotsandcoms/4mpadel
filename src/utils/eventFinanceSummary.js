import { buildEventSettlements } from './eventSettlement.js';
import { resolveRegistrationLicenseCategory } from './registrationLicense.js';

const norm = value => String(value || '').trim().toLowerCase();
const SUMMARY_FIELDS = ['activeEntries', 'grossEntryFees', 'totalAmountBilled', 'pendingAmount',
    'paid4M', 'paidClub', 'compedEntries', 'commission', 'interimPaid', 'organiserRetained',
    'entryFeesRefunded', 'dueToOrg', 'issues'];

// Shared with the Edge Function via build-event-finance-summary.mjs. The list
// uses the exact report settlement rules, but never returns its player/receipt rows.
export function buildFinanceOverviewSummaries(source) {
    const { registrations = [], participants = [], payments = [], licenses = [] } = source;
    const eligibility = new Map(licenses.map(row => [`${row.event_id}:${row.identity}`, row.eligibility]));
    return buildEventSettlements(source).map(({ id, is_manual, settlement }) => {
        const rows = (is_manual ? registrations : participants).filter(row => Number(row.event_id) === Number(id)
            && (!is_manual || !['withdrawn', 'cancelled'].includes(row.status)));
        const eventPayments = payments.filter(row => Number(row.event_id) === Number(id));
        const counted = new Set();
        const counts = { full: 0, temp: 0, none: 0 };
        for (const row of rows) {
            const identity = is_manual ? norm(row.email) : row.profile_id || norm(row.full_name);
            if (!identity || counted.has(identity)) continue;
            counted.add(identity);
            const lic = is_manual || row.profile_id ? eligibility.get(`${id}:${identity}`) : null;
            const category = lic ? (lic.full ? 'full' : lic.temporary ? 'temp' : 'none')
                : is_manual ? resolveRegistrationLicenseCategory(row.email, id, null, eventPayments) : 'none';
            counts[category] += 1;
        }
        return { id,
            settlement: Object.fromEntries(SUMMARY_FIELDS.map(key => [key, settlement[key]])),
            stats: { entries: settlement.activeEntries, billed: settlement.totalAmountBilled,
                collected: settlement.grossEntryFees, outstanding: settlement.pendingAmount,
                paidCount: settlement.paid4M + settlement.paidClub, compedCount: settlement.compedEntries,
                uniquePlayersCount: counted.size, licenses: counts },
        };
    });
}
