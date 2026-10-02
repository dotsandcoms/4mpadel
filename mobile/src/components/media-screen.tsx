import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMediaAlbum, fetchMediaAlbums, fetchMediaPhotos, PHOTO_PAGE_SIZE, type MediaAlbum, type MediaPhoto } from '@/lib/media';
import { lightBrand as brand } from '@/theme/tokens';

const BLUE = '#2449D8';
function albumDate(album: MediaAlbum) {
  const date = new Date(album.album_date || album.created_at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
}
async function openPlaylist(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) throw new Error('Invalid playlist');
    await WebBrowser.openBrowserAsync(parsed.toString(), { controlsColor: BLUE });
  } catch { Alert.alert('Video unavailable', 'This playlist could not be opened. Please try again later.'); }
}
function AlbumCard({ album }: { album: MediaAlbum }) {
  const router = useRouter();
  const [coverRatio, setCoverRatio] = useState(1.5);
  return <Pressable accessibilityRole="button" accessibilityLabel={`Open ${album.title}`} onPress={() => router.push({ pathname: '/media/[id]', params: { id: album.id } })}>
    <View style={styles.card}>
      <View style={[styles.cover, { aspectRatio: coverRatio }]}>
        {album.cover_image_url ? <Image
          source={album.cover_image_url}
          style={StyleSheet.absoluteFill}
          contentFit="contain"
          transition={180}
          onLoad={({ source }) => {
            if (source.width > 0 && source.height > 0) {
              // Follow the photograph's shape; contain preserves the full frame at either limit.
              setCoverRatio(Math.max(0.8, Math.min(1.9, source.width / source.height)));
            }
          }}
        /> : <Ionicons name="images-outline" size={36} color="#85958F" />}
        {album.is_featured && <View style={styles.featured}><Text style={styles.featuredText}>FEATURED</Text></View>}
      </View>
      <View style={{ padding: 18 }}>
        <Text style={styles.eyebrow}>{albumDate(album)}</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center', marginTop: 7 }}>
          <Text style={[styles.cardTitle, { flex: 1 }]}>{album.title}</Text>
          <View style={styles.arrow}><Ionicons name="arrow-forward" size={19} color={BLUE} /></View>
        </View>
        {!!album.description && <Text numberOfLines={2} style={[styles.body, { marginTop: 8 }]}>{album.description}</Text>}
        {!!(album.photographer_name || album.photographer_instagram) && <Text style={styles.credit}>Photos by {album.photographer_name || album.photographer_instagram}</Text>}
      </View>
    </View>
  </Pressable>;
}
function PhotoViewer({ photos, index, onClose }: { photos: MediaPhoto[]; index: number; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index);
  return <Modal visible animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
    <View style={{ flex: 1, backgroundColor: '#101B17', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={styles.viewerBar}>
        <Text style={{ color: '#FFFFFF', fontSize: 14 }}>{current + 1} / {photos.length}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={styles.iconButton}><Ionicons name="close" size={26} color="white" /></Pressable>
      </View>
      <FlatList key={width} data={photos} horizontal pagingEnabled initialScrollIndex={current} keyExtractor={item => item.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })} showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setCurrent(Math.round(event.nativeEvent.contentOffset.x / width))}
        initialNumToRender={1} maxToRenderPerBatch={3} windowSize={3}
        renderItem={({ item }) => <ScrollView style={{ width }} contentContainerStyle={{ width, height: height - insets.top - insets.bottom - 130, justifyContent: 'center' }} maximumZoomScale={3} minimumZoomScale={1} centerContent>
          <Image source={item.image_url} contentFit="contain" accessibilityLabel={item.caption || 'Event photograph'} style={{ width, height: height - insets.top - insets.bottom - 130 }} />
        </ScrollView>} />
      <Text numberOfLines={2} style={{ color: '#DEE6E2', textAlign: 'center', padding: 16, minHeight: 64 }}>{photos[current]?.caption || 'Swipe to browse photos'}</Text>
    </View>
  </Modal>;
}

