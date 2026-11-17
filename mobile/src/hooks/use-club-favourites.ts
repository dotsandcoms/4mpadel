import { useCallback, useRef, useState } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { fetchClubFavourites, setClubFavourite } from '@/lib/club-favourites';

export function useClubFavourites() {
  const { owner } = useMessagingInbox(), router = useRouter();
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState({ owner, ids: new Set<string>(), loading: true, ready: false, pending: null as string | null, error: '' });
  const currentOwner = useRef(owner); currentOwner.current = owner;
  const version = useRef(0), lock = useRef(false);
  useFocusEffect(useCallback(() => {
    const request = ++version.current;
    lock.current = false;
    setState(previous => ({ owner, ids: previous.owner === owner ? previous.ids : new Set(), loading: !!owner, ready: !owner, pending: null, error: '' }));
    if (owner) void fetchClubFavourites(owner).then(ids => {
      if (request === version.current) setState({ owner, ids, loading: false, ready: true, pending: null, error: '' });
    }).catch(error => { if (request === version.current) setState(previous => ({ ...previous, loading: false, error: error.message })); });
    return () => { version.current++; };
  }, [owner, revision]));
  const toggle = async (clubId: string) => {
    if (!owner) { router.push('/(auth)/sign-in'); return; }
    if (state.owner !== owner || !state.ready || state.loading || lock.current) return;
    lock.current = true; const request = version.current, favourite = !state.ids.has(clubId);
    setState(previous => ({ ...previous, pending: clubId, error: '' }));
    try {
      await setClubFavourite(owner, clubId, favourite);
      if (request === version.current && owner === currentOwner.current) setState(previous => {
        const ids = new Set(previous.ids); if (favourite) ids.add(clubId); else ids.delete(clubId);
        return { ...previous, ids, pending: null };
      });
    } catch (error) {
      if (request === version.current) setState(previous => ({ ...previous, pending: null, error: error instanceof Error ? error.message : 'Your favourite club couldn’t be saved.' }));
    } finally { if (request === version.current) lock.current = false; }
  };
  return { ...(state.owner === owner ? state : { ids: new Set<string>(), loading: !!owner, ready: !owner, pending: null, error: '' }), toggle, retry: () => setRevision(value => value + 1) };
}
