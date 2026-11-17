import type { Division, PublicEntry } from './events';
import { resolveSapaMainRanking } from './sapa-main-ranking';
import { resolvePlayerRanking } from './website/player-ranking-selection';
export type RankedPlayer = { id?: string | number; name: string; image_url?: string | null; rankedin_id?: string | null; points?: number | null; rankings?: unknown; gender?: string | null; category?: string | null; [key: string]: unknown };
export type TeamPlayer = { id: string | null; name: string; image: string | null; points: number | null; rankingLabel?: string | null; paymentStatus?: string | null };
export type EventTeam = { id: string; players: TeamPlayer[]; total: number | null; seed: number | null };
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
    const seedingTotals = new Map<string, number | null>();
    const configuredSource = division.seeding_ranking_source;
    const customSeeding = !!configuredSource && configuredSource !== 'active';
    for (const row of rows) {
      if (seen.has(row.full_name.toLowerCase())) continue;
      const names = [row.full_name];
      if (row.partner_name && (!row.partner_email_hash || hashes.has(row.partner_email_hash.toLowerCase()))) names.push(row.partner_name);
      const players = names.map(name => {
        seen.add(name.toLowerCase());
        const profile = ambiguousNames.has(name.toLowerCase().trim()) ? undefined : profileMap.get(name.toLowerCase().trim());
        const main = resolveSapaMainRanking(profile);
        const counterparts = rows.filter(e => row.partner_email_hash ? e.email_hash?.toLowerCase() === row.partner_email_hash.toLowerCase() : e.full_name.toLowerCase().trim() === name.toLowerCase().trim());
        const registration = name === row.full_name ? row : counterparts.length === 1 ? counterparts[0] : null;
        return { id: profile?.id && !ambiguousNames.has(name.toLowerCase().trim()) ? String(profile.id) : null, name, image: profile?.image_url || null, points: main?.points ?? null, rankingLabel: main?.label ?? null, paymentStatus: registration?.payment_status ?? null };
      });
      const total = players.every(player => player.points != null) ? players.reduce((sum, player) => sum + player.points!, 0) : null;
      // A deliberately configured draw source still controls its seed order.
      // The visible individual/team figures always describe SAPA Main points.
      const seeding = customSeeding ? names.map(name => {
        const profile = ambiguousNames.has(name.toLowerCase().trim()) ? undefined : profileMap.get(name.toLowerCase().trim());
        if (!profile) return null;
        const ranking = resolvePlayerRanking(profile, configuredSource);
        return ranking.missing ? null : ranking.points;
      }) : players.map(player => player.points);
      seedingTotals.set(row.id, seeding.every(value => value != null) ? seeding.reduce<number>((sum, value) => sum + value!, 0) : null);
      teams.push({ id: row.id, players, total, seed: null });
    }
    teams.sort((a, b) => (seedingTotals.get(b.id) ?? -1) - (seedingTotals.get(a.id) ?? -1));
    teams.forEach((team, index) => { if ((seedingTotals.get(team.id) ?? 0) > 0) team.seed = index + 1; });
    return { division, teams };
  });
}
