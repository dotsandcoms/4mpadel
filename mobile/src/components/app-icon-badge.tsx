import { useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';
import { usePathname } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { createBadgeWriter, validBadgeTotal } from '@/lib/app-icon-badge';
import { supabase } from '@/lib/supabase';
import { subscribeNotificationReads } from '@/lib/notification-read-state';

export function AppIconBadge() {
  const inbox = useMessagingInbox(), pathname = usePathname();
  const writer = useRef(createBadgeWriter(count => Notifications.setBadgeCountAsync(count))).current;
  const unread = inbox.rows.reduce((sum, row) => sum + row.unread, 0);
  useEffect(() => {
    if (Platform.OS === 'web') return;
    writer.switchOwner(inbox.owner);
    let alive = true, inFlight = false, requestAgain = false;
    const refresh = async () => {
      if (!inbox.owner || AppState.currentState !== 'active') return;
      if (inFlight) { requestAgain = true; return; }
      inFlight = true; const ticket = writer.ticket();
      try {
        const { data, error } = await supabase.rpc('own_app_badge_unread');
        const count = error ? null : validBadgeTotal({ unread: data, pending: 0, total: data });
        if (alive && count !== null) await writer.apply(ticket, count);
      } catch { /* Retain this account's last known count during an outage. */ }
      finally { inFlight = false; if (alive && requestAgain) { requestAgain = false; void refresh(); } }
    };
    void refresh();
    const app = AppState.addEventListener('change', state => { if (state === 'active') void refresh(); });
    const notification = Notifications.addNotificationReceivedListener(() => { void refresh(); });
    const stopReads = subscribeNotificationReads(() => { void refresh(); });
    return () => { alive = false; app.remove(); notification.remove(); stopReads(); };
  }, [inbox.owner, unread, inbox.revision, pathname, writer]);
  useEffect(() => () => { writer.switchOwner(null); }, [writer]);
  return null;
}
