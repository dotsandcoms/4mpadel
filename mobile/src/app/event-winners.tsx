import { useLocalSearchParams, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventArtwork } from '@/components/event-artwork';
import { FeedPortrait } from '@/components/home-feed';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { localPlayerCountryFlag } from '@/lib/player-hub';
import { useEventWinners } from '@/hooks/use-event-winners';
import { formatEventRange } from '@/lib/home';
import { resultHighlightKey, type ResultHighlight, type ResultPlayer, type WinnerFinal } from '@/lib/home-results';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

function ResultPerson({ player, winner, onPlayer }: { player: ResultPlayer; winner: boolean; onPlayer: (id: number) => void }) {
  const flag = localPlayerCountryFlag(player.country);
  const identity = <>
    <FeedPortrait name={player.name} uri={player.photo} size={winner ? 32 : 24} />
    <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
      <Text style={winner ? s.playerName : s.opponentName}>{!winner && flag ? `${flag} ` : ''}{player.name}</Text>
      {winner && (flag || player.ranking) && <Text style={s.playerMeta}>{flag ? `${flag}  ` : ''}{player.ranking ? `${player.ranking.label} #${player.ranking.rank}` : ''}</Text>}
    </View>
  </>;
  return player.profileId ? <Pressable style={[s.player, winner && { minHeight: 44 }]} hitSlop={winner ? 0 : 6} accessibilityRole="button" accessibilityLabel={`${player.name}. View player profile`} onPress={() => onPlayer(player.profileId!)}>{identity}</Pressable> : <View style={s.player}>{identity}</View>;
}

export function DivisionWinners({ result, loading, onFinal, onPlayer }: { result: ResultHighlight; loading: boolean; onFinal: (final: WinnerFinal) => void; onPlayer: (id: number) => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stackScores = width < 350 || fontScale > 1.35;
  const opponents = result.runnersUp ?? (result.runnerUp || '').split(/\s*(?:&|\s\/\s)\s*/).map(name => name.trim()).filter(Boolean).map(name => ({ name, photo: null }));
  const final = result.final, scores = final?.scores ?? [];
  const scoreLabel = (index: number) => final?.summary ? 'Total' : `S${index + 1}`;
  const scoreColumns = (side: number) => scores.length ? <View style={s.scores} accessibilityLabel={`${side === 0 ? 'Winners' : 'Runners-up'} ${final?.summary ? 'match total' : 'set scores'}: ${scores.map(set => set[side]).join(', ')}`}>
    {scores.map((set, index) => <View key={index} style={s.scoreCell}>
      {stackScores && <Text style={s.setLabel}>{scoreLabel(index)}</Text>}
      <Text style={[s.score, side === 1 && s.losingScore]}>{set[side]}</Text>
    </View>)}
  </View> : null;
  return <View style={s.division}>
    <View style={s.divisionHeading}>
      <Text accessibilityRole="header" style={s.divisionName}>{result.division}</Text>
      <View style={s.winnerMark}><SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor={b.accent} /><Text style={s.winnerLabel}>Winners</Text></View>
    </View>
    <View style={s.scoreHeading}>
      <Text style={s.meta}>{final?.status === 'Walkover' ? 'Won by walkover' : final?.status === 'Retired' ? 'Won by retirement' : final ? 'Final' : 'Winning pair'}</Text>
      {!stackScores && scores.length > 0 && <View style={s.scores}>{scores.map((_, index) => <Text key={index} style={[s.setLabel, s.scoreCell]}>{scoreLabel(index)}</Text>)}</View>}
    </View>
    <View style={[s.team, stackScores && s.stackedTeam]}>
      <View style={s.players}>{result.winners.map((player, index) => <ResultPerson key={`${player.name}:${index}`} player={player} winner onPlayer={onPlayer} />)}</View>
      {scoreColumns(0)}
    </View>
    {opponents.length > 0 && <View style={s.opponents}>
      <Text style={s.opponentLabel}>Runners-up</Text>
      <View style={[s.team, stackScores && s.stackedTeam]}>
        <View style={s.players}>{opponents.map((player, index) => <ResultPerson key={`${player.name}:${index}`} player={player} winner={false} onPlayer={onPlayer} />)}</View>
        {scoreColumns(1)}
      </View>
    </View>}
    {final ? <View style={s.cardFooter}>
      <Text style={[s.meta, { flex: 1 }]}>{final.court || 'Published final'}</Text>
      <HomeAction label="Final details" kind="link" size="small" icon="next" iconPosition="trailing" accentColor={b.muted} onPress={() => onFinal(final)} />
    </View> : !loading && <Text style={s.scoreUnavailable}>Score details unavailable</Text>}
  </View>;
}

export default function EventWinnersSheet() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter(), insets = useSafeAreaInsets();
  const { event, loading, error, retry, detailsLoading, detailsError } = useEventWinners(Number(id));
  const results = event?.resultDivisions ?? (event?.resultHighlight ? [event.resultHighlight] : []);
  const count = new Set(results.map(result => result.division.trim().toLowerCase())).size;
  const openResults = (final?: WinnerFinal) => {
    if (!event) return;
    if (router.canDismiss()) router.dismiss();
    router.navigate({ pathname: '/events/[id]', params: { id: event.slug || String(event.id), tab: 'Results', ...(final ? { division: final.classId, drawChoice: final.choiceId, drawSource: final.source, match: final.matchId } : {}) } });
  };
  const openPlayer = (id: number) => {
    if (router.canDismiss()) router.dismiss();
    router.navigate({ pathname: '/players/[id]', params: { id: String(id) } });
  };
  // Keep the scroll view at the sheet root so native detent changes can size it.
  return <><FlatList data={results} keyExtractor={resultHighlightKey} renderItem={({ item }) => <DivisionWinners result={item} loading={!!detailsLoading} onFinal={openResults} onPlayer={openPlayer} />}
      style={{ flex: 1, backgroundColor: b.page }} contentInsetAdjustmentBehavior="never" showsVerticalScrollIndicator
      contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: Math.max(24, insets.bottom + 16), gap: 8 }}
      ListHeaderComponent={<View>
        <View style={s.header}>
          <Text accessibilityRole="header" style={s.title}>All winners</Text>
          <HomeAction kind="icon" icon="close" label="Close winners" onPress={() => router.back()} />
        </View>
        {event && <View style={s.event}>
          <EventArtwork uri={event.custom_image_url || event.poster_image_url || event.image_url} event={event} style={s.poster} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text style={s.eventName}>{event.event_name}</Text>
            <Text style={s.meta}>{formatEventRange(event.start_date, event.end_date)}</Text>
            {count > 0 && <Text style={s.meta}>{count} {count === 1 ? 'division' : 'divisions'} · Final results</Text>}
          </View>
        </View>}
        {event && <View style={s.context}>
          {detailsLoading ? <><ActivityIndicator size="small" color={loadingBlue} /><Text style={s.meta}>Loading final details</Text></> : <Text style={s.meta}>Player rankings shown are current SAPA main rankings</Text>}
          {detailsError && <HomeAction label="Try again" kind="outline" size="small" onPress={retry} />}
        </View>}
      </View>}
      ListEmptyComponent={loading ? <ActivityIndicator style={{ marginVertical: 32 }} color={loadingBlue} accessibilityLabel="Loading division winners" /> : <View style={s.empty}>
        <Text style={s.eventName}>{error ? 'Winners couldn’t load' : 'No published winners yet'}</Text>
        <Text style={s.meta}>{error ? 'Please try again.' : event ? 'Division winners will appear once the results are published.' : 'This event is unavailable.'}</Text>
        {error && <HomeAction label="Try again" kind="outline" onPress={retry} />}
      </View>}
      ListFooterComponent={event ? <View style={{ paddingTop: 8 }}><HomeAction label="View full results" kind="outline" icon="next" iconPosition="trailing" fullWidth onPress={() => openResults()} /></View> : null} />
    <ErrorBanner message={detailsError ? 'Some final details couldn’t load. Tap Try again below.' : null} top={8} />
  </>;
}

