import { hasVerifiedPaymentEntryTransfers, normalizePaymentMetadata } from './paymentRegistrationMatch.js';

const normalize = (value) => String(value || '').trim().toLowerCase();

export const addPublicPlayerPaymentStatuses = (participants, registrations, division, { isWeekly = false } = {}) => {
    const rows = (registrations || []).filter((row) => {
        if (normalize(row.status) === 'withdrawn') return false;
        if (isWeekly) return true;
        if (row.division_id != null && division.Id != null) return String(row.division_id) === String(division.Id);
        return normalize(row.division) === normalize(division.Name);
    });
    const byId = new Map(rows.map((row) => [String(row.id), row]));
    const byHash = new Map();
    const byName = new Map();
    for (const row of rows) {
        const hash = normalize(row.email_hash);
        const name = normalize(row.full_name);
        if (hash) byHash.set(hash, row);
        if (name) byName.set(name, [...(byName.get(name) || []), row]);
    }

    const paymentStatus = (player, isLocal) => {
        if (!player) return player;
        const hash = normalize(player.EmailHash);
        const id = player.RegistrationId;
        const matches = byName.get(normalize(player.Name)) || [];
        const row = id != null ? byId.get(String(id))
            : hash ? byHash.get(hash)
                : matches.length === 1 ? matches[0] : null;
        const status = row ? normalize(row.payment_status) || 'pending' : isLocal ? 'pending' : null;
        return { ...player, PaymentStatus: status };
    };

    return (participants || []).map((item) => {
        const participant = item.Participant || {};
        const isLocal = String(participant.Id || '').startsWith('local_');
        return {
            ...item,
            Participant: {
                ...participant,
                ...(participant.Players ? { Players: participant.Players.map((player) => paymentStatus(player, isLocal)) } : {}),
                ...(participant.FirstPlayer ? { FirstPlayer: paymentStatus(participant.FirstPlayer, isLocal) } : {}),
                ...(participant.SecondPlayer ? { SecondPlayer: paymentStatus(participant.SecondPlayer, isLocal) } : {}),
            },
        };
    });
};

export const publicPlayerPaymentLabel = (status) => status == null ? null
    : status === 'paid' ? 'Paid & Confirmed' : 'Payment Pending';


export function directPaidDivisions(payments, { playerId, email, name, matchesName }) {
    const divisions = new Set();
    for (const payment of payments || []) {
        // Once a roster slot is transferred, the live registration owns its status.
        // The receipt still describes the person and division at the time of purchase.
        if (hasVerifiedPaymentEntryTransfers(payment)) continue;
        const metadata = normalizePaymentMetadata(payment.metadata);
        const entries = Array.isArray(metadata.line_items)
            ? metadata.line_items.filter(item => item?.type === 'entry_fee' || item?.type === 'entry')
            : [];
        if (!(playerId && payment.player_id === playerId) && !(email && normalize(metadata.email) === normalize(email))
            && !(name && entries.some(item => matchesName(name, normalize(item.player))))) continue;
        for (const division of [metadata.division, ...entries.map(item => item.division)]) {
            if (division && String(division).trim()) divisions.add(String(division).trim());
        }
    }
    return [...divisions];
}
