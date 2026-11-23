import { Plus, Send, X } from 'lucide-react';
import SearchableDropdown from '../../components/SearchableDropdown';
import { senderOption, usePlayerMessaging } from '../../components/admin/usePlayerMessaging';
import { CommunicationFeedback, CommunicationPages } from './CommunicationControls';
import { communicationDate } from './communicationDate';
import CommunicationThread, { ReplyDraft } from './CommunicationThread';

function PlayerQueue({ state }) {
  const { rows, scopes, filters, changeFilter, inboxLoading, inboxError, cursors, setCursors, setRows, next, loadInbox, openConversation } = state;
  return <>
    <div className="ap-comms-filter ap-comms-player-filters">
      <label className="ap-comms-field"><span>Search conversations</span><input type="search" value={filters.query} maxLength={120} placeholder="Player or group name" onChange={event => changeFilter('query', event.target.value)} /></label>
      <label className="ap-comms-field"><span>Send as</span><SearchableDropdown value={filters.scope} onChange={event => changeFilter('scope', event.target.value)}>
        <option value="all">All your senders</option>{scopes.map(item => <option key={item.id} value={item.id}>{senderOption(item).label}</option>)}
      </SearchableDropdown></label>
      <label className="ap-comms-field"><span>Status</span><SearchableDropdown value={filters.status} onChange={event => changeFilter('status', event.target.value)}>
        <option value="all">All statuses</option><option value="unread">Unread</option><option value="waiting">Awaiting acceptance</option>
      </SearchableDropdown></label>
      <label className="ap-comms-field"><span>Type</span><SearchableDropdown value={filters.kind} onChange={event => changeFilter('kind', event.target.value)}>
        <option value="all">All types</option><option value="private">Private</option><option value="group">Group</option>
      </SearchableDropdown></label>
    </div>
    <CommunicationFeedback error={inboxError} />
    <div className="ap-comms-table-scroll" tabIndex={0} role="region" aria-label="Player conversations">
      <table className="ap-comms-table" aria-busy={inboxLoading}>
        <thead><tr>{['Conversation', 'Players', 'Send as', 'Type', 'Status', 'Updated'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.id} className={row.unread > 0 ? 'ap-comms-recent' : undefined}>
            <td><button type="button" className="ap-comms-row-button" onClick={() => openConversation(row)}>{row.title || 'Player conversation'}</button>
              <small>{row.lastMessageMine ? 'You: ' : ''}{row.preview || (row.lastMessageId ? 'Shared content' : 'No messages yet')}</small></td>
            <td>{row.participants?.join(', ') || 'Player'}{row.participantCount > 3 && <small>+{row.participantCount - 3} more</small>}</td>
            <td>{row.senderLabel || row.organisation || 'Authorised team'}</td>
            <td><span className={`ap-status ap-status--${row.group ? 'violet' : 'info'}`}>{row.group ? 'Group' : 'Private'}</span></td>
            <td>{row.unread > 0 && <div>{row.unread} unread</div>}{row.waitingCount > 0 && <div>Awaiting acceptance</div>}{!row.unread && !row.waitingCount && (row.canSend ? 'Up to date' : 'Read only')}</td>
            <td><time dateTime={row.updatedAt}>{communicationDate(row.updatedAt)}</time></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={6}>{inboxLoading ? 'Loading conversations…' : inboxError ? 'Conversations could not be loaded.' : 'No conversations match this view.'}</td></tr>}
        </tbody>
      </table>
    </div>
    <CommunicationPages label="Player conversation pages" pageNumber={cursors.length}
      previous={!inboxLoading && cursors.length > 1 ? () => { setRows([]); setCursors(current => current.slice(0, -1)); } : undefined}
      next={!inboxLoading && next ? () => { setRows([]); setCursors(current => [...current, next]); } : undefined}>
      {rows.length} conversations
    </CommunicationPages>
    <div className="ap-comms-actions"><button type="button" className="ap-secondary" disabled={inboxLoading} onClick={() => void loadInbox()}>{inboxError ? 'Retry conversations' : 'Refresh list'}</button></div>
  </>;
}

function Recipients({ state }) {
  const { query, setQuery, players, selected, busy, toggle, loading, searchError, setSearchAttempt, globalAudience } = state;
  return <section className="ap-section ap-comms-panel" aria-label="Recipients">
    <h3>Recipients</h3>
    <label className="ap-comms-field"><span>Search authorised players</span><input type="search" placeholder="Search players by name" value={query} maxLength={120} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
    {selected.length > 0 && <div className="ap-comms-actions">{selected.map(player => <button key={player.id} type="button" className="ap-comms-token" disabled={busy} aria-label={`Remove ${player.name}`} onClick={() => toggle(player)}>{player.name}<X size={13} aria-hidden="true" /></button>)}</div>}
    <p className="ap-comms-subtext">{selected.length} selected · {globalAudience ? 'Eligible players across 4M Padel' : 'Eligible players in your selected audience'}</p>
    {searchError && <><CommunicationFeedback error={searchError} /><div className="ap-comms-actions"><button type="button" className="ap-secondary" onClick={() => setSearchAttempt(value => value + 1)}>Retry player search</button></div></>}
    {loading ? <p role="status">Searching authorised players…</p> : !players.length && !searchError ? <p className="ap-comms-notice">{query.trim().length < 2 ? 'Enter at least two letters to find a player.' : 'No eligible players match this search.'}</p> : null}
    <ul className="ap-comms-list ap-comms-member-results">{players.map(player => <li key={player.id}><label className="ap-comms-check">
      <input type="checkbox" checked={selected.some(item => item.id === player.id)} disabled={busy} onChange={() => toggle(player)} />
      <span><strong>{player.name}</strong>{player.home_club && <small> · {player.home_club}</small>}</span>
    </label></li>)}</ul>
  </section>;
}

