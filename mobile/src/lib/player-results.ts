import type { PublicPlayer, PublicRanking } from './players';
import { fetchPoints, fetchPointSnapshot, fetchTournamentWins, resolveResultIdentity, type PointResult, type RankingPlayer } from './rankings';

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
