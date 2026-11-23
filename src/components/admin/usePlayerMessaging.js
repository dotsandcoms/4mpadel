import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../../supabaseClient';

export const senderOption = row => ({
    value: row.id,
    label: row.id === 'platform' ? '4M Padel' : row.label.replace(/^Event audience · /, 'Event team · '),
    searchText: row.id.startsWith('org:') ? 'Organisation' : row.id.startsWith('event:') ? 'Assigned event team' : '4M platform',
});

export function usePlayerMessaging({ rpc, owner }) {
    const [scopes, setScopes] = useState([]), [scope, setScope] = useState(''), [query, setQuery] = useState(''), [players, setPlayers] = useState([]), [selected, setSelected] = useState([]);
    const [mode, setMode] = useState('private'), [title, setTitle] = useState(''), [body, setBody] = useState(''), [review, setReview] = useState(false);
    const [rows, setRows] = useState([]), [thread, setThread] = useState(''), [page, setPage] = useState(null), [reply, setReply] = useState(null);
    const [view, setView] = useState('inbox'), [filters, setFilters] = useState({ scope: 'all', query: '', status: 'all', kind: 'all' });
    const [cursors, setCursors] = useState([null]), [next, setNext] = useState(null), [inboxLoading, setInboxLoading] = useState(false), [inboxError, setInboxError] = useState('');
    const [searchError, setSearchError] = useState(''), [searchAttempt, setSearchAttempt] = useState(0);
    const [loading, setLoading] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState(''), [feedback, setFeedback] = useState('');
    const epoch = useRef(0), searchEpoch = useRef(0), inboxEpoch = useRef(0), pageEpoch = useRef(0), lock = useRef(false), retry = useRef(null), alive = useRef(true);
    const clear = useCallback(() => { epoch.current++; searchEpoch.current++; inboxEpoch.current++; pageEpoch.current++; setSelected([]); setPlayers([]); setQuery(''); setTitle(''); setBody(''); setPage(null); setThread(''); setRows([]); setNext(null); setView('inbox'); setSearchError(''); setInboxError(''); setReply(null); setReview(false); setError(''); setFeedback(''); setBusy(false); lock.current = false; retry.current = null; }, []);
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
    const cursor = cursors.at(-1), filterScope = filters.scope, filterStatus = filters.status, filterKind = filters.kind;
    const loadInbox = useCallback(async () => {
        if (document.hidden) return;
        const version = epoch.current, request = ++inboxEpoch.current;
        setInboxLoading(true); setInboxError('');
        try {
            const result = await rpc('admin_inbox_page', { scope: filterScope, status: filterStatus, kind: filterKind, query: filters.query.trim(), before: cursor });
            if (alive.current && version === epoch.current && request === inboxEpoch.current) { setRows(result.rows); setNext(result.next); }
        } catch (e) {
            if (alive.current && version === epoch.current && request === inboxEpoch.current) { setRows([]); setNext(null); setInboxError(e.message); }
        } finally { if (alive.current && version === epoch.current && request === inboxEpoch.current) setInboxLoading(false); }
    }, [rpc, filterScope, filterStatus, filterKind, filters.query, cursor]);
    const changeFilter = (key, value) => {
        inboxEpoch.current++; setRows([]); setNext(null); setCursors([null]); setInboxError(''); setInboxLoading(true);
        setFilters(current => ({ ...current, [key]: value }));
    };
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
    useEffect(() => {
        setInboxLoading(true);
        const timer = setTimeout(() => void loadInbox(), 250);
        return () => clearTimeout(timer);
    }, [loadInbox]);
    useEffect(() => { setPage(null); setReply(null); setBody(''); setReview(false); retry.current = null; void loadThread(thread); }, [thread, loadThread]);
    useEffect(() => {
        const request = ++searchEpoch.current; setPlayers([]); setLoading(false); setSearchError('');
        if (!scope || query.trim().length < 2 || view !== 'compose' || document.hidden) return;
        const timer = setTimeout(() => {
            setLoading(true);
            void rpc('admin_players', { scope, query: query.trim() }).then(result => { if (alive.current && request === searchEpoch.current) setPlayers(result); })
                .catch(e => { if (alive.current && request === searchEpoch.current) setSearchError(e.message); })
                .finally(() => { if (alive.current && request === searchEpoch.current) setLoading(false); });
        }, 250);
        return () => clearTimeout(timer);
    }, [rpc, scope, query, view, searchAttempt]);
    useEffect(() => {
        if (!owner) return;
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
    }, [owner, thread, loadInbox, loadThread]);
    const clearDraft = () => { searchEpoch.current++; pageEpoch.current++; setSelected([]); setPlayers([]); setQuery(''); setTitle(''); setBody(''); setPage(null); setThread(''); setReply(null); setReview(false); setError(''); setFeedback(''); setSearchError(''); retry.current = null; };
    const chooseScope = value => { clearDraft(); setScope(value); };
    const showInbox = () => { clearDraft(); setView('inbox'); void loadInbox(); };
    const openConversation = row => { clearDraft(); setScope(row.scope); setThread(row.id); setView('thread'); };
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
            else { const waiting = result.filter(row => row.status === 'waiting').length; setFeedback(`${result.length - waiting} conversation${result.length - waiting === 1 ? '' : 's'} updated${waiting ? ` · ${waiting} still awaiting acceptance` : ''}. New recipients receive an invitation first.`); setSelected([]); setQuery(''); setPlayers([]); setView('inbox'); }
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
    const changeDelivery = value => { setMode(value); setReview(false); retry.current = null; };
    const globalAudience = scope.startsWith('org:') && scopes.some(row => row.id === scope && row.globalAudience === true);
    const ready = !busy && !!body.trim() && (thread ? !!page?.conversation.canSend : !!scope && selected.length > 0 && (mode !== 'group' || selected.length >= 2 && selected.length <= 19 && title.trim().length >= 2));
    return {
        scopes, scope, query, setQuery, players, selected, mode, changeDelivery, title, setTitle, body, setBody,
        review, setReview, rows, setRows, thread, page, reply, setReply, view, setView, filters, cursors, setCursors,
        next, inboxLoading, inboxError, searchError, setSearchAttempt, loading, busy, error, feedback,
        loadInbox, loadThread, clearDraft, changeFilter, chooseScope, showInbox, openConversation, toggle,
        publish, remove, globalAudience, ready
    };
}
