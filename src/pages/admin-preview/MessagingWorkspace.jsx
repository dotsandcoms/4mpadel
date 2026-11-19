import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import SearchableDropdown from '../../components/SearchableDropdown';
import { FOURM_PUBLIC_ORIGIN } from '../../constants/site.js';
import { useEventMessaging } from '../../components/admin/useEventMessaging';
import { CommunicationFeedback, CommunicationHeading } from './CommunicationControls';
import { communicationDate } from './communicationDate';
import PreviewAuthenticator from './PreviewAuthenticator';
import PlayerMessagesWorkspace from './PlayerMessagesWorkspace';
import CommunicationThread, { ReplyDraft } from './CommunicationThread';
import { eventContext } from './communicationEvent.js';

const count = value => Number(value || 0).toLocaleString('en-ZA');

function Audience({ audience, selected, onChange, loading, busy }) {
  const segmented = Array.isArray(selected);
  return <fieldset className="ap-comms-fields" disabled={busy}>
    <legend>Send to</legend>
    <label className="ap-comms-check"><input type="radio" name="event-message-audience" checked={!segmented} onChange={() => onChange(null)} /><span>All registered players</span></label>
    <label className="ap-comms-check"><input type="radio" name="event-message-audience" checked={segmented} onChange={() => onChange([])} /><span>Selected divisions</span></label>
    {segmented && <div className="ap-comms-fields">
      {audience?.divisions?.map(division => <label key={division.id} className="ap-comms-check"><input type="checkbox" checked={selected.includes(division.id)}
        onChange={event => onChange(event.target.checked ? [...selected, division.id].sort() : selected.filter(id => id !== division.id))} />
        <span>{division.name} · {count(division.count)} eligible app accounts</span>
      </label>)}
      {audience && !audience.divisions?.length && <p className="ap-comms-subtext">This event has no divisions yet.</p>}
    </div>}
    <p className="ap-comms-subtext" role="status">
      {loading ? 'Updating audience…' : !audience ? 'Audience unavailable. Refresh to try again.' : segmented && !selected.length
        ? 'Select at least one division.' : `${count(segmented ? audience.selectedCount : audience.allCount)} eligible app accounts · one copy per player`}
    </p>
    {segmented && audience?.unassignedCount > 0 && <p className="ap-comms-subtext">{audience.unassignedCount} event accounts lack a verified division link and receive only event-wide announcements.</p>}
  </fieldset>;
}

function Announcement({ row, pinned, busy, act }) {
  const isPinned = row.id === pinned?.id;
  return <article className="ap-comms-announcement">
    <header className="ap-comms-inline-row">
      <div><strong>{row.sender?.name || 'Event team'}</strong><small>{communicationDate(row.createdAt)}{isPinned ? ' · Pinned' : ''}</small></div>
      <small>{count(row.read)} read · {count(row.audience)} eligible</small>
    </header>
    <details>
      <summary>{row.body}</summary>
      <p className="ap-comms-subtext">{row.audienceTarget?.all ? 'All registered players' : (row.audienceTarget?.divisions || []).join(', ') || 'Selected divisions'}</p>
      <p className="ap-comms-subtext">{count(row.pushQueued)} queued · {count(row.pushAccepted)} accepted by Expo · {count(row.pushConfirmed)} provider confirmed · {count(row.pushFailed)} failed · {count(row.pushSkipped)} skipped</p>
      {!row.pushJobs && <p className="ap-comms-subtext">No separate device job was recorded for this announcement.</p>}
      <div className="ap-comms-actions">
        <button type="button" className="ap-secondary" disabled={busy} onClick={() => void act('pin', { messageId: isPinned ? null : row.id }, isPinned ? 'Announcement unpinned.' : 'Announcement pinned.')}>{isPinned ? 'Unpin' : 'Pin announcement'}</button>
        <button type="button" className="ap-secondary" disabled={busy} onClick={() => void act('remove', { messageId: row.id }, 'Message removed.')}>Remove</button>
      </div>
    </details>
  </article>;
}

