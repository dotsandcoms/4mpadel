import { useCallback, useEffect, useEffectEvent, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { helpRequestApi } from '../../utils/helpRequests';
import { emptyMessagingAuthenticator, resolveMessagingAuthenticator } from '../../utils/messagingAuthenticator';

const noChange = () => {};

async function readStaffThread(data, eventId) {
    const page = await helpRequestApi('read', data);
    // The shared endpoint can also return the actor's own player requests.
    if (page?.request?.canManage !== true || (eventId && String(page.request.eventId) !== eventId)) {
        const error = new Error('This help request is unavailable for your staff access.');
        error.code = '42501';
        throw error;
    }
    return page;
}

export function useStaffHelpRequests({ revision = 0, initialTicket = null, onChange = noChange, onCloseTicket, eventId } = {}) {
    const [auth, setAuth] = useState({ ready: false, verified: false, email: '', ...emptyMessagingAuthenticator() }), [code, setCode] = useState('');
    const [rows, setRows] = useState([]), [next, setNext] = useState(null), [status, setStatus] = useState(''), [team, setTeam] = useState(''), [query, setQuery] = useState('');
    const [thread, setThread] = useState(null), [body, setBody] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [threadError, setThreadError] = useState('');
    useEffect(() => { if (auth.verified) setBusy(false); }, [auth.verified]);
    const [cursors, setCursors] = useState([null]);
    const cursor = cursors.at(-1);
    const pendingTicket = useRef(initialTicket);
    const alive = useRef(true), generation = useRef(0), readGeneration = useRef(0), fetching = useRef(false), sending = useRef(false), owner = useRef(null), retry = useRef(null);
    const clear = useCallback((keepEnrollment = false) => { generation.current++; readGeneration.current++; setRows([]); setNext(null); setCursors([null]); setThread(null); setBody(''); setCode(''); setError(''); setThreadError(''); setBusy(false); setLoading(false); fetching.current = false; sending.current = false; retry.current = null; setAuth(previous => keepEnrollment && previous.secret ? { ...previous, ready: false, verified: false } : { ready: false, verified: false, email: '', ...emptyMessagingAuthenticator() }); }, []);
    const handleThreadError = useCallback(error => {
        if (error.code === '42501') {
            readGeneration.current++;
            sending.current = false;
            retry.current = null;
            setBusy(false);
            setThread(null);
            setBody('');
        }
        setThreadError(error.message);
    }, []);
    const authenticate = useCallback(async () => {
        const version = generation.current;
        try {
            const [session, assurance, factors] = await Promise.all([supabase.auth.getSession(), supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
            if (session.error || assurance.error || factors.error) throw new Error('Could not check your authenticator. Try again.');
            if (!alive.current || version !== generation.current || document.hidden) return;
            setAuth(previous => ({ ...previous, ...resolveMessagingAuthenticator(factors.data, previous), ready: true, verified: assurance.data.currentLevel === 'aal2', email: session.data.session?.user.email || '' }));
        } catch (e) { if (alive.current && version === generation.current) setError(e.message); }
    }, []);
    useEffect(() => {
        alive.current = true;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (owner.current !== session?.user.id) { owner.current = session?.user.id; clear(); } setTimeout(() => { if (alive.current) void authenticate(); }, 0); });
        void authenticate();
        const visibility = () => { if (document.hidden) clear(true); else void authenticate(); };
        document.addEventListener('visibilitychange', visibility);
        return () => { alive.current = false; generation.current++; readGeneration.current++; data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', visibility); };
    }, [authenticate, clear]);
    const load = useCallback(async () => {
        if (!auth.verified || document.hidden || fetching.current) return;
        fetching.current = true; setLoading(true); const version = generation.current;
        try {
            const page = await helpRequestApi('list', { staff: true, status, team, query, ...(eventId ? { eventId } : {}), ...(cursor || {}) });
            if (!alive.current || version !== generation.current) return;
            setRows(page.rows); setNext(page.next); setError('');
        } catch (e) { if (alive.current && version === generation.current) setError(e.message); }
        finally { if (alive.current && version === generation.current) { fetching.current = false; setLoading(false); } }
    }, [auth.verified, status, team, query, cursor, eventId]);
    useEffect(() => {
        generation.current++; fetching.current = false; setRows([]); setNext(null);
        if (!auth.verified) return;
        const timer = setTimeout(() => void load(), query.trim() ? 250 : 0);
        const refresh = setInterval(() => void load(), 30000);
        return () => { clearTimeout(timer); clearInterval(refresh); generation.current++; };
    }, [load, auth.verified, query]);
    const open = useCallback(async id => {
        const version = ++readGeneration.current; sending.current = false; setBusy(false); setThread(null); setBody(''); retry.current = null; setError(''); setThreadError('');
        try { const page = await readStaffThread({ id }, eventId); if (alive.current && version === readGeneration.current) { setThread(page); const latest = page.messages.at(-1); if (latest) { await helpRequestApi('mark_read', { id, messageId: latest.id }); if (alive.current && version === readGeneration.current) { onChange(); void load(); } } } }
        catch (e) { if (alive.current && version === readGeneration.current) handleThreadError(e); }
    }, [eventId, handleThreadError, load, onChange]);
    useEffect(() => { pendingTicket.current = initialTicket; }, [initialTicket]);
    useEffect(() => {
        if (auth.verified && pendingTicket.current) {
            const id = pendingTicket.current; pendingTicket.current = null; void open(id);
        }
    }, [auth.verified, initialTicket, open]);
    const act = async (action, data = {}) => {
        if (!thread || sending.current) return;
        if (thread.request.status === 'resolved' && ['reply', 'escalate'].includes(action)) { setThreadError('This request is resolved. Reopen it before sending a message.'); return; }
        const version = readGeneration.current, id = thread.request.id; sending.current = true; setBusy(true); setThreadError('');
        try {
            await helpRequestApi(action, { id, ...data });
            if (!alive.current || version !== readGeneration.current) return;
            const page = await readStaffThread({ id }, eventId);
            if (!alive.current || version !== readGeneration.current) return;
            setThread(page); onChange(); if (action === 'reply') { setBody(''); retry.current = null; } void load();
        } catch (e) { if (alive.current && version === readGeneration.current) handleThreadError(e); }
        finally { if (alive.current && version === readGeneration.current) { sending.current = false; setBusy(false); } }
    };
    const setup = async () => {
        setBusy(true); const version = generation.current;
        try { const result = await supabase.auth.mfa.enroll({ factorType: 'totp', issuer: '4M Padel', friendlyName: `4M help ${Date.now()}` }); if (result.error) throw result.error; if (alive.current && version === generation.current) setAuth(previous => ({ ...previous, factor: result.data.id, secret: result.data.totp.secret, qrCode: result.data.totp.qr_code })); }
        catch { if (alive.current && version === generation.current) setError('Authenticator setup could not finish. Please try again.'); }
        finally { if (alive.current && version === generation.current) setBusy(false); }
    };
    const verify = async () => {
        setBusy(true); const version = generation.current;
        try { const result = await supabase.auth.mfa.challengeAndVerify({ factorId: auth.factor, code: code.trim() }); if (result.error) throw result.error; if (alive.current && version === generation.current) { setCode(''); setAuth(previous => ({ ...previous, secret: '', qrCode: '', verified: true })); } }
        catch { if (alive.current && version === generation.current) setError('The code could not be verified. Check the latest code for this account.'); }
        finally { if (alive.current && version === generation.current) setBusy(false); }
    };
    const ticketId = thread?.request.id;
    const refreshThread = useCallback(async () => {
        if (!ticketId || !auth.verified || document.hidden || sending.current) return;
        const version = readGeneration.current;
        const isCurrent = () => alive.current && version === readGeneration.current && !sending.current;
        try {
            const page = await readStaffThread({ id: ticketId }, eventId);
            if (!isCurrent()) return;
            const latest = page.messages.at(-1);
            if (latest) {
                await helpRequestApi('mark_read', { id: ticketId, messageId: latest.id });
                if (!isCurrent()) return;
                onChange();
            }
            setThread(previous => previous?.request.id === ticketId ? {
                ...page,
                messages: [...new Map([...previous.messages, ...page.messages].map(message => [message.id, message])).values()],
                nextMessages: previous.nextMessages,
            } : previous);
            setThreadError('');
        } catch (error) {
            if (isCurrent()) handleThreadError(error);
        }
    }, [auth.verified, eventId, handleThreadError, onChange, ticketId]);
    useEffect(() => {
        if (!ticketId || !auth.verified) return;
        const timer = setInterval(refreshThread, 30000);
        return () => clearInterval(timer);
    }, [auth.verified, refreshThread, ticketId]);
    const refreshOnSignal = useEffectEvent(() => {
        if (!auth.verified || sending.current) return;
        void load();
        void refreshThread();
    });
    useEffect(() => { refreshOnSignal(); }, [revision]);
    const earlier = async () => {
        if (!thread?.nextMessages || busy) return; setBusy(true); const version = readGeneration.current;
        try { const page = await readStaffThread({ id: thread.request.id, ...thread.nextMessages }, eventId); if (alive.current && version === readGeneration.current) setThread(previous => ({ ...previous, messages: [...new Map([...page.messages, ...previous.messages].map(message => [message.id, message])).values()], nextMessages: page.nextMessages })); }
        catch (e) { if (alive.current && version === readGeneration.current) handleThreadError(e); }
        finally { if (alive.current && version === readGeneration.current) setBusy(false); }
    };
    const back = () => {
        if (onCloseTicket) onCloseTicket();
        else {
            const params = new URLSearchParams(window.location.search);
            params.delete('ticket');
            const query = params.toString();
            window.history.replaceState(window.history.state, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`);
        }
        readGeneration.current++;
        sending.current = false;
        setBusy(false);
        setThread(null);
        setBody('');
        setThreadError('');
        retry.current = null;
        void load();
    };
    const refresh = () => {
        if (!auth.verified) return void authenticate();
        void load();
        void refreshThread();
    };
    const chooseFactor = factor => { setAuth(previous => ({ ...previous, factor })); setCode(''); setError(''); };
    const changeQuery = value => { setCursors([null]); setQuery(value); };
    const changeStatus = value => { setCursors([null]); setStatus(value); };
    const changeTeam = value => { setCursors([null]); setTeam(value); };
    const sendReply = () => {
        if (retry.current?.body !== body.trim()) retry.current = { body: body.trim(), key: crypto.randomUUID() };
        void act('reply', { body: retry.current.body, clientId: retry.current.key });
    };
    return {
        auth, code, setCode, rows, next, status, team, query, thread, body, setBody, loading, busy,
        error, threadError, cursors, setCursors, open, act, verify, setup, earlier, back, refresh,
        chooseFactor, changeQuery, changeStatus, changeTeam, sendReply
    };
}
