import { loadEventAdvancedSnapshot, verifyEventAdvancedAccess } from './eventAdvancedGuard.js';

function assertQuick(snapshot) {
  if (!snapshot.event.is_quick_event || snapshot.event.is_weekly) throw new Error('This is not a quick event. Close and reopen it from Calendar.');
  // The live quick builder edits one division. Do not silently replace a
  // multi-division event or invent default values after an incomplete read.
  if (snapshot.divisions.length !== 1) throw new Error('Quick editing requires exactly one division. Review this event’s divisions before editing.');
}

export async function loadQuickEventSnapshot(client, eventId) {
  const snapshot = await loadEventAdvancedSnapshot(client, eventId);
  assertQuick(snapshot);
  return snapshot;
}

export async function verifyQuickEventAccess(client, snapshot, context = {}) {
  assertQuick(snapshot);
  if (String(context.event?.id) !== String(snapshot.event.id)
    || String(context.event?._quickDivision?.id) !== String(snapshot.divisions[0].id)) {
    throw new Error('The event or division identity changed. Close and reload before saving.');
  }
  return verifyEventAdvancedAccess({ client, original: snapshot.event, divisions: snapshot.divisions, siblings: snapshot.siblings, expectedUserId: snapshot.actorId, scopeId: snapshot.scopeId || 'all' });
}
