import { reviewedWeeklyMembers } from '../../utils/calendarWeeklySeries.js';

// Read-only preflight for the existing EventBuilder save engine. This is an
// optimistic conflict check, not a substitute for database RLS or a transaction.
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value)
    .filter(key => !key.startsWith('_') && value[key] !== undefined).sort().map(key => [key, canonical(value[key])]));
  return value;
}
const fingerprint = value => JSON.stringify(canonical(value));
const clone = value => JSON.parse(JSON.stringify(value));

async function readRows(query) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await query().range(offset, offset + 499);
    if (error || !Array.isArray(data)) throw new Error('Event records could not be verified. Close and reload before saving.');
    rows.push(...data);
    if (data.length < 500) return rows;
  }
}

function assertEditable(event) {
  if (!event?.id) throw new Error('The event could not be verified. Close and reload.');
  if (event.event_status === 'cancelled') throw new Error('Cancelled events cannot be edited or republished here.');
  if (!event.is_manual) throw new Error('Imported events cannot be edited with the manual event builder.');
}

export function hasPendingDivisionAmendment(event) {
  const draft = event?.pending_changes;
  return event?.pending_changes_status === 'pending' && Boolean(draft?.payload)
    && ['divisions','removed_division_ids'].some(key =>
      draft[key] != null && (!Array.isArray(draft[key]) || draft[key].length > 0));
}

export async function loadEventAdvancedSnapshot(client, eventId, authorizeWeekly, organisationId) {
  const calendar = () => {
    const query = client.from('calendar').select('*');
    return organisationId ? query.eq('organisation_id', organisationId) : query;
  };
  const { data: event, error } = await calendar().eq('id', eventId).single();
  if (error || !event) throw new Error('The event could not be loaded. Close and try again.');
  assertEditable(event);
  if (event.is_weekly && event.series_id) await authorizeWeekly?.();
  const divisions = await readRows(() => client.from('tournament_divisions').select('*').eq('event_id', eventId).order('id'));
  const siblings = event.is_weekly && event.series_id
    ? await readRows(() => calendar().eq('series_id', event.series_id).eq('is_weekly', true).order('id')) : [];
  // Weekly saves do not persist divisions, but keep complete sibling snapshots
  // so concurrent content, schedule, visibility and sanction edits are detected.
  const reviewed = event.is_weekly && event.series_id ? reviewedWeeklyMembers(event, siblings, { editable: true }) : [];
  return clone({ event, divisions, siblings: reviewed });
}

function assertRowsUnchanged(original, current, label) {
  if (!Array.isArray(original) || original.length !== current.length) throw new Error(`${label} changed since opening. Close and reload before saving.`);
  const rows = new Map(current.map(row => [String(row.id), row]));
  if (rows.size !== current.length || new Set(original.map(row => String(row.id))).size !== original.length
    || original.some(row => !rows.has(String(row.id)) || fingerprint(row) !== fingerprint(rows.get(String(row.id))))) {
    throw new Error(`${label} changed since opening. Close and reload before saving.`);
  }
}

export async function verifyEventAdvancedAccess({ client, original, divisions, siblings, expectedUserId, scopeId = 'all', checkDivisions = true, checkSiblings = Boolean(original?.is_weekly && original?.series_id) }) {
  if (scopeId !== 'all') throw new Error('Event setup requires the all-workspaces scope.');
  const { data: auth, error: authError } = await client.auth.getUser();
  if (authError || !auth?.user?.email) throw new Error('Sign in before saving event settings.');
  if (expectedUserId && auth.user.id !== expectedUserId) throw new Error('The signed-in account changed. Close and reopen the event.');
  const { data: permission, error: permissionError } = await client.from('admin_sidebar_permissions').select('role').eq('email', auth.user.email).maybeSingle();
  if (permissionError || permission?.role !== 'super_admin') throw new Error('A verified super-admin account is required.');
  assertEditable(original);
  const fresh = await loadEventAdvancedSnapshot(client, original.id);
  if (hasPendingDivisionAmendment(fresh.event)) {
    throw new Error('Review the pending division amendment before editing this event.');
  }
  if (fingerprint(original) !== fingerprint(fresh.event)) throw new Error('Event details changed since opening. Close and reload before saving.');
  if (checkDivisions) assertRowsUnchanged(divisions, fresh.divisions, 'Divisions');
  if (checkSiblings) assertRowsUnchanged(siblings, fresh.siblings, 'Weekly series');
  return { ...fresh, user: auth.user };
}
