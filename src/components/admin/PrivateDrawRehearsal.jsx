import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, FlaskConical, Loader2, RefreshCcw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { rehearsalStorageKey } from '../../utils/privateDrawRehearsal';

export function PrivateRehearsalEvents({ onStart }) {
    const [events, setEvents] = useState(null);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    useEffect(() => {
        let active = true;
        supabase.rpc('list_private_draw_rehearsal_events').then(({ data, error }) => {
            if (!active) return;
            if (error) setError(error.message); else setEvents(data || []);
        });
        return () => { active = false; };
    }, []);
    return <section className="space-y-5 text-white">
        <header><h2 className="text-2xl font-bold">Event Manager</h2><p className="mt-2 text-sm text-gray-400">Choose an event to practise its draws, scheduling and results in a private copy.</p></header>
        <label className="block text-sm text-gray-300">Find an event<input type="search" value={search} onChange={event => setSearch(event.target.value)} className="mt-2 block min-h-11 w-full rounded-xl border border-white/20 bg-[#151515] px-4 py-3 text-white focus-visible:outline-2 focus-visible:outline-amber-200" /></label>
        {error && <p role="alert" className="text-red-200">{error}</p>}
        {!events && !error && <p role="status">Loading events…</p>}
        <div className="divide-y divide-white/10 rounded-xl border border-white/10">{events?.filter(event => event.event_name.toLowerCase().includes(search.toLowerCase())).map(event => <article key={event.id} className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div><h3 className="font-bold">{event.event_name}</h3><p className="mt-1 text-sm text-gray-400">{event.start_date} · {event.venue || 'Venue TBC'}</p></div>
            <button type="button" onClick={() => onStart(event.id)} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-amber-300/40 bg-amber-300/10 px-4 py-3 text-sm font-bold text-amber-200 hover:bg-amber-300/20 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-200"><FlaskConical size={17} />Start private rehearsal</button>
        </article>)}</div>
        {events?.length === 0 && <p>No native events are available to rehearse.</p>}
    </section>;
}

export default function PrivateDrawRehearsal({ eventId, onClose }) {
    const frame = useRef(null);
    const dialog = useRef(null);
    const [snapshot, setSnapshot] = useState(null);
    const [error, setError] = useState('');
    const [storageError, setStorageError] = useState('');
    const [revision, setRevision] = useState(0);
    const key = useRef(null);
    useEffect(() => { dialog.current?.showModal(); }, []);
    useEffect(() => {
        let active = true;
        async function load() {
            try {
                // Re-authorise every opening, even when a local rehearsal exists.
                const { data, error } = await supabase.rpc('private_draw_rehearsal_snapshot', { p_event_id: eventId });
                if (error) throw error;
                if (!active) return;
                key.current = rehearsalStorageKey(data.owner_id, eventId);
                let saved;
                try { saved = JSON.parse(localStorage.getItem(key.current)); } catch { /* Start with the authorised snapshot. */ }
                setSnapshot(saved?.version === 1 && saved.owner_id === data.owner_id && saved.event?.id === data.event.id ? saved : data);
            } catch (failure) { if (active) setError(failure.message); }
        }
        load();
        return () => { active = false; };
    }, [eventId, revision]);

    useEffect(() => {
        if (!snapshot) return;
        function receive(event) {
            // Opaque sandbox origin is "null"; authenticate by Window identity.
            if (event.source !== frame.current?.contentWindow) return;
            if (event.data?.type === '4m-rehearsal-ready') {
                frame.current.contentWindow.postMessage({ type: '4m-rehearsal-init', snapshot }, '*');
            }
            if (event.data?.type === '4m-rehearsal-save') {
                const next = event.data.snapshot;
                if (next?.version !== 1 || next.owner_id !== snapshot.owner_id || next.event?.id !== snapshot.event.id) return;
                try { localStorage.setItem(key.current, JSON.stringify(next)); setStorageError(''); }
                catch { setStorageError('This browser could not save your rehearsal. Keep this window open; changes may be lost when you close it.'); }
            }
        }
        window.addEventListener('message', receive);
        return () => window.removeEventListener('message', receive);
    }, [snapshot]);

    function restart() {
        if (!window.confirm('Discard this browser’s rehearsal and copy the latest live entrants and settings? The live event is unchanged.')) return;
        try { localStorage.removeItem(key.current); }
        catch { setStorageError('Could not clear the saved rehearsal. Check browser storage and try again.'); return; }
        setSnapshot(null); setError(''); setStorageError(''); setRevision(value => value + 1);
    }
    return <dialog ref={dialog} onCancel={event => { event.preventDefault(); onClose(); }} className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none flex-col bg-[#080808] p-0 text-white open:flex" aria-label="Private draw rehearsal">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-amber-300/30 bg-[#252014] px-4 py-3 sm:px-6">
            <div><p className="flex items-center gap-2 font-bold text-amber-200"><FlaskConical size={18} />Private rehearsal · {snapshot?.event.event_name || 'Loading event'}</p><p className="mt-1 text-xs leading-5 text-amber-100/80">Only this browser’s copy changes. No notifications, live matches or profile points. Saved separately for your account.</p></div>
            <div className="flex flex-wrap gap-2"><button type="button" disabled={!snapshot} onClick={restart} className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-amber-200/30 px-3 py-2 text-sm disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-amber-200"><RefreshCcw size={15} />Start fresh copy</button><button type="button" onClick={onClose} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-amber-200 px-3 py-2 text-sm font-bold text-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"><ArrowLeft size={15} />Leave rehearsal</button></div>
        </header>
        {storageError && <p role="alert" className="bg-red-950 p-3 text-sm text-red-100">{storageError}</p>}
        {error ? <p role="alert" className="p-6 text-red-200">{error}</p> : !snapshot ? <p role="status" className="flex items-center gap-2 p-6"><Loader2 size={18} className="animate-spin" />Copying event for rehearsal…</p> : <iframe key={revision} ref={frame} title="Private event draw workspace" src="/private-draw-rehearsal/index.html" sandbox="allow-scripts allow-downloads" referrerPolicy="no-referrer" className="min-h-0 w-full flex-1 border-0" />}
    </dialog>;
}
