import type { HelpRequest } from './help-requests';
import type { Conversation } from './messaging';

/** A Messages row is a projection of the ticket, never a second copy of its transcript. */
export function helpConversation(request: HelpRequest): Conversation {
  return {
    id: request.id, kind: 'help', helpRequest: request, eventId: request.eventId,
    title: request.isOwner ? request.eventName || request.recipient : request.requester.name || request.requester.email || 'Player enquiry',
    image: null, state: 'accepted', incoming: true, muted: false, archived: false,
    unread: Math.max(0, request.unread || 0), preview: request.preview, updatedAt: request.updatedAt,
    canSend: true, reason: null, manager: request.canManage, paused: false, pinned: null,
    lastMessageId: request.lastMessageId, lastMessageSeq: request.lastSeq,
  };
}
export function conversationFilter(row: Conversation, filter: string, query: string) {
  if (filter === 'Help' && row.kind !== 'help') return false;
  if (filter === 'Players' && row.kind !== 'direct') return false;
  if (filter === 'Groups' && row.kind !== 'group') return false;
  if (filter === 'Events' && !['event_announcements', 'event_discussion'].includes(row.kind)) return false;
  if (filter === 'Requests' ? row.state !== 'pending' || !row.incoming : row.state === 'pending' && row.incoming) return false;
  if (filter === 'Archived' ? !row.archived : row.archived) return false;
  const searchable = [row.title, row.helpRequest?.reference, row.helpRequest?.eventName, row.helpRequest?.recipient, row.helpRequest?.requester.name].filter(Boolean).join(' ').toLocaleLowerCase();
  return searchable.includes(query.toLocaleLowerCase().trim());
}
