import { HomeAction } from './home-action';
import type { HomeActionProps } from './home-action.types';
import type { HomeSource } from '@/hooks/use-home-feed';

type Shortcut = { key: string; icon: HomeActionProps['icon']; label: string; path: string };
const local: Shortcut[] = [
  { key: 'events', icon: 'calendar', label: 'Find\ntournaments', path: '/search?category=events' },
  { key: 'partner', icon: 'people', label: 'Find a\npartner', path: '/rankings?view=Discover&source=4m' },
  { key: 'rankings', icon: 'rankings', label: 'Rankings', path: '/rankings?view=Rankings&source=4m' },
  { key: 'license', icon: 'license', label: 'SAPA\nlicense', path: '/license' },
  { key: 'clubs', icon: 'clubs', label: 'Find\nclubs', path: '/clubs' },
];
const international: Shortcut[] = [
  { key: 'events', icon: 'calendar', label: 'Tour\nevents', path: '/calendar?circuit=pro' },
  { key: 'live', icon: 'live', label: 'Live\nscores', path: '/pro/live' },
  { key: 'rankings', icon: 'rankings', label: 'Rankings', path: '/rankings?view=Rankings&source=pro' },
  { key: 'players', icon: 'people', label: 'Players', path: '/rankings?view=Discover&source=pro' },
  { key: 'following', icon: 'following', label: 'My\nfollowing', path: '/rankings?view=Following&source=pro' },
];

const shortLabels: Record<string, string> = { events: 'Events', partner: 'Partners', rankings: 'Rankings', license: 'Licence', clubs: 'Clubs', live: 'Live', players: 'Players', following: 'Following' };

export function HomeShortcuts({ source, onOpen }: { source: HomeSource; onOpen: (path: string) => void }) {
  return <>{(source === '4m' ? local : international).map(action => <HomeAction key={action.key} kind="shortcut" icon={action.icon} label={action.label} shortLabel={shortLabels[action.key]} accessibilityLabel={action.label.replace(/\n/g, ' ')} onPress={() => onOpen(action.path)} />)}</>;
}
