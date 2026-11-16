import React, { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';
import { helpRequestApi, helpStatusText, helpTopicText } from '../../utils/helpRequests';
import MessagingAuthenticator from './MessagingAuthenticator';

const button = 'min-h-[52px] rounded-lg border border-[#465155] px-4 py-3 text-sm font-medium transition-colors hover:bg-[#303A3D] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#B9D8C7] disabled:cursor-not-allowed disabled:opacity-40';
const field = 'w-full rounded-lg border border-[#465155] bg-[#20272A] p-3 text-[#F0F3F2] placeholder:text-[#A6B1B4] focus:outline-none focus:ring-2 focus:ring-[#B9D8C7]';
const eventTitleColor = 'text-[#B9D8C7]';
const helpTypeColor = 'text-[#D5BDE8]';
export default function HelpRequestsAdmin({ unread = 0, revision = 0, initialTicket = null, onChange = () => {} }) {
    const [auth, setAuth] = useState({ ready: false, verified: false, email: '', factor: '', secret: '', qrCode: '' }), [code, setCode] = useState('');
    const [rows, setRows] = useState([]), [next, setNext] = useState(null), [status, setStatus] = useState(''), [team, setTeam] = useState(''), [query, setQuery] = useState('');
    const [thread, setThread] = useState(null), [body, setBody] = useState(''), [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
    useEffect(() => { if (auth.verified) setBusy(false); }, [auth.verified]);
    const pendingTicket = useRef(initialTicket);
    const alive = useRef(true), generation = useRef(0), readGeneration = useRef(0), fetching = useRef(false), sending = useRef(false), owner = useRef(null), retry = useRef(null);
    const clear = useCallback(() => { generation.current++; readGeneration.current++; setRows([]); setNext(null); setThread(null); setBody(''); setCode(''); setError(''); setBusy(false); setLoading(false); fetching.current = false; sending.current = false; retry.current = null; setAuth({ ready: false, verified: false, email: '', factor: '', secret: '', qrCode: '' }); }, []);
    const authenticate = useCallback(async () => {
        const version = generation.current;
        try {
            const [session, assurance, factors] = await Promise.all([supabase.auth.getSession(), supabase.auth.mfa.getAuthenticatorAssuranceLevel(), supabase.auth.mfa.listFactors()]);
            if (session.error || assurance.error || factors.error) throw new Error('Could not check your authenticator. Try again.');
            if (!alive.current || version !== generation.current || document.hidden) return;
            setAuth(previous => ({ ...previous, ready: true, verified: assurance.data.currentLevel === 'aal2', email: session.data.session?.user.email || '', factor: factors.data.totp.find(item => item.status === 'verified')?.id || previous.factor }));
        } catch (e) { if (alive.current && version === generation.current) setError(e.message); }
    }, []);
    useEffect(() => {
        alive.current = true;
        const { data } = supabase.auth.onAuthStateChange((_event, session) => { if (owner.current !== session?.user.id) { owner.current = session?.user.id; clear(); } setTimeout(() => { if (alive.current) void authenticate(); }, 0); });
        void authenticate();
        const visibility = () => { if (document.hidden) clear(); else void authenticate(); };
        document.addEventListener('visibilitychange', visibility);
        return () => { alive.current = false; generation.current++; readGeneration.current++; data.subscription.unsubscribe(); document.removeEventListener('visibilitychange', visibility); };
    }, [authenticate, clear]);
    const load = useCallback(async (append = false, cursor = null) => {
        if (!auth.verified || document.hidden || fetching.current) return;
        fetching.current = true; setLoading(true); const version = generation.current;
        try {
            const page = await helpRequestApi('list', { staff: true, status, team, query, ...(append && cursor ? cursor : {}) });
            if (!alive.current || version !== generation.current) return;
            setRows(previous => append ? [...new Map([...previous, ...page.rows].map(row => [row.id, row])).values()] : page.rows); setNext(page.next); setError('');
        } catch (e) { if (alive.current && version === generation.current) setError(e.message); }
        finally { if (alive.current && version === generation.current) { fetching.current = false; setLoading(false); } }
    }, [auth.verified, status, team, query]);
    useEffect(() => {
        generation.current++; fetching.current = false; setRows([]); setNext(null);
        if (!auth.verified) return;
        const timer = setTimeout(() => void load(), query.trim() ? 250 : 0);
        const refresh = setInterval(() => void load(), 30000);
        return () => { clearTimeout(timer); clearInterval(refresh); generation.current++; };
    }, [load, auth.verified, query]);
    const open = async id => {
        const version = ++readGeneration.current; sending.current = false; setBusy(false); setThread(null); setBody(''); retry.current = null; setError('');
        try { const page = await helpRequestApi('read', { id }); if (alive.current && version === readGeneration.current) { setThread(page); const latest = page.messages.at(-1); if (latest) { await helpRequestApi('mark_read', { id, messageId: latest.id }); if (alive.current && version === readGeneration.current) { onChange(); void load(); } } } }
        catch (e) { if (alive.current && version === readGeneration.current) setError(e.message); }
    };
    useEffect(() => {
        if (auth.verified && pendingTicket.current) {
            const id = pendingTicket.current; pendingTicket.current = null; void open(id);
        }
    }, [auth.verified]);
    const act = async (action, data = {}) => {
        if (!thread || sending.current) return;
        if (thread.request.status === 'resolved' && ['reply', 'escalate'].includes(action)) { setError('This request is resolved. Reopen it before sending a message.'); return; }
        const version = readGeneration.current, id = thread.request.id; sending.current = true; setBusy(true); setError('');
        try {
            await helpRequestApi(action, { id, ...data });
            if (!alive.current || version !== readGeneration.current) return;
            const page = await helpRequestApi('read', { id });
            if (!alive.current || version !== readGeneration.current) return;
            setThread(page); onChange(); if (action === 'reply') { setBody(''); retry.current = null; } void load();
        } catch (e) { if (alive.current && version === readGeneration.current) setError(e.message); }
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
    useEffect(() => {
        if (!thread?.request.id || !auth.verified) return;
        const id = thread.request.id, version = readGeneration.current;
        const timer = setInterval(async () => {
            if (document.hidden || sending.current) return;
            try { const page = await helpRequestApi('read', { id }); if (alive.current && version === readGeneration.current) { const latest = page.messages.at(-1); if (latest) { await helpRequestApi('mark_read', { id, messageId: latest.id }); if (!alive.current || version !== readGeneration.current) return; onChange(); } setThread(previous => previous?.request.id === id ? { ...page, messages: [...new Map([...previous.messages, ...page.messages].map(message => [message.id,message])).values()], nextMessages: previous.nextMessages } : previous); } }
            catch (e) { if (alive.current && version === readGeneration.current) setError(e.message); }
        },30000);
        return () => clearInterval(timer);
    },[thread?.request.id, auth.verified]);
    useEffect(() => {
        if (!auth.verified || sending.current) return;
        void load();
        if (!thread?.request.id) return;
        const id = thread.request.id, version = readGeneration.current;
        void helpRequestApi('read', { id }).then(async page => {
            if (!alive.current || version !== readGeneration.current) return;
            setThread(previous => previous?.request.id === id ? { ...page, messages: [...new Map([...previous.messages, ...page.messages].map(message => [message.id, message])).values()], nextMessages: previous.nextMessages } : previous);
            const latest = page.messages.at(-1); if (latest) { await helpRequestApi('mark_read', { id, messageId: latest.id }); if (alive.current && version === readGeneration.current) onChange(); }
        }).catch(e => { if (alive.current && version === readGeneration.current) setError(e.message); });
    }, [revision]);
    const earlier = async () => {
        if (!thread?.nextMessages || busy) return; setBusy(true); const version = readGeneration.current;
        try { const page = await helpRequestApi('read', { id: thread.request.id, ...thread.nextMessages }); if (alive.current && version === readGeneration.current) setThread(previous => ({ ...previous, messages: [...new Map([...page.messages, ...previous.messages].map(message => [message.id, message])).values()], nextMessages: page.nextMessages })); }
        catch (e) { if (alive.current && version === readGeneration.current) setError(e.message); }
        finally { if (alive.current && version === readGeneration.current) setBusy(false); }
    };
    const back = () => { const params = new URLSearchParams(window.location.search); params.delete('ticket'); const query = params.toString(); window.history.replaceState({}, '', `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`); readGeneration.current++; sending.current = false; setBusy(false); setThread(null); setBody(''); retry.current = null; void load(); };
    const date = value => new Date(value).toLocaleString('en-ZA', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const statusClass = value => value === 'resolved' ? 'bg-[#23342D] text-[#B9D8C7]' : value === 'waiting_on_player' ? 'bg-[#393124] text-[#E3CEA6]' : 'bg-[#27323B] text-[#C1D7E8]';
    const statusBadge = value => <span className={`inline-flex rounded-md px-2 py-1 text-xs font-medium ${statusClass(value)}`}>{helpStatusText[value]}</span>;
    return <section className="rounded-2xl border border-[#303638] bg-[#15191B] p-5 text-[#F0F3F2] sm:p-6 space-y-6">
        <header className="flex flex-wrap items-start justify-between gap-4"><div><h2 className="text-2xl font-medium">Help requests{unread > 0 && <span className="ml-3 text-base text-[#B9D8C7]">({unread} unread)</span>}</h2><p className="mt-2 text-sm leading-6 text-[#B7C0C2]">Player enquiries for your events and the 4M team</p></div><button className={button} onClick={() => auth.verified ? void load() : void authenticate()} disabled={loading}>Refresh</button></header>
        {error && <p role="alert" className="rounded-lg border border-red-400/30 bg-red-400/10 p-4 text-sm text-red-200">{error}</p>}
        {!auth.ready ? <p className="text-sm text-[#B7C0C2]">Checking your account…</p> : !auth.verified ? <MessagingAuthenticator accountEmail={auth.email} factor={auth.factor} secret={auth.secret} qrCode={auth.qrCode} code={code} busy={busy} onSetup={setup} onCode={setCode} onVerify={verify} buttonClass={button} fieldClass={field} /> : thread ? <>
            <button type="button" className={`${button} inline-flex items-center gap-2`} onClick={back}><span aria-hidden="true">←</span> All requests</button>
            <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#343B3E] pb-5"><div><p className="font-mono text-sm text-[#B7C0C2]">{thread.request.reference}</p><h3 className={`mt-2 text-xl font-medium ${thread.request.eventName ? eventTitleColor : helpTypeColor}`}>{thread.request.eventName || helpTopicText[thread.request.topic]}</h3><p className={`mt-2 text-sm ${helpTypeColor}`}>{helpTopicText[thread.request.topic]}</p></div>{statusBadge(thread.request.status)}</div>
            <dl className="grid gap-5 text-sm sm:grid-cols-3">
                <div><dt className="text-[#A6B1B4]">From</dt><dd className="mt-1 font-medium">{thread.request.requester.name || 'Player'}</dd><dd className="mt-1 break-all text-[#C8CFD1]">{thread.request.requester.email || 'Email unavailable'}</dd></div>
                <div><dt className="text-[#A6B1B4]">Linked event</dt><dd className={`mt-1 ${thread.request.eventName ? eventTitleColor : 'text-[#C8CFD1]'}`}>{thread.request.eventName || 'No event linked'}</dd>{thread.request.eventId && <dd className="mt-1 text-[#C8CFD1]">Event #{thread.request.eventId}</dd>}</div>
                <div><dt className="text-[#A6B1B4]">Responsible team</dt><dd className="mt-1">{thread.request.recipient}</dd>{thread.request.supportAlert && <dd className="mt-1 text-xs text-[#C8CFD1]">{thread.request.supportAlert === 'sent' ? 'Support email sent' : thread.request.supportAlert === 'needs_review' ? 'Support email needs attention' : 'Support email queued'}</dd>}<dd className="mt-1 text-[#C8CFD1]">Opened {date(thread.request.createdAt)}</dd></div>
            </dl>
            {!!thread.request.context && <p className="text-sm leading-6 text-[#C8CFD1]">{thread.request.context}</p>}
            <div className="border-y border-[#343B3E] py-5"><h4 className="mb-4 text-base font-medium">Conversation</h4>
                {thread.nextMessages && <button className={`${button} mb-4`} disabled={busy} onClick={() => void earlier()}>Earlier messages</button>}
                <div className="space-y-4">{thread.messages.map(message => <article key={message.id} className={`max-w-4xl rounded-xl border border-[#343B3E] p-4 ${message.role === 'player' ? 'bg-[#1C2225]' : 'ml-auto bg-[#242D2B]'}`}><div className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-[#B7C0C2]"><span className="text-sm font-medium text-[#F0F3F2]">{message.senderName || (message.role === 'player' ? thread.request.requester.name || 'Player' : message.role === '4m' ? '4M support' : 'Event organiser')}{message.mine ? ' · You' : ''}</span><time dateTime={message.createdAt}>{date(message.createdAt)}</time></div><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-[#F0F3F2]">{message.body}</p></article>)}</div>
            </div>
            {thread.request.status === 'resolved' ? <p className="text-sm text-[#B7C0C2]">This request is resolved. Reopen it to send another message.</p> : <>
            <div><label htmlFor="help-reply" className="block text-sm font-medium">Reply to {thread.request.requester.name || 'player'}</label><textarea id="help-reply" rows={4} maxLength={4000} value={body} onChange={event => setBody(event.target.value)} className={`${field} mt-2`} placeholder="Write your reply…" /><p className="mt-2 text-xs text-[#B7C0C2]">This reply appears in the player’s Messages under Help</p></div>
            </>}
            <div className={`grid gap-3 ${thread.request.status === 'resolved' ? 'grid-cols-1' : thread.request.team === 'organiser' ? 'sm:grid-cols-3' : 'sm:grid-cols-2'}`}>{thread.request.status !== 'resolved' && <button className={`${button} bg-[#EAF0EC] text-[#17271F] hover:bg-white`} disabled={busy || !body.trim()} onClick={() => { if (retry.current?.body !== body.trim()) retry.current = { body: body.trim(), key: crypto.randomUUID() }; void act('reply', { body: retry.current.body, clientId: retry.current.key }); }}>{busy ? 'Saving…' : 'Send reply'}</button>}<button className={button} disabled={busy} onClick={() => void act('status', { status: thread.request.status === 'resolved' ? 'open' : 'resolved' })}>{thread.request.status === 'resolved' ? 'Reopen request' : 'Mark resolved'}</button>{thread.request.status !== 'resolved' && thread.request.team === 'organiser' && <button className={button} disabled={busy} onClick={() => void act('escalate')}>Send to 4M support</button>}</div>
        </> : <>
            <div className="grid gap-4 sm:grid-cols-[minmax(220px,1fr)_180px_180px]"><label className="text-sm text-[#B7C0C2]">Search<input type="search" placeholder="Name, email, event or ticket" value={query} onChange={event => setQuery(event.target.value)} className={`${field} mt-2`} /></label><label className="text-sm text-[#B7C0C2]">Status<select value={status} onChange={event => setStatus(event.target.value)} className={`${field} mt-2`}><option value="">All statuses</option>{Object.entries(helpStatusText).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="text-sm text-[#B7C0C2]">Team<select value={team} onChange={event => setTeam(event.target.value)} className={`${field} mt-2`}><option value="">All teams</option><option value="organiser">Organisers</option><option value="4m">4M support</option></select></label></div>
            <div className="overflow-x-auto rounded-xl border border-[#343B3E]"><table className="w-full min-w-[960px] border-collapse text-left text-sm"><caption className="sr-only">Help request queue. Open a ticket to read its history and reply.</caption><thead className="bg-[#20272A] text-[#C8CFD1]"><tr>{['Ticket', 'From', 'Event / topic', 'Status', 'Team', 'Updated'].map(label => <th key={label} scope="col" className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody>
                {rows.map(row => <tr key={row.id} onClick={event => { if (!event.target.closest('button')) void open(row.id); }} className={`cursor-pointer border-t border-[#343B3E] transition-colors hover:bg-[#252D30] ${row.unread > 0 ? 'bg-[#1D2527]' : ''}`}>
                    <td className="max-w-[280px] px-4 py-4"><button type="button" onClick={() => void open(row.id)} className="rounded text-left font-mono font-medium text-[#D0E5D7] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#B9D8C7]" aria-label={`Open ${row.reference} from ${row.requester.name || row.requester.email || 'player'}`}>{row.reference}{row.unread > 0 && <span className="ml-2 font-sans text-xs">({row.unread})</span>}</button><p className="mt-1 truncate text-[#B7C0C2]">{row.preview}</p></td>
                    <td className="px-4 py-4"><span className="block font-medium">{row.requester.name || 'Player'}</span><span className="mt-1 block text-xs text-[#B7C0C2]">{row.requester.email || 'Email unavailable'}</span></td>
                    <td className="max-w-[300px] px-4 py-4"><span className={`block leading-5 ${row.eventName ? eventTitleColor : 'text-[#B7C0C2]'}`}>{row.eventName || 'No event linked'}</span><span className={`mt-1 block text-xs ${helpTypeColor}`}>{helpTopicText[row.topic]}{row.eventId && <span className="text-[#B7C0C2]"> · #{row.eventId}</span>}</span></td>
                    <td className="px-4 py-4">{statusBadge(row.status)}</td><td className="max-w-[180px] px-4 py-4 text-[#C8CFD1]">{row.recipient}</td><td className="whitespace-nowrap px-4 py-4 text-xs tabular-nums text-[#B7C0C2]"><time dateTime={row.updatedAt}>{date(row.updatedAt)}</time></td>
                </tr>)}
                {!rows.length && <tr><td colSpan={6} className="px-4 py-10 text-center text-[#B7C0C2]">{loading ? 'Loading requests…' : query || status || team ? 'No requests match these filters' : 'No help requests yet'}</td></tr>}
            </tbody></table></div>
            <div className="flex flex-wrap items-center justify-between gap-4 text-xs text-[#B7C0C2]"><p>{rows.length} requests shown · Organisers see their events; 4M Super Admins see all requests</p>{next && <button className={button} disabled={loading} onClick={() => void load(true, next)}>Load earlier requests</button>}</div>
        </>}
    </section>;
}
