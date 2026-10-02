import { supabase } from './supabase';
import type { EntryBalance } from './events';

export async function fetchEntryBalances(eventId: number): Promise<EntryBalance[]> {
  const { data, error } = await supabase.functions.invoke('native-entry-balance', { body: { action: 'summary', eventId } });
  if (error || data?.error || !Array.isArray(data?.balances)) throw new Error('Could not check your entry balance. Pull down to retry.');
  return data.balances;
}
