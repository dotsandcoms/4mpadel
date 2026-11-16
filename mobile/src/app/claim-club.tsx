import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { ClubIdentity } from '@/components/club-identity';
import { HomeAction } from '@/components/home-action';
import { LiquidField } from '@/components/liquid-field';
import { SelectField } from '@/components/select-field';
import { clubClaimErrors, CLUB_CLAIM_ROLES, fetchClubClaimContext, submitClubClaim, type ClubClaimAccount, type ClubClaimContext, type ClubClaimForm } from '@/lib/club-claims';
import { supabase } from '@/lib/supabase';
import { loadingBlue, lightBrand as b } from '@/theme/tokens';

export default function ClaimClubScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>(), router = useRouter();
  const [account, setAccount] = useState<ClubClaimAccount | null | undefined>();
  useEffect(() => {
    let active = true, received = false;
    const receive = (user: { id: string; email?: string } | null) => {
      received = true;
      if (!active) return;
      const email = user?.email?.trim().toLowerCase();
      setAccount(current => user && email ? current?.id === user.id && current.email === email ? current : { id: user.id, email } : null);
    };
    const { data } = supabase.auth.onAuthStateChange((_event, session) => receive(session?.user ?? null));
    void supabase.auth.getSession().then(({ data }) => { if (!received) receive(data.session?.user ?? null); }).catch(() => { if (!received) receive(null); });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return <View style={{ flex: 1, backgroundColor: b.page }}>
    <Stack.Screen options={{ headerShown: true, title: 'Claim Club', headerBackTitle: 'Club', headerTintColor: b.premium, headerStyle: { backgroundColor: b.page }, headerShadowVisible: false }} />
    {account === undefined ? <ActivityIndicator style={{ margin: 24 }} color={loadingBlue} accessibilityLabel="Checking your account" /> : !account ? <View style={s.content}><Text style={s.title}>Sign in to claim this club</Text><Text style={s.body}>Use your 4M Padel player account to request club access.</Text><HomeAction label="Sign in" onPress={() => router.push('/(auth)/sign-in')} /></View> : <ClaimForm key={`${account.id}:${account.email}:${slug}`} slug={slug} account={account} onDone={() => router.back()} />}
  </View>;
}

function ClaimForm({ slug, account, onDone }: { slug: string; account: ClubClaimAccount; onDone: () => void }) {
  const [context, setContext] = useState<ClubClaimContext | null>(null), [loading, setLoading] = useState(true), [revision, setRevision] = useState(0);
  const [form, setForm] = useState<ClubClaimForm>({ name: '', phone: '', role: '', notes: '' }), [errors, setErrors] = useState<ReturnType<typeof clubClaimErrors>>();
  const [review, setReview] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState<{ alreadyPending: boolean; emailsSent: boolean } | null>(null);
  const alive = useRef(true), submitting = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(''); setContext(null);
    void fetchClubClaimContext(slug, account, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      setContext(value); setForm({ name: value.name, phone: value.phone, role: '', notes: '' });
    }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Your club claim details couldn’t load.'); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [slug, account, revision]);
  function field(key: keyof ClubClaimForm, value: string) { setForm(previous => ({ ...previous, [key]: value })); setErrors(undefined); setError(''); }
  function reviewClaim() {
    const next = clubClaimErrors(form); setErrors(next);
    if (Object.values(next).some(Boolean)) return;
    setError(''); setReview(true);
  }
  async function submit() {
    if (submitting.current) return;
    submitting.current = true; setBusy(true); setError('');
    try { const value = await submitClubClaim(slug, account, form); if (alive.current) setResult(value); }
    catch (reason) { if (alive.current) setError(reason instanceof Error ? reason.message : 'Your claim couldn’t be submitted. Please try again.'); }
    finally { submitting.current = false; if (alive.current) setBusy(false); }
  }
  return <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={s.content}>
      {loading ? <ActivityIndicator color={loadingBlue} accessibilityLabel="Loading club claim" /> : <>
        {context && <View style={s.identity}><ClubIdentity club={context.club} size={48} /><View style={{ flex: 1, gap: 4 }}><Text accessibilityRole="header" style={s.title}>{context.club.name}</Text><Text style={s.body}>{context.club.city}</Text></View></View>}
        {!!error && <Text accessibilityRole="alert" style={{ ...s.body, color: b.danger }}>{error}</Text>}
        {!context ? <HomeAction label="Retry" onPress={() => setRevision(value => value + 1)} /> : context.pending || result ? <>
          <Text accessibilityRole="header" style={s.heading}>{context.pending || result?.alreadyPending ? 'Claim pending review' : 'Club claim received'}</Text>
          <Text style={s.body}>The 4M Padel team will review your request. We’ll email {account.email} once it is approved. Approval gives your existing account access to the Club Dashboard.</Text>
          {result && !result.emailsSent && <Text style={s.body}>Your request is saved in the review queue, but the confirmation emails couldn’t be sent.</Text>}
          <HomeAction label="Back to club" onPress={onDone} />
        </> : context.hasOwner ? <><Text style={s.heading}>This club already has an owner</Text><Text style={s.body}>Contact the 4M Padel team if you need access to its dashboard.</Text><HomeAction label="Back to club" onPress={onDone} /></> : <>
          <Text style={s.body}>Request access to manage this club. The 4M Padel team reviews each claim before granting access.</Text>
          {review ? <>
            <Text accessibilityRole="header" style={s.heading}>Review your club claim</Text>
            <View style={s.review}>
              <Text style={s.heading}>{form.name.trim()}</Text><Text style={s.body}>{account.email}</Text><Text style={s.body}>{form.phone.trim()}</Text><Text style={s.body}>{form.role}</Text>{!!form.notes.trim() && <Text style={s.body}>{form.notes.trim()}</Text>}
            </View>
            <HomeAction kind="primary" label={busy ? 'Submitting claim…' : 'Submit club claim'} disabled={busy} onPress={() => void submit()} />
            <HomeAction label="Edit details" disabled={busy} onPress={() => setReview(false)} />
          </> : <>
            <LiquidField label="Full name" value={form.name} onChangeText={value => field('name', value)} autoCapitalize="words" autoComplete="name" maxLength={200} invalid={!!errors?.name} error={errors?.name} />
            <View style={{ gap: 4 }}><Text style={s.heading}>Contact email</Text><Text selectable style={s.body}>{account.email}</Text><Text style={s.meta}>Linked to your signed-in player account.</Text></View>
            <LiquidField label="Phone / WhatsApp" value={form.phone} onChangeText={value => field('phone', value)} keyboardType="phone-pad" autoComplete="tel" maxLength={50} invalid={!!errors?.phone} error={errors?.phone} />
            <SelectField label="Your role at the club" value={form.role} onChange={value => field('role', value)} options={CLUB_CLAIM_ROLES.map(value => ({ value, label: value }))} error={errors?.role} />
            <LiquidField label="Notes for the 4M Padel team" hint="Add anything that helps us verify your connection to this club." value={form.notes} onChangeText={value => field('notes', value)} multiline maxLength={2000} autoCapitalize="sentences" />
            <HomeAction kind="primary" label="Review club claim" onPress={reviewClaim} />
          </>}
        </>}
      </>}
    </ScrollView>
  </KeyboardAvoidingView>;
}
const s = StyleSheet.create({
  content: { padding: 20, paddingBottom: 40, gap: 20 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  title: { color: b.premium, fontSize: 22, lineHeight: 28, fontWeight: '600' },
  heading: { color: b.premium, fontSize: 16, lineHeight: 22, fontWeight: '600' },
  body: { color: b.muted, fontSize: 14, lineHeight: 21 },
  meta: { color: b.muted, fontSize: 12, lineHeight: 18 },
  review: { padding: 16, gap: 8, backgroundColor: b.elevated, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: b.edge },
});
