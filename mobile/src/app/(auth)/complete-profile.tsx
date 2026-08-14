import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidField } from '@/components/liquid-field';
import { PressableScale } from '@/components/pressable-scale';
import {
  CourtBackdrop,
  CourtLine,
  DraftRestore,
  PlayerSetupPreview,
  ProgressTrack,
  SectionLabel,
  StepSlide,
  VerifiedEmail,
} from '@/components/profile-setup';
import { SelectField } from '@/components/select-field';
import { Toast, type ToastKind } from '@/components/toast';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { signOut } from '@/lib/auth';
import {
  clearProfileDraft,
  createPlayerProfile,
  draftHasProgress,
  fetchClubs,
  loadProfileDraft,
  nameFromUser,
  saveProfileDraft,
  type ClubRow,
  type PlayerDraft,
} from '@/lib/profile';
import { openLegal } from '@/lib/legal';
import {
  CATEGORIES,
  GENDERS,
  NATIONALITIES,
  RACKET_BRANDS,
  REGION_BADGE,
  SA_REGIONS,
} from '@/lib/registration';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

type Errors = Partial<Record<string, string>>;

const CONTROL_H = 52;
const CONTROL_R = 14;

function filled(value: string) {
  return value.trim().length > 0;
}

/**
 * Guided player-profile setup. Auth already exists; this collects the player
 * row 4M needs. License payment stays on the website — Paystack is not in
 * the app yet.
 */
