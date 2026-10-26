import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, View } from 'react-native';
import { supabase } from '@/lib/supabase';
import { requestPushPermission } from '@/lib/notifications';
import { lightBrand as brand } from '@/theme/tokens';

/** The bell follows general tournament updates. Entry and match alerts are sent to entrants independently. */
export function EventNotificationBell({ eventId, eventName, circle = false }: { eventId: number; eventName: string; circle?: boolean }) {
  const router = useRouter();
  const [following, setFollowing] = useState(false);
  const [participating, setParticipating] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  const lock = useRef(false);

  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setLoadFailed(false);
    void (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!active) return;
        setSignedIn(!!session?.user);
        if (!session?.user) { setFollowing(false); setParticipating(false); return; }
        const { data, error } = await supabase.rpc('get_event_notification_follow', { p_event: eventId });
        if (error) throw error;
        if (active) { setFollowing(!!data?.following); setParticipating(!!data?.participating); }
      } catch {
        if (active) setLoadFailed(true);
      } finally { if (active) setLoading(false); }
    })();
    return () => { active = false; };
  }, [eventId, retry]));

  const toggle = async () => {
    if (lock.current || loading) return;
    if (loadFailed) { setRetry(value => value + 1); return; }
    if (!signedIn) { router.push('/(auth)/sign-in'); return; }
    const next = !following;
    lock.current = true; setBusy(true);
    try {
      const { error } = await supabase.rpc('set_event_notification_follow', { p_event: eventId, p_following: next });
      if (error) throw error;
      setFollowing(next);
      if (next) {
        try {
          if (!await requestPushPermission()) Alert.alert('Tournament followed', 'Enable device notifications in Settings to receive alerts.');
        } catch { Alert.alert('Tournament followed', 'Enable device notifications in Settings to receive alerts.'); }
      }
    } catch { Alert.alert('Could not update tournament alerts', 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  };

  return <Pressable accessibilityRole="button" accessibilityLabel={loadFailed ? `Retry loading tournament updates for ${eventName}` : `${following ? 'Turn off' : 'Turn on'} tournament updates for ${eventName}`} accessibilityHint={participating ? 'Your entry and match alerts are automatic, subject to your notification settings.' : undefined} accessibilityState={{ selected: following, disabled: loading || busy }} disabled={loading || busy} onPress={() => void toggle()}
    style={{ minWidth: 44, minHeight: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: following ? '#EAF5D9' : circle ? '#FFFFFF' : 'transparent', borderWidth: circle ? 1 : 0, borderColor: following ? brand.accent : '#16251f4d', opacity: loading ? 0.6 : 1 }}>
    {busy ? <ActivityIndicator size="small" color={brand.accent} /> : <View style={{ width: 24, height: 24, alignItems: 'center', justifyContent: 'center' }}><Ionicons name={following ? 'notifications' : 'notifications-outline'} size={20} color={loadFailed ? brand.danger : following ? '#386018' : brand.premium} />{participating && !following && <View style={{ position: 'absolute', width: 6, height: 6, borderRadius: 3, backgroundColor: '#386018', top: 1, right: 0 }} />}</View>}
  </Pressable>;
}
