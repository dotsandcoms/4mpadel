import { refreshMatchBookmarks, saveMatchBookmark, subscribeMatchBookmarks, getMatchBookmarks } from '@/lib/pro-match-bookmarks';
import { fetchNotificationPreferences, saveNotificationPreference } from '@/lib/notification-preferences';
import { getPushPermissionStatus, requestPushPermission } from '@/lib/notifications';
import type { MatchDetails } from '@/lib/pro-padel-live';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Platform, Pressable, Text, View } from 'react-native';

export function ProMatchStar({ row, dark = false }: { row: MatchDetails; dark?: boolean }) {
  const saved = useSyncExternalStore(subscribeMatchBookmarks, getMatchBookmarks).get(row.match.id);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [prompt, setPrompt] = useState(false);
  const [message, setMessage] = useState('');
  const [denied, setDenied] = useState(false);
  useEffect(() => { void refreshMatchBookmarks().catch(() => {}); }, []);
  async function toggle() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      await refreshMatchBookmarks(true);
      const current = getMatchBookmarks().get(row.match.id);
      if (current) { await saveMatchBookmark(row, false, false); return; }
      await saveMatchBookmark(row, true, false);
      if (row.match.status !== 'scheduled') return;
      const [permission, preferences] = await Promise.all([getPushPermissionStatus(), fetchNotificationPreferences()]);
      setDenied(permission === 'denied');
      if (permission === 'granted' && preferences.push_enabled !== false && preferences.pro_match_live !== false && await requestPushPermission()) await saveMatchBookmark(row, true, true);
      else setPrompt(true);
    } catch (error) { Alert.alert('Match alert', error instanceof Error ? error.message : 'Please try again.'); }
    finally { lock.current = false; setBusy(false); }
  }
  async function enable() {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try {
      if (Platform.OS === 'web') { setMessage('Push alerts are available in the 4M Padel mobile app. Your match is saved.'); return; }
      if (await getPushPermissionStatus() === 'denied') { setDenied(true); await Linking.openSettings(); setMessage('Allow notifications in Settings, then return here to enable the alert.'); return; }
      setDenied(false);
      if (!await requestPushPermission()) { setMessage('Your match is saved. Push notifications could not be enabled on this device. Check permissions and try again.'); return; }
      await saveNotificationPreference('push_enabled', true);
      await saveNotificationPreference('pro_match_live', true);
      await saveMatchBookmark(row, true, true);
      setPrompt(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Alerts could not be enabled. Please retry.'); }
    finally { lock.current = false; setBusy(false); }
  }
  return <>
    <Pressable accessibilityRole="button" accessibilityLabel={saved ? `Unstar match${saved.notify ? ', start alert on' : ''}` : 'Star match and get a start alert'} accessibilityState={{ selected: !!saved, disabled: busy }} disabled={busy} onPress={event => { event.stopPropagation(); void toggle(); }} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>{busy ? <ActivityIndicator size="small" color={b.accent} /> : <Ionicons name={saved ? 'star' : 'star-outline'} size={24} color={saved ? '#D39316' : dark ? '#D2DED4' : b.muted} />}</Pressable>
    <Modal visible={prompt} transparent animationType="slide" onRequestClose={() => !busy && setPrompt(false)}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,16,0.4)' }}><Pressable accessibilityRole="button" accessibilityLabel="Close match alert" disabled={busy} onPress={() => setPrompt(false)} style={{ flex: 1 }} /><View style={{ backgroundColor: b.elevated, borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 27, paddingBottom: 45, gap: 18, alignItems: 'center' }}>
        <View style={{ width: 58, height: 58, borderRadius: 18, backgroundColor: '#EAF3DD', alignItems: 'center', justifyContent: 'center' }}><Ionicons name="notifications-outline" size={29} color={b.accent} /></View>
        <Text style={{ color: b.premium, fontSize: 22, fontWeight: '800', textAlign: 'center' }}>Get notified when this match starts</Text>
        <Text style={{ color: b.muted, textAlign: 'center', fontSize: 14, lineHeight: 22 }}>Your match is starred. Turn on push alerts to get a banner when play goes live, even when the app is closed.</Text>
        {!!message && <Text accessibilityRole="alert" style={{ color: b.danger, fontSize: 13, lineHeight: 20, textAlign: 'center' }}>{message}</Text>}
        <View style={{ flexDirection: 'row', gap: 12 }}><Pressable accessibilityRole="button" disabled={busy} onPress={() => setPrompt(false)} style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: b.panel }}><Text style={{ color: b.premium, fontWeight: '800' }}>Not now</Text></Pressable><Pressable accessibilityRole="button" disabled={busy} onPress={() => void enable()} style={{ flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', borderRadius: 13, backgroundColor: b.accent }}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={{ color: '#FFFFFF', fontWeight: '800' }}>{denied ? 'Open settings' : 'Turn on'}</Text>}</Pressable></View>
      </View></View>
    </Modal>
  </>;
}
