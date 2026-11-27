export type GuideId = 'overview' | 'home' | 'players' | 'events' | 'menu' | 'settings' | 'following' | 'messages' | 'clubs' | 'club' | 'eventCard' | 'event' | 'eventChat';
export type TourStep = {
  target: string; title: string; body: string; path: string; route?: string;
  params?: Record<string, string>; menu?: boolean; nextLabel?: string; chapter?: GuideId; optional?: boolean;
};
export type Guide = { id: GuideId; title: string; detail: string; icon: 'compass-outline' | 'home-outline' | 'people-outline' | 'calendar-outline' | 'menu-outline' | 'settings-outline' | 'heart-outline' | 'chatbubbles-outline' | 'location-outline'; steps: TourStep[]; contextualOnly?: boolean };
const home = { path: '/', route: '/(tabs)' };
const players = { path: '/rankings', route: '/(tabs)/rankings', params: { view: 'Discover', source: 'all', query: '', gender: 'all' } };
const events = { path: '/calendar', route: '/(tabs)/(calendar)/calendar', params: { circuit: 'sa', timing: 'upcoming' } };
const settings = { path: '/settings', route: '/settings' };
const menu = { ...home, menu: true };
const inbox = { path: '/messages', route: '/(tabs)/messages', params: { filter: 'All' } };
const helpInbox = { ...inbox, params: { filter: 'Help' } };
const event = { path: '/events/*' };
const feed: TourStep = { ...home, target: 'home.feed', title: 'Your padel, your way', body: 'Following brings your favourites together. Switch to 4M for local padel, or Premier & FIP for the international game.', chapter: 'home' };
const directory: TourStep = { ...players, target: 'players.views', title: 'Find your people', body: 'Discover local and FIP players, revisit your Following list, or check the rankings. Follow a player to bring their updates to Home.', chapter: 'players' };
const tournaments: TourStep = { ...events, target: 'events.circuits', title: 'Find your next tournament', body: 'Explore 4M events or the international calendar. Open an event for its divisions, entry options, draws and results.', chapter: 'events' };
const account: TourStep = { ...settings, target: 'settings.profile', title: 'Everything for your account', body: 'Your profile, entries, payments and SAPA licence live here. You can replay this tour from App tour whenever you need it.', chapter: 'settings' };

