import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Club } from '@/lib/clubs';
import { lightBrand as b } from '@/theme/tokens';

export function ClubVerifiedBadge({ size = 20 }: { size?: number }) {
  return <SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={size} tintColor={b.accent} accessibilityLabel="4M approved" />;
}

export function clubTagsDescription(club: Club) {
  return [club.approved && '4M Approved', club.sapaRegistered && 'SAPA', club.clubType, club.group && `Part of ${club.group.shortName || club.group.name}`].filter(Boolean).join('. ');
}

export function ClubTags({ club, onGroup, compact = false }: { club: Club; onGroup?: () => void; compact?: boolean }) {
  if (!club.approved && !club.sapaRegistered && !club.clubType && !club.group) return null;
  const tagStyle = [s.tag, compact && s.compactTag], labelStyle = [s.label, compact && s.compactLabel];
  const iconSize = compact ? 12 : 14;
  const approvedTag = club.approved ? <View style={tagStyle}><SymbolView name={{ ios: 'checkmark.seal.fill', android: 'verified', web: 'verified' }} size={iconSize} tintColor={b.accent} accessibilityElementsHidden /><Text numberOfLines={compact ? 1 : undefined} style={labelStyle}>4M Approved</Text></View> : null;
  const groupContent = club.group ? <><SymbolView name={{ ios: 'building.2', android: 'apartment', web: 'apartment' }} size={iconSize} tintColor={b.messagingAction} accessibilityElementsHidden /><Text numberOfLines={compact ? 1 : undefined} style={[labelStyle, { color: b.messagingAction, flexShrink: 1 }]}>Part of {club.group.shortName || club.group.name}</Text></> : null;
  const groupTag = club.group ? onGroup ? <Pressable accessibilityRole="button" accessibilityLabel={`Part of ${club.group.name}. View club group`} onPress={onGroup} style={[tagStyle, s.group, compact && s.compactGroup]}>{groupContent}</Pressable> : <View style={[tagStyle, { backgroundColor: '#EAF1F9' }, compact && s.compactGroup]}>{groupContent}</View> : null;
  return <View style={[s.tags, compact && { gap: 4 }]}>
    {compact ? (approvedTag || groupTag) && <View style={s.compactPrimary}>{approvedTag}{groupTag}</View> : approvedTag}
    {club.sapaRegistered && <View style={tagStyle}><SymbolView name={{ ios: 'checkmark.shield', android: 'verified_user', web: 'verified_user' }} size={iconSize} tintColor={b.accent} accessibilityElementsHidden /><Text style={labelStyle}>SAPA</Text></View>}
    {!!club.clubType && <View style={[tagStyle, { backgroundColor: b.surface }]}><Text style={[labelStyle, { color: b.muted }]}>{club.clubType}</Text></View>}
    {!compact && groupTag}
  </View>;
}
const s = StyleSheet.create({
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, alignItems: 'center' },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: b.glass, maxWidth: '100%' },
  group: { minHeight: 44, backgroundColor: '#EAF1F9' },
  label: { color: b.accent, fontSize: 12, lineHeight: 18, fontWeight: '600' },
  compactTag: { paddingHorizontal: 6, paddingVertical: 3, gap: 3 },
  compactLabel: { fontSize: 10, lineHeight: 14, flexShrink: 1 },
  compactPrimary: { width: '100%', flexDirection: 'row', gap: 4, alignItems: 'center' },
  compactGroup: { minWidth: 0, flexShrink: 1 },
});
