import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ShieldCheck, RefreshCw } from 'lucide-react';
import EventMessagingWorkspace from './EventMessagingWorkspace';
import MessagingAuthenticator from './MessagingAuthenticator';
import PlayerMessaging from './PlayerMessaging';
import { supabase } from '../../supabaseClient';

async function rpc(action, data = {}) {
    const result = await supabase.rpc(action === 'event_directory' ? 'messaging_event_directory' : action === 'event_analytics' ? 'messaging_event_analytics' : 'messaging_api', action === 'event_directory' ? { p_query: data.query || '' } : action === 'event_analytics' ? { p_event: data.eventId } : { p_action: action, p_data: data });
    if (result.error) {
        if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('Messaging is awaiting its database deployment.');
        const message = result.error.message || '';
        throw new Error(/^(Sign in|Messaging is|Complete your|Verify your|Event messaging|This conversation|You cannot|Write a message|You’re sending|This message|Choose an|Choose a|Confirm your|Messaging support|Messaging access|Choose up to|Choose private|Choose at least|Write a group|This group|You have reached|This message retry)/.test(message) && message.length < 240 ? message : 'Messaging could not complete this action. Please try again.');
    }
    return result.data;
}
const button = 'min-h-11 rounded-xl px-4 py-3 text-sm font-semibold border border-white/15 hover:bg-white/10 disabled:opacity-40';
const field = 'w-full rounded-xl border border-white/15 bg-white/5 p-3 text-white outline-none focus:border-padel-green';
export default function EventMessaging() {
    const [workspace, setWorkspace] = useState('events');
    const [events, setEvents] = useState([]), [eventId, setEventId] = useState(''), [channels, setChannels] = useState([]), [kind, setKind] = useState('event_announcements');
    const [page, setPage] = useState(null), [body, setBody] = useState(''), [review, setReview] = useState(false), [status, setStatus] = useState(null);
    const [error, setError] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
    const [support, setSupport] = useState([]), [reply, setReply] = useState(null);
    const [analytics, setAnalytics] = useState(null), [eventQuery, setEventQuery] = useState(''), [directoryLoading, setDirectoryLoading] = useState(false);
    const directoryEpoch = useRef(0), audienceEpoch = useRef(0);
    const [targetDivisions, setTargetDivisions] = useState(null), [audience, setAudience] = useState(null), [audienceLoading, setAudienceLoading] = useState(false);
    const [reports, setReports] = useState([]), [entrants, setEntrants] = useState([]), [approval, setApproval] = useState('');
    const [factor, setFactor] = useState(''), [secret, setSecret] = useState(''), [qrCode, setQrCode] = useState(''), [code, setCode] = useState(''), [verified, setVerified] = useState(false);
    const version = useRef(0), alive = useRef(true), sending = useRef(false), retry = useRef(null), owner = useRef(null);
    const conversation = channels.find(c => c.kind === kind);
    const clear = useCallback(() => { version.current++; directoryEpoch.current++; audienceEpoch.current++; setAudience(null); setTargetDivisions(null); setAnalytics(null); setPage(null); setBody(''); setReply(null); setReports([]); setSupport([]); setEntrants([]); setChannels([]); setReview(false); setSecret(''); setQrCode(''); setCode(''); retry.current = null; }, []);
    const load = useCallback(async () => {
        const epoch = ++version.current;
        try {
            const s = await rpc('status');

            const [assurance, factors] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
            if (!alive.current || epoch !== version.current) return;
            setStatus(s); if (!s.supportAllowed) setSupport([]); setError('');
            setVerified(assurance.data?.currentLevel === 'aal2'); setFactor(factors.data?.totp?.find(f => f.status === 'verified')?.id || '');
        } catch (e) { if (alive.current && epoch === version.current) setError(e.message); }
    }, []);
    useEffect(() => {
        alive.current = true;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (owner.current !== session?.user.id) { owner.current = session?.user.id; clear(); setEvents([]); setStatus(null); setEventId(''); setWorkspace('events'); }
            setTimeout(() => { if (alive.current) void load(); }, 0);
        });
        void load();
        const hidden = () => { if (document.hidden) clear(); else void load(); };
        document.addEventListener('visibilitychange', hidden);
        return () => { alive.current = false; data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', hidden); };
    }, [load, clear]);
    const open = useCallback(async () => {
        if (!eventId || !verified || document.hidden) return;
        const epoch = ++version.current;
        try {
            const next = await rpc('open_event', { eventId: Number(eventId) });
            const selected = next.find(c => c.kind === kind);
            const [result, stats] = await Promise.all([selected ? rpc('read', { conversationId: selected.id }) : null, rpc('event_analytics', { eventId: Number(eventId) })]);
            if (!alive.current || epoch !== version.current) return;
            setChannels(next); setPage(result); setAnalytics(stats); setError('');
            if (selected && result?.messages?.length) await rpc('mark_read', { conversationId: selected.id, seq: result.messages.at(-1).seq });
        } catch (e) { if (alive.current && epoch === version.current) { setPage(null); setAnalytics(null); setChannels([]); setError(e.message); } }
    }, [eventId, kind, verified]);
    useEffect(() => { audienceEpoch.current++; setTargetDivisions(null); setAudience(null); setPage(null); setChannels([]); setBody(''); setReply(null); setReview(false); setReports([]); setEntrants([]); void open(); }, [open]);
    useEffect(() => {
        if (!status?.enabled || !verified) return;
        const epoch = ++directoryEpoch.current;
        setDirectoryLoading(true);
        const timer = setTimeout(() => {
            void rpc('event_directory', { query: eventQuery }).then(rows => {
                if (alive.current && epoch === directoryEpoch.current) { setEvents(rows); setError(''); }
            }).catch(e => { if (alive.current && epoch === directoryEpoch.current) { setEvents([]); setError(e.message); } })
                .finally(() => { if (alive.current && epoch === directoryEpoch.current) setDirectoryLoading(false); });
        }, 250);
        return () => { clearTimeout(timer); if (directoryEpoch.current === epoch) directoryEpoch.current = epoch + 1; };
    }, [verified, status, eventQuery]);
    const targetKey = targetDivisions === null ? 'all' : targetDivisions.join(',');
    useEffect(() => {
        const request = ++audienceEpoch.current;
        if (!verified || kind !== 'event_announcements' || !conversation?.id) { setAudience(null); setAudienceLoading(false); return; }
        setAudienceLoading(true);
        const timer = setTimeout(() => {
            void rpc('audience', { conversationId: conversation.id, divisionIds: targetKey === 'all' || !targetKey ? null : targetKey.split(',') })
                .then(result => { if (alive.current && request === audienceEpoch.current) setAudience(result); })
                .catch(e => { if (alive.current && request === audienceEpoch.current) { setAudience(null); setError(e.message); } })
                .finally(() => { if (alive.current && request === audienceEpoch.current) setAudienceLoading(false); });
        }, 180);
        return () => clearTimeout(timer);
    }, [verified, kind, conversation?.id, targetKey, analytics?.generatedAt]);
    const topicIds = channels.map(row => row.id).sort().join(',');
    useEffect(() => {
        if (!verified || !eventId) return;
        let cancelled = false, debounce, repair;
        const sockets = [], joined = new Set();
        let expected = 1;
        const refresh = () => {
            if (document.hidden || sending.current || debounce) return;
            debounce = setTimeout(() => { debounce = null; if (!cancelled) void open(); }, 1000);
        };
        void supabase.auth.getSession().then(async ({ data }) => {
            if (cancelled || !data.session) return;
            await supabase.realtime.setAuth(data.session.access_token);
            if (cancelled) return;
            const names = [`messaging:${data.session.user.id}`, ...topicIds.split(',').filter(Boolean).map(id => `messaging-thread:${id}`)];
            expected = names.length;
            for (const name of names) sockets.push(supabase.channel(name, { config: { private: true } })
                .on('broadcast', { event: 'inbox_changed' }, refresh).subscribe(state => {
                    if (state === 'SUBSCRIBED') joined.add(name); else joined.delete(name);
                }));
        }).catch(() => {});
        const recover = () => { if (joined.size < expected) refresh(); repair = setTimeout(recover, 30000 + Math.random() * 15000); };
        repair = setTimeout(recover, 30000 + Math.random() * 15000);
        const focus = () => refresh();
        window.addEventListener('focus', focus);
        return () => { cancelled = true; clearTimeout(debounce); clearTimeout(repair); window.removeEventListener('focus', focus); for (const socket of sockets) void supabase.removeChannel(socket); };
    }, [verified, eventId, topicIds, open]);
    const act = async (action, payload = {}, success = 'Saved') => {
        if (sending.current) return; sending.current = true; setBusy(true); setError(''); setFeedback('');
        const epoch = version.current;
        try {
            await rpc(action, { conversationId: conversation?.id, ...payload });
            if (!alive.current || epoch !== version.current) return;
            setFeedback(success); if (action === 'resolve_report') setReports(rows => rows.filter(row => row.id !== payload.reportId)); if (action === 'support_resolve') setSupport(rows => rows.filter(row => row.id !== payload.reportId)); if (action === 'accept_rules') await load(); else await open();
        } catch (e) { if (alive.current && epoch === version.current) setError(e.message); }
        finally { sending.current = false; if (alive.current) setBusy(false); }
    };
    const publish = async () => {
        if (!conversation || sending.current || !body.trim() || (kind === 'event_announcements' && (audienceLoading || !audience || targetDivisions?.length === 0))) return;
        const key = retry.current?.body === body && retry.current?.conversationId === conversation.id && retry.current?.replyId === reply?.id && retry.current?.targetKey === targetKey ? retry.current.key : crypto.randomUUID();
        retry.current = { body, key, conversationId: conversation.id, replyId: reply?.id, targetKey };
        if (sending.current) return; sending.current = true; setBusy(true); setError(''); setFeedback('');
        const epoch = version.current;
        try {
            await rpc('send', { conversationId: conversation.id, body: body.trim(), clientId: key, replyId: reply?.id, ...(kind === 'event_announcements' ? { divisionIds: targetDivisions } : {}) });
            if (!alive.current || epoch !== version.current) return;
            setBody(''); setReply(null); setReview(false); retry.current = null; setFeedback(kind === 'event_announcements' ? 'Announcement published.' : 'Message sent.'); await open();
        } catch (e) { if (alive.current && epoch === version.current) setError(e.message); }
        finally { sending.current = false; if (alive.current) setBusy(false); }
    };
    const verify = async () => {
        setError(''); setBusy(true);
        try {
            const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code: code.trim() });
            if (result.error) throw new Error('The authenticator code could not be verified.');
            if (alive.current) { setVerified(true); setSecret(''); setQrCode(''); setCode(''); void load(); }
        } catch (e) { if (alive.current) setError(e.message); }
        finally { if (alive.current) setBusy(false); }
    };
    const enrol = async () => {
        const epoch = version.current;
        setBusy(true); setError('');
        try {
            const { data, error: issue } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: '4M Padel', friendlyName: `4M messaging ${Date.now()}` });
            if (issue) throw new Error('Could not set up an authenticator.');
            if (alive.current && epoch === version.current) { setFactor(data.id); setSecret(data.totp.secret); setQrCode(data.totp.qr_code); }
        } catch (e) { if (alive.current) setError(e.message); }
        finally { if (alive.current) setBusy(false); }
    };
    const loadReports = async () => { const epoch = version.current; try { const rows = await rpc('reports', { conversationId: conversation.id }); if (alive.current && epoch === version.current) setReports(rows); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } };
    const loadEntrants = async () => { const epoch = version.current; try { const rows = await rpc('entrants', { conversationId: conversation.id }); if (alive.current && epoch === version.current) setEntrants(rows); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } };
    return <section className="em-dashboard space-y-6 text-white" aria-label="Event messaging">
        <header className="flex flex-wrap items-center justify-between gap-4"><div><p className="text-xs font-bold uppercase tracking-[0.2em] text-padel-green">Courtside communication</p><h2 className="mt-2 text-3xl font-bold">Messaging</h2><p className="mt-2 text-sm text-gray-400">Event updates, private player messages and group conversations.</p></div><button type="button" className={button} onClick={() => { if (eventId) void open(); else void load(); }}><RefreshCw className="mr-2 inline h-4 w-4" />Refresh</button></header>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        {feedback && <p role="status" className="text-sm text-padel-green">{feedback}</p>}
        {status && !status.enabled && <div className="rounded-2xl border border-white/10 p-6"><ShieldCheck className="mb-3 text-padel-green" /><h3 className="font-semibold">Messaging is awaiting activation</h3><p className="mt-2 text-sm text-gray-400">The feature opens after database deployment, security verification and the controlled rollout.</p></div>}
        {status?.enabled && <>


            {status.needsBirthDate && <div className="rounded-2xl border border-white/10 p-5 space-y-3"><h3 className="font-semibold">Complete your private profile</h3><p className="text-sm text-gray-400">Add your date of birth before publishing messages. It stays private and is used for messaging eligibility.</p><a className={`${button} inline-block`} href="/profile">Update my profile</a></div>}
            {!status.rulesAccepted && <div className="rounded-2xl border border-white/10 p-5 space-y-3"><h3 className="font-semibold">Messaging community rules</h3><p className="text-sm text-gray-400">Respect players. Harassment, threats, sexual exploitation, scams, spam and sharing private contact or identity details are prohibited. Event messages are visible to eligible players and authorised organisers. Reports are reviewed by the relevant moderation team.</p><button type="button" className={button} disabled={busy} onClick={() => void act('accept_rules', { version: '2026-11-05' }, 'Messaging rules accepted.')}>Accept messaging rules</button></div>}
            {!verified && <MessagingAuthenticator factor={factor} secret={secret} qrCode={qrCode} code={code} busy={busy} onSetup={() => void enrol()} onCode={setCode} onVerify={() => void verify()} buttonClass={button} fieldClass={field} />}
            {verified && status.groupsEnabled && <nav className="em-tabs" aria-label="Messaging workspace"><button type="button" aria-pressed={workspace === 'events'} onClick={() => setWorkspace('events')}>Event messages</button><button type="button" aria-pressed={workspace === 'players'} onClick={() => setWorkspace('players')}>Player messages</button></nav>}
            {verified && workspace === 'players' && status.groupsEnabled && <PlayerMessaging key={owner.current} rpc={rpc} owner={owner.current} />}
            {verified && workspace === 'events' && <EventMessagingWorkspace events={events} selected={analytics?.event || events.find(event => String(event.id) === eventId)} directoryLoading={directoryLoading}
                onSearch={setEventQuery} onSelect={id => { clear(); setEventId(id); }} analytics={analytics} page={page} channels={channels} kind={kind}
                audience={audience} targetDivisions={targetDivisions} audienceLoading={audienceLoading} onTargetDivisions={value => { audienceEpoch.current++; setTargetDivisions(value); setReview(false); setAudienceLoading(true); retry.current = null; }}
                onKind={setKind} reply={reply} onReply={message => { setReply(message); setReview(false); }} onCancelReply={() => { setReply(null); setReview(false); }} body={body} onBody={value => { setBody(value); setReview(false); }} review={review} busy={busy}
                onPublish={() => { if (review) void publish(); else setReview(true); }} onRefresh={() => void open()} onAction={act}
                onReports={loadReports} onEntrants={loadEntrants} reports={reports} entrants={entrants} approval={approval} onApproval={setApproval}
                onEarlier={async () => { const epoch = version.current; try { const prior = await rpc('read', { conversationId: conversation.id, before: page.next }); if (alive.current && epoch === version.current) setPage(old => old ? ({ ...old, messages: [...prior.messages, ...old.messages].slice(0, 300), next: prior.next }) : old); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } }} />}
            {status.supportAllowed && <details className="em-support"><summary>Reported private-message evidence</summary><div className="space-y-4 mt-4">
                <h3 className="font-semibold">Reported private messages</h3>
                <p className="text-sm text-gray-400">Support access is limited to evidence deliberately submitted with a report. Unreported private conversations cannot be browsed.</p>
                <button type="button" className={button} disabled={busy || !verified} onClick={async () => { const epoch = version.current; try { const rows = await rpc('support_reports'); if (alive.current && epoch === version.current) setSupport(rows); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } }}>Review reported evidence</button>
                {support.map(report => <article key={report.id} className="rounded-xl border border-amber-400/20 p-4 space-y-3"><h4 className="font-semibold">{report.reason}</h4><p className="whitespace-pre-wrap break-words text-sm text-gray-300">{report.evidence.body}</p><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={() => void act('support_resolve', { reportId: report.id }, 'Report reviewed.')}>Mark reviewed</button><button type="button" className={button} disabled={busy} onClick={() => void act('support_suspend', { reportId: report.id }, 'Reported sender messaging suspended.')}>Suspend reported sender’s messaging</button></div></article>)}
            </div></details>}
        </>}
    </section>;
}
