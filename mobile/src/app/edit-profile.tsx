import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LiquidField } from '@/components/liquid-field';
import { PressableScale } from '@/components/pressable-scale';
import { SectionLabel } from '@/components/profile-setup';
import { SelectField } from '@/components/select-field';
import { Toast, type ToastKind } from '@/components/toast';
import {
  clubIdOf,
  fetchClubs,
  fetchProfileBundle,
  updatePlayerDetails,
  type ClubRow,
  type PlayerRow,
} from '@/lib/profile';
import {
  CATEGORIES,
  RACKET_BRANDS,
  REGION_BADGE,
  SA_REGIONS,
} from '@/lib/registration';
import { supabase } from '@/lib/supabase';
import { brand } from '@/theme/tokens';

type Form = {
  contactNumber: string;
  region: string;
  category: string;
  clubId: string;
  customClub: string;
  bio: string;
  instagramLink: string;
  racketBrand: string;
  customRacketBrand: string;
};

type Errors = Partial<Record<keyof Form, string>>;

const EMPTY_FORM: Form = {
  contactNumber: '',
  region: '',
  category: '',
  clubId: '',
  customClub: '',
  bio: '',
  instagramLink: '',
  racketBrand: '',
  customRacketBrand: '',
};

function filled(value: string) {
  return value.trim().length > 0;
}

function formFromPlayer(player: PlayerRow, clubs: ClubRow[]): Form {
  const racket = player.racket_brand?.trim() ?? '';
  const knownRacket = RACKET_BRANDS.includes(racket as (typeof RACKET_BRANDS)[number]);
  const clubId = clubIdOf(player, clubs);
  return {
    contactNumber: player.contact_number ?? '',
    region: player.region ?? '',
    category: player.category ?? '',
    clubId,
    customClub: clubId === 'Other' ? player.home_club ?? '' : '',
    bio: player.bio ?? '',
    instagramLink: player.instagram_link ?? '',
    racketBrand: knownRacket ? racket : racket ? 'Other' : '',
    customRacketBrand: knownRacket || !racket ? '' : racket,
  };
}

/**
 * Native edit screen. Pushed over Profile so the form is a page, not an
 * inline expand on the same scroll.
 */
