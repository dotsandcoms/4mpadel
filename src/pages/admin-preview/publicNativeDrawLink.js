import { FOURM_PUBLIC_ORIGIN } from '../../constants/site.js';

const publishedStatuses = ['published', 'in_progress', 'completed'];

export function publishedNativeDrawUrl(event, draws) {
  const slug = typeof event?.slug === 'string' ? event.slug.trim() : '';
  if (!event?.is_manual || !slug || !Number.isSafeInteger(Number(event.id)) || Number(event.id) <= 0 || !draws.some(draw =>
    String(draw.event_id) === String(event.id) && publishedStatuses.includes(draw.status))) return null;
  return FOURM_PUBLIC_ORIGIN + '/native-draws/' + encodeURIComponent(slug);
}
