import { COACH_FIELDS } from './coachProfileEdit.js';
import { verifyCoachAccess } from './coachStatus.js';

const snapshotFields = ['status', 'created_at', ...COACH_FIELDS];

export function ownedCoachPhoto(client, value) {
  try {
    const url = new URL(value);
    const prefix = '/storage/v1/object/public/coach-profiles/';
    if (url.origin !== new URL(client.supabaseUrl).origin || !url.pathname.startsWith(prefix)) return null;
    const path = decodeURIComponent(url.pathname.slice(prefix.length));
    return /^[A-Za-z0-9][A-Za-z0-9_.-]*$/.test(path) && path !== '..' ? path : null;
  } catch {
    return null;
  }
}

export async function deleteCoachApplication(client, record, scopeId, { actor, isCurrent = () => true } = {}) {
  if (!record?.id) throw new Error('Select a saved coach application.');
  const verified = await verifyCoachAccess(client, scopeId, actor);
  if (!isCurrent()) throw new Error('The selected application changed. Review it again before deleting.');

  let query = client.from('coach_applications').delete().eq('id', record.id);
  for (const field of snapshotFields) query = record[field] == null ? query.is(field, null) : query.eq(field, record[field]);
  const { data: deleted, error } = await query.select('id,profile_pic_url').maybeSingle();
  if (error || !deleted) throw new Error('The application was not confirmed deleted. Reload before trying again.');

  if (!deleted.profile_pic_url) return { id: deleted.id };
  const path = ownedCoachPhoto(client, deleted.profile_pic_url);
  if (!path || !isCurrent()) return { id: deleted.id, photoRetained: true };
  try {
    await verifyCoachAccess(client, scopeId, verified);
    if (!isCurrent()) return { id: deleted.id, photoRetained: true };
    const references = await client.from('coach_applications').select('id').eq('profile_pic_url', deleted.profile_pic_url).limit(1);
    if (references.error || !Array.isArray(references.data) || references.data.length || !isCurrent()) return { id: deleted.id, photoRetained: true };
    const removed = await client.storage.from('coach-profiles').remove([path]);
    if (removed.error) return { id: deleted.id, photoRetained: true };
    return { id: deleted.id };
  } catch {
    return { id: deleted.id, photoRetained: true };
  }
}
