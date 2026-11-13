import { useHelpInbox } from '@/components/help-inbox-provider';
import { MfaVerification } from '@/components/messaging/mfa-verification';
import { conversationFilter } from '@/lib/help-inbox';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, RefreshControl, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { EventChannelIcon, eventChannelStyle } from '@/components/messaging/event-channels';
import { MessageRequestsButton } from '@/components/messaging/message-requests-button';
import { ChatAvatar, ChatButton, ChatNotice, ChatPill, chatDate } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { messaging, readConversation, type Conversation } from '@/lib/messaging';
import { saveMessageDraft } from '@/lib/messaging-drafts';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';
export default function MessagesScreen() {
  const router = useRouter(), safe = useSafeAreaInsets(), bottom = useTabScenePadding(), active = usePrivateMessagingScreen();
  const { requestPreview, filter: requestedFilter } = useLocalSearchParams<{ requestPreview?: string; filter?: string }>();
  // A local visual preview only; it never creates invitations or changes inbox data.
  const previewRequests = __DEV__ && requestPreview === '1';
  const [previewReplay, setPreviewReplay] = useState(0);
  const inbox = useMessagingInbox(), help = useHelpInbox();
  const [verifyHelp, setVerifyHelp] = useState(false);
  useEffect(() => { if (requestedFilter && ['All', 'Players', 'Groups', 'Events', 'Help'].includes(requestedFilter)) setFilter(requestedFilter); }, [requestedFilter]);
  const [filter, setFilter] = useState('All'), [query, setQuery] = useState('');
  const filterScroll = useRef<ScrollView>(null);
  useEffect(() => { if (active && filter === 'Help') filterScroll.current?.scrollToEnd({ animated: false }); }, [active, filter]);
  const [selected, setSelected] = useState<Conversation | null>(null), [busy, setBusy] = useState(false), [menuError, setMenuError] = useState('');
  const identity = useRef(0);
  useEffect(() => { identity.current++; setSelected(null); setMenuError(''); setBusy(false); }, [inbox.owner, active]);
  const options = (row: Conversation) => { setMenuError(''); setSelected(row); };
  const act = async (action: string, data: Record<string, unknown> = {}) => {
    if (!selected || busy) return; const epoch = identity.current; setBusy(true); setMenuError('');
    try {
      if (action === 'mark_read') { const page = await readConversation(selected.id); await messaging('mark_read', { conversationId: selected.id, seq: page.messages.at(-1)?.seq || 0 }); }
      else await messaging(action, { conversationId: selected.id, ...data });
      if (epoch === identity.current) {
        if (action === 'conversation_delete') { inbox.dismissNotice(); if (inbox.owner) void saveMessageDraft(inbox.owner, selected.id, '').catch(() => {}); }
        setSelected(null); await inbox.refresh();
      }
    } catch (e) { if (epoch === identity.current) setMenuError(e instanceof Error ? e.message : 'Could not update this chat.'); }
    finally { if (epoch === identity.current) setBusy(false); }
  };
  const confirmDelete = () => {
    if (!selected || busy) return;
    const version = identity.current;
    Alert.alert('Delete conversation?', 'This removes the conversation and its history for you. Other participants keep their messages. New messages will bring the conversation back.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { if (version === identity.current) void act('conversation_delete'); } },
    ]);
  };
  const confirmBlock = () => {
    if (!selected || selected.kind !== 'direct' || busy) return;
    const version = identity.current;
    Alert.alert(`Block ${selected.title}?`, 'You won’t be able to message each other. You can unblock this player in Messaging settings.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Block player', style: 'destructive', onPress: () => { if (version === identity.current) void act('block'); } },
    ]);
  };
  useEffect(() => { setQuery(''); setFilter('All'); }, [inbox.owner]);
  const requests = inbox.rows.filter(row => row.state === 'pending' && row.incoming).length;
  // Filter the screen only: empty event channels still need their realtime subscriptions.
  const rows = useMemo(() => !active ? [] : inbox.rows.filter(row =>
    (row.kind === 'direct' || row.kind === 'group' || row.kind === 'help' || !!row.lastMessageId)
    && conversationFilter(row, filter, query)), [inbox.rows, filter, query, active]);
  const counts = (value: string) => value === 'Help' ? help.unread : value === 'All' ? inbox.badge : inbox.rows.filter(row => row.kind !== 'help' && conversationFilter(row, value, '')).reduce((sum, row) => sum + row.unread, 0);
  const open = (row: Conversation) => router.push((row.kind === 'help' ? `/messages/help/${encodeURIComponent(row.id)}` : `/messages/${encodeURIComponent(row.id)}`) as Href);
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}>
    <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View style={{ flex: 1 }}><Text style={{ fontSize: 12, fontWeight: '700', color: b.accent, letterSpacing: 1.4 }}>YOUR COURTSIDE CONNECTION</Text><Text accessibilityRole="header" style={{ fontSize: 32, fontWeight: '800', letterSpacing: -1, color: b.premium, marginTop: 5 }}>Messages</Text></View>
      <Pressable accessibilityRole="button" accessibilityLabel={filter === 'Help' ? 'New help request' : 'New message'} onPress={() => router.push(filter === 'Help' ? '/help' : '/messages/new')} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: filter === 'Help' ? b.supportInk : b.messagingAction }}><Ionicons name="create-outline" size={24} color="#FFFFFF" /></Pressable>
    </View>
    {!active ? <View style={{ flex: 1, backgroundColor: b.page }} /> : <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ paddingBottom: bottom }} keyboardShouldPersistTaps="handled"
      refreshControl={<RefreshControl colors={[loadingBlue]} refreshing={inbox.loading} onRefresh={() => void inbox.refresh()} tintColor={loadingBlue} />}
      ListHeaderComponent={<View style={{ gap: 16, paddingHorizontal: 20, paddingBottom: 14 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: b.elevated, borderRadius: 14, paddingHorizontal: 14, borderWidth: 1, borderColor: b.edge }}><Ionicons name="search-outline" size={19} color={b.muted} /><TextInput accessibilityLabel="Search conversations" placeholder="Search your conversations" placeholderTextColor={b.placeholder} value={query} onChangeText={setQuery} style={{ flex: 1, minHeight: 48, color: b.premium, fontSize: 15 }} /></View>
        <ScrollView ref={filterScroll} horizontal showsHorizontalScrollIndicator={false} onContentSizeChange={() => { if (filter === 'Help') filterScroll.current?.scrollToEnd({ animated: false }); }} contentContainerStyle={{ gap: 8 }}>{['All', 'Players', ...(inbox.status?.groupsEnabled ? ['Groups'] : []), 'Events', 'Help'].map(value => <ChatPill key={value} active={filter === value} activeColor={value === 'Help' ? b.supportInk : undefined} onPress={() => { setFilter(value); router.setParams({ filter: value }); }}>{value}{counts(value) > 0 ? ` (${counts(value) > 99 ? '99+' : counts(value)})` : ''}</ChatPill>)}</ScrollView>
        {filter !== 'Help' && <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><MessageRequestsButton key={previewRequests ? `preview-${previewReplay}` : 'requests'} count={previewRequests ? 3 : requests} selected={!previewRequests && filter === 'Requests'} onPress={() => previewRequests ? setPreviewReplay(value => value + 1) : setFilter(filter === 'Requests' ? 'All' : 'Requests')} /><Pressable accessibilityRole="button" onPress={() => setFilter(filter === 'Archived' ? 'All' : 'Archived')} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.muted }}>{filter === 'Archived' ? 'Back to inbox' : 'Archived'}</Text></Pressable></View>}
        {previewRequests && <View style={{ gap: 6 }}>
          <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>Preview: 3 example requests. Your inbox is unchanged.</Text>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <ChatButton quiet style={{ flex: 1 }} onPress={() => setPreviewReplay(value => value + 1)}>Replay jiggle</ChatButton>
            <ChatButton quiet style={{ flex: 1 }} onPress={() => router.setParams({ requestPreview: '' })}>Exit preview</ChatButton>
          </View>
        </View>}
        {filter === 'Help' && help.needsVerification && <View style={{ gap: 12 }}><ChatButton quiet onPress={() => setVerifyHelp(value => !value)}>Verify to manage event requests</ChatButton>{verifyHelp && <MfaVerification purpose="help" onVerified={() => { setVerifyHelp(false); void help.refresh(); }} onError={setMenuError} />}</View>}
        {!!help.error && filter === 'Help' && <Text style={{ color: b.muted }}>{help.error}</Text>}
        {filter !== 'Help' && inbox.status?.enabled && !inbox.status.interactive && <Pressable accessibilityRole="button" onPress={() => router.push('/settings/messaging')} style={{ padding: 16, borderRadius: 14, backgroundColor: '#E5EDD8', gap: 5 }}><Text style={{ color: b.premium, fontWeight: '700' }}>A quick check before you chat</Text><Text style={{ color: b.muted, lineHeight: 20 }}>Finish messaging setup. Event announcements stay available to registered players.</Text></Pressable>}
        {!!inbox.error && <ChatButton quiet onPress={() => void inbox.refresh()}>Try again</ChatButton>}
        {filter !== 'Help' && inbox.status?.enabled && <Pressable accessibilityRole="button" accessibilityLabel="Event chats" accessibilityHint="Choose an event to read organiser announcements and player discussions" onPress={() => router.push('/messages/events')} android_ripple={{ color: b.panel }} style={{ borderRadius: 16, borderWidth: 1, borderColor: '#CBDBEC', backgroundColor: b.elevated, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 }}>
            <View accessible={false} style={{ width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E5EFFB' }}><Ionicons name="calendar-outline" size={23} color={b.messagingAction} /></View>
            <View style={{ flex: 1, minWidth: 0, gap: 4 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>Event chats</Text><Text style={{ color: b.muted, fontSize: 13, lineHeight: 19 }}>Browse organiser announcements and player discussions</Text></View>
            <Ionicons name="chevron-forward" size={20} color={b.messagingAction} />
          </View>
        </Pressable>}
      </View>}
      renderItem={({ item }) => <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.kind === 'event_announcements' ? 'Announcements. ' : item.kind === 'event_discussion' ? 'Discussion. ' : ''}${item.unread ? `${item.unread} unread. ` : ''}${item.preview}`} accessibilityHint={item.kind === 'help' ? 'Open help conversation' : 'Hold for chat options'} onLongPress={item.kind === 'help' ? undefined : () => options(item)} delayLongPress={350} onPress={() => open(item)} style={{ flexDirection: 'row', gap: 13, paddingHorizontal: 20, paddingVertical: 17, backgroundColor: item.unread ? '#FFFFFF' : undefined }}>
        {item.kind === 'help' ? <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: b.supportTint }}><Ionicons name="chatbox-ellipses-outline" size={25} color={b.supportInk} /></View> : item.kind === 'direct' ? <ChatAvatar name={item.title} image={item.image} /> : item.kind === 'group' ? <View style={{ width: 52, height: 52, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: '#E8EFF8' }}><Ionicons name="people-outline" size={26} color="#245B87" /></View> : <EventChannelIcon kind={item.kind} size={52} />}<View style={{ flex: 1, gap: 5 }}><View style={{ flexDirection: 'row', gap: 12, alignItems: 'baseline' }}><Text numberOfLines={1} style={{ flex: 1, fontSize: 16, fontWeight: item.unread ? '800' : '600', color: b.premium }}>{item.title}</Text><Text style={{ color: b.muted, fontSize: 11 }}>{chatDate(item.updatedAt)}</Text></View>
          {(item.kind !== 'direct' || item.official) && <Text style={{ fontSize: 12, color: item.kind === 'help' ? b.supportInk : item.kind === 'group' || item.official ? '#245B87' : eventChannelStyle(item.kind).ink, fontWeight: '700' }}>{item.kind === 'help' ? `Help · ${item.helpRequest?.isOwner ? item.helpRequest.recipient : item.helpRequest?.eventName || item.helpRequest?.recipient}` : item.kind === 'group' ? `Group chat · ${item.memberCount || 1} joined` : item.official ? 'Admin conversation' : item.kind === 'event_announcements' ? 'Announcements · Organiser updates' : 'Discussion · Player chat'}</Text>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Text numberOfLines={1} style={{ color: b.muted, fontSize: 14, flex: 1 }}>{item.state === 'pending' ? 'Request sent · waiting for acceptance' : item.preview || 'Ready when you are'}</Text>{item.muted && <Ionicons name="notifications-off-outline" size={14} color={b.muted} />}{item.unread > 0 && <View style={{ minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: item.kind === 'help' ? b.supportInk : b.accent, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: 11, color: 'white', fontWeight: '700' }}>{item.unread > 99 ? '99+' : item.unread}</Text></View>}</View>
        </View>{item.kind !== 'help' && <Pressable accessibilityRole="button" accessibilityLabel={`Chat options for ${item.title}`} onPress={() => options(item)} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-vertical" size={19} color={b.muted} /></Pressable>}</Pressable>}
      ListFooterComponent={filter === 'Help' && help.next ? <View style={{ padding: 20 }}><ChatButton quiet disabled={help.loading} onPress={() => void help.loadMore()}>Earlier help conversations</ChatButton></View> : null}
      ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: b.edge, marginLeft: 85, marginRight: 20 }} />}
      ListEmptyComponent={inbox.loading ? <ActivityIndicator style={{ margin: 35 }} color={loadingBlue} /> : inbox.error ? null : <ChatNotice title={filter === 'Help' ? 'No help conversations' : inbox.status?.enabled ? filter === 'Requests' ? 'No requests waiting' : 'Start a conversation' : 'Your next connection starts here'}>{filter === 'Help' ? 'Your requests and replies from event organisers and 4M support appear here.' : inbox.status?.enabled ? filter === 'Requests' ? 'New introductions from players will appear here. You decide who can chat with you.' : 'Message a player or open your event updates. Your conversations stay together here.' : 'Messaging is being prepared. Your player chats and private event updates will appear here when it opens.'}</ChatNotice>} />}
    <ErrorBanner message={active && !selected ? menuError || inbox.error : null} top={safe.top + 10} bottom={bottom} />
    <Modal visible={active && !!selected} transparent animationType="slide" onRequestClose={() => setSelected(null)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,18,0.4)' }}><Pressable accessibilityRole="button" accessibilityLabel="Close chat options" onPress={() => setSelected(null)} style={{ flex: 1 }} /><View style={{ backgroundColor: b.elevated, padding: 22, paddingBottom: safe.bottom + 20, borderTopLeftRadius: 24, borderTopRightRadius: 24, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 22, fontWeight: '700' }}>{selected?.title}</Text>
      <ChatButton quiet disabled={busy} onPress={() => void act('mark_unread')}>Mark as unread</ChatButton>
      {!!selected?.unread && <ChatButton quiet disabled={busy} onPress={() => void act('mark_read')}>Mark as read</ChatButton>}
      <ChatButton quiet disabled={busy} onPress={() => void act('member_settings', { muted: !selected?.muted })}>{selected?.muted ? 'Unmute conversation' : 'Mute conversation'}</ChatButton>
      <ChatButton quiet disabled={busy} onPress={() => void act('member_settings', { archived: !selected?.archived })}>{selected?.archived ? 'Move to inbox' : 'Archive conversation'}</ChatButton>
      {(selected?.kind === 'direct' || selected?.kind === 'group') && <ChatButton danger disabled={busy} onPress={confirmDelete}>Delete conversation</ChatButton>}
      {selected?.kind === 'direct' && <ChatButton warning disabled={busy} onPress={confirmBlock}>Block player</ChatButton>}
      <ChatButton quiet disabled={busy} onPress={() => setSelected(null)}>Done</ChatButton>
    </View><ErrorBanner message={menuError || inbox.error} top={safe.top + 10} /></View></Modal>
  </View>;
}
