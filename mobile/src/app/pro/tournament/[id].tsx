import { ProTournamentScreen } from '@/components/pro-tournament-screen';
import { useLocalSearchParams } from 'expo-router';

export default function TournamentScreen() {
  const { id, tab, category } = useLocalSearchParams<{ id: string; tab?: string; category?: string }>();
  return <ProTournamentScreen key={id} id={Number(id)} initialTab={tab === 'entries' ? 'entries' : tab === 'matches' ? 'matches' : 'overview'} initialCategory={category === 'women' ? 'women' : 'men'} />;
}
