const API = 'https://api.rankedin.com/v1';
const pendingByFetcher = new WeakMap();
const numericId = value => /^[1-9]\d*$/.test(String(value ?? ''));
const normalize = value => String(value || '').trim().toLowerCase();
export const resultRankingKey = row => [row?.org, row?.age_group, row?.match_type].map(normalize).join('|');

async function liveJson(path, fetchImpl) {
  let pending = pendingByFetcher.get(fetchImpl);
  if (!pending) { pending = new Map(); pendingByFetcher.set(fetchImpl, pending); }
  if (pending.has(path)) return pending.get(path);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  const request = Promise.resolve().then(() => fetchImpl(`${API}/${path}`, { signal: controller.signal, cache: 'no-store' }))
    .then(async response => {
      if (!response.ok) throw new Error(`RankedIn results returned ${response.status}`);
      return response.json();
    }).finally(() => { clearTimeout(timeout); pending.delete(path); });
  pending.set(path, request);
  return request;
}

/** Current published edition, with provider order and totals preserved. */
export async function fetchRankedinPointSnapshot(participant, age, all = false, fetchImpl = fetch) {
  if (!numericId(participant) || !numericId(age)) throw new Error('Results are not linked to this ranking.');
  const details = [];
  let points, rank;
  for (let skip = 0; ; skip += 100) {
    const data = await liveJson(`ranking/getparticipantpointsdetailsasync?id=${participant}&agegroup=${age}&weekfromnow=0&showAll=${all}&language=en&skip=${skip}&take=100`, fetchImpl);
    const player = data?.ParticipantWithPoints;
    if (player?.Participant?.Id != null && String(player.Participant.Id) !== String(participant)) throw new Error('Results belong to a different participant.');
    if (player?.ParticipantPoints?.AgeGroup != null && Number(player.ParticipantPoints.AgeGroup) !== Number(age)) throw new Error('Results belong to a different category.');
    const page = player?.EventPoints?.Payload;
    if (!Array.isArray(page)) throw new Error('Results are temporarily unavailable.');
    if (skip === 0) {
      if (player?.ParticipantPoints?.Points != null && Number.isFinite(Number(player.ParticipantPoints.Points))) points = Number(player.ParticipantPoints.Points);
      if (Number(player?.ParticipantPoints?.Standing) > 0) rank = Number(player.ParticipantPoints.Standing);
    }
    details.push(...page.map(ep => ({
      date: ep.EventPoint?.Date || '',
      name: ep.EventName || ep.EventPoint?.EventName?.split('|')[0]?.trim() || '',
      class: ep.EventPoint?.EventName?.split('| Class:')[1]?.trim() || '',
      place: ep.EventPoint?.Standing || '',
      event_type: ep.EventPoint?.EventType === 3 ? 'team league' : 'tournament',
      points: Number(ep.EventPoint?.Points || 0),
      eventId: String(ep.EventUrl || '').match(/\/tournament\/(\d+)(?:\/|$)/)?.[1],
    })));
    if (page.length < 100) return { details, points, rank };
  }
}

export async function resolveResultIdentity(ranking, rankedinId, fetchImpl = fetch) {
  const age = Number(ranking.age_group_id);
  if (!numericId(age)) throw new Error('Results are not linked to this category.');
  if (numericId(ranking.ranking_participant_id)) return { participant: String(ranking.ranking_participant_id), age };
  const org = ranking.ranking_id || { 'sapa ranking': 15809, 'broll pro tour': 16317, 'sa grand tour': 16482 }[normalize(ranking.org)];
  if (!org || !rankedinId) throw new Error('Results are not linked to this ranking.');
  const type = ranking.ranking_type || (/women|ladies/i.test(ranking.age_group || '') ? 4 : 3);
  for (let skip = 0; ; skip += 1000) {
    const data = await liveJson(`Ranking/GetRankingsAsync?rankingId=${org}&rankingType=${type}&ageGroup=${age}&weekFromNow=0&language=en&skip=${skip}&take=1000`, fetchImpl);
    if (!Array.isArray(data?.Payload)) throw new Error('Rankings are temporarily unavailable.');
    const row = data.Payload.find(item => String(item.RankedinId) === String(rankedinId));
    const participant = row?.Participant?.Id || row?.ParticipantPoints?.RankingParticipantId;
    if (numericId(participant)) return { participant: String(participant), age };
    if (data.Payload.length < 1000) break;
  }
  throw new Error('Results are not linked to this player.');
}

export async function refreshResultRanking(ranking, rankedinId, all = false, fetchImpl = fetch) {
  const identity = await resolveResultIdentity(ranking, rankedinId, fetchImpl);
  const snapshot = await fetchRankedinPointSnapshot(identity.participant, identity.age, all, fetchImpl);
  return { ...ranking, ranking_participant_id: identity.participant, age_group_id: identity.age,
    points: snapshot.points ?? ranking.points, rank: snapshot.rank ?? ranking.rank, details: snapshot.details };
}

export async function fetchTrophyHistories(rankings, rankedinId, fetchImpl = fetch) {
  return Promise.all((rankings || []).map(row => {
    if (!row.ranking_participant_id && !(rankedinId && row.age_group_id)) return row;
    return refreshResultRanking(row, rankedinId, true, fetchImpl);
  }));
}

export function countTournamentWins(rankings, calendar) {
  const wins = new Map();
  for (const ranking of rankings || []) for (const result of ranking.details || []) {
    if (String(result.place) !== '1' || normalize(result.event_type) === 'team league') continue;
    const key = result.eventId ? `event:${result.eventId}` : `${result.date}-${normalize(result.name)}`;
    if (!wins.has(key)) wins.set(key, result);
  }
  const counts = { Major: 0, 'Super Gold': 0, Gold: 0, Silver: 0, Bronze: 0, Other: 0 };
  const tierOf = value => {
    if (String(value).toUpperCase() === 'S GOLD') return 'Super Gold';
    return Object.keys(counts).find(tier => tier !== 'Other' && String(value).toUpperCase().includes(tier.toUpperCase()));
  };
  for (const result of wins.values()) {
    const byId = result.eventId ? calendar.filter(row => String(row.rankedin_id) === result.eventId) : [];
    const matching = byId.length ? byId : calendar.filter(row => normalize(row.event_name) === normalize(result.name));
    const tier = matching.map(row => tierOf(row.sapa_status)).find(Boolean) || tierOf(result.name) || 'Other';
    counts[tier]++;
  }
  return Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
}
