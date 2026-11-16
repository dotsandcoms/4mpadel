import type { PublicPlayer, PublicRanking } from './players';
import { fetchPoints, fetchPointSnapshot, fetchTournamentWins, resolveResultIdentity, type PointResult, type RankingPlayer, type TrophyGroup } from './rankings';

export const trophyTiers = ['Major', 'Super Gold', 'Gold', 'Silver', 'Bronze', 'Other'];

export function trophySeason(now = new Date()): number {
  return Number(now.toLocaleDateString('en-ZA', { timeZone: 'Africa/Johannesburg', year: 'numeric' }));
}

/** Provider dates are DD/MM/YYYY; imported results may use ISO dates. */
export function seasonTrophies(groups: TrophyGroup[], season: number): TrophyGroup[] {
  const inSeason = (date: string) => {
    const parts = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:T.*)?$/.exec(date.trim());
    if (!parts && !iso) return false;
    const [year, month, day] = parts ? [Number(parts[3]), Number(parts[2]), Number(parts[1])] : [Number(iso![1]), Number(iso![2]), Number(iso![3])];
    const parsed = new Date(Date.UTC(year, month - 1, day));
    return year === season && parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day;
  };
  return groups.map(group => {
    const events = group.events.filter(event => inSeason(event.date));
    return { ...group, events, count: events.length };
  }).filter(group => group.count > 0).sort((a, z) => trophyTiers.indexOf(a.tier) - trophyTiers.indexOf(z.tier));
}

export function savedRankingResults(ranking: PublicRanking): PointResult[] {
  return (ranking.details || []).map(result => ({
    name: result.name || '', date: result.date || '', class: result.class || '',
    place: String(result.place ?? ''), points: Number(result.points || 0),
    event_type: result.event_type || 'Tournament',
  }));
}

/** A ranking participant ID identifies this player within this exact organisation. */
export async function fetchPlayerTournamentResults(ranking: PublicRanking, rankedinId?: string) {
  const { participant, age } = await resolveResultIdentity(ranking as Parameters<typeof resolveResultIdentity>[0], rankedinId);
  const [counted, all] = await Promise.all([
    fetchPoints(participant, age, false),
    fetchPoints(participant, age, true),
  ]);
  // RankedIn orders its counted results newest first. Keep that order so
  // Best 8 matches the source instead of moving recent lower-point events down.
  return { counted, all };
}

/** Keep the profile summary and saved ranking expansion on the same provider edition. */
export async function fetchPlayerRankingSnapshot(ranking: PublicRanking, rankedinId?: string): Promise<PublicRanking> {
  const { participant, age } = await resolveResultIdentity(ranking as Parameters<typeof resolveResultIdentity>[0], rankedinId);
  const snapshot = await fetchPointSnapshot(participant, age, false);
  return { ...ranking, ranking_participant_id: participant, age_group_id: age,
    points: snapshot.points ?? ranking.points, rank: snapshot.rank ?? ranking.rank, details: snapshot.results };
}

/** Reuse the ranking screen's tier matching and deduplication across organisations. */
export function fetchPlayerTrophies(player: PublicPlayer) {
  const source: RankingPlayer = {
    id: player.id, name: player.name, rankedinId: player.rankedin_id, participantId: '', rank: 0, points: 0, change: 0,
    profile: {
      id: player.id, name: player.name,
      rankings: player.rankings.map(ranking => ({ ...ranking, details: savedRankingResults(ranking) })),
    },
  };
  return fetchTournamentWins(source);
}
