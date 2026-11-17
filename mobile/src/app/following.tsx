import { Pressable, Text, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FollowingFeedList } from '@/components/following-feed-list';
import { lightBrand as b } from '@/theme/tokens';
export default function FollowingScreen() {
  const router = useRouter(), safe = useSafeAreaInsets();
  return <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top }}><Stack.Screen options={{ headerShown: false }} />
    <View style={{ flexDirection: 'row', paddingHorizontal: 12, alignItems: 'center', gap: 10, paddingBottom: 12 }}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={{ width: 44, height: 48, justifyContent: 'center', alignItems: 'center' }}><Ionicons name="arrow-back" size={23} color={b.premium} /></Pressable><Text style={{ flex: 1, color: b.premium, fontSize: 26, fontWeight: '800', letterSpacing: -0.7 }}>Following</Text></View>
    <FollowingFeedList />
  </View>;
}
