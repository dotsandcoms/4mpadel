export const SUPPORT_EMAIL = 'info@4mpadel.co.za';
export const HELP_TOPICS = [
  { id: 'entry', title: 'Tournament or entry', icon: 'tennisball-outline', answer: 'Open My entries on your profile, select your tournament and choose Manage entry to review your partner, division and entry status. If you need help, include the event below.' },
  { id: 'payment', title: 'Payment or refund', icon: 'wallet-outline', answer: 'Payments & refunds on your profile shows your transaction history. If a payment looks wrong, include its reference below and describe what happened. Never include card details or banking passwords.' },
  { id: 'profile', title: 'Profile, rankings or licence', icon: 'person-outline', answer: 'Edit profile lets you update your personal and player details. You can view your SAPA licence from Account & settings. For a ranking query, tell us which ranking and event you are referring to.' },
  { id: 'problem', title: 'Report a problem', icon: 'bug-outline', answer: 'Tell us which screen you were on, what you expected to happen and what happened instead. You can attach a screenshot in your email app.' },
  { id: 'other', title: 'Something else', icon: 'chatbubble-ellipses-outline', answer: 'Tell the 4M team what you need help with. Please include enough detail for us to understand your enquiry.' },
  { id: 'guide', title: 'How 4M works', icon: 'book-outline', answer: 'Discover tournaments and enter with your partner. Track entries and payments from your profile. In Players, explore local 4M players and international pros, build your follow list, browse rankings and follow the tours. Add events to your calendar and choose your notifications in settings.' },
  { id: 'deletion', title: 'Request account deletion', icon: 'trash-outline', answer: 'You can ask the 4M team to delete your account. Sending a request does not immediately delete your profile. The team will confirm the steps with you and explain how any outstanding entries or records are handled.' },
] as const;
export type HelpTopic = (typeof HELP_TOPICS)[number]['id'];
export function supportEmailUrl({ topic, message, context, name, email }: { topic: string; message: string; context?: string; name?: string; email?: string }) {
  const body = [message.trim(), '', context ? `Related item: ${context}` : '', name ? `Name: ${name}` : '', email ? `Account email: ${email}` : '', '', 'Sent from the 4M Padel app'].filter(line => line !== undefined).join('\n');
  return `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(`4M app — ${topic}`)}&body=${encodeURIComponent(body)}`;
}
