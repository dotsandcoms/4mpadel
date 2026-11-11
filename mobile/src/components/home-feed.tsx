import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { HomeAction } from './home-action';
import { EventArtwork } from './event-artwork';
import { EventNotificationBell } from './events/follow-tournament';
import { SwipeCards } from './swipe-cards';
import { SpotlightCountdown } from './spotlight-countdown';
import { eventDayParts, eventLocation, firstNameOf, formatEventRange, greetingForNow, resolveFeaturedCta, resolveScheduleEntryCta, type CalendarEvent, type HomePlayer } from '@/lib/home';
import { type FeedPlayer } from '@/lib/following-feed';
import { proDate, proRound, type ProMatch, type ProTournament } from '@/lib/pro-padel';
import { tourMatchesToday } from '@/lib/home-tour-presentation';
import { tourLevelLabel, tourSource } from '@/lib/home-feed';
import { playerCountryFlag } from '@/lib/player-hub';
import { useHomeResultPortraits } from '@/hooks/use-home-result-portraits';
import type { MediaAlbum } from '@/lib/media';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export function FeedPortrait({ name, uri, size = 40 }: { name: string; uri?: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={[s.portrait, { width: size, height: size, borderRadius: size / 2 }]}>
    {uri && failed !== uri ? <Image source={{ uri }} contentFit="cover" style={StyleSheet.absoluteFill} onError={() => setFailed(uri)} /> : <Text style={{ color: b.muted, fontSize: size * .32, fontWeight: '600' }}>{name.trim().split(/\s+/).map(part => part[0]).slice(0, 2).join('')}</Text>}
  </View>;
}

export function HomeIdentity({ player, loading, onProfile, onRankings }: { player?: HomePlayer | null; loading: boolean; onProfile: () => void; onRankings: () => void }) {
  const { width, fontScale } = useWindowDimensions();
  const stacked = width < 360 || fontScale > 1.3;
  return <View style={[s.identity, stacked && { flexDirection: 'column', alignItems: 'stretch' }]}>
    <Pressable accessibilityRole="button" accessibilityLabel="View my profile" onPress={onProfile} style={[s.identityPerson, stacked && { flex: undefined }]}>
      <FeedPortrait name={player?.name || 'Player'} uri={player?.image_url} size={48} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={s.meta}>{greetingForNow()}</Text>
        <Text numberOfLines={1} style={s.name}>{loading && !player ? '…' : firstNameOf(player?.name) || 'Your padel'}</Text>
      </View>
    </Pressable>
    {player && <Pressable accessibilityRole="button" accessibilityLabel={`SAPA rankings. Rank ${player.rank_label || 'unranked'}, ${player.points == null ? 'unavailable' : player.points} points`} onPress={onRankings} style={s.ranking}>
      <View style={s.stat}><Text style={s.statValue}>{player.rank_label && player.rank_label !== 'Unranked' ? `#${player.rank_label.replace(/^#/, '')}` : '—'}</Text><Text style={s.statLabel}>SAPA rank</Text></View>
      <View style={s.statDivider} />
      <View style={s.stat}><Text style={s.statValue}>{player.points == null ? '—' : Number(player.points).toLocaleString('en-ZA')}</Text><Text style={s.statLabel}>Points</Text></View>
    </Pressable>}
  </View>;
}

export function FeedSection({ title, action = 'View all', onMore, children }: { title: string; action?: string; onMore?: () => void; children: ReactNode }) {
  return <View style={s.section}>
    <View style={s.sectionHeading}><Text accessibilityRole="header" style={s.heading}>{title}</Text>{onMore && <HomeAction label={action} kind="outline" icon="next" iconPosition="trailing" accentColor={b.muted} onPress={onMore} />}</View>
    {children}
  </View>;
}

export function SectionState({ loading, error, empty, onRetry }: { loading?: boolean; error?: boolean; empty: string; onRetry: () => void }) {
  return <View style={s.empty}>
    {loading ? <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading feed" /> : <>
      <Text style={s.secondary}>{error ? 'This section couldn’t load.' : empty}</Text>
      {error && <HomeAction label="Try again" onPress={onRetry} />}
    </>}
  </View>;
}

function SourceTag({ label, live = false }: { label: string; live?: boolean }) {
  return <View style={[s.sourceTag, live && s.liveTag]}><Text style={[s.sourceText, live && { color: '#A52923' }]}>{label}</Text></View>;
}

const artwork = (event: CalendarEvent) => event.custom_image_url || event.poster_image_url || event.image_url;

type ScorePlayer = { name: string; photo?: string | null; country?: string | null };
function ScoreTeam({ players, scores, winner, overlap = false }: { players: ScorePlayer[]; scores: (number | string | null)[]; winner: boolean; overlap?: boolean }) {
  return <View style={[s.scoreTeam, winner && s.scoreTeamWinner]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 140 }}>
      {overlap && <View style={{ flexDirection: 'row', flexShrink: 0 }}>
        {players.slice(0, 2).map((player, index) => <View key={`${player.name}:${index}`} style={{ marginLeft: index ? -8 : 0, borderWidth: 2, borderColor: winner ? b.surface : b.elevated, borderRadius: 20, zIndex: 2 - index }}><FeedPortrait name={player.name} uri={player.photo} size={28} /></View>)}
      </View>}
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>{players.map((player, index) => <View key={`${player.name}:${index}`} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {!overlap && <FeedPortrait name={player.name} uri={player.photo} size={28} />}
        <Text style={[s.scorePlayer, winner && { fontWeight: '600' }]}>{playerCountryFlag(player.country)}{player.country ? ' ' : ''}{player.name}</Text>
      </View>)}</View>
    </View>
    <View style={{ flexDirection: 'row', gap: 4, alignItems: 'center' }}>
      {winner && <SymbolView name={{ ios: 'checkmark', android: 'check', web: 'check' }} size={12} tintColor={b.accent} />}
      {scores.map((score, index) => <Text key={index} style={[s.setScore, !winner && { color: b.muted, fontWeight: '400' }]}>{score ?? '–'}</Text>)}
    </View>
  </View>;
}

