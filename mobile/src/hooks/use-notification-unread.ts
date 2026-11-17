import { useCallback, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { fetchNotificationSnapshot, subscribeNotificationReads } from '@/lib/notification-read-state';

/** Bell counts represent unread updates, independent of outstanding account actions. */
export function useNotificationUnread(owner: string | null) {
  const [state, setState] = useState({ owner, unread: 0 });
  const version = useRef(0);
  useFocusEffect(useCallback(() => {
    let alive = true;
    const refresh = async () => {
      const request = ++version.current;
      if (!owner || AppState.currentState !== 'active') return;
      try {
        const snapshot = await fetchNotificationSnapshot();
        if (alive && request === version.current) setState({ owner, unread: snapshot.unread });
      } catch { /* Keep this account's last known unread count until the next refresh. */ }
    };
    void refresh();
    const stopReads = subscribeNotificationReads(() => { void refresh(); });
    const received = Notifications.addNotificationReceivedListener(() => { void refresh(); });
    const app = AppState.addEventListener('change', value => { if (value === 'active') void refresh(); else version.current++; });
    return () => { alive = false; version.current++; stopReads(); received.remove(); app.remove(); };
  }, [owner]));
  return state.owner === owner ? state.unread : 0;
}
