export function drawProgression(matches = [], entries = []) {
    const byKey = new Map(matches.flatMap(m => [m.id, m.key].filter(Boolean).map(key => [key, m])));
    const entryMap = new Map(entries.map(e => [e.id, e]));
    const number = new Map(matches.map((m, i) => [m, i + 1]));
    const terminal = m => ['completed', 'walkover', 'retired', 'cancelled'].includes(m.status);
    function slot(m, index, seen = new Set()) {
        const entry = m[index === 0 ? 'entry_one' : 'entry_two'] || entryMap.get(m[index === 0 ? 'entry_one_id' : 'entry_two_id']);
        if (entry) return { label: entry.team_name, candidates: [entry], confirmed: true };
        const source = m.source_slots?.[index];
        const feeder = byKey.get(source?.source_match_key) || matches.find(f => ['winner', 'loser'].some(route => f[`${route}_to_match_id`] === m.id && m.id && Number(f[`${route}_to_slot`]) === index + 1));
        const loser = source?.type === 'loser' || (feeder?.loser_to_match_id === m.id && m.id && Number(feeder?.loser_to_slot) === index + 1);
        if (!feeder || seen.has(feeder)) return { label: source?.type === 'entry' || (terminal(m) && m.result_type === 'walkover') ? 'Bye' : 'Opponent to be confirmed', candidates: [], confirmed: false };
        const next = new Set(seen).add(feeder);
        if (terminal(feeder)) {
            const id = feeder[loser ? 'loser_entry_id' : 'winner_entry_id'];
            const resolved = entryMap.get(id) || (!loser ? feeder.winner : null);
            if (resolved) return { label: resolved.team_name, candidates: [resolved], confirmed: true };
            return { label: 'Bye', candidates: [], confirmed: false };
        }
        const sides = [slot(feeder, 0, next), slot(feeder, 1, next)];
        const candidates = [...new Map(sides.flatMap(s => s.candidates).map(e => [e.id || e.team_name, e])).values()];
        return { label: `${loser ? 'Loser' : 'Winner'} of ${sides.every(s => s.confirmed) ? sides.map(s => s.label).join(' vs ') : `M${number.get(feeder)} (${feeder.round_label || 'previous round'})`}`, candidates, confirmed: false };
    }
    return matches.map(m => ({ match: m, number: number.get(m), sides: [slot(m, 0), slot(m, 1)], complete: terminal(m) }));
}

export function progressionTime(match) {
    if (!match.scheduled_start) return 'Time to be confirmed';
    const date = new Date(match.scheduled_start);
    return Number.isNaN(date.getTime()) ? 'Time to be confirmed' : date.toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) + ' SAST';
}
