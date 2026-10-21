import type { SupabaseClient } from '@supabase/supabase-js';

type DrawEvent = { id: number; is_manual?: boolean | null; rankedin_id?: string | null; rankedin_url?: string | null };
export type EventDrawStatus = {
  source: 'native' | 'rankedin' | 'none';
  hasDraw: boolean; hasResults: boolean; isFinished: boolean; isLive: boolean;
};

/** Registration in 4M does not determine where the tournament's draw lives. */
export function rankedinEventId(event: DrawEvent): string | null {
  const id = event.rankedin_id?.trim();
  if (id && /^[1-9]\d*$/.test(id)) return id;
  return event.rankedin_url?.match(/^https?:\/\/(?:www\.)?rankedin\.com\/(?:[a-z-]+\/)?tournament\/([1-9]\d*)(?:[/?#]|$)/i)?.[1] ?? null;
}

export function eventDrawSource(event: DrawEvent, preferNative = false): EventDrawStatus['source'] {
  if (preferNative && event.is_manual) return 'native';
  if (rankedinEventId(event)) return 'rankedin';
  return event.is_manual ? 'native' : 'none';
}

export function hasPublishedRankedinDraw(classes: unknown): boolean {
  return Array.isArray(classes) && classes.some(row => row && (row.IsPublished || row.ShowDraws)
    && Array.isArray(row.TournamentDraws) && row.TournamentDraws.length > 0);
}

/** Both clients consume the shared cache; no per-device provider requests. */
export async function loadEventDrawStatus(client: Pick<SupabaseClient, 'from'>, event: DrawEvent, preferNative = false): Promise<EventDrawStatus> {
  const source = eventDrawSource(event, preferNative);
  const empty = { source, hasDraw: false, hasResults: false, isFinished: false, isLive: false };
  if (source === 'none') return empty;
  if (source === 'native') {
    const { data, error } = await client.from('draws').select('id, status').eq('event_id', event.id).in('status', ['published', 'in_progress', 'completed']);
    if (error) throw error;
    const started = data.length ? await client.from('draw_matches').select('id', { count: 'exact', head: true }).in('draw_id', data.map(row => row.id)).in('status', ['in_progress', 'completed', 'walkover', 'retired']) : { count: 0, error: null };
    if (started.error) throw started.error;
    return { source, hasDraw: data.length > 0, hasResults: data.some(row => row.status === 'completed'), isFinished: data.length > 0 && data.every(row => row.status === 'completed'), isLive: (started.count ?? 0) > 0 };
  }
  const id = rankedinEventId(event)!;
  const [summary, classes] = await Promise.all([
    client.from('rankedin_results_cache').select('has_draw, has_results, classes, last_synced_at').eq('event_id', event.id).maybeSingle(),
    client.from('rankedin_cache').select('payload, updated_at').eq('url', `https://api.rankedin.com/v1/tournament/GetClassesAndDrawNamesAsync/?tournamentId=${id}`).maybeSingle(),
  ]);
  if (summary.error && classes.error) throw summary.error;
  const summaryRow = summary.error ? null : summary.data;
  const classesRow = classes.error ? null : classes.data;
  // Empty provider responses cannot erase a known draw. A newer, populated
  // response can publish or withdraw a draw without waiting for result syncing.
  const usableClasses = Array.isArray(classesRow?.payload) && classesRow.payload.length > 0;
  const classTime = Date.parse(classesRow?.updated_at ?? '') || 0;
  const summaryTime = Date.parse(summaryRow?.last_synced_at ?? '') || 0;
  const hasDraw = usableClasses && (!summaryRow || classTime >= summaryTime)
    ? hasPublishedRankedinDraw(classesRow!.payload)
    : !!summaryRow?.has_draw || hasPublishedRankedinDraw(summaryRow?.classes);
  if (!summaryRow && !usableClasses && (summary.error || classes.error)) throw summary.error ?? classes.error;
  return { ...empty, hasDraw, hasResults: !!summaryRow?.has_results };
}

export function eventDrawPath(event: { id: number; slug?: string | null }, source: EventDrawStatus['source'], results = false): string {
  const route = source === 'native' ? 'native-draws' : results ? 'results' : 'draws';
  return `/${route}/${event.slug || event.id}`;
}
