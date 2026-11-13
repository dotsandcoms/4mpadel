import * as Crypto from 'expo-crypto';
import { supabase } from './supabase';
import type { SupportRelatedOption } from './support-related';

export type HelpRoute = { entryId?: string | null; entryDetail?: string; supportAlert?: 'queued' | 'sent' | 'needs_review' | null; team: 'organiser' | '4m'; recipient: string; email: string; emailFallback: boolean; eventId: number | null; eventName: string | null; context: string | null };
export type HelpRequest = HelpRoute & { id: string; reference: string; topic: string; status: 'open' | 'waiting_on_player' | 'resolved'; createdAt: string; updatedAt: string; preview: string; canManage: boolean; isOwner: boolean; unread: number; lastMessageId: string | null; lastSeq: number; requester: { name: string | null; email: string | null } };
export type HelpReply = { id: string; role: 'player' | 'organiser' | '4m'; body: string; createdAt: string; seq: number; mine: boolean; senderName: string | null };
export type HelpCursor = { before: string; beforeId: string };
export type HelpThread = { request: HelpRequest; messages: HelpReply[]; nextMessages: HelpCursor | null };
export const helpStatusLabel = (status: HelpRequest['status']) => ({ open: 'Open', waiting_on_player: 'Awaiting your reply', resolved: 'Resolved' })[status];
export const newHelpKey = () => Crypto.randomUUID();
export function helpReferenceData(topic: string, option?: SupportRelatedOption) {
  return { topic, ...(option?.entryId ? { entryId: option.entryId } : {}), ...(option?.eventId ? { eventId: option.eventId } : {}), ...(option?.paymentId ? { paymentId: option.paymentId, paymentKind: option.paymentKind } : {}) };
}
export async function helpApi<T>(action: string, data: Record<string, unknown> = {}): Promise<T> {
  const result = await supabase.rpc('help_api', { p_action: action, p_data: data });
  if (result.error) {
    if (['PGRST202','42883'].includes(result.error.code || '')) throw new Error('Help requests are getting ready. You can still contact the team by email.');
    const message = result.error.message || '';
    throw new Error(/^(Sign in again|Choose a help|Choose an available|This (help|payment|event|entry|request|reply)|Write a message|You have reached|Please wait|Verify your authenticator)/.test(message) && message.length < 240 ? message : 'Help requests could not load or save. Please try again.');
  }
  return result.data as T;
}
