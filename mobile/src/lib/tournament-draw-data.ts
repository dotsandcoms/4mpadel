import { supabase } from './supabase';
import { rankedinEventId, type EventDrawStatus } from './event-draws';
import { nativeDrawSections, publishedDrawChoices, rankedinDrawSections, type DrawChoice } from './tournament-draw';
import type { EventDetail } from './events';
import type { RankedPlayer } from './event-teams';

type Snapshot = { payload: unknown; updatedAt: string | null; stale: boolean };
const API = 'https://api.rankedin.com/v1/tournament';
async function sharedRankedin(eventId: number, url: string, choice?: DrawChoice): Promise<Snapshot> {
  const cached = await supabase.from('rankedin_cache').select('payload,updated_at').eq('url', url).maybeSingle();
  const row = cached.error ? null : cached.data;
  if (Array.isArray(row?.payload) && Date.now() - Date.parse(row.updated_at) < 120000) return { payload: row.payload, updatedAt: row.updated_at, stale: false };
  // The server validates the event/class and serializes refreshes across phones.
  const { data, error } = await supabase.functions.invoke('tournament-draws', { body: { eventId,
    ...(choice ? { classId: choice.classId, stage: choice.stage, strength: choice.strength } : {}),
  } });
  if (!error && data && Array.isArray(data.payload)) return data;
  if (Array.isArray(row?.payload)) return { payload: row.payload, updatedAt: row.updated_at, stale: true };
  throw new Error('Published draws could not load. Please try again.');
}
export async function fetchTournamentDrawChoices(event: EventDetail, source: EventDrawStatus['source'], matchId?: string): Promise<DrawChoice[]> {
  if (source === 'rankedin') {
    const id = rankedinEventId(event);
    if (!id) return [];
    return publishedDrawChoices((await sharedRankedin(event.id, `${API}/GetClassesAndDrawNamesAsync/?tournamentId=${id}`)).payload);
  }
  if (source !== 'native') return [];
  const { data, error } = await supabase.from('draws').select('id,division_id,draw_kind,tournament_divisions(name)')
    .eq('event_id', event.id).in('status', ['published', 'in_progress', 'completed']).order('created_at');
  if (error) throw error;
  const choices = (data || []).map(d => {
    const division = Array.isArray(d.tournament_divisions) ? d.tournament_divisions[0] : d.tournament_divisions;
    return { id: d.id, classId: d.division_id, name: `${division?.name || 'Tournament draw'}${d.draw_kind === 'consolation' ? ' · Consolation' : ''}`, stage: 0, strength: 0 };
  });
  if (matchId) {
    const { data: match } = await supabase.from('draw_matches').select('draw_id').eq('id', matchId).maybeSingle();
    choices.sort((a, b) => Number(b.id === match?.draw_id) - Number(a.id === match?.draw_id));
  }
  return choices;
}
async function allRows(query: (start: number, end: number) => PromiseLike<{ data: any[] | null; error: unknown }>) {
  const result: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await query(offset, offset + 999);
    if (error) throw error;
    result.push(...(data || []));
    if (!data || data.length < 1000) return result;
  }
}
export async function fetchTournamentDraw(event: EventDetail, source: EventDrawStatus['source'], choice: DrawChoice, directory: RankedPlayer[]) {
  if (source === 'rankedin') {
    const snapshot = await sharedRankedin(event.id, `${API}/GetDrawsForStageAndStrengthAsync?tournamentClassId=${choice.classId}&drawStrength=${choice.strength}&drawStage=${choice.stage}&isReadonly=true&language=en`, choice);
    return { sections: rankedinDrawSections(snapshot.payload, directory), updatedAt: snapshot.updatedAt, stale: snapshot.stale };
  }
  // Published-only table policies are the same ones used by the website's native draw.
  const [entries, matches, groups, standings] = await Promise.all([
    allRows((from, to) => supabase.from('draw_entries').select('id,player_one_id,player_two_id,player_one_name,player_two_name,team_name,seed_number').eq('draw_id', choice.id).order('id').range(from, to)),
    allRows((from, to) => supabase.from('draw_matches').select('id,group_id,stage,round_number,round_label,bracket_position,entry_one_id,entry_two_id,winner_entry_id,status,scheduled_start,court_name').eq('draw_id', choice.id).order('round_number').order('bracket_position').order('id').range(from, to)),
    allRows((from, to) => supabase.from('draw_groups').select('id,name,display_order').eq('draw_id', choice.id).order('display_order').order('id').range(from, to)),
    allRows((from, to) => supabase.from('draw_standings').select('entry_id,group_id,position,played,won,lost,standings_points').eq('draw_id', choice.id).order('id').range(from, to)),
  ]);
  const sets: any[] = [];
  for (let offset = 0; offset < matches.length; offset += 200) {
    sets.push(...await allRows((from, to) => supabase.from('draw_match_sets').select('match_id,set_number,entry_one_games,entry_two_games').in('match_id', matches.slice(offset, offset + 200).map(m => m.id)).order('id').range(from, to)));
  }
  return { sections: nativeDrawSections(matches, entries, sets, groups, standings, directory), updatedAt: new Date().toISOString(), stale: false };
}
