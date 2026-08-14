import { useEffect } from 'react';

import { Placeholder, Screen } from '@/components/screen';
import {
  markPushPromptSeen,
  requestPushPermission,
  shouldPromptForPush,
} from '@/lib/notifications';

export default function HomeScreen() {
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!(await shouldPromptForPush()) || cancelled) return;
      await requestPushPermission();
      if (!cancelled) await markPushPromptSeen();
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Screen eyebrow="4M Padel" title="Home">
      <Placeholder label="Your next event, team status and quick actions will live here once sign-in is wired up." />
    </Screen>
  );
}
