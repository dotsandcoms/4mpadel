import { supabase } from './supabase';
import { fetchDivisions, fetchEvent, fetchEventPlayerRankings, fetchPublicEntries, type EventDetail } from './events';
import { buildEventTeams, type RankedPlayer } from './event-teams';
import { rankedinEventId } from './event-draws';
import { resolveSapaMainRanking } from './sapa-main-ranking';

export type SheetPlayer = { name: string; country: string | null; rank: number | null; points: number | null };
export type EntrySheet = { eventName: string; dates: string; generatedAt: string; divisions: { name: string; teams: { position: number; players: SheetPlayer[]; total: number | null }[] }[] };
export type PointsSheet = { eventName: string; updatedAt: string | null; divisions: { name: string; rows: { position: string; players: string[]; points: number }[] }[] };
const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
const record = (value: unknown): Record<string, any> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {};
const positiveId = (value: unknown) => /^[1-9]\d*$/.test(String(value ?? ''));
const numeric = (value: unknown): number | null => value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
const day = (now: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(now);
export function isSapaEvent(event: EventDetail) { return !!event.sapa_status?.trim() && event.sapa_status.trim().toLowerCase() !== 'none' && event.event_status !== 'cancelled'; }
export function canDownloadPlayerList(event: EventDetail, now = new Date()) {
  return isSapaEvent(event) && !!event.registration_closes_at && Date.parse(event.registration_closes_at) <= now.getTime()
    && (!event.registration_opens_at || Date.parse(event.registration_opens_at) <= now.getTime());
}
export function canCheckEventPoints(event: EventDetail, now = new Date()) {
  return isSapaEvent(event) && (!!event.start_date && event.start_date.slice(0, 10) <= day(now)
    || !!event.rankings_updated_at && Date.parse(event.rankings_updated_at) <= now.getTime());
}

/** A provider ID takes precedence; ambiguous names never borrow another player's ranking. */
export function sheetPlayer(name: string, profiles: RankedPlayer[], identity?: { localId?: string; rankedinId?: string; country?: string }): SheetPlayer {
  const matches = profiles.filter(player => identity?.localId ? String(player.id) === identity.localId
    : identity?.rankedinId ? player.rankedin_id?.toUpperCase() === identity.rankedinId.toUpperCase()
    : player.name.trim().toLowerCase() === name.trim().toLowerCase());
  const profile = matches.length === 1 ? matches[0] : null;
  const ranking = resolveSapaMainRanking(profile);
  const country = text(profile?.nationality || identity?.country).toUpperCase();
  return { name, country: /^[A-Z]{2}$/.test(country) ? country : null, rank: ranking?.rank ?? null, points: ranking?.points ?? null };
}
const total = (players: SheetPlayer[]) => players.length && players.every(player => player.points !== null) ? players.reduce((sum, player) => sum + player.points!, 0) : null;

/** Only allowlisted public tournament endpoints are constructed by callers. */
async function publishedRankedin(path: string) {
  const url = `https://api.rankedin.com/v1/tournament/${path}`;
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Published tournament data could not load. Please retry.');
    return await response.json();
  } finally { clearTimeout(timer); }
}

export function rankedinEntryTeams(payload: unknown, profiles: RankedPlayer[]) {
  const source = record(payload);
  const rows = Array.isArray(source.Participants) ? source.Participants : Array.isArray(source.Teams) ? source.Teams.map((Participant: unknown) => ({ Participant })) : null;
  if (!rows) throw new Error('The published player list is unavailable. Please retry.');
  return rows.flatMap((raw: unknown) => {
    const team = record(record(raw).Participant);
    if (team.HasCancelation === true || team.Cancelation) return [];
    const players = [team.FirstPlayer, team.SecondPlayer].map(record).filter(player => text(player.Name) && !/^(bye|tbd|pending)$/i.test(text(player.Name)))
      .map(player => sheetPlayer(text(player.Name), profiles, { rankedinId: text(player.RankedinId), country: text(player.CountryShort) }));
    return players.length ? [{ position: 0, players, total: total(players) }] : [];
  }).map((team: { position: number; players: SheetPlayer[]; total: number | null }, index: number) => ({ ...team, position: index + 1 }));
}

