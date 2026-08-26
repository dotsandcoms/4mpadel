import { supabase } from '@/lib/supabase';

export async function fetchScheduledEventIds(email?: string | null): Promise<Set<number>> {
  const normalised = email?.trim().toLowerCase();
  if (!normalised) return new Set();
  const { data, error } = await supabase
    .from('player_schedule_events')
    .select('event_id')
    .ilike('user_email', normalised);
  if (error) throw error;
  return new Set(
    (data ?? [])
      .map((row) => Number((row as { event_id?: number | string }).event_id))
      .filter(Number.isFinite)
  );
}

export async function setEventOnSchedule(
  email: string,
  eventId: number,
  onSchedule: boolean
) {
  const normalised = email.trim().toLowerCase();
  if (!normalised) throw new Error('Sign in to manage your schedule.');

  if (onSchedule) {
    const { data: existing, error: lookupError } = await supabase
      .from('player_schedule_events')
      .select('id')
      .ilike('user_email', normalised)
      .eq('event_id', eventId)
      .maybeSingle();
    if (lookupError) throw lookupError;
    if (existing) return;

    const { error } = await supabase
      .from('player_schedule_events')
      .insert({ user_email: normalised, event_id: eventId });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('player_schedule_events')
    .delete()
    .ilike('user_email', normalised)
    .eq('event_id', eventId);
  if (error) throw error;
}
