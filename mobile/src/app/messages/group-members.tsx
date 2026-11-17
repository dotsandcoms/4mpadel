import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { messaging } from '@/lib/messaging';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { usePrivateMessagingScreen } from '@/hooks/use-private-messaging-screen';
import { ChatAvatar, ChatButton } from '@/components/messaging/ui';
import { ErrorBanner } from '@/components/error-banner';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';
type Member = { id: string; name: string; image: string | null; status: 'accepted' | 'invited'; creator: boolean };
export default function GroupMembers() {
  const { conversationId } = useLocalSearchParams<{ conversationId: string }>(), inbox = useMessagingInbox(), active = usePrivateMessagingScreen();
  const [rows, setRows] = useState<Member[]>([]), [error, setError] = useState(''), [loading, setLoading] = useState(false), [attempt, setAttempt] = useState(0);
  const epoch = useRef(0);
  useEffect(() => {
    const version = ++epoch.current; setRows([]); setError('');
    if (!active || !inbox.owner) return;
    setLoading(true);
    void messaging<Member[]>('group_members', { conversationId }).then(result => { if (version === epoch.current) setRows(result); })
      .catch(e => { if (version === epoch.current) setError(e.message); }).finally(() => { if (version === epoch.current) setLoading(false); });
    return () => { epoch.current++; };
  }, [active, inbox.owner, conversationId, inbox.revision, attempt]);
  return <View style={{ flex: 1, backgroundColor: b.page }}><Stack.Screen options={{ headerShown: true, headerBackButtonDisplayMode: 'minimal', title: 'Group members', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {active && <FlatList data={rows} keyExtractor={row => row.id} contentContainerStyle={{ padding: 20 }} ListHeaderComponent={<Text style={{ color: b.muted, fontSize: 14, lineHeight: 21, marginBottom: 16 }}>Only joined members are shown to other players. The creator can also see their pending invitations.</Text>} renderItem={({ item }) => <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderColor: b.edge }}><ChatAvatar name={item.name} image={item.image} size={44} /><View style={{ flex: 1 }}><Text style={{ fontSize: 16, fontWeight: '600', color: b.premium }}>{item.name}</Text><Text style={{ fontSize: 13, marginTop: 4, color: b.muted }}>{item.creator ? 'Created this group' : item.status === 'invited' ? 'Invitation pending' : 'Joined'}</Text></View></View>} ListEmptyComponent={loading ? <ActivityIndicator color={loadingBlue} style={{ margin: 24 }} /> : error ? <ChatButton quiet onPress={() => setAttempt(value => value + 1)}>Try again</ChatButton> : null} />}
    <ErrorBanner message={active ? error : null} />
  </View>;
}
