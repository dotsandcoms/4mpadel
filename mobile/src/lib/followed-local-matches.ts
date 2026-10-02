import { fetchPlayerMatches, parseMatchDate, type PlayerMatch } from '@/lib/matches';
import type { HubPlayer } from '@/lib/player-hub';

export type FollowedLocalMatch = { key: string; match: PlayerMatch; players: HubPlayer[] };
function fixtureKey(match: PlayerMatch) {
  const info = match.Info || {};
  const side = (names: (string | null | undefined)[]) => names.map(n => n?.trim().toLowerCase() || '').sort().join('|');
  const teams = [side([info.Challenger?.Name, info.Challenger1?.Name]), side([info.Challenged?.Name, info.Challenged1?.Name])].sort();
  return JSON.stringify([info.EventName, parseMatchDate(info.Date).getTime(), teams, info.Court || '']);
}
export function mergeFollowedFixtures(rows: { player: HubPlayer; matches: PlayerMatch[] }[]): FollowedLocalMatch[] {
  const merged = new Map<string, FollowedLocalMatch>();
  for (const { player, matches } of rows) for (const match of matches) {
    const key = fixtureKey(match);
    const existing = merged.get(key);
    if (existing) { if (!existing.players.some(p => p.key === player.key)) existing.players.push(player); }
    else merged.set(key, { key, match, players: [player] });
  }
  return [...merged.values()].sort((a, b) => parseMatchDate(a.match.Info?.Date).getTime() - parseMatchDate(b.match.Info?.Date).getTime());
}
export async function fetchFollowedLocalFixtures(players: HubPlayer[]) {
  const linked = players.filter(p => p.source === '4m' && p.rankedinId);
  const rows: { player: HubPlayer; matches: PlayerMatch[] }[] = [];
  let failed = 0, cursor = 0;
  // Bound requests when an account follows many players.
  await Promise.all(Array.from({ length: Math.min(3, linked.length) }, async () => {
    while (cursor < linked.length) {
      const player = linked[cursor++];
      try {
        const data = await fetchPlayerMatches(player.rankedinId, { requireUpcoming: true });
        rows.push({ player, matches: data.upcoming });
      } catch { failed++; }
    }
  }));
  return { fixtures: mergeFollowedFixtures(rows), failed, unlinked: players.filter(p => !p.rankedinId).length };
}
