import { supabase } from './supabase';
import { eventDrawSource } from './event-draws';
import { fetchTournamentDraw, fetchTournamentDrawChoices } from './tournament-draw-data';
import { resolveSapaMainRanking } from './sapa-main-ranking';
import type { CalendarEvent } from './home';
import type { ResultHighlight, ResultPlayer, WinnerFinal } from './home-results';
import type { DrawChoice, DrawSection } from './tournament-draw';
import type { RankedPlayer } from './event-teams';

const normalized = (value: string) => value.normalize('NFC').trim().toLowerCase().replace(/\s+/g, ' ');
const pairKey = (players: { name: string }[]) => players.map(player => normalized(player.name)).sort().join('|');
const runnerNames = (result: ResultHighlight) => (result.runnerUp || '').split(/\s*(?:&|\s\/\s)\s*/).map(name => name.trim()).filter(Boolean);

/** Bind a final to both published pairs. Never borrow another division or a placement match. */
export function winnerFinal(result: ResultHighlight, sections: DrawSection[], choice: DrawChoice, source: WinnerFinal['source']): WinnerFinal | null {
  if (normalized(choice.name.split(' · ')[0]) !== normalized(result.division)) return null;
  if (/\bconsolation\b/i.test(choice.name)) return null;
  const candidates = sections.filter(section => section.kind === 'knockout' && (section.name === 'Main draw' || source === 'native' && section.name === 'Tournament draw'))
    .flatMap(section => section.rounds.filter(round => round.name === 'Final').flatMap(round => round.matches))
    .filter(match => {
      if (!match.completed || !match.winner) return false;
      const won = match.winner === 1 ? match.one : match.two, lost = match.winner === 1 ? match.two : match.one;
      return pairKey(won.players) === pairKey(result.winners) && (!result.runnerUp || pairKey(lost.players) === pairKey(runnerNames(result).map(name => ({ name }))));
    });
  const unique = [...new Map(candidates.map(match => [match.id, match])).values()];
  if (unique.length !== 1) return null;
  const match = unique[0];
  return { matchId: match.id, classId: choice.classId, choiceId: choice.id, source,
    scores: match.scores.map(([one, two]) => match.winner === 1 ? [one, two] : [two, one]), summary: match.summary, court: match.court, status: match.status };
}

export function winnerProfiles(result: ResultHighlight, profiles: RankedPlayer[]): ResultHighlight {
  const decorate = (player: ResultPlayer): ResultPlayer => {
    // A name is the summary cache's only identity. Duplicate names stay unlinked.
    const unique = new Map(profiles.filter(profile => normalized(profile.name) === normalized(player.name)).map(profile => [profile.id, profile]));
    if (unique.size !== 1) return { ...player, profileId: null, country: null, ranking: null };
    const profile = [...unique.values()][0], ranking = resolveSapaMainRanking(profile);
    return { ...player, photo: profile.image_url || player.photo, profileId: Number(profile.id) || null,
      country: typeof profile.nationality === 'string' ? profile.nationality : null,
      ranking: ranking?.rank ? { label: ranking.label, rank: ranking.rank } : null };
  };
  return { ...result, winners: result.winners.map(decorate), runnersUp: runnerNames(result).map(name => decorate({ name, photo: null })) };
}

/** Extra requests happen only in the winners sheet, with at most two draws loading at once. */
export async function fetchEventWinnerDetails(event: CalendarEvent): Promise<{ results: ResultHighlight[]; warning: boolean }> {
  const results = event.resultDivisions ?? (event.resultHighlight ? [event.resultHighlight] : []);
  const names = [...new Set(results.flatMap(result => [...result.winners.map(player => player.name), ...runnerNames(result)]))];
  const source = eventDrawSource(event);
  let warning = false;
  const [people, catalog] = await Promise.allSettled([
    (async () => {
      const profiles: RankedPlayer[] = [];
      for (let offset = 0; offset < names.length; offset += 60) {
        const { data, error } = await supabase.from('players_public').select('id,name,image_url,nationality,rankings,gender,category').in('name', names.slice(offset, offset + 60));
        if (error) throw error;
        profiles.push(...(data ?? []));
      }
      return profiles;
    })(),
    source === 'none' ? Promise.resolve([] as DrawChoice[]) : fetchTournamentDrawChoices(event, source),
  ]);
  const profiles = people.status === 'fulfilled' ? people.value : [];
  const choices = catalog.status === 'fulfilled' ? catalog.value : [];
  warning ||= people.status === 'rejected' || catalog.status === 'rejected';
  const enriched = results.map(result => winnerProfiles(result, profiles));
  for (let offset = 0; offset < enriched.length; offset += 2) {
    await Promise.all(enriched.slice(offset, offset + 2).map(async result => {
      const matched = choices.filter(choice => normalized(choice.name.split(' · ')[0]) === normalized(result.division));
      // Similar class labels never justify choosing a different class identity.
      if (source === 'none' || new Set(matched.map(choice => choice.classId)).size !== 1) return;
      for (const choice of matched.filter(choice => choice.strength === 0).sort((a, b) => b.stage - a.stage)) {
        try {
          const draw = await fetchTournamentDraw(event, source, choice, profiles);
          const final = winnerFinal(result, draw.sections, choice, source);
          if (final) { result.final = final; return; }
        } catch { warning = true; }
      }
    }));
  }
  return { results: enriched, warning };
}
