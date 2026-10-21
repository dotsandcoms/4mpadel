import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { TournamentDrawBoard } from '@/components/events/tournament-draw';
import { fetchFipTournament, type FipDocument, type FipTournament } from '@/lib/fip-tournament';
import { fetchProSnapshot, proDate, type ProTournament } from '@/lib/pro-padel';
import { playerCountryFlag } from '@/lib/player-hub';
import { lightBrand as b } from '@/theme/tokens';

type Tab = 'overview' | 'draws' | 'results' | 'schedule';
const tabs: { id: Tab; label: string }[] = [{ id: 'overview', label: 'Overview' }, { id: 'draws', label: 'Draws' }, { id: 'results', label: 'Results' }, { id: 'schedule', label: 'Schedule' }];
export function FipTournamentScreen({ id }: { id: number }) {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<FipTournament | null>(null);
  const [base, setBase] = useState<ProTournament | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const version = useRef(0);
  const focused = useRef(false);
  const pendingRetries = useRef(0);
  const load = useCallback(async (refresh = false) => {
    const request = ++version.current; setLoading(true); setError('');
    if (!Number.isSafeInteger(id) || id >= 0) { setError('Invalid tournament.'); setLoading(false); return; }
    void fetchProSnapshot('fip-calendar').then(value => { if (version.current === request) setBase(value.tournaments.find(e => e.id === id) || null); }).catch(() => {});
    try { const data = await fetchFipTournament(id, refresh); if (version.current === request) setSnapshot(data); }
    catch (e) { if (version.current === request) setError(e instanceof Error ? e.message : 'Tournament could not load.'); }
    finally { if (version.current === request) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => { focused.current = true; pendingRetries.current = 0; void load(); return () => { focused.current = false; version.current++; }; }, [load]));
  useEffect(() => {
    if (!snapshot?.pending || loading || pendingRetries.current >= 3) return;
    const timer = setTimeout(() => { if (focused.current) { pendingRetries.current++; void load(true); } }, [2000, 5000, 10000][pendingRetries.current]);
    return () => clearTimeout(timer);
  }, [snapshot, loading, load]);
  const event = snapshot?.event || base;
  const day = new Date().toISOString().slice(0, 10);
  const status = event ? event.endDate.slice(0, 10) < day ? 'COMPLETED' : event.startDate.slice(0, 10) <= day ? 'IN PROGRESS' : 'UPCOMING' : '';
  const documents = snapshot?.documents || [];
  const draws = documents.filter(d => d.kind === 'draw');
  const schedule = documents.filter(d => d.kind === 'schedule');
  const sections = snapshot?.sections || [];
  const hasResults = sections.some(section => section.rounds.some(round => round.matches.some(match => match.completed)));
  const ready = !!snapshot && !snapshot.pending;
  const openDocument = (document: FipDocument) => router.push({ pathname: '/pro/fip/[id]/document', params: { id: String(id), document: document.id } });
  const documentCards = (items: FipDocument[]) => <View style={{ gap: 10 }}>{items.map(document => <Pressable key={document.id} accessibilityRole="button" accessibilityLabel={`Open ${document.title} inside the app`} onPress={() => openDocument(document)} style={s.document}>
    <View style={s.documentIcon}><Ionicons name={document.kind === 'schedule' ? 'calendar-outline' : 'document-text-outline'} size={24} color={b.accent} /></View>
    <View style={{ flex: 1, gap: 5 }}><Text style={s.documentTitle}>{document.title}</Text><Text style={s.small}>Official PDF · Open in app</Text></View><Ionicons name="chevron-forward" size={20} color={b.accent} />
  </Pressable>)}</View>;
  const empty = (message: string) => <View style={s.notice}><Ionicons name="information-circle-outline" size={24} color={b.muted} /><Text style={[s.body, { flex: 1 }]}>{message}</Text></View>;
  return <SafeAreaView style={{ flex: 1, backgroundColor: b.page }}>
    <View style={s.topBar}><Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.canGoBack() ? router.back() : router.replace('/')} style={s.back}><Ionicons name="arrow-back" size={24} color={b.premium} /></Pressable><Text style={s.topLabel}>OFFICIAL FIP EVENT CENTRE</Text><Pressable accessibilityRole="button" accessibilityLabel="Refresh tournament" onPress={() => { void load(true); }} style={s.back} disabled={loading}><Ionicons name="refresh-outline" size={21} color={b.accent} /></Pressable></View>
    <ScrollView refreshControl={<RefreshControl refreshing={loading && !!event} onRefresh={() => { void load(true); }} tintColor={b.accent} />} contentContainerStyle={s.content}>
      {event?.photoUrl && tab === 'overview' && <Image source={{ uri: event.photoUrl }} contentFit="cover" contentPosition="top" style={s.poster} />}
      <View style={{ gap: 9 }}><View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}><Text style={s.kicker}>{event?.level === 'fip_promises' ? 'FIP PROMISES' : 'FIP BRONZE'}</Text><Text style={s.status}>{status}</Text></View>
        <Text accessibilityRole="header" style={s.title}>{event?.name || 'Tournament'}</Text>
        {event && <><Text style={s.body}>{proDate(event.startDate)} – {proDate(event.endDate)}</Text><Text style={s.body}>{playerCountryFlag(event.country || event.location?.split(' - ').pop())} {event.location}</Text></>}
      </View>
      <View style={s.tabs}>{tabs.map(item => <Pressable key={item.id} accessibilityRole="tab" accessibilityState={{ selected: item.id === tab }} onPress={() => setTab(item.id)} style={[s.tab, item.id === tab && s.activeTab]}><Text style={[s.tabText, item.id === tab && { color: b.accent }]}>{item.label}</Text></Pressable>)}</View>
      {loading && !snapshot && <ActivityIndicator color={b.accent} style={{ padding: 20 }} />}
      {!!error && <View style={s.notice}><Text style={[s.body, { flex: 1 }]}>{error}</Text><Pressable accessibilityRole="button" onPress={() => { void load(true); }}><Text style={s.retry}>Retry</Text></Pressable></View>}
      {snapshot?.pending && empty('Official tournament information is refreshing. Please try again shortly.')}
      {snapshot?.stale && !snapshot.pending && empty('Showing the last saved official information. Pull to try refreshing.')}
      {tab === 'overview' && ready && <>
        <View style={s.actions}>{[{ label: 'Published draws', value: draws.length || sections.length, next: 'draws' }, { label: 'Daily schedules', value: schedule.length, next: 'schedule' }].map(item => <Pressable key={item.next} accessibilityRole="button" onPress={() => setTab(item.next as Tab)} style={s.action}><Text style={s.number}>{item.value}</Text><Text style={s.small}>{item.label}</Text><Ionicons name="arrow-forward" size={19} color={b.accent} /></Pressable>)}</View>
        <Text style={s.heading}>Tournament information</Text>
        <View style={s.info}>{snapshot!.info.map((item, index) => <View key={`${item.label}:${index}`} style={[s.infoRow, index === snapshot!.info.length - 1 && { borderBottomWidth: 0 }]}><Text style={s.infoLabel}>{item.label}</Text><Text style={s.infoValue}>{item.value}</Text></View>)}</View>
      </>}
      {tab === 'draws' && ready && <>
        {!!sections.length && <><Text style={s.heading}>Published bracket</Text><TournamentDrawBoard sections={sections} /></>}
        {!!draws.length && <><Text style={s.heading}>Published draw documents</Text>{documentCards(draws)}</>}
        {!sections.length && !draws.length && empty('FIP has not published a draw for this event yet.')}
      </>}
      {tab === 'results' && ready && <>
        {hasResults ? <TournamentDrawBoard sections={sections} results /> : empty(draws.length ? 'Results are published in the official draw documents as FIP updates them.' : 'FIP has not published results for this event yet.')}
        {!!draws.length && <><Text style={s.heading}>Official draws & results</Text>{documentCards(draws)}</>}
      </>}
      {tab === 'schedule' && ready && <><Text style={s.heading}>Order of play</Text>{schedule.length ? documentCards(schedule) : empty('FIP has not published the daily order of play yet.')}</>}
      {snapshot?.updatedAt && <Text style={s.attribution}>Source: International Padel Federation · Updated {proDate(snapshot.updatedAt, true)}</Text>}
    </ScrollView>
  </SafeAreaView>;
}
const s = StyleSheet.create({
  topBar: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: b.edge },
  back: { width: 44, height: 44, justifyContent: 'center', alignItems: 'center' }, topLabel: { flex: 1, color: b.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  content: { padding: 20, paddingBottom: 44, gap: 20 }, poster: { height: 194, borderRadius: 18, backgroundColor: b.panel }, kicker: { color: b.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1 },
  status: { color: b.accent, backgroundColor: b.panel, fontSize: 9, fontWeight: '800', paddingHorizontal: 9, paddingVertical: 7, borderRadius: 6 }, title: { color: b.premium, fontSize: 25, lineHeight: 31, fontWeight: '800', letterSpacing: -0.5 },
  body: { color: b.muted, fontSize: 14, lineHeight: 21 }, tabs: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: b.edge }, tab: { flex: 1, minHeight: 48, justifyContent: 'center', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: 'transparent' }, activeTab: { borderBottomColor: b.accent }, tabText: { color: b.muted, fontSize: 12, fontWeight: '700' },
  notice: { backgroundColor: b.panel, borderRadius: 12, padding: 16, gap: 12, flexDirection: 'row', alignItems: 'center' }, retry: { color: b.accent, fontWeight: '700', paddingVertical: 12 },
  heading: { color: b.premium, fontSize: 18, fontWeight: '800' }, actions: { flexDirection: 'row', gap: 12 }, action: { flex: 1, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18, padding: 17, gap: 8 }, number: { color: b.accent, fontSize: 30, fontWeight: '800' },
  info: { paddingHorizontal: 17, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge, borderRadius: 18 }, infoRow: { borderBottomWidth: 1, borderBottomColor: b.edge, paddingVertical: 15, gap: 6 }, infoLabel: { color: b.muted, fontSize: 10, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.8 }, infoValue: { color: b.premium, fontSize: 14, lineHeight: 21, fontWeight: '500' },
  document: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: 16, backgroundColor: b.elevated, borderWidth: 1, borderColor: b.edge }, documentIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: b.panel, justifyContent: 'center', alignItems: 'center' }, documentTitle: { color: b.premium, fontSize: 14, lineHeight: 20, fontWeight: '700' }, small: { color: b.muted, fontSize: 11, lineHeight: 17 }, attribution: { color: b.muted, fontSize: 10, lineHeight: 16 },
});
