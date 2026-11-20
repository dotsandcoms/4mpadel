import { readAll } from './playersData.js';
import { entityEqual } from './organisationFederationData.js';
import { loadEventAdvancedSnapshot } from './eventAdvancedGuard.js';
import { isLinkedWeeklyEvent } from '../../utils/calendarWeeklySeries.js';

const eventId = value => Number.isSafeInteger(Number(value)) && Number(value) > 0 ? Number(value) : null;
const sameId = (left, right) => String(left ?? '') === String(right ?? '');

export function canOpenOrganisationHostEvents(organisation, { scopeId, superAdmin, editableIds, userId }) {
  if (!userId || !organisation?.id || organisation.status !== 'approved') return false;
  if (scopeId === 'all') return superAdmin === true;
  return scopeId === `org:${organisation.id}` && (superAdmin === true || editableIds?.includes(String(organisation.id)));
}

export async function verifyOrganisationHostBuilder({ client, organisationId, scopeId, actorId, isCurrent, event, payload }) {
  if (!actorId || !organisationId || !['all', `org:${organisationId}`].includes(scopeId) || !isCurrent()) {
    throw new Error('Open this event with the matching organisation workspace.');
  }
  if (event && (!eventId(event.id) || !sameId(event.organisation_id, organisationId) || event.is_manual !== true || event.event_status === 'cancelled')) {
    throw new Error('Choose an editable 4M event owned by the selected organisation.');
  }
  if (payload && !sameId(payload.organisation_id, organisationId)) throw new Error('This event must remain with the selected organisation.');
  if (event && payload?.club_id !== undefined && !sameId(payload.club_id, event.club_id)) {
    throw new Error('Contact a Calendar administrator to change the linked club.');
  }
  if (payload?.federation_sanction_status === 'approved' &&
      (event?.federation_sanction_status !== 'approved' || !sameId(event.federation_id, payload.federation_id))) {
    throw new Error('The federation must approve the sanctioning request.');
  }
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || auth?.user?.id !== actorId || !isCurrent()) throw new Error('The signed-in account changed. Reopen the host workspace.');
  const { data, error } = await client.rpc('admin_organisation_host_builder', {
    p_organisation_id: organisationId,
    ...(event ? { p_event_id: eventId(event.id) } : {}),
    ...(payload ? { p_venues: [...new Set([...(payload.venues || []), payload.venue].filter(Boolean))], p_club_id: payload.club_id ?? event?.club_id ?? null } : {}),
  });
  if (error) throw error;
  if (!sameId(data?.organisation?.id, organisationId) || data.organisation.status !== 'approved' || !sameId(data.event_id, event?.id)
    || (scopeId === 'all' && data.platform !== true) || !isCurrent()) throw new Error('The host organisation or account could not be verified.');
  return data;
}

export async function loadOrganisationHosts({ client, organisationId, scopeId, actorId, signal }) {
  const access = await verifyOrganisationHostBuilder({ client, organisationId, scopeId, actorId, isCurrent: () => !signal.aborted });
  const events = await readAll(() => client.from('calendar')
    .select('id,event_name,slug,start_date,end_date,venue,organisation_id,club_id,is_manual,is_quick_event,is_weekly,series_id,is_visible,event_status,sanction_status,sanction_requested,federation_sanction_status')
    .eq('organisation_id', organisationId).order('start_date', { ascending: false }).order('id'), signal);
  if (events.some(event => !sameId(event.organisation_id, organisationId))) throw new Error('Calendar returned an event belonging to a different organisation.');
  return { ...access, events };
}

export async function loadOrganisationHostEditor({ client, event, organisationId, ...access }) {
  const capability = await verifyOrganisationHostBuilder({ client, organisationId, event, ...access });
  const snapshot = event ? await loadEventAdvancedSnapshot(client, event.id, undefined, organisationId) : null;
  if (snapshot && (!sameId(snapshot.event.id, event.id) || !sameId(snapshot.event.organisation_id, organisationId)
    || snapshot.event.is_quick_event !== event.is_quick_event || snapshot.event.club_id !== event.club_id || !access.isCurrent())) {
    throw new Error('The event or its host changed. Refresh and reopen its details.');
  }
  if (snapshot?.event.is_quick_event && snapshot.divisions.length !== 1) throw new Error('Quick editing requires exactly one existing division.');
  return { capability, snapshot };
}

export async function verifyOrganisationHostEdit({ client, organisationId, snapshot, context, ...access }) {
  const event = snapshot?.event;
  if (!sameId(context.event?.id, event?.id)) throw new Error('The event editor changed. Reopen its details.');
  if (isLinkedWeeklyEvent(event) && context.form && (context.form.is_weekly !== true || context.form.series_id !== event.series_id)) {
    throw new Error('Weekly series settings cannot detach an occurrence.');
  }
  if (context.operation === 'save' && !context.payload) throw new Error('Review the event before saving.');
  if (context.operation.startsWith('upload') && context.operation !== 'upload-cover' && !(context.operation === 'upload' && context.asset === 'poster')) {
    throw new Error('Only cover uploads are available in the organisation workspace.');
  }
  await verifyOrganisationHostBuilder({ client, organisationId, event, payload: context.payload, ...access });
  if (!event) return;
  const next = await loadEventAdvancedSnapshot(client, event.id, undefined, organisationId);
  if (!entityEqual(snapshot, next) || !access.isCurrent()) throw new Error('Event details, divisions or weekly membership changed. Reopen before saving.');
  const divisionIds = new Set(snapshot.divisions.map(row => String(row.id)));
  if ((context.divisions || []).some(row => row.id && !divisionIds.has(String(row.id)))
    || (context.removedDivisionIds || []).some(id => !divisionIds.has(String(id)))
    || (event.is_quick_event && !divisionIds.has(String(context.event?._quickDivision?.id)))) {
    throw new Error('A division is outside this event.');
  }
}
