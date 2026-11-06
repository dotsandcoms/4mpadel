import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, RefreshControl, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { EventChannelIcon, eventChannelStyle } from '@/components/messaging/event-channels';
import { ChatAvatar, ChatButton, ChatNotice, ChatPill, chatDate } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { messaging, readConversation, type Conversation } from '@/lib/messaging';
import { lightBrand as b } from '@/theme/tokens';
export default function MessagesScreen() {
  const router = useRouter(), safe = useSafeAreaInsets(), bottom = useTabScenePadding(), active = usePrivateMessagingScreen();
  const inbox = useMessagingInbox();
  const [filter, setFilter] = useState('All'), [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Conversation | null>(null), [busy, setBusy] = useState(false), [menuError, setMenuError] = useState('');
  const identity = useRef(0);
  useEffect(() => { identity.current++; setSelected(null); setMenuError(''); setBusy(false); }, [inbox.owner, active]);
  const options = (row: Conversation) => { setMenuError(''); setSelected(row); };
  const act = async (action: string, data: Record<string, unknown> = {}) => {
    if (!selected || busy) return; const epoch = identity.current; setBusy(true); setMenuError('');
    try {
      if (action === 'mark_read') { const page = await readConversation(selected.id); await messaging('mark_read', { conversationId: selected.id, seq: page.messages.at(-1)?.seq || 0 }); }
      else await messaging(action, { conversationId: selected.id, ...data });
      if (epoch === identity.current) { setSelected(null); await inbox.refresh(); }
    } catch (e) { if (epoch === identity.current) setMenuError(e instanceof Error ? e.message : 'Could not update this chat.'); }
    finally { if (epoch === identity.current) setBusy(false); }
  };
  useEffect(() => { setQuery(''); setFilter('All'); }, [inbox.owner]);
  const requests = inbox.rows.filter(row => row.state === 'pending' && row.incoming).length;
  const rows = useMemo(() => !active ? [] : inbox.rows.filter(row =>
    (filter === 'Requests' ? row.state === 'pending' && row.incoming : row.state !== 'pending' || !row.incoming)
    && (filter === 'Archived' ? row.archived : !row.archived)
    && (filter !== 'Players' || row.kind === 'direct') && (filter !== 'Events' || row.kind !== 'direct')
    && row.title.toLocaleLowerCase().includes(query.toLocaleLowerCase().trim())), [inbox.rows, filter, query, active]);
  const open = (row: Conversation) => router.push({ pathname: '/messages/[id]', params: { id: row.id } });
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}>
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 12, fontWeight: '700', color: b.accent, letterSpacing: 1.4 }}>YOUR COURTSIDE CONNECTION</Text><Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '800', letterSpacing: -1, color: b.premium, marginTop: 5 }}>Messages</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel="New message" onPress={() => router.push('/messages/new')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: b.messagingAction }}><Ionicons name="create-outline" size={24} color="#FFFFFF" /></Pressable>
    </View>
    {!active ? <View style={{ flex: 1, backgroundColor: b.page }} /> : <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl refreshing={inbox.loading} onRefresh={() => void inbox.refresh()} tintColor={b.accent} />}
      ListHeaderComponent={<View style={{ gap: 16, paddingHorizontal: 20, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: b.elevated, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: b.edge }}><Ionicons name="search-outline" size={19} color={b.muted} /><TextInput accessibilityLabel="Search conversations" placeholder="Search your conversations" placeholderTextColor={b.placeholder} value={query} onChangeText={setQuery} style={{ flex: 1, minHeight: 48, color: b.premium, fontSize: 15 }} /></View>
        <View style={{ flexDirection: 'row', gap: 8 }}>{['All', 'Players', 'Events'].map(value => <ChatPill key={value} active={filter === value} onPress={() => setFilter(value)}>{value}</ChatPill>)}</View>
        <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><Pressable accessibilityRole="button" onPress={() => setFilter(filter === 'Requests' ? 'All' : 'Requests')} style={{ minHeight: 44, flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 }}><Ionicons name="mail-unread-outline" size={18} color={b.accent} /><Text style={{ color: b.accent, fontWeight: '600' }}>{requests ? `Message requests · ${requests}` : 'Message requests'}</Text></Pressable><Pressable accessibilityRole="button" onPress={() => setFilter(filter === 'Archived' ? 'All' : 'Archived')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.muted }}>{filter === 'Archived' ? 'Back to inbox' : 'Archived'}</Text></Pressable></View>
        {inbox.status?.enabled && !inbox.status.interactive && <Pressable accessibilityRole="button" onPress={() => router.push('/settings/messaging')} style={{ padding: 16, borderRadius: 14, backgroundColor: '#E5EDD8', gap: 5 }}><Text style={{ color: b.premium, fontWeight: '700' }}>A quick check before you chat</Text><Text style={{ color: b.muted, lineHeight: 20 }}>Finish messaging setup. Event announcements stay available to registered players.</Text></Pressable>}
        {!!inbox.error && <ChatButton quiet onPress={() => void inbox.refresh()}>Try again</ChatButton>}
        {inbox.status?.enabled && <ChatButton quiet onPress={() => router.push('/messages/events')}>Event announcements & discussions</ChatButton>}
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.kind === 'event_announcements' ? 'Announcements. ' : item.kind === 'event_discussion' ? 'Discussion. ' : ''}${item.unread ? `${item.unread} unread. ` : ''}${item.preview}`} accessibilityHint="Hold for chat options" onLongPress={() => options(item)} delayLongPress={350} onPress={() => open(item)} style={{ flexDirection: 'row', gap: 13, paddingHorizontal: 20, paddingVertical: 17, backgroundColor: item.unread ? '#FFFFFF' : undefined }}>
        {item.kind === 'direct' ? <ChatAvatar name={item.title} image={item.image} /> : <EventChannelIcon kind={item.kind} size={52} />}<View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: item.unread ? '800' : '600', color: b.premium }}>{item.title}</Text><Text style={{ color: b.muted, fontSize: 11 }}>{chatDate(item.updatedAt)}</Text></View>
          {item.kind !== 'direct' && <Text style={{ fontSize: 12, color: eventChannelStyle(item.kind).ink, fontWeight: '700', letterSpacing: 0.3 }}>{item.kind === 'event_announcements' ? 'Announcements · Organiser updates' : 'Discussion · Player chat'}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ color: b.muted, fontSize: 14, flex: 1 }}>{item.state === 'pending' ? 'Request sent · waiting for acceptance' : item.preview || 'Ready when you are'}</Text>{item.muted && <Ionicons name="notifications-off-outline" size={14} color={b.muted} />}{item.unread > 0 && <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: b.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, color: 'white', fontWeight: '700' }}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}</View>
        </View><Pressable accessibilityRole="button" accessibilityLabel={`Chat options for ${item.title}`} onPress={() => options(item)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-vertical" size={19} color={b.muted} /></Pressable></Pressable>}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: b.edge, marginLeft: 85, marginRight: 20 }} />}
      ListEmptyComponent={inbox.loading ? <ActivityIndicator style={{ margin: 35 }} color={b.accent} /> : inbox.error ? null : <ChatNotice title={inbox.status?.enabled ? filter === 'Requests' ? 'No requests waiting' : 'Start a conversation' : 'Your next connection starts here'}>{inbox.status?.enabled ? filter === 'Requests' ? 'New introductions from players will appear here. You decide who can chat with you.' : 'Message a player or open your event updates. Your conversations stay together here.' : 'Messaging is being prepared. Your player chats and private event updates will appear here when it opens.'}</ChatNotice>} />}
    <ErrorBanner message={active && !selected ? inbox.error : null} top={safe.top + 10} bottom={bottom} />
    <Modal visible={active && !!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,18,0.4)' }}><Pressable accessibilityRole="button" accessibilityLabel="Close chat options" onPress={() => setSelected(null)} style={{ flex: 1 }} /><View style={{ backgroundColor: b.elevated, padding: 22, paddingBottom: safe.bottom + 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 22, fontWeight: '700' }}>{selected?.title}</Text>
      <ChatButton quiet disabled={busy} onPress={() => void act('mark_unread')}>Mark as unread</ChatButton>
      {!!selected?.unread && <ChatButton quiet disabled={busy} onPress={() => void act('mark_read')}>Mark as read</ChatButton>}
      <ChatButton quiet disabled={busy} onPress={() => void act('member_settings', { muted: !selected?.muted })}>{selected?.muted ? 'Unmute conversation' : 'Mute conversation'}</ChatButton>
      <ChatButton quiet disabled={busy} onPress={() => void act('member_settings', { archived: !selected?.archived })}>{selected?.archived ? 'Move to inbox' : 'Archive conversation'}</ChatButton>
      {selected?.kind === 'direct' && <ChatButton danger disabled={busy} onPress={() => void act('block')}>Block player</ChatButton>}
      <ChatButton quiet disabled={busy} onPress={() => setSelected(null)}>Done</ChatButton>
    </View><ErrorBanner message={menuError || inbox.error} top={safe.top + 10} /></View></Modal>
  </View>;
}
