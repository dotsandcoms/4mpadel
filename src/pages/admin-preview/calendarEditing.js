// Quick events use a separate live builder; never send them through EventBuilder.
// UI eligibility only: the shared editor still checks fresh permissions before save.
export function calendarEditMode(event, canManageEvents = false) {
  if (!event?.id) return null;
  if (String(event.id).startsWith('demo-')) return 'preview';
  if (!event.is_manual || event.event_status === 'cancelled') return null;
  if (event.is_quick_event) return canManageEvents ? 'live-quick' : null;
  return canManageEvents ? 'live' : null;
}
