import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState, type ComponentProps } from 'react';
import { ActivityIndicator, Alert, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CoachPortrait } from '@/components/coach-portrait';
import { useMessagingInbox } from '@/components/messaging/messaging-provider';
import { coachEmailUrl, coachPhoneUrl, coachPublicUrl, coachVenues, fetchCoachMessageTarget, fetchCoachProfile, type CoachMessageTarget, type CoachProfile } from '@/lib/coaches';
import { siteUrl } from '@/lib/site';
import { lightBrand as brand, loadingBlue } from '@/theme/tokens';

type IconName = ComponentProps<typeof Ionicons>['name'];

function openPublishedLink(url: string) {
  void Linking.openURL(url).catch(() => Alert.alert('Couldn’t open this link', 'Please try again.'));
}

export default function CoachProfileScreen() {
  const { id: routeId } = useLocalSearchParams<{ id: string }>();
  const id = typeof routeId === 'string' ? routeId.toLowerCase() : '';
  const router = useRouter();
  const { owner, status } = useMessagingInbox();
  const messagingEnabled = status?.enabled === true;
  const safe = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const [loadedCoach, setCoach] = useState<CoachProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const [tab, setTab] = useState<'Overview' | 'Photos'>('Overview');
  const [showPhoto, setShowPhoto] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const [lookup, setLookup] = useState<{ owner: string; coachId: string; target: CoachMessageTarget } | null>(null);
  const refresh = () => setRevision(value => value + 1);

  useEffect(() => { setTab('Overview'); setShowPhoto(false); }, [id]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(false);
    void fetchCoachProfile(id, controller.signal).then(coach => {
      if (!controller.signal.aborted) setCoach(coach);
    }).catch(() => {
      if (!controller.signal.aborted) setError(true);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, revision]);

  const coach = loadedCoach?.id === id ? loadedCoach : null;
  const coachId = coach?.id;
  useFocusEffect(useCallback(() => {
    setLookup(null);
    if (!owner || !coachId || !messagingEnabled) return;
    const controller = new AbortController();
    void fetchCoachMessageTarget(coachId, controller.signal).then(target => {
      if (target && !controller.signal.aborted) setLookup({ owner, coachId, target });
    }).catch(() => { /* Public contact actions remain available. */ });
    return () => controller.abort();
  }, [coachId, owner, messagingEnabled, revision]));
  const target = messagingEnabled && lookup && lookup.owner === owner && lookup.coachId === coachId ? lookup.target : null;
  const photo = coachPublicUrl(coach?.profile_pic_url ?? null);
  const overview = tab === 'Overview' || !photo;
  const email = coachEmailUrl(coach?.email ?? null);
  const phone = coachPhoneUrl(coach?.contact_number ?? null);
  const venues = coachVenues(coach?.coaching_location);
  const city = coach?.city?.trim();
  const bio = coach?.bio?.trim();
  const links: { label: string; icon: IconName; url?: string }[] = [
    { label: 'Website', icon: 'globe-outline', url: coachPublicUrl(coach?.website_link ?? null) },
    { label: 'Instagram', icon: 'logo-instagram', url: coachPublicUrl(coach?.instagram_link ?? null) },
    { label: 'YouTube', icon: 'logo-youtube', url: coachPublicUrl(coach?.youtube_link ?? null) },
  ];

  const share = () => {
    if (!coach) return;
    const title = `${coach.full_name} on 4M Padel`;
    const url = siteUrl(`/academy/coaches?id=${encodeURIComponent(coach.id)}`);
    void Share.share({ title, message: `${title}\n${url}` }).catch(() => Alert.alert('Couldn’t open sharing', 'Please try again.'));
  };
  const closePhoto = () => setShowPhoto(false);
  const openPhoto = () => { setPhotoFailed(false); setShowPhoto(true); };
  const contactActions: { label: string; icon: IconName; onPress: () => void; primary?: boolean }[] = [];
  if (target) contactActions.push({ label: 'Message', icon: 'chatbubble-outline', primary: true, onPress: () => {
    if ('unavailable' in target) Alert.alert('Messaging unavailable', 'This coach can’t receive in-app messages right now.');
    else if (target.conversationId) router.push({ pathname: '/messages/[id]', params: { id: target.conversationId } });
    else router.push({ pathname: '/messages/new', params: { playerId: target.playerId } });
  } });
  if (email) contactActions.push({ label: 'Email', icon: 'mail-outline', onPress: () => openPublishedLink(email) });
  if (phone) contactActions.push({ label: 'Call', icon: 'call-outline', onPress: () => openPublishedLink(phone) });

  return <View style={styles.screen}>
    <Stack.Screen options={{ headerShown: true, title: 'Coach profile', headerBackButtonDisplayMode: 'minimal',
      headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false,
      headerRight: () => coach ? <Pressable accessibilityRole="button" accessibilityLabel="Share coach profile" onPress={share} style={styles.headerAction}>
        <Ionicons name="share-outline" size={23} color={brand.premium} />
      </Pressable> : null }} />
    <ScrollView contentContainerStyle={[styles.content, { paddingBottom: safe.bottom + 24 }]}
      refreshControl={<RefreshControl refreshing={loading && !!coach} onRefresh={refresh} tintColor={loadingBlue} colors={[loadingBlue]} />}>
      {loading && !coach && <ActivityIndicator accessibilityLabel="Loading coach profile" color={loadingBlue} />}
      {error && <View style={styles.card}>
        <Text accessibilityRole="alert" style={styles.body}>This coach profile couldn’t load.</Text>
        <Pressable accessibilityRole="button" onPress={refresh} style={styles.retry}><Text style={styles.accentText}>Try again</Text></Pressable>
      </View>}
      {!loading && !error && !coach && <View style={styles.card}>
        <Text accessibilityRole="header" style={styles.sectionTitle}>Coach profile unavailable</Text>
        <Text style={styles.body}>You can find other approved coaches in the directory.</Text>
      </View>}
      {coach && <>
        <View style={styles.hero}>
          <Pressable accessibilityRole="button" accessibilityLabel={`View ${coach.full_name}’s photo`} disabled={!photo} onPress={openPhoto}>
            <CoachPortrait coach={coach} size={width < 370 ? 85 : 100} />
          </Pressable>
          <View style={styles.identity}>
            <Text accessibilityRole="header" numberOfLines={fontScale <= 1.2 ? 1 : undefined}
              adjustsFontSizeToFit={fontScale <= 1.2} minimumFontScale={0.72} style={styles.name}>{coach.full_name}</Text>
            <View style={styles.badge}><Ionicons name="school-outline" size={15} color={brand.accent} accessible={false} />
              <Text style={styles.badgeText}>Approved coach</Text>
            </View>
            {!!city && <Text style={styles.city}>{city}</Text>}
          </View>
        </View>
        {!!contactActions.length && <View style={[styles.actions, fontScale > 1.35 && styles.stackedActions]}>
          {contactActions.map(({ label, icon, onPress, primary }) => <Pressable key={label} accessibilityRole="button"
            accessibilityLabel={`${label} ${coach.full_name}`} style={[styles.action, primary && styles.primaryAction]} onPress={onPress}>
            <Ionicons name={icon} size={18} color={primary ? brand.accent : brand.premium} accessible={false} />
            <Text style={[styles.actionText, primary && styles.accentText]}>{label}</Text>
          </Pressable>)}
        </View>}
        {photo && <View accessibilityRole="tablist" accessibilityLabel="Coach profile sections" style={styles.tabs}>
          {(['Overview', 'Photos'] as const).map(label => <Pressable key={label} accessibilityRole="tab"
            accessibilityState={{ selected: tab === label }} style={[styles.tab, tab === label && styles.tabActive]} onPress={() => setTab(label)}>
            <Text style={[styles.tabText, tab === label && styles.tabTextActive]}>{label}</Text>
          </Pressable>)}
        </View>}
        {overview ? <>
          {!!bio && <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>About {coach.full_name.trim().split(/\s+/)[0]}</Text>
            <Text style={styles.body}>{bio}</Text>
          </View>}
          {!!venues.length && <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Coaches at</Text>
            <View>
              {venues.map((venue, index) => <View key={venue} style={[styles.venue, index > 0 && styles.venueDivider]}>
                <View style={styles.venueIcon}><Ionicons name="location-outline" size={18} color={brand.accent} accessible={false} /></View>
                <Text style={styles.venueName}>{venue}</Text>
              </View>)}
            </View>
          </View>}
          {links.some(link => link.url) && <View style={styles.card}>
            <Text accessibilityRole="header" style={styles.sectionTitle}>Links</Text>
            {links.map(({ label, icon, url }) => url && <Pressable key={label} accessibilityRole="link" onPress={() => openPublishedLink(url)} style={styles.link}>
              <Ionicons name={icon} size={20} color={brand.accent} accessible={false} /><Text style={styles.linkLabel}>{label}</Text>
              <Ionicons name="open-outline" size={17} color={brand.muted} accessible={false} />
            </Pressable>)}
          </View>}
        </> : <View style={styles.card}>
          <Text accessibilityRole="header" style={styles.sectionTitle}>Profile photo</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${coach.full_name}’s photo full screen`} onPress={openPhoto} style={styles.photoCard}>
            <Image source={photo} contentFit="cover" cachePolicy="memory-disk" style={StyleSheet.absoluteFill} />
          </Pressable>
        </View>}
      </>}
    </ScrollView>
    {coach && photo && showPhoto && <Modal visible animationType="fade" presentationStyle="fullScreen" onRequestClose={closePhoto}>
      <View accessibilityViewIsModal onAccessibilityEscape={closePhoto} style={[styles.viewer, { paddingTop: safe.top, paddingBottom: safe.bottom }]}>
        <View style={styles.viewerHeader}>
          <Text numberOfLines={1} style={styles.viewerTitle}>{coach.full_name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={closePhoto} style={styles.headerAction}>
            <Ionicons name="close" size={24} color={brand.elevated} />
          </Pressable>
        </View>
        {photoFailed ? <Text accessibilityRole="alert" style={styles.viewerError}>This photo couldn’t load.</Text>
          : <Image source={photo} accessibilityLabel={`${coach.full_name}’s profile photo`} contentFit="contain" style={styles.viewerImage} onError={() => setPhotoFailed(true)} />}
      </View>
    </Modal>}
  </View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: brand.page },
  content: { paddingHorizontal: 16, paddingTop: 14, gap: 16 },
  headerAction: { minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  hero: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 4 },
  identity: { flex: 1, minWidth: 0, gap: 6 },
  name: { color: brand.premium, fontSize: 27, fontWeight: '800', letterSpacing: -0.6 },
  badge: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 5,
    backgroundColor: brand.glass, borderRadius: 20, paddingVertical: 5, paddingHorizontal: 8, flexShrink: 1 },
  badgeText: { color: brand.accent, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  city: { color: brand.muted, fontSize: 14 },
  actions: { flexDirection: 'row', alignItems: 'stretch', gap: 8 },
  stackedActions: { flexDirection: 'column' },
  action: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, minHeight: 46,
    paddingHorizontal: 10, paddingVertical: 8, borderRadius: 24, backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge },
  actionText: { color: brand.premium, fontWeight: '700', fontSize: 14 },
  primaryAction: { backgroundColor: brand.glass, borderColor: brand.glass },
  accentText: { color: brand.accent, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8 },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 8, minHeight: 44, borderRadius: 24,
    backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge },
  tabActive: { backgroundColor: brand.accent, borderColor: brand.accent },
  tabText: { color: brand.premium, fontWeight: '700', textAlign: 'center' },
  tabTextActive: { color: brand.elevated },
  card: { gap: 10, borderWidth: 1, borderColor: brand.edge, borderRadius: 18, padding: 14, backgroundColor: brand.elevated },
  sectionTitle: { color: brand.premium, fontSize: 20, fontWeight: '800', letterSpacing: -0.35 },
  body: { color: brand.label, fontSize: 15, lineHeight: 22 },
  venue: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, minHeight: 48 },
  venueDivider: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: brand.edge },
  venueIcon: { width: 32, height: 32, borderRadius: 10, backgroundColor: brand.glass, alignItems: 'center', justifyContent: 'center' },
  venueName: { flex: 1, minWidth: 0, color: brand.premium, fontSize: 15, fontWeight: '600', lineHeight: 21 },
  link: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44, paddingVertical: 8 },
  linkLabel: { flex: 1, color: brand.premium, fontSize: 15, fontWeight: '600' },
  retry: { alignSelf: 'flex-start', justifyContent: 'center', minHeight: 44 },
  photoCard: { width: '100%', aspectRatio: 1, maxHeight: 400, borderRadius: 12, overflow: 'hidden', backgroundColor: brand.panel },
  viewer: { flex: 1, backgroundColor: '#101B17' },
  viewerHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, minHeight: 52 },
  viewerTitle: { flex: 1, color: brand.elevated, fontWeight: '700', fontSize: 17 },
  viewerImage: { flex: 1 },
  viewerError: { color: brand.elevated, margin: 16 },
});
