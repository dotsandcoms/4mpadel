import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { SettingsPage } from '@/components/settings-ui';
import { useGuidedTour } from '@/components/guided-tour';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { GUIDES } from '@/lib/guided-tour';
import { lightBrand as b } from '@/theme/tokens';

export default function AppTourScreen() {
  const tour = useGuidedTour(), { owner } = useMessagingInbox(), router = useRouter();
  const replay = tour?.progress.welcome !== 'unseen';
  return <SettingsPage title="App tour">
    <View style={{ paddingTop: 12, gap: 12 }}><Text accessibilityRole="header" style={{ color: b.premium, fontSize: 30, lineHeight: 36, fontWeight: '700', letterSpacing: -0.8 }}>Make yourself at home.</Text>
      <Text style={{ color: b.muted, fontSize: 15, lineHeight: 23 }}>Follow a short guide through the app’s actual controls. Choose what you want to explore.</Text></View>
    <View style={{ backgroundColor: '#27517B', borderRadius: 24, padding: 22, marginTop: 22, gap: 16 }}>
      <Ionicons name="compass-outline" size={32} color="#B5D5F0" accessible={false} />
      <Text style={{ color: '#FFFFFF', fontSize: 23, lineHeight: 29, fontWeight: '700', letterSpacing: -0.4 }}>The 4M essentials</Text>
      <Text style={{ color: '#DEEAF5', fontSize: 14, lineHeight: 21 }}>Your feed, players, events, menu and settings. Six quick stops to get you going.</Text>
      <Pressable accessibilityRole="button" disabled={!tour?.ready} onPress={() => tour?.start('overview')}
        style={{ backgroundColor: '#FFFFFF', borderRadius: 14, minHeight: 48, padding: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: tour?.ready ? 1 : 0.5 }}>
        <Text style={{ color: '#27517B', fontSize: 14, fontWeight: '700' }}>{replay ? 'Replay app tour' : 'Start app tour'}</Text><Ionicons name="arrow-forward" size={17} color="#27517B" accessible={false} />
      </Pressable>
    </View>
    {!owner && <Pressable accessibilityRole="button" onPress={() => router.push('/(auth)/sign-in')} style={{ minHeight: 48, justifyContent: 'center' }}><Text style={{ color: '#27517B', fontSize: 14 }}>Sign in to explore and save your tour progress</Text></Pressable>}
    {owner && !tour?.ready && <ActivityIndicator color="#27517B" style={{ marginTop: 16 }} accessibilityLabel="Loading your guides" />}
    <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 18, fontWeight: '600', marginTop: 28, marginBottom: 8 }}>Explore one part at a time</Text>
    {Object.values(GUIDES).filter(guide => guide.id !== 'overview' && !guide.contextualOnly).map(guide => <Pressable key={guide.id} accessibilityRole="button" accessibilityLabel={`${guide.title}. ${guide.steps.length} ${guide.steps.length === 1 ? 'tip' : 'tips'}${tour?.progress.completed.includes(guide.id) ? '. Completed' : ''}`}
      disabled={!tour?.ready} onPress={() => tour?.start(guide.id)} style={{ minHeight: 88, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 15, borderBottomWidth: 1, borderBottomColor: b.edge }}>
      <View style={{ width: 42, height: 42, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: '#EAF1F8' }}><Ionicons name={guide.icon} size={20} color="#27517B" accessible={false} /></View>
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.premium, fontSize: 15, lineHeight: 21, fontWeight: '600' }}>{guide.title}</Text><Text style={{ color: b.muted, fontSize: 12, lineHeight: 18 }}>{guide.detail}</Text></View>
      <Ionicons name={tour?.progress.completed.includes(guide.id) ? 'checkmark-circle' : 'chevron-forward'} size={18} color="#27517B" accessible={false} />
    </Pressable>)}
  </SettingsPage>;
}