export function SpotlightRail({ events, onOpen, onAction }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void; onAction: (event: CalendarEvent) => void }) {
  return <SwipeCards items={events} itemKey={event => String(event.id)} renderCard={event => <View style={[s.spotlight, { padding: 12 }]}>
    <View style={[s.tagRow, { gap: 6 }]}><SourceTag label="4M" />{event.sapa_status && <Text style={s.meta}>{event.sapa_status} · SAPA</Text>}<View style={s.spotlightBadge}><SymbolView name={{ ios: 'star.fill', android: 'star', web: 'star' }} size={12} tintColor="#775316" /><Text style={{ fontSize: 11, fontWeight: '600', color: '#775316' }}>Spotlight</Text></View><EventNotificationBell eventId={event.id} eventName={event.event_name || 'Tournament'} /></View>
    <Pressable accessibilityRole="button" accessibilityLabel={`View ${event.event_name}`} onPress={() => onOpen(event)} style={[s.spotlightBody, { paddingTop: 4, paddingBottom: 12, gap: 12 }]}>
      <EventArtwork uri={artwork(event)} event={event} style={{ width: 64, height: 96, borderRadius: 8 }} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text numberOfLines={2} style={s.spotlightName}>{event.event_name}</Text>
        <Text style={[s.date, { fontSize: 12, lineHeight: 16 }]}>{formatEventRange(event.start_date, event.end_date)}</Text>
        <Text numberOfLines={1} style={s.meta}>{eventLocation(event) || 'Venue to be confirmed'}</Text>
        <Text style={s.small}>{event.registered_players == null ? 'Entries in event details' : `${event.registered_players} players entered`}</Text>
      </View>
    </Pressable>
    <View style={[s.spotlightFooter, { paddingTop: 8, paddingBottom: 0, flexWrap: 'wrap' }]}>
      <SpotlightCountdown event={event} compact />
      <HomeAction kind="primary" compact label={resolveFeaturedCta(event).label} onPress={() => onAction(event)} />
    </View>
  </View>} />;
}

