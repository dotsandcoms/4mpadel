import { recordAnalyticsCheckout, trackConfirmedPurchase, trackEvent } from '@/lib/analytics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Crypto from 'expo-crypto';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from '@/lib/supabase';
import { HomeAction } from '@/components/home-action';
import { ErrorBanner } from '@/components/error-banner';
import { LicenseSummary } from '@/components/license-summary';
import { formatMoney } from '@/lib/event-rules';
import { fetchLicenses, invokeLicense, licenseDate, type LicenseBundle, type LicenseQuote, type LicenseCheckoutError } from '@/lib/licenses';
import { loadingBlue, lightBrand as brand } from '@/theme/tokens';
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
    }[]>([]);
  const [year, setYear] = useState(() => Math.max(2027, Number(new Intl.DateTimeFormat('en', { year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date())))),
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
      const [b, s, saved] = await Promise.all([fetchLicenses(), supabase.from('license_seasons').select('*').is('archived_at', null).order('year', {
        ascending: false
      }), AsyncStorage.getItem(key.current)]);
      if (s.error) throw s.error;
      setBundle(b);
      setSeasons(s.data || []);
      setYear(previous => s.data?.some(season => season.year === previous) ? previous : s.data?.[0]?.year || 2027);
      if (saved) {
        const a = JSON.parse(saved);
        setAttempt({
          ...a,
          licenseYear: a.licenseYear ?? 2026,
          licenseType: a.licenseType || 'full'
        });
        if ((a.licenseType || 'full') === 'full') setYear(a.licenseYear ?? 2026);
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
    let live = true;
    invokeLicense({
      action: 'quote',
      licenseType: 'full',
      licenseYear: year
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
  }, [year, bundle]);
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
    if (attempt?.licenseType === 'temporary') throw new Error('Temporary licences are purchased with event registration. You can still check the status of your previous payment.');
    const current = attempt || {
      id: Crypto.randomUUID(),
      licenseYear: year,
      licenseType: 'full'
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
  const locked = !!attempt || busy;
  const previousTemporary = attempt?.licenseType === 'temporary';
  return <View style={{ flex: 1, backgroundColor: brand.page }}>
    <Stack.Screen options={{ headerShown: true, title: 'SAPA licence', headerBackTitle: 'Back', headerTintColor: brand.premium, headerStyle: { backgroundColor: brand.page }, headerShadowVisible: false }} />
    <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ padding: 20, paddingBottom: insets.bottom + 24, gap: 20 }}>
      {loading && <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading licences" />}
      {profileIssue && <View style={{ gap: 8 }}><Text style={{ color: brand.muted, lineHeight: 21 }}>Missing: {profileIssue.join(', ') || 'player profile details'}.</Text><HomeAction label="Edit profile" onPress={() => router.push('/edit-profile')} /></View>}
      {bundle && <LicenseSummary bundle={bundle} />}
      <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 20, fontWeight: '600' }}>Buy or renew an annual licence</Text>
      {previousTemporary && <View style={{ gap: 8 }}><Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21 }}>A previous temporary-licence payment needs a status check. New temporary licences are added when you register and pay for an event.</Text></View>}
      <View style={{ gap: 12 }}>
        <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21 }}>Annual coverage through 31 December {year}. Your quote confirms the start date.</Text>
        <View style={{ backgroundColor: brand.elevated, borderRadius: 16, overflow: 'hidden' }}>
          {seasons.map((season, index) => <Pressable key={season.year} accessibilityRole="radio" accessibilityState={{ checked: season.year === year, disabled: locked }} disabled={locked} onPress={() => setYear(season.year)} style={{ minHeight: 64, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: index ? 1 : 0, borderColor: brand.edge }}>
            <View style={{ height: 20, width: 20, borderRadius: 10, borderWidth: season.year === year ? 6 : 1, borderColor: season.year === year ? brand.accent : brand.faint }} />
            <View style={{ flex: 1, gap: 3 }}><Text style={{ color: brand.premium, fontSize: 15, fontWeight: '600' }}>{season.year} Full licence</Text>{!season.sales_open && <Text style={{ color: brand.muted, fontSize: 12 }}>Sales closed</Text>}</View>
            <Text style={{ color: brand.premium, fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] }}>{formatMoney(Number(bundle?.licenses.some(licence => licence.license_type === 'full' && licence.status !== 'revoked' && licence.season_year < season.year) ? season.renewal_price ?? season.price : season.price))}</Text>
          </Pressable>)}
        </View>
      </View>
      {quote && <View style={{ padding: 16, borderRadius: 16, backgroundColor: brand.elevated, gap: 12 }}>
        <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 16, fontWeight: '600' }}>Your quote</Text>
        <Row label={renew ? 'Full renewal' : 'New Full licence'} value={formatMoney(quote.base)} />
        {quote.startsOn && <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>Valid {licenseDate(quote.startsOn)} – {licenseDate(quote.endsOn || '')}</Text>}
        {quote.fee > 0 && <Row label={quote.feeLabel} value={formatMoney(quote.fee)} />}
        <View style={{ paddingTop: 12, borderTopWidth: 1, borderColor: brand.edge }}><Row label="Total" value={formatMoney(quote.total)} /></View>
        {quote.active && <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>You already hold this licence. Contact support if it has been revoked.</Text>}
        {!quote.enabled && !quote.active && <Text style={{ color: brand.muted, fontSize: 13 }}>Sales are closed for this licence.</Text>}
      </View>}
      <View style={{ gap: 8 }}>
        {attempt?.reference && <HomeAction label="Check payment status" disabled={busy} onPress={() => void run(verify)} />}
        <HomeAction kind="primary" label={busy ? 'Please wait…' : attempt && !previousTemporary ? 'Continue secure payment' : renew ? `Renew for ${year}` : `Buy ${year} Full licence`} disabled={busy || previousTemporary || !quote?.enabled || quote?.active} onPress={() => void run(pay)} />
        {attempt && <HomeAction label="Start a different checkout" disabled={busy} onPress={() => void run(async () => { await AsyncStorage.removeItem(key.current); setAttempt(null); })} />}
        <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>Paystack verifies payment before issuing your licence. Check any previous payment before starting a different checkout.</Text>
      </View>
      <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 19 }}>Temporary licences are available during event registration and payment.</Text>
    </ScrollView>
    <ErrorBanner message={error || null} top={8} />
  </View>;
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
