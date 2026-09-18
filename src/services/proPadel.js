import { supabase } from '../supabaseClient';

export async function loadProPadel(signal) {
  const { data } = supabase.storage.from('pro-padel').getPublicUrl('rankings-v1.json');
  const response = await fetch(data.publicUrl, { signal });
  if (!response.ok) throw new Error('Rankings are temporarily unavailable. Please try again.');
  const snapshot = await response.json();
  if (snapshot?.version !== 1 || !Number.isFinite(Date.parse(snapshot.updatedAt)) ||
      !['men', 'women'].every((key) => Array.isArray(snapshot.categories?.[key]?.players))) throw new Error('Rankings are temporarily unavailable. Please try again.');
  return snapshot;
}

export async function loadProTour(signal) {
  const { data } = supabase.storage.from('pro-padel').getPublicUrl('tour-v1.json');
  const response = await fetch(data.publicUrl, { signal });
  if (!response.ok) throw new Error('Tour information is temporarily unavailable.');
  const snapshot = await response.json();
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.tournaments) || !Array.isArray(snapshot.matches) || !Number.isFinite(Date.parse(snapshot.updatedAt))) throw new Error('Invalid tour snapshot.');
  return snapshot;
}

export async function loadProFixtures(signal) {
  const { data } = supabase.storage.from('pro-padel').getPublicUrl('fixtures-v1.json');
  const response = await fetch(data.publicUrl, { signal });
  if (!response.ok) throw new Error('Fixtures are temporarily unavailable.');
  const snapshot = await response.json();
  if (snapshot?.version !== 1 || !Array.isArray(snapshot.matches) || typeof snapshot.drawPublished !== 'boolean' || !Number.isFinite(Date.parse(snapshot.updatedAt))) throw new Error('Invalid fixture snapshot.');
  return snapshot;
}
