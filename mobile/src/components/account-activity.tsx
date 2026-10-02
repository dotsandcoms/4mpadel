import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { EventRow } from '@/components/home-event-card';
import { SettingsPage, SETTINGS_BLUE } from '@/components/settings-ui';
import { fetchHomeBundle, type CalendarEvent } from '@/lib/home';
import { fetchProfileTransactions, type ProfileTransaction } from '@/lib/profile';
import { supabase } from '@/lib/supabase';
import { paymentStatus } from '@/lib/payment-status';
import { lightBrand as brand } from '@/theme/tokens';

export function AccountActivity({ kind }: { kind: 'entries' | 'payments' }) {
  const router = useRouter();
  const [events, setEvents] = useState<{ upcoming: CalendarEvent[]; past: CalendarEvent[] }>({ upcoming: [], past: [] });
  const [transactions, setTransactions] = useState<ProfileTransaction[]>([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  const [signedIn, setSignedIn] = useState(true);
  useFocusEffect(useCallback(() => {
    let active = true;
    setLoading(true); setError('');
    (async () => {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) throw error;
      if (!active) return;
      setSignedIn(!!session?.user.email);
      if (!session?.user.email) { setEvents({ upcoming: [], past: [] }); setTransactions([]); return; }
      if (kind === 'entries') {
        const home = await fetchHomeBundle(session.user.email, { strictSchedule: true });
        if (active) setEvents({ upcoming: home.upcomingSchedule.filter(e => e.isRegistered), past: home.pastSchedule.filter(e => e.isRegistered) });
      } else {
        const rows = await fetchProfileTransactions(session.user.email);
        if (active) setTransactions(rows);
      }
    })().catch(() => { if (active) setError(`Could not load your ${kind === 'entries' ? 'entries' : 'payments'}. Please try again.`); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [kind, attempt]));
  const entryTab = filter === 'past' ? 'past' : 'upcoming';
  const entries = events[entryTab];
  const payments = transactions.filter(row => filter === 'all' || row.kind === filter);
  const filters = kind === 'entries' ? [{ id: 'all', label: 'Upcoming' }, { id: 'past', label: 'Previous' }] : [{ id: 'all', label: 'All' }, { id: 'payment', label: 'Payments' }, { id: 'refund', label: 'Refunds' }];
  return <SettingsPage title={kind === 'entries' ? 'My entries' : 'Payments & refunds'}>
    <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 21, marginBottom: 20 }}>{kind === 'entries' ? 'Your tournament entries, partners and event details.' : 'Your recent payments and refunds, together in one place.'}</Text>
    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>{filters.map(item => <Pressable key={item.id} onPress={() => setFilter(item.id)} accessibilityRole="button" accessibilityState={{ selected: filter === item.id }} style={{ minHeight: 44, flex: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 13, backgroundColor: filter === item.id ? SETTINGS_BLUE : '#FFFFFF', borderWidth: 1, borderColor: filter === item.id ? SETTINGS_BLUE : brand.edge }}><Text style={{ fontSize: 13, fontWeight: '700', color: filter === item.id ? '#FFFFFF' : brand.muted }}>{item.label}</Text></Pressable>)}</View>
    {loading ? <ActivityIndicator color={SETTINGS_BLUE} style={{ marginVertical: 32 }} /> : error ? <View style={{ padding: 20, borderRadius: 18, backgroundColor: '#FFFFFF' }}><Text style={{ color: brand.danger, lineHeight: 21 }}>{error}</Text><Pressable onPress={() => setAttempt(v => v + 1)} accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '700' }}>Try again</Text></Pressable></View> : !signedIn ? <Pressable onPress={() => router.push('/(auth)/sign-in')} accessibilityRole="button" style={{ padding: 20 }}><Text style={{ color: SETTINGS_BLUE }}>Sign in to view your {kind}.</Text></Pressable> : <>
      {(kind === 'entries' ? entries.length : payments.length) === 0 ? <View style={{ padding: 28, backgroundColor: '#FFFFFF', borderRadius: 18, alignItems: 'center', gap: 12 }}><Ionicons name={kind === 'entries' ? 'tennisball-outline' : 'wallet-outline'} size={30} color={SETTINGS_BLUE} /><Text style={{ color: brand.premium, fontWeight: '700', fontSize: 16 }}>{kind === 'entries' ? `No ${entryTab === 'past' ? 'previous' : 'upcoming'} entries` : `No ${filter === 'refund' ? 'refunds' : filter === 'payment' ? 'payments' : 'transactions'} yet`}</Text><Text style={{ color: brand.muted, lineHeight: 20, textAlign: 'center', fontSize: 13 }}>{kind === 'entries' ? 'Tournament entries you make will appear here.' : 'Your recorded payments and refunds will appear here.'}</Text></View> : kind === 'entries' ? <View style={{ gap: 12 }}>{entries.map(event => <View key={event.id} style={{ backgroundColor: '#FFFFFF', borderRadius: 18, borderWidth: 1, borderColor: brand.edge, overflow: 'hidden' }}><EventRow event={event} onPress={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })} onCta={() => router.push({ pathname: '/events/[id]', params: { id: String(event.id) } })} /></View>)}</View> : <View style={{ gap: 12 }}>{payments.map(payment => <View key={`${payment.kind}-${payment.id}-${payment.sortDate}-${payment.amount}`} style={{ backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: brand.edge, borderRadius: 18, padding: 18 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}><View style={{ flex: 1 }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '700', fontSize: 11, marginBottom: 8 }}>{payment.kind === 'refund' ? 'REFUND' : 'PAYMENT'}</Text><Text style={{ color: brand.premium, fontWeight: '700', fontSize: 15, lineHeight: 21 }}>{payment.event_name || payment.payment_type?.replace(/_/g, ' ') || 'SAPA licence'}</Text></View><Text style={{ color: brand.premium, fontSize: 17, fontWeight: '800' }}>{payment.amount}</Text></View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 10, marginTop: 12 }}>
          <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 19 }}>{payment.date}</Text>
          <TransactionStatus payment={payment} />
        </View>
        {payment.reason && <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20, marginTop: 8 }}>{payment.reason}</Text>}
        {!!payment.refundedTotal && <Text style={{ color: brand.muted, fontSize: 12, marginTop: 8 }}>Refunded: {payment.refundedTotal.toLocaleString('en-ZA', { style: 'currency', currency: 'ZAR' })}</Text>}
        <Text selectable style={{ color: brand.faint, fontSize: 11, lineHeight: 17, marginTop: 12 }}>Reference: {payment.id}{payment.relatedReference ? `\nRelated payment: ${payment.relatedReference}` : ''}</Text>
      </View>)}</View>}
      <Pressable accessibilityRole="button" onPress={() => setAttempt(v => v + 1)} style={{ minHeight: 44, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '600' }}>Refresh</Text></Pressable>
    </>}
    <Pressable accessibilityRole="button" onPress={() => router.push(kind === 'entries' ? '/help?topic=entry' : '/help?topic=payment')} style={{ minHeight: 48, alignItems: 'center', justifyContent: 'center', marginTop: 16 }}><Text style={{ color: SETTINGS_BLUE, fontWeight: '600' }}>Need help with {kind === 'entries' ? 'an entry' : 'a payment'}?</Text></Pressable>
  </SettingsPage>;
}

function TransactionStatus({ payment }: { payment: ProfileTransaction }) {
  const status = paymentStatus(payment.status, payment.kind, payment.refundedTotal);
  return <View style={{ backgroundColor: status.background, borderRadius: 7, paddingHorizontal: 9, paddingVertical: 5 }}>
    <Text style={{ color: status.color, fontSize: 11, lineHeight: 15, fontWeight: '700' }}>{status.label.replace(/^Refund · /, '')}</Text>
  </View>;
}
