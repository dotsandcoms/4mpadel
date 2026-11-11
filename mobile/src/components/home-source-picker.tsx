import { useWindowDimensions } from 'react-native';
import { NativeSegmentedControl } from './native-segmented-control';
import type { HomeSource } from '@/hooks/use-home-feed';

export function HomeSourcePicker({ value, onChange }: { value: HomeSource; onChange: (value: HomeSource) => void }) {
  const { width, fontScale } = useWindowDimensions();
  return <NativeSegmentedControl label="Padel feed" value={value} onChange={next => { if (next === '4m' || next === 'international') onChange(next); }} options={[
    { value: '4m', label: '4M' }, { value: 'international', label: width < 360 || fontScale > 1.2 ? 'Premier & FIP' : 'Premier Padel & FIP' },
  ]} />;
}
