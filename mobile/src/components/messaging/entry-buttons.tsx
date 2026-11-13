import { useRouter } from 'expo-router';
import { ChatButton } from './ui';
import { HomeAction } from '@/components/home-action';
import { lightBrand as b } from '@/theme/tokens';
export function PlayerMessageButton({ playerId, name, compact = false }: { playerId: string; name?: string; compact?: boolean }) {
  const router = useRouter();
  if (compact) return <HomeAction label="Message" accessibilityLabel={name ? `Message ${name}` : 'Message player'} icon="message" kind="outline" size="small" accentColor={b.messagingAction}
    onPress={() => router.push({ pathname: '/messages/new', params: { playerId } })} />;
  return <ChatButton quiet onPress={() => router.push({ pathname: '/messages/new', params: { playerId } })}>Message player</ChatButton>;
}
export function EventMessagesButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  return <ChatButton quiet onPress={() => router.push({ pathname: '/messages/events', params: { eventId: String(eventId) } })}>Announcements & discussions</ChatButton>;
}
