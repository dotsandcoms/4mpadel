import { useLocation, useNavigate } from 'react-router-dom';
import { useHelpUnread } from '../../components/admin/useHelpUnread';
import { useStaffHelpRequests } from '../../components/admin/useStaffHelpRequests';
import SearchableDropdown from '../../components/SearchableDropdown';
import { helpTopicText, helpStatusText } from '../../utils/helpRequests';
import { helpTicketFromSearch } from '../../utils/helpLinks';
import { CommunicationFeedback, CommunicationHeading, CommunicationPages } from './CommunicationControls';
import { communicationDate } from './communicationDate';
import PreviewAuthenticator from './PreviewAuthenticator';
import { eventContext } from './communicationEvent.js';

const statusTone = { resolved: 'positive', waiting_on_player: 'warning', open: 'info' };
const HelpStatus = ({ value }) => <span className={`ap-status ap-status--${statusTone[value] || 'neutral'}`}>{helpStatusText[value] || '—'}</span>;

function HelpQueue({ controller }) {
  const { rows, loading, query, changeQuery, status, changeStatus, team, changeTeam, open, cursors, setCursors, next } = controller;
  const empty = loading ? 'Loading requests…' : query || status || team ? 'No requests match these filters.' : 'No help requests yet.';
  return <>
    <div className="ap-comms-filter">
      <label className="ap-comms-field">
        <span>Search</span><input type="search" value={query} onChange={event => changeQuery(event.target.value)} placeholder="Name, email, event or ticket" maxLength={80} />
      </label>
      <label className="ap-comms-field">
        <span>Status</span><SearchableDropdown value={status} onChange={event => changeStatus(event.target.value)}>
          <option value="">All statuses</option>
          {Object.entries(helpStatusText).map(([key, text]) => <option key={key} value={key}>{text}</option>)}
        </SearchableDropdown>
      </label>
      <label className="ap-comms-field">
        <span>Team</span><SearchableDropdown value={team} onChange={event => changeTeam(event.target.value)}>
          <option value="">All teams</option><option value="organiser">Organisers</option><option value="4m">4M support</option>
        </SearchableDropdown>
      </label>
    </div>
    <div className="ap-comms-table-scroll">
      <table className="ap-comms-table" aria-busy={loading}>
        <caption className="ap-visually-hidden">Help requests</caption>
        <thead><tr>{['Ticket', 'From', 'Event / topic', 'Status', 'Team', 'Updated'].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>
          {rows.map(row => <tr key={row.id} className={row.unread ? 'ap-comms-recent' : undefined}>
            <td>
              <button type="button" className="ap-comms-row-button" onClick={() => void open(row.id)} aria-label={`Open ${row.reference} from ${row.requester.name || row.requester.email || 'player'}`}>{row.reference}{row.unread ? ` (${row.unread})` : ''}</button>
              {row.preview && <small>{row.preview}</small>}
            </td>
            <td><strong>{row.requester.name || 'Player'}</strong><small>{row.requester.email || 'Email unavailable'}</small></td>
            <td>{row.eventName || 'No linked event'}<small>{helpTopicText[row.topic]}{row.eventId ? ` · #${row.eventId}` : ''}</small></td>
            <td><HelpStatus value={row.status} /></td>
            <td>{row.recipient}</td>
            <td><time dateTime={row.updatedAt}>{communicationDate(row.updatedAt)}</time></td>
          </tr>)}
          {!rows.length && <tr><td colSpan={6}>{empty}</td></tr>}
        </tbody>
      </table>
    </div>
    <CommunicationPages label="Help request pages" pageNumber={cursors.length}
      previous={!loading && cursors.length > 1 ? () => setCursors(items => items.slice(0, -1)) : undefined}
      next={!loading && next ? () => setCursors(items => [...items, next]) : undefined}>{rows.length} requests shown</CommunicationPages>
  </>;
}

function HelpThread({ controller }) {
  const { thread, earlier, body, setBody, busy, sendReply, act } = controller;
  const { request, messages, nextMessages } = thread;
  const closed = request.status === 'resolved';
  return <div className="ap-comms-grid">
    <section className="ap-section ap-comms-panel" aria-label="Help conversation">
      <div className="ap-comms-inline-row">
        <div className="ap-comms-title"><p className="ap-kicker">{request.reference}</p><h2>{request.eventName || helpTopicText[request.topic]}</h2></div>
        <HelpStatus value={request.status} />
      </div>
      {nextMessages && <div className="ap-comms-actions"><button className="ap-secondary" type="button" disabled={busy} onClick={() => void earlier()}>Earlier messages</button></div>}
      <ol className="ap-comms-thread">
        {messages.map(message => <li key={message.id} className={`ap-comms-message${message.role === 'player' ? '' : ' ap-comms-message--staff'}`}>
          <header><strong>{message.senderName || (message.role === 'player' ? request.requester.name || 'Player' : message.role === '4m' ? '4M support' : 'Event organiser')}{message.mine ? ' · You' : ''}</strong><time dateTime={message.createdAt}>{communicationDate(message.createdAt)}</time></header>
          <p>{message.body}</p>
        </li>)}
      </ol>
      {closed ? <p className="ap-comms-notice">This request is resolved. Reopen it to send another message.</p> : <label className="ap-comms-field">
        <span>Reply to {request.requester.name || 'player'}</span>
        <textarea id="help-reply" value={body} onChange={event => setBody(event.target.value)} rows={4} maxLength={4000} disabled={busy} placeholder="Write your reply…" />
      </label>}
      <div className="ap-comms-actions">
        {!closed && <button type="button" className="ap-primary" disabled={busy || !body.trim()} onClick={sendReply}>{busy ? 'Saving…' : 'Send reply'}</button>}
        <button type="button" className="ap-secondary" disabled={busy} onClick={() => void act('status', { status: closed ? 'open' : 'resolved' })}>{closed ? 'Reopen request' : 'Mark resolved'}</button>
        {!closed && request.team === 'organiser' && <button type="button" className="ap-secondary" disabled={busy} onClick={() => void act('escalate')}>Send to 4M support</button>}
      </div>
    </section>
    <aside className="ap-section ap-comms-panel" aria-label="Request details">
      <h3>Request details</h3>
      <dl className="ap-comms-definition">
        <div><dt>From</dt><dd>{request.requester.name || 'Player'}</dd><dd>{request.requester.email || 'Email unavailable'}</dd></div>
        <div><dt>Topic</dt><dd>{helpTopicText[request.topic]}</dd>{request.eventId && <dd>Event #{request.eventId}</dd>}</div>
        <div><dt>Team</dt><dd>{request.recipient}</dd>{request.supportAlert && <dd>{request.supportAlert === 'sent' ? 'Support email sent' : request.supportAlert === 'needs_review' ? 'Support email needs attention' : 'Support email queued'}</dd>}</div>
        <div><dt>Opened</dt><dd><time dateTime={request.createdAt}>{communicationDate(request.createdAt)}</time></dd></div>
      </dl>
      {request.context && <p className="ap-comms-notice">{request.context}</p>}
    </aside>
  </div>;
}

function HelpWorkspace({ eventId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { unread, revision, refresh } = useHelpUnread();
  const closeTicket = () => {
    const params = new URLSearchParams(location.search);
    if (!params.has('ticket')) return;
    params.delete('ticket');
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
  };
  const showAllEvents = () => {
    const params = new URLSearchParams(location.search);
    params.delete('event');
    params.delete('ticket');
    navigate({ pathname: location.pathname, search: params.toString(), hash: location.hash }, { replace: true, state: location.state });
  };
  const controller = useStaffHelpRequests({ revision, eventId, initialTicket: helpTicketFromSearch(location.search), onChange: refresh, onCloseTicket: closeTicket });
  const { auth, thread, loading, busy, code, setCode, setup, chooseFactor, verify, error, threadError, back } = controller;
  return (
    <section className="ap-communications" aria-label="Help requests">
      <CommunicationHeading eyebrow="Operate" title="Help requests"
        description={`Player enquiries for your events and the 4M team${unread > 0 ? ` · ${unread} unread` : ''}`}
        onRefresh={controller.refresh} refreshing={loading || busy} onBack={thread ? back : undefined} backLabel="All requests" />
      {eventId && <div className="ap-comms-inline-row ap-comms-notice"><span>Event #{eventId}</span><button className="ap-secondary" type="button" onClick={showAllEvents}>All events</button></div>}
      <CommunicationFeedback error={threadError || error} />
      {!auth.ready ? <p role="status">Checking your account…</p> : !auth.verified
        ? <PreviewAuthenticator accountEmail={auth.email} factor={auth.factor} factors={auth.factors} secret={auth.secret} qrCode={auth.qrCode}
            code={code} busy={busy} onSetup={setup} onFactorChange={chooseFactor} onCode={setCode} onVerify={verify} />
        : thread ? <HelpThread controller={controller} /> : <HelpQueue controller={controller} />}
    </section>
  );
}

export default function HelpRequestsWorkspace({ session }) {
  const { search } = useLocation();
  const eventId = eventContext(search);
  const actor = session?.user;
  return actor?.id ? <HelpWorkspace key={`${actor.id}:${actor.email}:${eventId}`} eventId={eventId} /> : null;
}
