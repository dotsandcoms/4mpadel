import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { messaging, newMessageKey } from '@/lib/messaging';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { ChatAvatar, ChatButton, ChatNotice } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

type Player = { id: string; name: string; image_url: string | null; home_club: string | null };
export default function NewGroup() {
  const router = useRouter(), inbox = useMessagingInbox(), active = usePrivateMessagingScreen(), safe = useSafeAreaInsets();
  const [query, setQuery] = useState(''), [players, setPlayers] = useState<Player[]>([]), [selected, setSelected] = useState<Player[]>([]);
  const [step, setStep] = useState<'players' | 'details'>('players'), [title, setTitle] = useState(''), [body, setBody] = useState('');
  const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const generation = useRef(0), searchEpoch = useRef(0), sending = useRef(false), retry = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => { generation.current++; setSelected([]); setPlayers([]); setTitle(''); setBody(''); setQuery(''); setStep('players'); setError(''); setBusy(false); sending.current = false; retry.current = null; return () => { generation.current++; }; }, [inbox.owner, active]);
  useEffect(() => {
    const current = ++searchEpoch.current; setPlayers([]); setLoading(false);
    if (!active || !inbox.owner || step !== 'players' || query.trim().length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      void messaging<Player[]>('group_players', { query: query.trim() })
        .then(data => { if (current === searchEpoch.current) setPlayers(data); })
        .catch(() => { if (current === searchEpoch.current) setError('Could not find players. Try again.'); })
        .finally(() => { if (current === searchEpoch.current) setLoading(false); });
    }, 250);
    return () => { searchEpoch.current++; clearTimeout(timer); };
  }, [query, active, inbox.owner, step]);
  const toggle = (player: Player) => {
    setError('');
    if (selected.some(row => row.id === player.id)) setSelected(rows => rows.filter(row => row.id !== player.id));
    else if (selected.length >= 19) setError('Choose up to 19 players for a group.');
    else setSelected(rows => [...rows, player]);
  };
  const create = async () => {
    if (sending.current || selected.length < 2 || !title.trim() || !body.trim()) return;
    const version = generation.current;
    const payload = { playerIds: selected.map(row => Number(row.id)).sort((a, z) => a - z), title: title.trim(), body: body.trim() };
    const fingerprint = JSON.stringify(payload), key = retry.current?.fingerprint === fingerprint ? retry.current.key : newMessageKey();
    retry.current = { fingerprint, key }; sending.current = true; setBusy(true); setError('');
    try {
      const result = await messaging<{ id: string }>('group_create', { ...payload, clientId: key });
      if (version !== generation.current) return;
      void inbox.refresh(); router.replace({ pathname: '/messages/[id]', params: { id: result.id } });
    } catch (e) { if (version === generation.current) setError(e instanceof Error ? e.message : 'Could not create the group. Try again.'); }
    finally { if (version === generation.current) { sending.current = false; setBusy(false); } }
  };
  const input = { borderWidth: 1, borderColor: b.edge, borderRadius: 12, backgroundColor: b.elevated, padding: 14, fontSize: 16, color: b.premium } as const;
  return <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={safe.top + 44} style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: 'New group', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {!active ? null : !inbox.status?.groupsEnabled || !inbox.status.interactive ? <ChatNotice title="Group chats">Complete messaging setup to create a group. Group invitations are available when the messaging update is activated.</ChatNotice> : step === 'players' ? <>
      <View style={{ padding: 20, gap: 12 }}><Text style={{ fontSize: 24, fontWeight: '600', color: b.premium }}>Who’s playing?</Text><Text style={{ fontSize: 14, lineHeight: 21, color: b.muted }}>Choose 2–19 players. Each person decides whether to join.</Text><TextInput accessibilityLabel="Search players for the group" placeholder="Search players by name" placeholderTextColor={b.placeholder} value={query} onChangeText={setQuery} style={input} />
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>{selected.map(player => <Pressable key={player.id} accessibilityRole="button" accessibilityLabel={`Remove ${player.name}`} onPress={() => toggle(player)} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8EFF8', borderRadius: 12, padding: 8, minHeight: 44 }}><ChatAvatar name={player.name} image={player.image_url} size={28} /><Text style={{ color: '#245B87', fontSize: 13 }}>{player.name.split(' ')[0]}</Text><Ionicons name="close" size={16} color="#245B87" /></Pressable>)}</ScrollView>
      </View>
      <FlatList data={players} keyExtractor={row => row.id} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20 }} renderItem={({ item }) => { const checked = selected.some(row => row.id === item.id); return <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={item.name} onPress={() => toggle(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: b.edge }}><ChatAvatar name={item.name} image={item.image_url} size={44} /><View style={{ flex: 1 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: b.muted, fontSize: 13, marginTop: 4 }}>{item.home_club || '4M Padel player'}</Text></View><Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? b.messagingAction : b.muted} /></Pressable>; }} ListEmptyComponent={loading ? <ActivityIndicator style={{ margin: 24 }} color={loadingBlue} /> : <Text style={{ color: b.muted, lineHeight: 22, paddingVertical: 20 }}>{query.trim().length < 2 ? 'Search by name to add players to your group.' : 'No matching players.'}</Text>} />
      <View style={{ padding: 20, paddingBottom: safe.bottom + 16 }}><ChatButton disabled={selected.length < 2} onPress={() => setStep('details')}>Next · {selected.length} selected</ChatButton></View>
    </> : <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 20, paddingBottom: safe.bottom + 24, gap: 16 }}>
      <Text style={{ color: b.premium, fontSize: 24, fontWeight: '600' }}>Bring your group together</Text>
      <Text style={{ color: b.muted, fontSize: 14, lineHeight: 21 }}>{selected.map(row => row.name).join(', ')}</Text>
      <ChatButton quiet disabled={busy} onPress={() => setStep('players')}>Edit players</ChatButton>
      <Text style={{ color: b.premium, fontWeight: '600' }}>Group name</Text><TextInput accessibilityLabel="Group name" placeholder="Saturday padel" placeholderTextColor={b.placeholder} maxLength={60} value={title} onChangeText={setTitle} editable={!busy} style={input} />
      <Text style={{ color: b.premium, fontWeight: '600' }}>Introduction</Text><TextInput accessibilityLabel="Group introduction" placeholder="Let’s arrange our next game" placeholderTextColor={b.placeholder} multiline maxLength={300} value={body} onChangeText={setBody} editable={!busy} style={[input, { minHeight: 112, textAlignVertical: 'top' }]} />
      <Text style={{ color: b.muted, fontSize: 13, lineHeight: 20 }}>Players see your introduction before joining. Members can see each other’s profiles and messages. Phone numbers and email addresses stay private.</Text>
      <ChatButton disabled={busy || title.trim().length < 2 || !body.trim()} onPress={() => void create()}>{busy ? 'Sending invitations…' : 'Create group & invite players'}</ChatButton>
    </ScrollView>}
    <ErrorBanner message={active ? error : null} />
  </KeyboardAvoidingView>;
}
