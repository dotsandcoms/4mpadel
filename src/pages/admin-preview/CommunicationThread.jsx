import { useEffect, useRef } from 'react';
import { communicationDate } from './communicationDate';

const roles = { admin: 'Admin', organiser: 'Organiser', player: 'Player' };
const roleLabel = role => roles[role] || 'Participant';

export function ReplyDraft({ reply, onCancel }) {
  if (!reply) return null;
  return <div className="ap-comms-review" role="status">
    <strong>Replying to {reply.mine ? 'yourself' : reply.sender?.name || 'a participant'} · {roleLabel(reply.sender?.role)}</strong>
    <p>{reply.body || reply.card?.title || 'Event message'}</p>
    <div className="ap-comms-actions"><button type="button" className="ap-secondary" onClick={onCancel}>Cancel reply</button></div>
  </div>;
}

export default function CommunicationThread({ messages = [], earlier, busy, onReply, onRemove, canRemove = () => true }) {
  const viewport = useRef(null);
  const follow = useRef(true);
  const last = messages.at(-1);
  useEffect(() => {
    if (viewport.current && (follow.current || last?.mine)) viewport.current.scrollTop = viewport.current.scrollHeight;
  }, [last?.id, last?.mine]);
  return <div className="ap-comms-conversation" ref={viewport} aria-label="Conversation messages"
    onScroll={() => { const element = viewport.current; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
    {earlier && <div className="ap-comms-actions"><button className="ap-secondary" type="button" disabled={busy} onClick={earlier}>Earlier messages</button></div>}
    {!messages.length ? <p className="ap-comms-notice">No messages yet.</p> : <ol className="ap-comms-thread">
      {messages.map(message => <li key={message.id} className={`ap-comms-message${message.mine ? ' ap-comms-message--staff' : ''}`}>
        <header><strong>{message.mine ? 'You' : message.sender?.name || 'Participant'} · {roleLabel(message.sender?.role)}</strong><time dateTime={message.createdAt}>{communicationDate(message.createdAt)}</time></header>
        {!message.deleted && message.reply && <blockquote className="ap-comms-review">
          <strong>Reply to {message.reply.mine ? 'you' : message.reply.name} · {roleLabel(message.reply.role)}</strong>
          <p>{message.reply.body || 'Event message'}</p>
        </blockquote>}
        <p>{message.deleted ? 'Message removed' : message.body || message.card?.title}</p>
        {!message.deleted && <div className="ap-comms-actions">
          {onReply && <button type="button" className="ap-text-button" disabled={busy} onClick={() => onReply(message)}>Reply</button>}
          {onRemove && canRemove(message) && <button type="button" className="ap-text-button" disabled={busy} onClick={() => onRemove(message)}>Remove</button>}
        </div>}
      </li>)}
    </ol>}
  </div>;
}
