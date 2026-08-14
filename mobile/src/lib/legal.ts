import { router } from 'expo-router';

export type LegalKind = 'terms' | 'privacy';

export const LEGAL: Record<LegalKind, { title: string; intro: string; points: string[] }> = {
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

export function openLegal(kind: LegalKind) {
  router.push({ pathname: '/legal', params: { kind } });
}

export function parseLegalKind(value: string | string[] | undefined): LegalKind {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === 'privacy' ? 'privacy' : 'terms';
}
