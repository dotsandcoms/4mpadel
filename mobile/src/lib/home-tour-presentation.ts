import type { ProMatch, ProTournament } from './pro-padel';
import { fetchTournamentDetails } from './pro-padel-live';

/** Enrich only the few visible cards, from the current event resource rather than an old snapshot logo. */
export async function fetchHomeTourPresentation(events: ProTournament[]): Promise<Record<number, ProTournament>> {
  const ids = [...new Set(events.filter(event => event.id > 0).map(event => event.id))].slice(0, 3);
  const results = await Promise.allSettled(ids.map(fetchTournamentDetails));
  return Object.fromEntries(results.flatMap((result, index) => result.status === 'fulfilled' && result.value?.id === ids[index] ? [[ids[index], result.value]] : []));
}
export function upcomingTourEvents(events: ProTournament[], live: ProTournament[], now = Date.now()) {
  const ids = new Set(live.map(event => event.id));
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  return events.filter(event => !ids.has(event.id) && event.status !== 'finished' && event.startDate.slice(0, 10) > today);
}
export function tourMatchesToday(matches: ProMatch[], id: number, now = Date.now()) {
  const day = (date: number | string) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(date));
  const today = day(now);
  return [...new Map(matches.filter(match => match.tournamentId === id && !!(match.scheduledAt || match.playedAt) && Number.isFinite(Date.parse((match.scheduledAt || match.playedAt)!)) && day((match.scheduledAt || match.playedAt)!) === today && match.status !== 'bye').map(match => [match.id, match])).values()].length;
}
