import { trackEvent } from '@/lib/analytics';
import { useAnalyticsSearch } from '@/hooks/use-analytics-search';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Stack, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { fetchMediaAlbum, fetchMediaAlbums, fetchMediaPhotos, PHOTO_PAGE_SIZE, type MediaAlbum, type MediaPhoto } from '@/lib/media';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as brand } from '@/theme/tokens';

const BLUE = '#2449D8';
const PAGE_PADDING = 20;
const ALBUM_GAP = 12;
const PHOTO_GAP = 4;
type MediaTile = { kind: 'album'; album: MediaAlbum } | { kind: 'photo'; photo: MediaPhoto; index: number };
function albumDate(album: MediaAlbum) {
  const date = new Date(album.album_date || album.created_at);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-ZA', { month: 'short', year: 'numeric' });
}
async function openPlaylist(url: string) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:' || !['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'].includes(parsed.hostname)) throw new Error('Invalid playlist');
    void trackEvent('feature_interaction', { feature: 'media', action: 'video_open' });
    await WebBrowser.openBrowserAsync(parsed.toString(), { controlsColor: BLUE });
  } catch { Alert.alert('Video unavailable', 'This playlist could not be opened. Please try again later.'); }
}
function AlbumArtwork({ album }: { album: MediaAlbum }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [album.cover_image_url]);
  return album.cover_image_url && !failed ? <Image
    source={album.cover_image_url} recyclingKey={album.cover_image_url}
    style={StyleSheet.absoluteFill} contentFit="cover" transition={180}
    onError={() => setFailed(true)}
  /> : <View style={styles.artworkFallback}><Ionicons name="images-outline" size={28} color={brand.faint} /></View>;
}
function AlbumCard({ album, width }: { album: MediaAlbum; width: number }) {
  const router = useRouter();
  const { fontScale } = useWindowDimensions();
  // Keep sizing in static styles; NativeWind's native interop drops Pressable style callbacks.
  return <TouchableOpacity activeOpacity={0.65} accessibilityRole="button" accessibilityLabel={`Open ${album.is_featured ? 'featured album ' : ''}${album.title}`}
    onPress={() => { hapticLight(); router.push({ pathname: '/media/[id]', params: { id: album.id } }); }}
    style={[styles.albumItem, { width, maxWidth: width }]}>
    <View style={styles.albumStack}>
      <View style={[styles.stackSheet, styles.stackBack]} />
      <View style={[styles.stackSheet, styles.stackMiddle]} />
      <View style={[styles.cover, { width, height: width }]}><AlbumArtwork album={album} /></View>
      {album.is_featured && <View style={styles.featured}><Ionicons name="star" size={11} color={BLUE} /></View>}
    </View>
    <Text numberOfLines={3} style={[styles.albumTitle, { height: Math.ceil(48 * fontScale) }]}>{album.title}</Text>
    <Text numberOfLines={1} style={styles.albumDate}>{albumDate(album)}</Text>
  </TouchableOpacity>;
}
function AlbumHeader({ album }: { album: MediaAlbum }) {
  return <View style={styles.albumHeader}>
    <View style={styles.detailCover}><AlbumArtwork album={album} /></View>
    <View style={styles.detailMeta}>
      <Ionicons name="albums-outline" size={14} color={brand.muted} />
      <Text style={styles.albumDate}>{albumDate(album)}</Text>
      {album.is_featured && <><View style={styles.metaDot} /><Ionicons name="star" size={11} color={BLUE} /><Text style={styles.featuredLabel}>Featured album</Text></>}
    </View>
    <Text accessibilityRole="header" style={styles.detailTitle}>{album.title}</Text>
    {!!album.description && <Text style={styles.body}>{album.description}</Text>}
    {!!(album.photographer_name || album.photographer_instagram) && <View style={styles.creditRow}>
      <View style={styles.creditIcon}><Ionicons name="camera-outline" size={16} color={brand.muted} /></View>
      <View style={{ flex: 1, gap: 2 }}><Text style={styles.creditLabel}>PHOTOGRAPHY</Text><Text style={styles.creditName}>{album.photographer_name || album.photographer_instagram}</Text></View>
    </View>}
    {!!album.youtube_playlist_url && <TouchableOpacity activeOpacity={0.65} accessibilityRole="button" accessibilityLabel="Watch event videos on YouTube" onPress={() => void openPlaylist(album.youtube_playlist_url!)} style={styles.videoRow}>
      <View style={styles.playIcon}><Ionicons name="play" size={16} color="white" /></View>
      <View style={{ flex: 1, gap: 3 }}><Text style={styles.videoTitle}>Watch the highlights</Text><Text style={styles.albumDate}>Event videos on YouTube</Text></View>
      <Ionicons name="open-outline" size={18} color={brand.premium} />
    </TouchableOpacity>}
  </View>;
}
function PhotoViewer({ photos, index, title, onClose }: { photos: MediaPhoto[]; index: number; title: string; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index);
  const pager = useRef<FlatList<MediaPhoto>>(null);
  const imageHeight = Math.max(120, height - insets.top - insets.bottom - 180);
  const move = (direction: number) => {
    const next = Math.max(0, Math.min(photos.length - 1, current + direction));
    pager.current?.scrollToIndex({ index: next, animated: true });
    setCurrent(next);
  };
  return <Modal visible animationType="fade" onRequestClose={onClose} presentationStyle="fullScreen">
    <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: '#101B17', paddingTop: insets.top, paddingBottom: insets.bottom }}>
      <View style={styles.viewerBar}>
        <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={1} style={styles.viewerTitle}>{title}</Text><Text accessibilityLiveRegion="polite" style={styles.viewerCount}>{current + 1} of {photos.length}</Text></View>
        <Pressable accessibilityRole="button" accessibilityLabel="Close photo" onPress={onClose} style={styles.viewerClose}><Ionicons name="close" size={22} color="white" /></Pressable>
      </View>
      <FlatList ref={pager} key={width} data={photos} horizontal pagingEnabled initialScrollIndex={current} keyExtractor={item => item.id}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })} showsHorizontalScrollIndicator={false}
        onMomentumScrollEnd={event => setCurrent(Math.max(0, Math.min(photos.length - 1, Math.round(event.nativeEvent.contentOffset.x / width))))}
        initialNumToRender={1} maxToRenderPerBatch={3} windowSize={3}
        renderItem={({ item }) => <ScrollView style={{ width }} contentContainerStyle={{ width, height: imageHeight, justifyContent: 'center' }} maximumZoomScale={3} minimumZoomScale={1} centerContent>
          <Image source={item.image_url} contentFit="contain" accessibilityLabel={item.caption || 'Event photograph'} style={{ width, height: imageHeight }} />
        </ScrollView>} />
      <View style={styles.viewerFooter}>
        <Text numberOfLines={2} style={styles.viewerCaption}>{photos[current]?.caption || 'Swipe to browse photos'}</Text>
        <View style={styles.viewerControls}>
          {[-1, 1].map(direction => {
            const disabled = direction < 0 ? current === 0 : current === photos.length - 1;
            return <Pressable key={direction} accessibilityRole="button" accessibilityLabel={direction < 0 ? 'Previous photo' : 'Next photo'} accessibilityState={{ disabled }} disabled={disabled} onPress={() => move(direction)} style={[styles.viewerArrow, disabled && { opacity: 0.25 }]}><Ionicons name={direction < 0 ? 'chevron-back' : 'chevron-forward'} size={20} color="white" /></Pressable>;
          })}
        </View>
      </View>
    </View>
  </Modal>;
}

