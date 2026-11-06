import { useRouter } from 'expo-router';
import { ChatButton } from './ui';
export function PlayerMessageButton({ playerId }: { playerId: string }) {
  const router = useRouter();
  return <ChatButton quiet onPress={() => router.push({ pathname: '/messages/new', params: { playerId } })}>Message player</ChatButton>;
}
export function EventMessagesButton({ eventId }: { eventId: number }) {
  const router = useRouter();
  return <ChatButton quiet onPress={() => router.push({ pathname: '/messages/events', params: { eventId: String(eventId) } })}>Announcements & discussions</ChatButton>;
}
