import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { messaging, newMessageKey } from '@/lib/messaging';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { ChatAvatar, ChatButton, ChatNotice } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { lightBrand as b } from '@/theme/tokens';
type Player = { id: string; name: string; image_url: string | null; home_club: string | null };
export default function NewMessage() {
  const { playerId } = useLocalSearchParams<{ playerId?: string }>(), router = useRouter(), inbox = useMessagingInbox(), active = usePrivateMessagingScreen();
  const [query, setQuery] = useState(''), [players, setPlayers] = useState<Player[]>([]), [selected, setSelected] = useState<Player | null>(null);
  const [body, setBody] = useState(''), [error, setError] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false);
  const retry = useRef<{ body: string; player: string; key: string } | null>(null), epoch = useRef(0);
  useEffect(() => {
    const current = ++epoch.current; setPlayers([]); setError(''); setLoading(false);
    if (!active) { setBody(''); setSelected(null); return; }
    const byId = playerId && /^\d+$/.test(playerId) && !query;
    if (!byId && query.trim().length < 2) return;
    const timer = setTimeout(() => {
      setLoading(true);
      let request = supabase.from('players_public').select('id,name,image_url,home_club');
      request = byId ? request.eq('id', playerId) : request.ilike('name', `%${query.trim().replace(/[\\%_]/g, '\\$&')}%`);
      void Promise.resolve(request.order('name').limit(30)).then(({ data, error: issue }) => {
        if (current !== epoch.current) return;
        if (issue) setError('Could not find players. Please try again.');
        else { const rows = (data || []).map(p => ({ ...p, id: String(p.id) })) as Player[]; setPlayers(rows); if (byId && rows[0]) setSelected(rows[0]); }
        setLoading(false);
      }).catch(() => { if (current === epoch.current) { setError('Could not find players. Please try again.'); setLoading(false); } });
    }, byId ? 0 : 250);
    return () => { epoch.current++; clearTimeout(timer); };
  }, [query, playerId, active, inbox.owner]);
  useEffect(() => { setSelected(null); setBody(''); setBusy(false); retry.current = null; }, [inbox.owner, active]);
  const send = useCallback(async () => {
    if (!selected || busy) return;
    const current = epoch.current, id = inbox.owner;
    const previous = retry.current;
    const key = previous?.body === body && previous.player === selected.id ? previous.key : newMessageKey();
    retry.current = { body, player: selected.id, key }; setBusy(true); setError('');
    try {
      const result = await messaging<{ id: string }>('request', { playerId: Number(selected.id), body: body.trim(), clientId: key });
      if (current === epoch.current && id === inbox.owner) { setBody(''); void inbox.refresh(); router.replace({ pathname: '/messages/[id]', params: { id: result.id } }); }
    } catch (e) { if (current === epoch.current) setError(e instanceof Error ? e.message : 'Could not send request.'); }
    finally { if (current === epoch.current) setBusy(false); }
  }, [selected, busy, body, inbox.owner, inbox.refresh, router]);
  return <View style={{ flex: 1, backgroundColor: b.page, padding: 20 }}><Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: 'New message', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {!active ? null : !inbox.status?.interactive ? <><ChatNotice title="A quick check before you chat">Verify your profile and accept the community rules before sending a message request.</ChatNotice><ChatButton onPress={() => router.push('/settings/messaging')}>Messaging setup</ChatButton></> : selected ? <View style={{ gap: 20 }}>
      <View style={{ flexDirection: 'row', gap: 14, alignItems: 'center' }}><ChatAvatar name={selected.name} image={selected.image_url} /><View style={{ flex: 1 }}><Text style={{ fontSize: 20, fontWeight: '700', color: b.premium }}>{selected.name}</Text><Text style={{ color: b.muted }}>{selected.home_club || '4M Padel player'}</Text></View><Pressable accessibilityRole="button" onPress={() => setSelected(null)} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent }}>Change</Text></Pressable></View>
      <Text style={{ color: b.muted, fontSize: 15, lineHeight: 23 }}>Send a short introduction. {selected.name.split(' ')[0]} decides whether to accept before the conversation continues.</Text>
      <TextInput accessibilityLabel="Introduction" multiline maxLength={300} placeholder="Hi! Shall we arrange a game?" placeholderTextColor={b.placeholder} value={body} onChangeText={setBody} style={{ minHeight: 140, borderWidth: 1, borderColor: b.edge, borderRadius: 16, padding: 16, fontSize: 16, color: b.premium, backgroundColor: b.elevated, textAlignVertical: 'top' }} />
      <Text style={{ color: b.muted, textAlign: 'right', fontSize: 12 }}>{Array.from(body).length}/300</Text>
      <ChatButton disabled={busy || !body.trim()} onPress={() => void send()}>{busy ? 'Sending…' : 'Send request'}</ChatButton>
    </View> : <><TextInput accessibilityLabel="Find a player by name" placeholder="Search players by name" placeholderTextColor={b.placeholder} value={query} onChangeText={setQuery} style={{ minHeight: 50, backgroundColor: b.elevated, color: b.premium, borderRadius: 14, paddingHorizontal: 16, borderWidth: 1, borderColor: b.edge }} />
      {loading && <ActivityIndicator style={{ margin: 20 }} color={b.accent} />}
      <FlatList keyboardShouldPersistTaps="handled" data={players} keyExtractor={p => p.id} renderItem={({ item }) => <Pressable accessibilityRole="button" onPress={() => setSelected(item)} style={{ flexDirection: 'row', alignItems: 'center', gap: 13, paddingVertical: 16, borderBottomWidth: 1, borderColor: b.edge }}><ChatAvatar name={item.name} image={item.image_url} /><View><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>{item.name}</Text><Text style={{ color: b.muted, marginTop: 4 }}>{item.home_club || '4M Padel player'}</Text></View></Pressable>} ListEmptyComponent={loading ? null : <ChatNotice title="Find your next playing partner">Search by name to send a private introduction. Your phone number and email stay private.</ChatNotice>} /></>}
    <ErrorBanner message={active ? error : null} />
  </View>;
}
