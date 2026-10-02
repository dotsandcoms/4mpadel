import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Accordion, EventIcon, EventText as Text, useEventAccent } from './website-ui';
import { PlayerAvatar } from './event-teams';
import type { Division, EventDetail, EventRegistration } from '@/lib/events';
import type { RankedPlayer } from '@/lib/event-teams';
import { formatMoney, registrationState } from '@/lib/event-rules';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { lightBrand as brand } from '@/theme/tokens';
export function RegistrationEntries({ event, divisions, registrations, profiles, onManage, onRefresh, manageRequested, onManageOpened }: { manageRequested?: boolean; onManageOpened?: () => void; event: EventDetail; divisions: Division[]; registrations: EventRegistration[]; profiles: RankedPlayer[]; onManage: (mode?: 'pay') => void; onRefresh: () => Promise<void> }) {
  const router = useRouter();
  const [managing, setManaging] = useState(false);
  useEffect(() => { if (manageRequested) { setManaging(true); onManageOpened?.(); } }, [manageRequested, onManageOpened]);
  const accent = useEventAccent();
  const insets = useSafeAreaInsets();
  const [action, setAction] = useState<{ kind: 'withdraw' | 'switch_division' | 'remove_partner'; entry: EventRegistration } | null>(null);
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const paid = (r: EventRegistration) => (r.payment_status === 'paid' && !(Number(r.balance?.due) > 0)) || Number(divisions.find(d => d.id === r.division_id)?.entry_fee) === 0;
  const statusLabel = (r: EventRegistration) => Number(r.balance?.due) > 0 ? `${formatMoney(r.balance!.due!)} outstanding` : r.payment_status === 'paid' && !r.balance?.known ? 'Payment recorded · balance unverified' : paid(r) ? 'Paid & Confirmed' : 'Payment Pending';
  const payBalance = (r: EventRegistration) => { setManaging(false); router.push({ pathname: '/events/pay-balance', params: { registrationId: r.id } }); };
  const pending = registrations.some(r => !paid(r));
  const available = divisions.filter(d => d.id !== action?.entry.division_id && !registrations.some(r => r.division_id === d.id) && registrationState(event, d) === 'open');
  const targetDivision = available.find(d => d.id === target);
  const topUp = action?.kind === 'switch_division' && paid(action.entry) && targetDivision && Number(targetDivision.entry_fee || 0) > Number(divisions.find(d => d.id === action.entry.division_id)?.entry_fee || 0);
  const image = (name: string) => profiles.find(p => p.name.toLowerCase().trim() === name.toLowerCase().trim())?.image_url || null;
  const begin = (kind: 'withdraw' | 'switch_division' | 'remove_partner', entry: EventRegistration) => { if (kind === 'switch_division' && Number(entry.balance?.due) > 0) { payBalance(entry); return; } setError(''); setTarget(''); setAction({ kind, entry }); };
  const confirm = async () => {
    if (!action || busy) return;
    setBusy(true); setError('');
    try {
      if (topUp) { const registrationId = action.entry.id; setAction(null); setManaging(false); router.push({ pathname: '/events/switch-division', params: { registrationId, targetDivisionId: target } }); return; }
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
        <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
          <View style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center' }}><PlayerAvatar player={{ name: r.full_name, image: image(r.full_name) }} size={36} /><View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: '#94a3b8' }}>PLAYER</Text><Text style={{ color: '#0f172a', fontSize: 14, marginTop: 2 }} numberOfLines={2}>{r.full_name}</Text></View></View>
          <Pressable accessibilityRole="button" accessibilityLabel={r.partner_email ? `Manage partner ${r.partner_name || ''}` : 'Add partner to entry'} accessibilityState={{ disabled: registrationState(event, divisions.find(d => d.id === r.division_id)) !== 'open' || r.registered_by?.toLowerCase() !== r.email.toLowerCase() }} disabled={registrationState(event, divisions.find(d => d.id === r.division_id)) !== 'open' || r.registered_by?.toLowerCase() !== r.email.toLowerCase()} onPress={() => r.partner_email ? setManaging(true) : router.push({ pathname: '/events/register', params: { id: String(event.id), mode: 'add-partner', entry: r.id } })} style={{ flex: 1, flexDirection: 'row', gap: 10, alignItems: 'center', minHeight: 48 }}>
            {r.partner_email ? <PlayerAvatar player={{ name: r.partner_name || 'Partner', image: image(r.partner_name || '') }} size={36} /> : <View style={{ width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderStyle: 'dashed', borderColor: accent, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}><EventIcon name="plus" color={accent} size={20} /></View>}
            <View style={{ flex: 1 }}><Text style={{ fontSize: 10, color: '#94a3b8' }}>PARTNER</Text><Text style={{ color: r.partner_email ? '#0f172a' : accent, fontSize: 14, marginTop: 2 }} numberOfLines={2}>{r.partner_name || 'Add partner'}</Text></View>
          </Pressable>
        </View>
        <Text style={{ alignSelf: 'flex-start', fontSize: 10, color: paid(r) ? '#047857' : '#b45309', backgroundColor: paid(r) ? '#ecfdf5' : '#fffbeb', borderColor: paid(r) ? '#a7f3d0' : '#fde68a', borderWidth: 1, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginTop: 12 }}>{statusLabel(r)}</Text>
        {r.payment_status === 'paid' && Number(r.balance?.due) > 0 && <Pressable accessibilityRole="button" accessibilityLabel={`Pay balance, ${formatMoney(r.balance!.due!)}`} onPress={() => payBalance(r)} style={{ minHeight: 44, marginTop: 12, paddingHorizontal: 16, borderRadius: 12, backgroundColor: accent, justifyContent: 'center', alignItems: 'center' }}><Text style={{ color: '#16251F', fontSize: 14, fontWeight: '700' }}>{`Pay balance · ${formatMoney(r.balance!.due!)}`}</Text></Pressable>}
        {registrationState(event, divisions.find(d => d.id === r.division_id)) === 'open' && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 }}><Outline label="⇄  Switch division" color="#7c3aed" onPress={() => begin('switch_division', r)} /><Outline label="Withdraw" color="#ef4444" onPress={() => begin('withdraw', r)} /></View>}
        {registrationState(event, divisions.find(d => d.id === r.division_id)) !== 'open' && <Text style={{ color: '#64748b', fontSize: 12, lineHeight: 18, marginTop: 10 }}>Self-service withdrawal closed with registration. Contact the organiser for entry changes.</Text>}
      </View>)}
      {registrationState(event) === 'open' && <Pressable accessibilityRole="button" onPress={() => registrations.some(r => Number(r.balance?.due) > 0 && r.payment_status === 'paid') ? setManaging(true) : onManage(pending ? 'pay' : undefined)} style={{ padding: 14, borderRadius: 12, backgroundColor: pending ? '#fb923c' : accent, alignItems: 'center' }}><Text style={{ color: '#0a0a0a', fontSize: 14, fontWeight: '400' }}>{pending ? 'Pay Entry' : 'Add Division'}</Text></Pressable>}
      {pending && registrationState(event) === 'open' && <Outline label="Register another division" color="#9a3412" onPress={() => onManage()} />}
    </Accordion>
    <Modal visible={managing || !!action} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => { if (!busy) { setAction(null); setManaging(false); } }}>
      <View style={{ flex: 1, backgroundColor: brand.page }}>
        {!action ? <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom + 36, gap: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginBottom: 8 }}>
            <View style={{ flex: 1, gap: 5 }}>
              <Text style={{ color: brand.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 }}>YOUR ENTRY</Text>
              <Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 28, fontWeight: '800', letterSpacing: -0.7 }}>Manage entry</Text>
              <Text style={{ color: brand.muted, fontSize: 14 }} numberOfLines={2}>{event.event_name}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Close manage entry" onPress={() => setManaging(false)} style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, alignItems: 'center', justifyContent: 'center' }}><Ionicons name="close" size={22} color={brand.premium} /></Pressable>
          </View>
          {registrations.map((r, index) => {
            const editable = registrationState(event, divisions.find(d => d.id === r.division_id)) === 'open';
            const ownsBooking = r.registered_by?.toLowerCase() === r.email.toLowerCase();
            const balanceDue = Number(r.balance?.due || 0);
            return <View key={r.id} style={{ backgroundColor: brand.elevated, borderWidth: 1, borderColor: brand.edge, borderRadius: 22, overflow: 'hidden' }}>
              <View style={{ height: 4, backgroundColor: paid(r) ? brand.accent : accent }} />
              <View style={{ padding: 18, gap: 18 }}>
                <View style={{ gap: 6 }}>
                  <Text style={{ color: brand.faint, fontSize: 10, fontWeight: '800', letterSpacing: 1.4 }}>DIVISION {String(index + 1).padStart(2, '0')}</Text>
                  <Text style={{ color: brand.premium, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 }}>{r.division}</Text>
                </View>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}><PlayerAvatar player={{ name: r.full_name, image: image(r.full_name) }} size={44} /><Text style={{ color: brand.faint, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>PLAYER</Text><Text style={{ color: brand.premium, fontSize: 13, fontWeight: '700', textAlign: 'center' }} numberOfLines={2}>{r.full_name}</Text></View>
                  <View style={{ alignSelf: 'center', width: 18, height: 1, backgroundColor: brand.edge }} />
                  <View style={{ flex: 1, minWidth: 0, alignItems: 'center', gap: 6 }}>
                    {r.partner_email ? <PlayerAvatar player={{ name: r.partner_name || 'Partner', image: image(r.partner_name || '') }} size={44} /> : <View style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderStyle: 'dashed', borderColor: brand.faint, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.page }}><EventIcon name="plus" size={18} color={brand.faint} /></View>}
                    <Text style={{ color: brand.faint, fontSize: 10, fontWeight: '700', letterSpacing: 0.8 }}>PARTNER</Text>
                    <Text style={{ color: r.partner_name ? brand.premium : brand.muted, fontSize: 13, fontWeight: r.partner_name ? '700' : '400', textAlign: 'center' }} numberOfLines={2}>{r.partner_name || 'No partner yet'}</Text>
                  </View>
                </View>
                <View style={{ borderRadius: 15, backgroundColor: paid(r) ? '#EEF4E9' : '#FFF4E5', padding: 14, gap: 6 }}>
                  <Text style={{ color: paid(r) ? brand.accent : '#9A4B0A', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 }}>{paid(r) ? 'ENTRY CONFIRMED' : 'PAYMENT OUTSTANDING'}</Text>
                  <Text style={{ color: brand.premium, fontSize: 20, fontWeight: '800' }}>{statusLabel(r)}</Text>
                  {r.balance?.known && <Text style={{ color: brand.muted, fontSize: 12 }}>{formatMoney(r.balance.paid || 0)} paid · Entry price {formatMoney(r.balance.price)}</Text>}
                </View>
                {!!r.tshirt_size && <Text style={{ color: brand.muted, fontSize: 12 }}>T-shirt size · {r.tshirt_size}</Text>}
                {r.payment_status === 'paid' && balanceDue > 0 && <ManageActionRow label={`Pay balance · ${formatMoney(balanceDue)}`} icon="card-outline" tone="primary" onPress={() => payBalance(r)} />}
                {!editable ? <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20 }}>Registration is closed. Contact the organiser for entry changes.</Text> : <View style={{ borderTopWidth: 1, borderTopColor: brand.edge, paddingTop: 8 }}>
                  {r.partner_email ? ownsBooking ? <ManageActionRow label="Remove partner" icon="person-remove-outline" tone="danger" onPress={() => begin('remove_partner', r)} /> : <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20, paddingVertical: 12 }}>The booking owner manages partner changes.</Text> : <ManageActionRow label="Add partner" icon="person-add-outline" tone="primary" onPress={() => { setManaging(false); router.push({ pathname: '/events/register', params: { id: String(event.id), mode: 'add-partner', entry: r.id } }); }} />}
                  <ManageActionRow label="Switch division" icon="swap-horizontal" onPress={() => begin('switch_division', r)} />
                  <ManageActionRow label="Withdraw entry" icon="trash-outline" tone="danger" onPress={() => begin('withdraw', r)} />
                </View>}
              </View>
            </View>;
          })}
        </ScrollView> : <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: Math.max(insets.top, 20), paddingBottom: insets.bottom + 36, gap: 18 }}>
          <Pressable accessibilityRole="button" accessibilityLabel="Back to manage entry" disabled={busy} onPress={() => setAction(null)} style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8 }}><EventIcon name="arrow.left" color={brand.premium} size={17} /><Text style={{ color: brand.premium, fontSize: 14, fontWeight: '700' }}>Manage entry</Text></Pressable>
          <View style={{ gap: 6 }}><Text style={{ color: brand.accent, fontSize: 11, fontWeight: '800', letterSpacing: 1.8 }}>ENTRY CHANGE</Text><Text accessibilityRole="header" style={{ color: brand.premium, fontSize: 28, fontWeight: '800' }}>{action.kind === 'remove_partner' ? 'Remove partner' : action.kind === 'withdraw' ? 'Withdraw entry' : 'Switch division'}</Text><Text style={{ color: brand.muted, fontSize: 14 }}>{action.entry.division} · {action.entry.full_name}</Text></View>
          <View style={{ borderRadius: 20, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, padding: 18, gap: 14 }}>
            {action.kind === 'switch_division' ? available.length ? available.map(d => <Pressable key={d.id} accessibilityRole="radio" accessibilityState={{ checked: target === d.id }} onPress={() => setTarget(d.id)} style={{ minHeight: 56, borderWidth: 1, borderColor: target === d.id ? accent : brand.edge, backgroundColor: target === d.id ? `${accent}20` : brand.elevated, padding: 15, borderRadius: 13, flexDirection: 'row', alignItems: 'center', gap: 10 }}><View style={{ width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: target === d.id ? brand.accent : brand.faint, backgroundColor: target === d.id ? brand.accent : 'transparent' }} /><Text style={{ color: brand.premium, fontSize: 15, fontWeight: '700', flex: 1 }}>{d.name}</Text></Pressable>) : <Text style={{ color: brand.muted }}>No other divisions are available for your entry.</Text> : <Text style={{ color: brand.muted, fontSize: 14, lineHeight: 22 }}>{action.kind === 'remove_partner' ? `${action.entry.partner_name || 'Your partner'}’s entry will be withdrawn. Any applicable refund goes to the original payer. Your own entry stays active. To change partners, remove the current partner first, then add another.` : 'Confirm that you want to withdraw this entry. Any applicable refund is processed by the event’s payment service.'}</Text>}
            {topUp && <Text style={{ color: brand.muted, fontSize: 13, lineHeight: 20 }}>Review and pay the entry-fee difference in the app. Your entry moves only after payment is verified. Your partner stays in the original division.</Text>}
          </View>
          {!!error && <Text accessibilityRole="alert" style={{ color: brand.danger, fontSize: 13, lineHeight: 20 }}>{error}</Text>}
          <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy || (action.kind === 'switch_division' && !target) }} disabled={busy || (action.kind === 'switch_division' && !target)} onPress={() => void confirm()} style={{ minHeight: 54, borderRadius: 15, backgroundColor: action.kind === 'withdraw' || action.kind === 'remove_partner' ? brand.danger : accent, alignItems: 'center', justifyContent: 'center', opacity: busy || (action.kind === 'switch_division' && !target) ? 0.5 : 1 }}>{busy ? <ActivityIndicator color={brand.elevated} /> : <Text style={{ color: action.kind === 'withdraw' || action.kind === 'remove_partner' ? brand.elevated : brand.premium, fontSize: 15, fontWeight: '800' }}>{topUp ? 'Review additional payment' : action.kind === 'remove_partner' ? 'Confirm partner removal' : action.kind === 'withdraw' ? 'Confirm withdrawal' : 'Confirm switch'}</Text>}</Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => setAction(null)} style={{ minHeight: 50, borderRadius: 15, borderWidth: 1, borderColor: brand.edge, backgroundColor: brand.elevated, alignItems: 'center', justifyContent: 'center' }}><Text style={{ color: brand.premium, fontSize: 14, fontWeight: '700' }}>Cancel</Text></Pressable>
        </ScrollView>}
      </View>
    </Modal>
  </>;
}
function Outline({ label, color, onPress }: { label: string; color: string; onPress: () => void }) { return <Pressable accessibilityRole="button" onPress={onPress} style={{ minHeight: 48, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: `${color}40`, backgroundColor: '#fff', justifyContent: 'center' }}><Text style={{ color, fontSize: 12 }}>{label}</Text></Pressable>; }
function ManageActionRow({ label, icon, tone = 'neutral', onPress }: { label: string; icon: 'card-outline' | 'person-add-outline' | 'person-remove-outline' | 'swap-horizontal' | 'trash-outline'; tone?: 'primary' | 'neutral' | 'danger'; onPress: () => void }) {
  const color = tone === 'danger' ? brand.danger : brand.premium;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} style={{ minHeight: 58, flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 13, paddingHorizontal: 10, backgroundColor: tone === 'primary' ? brand.padel : 'transparent' }}>
    <View style={{ width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: tone === 'primary' ? '#16251F15' : tone === 'danger' ? '#B7352D12' : brand.surface }}><Ionicons name={icon} size={18} color={tone === 'danger' ? brand.danger : brand.accent} /></View>
    <Text style={{ color, fontSize: 14, fontWeight: '700', flex: 1 }}>{label}</Text>
    <EventIcon name="chevron.right" size={15} color={tone === 'danger' ? brand.danger : brand.faint} />
  </Pressable>;
}
