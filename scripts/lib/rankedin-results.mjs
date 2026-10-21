export function pointsDetailsUrl(participant, age, all = false, skip = 0) {
    if (!/^[1-9]\d*$/.test(String(participant)) || !Number.isInteger(Number(age)) || Number(age) <= 0) throw new Error('Missing ranking participant identity');
    return `https://api.rankedin.com/v1/ranking/getparticipantpointsdetailsasync?id=${participant}&agegroup=${age}&weekfromnow=0&showAll=${all}&language=en&skip=${skip}&take=100`;
}

export async function fetchCountedResults(participant, age, fetchImpl = fetch) {
    const details = [];
    for (let skip = 0; ; skip += 100) {
        const response = await fetchImpl(pointsDetailsUrl(participant, age, false, skip), { signal: AbortSignal.timeout(20000) });
        if (!response.ok) throw new Error(`Points service returned ${response.status}`);
        const json = await response.json();
        const page = json?.ParticipantWithPoints?.EventPoints?.Payload;
        if (!Array.isArray(page)) throw new Error('Malformed points breakdown');
        details.push(...page.map(ep => ({
            date: ep.EventPoint?.Date || '',
            name: ep.EventName || ep.EventPoint?.EventName?.split('|')[0]?.trim() || '',
            class: ep.EventPoint?.EventName?.split('| Class:')[1]?.trim() || '',
            place: ep.EventPoint?.Standing || '',
            event_type: ep.EventPoint?.EventType === 4 ? 'tournament' : ep.EventPoint?.EventType === 3 ? 'Team league' : 'friendly',
            points: Number(ep.EventPoint?.Points || 0),
        })));
        if (page.length < 100) return details;
    }
}

export function findResultRanking(rankings, { orgId, orgName, age, type, ageLabel }) {
    return (Array.isArray(rankings) ? rankings : []).find(row =>
        (Number(row.ranking_id) === orgId || row.org === orgName) &&
        (Number(row.age_group_id) === age || row.age_group === ageLabel) &&
        (row.ranking_type == null || Number(row.ranking_type) === type));
}

export function needsResultsRefresh(previous, hit, now = Date.now()) {
    const participant = hit.Participant?.Id || hit.ParticipantPoints?.RankingParticipantId;
    return !previous || String(previous.ranking_participant_id) !== String(participant) ||
        Number(previous.points) !== Math.round(Number(hit.ParticipantPoints?.Points || 0)) ||
        previous.ranking_date !== (hit.ParticipantPoints?.RankingDate || null) ||
        !Array.isArray(previous.details) ||
        !Number.isFinite(Date.parse(previous.results_synced_at || previous.synced_at)) ||
        now - Date.parse(previous.results_synced_at || previous.synced_at) >= 6 * 3600000;
}

export function mergeResultRanking(rankings, previous, snapshot) {
    const rows = Array.isArray(rankings) ? [...rankings] : [];
    const index = rows.indexOf(previous);
    if (index >= 0) rows[index] = snapshot;
    else rows.push(snapshot);
    return rows;
}
