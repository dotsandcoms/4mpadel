import { useWindowDimensions } from 'react-native';
import { NativeSegmentedControl } from './native-segmented-control';
import type { HomeSource } from '@/hooks/use-home-feed';

export type HomeFeedTab = HomeSource | 'following';
type Props =
  | { following?: false; value: HomeSource; onChange: (value: HomeSource) => void }
  | { following: true; value: HomeFeedTab; onChange: (value: HomeFeedTab) => void };

export function HomeSourcePicker(props: Props) {
  const { width, fontScale } = useWindowDimensions();
  const compact = width < (props.following ? 540 : 360) || fontScale > 1.2;
  return <NativeSegmentedControl label="Padel feed" value={props.value} onChange={next => {
    if (next === '4m' || next === 'international') props.onChange(next);
    else if (next === 'following' && props.following) props.onChange(next);
  }} options={[
    { value: '4m', label: '4M' }, { value: 'international', label: compact ? 'Premier & FIP' : 'Premier Padel & FIP' },
    ...(props.following ? [{ value: 'following', label: 'Following' }] : []),
  ]} />;
}