export const GUIDES: Record<GuideId, Guide> = {
  overview: { id: 'overview', title: 'The 4M essentials', detail: 'Six quick stops to find your way around', icon: 'compass-outline', steps: [
    { ...feed, nextLabel: 'Discover players' }, { ...directory, nextLabel: 'Find events' },
    { ...tournaments, nextLabel: 'Explore the menu' },
    { ...home, target: 'header.menu', title: 'Start with the menu', body: 'Tap the three lines at the top right of Home to open your menu. Your profile and the rest of the app are one tap away.', nextLabel: 'Show Account & settings', chapter: 'menu' },
    { ...menu, target: 'menu.settings', title: 'Here’s Account & settings', body: 'You’ll find Account & settings at the bottom of this menu. Open it for your profile, entries, payments, licence and preferences.', nextLabel: 'Open settings', chapter: 'menu' },
    { ...account, nextLabel: 'Finish tour' },
  ] },
  home: { id: 'home', title: 'Make Home your own', detail: 'Following, local padel and the international tour', icon: 'home-outline', steps: [feed,
    { ...home, target: 'header.notifications', title: 'Know what needs your attention', body: 'The bell shows unread updates. Open an update to read it; entries or payments that need action are listed separately.' },
    { ...home, target: 'header.search', title: 'Find it faster', body: 'Search for players, tournaments, clubs and more from one place.' },
  ] },
  players: { id: 'players', title: 'Discover & follow players', detail: 'Search, follow and explore the rankings', icon: 'people-outline', steps: [directory,
    { ...players, target: 'players.search', title: 'Start with a name', body: 'Search for a player, then open their profile. The Follow button adds them to your personal feed; 4M profiles also offer message requests.' },
    { ...players, target: 'players.filters', title: 'Choose your view', body: 'Use 4M or FIP and the player category to narrow the directory. Rankings has its own SAPA and FIP views.' },
  ] },
  events: { id: 'events', title: 'Explore tournaments', detail: 'Find an event and build your schedule', icon: 'calendar-outline', steps: [tournaments,
    { ...events, target: 'events.search', title: 'Find the right event', body: 'Search by event, city or venue. Filters help you narrow the calendar by location and event type.' },
    { ...events, target: 'events.dates', title: 'Keep your plans together', body: 'Switch between upcoming events, past results and My schedule. Save an event with its plus button; saving is separate from entering.' },
  ] },
  menu: { id: 'menu', title: 'Explore every menu item', detail: 'Your profile and all seven menu destinations', icon: 'menu-outline', steps: [
    { ...menu, target: 'menu.profile', title: 'Your player profile', body: 'Open your profile to see your player information, results and personal padel activity.' },
    { ...menu, target: 'menu.home', title: 'Home', body: 'Return to your feed, followed players, local events and the international game.' },
    { ...menu, target: 'menu.following', title: 'Following', body: 'Catch up on updates from the players, matches and tournaments you follow.' },
    { ...menu, target: 'menu.players', title: 'Players', body: 'Discover players, manage your follow list and explore SAPA or FIP rankings.' },
    { ...menu, target: 'menu.calendar', title: 'Calendar', body: 'Browse tournaments, view their details and revisit the events you have saved.' },
    { ...menu, target: 'menu.media', title: 'Media', body: 'Explore event albums and photos from around the courts.' },
    { ...menu, target: 'menu.help', title: 'Help & enquiries', body: 'Find answers or get help with an entry, a payment or your account.' },
    { ...menu, target: 'menu.settings', title: 'Account & settings', body: 'Your profile, entries, payments, licence, notification preferences and account controls are here.' },
  ] },
  settings: { id: 'settings', title: 'Your account & preferences', detail: 'A guide to the Settings menu', icon: 'settings-outline', steps: [
    { ...settings, target: 'settings.profile', title: 'Edit profile', body: 'Keep your personal details, region, club and player information up to date.' },
    { ...settings, target: 'settings.entries', title: 'My entries', body: 'Review your upcoming entries and previous tournaments. Open an entry to see the options available for it.' },
    { ...settings, target: 'settings.payments', title: 'Payments & refunds', body: 'Find your transaction history and check the recorded status of payments or refunds.' },
    { ...settings, target: 'settings.licence', title: 'SAPA licence', body: 'Check your licence and membership options before your next tournament.' },
    { ...settings, target: 'settings.notifications', title: 'Notifications', body: 'Choose the player updates, event alerts and reminders you want to receive.' },
    { ...settings, target: 'settings.messaging', title: 'Messaging', body: 'Manage message requests, blocked players and your messaging privacy.' },
    { ...settings, target: 'settings.help', title: 'Help & enquiries', body: 'Ask for help with an entry, payment or account. Replies are available in your Help conversations.' },
    { ...settings, target: 'settings.guide', title: 'Your guide is always here', body: 'Replay the introduction or choose a short guide for a specific part of the app.' },
    { ...settings, target: 'settings.actions', title: 'Account controls', body: 'Log out or review account deletion here. Each option explains what happens before you confirm.' },
  ] },
  following: { id: 'following', title: 'Follow the game', detail: 'Understand your personal updates feed', icon: 'heart-outline', steps: [
    { path: '/following', route: '/following', target: 'following.tools', title: 'Your favourites, together', body: 'Filter updates by players, matches or tournaments. Your players opens the list of people you follow.' },
  ] },
  messages: { id: 'messages', title: 'Find your conversations', detail: 'Requests, event announcements, discussion and Help', icon: 'chatbubbles-outline', steps: [
    { ...inbox, target: 'messages.filters', title: 'Every conversation has a place', body: 'Use the inbox filters to find player chats, event conversations, Help replies and chats you’ve archived.' },
    { ...inbox, target: 'messages.requests', title: 'You choose who can chat', body: 'Message requests are invitations from players or groups. Open a request to review it, then accept or decline. Your contact details stay private.' },
    { ...inbox, target: 'messages.actions', title: 'Start a conversation', body: 'Use New message to find a player. Your first message is a request, so they can choose whether to accept the conversation.' },
    { ...inbox, target: 'messages.events', optional: true, title: 'Chats for your events', body: 'Chats for events you enter appear in your inbox automatically. Tap Events to find organiser announcements and discussions you can join.' },
    { ...helpInbox, target: 'messages.help', title: 'A private line to your organiser', body: 'Help brings your enquiries and replies together. It’s separate from the shared event discussion, so you can follow up privately with the event organiser or 4M support.' },
    { ...helpInbox, target: 'messages.helpCompose', title: 'Ask the right team', body: 'Tap New help request. Choose Tournament or entry, then Still need help? and select your entry. Check the named recipient before sending; replies appear here under Help.' },
  ] },
  clubs: { id: 'clubs', title: 'Find your next court', detail: 'Venues, favourites and club groups', icon: 'location-outline', steps: [
    { path: '/clubs', route: '/clubs', target: 'clubs.directory', title: 'Find a club worth saving', body: 'Browse venues, revisit your Favourites or explore club groups. Open a club to save it with the heart or share its public link.' },
  ] },
  club: { id: 'club', title: 'Keep a favourite club close', detail: 'Favourite and share a club', icon: 'heart-outline', contextualOnly: true, steps: [
    { path: '/clubs/*', target: 'club.actions', title: 'A club to come back to', body: 'The heart saves this club to your account. Share opens your phone’s share sheet with the club’s public link.' },
  ] },
  eventCard: { id: 'eventCard', title: 'Read an event card', detail: 'Event details, My schedule and updates', icon: 'calendar-outline', contextualOnly: true, steps: [
    { path: '/calendar', target: 'eventCard.details', title: 'An event at a glance', body: 'The poster, title, dates and venue help you choose your next tournament. Tap the card to open its details, divisions and entry options.' },
    { path: '/calendar', target: 'eventCard.save', title: 'Keep it in My schedule', body: 'Save event adds this tournament to My schedule in the Events page. Tap Scheduled to remove it. Saving an event does not enter you into it.' },
    { path: '/calendar', target: 'eventCard.bell', title: 'Follow tournament updates', body: 'Turn on the bell to follow general tournament updates. Allow device notifications to receive alerts. Your schedule and notification choices are separate.' },
  ] },
  event: { id: 'event', title: 'Explore an event', detail: 'Details, registration, schedule and alerts', icon: 'calendar-outline', contextualOnly: true, steps: [
    { ...event, target: 'event.summary', title: 'Meet your next tournament', body: 'Find the full event title, SAPA tier, dates and venue here. Tap the poster for a closer look.' },
    { ...event, target: 'event.stats', title: 'The details that matter', body: 'Check entries, points, divisions and the entry fee. Available divisions and their fees are listed below in Overview.' },
    { ...event, target: 'event.save', title: 'Add it to My schedule', body: 'The plus saves this event to My schedule on the Events page. A checkmark means it’s saved; tap again to remove it. Registration is a separate step.' },
    { ...event, target: 'event.bell', title: 'Keep up with event updates', body: 'Turn on the bell for general tournament updates and allow device notifications for alerts. Entry and match alerts for registered players follow your notification settings separately.' },
    { ...event, target: 'event.calendar', title: 'Put it on your calendar', body: 'Add the tournament to your phone’s calendar so it fits alongside your other plans. This is separate from My schedule in 4M.' },
    { ...event, target: 'event.share', title: 'Bring your partner along', body: 'Share opens your phone’s share sheet with a link to this event. Choose who to send it to.' },
    { ...event, target: 'event.registration', optional: true, title: 'Watch the entry deadline', body: 'The registration panel shows when entries open or close, with the local date, time and countdown. Register opens entry options; existing entrants can manage their entry here.' },
    { ...event, target: 'event.progress', optional: true, title: 'Follow tournament progress', body: 'See where the tournament is in its journey, from registration through the draws and play. This changes as the event progresses.' },
    { ...event, target: 'event.tabs', title: 'Look beyond Overview', body: 'Use Players for the entry list, Draws for the brackets, Results for scores, and Media for event photos. Availability depends on what has been published.' },
    { ...event, target: 'event.messages', title: 'Stay in the event conversation', body: 'Announcements & discussions opens the event’s conversations. Read organiser announcements or join the player discussion when your entry and messaging access allow it.' },
  ] },
  eventChat: { id: 'eventChat', title: 'Announcements & discussion', detail: 'Organiser updates and player conversation', icon: 'chatbubbles-outline', contextualOnly: true, steps: [
    { path: '/messages/events', target: 'eventChat.announcements', title: 'Updates from the organisers', body: 'Announcements is for official event updates. Only organisers post here, so important information stays easy to find.' },
    { path: '/messages/events', target: 'eventChat.discussion', title: 'Join the courtside conversation', body: 'Discussion lets eligible players and organisers reply. If it’s locked, follow the setup or entry instructions shown on the card to get access.' },
  ] },
};

