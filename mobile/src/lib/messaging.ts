import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';

export const MESSAGING_RULES_VERSION = '2026-11-05';
export const MESSAGE_LIMIT = 4000;
export type ChatKind = 'direct' | 'group' | 'event_announcements' | 'event_discussion' | 'help';
export type ChatCard = { eventId: number; title: string; date: string; tab: 'Overview' | 'Draws' | 'Results'; poster?: string | null; venue?: string | null; city?: string | null; tier?: string | null };
export type EventSenderRole = 'admin' | 'organiser' | 'player';
export function eventRoleLabel(role: unknown) { return role === 'admin' ? 'Admin' : role === 'organiser' ? 'Organiser' : role === 'player' ? 'Player' : 'Participant'; }
export type ChatMessage = {
  id: string; seq: number; body: string; mine: boolean; sender: { id: string | null; name: string; image: string | null; role?: EventSenderRole | null };
  audience?: { all: boolean; divisions: string[] } | null;
  createdAt: string; deleted: boolean; reply: { id: string; body: string; name: string; role?: EventSenderRole | null; mine?: boolean } | null; card: ChatCard | null;
};
export type Conversation = {
  helpRequest?: import('./help-requests').HelpRequest;
  id: string; kind: ChatKind; eventId: number | null; title: string; image: string | null;
  state: 'pending' | 'accepted' | 'declined'; incoming: boolean; muted: boolean; archived: boolean;
  unread: number; preview: string; updatedAt: string; canSend: boolean; reason: string | null;
  manager: boolean; paused: boolean; pinned: ChatMessage | null;
  group?: boolean; official?: boolean; memberCount?: number; organisation?: string | null;
  lastMessageId?: string | null; lastMessageMine?: boolean; lastMessageSeq?: number | null;
  notificationMessageId?: string | null; notificationSeq?: number | null; notificationIsReply?: boolean;
};
export type MessagingStatus = {
  enabled: boolean; groupsEnabled?: boolean; interactive: boolean; rulesAccepted: boolean; needsBirthDate: boolean; junior: boolean;
  juniorsEnabled: boolean; allowRequests: boolean; supportAllowed?: boolean; consents: { id: string; name: string; active: boolean }[];
};
export type MessagePage = { conversation: Conversation; messages: ChatMessage[]; next: number | null };
export type MessagingEvent = { id: number; title: string; date: string; manager: boolean; access: number };
export type MessagingReport = { id: string; reason: string; status: string; evidence: ChatMessage; createdAt: string };
export class MessagingError extends Error {
  constructor(message: string, public readonly denied = false) { super(message); this.name = 'MessagingError'; }
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function conversationId(value: unknown): string {
  if (typeof value !== 'string' || !uuid.test(value)) throw new MessagingError('This conversation is unavailable.', true);
  return value;
}
export function messageText(value: string, request = false) {
  const text = value.trim();
  if (!text || Array.from(text).length > (request ? 300 : MESSAGE_LIMIT)) throw new MessagingError(request ? 'Introduce yourself in 1 to 300 characters.' : 'Write a message of up to 4,000 characters.');
  return text;
}
export function mergeMessages(previous: ChatMessage[], incoming: ChatMessage[]) {
  const rows = new Map(previous.map(row => [row.id, row]));
  for (const row of incoming) rows.set(row.id, row);
  return [...rows.values()].sort((a, b) => a.seq - b.seq).slice(-300);
}
/** Do not turn a player-supplied avatar URL into a tracking request. */
export function messagingImageUrl(value: string | null | undefined, storageUrl: string | undefined): string | null {
  if (!value || !storageUrl) return null;
  try {
    const url = new URL(value), origin = new URL(storageUrl);
    if (url.protocol !== 'https:' || url.origin !== origin.origin || url.username || url.password
      || !/^\/storage\/v1\/(?:object|render\/image)\/public\/profile-pics\//.test(url.pathname)) return null;
    return url.origin + url.pathname;
  } catch { return null; }
}
export function unreadConversations(rows: Conversation[]) {
  return rows.filter(row => !row.archived && row.state === 'accepted' && row.unread > 0).length;
}
export function unreadMessages(rows: Conversation[]) {
  return rows.filter(row => !row.archived && (row.state === 'accepted' || (row.state === 'pending' && row.incoming)))
    .reduce((total, row) => total + Math.max(0, row.unread), 0);
}
export function incomingChange(previous: Conversation[], next: Conversation[]) {
  const prior = new Map(previous.map(row => [row.id, row]));
  return next.find(row => {
    if (row.archived || row.muted || row.unread <= 0) return false;
    const before = prior.get(row.id);
    if ('notificationMessageId' in row) return !!row.notificationMessageId
      && row.notificationMessageId !== before?.notificationMessageId
      && (row.notificationSeq || 0) > (before?.lastMessageSeq || 0);
    // Compatibility with snapshots from an earlier server during a rolling update.
    return !!row.lastMessageId && !row.lastMessageMine && before?.lastMessageId !== row.lastMessageId;
  });
}

export function messagingFailure(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || error.code === '42883') return new MessagingError('Messaging is getting ready. Please check back soon.', true);
  // Never surface SQL details, raw requests or private data through native alerts.
  const text = error.message || '';
  const allowed = /^(Sign in again|Complete your player profile|Messaging is |Complete messaging setup|Introduce yourself|Write a message|You cannot send|This conversation|This event conversation|That reply|Choose a published|You’re sending|You have reached|Please try again|Register for this event|Verify your account|Event messaging access|This request|Choose Accept|This message could not|Enter a separate guardian|Guardian consent is|This consent invitation|Sign in again and confirm|Consent not found|Confirm your event entry|Please review the latest|Update the app|Choose up to|Choose at least|Write a group|This group)/;
  return new MessagingError(allowed.test(text) && text.length < 240 ? text : 'Messages could not be loaded or saved. Please try again.', error.code === '42501');
}
export async function messaging<T = Record<string, never>>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const { data: result, error } = action === 'mark_unread'
    ? await supabase.rpc('messaging_mark_unread', { p_conversation: conversationId(data.conversationId), p_message: data.messageId || null })
    : action === 'conversation_delete'
    ? await supabase.rpc('messaging_delete_conversation', { p_conversation: conversationId(data.conversationId) })
    : await supabase.rpc('messaging_api', { p_action: action, p_data: data });
  if (error) throw messagingFailure(error);
  return result as T;
}
export async function messagingStatus(): Promise<MessagingStatus> {
  try { return await messaging<MessagingStatus>('status'); }
  catch (error) {
    if (error instanceof MessagingError && error.message.startsWith('Messaging is getting ready')) return { enabled: false, interactive: false, rulesAccepted: false, needsBirthDate: false, junior: false, juniorsEnabled: false, allowRequests: true, consents: [] };
    throw error;
  }
}
export function newMessageKey() { return Crypto.randomUUID(); }
export function readConversation(id: string, before?: number) {
  return messaging<MessagePage>('read', { conversationId: conversationId(id), ...(before ? { before } : {}) });
}
export function sendMessage(id: string, body: string, clientId: string, replyId?: string, card?: ChatCard) {
  return messaging<ChatMessage>('send', { conversationId: conversationId(id), body: card ? body.trim() : messageText(body), clientId,
    replyId, eventId: card?.eventId, cardTab: card?.tab });
}
