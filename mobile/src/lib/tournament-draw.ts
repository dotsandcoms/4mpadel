import type { RankedPlayer } from './event-teams';

type Row = Record<string, any>;
export type DrawPerson = { name: string; id: string | null; photo: string | null; country: string | null };
export type DrawTeam = { players: DrawPerson[]; seed: string | null; placeholder: string | null };
export type DrawMatch = { id: string; round: number; order: number; one: DrawTeam; two: DrawTeam; start: string | null; court: string | null;
  status: string; completed: boolean; scores: number[][]; summary: boolean; winner: 1 | 2 | null };
export type DrawRound = { id: string; name: string; matches: DrawMatch[] };
export type DrawStanding = { id: string; position: number; team: DrawTeam; played: number; won: number; lost: number; points: number };
export type DrawSection = { id: string; name: string; kind: 'knockout' | 'group'; rounds: DrawRound[]; standings: DrawStanding[] };
export type DrawChoice = { id: string; classId: string; name: string; stage: number; strength: number };

const rows = (value: unknown): Row[] => Array.isArray(value) ? value.filter(row => row && typeof row === 'object') : [];
const key = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ');
const country = (value: unknown) => typeof value === 'string' && /^[a-z]{2}$/i.test(value.trim()) ? value.trim().toUpperCase() : null;
function photo(value: unknown) { try { const url = new URL(String(value || '')); return url.protocol === 'https:' ? url.href : null; } catch { return null; } }
function person(value: Row, directory: RankedPlayer[]): DrawPerson | null {
  const name = String(value.Name || value.name || '').trim();
  if (!name || /^(pending|bye|tbd)$/i.test(name)) return null;
  const rankedinId = value.RankedinId || value.PlayerUrl?.match(/\/player\/([^/]+)/)?.[1];
  const matches = directory.filter(p => value.profileId ? String(p.id) === String(value.profileId) : rankedinId ? p.rankedin_id === rankedinId : key(p.name) === key(name));
  const profile = matches.length === 1 ? matches[0] : null;
  return { name, id: profile?.id ? String(profile.id) : null, photo: photo(profile?.image_url), country: country(value.CountryShort) || (typeof profile?.nationality === 'string' ? profile.nationality.trim() || null : null) };
}
function team(value: Row | null | undefined, directory: RankedPlayer[]): DrawTeam {
  const people = rows(value?.Players || [value?.FirstPlayer, value?.SecondPlayer]);
  const players = people.map(p => person(p, directory)).filter((p): p is DrawPerson => !!p);
  const isBye = people.some(p => /^bye$/i.test(p.Name || ''));
  return { players, seed: value?.Seed ? String(value.Seed) : null, placeholder: players.length ? null : isBye ? 'Bye' : 'To be confirmed' };
}
export function publishedDrawChoices(payload: unknown): DrawChoice[] {
  return rows(payload).filter(c => c.IsPublished || c.ShowDraws).flatMap(c => rows(c.TournamentDraws).map(d => ({
    id: `${c.Id}:${d.Id}`, classId: String(c.Id), name: `${c.Name}${c.TournamentDraws.length > 1 ? ` · ${d.Name}` : ''}`,
    stage: Number(d.Stage || 0), strength: Number(d.Strength || 0),
  })));
}
function score(value: Row | undefined): { scores: number[][]; summary: boolean } {
  const sets = rows(value?.DetailedScoring).filter(s => s.FirstParticipantScore != null && s.SecondParticipantScore != null)
    .map(s => [Number(s.FirstParticipantScore), Number(s.SecondParticipantScore)]).filter(s => s.every(Number.isFinite));
  if (sets.length) return { scores: sets, summary: false };
  if (value?.FirstParticipantScore != null && value?.SecondParticipantScore != null) {
    const total = [Number(value.FirstParticipantScore), Number(value.SecondParticipantScore)];
    if (total.every(Number.isFinite)) return { scores: [total], summary: true };
  }
  return { scores: [], summary: false };
}
function rankedinMatch(cell: Row, directory: RankedPlayer[], first?: Row, second?: Row): DrawMatch {
  const result = cell.MatchViewModel || cell.MatchResults || {};
  const firstParticipant = first || cell.ChallengerParticipant, secondParticipant = second || cell.ChallengedParticipant;
  const winnerId = cell.WinnerParticipantId ?? result.WinnerParticipantId;
  const isWinner = (participant: Row | undefined) => !!winnerId && String(winnerId) !== '0' && [participant?.EventParticipantId, participant?.Id]
    .some(id => id != null && String(id) === String(winnerId));
  const participantWinner = isWinner(firstParticipant) ? 1 : isWinner(secondParticipant) ? 2 : null;
  const winnerFlag = typeof result.IsFirstParticipantWinner === 'boolean' ? result.IsFirstParticipantWinner : result.Score?.IsFirstParticipantWinner;
  const scoreWinner = typeof winnerFlag === 'boolean' ? winnerFlag ? 1 : 2 : null;
  const winner = participantWinner ?? scoreWinner;
  const scoring = score(result.Score);
  // Scores follow the underlying challenge order, which can be reversed from the bracket.
  // The winner's participant ID anchors both the highlight and score columns to the displayed teams.
  if (participantWinner !== null && scoreWinner !== null && participantWinner !== scoreWinner) {
    scoring.scores = scoring.scores.map(([one, two]) => [two, one]);
  }
  const cancelled = !!result.HasCancellation;
  const played = !!result.IsPlayed;
  const one = team(firstParticipant, directory), two = team(secondParticipant, directory);
  const awarded = !played && winner !== null;
  const bye = one.placeholder === 'Bye' || two.placeholder === 'Bye';
  const completed = played || awarded;
  const showSchedule = cell.ShouldShowSchedule !== false && cell.ShowDate !== false;
  const start = showSchedule && cell.Date && !String(cell.Date).startsWith('0001') ? String(cell.Date) : null;
  return { id: String(cell.MatchId), round: Number(cell.Round || 1), order: Number(cell.MatchOrder || 0),
    one, two,
    start, court: showSchedule ? cell.CourtName || cell.Court || null : null,
    status: awarded ? bye ? 'Bye' : 'Walkover' : cancelled ? 'Cancelled' : played ? 'Final score' : 'Upcoming match', completed,
    ...scoring, winner };
}
function groupedRounds(matches: DrawMatch[], playoff: string | false = false): DrawRound[] {
  const numbers = [...new Set(matches.map(m => m.round))].sort((a, b) => a - b);
  return numbers.map((n, i) => {
    const remaining = numbers.length - i;
    return { id: String(n), name: remaining === 1 ? playoff || 'Final' : remaining === 2 ? 'Semifinals' : remaining === 3 ? 'Quarterfinals' : `Round of ${2 ** remaining}`,
      matches: matches.filter(m => m.round === n).sort((a, b) => a.order - b.order) };
  });
}
/** Parses a published class/stage snapshot, including placement draws and repeated bracket cells. */
export function rankedinDrawSections(payload: unknown, directory: RankedPlayer[] = []): DrawSection[] {
  return rows(payload).flatMap<DrawSection>((b, index) => {
    if (b.BaseType === 'Elimination' && b.Elimination) {
      const draw = b.Elimination;
      const cells = rows(draw.DrawCells?.length ? draw.DrawCells : rows(draw.DrawData).flat());
      const unique = new Map<string, DrawMatch>();
      for (const raw of cells) {
        const cell = raw.MatchCell || raw;
        // Class/stage visibility is checked before loading this snapshot. RankedIn
        // can leave every cell's IsPublished false even in a public, played draw.
        if (cell.MatchId) unique.set(String(cell.MatchId), rankedinMatch(cell, directory));
      }
      const placement = Number(draw.PlacesStartPos || 1) > 1;
      const name = placement ? draw.PlacesStartPos === 3 && draw.PlacesEndPos === 4 ? '3rd place playoff' : `Places ${draw.PlacesStartPos}–${draw.PlacesEndPos}` : draw.IsQualification ? 'Qualifying draw' : 'Main draw';
      return unique.size ? [{ id: `knockout:${index}`, name, kind: 'knockout' as const, rounds: groupedRounds([...unique.values()], placement ? name : false), standings: [] }] : [];
    }
    if (b.BaseType !== 'RoundRobin' || !b.RoundRobin) return [];
    const pool = b.RoundRobin, grid = Array.isArray(pool.Pool) ? pool.Pool : [];
    const unique = new Map<string, DrawMatch>();
    grid.forEach((row: Row[], i: number) => row.forEach((cell, j) => {
      if (cell?.MatchCell?.MatchId) {
        const id = String(cell.MatchCell.MatchId);
        if (!unique.has(id)) unique.set(id, rankedinMatch(cell.MatchCell, directory, grid[i]?.[0]?.ParticipantCell, grid[0]?.[j]?.ParticipantCell));
      }
    }));
    const standings = rows(pool.Standings).map((s, i) => ({ id: String(s.ParticipantId || i), position: Number(s.Standing || i + 1),
      team: team({ FirstPlayer: s.DoublesPlayer1Model || { Name: s.ParticipantName }, SecondPlayer: s.DoublesPlayer2Model }, directory),
      played: Number(s.Played || 0), won: Number(s.Wins || 0), lost: Number(s.Losses || 0), points: Number(s.MatchPoints || 0),
    })).sort((a, b) => a.position - b.position);
    return [{ id: `group:${index}`, name: pool.Name || `Group ${index + 1}`, kind: 'group' as const,
      rounds: unique.size ? [{ id: 'group', name: 'Group matches', matches: [...unique.values()] }] : [], standings }];
  });
}

