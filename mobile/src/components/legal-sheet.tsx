import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { brand } from '@/theme/tokens';

type Kind = 'terms' | 'privacy';

type Props = {
  kind: Kind | null;
  onClose: () => void;
};

const COPY: Record<Kind, { title: string; intro: string; points: string[] }> = {
  terms: {
    title: 'Terms',
    intro: 'By creating a 4M Padel account, you agree to the following:',
    points: [
      'You must provide accurate and complete information during registration.',
      'You are responsible for keeping your account credentials confidential.',
      'Entry fees are automatically refunded if you withdraw before registration closes. After registration closes, refunds are at the organiser’s discretion. Paystack processing fees are non-refundable. Annual SAPA licenses are non-refundable.',
      'You agree to participate in good faith and respect other players and organisers.',
      'You consent to your profile information being displayed on the platform for ranking and tournament purposes.',
      'We reserve the right to suspend or remove accounts that violate these terms.',
    ],
  },
  privacy: {
    title: 'Privacy Policy',
    intro:
      'In compliance with the Protection of Personal Information Act (Act 4 of 2013), we:',
    points: [
      'Process your personal information only for lawful purposes related to padel registration and tournament management.',
      'Collect only the information necessary for your player profile and participation.',
      'Implement appropriate security measures to protect your data.',
      'Will not share your personal information with third parties without your consent, except as required by law.',
      'Will notify you of any data breaches affecting your information.',
      'Allow you to access, correct, or request deletion of your personal information.',
    ],
  },
};

/**
 * In-app Terms / Privacy copy, mirrored from the website auth modal.
 * There is no public legal URL yet, so this stays on-device.
 */
export function LegalSheet({ kind, onClose }: Props) {
  const insets = useSafeAreaInsets();
  const copy = kind ? COPY[kind] : null;

  return (
    <Modal
      visible={!!kind}
      animationType="fade"
      transparent
      onRequestClose={onClose}
      accessibilityViewIsModal>
      <View className="flex-1 justify-end bg-black/80">
        <View
          className="rounded-t-3xl border-t border-edge bg-page"
          style={{ maxHeight: '86%', paddingBottom: insets.bottom + 16 }}>
          <View className="flex-row items-center justify-between px-6 pt-5">
            <Text
              accessibilityRole="header"
              className="flex-1 pr-4 text-[20px] font-extrabold text-premium">
              {copy?.title}
            </Text>
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              accessibilityLabel="Close"
              className="h-11 w-11 items-center justify-center">
              <Text className="text-[17px] text-muted">Close</Text>
            </Pressable>
          </View>

          <ScrollView
            className="mt-4 px-6"
            contentContainerStyle={{ paddingBottom: 24 }}
            keyboardShouldPersistTaps="handled">
            {copy ? (
              <>
                <Text className="mb-4 text-[15px] leading-6 text-muted">{copy.intro}</Text>
                {copy.points.map((point) => (
                  <View key={point} className="mb-3 flex-row">
                    <Text className="mr-2 text-padel">•</Text>
                    <Text className="flex-1 text-[15px] leading-6 text-muted">{point}</Text>
                  </View>
                ))}
                {kind === 'privacy' ? (
                  <Text className="mt-2 text-[13px] leading-5" style={{ color: brand.label }}>
                    By creating an account, you consent to this processing of your personal
                    information.
                  </Text>
                ) : null}
              </>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