export type TourProgress = { version: 1; welcome: 'unseen' | 'later' | 'started' | 'completed' | 'skipped'; seen: GuideId[]; completed: GuideId[] };
export const emptyTourProgress = (): TourProgress => ({ version: 1, welcome: 'unseen', seen: [], completed: [] });
export function parseTourProgress(raw: string | null): TourProgress {
  try {
    const value = JSON.parse(raw || 'null');
    if (!value || value.version !== 1 || !['unseen', 'later', 'started', 'completed', 'skipped'].includes(value.welcome)) return emptyTourProgress();
    const ids = (list: unknown): GuideId[] => Array.isArray(list) ? [...new Set(list.filter((id): id is GuideId => typeof id === 'string' && Object.hasOwn(GUIDES, id)))] : [];
    return { version: 1, welcome: value.welcome, seen: ids(value.seen), completed: ids(value.completed) };
  } catch { return emptyTourProgress(); }
}
export function tourPathMatches(expected: string, pathname: string) {
  const path = pathname === '/index' ? '/' : pathname.replace(/\/$/, '') || '/';
  return expected.endsWith('/*') ? path.startsWith(expected.slice(0, -1)) && path.length > expected.length - 1 : path === expected;
}
export type TourRect = { x: number; y: number; width: number; height: number };
export function visibleTourRect(rect: TourRect, width: number, height: number, top: number, bottom: number): TourRect | null {
  if (![rect.x, rect.y, rect.width, rect.height, width, height].every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  const x = Math.max(8, rect.x - 5), y = Math.max(top + 4, rect.y - 5);
  const right = Math.min(width - 8, rect.x + rect.width + 5), end = Math.min(height - bottom - 4, rect.y + rect.height + 5);
  return right - x >= 24 && end - y >= 24 ? { x, y, width: right - x, height: end - y } : null;
}
export function tourCardPosition(rect: TourRect | null, viewport: { width: number; height: number; top: number; bottom: number }, cardHeight: number) {
  const width = Math.min(360, viewport.width - 32), left = Math.max(16, Math.min(viewport.width - width - 16, rect ? rect.x + rect.width / 2 - width / 2 : (viewport.width - width) / 2));
  const minTop = viewport.top + 12, maxBottom = viewport.height - viewport.bottom - 12;
  const below = rect ? rect.y + rect.height + 16 : maxBottom - cardHeight;
  const above = rect ? rect.y - cardHeight - 16 : below;
  const placement = !rect || below + cardHeight <= maxBottom ? 'below' : above >= minTop ? 'above' : maxBottom - (rect.y + rect.height) >= rect.y - minTop ? 'below' : 'above';
  const y = placement === 'below' ? below : above;
  return { width, left, top: Math.max(minTop, Math.min(maxBottom - cardHeight, y)), placement };
}
