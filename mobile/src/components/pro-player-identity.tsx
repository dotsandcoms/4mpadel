import { Image } from 'expo-image';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { proInitials, proShortName } from '@/lib/pro-player-display';
import { playerCountryFlag } from '@/lib/player-hub';
import type { ProPerson } from '@/lib/pro-padel';
import { lightBrand as b } from '@/theme/tokens';

export function ProAvatar({ player, photo, size = 24, dark = false }: { player: ProPerson; photo?: string | null; size?: number; dark?: boolean }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [photo]);
  return <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ width: size, height: size, borderRadius: size / 2, overflow: 'hidden', backgroundColor: dark ? '#31443D' : b.panel, borderWidth: StyleSheet.hairlineWidth, borderColor: dark ? '#FFFFFF30' : '#0000001A', alignItems: 'center', justifyContent: 'center' }}>
    {photo?.startsWith('https://') && !failed ? <Image source={{ uri: photo }} cachePolicy="memory-disk" contentFit="cover" style={StyleSheet.absoluteFill} onError={() => setFailed(true)} /> : <Text style={{ color: dark ? '#E8EEE9' : b.muted, fontSize: Math.max(8, Math.round(size * .35)), fontWeight: '600' }}>{proInitials(player.name)}</Text>}
  </View>;
}
export function ProTeamIdentity({ team, photos = {}, dark = false, compact = false }: { team: ProPerson[]; photos?: Record<number, string | null | undefined>; dark?: boolean; compact?: boolean }) {
  const color = dark ? '#F4F7F4' : b.premium;
  return <View style={{ flex: 1, gap: 4 }}>
    {team.length ? team.map(player => <View key={player.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}><ProAvatar player={player} photo={photos[player.id]} size={compact ? 20 : 24} dark={dark} /><Text numberOfLines={1} style={{ flexShrink: 1, color, fontSize: compact ? 12 : 13, fontWeight: '600', lineHeight: compact ? 16 : 18 }}>{proShortName(player)}</Text><Text style={{ fontSize: compact ? 10 : 11 }}>{playerCountryFlag(player.nationality)}</Text></View>) : <Text style={{ color: dark ? '#BCCDC3' : b.muted, fontSize: 13 }}>Players to be confirmed</Text>}
  </View>;
}
export function ProPairPortraits({ team, photos = {}, size = 18 }: { team: ProPerson[]; photos?: Record<number, string | null | undefined>; size?: number }) {
  return <View style={{ flexDirection: 'row', width: team.length > 1 ? size * 2 - 5 : size }}>{team.slice(0, 2).map((player, index) => <View key={player.id} style={{ marginLeft: index ? -5 : 0, borderRadius: size / 2, backgroundColor: b.elevated }}><ProAvatar player={player} photo={photos[player.id]} size={size} /></View>)}</View>;
}
