import { normalizeRankedinMatchScore } from '../../src/utils/rankedinMatchScore.js';

const nameKey = value => String(value || '').trim().toLowerCase();
const sideIds = (first, second) => first != null && second != null ? [String(first), String(second)].sort().join('|') : null;
const matchMinute = value => {
    const raw = String(value || '');
    const local = raw.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}:\d{2})/);
    if (local) return `${local[3]}-${local[2]}-${local[1]}T${local[4]}`;
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw) && !raw.startsWith('0001-') ? raw.slice(0, 16) : null;
};
export function repairMatchScore(match, fixtures) {
    if (match.Score?.Score?.length) return match;
    const info = match.Info || {};
    const a = sideIds(info.Challenger?.Id, info.Challenger1?.Id);
    const b = sideIds(info.Challenged?.Id, info.Challenged1?.Id);
    if (!a || !b) return match;
    let candidates = fixtures.filter(f => f.MatchResult?.HasScore && f.MatchResult?.IsPlayed &&
        sideIds(f.Challenger?.Player1Id, f.Challenger?.Player2Id) === a &&
        sideIds(f.Challenged?.Player1Id, f.Challenged?.Player2Id) === b);
    // Only disambiguate rematches when both the scheduled minute and court agree.
    if (candidates.length > 1 && matchMinute(info.Date) && info.Court) {
        candidates = candidates.filter(f => matchMinute(f.Date) === matchMinute(info.Date) && f.Court === info.Court);
    }
    if (candidates.length !== 1) return match;
    const Score = normalizeRankedinMatchScore(candidates[0].MatchResult.Score);
    return Score.Score.length ? { ...match, Score } : match;
}

export function createHistoryRepair(events, fetchJson) {
    const requests = new Map();
    return async history => {
        let repaired = 0;
        const matches = [];
        for (const match of history || []) {
            if (match.Score?.Score?.length) { matches.push(match); continue; }
            const candidates = events.filter(e => e.rankedin_id && nameKey(e.event_name) === nameKey(match.Info?.EventName));
            if (candidates.length !== 1) { matches.push(match); continue; }
            const id = candidates[0].rankedin_id;
            if (!requests.has(id)) {
                requests.set(id, fetchJson(`https://api.rankedin.com/v1/tournament/GetMatchesSectionAsync?Id=${encodeURIComponent(id)}&LanguageCode=en&IsReadonly=true`)
                    .then(data => {
                        if (!Array.isArray(data.Matches)) throw new Error(`Invalid tournament matches: ${id}`);
                        return data.Matches;
                    }));
            }
            const updated = repairMatchScore(match, await requests.get(id));
            if (updated !== match) repaired++;
            matches.push(updated);
        }
        return { matches, repaired };
    };
}

export const isRealHistory = payload => Array.isArray(payload) && payload.length > 0 && payload.every(m => m?.Info?.EventName && m.Info.EventName !== 'EventName');
const fixtureKey = m => {
    const i = m.Info || {};
    return [i.EventName, i.Date, i.Challenger?.Name, i.Challenger1?.Name, i.Challenged?.Name, i.Challenged1?.Name].join('|');
};
export function preserveHistoryScores(live, saved) {
    if (!isRealHistory(live)) return saved || [];
    return live.map(match => {
        if (match.Score?.Score?.length) return match;
        const candidates = (saved || []).filter(old => fixtureKey(old) === fixtureKey(match));
        return candidates.length === 1 && candidates[0].Score?.Score?.length ? { ...match, Score: candidates[0].Score } : match;
    });
}
