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
      'Messaging uses your verified account and event participation to limit access. Phone numbers, emails, dates of birth and identity details are excluded from chat profiles. Direct messages are visible to their participants; event discussion is visible to eligible players and authorised organisers.',
      'Messages are encrypted in transit and storage, with controlled access for reported content and security operations. Direct messages expire after 12 months and event content after 90 days. Reported evidence may be retained separately for moderation or a documented legal hold.',
      'Junior interactive messaging requires recorded guardian consent. The invited guardian verifies their email, signs in and declares legal authority to consent. Consent can be revoked from their account.',
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
