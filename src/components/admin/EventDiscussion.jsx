import { eventProfileImage } from '../../utils/messagingImage.js';
import React, { useEffect, useRef, useState } from 'react';
import { Flag, MessageCircle, Reply, ShieldCheck, Trash2, UserRound, X } from 'lucide-react';
const roles = { admin: { label: 'Admin', icon: ShieldCheck }, organiser: { label: 'Organiser', icon: Flag }, player: { label: 'Player', icon: UserRound } };
const roleOf = role => roles[role] || { label: 'Participant', icon: UserRound };
const initials = name => String(name || 'Player').trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
const day = value => new Date(value).toLocaleDateString('en-ZA', { weekday: 'short', day: 'numeric', month: 'short' });
const time = value => new Date(value).toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' });
export function EventPlayerAvatar({ sender, compact = false, storageOrigin = import.meta.env?.VITE_SUPABASE_URL }) {
    const [failed, setFailed] = useState(null);
    const image = eventProfileImage(sender.image, storageOrigin);
    return <span className={`em-chat-avatar em-avatar-${roles[sender.role] ? sender.role : 'participant'}${compact ? ' is-compact' : ''}`} aria-hidden="true">{initials(sender.name)}{image && failed !== image && <img src={image} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(image)} />}</span>;
}
export function EventRoleBadge({ role }) {
    const definition = roleOf(role);
    return <span className={`em-role em-role-${roles[role] ? role : 'participant'}`} title="Event role">{React.createElement(definition.icon, { size: 12, 'aria-hidden': true })}{definition.label}</span>;
}
export function EventReplyPreview({ message, onCancel }) {
    if (!message) return null;
    return <div className="em-reply-draft" role="status"><Reply size={16} aria-hidden="true" /><div><strong>Replying to {message.mine ? 'yourself' : message.sender.name}</strong><EventRoleBadge role={message.sender.role} /><p>{message.body || message.card?.title || 'Event message'}</p></div><button type="button" aria-label="Cancel reply" onClick={onCancel}><X size={17} /></button></div>;
}
export default function EventDiscussion({ messages, next, busy, canSend, onReply, onRemove, onEarlier, canRemove = () => true, label = 'Event discussion', emptyTitle = 'Start the event discussion', emptyDetail = 'Players and the event team can talk here. Names and role labels show who is speaking; use Reply to answer a specific message.' }) {
    const viewport = useRef(null), follow = useRef(true);
    const last = messages.at(-1);
    useEffect(() => { if (viewport.current && (follow.current || last?.mine)) viewport.current.scrollTop = viewport.current.scrollHeight; }, [last?.id, last?.mine]);
    return <div className="em-discussion-thread" ref={viewport} aria-label={label} onScroll={() => { const element = viewport.current; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 100; }}>
        {next && <button type="button" className="em-secondary em-earlier" disabled={busy} onClick={onEarlier}>Earlier messages</button>}
        {!messages.length ? <div className="em-stream-empty"><MessageCircle size={30} /><h3>{emptyTitle}</h3><p>{emptyDetail}</p></div> : messages.map((message, index) => <React.Fragment key={message.id}>
            {(!index || day(message.createdAt) !== day(messages[index - 1].createdAt)) && <div className="em-chat-day"><span>{day(message.createdAt)}</span></div>}
            <article className={`em-chat-row ${message.mine ? 'is-mine' : 'is-incoming'}`} aria-label={`${message.mine ? 'Your' : message.sender.name + '’s'} message · ${roleOf(message.sender.role).label}`}>
                <EventPlayerAvatar sender={message.sender} />
                <div className="em-chat-message"><header><div className="em-chat-author"><strong>{message.mine ? 'You' : message.sender.name}</strong>{message.mine && <span>{message.sender.name}</span>}<EventRoleBadge role={message.sender.role} /></div><time dateTime={message.createdAt} title={new Date(message.createdAt).toLocaleString('en-ZA')}>{time(message.createdAt)}</time></header>
                    <div className="em-chat-bubble">
                        {message.reply && !message.deleted && <blockquote className="em-chat-quote"><span><Reply size={12} aria-hidden="true" />Reply to {message.reply.mine ? 'you' : message.reply.name}<EventRoleBadge role={message.reply.role} /></span><p>{message.reply.body || 'Event message'}</p></blockquote>}
                        <p className={message.deleted ? 'em-chat-removed' : ''}>{message.deleted ? 'Message removed' : message.body || message.card?.title}</p>
                    </div>
                    {!message.deleted && <div className="em-chat-actions">{canSend && <button type="button" disabled={busy} onClick={() => onReply(message)} aria-label={`Reply to ${message.sender.name}`}><Reply size={13} />Reply</button>}{canRemove(message) && <button type="button" disabled={busy} onClick={() => onRemove(message)} aria-label={`Remove message from ${message.sender.name}`}><Trash2 size={12} />Remove</button>}</div>}
                </div>
            </article>
        </React.Fragment>)}
    </div>;
}
