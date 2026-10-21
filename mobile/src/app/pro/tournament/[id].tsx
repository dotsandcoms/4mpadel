import { ProTournamentScreen } from '@/components/pro-tournament-screen';
import { useLocalSearchParams } from 'expo-router';

export default function TournamentScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ProTournamentScreen key={id} id={Number(id)} />;
}