export default function CompleteProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const reduced = useReducedMotion();
  const reducedRef = useRef(reduced);
  reducedRef.current = reduced;
  const [step, setStep] = useState<1 | 2>(1);
  const [hasStepped, setHasStepped] = useState(false);
  const [hydrate, setHydrate] = useState<'pending' | 'restoring' | 'ready'>('pending');
  const [busy, setBusy] = useState(false);
  const [savingStep, setSavingStep] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Errors>({});
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [accepted, setAccepted] = useState(false);
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(
    null
  );
  const toastSeq = useRef(0);
  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const idRef = useRef<TextInput>(null);
  const mobileRef = useRef<TextInput>(null);
  const bioRef = useRef<TextInput>(null);
  const dismissToast = useCallback(() => setToast(null), []);

  function flash(message: string, kind: ToastKind = 'error') {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, kind });
  }

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [contactNumber, setContactNumber] = useState('');
  const [gender, setGender] = useState('');
  const [nationality, setNationality] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [region, setRegion] = useState('');
  const [category, setCategory] = useState('');
  const [clubId, setClubId] = useState('');
  const [customClub, setCustomClub] = useState('');
  const [bio, setBio] = useState('');
  const [instagramLink, setInstagramLink] = useState('');
  const [sponsors, setSponsors] = useState('');
  const [racketBrand, setRacketBrand] = useState('');
  const [customRacketBrand, setCustomRacketBrand] = useState('');

  const draft = useCallback((): PlayerDraft & { accepted: boolean } => {
    return {
      firstName,
      lastName,
      email,
      contactNumber,
      gender,
      nationality,
      idNumber,
      region,
      category,
      clubId,
      customClub,
      bio,
      instagramLink,
      sponsors,
      racketBrand,
      customRacketBrand,
      accepted,
    };
  }, [
    accepted,
    bio,
    category,
    clubId,
    contactNumber,
    customClub,
    customRacketBrand,
    email,
    firstName,
    gender,
    idNumber,
    instagramLink,
    lastName,
    nationality,
    racketBrand,
    region,
    sponsors,
  ]);

  useEffect(() => {
    fetchClubs()
      .then(setClubs)
      .catch(() => setClubs([]));

    supabase.auth.getUser().then(async ({ data }) => {
      try {
        const user = data.user;
        const saved = await loadProfileDraft(user?.email);
        const names = nameFromUser(user ?? null);
        setEmail(user?.email ?? saved?.email ?? '');
        setFirstName((v) => v || saved?.firstName || names.firstName);
        setLastName((v) => v || saved?.lastName || names.lastName);
        if (saved) {
          setContactNumber((v) => v || saved.contactNumber || '');
          setGender((v) => v || saved.gender || '');
          setNationality((v) => v || saved.nationality || '');
          setIdNumber((v) => v || saved.idNumber || '');
          setRegion((v) => v || saved.region || '');
          setCategory((v) => v || saved.category || '');
          setClubId((v) => v || saved.clubId || '');
          setCustomClub((v) => v || saved.customClub || '');
          setBio((v) => v || saved.bio || '');
          setInstagramLink((v) => v || saved.instagramLink || '');
          setSponsors((v) => v || saved.sponsors || '');
          setRacketBrand((v) => v || saved.racketBrand || '');
          setCustomRacketBrand((v) => v || saved.customRacketBrand || '');
          if (saved.accepted) setAccepted(true);
        }
        if (draftHasProgress(saved)) {
          setHydrate('restoring');
          if (!reducedRef.current) {
            await new Promise((resolve) => setTimeout(resolve, 900));
          }
        }
      } finally {
        setHydrate('ready');
      }
    });
  }, []);

  const clubOptions = useMemo(
    () => [
      ...clubs.map((c) => ({ label: c.name, value: c.id })),
      { label: 'Other (type your own)', value: 'Other' },
    ],
    [clubs]
  );

  const categoryOptions = CATEGORIES.flatMap((g) =>
    g.options.map((option) => ({ label: option, value: option, group: g.group }))
  );

  const nationalityOptions = useMemo(() => {
    const base = NATIONALITIES.map((n) => ({ label: n.label, value: n.value }));
    if (nationality && !base.some((n) => n.value === nationality)) {
      return [...base, { label: nationality, value: nationality }];
    }
    return base;
  }, [nationality]);

  const nationalityBadge = NATIONALITIES.find((n) => n.value === nationality)?.badge;
  const regionBadge = REGION_BADGE[region as keyof typeof REGION_BADGE];
  const clubName =
    clubId === 'Other' ? customClub.trim() : clubs.find((c) => c.id === clubId)?.name ?? '';

  const step1Complete =
    filled(firstName) &&
    filled(lastName) &&
    filled(idNumber) &&
    filled(contactNumber) &&
    !!gender &&
    filled(nationality) &&
    !!region;

  const clubReady = !!clubId && (clubId !== 'Other' || filled(customClub));
  const racketReady = !!racketBrand && (racketBrand !== 'Other' || filled(customRacketBrand));
  const step2Complete = !!category && clubReady && filled(bio) && racketReady && accepted;

  const completionChecks = [
    filled(firstName),
    filled(lastName),
    filled(idNumber),
    !!email,
    filled(contactNumber),
    !!gender,
    filled(nationality),
    !!region,
    !!category,
    clubReady,
    filled(bio),
    racketReady,
    accepted,
  ];
  const percent = Math.round(
    (completionChecks.filter(Boolean).length / completionChecks.length) * 100
  );

  function clearError(key: string) {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  function validateStep1(): Errors {
    const next: Errors = {};
    if (!filled(firstName)) next.firstName = 'Enter your first name.';
    if (!filled(lastName)) next.lastName = 'Enter your surname.';
    if (!filled(idNumber)) next.idNumber = 'Enter an ID or passport number.';
    if (!filled(contactNumber)) next.contactNumber = 'Enter a mobile number.';
    if (!gender) next.gender = 'Select a gender.';
    if (!filled(nationality)) next.nationality = 'Select a nationality.';
    if (!region) next.region = 'Select a region.';
    return next;
  }

  function validateStep2(): Errors {
    const next: Errors = {};
    if (!category) next.category = 'Select a category.';
    if (!clubId) next.clubId = 'Select a home club.';
    if (clubId === 'Other' && !filled(customClub)) next.customClub = 'Enter your club name.';
    if (!filled(bio)) next.bio = 'Tell us a little about your game.';
    if (!racketBrand) next.racketBrand = 'Select a racket brand.';
    if (racketBrand === 'Other' && !filled(customRacketBrand)) {
      next.customRacketBrand = 'Enter your racket brand.';
    }
    if (!accepted) next.accepted = 'Accept the Terms to create your profile.';
    return next;
  }

  function focusFirst(next: Errors) {
    if (next.firstName) firstNameRef.current?.focus();
    else if (next.lastName) lastNameRef.current?.focus();
    else if (next.idNumber) idRef.current?.focus();
    else if (next.contactNumber) mobileRef.current?.focus();
    else if (next.bio) bioRef.current?.focus();
  }

  async function goNext() {
    const next = validateStep1();
    setErrors(next);
    setFormError(null);
    const first = Object.values(next)[0];
    if (first) {
      flash(first);
      focusFirst(next);
      return;
    }
    setSavingStep(true);
    await saveProfileDraft(draft());
    if (!reduced) {
      await new Promise((resolve) => setTimeout(resolve, 520));
    }
    setHasStepped(true);
    setStep(2);
    setSavingStep(false);
  }

  async function saveAndExit() {
    await saveProfileDraft(draft());
    await signOut();
  }

  async function finish() {
    const next = validateStep2();
    setErrors(next);
    setFormError(null);
    const first = Object.values(next)[0];
    if (first) {
      flash(first);
      focusFirst(next);
      return;
    }

    setBusy(true);
    try {
      await createPlayerProfile(draft(), clubs);
      await clearProfileDraft(email);
      router.replace('/(tabs)');
    } catch (e: any) {
      const msg = e?.message ?? 'Unable to save your profile. Try again.';
      setFormError(msg);
      flash(msg);
    } finally {
      setBusy(false);
    }
  }

  const saving = savingStep || busy;
  const ctaMuted = step === 2 && !accepted;
  const ctaLabel = saving
    ? 'Saving details…'
    : step === 2
      ? 'Save profile'
      : step1Complete
        ? 'Continue to padel profile'
        : 'Continue';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-page"
      style={{ flex: 1, backgroundColor: brand.page }}>
      <View className="flex-1" style={{ paddingTop: insets.top + 8 }}>
        <CourtBackdrop completeness={percent / 100} />

        <View className="px-7">
          <View className="flex-row items-center justify-between">
            <Pressable
              onPress={saveAndExit}
              accessibilityRole="button"
              accessibilityLabel="Save and exit"
              className="min-h-11 flex-row items-center"
              hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}>
              <SymbolView
                name="chevron.left"
                size={18}
                tintColor={brand.muted}
                accessibilityElementsHidden
              />
              <Text className="ml-1 text-[15px] font-semibold text-muted">Save and exit</Text>
            </Pressable>
            {hydrate === 'ready' ? (
              <Text
                className="text-[12px] font-bold"
                style={{ color: percent > 0 ? brand.padel : brand.faint }}>
                Profile {percent}% complete
              </Text>
            ) : (
              <View />
            )}
          </View>

          {hydrate === 'ready' ? (
            <View className="mt-4 mb-3">
              <ProgressTrack
                step={step}
                step1Done={step1Complete || step === 2}
                step2Done={step2Complete}
                onPersonalPress={() => {
                  setHasStepped(true);
                  setStep(1);
                }}
              />
            </View>
          ) : null}
        </View>

        {hydrate !== 'ready' ? (
          <DraftRestore
            key={hydrate === 'restoring' ? 'restoring' : 'pending'}
            mode={hydrate === 'restoring' ? 'restoring' : 'pending'}
          />
        ) : null}

        {hydrate === 'ready' ? (
        <>
        <ScrollView
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          automaticallyAdjustKeyboardInsets
          contentContainerStyle={{ paddingHorizontal: 28, paddingBottom: 16 }}>
          <StepSlide key={step} step={step} animate={hasStepped}>
            {step === 1 ? (
              <>
                <Text
                  accessibilityRole="header"
                  className="mb-2 font-extrabold text-premium"
                  style={{ fontSize: 28, lineHeight: 33 }}>
                  Your details
                </Text>
                <Text className="mb-6 text-muted" style={{ fontSize: 16, lineHeight: 24 }}>
                  Use the same name as your RankedIn profile so we can match your results.
                </Text>

                <SectionLabel first>Identity</SectionLabel>
                <View className="flex-row" style={{ gap: 12 }}>
                  <View className="flex-1">
                    <LiquidField
                      ref={firstNameRef}
                      label="First name"
                      icon="person.fill"
                      value={firstName}
                      error={errors.firstName}
                      invalid={!!errors.firstName}
                      valid={filled(firstName) && !errors.firstName}
                      onChangeText={(v) => {
                        setFirstName(v);
                        clearError('firstName');
                      }}
                      autoCapitalize="words"
                      autoComplete="given-name"
                      textContentType="givenName"
                      autoCorrect
                    />
                  </View>
                  <View className="flex-1">
                    <LiquidField
                      ref={lastNameRef}
                      label="Surname"
                      icon="person.fill"
                      value={lastName}
                      error={errors.lastName}
                      invalid={!!errors.lastName}
                      valid={filled(lastName) && !errors.lastName}
                      onChangeText={(v) => {
                        setLastName(v);
                        clearError('lastName');
                      }}
                      autoCapitalize="words"
                      autoComplete="family-name"
                      textContentType="familyName"
                      autoCorrect
                    />
                  </View>
                </View>
                <LiquidField
                  ref={idRef}
                  label="ID / passport"
                  value={idNumber}
                  error={errors.idNumber}
                  invalid={!!errors.idNumber}
                  valid={filled(idNumber) && !errors.idNumber}
                  onChangeText={(v) => {
                    setIdNumber(v);
                    clearError('idNumber');
                  }}
                  autoCapitalize="characters"
                  autoComplete="off"
                  textContentType="none"
                />

                <SectionLabel>Contact</SectionLabel>
                {email ? <VerifiedEmail email={email} /> : null}
                <LiquidField
                  ref={mobileRef}
                  label="Mobile number"
                  icon="phone.fill"
                  value={contactNumber}
                  error={errors.contactNumber}
                  invalid={!!errors.contactNumber}
                  valid={filled(contactNumber) && !errors.contactNumber}
                  onChangeText={(v) => {
                    setContactNumber(v);
                    clearError('contactNumber');
                  }}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                />

                <SectionLabel>Player details</SectionLabel>
                <View className="flex-row" style={{ gap: 12 }}>
                  <View className="flex-1">
                    <SelectField
                      label="Gender"
                      value={gender}
                      error={errors.gender}
                      valid={!!gender && !errors.gender}
                      options={GENDERS.map((g) => ({ label: g, value: g }))}
                      onChange={(v) => {
                        setGender(v);
                        clearError('gender');
                      }}
                    />
                  </View>
                  <View className="flex-1">
                    <SelectField
                      label="Nationality"
                      value={nationality}
                      error={errors.nationality}
                      valid={filled(nationality) && !errors.nationality}
                      badge={nationalityBadge}
                      options={nationalityOptions}
                      onChange={(v) => {
                        setNationality(v);
                        clearError('nationality');
                      }}
                    />
                  </View>
                </View>
                <SelectField
                  label="Region"
                  value={region}
                  error={errors.region}
                  valid={!!region && !errors.region}
                  badge={regionBadge}
                  options={SA_REGIONS.map((r) => ({ label: r, value: r }))}
                  onChange={(v) => {
                    setRegion(v);
                    clearError('region');
                  }}
                />
              </>
            ) : (
              <>
                <Text
                  accessibilityRole="header"
                  className="mb-2 font-extrabold text-premium"
                  style={{ fontSize: 28, lineHeight: 33 }}>
                  Your game
                </Text>
                <Text className="mb-5 text-muted" style={{ fontSize: 16, lineHeight: 24 }}>
                  Your player card fills in as you choose a level, club and preferences.
                </Text>

                <PlayerSetupPreview
                  name={[firstName, lastName].filter(Boolean).join(' ')}
                  region={region}
                  category={category}
                  club={clubName}
                />

                <SectionLabel first>Level & club</SectionLabel>
                <SelectField
                  label="Category"
                  value={category}
                  error={errors.category}
                  valid={!!category && !errors.category}
                  options={categoryOptions}
                  onChange={(v) => {
                    setCategory(v);
                    clearError('category');
                  }}
                />
                <SelectField
                  label="Home club"
                  value={clubId}
                  error={errors.clubId}
                  valid={clubReady && !errors.clubId}
                  options={clubOptions}
                  searchable
                  emptyLabel="No clubs match that search."
                  onChange={(v) => {
                    setClubId(v);
                    clearError('clubId');
                  }}
                />
                {clubId === 'Other' ? (
                  <LiquidField
                    label="Club name"
                    value={customClub}
                    error={errors.customClub}
                    invalid={!!errors.customClub}
                    valid={filled(customClub) && !errors.customClub}
                    onChangeText={(v) => {
                      setCustomClub(v);
                      clearError('customClub');
                    }}
                    autoCapitalize="words"
                    autoCorrect
                  />
                ) : null}

                <SectionLabel>About your game</SectionLabel>
                <LiquidField
                  ref={bioRef}
                  label="About your game"
                  value={bio}
                  error={errors.bio}
                  invalid={!!errors.bio}
                  valid={filled(bio) && !errors.bio}
                  onChangeText={(v) => {
                    setBio(v);
                    clearError('bio');
                  }}
                  multiline
                  autoCapitalize="sentences"
                  autoCorrect
                  placeholder="Tell us about your padel journey"
                />
                <LiquidField
                  label="Instagram (optional)"
                  value={instagramLink}
                  valid={filled(instagramLink)}
                  onChangeText={setInstagramLink}
                  autoCapitalize="none"
                  keyboardType="url"
                  placeholder="https://instagram.com/you"
                />
                <LiquidField
                  label="Sponsors (optional)"
                  value={sponsors}
                  valid={filled(sponsors)}
                  onChangeText={setSponsors}
                  autoCapitalize="words"
                  autoCorrect
                />

                <SectionLabel>Kit</SectionLabel>
                <SelectField
                  label="Racket brand"
                  value={racketBrand}
                  error={errors.racketBrand}
                  valid={racketReady && !errors.racketBrand}
                  options={RACKET_BRANDS.map((b) => ({ label: b, value: b }))}
                  onChange={(v) => {
                    setRacketBrand(v);
                    clearError('racketBrand');
                  }}
                />
                {racketBrand === 'Other' ? (
                  <LiquidField
                    label="Racket brand name"
                    value={customRacketBrand}
                    error={errors.customRacketBrand}
                    invalid={!!errors.customRacketBrand}
                    valid={filled(customRacketBrand) && !errors.customRacketBrand}
                    onChangeText={(v) => {
                      setCustomRacketBrand(v);
                      clearError('customRacketBrand');
                    }}
                    autoCapitalize="words"
                  />
                ) : null}

                <View className="mt-2 flex-row items-start">
                  <Pressable
                    onPress={() => {
                      setAccepted((v) => !v);
                      clearError('accepted');
                    }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: accepted }}
                    accessibilityLabel="I agree to the Terms and Privacy Policy"
                    className="min-h-11 flex-row items-center pr-3">
                    <View
                      className="h-6 w-6 items-center justify-center rounded-md"
                      style={{
                        borderWidth: 2,
                        borderColor: errors.accepted
                          ? brand.danger
                          : accepted
                            ? brand.padel
                            : brand.edge,
                        backgroundColor: accepted ? brand.padel : 'transparent',
                      }}>
                      {accepted ? (
                        <Text className="text-[13px] font-extrabold text-page">✓</Text>
                      ) : null}
                    </View>
                  </Pressable>
                  <Text className="min-h-11 flex-1 pt-2.5 text-[14px] leading-5 text-muted">
                    I agree to the{' '}
                    <Text
                      onPress={() => openLegal('terms')}
                      accessibilityRole="link"
                      className="font-semibold text-padel">
                      Terms
                    </Text>
                    {' and '}
                    <Text
                      onPress={() => openLegal('privacy')}
                      accessibilityRole="link"
                      className="font-semibold text-padel">
                      Privacy Policy
                    </Text>
                  </Text>
                </View>
                {errors.accepted ? (
                  <Text className="mt-2 text-[13px] text-danger">{errors.accepted}</Text>
                ) : null}
              </>
            )}
          </StepSlide>

          {formError ? (
            <Text accessibilityRole="alert" className="mt-3 text-[14px] leading-5 text-danger">
              {formError}
            </Text>
          ) : null}
        </ScrollView>

        <View className="px-7" style={{ paddingTop: 8, paddingBottom: insets.bottom + 16 }}>
          <PressableScale
            disabled={saving || ctaMuted}
            onPress={step === 1 ? goNext : finish}
            accessibilityRole="button"
            accessibilityState={{ busy: saving, disabled: ctaMuted }}
            accessibilityLabel={ctaLabel}
            accessibilityHint={
              ctaMuted
                ? 'Agree to the Terms and Privacy Policy to save your profile'
                : undefined
            }
            className="flex-row items-center justify-center"
            style={{
              height: CONTROL_H,
              borderRadius: CONTROL_R,
              backgroundColor: ctaMuted ? '#5C6B14' : brand.padel,
            }}>
            {saving ? <CourtLine /> : null}
            <Text
              className="text-base font-bold"
              style={{ color: ctaMuted ? 'rgba(10,10,10,0.45)' : brand.page }}>
              {ctaLabel}
            </Text>
          </PressableScale>
        </View>
        </>
        ) : null}
      </View>
      <Toast
        key={toast?.id ?? 0}
        message={toast?.message ?? null}
        kind={toast?.kind}
        onDismiss={dismissToast}
      />
    </KeyboardAvoidingView>
  );
}
