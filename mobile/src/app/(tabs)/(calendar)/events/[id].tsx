import { requestPushPermission } from '@/lib/notifications';
import { EventNotificationBell } from '@/components/events/follow-tournament';
import { TournamentMatches } from '@/components/events/tournament-matches';
import { addToDeviceCalendar } from '@/lib/device-calendar';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, AppState, Linking, Modal, Pressable, RefreshControl, ScrollView, Share, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTabScenePadding } from '@/hooks/use-tab-scene-padding';
import { Notice } from '@/components/events/event-ui';
import { Accordion, CircleAction, EventIcon, EventText as Text, Fade, InfoRows, WebsiteHeader, EventAccent, useEventAccent, type EventIconName } from '@/components/events/website-ui';
import { EventTimeline, RegistrationCountdown } from '@/components/events/event-timeline';
import { fetchEntryBalances, currentEmail, fetchEventPlayerRankings, fetchDivisions, fetchDrawStatus, fetchEvent, fetchEventOrganisation, fetchMyEventRegistrations, fetchPublicEntries, fetchScheduledIds, setEventScheduled,
  type Division, type EventDetail, type EventOrganisation, type EventRegistration, type PublicEntry } from '@/lib/events';
import { entryFee, formatMoney, plainText, registrationState } from '@/lib/event-rules';
import { eventLocation, eventWebUrl, formatEventRange } from '@/lib/home';
import { openSitePath } from '@/lib/site';
import { buildEventTeams, type RankedPlayer } from '@/lib/event-teams';
import { TeamDivisionCard, TopSeedRows } from '@/components/events/event-teams';
import { EventRichText } from '@/components/events/event-rich-text';
import { EventLocation } from '@/components/events/event-location';
import { TournamentDetails, PrizeMoney, EventWeatherSection } from '@/components/events/event-content';
import { EventInformation } from '@/components/events/event-information';
import { RegistrationEntries } from '@/components/events/registration-entries';
import { lightSapaTone as sapaTone } from '@/theme/sapa';