export function MediaScreen({ albumId }: { albumId?: string }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const [listWidth, setListWidth] = useState(width);
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
  const matching = useMemo(() => albums.filter(item => `${item.title} ${item.description ?? ''}`.toLowerCase().includes(search.trim().toLowerCase())), [albums, search]);
  const shown = useMemo(() => matching.filter(item => !featuredOnly || item.is_featured), [matching, featuredOnly]);
  useAnalyticsSearch(search, shown.length, 'media', !albumId && !loading && !error);
  useEffect(() => { if (album?.id) void trackEvent('content_view', { content_type: 'media_album' }); }, [album?.id]);
  const tiles = useMemo<MediaTile[]>(() => albumId ? photos.map((photo, index) => ({ kind: 'photo', photo, index })) : shown.map(album => ({ kind: 'album', album })), [albumId, photos, shown]);
  const tileWidth = Math.max(1, Math.floor((listWidth - PAGE_PADDING * 2 - PHOTO_GAP * 2) / 3));
  const albumWidth = Math.max(1, Math.floor((listWidth - PAGE_PADDING * 2 - ALBUM_GAP * 2) / 3));
  return <>
    <Stack.Screen options={{ headerShown: true, title: albumId ? 'Album' : 'Media', headerBackTitle: 'Back', headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false }} />
    <FlatList<MediaTile> data={loading || error ? [] : tiles} numColumns={3} keyExtractor={item => item.kind === 'album' ? `album:${item.album.id}` : `photo:${item.photo.id}`} style={{ flex: 1, backgroundColor: brand.page }}
      onLayout={event => setListWidth(event.nativeEvent.layout.width)}
      contentContainerStyle={{ paddingHorizontal: PAGE_PADDING, paddingBottom: insets.bottom + 32 }}
      refreshing={refreshing} onRefresh={() => void load(true)}
      columnWrapperStyle={{ gap: albumId ? PHOTO_GAP : ALBUM_GAP }}
      initialNumToRender={18} maxToRenderPerBatch={12} windowSize={7} keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled"
      ListHeaderComponent={<View>
        {!albumId && <View style={styles.libraryHeader}>
          <Text style={styles.overline}>4M MEDIA</Text>
          <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.heading}>The gallery</Text>{!loading && !error && <Text style={styles.libraryCount}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</Text>}</View>
          <Text style={styles.body}>Event photography & highlights.</Text>
        </View>}
        {loading ? <ActivityIndicator color={BLUE} style={{ marginVertical: 48 }} /> : error ? <View style={styles.message}>
          <Text style={styles.cardTitle}>Media could not be loaded</Text><Text style={styles.body}>Check your connection and try again.</Text>
          <Pressable accessibilityRole="button" onPress={() => void load()} style={styles.button}><Text style={styles.buttonText}>Try again</Text></Pressable>
        </View> : <>
          {album && <AlbumHeader album={album} />}
          {!albumId && <>
            <View style={styles.search}><Ionicons name="search-outline" size={19} color={brand.muted} /><TextInput accessibilityLabel="Search albums" placeholder="Find an event or album" placeholderTextColor={brand.muted} value={search} onChangeText={setSearch} style={styles.searchInput} clearButtonMode="while-editing" returnKeyType="search" /></View>
            <View style={styles.filters}>{['All albums', 'Featured'].map((label, i) => {
              const active = featuredOnly === !!i, count = i ? matching.filter(item => item.is_featured).length : matching.length;
              return <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: active }} onPress={() => { void trackEvent('feature_interaction', { feature: 'media', action: 'filter', selection: i ? 'featured' : 'all' }); setFeaturedOnly(!!i); }} style={[styles.filter, active && styles.activeFilter]}>
                <Text style={[styles.filterLabel, active && styles.activeFilterLabel]}>{label}</Text><Text style={[styles.filterCount, active && styles.activeFilterLabel]}>{count}</Text>
              </Pressable>;
            })}</View>
          </>}
          {!!albumId && albums.length > 0 && <>
            <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Explore this event</Text><Text style={styles.albumDate}>{albums.length} {albums.length === 1 ? 'album' : 'albums'}</Text></View>
            <View style={styles.albumGrid}>{albums.map(item => <AlbumCard key={item.id} album={item} width={albumWidth} />)}</View>
          </>}
          {!!albumId && <View style={styles.sectionHeader}><Text accessibilityRole="header" style={styles.section}>Photos</Text><Text style={styles.albumDate}>{hasMore ? `${photos.length} loaded` : `${photos.length} ${photos.length === 1 ? 'photo' : 'photos'}`}</Text></View>}
        </>}
      </View>}
      renderItem={({ item }) => item.kind === 'album' ? <AlbumCard album={item.album} width={albumWidth} /> : <TouchableOpacity activeOpacity={0.65} accessibilityRole="button" accessibilityLabel={item.photo.caption || `Open photo ${item.index + 1}`} onPress={() => { void trackEvent('feature_interaction', { feature: 'media', action: 'photo_open' }); setSelected(item.index); }} style={[styles.photoTile, { width: tileWidth, height: tileWidth }]}><Image source={item.photo.thumbnail_url || item.photo.image_url} recyclingKey={item.photo.id} contentFit="cover" style={StyleSheet.absoluteFill} /></TouchableOpacity>}
      ListEmptyComponent={!loading && !error ? <View style={styles.message}><View style={styles.emptyIcon}><Ionicons name={albumId ? 'camera-outline' : 'albums-outline'} size={26} color={brand.muted} /></View><Text style={styles.cardTitle}>{albumId ? 'Photos coming soon' : albums.length ? 'No matching albums' : 'No albums yet'}</Text><Text style={styles.body}>{albumId ? 'Photos will appear here when they are published.' : albums.length ? 'Try another event name or browse all albums.' : 'Explore event photos and highlights here after they are published.'}</Text>{!albumId && albums.length > 0 && <Pressable accessibilityRole="button" onPress={() => { setSearch(''); setFeaturedOnly(false); }} style={styles.resetButton}><Text style={styles.resetLabel}>View all albums</Text></Pressable>}</View> : null}
      ListFooterComponent={!loading && !error && hasMore ? <Pressable accessibilityRole="button" disabled={loadingMore} onPress={() => void loadMore()} style={[styles.loadMore, { marginTop: 24 }]}>{loadingMore ? <ActivityIndicator color={brand.premium} /> : <><Text style={styles.loadMoreLabel}>Load more photos</Text><Ionicons name="chevron-down" size={16} color={brand.premium} /></>}</Pressable> : null} />
    {selected !== null && <PhotoViewer photos={photos} index={selected} title={album?.title || 'Event photos'} onClose={() => setSelected(null)} />}
  </>;
}
const styles = StyleSheet.create({
  libraryHeader: { paddingTop: 16, paddingBottom: 24, gap: 7 },
  overline: { color: BLUE, fontSize: 10, fontWeight: '800', letterSpacing: 1.8 },
  titleRow: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 },
  heading: { fontSize: 32, lineHeight: 39, letterSpacing: -1, fontWeight: '800', color: brand.premium },
  libraryCount: { fontSize: 12, color: brand.muted },
  body: { fontSize: 14, lineHeight: 21, color: brand.muted },
  albumGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: ALBUM_GAP },
  albumItem: { marginBottom: 24, flexGrow: 0, flexShrink: 0 },
  albumStack: { paddingTop: 6, marginBottom: 9 },
  stackSheet: { position: 'absolute', height: '85%', borderRadius: 10 },
  stackBack: { top: 0, left: 8, right: 8, backgroundColor: '#DCE3DD' },
  stackMiddle: { top: 3, left: 4, right: 4, backgroundColor: '#E8ECE7' },
  cover: { backgroundColor: '#E6EBE3', borderRadius: 12, overflow: 'hidden' },
  artworkFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  albumDate: { color: brand.muted, fontSize: 11, lineHeight: 16 },
  albumTitle: { color: brand.premium, fontSize: 12, lineHeight: 16, marginBottom: 3, fontWeight: '600' },
  featured: { position: 'absolute', bottom: 6, right: 6, width: 23, height: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFFF2', borderRadius: 12 },
  featuredLabel: { color: BLUE, fontSize: 11, fontWeight: '600' },
  albumHeader: { paddingTop: 10, marginBottom: 28, gap: 12 },
  detailCover: { aspectRatio: 1.65, borderRadius: 16, overflow: 'hidden', backgroundColor: '#E6EBE3', marginBottom: 4 },
  detailMeta: { flexDirection: 'row', alignItems: 'center', gap: 7, flexWrap: 'wrap' },
  metaDot: { width: 3, height: 3, borderRadius: 2, backgroundColor: '#A0AAA4', marginHorizontal: 2 },
  detailTitle: { color: brand.premium, fontSize: 27, lineHeight: 33, letterSpacing: -0.6, fontWeight: '700' },
  creditRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 3 },
  creditIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#E8EDE7', alignItems: 'center', justifyContent: 'center' },
  creditLabel: { color: brand.muted, fontSize: 8, letterSpacing: 1.2, fontWeight: '700' },
  creditName: { color: brand.premium, fontSize: 12, fontWeight: '600' },
  cardTitle: { color: brand.premium, fontSize: 18, lineHeight: 24, fontWeight: '700' },
  search: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E0E5E0', borderRadius: 12, marginBottom: 16 },
  searchInput: { flex: 1, minHeight: 48, color: brand.premium, fontSize: 14, paddingVertical: 12 },
  filters: { flexDirection: 'row', gap: 24, borderBottomWidth: 1, borderBottomColor: '#DEE4DE', marginBottom: 20 },
  filter: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 46, borderBottomWidth: 2, borderBottomColor: 'transparent', paddingHorizontal: 1 },
  activeFilter: { borderBottomColor: brand.premium },
  filterLabel: { color: brand.muted, fontWeight: '600', fontSize: 13 },
  filterCount: { color: brand.muted, fontSize: 11 },
  activeFilterLabel: { color: brand.premium },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 16 },
  section: { color: brand.premium, fontSize: 18, fontWeight: '700', letterSpacing: -0.3 },
  photoTile: { marginBottom: PHOTO_GAP, borderRadius: 4, overflow: 'hidden', backgroundColor: '#E3E8E2' },
  message: { paddingVertical: 32, paddingHorizontal: 16, alignItems: 'center', gap: 10 },
  emptyIcon: { width: 58, height: 58, borderRadius: 29, backgroundColor: '#E8EDE7', alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16 },
  resetLabel: { color: BLUE, fontSize: 13, fontWeight: '700' },
  button: { backgroundColor: BLUE, borderRadius: 14, padding: 15, alignItems: 'center' },
  buttonText: { color: 'white', fontSize: 15, fontWeight: '700' },
  loadMore: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, minHeight: 48, backgroundColor: '#E8EDE7', borderRadius: 12 },
  loadMoreLabel: { color: brand.premium, fontSize: 13, fontWeight: '600' },
  videoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#DFE5DF', paddingVertical: 14, marginTop: 4 },
  playIcon: { width: 38, height: 38, borderRadius: 19, backgroundColor: brand.premium, alignItems: 'center', justifyContent: 'center' },
  videoTitle: { color: brand.premium, fontSize: 14, fontWeight: '600' },
  viewerBar: { flexDirection: 'row', alignItems: 'center', gap: 16, paddingHorizontal: 20, height: 72 },
  viewerTitle: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  viewerCount: { color: '#A8B6AD', fontSize: 12, fontVariant: ['tabular-nums'] },
  viewerClose: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
  viewerFooter: { minHeight: 108, paddingHorizontal: 20, paddingBottom: 12, gap: 8, alignItems: 'center' },
  viewerCaption: { color: '#DEE6E2', fontSize: 13, lineHeight: 19, textAlign: 'center', minHeight: 38 },
  viewerControls: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  viewerArrow: { width: 44, height: 44, borderRadius: 22, backgroundColor: '#FFFFFF14', alignItems: 'center', justifyContent: 'center' },
});
