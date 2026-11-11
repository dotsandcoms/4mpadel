import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { type ReactNode, useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ClubIdentity } from '@/components/club-identity';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { EventArtwork } from '@/components/event-artwork';
import { ClubPhotoRail, RatingStars, ReviewCard, Attributions } from '@/components/club-media';
import { fetchClubPlace, type ClubPlace, type ClubPhoto } from '@/lib/club-places';
import { clubDirectionsUrl, clubLocation, fetchClub, fetchClubEvents, fetchClubOrganisations, fetchClubCoaches, fetchClubCommunity, fetchGroupVenues, type Club, type ClubDetails, type ClubEvent, type ClubOrganisation, type ClubCoach, type ClubCommunity } from '@/lib/clubs';
import { formatEventRange } from '@/lib/home';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

function Section({ title, summary, children, initialOpen = false }: { title: string; summary?: string; children: ReactNode; initialOpen?: boolean }) {
  const [open, setOpen] = useState(initialOpen);
  return <View style={s.accordion}>
    <Pressable accessibilityRole="button" accessibilityLabel={summary ? `${title}. ${summary}` : title} accessibilityState={{ expanded: open }} onPress={() => setOpen(value => !value)} style={s.sectionHeader}>
      <View style={{ flex: 1, gap: 4 }}><Text style={s.heading}>{title}</Text>{summary && <Text style={s.meta}>{summary}</Text>}</View>
      <SymbolView name={open ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }} size={14} tintColor={b.muted} />
    </Pressable>
    {open && <View style={{ paddingBottom: 16, gap: 12 }}>{children}</View>}
  </View>;
}

