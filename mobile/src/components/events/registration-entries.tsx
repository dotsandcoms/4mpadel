import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Accordion, EventIcon, EventText as Text, useEventAccent } from './website-ui';
import { PlayerAvatar } from './event-teams';
import type { Division, EventDetail, EventRegistration } from '@/lib/events';
import type { RankedPlayer } from '@/lib/event-teams';
import { entryFee, registrationState } from '@/lib/event-rules';
import { supabase } from '@/lib/supabase';
import { openSitePath } from '@/lib/site';
export function RegistrationEntries({ event, divisions, registrations, profiles, onManage, onRefresh }: { event: EventDetail; divisions: Division[]; registrations: EventRegistration[]; profiles: RankedPlayer[]; onManage: (mode?: 'pay') => void; onRefresh: () => Promise<void> }) {
  const accent = useEventAccent();
  const insets = useSafeAreaInsets();
  const [action, setAction] = useState<{ kind: 'withdraw' | 'switch_division'; entry: EventRegistration } | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paid = (r: EventRegistration) => r.payment_status === 'paid' || Number(divisions.find(d => d.id === r.division_id)?.entry_fee) === 0;
  const pending = registrations.some(r => !paid(r));
  const available = divisions.filter(d => d.id !== action?.entry.division_id && !registrations.some(r => r.division_id === d.id) && registrationState(event, d) === 'open');
  const targetDivision = available.find(d => d.id === target);
  const topUp = action?.kind === 'switch_division' && paid(action.entry) && targetDivision && entryFee(event, targetDivision) > entryFee(event, divisions.find(d => d.id === action.entry.division_id));
  const image = (name: string) => profiles.find(p => p.name.toLowerCase().trim() === name.toLowerCase().trim())?.image_url || null;
  const begin = (kind: 'withdraw' | 'switch_division', entry: EventRegistration) => { setError(''); setTarget(''); setAction({ kind, entry }); };
  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true); setError('');
    try {
      if (topUp) { await openSitePath(`/calendar/${event.slug || event.id}`, { forceBrowser: true }); return; }
      const { data, error: failure } = await supabase.functions.invoke('paystack-refund', { body: { action: action.kind, registration_id: action.entry.id, ...(action.kind === 'switch_division' ? { target_division_id: target, move_team: false } : {}) } });
      if (failure) {
        let payload; try { payload = await failure.context?.json(); } catch { /* use function error */ }
        throw new Error(payload?.error || payload?.message || failure.message);
      }
      if (data?.error) throw new Error(data.message || data.error);
      setAction(null); await onRefresh();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update your entry. Please try again.'); }
    finally { setBusy(false); }
  };
  return <>
    <Accordion highlighted pending={pending} singleLineTitle icon="trophy" title={`You are Registered for this Event${registrations.length > 1 ? ` (${registrations.length} divisions)` : ''}`}>
      {pending && <View style={{ borderRadius: 12, padding: 12, backgroundColor: '#fffbebcc', borderWidth: 1, borderColor: '#fef3c7', flexDirection: 'row', alignItems: 'center', gap: 10 }}><EventIcon name="exclamationmark.circle" color="#d97706" size={16} /><Text style={{ color: '#78350f', fontSize: 12, lineHeight: 18, flex: 1 }}>{registrations.some(paid) ? 'You have an outstanding payment to complete your registration.' : 'Complete your payment to secure your spot.'}</Text></View>}
      <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Your entries</Text>
      {registrations.map(r => <View key={r.id} style={{ borderRadius: 12, borderColor: '#e2e8f0', borderWidth: 1, backgroundColor: pending ? '#ffedd5' : '#f8fafc80', padding: 14 }}>
        <Text style={{ color: '#94a3b8', fontSize: 10 }}>DIVISION</Text><Text style={{ color: '#0f172a', fontSize: 14, fontWeight: '400', marginTop: 4 }}>{r.division}</Text>
        <View style={{ height: 1, backgroundColor: '#e2e8f0', marginVertical: 12 }} />
        <View style={{ flexDirection: 'row', gap: 10 }}>{[{ name: r.full_name, role: 'PLAYER' }, ...(r.partner_name ? [{ name: r.partner_name, role: 'PARTNER' }] : [])].map(person => <View key={person.role} style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }}><PlayerAvatar player={{ name: person.name, image: image(person.name) }} size={36} /><View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: '#94a3b8' }}>{person.role}</Text><Text style={{ color: '#0f172a', fontSize: 14, marginTop: 2 }}>{person.name}</Text></View></View>)}</View>
        <Text style={{ alignSelf: 'flex-start', fontSize: 10, color: paid(r) ? '#047857' : '#b45309', backgroundColor: paid(r) ? '#ecfdf5' : '#fffbeb', borderColor: paid(r) ? '#a7f3d0' : '#fde68a', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: 12 }}>{paid(r) ? 'Paid & Confirmed' : 'Payment Pending'}</Text>
        {registrationState(event, divisions.find(d => d.id === r.division_id)) === 'open' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}><Outline label="⇄  Switch division" color="#7c3aed" onPress={() => begin('switch_division', r)} /><Outline label="Withdraw" color="#ef4444" onPress={() => begin('withdraw', r)} /></View>}
      </View>)}
      {registrationState(event) === 'open' && <Pressable accessibilityRole="button" onPress={() => onManage(pending ? 'pay' : undefined)} style={{ padding: 14, borderRadius: 12, backgroundColor: pending ? '#fb923c' : accent, alignItems: 'center' }}><Text style={{ color: '#0a0a0a', fontSize: 14, fontWeight: '400' }}>{pending ? 'Pay Entry' : 'Add Division'}</Text></Pressable>}
      {pending && registrationState(event) === 'open' && <Outline label="Register another division" color="#9a3412" onPress={() => onManage()} />}
      <Outline label="Manage partners / entry details" color="#64748b" onPress={() => void openSitePath(`/calendar/${event.slug || event.id}`, { forceBrowser: true })} />
    </Accordion>
    <Modal visible={!!action} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => !busy && setAction(null)}><ScrollView contentContainerStyle={{ padding: 24, paddingTop: insets.top + 20, gap: 18 }}>
      <Text style={{ color: '#0f172a', fontSize: 22, fontWeight: '400' }}>{action?.kind === 'withdraw' ? 'Withdraw entry' : 'Switch division'}</Text>
      <Text style={{ color: '#475569', fontSize: 14 }}>{action?.entry.division} · {action?.entry.full_name}</Text>
      {action?.kind === 'switch_division' ? available.length ? available.map(d => <Pressable key={d.id} accessibilityRole="radio" accessibilityState={{ checked: target === d.id }} onPress={() => setTarget(d.id)} style={{ borderWidth: 1, borderColor: target === d.id ? accent : '#e2e8f0', padding: 16, borderRadius: 12 }}><Text style={{ color: '#0f172a', fontSize: 16 }}>{d.name}</Text></Pressable>) : <Text style={{ color: '#64748b' }}>No other divisions are available for your entry.</Text> : <Text style={{ color: '#475569', fontSize: 14, lineHeight: 22 }}>Confirm that you want to withdraw this entry. Any applicable refund is processed by the event’s payment service.</Text>}
      {topUp && <Text style={{ color: '#475569' }}>This division requires an additional payment. Continue on the website to complete payment and switch your entry.</Text>}
      {!!error && <Text accessibilityRole="alert" style={{ color: '#b91c1c' }}>{error}</Text>}
      <Pressable accessibilityRole="button" disabled={busy || (action?.kind === 'switch_division' && !target)} onPress={() => void confirm()} style={{ padding: 16, borderRadius: 12, backgroundColor: accent, alignItems: 'center', opacity: busy || (action?.kind === 'switch_division' && !target) ? 0.5 : 1 }}>{busy ? <ActivityIndicator color="#000" /> : <Text style={{ color: '#000', fontWeight: '400' }}>{topUp ? 'Continue on website' : action?.kind === 'withdraw' ? 'Confirm withdrawal' : 'Confirm switch'}</Text>}</Pressable>
      <Outline label="Cancel" color="#64748b" onPress={() => !busy && setAction(null)} />
    </ScrollView></Modal>
  </>;
}
function Outline({ label, color, onPress }: { label: string; color: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 32, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${color}40`, backgroundColor: '#fff', justifyContent: 'center' }}><Text style={{ color, fontSize: 12 }}>{label}</Text></Pressable>; }