function PlayerComposer({ state }) {
  const { thread, page, mode, changeDelivery, title, setTitle, body, setBody, busy, selected, scopes, scope, reply,
    setReply, setReview, review, publish, ready } = state;
  const sendAs = scopes.find(item => item.id === scope);
  return <form className="ap-section ap-comms-panel" onSubmit={event => { event.preventDefault(); void publish(); }}>
    <h3>{thread ? 'Reply' : 'Write a message'}</h3>
    {!thread && <>
      <label className="ap-comms-field"><span>Delivery</span><SearchableDropdown value={mode} disabled={busy} onChange={event => changeDelivery(event.target.value)}>
        <option value="private">Separate private messages</option><option value="group">Shared group chat</option>
      </SearchableDropdown></label>
      <p className="ap-comms-subtext">{mode === 'private' ? 'Players each receive a private invitation, and replies stay private.' : 'Players choose whether to join. Joined members can see each other’s names and messages.'}</p>
      {mode === 'group' && <label className="ap-comms-field"><span>Group name</span><input value={title} maxLength={60} disabled={busy} onChange={event => { setTitle(event.target.value); setReview(false); }} /></label>}
    </>}
    <ReplyDraft reply={reply} onCancel={() => { setReply(null); setReview(false); }} />
    <label className="ap-comms-field"><span>{thread ? 'Message' : 'Introduction'}</span>
      <textarea id="player-message-body" rows={5} value={body} maxLength={thread ? 4000 : 300}
        disabled={busy || Boolean(thread && !page?.conversation.canSend)} onChange={event => { setBody(event.target.value); setReview(false); }} />
    </label>
    <p className="ap-comms-subtext">{Array.from(body).length}/{thread ? '4,000' : '300'} · Push alerts keep your message text private.</p>
    {review && <div className="ap-comms-review">
      <strong>{thread ? 'Send to this conversation' : mode === 'group' ? `Invite ${selected.length} players to “${title}”` : `Send privately to ${selected.length} players`}</strong>
      {sendAs && <p>Sending as {senderOption(sendAs).label}</p>}
      {!thread && <p>{selected.map(player => player.name).join(', ')}</p>}
      <p>{body}</p><div className="ap-comms-actions"><button type="button" className="ap-secondary" onClick={() => setReview(false)} disabled={busy}>Edit message</button></div>
    </div>}
    <div className="ap-comms-actions"><button className="ap-primary" disabled={!ready}><Send size={15} aria-hidden="true" />{busy ? 'Sending…' : review ? thread ? 'Send message' : 'Send invitations' : 'Review message'}</button></div>
    {thread && page?.conversation.reason && <p className="ap-comms-subtext">{page.conversation.reason}</p>}
  </form>;
}

export default function PlayerMessagesWorkspace({ rpc, owner }) {
  const state = usePlayerMessaging({ rpc, owner });
  const { scope, scopes, view, error, feedback, busy, clearDraft, setView, showInbox, chooseScope, thread, page, setReview, setReply, remove, loadThread } = state;
  return <section className="ap-communications" aria-label="Player messages">
    <div className="ap-comms-inline-row">
      <div className="ap-comms-title"><h2>Player messages</h2><p className="ap-comms-subtext">Official private messages and groups.</p></div>
      {view === 'inbox' ? <button type="button" className="ap-primary" onClick={() => { clearDraft(); setView('compose'); }} disabled={!scopes.length}><Plus size={15} aria-hidden="true" />New message</button>
        : <button type="button" className="ap-secondary" onClick={showInbox} disabled={busy}>Back to conversations</button>}
    </div>
    <CommunicationFeedback error={error} message={feedback} />
    {view === 'inbox' ? <PlayerQueue state={state} /> : <>
      {view === 'compose' && <div className="ap-section ap-comms-panel">
        <label className="ap-comms-field ap-comms-max-form"><span>Send as</span><SearchableDropdown value={scope} onChange={event => chooseScope(event.target.value)} disabled={busy}>
          <option value="">Choose a sender</option>{scopes.map(item => <option key={item.id} value={item.id}>{senderOption(item).label}</option>)}
        </SearchableDropdown></label>
        {!scopes.length && <p className="ap-comms-notice">Your account has no authorised player-messaging audience.</p>}
      </div>}
      {scope && <div className="ap-comms-grid">
        {thread ? <section className="ap-section ap-comms-panel">
          <h3>{page?.conversation.title || 'Loading conversation…'}</h3>
          <p className="ap-comms-subtext">{page?.conversation.group ? 'Shared group · visible to joined members' : 'Private conversation · visible to participants'}</p>
          {page && <CommunicationThread messages={page.messages} busy={busy} canRemove={message => message.mine}
            earlier={page.next ? () => void loadThread(thread, page.next) : undefined} onRemove={remove}
            onReply={page.conversation.canSend ? message => { setReply(message); setReview(false); } : undefined} />}
        </section> : <Recipients state={state} />}
        <PlayerComposer state={state} />
      </div>}
    </>}
  </section>;
}
