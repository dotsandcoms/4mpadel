import { ProPairJourneyScreen } from '@/components/pro-pair-journey-screen';
import { useLocalSearchParams } from 'expo-router';

export default function PairJourneyScreen() {
  const { id, pair, category } = useLocalSearchParams<{ id: string; pair: string; category?: string }>();
  return <ProPairJourneyScreen key={`${id}:${pair}:${category}`} id={Number(id)} pair={pair || ''} category={category === 'women' ? 'women' : 'men'} />;
}
