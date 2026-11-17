import type { HelpRoute } from './help-requests';
import type { SupportRelatedOption } from './support-related';
export function supportEntryTarget(event: unknown, entry: unknown) {
  if (typeof event !== 'string' || !/^[1-9]\d*$/.test(event) || !Number.isSafeInteger(Number(event)) || typeof entry !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry)) return null;
  return { topic: 'entry' as const, eventId: Number(event), entryId: entry };
}
export function supportEntryOption(route: HelpRoute): SupportRelatedOption {
  if (!route.entryId || !route.eventId || !route.eventName || !route.context) throw new Error('This entry could not load.');
  return { label: route.eventName, value: route.context, eventId: route.eventId, entryId: route.entryId, detail: route.entryDetail || 'Your entry' };
}