function EventComposer({ view, conversation, announcement }) {
  const composer = useRef(null);
  const { audience, targetDivisions, audienceLoading, onTargetDivisions, reply, onCancelReply,
    body, onBody, review, busy, onPublish, onAction, selected, analytics } = view;
  const summary = analytics?.summary || {};
  const chosen = targetDivisions === null ? null : (audience?.divisions || []).filter(division => targetDivisions.includes(division.id));
  const recipientCount = chosen === null ? audience?.allCount : audience?.selectedCount;
  const valid = !busy && body.trim() && conversation?.canSend
    && (!announcement || !audienceLoading && audience && targetDivisions?.length !== 0);
  useEffect(() => { if (reply) composer.current?.focus(); }, [reply]);
  return <section className="ap-section ap-comms-panel" aria-label="Compose event message">
    <h3>{announcement ? 'New announcement' : reply ? 'Reply to a message' : 'Join the discussion'}</h3>
    {announcement ? <Audience audience={audience} selected={targetDivisions} loading={audienceLoading} onChange={onTargetDivisions} busy={busy} />
      : <p className="ap-comms-subtext">{count(summary.discussionAudience)} confirmed discussion participants</p>}
    {conversation?.pinned && <div className="ap-comms-review"><strong>Pinned announcement</strong><p>{conversation.pinned.body}</p>
      <div className="ap-comms-actions"><button type="button" className="ap-secondary" disabled={busy} onClick={() => void onAction('pin', { messageId: null }, 'Announcement unpinned.')}>Unpin</button></div>
    </div>}
    {!announcement && <ReplyDraft reply={reply} onCancel={onCancelReply} />}
    {selected.accessMode === 'super_admin' && <p className="ap-comms-subtext">Your Admin role is visible to players. This action is recorded.</p>}
    <label className="ap-comms-field"><span>{reply ? 'Your reply' : 'Message'}</span>
      <textarea id="em-message" ref={composer} rows={5} maxLength={4000} value={body} onChange={event => onBody(event.target.value)} />
    </label>
    <p className="ap-comms-subtext">{Array.from(body).length}/4,000 · Push alerts keep your message text private.</p>
    {review && <div className="ap-comms-review"><strong>Review · {selected.title}</strong><p>{body}</p>
      <p>{announcement ? `${chosen ? chosen.map(item => item.name).join(', ') : 'All registered players'} · ${count(recipientCount)} eligible app accounts` : 'Authorised discussion participants'}</p>
    </div>}
    {!conversation?.canSend && conversation?.reason && <p className="ap-comms-notice">{conversation.reason}</p>}
    <div className="ap-comms-actions"><button type="button" className="ap-primary" disabled={!valid} onClick={onPublish}>
      {busy ? 'Publishing…' : review ? announcement ? 'Publish announcement' : 'Send message' : 'Review message'}
    </button></div>
    <div className="ap-comms-review"><strong>Notification preview</strong><p>{selected.title} · {announcement ? 'New event announcement' : 'You have a new message'}</p></div>
  </section>;
}

function EventModeration({ view, conversation }) {
  const { busy, channels, onAction, onReports, onEntrants, reports, entrants, approval, onApproval, analytics } = view;
  const paused = Boolean(channels.find(channel => channel.kind === 'event_discussion')?.paused);
  return <section className="ap-section ap-comms-panel" aria-label="Event moderation">
    <h3>Event controls</h3>
    <div className="ap-comms-actions">
      <button className="ap-secondary" type="button" disabled={busy || !conversation} onClick={() => void onAction('pause', { paused: !paused }, paused ? 'Discussion resumed.' : 'Discussion paused.')}>{paused ? 'Resume discussion' : 'Pause discussion'}</button>
      <button className="ap-secondary" type="button" disabled={!conversation} onClick={onReports}>Event reports{analytics?.summary?.openReports ? ` · ${analytics.summary.openReports}` : ''}</button>
      <button className="ap-secondary" type="button" disabled={!conversation} onClick={onEntrants}>Discussion access</button>
    </div>
    {entrants.length > 0 && <div className="ap-comms-fields ap-comms-max-form">
      <label className="ap-comms-field"><span>Approve an active entrant for discussion</span><SearchableDropdown value={approval} onChange={event => onApproval(event.target.value)}>
        <option value="">Choose a player</option>{entrants.filter(player => !player.confirmed).map(player => <option key={player.id} value={String(player.id)}>{player.name}</option>)}
      </SearchableDropdown></label>
      <div className="ap-comms-actions"><button className="ap-secondary" type="button" disabled={busy || !approval} onClick={() => void onAction('approve', { playerId: Number(approval) }, 'Discussion access approved.')}>Approve access</button></div>
    </div>}
    {reports.map(report => <article key={report.id} className="ap-comms-message">
      <strong>{report.reason}</strong><p>{report.evidence?.body}</p>
      <div className="ap-comms-actions"><button type="button" className="ap-secondary" disabled={busy} onClick={() => void onAction('resolve_report', { reportId: report.id }, 'Report reviewed.')}>Mark reviewed</button></div>
    </article>)}
  </section>;
}

