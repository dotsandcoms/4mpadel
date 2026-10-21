import { recordAnalyticsCheckout, trackConfirmedPurchase, trackEvent } from '@/lib/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { ActionButton, Notice } from '@/components/events/event-ui';
import { LicenseSummary } from '@/components/license-summary';
import { SelectField } from '@/components/select-field';
import { formatMoney } from '@/lib/event-rules';
import { fetchLicenses, invokeLicense, licenseDate, type LicenseBundle, type LicenseQuote, type LicenseCheckoutError } from '@/lib/licenses';
import { lightBrand as brand } from '@/theme/tokens';
type Attempt = {
  id: string;
  reference?: string;
  url?: string;
  licenseYear: number;
  licenseType: string;
  eventId?: number;
};
export default function LicenseScreen() {
  const router = useRouter(),
    insets = useSafeAreaInsets();
  const [bundle, setBundle] = useState<LicenseBundle | null>(null),
    [seasons, setSeasons] = useState<{
      year: number;
      price: number;
      renewal_price?: number;
      sales_open: boolean;
    }[]>([]),
    [events, setEvents] = useState<{
      id: number;
      event_name: string;
    }[]>([]);
  const [year, setYear] = useState(() => Math.max(2027, Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date())))),
    [type, setType] = useState('full'),
    [eventId, setEventId] = useState<number | undefined>(),
    [quote, setQuote] = useState<LicenseQuote | null>(null),
    [attempt, setAttempt] = useState<Attempt | null>(null),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [profileIssue, setProfileIssue] = useState<string[] | null>(null);
  const lock = useRef(false),
    key = useRef('');
  function showError(error: unknown) {
    const failure = error as LicenseCheckoutError;
    setError(failure?.message || 'Please try again.');
    setProfileIssue(failure?.code === 'PROFILE_INCOMPLETE' ? failure.missingFields || [] : null);
  }
  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const {
        data: {
          user
        }
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Sign in to manage your licence.');
      key.current = `license-checkout:${user.id}`;
      const [b, s, e, saved] = await Promise.all([fetchLicenses(), supabase.from('license_seasons').select('*').is('archived_at', null).order('year', {
        ascending: false
      }), supabase.from('calendar').select('id,event_name,start_date,end_date,allow_temporary_license').order('start_date').limit(500), AsyncStorage.getItem(key.current)]);
      if (s.error) throw s.error;
      if (e.error) throw e.error;
      setBundle(b);
      setSeasons(s.data || []);
      setYear(previous => s.data?.some(season => season.year === previous) ? previous : s.data?.[0]?.year || 2027);
      setEvents((e.data || []).filter(row => row.allow_temporary_license !== false && String(row.end_date || row.start_date).slice(0, 10) >= new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Johannesburg'
      }).format(new Date())));
      if (saved) {
        const a = JSON.parse(saved);
        setAttempt({
          ...a,
          licenseYear: a.licenseYear ?? 2026,
          licenseType: a.licenseType || 'full'
        });
        setYear(a.licenseYear ?? 2026);
        setType(a.licenseType || 'full');
        setEventId(a.eventId);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load licences.');
    } finally {
      setLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { void load(); }, [load]));
  useEffect(() => {
    const sub = Linking.addEventListener('url', ({
      url
    }) => {
      if (url.startsWith('fourmpadel://license') && Platform.OS === 'ios') {
        try {
          WebBrowser.dismissBrowser();
        } catch {/*closed*/}
      }
    });
    return () => sub.remove();
  }, []);
  useEffect(() => {
    setQuote(null);
    if (type === 'temporary' && !eventId) return;
    let live = true;
    invokeLicense({
      action: 'quote',
      licenseType: type,
      licenseYear: year,
      eventId
    }).then(r => {
      if (live) {
        setQuote(r.quote);
        setError('');
        setProfileIssue(null);
      }
    }).catch(e => {
      if (live) showError(e);
    });
    return () => {
      live = false;
    };
  }, [year, type, eventId, bundle]);
  async function run(fn: () => Promise<void>) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      void trackEvent('action_error', { feature: 'licence' });
      showError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function verify() {
    if (!attempt?.reference) return;
    const r = await invokeLicense({
      action: 'verify',
      reference: attempt.reference
    });
    if (!r.paid) { void trackEvent('checkout_outcome', { item_category: attempt.licenseType === 'full' ? 'licence_full' : 'licence_temporary', status: 'unconfirmed' }); throw new Error('Payment is not confirmed yet. Wait a moment and check again.'); }
    void trackConfirmedPurchase(attempt.reference, attempt.licenseType === 'full' ? 'licence_full' : 'licence_temporary');
    await AsyncStorage.removeItem(key.current);
    setAttempt(null);
    setBundle(await fetchLicenses());
  }
  async function pay() {
    if (!quote) return;
    const current = attempt || {
      id: Crypto.randomUUID(),
      licenseYear: year,
      licenseType: type,
      eventId
    };
    await AsyncStorage.setItem(key.current, JSON.stringify(current));
    setAttempt(current);
    const r = await invokeLicense({
      action: 'checkout',
      attemptId: current.id,
      licenseType: current.licenseType,
      licenseYear: current.licenseYear,
      eventId: current.eventId,
      agreed: true,
      acceptedTotal: quote.total
    });
    const url = new URL(r.authorizationUrl);
    if (url.protocol !== 'https:' || url.hostname !== 'checkout.paystack.com') throw new Error('Unexpected payment address.');
    void recordAnalyticsCheckout(r.reference, current.licenseType === 'full' ? 'licence_full' : 'licence_temporary', r.quote?.total ?? quote.total);
    const saved = {
      ...current,
      reference: r.reference,
      url: url.href
    };
    await AsyncStorage.setItem(key.current, JSON.stringify(saved));
    setAttempt(saved);
    await WebBrowser.openBrowserAsync(url.href, {
      controlsColor: brand.accent
    });
    const result = await invokeLicense({
      action: 'verify',
      reference: saved.reference
    });
    if (!result.paid) { void trackEvent('checkout_outcome', { item_category: saved.licenseType === 'full' ? 'licence_full' : 'licence_temporary', status: 'unconfirmed' }); throw new Error('Payment is not confirmed yet. Check its status before trying again.'); }
    void trackConfirmedPurchase(saved.reference, saved.licenseType === 'full' ? 'licence_full' : 'licence_temporary');
    await AsyncStorage.removeItem(key.current);
    setAttempt(null);
    setBundle(await fetchLicenses());
  }
  const renew = quote?.isRenewal === true;
  return <View style={{
    flex: 1,
    backgroundColor: brand.page,
    paddingTop: insets.top
  }}><Pressable accessibilityRole="button" accessibilityLabel="Back to profile" onPress={() => router.canGoBack() ? router.back() : router.replace('/(tabs)/profile')} style={{
      minHeight: 48,
      paddingHorizontal: 20,
      justifyContent: 'center'
    }}><Text style={{
        color: brand.premium,
        fontSize: 16
      }}>‹ Back</Text></Pressable><ScrollView contentContainerStyle={{
      padding: 20,
      paddingBottom: insets.bottom + 24,
      gap: 20
    }}><Text accessibilityRole="header" style={{
        color: brand.premium,
        fontSize: 30,
        fontWeight: '700'
      }}>Your SAPA licences</Text>{loading && <ActivityIndicator color={brand.accent} />}{!!error && <Text accessibilityRole="alert" style={{
        color: brand.danger,
        lineHeight: 22
      }}>{error}</Text>}
 {profileIssue && <View style={{ gap: 8 }}><Text style={{ color: brand.muted, lineHeight: 22 }}>Missing: {profileIssue.join(', ') || 'player profile details'}.</Text><ActionButton secondary label="Edit profile" onPress={() => router.push('/edit-profile')} /></View>}
 {bundle && <LicenseSummary bundle={bundle} />}
 <Text accessibilityRole="header" style={{
        color: brand.premium,
        fontSize: 20,
        fontWeight: '700'
      }}>Buy or renew</Text><View style={{
        flexDirection: 'row',
        gap: 10
      }}>{['full', 'temporary'].map(t => <ActionButton key={t} label={t === 'full' ? 'Full annual' : 'Temporary event'} secondary={type !== t} disabled={!!attempt || busy} onPress={() => {
          void trackEvent('feature_interaction', { feature: 'licence', action: 'filter', selection: t });
          setType(t);
          setError('');
        }} />)}</View>
 {type === 'full' ? <><Notice title={`${year} Full licence`}>Full coverage runs through 31 December {year}. Your quote shows the coverage start date.</Notice><View style={{
          gap: 8
        }}>{seasons.map(s => <ActionButton key={s.year} secondary={s.year !== year} disabled={!!attempt || busy} label={`${s.year} · ${formatMoney(Number(bundle?.licenses.some(l => l.license_type === 'full' && l.status !== 'revoked' && l.season_year < s.year) ? s.renewal_price ?? s.price : s.price))}${s.sales_open ? '' : ' · Sales closed'}`} onPress={() => setYear(s.year)} />)}</View></> : <View style={{ gap: 12 }}>
   <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21 }}>Cover one eligible event without an annual licence.</Text>
   <SelectField
     label="Event"
     placeholder="Choose an event"
     searchable
     disabled={!!attempt || busy || !events.length}
     value={eventId == null ? '' : String(eventId)}
     options={events.map(event => ({ label: event.event_name, value: String(event.id) }))}
     emptyLabel="No events match your search."
     onChange={value => setEventId(Number(value))}
   />
   {!events.length && <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21 }}>No eligible upcoming events are available.</Text>}
 </View>}

 {quote && <View style={{
        padding: 20,
        borderRadius: 16,
        backgroundColor: brand.elevated,
        gap: 12
      }}><Row label={type === 'full' ? renew ? 'Full renewal' : 'New Full licence' : 'Temporary licence'} value={formatMoney(quote.base)} />{type === 'full' && quote.startsOn && <Text style={{ color: brand.muted, fontSize: 13 }}>Valid {licenseDate(quote.startsOn)} – {licenseDate(quote.endsOn || '')}</Text>}{quote.fee > 0 && <Row label={quote.feeLabel} value={formatMoney(quote.fee)} />}<Row label="Total" value={formatMoney(quote.total)} />{quote.active && <Text style={{
          color: brand.muted
        }}>You already hold this licence. Contact support if it has been revoked.</Text>}{!quote.enabled && !quote.active && <Text style={{
          color: brand.muted
        }}>Sales are closed for this licence.</Text>}</View>}
 {attempt?.reference && <ActionButton label="Check payment status" secondary disabled={busy} onPress={() => void run(verify)} />}<ActionButton label={attempt ? 'Continue secure payment' : type === 'full' && renew ? `Renew for ${year}` : type === 'full' ? `Buy ${year} Full licence` : 'Buy temporary licence'} busy={busy} disabled={!quote?.enabled || quote?.active} onPress={() => void run(pay)} />{attempt && <ActionButton label="Start a different checkout" secondary disabled={busy} onPress={() => void run(async () => {
        await AsyncStorage.removeItem(key.current);
        setAttempt(null);
      })} />}<Text style={{
        color: brand.muted,
        fontSize: 13,
        lineHeight: 20
      }}>Paystack verifies payment before issuing your licence. Check any previous payment before starting a different checkout.</Text>
 </ScrollView></View>;
}
function Row({
  label,
  value
}: {
  label: string;
  value: string;
}) {
  return <View style={{
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12
  }}><Text style={{
      color: brand.muted,
      flex: 1
    }}>{label}</Text><Text style={{
      color: brand.premium,
      fontWeight: '700'
    }}>{value}</Text></View>;
}
