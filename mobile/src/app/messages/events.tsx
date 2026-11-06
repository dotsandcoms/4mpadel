import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { messaging, type Conversation, type MessagingEvent } from '@/lib/messaging';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { ChatButton, ChatNotice } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { EventChannelOption, EventChatHeading, EventDirectoryItem } from '@/components/messaging/event-channels';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { lightBrand as b } from '@/theme/tokens';
type Resource = { owner: string | null; eventId: number | null; events: MessagingEvent[]; channels: Conversation[] };
export default function EventMessages() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>(), router = useRouter(), inbox = useMessagingInbox(), active = usePrivateMessagingScreen();
  const selectedId = eventId && /^[1-9]\d*$/.test(eventId) && Number.isSafeInteger(Number(eventId)) ? Number(eventId) : null;
  const [resource, setResource] = useState<Resource>({ owner: null, eventId: null, events: [], channels: [] });
  const [error, setError] = useState(''), [loading, setLoading] = useState(true), [joining, setJoining] = useState(false), [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState({ owner: inbox.owner, value: '' });
  const epoch = useRef(0);
  const visible = active && resource.owner === inbox.owner && resource.eventId === selectedId;
  const events = visible ? resource.events : [], channels = visible ? resource.channels : [];
  const query = search.owner === inbox.owner ? search.value : '';
  const filtered = useMemo(() => events.filter(event => `${event.title} ${event.date?.slice(0, 10)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [events, query]);
  const unread = useMemo(() => { const totals = new Map<number, number>(); for (const row of inbox.rows) if (row.eventId && !row.archived) totals.set(row.eventId, (totals.get(row.eventId) || 0) + row.unread); return totals; }, [inbox.rows]);
  useEffect(() => {
    const current = ++epoch.current; setError(''); setJoining(false); setResource({ owner: inbox.owner, eventId: selectedId, events: [], channels: [] });
    if (!active || !inbox.owner) { setLoading(false); return; }
    setLoading(true);
    const owner = inbox.owner;
    const request = selectedId ? messaging<Conversation[]>('open_event', { eventId: selectedId }).then(channels => ({ owner, eventId: selectedId, events: [], channels })) : messaging<MessagingEvent[]>('events').then(events => ({ owner, eventId: null, events, channels: [] }));
    void request.then(result => { if (current === epoch.current) setResource(result); }).catch(e => { if (current === epoch.current) { setResource({ owner, eventId: selectedId, events: [], channels: [] }); setError(e.message); } }).finally(() => { if (current === epoch.current) setLoading(false); });
    return () => { epoch.current++; };
  }, [selectedId, active, inbox.owner, attempt]);
  const notices = <>{loading && <ActivityIndicator style={{ margin: 30 }} color={b.accent} />}{!!error && <View style={{ gap: 12, marginBottom: 16 }}><ChatButton quiet onPress={() => setAttempt(v => v + 1)}>Try again</ChatButton><ChatButton quiet onPress={() => router.push('/settings/messaging')}>Messaging settings & verification</ChatButton></View>}</>;
  const open = (row: Conversation) => router.push({ pathname: '/messages/[id]', params: { id: row.id } });
  const announcement = channels.find(row => row.kind === 'event_announcements'), discussion = channels.find(row => row.kind === 'event_discussion');
  const currentRow = (row: Conversation) => inbox.rows.find(current => current.id === row.id) || row;
  const title = channels[0]?.title || '';
  const setupDetail = inbox.status?.needsBirthDate ? 'Add your date of birth privately in your profile to join the player chat.' : !inbox.status?.interactive ? 'Complete messaging setup to chat with players and the event team.' : 'Discussion is for confirmed players. Complete your entry or ask the organiser to approve access.';
  const setup = async () => {
    if (!inbox.status?.interactive) { router.push(inbox.status?.needsBirthDate ? '/edit-profile' : '/settings/messaging'); return; }
    if (joining) return; const current = epoch.current; setJoining(true);
    try { await messaging('join_discussion', { eventId: selectedId }); if (current === epoch.current) setAttempt(v => v + 1); }
    catch (e) { if (current === epoch.current) setError(e instanceof Error ? e.message : 'Could not join this discussion.'); }
    finally { if (current === epoch.current) setJoining(false); }
  };
  return <View style={{ flex: 1, backgroundColor: b.page }}><Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: selectedId ? 'Event conversations' : 'Your events', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {!active ? null : selectedId ? <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 36 }}>
      {title ? <><EventChatHeading title={title} onDetails={() => router.push({ pathname: '/events/[id]', params: { id: String(selectedId) } })} /><Text style={{ color: b.premium, fontSize: 18, fontWeight: '700', marginBottom: 16 }}>Choose a conversation</Text></> : null}
      {notices}
      {announcement && <EventChannelOption kind="event_announcements" eventTitle={title} conversation={currentRow(announcement)} onPress={() => open(announcement)} />}
      {discussion ? <EventChannelOption kind="event_discussion" eventTitle={title} conversation={currentRow(discussion)} onPress={() => open(discussion)} /> : announcement && <EventChannelOption kind="event_discussion" eventTitle={title} setupDetail={setupDetail} actionLabel={inbox.status?.needsBirthDate ? 'Complete private profile' : !inbox.status?.interactive ? 'Finish messaging setup' : 'Join discussion'} busy={joining} onPress={() => void setup()} />}
      {!loading && !error && !channels.length && <ChatNotice title="Event conversations unavailable">Open an event you have entered or manage to see its announcements and discussion.</ChatNotice>}
    </ScrollView> : <FlatList data={filtered} keyExtractor={event => String(event.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: 36 }}
      ListHeaderComponent={<View style={{ gap: 14, marginBottom: 18 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 29, fontWeight: '800', letterSpacing: -0.6 }}>Your event conversations</Text><Text style={{ color: b.muted, fontSize: 15, lineHeight: 23 }}>Choose an event first, then read announcements or join its player discussion.</Text><View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: b.edge, backgroundColor: b.elevated, borderRadius: 13, paddingHorizontal: 13 }}><Ionicons name="search-outline" size={19} color={b.muted} /><TextInput accessibilityLabel="Search your events" placeholder="Search your events" placeholderTextColor={b.placeholder} value={query} onChangeText={value => setSearch({ owner: inbox.owner, value })} style={{ flex: 1, minHeight: 48, color: b.premium, fontSize: 15 }} />{!!query && <Pressable accessibilityRole="button" accessibilityLabel="Clear event search" onPress={() => setSearch({ owner: inbox.owner, value: '' })} style={{ minWidth: 40, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={19} color={b.muted} /></Pressable>}</View>{notices}</View>}
      renderItem={({ item }) => <EventDirectoryItem event={item} unread={unread.get(item.id) || 0} onPress={() => router.push({ pathname: '/messages/events', params: { eventId: String(item.id) } })} />}
      ListEmptyComponent={!loading && !error ? <ChatNotice title={query ? 'No matching events' : 'Your events will appear here'}>{query ? 'Try another event name or date.' : 'Events you enter or manage have their own announcements and player discussion.'}</ChatNotice> : null} />}
    <ErrorBanner message={active ? error : null} />
  </View>;
}
