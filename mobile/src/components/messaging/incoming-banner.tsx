import { useEffect } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useMessagingInbox } from './messaging-provider';
export function IncomingMessageBanner() {
  const inbox = useMessagingInbox(), router = useRouter(), safe = useSafeAreaInsets();
  useEffect(() => { if (!inbox.notice) return; const timer = setTimeout(inbox.dismissNotice, 6500); return () => clearTimeout(timer); }, [inbox.notice]);
  if (!inbox.notice || !inbox.owner) return null;
  const notice = inbox.notice;
  return <View style={{ position: 'absolute', zIndex: 1000, top: safe.top + 8, left: 12, right: 12, borderRadius: 18, backgroundColor: '#15271E', borderWidth: 1, borderColor: '#354B3E', flexDirection: 'row', alignItems: 'center', padding: 10, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 }}>
    <Pressable accessibilityRole="button" accessibilityLabel={`${notice.title}. ${notice.detail}. Open chat`} accessibilityLiveRegion="polite" onPress={() => { inbox.dismissNotice(); router.push({ pathname: '/messages/[id]', params: { id: notice.id } }); }} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8 }}>
      <Ionicons name="chatbubbles-outline" size={24} color="#CCFF00" /><View style={{ flex: 1 }}><Text numberOfLines={1} style={{ color: 'white', fontSize: 15, fontWeight: '700' }}>{notice.title}</Text><Text style={{ color: '#D0D9D2', fontSize: 13, marginTop: 4 }}>{notice.detail}</Text></View>
    </Pressable>
    <Pressable accessibilityRole="button" accessibilityLabel="Dismiss new message" onPress={inbox.dismissNotice} style={{ minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="close" size={20} color="#D0D9D2" /></Pressable>
  </View>;
}