const s = StyleSheet.create({
  header: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 12, paddingBottom: 8 },
  title: { flex: 1, color: b.premium, fontSize: 20, lineHeight: 26, fontWeight: '600' },
  event: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 8, paddingBottom: 12 },
  poster: { width: 40, height: 56, borderRadius: 6 },
  eventName: { color: b.premium, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  meta: { color: b.muted, fontSize: 12, lineHeight: 16 },
  context: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingBottom: 8 },
  division: { backgroundColor: b.elevated, borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 4, gap: 8 },
  divisionHeading: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  divisionName: { flex: 1, minWidth: 0, color: b.premium, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  winnerMark: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  winnerLabel: { color: b.accent, fontSize: 11, lineHeight: 16, fontWeight: '600' },
  scoreHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  players: { flex: 1, minWidth: 0, gap: 4 },
  player: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 32 },
  playerName: { color: b.premium, fontSize: 14, lineHeight: 18, fontWeight: '600' },
  playerMeta: { color: b.muted, fontSize: 11, lineHeight: 16 },
  opponentName: { color: b.muted, fontSize: 13, lineHeight: 18 },
  opponentLabel: { color: b.muted, fontSize: 11, lineHeight: 16 },
  opponents: { gap: 4, paddingTop: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  team: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  stackedTeam: { flexDirection: 'column', alignItems: 'stretch' },
  scores: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 4 },
  scoreCell: { width: 28, alignItems: 'center', textAlign: 'center' },
  score: { color: b.premium, fontSize: 22, lineHeight: 28, fontVariant: ['tabular-nums'], fontWeight: '600' },
  losingScore: { color: b.muted, fontWeight: '400' },
  setLabel: { color: b.muted, fontSize: 11, lineHeight: 16 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  scoreUnavailable: { color: b.muted, fontSize: 11, lineHeight: 16, paddingBottom: 8 },
  empty: { paddingVertical: 24, gap: 8, alignItems: 'flex-start' },
});