function EventMessages({ view }) {
  const { events, selected, directoryLoading, onSearch, onSelect, analytics, page, channels, kind, onKind, onRefresh, onEarlier, onAction, onReply, busy } = view;
  const activeId = selected ? String(selected.id) : '';
  const options = activeId && !events.some(event => String(event.id) === activeId) ? [selected, ...events] : events;
  const summary = analytics?.summary;
  const announcements = kind === 'event_announcements';
  const conversation = channels.find(channel => channel.kind === kind);
  return <>
    <section className="ap-section ap-comms-panel" aria-label="Event selection">
      <div className="ap-comms-filter">
        <label className="ap-comms-field"><span>Find a managed event</span><input type="search" maxLength={120} onChange={event => onSearch(event.target.value)} placeholder="Event, organiser or venue" /></label>
        <label className="ap-comms-field"><span>Event</span><SearchableDropdown value={activeId} onChange={event => onSelect(event.target.value)}>
          <option value="">Choose an event</option>{options.map(event => <option key={event.id} value={String(event.id)}>{event.title}</option>)}
        </SearchableDropdown></label>
      </div>
      {directoryLoading && <p className="ap-comms-subtext" role="status">Searching your events…</p>}
      {selected && <div className="ap-comms-inline-row">
        <div className="ap-comms-title"><h2>{selected.title}</h2><p className="ap-comms-subtext">{selected.organisation || selected.venue || 'Event team'}</p></div>
        <span className={`ap-status ap-status--${selected.postingOpen ? 'positive' : 'neutral'}`}>{selected.postingOpen ? 'Messaging open' : 'Read only'}</span>
      </div>}
      {summary && <dl className="ap-comms-definition">
        <div><dt>App audience</dt><dd>{count(summary.audience)}</dd></div><div><dt>Announcements</dt><dd>{count(summary.announcements)}</dd></div>
        <div><dt>Marked read</dt><dd>{summary.readAudience ? `${Math.round(summary.read / summary.readAudience * 100)}%` : '—'}</dd></div>
        <div><dt>Open reports</dt><dd>{count(summary.openReports)}</dd></div>
      </dl>}
    </section>
    {selected && <>
      <div className="ap-comms-grid">
        <section className="ap-section ap-comms-panel" aria-label="Event message activity">
          <div className="ap-comms-inline-row">
            <nav className="ap-record-tabs ap-comms-tab-bar" aria-label="Event channel">
              <button type="button" aria-pressed={announcements} className={announcements ? 'is-active' : ''} onClick={() => onKind('event_announcements')}>Announcements {count(summary?.announcements)}</button>
              <button type="button" aria-pressed={!announcements} className={!announcements ? 'is-active' : ''} onClick={() => onKind('event_discussion')}>Discussions {count(summary?.discussionMessages)}</button>
            </nav>
            <button type="button" className="ap-secondary" disabled={busy} onClick={onRefresh}>Refresh messages</button>
          </div>
          {announcements ? analytics?.announcements?.length ? analytics.announcements.map(row => <Announcement key={row.id} row={row} pinned={conversation?.pinned} busy={busy} act={onAction} />)
            : <p className="ap-comms-notice">No announcements yet.</p>
            : <CommunicationThread messages={page?.messages} earlier={page?.next ? onEarlier : undefined} busy={busy}
                onReply={conversation?.canSend ? onReply : undefined} onRemove={message => void onAction('remove', { messageId: message.id }, 'Message removed.')} />}
        </section>
        <EventComposer view={view} conversation={conversation} announcement={announcements} />
      </div>
      <EventModeration view={view} conversation={conversation} />
    </>}
  </>;
}

