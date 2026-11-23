import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { emptyMessagingAuthenticator, resolveMessagingAuthenticator } from '../../utils/messagingAuthenticator';

async function rpc(action, data = {}) {
    const result = await supabase.rpc(action === 'event_directory' ? 'messaging_event_directory' : action === 'event_analytics' ? 'messaging_event_analytics' : action === 'admin_inbox_page' ? 'messaging_admin_inbox' : 'messaging_api', action === 'event_directory' ? { p_query: data.query || '' } : action === 'event_analytics' ? { p_event: data.eventId } : action === 'admin_inbox_page' ? { p_data: data } : { p_action: action, p_data: data });
    if (result.error) {
        if (['PGRST202', '42883'].includes(result.error.code)) throw new Error('Messaging is awaiting its database deployment.');
        const message = result.error.message || '';
        throw new Error(/^(Sign in|Messaging is|Complete your|Verify your|Event messaging|This conversation|You cannot|Write a message|You’re sending|This message|Choose an|Choose a|Confirm your|Messaging support|Messaging access|Choose up to|Choose private|Choose at least|Write a group|This group|You have reached|This message retry)/.test(message) && message.length < 240 ? message : 'Messaging could not complete this action. Please try again.');
    }
    return result.data;
}
export function useEventMessaging({ initialEventId = '', initialActorId = null } = {}) {
    const [workspace, setWorkspace] = useState('events');
    const [events, setEvents] = useState([]), [eventId, setEventId] = useState(initialEventId), [channels, setChannels] = useState([]), [kind, setKind] = useState('event_announcements');
    const [page, setPage] = useState(null), [body, setBody] = useState(''), [review, setReview] = useState(false), [status, setStatus] = useState(null);
    const [error, setError] = useState(''), [authError, setAuthError] = useState(''), [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
    const [support, setSupport] = useState([]), [reply, setReply] = useState(null);
    const [analytics, setAnalytics] = useState(null), [eventQuery, setEventQuery] = useState(''), [directoryLoading, setDirectoryLoading] = useState(false);
    const directoryEpoch = useRef(0), audienceEpoch = useRef(0), authEpoch = useRef(0);
    const [targetDivisions, setTargetDivisions] = useState(null), [audience, setAudience] = useState(null), [audienceLoading, setAudienceLoading] = useState(false);
    const [reports, setReports] = useState([]), [entrants, setEntrants] = useState([]), [approval, setApproval] = useState('');
    const [accountEmail, setAccountEmail] = useState(''), [authReady, setAuthReady] = useState(false);
    const [authenticator, setAuthenticator] = useState(emptyMessagingAuthenticator), [code, setCode] = useState(''), [verified, setVerified] = useState(false);
    const { factor, secret, qrCode, factors } = authenticator;
    const version = useRef(0), alive = useRef(true), sending = useRef(false), retry = useRef(null), owner = useRef(initialActorId);
    const conversation = channels.find(c => c.kind === kind);
    // Event selection clears the previous conversation, while account changes
    // and backgrounding also clear authentication and private support evidence.
    const clearEvent = useCallback(() => { version.current++; audienceEpoch.current++; setAudience(null); setTargetDivisions(null); setAnalytics(null); setPage(null); setBody(''); setReply(null); setReports([]); setEntrants([]); setChannels([]); setReview(false); setError(''); setFeedback(''); retry.current = null; }, []);
    const clear = useCallback((keepEnrollment = false) => { authEpoch.current++; directoryEpoch.current++; clearEvent(); setSupport([]); setAuthenticator(previous => keepEnrollment && previous.secret ? previous : emptyMessagingAuthenticator()); setCode(''); setVerified(false); setAuthReady(false); setBusy(false); setAuthError(''); }, [clearEvent]);
    const load = useCallback(async () => {
        if (document.hidden) return;
        const epoch = ++authEpoch.current;
        setAuthReady(false); setAuthError('');
        try {
            const s = await rpc('status');

            const [assurance, factors, session] = await Promise.all([supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors(), supabase.auth.getSession()]);
            if (assurance.error || factors.error || session.error) throw new Error('Could not check this account’s authenticator. Refresh and try again.');
            if (!alive.current || epoch !== authEpoch.current || document.hidden) return;
            setAccountEmail(session.data?.session?.user?.email || ''); setAuthReady(true);
            setStatus(s); if (!s.supportAllowed) setSupport([]);
            setVerified(assurance.data?.currentLevel === 'aal2'); setAuthenticator(previous => resolveMessagingAuthenticator(factors.data, previous));
        } catch (e) { if (alive.current && epoch === authEpoch.current) { version.current++; setVerified(false); setAuthError(e.message); } }
    }, []);
    useEffect(() => {
        alive.current = true;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => {
            if (owner.current !== session?.user.id) { owner.current = session?.user.id; setAccountEmail(session?.user.email || ''); clear(); setEvents([]); setStatus(null); setEventId(''); setWorkspace('events'); }
            setTimeout(() => { if (alive.current) void load(); }, 0);
        });
        void load();
        const hidden = () => { if (document.hidden) clear(true); else void load(); };
        document.addEventListener('visibilitychange', hidden);
        return () => { alive.current = false; data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', hidden); };
    }, [load, clear]);
    const open = useCallback(async () => {
        if (!eventId || !verified || document.hidden) return;
        const epoch = ++version.current;
        try {
            const event = Number(eventId);
            const stats = await rpc('event_analytics', { eventId: event });
            if (!alive.current || epoch !== version.current) return;
            // The shared open RPC also serves players. Admin only opens a manager channel.
            const next = (await rpc('open_event', { eventId: event })).filter(channel => channel.manager === true);
            if (!alive.current || epoch !== version.current) return;
            if (!next.length) throw new Error('Event messaging access denied.');
            const selected = next.find(channel => channel.kind === kind);
            const result = selected ? await rpc('read', { conversationId: selected.id }) : null;
            if (!alive.current || epoch !== version.current) return;
            setChannels(next); setPage(result); setAnalytics(stats); setError('');
            if (selected && result?.messages?.length) await rpc('mark_read', { conversationId: selected.id, seq: result.messages.at(-1).seq });
        } catch (e) { if (alive.current && epoch === version.current) { clearEvent(); setError(e.message); } }
    }, [clearEvent, eventId, kind, verified]);
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
        const verifyingOwner = owner.current;
        setError(''); setBusy(true);
        try {
            const result = await supabase.auth.mfa.challengeAndVerify({ factorId: factor, code: code.trim() });
            if (result.error) throw new Error('The authenticator code could not be verified.');
            if (alive.current && owner.current === verifyingOwner) { setVerified(true); setAuthenticator(previous => ({ ...previous, secret: '', qrCode: '' })); setCode(''); void load(); }
        } catch (e) { if (alive.current && owner.current === verifyingOwner) setError(e.message); }
        finally { if (alive.current && owner.current === verifyingOwner) setBusy(false); }
    };
    const enrol = async () => {
        const enrollingOwner = owner.current, epoch = version.current;
        setBusy(true); setError('');
        try {
            const { data, error: issue } = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: '4M Padel', friendlyName: `4M messaging ${Date.now()}` });
            if (issue) throw new Error('Could not set up an authenticator.');
            if (alive.current && epoch === version.current) setAuthenticator({ factor: data.id, secret: data.totp.secret, qrCode: data.totp.qr_code, factors: [] });
        } catch (e) { if (alive.current && owner.current === enrollingOwner) setError(e.message); }
        finally { if (alive.current && owner.current === enrollingOwner) setBusy(false); }
    };
    const loadReports = async () => { const epoch = version.current; try { const rows = await rpc('reports', { conversationId: conversation.id }); if (alive.current && epoch === version.current) setReports(rows); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } };
    const loadEntrants = async () => { const epoch = version.current; try { const rows = await rpc('entrants', { conversationId: conversation.id }); if (alive.current && epoch === version.current) setEntrants(rows); } catch (e) { if (alive.current && epoch === version.current) setError(e.message); } };
    const eventPanel = {
        events, selected: analytics?.event || events.find(event => String(event.id) === eventId),
        directoryLoading, analytics, page, channels, kind, audience, targetDivisions, audienceLoading,
        onSearch: setEventQuery, onSelect: id => { clearEvent(); setEventId(String(id)); },
        onTargetDivisions: value => { audienceEpoch.current++; setTargetDivisions(value); setReview(false); setAudienceLoading(true); retry.current = null; },
        onKind: setKind, reply,
        onReply: message => { setReply(message); setReview(false); },
        onCancelReply: () => { setReply(null); setReview(false); },
        body, onBody: value => { setBody(value); setReview(false); }, review, busy,
        onPublish: () => { if (review) void publish(); else setReview(true); }, onRefresh: open, onAction: act,
        onReports: loadReports, onEntrants: loadEntrants, reports, entrants, approval, onApproval: setApproval,
        onEarlier: async () => {
            if (!conversation || !page?.next) return;
            const epoch = version.current;
            try {
                const prior = await rpc('read', { conversationId: conversation.id, before: page.next });
                if (alive.current && epoch === version.current) setPage(old => old ? { ...old, messages: [...prior.messages, ...old.messages].slice(0, 300), next: prior.next } : old);
            } catch (e) { if (alive.current && epoch === version.current) setError(e.message); }
        },
    };
    const loadSupport = async () => {
        const epoch = version.current;
        try {
            const rows = await rpc('support_reports');
            if (alive.current && epoch === version.current) setSupport(rows);
        } catch (e) { if (alive.current && epoch === version.current) setError(e.message); }
    };
    return {
        workspace, setWorkspace, status, authError, error, feedback, authReady, verified, busy,
        accountEmail, factor, factors, secret, qrCode, code, setCode, setAuthenticator, setError,
        verify, enrol, owner, rpc, eventId, open, load, act, support, eventPanel, loadSupport
    };
}
