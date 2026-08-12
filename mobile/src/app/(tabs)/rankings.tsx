import { Placeholder, Screen } from '@/components/screen';

export default function RankingsScreen() {
  return (
    <Screen eyebrow="Standings" title="Rankings">
      <Placeholder label="National and category rankings, rendered with FlashList for long lists." />
    </Screen>
  );
}