export default function ClubScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>(), router = useRouter(), safe = useSafeAreaInsets();
  const [club, setClub] = useState<ClubDetails | null>(null), [loading, setLoading] = useState(true), [error, setError] = useState(''), [revision, setRevision] = useState(0);
  const [events, setEvents] = useState<ClubEvent[] | null>(null), [organisations, setOrganisations] = useState<ClubOrganisation[] | null>(null), [venues, setVenues] = useState<Club[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]), [community, setCommunity] = useState<ClubCommunity | null>(null);
  const [relatedError, setRelatedError] = useState(''), [allEvents, setAllEvents] = useState(false), [photo, setPhoto] = useState<{ url: string; caption: string } | null>(null);
  const [place, setPlace] = useState<ClubPlace | null>(null), [placeLoading, setPlaceLoading] = useState(false), [placeError, setPlaceError] = useState(''), [placeRevision, setPlaceRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setClub(null); setError(''); setPhoto(null); setAllEvents(false);
    void fetchClub(slug, controller.signal).then(value => { if (!controller.signal.aborted) setClub(value); }).catch(() => { if (!controller.signal.aborted) setError('This club couldn’t load. Please try again.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, revision]);
  useEffect(() => {
    const controller = new AbortController(); setEvents(null); setOrganisations(null); setVenues([]); setCoaches([]); setCommunity(null); setRelatedError('');
    if (!club) return () => controller.abort();
    const failed = () => { if (!controller.signal.aborted) setRelatedError('Some linked club information couldn’t load. Please retry.'); };
    void fetchClubEvents(club, controller.signal).then(value => { if (!controller.signal.aborted) setEvents(value); }).catch(failed);
    void fetchClubOrganisations(club.id, controller.signal).then(value => { if (!controller.signal.aborted) setOrganisations(value); }).catch(failed);
    void fetchClubCoaches(club, controller.signal).then(value => { if (!controller.signal.aborted) setCoaches(value); }).catch(failed);
    void fetchClubCommunity(club.id, controller.signal).then(value => { if (!controller.signal.aborted) setCommunity(value); }).catch(failed);
    if (club.group) void fetchGroupVenues(club.group.id, controller.signal).then(value => { if (!controller.signal.aborted) setVenues(value.filter(row => row.id !== club.id)); }).catch(failed);
    return () => controller.abort();
  }, [club]);
  useEffect(() => {
    const controller = new AbortController(); setPlace(null); setPlaceError(''); setPlaceLoading(!!club?.googlePlaceId);
    if (club?.googlePlaceId) void fetchClubPlace(club.slug, controller.signal).then(value => { if (!controller.signal.aborted) setPlace(value); }).catch(() => { if (!controller.signal.aborted) setPlaceError('Google photos and reviews couldn’t load. The club details are still available.'); }).finally(() => { if (!controller.signal.aborted) setPlaceLoading(false); });
    return () => controller.abort();
  }, [club, placeRevision]);
  async function openUrl(url: string) { try { await Linking.openURL(url); } catch { setError('This link couldn’t open. Please try again.'); } }
  const booking = club?.socials.find(link => link.label === 'Playtomic');
  const website = club?.website || place?.website, phone = club?.phone || place?.phone, mapsUrl = place?.mapsUrl || club?.googleUrl;
  const contactCount = club ? [phone, club.email, club.whatsapp, ...club.socials.filter(link => link.label !== 'Playtomic')].filter(Boolean).length : 0;
  const photos: ClubPhoto[] = [...(club?.cover ? [{ url: club.cover, caption: club.name, source: 'Club' as const, attributions: [] }] : []), ...(club?.gallery.map(item => ({ ...item, source: 'Club' as const, attributions: [] })) || []), ...(place?.photos || [])].filter((item, index, rows) => rows.findIndex(photo => photo.url === item.url) === index);
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Johannesburg' }).format(new Date());
  const sortedEvents = events && [...events].sort((a, z) => {
    const pastA = (a.end || a.start).slice(0,10) < today, pastZ = (z.end || z.start).slice(0,10) < today;
    return Number(pastA) - Number(pastZ) || (pastA ? z.start.localeCompare(a.start) : a.start.localeCompare(z.start));
  });
  return <View style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, title: 'Club details', headerBackTitle: 'Clubs', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: 40, gap: 16 }}>
      {loading && <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading club details" />}
      {!!error && <HomeAction label="Retry club" onPress={() => setRevision(value => value + 1)} />}
      {club ? <>
        {photos.length ? <ClubPhotoRail photos={photos} onError={() => setError('This photo link couldn’t open.')} /> : placeLoading ? <View style={{ height: 208, borderRadius: 16, backgroundColor: b.surface, alignItems: 'center', justifyContent: 'center', gap: 12 }}><ActivityIndicator color={b.muted} /><Text style={s.meta}>Loading venue photos…</Text></View> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><ClubIdentity club={club} size={48} /><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={s.title}>{club.name}</Text><Text style={s.body}>{clubLocation(club)}</Text></View></View>
        {place?.rating && <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}><Text style={{ color: b.premium, fontSize: 16, fontWeight: '600' }}>{place.rating.toFixed(1)}</Text><RatingStars rating={place.rating} /><Text style={{ color: '#5E5E5E', fontSize: 12 }}>Google Maps · {place.reviewCount ?? '—'} reviews</Text>{place.openNow !== null && <Text style={{ ...s.meta, color: place.openNow ? b.accent : b.muted }}>{place.openNow ? 'Open now' : 'Closed now'}</Text>}</View>}
        {place?.businessStatus && place.businessStatus !== 'OPERATIONAL' && <Text style={{ ...s.body, color: b.danger }}>{place.businessStatus === 'CLOSED_PERMANENTLY' ? 'Google lists this venue as permanently closed' : 'Google lists this venue as temporarily closed'}</Text>}
        {!!club.tagline && <Text style={{ ...s.body, color: b.premium }}>{club.tagline}</Text>}
        {!!club.about && <Text style={{ ...s.body, color: b.premium }}>{club.about}</Text>}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 }}>
          {(booking || clubDirectionsUrl(club, Platform.OS)) && <HomeAction kind="primary" compact label={booking ? 'Book on Playtomic' : 'Get directions'} onPress={() => void openUrl(booking?.url || clubDirectionsUrl(club, Platform.OS)!)} />}
          {website && <HomeAction compact label="Website" onPress={() => void openUrl(website)} />}
          {phone && <HomeAction compact label="Call club" onPress={() => void openUrl(`tel:${phone.replace(/[^+0-9]/g,'')}`)} />}
          {booking && clubDirectionsUrl(club, Platform.OS) && <HomeAction compact label="Directions" onPress={() => void openUrl(clubDirectionsUrl(club, Platform.OS)!)} />}
        </View>
        <Text selectable style={s.body}>{club.address || clubLocation(club)}</Text>
        {(club.totalCourts || events?.length || community?.players) ? <Text style={s.meta}>{[club.totalCourts ? `${club.totalCourts} courts` : '', events?.length ? `${events.length} linked events` : '', community?.players ? `${community.players} players` : ''].filter(Boolean).join(' · ')}</Text> : null}
        {(place?.reviews.length || placeLoading || placeError) ? <View style={{ gap: 12, paddingTop: 8 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}><Text accessibilityRole="header" style={s.heading}>Reviews</Text>{mapsUrl && <HomeAction compact label="View on Google" onPress={() => void openUrl(mapsUrl)} />}</View>
          {placeLoading && <ActivityIndicator color={b.muted} accessibilityLabel="Loading Google reviews" />}
          {!!place?.reviews.length && <><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>{place.reviews.map((review,i) => <ReviewCard key={`${review.author}:${i}`} review={review} onError={() => setError('This Google profile couldn’t open.')} />)}</ScrollView><Text style={{ fontSize: 12, color: '#5E5E5E' }}>Google Maps · Most relevant reviews</Text><Attributions rows={place.attributions} onError={() => setError('This attribution link couldn’t open.')} /></>}
          {!!placeError && <View style={{ gap: 8 }}><Text style={s.body}>Google photos and reviews are unavailable right now</Text><HomeAction compact label="Retry Google details" onPress={() => setPlaceRevision(value => value + 1)} /></View>}
        </View> : null}
        {contactCount > 0 && <Section title="Contact & social" summary={`${contactCount} ${contactCount === 1 ? 'link' : 'links'}`}>
          {phone && <HomeAction label={`Call ${phone}`} onPress={() => void openUrl(`tel:${phone.replace(/[^+0-9]/g,'')}`)} />}
          {club.email && <HomeAction label={club.email} onPress={() => void openUrl(`mailto:${encodeURIComponent(club.email!)}`)} />}
          {club.whatsapp && <HomeAction label="WhatsApp the club" onPress={() => void openUrl(club.whatsapp!)} />}
          {club.socials.filter(link => link.label !== 'Playtomic').map(link => <HomeAction key={link.label} label={link.label} onPress={() => void openUrl(link.url)} />)}
        </Section>}
        {coaches.length > 0 && <Section title="Coaches" summary={`${coaches.length} at this club`}>
          {coaches.map(coach => <View key={coach.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><ClubIdentity club={coach} size={44} /><View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{coach.name}</Text>{!!coach.city && <Text style={s.meta}>{coach.city}</Text>}</View><HomeAction compact label="Coach profile" onPress={() => void openUrl(`https://4mpadel.co.za/academy/coaches?id=${encodeURIComponent(coach.id)}`)} /></View>)}
        </Section>}
        {(club.courtDetails.length > 0 || club.surface || club.lighting) && <Section title="Courts" summary={club.totalCourts ? `${club.totalCourts} courts` : undefined}>
          {club.courtDetails.map(court => <View key={court.label} style={{ gap: 8 }}>
            {court.image && <Pressable accessibilityRole="button" accessibilityLabel={`View ${court.label.toLowerCase()} photo`} onPress={() => setPhoto({ url: court.image!, caption: court.label })}><Image source={{ uri: court.image }} style={{ width: '100%', height: 160, borderRadius: 12 }} contentFit="cover" /></Pressable>}
            <Text style={s.rowTitle}>{court.label}{court.count ? ` · ${court.count}` : ''}</Text>{court.features.map(feature => <Text key={feature} style={s.body}>{feature}</Text>)}
          </View>)}
          {!!club.surface && <Text style={s.body}>Surface · {club.surface}</Text>}{!!club.lighting && <Text style={s.body}>Lighting · {club.lighting}</Text>}
        </Section>}
        {club.facilityDetails.length > 0 && <Section title="Facilities" summary={`${club.facilityDetails.length} listed`}>
          {club.facilityDetails.map((item,index) => <View key={`${item.title}:${index}`} style={{ gap: 4 }}><Text style={s.rowTitle}>{item.title}</Text>{!!item.description && <Text style={s.body}>{item.description}</Text>}</View>)}
        </Section>}
        {(place?.hours.length || club.hours.length > 0 || club.hoursNotes || club.access247) && <Section title="Opening hours" summary={place?.openNow === true ? 'Open now' : club.access247 ? '24-hour access' : 'View weekly hours'}>
          {place?.hours.length ? <>{place.hours.map(day => <Text key={day} style={s.body}>{day}</Text>)}<Text style={{ fontSize: 12, color: '#5E5E5E' }}>Google Maps</Text></> : club.hours.map(({ day, label }) => <View key={day} style={{ flexDirection: 'row', gap: 12, justifyContent: 'space-between' }}><Text style={s.body}>{day}</Text><Text style={{ ...s.body, color: b.premium, fontVariant: ['tabular-nums'] }}>{label}</Text></View>)}
          {club.access247 && <Text style={s.body}>24-hour access available</Text>}{!!club.hoursNotes && <Text style={s.body}>{club.hoursNotes}</Text>}
        </Section>}
        <Section title="Events at this club" summary={events === null ? relatedError ? 'Currently unavailable' : 'Loading events…' : `${events.length} in the recent calendar`}>
          {events === null ? <Text style={s.body}>{relatedError ? 'Retry to load the event calendar.' : 'Loading events…'}</Text> : sortedEvents?.length ? <>
            {sortedEvents.slice(0, allEvents ? undefined : 6).map(event => <Pressable key={event.id} accessibilityRole="button" accessibilityLabel={`View ${event.name}`} onPress={() => router.push({ pathname: '/events/[id]', params: { id: event.slug || String(event.id) } })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}><EventArtwork uri={event.image} event={{ event_name: event.name, sapa_status: event.status }} style={{ width: 44, height: 60, borderRadius: 8 }} /><View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{event.name}</Text><Text style={s.meta}>{formatEventRange(event.start,event.end)}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} /></Pressable>)}
            {sortedEvents.length > 6 && <HomeAction label={allEvents ? 'Show fewer events' : 'Show all events'} onPress={() => setAllEvents(value => !value)} />}
          </> : <Text style={s.body}>No linked events in the recent calendar.</Text>}
        </Section>
        {!!organisations?.length && <Section title="Organisations" summary={`${organisations.length} linked`}>
          {organisations.map(org => <View key={org.id} style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}><ClubIdentity club={org} size={44} /><View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{org.name}</Text>{!!org.type && <Text style={s.meta}>{org.type}</Text>}</View></View>)}
        </Section>}
        {!!community?.team.length && <Section title="Club team" summary={`${community.team.length} people`}>
          {community.team.map((person,index) => <Pressable key={`${person.id}:${index}`} accessibilityRole="button" accessibilityLabel={`View ${person.name}, club ${person.role}`} onPress={() => router.push({ pathname: '/players/[id]', params: { id: String(person.id) } })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', minHeight: 48 }}><ClubIdentity club={{ name: person.name, logo: person.photo }} size={40} /><View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{person.name}</Text><Text style={s.meta}>{person.role === 'owner' ? 'Owner' : person.role === 'admin' ? 'Club admin' : 'Club staff'}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} /></Pressable>)}
        </Section>}
        {club.group && <Section title={club.group.name} summary={`${venues.length} other ${venues.length === 1 ? 'venue' : 'venues'}`}>
          <HomeAction label="View club group" onPress={() => router.push({ pathname: '/club-groups/[slug]', params: { slug: club.group!.slug } })} />
          {venues.map(venue => <Pressable key={venue.id} accessibilityRole="button" accessibilityLabel={`View ${venue.name}`} onPress={() => router.push({ pathname: '/clubs/[slug]', params: { slug: venue.slug } })} style={{ flexDirection: 'row', gap: 12, alignItems: 'center', paddingVertical: 8 }}><ClubIdentity club={venue} size={44} /><View style={{ flex: 1, gap: 4 }}><Text style={s.rowTitle}>{venue.name}</Text><Text style={s.meta}>{clubLocation(venue)}</Text></View><SymbolView name={{ ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }} size={14} tintColor={b.muted} /></Pressable>)}
        </Section>}
        {mapsUrl && <Section title="Google listing" summary="See the full venue listing">
          <Text style={s.body}>See Google’s photos, reviews and venue details for this club.</Text>
          <HomeAction label="Open Google Maps" onPress={() => void openUrl(mapsUrl)} />
        </Section>}
        {!!relatedError && <HomeAction label="Retry linked information" onPress={() => setRevision(value => value + 1)} />}
      </> : !loading && !error && <Text style={s.body}>This club is not available in the public directory.</Text>}
    </ScrollView>
    <Modal visible={!!photo} animationType="slide" presentationStyle="fullScreen" onRequestClose={() => setPhoto(null)}>
      <View style={{ flex: 1, backgroundColor: b.page, paddingTop: safe.top, paddingBottom: safe.bottom }}>
        <View style={{ minHeight: 56, paddingHorizontal: 20, flexDirection: 'row', gap: 12, alignItems: 'center' }}><Text numberOfLines={2} style={{ ...s.rowTitle, flex: 1 }}>{photo?.caption || 'Club photo'}</Text><HomeAction kind="icon" icon="close" label="Close photo" onPress={() => setPhoto(null)} /></View>
        {photo && <Image source={{ uri: photo.url }} style={{ flex: 1, width: '100%' }} contentFit="contain" />}
      </View>
    </Modal>
    <ErrorBanner message={error || relatedError || placeError || null} top={8} />
  </View>;
}
const s = StyleSheet.create({
  title: { color: b.premium, fontSize: 22, fontWeight: '600', lineHeight: 28 },
  heading: { color: b.premium, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  rowTitle: { color: b.premium, fontSize: 14, lineHeight: 20, fontWeight: '600' },
  body: { color: b.muted, fontSize: 14, lineHeight: 21 },
  meta: { color: b.muted, fontSize: 12, lineHeight: 18 },
  stat: { color: b.premium, fontSize: 22, fontWeight: '600', fontVariant: ['tabular-nums'] },
  accordion: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
  sectionHeader: { minHeight: 64, paddingVertical: 12, flexDirection: 'row', gap: 12, alignItems: 'center' },
});
