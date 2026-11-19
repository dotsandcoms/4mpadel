// Proposed action controls for the rebuild. Never written to the legacy permission table.
// Operation inventory: CalendarManager, ManualEventRegistrations, NativeDrawManager.
export const EVENT_ACTIONS = [
  { id: 'event.edit', label: 'Edit event details', group: 'Event setup', detail: 'Update an existing event’s setup, dates and venue.' },
  { id: 'event.publish', label: 'Change website visibility', group: 'Event setup', detail: 'Show or hide an event on the website.' },
  { id: 'event.delete', label: 'Delete an event', group: 'Event setup', detail: 'Destructive action; dependencies must be checked.', sensitive: true },
  { id: 'teams.manage', label: 'Manage registrations and teams', group: 'Registrations', detail: 'Add, move or withdraw players and teams.' },
  { id: 'payments.mark', label: 'Mark manual or complimentary payments', group: 'Registrations', detail: 'Changes registration payment status.', sensitive: true },
  { id: 'draw.prepare', label: 'Generate and save draw drafts', group: 'Live competition', detail: 'Prepare a seeded draw before publication.' },
  { id: 'draw.publish', label: 'Publish draws', group: 'Live competition', detail: 'Make the draw available to players.', sensitive: true },
  { id: 'match.schedule', label: 'Schedule courts and matches', group: 'Live competition', detail: 'Update match times and court allocations.' },
  { id: 'match.live', label: 'Mark matches live', group: 'Live competition', detail: 'Control live-match status.' },
  { id: 'match.score', label: 'Record match results', group: 'Live competition', detail: 'Enter results; completed-result corrections need an audit trail.' },
  { id: 'draw.complete', label: 'Complete draws', group: 'Live competition', detail: 'Close the competition after results are confirmed.', sensitive: true },
  { id: 'rankings.award', label: 'Award ranking points', group: 'Live competition', detail: 'Apply the competition’s ranking awards.', sensitive: true },
];

export const EVENT_PRESETS = [
  { id: 'viewer', label: 'View only', description: 'Propose blocking all event changes. Existing read access is retained.', allowed: [] },
  { id: 'event-manager', label: 'Event manager', description: 'Event setup, registrations and match operations. Publishing, deletion, payment changes and ranking awards stay blocked.', allowed: ['event.edit', 'teams.manage', 'draw.prepare', 'match.schedule', 'match.live', 'match.score'] },
  { id: 'draw-operator', label: 'Draw operator', description: 'Draw preparation, court scheduling, live status and results. Event setup and financial changes stay blocked.', allowed: ['draw.prepare', 'match.schedule', 'match.live', 'match.score'] },
];

export function presetActions(id) {
  const preset = EVENT_PRESETS.find(item => item.id === id);
  if (!preset) throw new Error('Unknown event action preset');
  return Object.fromEntries(EVENT_ACTIONS.map(action => [action.id, preset.allowed.includes(action.id) ? 'allow' : 'deny']));
}

export function actionPolicyChanges(policy) {
  return EVENT_ACTIONS.filter(action => ['allow', 'deny'].includes(policy[action.id])).map(action => `Proposed action: ${policy[action.id] === 'allow' ? 'allow' : 'block'} ${action.label.toLowerCase()}`);
}

export function checkProposedEventAction(record, policy, eventId, actionId) {
  if (!EVENT_ACTIONS.some(action => action.id === actionId)) return { status: 'blocked', reason: 'Unknown action.' };
  if (!eventId) return { status: 'unknown', reason: 'Choose an event to check.' };
  if (record.role === 'super_admin') return { status: 'override', reason: 'The super-admin role overrides individual restrictions. This does not bypass event lifecycle checks.' };
  const assigned = record.module_permissions?.['event-mgmt']?.allowedEvents || [];
  if (assigned.length && !assigned.some(id => String(id) === String(eventId))) return { status: 'blocked', reason: 'This event is outside the user’s direct event assignments. Proposed actions cannot expand that scope.' };
  if (!assigned.length && !record.allowed_tabs?.includes('event-mgmt')) return { status: 'blocked', reason: 'No direct Event Manager grant. Membership-derived access must be verified separately.' };
  if (!['allow', 'deny'].includes(policy[actionId])) return { status: 'unknown', reason: 'Existing rules are unchanged. The current backend must determine whether this action is permitted.' };
  if (policy[actionId] === 'deny') return { status: 'blocked', reason: 'Blocked by the proposed action policy.' };
  return { status: 'proposed', reason: 'Allowed by this draft within the direct event scope. Backend authorisation and event lifecycle checks still apply.' };
}
