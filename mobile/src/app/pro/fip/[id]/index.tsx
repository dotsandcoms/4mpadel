import { useLocalSearchParams } from 'expo-router';
import { FipTournamentScreen } from '@/components/fip-tournament-screen';
export default function FipEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FipTournamentScreen key={id} id={Number(id)} />;
}