export function LocalNowRail({ events, onOpen }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void }) {
  return <SwipeCards items={events.slice(0, 6)} itemKey={event => String(event.id)} renderCard={event => <Pressable accessibilityRole="button" accessibilityLabel={`On now, ${event.event_name}`} onPress={() => onOpen(event)} style={s.nowCard}>
    {artwork(event) && <Image source={{ uri: artwork(event)! }} style={StyleSheet.absoluteFill} contentFit="cover" cachePolicy="memory-disk" />}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#08251DEB' }]} />
    <EventArtwork uri={artwork(event)} event={event} style={{ width: 72, height: 96, borderRadius: 8 }} />
    <View style={{ flex: 1, gap: 8 }}><View style={s.tagRow}><View style={{ borderRadius: 5, backgroundColor: '#D12F3B', paddingHorizontal: 8, paddingVertical: 4 }}><Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '600' }}>● On now</Text></View><Text style={{ color: '#D8E8DD', fontSize: 11 }}>4M</Text></View><Text numberOfLines={3} style={[s.rowTitle, { color: '#FFFFFF', fontSize: 16, lineHeight: 21 }]}>{event.event_name}</Text><Text numberOfLines={1} style={{ color: '#D8E8DD', fontSize: 12 }}>{event.city || event.venue || 'View event'}</Text></View>
    <SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor="#FFFFFF" style={{ alignSelf: 'center' }} />
  </Pressable>} />;
}

