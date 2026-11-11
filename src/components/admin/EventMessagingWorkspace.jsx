import React, { useEffect, useRef, useState } from 'react';
import { ArrowRight, Check, Eye, Flag, LockKeyhole, MessageCircle, Pause, Pin, Play, Send, ShieldCheck, Users } from 'lucide-react';
import EventDiscussion, { EventReplyPreview, EventRoleBadge, EventPlayerAvatar } from './EventDiscussion';
import EventMessagingPicker from './EventMessagingPicker';
import EventAudience from './EventAudience';
import './event-messaging.css';

const date = value => value ? new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const number = value => Number(value || 0).toLocaleString('en-ZA');

function Metric({ label, value, detail, icon: Icon }) {
    return <div className="em-metric"><span>{React.createElement(Icon, { size: 16 })}{label}</span><strong>{value}</strong><small>{detail}</small></div>;
}
function AnnouncementRows({ rows, onAction, busy, pinned }) {
    const [expanded, setExpanded] = useState(null);
    return <div className="em-announcements">{rows.length ? rows.map(row => {
        const percent = row.audience ? Math.round(row.read / row.audience * 100) : null;
        const status = row.pushFailed ? 'Needs attention' : row.pushQueued ? 'Queued' : row.pushAccepted ? 'Awaiting confirmation' : row.pushConfirmed ? 'Provider confirmed' : 'No push devices';
        return <article className="em-announcement" key={row.id}>
            <button type="button" className="em-announcement-toggle" aria-expanded={expanded === row.id} onClick={() => setExpanded(expanded === row.id ? null : row.id)}><span className="em-send-mark"><Send size={17} /></span><span><small>{date(row.createdAt)}</small><span className="em-announcement-author"><EventPlayerAvatar sender={row.sender || { name: 'Event team' }} compact /><b>{row.sender?.name || 'Event team'}</b>{row.sender?.role && <EventRoleBadge role={row.sender.role} />}</span><span className="em-announcement-target">{row.audienceTarget?.all === false ? row.audienceTarget.divisions.join(' · ') : 'All registered players'}</span><strong>{row.body || 'Event card shared'}</strong></span><ArrowRight size={17} /></button>
            <div className="em-message-measures"><span><Users size={14} /><b>{number(row.audience)}</b> app audience</span><span><Eye size={14} /><b>{number(row.read)}</b> marked read{percent !== null ? ` · ${percent}%` : ''}</span><span><Check size={14} /><b>{number(row.pushConfirmed)}</b> device confirmations</span></div>
            <div className="em-reach-line"><div className="em-reach-track"><i style={{ width: `${percent || 0}%` }} /></div><span className={row.pushFailed ? 'em-warning' : ''}>{status}</span></div>
            {expanded === row.id && <div className="em-announcement-expanded"><p>{row.body}</p><div><button type="button" className="em-text-button" disabled={busy} onClick={() => onAction('pin', { messageId: pinned?.id === row.id ? null : row.id }, pinned?.id === row.id ? 'Announcement unpinned.' : 'Announcement pinned.')}>{pinned?.id === row.id ? 'Unpin' : 'Pin announcement'}</button><button type="button" className="em-text-button" disabled={busy} onClick={() => onAction('remove', { messageId: row.id }, 'Message removed.')}>Remove</button></div><div><span>{number(row.pushQueued)} queued</span><span>{number(row.pushAccepted)} accepted by Expo</span><span>{number(row.pushConfirmed)} provider confirmed</span><span>{number(row.pushFailed)} failed</span><span>{number(row.pushSkipped)} skipped</span></div>{!row.pushJobs && <small>No separate device job was recorded for this announcement.</small>}</div>}
        </article>;
    }) : <div className="em-stream-empty"><Send size={30} /><h3>Your first update starts here</h3><p>Publish an announcement and follow its reach, reads and device delivery here.</p></div>}</div>;
}

