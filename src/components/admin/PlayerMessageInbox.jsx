import React from 'react';
import { ArrowRight, RefreshCw, Search } from 'lucide-react';

const date = value => {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
};

export default function PlayerMessageInbox({ rows, scopes, filters, onFilter, loading, error, next, pageNumber, onNext, onPrevious, onRefresh, onOpen }) {
    return <section className="pm-inbox" aria-label="Player conversation list">
        <div className="pm-inbox-filters">
            <label className="pm-filter pm-filter-search">Search conversations<span className="pm-search"><Search size={18} aria-hidden="true" /><input value={filters.query} maxLength={120} placeholder="Player or group name" onChange={event => onFilter('query', event.target.value)} /></span></label>
            <label className="pm-filter">Send as<select value={filters.scope} onChange={event => onFilter('scope', event.target.value)}><option value="all">All your senders</option>{scopes.map(row => <option key={row.id} value={row.id}>{row.label}</option>)}</select></label>
            <label className="pm-filter">Status<select value={filters.status} onChange={event => onFilter('status', event.target.value)}><option value="all">All statuses</option><option value="unread">Unread</option><option value="waiting">Awaiting acceptance</option></select></label>
            <label className="pm-filter">Type<select value={filters.kind} onChange={event => onFilter('kind', event.target.value)}><option value="all">All types</option><option value="private">Private</option><option value="group">Group</option></select></label>
        </div>
        {error && <div className="em-error pm-queue-error" role="alert"><span>{error}</span><button className="em-secondary" type="button" disabled={loading} onClick={onRefresh}>Retry conversations</button></div>}
        <div className="pm-table-scroll" tabIndex={0} role="region" aria-label="Conversations, scroll horizontally for more columns" aria-busy={loading}>
            <table className="pm-table"><caption className="sr-only">Player conversations you started as an authorised sender. Open a conversation to read and reply.</caption>
                <thead><tr>{['Conversation', 'Players', 'Send as', 'Type', 'Status', 'Updated'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead>
                <tbody>{rows.map(row => <tr key={row.id} className={`pm-conversation-row${row.unread ? ' pm-row-unread' : ''}`} onClick={event => { if (!event.target.closest('button,a,input,select,textarea') && !window.getSelection()?.toString()) onOpen(row); }}>
                    <td><button className="pm-conversation-link" type="button" onClick={() => onOpen(row)}><strong>{row.title || 'Player conversation'}</strong><ArrowRight size={16} aria-hidden="true" /><span className="sr-only"> — open conversation</span></button><p className="pm-message-preview">{row.lastMessageMine ? 'You: ' : ''}{row.preview || (row.lastMessageId ? 'Shared content' : 'No messages yet')}</p></td>
                    <td><span className="pm-player-names">{row.participants?.join(', ') || 'Player'}</span>{row.participantCount > 3 && <small>+{row.participantCount - 3} more</small>}</td>
                    <td>{row.senderLabel || row.organisation || 'Authorised team'}</td>
                    <td><span className={`pm-type ${row.group ? 'pm-type-group' : 'pm-type-private'}`}>{row.group ? 'Group' : 'Private'}</span></td>
                    <td><div className="pm-statuses">{row.unread > 0 && <span className="pm-badge pm-badge-unread">{row.unread} unread</span>}{row.waitingCount > 0 && <span className="pm-badge pm-badge-waiting">Awaiting acceptance</span>}{!row.unread && !row.waitingCount && <span className="pm-status-text">{row.canSend ? 'Up to date' : 'Read only'}</span>}</div></td>
                    <td><time dateTime={row.updatedAt}>{date(row.updatedAt)}</time></td>
                </tr>)}
                {!rows.length && <tr><td colSpan={6} className="pm-queue-empty">{loading ? 'Loading conversations…' : error ? 'Conversations could not be loaded.' : filters.query || filters.status !== 'all' || filters.kind !== 'all' || filters.scope !== 'all' ? 'No conversations match these filters.' : 'No player conversations yet. Choose New message to contact a player.'}</td></tr>}
                </tbody>
            </table>
        </div>
        <div className="pm-queue-footer"><p role="status">{loading ? 'Updating conversations…' : `${rows.length} conversations shown · Most recent first`}</p><div><button className="em-secondary" type="button" onClick={onRefresh} disabled={loading}><RefreshCw size={14} aria-hidden="true" />Refresh list</button><><button className="em-secondary" type="button" disabled={loading || pageNumber === 1} onClick={onPrevious}>Previous</button><span>Page {pageNumber}</span><button className="em-secondary" type="button" disabled={loading || !next} onClick={onNext}>Next</button></></div></div>
        <p className="pm-help">Conversations you started as an authorised sender appear here. Other players’ private chats cannot be browsed.</p>
    </section>;
}
