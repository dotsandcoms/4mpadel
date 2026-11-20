import React from 'react';
import { ArrowLeft, Plus, Search, Send, X } from 'lucide-react';
import EventDiscussion, { EventPlayerAvatar, EventReplyPreview } from './EventDiscussion';
import SearchableSelect from './SearchableSelect';
import PlayerMessageInbox from './PlayerMessageInbox';
import { senderOption, usePlayerMessaging } from './usePlayerMessaging';
import './player-messaging.css';

export default function PlayerMessaging({ rpc, owner }) {
    const {
        scopes, scope, query, setQuery, players, selected, mode, changeDelivery, title, setTitle, body, setBody,
        review, setReview, rows, setRows, thread, page, reply, setReply, view, setView, filters, cursors, setCursors,
        next, inboxLoading, inboxError, searchError, setSearchAttempt, loading, busy, error, feedback,
        loadInbox, loadThread, clearDraft, changeFilter, chooseScope, showInbox, openConversation, toggle,
        publish, remove, globalAudience, ready
    } = usePlayerMessaging({ rpc, owner });
    return <section className="pm-workspace" aria-label="Player messages">
        <div className="pm-intro"><div><h3>Player messages</h3><p>Private messages and groups, outside an event chat.</p></div>{view === 'inbox' ? <button type="button" className="pm-new-message" onClick={() => { clearDraft(); setView('compose'); }} disabled={!scopes.length}><Plus size={17} aria-hidden="true" />New message</button> : <button type="button" className="em-secondary" onClick={showInbox} disabled={busy}><ArrowLeft size={16} aria-hidden="true" />Back to conversations</button>}</div>
        {error && <p role="alert" className="em-error">{error}</p>}{feedback && <p role="status" className="em-feedback">{feedback}</p>}
        {view === 'inbox' ? <PlayerMessageInbox rows={rows} scopes={scopes.map(row => ({ ...row, label: senderOption(row).label }))} filters={filters} onFilter={changeFilter} loading={inboxLoading} error={inboxError} next={next} pageNumber={cursors.length} onNext={() => { if (next) { setRows([]); setCursors(current => [...current, next]); } }} onPrevious={() => { setRows([]); setCursors(current => current.slice(0, -1)); }} onRefresh={() => void loadInbox()} onOpen={openConversation} /> : <>
        {view === 'compose' && <><label className="pm-label" htmlFor="player-message-scope">Send as</label>
        <div className="pm-audience-picker"><SearchableSelect id="player-message-scope" value={scope} disabled={busy}
            options={scopes.map(senderOption)} onChange={chooseScope}
            emptyLabel="Choose who you’re sending as" searchPlaceholder="Search organisations or event teams…" /></div>
        {!!scopes.length && <p className="pm-help">{globalAudience ? 'Super Admin: search eligible players across 4M Padel and message them as this organisation, even if they are not linked to it.' : scope === 'platform' ? 'Search eligible players across 4M Padel. Each player’s messaging preferences still apply.' : scope.startsWith('event:') ? 'Your access covers this event’s players. Messages are sent privately, outside its event chat.' : scope ? 'Search eligible players linked to this organisation. No event selection is needed.' : 'Choose the organisation you’re messaging from. Your profile permissions determine which players you can contact.'}</p>}
        {!scopes.length && <p className="pm-help">No player-messaging audiences are assigned to this profile. Broad admin navigation access does not grant access to another organisation’s players.</p>}</>}
        {scope && <div className="pm-grid"><div className="pm-panel">
            <header className="pm-panel-heading"><h4>{thread ? page?.conversation.title || 'Loading conversation…' : 'Recipients'}</h4></header>
            {thread ? <><p className="pm-help">{page?.conversation.group ? 'Shared group · joined members can see messages' : 'Private conversation · only its participants can read it'}</p>{page && <EventDiscussion messages={page.messages} next={page.next} busy={busy} canSend={page.conversation.canSend} canRemove={message => message.mine} label="Player conversation" emptyTitle="Your conversation" emptyDetail="Messages and replies will appear here after the player accepts." onReply={message => { setReply(message); setReview(false); }} onRemove={remove} onEarlier={() => void loadThread(thread, page.next)} />}</> : <>
                <label className="pm-search"><Search size={18} /><input aria-label="Search authorised players" value={query} placeholder="Search players by name" maxLength={120} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
                {!!selected.length && <div className="pm-selected">{selected.map(player => <button key={player.id} type="button" disabled={busy} aria-label={`Remove ${player.name}`} onClick={() => toggle(player)}>{player.name}<X size={13} /></button>)}</div>}
                <p className="pm-help">{selected.length} selected · {globalAudience ? 'Players across 4M Padel who can receive requests appear here' : 'Only players within this audience who can receive requests appear here'}</p>
                <div className="pm-players" aria-busy={loading}>{players.map(player => <label key={player.id} className="pm-player"><input type="checkbox" checked={selected.some(row => row.id === player.id)} disabled={busy} onChange={() => toggle(player)} /><EventPlayerAvatar sender={{ name: player.name, image: player.image_url }} compact /><span><strong>{player.name}</strong><small>{player.home_club || '4M Padel player'}</small></span></label>)}{loading ? <p className="pm-help" role="status">Searching your authorised players…</p> : searchError ? <div className="pm-search-error" role="alert"><p>Player search could not be completed. {searchError}</p><button type="button" className="em-secondary" onClick={() => setSearchAttempt(value => value + 1)}>Retry player search</button></div> : !players.length && <p className="pm-help">{query.trim().length < 2 ? 'Enter at least two letters to find a player.' : 'No eligible players match this search.'}</p>}</div>
            </>}
        </div><form className="pm-panel pm-composer" onSubmit={event => { event.preventDefault(); void publish(); }}>
            <header className="pm-panel-heading"><h4>{thread ? 'Reply' : 'Write a message'}</h4><Send size={18} /></header>
            {!thread && <><label className="pm-label" htmlFor="player-message-delivery">Delivery</label><select id="player-message-delivery" className="pm-select" value={mode} disabled={busy} onChange={event => changeDelivery(event.target.value)}><option value="private">Separate private messages</option><option value="group">Shared group chat</option></select><p className="pm-help">{mode === 'private' ? 'Each player receives a private invitation. Recipients cannot see each other or their replies.' : 'Players choose whether to join. Joined members can see each other’s profiles and messages.'}</p>{mode === 'group' && <><label className="pm-label" htmlFor="player-message-title">Group name</label><input id="player-message-title" className="pm-select" value={title} maxLength={60} disabled={busy} onChange={event => { setTitle(event.target.value); setReview(false); }} /></>}</>}
            {reply && <EventReplyPreview message={reply} onCancel={() => { setReply(null); setReview(false); }} />}
            <label className="pm-label" htmlFor="player-message-body">{thread ? 'Message' : 'Introduction'}</label><textarea id="player-message-body" maxLength={thread ? 4000 : 300} disabled={busy || !!thread && !page?.conversation.canSend} value={body} placeholder={thread ? 'Write your reply' : 'Introduce yourself and explain why you’re getting in touch'} onChange={event => { setBody(event.target.value); setReview(false); }} />
            <p className="pm-help">{Array.from(body).length}/{thread ? '4,000' : '300'} · Push alerts contain no message text</p>
            {review && <div className="pm-review"><p className="pm-help">Sending as {scopes.find(row => row.id === scope) ? senderOption(scopes.find(row => row.id === scope)).label : 'your authorised team'}</p><strong>{thread ? 'Send to this conversation' : mode === 'group' ? `Invite ${selected.length} players to “${title}”` : `Send privately to ${selected.length} ${selected.length === 1 ? 'player' : 'players'}`}</strong>{!thread && <p>{selected.map(row => row.name).join(', ')}</p>}<p>{body}</p><button type="button" className="em-text-button" onClick={() => setReview(false)}>Edit message</button></div>}
            <button className="pm-send" type="submit" disabled={!ready}><Send size={17} />{busy ? 'Sending…' : review ? thread ? 'Send reply' : mode === 'group' ? 'Create group & send invitations' : 'Send private messages' : 'Review message'}</button>
        </form></div>}
        </>}
    </section>;
}