export function nativeDrawSections(matches: Row[], entries: Row[], sets: Row[], groups: Row[], standings: Row[], directory: RankedPlayer[] = []): DrawSection[] {
  const byEntry = new Map(entries.map(e => [e.id, e]));
  const entryTeam = (id: unknown) => {
    const e = byEntry.get(id);
    return team(e ? { Seed: e.seed_number, FirstPlayer: { Name: e.player_one_name || e.team_name, profileId: e.player_one_id }, SecondPlayer: { Name: e.player_two_name, profileId: e.player_two_id } } : null, directory);
  };
  const normalized = (m: Row): DrawMatch => ({ id: m.id, round: m.round_number, order: m.bracket_position,
    one: entryTeam(m.entry_one_id), two: entryTeam(m.entry_two_id), start: m.scheduled_start, court: m.court_name,
    completed: ['completed', 'walkover', 'retired', 'bye'].includes(m.status), status: ({ completed: 'Final score', walkover: 'Walkover', retired: 'Retired', bye: 'Bye', in_progress: 'Live', cancelled: 'Cancelled' } as Record<string, string>)[m.status] || 'Upcoming match',
    scores: sets.filter(s => s.match_id === m.id).sort((a, b) => a.set_number - b.set_number).map(s => [s.entry_one_games, s.entry_two_games]), summary: false,
    winner: m.winner_entry_id && m.winner_entry_id === m.entry_one_id ? 1 : m.winner_entry_id && m.winner_entry_id === m.entry_two_id ? 2 : null,
  });
  const sections: DrawSection[] = [];
  for (const g of groups) {
    const groupMatches = matches.filter(m => m.group_id === g.id).map(normalized);
    sections.push({ id: g.id, name: g.name, kind: 'group', rounds: groupMatches.length ? [{ id: 'group', name: 'Group matches', matches: groupMatches }] : [],
      standings: standings.filter(s => s.group_id === g.id).sort((a, b) => a.position - b.position).map(s => ({ id: s.entry_id, position: s.position, team: entryTeam(s.entry_id), played: s.played, won: s.won, lost: s.lost, points: s.standings_points })) });
  }
  const knockout = matches.filter(m => !m.group_id);
  if (knockout.length) {
    const byMatch = new Map(knockout.map(m => [m.id, m]));
    // A final and its third-place playoff can share a round number.
    // Keep their published labels separate instead of assigning both the first match's label.
    const rounds = groupedRounds(knockout.map(normalized)).flatMap(round => {
      const labels = new Map<string, DrawMatch[]>();
      for (const match of round.matches) {
        const label = byMatch.get(match.id)?.round_label || round.name;
        labels.set(label, [...(labels.get(label) || []), match]);
      }
      return [...labels].map(([name, matches], i) => ({ id: i ? `${round.id}:${i}` : round.id, name, matches }));
    });
    sections.push({ id: 'knockout', name: 'Tournament draw', kind: 'knockout', rounds, standings: [] });
  }
  return sections;
}

/** RankedIn South African tournament times have no offset; never reinterpret them in the phone's zone. */
export function drawMatchWhen(value: string | null): string | null {
  if (!value) return null;
  const raw = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(value) ? value : `${value}+02:00`;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : new Intl.DateTimeFormat('en-ZA', { timeZone: 'Africa/Johannesburg', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(date) + ' SAST';
}
