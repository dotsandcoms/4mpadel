import type { Division, PublicEntry } from './events';
import { resolvePlayerRanking } from './website/player-ranking-selection';
export type RankedPlayer = { id?: string | number; name: string; image_url?: string | null; rankedin_id?: string | null; points?: number | null; [key: string]: unknown };
export type TeamPlayer = { id: string | null; name: string; image: string | null; points: number };
export type EventTeam = { id: string; players: TeamPlayer[]; total: number; seed: number | null };
export type TeamDivision = { division: Division; teams: EventTeam[] };
/** EventDetails.jsx's manual participants: combine mirrored partner entries only within a division. */
export function buildEventTeams(divisions: Division[], entries: PublicEntry[], profiles: RankedPlayer[]): TeamDivision[] {
  const profileMap = new Map<string, RankedPlayer>();
  const ambiguousNames = new Set<string>();
  for (const profile of profiles) {
    const key = profile.name.toLowerCase().trim();
    if (profileMap.has(key)) ambiguousNames.add(key);
    else profileMap.set(key, profile);
  }
  return divisions.map(division => {
    const rows = entries.filter(e => e.status !== 'withdrawn' && (e.division_id === division.id || e.division?.toLowerCase() === division.name.toLowerCase()));
    const hashes = new Set(rows.map(e => e.email_hash?.toLowerCase()).filter(Boolean));
    const seen = new Set<string>();
    const teams: EventTeam[] = [];
    for (const row of rows) {
      if (seen.has(row.full_name.toLowerCase())) continue;
      const names = [row.full_name];
      if (row.partner_name && (!row.partner_email_hash || hashes.has(row.partner_email_hash.toLowerCase()))) names.push(row.partner_name);
      const players = names.map(name => {
        seen.add(name.toLowerCase());
        const profile = profileMap.get(name.toLowerCase().trim());
        return { id: profile?.id && !ambiguousNames.has(name.toLowerCase().trim()) ? String(profile.id) : null, name, image: profile?.image_url || null, points: resolvePlayerRanking(profile, division.seeding_ranking_source || 'active').points || 0 };
      });
      teams.push({ id: row.id, players, total: players.reduce((sum, p) => sum + p.points, 0), seed: null });
    }
    teams.sort((a, b) => b.total - a.total);
    teams.forEach((team, index) => { if (team.total > 0) team.seed = index + 1; });
    return { division, teams };
  });
}
