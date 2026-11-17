import { ProPairPortraits } from '@/components/pro-player-identity';
import { useProPlayerPortraits } from '@/hooks/use-pro-player-portraits';
import { playerCountryFlag } from '@/lib/player-hub';
import { proShortName } from '@/lib/pro-player-display';
import type { TournamentEntry } from '@/lib/pro-tournament-entries';
import { lightBrand as b } from '@/theme/tokens';
import { Ionicons } from '@expo/vector-icons';
import { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

export const ProTournamentEntry = memo(function Entry({ entry, onPress, photosEnabled }: { entry: TournamentEntry; onPress: () => void; photosEnabled: boolean }) {
  const photos = useProPlayerPortraits(entry.team.map(player => player.id), photosEnabled);
  const live = entry.status.startsWith('Live');
  return <Pressable accessibilityRole="button" accessibilityLabel={`${entry.team.map(player => player.name).join(' and ')}, ${entry.seed ? `seed ${entry.seed}, ` : ''}${entry.status}. View tournament journey`} onPress={onPress} style={[s.row, entry.seed != null && entry.seed <= 4 && s.topSeed]}>
    <ProPairPortraits team={entry.team} photos={photos} size={40} />
    <View style={s.names}>{entry.team.map(player => <Text key={player.id} numberOfLines={1} style={s.name}>{playerCountryFlag(player.nationality)} {proShortName(player)}</Text>)}</View>
    <View style={s.trailing}>{entry.seed != null && <Text style={s.seed}>Seed {entry.seed}</Text>}<Text style={[s.status, live && { color: b.danger }]}>{live ? '● ' : ''}{entry.status}</Text></View>
    <Ionicons name="chevron-forward" size={16} color={b.muted} />
  </Pressable>;
});
const s = StyleSheet.create({
  row: { paddingVertical: 14, paddingHorizontal: 12, minHeight: 80, flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: b.elevated, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  topSeed: { backgroundColor: '#ECF1E9' },
  names: { flex: 1, gap: 4, minWidth: 0 }, name: { fontSize: 13, lineHeight: 18, fontWeight: '600', color: b.premium },
  trailing: { alignItems: 'flex-end', gap: 5, maxWidth: 85 }, seed: { fontSize: 10, fontWeight: '700', color: b.accent, backgroundColor: b.panel, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3 },
  status: { fontSize: 10, fontWeight: '500', color: b.muted },
});
