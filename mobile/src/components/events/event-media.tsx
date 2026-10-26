import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { supabase } from '@/lib/supabase';
import { openSitePath } from '@/lib/site';
import type { EventDetail } from '@/lib/events';
import { Notice } from './event-ui';
import { EventIcon, EventText as Text, useEventAccent } from './website-ui';

type Album = { id: string; slug: string | null; title: string };
type AlbumState = { eventId: number; album: Album | null; error: boolean };

export function EventMedia({ event, onAction }: { event: EventDetail; onAction: (action: () => Promise<unknown>) => Promise<void> }) {
  const accent = useEventAccent();
  const insets = useSafeAreaInsets();
  const [albumState, setAlbumState] = useState<AlbumState | null>(null);
  const [refresh, setRefresh] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const images = useMemo(() => Array.isArray(event.media_gallery_urls)
    ? [...new Set(event.media_gallery_urls.filter(url => typeof url === 'string' && url.trim()).map(url => url.trim()))]
    : [], [event.media_gallery_urls]);
  const media = albumState?.eventId === event.id ? albumState : null;
  const selectedImage = selectedIndex === null ? null : images[selectedIndex];

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const { data, error } = await supabase.from('albums').select('id, slug, title')
          .eq('event_id', event.id).eq('is_active', true).is('parent_album_id', null).limit(1);
        if (!cancelled) setAlbumState({ eventId: event.id, album: data?.[0] || null, error: !!error });
      } catch {
        if (!cancelled) setAlbumState({ eventId: event.id, album: null, error: true });
      }
    })();
    return () => { cancelled = true; };
  }, [event.id, refresh]);

  const movePhoto = (direction: number) => setSelectedIndex(index =>
    index === null ? null : (index + direction + images.length) % images.length);

  return <>
    {!media ? <ActivityIndicator accessibilityLabel="Loading event photos" color={accent} style={{ padding: 24 }} /> : media.error ?
      <Notice title="Event photos could not load" onRetry={() => { setAlbumState(null); setRefresh(value => value + 1); }}>Please try again to view the event photos.</Notice> :
      media.album ? <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 20, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: '#0f172a', fontSize: 16, fontWeight: '500' }}>{media.album.title}</Text>
        <Pressable accessibilityRole="button" onPress={() => void onAction(() => openSitePath(`/gallery/${media.album!.slug || media.album!.id}`, { forceBrowser: true }))} style={{ backgroundColor: accent, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 12 }}>
          <Text style={{ color: '#000', fontSize: 13 }}>View event gallery</Text>
        </Pressable>
      </View> : images.length > 0 ? <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' }}>
          <EventIcon name="photo" color="#0a0a0a" size={18} />
          <Text accessibilityRole="header" style={{ color: '#0f172a', fontSize: 14, fontWeight: '500', flex: 1 }}>Event Photos</Text>
          <Text style={{ color: '#65726B', fontSize: 12 }}>{images.length} {images.length === 1 ? 'photo' : 'photos'}</Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
          {images.map((url, index) => <Pressable key={url} accessibilityRole="button" accessibilityLabel={`View photo ${index + 1} of ${images.length} from ${event.event_name}`} onPress={() => setSelectedIndex(index)} style={{ width: '48%', flexGrow: 1, maxWidth: '50%', aspectRatio: 3 / 4, borderRadius: 8, backgroundColor: '#f3f4f6', overflow: 'hidden' }}>
            <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} contentFit="contain" />
          </Pressable>)}
        </View>
      </View> : !event.youtube_playlist_url && <View style={{ backgroundColor: '#fff', padding: 24, paddingVertical: 64, borderRadius: 16, alignItems: 'center', gap: 10 }}>
        <EventIcon name="camera" color="#e5e7eb" size={48} />
        <Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '500' }}>No Media Yet</Text>
        <Text style={{ color: '#65726B', fontSize: 14 }}>Media will be added after the event.</Text>
      </View>}
    {!!event.youtube_playlist_url && <View style={{ backgroundColor: '#fff', borderRadius: 16, borderWidth: 1, borderColor: '#f3f4f6', padding: 20, gap: 12 }}>
      <Text accessibilityRole="header" style={{ color: '#0f172a', fontSize: 14, fontWeight: '500' }}>Event Highlights</Text>
      <Pressable accessibilityRole="button" onPress={() => void onAction(() => Linking.openURL(event.youtube_playlist_url!))} style={{ backgroundColor: accent, minHeight: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', padding: 12 }}><Text style={{ color: '#000', fontSize: 13 }}>Watch highlights</Text></Pressable>
    </View>}
    <Modal visible={!!selectedImage} transparent animationType="fade" onRequestClose={() => setSelectedIndex(null)}>
      <View accessibilityViewIsModal style={{ flex: 1, backgroundColor: '#0a0a0a', paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, gap: 12 }}>
          <Text numberOfLines={1} style={{ flex: 1, color: '#fff', fontSize: 14 }}>{event.event_name}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close photo viewer" onPress={() => setSelectedIndex(null)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={24} color="#fff" /></Pressable>
        </View>
        {!!selectedImage && <Image source={{ uri: selectedImage }} accessibilityLabel={`${event.event_name} — photo ${selectedIndex! + 1}`} style={{ flex: 1, width: '100%' }} contentFit="contain" />}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20, padding: 8 }}>
          {images.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Previous photo" onPress={() => movePhoto(-1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-back" size={24} color="#fff" /></Pressable>}
          <Text accessibilityLiveRegion="polite" style={{ color: '#fff', fontSize: 14 }}>{selectedIndex === null ? 0 : selectedIndex + 1} / {images.length}</Text>
          {images.length > 1 && <Pressable accessibilityRole="button" accessibilityLabel="Next photo" onPress={() => movePhoto(1)} style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="chevron-forward" size={24} color="#fff" /></Pressable>}
        </View>
      </View>
    </Modal>
  </>;
}