function SupportEvidence({ state }) {
  return <details className="ap-section ap-comms-panel">
    <summary>Reported private-message evidence</summary>
    <p className="ap-comms-subtext">Only evidence submitted with a report is available here.</p>
    <button type="button" className="ap-secondary" disabled={state.busy || !state.verified} onClick={state.loadSupport}>Review reported evidence</button>
    {state.support.map(report => <article key={report.id} className="ap-comms-message">
      <strong>{report.reason}</strong><p>{report.evidence?.body}</p><div className="ap-comms-actions">
        <button type="button" className="ap-secondary" disabled={state.busy} onClick={() => void state.act('support_resolve', { reportId: report.id }, 'Report reviewed.')}>Mark reviewed</button>
        <button type="button" className="ap-secondary" disabled={state.busy} onClick={() => void state.act('support_suspend', { reportId: report.id }, 'Reported sender messaging suspended.')}>Suspend reported sender’s messaging</button>
      </div>
    </article>)}
  </details>;
}

function Messenger({ actor, initialEventId }) {
  const state = useEventMessaging({ initialEventId, initialActorId: actor.id });
  const { status, workspace, setWorkspace, verified, authReady, authError, error, feedback, busy, code, setCode,
    accountEmail, factor, factors, secret, qrCode, setAuthenticator, setError } = state;
  const refresh = () => void (authReady && verified && state.eventId ? state.open() : state.load());
  return <section className="ap-communications" aria-label="Messaging">
    <CommunicationHeading eyebrow="Operate" title="Messaging" description="Event announcements, player conversations and group messages." onRefresh={refresh} refreshing={busy} />
    <CommunicationFeedback error={authError || error} message={feedback} />
    {!status && !error && !authError && <p role="status">Checking messaging access…</p>}
    {status && !status.enabled && <p className="ap-comms-notice">Messaging is awaiting activation.</p>}
    {status?.enabled && <>
      {status.needsBirthDate && <div className="ap-section ap-comms-panel"><h2>Complete your private profile</h2><p>Add your date of birth to use messaging.</p><div className="ap-comms-actions"><a className="ap-primary" href={`${FOURM_PUBLIC_ORIGIN}/profile`}>Update my profile</a></div></div>}
      {!status.rulesAccepted && <section className="ap-section ap-comms-panel"><h2>Messaging community rules</h2><p>Respect other players. Threats, harassment, exploitation, scams, spam and sharing private contact or identity details are prohibited. Authorised teams review reports.</p>
        <div className="ap-comms-actions"><button className="ap-primary" type="button" disabled={busy} onClick={() => void state.act('accept_rules', { version: '2026-11-05' }, 'Messaging rules accepted.')}>Accept messaging rules</button></div>
      </section>}
      {!verified && !authReady && !authError && <p role="status">Checking authenticator setup…</p>}
      {!verified && authReady && <PreviewAuthenticator
        accountEmail={accountEmail} factor={factor} factors={factors} secret={secret} qrCode={qrCode} code={code} busy={busy}
        onSetup={state.enrol} onFactorChange={id => { setAuthenticator(previous => ({ ...previous, factor: id })); setCode(''); setError(''); }}
        onCode={setCode} onVerify={state.verify} />}
      {verified && status.groupsEnabled && <nav className="ap-record-tabs ap-comms-tab-bar" aria-label="Messaging workspace">
        <button type="button" className={workspace === 'events' ? 'is-active' : ''} aria-pressed={workspace === 'events'} onClick={() => setWorkspace('events')}>Event messages</button>
        <button type="button" className={workspace === 'players' ? 'is-active' : ''} aria-pressed={workspace === 'players'} onClick={() => setWorkspace('players')}>Player messages</button>
      </nav>}
      {verified && workspace === 'players' && status.groupsEnabled && <PlayerMessagesWorkspace rpc={state.rpc} owner={state.owner.current} />}
      {verified && workspace === 'events' && <EventMessages view={state.eventPanel} />}
      {status.supportAllowed && <SupportEvidence state={state} />}
    </>}
  </section>;
}

export default function MessagingWorkspace({ session }) {
  const { search } = useLocation();
  const initialEventId = eventContext(search);
  const actor = session?.user;
  return actor?.id ? <Messenger key={`${actor.id}:${actor.email}:${initialEventId}`} actor={actor} initialEventId={initialEventId} /> : null;
}
