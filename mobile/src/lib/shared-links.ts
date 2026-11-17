const idPattern = /^[1-9]\d*$/;
type SharedLinkDestination = `/players/${string}` | `/events/${string}` | `/clubs/${string}`
  | `/pro/tournament/${string}?tab=matches` | '/rankings?view=Discover' | '/rankings?view=Rankings' | '/calendar?circuit=pro';
let pendingLink: SharedLinkDestination | null = null;

export function sharedLinkDestination(path: string): SharedLinkDestination | null {
  try {
    const url = new URL(path);
    if (url.origin !== 'https://4mpadel.co.za' || url.username || url.password) return null;

    const id = url.searchParams.get('id') ?? '';
    if (url.pathname === '/players') return idPattern.test(id) ? `/players/${id}` : '/rankings?view=Discover';
    if (url.pathname === '/rankings') return '/rankings?view=Rankings';

    const proEvent = url.searchParams.get('event') ?? '';
    if (url.pathname === '/pro/results') return idPattern.test(proEvent) ? `/pro/tournament/${proEvent}?tab=matches` : '/calendar?circuit=pro';

    // Only accept public event and club slugs, not account or payment routes.
    const event = /^\/calendar\/([\w-]+)\/?$/.exec(url.pathname);
    if (event) return `/events/${event[1]}`;
    const club = /^\/clubs\/([\w-]+)\/?$/.exec(url.pathname);
    if (club) return `/clubs/${club[1]}`;
    return null;
  } catch {
    return null;
  }
}

export function deferSharedLink(path: SharedLinkDestination) {
  pendingLink = path;
}

export function consumeSharedLink() {
  const path = pendingLink;
  pendingLink = null;
  return path;
}
