import { trackEvent } from '@/lib/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Pressable, ScrollView, Switch, Text, View } from 'react-native';
import { SelectField } from '@/components/select-field';
import { NotificationSection } from '@/components/notification-section';
import { ErrorBanner } from '@/components/error-banner';
import { HomeAction } from '@/components/home-action';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchNotificationPreferences, NOTIFICATION_GROUPS, saveNotificationPreference, saveNotificationTiming, saveDiscussionNotifications, type DiscussionNotifications, type NotificationToggle, type NotificationPreferences } from '@/lib/notification-preferences';
import { getPushPermissionStatus, requestPushPermission } from '@/lib/notifications';
import { loadingBlue, lightBrand as brand } from '@/theme/tokens';

function within<T>(task: Promise<T>, milliseconds: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([task, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Request timed out')), milliseconds); })]).finally(() => clearTimeout(timer));
}
const discussionLabels = { all: 'All messages', replies: 'Replies to my messages', off: 'Off' };
export default function NotificationSettings() {
  const insets = useSafeAreaInsets(), inbox = useMessagingInbox(), router = useRouter();
  const [prefs, setPrefs] = useState<NotificationPreferences>({}), [loaded, setLoaded] = useState(false);
  const [permission, setPermission] = useState<Awaited<ReturnType<typeof getPushPermissionStatus>> | 'loading' | 'error'>('loading');
  const [busy, setBusy] = useState<string | null>(null), [error, setError] = useState('');
  const lock = useRef(false), lifecycle = useRef(0), preferenceRead = useRef(0);
  const refreshPermission = useCallback(async () => {
    setPermission('loading');
    try { setPermission(await within(getPushPermissionStatus(), 5000)); } catch { setPermission('error'); }
  }, []);
  const load = useCallback(async () => {
    const version = lifecycle.current; if (!inbox.owner || lock.current) return; const request = ++preferenceRead.current; setError('');
    try { const result = await within(fetchNotificationPreferences(), 10000); if (version === lifecycle.current && request === preferenceRead.current) { setPrefs(result); setLoaded(true); } }
    catch { if (version === lifecycle.current && request === preferenceRead.current) setError('Could not load your preferences. Please try again.'); }
  }, [inbox.owner]);
  useEffect(() => {
    lifecycle.current++; setPrefs({}); setLoaded(false); setBusy(null); setError(''); lock.current = false;
    void load(); void refreshPermission();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') { void refreshPermission(); void load(); } });
    return () => { lifecycle.current++; sub.remove(); };
  }, [load, refreshPermission]);
  async function change(key: string, task: () => Promise<unknown>, update: Partial<NotificationPreferences>) {
    if (lock.current || !loaded) return; const version = lifecycle.current; preferenceRead.current++;
    lock.current = true; setBusy(key); setError('');
    try {
      await task(); if (version !== lifecycle.current) return;
      setPrefs(current => ({ ...current, ...update })); inbox.dismissNotice(); void inbox.refresh();
    } catch { if (version === lifecycle.current) setError('Your change was not saved. Check your connection and try again.'); }
    finally { if (version === lifecycle.current) { lock.current = false; setBusy(null); } }
  }
  const save = (key: NotificationToggle, value: boolean) => change(key, async () => { await saveNotificationPreference(key, value); void trackEvent('notification_preference', { preference: key, enabled: value }); }, { [key]: value });
  const saveDiscussion = (value: DiscussionNotifications) => change('chat_discussion', () => saveDiscussionNotifications(value), { chat_discussion: value });
  async function saveTiming(key: 'reminder_minutes' | 'quiet_start' | 'quiet_end', value: string) {
    const next = { ...prefs, [key]: Number(value), timezone: prefs.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone };
    if ((next.quiet_start ?? 22) === (next.quiet_end ?? 7)) { setError('Choose different start and end times for quiet hours.'); return; }
    await change(key, async () => { await saveNotificationTiming(next); void trackEvent('notification_timing_changed', { timing_field: key }); }, next);
  }
  async function enableDevice() {
    if (lock.current) return; const version = lifecycle.current; lock.current = true; setBusy('permission'); setError('');
    try {
      if (permission === 'denied' || permission === 'granted') await within(Linking.openSettings(), 15000);
      else if (!await within(requestPushPermission(), 15000) && version === lifecycle.current) setError('Push notifications could not be enabled. Check device permissions and try again.');
    } catch { if (version === lifecycle.current) setError('Could not update device permissions. Please try again.'); }
    finally { if (version === lifecycle.current) { await refreshPermission(); lock.current = false; setBusy(null); } }
  }
  const disabled = !loaded || busy !== null || prefs.push_enabled === false;
  function toggle(key: NotificationToggle, label: string, detail: string) {
    return <View key={key} style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 16, borderBottomWidth: 0.5, borderColor: brand.edge }}>
      <View style={{ flex: 1 }}><Text style={{ color: brand.premium, fontSize: 16, fontWeight: '600' }}>{label}</Text><Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19, marginTop: 4 }}>{detail}</Text></View>
      <Switch accessibilityLabel={label} accessibilityHint={detail} value={key === 'quiet_hours_enabled' ? prefs[key] === true : prefs[key] !== false} disabled={!loaded || busy !== null || (key !== 'push_enabled' && prefs.push_enabled === false)} onValueChange={value => void save(key, value)} trackColor={{ true: brand.accent }} />
    </View>;
  }
  const deviceLabel = permission === 'granted' ? 'Allowed on this device' : permission === 'unavailable' ? 'Push unavailable on this device' : permission === 'loading' ? 'Checking device permissions…' : permission === 'error' ? 'Could not check this device' : 'Not allowed on this device';
  const mode = prefs.chat_discussion || 'all';
  const scope = inbox.owner || 'signed-out';
  return <>
    <View collapsable={false} style={{ paddingTop: insets.top + 8, paddingHorizontal: 16, paddingBottom: 8, minHeight: 60, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: brand.page }}>
      <HomeAction label="Back" onPress={() => router.back()} />
      <Text accessibilityRole="header" style={{ flex: 1, minWidth: 0, fontSize: 18, lineHeight: 24, fontWeight: '600', color: brand.premium }}>Notification settings</Text>
    </View>
    <ScrollView style={{ flex: 1, backgroundColor: brand.page }} contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 32 }}>
      <Text style={{ color: brand.muted, fontSize: 15, lineHeight: 22, marginBottom: 20 }}>Choose the alerts you want. Your choices apply across your signed-in devices.</Text>
      {busy && <ActivityIndicator color={loadingBlue} accessibilityLabel="Saving notification preference" style={{ marginBottom: 16 }} />}
      {!!error && !loaded && <Pressable onPress={() => void load()} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center', marginBottom: 16 }}><Text style={{ color: brand.accent }}>Retry</Text></Pressable>}
      {!loaded && !error && <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading notification preferences" style={{ margin: 20 }} />}
      <NotificationSection key={`${scope}:delivery`} title="Push notifications" summary={`${prefs.push_enabled === false ? 'Off' : 'On'} · ${deviceLabel}`}>
        {toggle('push_enabled', 'Allow push notifications', 'The main switch for 4M Padel alerts. Turning this off also silences messaging banners in the app.')}
        <View style={{ padding: 16 }}><Text style={{ color: brand.premium, fontSize: 14 }}>{deviceLabel}</Text>{permission !== 'unavailable' && <Pressable accessibilityRole="button" disabled={busy !== null || permission === 'loading'} onPress={() => void (permission === 'error' ? refreshPermission() : enableDevice())} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent, fontWeight: '600', fontSize: 15 }}>{permission === 'error' ? 'Retry device check' : permission === 'denied' || permission === 'granted' ? 'Open device settings' : 'Enable on this device'}</Text></Pressable>}</View>
      </NotificationSection>
      <NotificationSection key={`${scope}:messaging`} title="Messaging" summary={loaded ? `Discussions: ${mode === 'replies' ? 'replies to you' : mode === 'off' ? 'off' : 'all messages'} · Announcements ${prefs.chat_announcements === false ? 'off' : 'on'}` : 'Loading preferences…'}>
        <Text style={{ color: brand.muted, padding: 16, fontSize: 13, lineHeight: 20 }}>Choose push notifications and in-app banners. Messages and unread counts stay in your inbox. A muted chat stays silent.</Text>
        {toggle('chat_announcements', 'Event announcements', 'Official organiser updates, including announcements for your divisions.')}
        <View pointerEvents={disabled ? 'none' : 'auto'} style={{ padding: 16, opacity: disabled ? 0.5 : 1, borderBottomWidth: 0.5, borderColor: brand.edge }}><SelectField label="Event discussions" disabled={disabled} value={mode} options={Object.entries(discussionLabels).map(([value, label]) => ({ value, label }))} onChange={value => void saveDiscussion(value as DiscussionNotifications)} /><Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20, marginTop: 9 }}>Replies means a player uses Reply on one of your messages. Other discussion posts stay silent.</Text></View>
        {toggle('chat_private', 'Private & group messages', 'New messages in private and group chats you have accepted.')}
        {toggle('chat_requests', 'New chat requests', 'Notify when a player sends you an introduction. Who can send requests is controlled in Messaging settings.')}
      </NotificationSection>
      <NotificationSection key={`${scope}:timing`} title="Timing & quiet hours" summary={`Quiet hours ${prefs.quiet_hours_enabled ? 'on' : 'off'} · Match reminders ${prefs.reminder_minutes ?? 30} minutes before`}>
        {toggle('quiet_hours_enabled', 'Quiet hours', 'Hold push updates and silence messaging banners during these hours. Expired reminders stay in your inbox.')}
        <View pointerEvents={!loaded || busy !== null ? 'none' : 'auto'} style={{ padding: 16, gap: 16, opacity: !loaded || busy !== null ? 0.5 : 1 }}>
          <SelectField label="Remind me before a match" value={String(prefs.reminder_minutes ?? 30)} options={[15, 30, 60].map(n => ({ label: `${n} minutes before`, value: String(n) }))} onChange={value => void saveTiming('reminder_minutes', value)} />
          {prefs.quiet_hours_enabled && <><SelectField label="Quiet hours start" value={String(prefs.quiet_start ?? 22)} options={Array.from({ length: 24 }, (_, n) => ({ label: `${String(n).padStart(2, '0')}:00`, value: String(n) }))} onChange={value => void saveTiming('quiet_start', value)} /><SelectField label="Quiet hours end" value={String(prefs.quiet_end ?? 7)} options={Array.from({ length: 24 }, (_, n) => ({ label: `${String(n).padStart(2, '0')}:00`, value: String(n) }))} onChange={value => void saveTiming('quiet_end', value)} /><Text style={{ color: brand.muted }}>Time zone: {prefs.timezone ?? 'Africa/Johannesburg'}</Text></>}
        </View>
      </NotificationSection>
      {NOTIFICATION_GROUPS.map(group => <NotificationSection key={`${scope}:${group.title}`} title={group.title} summary={loaded ? `${group.items.filter(item => prefs[item.key] !== false).length} of ${group.items.length} alerts on` : 'Loading preferences…'}>{group.items.map(item => toggle(item.key, item.label, item.detail))}</NotificationSection>)}
    </ScrollView>
    <ErrorBanner message={error} />
  </>;
}
