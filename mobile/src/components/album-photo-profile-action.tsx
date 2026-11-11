import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { HomeAction } from './home-action';
import { fetchMyPlayerGallery, saveAlbumPhotoToProfile } from '@/lib/album-profile';
import { MAX_PLAYER_GALLERY_PHOTOS } from '@/lib/profile-photos';
import { hapticLight } from '@/lib/haptics';
import { lightBrand as b } from '@/theme/tokens';
import type { MediaPhoto } from '@/lib/media';

export function AlbumPhotoProfileAction({ albumId, photo, onError }: { albumId: string; photo: MediaPhoto; onError: (message: string) => void }) {
  const [gallery, setGallery] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(false), lock = useRef(false), readVersion = useRef(0);
  useEffect(() => {
    mounted.current = true;
    const request = ++readVersion.current;
    void fetchMyPlayerGallery().then(value => { if (mounted.current && request === readVersion.current) setGallery(value); }).catch(() => {});
    return () => { mounted.current = false; };
  }, []);
  const saved = gallery?.includes(photo.image_url) ?? false;
  const full = !!gallery && gallery.length >= MAX_PLAYER_GALLERY_PHOTOS;
  const save = async () => {
    if (lock.current || saved) return;
    lock.current = true; readVersion.current++; setBusy(true); onError('');
    try {
      const result = await saveAlbumPhotoToProfile(albumId, photo.id);
      if (mounted.current) { setGallery(result.gallery); hapticLight(); }
    } catch (e) { if (mounted.current) onError(e instanceof Error ? e.message : 'This photo could not be added. Please try again.'); }
    finally { if (mounted.current) setBusy(false); lock.current = false; }
  };
  return <View style={{ width: '100%', gap: 6 }}>
    <HomeAction label={busy ? 'Adding photo…' : saved ? 'On my profile' : full ? 'Player Gallery full' : 'Add to my profile'}
      accessibilityLabel={saved ? 'Photo saved in your Player Gallery' : full ? 'Player Gallery full. Remove a photo in Profile, Photos to add another.' : 'Add this photo to my public Player Gallery'}
      icon={saved ? 'scheduleCheck' : 'scheduleAdd'} kind="primary" fullWidth compact accentColor={b.messagingAction}
      disabled={busy || saved || full} onPress={() => void save()} />
    <Text accessibilityLiveRegion="polite" style={{ color: '#A8B6AD', fontSize: 11, lineHeight: 16, textAlign: 'center' }}>
      {full && !saved ? 'Remove a photo in Profile → Photos to make space' : `Visible in your Player Gallery${gallery ? ` · ${gallery.length}/${MAX_PLAYER_GALLERY_PHOTOS}` : ''}`}
    </Text>
  </View>;
}
