import { Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EventText as Text } from '@/components/events/website-ui';
import type { TrophyGroup } from '@/lib/rankings';
import { lightSapaTone as sapaTone } from '@/theme/sapa';

/** The same trophy detail sheet is used by rankings and 4M player profiles. */
export function TrophyBreakdown({ playerName, groups, selectedTier, onClose }: {
  playerName: string;
  groups: TrophyGroup[];
  selectedTier: string | null;
  onClose: () => void;
}) {
  const safe = useSafeAreaInsets();
  return <Modal visible={selectedTier !== null} animationType="slide" presentationStyle="pageSheet" allowSwipeDismissal onRequestClose={onClose}>
    <View style={{ flex: 1, backgroundColor: '#F5F6F3' }}>
      <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: '#666', marginTop: 10 }} />
      <ScrollView contentInsetAdjustmentBehavior="never" contentContainerStyle={{ padding: 20, paddingBottom: safe.bottom + 24, gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text accessibilityRole="header" style={{ flex: 1, fontSize: 18 }}>Trophy breakdown</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close trophy breakdown" onPress={onClose} style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 24, color: '#65726B' }}>×</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 12, color: '#65726B' }}>{playerName}</Text>
        {groups.filter(group => group.tier === selectedTier).map(group => <View key={group.tier} style={{ gap: 10, padding: 14, borderRadius: 14, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: `${sapaTone(group.tier).fill}33` }}>
          <Text style={{ fontSize: 13, color: sapaTone(group.tier).fill }}>{group.tier} · {group.count} {group.count === 1 ? 'tournament won' : 'tournaments won'}</Text>
          {group.events.map(event => <View key={`${event.date}-${event.name}`} style={{ gap: 6, paddingTop: 10, borderTopWidth: 1, borderColor: '#16251f12' }}>
            <Text style={{ fontSize: 10, color: '#65726B' }}>{event.date || 'Date unavailable'}</Text>
            <Text style={{ fontSize: 13, lineHeight: 18 }}>{event.name}</Text>
            {event.results.map((result, index) => <View key={index} style={{ gap: 5 }}>
              <Text style={{ fontSize: 11, lineHeight: 16, color: '#65726B' }}>{result.class || 'Division not supplied'}</Text>
              {!!result.rankingLabel && <Text style={{ fontSize: 10, color: '#828b9a' }}>{result.rankingLabel}</Text>}
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
                <Text style={{ fontSize: 11, color: sapaTone(group.tier).fill }}>1st place · Winner</Text>
                <Text style={{ fontSize: 11 }}>{Number(result.points || 0).toLocaleString(undefined, { maximumFractionDigits: 3 })} points</Text>
              </View>
            </View>)}
          </View>)}
        </View>)}
      </ScrollView>
    </View>
  </Modal>;
}
