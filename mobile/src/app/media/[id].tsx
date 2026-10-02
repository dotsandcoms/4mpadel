import { useLocalSearchParams } from 'expo-router';
import { MediaScreen } from '@/components/media-screen';
export default function MediaAlbumPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <MediaScreen key={id} albumId={id} />;
}