export function MediaScreen({ albumId }: { albumId?: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [albums, setAlbums] = useState<MediaAlbum[]>([]);
  const [album, setAlbum] = useState<MediaAlbum | null>(null);
  const [photos, setPhotos] = useState<MediaPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [search, setSearch] = useState('');
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const generation = useRef(0);
  const moreBusy = useRef(false);
  const load = useCallback(async (refresh = false) => {
    const request = ++generation.current;
    if (refresh) setRefreshing(true); else setLoading(true);
    setError(false);
    try {
      const [nextAlbums, nextAlbum, nextPhotos] = await Promise.all([
        fetchMediaAlbums(albumId), albumId ? fetchMediaAlbum(albumId) : null,
        albumId ? fetchMediaPhotos(albumId) : [],
      ]);
      if (request !== generation.current) return;
      setAlbums(nextAlbums); setAlbum(nextAlbum); setPhotos(nextPhotos); setHasMore(nextPhotos.length === PHOTO_PAGE_SIZE);
      setSelected(null);
    } catch { if (request === generation.current) setError(true); }
    finally { if (request === generation.current) { setLoading(false); setRefreshing(false); } }
  }, [albumId]);
  useEffect(() => { void load(); return () => { generation.current++; }; }, [load]);
  async function loadMore() {
    if (!albumId || moreBusy.current || refreshing || loading) return;
    moreBusy.current = true; setLoadingMore(true);
    const request = generation.current;
    try {
      const next = await fetchMediaPhotos(albumId, photos.length);
      if (request !== generation.current) return;
      setPhotos(previous => [...previous, ...next]); setHasMore(next.length === PHOTO_PAGE_SIZE);
    } catch { Alert.alert('Could not load more photos', 'Please try again.'); }
    finally { moreBusy.current = false; setLoadingMore(false); }
  }
  const shown = albums.filter(item => (!featuredOnly || item.is_featured) && `${item.title} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()));
  const tileWidth = (width - 48) / 3;
  return <>
    <Stack.Screen options={{ headerShown: true, title: albumId ? 'Album' : 'Media', headerBackTitle: 'Back', headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false }} />
    <FlatList data={albumId ? photos : []} numColumns={3} keyExtractor={item => item.id} style={{ flex: 1, backgroundColor: brand.page }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
      refreshing={refreshing} onRefresh={() => void load(true)}
      columnWrapperStyle={{ gap: 4 }}
      ListHeaderComponent={<View>
        <Text style={styles.heading}>{albumId ? album?.title || 'Event album' : 'Through the lens'}</Text>
        <Text style={[styles.body, { marginBottom: 22 }]}>{albumId ? album?.description || 'Moments from the court and beyond.' : 'The matches, the people and the moments that make 4M Padel.'}</Text>
        {loading ? <ActivityIndicator color={BLUE} style={{ marginVertical: 48 }} /> : error ? <View style={styles.message}>
          <Text style={styles.cardTitle}>Media could not be loaded</Text><Text style={styles.body}>Check your connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>
        </View> : <>
          {album && <View style={{ marginBottom: 24, gap: 12 }}>
            <Text style={styles.eyebrow}>{albumDate(album)}</Text>
            {!!(album.photographer_name || album.photographer_instagram) && <Text style={styles.body}>Photos by {album.photographer_name || album.photographer_instagram}</Text>}
            {!!album.youtube_playlist_url && <Pressable accessibilityRole="button" accessibilityLabel="Watch event videos on YouTube" onPress={() => void openPlaylist(album.youtube_playlist_url!)}>
              <View style={styles.videoRow}><Ionicons name="play-circle" size={32} color={BLUE} /><View style={{ flex: 1 }}><Text style={styles.cardTitle}>Watch the action</Text><Text style={styles.body}>Event videos on YouTube</Text></View><Ionicons name="open-outline" size={19} color={BLUE} /></View>
            </Pressable>}
          </View>}
          {!albumId && <>
            <View style={styles.search}><Ionicons name="search" size={21} color={brand.muted} /><TextInput accessibilityLabel="Search albums" placeholder="Search event albums" placeholderTextColor={brand.muted} value={search} onChangeText={setSearch} style={{ flex: 1, color: brand.premium, fontSize: 16, paddingVertical: 14 }} clearButtonMode="while-editing" /></View>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 22 }}>{['All albums', 'Featured'].map((label, i) => <Pressable key={label} accessibilityRole="button" accessibilityState={{ selected: featuredOnly === !!i }} onPress={() => setFeaturedOnly(!!i)} style={[styles.filter, featuredOnly === !!i && { backgroundColor: BLUE, borderColor: BLUE }]}><Text style={{ color: featuredOnly === !!i ? 'white' : brand.muted, fontWeight: '600' }}>{label}</Text></Pressable>)}</View>
          </>}
          {!!albumId && albums.length > 0 && <Text style={styles.section}>Explore this event</Text>}
          {shown.map(item => <AlbumCard key={item.id} album={item} />)}
          {!albumId && !shown.length && <View style={styles.message}><Ionicons name="images-outline" size={32} color={BLUE} /><Text style={styles.cardTitle}>{albums.length ? 'No matching albums' : 'New memories coming soon'}</Text><Text style={styles.body}>{albums.length ? 'Try another event name or view all albums.' : 'Event photos will appear here when published.'}</Text></View>}
          {albumId && <Text style={styles.section}>Photos</Text>}
          {albumId && !photos.length && <Text style={styles.body}>Photos have not been added to this album yet.</Text>}
        </>}
      </View>}
      renderItem={({ item, index }) => loading || error ? null : <Pressable accessibilityRole="button" accessibilityLabel={item.caption || `Open photo ${index + 1}`} onPress={() => setSelected(index)} style={{ width: tileWidth, height: tileWidth, marginBottom: 4, borderRadius: 8, overflow: 'hidden', backgroundColor: '#E3E8E2' }}><Image source={item.thumbnail_url || item.image_url} recyclingKey={item.id} contentFit="cover" style={{ width: '100%', height: '100%' }} /></Pressable>}
      ListFooterComponent={!loading && !error && hasMore ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={[styles.button, { marginTop: 20 }]}>{loadingMore ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>Load more photos</Text>}</Pressable> : null} />
    {selected !== null && <PhotoViewer photos={photos} index={selected} onClose={() => setSelected(null)} />}
  </>;
}
const styles = StyleSheet.create({
  heading: { fontSize: 30, lineHeight: 35, fontWeight: '800', color: brand.premium, marginTop: 12, marginBottom: 10 },
  body: { fontSize: 14, lineHeight: 21, color: brand.muted },
  card: { backgroundColor: '#FFFFFF', borderRadius: 22, borderWidth: 1, borderColor: '#DFE5DF', overflow: 'hidden', marginBottom: 20 },
  cover: { backgroundColor: '#E6EBE3', alignItems: 'center', justifyContent: 'center' },
  featured: { position: 'absolute', top: 14, left: 14, backgroundColor: 'white', borderRadius: 7, paddingHorizontal: 10, paddingVertical: 6 },
  featuredText: { color: BLUE, fontSize: 10, letterSpacing: 1.2, fontWeight: '800' },
  eyebrow: { color: BLUE, fontSize: 12, fontWeight: '700' },
  cardTitle: { color: brand.premium, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#EEF2FF', alignItems: 'center', justifyContent: 'center' },
  credit: { color: brand.muted, fontSize: 12, marginTop: 14 },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DFE5DF', borderRadius: 16, marginBottom: 14 },
  filter: { paddingHorizontal: 17, paddingVertical: 11, borderRadius: 22, borderWidth: 1, borderColor: '#DFE5DF', backgroundColor: 'white' },
  section: { color: brand.premium, fontSize: 20, fontWeight: '700', marginBottom: 16 },
  message: { padding: 24, borderRadius: 20, backgroundColor: 'white', gap: 12 },
  button: { backgroundColor: BLUE, borderRadius: 14, padding: 15, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '700' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#EEF2FF', padding: 16, borderRadius: 18 },
  viewerBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, height: 60 },
  iconButton: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
});
