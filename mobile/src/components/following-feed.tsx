import { memo, useEffect, useState } from 'react';
import { ActivityIndicator, AppState, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import { feedActors, feedCountdown, feedDeadline, feedEventPhoto, feedMatchResult, feedParticipants, feedScheduleLabel, feedScores, feedTime, type FeedItem, type FeedFilter, type FeedPlayer } from '@/lib/following-feed';
import { playerCountryFlag } from '@/lib/player-hub';
import type { useFollowingFeed } from '@/hooks/use-following-feed';
import { HomeAccordion } from '@/components/home-accordion';
import { lightBrand as b } from '@/theme/tokens';
const labels = { entry: 'TOURNAMENT ENTRY', result: 'MATCH RESULT', profile: 'PLAYER UPDATE', ranking: 'RANKING UPDATE', match_live: 'MATCH STARTED', tournament: 'TOURNAMENT UPDATE' };
const icons = { entry: 'calendar-outline', result: 'trophy-outline', profile: 'person-outline', ranking: 'trending-up-outline', match_live: 'play-circle-outline', match_schedule: 'time-outline', tournament: 'calendar-outline' } as const;
const card = { backgroundColor: b.elevated, borderColor: b.edge, borderWidth: 1, borderRadius: 16, padding: 16 } as const;
type State = ReturnType<typeof useFollowingFeed>;
function Portrait({ player, size = 36 }: { player: FeedPlayer; size?: number }) {
  return player.photo ? <Image source={{ uri: player.photo }} contentFit="cover" accessibilityLabel={`${player.name} profile photo`} style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: b.surface }} /> : <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: b.panel, alignItems: 'center', justifyContent: 'center' }}><Text style={{ fontSize: size * .32, fontWeight: '700', color: b.muted }}>{player.name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</Text></View>;
}
function DeadlinePanel({ deadline }: { deadline: string }) {
  const [now, setNow] = useState(Date.now);
  const countdown = feedCountdown(deadline, now);
  const closed = countdown?.closed;
  useEffect(() => {
    if (closed) return;
    let timer: ReturnType<typeof setInterval> | undefined;
    const start = () => { setNow(Date.now()); timer = setInterval(() => setNow(Date.now()), 1000); };
    const stop = () => { if (timer) clearInterval(timer); timer = undefined; };
    if (AppState.currentState === 'active') start();
    const listener = AppState.addEventListener('change', state => { stop(); if (state === 'active') start(); });
    return () => { stop(); listener.remove(); };
  }, [closed, deadline]);
  if (!countdown) return null;
  const date = new Date(deadline).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  return <View style={{ marginTop: 14, borderRadius: 12, padding: 14, backgroundColor: closed ? b.surface : b.premium }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}><Ionicons name={closed ? 'lock-closed-outline' : 'time-outline'} size={15} color={closed ? b.muted : '#C9EEA7'} /><Text style={{ fontSize: 10, fontWeight: '700', letterSpacing: 1, color: closed ? b.muted : '#C9EEA7' }}>{closed ? 'ENTRIES CLOSED' : 'ENTRIES CLOSE IN'}</Text></View>
    {!closed && <View accessibilityLabel={`${countdown.days} days, ${countdown.hours} hours, ${countdown.minutes} minutes remaining`} style={{ flexDirection: 'row', gap: 16, marginTop: 10 }}>{[['DAYS', countdown.days], ['HRS', countdown.hours], ['MIN', countdown.minutes], ['SEC', countdown.seconds]].map(([label, value]) => <View key={label} style={{ flex: 1, gap: 2 }}><Text style={{ fontSize: 27, fontWeight: '800', color: '#FFFFFF', fontVariant: ['tabular-nums'] }}>{String(value).padStart(2, '0')}</Text><Text style={{ color: '#B8C7BD', fontSize: 9, letterSpacing: .8 }}>{label}</Text></View>)}</View>}
    <Text style={{ marginTop: 8, color: closed ? b.muted : '#C9D5CC', fontSize: 11 }}>{closed ? 'Closed' : 'Deadline'} {date} SAST</Text>
  </View>;
}
export const ActivityCard = memo(function ActivityCard({ item }: { item: FeedItem }) {
  const [failedHeaderPhoto, setFailedHeaderPhoto] = useState<string | null>(null);
  const router = useRouter(), score = ['result', 'match_live', 'match_schedule'].includes(item.kind) ? feedScores(item) : null;
  const result = item.path === '/match-result' ? feedMatchResult(item) : null;
  const open = () => { if (item.path === '/match-result') { if (result) router.push({ pathname: '/match-result', params: { match: result, context: 'following' } }); } else router.push(item.path as Href); };
  const headline = score && score.winner !== null ? `${score.teams[score.winner ?? 0]} ${item.payload.result_type === 'walkover' ? 'advanced by walkover' : 'won'}` : item.kind === 'tournament' && item.payload.update_type === 'details' && typeof item.payload.event_name === 'string' ? item.payload.event_name : item.title;
  const rank = item.payload.rank, previousRank = item.payload.before_rank, points = item.payload.points;
  const pointNumber = typeof points === 'number' && Number.isFinite(points) ? points : null;
  const actors = feedActors(item), participants = feedParticipants(item), eventPhoto = feedEventPhoto(item), deadline = feedDeadline(item);
  const person = actors[0];
  const headerPhoto = item.kind === 'tournament' ? eventPhoto || item.photo : score ? null : person?.photo || item.photo;
  const eventStart = typeof item.payload.event_start_date === 'string' ? new Date(item.payload.event_start_date) : null;
  const eventDay = eventStart && Number.isFinite(eventStart.getTime()) ? eventStart.toLocaleDateString('en-ZA', { day: 'numeric', month: 'short', timeZone: 'Africa/Johannesburg' }) : null;
  const body = item.kind === 'tournament' && Array.isArray(item.payload.changes) ? item.payload.changes.filter(change => change && typeof change === 'object' && !(deadline && (change as Record<string, unknown>).field === 'registration_closes_at')).map(change => { const row = change as Record<string, unknown>; return row.field === 'event_name' ? 'Tournament name updated' : `${String(row.label || '')}: ${String(row.after || '')}`; }).join(' · ') : item.body;
  const deadlineLabel = deadline ? `. ${feedCountdown(deadline)?.closed ? 'Entries closed' : 'Entries close'} ${new Date(deadline).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST` : '';
  return <Pressable accessibilityRole="button" accessibilityLabel={`${item.title}. ${item.body}. ${feedTime(item.occurredAt)}${deadlineLabel}`} disabled={item.path === '/match-result' && !result} onPress={open} className="active:opacity-70" style={card}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {headerPhoto && failedHeaderPhoto !== headerPhoto ? <Image source={{ uri: headerPhoto }} contentFit="cover" accessibilityLabel={item.kind === 'tournament' ? `${String(item.payload.event_name || item.title)} tournament poster` : `${person?.name || item.title} photo`} onError={() => setFailedHeaderPhoto(headerPhoto)} style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: b.surface }} /> : <View style={{ width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center', backgroundColor: b.glass }}><Ionicons name={icons[item.kind]} size={19} color={b.accent} /></View>}
      <View style={{ flex: 1, gap: 4 }}><Text style={{ fontSize: 10, letterSpacing: 1, fontWeight: '700', color: b.muted }}>{item.kind === 'entry' && item.payload.update_type === 'withdrawal' ? 'PLAYER WITHDREW' : item.kind === 'match_schedule' ? feedScheduleLabel(item) : labels[item.kind]}</Text><Text style={{ color: b.faint, fontSize: 11 }}>{!score && person?.country ? `${playerCountryFlag(person.country)}  ` : ''}{feedTime(item.occurredAt)}</Text></View>
      {item.kind === 'tournament' && eventDay && <Text style={{ color: b.accent, backgroundColor: b.glass, borderRadius: 7, paddingVertical: 6, paddingHorizontal: 8, fontSize: 10, fontWeight: '700' }}>{eventDay.toUpperCase()}</Text>}<Ionicons name="chevron-forward" size={17} color={b.faint} />
    </View>
    <Text style={{ color: b.premium, fontSize: 15, fontWeight: '700', lineHeight: 21, marginTop: 12 }}>{headline}</Text>
    {!!body && <Text style={{ color: b.muted, fontSize: 12, lineHeight: 18, marginTop: 4 }}>{body}</Text>}
    {score && <View style={{ marginTop: 13, backgroundColor: b.surface, borderRadius: 12, padding: 12, gap: 12 }}>
      {!!score.scores.length && <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingHorizontal: 10 }}><Text style={{ flex: 1, color: b.faint, fontSize: 10 }}>{score.points ? 'RALLY POINTS' : score.summary ? 'SETS WON' : 'FINAL SCORE'}</Text>{score.scores.map((_set, i) => <Text key={i} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7} style={{ width: 34, textAlign: 'center', fontSize: 9, color: b.faint }}>{score.summary || score.points ? '' : `S${i + 1}`}</Text>)}</View>}
      {(item.kind === 'result' && score.winner !== null ? [score.winner, 1 - score.winner] : [0, 1]).map(team => {
        const winner = score.winner === team;
        return <View key={team} style={{ borderRadius: 10, padding: 10, gap: 9, backgroundColor: winner ? b.premium : 'transparent' }}>
          {winner && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Ionicons name="checkmark-circle" size={14} color={b.padel} /><Text style={{ color: b.padel, fontSize: 10, fontWeight: '800', letterSpacing: 1 }}>{item.payload.result_type === 'walkover' ? 'ADVANCED BY WALKOVER' : 'WINNERS'}</Text></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{ flex: 1, gap: 7 }}>{participants[team].map((player, i) => <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Portrait player={player} size={30} /><Text style={{ color: winner ? '#FFFFFF' : b.muted, fontWeight: winner ? '800' : '500', fontSize: winner ? 13 : 12, lineHeight: 18, flex: 1 }}>{player.country ? `${playerCountryFlag(player.country)} ` : ''}{player.name}</Text></View>)}</View>
            {score.scores.map((set, i) => <Text key={i} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.65} style={{ width: 34, textAlign: 'center', color: winner ? b.padel : b.muted, fontSize: winner ? 24 : 18, fontWeight: winner ? '900' : '600', fontVariant: ['tabular-nums'] }}>{set[team]}</Text>)}{!score.scores.length && winner && <Ionicons name="checkmark" size={17} color={b.padel} />}
          </View>
        </View>;
      })}
    </View>}
    {item.kind === 'entry' && item.payload.update_type !== 'withdrawal' && <View style={{ backgroundColor: b.glass, borderRadius: 12, padding: 12, marginTop: 14, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {eventPhoto ? <Image source={{ uri: eventPhoto }} contentFit="cover" style={{ width: 46, height: 52, borderRadius: 8, backgroundColor: b.panel }} /> : <View style={{ width: 46, height: 52, borderRadius: 8, backgroundColor: b.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="calendar-outline" size={23} color={b.accent} /></View>}
      <View style={{ flex: 1, gap: 4 }}><Text style={{ color: b.accent, fontSize: 10, fontWeight: '800', letterSpacing: .8 }}>ENTRY CONFIRMED{eventDay ? ` · ${eventDay.toUpperCase()}` : ''}</Text><Text style={{ color: b.label, fontSize: 12, lineHeight: 17 }}>{String(item.payload.event_name || 'View tournament')}</Text></View>
      {actors.length > 1 && <Portrait player={actors[1]} size={32} />}
    </View>}
    {!!deadline && <DeadlinePanel deadline={deadline} />}
    {item.kind === 'ranking' && <View style={{ marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderColor: b.edge, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      {rank != null && <><Text style={{ color: b.muted, fontSize: 18, fontWeight: '600' }}>{previousRank != null ? `#${String(previousRank).replace(/^#/, '')}` : '—'}</Text><Ionicons name="arrow-forward" size={17} color={b.faint} /><Text style={{ color: b.accent, fontSize: 22, fontWeight: '800' }}>#{String(rank).replace(/^#/, '')}</Text></>}
      {pointNumber !== null && <Text style={{ marginLeft: 'auto', color: b.muted, fontSize: 12 }}>{pointNumber.toLocaleString('en-ZA')} points</Text>}
    </View>}
  </Pressable>;
});
export function FeedEmpty({ signedIn, filter = 'all' }: { signedIn: boolean; filter?: FeedFilter }) {
  const router = useRouter();
  return <View style={{ ...card, gap: 10 }}><Text style={{ fontSize: 17, fontWeight: '700', color: b.premium }}>{!signedIn ? 'Your padel, in one place.' : filter === 'all' ? 'Keep up with your favourites.' : `No ${filter === 'players' ? 'player' : filter === 'matches' ? 'match' : 'tournament'} updates yet.`}</Text><Text style={{ color: b.muted, fontSize: 13, lineHeight: 20 }}>{!signedIn ? 'Sign in to see updates from the players, matches and tournaments you follow.' : 'Follow players, star matches or subscribe to tournaments. Their latest updates will appear here.'}</Text><Pressable accessibilityRole="button" onPress={() => router.push(signedIn ? '/rankings?view=Discover' : '/(auth)/sign-in')} style={{ minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' }}><Text style={{ color: b.accent, fontSize: 13, fontWeight: '700' }}>{signedIn ? 'Discover players →' : 'Sign in →'}</Text></Pressable></View>;
}
export function FeedError({ message, onRetry }: { message: string; onRetry: () => void }) { return <View style={{ ...card, gap: 8 }}><Text style={{ color: b.muted, fontSize: 13, lineHeight: 20 }}>{message}</Text><Pressable accessibilityRole="button" onPress={onRetry} style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: b.accent, fontWeight: '700' }}>Retry</Text></Pressable></View>; }
export function FollowingPreview({ state }: { state: State }) {
  const router = useRouter();
  const [open, setOpen] = useState(true);
  const count = state.items.length;
  const badge = !count && (state.loading || state.error) ? undefined : [{ label: `${count}${state.hasMore ? '+' : ''}`, count: true }];
  return <HomeAccordion title="Following" open={open} onToggle={() => setOpen(value => !value)} badges={badge} showBadgesWhenOpen>
    <View style={{ marginBottom: 12, gap: 10 }}>
      {state.loading ? <View style={{ ...card, minHeight: 90, alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color={b.accent} accessibilityLabel="Loading Following updates" /></View> : <>{state.error && <FeedError message={state.error} onRetry={() => void state.refresh()} />}{state.items.slice(0, 3).map(item => <ActivityCard key={item.id} item={item} />)}{!state.items.length && !state.error && <FeedEmpty signedIn={!!state.userId} />}</>}
      <Pressable accessibilityRole="button" accessibilityLabel="View all Following updates" onPress={() => router.push('/following')} style={{ minHeight: 44, minWidth: 70, alignSelf: 'flex-end', alignItems: 'flex-end', justifyContent: 'center' }}><Text style={{ color: b.accent, fontSize: 12, fontWeight: '700' }}>View all →</Text></Pressable>
    </View>
  </HomeAccordion>;
}