export default function EventScreen() { return <EventContent />; }
function EventContent() {
  const { id, division, match, tab: initialTab } = useLocalSearchParams<{ id: string; division?: string; match?: string; tab?: string }>();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const divisionId = division && uuid.test(division) ? division : undefined;
  const matchId = match && uuid.test(match) ? match : undefined;
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const tabPadding = useTabScenePadding();
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [divisions, setDivisions] = useState<Division[]>([]);
  const [registrations, setRegistrations] = useState<EventRegistration[]>([]);
  const [entries, setEntries] = useState<PublicEntry[]>([]);
  const [profiles, setProfiles] = useState<RankedPlayer[]>([]);
  const [organisation, setOrganisation] = useState<EventOrganisation | null>(null);
  const [drawStatus, setDrawStatus] = useState({ hasDraw: false, hasResults: false, isFinished: false, isLive: false });
  const [publicError, setPublicError] = useState('');
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [actionError, setActionError] = useState('');
  const [accountError, setAccountError] = useState('');
  const [manageRequested, setManageRequested] = useState(false);
  const [posterOpen, setPosterOpen] = useState(false);
  const [selectedVenue, setSelectedVenue] = useState('');
  const [tab, setTab] = useState('Overview');
  useEffect(() => { setTab(initialTab === 'Results' ? 'Results' : initialTab === 'Draws' || matchId || divisionId ? 'Draws' : 'Overview'); }, [id, initialTab, matchId, divisionId]);
  const [gender, setGender] = useState('Men');
  const request = useRef(0);
  const load = useCallback(async () => {
    const current = ++request.current;
    setLoading(true); setError(''); setActionError(''); setAccountError(''); setPublicError('');
    try {
      const row = await fetchEvent(id);
      const divs = row.is_manual && !row.is_weekly ? await fetchDivisions(row.id) : [];
      if (current !== request.current) return;
      setEvent(row); setDivisions(divs);
      const publicResults = await Promise.allSettled([row.is_manual ? fetchPublicEntries(row.id) : Promise.resolve([]), fetchEventOrganisation(row.organisation_id), fetchDrawStatus(row), fetchEventPlayerRankings()]);
      if (current !== request.current) return;
      if (publicResults[0].status === 'fulfilled') setEntries(publicResults[0].value);
      if (publicResults[1].status === 'fulfilled') setOrganisation(publicResults[1].value);
      if (publicResults[2].status === 'fulfilled') setDrawStatus(publicResults[2].value);
      if (publicResults[3].status === 'fulfilled') setProfiles(publicResults[3].value);
      if (publicResults.some(result => result.status === 'rejected')) setPublicError('Some event information could not load. Pull down to retry.');
      try {
        const email = await currentEmail();
        const [ids, regs] = email ? await Promise.all([fetchScheduledIds(email), fetchMyEventRegistrations(row.id, email)]) : [[], []];
        if (current !== request.current) return;
        setSaved(ids.includes(row.id));
        setRegistrations(regs);
        if (regs.length && row.is_manual) {
          try { const balances = await fetchEntryBalances(row.id); if (current === request.current) setRegistrations(regs.map(r => ({ ...r, balance: balances.find(b => b.registrationId === r.id) }))); }
          catch { if (current === request.current) setAccountError('Could not check your entry balance. Pull down to retry.'); }
        }
      } catch { if (current === request.current) setAccountError('Could not refresh your schedule and entries. Pull down to retry.'); }
    } catch (e) { if (current === request.current) setError(e instanceof Error ? e.message : 'Could not load this event.'); }
    finally { if (current === request.current) setLoading(false); }
  }, [id]);
  useFocusEffect(useCallback(() => {
    void load();
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void load(); });
    return () => { request.current++; sub.remove(); };
  }, [load]));
  const runAction = async (action: () => Promise<unknown>) => {
    setActionError('');
    try { await action(); } catch (e) { setActionError(e instanceof Error ? e.message : 'Could not complete that action. Please try again.'); }
  };
  const toggleSaved = async () => {
    if (!event || saving) return;
    setSaving(true);
    await runAction(async () => { await setEventScheduled(event.id, !saved); setSaved(!saved); if (!saved) void requestPushPermission().catch(() => {}); });
    setSaving(false);
  };
  const back = () => router.canGoBack() ? router.back() : router.replace('/calendar');
  const register = (mode?: 'pay') => {
    if (!event) return;
    if (registrationState(event) !== 'open') { setActionError('Registration is not open for this event. An access code cannot override the registration dates.'); return; }
    router.push({ pathname: '/events/register', params: { id: String(event.id), ...(mode ? { mode } : {}) } });
  };
  const directions = () => event && runAction(() => Linking.openURL(`https://maps.google.com/?q=${encodeURIComponent([selectedVenue || event.venues?.[0] || event.venue, event.city].filter(Boolean).join(' '))}`));
  const state = event ? registrationState(event) : 'closed';
  const count = event?.is_manual ? event.is_weekly ? entries.filter(r => r.status !== 'withdrawn' && (!r.registered_by_hash || !r.email_hash || r.email_hash === r.registered_by_hash)).length : entries.length : event?.registered_players || 0;
  const fees = event ? divisions.map(d => entryFee(event, d)).filter(f => f > 0) : [];
  const fee = event ? fees.length ? Math.min(...fees) === Math.max(...fees) ? `R${Math.min(...fees)}` : `R${Math.min(...fees)}–R${Math.max(...fees)}` : entryFee(event) > 0 ? `R${entryFee(event)}` : '—' : '—';
  const stats: { label: string; value: string | number; icon: EventIconName }[] = event ? [
    { label: 'Entries', value: publicError && event.is_manual ? '—' : count, icon: 'person.2' },
    ...(event.is_quick_event ? [{ label: 'Time', value: [event.start_time?.slice(0, 5), event.end_time?.slice(0, 5)].filter(Boolean).join('–') || 'TBC', icon: 'clock' as const }, { label: 'Court Type', value: event.indoor_outdoor || event.courts || 'TBC', icon: 'rectangle.split.2x2' as const }] : !event.is_weekly ? [{ label: 'Points', value: event.points || '1000', icon: 'trophy' as const }, { label: 'Divisions', value: divisions.length, icon: 'square.grid.2x2' as const }] : []),
    { label: 'Entry Fee', value: fee, icon: 'dollarsign.circle' },
    ...(Number(event.prize_money_total) > 0 ? [{ label: 'Prize Money', value: `R${Number(event.prize_money_total).toLocaleString('en-GB')}`, icon: 'trophy' as const }] : []),
  ] : [];
  const accent = sapaTone(event?.sapa_status).fill;
  const teams = useMemo(() => buildEventTeams(divisions, entries, profiles), [divisions, entries, profiles]);
  const pendingPayment = registrations.some(r => r.payment_status !== 'paid' && Number(divisions.find(d => d.id === r.division_id)?.entry_fee || 0) > 0);
  const posterUrl = event?.poster_image_url || event?.custom_image_url;
  const sponsors = event?.sponsor_logos?.filter(url => url && url !== organisation?.logo_url && url !== event.poster_image_url && url !== event.custom_image_url) || [];
  return <EventAccent value={accent}><View style={{ flex: 1, backgroundColor: '#F5F6F3', paddingTop: insets.top }}>
    <WebsiteHeader />
    <ScrollView stickyHeaderIndices={event ? [1] : []} refreshControl={<RefreshControl refreshing={loading && !!event} onRefresh={load} tintColor={accent} />} contentContainerStyle={{ paddingBottom: tabPadding, backgroundColor: '#f9fafb' }}>
      {event ? <View style={{ backgroundColor: '#F5F6F3' }}>
        <View style={{ paddingHorizontal: 20, paddingTop: 16, flexDirection: 'row', justifyContent: 'space-between' }}>
          <CircleAction name="arrow.left" label="Back to calendar" onPress={back} />
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <EventNotificationBell eventId={event.id} eventName={event.event_name || 'Tournament'} circle />
            <CircleAction name="calendar" label="Add to calendar" onPress={() => void runAction(() => addToDeviceCalendar({ title: event.event_name || "Padel event", startDate: event.start_date || "", endDate: event.end_date, location: eventLocation(event), url: eventWebUrl(event) }))} />
            <CircleAction name="square.and.arrow.up" label="Share event" onPress={() => void runAction(() => Share.share({ message: `${event.event_name}\n${eventWebUrl(event)}`, url: eventWebUrl(event) }))} />
            <CircleAction name={saved ? 'checkmark' : 'plus'} label={saved ? 'Remove from My Schedule' : 'Add to My Schedule'} onPress={toggleSaved} selected={saved} disabled={saving || !!accountError} />
          </View>
        </View>
        <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 40 }}>
          {!!event.sapa_status && event.sapa_status !== 'None' && <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}><Text style={{ color: sapaTone(event.sapa_status).text, fontSize: 9, fontWeight: '700', letterSpacing: 1, borderWidth: 1, borderColor: sapaTone(event.sapa_status).border, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 }}>{event.sapa_status.toUpperCase()}</Text><Text style={{ color: sapaTone(event.sapa_status).text, fontSize: 9, fontWeight: '700', letterSpacing: 1, borderWidth: 1, borderColor: sapaTone(event.sapa_status).border, borderRadius: 16, paddingHorizontal: 9, paddingVertical: 4 }}>SAPA</Text></View>}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>
            {!!event.sapa_status && event.sapa_status !== 'None' && <Image source={require('@/assets/sapa-logo.svg')} accessibilityLabel="SAPA" contentFit="contain" style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#fff', borderWidth: 4, borderColor: '#fff' }} />}
            <View style={{ flex: 1 }}><Text accessibilityRole="header" style={{ fontSize: 26, fontWeight: '700', lineHeight: 32 }}>{event.event_name}</Text></View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 10 }}>
            <EventIcon name="calendar" size={14} /><Text style={{ fontSize: 12, color: '#16251fe6' }}>{event.event_dates || formatEventRange(event.start_date, event.end_date)}</Text>
            <Text style={{ fontSize: 12, color: '#16251f55' }}>|</Text><EventIcon name="mappin.and.ellipse" size={14} /><Text numberOfLines={1} style={{ fontSize: 12, flex: 1, color: '#16251fe6' }}>{eventLocation(event)}</Text>
          </View>
          <View style={{ marginTop: 8, flexDirection: 'row', borderRadius: 16, borderColor: '#16251f1a', borderWidth: 1, overflow: 'hidden', backgroundColor: '#fff' }}>
            {stats.map((stat, i) => <View key={stat.label} style={{ flex: 1, paddingVertical: 16, paddingHorizontal: 1, alignItems: 'center', borderLeftWidth: i ? 1 : 0, borderColor: '#16251f1a', gap: 4 }}><EventIcon name={stat.icon} /><Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ fontSize: 14, fontWeight: '700', textAlign: 'center', alignSelf: 'stretch' }}>{stat.value}</Text><Text style={{ fontSize: 9, color: '#16251f80', letterSpacing: 0.3 }}>{stat.label.toUpperCase()}</Text></View>)}
          </View>
          {(organisation?.logo_url || posterUrl || sponsors.length > 0) && <View style={{ flexDirection: 'row', marginTop: 12, borderRadius: 16, borderColor: '#16251f1a', borderWidth: 1, backgroundColor: '#fff', overflow: 'hidden' }}>
            {organisation?.logo_url && <Pressable accessibilityRole="button" accessibilityLabel={organisation.name} onPress={() => organisation.slug && void runAction(() => openSitePath(`/organisations/${organisation.slug}`))} style={{ width: 92, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', borderRightWidth: 1, borderColor: '#16251f1a', gap: 8 }}><Text numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 9, color: "#386018" }}>ORGANISATION</Text><Image source={{ uri: organisation.logo_url }} style={{ width: 55, height: 32 }} contentFit="contain" /></Pressable>}
            {!!posterUrl && <Pressable accessibilityRole="button" accessibilityLabel="View event poster" onPress={() => setPosterOpen(true)} style={{ width: 92, paddingHorizontal: 8, paddingVertical: 12, alignItems: 'center', borderRightWidth: sponsors.length ? 1 : 0, borderColor: '#16251f1a', gap: 8 }}><Text style={{ fontSize: 9, color: '#386018' }}>POSTER</Text><Image source={{ uri: posterUrl }} style={{ width: 58, height: 48 }} contentFit="contain" /></Pressable>}
            {sponsors.length > 0 && <View style={{ flex: 1, padding: 12, gap: 8, alignItems: 'center' }}><Text style={{ fontSize: 9, color: "#386018" }}>SPONSORS</Text><ScrollView horizontal nestedScrollEnabled showsHorizontalScrollIndicator={false} style={{ alignSelf: 'stretch' }} contentContainerStyle={{ alignItems: 'center', justifyContent: sponsors.length <= 3 ? 'space-evenly' : 'flex-start', flexGrow: 1, gap: 8 }}>{sponsors.map(url => <Image key={url} source={{ uri: url }} style={{ width: 40, height: 32 }} contentFit="contain" />)}</ScrollView></View>}
          </View>}
          <RegistrationCountdown event={event} onRegister={() => { if (registrations.length) { setTab('Overview'); setManageRequested(true); } else register(); }} label={registrations.length ? 'Manage Entry' : state === 'open' ? 'Register' : null} />
          <EventTimeline event={event} hasDraw={drawStatus.hasDraw} />
          {!!(actionError || accountError || publicError) && <View style={{ marginTop: 12 }}><Notice title="Please try again" onRetry={load}>{actionError || accountError || publicError}</Notice></View>}
          {state === 'cancelled' && <View style={{ marginTop: 12 }}><Notice title="Event cancelled">This event is no longer taking place.</Notice></View>}
        </View>
      </View> : <View style={{ backgroundColor: '#F5F6F3', padding: 30 }}>{loading ? <ActivityIndicator color={accent} /> : <Notice title="Event unavailable" onRetry={load}>{error}</Notice>}</View>}
      {event && <View><View style={{ flexDirection: 'row', backgroundColor: '#fff', paddingHorizontal: 16, borderBottomColor: '#e5e7eb', borderBottomWidth: 1 }}>
        {['Overview', 'Players', 'Draws', 'Results', 'Media'].map(label => <Pressable key={label} accessibilityRole="tab" accessibilityState={{ selected: label === tab }} onPress={() => setTab(label)} style={{ flex: 1, paddingVertical: 16, borderBottomWidth: 2, borderBottomColor: label === tab ? '#0a0a0a' : 'transparent', alignItems: 'center' }}><Text style={{ color: label === tab ? '#0a0a0a' : '#65726B', fontSize: 14, fontWeight: label === tab ? '500' : '400' }}>{label}</Text></Pressable>)}
      </View></View>}
      {event && <View style={{ paddingHorizontal: 16, paddingTop: 24, gap: 24, backgroundColor: '#f9fafb', minHeight: 300 }}>
        {tab === 'Overview' && <>
          {event.registration_access === 'code' && state === 'open' && !registrations.length && <View style={{ padding: 16, borderRadius: 16, backgroundColor: '#fff7ed', borderColor: '#fed7aa', borderWidth: 1, gap: 18 }}>
            <View style={{ flexDirection: 'row', gap: 12 }}><View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: '#ffedd5', alignItems: 'center', justifyContent: 'center' }}><EventIcon name="lock" size={20} color="#c2410c" /></View><View style={{ flex: 1, gap: 6 }}><Text style={{ fontSize: 16, fontWeight: '400', color: '#020617' }}>Access code required</Text><Text style={{ fontSize: 14, lineHeight: 20, color: '#475569' }}>This is a private event. Enter the code supplied by the organiser to register.</Text></View></View>
            <Pressable accessibilityRole="button" onPress={() => register()} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#ff5900', borderRadius: 12 }}><Text style={{ fontSize: 14, fontWeight: '400' }}>Unlock registration</Text></Pressable>
          </View>}
          {registrations.length > 0 ? <RegistrationEntries manageRequested={manageRequested} onManageOpened={() => setManageRequested(false)} event={event} divisions={divisions} registrations={registrations} profiles={profiles} onManage={register} onRefresh={load} /> : (<Accordion title="Divisions" icon="trophy">{divisions.length ? divisions.map(d => <View key={d.id} style={{ gap: 6 }}><Text style={{ color: '#0f172a', fontSize: 15, fontWeight: '400' }}>{d.name}</Text><Text style={{ color: '#64748b', fontSize: 13 }}>{[d.gender, d.format].filter(Boolean).join(' · ')} · {formatMoney(entryFee(event, d))} per player</Text><Text style={{ color: '#64748b', fontSize: 13 }}>{plainText(d.details)}</Text></View>) : <Text style={{ fontSize: 14, color: '#64748b' }}>{event.is_weekly ? 'Open entries' : 'No divisions setup yet'}</Text>}<LightButton label="View players" onPress={() => setTab('Players')} /></Accordion>)}
          <Accordion title="Event Information" icon="doc.text"><EventInformation event={event} /></Accordion>
          <Accordion title="Top Seeds" icon="crown" accessory={<View style={{ flexDirection: 'row', backgroundColor: '#f3f4f6', borderRadius: 20, padding: 2 }}>{['Men', 'Women'].map(g => <Pressable key={g} accessibilityRole="button" accessibilityState={{ selected: g === gender }} onPress={() => setGender(g)} hitSlop={{ top: 10, bottom: 10 }} style={{ paddingHorizontal: 9, paddingVertical: 7, borderRadius: 18, backgroundColor: gender === g ? accent : 'transparent' }}><Text style={{ fontSize: 10, fontWeight: '400', color: gender === g ? '#000' : '#6b7280' }}>{g.toUpperCase()}</Text></Pressable>)}</View>}>
            <TopSeedRows groups={teams} gender={gender} />
          </Accordion>
          {!!(event.courts || event.balls || event.draw_released || event.cut_off_times || event.tournament_director || event.referees) && <Accordion title="Tournament Details" icon="rectangle.split.2x2"><TournamentDetails event={event} /></Accordion>}
          {!!event.description && <Accordion title="About This Event" icon="doc.text"><EventRichText html={event.description} /></Accordion>}
          {!!(event.contact_details || event.organiser_phone || event.organiser_email) && <Accordion title="Contact" icon="phone">{!!event.contact_details && <Text style={{ color: '#334155', fontSize: 14, lineHeight: 20 }}>{event.contact_details}</Text>}{[{ value: event.organiser_phone, icon: 'phone' as const, url: `tel:${event.organiser_phone}` }, { value: event.organiser_email, icon: 'envelope' as const, url: `mailto:${event.organiser_email}` }].filter(item => item.value).map(item => <Pressable key={item.icon} accessibilityRole="link" onPress={() => void runAction(() => Linking.openURL(item.url))} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 4 }}><EventIcon name={item.icon} color="#64748b" /><Text style={{ color: '#1e293b', fontSize: 14, flexShrink: 1 }}>{item.value}</Text></Pressable>)}</Accordion>}
          <Accordion title="Location" icon="mappin.and.ellipse" accessory={<Pressable accessibilityRole="button" onPress={directions} hitSlop={8} style={{ backgroundColor: accent, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8 }}><Text style={{ fontSize: 10, color: '#fff' }}>DIRECTIONS</Text></Pressable>}><EventLocation event={event} selectedVenue={selectedVenue} onSelectVenue={setSelectedVenue} /></Accordion>
          {!!event.points_breakdown && <Accordion title="Points Breakdown" icon="trophy"><EventRichText html={event.points_breakdown} /></Accordion>}
          <PrizeMoney event={event} />
          {!!event.rules_regs && <Accordion title="Rules & Regulations" icon="doc.text"><EventRichText html={event.rules_regs} /></Accordion>}
          {!!event.sanctioning_details && <Accordion title="Sanctioning Details" icon="checkmark.circle"><EventRichText html={event.sanctioning_details} /></Accordion>}
          {(sponsors.length > 0 || organisation?.logo_url) && <Accordion title="Sponsors" icon="photo"><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>{[...(organisation?.logo_url ? [{ url: organisation.logo_url, action: () => organisation.slug && void runAction(() => openSitePath(`/organisations/${organisation.slug}`)), label: organisation.name }] : []), ...sponsors.map(url => ({ url, action: undefined, label: 'Sponsor' }))].map((item, i) => <Pressable key={`${item.url}-${i}`} accessibilityRole={item.action ? 'button' : 'image'} accessibilityLabel={item.label} disabled={!item.action} onPress={item.action} style={{ width: '29%', aspectRatio: 1.5, borderRadius: 12, borderWidth: 1, borderColor: '#f3f4f6', backgroundColor: '#f9fafb', padding: 12 }}><Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} contentFit="contain" /></Pressable>)}</View></Accordion>}
          <EventWeatherSection event={event} />
          {!!event.withdrawal_substitution && <Accordion title="Withdrawal & Substitution" icon="exclamationmark.circle"><EventRichText html={event.withdrawal_substitution} /></Accordion>}

        </>}
        {tab === 'Players' && <>{publicError ? <LightEmpty title="Players could not load" text={publicError} /> : !event.is_manual ? <LightButton label="View entry list on website" onPress={() => void runAction(() => openSitePath(`/calendar/${event.slug || event.id}?tab=players`, { forceBrowser: true }))} /> : teams.length ? teams.map(group => <TeamDivisionCard key={group.division.id} group={group} />) : <LightEmpty title="No players yet" text="Registered players will appear here." />}</>}
        {(tab === 'Draws' || tab === 'Results') && <>
          {event.is_manual && <TournamentMatches eventId={event.id} divisionId={divisionId} matchId={matchId} showPoints={tab === 'Results'} />}
          {publicError ? <LightEmpty title="Tournament information unavailable" text={publicError} /> : (tab === 'Draws' ? drawStatus.hasDraw : drawStatus.hasResults) ? <><LightEmpty title={tab === 'Draws' ? 'Tournament Draws' : 'Tournament Results'} text="View live brackets and match results." /><LightButton label="View published draws and results" onPress={() => void runAction(() => openSitePath(`/draws/${event.slug || event.id}`, { forceBrowser: true }))} /></> : <LightEmpty icon={tab === 'Draws' ? 'point.3.connected.trianglepath.dotted' : 'trophy'} title={tab === 'Draws' ? 'Draws Coming Soon' : 'No Results Yet'} text={tab === 'Draws' ? 'Draws will be released shortly before the tournament begins.' : 'Tournament results will appear here once matches are completed.'} />}
        </>}
        {tab === 'Media' && <>{event.youtube_playlist_url ? <><LightEmpty icon="play.rectangle" title="Event Highlights" text="Watch the event videos." /><LightButton label="Watch highlights" onPress={() => void runAction(() => Linking.openURL(event.youtube_playlist_url!))} /></> : event.gallery_album_id ? <LightButton label="View event gallery" onPress={() => void runAction(() => openSitePath(`/calendar/${event.slug || event.id}?tab=media`, { forceBrowser: true }))} /> : <LightEmpty icon="camera" title="No Media Yet" text="Media will be added after the event." />}</>}

      </View>}
    </ScrollView>
    <Modal visible={posterOpen} transparent animationType="fade" onRequestClose={() => setPosterOpen(false)}><Pressable accessibilityRole="button" accessibilityLabel="Close event poster" onPress={() => setPosterOpen(false)} style={{ flex: 1, backgroundColor: '#000d', paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingHorizontal: 16 }}><View style={{ alignItems: 'flex-end' }}><Ionicons name="close" size={28} color="#fff" /></View>{!!posterUrl && <Image source={{ uri: posterUrl }} style={{ flex: 1, width: '100%' }} contentFit="contain" />}</Pressable></Modal>

  </View></EventAccent>;
}
function LightButton({ label, onPress }: { label: string; onPress: () => void }) { const accent = useEventAccent(); return <Pressable accessibilityRole="button" onPress={onPress} style={{ backgroundColor: accent, minHeight: 44, padding: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: '#000', fontSize: 13, fontWeight: '400' }}>{label}</Text></Pressable>; }
function LightEmpty({ title, text, icon }: { title: string; text: string; icon?: EventIconName }) { return <View style={{ padding: 24, paddingVertical: 64, borderRadius: 16, backgroundColor: '#fff', borderWidth: 1, borderColor: '#f3f4f6', alignItems: 'center', gap: 10 }}>{icon && <EventIcon name={icon} color="#e5e7eb" size={48} />}<Text style={{ color: '#0f172a', fontSize: 16, fontWeight: '500' }}>{title}</Text><Text style={{ color: '#65726B', fontSize: 14, lineHeight: 20, textAlign: 'center' }}>{text}</Text></View>; }
