import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, AppState, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { HomeAction } from '@/components/home-action';
import { FeedPortrait } from '@/components/home-feed';
import { ErrorBanner } from '@/components/error-banner';
import { useScreenActive } from '@/hooks/use-screen-active';
import { isEventFinished } from '@/lib/home';
import { drawMatchWhen, type DrawTeam } from '@/lib/tournament-draw';
import { fetchMatchUpdateBatch, fetchMatchUpdateCatalog, sortMatchUpdates, type EventMatchUpdate, type MatchUpdateCatalog } from '@/lib/event-match-updates';
import type { EventDetail } from '@/lib/events';
import type { RankedPlayer } from '@/lib/event-teams';
import { lightBrand as b } from '@/theme/tokens';

type State = { eventId: number; catalog: MatchUpdateCatalog; items: EventMatchUpdate[]; next: number; stale: boolean; warning: string | null };
function Team({ team, winner }: { team: DrawTeam; winner: boolean }) {
  return <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
    <View style={{ flexDirection: 'row', width: team.players.length > 1 ? 44 : 26 }}>
      {team.players.slice(0, 2).map((player, index) => <View key={`${player.name}:${index}`} style={{ marginLeft: index ? -8 : 0, borderRadius: 14, borderWidth: 1, borderColor: '#FFFFFF' }}><FeedPortrait name={player.name} uri={player.photo} size={26} /></View>)}
    </View>
    <Text style={{ flex: 1, color: b.premium, fontSize: 13, lineHeight: 18, fontWeight: winner ? '600' : '400' }}>{team.players.map(player => player.name).join(' / ') || team.placeholder || 'Opponent to be confirmed'}</Text>
    {winner && <Ionicons name="checkmark-circle" size={16} color={b.accent} accessibilityLabel="Winning team" />}
  </View>;
}

