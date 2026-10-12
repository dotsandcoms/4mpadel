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

export async function loadProExplore(kind, params = {}, signal) {
  const query = new URLSearchParams({ kind, ...Object.fromEntries(Object.entries(params).filter(([,value]) => value !== null && value !== undefined && value !== '')) });
  const response = await fetch(`/api/pro-explore?${query}`, { signal });
  if (!response.ok) throw new Error('Pro Padel details are temporarily unavailable. Please retry.');
  const body = await response.json();
  if (!body || typeof body !== 'object') throw new Error('Invalid Pro Padel response.');
  return body;
}

export async function loadOfficialFipCalendar(signal) {
  const { data } = supabase.storage.from('pro-padel').getPublicUrl('fip-calendar-v1.json');
  const response = await fetch(data.publicUrl, { signal });
  if (!response.ok) throw new Error('Official FIP calendar is unavailable.');
  const value = await response.json();
  if (value?.version !== 1 || !Array.isArray(value.tournaments) || !Number.isFinite(Date.parse(value.updatedAt)) || !value.tournaments.every(event => /^https:\/\/www\.padelfip\.com\/events\//.test(event.sourceUrl || ''))) throw new Error('Invalid official FIP calendar.');
  return value;
}
