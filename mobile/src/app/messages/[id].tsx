import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { eventRoleLabel, messaging, readConversation, sendMessage, newMessageKey, mergeMessages, type ChatCard, type ChatMessage, type Conversation, type MessagingReport, MessagingError } from '@/lib/messaging';
import { loadMessageDraft, saveMessageDraft } from '@/lib/messaging-drafts';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { EventChannelIcon, eventChannelStyle } from '@/components/messaging/event-channels';
import { ChatButton, ChatNotice } from '@/components/messaging/ui';
import { MessageBubble } from '@/components/messaging/message-bubble';
import { EventSharePicker } from '@/components/messaging/event-share-picker';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

type Pending = { key: string; body: string; reply?: ChatMessage; card?: ChatCard; failed: boolean };
export default function ConversationScreen() {
  const { id } = useLocalSearchParams<{ id: string }>(), router = useRouter(), safe = useSafeAreaInsets();
  const active = usePrivateMessagingScreen(), inbox = useMessagingInbox();
  const [conversation, setConversation] = useState<Conversation | null>(null), [messages, setMessages] = useState<ChatMessage[]>([]), [next, setNext] = useState<number | null>(null);
  const [loading, setLoading] = useState(true), [older, setOlder] = useState(false), [error, setError] = useState(''), [loadError, setLoadError] = useState(''), [notice, setNotice] = useState('');
  const [body, setBody] = useState(''), [reply, setReply] = useState<ChatMessage | undefined>(), [card, setCard] = useState<ChatCard | undefined>();
  const [pending, setPending] = useState<Pending | null>(null), [busy, setBusy] = useState(false), [menu, setMenu] = useState<'chat' | 'message' | 'report' | 'reports' | 'entrants' | null>(null);
  const [choosingEvent, setChoosingEvent] = useState(false);
  const [entrants, setEntrants] = useState<{ id: string; name: string; confirmed: boolean }[]>([]);
  const [selected, setSelected] = useState<ChatMessage | null>(null), [reports, setReports] = useState<MessagingReport[]>([]);
  const fetchEpoch = useRef(0);
  const epoch = useRef(0), list = useRef<FlatList<ChatMessage>>(null), lock = useRef(false), textEdited = useRef(false), scrollEnd = useRef(true);
  const fetchPage = useCallback(async (before?: number) => {
    if (!active || !inbox.owner) return;
    const version = epoch.current, request = ++fetchEpoch.current;
    if (before) setOlder(true); else setLoading(true);
    try {
      const page = await readConversation(id, before);
      if (version !== epoch.current || request !== fetchEpoch.current) return;
      setConversation(page.conversation); setNext(page.next); setLoadError('');
      // A refresh replaces visible data so deletion, blocking and permission changes
      // cannot leave stale message bodies in a merged local cache.
      setMessages(previous => before ? [...new Map([...previous, ...page.messages].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq).slice(0, 300) : page.messages);
      const last = page.messages.at(-1);
      if (last) void messaging('mark_read', { conversationId: id, seq: last.seq }).then(() => inbox.refresh()).catch(() => {});
    } catch (e) {
      if (version !== epoch.current || request !== fetchEpoch.current) return;
      setLoadError(e instanceof Error ? e.message : 'Could not load this conversation.');
      if (!before || (e instanceof MessagingError && e.denied)) { setMessages([]); setConversation(null); }
    } finally { if (version === epoch.current && request === fetchEpoch.current) { setLoading(false); setOlder(false); } }
  }, [id, active, inbox.owner, inbox.refresh]);
  useEffect(() => {
    epoch.current++; textEdited.current = false;
    setMessages([]); setConversation(null); setBody(''); setPending(null); setReply(undefined); setCard(undefined); setChoosingEvent(false); setMenu(null); setSelected(null); setError(''); setLoadError(''); setNotice(''); lock.current = false; setBusy(false);
    if (!active || !inbox.owner) return;
    const version = epoch.current;
    void loadMessageDraft(inbox.owner, id).then(text => { if (version === epoch.current && !textEdited.current) setBody(text); }).catch(() => { if (version === epoch.current) setError('Your saved draft could not be restored.'); });
    void fetchPage();
    return () => { epoch.current++; };
  }, [id, active, inbox.owner, fetchPage]);
  useEffect(() => { if (active) void fetchPage(); }, [inbox.revision, active, fetchPage]);
  useEffect(() => {
    if (!active || !inbox.owner || !textEdited.current) return;
    const owner = inbox.owner, version = epoch.current;
    const timer = setTimeout(() => { void saveMessageDraft(owner, id, body).catch(() => { if (version === epoch.current) setError('Your draft could not be saved on this device. Keep this screen open to preserve it.'); }); }, 450);
    return () => clearTimeout(timer);
  }, [body, active, id, inbox.owner]);
  const run = async (action: string, data: Record<string, unknown> = {}, exit = false) => {
    if (lock.current) return; lock.current = true; setBusy(true); setError(''); const version = epoch.current;
    try {
      await messaging(action, { conversationId: id, ...(conversation?.group ? { groupsVersion: '1' } : {}), ...data });
      if (version !== epoch.current) return;
      setMenu(null); setSelected(null);
      if (action === 'report') setNotice('Your report has been sent for review.');
      if (exit) { void inbox.refresh(); if (action === 'mark_unread') router.replace('/(tabs)/messages'); else router.back(); } else { await fetchPage(); void inbox.refresh(); }
    } catch (e) { if (version === epoch.current) setError(e instanceof Error ? e.message : 'Could not save this change.'); }
    finally { if (version === epoch.current) { lock.current = false; setBusy(false); } }
  };
  const send = async () => {
    if (lock.current || !conversation?.canSend || (!body.trim() && !card)) return;
    const version = epoch.current;
    const message = pending && pending.body === body && pending.reply?.id === reply?.id && pending.card?.eventId === card?.eventId ? pending : { key: newMessageKey(), body, reply, card, failed: false };
    lock.current = true; setBusy(true); setError(''); setPending({ ...message, failed: false }); scrollEnd.current = true;
    try {
      const sent = await sendMessage(id, message.body, message.key, message.reply?.id, message.card);
      if (version !== epoch.current) return;
      setMessages(previous => mergeMessages(previous, [sent])); setPending(null); setBody(''); setReply(undefined); setCard(undefined); textEdited.current = true;
      if (inbox.owner) void saveMessageDraft(inbox.owner, id, '').catch(() => {});
      void inbox.refresh();
    } catch (e) {
      if (version === epoch.current) { setPending({ ...message, failed: true }); setError(e instanceof Error ? e.message : 'Could not send. Try again.'); }
    } finally { if (version === epoch.current) { lock.current = false; setBusy(false); } }
  };
  const openReports = async () => {
    const version = epoch.current; setError('');
    try { const values = await messaging<MessagingReport[]>('reports', { conversationId: id }); if (version === epoch.current) { setReports(values); setMenu('reports'); } }
    catch (e) { if (version === epoch.current) setError(e instanceof Error ? e.message : 'Could not load reports.'); }
  };
  const bubble = ({ item }: { item: ChatMessage }) => <MessageBubble message={item} kind={conversation?.kind || 'direct'}
    onOptions={() => { setSelected(item); setMenu('message'); }}
    onCardPress={value => router.push({ pathname: '/events/[id]', params: { id: String(value.eventId), tab: value.tab } })} />;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={safe.top + 44} style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: conversation?.kind === 'event_announcements' ? 'Announcements' : conversation?.kind === 'event_discussion' ? 'Event discussion' : conversation?.title || 'Conversation', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false,
      headerRight: () => <Pressable accessibilityRole="button" accessibilityLabel="Conversation options" onPress={() => setMenu('chat')} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="ellipsis-horizontal" size={23} color={b.premium} /></Pressable> }} />
    {!active ? <View style={{ flex: 1 }} /> : <>
      {conversation?.group && <Pressable accessibilityRole="button" accessibilityLabel="View group members" onPress={() => router.push({ pathname: '/messages/group-members', params: { conversationId: id } })} style={{ paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, flexDirection: 'row', alignItems: 'center', gap: 12 }}><Ionicons name="people-outline" size={22} color="#245B87" /><View style={{ flex: 1 }}><Text style={{ color: b.premium, fontSize: 14, fontWeight: '600' }}>{conversation.memberCount || 1} joined</Text><Text style={{ color: b.muted, fontSize: 12, marginTop: 3 }}>View members and invitations</Text></View><Ionicons name="chevron-forward" size={18} color={b.muted} /></Pressable>}
      {conversation?.official && !conversation.group && <Text style={{ color: '#245B87', backgroundColor: '#E8EFF8', paddingHorizontal: 20, paddingVertical: 10, fontSize: 13 }}>{conversation.organisation ? `${conversation.organisation} · Private admin conversation` : 'Private admin conversation'}</Text>}
      {conversation?.eventId && <Pressable accessibilityRole="link" onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(conversation.eventId) } })} style={{ paddingHorizontal: 18, paddingVertical: 13, backgroundColor: eventChannelStyle(conversation.kind).surface, borderBottomWidth: 1, borderBottomColor: eventChannelStyle(conversation.kind).edge, borderLeftWidth: 4, borderLeftColor: eventChannelStyle(conversation.kind).ink, flexDirection: 'row', alignItems: 'center', gap: 12 }}><EventChannelIcon kind={conversation.kind} size={40} /><View style={{ flex: 1 }}><Text numberOfLines={3} style={{ color: b.premium, fontWeight: '700', fontSize: 16, lineHeight: 22 }}>{conversation.title}</Text><Text style={{ color: eventChannelStyle(conversation.kind).ink, fontSize: 12, fontWeight: '600', marginTop: 5 }}>{conversation.kind === 'event_announcements' ? 'Announcements · Official organiser updates' : 'Discussion · Players + event team'}</Text></View><Text style={{ color: b.accent, fontWeight: '600', fontSize: 13 }}>Details ↗</Text></Pressable>}
      {conversation?.pinned && <View style={{ margin: 12, padding: 13, borderRadius: 12, borderWidth: 1, borderColor: '#D4E2B4', backgroundColor: '#EEF4E2', flexDirection: 'row', gap: 10 }}><Ionicons name="pin-outline" size={17} color={b.accent} /><View style={{ flex: 1 }}><Text style={{ color: b.accent, fontWeight: '700', fontSize: 11 }}>PINNED BY YOUR ORGANISER</Text><Text numberOfLines={3} style={{ color: b.premium, marginTop: 4, lineHeight: 20 }}>{conversation.pinned.body || conversation.pinned.card?.title}</Text></View></View>}
      <FlatList ref={list} data={messages} keyExtractor={m => m.id} renderItem={bubble} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, flexGrow: 1 }}
        onScroll={event => { const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent; scrollEnd.current = contentSize.height - contentOffset.y - layoutMeasurement.height < 150; }} scrollEventThrottle={100}
        onContentSizeChange={() => { if (scrollEnd.current) list.current?.scrollToEnd({ animated: false }); }}
        ListHeaderComponent={next ? <ChatButton quiet disabled={older} onPress={() => { scrollEnd.current = false; void fetchPage(next); }}>{older ? 'Loading…' : 'Earlier messages'}</ChatButton> : <Text style={{ textAlign: 'center', color: b.muted, fontSize: 11, lineHeight: 17, paddingBottom: 18 }}>{conversation?.group ? 'Your history starts when you joined. The original invitation is also shown.' : conversation?.kind === 'event_discussion' ? 'You can see discussion from when you became eligible. Event organisers can moderate this conversation.' : 'Your contact details stay private. You can report or block from the conversation options.'}</Text>}
        ListEmptyComponent={loading ? <ActivityIndicator color={loadingBlue} style={{ margin: 35 }} /> : !error && !loadError ? <ChatNotice title={conversation?.kind === 'event_announcements' ? 'You’re in the loop' : 'Room for a conversation'}>{conversation?.kind === 'event_announcements' ? 'Your organiser’s updates will appear here.' : 'A good game often starts with a hello.'}</ChatNotice> : null}
        ListFooterComponent={pending && <View style={{ alignSelf: 'flex-end', maxWidth: '88%', borderRadius: 16, backgroundColor: '#E3EDCB', padding: 13, gap: 8, opacity: 0.7 }}><Text style={{ color: b.premium, fontSize: 16, lineHeight: 23 }}>{pending.body || pending.card?.title}</Text><Text style={{ color: pending.failed ? b.danger : b.muted, fontSize: 11 }}>{pending.failed ? 'Not sent · tap Send to retry' : 'Sending…'}</Text></View>} />
      {!!loadError && !conversation && <View style={{ paddingHorizontal: 18, paddingVertical: 10 }}><ChatButton quiet onPress={() => void fetchPage()}>Try again</ChatButton></View>}
      {!!notice && <Text style={{ color: b.muted, paddingHorizontal: 18, fontSize: 12 }}>{notice}</Text>}
      {conversation?.state === 'pending' && conversation.incoming ? <View style={{ padding: 18, paddingBottom: safe.bottom + 16, backgroundColor: b.elevated, gap: 12 }}><Text style={{ color: b.muted, lineHeight: 21 }}>{conversation.group ? 'Accept to join this group. Members can see your profile and messages from when you join.' : 'Accept this introduction to continue. Your contact details stay private.'}</Text><View style={{ flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><HomeAction label={conversation.group ? 'Join group' : 'Accept'} kind="primary" fullWidth accentColor={b.messagingAction} disabled={busy} onPress={() => void run('respond', { response: 'accept' })} /></View><View style={{ flex: 1 }}><HomeAction label="Decline" kind="outline" fullWidth accentColor={b.muted} disabled={busy} onPress={() => void run('respond', { response: 'decline' }, true)} /></View></View></View> : conversation?.canSend ? <View style={{ paddingHorizontal: 12, paddingTop: 9, paddingBottom: Math.max(safe.bottom, 10), borderTopWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, gap: 7 }}>
        {(reply || card) && <View style={{ padding: 10, backgroundColor: b.surface, borderRadius: 10, flexDirection: 'row', gap: 10 }}><View style={{ flex: 1 }}><Text style={{ color: b.accent, fontWeight: '600', fontSize: 12 }}>{reply ? `Replying to ${reply.mine ? 'yourself' : reply.sender.name}${conversation?.kind !== 'direct' ? ' · ' + eventRoleLabel(reply.sender.role) : ''}` : 'Share event'}</Text><Text numberOfLines={1} style={{ color: b.muted, fontSize: 13 }}>{reply?.body || card?.title}</Text></View><Pressable accessibilityRole="button" accessibilityLabel="Remove reply or card" onPress={() => { setReply(undefined); setCard(undefined); }} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={20} color={b.muted} /></Pressable></View>}
        <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>{<Pressable accessibilityRole="button" accessibilityLabel="Share a 4M event" disabled={busy} onPress={() => setChoosingEvent(true)} style={{ minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="add" size={27} color={b.accent} /></Pressable>}<TextInput accessibilityLabel="Message" value={body} onChangeText={text => { textEdited.current = true; setBody(text); }} multiline maxLength={4000} editable={!busy} placeholder="Message…" placeholderTextColor={b.placeholder} style={{ flex: 1, maxHeight: 130, minHeight: 48, paddingVertical: 13, paddingHorizontal: 14, backgroundColor: b.page, borderRadius: 20, fontSize: 16, color: b.premium }} /><Pressable accessibilityRole="button" accessibilityLabel={pending?.failed ? 'Retry sending message' : 'Send message'} accessibilityState={{ disabled: busy || (!body.trim() && !card) }} disabled={busy || (!body.trim() && !card)} onPress={() => void send()} style={{ width: 48, height: 48, borderRadius: 24, backgroundColor: b.messagingAction, alignItems: 'center', justifyContent: 'center', opacity: busy || (!body.trim() && !card) ? 0.45 : 1 }}>{busy ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="arrow-up" size={24} color="#FFFFFF" />}</Pressable></View>
      </View> : conversation && <View style={{ padding: 18, paddingBottom: safe.bottom + 18, backgroundColor: b.elevated }}><Text style={{ color: b.muted, lineHeight: 21, textAlign: 'center' }}>{conversation.reason || 'This conversation is read-only.'}</Text></View>}
    </>}
    <EventSharePicker visible={active && choosingEvent} onClose={() => setChoosingEvent(false)} onSelect={value => { setCard(value); setChoosingEvent(false); }} />
    <ErrorBanner message={active && !menu && !choosingEvent ? error || loadError : null} />
    <Modal visible={active && !!menu} animationType="slide" transparent onRequestClose={() => setMenu(null)}><View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(10,25,18,0.4)' }}><Pressable accessibilityRole="button" accessibilityLabel="Close options" onPress={() => setMenu(null)} style={{ flex: 1 }} /><ScrollView style={{ maxHeight: '80%', backgroundColor: b.elevated, borderTopLeftRadius: 24, borderTopRightRadius: 24 }} contentContainerStyle={{ padding: 22, paddingBottom: safe.bottom + 20, gap: 12 }}>
      <Text accessibilityRole="header" style={{ fontSize: 22, fontWeight: '700', color: b.premium, marginBottom: 6 }}>{menu === 'report' ? 'Report message' : menu === 'reports' ? 'Event reports' : 'Options'}</Text>
      {menu === 'chat' && conversation && <>
        <ChatButton quiet disabled={busy} onPress={() => void run('mark_unread', {}, true)}>Mark as unread</ChatButton>
        <ChatButton quiet disabled={busy} onPress={() => void run('member_settings', { muted: !conversation.muted })}>{conversation.muted ? 'Unmute conversation' : 'Mute conversation'}</ChatButton>
        <ChatButton quiet disabled={busy} onPress={() => void run('member_settings', { archived: !conversation.archived }, true)}>{conversation.archived ? 'Move to inbox' : 'Archive conversation'}</ChatButton>
        {conversation.group && <><ChatButton quiet onPress={() => { setMenu(null); router.push({ pathname: '/messages/group-members', params: { conversationId: id } }); }}>Group members</ChatButton><ChatButton danger disabled={busy} onPress={() => Alert.alert('Leave this group?', 'You will lose access to its messages and stop receiving new messages.', [{ text: 'Cancel', style: 'cancel' }, { text: 'Leave group', style: 'destructive', onPress: () => void run('group_leave', {}, true) }])}>Leave group</ChatButton></>}{conversation.kind === 'direct' && <ChatButton danger disabled={busy} onPress={() => void run('block', {}, true)}>Block player</ChatButton>}
        {conversation.kind === 'event_discussion' && <ChatButton danger disabled={busy} onPress={() => void run('member_settings', { left: true }, true)}>Leave discussion</ChatButton>}
        {conversation.manager && <><ChatButton quiet disabled={busy} onPress={() => void run('pause', { paused: !conversation.paused })}>{conversation.paused ? 'Resume discussion' : 'Pause discussion'}</ChatButton><ChatButton quiet onPress={() => void openReports()}>Review event reports</ChatButton><ChatButton quiet onPress={() => { const version = epoch.current; void messaging<{ id: string; name: string; confirmed: boolean }[]>('entrants', { conversationId: id }).then(rows => { if (version === epoch.current) { setEntrants(rows); setMenu('entrants'); } }).catch(e => { if (version === epoch.current) setError(e.message); }); }}>Approve discussion access</ChatButton>{conversation.pinned && <ChatButton quiet disabled={busy} onPress={() => void run('pin', { messageId: null })}>Unpin announcement</ChatButton>}</>}
      </>}
      {menu === 'message' && selected && <>
        <ChatButton quiet disabled={busy} onPress={() => void run('mark_unread', { messageId: selected.id }, true)}>Mark as unread</ChatButton>
        {conversation?.canSend && <ChatButton quiet onPress={() => { setReply(selected); setMenu(null); }}>Reply</ChatButton>}
        {!!selected.sender.id && !selected.mine && <ChatButton quiet onPress={() => { setMenu(null); router.push({ pathname: '/players/[id]', params: { id: selected.sender.id! } }); }}>View player</ChatButton>}
        {selected.mine && <ChatButton danger disabled={busy} onPress={() => void run('delete', { messageId: selected.id })}>Remove my message</ChatButton>}
        {!selected.mine && <ChatButton danger onPress={() => setMenu('report')}>Report message</ChatButton>}
        {conversation?.manager && conversation.kind === 'event_announcements' && <ChatButton quiet disabled={busy} onPress={() => void run('pin', { messageId: selected.id })}>Pin announcement</ChatButton>}
        {conversation?.manager && !selected.mine && <ChatButton danger disabled={busy} onPress={() => void run('remove', { messageId: selected.id })}>Remove from event discussion</ChatButton>}
      </>}
      {menu === 'report' && selected && <><Text style={{ color: b.muted, lineHeight: 22 }}>The reported message and its visible reply context will be shared with the relevant moderation team.</Text>{[['spam', 'Spam or scam'], ['harassment', 'Harassment'], ['unsafe', 'Safety concern'], ['other', 'Something else']].map(([reason, title]) => <ChatButton key={reason} quiet disabled={busy} onPress={() => void run('report', { messageId: selected.id, reason })}>{title}</ChatButton>)}</>}
      {menu === 'reports' && (reports.length ? reports.map(report => <View key={report.id} style={{ borderWidth: 1, borderColor: b.edge, borderRadius: 14, padding: 16, gap: 10 }}><Text style={{ color: b.accent, fontWeight: '700' }}>{report.reason}</Text><Text style={{ color: b.premium }}>{report.evidence.body}</Text><ChatButton quiet disabled={busy} onPress={() => void run('resolve_report', { reportId: report.id })}>Mark reviewed</ChatButton></View>) : <Text style={{ color: b.muted }}>No reports are waiting for review.</Text>)}
      {menu === 'entrants' && (entrants.some(player => !player.confirmed) ? entrants.filter(player => !player.confirmed).map(player => <ChatButton key={player.id} quiet disabled={busy} onPress={() => void run('approve', { playerId: Number(player.id) })}>Approve {player.name}</ChatButton>) : <Text style={{ color: b.muted }}>All current messaging accounts are confirmed for discussion.</Text>)}
      <ChatButton quiet onPress={() => setMenu(null)}>Done</ChatButton>
    </ScrollView><ErrorBanner message={error || loadError} top={safe.top + 10} /></View></Modal>
  </KeyboardAvoidingView>;
}