function MainRankStats({ player }: { player: FeedPlayer }) {
  const flag = player.country ? playerCountryFlag(player.country) : '';
  if (player.source === 'pro') return <View style={{ gap: 2, alignItems: 'center' }}>
    <Text numberOfLines={1} style={s.followLabel}>{flag ? `${flag}  ` : ''}FIP {player.proRanking?.category === 'women' ? 'Women' : player.proRanking?.category === 'men' ? 'Men' : ''}</Text>
    {player.proRanking ? <Text style={s.followRank}>#{player.proRanking.rank}</Text> : <Text style={s.small}>Ranking unavailable</Text>}
  </View>;
  const rankings = player.mainRankings ?? [];
  return <View style={{ gap: 6, alignSelf: 'stretch' }}>
    {rankings.length === 1 ? rankings.map(rank => <View key={rank.scope} style={{ alignItems: 'center', gap: 2 }}>
      <Text numberOfLines={1} style={s.followLabel}>{flag ? `${flag}  ` : ''}SAPA {rank.label}</Text>
      <Text style={s.followRank}>#{rank.rank}</Text>
    </View>) : <Text style={[s.small, { textAlign: 'center' }]}>{flag ? `${flag}  ` : ''}SAPA main ranking unavailable</Text>}
  </View>;
}
/** Home shows followed people. The separate activity feed owns updates/events. */
export function FollowingRail({ players, onPlayer }: { players: FeedPlayer[]; onPlayer: (player: FeedPlayer) => void }) {
  return <SwipeCards compact items={players.slice(0, 12)} itemKey={player => `${player.source}:${player.id}`} renderCard={player => <Pressable accessibilityRole="button" accessibilityLabel={`${player.name}. ${player.country ?? ''}. ${player.source === 'local' ? (player.mainRankings?.length === 1 ? `SAPA ${player.mainRankings[0].label} rank ${player.mainRankings[0].rank}` : 'SAPA main ranking unavailable') : player.proRanking ? `FIP ${player.proRanking.category} rank ${player.proRanking.rank}` : 'FIP player'}. View profile`} onPress={() => onPlayer(player)} style={s.followMini}>
    <FeedPortrait name={player.name} uri={player.photo} size={40} />
    <Text numberOfLines={3} style={s.followName}>{player.name}</Text>
    <MainRankStats player={player} />
  </Pressable>} />;
}

export function UpcomingEntries({ events, onOpen, onAction }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void; onAction: (event: CalendarEvent) => void }) {
  return <View style={s.list}>{events.slice(0, 3).map(event => {
    const date = eventDayParts(event.start_date), cta = resolveScheduleEntryCta(event);
    return <View key={event.id} style={s.entryRow}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${event.event_name}`} onPress={() => onOpen(event)} style={{ flexDirection: 'row', gap: 12, flex: 1, alignItems: 'center' }}>
        <View style={s.dateTile}><Text style={s.day}>{date.day}</Text><Text style={s.small}>{date.month}</Text></View>
        <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={2} style={s.rowTitle}>{event.event_name}</Text><Text numberOfLines={1} style={s.meta}>{event.city || event.venue || '4M event'}</Text></View>
      </Pressable>
      <HomeAction label={cta.action === 'pay' ? 'Pay' : cta.action === 'register' ? 'Details' : 'My entry'} compact
        kind={cta.action === 'register' ? 'outline' : 'primary'} accentColor={cta.action === 'register' ? b.muted : cta.action === 'pay' ? '#87520B' : b.messagingAction}
        icon={cta.action === 'register' ? 'next' : cta.action === 'pay' ? 'license' : 'entry'} iconPosition={cta.action === 'register' ? 'trailing' : 'leading'} onPress={() => onAction(event)} />
    </View>;
  })}</View>;
}

export function LocalResults({ events, onOpen }: { events: CalendarEvent[]; onOpen: (event: CalendarEvent) => void }) {
  return <SwipeCards items={events.slice(0, 6)} itemKey={event => String(event.id)} renderCard={event => {
    const result = event.resultHighlight;
    return <Pressable accessibilityRole="button" accessibilityLabel={`${event.event_name}. ${result ? `${result.division} winners, ${result.winners.map(player => player.name).join(' and ')}` : 'View results'}`} onPress={() => onOpen(event)} style={s.resultCard}>
      <View style={s.personRow}>
        <EventArtwork uri={artwork(event)} event={event} style={{ width: 40, height: 52, borderRadius: 6 }} />
        <View style={{ flex: 1, gap: 4 }}><Text numberOfLines={2} style={s.rowTitle}>{event.event_name}</Text><Text style={s.small}>{formatEventRange(event.start_date, event.end_date)} · 4M</Text></View>
      </View>
      {result ? <View style={s.winners}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><SymbolView name={{ ios: 'trophy.fill', android: 'trophy', web: 'trophy' }} size={18} tintColor="#875D18" /><Text style={s.winnerLabel}>Winners · {result.division}</Text></View>
        <View style={{ gap: 8 }}>
          {result.winners.map((player, index) => <View key={`${player.name}:${index}`} style={s.winnerRow}>
            <FeedPortrait name={player.name} uri={player.photo} size={36} />
            <Text style={s.winnerName}>{player.name}</Text>
          </View>)}
        </View>
      </View> : <Text style={s.secondary}>Open the event for division results</Text>}
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
        <Text style={[s.small, { flex: 1 }]}>{result ? result.divisionCount > 1 ? `${result.divisionCount} division results` : 'Final results' : 'Division results'}</Text>
        <Text style={[s.date, { fontWeight: '600' }]}>View results →</Text>
      </View>
    </Pressable>;
  }} />;
}

export function MediaRail({ albums, onOpen }: { albums: MediaAlbum[]; onOpen: (album: MediaAlbum) => void }) {
  return <FlatList horizontal data={albums.filter(album => !!album.cover_image_url).slice(0, 6)} keyExtractor={album => album.id} showsHorizontalScrollIndicator={false} contentContainerStyle={s.rail} renderItem={({ item: album }) => <Pressable accessibilityRole="button" accessibilityLabel={`Photos, ${album.title}`} onPress={() => onOpen(album)} style={{ width: 232, gap: 8 }}>
    <EventArtwork uri={album.cover_image_url} style={{ width: 232, height: 144, borderRadius: 12 }} />
    <Text numberOfLines={2} style={s.rowTitle}>{album.title}</Text><Text style={s.small}>{album.photographer_name || 'Around the courts'}</Text>
  </Pressable>} />;
}

function TourEventHero({ event, onOpen, live = false, matches = [] }: { event: ProTournament; onOpen: (event: ProTournament) => void; live?: boolean; matches?: ProMatch[] }) {
  const today = tourMatchesToday(matches, event.id);
  return <View style={[s.tourLive, { minHeight: live ? 310 : 270 }]}>
    {event.photoUrl && <Image source={{ uri: event.photoUrl }} style={StyleSheet.absoluteFill} contentFit="cover" contentPosition="top" cachePolicy="memory-disk" />}
    <View style={[StyleSheet.absoluteFill, { backgroundColor: '#07130E20' }]} />
    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 8 }}><View style={{ backgroundColor: live && !event.freshness?.stale ? '#D52336' : '#152820E6', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 5 }}><Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', letterSpacing: .5 }}>{live ? event.freshness?.stale ? 'LAST UPDATE' : '● LIVE' : tourSource(event)}</Text></View><View style={{ flex: 1 }} /><Text style={{ backgroundColor: '#152820E6', color: '#FFFFFF', fontSize: 11, fontWeight: '600', paddingHorizontal: 9, paddingVertical: 6, borderRadius: 5 }}>{tourLevelLabel(event.level) || tourSource(event)}</Text></View>
    <View style={{ flex: 1, minHeight: live ? 66 : 40 }} />
    <View style={{ backgroundColor: '#07130ED9', padding: 16, gap: 11 }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`View ${event.name}${live ? ' matches' : ''}`} onPress={() => onOpen(event)} style={{ gap: 5 }}>
        <Text style={[s.liveTitle, { fontSize: 22, lineHeight: 26 }]} numberOfLines={2}>{playerCountryFlag(event.country)} {event.name}</Text>
        <Text style={{ fontSize: 12, lineHeight: 18, color: '#DAE4DE' }}>{[event.location || event.venue, `${proDate(event.startDate)} – ${proDate(event.endDate)}`].filter(Boolean).join(' · ')}</Text>
        {live && <Text style={{ fontSize: 12, fontWeight: '600', color: '#DAE9BD' }}>{event.freshness?.stale ? `Updated ${proDate(event.freshness.updatedAt, true)}` : today ? `${today} ${today === 1 ? 'match' : 'matches'} listed today` : 'Tournament in progress'}</Text>}
      </Pressable>
      <HomeAction kind="primary" label={live ? 'View matches' : 'View event'} onPress={() => onOpen(event)} />
    </View>
  </View>;
}
export function TourSpotlight({ events, onOpen }: { events: ProTournament[]; onOpen: (event: ProTournament) => void }) {
  return <SwipeCards controls items={events} itemKey={event => String(event.id)} renderCard={event => <TourEventHero event={event} onOpen={onOpen} />} />;
}
export function TourLiveRail({ events, matches = [], onOpen }: { events: ProTournament[]; matches?: ProMatch[]; onOpen: (event: ProTournament) => void }) {
  return <SwipeCards controls items={events.slice(0, 6)} itemKey={event => String(event.id)} renderCard={event => <TourEventHero event={event} matches={matches} live onOpen={onOpen} />} />;
}

function TourResult({ match, current, onOpen }: { match: ProMatch; current: boolean; onOpen: () => void }) {
  const portraits = useHomeResultPortraits(match.teams.flat().map(player => player.id), current);
  return <Pressable accessibilityRole="button" accessibilityLabel={`${match.tournamentName}, ${proRound(match)}. ${match.teams.map((team, side) => `${team.map(player => player.name).join(' and ')}${match.winner === `team_${side + 1}` ? ', winners' : ''}, ${match.score.map(set => set[side] ?? '–').join(', ')}`).join('. ')}`} onPress={onOpen} style={s.matchCard}>
    <View style={[s.tagRow, { alignItems: 'flex-start' }]}><Text numberOfLines={2} style={[s.meta, { flex: 1 }]}>{match.tournamentName} · {proRound(match)}</Text><Text style={s.small}>{proDate(match.playedAt)}</Text></View>
    <View style={{ gap: 4 }}>{match.teams.map((team, side) => <ScoreTeam key={side} players={team.map(player => ({ name: player.name, photo: portraits[player.id]?.photoUrl, country: portraits[player.id]?.nationality || player.nationality }))} scores={match.score.map(set => set[side])} winner={match.winner === `team_${side + 1}`} />)}</View>
    <Text style={[s.date, { fontWeight: '600' }]}>View match →</Text>
  </Pressable>;
}

export function TourResults({ matches, onOpen }: { matches: ProMatch[]; onOpen: (match: ProMatch) => void }) {
  return <SwipeCards items={matches.slice(0, 6)} itemKey={match => String(match.id)} renderCard={(match, _index, current) => <TourResult match={match} current={current} onOpen={() => onOpen(match)} />} />;
}

export function OfficialFipRail({ events, updatedAt, onOpen }: { events: ProTournament[]; updatedAt?: string; onOpen: (event: ProTournament) => void }) {
  return <View style={{ gap: 12 }}>
    <Text style={s.meta}>Official FIP calendar{updatedAt ? ` · Updated ${proDate(updatedAt)}` : ''}</Text>
    <SwipeCards items={events} itemKey={event => String(event.id)} renderCard={event => <Pressable accessibilityRole="button" accessibilityLabel={`View official event, ${event.name}`} onPress={() => onOpen(event)} style={s.officialCard}>
      <View style={{ width: '100%', height: 192, backgroundColor: b.surface, overflow: 'hidden' }}>{event.photoUrl && <Image source={{ uri: event.photoUrl }} contentFit="contain" cachePolicy="memory-disk" style={StyleSheet.absoluteFill} />}</View>
      <View style={{ padding: 16, gap: 12 }}><SourceTag label={`FIP ${tourLevelLabel(event.level) || ''}`} /><Text numberOfLines={3} style={s.eventTitle}>{event.name.replace(/^FIP (PROMISES|BRONZE) /i, '')}</Text><Text style={s.meta}>{proDate(event.startDate)} – {proDate(event.endDate)} · {event.location}</Text><HomeAction kind="primary" label="View official event" onPress={() => onOpen(event)} /></View>
    </Pressable>} />
  </View>;
}

export function TourCalendar({ events, onOpen }: { events: ProTournament[]; onOpen: (event: ProTournament) => void }) {
  return <View style={s.list}>{events.slice(0, 4).map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`View ${event.name}`} onPress={() => onOpen(event)} style={s.resultRow}>
    <View style={{ flex: 1, gap: 4 }}><Text style={s.small}>{tourSource(event)} · {proDate(event.startDate)}</Text><Text numberOfLines={2} style={s.rowTitle}>{event.name}</Text><Text numberOfLines={1} style={s.meta}>{event.location || event.country}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.faint} />
  </Pressable>)}</View>;
}

const s = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingTop: 16, paddingBottom: 20, flexShrink: 0, minHeight: 88 },
  identityPerson: { flex: 1, minWidth: 0, flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 },
  portrait: { flexShrink: 0, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: b.surface, borderWidth: 1, borderColor: '#0000001A' },
  name: { color: b.premium, fontSize: 23, lineHeight: 28, fontWeight: '600', letterSpacing: -.5 },
  ranking: { flexShrink: 0, flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, backgroundColor: b.surface },
  stat: { alignItems: 'center', gap: 2, paddingHorizontal: 8 },
  statValue: { fontSize: 16, fontWeight: '600', color: b.premium, fontVariant: ['tabular-nums'] },
  statLabel: { fontSize: 11, color: b.muted },
  statDivider: { width: StyleSheet.hairlineWidth, height: 24, backgroundColor: b.edge },
  section: { marginBottom: 24 },
  sectionHeading: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 44, marginBottom: 8 },
  heading: { flex: 1, fontSize: 20, lineHeight: 26, fontWeight: '600', letterSpacing: -.4, color: b.premium },
  meta: { fontSize: 12, lineHeight: 17, color: b.muted },
  small: { fontSize: 11, lineHeight: 16, color: b.faint },
  secondary: { fontSize: 14, lineHeight: 20, color: b.premium },
  empty: { minHeight: 80, padding: 16, borderRadius: 12, backgroundColor: b.surface, justifyContent: 'center', alignItems: 'center', gap: 4 },
  tagRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  sourceTag: { backgroundColor: b.surface, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 8 },
  liveTag: { backgroundColor: '#FCEBE9' },
  sourceText: { color: b.accent, fontSize: 11, fontWeight: '600' },
  spotlight: { backgroundColor: b.elevated, padding: 16, borderRadius: 16, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  spotlightBadge: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 6, borderRadius: 6, backgroundColor: '#FFF0CC' },
  spotlightBody: { flexDirection: 'row', gap: 16, paddingTop: 16, paddingBottom: 12, alignItems: 'flex-start' },
  eventTitle: { fontSize: 18, lineHeight: 23, color: b.premium, fontWeight: '600', letterSpacing: -.3 },
  spotlightName: { fontSize: 16, lineHeight: 21, color: b.premium, fontWeight: '600', letterSpacing: -.2 },
  date: { color: b.accent, fontSize: 13, lineHeight: 18, fontWeight: '500' },
  spotlightFooter: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: b.edge, paddingTop: 4, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  rail: { gap: 12 },
  nowCard: { flexDirection: 'row', gap: 12, padding: 16, borderRadius: 12, backgroundColor: '#08251D', overflow: 'hidden', borderLeftWidth: 3, borderLeftColor: '#D12F3B' },
  rowTitle: { fontSize: 14, lineHeight: 19, fontWeight: '600', color: b.premium },
  followMini: { padding: 10, gap: 4, alignItems: 'center', backgroundColor: b.elevated, borderRadius: 12 },
  followName: { alignSelf: 'stretch', color: b.premium, fontSize: 14, lineHeight: 18, fontWeight: '600', textAlign: 'center' },
  followLabel: { color: b.muted, fontSize: 11, lineHeight: 16, textAlign: 'center' },
  followRank: { color: b.premium, fontSize: 22, lineHeight: 26, fontWeight: '600', fontVariant: ['tabular-nums'] },
  personRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  score: { fontSize: 14, lineHeight: 20, fontWeight: '600', fontVariant: ['tabular-nums'], color: b.premium },
  list: { backgroundColor: b.elevated, borderRadius: 12, overflow: 'hidden' },
  entryRow: { padding: 12, flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge },
  dateTile: { width: 44, minHeight: 52, borderRadius: 8, paddingVertical: 4, alignItems: 'center', justifyContent: 'center', backgroundColor: b.surface },
  day: { color: b.premium, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: b.edge, minHeight: 80 },
  tourLive: { minHeight: 328, backgroundColor: '#183327', borderRadius: 16, overflow: 'hidden' },
  liveContent: { flex: 1, padding: 20, gap: 16 },
  liveTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 29, fontWeight: '600', letterSpacing: -.4 },
  matchCard: { padding: 16, gap: 16, backgroundColor: b.elevated, borderRadius: 12 },
  scoreTeam: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, padding: 8, borderRadius: 8 },
  scoreTeamWinner: { backgroundColor: b.surface },
  scorePlayer: { flex: 1, minWidth: 0, fontSize: 13, lineHeight: 18, color: b.premium },
  setScore: { minWidth: 24, textAlign: 'center', fontSize: 18, lineHeight: 24, fontVariant: ['tabular-nums'], fontWeight: '600', color: b.premium },
  resultCard: { padding: 16, gap: 12, backgroundColor: b.elevated, borderRadius: 12 },
  winners: { gap: 12, backgroundColor: '#F8F4E9', borderRadius: 8, padding: 12 },
  winnerLabel: { flex: 1, color: '#795316', fontSize: 12, lineHeight: 17, fontWeight: '600' },
  winnerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 40 },
  winnerName: { flex: 1, minWidth: 0, color: b.premium, fontSize: 16, lineHeight: 21, fontWeight: '600', letterSpacing: -.2 },
  officialCard: { backgroundColor: b.elevated, borderRadius: 16, overflow: 'hidden' },
  team: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
