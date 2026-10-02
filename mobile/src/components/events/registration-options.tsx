import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { Image } from 'expo-image';
import { supabase } from '@/lib/supabase';
import { lightBrand as brand } from '@/theme/tokens';
import { Chip } from './event-ui';
import { type Division, type EventDetail } from '@/lib/events';
import { entryFee, formatMoney, registrationState } from '@/lib/event-rules';

export type PartnerChoice = {
  partnerEmail?: string; partnerName?: string; partnerId?: string;
  image_url?: string; level?: string; payForPartner?: boolean; activeLicence?: boolean;
  licenseChoice?: 'temporary' | 'full'; tshirtSize?: string; tshirtLogoUrl?: string; tshirtSponsorName?: string;
};
export type LicenceOption = { type: 'temporary' | 'full'; amount: number };
export function Choices({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: { value: string; label: string }[] }) {
  return <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{options.map(o => <Chip key={o.value} label={o.label} selected={value === o.value} onPress={() => onChange(o.value)} />)}</View>;
}
export function LicencePicker({ value, onChange, options, name }: { value?: string; onChange: (value: 'temporary' | 'full') => void; options: LicenceOption[]; name: string }) {
  return <View style={{ padding: 14, borderRadius: 12, backgroundColor: '#EDF1F7', borderWidth: 1, borderColor: '#CED8E5', gap: 12 }}>
    <Text style={{ color: '#31465F', lineHeight: 21 }}>{name} {name === 'You' ? 'need' : 'needs'} an active SAPA licence for this division.</Text>
    {options.length ? <Choices value={value || ''} onChange={v => onChange(v as 'temporary' | 'full')} options={options.map(o => ({ value: o.type, label: `${o.type === 'full' ? 'Annual' : 'Temporary'} · ${formatMoney(o.amount)}` }))} /> : <Text style={{ color: brand.muted }}>Licence sales are closed.</Text>}
  </View>;
}
export function DivisionOptions({ event, divisions, selected, registered, values, onToggle, onChange, profileId, currentUserEmail, licences, busy, lockEntry = false, paidPartnerDivisionIds = [] }: {
  event: EventDetail; divisions: Division[]; selected: string[]; registered: string[];
  values: Record<string, PartnerChoice>; onToggle: (id: string) => void; onChange: (id: string, value: PartnerChoice) => void;
  profileId?: string; currentUserEmail?: string; licences: LicenceOption[]; busy: boolean; lockEntry?: boolean; paidPartnerDivisionIds?: string[];
}) {
  return <View style={{ gap: 12 }}>
    <Text style={{ color: brand.premium, fontSize: 23, fontWeight: '600' }}>{lockEntry ? 'Your division(s)' : 'Choose your division(s)'}</Text>
    <Text style={{ color: brand.muted, lineHeight: 22 }}>{lockEntry ? 'Your division and partner stay unchanged. Choose whether to pay your partner’s outstanding fee as well as your own.' : 'Select one or more divisions. Adding a partner is optional — leave it blank to enter on your own.'}</Text>
    {divisions.map(d => <DivisionOption key={d.id} event={event} division={d} selected={selected.includes(d.id)} registered={registered.includes(d.id)} value={values[d.id] || {}} onToggle={() => onToggle(d.id)} onChange={value => onChange(d.id, value)} profileId={profileId} currentUserEmail={currentUserEmail} licences={licences} busy={busy} lockEntry={lockEntry} partnerAlreadyPaid={paidPartnerDivisionIds.includes(d.id)} />)}
  </View>;
}
function DivisionOption({ event, division: d, selected, registered, value, onToggle, onChange, profileId, currentUserEmail, licences, busy, lockEntry, partnerAlreadyPaid }: {
  event: EventDetail; division: Division; selected: boolean; registered: boolean; value: PartnerChoice;
  onToggle: () => void; onChange: (value: PartnerChoice) => void; profileId?: string; currentUserEmail?: string; licences: LicenceOption[]; busy: boolean; lockEntry: boolean; partnerAlreadyPaid: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const closed = registrationState(event, d) !== 'open';
  return <View style={{ borderWidth: 1, borderColor: selected ? brand.padel : brand.edge, backgroundColor: brand.elevated, borderRadius: 16, padding: 16, gap: 14 }}>
    <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
      <Pressable accessibilityRole="checkbox" accessibilityLabel={`Select ${d.name}`} accessibilityState={{ checked: selected, disabled: busy || closed || registered || lockEntry }} disabled={busy || closed || registered || lockEntry} onPress={onToggle} style={{ minHeight: 44, minWidth: 32, justifyContent: 'center' }}><Text style={{ fontSize: 22, color: selected ? brand.accent : brand.muted }}>{selected ? '☑' : '☐'}</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: selected && expanded }} onPress={() => selected ? setExpanded(v => !v) : !registered && !closed && !busy && onToggle()} style={{ flex: 1, gap: 5 }}>
        <Text style={{ color: brand.premium, fontSize: 17, fontWeight: '600' }}>{d.name}</Text>
        <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>{d.format ? `${d.format} · ` : ''}{formatMoney(entryFee(event, d))} per player</Text>
        {registered && <Text style={{ color: brand.accent, fontSize: 12 }}>Already entered</Text>}
        {closed && !registered && <Text style={{ color: brand.danger, fontSize: 12 }}>Registration closed</Text>}
      </Pressable>
      {selected && <Pressable accessibilityRole="button" accessibilityLabel={expanded ? 'Collapse division' : 'Expand division'} onPress={() => setExpanded(v => !v)} style={{ padding: 10 }}><Text style={{ color: brand.accent }}>{expanded ? '⌃' : '⌄'}</Text></Pressable>}
    </View>
    {selected && expanded && <>
      {!!d.details && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>{d.details.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ')}</Text>}
      {!value.partnerName && <Text style={{ color: brand.muted, fontSize: 13 }}>{lockEntry ? 'You entered this division on your own.' : 'Entering solo — only your entry will be registered for this division.'}</Text>}
      {lockEntry ? value.partnerName ? <Text style={{ color: brand.premium, fontSize: 14 }}>Partner: {value.partnerName}</Text> : null : <PartnerSearch value={value} onChange={onChange} eventId={event.id} divisionId={d.id} divisionName={d.name} currentUserEmail={currentUserEmail} profileId={profileId} busy={busy} />}
      {!!value.partnerName && <>
        {!lockEntry && <><Text style={{ color: brand.muted, fontSize: 12 }}>Partner’s Playtomic level</Text>
        <TextInput accessibilityLabel={`${d.name} partner Playtomic level`} keyboardType="decimal-pad" value={value.level || ''} onChangeText={level => onChange({ ...value, level })} placeholder="—" placeholderTextColor={brand.faint} style={{ color: brand.premium, borderWidth: 1, borderColor: brand.edge, padding: 12, borderRadius: 10 }} /></>}
        {partnerAlreadyPaid ? <Text style={{ color: brand.accent, fontSize: 12 }}>Your partner has already paid.</Text> : <Choices value={value.payForPartner === false ? 'partner' : 'self'} onChange={v => onChange({ ...value, payForPartner: v === 'self' })} options={lockEntry ? [{ value: 'self', label: 'I pay for both' }, { value: 'partner', label: 'Partner pays for themselves' }] : [{ value: 'self', label: 'I pay' }, { value: 'partner', label: 'Partner pays' }]} />}
        {!partnerAlreadyPaid && value.payForPartner === false && <Text style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>Your partner will need to complete their own payment.</Text>}
        {d.license_required && value.payForPartner !== false && !value.activeLicence && <LicencePicker name={value.partnerName} value={value.licenseChoice} onChange={licenseChoice => onChange({ ...value, licenseChoice })} options={licences} />}
        {d.license_required && value.activeLicence && <Text style={{ color: brand.accent, fontSize: 12 }}>✓ Partner has an active SAPA licence</Text>}
      </>}
    </>}
  </View>;
}
const normEmail = (value?: string) => (value || '').trim().toLowerCase();

const resolveRegPartnerName = (divRegs: any[], partnerEmail?: string, fallbackName?: string) => {
    if (fallbackName?.trim()) return fallbackName.trim();
    const em = normEmail(partnerEmail);
    if (!em) return 'another player';
    const match = divRegs.find((r) => normEmail(r.email) === em);
    return match?.full_name || 'another player';
};

/** Whether a player can be selected as partner for a division (solo entries can be linked). */
const getPartnerAvailability = (regs: any[], divisionId: string, player: any, divisionName?: string, currentUserEmail?: string) => {
    const email = normEmail(player?.email);
    const name = player?.name || player?.full_name || 'This player';
    const divLabel = divisionName || 'this division';
    if (!email || !divisionId) return { ok: true };

    const divRegs = (regs || []).filter(
        (r) => r.division_id === divisionId && r.status !== 'withdrawn',
    );

    const primary = divRegs.find((r) => normEmail(r.email) === email);
    if (primary) {
        const registeredBy = normEmail(primary.registered_by);
        if (registeredBy && registeredBy !== email) {
            const inviter = divRegs.find((r) => normEmail(r.email) === registeredBy);
            // `registered_by` only records who *created* this entry — it persists
            // after a division switch or withdrawal that cleared the actual pairing.
            // Only treat this as taken when the inviter STILL lists this player as
            // their partner; otherwise it's a stale link and the player is free.
            const inviterStillPartners = inviter && normEmail(inviter.partner_email) === email;
            if (inviterStillPartners) {
                return {
                    ok: false,
                    message: `${name} is already partnered with ${inviter?.full_name || 'another player'} for ${divLabel}`,
                };
            }
        }
        if (primary.partner_name?.trim() || primary.partner_email?.trim()) {
            const partnerEm = normEmail(primary.partner_email);
            // Only treat this as "still available" when the searching user IS the
            // confirmed mutual partner re-selecting themselves — not any third
            // party, who must never be allowed to join an already-complete pair.
            const mutualLink = partnerEm
                && partnerEm === normEmail(currentUserEmail)
                && divRegs.some(
                    (r) => normEmail(r.email) === partnerEm && normEmail(r.partner_email) === email,
                );
            if (mutualLink) {
                return { ok: true };
            }
            return {
                ok: false,
                message: `${name} is already partnered with ${resolveRegPartnerName(divRegs, primary.partner_email, primary.partner_name)} for ${divLabel}`,
            };
        }
        return { ok: true, linkSoloRegId: primary.id, isSoloLink: true };
    }

    const asPartnerOn = divRegs.find((r) => normEmail(r.partner_email) === email);
    if (asPartnerOn) {
        const inviterEm = normEmail(asPartnerOn.email);
        const mutualLink = inviterEm && divRegs.some(
            (r) => normEmail(r.email) === email && normEmail(r.partner_email) === inviterEm,
        );
        if (mutualLink) {
            return { ok: true };
        }
        return {
            ok: false,
            message: `${name} is already partnered with ${asPartnerOn.full_name || 'another player'} for ${divLabel}`,
        };
    }

    return { ok: true };
};

function hasSoloEntry(registrations: any[], divisionId: string, email?: string) {
  return !!getPartnerAvailability(registrations, divisionId, { email }).isSoloLink;
}
function PartnerSearch({ value, onChange, profileId, eventId, divisionId, divisionName, currentUserEmail, busy }: { value: PartnerChoice; onChange: (v: PartnerChoice) => void; profileId?: string; eventId: number; divisionId: string; divisionName?: string; currentUserEmail?: string; busy: boolean }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState('');
  const seq = useRef(0);
  useEffect(() => {
    const request = ++seq.current;
    setResults([]);
    setError('');
    setSearching(false);
    if (query.trim().length < 2 || value.partnerName || busy) return;

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const [{ data, error: failure }, matching] = await Promise.all([
          supabase.rpc('find_registration_partner', { p_search: query.trim(), p_exclude_id: profileId || null, p_event_id: eventId }),
          supabase.rpc('get_event_registrations_for_matching', { p_event_id: eventId }),
        ]);
        if (request !== seq.current) return;
        if (failure) throw failure;
        if (matching.error) throw new Error('Could not check partner availability. Please try your search again.');
        setResults((data || []).map((player: any) => {
          const availability = getPartnerAvailability(matching.data || [], divisionId, player, divisionName, currentUserEmail);
          return { ...player, isSoloEntry: !!availability.isSoloLink, unavailable: !availability.ok, unavailableMessage: availability.message };
        }));
        if (!data?.length) setError('No matching profile found. Your partner can create a free 4M profile, or you can enter solo and add them later.');
      } catch (e) {
        if (request === seq.current) setError(e instanceof Error ? e.message : 'Partner search is unavailable. Try again.');
      } finally {
        if (request === seq.current) setSearching(false);
      }
    }, 300);
    return () => { clearTimeout(timer); seq.current++; };
  }, [query, profileId, eventId, divisionId, divisionName, currentUserEmail, value.partnerName, busy]);
  return <View style={{ gap: 10 }}>
    <Text style={{ color: brand.muted, fontSize: 13 }}>Add a partner (optional)</Text>
    {value.partnerName ? <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <Image source={value.image_url ? { uri: value.image_url } : undefined} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: brand.edge }} />
      <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: brand.premium, fontSize: 14, flex: 1 }}>{value.partnerName}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Remove partner" disabled={busy} onPress={() => { onChange({}); setQuery(''); setResults([]); }} style={{ padding: 12 }}><Text style={{ color: brand.muted }}>✕</Text></Pressable>
    </View> : <>
      <TextInput accessibilityLabel="Search partner name or email" placeholder="Search partner name or email" placeholderTextColor={brand.faint} value={query} onChangeText={q => { seq.current++; setSearching(false); setQuery(q); setResults([]); setError(''); }} autoCapitalize="none" autoCorrect={false} editable={!busy} style={{ color: brand.premium, borderWidth: 1, borderColor: brand.edge, borderRadius: 10, padding: 12 }} />
      {searching && <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <ActivityIndicator size="small" color={brand.accent} />
        <Text accessibilityLiveRegion="polite" style={{ color: brand.muted, fontSize: 12 }}>Searching partners…</Text>
      </View>}
      {query.trim().length < 2 && <Text style={{ color: brand.muted, fontSize: 12 }}>Type at least 2 characters to find your partner.</Text>}
      {results.length > 0 && <View style={{ borderWidth: 1, borderColor: brand.edge, borderRadius: 12, overflow: 'hidden', backgroundColor: brand.elevated }}>
        <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled" style={{ maxHeight: 192 }} showsVerticalScrollIndicator>
          {results.map((p, index) => <Pressable key={p.id || p.email} accessibilityRole="button" accessibilityLabel={`Select ${p.name}${p.isSoloEntry ? ', Solo entry' : ''}${p.unavailable ? `, ${p.unavailableMessage}` : ''}`} accessibilityState={{ disabled: busy || p.unavailable }} disabled={busy || p.unavailable}
            onPress={() => {
              if (p.unavailable || busy) return;
              seq.current++; setSearching(false);
              onChange({ partnerId: p.id, partnerEmail: p.email, partnerName: p.name, image_url: p.image_url, level: p.level || '', payForPartner: true, activeLicence: !!((p.license_type === 'full' && p.paid_registration) || p.has_temp_license_for_event) });
              setResults([]); Keyboard.dismiss();
            }}
            style={{ borderTopWidth: index ? 1 : 0, borderTopColor: brand.edge }}>
            <View style={{ minHeight: 56, paddingHorizontal: 12, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            {p.image_url ? <Image source={{ uri: p.image_url }} style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16 }} /> :
              <View style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 16, backgroundColor: brand.edge, alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: brand.muted, fontSize: 12, fontWeight: '600' }}>{(p.name || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((part: string) => part[0]).join('').toUpperCase()}</Text>
              </View>}
            <View style={{ flex: 1, gap: 4 }}>
              <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8} style={{ color: brand.premium, fontSize: 14 }}>{p.name}</Text>
              {p.unavailable && <Text style={{ color: brand.danger, fontSize: 11, lineHeight: 16 }}>{p.unavailableMessage}</Text>}
            </View>
            {p.isSoloEntry && <Text style={{ color: '#6ee7b7', fontSize: 11, fontWeight: '500', flexShrink: 0 }}>Solo entry</Text>}
            </View>
          </Pressable>)}
        </ScrollView>
      </View>}
      {!!error && <Text accessibilityRole="alert" style={{ color: brand.muted, fontSize: 12, lineHeight: 18 }}>{error}</Text>}
    </>}
  </View>;
}
