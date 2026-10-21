import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, Bell, Check, Loader, RefreshCw, Search, Send, Users, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';

const panel = 'bg-[#0a0a0a] border border-white/5 p-5 sm:p-6 rounded-2xl';
const field = 'w-full bg-black/50 border border-white/15 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-padel-green focus:ring-1 focus:ring-padel-green';
const action = 'inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green disabled:opacity-50 disabled:cursor-not-allowed';
const availability = { ready: 'Push available', disabled: 'Push disabled', no_device: 'No app device' };
const date = (value) => new Date(value).toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg', dateStyle: 'medium', timeStyle: 'short' });

async function rpc(name, args) {
    const { data, error } = await supabase.rpc(name, args);
    if (error) throw error;
    return data;
}

export default function PushBroadcastManager({ onBusyChange }) {
    const [events, setEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(true);
    const [eventsError, setEventsError] = useState('');
    const [eventSearch, setEventSearch] = useState('');
    const [eventIds, setEventIds] = useState([]);
    const [players, setPlayers] = useState([]);
    const [playerSearch, setPlayerSearch] = useState('');
    const [searchResults, setSearchResults] = useState([]);
    const [searching, setSearching] = useState(false);
    const [searchError, setSearchError] = useState('');
    const [payment, setPayment] = useState('all');
    const [partner, setPartner] = useState('all');
    const [excluded, setExcluded] = useState([]);
    const [preview, setPreview] = useState(null);
    const [previewLoading, setPreviewLoading] = useState(false);
    const [previewError, setPreviewError] = useState('');
    const [revision, setRevision] = useState(0);
    const [title, setTitle] = useState('');
    const [body, setBody] = useState('');
    const [destination, setDestination] = useState('/calendar');
    const [destinationEvent, setDestinationEvent] = useState('');
    const [busy, setBusy] = useState(false);
    const [history, setHistory] = useState([]);
    const [historyError, setHistoryError] = useState('');
    const [historyLoading, setHistoryLoading] = useState(false);
    const requestRef = useRef(null);
    const sendLock = useRef(false);
    const audience = useMemo(() => ({ p_event_ids: eventIds, p_player_ids: players.map(p => p.id),
        p_payment: payment, p_partner: partner, p_excluded_emails: excluded }), [eventIds, players, payment, partner, excluded]);
    const audienceKey = JSON.stringify(audience);
    const currentPreview = preview?.key === audienceKey ? preview : null;
    const path = destination === 'event' ? `/events/${destinationEvent}` : destination;
    const validMessage = title.trim() && body.trim() && (destination !== 'event' || destinationEvent);

    useEffect(() => { onBusyChange?.(busy); }, [busy, onBusyChange]);

    const loadEvents = useCallback(async () => {
        setEventsLoading(true);
        setEventsError('');
        try { setEvents(await rpc('admin_push_broadcast_events') || []); }
        catch (error) { setEventsError(error.message || 'Could not load events.'); }
        finally { setEventsLoading(false); }
    }, []);
    const loadHistory = useCallback(async () => {
        setHistoryLoading(true);
        setHistoryError('');
        try { setHistory(await rpc('list_push_broadcasts') || []); }
        catch (error) { setHistoryError(error.message || 'Could not load broadcast history.'); }
        finally { setHistoryLoading(false); }
    }, []);
    useEffect(() => { void loadEvents(); void loadHistory(); }, [loadEvents, loadHistory]);

    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            setSearchResults([]);
            setSearchError('');
            if (playerSearch.trim().length < 2) { setSearching(false); return; }
            setSearching(true);
            try {
                const results = await rpc('admin_push_broadcast_players', { p_search: playerSearch.trim() });
                if (active) setSearchResults(results || []);
            } catch (error) { if (active) setSearchError(error.message || 'Player search failed.'); }
            finally { if (active) setSearching(false); }
        }, 250);
        return () => { active = false; clearTimeout(timer); };
    }, [playerSearch]);

    useEffect(() => {
        let active = true;
        const timer = setTimeout(async () => {
            setPreviewLoading(true);
            setPreviewError('');
            try {
                const result = await rpc('preview_push_broadcast', audience);
                if (active) setPreview({ ...result, key: audienceKey });
            } catch (error) {
                if (active) { setPreview(null); setPreviewError(error.message || 'Could not preview recipients.'); }
            } finally { if (active) setPreviewLoading(false); }
        }, 200);
        return () => { active = false; clearTimeout(timer); };
    }, [audience, audienceKey, revision]);

    const send = async (test = false) => {
        if (sendLock.current || !validMessage) return;
        if (!test && (!currentPreview?.ready || previewLoading || previewError)) return;
        if (!test && !window.confirm(`Queue this notification for ${currentPreview.ready} players? ${currentPreview.disabled} have push disabled and ${currentPreview.no_device} have no registered app device. Each selected player will also see the message in their app inbox.`)) return;
        sendLock.current = true;
        setBusy(true);
        try {
            let target = audience;
            let fingerprint = currentPreview?.fingerprint;
            if (test) {
                const { data: { user }, error } = await supabase.auth.getUser();
                if (error) throw error;
                const matches = await rpc('admin_push_broadcast_players', { p_search: user?.email || '' });
                const me = matches.find(p => p.email === user?.email?.trim().toLowerCase());
                if (!me) throw new Error('Your admin email needs a player profile to receive a test push.');
                target = { p_event_ids: [], p_player_ids: [me.id], p_payment: 'all', p_partner: 'all', p_excluded_emails: [] };
                const testPreview = await rpc('preview_push_broadcast', target);
                if (!testPreview.ready) throw new Error('Enable notifications in the app on your signed-in admin account before sending a test.');
                fingerprint = testPreview.fingerprint;
            }
            const message = { p_title: test ? `Test: ${title.trim()}`.slice(0, 80) : title.trim(), p_body: body.trim(), p_path: path, ...target };
            const signature = JSON.stringify(message);
            // Keep the request ID after uncertain network failures; a retry cannot resend it.
            if (test || requestRef.current?.signature !== signature) requestRef.current = { signature, id: crypto.randomUUID() };
            const result = await rpc('send_push_broadcast', { p_request_id: requestRef.current.id, p_fingerprint: fingerprint, ...message });
            requestRef.current = null;
            toast.success(test ? 'Test notification queued for your account.' : `Broadcast queued for ${result.queued} players.`);
            if (!test) { setTitle(''); setBody(''); }
            void loadHistory();
        } catch (error) {
            toast.error(error.message || 'Could not queue the notification. You can safely retry.');
            setRevision(value => value + 1);
        } finally { setBusy(false); sendLock.current = false; }
    };

    const toggleEvent = id => setEventIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : [...ids, id]);
    const visibleEvents = events.filter(event => event.event_name?.toLowerCase().includes(eventSearch.toLowerCase()));

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                <fieldset disabled={busy} className="xl:col-span-2 min-w-0 space-y-6">
                    <section className={panel} aria-labelledby="push-audience-heading">
                        <h2 id="push-audience-heading" className="text-lg font-bold text-white flex items-center gap-2"><Users size={20} className="text-padel-green" /> Choose recipients</h2>
                        <p className="text-sm text-gray-400 mt-2 mb-5">Combine event lists and individual players. Each person receives one message, even when selected more than once.</p>
                        <label htmlFor="push-player-search" className="block text-sm font-semibold text-white mb-2">Individual players</label>
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-3.5 text-gray-500" />
                            <input id="push-player-search" className={`${field} pl-10`} value={playerSearch} onChange={e => { setPlayerSearch(e.target.value); setSearchResults([]); setSearchError(''); setSearching(e.target.value.trim().length >= 2); }} placeholder="Search by name or email…" autoComplete="off" />
                        </div>
                        {searching && <p role="status" className="text-sm text-gray-400 mt-2">Searching players…</p>}
                        {searchError && <p role="alert" className="text-sm text-amber-300 mt-2">{searchError}</p>}
                        {!searching && playerSearch.trim().length >= 2 && !searchError && searchResults.length === 0 && <p className="text-sm text-gray-400 mt-2">No matching players.</p>}
                        {searchResults.length > 0 && <ul className="max-h-52 overflow-y-auto mt-2 border border-white/10 rounded-xl divide-y divide-white/5">
                            {searchResults.map(player => <li key={player.id}><button type="button" disabled={players.some(p => p.id === player.id)} onClick={() => setPlayers(prev => [...prev, player])} className="flex items-center justify-between gap-3 w-full p-3 text-left hover:bg-white/5 focus-visible:outline-padel-green disabled:opacity-50">
                                <span className="min-w-0"><span className="block text-sm text-white truncate">{player.name || 'Player'}</span><span className="block text-xs text-gray-400 truncate">{player.email}</span></span>
                                {players.some(p => p.id === player.id) ? <Check size={16} className="text-padel-green shrink-0" /> : <span className="text-xs text-padel-green">Add</span>}
                            </button></li>)}
                        </ul>}
                        {players.length > 0 && <ul className="flex flex-wrap gap-2 mt-3">{players.map(player => <li key={player.id} className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg pl-3 text-sm text-white max-w-full">
                            <span className="truncate" title={player.email}>{player.name || player.email}</span><button type="button" aria-label={`Remove ${player.name || player.email}`} onClick={() => setPlayers(prev => prev.filter(p => p.id !== player.id))} className="p-2 hover:text-padel-green focus-visible:outline-padel-green"><X size={14} /></button>
                        </li>)}</ul>}

                        <div className="border-t border-white/10 mt-6 pt-5">
                            <label htmlFor="push-event-search" className="block text-sm font-semibold text-white mb-2">Event lists</label>
                            <input id="push-event-search" className={field} value={eventSearch} onChange={e => setEventSearch(e.target.value)} placeholder="Search tournaments…" />
                            {eventsError ? <div role="alert" className="text-sm text-amber-300 mt-3">{eventsError}<button type="button" className="underline ml-2" onClick={loadEvents}>Retry</button></div> : <div className="max-h-56 overflow-y-auto border border-white/10 rounded-xl mt-3 p-1">
                                {eventsLoading ? <p className="p-3 text-sm text-gray-400">Loading events…</p> : visibleEvents.length === 0 ? <p className="p-3 text-sm text-gray-400">No matching events.</p> : visibleEvents.map(event => <label key={event.id} className="flex items-center gap-3 p-3 rounded-lg hover:bg-white/5 cursor-pointer">
                                    <input type="checkbox" checked={eventIds.includes(event.id)} onChange={() => toggleEvent(event.id)} className="accent-padel-green w-4 h-4 shrink-0" />
                                    <span className="text-sm text-white flex-1 min-w-0 truncate">{event.event_name}</span><span className="text-xs text-gray-500 shrink-0">{event.start_date?.slice(0, 10)}</span>
                                </label>)}
                            </div>}
                            <p className="text-xs text-gray-400 mt-2">{eventIds.length} event{eventIds.length === 1 ? '' : 's'} selected · Active entrants and their partners.</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
                                <label className="text-xs text-gray-400">Payment status<select className={`${field} mt-2`} value={payment} onChange={e => setPayment(e.target.value)}><option value="all">All payments</option><option value="paid">Paid</option><option value="pending">Pending / unpaid</option></select></label>
                                <label className="text-xs text-gray-400">Partner status<select className={`${field} mt-2`} value={partner} onChange={e => setPartner(e.target.value)}><option value="all">All entries</option><option value="has_partner">Has a partner</option><option value="solo">Solo / no partner</option></select></label>
                            </div>
                            {(payment !== 'all' || partner !== 'all') && <p className="text-xs text-amber-300 mt-3">Filters apply to site registrations. RankedIn lists are excluded while filtering. Individually selected players are always included.</p>}
                        </div>
                    </section>

                    <section className={panel} aria-labelledby="push-message-heading">
                        <h2 id="push-message-heading" className="text-lg text-white font-bold flex items-center gap-2"><Bell size={20} className="text-padel-green" /> Notification message</h2>
                        <div className="space-y-4 mt-5">
                            <label className="block text-sm text-white">Title<input className={`${field} mt-2`} value={title} onChange={e => setTitle(e.target.value)} maxLength={80} placeholder="e.g. Tomorrow’s tournament update" /><span className="block text-xs text-gray-500 text-right mt-1">{title.length}/80</span></label>
                            <label className="block text-sm text-white">Message<textarea className={`${field} mt-2 resize-y min-h-32`} value={body} onChange={e => setBody(e.target.value)} maxLength={500} rows={4} placeholder="Write a short update for your players…" /><span className="block text-xs text-gray-500 text-right mt-1">{body.length}/500</span></label>
                            <label className="block text-sm text-white">Open when tapped<select className={`${field} mt-2`} value={destination} onChange={e => setDestination(e.target.value)}><option value="/calendar">Tournament calendar</option><option value="event">A specific event</option><option value="/(tabs)/rankings">Rankings</option><option value="/(tabs)/explore">Explore</option><option value="/(tabs)/profile">Player profile</option><option value="/pro/live">International matches</option></select></label>
                            {destination === 'event' && <label className="block text-sm text-white">Event to open<select className={`${field} mt-2`} value={destinationEvent} onChange={e => setDestinationEvent(e.target.value)}><option value="">Choose an event</option>{events.map(event => <option key={event.id} value={event.id}>{event.event_name}</option>)}</select><span className="text-xs text-gray-400 block mt-2">Choose a published event that players can view in the app.</span></label>}
                        </div>
                    </section>
                </fieldset>

                <aside className="space-y-6 min-w-0">
                    <section className={panel}>
                        <h2 className="text-sm font-bold text-white mb-4">Notification preview</h2>
                        <div className="rounded-xl bg-white/10 border border-white/10 p-4 break-words">
                            <div className="text-[11px] text-gray-400 uppercase tracking-wider flex items-center gap-2 mb-3"><Bell size={13} /> 4M Padel <span className="ml-auto normal-case tracking-normal">now</span></div>
                            <p className="text-sm text-white font-bold">{title.trim() || 'Your notification title'}</p><p className="text-sm text-gray-300 mt-1 whitespace-pre-wrap">{body.trim() || 'Your message will appear here.'}</p>
                        </div>
                        <button type="button" disabled={busy || !validMessage} onClick={() => send(true)} className={`${action} border border-white/15 text-white hover:bg-white/5 w-full mt-4`}>{busy ? <Loader size={16} className="animate-spin" /> : <Bell size={16} />} Send test to me</button>
                        <p className="text-xs text-gray-400 mt-2">Uses your signed-in admin account. Sign in to the app and enable notifications on that account first.</p>
                    </section>
                    <section className={panel}>
                        <div className="flex items-center justify-between gap-3"><h2 className="text-sm font-bold text-white">Audience preview</h2><button type="button" disabled={busy || previewLoading} aria-label="Refresh audience" onClick={() => setRevision(value => value + 1)} className="p-2 text-gray-400 hover:text-white focus-visible:outline-padel-green"><RefreshCw size={16} className={previewLoading ? 'animate-spin' : ''} /></button></div>
                        {previewError ? <p role="alert" className="text-sm text-amber-300 mt-3 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{previewError}</p> : !currentPreview || previewLoading ? <p role="status" className="text-sm text-gray-400 mt-4">Updating audience…</p> : <>
                            <p className="text-3xl font-black text-white mt-3">{currentPreview.ready}<span className="text-sm font-normal text-gray-400 ml-2">can receive push</span></p>
                            <dl className="text-sm space-y-2 mt-4"><div className="flex justify-between text-gray-300"><dt>Selected players</dt><dd>{currentPreview.total}</dd></div><div className="flex justify-between text-gray-400"><dt>Push disabled</dt><dd>{currentPreview.disabled}</dd></div><div className="flex justify-between text-gray-400"><dt>No app device</dt><dd>{currentPreview.no_device}</dd></div></dl>
                            {currentPreview.recipients.length > 0 && <details className="mt-4 text-sm"><summary className="text-gray-300 cursor-pointer">Review recipients</summary><ul className="max-h-64 overflow-y-auto mt-2 divide-y divide-white/5">{currentPreview.recipients.map(person => <li key={person.email} className="flex items-center gap-2 py-2"><div className="min-w-0 flex-1"><p className="text-white text-xs truncate">{person.name}</p><p className="text-gray-400 text-xs truncate">{person.email}</p><p className={`text-[11px] ${person.availability === 'ready' ? 'text-padel-green' : 'text-gray-500'}`}>{availability[person.availability]}</p></div><button type="button" disabled={busy} aria-label={`Exclude ${person.email}`} onClick={() => setExcluded(prev => [...prev, person.email])} className="p-2 text-gray-500 hover:text-white focus-visible:outline-padel-green"><X size={14} /></button></li>)}</ul></details>}
                        </>}
                        {excluded.length > 0 && <button type="button" disabled={busy} onClick={() => setExcluded([])} className="text-xs text-padel-green underline mt-3">Restore {excluded.length} excluded recipient{excluded.length === 1 ? '' : 's'}</button>}
                        <p className="text-xs text-gray-400 mt-4">Push respects player preferences and quiet hours. All selected players also receive the message in their app inbox.</p>
                        <button type="button" onClick={() => send()} disabled={busy || !validMessage || !currentPreview?.ready || previewLoading || !!previewError} className={`${action} w-full mt-5 bg-padel-green text-black hover:bg-padel-green/90`}>{busy ? <Loader size={16} className="animate-spin" /> : <Send size={16} />} {busy ? 'Queuing…' : 'Send push notification'}</button>
                        <p className="text-[11px] text-gray-500 mt-2">Delivery starts on the next scheduled push run.</p>
                    </section>
                </aside>
            </div>
            <section className={panel}>
                <div className="flex items-center justify-between gap-3"><h2 className="text-lg text-white font-bold">Recent push broadcasts</h2><button type="button" onClick={loadHistory} disabled={historyLoading} className={`${action} text-gray-300 hover:text-white`}><RefreshCw size={16} className={historyLoading ? 'animate-spin' : ''} /><span className="hidden sm:inline">Refresh</span></button></div>
                {historyError ? <p role="alert" className="text-sm text-amber-300 mt-3">{historyError}</p> : history.length === 0 ? <p className="text-sm text-gray-400 mt-3">{historyLoading ? 'Loading broadcasts…' : 'Your sent push broadcasts will appear here.'}</p> : <ul className="mt-3 divide-y divide-white/10">{history.map(item => <li key={item.id} className="py-4"><div className="flex flex-wrap items-baseline justify-between gap-2"><h3 className="font-bold text-sm text-white">{item.title}</h3><time className="text-xs text-gray-500">{date(item.created_at)} SAST</time></div><p className="text-sm text-gray-400 mt-1 whitespace-pre-wrap break-words">{item.body}</p><p className="text-xs text-gray-500 mt-2">{item.recipient_count} recipients · {item.pending} pending · {item.sent} delivered · {item.skipped} skipped · {item.failed} failed</p></li>)}</ul>}
                <p className="text-[11px] text-gray-500 mt-3">Delivered means the push provider accepted delivery. It does not confirm the player opened the message.</p>
            </section>
        </div>
    );
}
