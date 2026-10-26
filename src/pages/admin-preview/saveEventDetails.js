import { EVENT_FIELD_TYPES, DIVISION_EDITOR_FIELDS, PLAYER_GIFT_OPTIONS, eventEditorDraft, editorValue } from './eventEditorFields.js';
export const EVENT_DETAIL_FIELDS = Object.keys(EVENT_FIELD_TYPES);

export async function loadEventDetails({ client, event }) {
  const { data, error } = await client.from('calendar').select('*').eq('id', event.id).single();
  if (error || !data) throw new Error('Event details could not be loaded. Close and try again.');
  return data;
}

export function eventDetailsUnavailable(event) {
  if (event.event_status === 'cancelled') return 'This event is cancelled. Reopening a cancelled event is not part of this editor.';
  if (event.is_weekly || event.series_id) return 'Weekly-series details must be updated together. Series editing is not connected here yet.';
  if (event.pending_changes || event.pending_changes_status) return 'This event has an amendment workflow. Amendment review is not connected here yet.';
  return '';
}

export function eventDetailsPatch(original, draft) {
  const blocked = eventDetailsUnavailable(original);
  if (blocked) throw new Error(blocked);
  const changes = {};
  const initial = eventEditorDraft(original);
  for (const field of EVENT_DETAIL_FIELDS) {
    if (!(field in draft) || String(draft[field]) === String(initial[field])) continue;
    changes[field] = normalizeEditorValue(draft[field], EVENT_FIELD_TYPES[field], field);
  }
  const merged = { ...original, ...changes };
  if (!String(merged.event_name ?? '').trim()) throw new Error('Event name is required.');
  // Preserve EventBuilder's requirement when changing the contact channels.
  if (('organiser_email' in changes || 'organiser_phone' in changes) && !String(merged.organiser_email ?? '').trim() && !String(merged.organiser_phone ?? '').trim()) throw new Error('Contact phone or email is required.');
  if ('start_date' in changes || 'end_date' in changes) {
    if (!merged.start_date || !merged.end_date || merged.end_date < merged.start_date) throw new Error('Choose valid start and end dates, with end on or after start.');
    changes.event_dates = formatEventDates(merged.start_date, merged.end_date);
  }
  if ('venues' in changes) {
    const seen = new Set();
    changes.venues = changes.venues.filter(name => !seen.has(name.toLowerCase()) && seen.add(name.toLowerCase()));
    if (!changes.venues.length) throw new Error('Add at least one venue.');
    changes.venue = changes.venues.join(' / ');
  }
  if ('city' in changes && !changes.city) throw new Error('City is required.');
  if (('registration_opens_at' in changes || 'registration_closes_at' in changes) && merged.registration_opens_at && merged.registration_closes_at && Date.parse(merged.registration_opens_at) >= Date.parse(merged.registration_closes_at)) throw new Error('Registration closing must follow opening.');
  if ('early_bird_fee' in changes || 'early_bird_ends_at' in changes) {
    if ((merged.early_bird_fee != null) !== Boolean(merged.early_bird_ends_at)) throw new Error('Early bird fee and end date must both be supplied, or both cleared.');
  }
  if ('payment_method' in changes || Object.keys(changes).some(key => key.startsWith('payment_') || key === 'external_payment_url')) {
    if (merged.payment_method === 'eft' && ['payment_bank_name', 'payment_account_name', 'payment_account_number'].some(key => !String(merged[key] || '').trim())) throw new Error('EFT requires bank name, account name and account number.');
    if (merged.payment_method === 'external' && !/^https?:\/\//i.test(merged.external_payment_url || '')) throw new Error('External payment requires an http or https link.');
    if ('payment_method' in changes) {
      changes.allow_payments = merged.payment_method !== 'free';
      changes.finance_managed = merged.payment_method === 'platform';
      for (const field of ['payment_bank_name', 'payment_account_name', 'payment_account_number', 'payment_branch_code', 'payment_reference_note']) if (merged.payment_method !== 'eft') changes[field] = null;
      if (merged.payment_method !== 'external') changes.external_payment_url = null;
    }
  }
  if ('scoring_point' in changes) changes.golden_point = changes.scoring_point === 'golden';
  if ('player_gift_types' in changes) { changes.player_gift_type = changes.player_gift_types[0] || 'none'; changes.collect_tshirt_size = changes.player_gift_types.includes('tshirt'); }
  if ('indoor_outdoor' in changes) changes.courts = changes.indoor_outdoor;
  return changes;
}

function normalizeEditorValue(value, type, field) {
  if (type === 'gifts') { if (!Array.isArray(value) || value.some(gift => !Object.hasOwn(PLAYER_GIFT_OPTIONS, gift))) throw new Error('Choose supported player gift options.'); return [...new Set(value)]; }
  if (type === 'checkbox') return Boolean(value);
  if (type === 'lines') return String(value || '').split('\n').map(line => line.trim()).filter(Boolean);
  if (type === 'number') { if (value === '' || value == null) return null; const number = Number(value); if (!Number.isFinite(number) || number < 0) throw new Error(`${field.replaceAll('_', ' ')} must be zero or greater.`); return number; }
  if (type === 'datetime-local') { if (!value) return null; const parsed = new Date(/Z$|[+-]\d\d:\d\d$/.test(value) ? value : `${value}:00+02:00`); if (Number.isNaN(parsed.getTime())) throw new Error('Choose a valid date and time.'); return parsed.toISOString(); }
  if (type === 'date') { if (!value) return null; if (!/^\d{4}-\d\d-\d\d$/.test(value) || new Date(`${value}T12:00:00Z`).toISOString().slice(0,10) !== value) throw new Error('Choose a valid date.'); }
  if (Array.isArray(type) && !type.includes(value)) throw new Error(`Choose a valid ${field.replaceAll('_', ' ')}.`);
  return String(value ?? '').trim() || (['time', 'date'].includes(type) ? null : '');
}

// Same displayed date wording as EventBuilder.formatEventDates.
function formatEventDates(start, end) {
  const s = new Date(`${start}T12:00:00Z`), e = new Date(`${end}T12:00:00Z`);
  const month = date => date.toLocaleString('en-ZA', { month: 'long', timeZone: 'UTC' });
  const short = date => date.toLocaleString('en-ZA', { month: 'short', timeZone: 'UTC' });
  if (start === end) return `${s.getUTCDate()} ${month(s)} ${s.getUTCFullYear()}`;
  if (s.getUTCMonth() === e.getUTCMonth() && s.getUTCFullYear() === e.getUTCFullYear()) return `${s.getUTCDate()} - ${e.getUTCDate()} ${month(s)} ${s.getUTCFullYear()}`;
  return `${s.getUTCDate()} ${short(s)} - ${e.getUTCDate()} ${short(e)} ${e.getUTCFullYear()}`;
}

export function divisionDetailsPatch(original, draft) {
  const patch = {};
  for (const [field, type] of Object.entries(DIVISION_EDITOR_FIELDS)) {
    if (!(field in draft) || String(draft[field]) === String(editorValue(original[field], type))) continue;
    patch[field] = normalizeEditorValue(draft[field], type, field);
  }
  if (Object.keys(patch).length && original.is_active === false) throw new Error('Inactive divisions cannot be edited here.');
  if ('name' in patch) throw new Error('Division renaming requires updating linked registrations and is not available here.');
  if ('entry_fee' in patch && patch.entry_fee == null) patch.entry_fee = 0;
  return patch;
}

export function newDivisionRecord(draft, scoringPoint = 'golden') {
  if (!String(draft.name || '').trim()) throw new Error('A new division requires a name.');
  if (draft.entry_fee === '' || draft.entry_fee == null) throw new Error('A new division requires an entry fee.');
  if (!draft.gender || !draft.format) throw new Error('A new division requires gender and format.');
  const record = Object.fromEntries(Object.entries(DIVISION_EDITOR_FIELDS).map(([field, type]) => [field, normalizeEditorValue(field === 'scoring_point' ? draft[field] || scoringPoint : draft[field] ?? (type === 'checkbox' ? false : ''), type, field)]));
  return { ...record, scoring_point: record.scoring_point || scoringPoint, is_active: true, age_category: record.age_category || null, gender: record.gender || null, suggested_level: record.suggested_level || null, details: record.details || null, ranking_tier_id: null, ranking_category: null };
}

export async function loadEventEditorDivisions({ client, event }) {
  const { data, error } = await client.from('tournament_divisions').select('*').eq('event_id', event.id).order('sort_order').order('id');
  if (error) throw new Error('Divisions could not be loaded. Close and try again.');
  return data || [];
}

export async function saveEventDetails({ client, event, draft, divisions = [], divisionDrafts = divisions }) {
  const patch = eventDetailsPatch(event, draft);
  const divisionChanges = divisions.map(original => ({ original, patch: divisionDetailsPatch(original, divisionDrafts.find(row => String(row.id) === String(original.id)) || original) })).filter(row => Object.keys(row.patch).length);
  const addedDivisions = divisionDrafts.filter(row => !row.id).map(row => newDivisionRecord(row, draft.scoring_point || event.scoring_point || 'golden'));
  if (!Object.keys(patch).length && !divisionChanges.length && !addedDivisions.length) return { changed: false };
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before editing event details.');
  const { data: permission, error: permissionError } = await client.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  const { data: fresh, error: readError } = await client.from('calendar').select('*').eq('id', event.id).single();
  if (readError || !fresh) throw new Error('The event could not be verified. Close and refresh before editing.');
  const blocked = eventDetailsUnavailable(fresh);
  if (blocked) throw new Error(blocked);
  if (EVENT_DETAIL_FIELDS.some(field => JSON.stringify(fresh[field] ?? '') !== JSON.stringify(event[field] ?? ''))) throw new Error('Event details changed since opening. Close and refresh before saving.');
  let nextSortOrder = 0;
  if (addedDivisions.length) {
    const currentDivisions = await loadEventEditorDivisions({ client, event });
    const names = new Set(currentDivisions.map(row => String(row.name || '').trim().toLowerCase()));
    for (const row of addedDivisions) { const name = row.name.toLowerCase(); if (names.has(name)) throw new Error(`A division named ${row.name} already exists. Choose a different name.`); names.add(name); }
    nextSortOrder = Math.max(-1, ...currentDivisions.map(row => Number(row.sort_order) || 0)) + 1;
  }
  for (const row of divisionChanges) {
    const { data: current, error } = await client.from('tournament_divisions').select('*').eq('event_id', event.id).eq('id', row.original.id).single();
    if (error || !current || [...Object.keys(DIVISION_EDITOR_FIELDS), 'is_active'].some(field => JSON.stringify(current[field] ?? '') !== JSON.stringify(row.original[field] ?? ''))) throw new Error('Division details changed. Close and refresh before saving.');
  }
  if (Object.keys(patch).length) {
  let query = client.from('calendar').update(patch).eq('id', event.id);
  // Compare the edited snapshot in the write as well, so another editor cannot
  // be overwritten between our read and update. No unrelated columns are saved.
  for (const field of [...EVENT_DETAIL_FIELDS.filter(field => !['lines', 'textarea', 'richtext', 'gifts'].includes(EVENT_FIELD_TYPES[field])), 'event_status', 'is_weekly', 'series_id', 'pending_changes', 'pending_changes_status']) {
    query = fresh[field] == null ? query.is(field, null) : query.eq(field, fresh[field]);
  }
  const { data, error } = await query.select('id').maybeSingle();
  if (error) throw new Error('The save could not be confirmed. Close and refresh to check the event before trying again.');
  if (!data) throw new Error('The event changed or your access changed. Close and refresh before saving.');
  }
  for (const { original, patch: divisionPatch } of divisionChanges) {
    let query = client.from('tournament_divisions').update(divisionPatch).eq('id', original.id).eq('event_id', event.id);
    for (const field of [...Object.keys(divisionPatch), 'is_active']) query = original[field] == null ? query.is(field, null) : query.eq(field, original[field]);
    const { data, error } = await query.select('id').maybeSingle();
    if (error || !data) throw new Error('Not all settings could be confirmed. Some changes may have saved. Close and refresh before trying again.');
  }
  if (addedDivisions.length) {
    const { data, error } = await client.from('tournament_divisions').insert(addedDivisions.map((row, index) => ({ ...row, event_id: event.id, sort_order: nextSortOrder + index }))).select('id');
    if (error || data?.length !== addedDivisions.length) throw new Error('New divisions could not all be confirmed. Some changes may have saved. Close and refresh before trying again.');
  }
  return { changed: true };
}