export async function fetchEventEntrySheet(eventId: number, now = new Date()): Promise<EntrySheet> {
  // Recheck the current deadline when tapped, including reopened registrations.
  const event = await fetchEvent(String(eventId));
  if (!canDownloadPlayerList(event, now)) throw new Error('The player list is available after registrations close for a SAPA event.');
  const profiles = await fetchEventPlayerRankings();
  let divisions: EntrySheet['divisions'];
  if (event.is_manual) {
    const [classes, entries] = await Promise.all([fetchDivisions(event.id), fetchPublicEntries(event.id)]);
    divisions = buildEventTeams(classes, entries, profiles).map(group => ({ name: group.division.name,
      teams: group.teams.map((team, index) => { const players = team.players.map(player => sheetPlayer(player.name, profiles, player.id ? { localId: player.id } : undefined)); return { position: index + 1, players, total: total(players) }; }) }));
  } else {
    const id = rankedinEventId(event);
    if (!id) throw new Error('The player list has not been published for this event.');
    const classes = await publishedRankedin(`GetPlayersTabAsync?id=${id}&language=en`);
    if (!Array.isArray(classes)) throw new Error('The published divisions could not load.');
    divisions = [];
    for (const division of classes) {
      if (!positiveId(division.Id) || !text(division.Name)) continue;
      divisions.push({ name: text(division.Name), teams: rankedinEntryTeams(await publishedRankedin(`GetPlayersForClassAsync?tournamentId=${id}&tournamentClassId=${division.Id}&language=en`), profiles) });
    }
  }
  divisions = divisions.filter(division => division.teams.length > 0);
  if (!divisions.length) throw new Error('No players have been published yet. Please try again later.');
  return { eventName: event.event_name || 'SAPA event', dates: [event.start_date, event.end_date].filter(Boolean).join(' - '), generatedAt: now.toISOString(), divisions };
}

export function rankedinPointsRows(payload: unknown, rankingId: number) {
  const source = record(payload);
  if (!Array.isArray(source.Data)) throw new Error('Published ranking points could not load.');
  return source.Data.flatMap((row: Record<string, any>) => {
    const award = record(row.RankingPoint), points = numeric(award.Points);
    const players = [row.Player1Name, row.Player2Name].map(text).filter(name => name && !/^(bye|tbd|pending)$/i.test(name));
    if (!players.length || points === null || Number(award.RankingId) !== rankingId || award.IsActive !== true) return [];
    const standing = numeric(row.Standing), through = numeric(row.StandingRangeTo);
    if (standing === null || standing < 1) return [];
    return [{ position: through && through > standing ? `${standing}-${through}` : String(standing), players, points }];
  });
}

const pointSheets = new Map<number, { expires: number; request: Promise<PointsSheet | null> }>();
export function fetchEventPointsSheet(event: EventDetail, fresh = false): Promise<PointsSheet | null> {
  if (!isSapaEvent(event)) return Promise.resolve(null);
  const saved = pointSheets.get(event.id);
  if (!fresh && saved && saved.expires > Date.now()) return saved.request;
  const request = (async (): Promise<PointsSheet | null> => {
    const id = rankedinEventId(event);
    if (id) {
      const publication = record(await publishedRankedin(`GetStandingsAsync?id=${id}`));
      if (publication.IsFinished !== true || !Array.isArray(publication.Classes) || !Array.isArray(publication.Rankings)
        || !publication.Rankings.some((ranking: Record<string, any>) => Number(ranking.Id) === 15809)) return null;
      const divisions: PointsSheet['divisions'] = [];
      for (const division of publication.Classes) {
        if (!positiveId(division.Id) || !text(division.Name)) continue;
        const rows = rankedinPointsRows(await publishedRankedin(`GetResultsAsync?tournamentId=${id}&classId=${division.Id}&rankingId=15809&language=en`), 15809);
        if (rows.length) divisions.push({ name: text(division.Name), rows });
      }
      return divisions.length ? { eventName: event.event_name || 'SAPA event', updatedAt: event.rankings_updated_at || null, divisions } : null;
    }
    const { data, error } = await supabase.rpc('get_event_points_sheet', { p_event: event.id });
    if (error) throw new Error('Published ranking points could not load. Please retry.');
    if (!data || !Array.isArray(data.divisions) || !data.divisions.length) return null;
    return { eventName: event.event_name || 'SAPA event', updatedAt: data.updatedAt, divisions: data.divisions };
  })().catch(error => { pointSheets.delete(event.id); throw error; });
  pointSheets.set(event.id, { request, expires: Date.now() + 2 * 60_000 });
  return request;
}