export default function EventMessagingWorkspace({ events, selected, directoryLoading, onSearch, onSelect, analytics, page, channels, kind, onKind, reply, onReply, onCancelReply, body, onBody, review, busy, onPublish, onRefresh, onAction, onReports, onEntrants, onEarlier, reports, entrants, approval, onApproval, audience, targetDivisions = null, audienceLoading, onTargetDivisions }) {
    const composer = useRef(null);
    useEffect(() => { if (reply) composer.current?.focus(); }, [reply]);
    const summary = analytics?.summary, updates = analytics?.announcements || [];
    const platformAdmin = selected?.accessMode === 'super_admin' || events.some(event => event.accessMode === 'super_admin');
    const conversation = channels.find(channel => channel.kind === kind);
    const rate = summary?.readAudience ? `${Math.round(summary.read / summary.readAudience * 100)}%` : '—';
    return <div className="em-workspace">
        <div className="em-scope"><EventMessagingPicker events={events} selected={selected} onSelect={onSelect} onSearch={onSearch} loading={directoryLoading} globalAccess={platformAdmin} /><div className="em-access"><ShieldCheck size={17} /><div><strong>{platformAdmin ? 'Super Admin access' : 'Verified event access'}</strong><span>{platformAdmin ? 'Events across all organisations' : 'Only your authorised events'}</span></div></div></div>
        {!selected ? <div className="em-start"><span className="em-start-symbol"><MessageCircle size={36} /></span><h3>Every event. One clear conversation.</h3><p>Find an event above to publish updates, manage player discussion and see how your announcements are reaching players.</p><span><LockKeyhole size={14} /> Event access is checked by the server.</span></div> : <>
            <div className="em-event-heading"><div><span>{selected.organisation || 'Event workspace'}{selected.date ? ` · ${new Date(selected.date).toLocaleDateString('en-ZA', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}</span><h3>{selected.title}</h3></div><span className={`em-status ${selected.postingOpen ? 'is-open' : ''}`}><i />{selected.postingOpen ? 'Messaging open' : 'Read only'}</span></div>
            <div className="em-metrics" aria-label="Event messaging statistics">
                <Metric label="App audience" value={summary ? number(summary.audience) : '—'} detail="Currently eligible app accounts" icon={Users} />
                <Metric label="Announcements" value={summary ? number(summary.announcements) : '—'} detail="Published in this event" icon={Send} />
                <Metric label="Marked read" value={rate} detail="Across the latest 100 announcements" icon={Eye} />
                <Metric label="Open reports" value={summary ? number(summary.openReports) : '—'} detail={summary?.pushIssues ? `${number(summary.pushIssues)} push jobs need attention` : 'Player safety and event moderation'} icon={Flag} />
            </div>
            <div className="em-main-grid">
                <section className="em-stream" aria-label="Event message activity"><div className="em-stream-heading"><div className="em-tabs" role="group" aria-label="Event channel"><button type="button" aria-pressed={kind === 'event_announcements'} onClick={() => onKind('event_announcements')}>Announcements <span>{number(summary?.announcements)}</span></button><button type="button" aria-pressed={kind === 'event_discussion'} onClick={() => onKind('event_discussion')}>Discussions <span>{number(summary?.discussionMessages)}</span></button></div><button type="button" className="em-text-button" onClick={onRefresh}>Refresh</button></div>
                    {kind === 'event_announcements' ? <AnnouncementRows key={selected.id} rows={updates} onAction={onAction} busy={busy} pinned={conversation?.pinned} /> : <><div className="em-discussion-help"><strong>Two-way event chat.</strong> Your messages appear on the right. Incoming messages show the sender’s name and event role. Choose Reply to keep an answer connected.</div><EventDiscussion messages={page?.messages || []} next={page?.next} busy={busy} canSend={conversation?.canSend} onReply={onReply} onRemove={message => onAction('remove', { messageId: message.id }, 'Message removed.')} onEarlier={onEarlier} /></>}
                    <footer className="em-stream-footnote">{kind === 'event_announcements' ? 'Reads are aggregate messages marked read in the app. Device confirmation is a push-provider receipt, not proof that a person read a message.' : 'Only eligible players and authorised event organisers can access this discussion. New players see messages from when they became eligible.'}</footer>
                </section>
                <section className="em-compose" aria-label="Compose event message"><div className="em-compose-heading"><span><Send size={17} />{kind === 'event_announcements' ? 'New announcement' : reply ? 'Reply to a message' : 'Join the discussion'}</span><LockKeyhole size={15} /></div>
                    {kind === 'event_announcements' && <EventAudience audience={audience} selected={targetDivisions} onChange={onTargetDivisions} loading={audienceLoading} disabled={busy} />}
                    {kind === 'event_discussion' && <div className="em-compose-audience"><Users size={16} /><span>{number(summary?.discussionAudience)} eligible app accounts<strong>Confirmed discussion participants</strong></span></div>}
                    {conversation?.pinned && <div className="em-pinned"><Pin size={14} /><p>{conversation.pinned.body}</p><button type="button" className="em-text-button" disabled={busy} onClick={() => onAction('pin', { messageId: null }, 'Announcement unpinned.')}>Unpin</button></div>}
                    {kind === 'event_discussion' && <EventReplyPreview message={reply} onCancel={onCancelReply} />}
                    {(kind === 'event_discussion' ? summary?.discussionAudience === 0 : audience && !audienceLoading && (targetDivisions === null ? audience.allCount : targetDivisions.length ? audience.selectedCount : null) === 0) && <p className="em-no-recipients">No eligible app recipients yet. Check event access and player messaging setup before sending.</p>}
                    {platformAdmin && <p className="em-compose-reason">Posting in this event as a 4M admin. Your name and Admin role are visible to players; interventions are audited.</p>}
                    <label htmlFor="em-message">{reply ? 'Your reply' : 'Message'}</label><textarea ref={composer} id="em-message" aria-label="Message text" maxLength={4000} value={body} onChange={event => onBody(event.target.value)} placeholder={kind === 'event_announcements' ? 'What do your players need to know?' : 'Write to the event discussion…'} />
                    <div className="em-compose-meta"><span>{review ? 'Ready for your final review' : 'Text and emoji supported'}</span><span>{number(Array.from(body).length)}/4,000</span></div>
                    {review && <div className="em-review"><strong>Review · {selected.title}</strong>{reply && <small>Reply to {reply.sender.name}: {reply.body?.slice(0, 160)}</small>}<p>{body}</p><small>{kind === 'event_announcements' ? `Send to ${targetDivisions === null ? 'all registered players' : (audience?.divisions || []).filter(d => targetDivisions.includes(d.id)).map(d => d.name).join(' · ')} · ${targetDivisions === null ? audience?.allCount : audience?.selectedCount} eligible app accounts.` : 'Audience: currently authorised discussion participants.'}</small></div>}
                    <button type="button" className="em-primary" disabled={busy || !body.trim() || !conversation?.canSend || (kind === 'event_announcements' && (audienceLoading || !audience || targetDivisions?.length === 0))} onClick={onPublish}><Send size={16} />{busy ? 'Publishing…' : review ? kind === 'event_announcements' ? 'Publish announcement' : 'Send message' : 'Review message'}</button>
                    {!conversation?.canSend && conversation?.reason && <p className="em-compose-reason">{conversation.reason}</p>}
                    <div className="em-notification-preview"><span>Notification preview</span><strong>{selected.title}</strong><p>{kind === 'event_announcements' ? 'New event announcement' : 'You have a new message'}</p><small>Message text stays private. A tap opens this chat.</small></div>
                </section>
            </div>
            <div className="em-moderation"><div><ShieldCheck size={17} /><span>Event controls</span></div><button type="button" disabled={busy || !conversation} onClick={() => onAction('pause', { paused: !channels.find(channel => channel.kind === 'event_discussion')?.paused })}>{channels.find(channel => channel.kind === 'event_discussion')?.paused ? <Play size={15} /> : <Pause size={15} />}{channels.find(channel => channel.kind === 'event_discussion')?.paused ? 'Resume discussion' : 'Pause discussion'}</button><button type="button" disabled={!conversation} onClick={onReports}><Flag size={15} />Event reports{summary?.openReports ? ` · ${summary.openReports}` : ''}</button><button type="button" disabled={!conversation} onClick={onEntrants}><Users size={15} />Discussion access</button></div>
            {entrants.length > 0 && <div className="em-access-review"><label htmlFor="em-entrant">Approve an active entrant for discussion</label><select id="em-entrant" value={approval} onChange={event => onApproval(event.target.value)}><option value="">Choose a player</option>{entrants.filter(player => !player.confirmed).map(player => <option key={player.id} value={player.id}>{player.name}</option>)}</select><button type="button" className="em-secondary" disabled={busy || !approval} onClick={() => onAction('approve', { playerId: Number(approval) }, 'Discussion access approved.')}>Approve access</button></div>}
            {reports.map(report => <article className="em-report" key={report.id}><strong>{report.reason}</strong><p>{report.evidence.body}</p><button type="button" className="em-secondary" disabled={busy} onClick={() => onAction('resolve_report', { reportId: report.id }, 'Report reviewed.')}>Mark reviewed</button></article>)}
        </>}
    </div>;
}
