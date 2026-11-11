import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Search, Send, ShieldCheck, Users, X } from 'lucide-react';
import EventDiscussion, { EventPlayerAvatar, EventReplyPreview } from './EventDiscussion';
import SearchableSelect from './SearchableSelect';
import { supabase } from '../../supabaseClient';
import './player-messaging.css';

const senderOption = row => ({
    value: row.id,
    label: row.id === 'platform' ? '4M Padel' : row.label.replace(/^Event audience · /, 'Event team · '),
    searchText: row.id.startsWith('org:') ? 'Organisation' : row.id.startsWith('event:') ? 'Assigned event team' : '4M platform',
});

export default function PlayerMessaging({ rpc, owner }) {
    const [scopes, setScopes] = useState([]), [scope, setScope] = useState(''), [query, setQuery] = useState(''), [players, setPlayers] = useState([]), [selected, setSelected] = useState([]);
    const [mode, setMode] = useState('private'), [title, setTitle] = useState(''), [body, setBody] = useState(''), [review, setReview] = useState(false);
    const [rows, setRows] = useState([]), [thread, setThread] = useState(''), [page, setPage] = useState(null), [reply, setReply] = useState(null);
    const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
    const epoch = useRef(0), searchEpoch = useRef(0), inboxEpoch = useRef(0), pageEpoch = useRef(0), lock = useRef(false), retry = useRef(null), alive = useRef(true);
    const clear = useCallback(() => { epoch.current++; searchEpoch.current++; inboxEpoch.current++; pageEpoch.current++; setSelected([]); setPlayers([]); setQuery(''); setTitle(''); setBody(''); setPage(null); setThread(''); setRows([]); setReply(null); setReview(false); setError(''); setFeedback(''); setBusy(false); lock.current = false; retry.current = null; }, []);
    useEffect(() => {
        alive.current = true; const version = epoch.current;
        void rpc('admin_scopes').then(result => {
            if (!alive.current || version !== epoch.current) return;
            setScopes(result);
            const defaultScope = result.find(row => row.id === 'platform') || (result.length === 1 ? result[0] : null);
            if (defaultScope) setScope(current => current || defaultScope.id);
        }).catch(e => { if (alive.current && version === epoch.current) setError(e.message); });
        const hidden = () => { if (document.hidden) clear(); };
        document.addEventListener('visibilitychange', hidden);
        return () => { alive.current = false; clear(); document.removeEventListener('visibilitychange', hidden); };
    }, [rpc, owner, clear]);
    const loadInbox = useCallback(async () => {
        if (!scope || document.hidden) return;
        const version = epoch.current, request = ++inboxEpoch.current;
        try { const result = await rpc('admin_inbox', { scope }); if (alive.current && version === epoch.current && request === inboxEpoch.current) setRows(result); }
        catch (e) { if (alive.current && version === epoch.current && request === inboxEpoch.current) { setRows([]); setError(e.message); } }
    }, [rpc, scope]);
    const loadThread = useCallback(async (id, before) => {
        if (!id || document.hidden) return;
        const version = epoch.current, request = ++pageEpoch.current;
        try {
            const result = await rpc('read', { conversationId: id, ...(before ? { before } : {}) });
            if (!alive.current || version !== epoch.current || request !== pageEpoch.current) return;
            setPage(old => before && old ? { ...result, messages: [...result.messages, ...old.messages].slice(0, 300) } : result); setError('');
            if (result.messages.length) await rpc('mark_read', { conversationId: id, seq: result.messages.at(-1).seq });
        } catch (e) { if (alive.current && version === epoch.current && request === pageEpoch.current) { setPage(null); setError(e.message); } }
    }, [rpc]);
    useEffect(() => { void loadInbox(); }, [loadInbox]);
    useEffect(() => { setPage(null); setReply(null); setBody(''); setReview(false); retry.current = null; void loadThread(thread); }, [thread, loadThread]);
    useEffect(() => {
        const request = ++searchEpoch.current; setPlayers([]); setLoading(false);
        if (!scope || query.trim().length < 2 || thread || document.hidden) return;
        const timer = setTimeout(() => {
            setLoading(true);
            void rpc('admin_players', { scope, query: query.trim() }).then(result => { if (alive.current && request === searchEpoch.current) setPlayers(result); })
                .catch(e => { if (alive.current && request === searchEpoch.current) setError(e.message); })
                .finally(() => { if (alive.current && request === searchEpoch.current) setLoading(false); });
        }, 250);
        return () => { clearTimeout(timer); searchEpoch.current++; };
    }, [rpc, scope, query, thread]);
    const topics = rows.map(row => row.id).sort().join(',');
    useEffect(() => {
        if (!scope || !owner) return;
        let cancelled = false, timer, repair;
        const sockets = [], joined = new Set();
        const refresh = () => { if (cancelled || document.hidden || lock.current || timer) return; timer = setTimeout(() => { timer = null; if (!cancelled) { void loadInbox(); void loadThread(thread); } }, 700); };
        const names = [`messaging:${owner}`];
        void supabase.auth.getSession().then(async ({ data }) => {
            if (cancelled || !data.session || data.session.user.id !== owner) return;
            await supabase.realtime.setAuth(data.session.access_token);
            if (cancelled) return;
            for (const name of names) sockets.push(supabase.channel(name, { config: { private: true } }).on('broadcast', { event: 'inbox_changed' }, refresh).subscribe(state => { if (state === 'SUBSCRIBED') joined.add(name); else joined.delete(name); }));
        }).catch(() => {});
        const recover = () => { if (joined.size < names.length) refresh(); repair = setTimeout(recover, 30000 + Math.random() * 15000); };
        repair = setTimeout(recover, 30000 + Math.random() * 15000);
        window.addEventListener('focus', refresh);
        return () => { cancelled = true; clearTimeout(timer); clearTimeout(repair); window.removeEventListener('focus', refresh); for (const socket of sockets) void supabase.removeChannel(socket); };
    }, [owner, scope, topics, thread, loadInbox, loadThread]);
    const chooseScope = value => { clear(); setScope(value); };
    const toggle = player => {
        setReview(false); setError(''); retry.current = null;
        if (selected.some(row => row.id === player.id)) setSelected(items => items.filter(row => row.id !== player.id));
        else if (selected.length >= (mode === 'group' ? 19 : 50)) setError(mode === 'group' ? 'Choose up to 19 players for a group.' : 'Choose up to 50 players per private send.');
        else setSelected(items => [...items, player]);
    };
    const publish = async () => {
        if (lock.current || !scope || !body.trim() || (!thread && !selected.length) || (mode === 'group' && !thread && (selected.length < 2 || title.trim().length < 2))) return;
        if (!review) { setReview(true); return; }
        const version = epoch.current;
        const payload = thread ? { conversationId: thread, body: body.trim(), replyId: reply?.id } : { scope, mode, title: title.trim(), body: body.trim(), playerIds: selected.map(row => Number(row.id)).sort((a,b) => a-b) };
        const fingerprint = JSON.stringify(payload), key = retry.current?.fingerprint === fingerprint ? retry.current.key : crypto.randomUUID();
        retry.current = { fingerprint, key }; lock.current = true; setBusy(true); setError(''); setFeedback('');
        try {
            const result = await rpc(thread ? 'send' : 'admin_send', { ...payload, clientId: key });
            if (!alive.current || version !== epoch.current) return;
            setBody(''); setReview(false); setReply(null); retry.current = null;
            if (thread) { setFeedback('Message sent.'); await loadThread(thread); }
            else { const waiting = result.filter(row => row.status === 'waiting').length; setFeedback(`${result.length - waiting} conversation${result.length - waiting === 1 ? '' : 's'} updated${waiting ? ` · ${waiting} still awaiting acceptance` : ''}. New recipients receive an invitation first.`); setSelected([]); setQuery(''); setPlayers([]); }
            await loadInbox();
        } catch (e) { if (alive.current && version === epoch.current) setError(e.message); }
        finally { if (alive.current && version === epoch.current) { lock.current = false; setBusy(false); } }
    };
    const remove = async message => {
        if (!message.mine || lock.current) return; const version = epoch.current; lock.current = true; setBusy(true);
        try { await rpc('delete', { conversationId: thread, messageId: message.id }); if (alive.current && version === epoch.current) await loadThread(thread); }
        catch (e) { if (alive.current && version === epoch.current) setError(e.message); }
        finally { if (alive.current && version === epoch.current) { lock.current = false; setBusy(false); } }
    };
    const ready = !busy && !!body.trim() && (thread ? !!page?.conversation.canSend : !!scope && selected.length > 0 && (mode !== 'group' || selected.length >= 2 && selected.length <= 19 && title.trim().length >= 2));
    return <section className="pm-workspace" aria-label="Player messages">
        <div className="pm-intro"><div><h3>Player messages</h3><p>Contact a player or bring a group together, outside an event chat.</p></div><span><ShieldCheck size={16} />Checked against your current access</span></div>
        {error && <p role="alert" className="em-error">{error}</p>}{feedback && <p role="status" className="em-feedback">{feedback}</p>}
        <label className="pm-label" htmlFor="player-message-scope">Send as</label>
        <div className="pm-audience-picker"><SearchableSelect id="player-message-scope" value={scope} disabled={busy}
            options={scopes.map(senderOption)} onChange={chooseScope}
            emptyLabel="Choose who you’re sending as" searchPlaceholder="Search organisations or event teams…" /></div>
        {!!scopes.length && <p className="pm-help">{scope === 'platform' ? 'Search eligible players across 4M Padel. Each player’s messaging preferences still apply.' : scope.startsWith('event:') ? 'Your access covers this event’s players. Messages are sent privately, outside its event chat.' : scope ? 'Search eligible players linked to this organisation. No event selection is needed.' : 'Choose the organisation you’re messaging from. Your profile permissions determine which players you can contact.'}</p>}
        {!scopes.length && <p className="pm-help">No player-messaging audiences are assigned to this profile. Broad admin navigation access does not grant access to another organisation’s players.</p>}
        {scope && <div className="pm-grid"><div className="pm-panel">
            <header className="pm-panel-heading"><h4>{thread ? page?.conversation.title || 'Conversation' : 'Recipients'}</h4>{thread && <button type="button" className="em-secondary" disabled={busy} onClick={() => { setThread(''); setPage(null); }}>New message</button>}</header>
            {thread ? <><p className="pm-help">{page?.conversation.group ? 'Shared group · joined members can see messages' : 'Private conversation · only its participants can read it'}</p>{page && <EventDiscussion messages={page.messages} next={page.next} busy={busy} canSend={page.conversation.canSend} canRemove={message => message.mine} label="Player conversation" emptyTitle="Your conversation" emptyDetail="Messages and replies will appear here after the player accepts." onReply={message => { setReply(message); setReview(false); }} onRemove={remove} onEarlier={() => void loadThread(thread, page.next)} />}</> : <>
                <label className="pm-search"><Search size={18} /><input aria-label="Search authorised players" value={query} placeholder="Search players by name" maxLength={120} disabled={busy} onChange={event => setQuery(event.target.value)} /></label>
                {!!selected.length && <div className="pm-selected">{selected.map(player => <button key={player.id} type="button" disabled={busy} aria-label={`Remove ${player.name}`} onClick={() => toggle(player)}>{player.name}<X size={13} /></button>)}</div>}
                <p className="pm-help">{selected.length} selected · Only players within this audience who can receive requests appear here</p>
                <div className="pm-players" aria-busy={loading}>{players.map(player => <label key={player.id} className="pm-player"><input type="checkbox" checked={selected.some(row => row.id === player.id)} disabled={busy} onChange={() => toggle(player)} /><EventPlayerAvatar sender={{ name: player.name, image: player.image_url }} compact /><span><strong>{player.name}</strong><small>{player.home_club || '4M Padel player'}</small></span></label>)}{loading ? <p className="pm-help" role="status">Searching your authorised players…</p> : !players.length && <p className="pm-help">{query.trim().length < 2 ? 'Enter at least two letters to find a player.' : 'No eligible players match this search.'}</p>}</div>
            </>}
        </div><form className="pm-panel pm-composer" onSubmit={event => { event.preventDefault(); void publish(); }}>
            <header className="pm-panel-heading"><h4>{thread ? 'Reply' : 'Write a message'}</h4><Send size={18} /></header>
            {!thread && <><label className="pm-label" htmlFor="player-message-delivery">Delivery</label><select id="player-message-delivery" className="pm-select" value={mode} disabled={busy} onChange={event => { setMode(event.target.value); setReview(false); retry.current = null; }}><option value="private">Separate private messages</option><option value="group">Shared group chat</option></select><p className="pm-help">{mode === 'private' ? 'Each player receives a private invitation. Recipients cannot see each other or their replies.' : 'Players choose whether to join. Joined members can see each other’s profiles and messages.'}</p>{mode === 'group' && <><label className="pm-label" htmlFor="player-message-title">Group name</label><input id="player-message-title" className="pm-select" value={title} maxLength={60} disabled={busy} onChange={event => { setTitle(event.target.value); setReview(false); }} /></>}</>}
            {reply && <EventReplyPreview message={reply} onCancel={() => { setReply(null); setReview(false); }} />}
            <label className="pm-label" htmlFor="player-message-body">{thread ? 'Message' : 'Introduction'}</label><textarea id="player-message-body" maxLength={thread ? 4000 : 300} disabled={busy || !!thread && !page?.conversation.canSend} value={body} placeholder={thread ? 'Write your reply' : 'Introduce yourself and explain why you’re getting in touch'} onChange={event => { setBody(event.target.value); setReview(false); }} />
            <p className="pm-help">{Array.from(body).length}/{thread ? '4,000' : '300'} · Push alerts contain no message text</p>
            {review && <div className="pm-review"><p className="pm-help">Sending as {scopes.find(row => row.id === scope) ? senderOption(scopes.find(row => row.id === scope)).label : 'your authorised team'}</p><strong>{thread ? 'Send to this conversation' : mode === 'group' ? `Invite ${selected.length} players to “${title}”` : `Send privately to ${selected.length} ${selected.length === 1 ? 'player' : 'players'}`}</strong>{!thread && <p>{selected.map(row => row.name).join(', ')}</p>}<p>{body}</p><button type="button" className="em-text-button" onClick={() => setReview(false)}>Edit message</button></div>}
            <button className="pm-send" type="submit" disabled={!ready}><Send size={17} />{busy ? 'Sending…' : review ? thread ? 'Send reply' : mode === 'group' ? 'Create group & send invitations' : 'Send private messages' : 'Review message'}</button>
        </form></div>}
        {scope && <section className="pm-history"><h4>Your conversations</h4><p className="pm-help">Only conversations you participate in appear here. Other players’ private chats cannot be browsed.</p>{rows.length ? <div className="pm-history-list">{rows.map(row => <button type="button" className={thread === row.id ? 'is-selected' : ''} key={row.id} disabled={busy} onClick={() => { setThread(row.id); setReview(false); }}><Users size={18} /><span><strong>{row.title}</strong><small>{row.group ? 'Shared group' : 'Private conversation'}{row.unread ? ` · ${row.unread} unread` : ''}</small></span><span aria-hidden="true">→</span></button>)}</div> : <p className="pm-help">Conversations you start will appear here.</p>}</section>}
    </section>;
}
