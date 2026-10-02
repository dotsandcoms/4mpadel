import { SymbolView } from 'expo-symbols';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, Text, View } from 'react-native';
import { SheetHeader } from '@/components/sheet-header';
import { fetchPendingActions, type PendingAction } from '@/lib/home';
import { pathFromNotificationData } from '@/lib/notifications';
import { openSitePath } from '@/lib/site';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';

type PlayerNotification = { id: string; type: string; title: string; body: string; path: string | null; created_at: string };
export default function NotificationsSheet() {
  const router = useRouter();
  const [actions, setActions] = useState<PendingAction[]>([]);
  const [notifications, setNotifications] = useState<PlayerNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const load = useCallback(async (active: () => boolean = () => true) => {
    setLoading(true); setError('');
    try {
      const { data: auth, error: authError } = await supabase.auth.getUser();
      if (authError) throw authError;
      const [pending, history] = await Promise.all([fetchPendingActions(auth.user?.email), supabase.rpc('get_player_notifications')]);
      if (history.error) throw history.error;
      if (active()) { setActions(pending); setNotifications(history.data ?? []); }
    } catch { if (active()) setError('Could not load notifications. Pull down to try again.'); }
    finally { if (active()) setLoading(false); }
  }, []);
  useFocusEffect(useCallback(() => { let active = true; void load(() => active); return () => { active = false; }; }, [load]));
  function openAction(action: PendingAction) {
    if (router.canDismiss()) router.dismiss(); else router.back();
    if (action.kind === 'profile') router.navigate('/(tabs)/profile'); else openSitePath(action.path);
  }
  function openNotification(notification: PlayerNotification) {
    const path = pathFromNotificationData({ type: notification.type, path: notification.path });
    if (path) { if (router.canDismiss()) router.dismiss(); router.navigate(path as never); }
  }
  return <>
    <SheetHeader title="Notifications" trailing={<Pressable accessibilityRole="button" accessibilityLabel="Notification settings" onPress={() => router.push('/notification-settings')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: brand.accent, fontWeight: '600' }}>Settings</Text></Pressable>} />
    <ScrollView className="flex-1 bg-court-page" contentContainerStyle={{ paddingBottom: 28 }} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}>
      {!!error && <Text accessibilityRole="alert" className="px-5 py-4 text-court-ink">{error}</Text>}
      {loading && notifications.length === 0 && <ActivityIndicator accessibilityLabel="Loading notifications" style={{ margin: 20 }} />}
      {!loading && !error && actions.length === 0 && notifications.length === 0 && <View className="px-5 pb-6 pt-4"><Text className="text-[15px] font-semibold text-court-ink">You’re all caught up</Text><Text className="mt-1.5 text-[14px] leading-5 text-court-muted">Your entries, partner updates and tournament news will appear here.</Text></View>}
      {actions.map(action => <Pressable key={action.key} onPress={() => openAction(action)} accessibilityRole="button" accessibilityLabel={`${action.title}. ${action.subtitle}`} className="flex-row items-start border-b border-court-edge px-5 py-4"><SymbolView name={action.kind === 'profile' ? { ios: 'person.fill', android: 'person', web: 'person' } : { ios: 'creditcard.fill', android: 'credit_card', web: 'credit_card' }} size={18} tintColor={brand.accent} /><View className="ml-3 min-w-0 flex-1"><Text className="text-[15px] font-bold text-court-ink">{action.title}</Text><Text className="mt-1 text-[13px] leading-5 text-court-muted">{action.subtitle}</Text><Text className="mt-1 text-[13px] leading-5 text-court-muted">{action.detail}</Text></View></Pressable>)}
      {notifications.map(notification => <Pressable key={notification.id} onPress={() => openNotification(notification)} accessibilityRole="button" accessibilityLabel={`${notification.title}. ${notification.body}`} className="border-b border-court-edge px-5 py-4"><Text className="text-[15px] font-semibold text-court-ink">{notification.title}</Text><Text className="mt-1 text-[14px] leading-5 text-court-muted">{notification.body}</Text><Text className="mt-2 text-[12px] text-court-muted">{new Date(notification.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</Text></Pressable>)}
    </ScrollView>
  </>;
}
