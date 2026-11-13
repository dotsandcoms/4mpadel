import { useHelpInbox } from '@/components/help-inbox-provider';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { HomeAction } from '@/components/home-action';
import { EventArtwork } from '@/components/event-artwork';
import { NativeSegmentedControl } from '@/components/native-segmented-control';
import { ErrorBanner } from '@/components/error-banner';
import { useNotificationCentre } from '@/hooks/use-notification-centre';
import { groupNotifications, type NotificationGroup, type PlayerNotification } from '@/lib/notification-centre';
import type { PendingAction } from '@/lib/home';
import { pathFromNotificationData } from '@/lib/notification-routing';
import { feedTime } from '@/lib/following-feed';
import { proDate } from '@/lib/pro-padel';
import { openSitePath } from '@/lib/site';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function NotificationsSheet() {
  const router = useRouter(), centre = useNotificationCentre(), help = useHelpInbox();
  const [filter, setFilter] = useState('actions'), [expanded, setExpanded] = useState<Set<string>>(new Set());
  useEffect(() => { setExpanded(new Set()); setFilter('actions'); }, [centre.ownerKey]);
  const groups = useMemo(() => groupNotifications(centre.actions, centre.notifications, centre.events), [centre.actions, centre.notifications, centre.events]);
  const visible = filter === 'actions' ? groups.filter(group => group.actions.length > 0) : groups;
  const actionCount = centre.actions.length;
  function leave() { if (router.canDismiss()) router.dismiss(); }
  function openAction(action: PendingAction) {
    leave();
    if (action.kind === 'profile') router.navigate('/(tabs)/profile'); else void openSitePath(action.path);
  }
  async function openNotification(notification: PlayerNotification) {
    if (notification.read_at === null && !await centre.markRead([notification.id])) return;
    const path = pathFromNotificationData({ type: notification.type, path: notification.path });
    if (path) { leave(); router.navigate(path as never); }
  }
  function toggle(key: string) { setExpanded(previous => { const next = new Set(previous); if (next.has(key)) next.delete(key); else next.add(key); return next; }); }
  function renderGroup(group: NotificationGroup) {
    const open = expanded.has(group.key), event = group.event;
    const uri = event?.custom_image_url || event?.poster_image_url || event?.image_url;
    return <View style={s.group}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={[group.title, group.actions.length ? `${group.actions.length} ${group.actions.length === 1 ? 'action' : 'actions'} needed` : '', group.notifications.length ? `${group.notifications.length} ${group.notifications.length === 1 ? 'update' : 'updates'}` : '', open ? 'Collapse' : 'Expand'].filter(Boolean).join('. ')} onPress={() => toggle(group.key)} style={s.groupHeader}>
        {event ? <EventArtwork uri={uri} event={{ event_name: event.event_name, sapa_status: event.sapa_status ?? null }} style={s.eventImage} /> : <View style={s.eventImage}><SymbolView name={group.eventId ? { ios: 'calendar', android: 'calendar_month', web: 'calendar_month' } : { ios: 'person.crop.circle', android: 'account_circle', web: 'account_circle' }} size={24} tintColor={b.muted} /></View>}
        <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
          <Text numberOfLines={3} style={s.eventTitle}>{group.title}</Text>
          {event && <Text numberOfLines={1} style={s.meta}>{[event.start_date ? proDate(event.start_date) : null, event.city].filter(Boolean).join(' · ')}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {group.actions.length > 0 && <Text style={s.actionCount}>{group.actions.length} {group.actions.length === 1 ? 'action needed' : 'actions needed'}</Text>}
            {group.notifications.length > 0 && <Text style={s.meta}>{group.notifications.length} {group.notifications.length === 1 ? 'update' : 'updates'}</Text>}
          </View>
        </View>
        <SymbolView name={open ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={15} tintColor={b.muted} />
      </Pressable>
      {open && <View style={s.expanded}>
        {group.actions.length > 0 && <>
          <Text accessibilityRole="header" style={s.subheading}>Action needed</Text>
          {group.actions.map(action => <View key={action.key} style={s.actionRow}>
            <View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{action.title}</Text><Text style={s.meta}>{action.detail}</Text></View>
            <HomeAction label="Review" onPress={() => openAction(action)} />
          </View>)}
        </>}
        {group.notifications.length > 0 && <>
          <Text accessibilityRole="header" style={s.subheading}>Recent updates</Text>
          {group.notifications.map(notification => <Pressable key={notification.id} accessibilityRole="button" accessibilityLabel={`${notification.read_at === null ? 'Unread. ' : ''}${notification.title}. Open notification`} onPress={() => void openNotification(notification)} style={s.updateRow}>
            <View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{notification.title}</Text><Text style={s.body}>{notification.body}</Text><View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}><Text style={s.meta}>{feedTime(notification.created_at)}</Text>{notification.read_at === null && <Text style={{ color: b.messagingAction, fontSize: 12, fontWeight: '600' }}>Unread</Text>}</View></View>
            <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={13} tintColor={b.faint} />
          </Pressable>)}
        </>}
        {group.eventId && <HomeAction label="View event" onPress={() => { leave(); router.navigate({ pathname: '/events/[id]', params: { id: String(group.eventId) } }); }} />}
      </View>}
    </View>;
  }
  return <>
    <View collapsable={false} style={s.sheetHeader}>
      <Text accessibilityRole="header" style={s.sheetTitle}>Notifications</Text>
      <HomeAction label="Settings" onPress={() => router.push('/notification-settings')} />
      <HomeAction kind="icon" icon="close" label="Close notifications" onPress={() => router.back()} />
    </View>
    <FlatList data={visible} keyExtractor={group => group.key} renderItem={({ item }) => renderGroup(item)} extraData={expanded}
      style={{ flex: 1, backgroundColor: b.page }}
      contentInsetAdjustmentBehavior="never"
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 32, gap: 12 }}
      refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={centre.loading && groups.length > 0} onRefresh={() => void centre.refresh()} tintColor={loadingBlue} />}
      ListHeaderComponent={<View style={{ gap: 16, paddingTop: 8, paddingBottom: 4 }}>
        <View><Text style={s.summary}>{actionCount ? `${actionCount} ${actionCount === 1 ? 'action' : 'actions'} to review` : 'My event updates'}</Text><Text style={s.meta}>Entries, payments and account updates</Text></View>
        {help.unread > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Help messages, ${help.unread} unread`} onPress={() => { leave(); router.navigate({ pathname: '/(tabs)/messages', params: { filter: 'Help' } }); }} style={s.following}><Text style={{ flex: 1, color: b.accent, fontSize: 15, fontWeight: '500' }}>Help messages ({help.unread})</Text><Text style={{ color: b.muted }}>View replies ›</Text></Pressable>}
        <NativeSegmentedControl label="Notification view" value={filter} onChange={setFilter} options={[{ value: 'actions', label: actionCount ? `Action needed (${actionCount})` : 'Action needed' }, { value: 'all', label: centre.unread + help.unread ? `All updates (${centre.unread + help.unread > 99 ? '99+' : centre.unread + help.unread})` : 'All updates' }]} />
        {filter === 'all' && centre.unread > 0 && <HomeAction kind="outline" label={help.unread ? 'Mark event updates read' : 'Mark all read'} disabled={centre.loading || !centre.through} onPress={() => void centre.markRead()} />}
        {filter === 'all' && <Pressable accessibilityRole="button" onPress={() => { leave(); router.navigate('/following'); }} style={s.following}>
          <SymbolView name={{ ios: 'heart', android: 'favorite_border', web: 'favorite_border' }} size={20} tintColor={b.accent} />
          <Text style={{ flex: 1, color: b.accent, fontSize: 14, fontWeight: '500' }}>My following activity</Text>
          <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.accent} />
        </Pressable>}
      </View>}
      ListEmptyComponent={centre.loading ? <ActivityIndicator style={{ margin: 24 }} color={loadingBlue} accessibilityLabel="Loading notifications" /> : <View style={{ paddingVertical: 24, gap: 8 }}><Text style={s.eventTitle}>{centre.error ? 'Updates are unavailable' : filter === 'actions' ? 'All caught up' : 'No notifications yet'}</Text><Text style={s.body}>{centre.error ? 'Pull down to try again.' : filter === 'actions' ? 'No pending actions.' : 'My event and account updates will appear here.'}</Text></View>} />
    <ErrorBanner message={centre.error || null} top={8} />
  </>;
}

const s = StyleSheet.create({
  sheetHeader: { minHeight: 64, flexShrink: 0, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8, backgroundColor: b.page },
  sheetTitle: { flex: 1, minWidth: 0, color: b.premium, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  summary: { color: b.premium, fontSize: 16, fontWeight: '600', lineHeight: 22, marginBottom: 4 },
  following: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingHorizontal: 4 },
  group: { backgroundColor: b.elevated, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge, overflow: 'hidden' },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  eventImage: { width: 48, height: 64, borderRadius: 8, backgroundColor: b.surface, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: '#0000001A' },
  eventTitle: { fontSize: 16, lineHeight: 22, fontWeight: '600', color: b.premium },
  meta: { fontSize: 12, lineHeight: 17, color: b.muted },
  actionCount: { color: '#78521A', backgroundColor: '#FFF3D4', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, fontSize: 11, fontWeight: '600' },
  expanded: { paddingHorizontal: 16, paddingBottom: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge },
  subheading: { fontSize: 13, fontWeight: '600', color: b.muted, paddingTop: 16, paddingBottom: 8 },
  actionRow: { paddingVertical: 8, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  rowTitle: { fontSize: 14, lineHeight: 20, fontWeight: '600', color: b.premium },
  body: { fontSize: 13, lineHeight: 19, color: b.muted },
  updateRow: { paddingVertical: 12, gap: 12, flexDirection: 'row', alignItems: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
});
