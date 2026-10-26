import { verifyCoachAccess } from './coachStatus.js';
export const COACH_FIELDS = ['full_name', 'email', 'contact_number', 'instagram_link', 'youtube_link', 'website_link', 'city', 'bio', 'gender', 'coaching_location', 'profile_pic_url'];
// Same separators and 3-club selection limit as live CoachClubsPicker. Keep the
// original stored text unchanged unless the user actually changes the clubs.
export const parseCoachClubs = value => String(value || '').trim().split(/\s*[·|/]\s*|\s*,\s*/).map(name => name.trim()).filter(Boolean).slice(0, 3);
export function createCoachDraft(row) {
  const [firstName = '', ...rest] = String(row.full_name || '').trim().split(/\s+/);
  return { ...Object.fromEntries(COACH_FIELDS.filter(key => !['full_name', 'coaching_location', 'profile_pic_url'].includes(key)).map(key => [key, row[key] ?? ''])), firstName, lastName: rest.join(' '), clubs: parseCoachClubs(row.coaching_location) };
}
export function coachProfilePatch(original, draft) {
  if (!draft.clubs?.length) throw new Error('Select at least one club.');
  if (draft.clubs.length > 3) throw new Error('You can select up to 3 clubs.');
  const initial = createCoachDraft(original), patch = {};
  for (const key of COACH_FIELDS) {
    if (Object.hasOwn(initial, key) && draft[key] !== initial[key]) patch[key] = draft[key];
  }
  if (draft.firstName !== initial.firstName || draft.lastName !== initial.lastName) patch.full_name = `${draft.firstName} ${draft.lastName}`.trim();
  if (JSON.stringify(draft.clubs) !== JSON.stringify(initial.clubs)) patch.coaching_location = draft.clubs.filter(Boolean).join(' · ');
  return patch;
}
export async function loadCoachProfile(client, id, scopeId) {
  await verifyCoachAccess(client, scopeId);
  const { data, error } = await client.from('coach_applications').select(['id', 'status', ...COACH_FIELDS].join(',')).eq('id', id).single();
  if (error || !data) throw new Error('The coach profile could not be loaded.');
  return data;
}
export function resizeCoachPhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader(), image = new Image(); let done = false;
    const finish = (error, blob) => { if (done) return; done = true; clearTimeout(timeout); reader.onload = reader.onerror = reader.onabort = image.onload = image.onerror = null; error ? reject(error) : resolve(blob); };
    const timeout = setTimeout(() => finish(new Error('Photo processing timed out.')), 30000);
    reader.onerror = reader.onabort = image.onerror = () => finish(new Error('The photo could not be read.'));
    reader.onload = () => { image.src = reader.result; };
    image.onload = () => {
      try {
        let width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height) throw new Error('Invalid image dimensions.');
        if (width > 800) { height = Math.max(1, Math.round(height * 800 / width)); width = 800; }
        const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
        const context = canvas.getContext('2d'); if (!context) throw new Error('Image processing is unavailable.');
        context.drawImage(image, 0, 0, width, height);
        canvas.toBlob(blob => blob?.size ? finish(null, blob) : finish(new Error('Photo conversion failed.')), 'image/jpeg', .8);
      } catch (error) { finish(error); }
    };
    try { reader.readAsDataURL(file); } catch (error) { finish(error); }
  });
}
export async function saveCoachProfile(client, original, draft, scopeId, { file, resize = resizeCoachPhoto } = {}) {
  const patch = coachProfilePatch(original, draft);
  const keys = [...Object.keys(patch), ...(file ? ['profile_pic_url'] : [])];
  const check = async () => {
    const fresh = await loadCoachProfile(client, original.id, scopeId);
    if (keys.some(key => fresh[key] !== original[key])) throw new Error('Coach details changed since opening. Reopen before saving.');
    return fresh;
  };
  let fresh = await check();
  if (file) {
    if (!/^image\//i.test(file.type || '') || !file.size) throw new Error('Choose a non-empty image file.');
    const jpeg = await resize(file);
    await check();
    const name = `${draft.firstName} ${draft.lastName}`.trim().replace(/\s+/g, '-').toLowerCase().replace(/[^a-z0-9_-]/g, '') || 'coach';
    const path = `${name}_${Date.now()}_${crypto.randomUUID()}.jpg`;
    const bucket = client.storage.from('coach-profiles');
    const { error } = await bucket.upload(path, jpeg, { contentType: 'image/jpeg', upsert: false });
    if (error) throw new Error('Photo upload failed. The previous photo is unchanged.');
    const { data, error: urlError } = bucket.getPublicUrl(path);
    if (urlError || !data?.publicUrl) throw new Error('Uploaded photo URL could not be confirmed. The old profile is unchanged.');
    patch.profile_pic_url = data.publicUrl;
    // Uploads are not transactional with the row. Never delete the old image.
    fresh = await check();
  }
  if (!keys.length) return fresh;
  let update = client.from('coach_applications').update(patch).eq('id', original.id);
  for (const key of keys) update = original[key] == null ? update.is(key, null) : update.eq(key, original[key]);
  const { data, error } = await update.select(['id', 'status', ...COACH_FIELDS].join(',')).single();
  if (error || !data) throw new Error('Save could not be confirmed. Reopen before retrying. The previous image has not been deleted.');
  return data;
}
