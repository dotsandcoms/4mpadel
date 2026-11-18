import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { HomeAction } from '@/components/home-action';
import { isPremierNewsUrl, premierNewsIndex } from '@/lib/premier-news';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function PremierNewsScreen() {
  const router = useRouter();
  const { url = premierNewsIndex } = useLocalSearchParams<{ url?: string }>();
  const [failed, setFailed] = useState(false);
  const valid = isPremierNewsUrl(url);
  const close = () => router.canGoBack() ? router.back() : router.replace('/(tabs)');

  return <SafeAreaView style={styles.screen}>
    <View style={styles.header}>
      <HomeAction kind="icon" icon="previous" label="Back" onPress={close} />
      <Text accessibilityRole="header" style={styles.heading}>Premier Padel news</Text>
    </View>
    {!valid || failed ? <View style={styles.message}>
      <Text style={styles.messageText}>{valid ? 'This story couldn’t load.' : 'This Premier Padel link is unavailable.'}</Text>
      {valid && <HomeAction label="Try again" onPress={() => setFailed(false)} />}
    </View> : <WebView
      source={{ uri: url }}
      originWhitelist={['*']}
      onShouldStartLoadWithRequest={request => isPremierNewsUrl(request.url)}
      onOpenWindow={() => {}}
      onError={() => setFailed(true)}
      onHttpError={({ nativeEvent }) => { if (isPremierNewsUrl(nativeEvent.url)) setFailed(true); }}
      startInLoadingState
      renderLoading={() => <View style={styles.loading}><ActivityIndicator color={loadingBlue} accessibilityLabel="Loading article" /></View>}
      style={styles.web}
    />}
  </SafeAreaView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: b.page },
  header: { minHeight: 52, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  heading: { flex: 1, color: b.premium, fontSize: 18, fontWeight: '700' },
  web: { flex: 1, backgroundColor: b.surface },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: b.surface },
  message: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, padding: 24 },
  messageText: { textAlign: 'center', color: b.muted, fontSize: 15 },
});
