import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SelectField } from '@/components/select-field';
import { Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNotificationPreferences, NOTIFICATION_GROUPS, saveNotificationPreference, saveNotificationTiming, type NotificationToggle, type NotificationPreferences } from '@/lib/notification-preferences';
import { getPushPermissionStatus, requestPushPermission } from '@/lib/notifications';
import { lightBrand as brand } from '@/theme/tokens';

export default function NotificationSettings() {
  const insets = useSafeAreaInsets();
  const [prefs, setPrefs] = useState<NotificationPreferences>({});
  const [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<string>('loading');
  const [busy, setBusy] = useState<string | null>(null);
  const lock = useRef(false);
  const [error, setError] = useState('');
  const refreshPermission = useCallback(async () => {
    try { setPermission(await getPushPermissionStatus()); }
    catch { setError('Could not read device permissions. Please try again.'); }
  }, []);
  const load = useCallback(async () => {
    setError('');
    try { setPrefs(await fetchNotificationPreferences()); setLoaded(true); }
    catch { setError('Could not load your preferences. Please try again.'); }
  }, []);
  useEffect(() => {
    void load(); void refreshPermission();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void refreshPermission(); });
    return () => sub.remove();
  }, [load, refreshPermission]);
  async function save(key: NotificationToggle, value: boolean) {
    if (lock.current) return;
    lock.current = true; setBusy(key); setError('');
    try { await saveNotificationPreference(key, value); setPrefs(current => ({ ...current, [key]: value })); }
    catch { setError('Your change was not saved. Check your connection and try again.'); }
    finally { lock.current = false; setBusy(null); }
  }
  async function saveTiming(key: 'reminder_minutes' | 'quiet_start' | 'quiet_end', value: string) {
    if (lock.current || !loaded) return;
    const next = { ...prefs, [key]: Number(value), timezone: prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
    if ((next.quiet_start ?? 22) === (next.quiet_end ?? 7)) { setError('Choose different start and end times for quiet hours.'); return; }
    lock.current = true; setBusy(key); setError('');
    try { await saveNotificationTiming(next); setPrefs(next); }
    catch { setError('Your timing settings were not saved. Please try again.'); }
    finally { lock.current = false; setBusy(null); }
  }
  async function enableDevice() {
    if (lock.current) return;
    lock.current = true; setBusy('permission'); setError('');
    try {
      if (permission === 'denied' || permission === 'granted') await Linking.openSettings();
      else if (!await requestPushPermission()) setError('Push notifications could not be enabled. Check device permissions and try again.');
      await refreshPermission();
    } catch { setError('Could not update device permissions. Please try again.'); }
    finally { lock.current = false; setBusy(null); }
  }
  function toggle(key: NotificationToggle, label: string, detail: string) {
    return <View key={key} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, borderBottomWidth: 0.5, borderColor: brand.edge }}>
      <View style={{ flex: 1 }}><Text style={{ color: brand.premium, fontSize: 16, fontWeight: '600' }}>{label}</Text><Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{detail}</Text></View>
      <Switch accessibilityLabel={label} accessibilityHint={detail} value={key === 'quiet_hours_enabled' ? prefs[key] === true : prefs[key] !== false} disabled={!loaded || busy !== null || (key !== 'push_enabled' && prefs.push_enabled === false)} onValueChange={value => void save(key, value)} trackColor={{ true: brand.accent }} />
    </View>;
  }
  return <>
    <Stack.Screen options={{ headerShown: true, title: 'Notification settings', headerBackTitle: 'Back' }} />
    <ScrollView style={{ flex: 1, backgroundColor: brand.page }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
      <Text style={{ color: brand.muted, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>Choose which updates reach you. Preferences apply to all your signed-in devices.</Text>
      <View style={{ backgroundColor: brand.surface, borderRadius: 16, overflow: 'hidden' }}>
        {toggle('push_enabled', 'Push notifications', 'Allow updates from 4M Padel.')}
        <View style={{ padding: 16 }}>
          <Text style={{ color: brand.premium, fontSize: 15 }}>This device: {permission === 'granted' ? 'notifications allowed' : permission === 'unavailable' ? 'push unavailable' : permission === 'loading' ? 'checking permissions…' : 'notifications not allowed'}</Text>
          {permission !== 'unavailable' && <Pressable accessibilityRole="button" disabled={busy !== null} onPress={() => void enableDevice()} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent, fontWeight: '600', fontSize: 15 }}>{permission === 'denied' || permission === 'granted' ? 'Open device settings' : 'Enable on this device'}</Text></Pressable>}
        </View>
      </View>
      {busy && <ActivityIndicator accessibilityLabel="Saving notification preference" style={{ marginTop: 16 }} />}
      {!!error && <View accessibilityRole="alert" style={{ marginTop: 16 }}><Text style={{ color: brand.premium }}>{error}</Text>{!loaded && <Pressable onPress={() => void load()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent }}>Retry</Text></Pressable>}</View>}
      {!loaded && !error && <ActivityIndicator accessibilityLabel="Loading notification preferences" style={{ margin: 20 }} />}
      <View style={{ marginTop: 28, backgroundColor: brand.surface, borderRadius: 16, overflow: 'hidden' }}>
        {toggle('quiet_hours_enabled', 'Quiet hours', 'Hold all push updates during these hours. Time-sensitive reminders that expire will stay in your inbox.')}
        <View pointerEvents={!loaded || busy !== null ? 'none' : 'auto'} style={{ padding: 16, gap: 16, opacity: !loaded || busy !== null ? 0.5 : 1 }}>
          <SelectField label="Remind me before a match" value={String(prefs.reminder_minutes ?? 30)} options={[15, 30, 60].map(n => ({ label: `${n} minutes before`, value: String(n) }))} onChange={value => void saveTiming('reminder_minutes', value)} />
          {prefs.quiet_hours_enabled && <>
            <SelectField label="Quiet hours start" value={String(prefs.quiet_start ?? 22)} options={Array.from({ length: 24 }, (_, n) => ({ label: `${String(n).padStart(2, '0')}:00`, value: String(n) }))} onChange={value => void saveTiming('quiet_start', value)} />
            <SelectField label="Quiet hours end" value={String(prefs.quiet_end ?? 7)} options={Array.from({ length: 24 }, (_, n) => ({ label: `${String(n).padStart(2, '0')}:00`, value: String(n) }))} onChange={value => void saveTiming('quiet_end', value)} />
            <Text style={{ color: brand.muted }}>Time zone: {prefs.timezone ?? 'Africa/Johannesburg'}</Text>
          </>}
        </View>
      </View>
      {NOTIFICATION_GROUPS.map(group => <View key={group.title} style={{ marginTop: 28 }}><Text accessibilityRole="header" style={{ color: brand.muted, fontSize: 13, fontWeight: '600', marginBottom: 8 }}>{group.title}</Text><View style={{ backgroundColor: brand.surface, borderRadius: 16, overflow: 'hidden' }}>{group.items.map(item => toggle(item.key, item.label, item.detail))}</View></View>)}
    </ScrollView>
  </>;
}
