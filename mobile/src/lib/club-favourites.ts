import { supabase } from './supabase';

export async function fetchClubFavourites(userId: string): Promise<Set<string>> {
  const ids = new Set<string>();
  for (let from = 0; ; from += 250) {
    const { data, error } = await supabase.from('club_favourites').select('club_id').eq('user_id', userId).order('club_id').range(from, from + 249);
    if (error) throw new Error('Your favourite clubs couldn’t load. Please try again.');
    for (const row of data ?? []) ids.add(row.club_id);
    if (!data || data.length < 250) return ids;
  }
}

export async function setClubFavourite(userId: string, clubId: string, favourite: boolean) {
  const result = favourite
    ? await supabase.from('club_favourites').upsert({ user_id: userId, club_id: clubId }, { onConflict: 'user_id,club_id', ignoreDuplicates: true })
    : await supabase.from('club_favourites').delete().eq('user_id', userId).eq('club_id', clubId);
  if (result.error) throw new Error('Your favourite club couldn’t be saved. Please try again.');
}
