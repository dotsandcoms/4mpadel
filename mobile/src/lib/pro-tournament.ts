import type { ProCategory } from '@/lib/pro-padel';
import type { MatchDetails } from '@/lib/pro-padel-live';

export type TournamentMatchStatus = 'all' | 'live' | 'upcoming' | 'results';
export const tournamentMatchBucket = (row: MatchDetails): Exclude<TournamentMatchStatus, 'all'> =>
  ['live', 'ongoing'].includes(row.match.status) ? 'live' : row.match.status === 'scheduled' ? 'upcoming' : 'results';
export function tournamentMatchPending(row: MatchDetails): boolean {
  return tournamentMatchBucket(row) === 'upcoming' && row.match.teams.every(team => !team.length) && !row.match.score.length;
}
export const tournamentRoundKey = (row: MatchDetails) => `${row.draw || 'main'}:${row.match.round}`;
export function tournamentMatchDay(row: MatchDetails): string {
  const value = row.match.scheduledAt || row.match.playedAt || '';
  if (!value || !Number.isFinite(Date.parse(value))) return '';
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value));
}
export function tournamentRoundLabel(row: MatchDetails) {
  if (row.draw && row.draw !== 'main') return row.draw === 'qualy' ? 'Qualifying' : row.draw === 'group' ? 'Group stage' : 'Placement';
  return ({ 1: 'Final', 2: 'Semi-finals', 4: 'Quarter-finals' }[row.match.round] || (row.match.round > 0 ? `Round of ${row.match.round * 2}` : row.match.roundName || 'Round TBC'));
}
export function tournamentRounds(rows: MatchDetails[]) {
  const groups = new Map<string, MatchDetails[]>();
  for (const row of rows) { const key = tournamentRoundKey(row); groups.set(key, [...(groups.get(key) || []), row]); }
  const qualifying = [...groups.values()].filter(group => group[0].draw === 'qualy').sort((a, b) => b[0].match.round - a[0].match.round);
  return [...groups].map(([key, matches]) => {
    const first = matches[0];
    const days = [...new Set(matches.map(tournamentMatchDay).filter(Boolean))].sort();
    const qualifyingIndex = qualifying.findIndex(group => tournamentRoundKey(group[0]) === key);
    return { key, draw: first.draw || 'main', label: qualifyingIndex >= 0 ? `Qualifying ${qualifyingIndex + 1}` : tournamentRoundLabel(first),
      count: matches.length, days, round: first.match.round };
  }).sort((a, b) => (a.draw === 'qualy' ? 0 : 1) - (b.draw === 'qualy' ? 0 : 1) || b.round - a.round);
}
export function tournamentSummary(rows: MatchDetails[], category: ProCategory) {
  const selected = rows.filter(row => row.match.category === category);
  const main = selected.filter(row => !row.draw || row.draw === 'main');
  const pairs = new Set(main.flatMap(row => row.match.teams.filter(team => team.length === 2).map(team => team.map(player => player.id).sort((a, b) => a - b).join(':'))));
  const countries = new Set(selected.flatMap(row => row.match.teams.flat().map(player => player.nationality).filter(Boolean)));
  return { matches: selected.length, pairs: pairs.size, countries: countries.size,
    live: selected.filter(row => tournamentMatchBucket(row) === 'live').length,
    upcoming: selected.filter(row => tournamentMatchBucket(row) === 'upcoming').length,
    results: selected.filter(row => tournamentMatchBucket(row) === 'results').length };
}
export function filterTournamentMatches(rows: MatchDetails[], filters: { category: ProCategory; draw: string; round: string; status: TournamentMatchStatus; day: string }) {
  const priority = { live: 0, upcoming: 1, results: 2 };
  return rows.filter(row => row.match.category === filters.category && (row.draw || 'main') === filters.draw
    && (filters.round === 'all' || tournamentRoundKey(row) === filters.round)
    && (filters.status === 'all' || tournamentMatchBucket(row) === filters.status)
    && (filters.day === 'all' || tournamentMatchDay(row) === filters.day)).sort((a, b) => {
      const bucket = tournamentMatchBucket(a), other = tournamentMatchBucket(b);
      const time = (row: MatchDetails) => row.match.scheduledAt || row.match.playedAt || '9999';
      return priority[bucket] - priority[other] || (bucket === 'results' ? time(b).localeCompare(time(a)) : time(a).localeCompare(time(b))) || a.match.id - b.match.id;
    });
}