export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [player, setPlayer] = useState<PlayerRow | null>(null);
  const [clubs, setClubs] = useState<ClubRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Form>(EMPTY_FORM);
  const [errors, setErrors] = useState<Errors>({});
  const [toast, setToast] = useState<{ id: number; message: string; kind: ToastKind } | null>(
    null
  );
  const toastSeq = useRef(0);

  const dismissToast = useCallback(() => setToast(null), []);
  function flash(message: string, kind: ToastKind = 'error') {
    toastSeq.current += 1;
    setToast({ id: toastSeq.current, message, kind });
  }

  const load = useCallback(async () => {
    try {
      const [{ data }, clubRows] = await Promise.all([
        supabase.auth.getUser(),
        fetchClubs().catch(() => [] as ClubRow[]),
      ]);
      const email = data.user?.email ?? null;
      setClubs(clubRows);
      const next = await fetchProfileBundle(email);
      setPlayer(next.player);
      if (next.player) setForm(formFromPlayer(next.player, clubRows));
    } catch (err) {
      console.warn('[edit-profile]', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const categoryOptions = CATEGORIES.flatMap((group) =>
    group.options.map((option) => ({ label: option, value: option, group: group.group }))
  );
  const clubOptions = useMemo(
    () => [
      ...clubs.map((club) => ({ label: club.name, value: club.id })),
      { label: 'Other (type your own)', value: 'Other' },
    ],
    [clubs]
  );
  const regionBadge = REGION_BADGE[form.region as keyof typeof REGION_BADGE];
  const clubReady = !!form.clubId && (form.clubId !== 'Other' || filled(form.customClub));
  const racketReady =
    !!form.racketBrand && (form.racketBrand !== 'Other' || filled(form.customRacketBrand));

  function patch<K extends keyof Form>(key: K, value: Form[K]) {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }

  function validate(): Errors {
    const next: Errors = {};
    if (!filled(form.contactNumber)) next.contactNumber = 'Enter a mobile number.';
    if (!form.region) next.region = 'Select a region.';
    if (!form.category) next.category = 'Select a category.';
    if (!form.clubId) next.clubId = 'Select a home club.';
    if (form.clubId === 'Other' && !filled(form.customClub)) next.customClub = 'Enter your club name.';
    if (!filled(form.bio)) next.bio = 'Tell us about your game.';
    if (!form.racketBrand) next.racketBrand = 'Select a racket brand.';
    if (form.racketBrand === 'Other' && !filled(form.customRacketBrand)) {
      next.customRacketBrand = 'Enter your racket brand.';
    }
    return next;
  }

  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/profile');
  }

  async function save() {
    if (!player || saving) return;
    const next = validate();
    if (Object.keys(next).length) {
      setErrors(next);
      flash(Object.values(next)[0] ?? 'Check the highlighted fields.');
      return;
    }
    setSaving(true);
    try {
      const homeClub =
        form.clubId === 'Other'
          ? form.customClub.trim()
          : clubs.find((club) => club.id === form.clubId)?.name ?? player.home_club ?? '';
      const racket =
        form.racketBrand === 'Other' ? form.customRacketBrand.trim() : form.racketBrand;
      await updatePlayerDetails(player.id, {
        contact_number: form.contactNumber.trim(),
        region: form.region,
        category: form.category,
        home_club: homeClub,
        club_id: form.clubId && form.clubId !== 'Other' ? form.clubId : null,
        bio: form.bio.trim(),
        instagram_link: form.instagramLink.trim() || null,
        racket_brand: racket || null,
      });
      goBack();
    } catch (err) {
      flash(err instanceof Error ? err.message : 'Unable to save. Try again.');
    } finally {
      setSaving(false);
    }
  }

  const name = player?.name?.trim() || 'Player';

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      className="flex-1 bg-page"
      style={{ flex: 1, backgroundColor: brand.page }}>
      <View className="border-b border-edge bg-page" style={{ paddingTop: insets.top }}>
        <View className="h-[44px] justify-center px-2">
          <Pressable
            onPress={goBack}
            accessibilityRole="button"
            accessibilityLabel="Back to profile"
            hitSlop={{ top: 8, bottom: 8, left: 4, right: 8 }}
            className="z-10 h-11 w-11 items-center justify-center self-start">
            <SymbolView
              name={{ ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }}
              size={20}
              tintColor={brand.padel}
              accessibilityElementsHidden
            />
          </Pressable>
          <Text
            accessibilityRole="header"
            pointerEvents="none"
            className="absolute inset-0 text-center text-[17px] font-bold leading-[44px] text-premium">
            Edit Profile
          </Text>
        </View>
      </View>

      {loading ? (
        <View
          accessibilityLabel="Loading profile"
          className="flex-1 items-center justify-center">
          <ActivityIndicator color={brand.padel} />
        </View>
      ) : !player ? (
        <View className="flex-1 px-6 pt-10">
          <Text className="text-[17px] font-extrabold text-premium">No profile found</Text>
          <Text className="mt-2 text-[15px] leading-6 text-muted">
            We couldn&apos;t link your account to a player profile.
          </Text>
        </View>
      ) : (
        <>
          <ScrollView
            className="flex-1 bg-page"
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="interactive"
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 28 }}>
            <View className="mb-5 flex-row items-center">
              <View
                className="overflow-hidden rounded-full bg-elevated"
                style={{ width: 56, height: 56, borderWidth: 2, borderColor: brand.edge }}>
                {player.image_url ? (
                  <Image
                    source={{ uri: player.image_url }}
                    style={{ width: 56, height: 56 }}
                    contentFit="cover"
                    accessibilityLabel={`${name} profile photo`}
                    accessibilityIgnoresInvertColors
                  />
                ) : (
                  <View className="h-full w-full items-center justify-center">
                    <Text className="text-lg font-bold text-white/20">{name.charAt(0)}</Text>
                  </View>
                )}
              </View>
              <View className="ml-3 min-w-0 flex-1">
                <Text numberOfLines={1} className="text-[16px] font-extrabold uppercase text-premium">
                  {name}
                </Text>
                <Text className="mt-0.5 text-[13px] text-muted">Player profile details</Text>
              </View>
            </View>

            <SectionLabel first>Contact</SectionLabel>
            <LiquidField
              label="Mobile number"
              icon="phone.fill"
              value={form.contactNumber}
              error={errors.contactNumber}
              invalid={!!errors.contactNumber}
              valid={filled(form.contactNumber) && !errors.contactNumber}
              onChangeText={(value) => patch('contactNumber', value)}
              keyboardType="phone-pad"
              autoComplete="tel"
              textContentType="telephoneNumber"
            />
            <SelectField
              label="Region"
              value={form.region}
              error={errors.region}
              valid={!!form.region && !errors.region}
              badge={regionBadge}
              options={SA_REGIONS.map((region) => ({ label: region, value: region }))}
              onChange={(value) => patch('region', value)}
            />
            <SelectField
              label="Category"
              value={form.category}
              error={errors.category}
              valid={!!form.category && !errors.category}
              options={categoryOptions}
              onChange={(value) => patch('category', value)}
            />
            <SelectField
              label="Home club"
              value={form.clubId}
              error={errors.clubId}
              valid={clubReady && !errors.clubId}
              options={clubOptions}
              searchable
              emptyLabel="No clubs match that search."
              onChange={(value) => patch('clubId', value)}
            />
            {form.clubId === 'Other' ? (
              <LiquidField
                label="Club name"
                value={form.customClub}
                error={errors.customClub}
                invalid={!!errors.customClub}
                valid={filled(form.customClub) && !errors.customClub}
                onChangeText={(value) => patch('customClub', value)}
                autoCapitalize="words"
              />
            ) : null}
            <LiquidField
              label="About your game"
              value={form.bio}
              error={errors.bio}
              invalid={!!errors.bio}
              valid={filled(form.bio) && !errors.bio}
              onChangeText={(value) => patch('bio', value)}
              multiline
              autoCapitalize="sentences"
              autoCorrect
            />
            <LiquidField
              label="Instagram (optional)"
              value={form.instagramLink}
              valid={filled(form.instagramLink)}
              onChangeText={(value) => patch('instagramLink', value)}
              autoCapitalize="none"
              keyboardType="url"
            />
            <SelectField
              label="Racket brand"
              value={form.racketBrand}
              error={errors.racketBrand}
              valid={racketReady && !errors.racketBrand}
              options={RACKET_BRANDS.map((name) => ({ label: name, value: name }))}
              onChange={(value) => patch('racketBrand', value)}
            />
            {form.racketBrand === 'Other' ? (
              <LiquidField
                label="Racket brand"
                value={form.customRacketBrand}
                error={errors.customRacketBrand}
                invalid={!!errors.customRacketBrand}
                valid={filled(form.customRacketBrand) && !errors.customRacketBrand}
                onChangeText={(value) => patch('customRacketBrand', value)}
                autoCapitalize="words"
              />
            ) : null}
          </ScrollView>

          <View
            className="border-t border-edge bg-page px-5 pt-3"
            style={{ paddingBottom: Math.max(insets.bottom, 16) }}>
            <PressableScale
              onPress={save}
              disabled={saving}
              accessibilityRole="button"
              accessibilityState={{ busy: saving, disabled: saving }}
              accessibilityLabel="Save changes"
              className="h-[52px] flex-row items-center justify-center rounded-[14px] bg-padel">
              {saving ? <ActivityIndicator color={brand.page} style={{ marginRight: 8 }} /> : null}
              <Text className="text-[13px] font-black uppercase tracking-widest text-page">
                {saving ? 'Saving…' : 'Save Changes'}
              </Text>
            </PressableScale>
          </View>
        </>
      )}

      <Toast
        key={toast?.id ?? 'idle'}
        message={toast?.message ?? null}
        kind={toast?.kind}
        onDismiss={dismissToast}
      />
    </KeyboardAvoidingView>
  );
}
