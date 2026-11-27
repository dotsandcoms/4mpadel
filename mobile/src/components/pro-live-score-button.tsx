import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';

import { pinLiveScore, supportsScorePinning, unpinLiveScore, usePinnedScore } from '@/lib/pro-live-score-pin';
import { lightBrand as brand } from '@/theme/tokens';

export function ProLiveScoreButton({ id, live }: { id: number; live: boolean }) {
  const pinned = usePinnedScore();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  if (!supportsScorePinning || (!live && pinned !== id)) return null;
  const active = pinned === id;
  const label = active ? 'Unpin live score' : 'Pin live score';

  const toggle = async () => {
    setBusy(true);
    setError('');
    try { await (active ? unpinLiveScore(id) : pinLiveScore(id)); }
    catch (issue) { setError(issue instanceof Error ? issue.message : 'Could not change this live score.'); }
    finally { setBusy(false); }
  };

  const onPress = () => {
    if (pinned !== null && !active) {
      Alert.alert('Replace pinned score?', 'This will stop tracking the other match on this device.', [
        { text: 'Cancel', style: 'cancel' }, { text: 'Replace', onPress: () => void toggle() },
      ]);
    } else void toggle();
  };

  return <View style={{ gap: 6 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy, busy }} disabled={busy} onPress={onPress}
      style={{ alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 14, borderRadius: 22, backgroundColor: brand.glass,
        flexDirection: 'row', alignItems: 'center', gap: 8, opacity: busy ? 0.6 : 1 }}>
      <Ionicons name={active ? 'pin' : 'pin-outline'} size={17} color={brand.accent} accessible={false} />
      <Text style={{ color: brand.accent, fontWeight: '700' }}>{busy ? 'Updating…' : label}</Text>
    </Pressable>
    {!!error && <Text accessibilityRole="alert" style={{ color: brand.danger, fontSize: 13 }}>{error}</Text>}
  </View>;
}