export function EventMatchUpdates({ event, directory, preview = false, refreshKey = 0, onShowAll, onOpen, onView }: {
  event: EventDetail; directory: RankedPlayer[]; preview?: boolean; refreshKey?: number;
  onShowAll: () => void; onOpen: (item: EventMatchUpdate) => void; onView: (tab: 'Draws' | 'Results') => void;
}) {
  const active = useScreenActive();
  const [state, setState] = useState<State | null>(null);
  const [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [visible, setVisible] = useState(20);
  const version = useRef(0), locked = useRef(false);
  const inputs = useRef({ event, directory }); inputs.current = { event, directory };
  const load = useCallback(async () => {
    const request = ++version.current;
    locked.current = true; setLoading(true); setError('');
    try {
      const { event: current, directory: people } = inputs.current;
      const catalog = await fetchMatchUpdateCatalog(current);
      if (request !== version.current) return;
      const batch = await fetchMatchUpdateBatch(current, people, catalog);
      if (request === version.current) setState({ eventId: current.id, catalog, ...batch });
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'Match updates could not load. Please retry.'); }
    finally { if (request === version.current) { locked.current = false; setLoading(false); } }
  }, []);
  useEffect(() => {
    setState(null); setVisible(20);
    if (!active) return;
    void load();
    const listener = AppState.addEventListener('change', value => { if (value === 'active') void load(); });
    // Archived results do not need polling. Active events share the draw reader's two-minute cache.
    const timer = !isEventFinished(event) ? setInterval(() => { if (AppState.currentState === 'active') void load(); }, 120000) : null;
    return () => { version.current++; locked.current = false; listener.remove(); if (timer) clearInterval(timer); };
  }, [event.id, event.rankedin_id, refreshKey, active, load]);
  const current = state?.eventId === event.id ? state : null;
  const more = async () => {
    if (!current || locked.current) return;
    if (visible < current.items.length) { setVisible(value => value + 20); return; }
    const request = version.current;
    locked.current = true; setLoading(true); setError('');
    try {
      const batch = await fetchMatchUpdateBatch(inputs.current.event, inputs.current.directory, current.catalog, current.next);
      if (request === version.current) { setState({ ...current, ...batch, items: sortMatchUpdates([...current.items, ...batch.items]), stale: current.stale || batch.stale }); setVisible(value => value + 20); }
    } catch (e) { if (request === version.current) setError(e instanceof Error ? e.message : 'More match updates could not load. Please retry.'); }
    finally { if (request === version.current) { locked.current = false; setLoading(false); } }
  };
  const items = current?.items.slice(0, preview ? 3 : visible) || [];
  const hasMore = !!current && (current.next < current.catalog.choices.length || visible < current.items.length);
  const finished = isEventFinished(event);
  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: b.premium, fontSize: 15, fontWeight: '600' }}>Match updates</Text>
      <HomeAction label="Refresh matches" icon="refresh" kind="icon" disabled={loading} onPress={() => void load()} />
    </View>
    {loading && !current && <ActivityIndicator accessibilityLabel="Loading published match updates" color={b.messagingAction} style={{ padding: 20 }} />}
    {!!error && <View style={s.notice}><Text style={s.copy}>{error}</Text><HomeAction label="Retry matches" onPress={() => void load()} /></View>}
    {!!current?.warning && <View style={s.notice}><Text style={s.copy}>{current.warning}</Text><HomeAction label="Retry refresh" onPress={() => void load()} /></View>}
    {current?.stale && <Text style={s.caption}>Showing a saved published draw snapshot</Text>}
    {items.map(item => {
      const match = item.match;
      const live = match.status === 'Live';
      const winner = match.completed ? match.winner : null;
      return <View key={item.key} style={s.card}>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8 }}>
          <Text style={{ color: live ? b.danger : '#8A570C', fontSize: 12, fontWeight: '600' }}>{live ? 'Live match' : match.completed ? match.status : 'Published fixture'}</Text>
          <Text style={s.caption}>{item.choice.source === 'native' ? '4M draw' : 'RankedIn'}</Text>
        </View>
        <Text style={s.caption}>{item.choice.name} · {item.round}</Text>
        <Team team={match.one} winner={winner === 1} /><Team team={match.two} winner={winner === 2} />
        {!!match.scores.length && <Text accessibilityLabel={`Score ${match.scores.map(set => set.join(' to ')).join(', ')}`} style={s.score}>{match.scores.map(set => set.join('–')).join('   ')}{match.summary ? ' · Match total' : ''}</Text>}
        {!!match.start && <Text style={s.caption}>{drawMatchWhen(match.start)}{match.court ? ` · ${match.court}` : ''}</Text>}
        {!match.start && !!match.court && <Text style={s.caption}>{match.court}</Text>}
        <HomeAction label={match.completed ? 'View result' : 'View match'} icon="next" onPress={() => onOpen(item)} />
      </View>;
    })}
    {!loading && !error && current && !items.length && <View style={s.notice}>
      <Text style={{ color: b.premium, fontSize: 15, fontWeight: '600' }}>{current.next < current.catalog.choices.length ? 'No match updates in these draws' : 'No published match updates yet'}</Text>
      <Text style={s.copy}>{current.catalog.choices.length ? 'Published fixtures and results from 4M and RankedIn appear here. You can also open the full event draws and results.' : finished ? 'No published match updates are available for this event. Check Draws or Results for the event’s published records.' : 'Match updates will appear when the organiser publishes the draw or schedules matches. You can check Draws for the latest details.'}</Text>
      <HomeAction label={finished ? 'View results' : 'View draws'} onPress={() => onView(finished ? 'Results' : 'Draws')} />
      {finished && <HomeAction label="View draws" onPress={() => onView('Draws')} />}
    </View>}
    {!!current && <Text style={s.caption}>{current.next} of {current.catalog.choices.length} published draws checked</Text>}
    {preview && (!!items.length || hasMore) ? <HomeAction label="All match updates" onPress={onShowAll} /> : hasMore && <HomeAction label={loading ? 'Loading matches…' : visible < (current?.items.length || 0) ? 'More match updates' : 'Load more draws'} fullWidth disabled={loading} onPress={() => void more()} />}
    <ErrorBanner message={error || current?.warning || null} top={8} />
  </View>;
}

const s = StyleSheet.create({
  card: { backgroundColor: b.elevated, padding: 16, gap: 10, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  notice: { backgroundColor: b.elevated, padding: 20, gap: 8, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  copy: { color: b.muted, fontSize: 13, lineHeight: 19 }, caption: { color: b.muted, fontSize: 12, lineHeight: 18 },
  score: { color: b.premium, fontSize: 16, lineHeight: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
