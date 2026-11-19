import { canReadClubDirectory, clubDirectoryScope } from './clubsData.js';

export async function loadClubDetails(client, session, permissions, scopeId, id, signal) {
  if (!canReadClubDirectory(session, permissions, scopeId)) throw new Error('Current Clubs access is required.');
  if (!id) throw new Error('A club must be selected.');
  const { clubId } = clubDirectoryScope(permissions, scopeId);
  if (clubId && clubId !== String(id)) throw new Error('This club is outside the selected workspace.');
  signal?.throwIfAborted();
  const { data, error } = await client.from('clubs').select('id,name,short_name,city,about,tagline,address,website_url,contact_email,contact_phone,whatsapp_number,courts,services,cafe,opening_hours,socials,gallery,sponsors,principal_sponsor,created_at,updated_at').eq('id', id).abortSignal(signal).maybeSingle();
  signal?.throwIfAborted();
  if (error) throw new Error(error.message || 'Club details could not be loaded.');
  if (!data) throw new Error('This club is no longer available to your account.');
  return data;
}

export const recordedText = value => value == null || value === '' ? 'Not recorded' : typeof value === 'string' || typeof value === 'number' ? String(value) : typeof value === 'boolean' ? value ? 'Yes' : 'No' : 'Unrecognised record format';
export function safeClubWebsite(value) {
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null; } catch { return null; }
}
export const clubFlag = (value, yes, no) => value === true ? yes : value === false ? no : 'Not recorded';
