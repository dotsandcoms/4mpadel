import React, { useEffect, useRef, useState } from 'react';
import { GitMerge, Loader2, Search, Unlink, X } from 'lucide-react';

export default function RegistrationTeamDialog({ action, registration, teammate, candidates, busy, error, onConfirm, onClose }) {
    const [search, setSearch] = useState('');
    const [selectedId, setSelectedId] = useState('');
    const dialogRef = useRef(null);
    const splitting = action === 'split';
    const selected = splitting ? teammate : candidates.find((candidate) => candidate.id === selectedId);
    const query = search.trim().toLowerCase();
    const matches = candidates.filter((candidate) => !query
        || [candidate.full_name, candidate.email].filter(Boolean).join(' ').toLowerCase().includes(query));

    useEffect(() => {
        const previousFocus = document.activeElement;
        dialogRef.current?.focus();
        return () => previousFocus?.isConnected && previousFocus.focus();
    }, []);

    const handleKeyDown = (event) => {
        if (event.key === 'Escape' && !busy) { event.stopPropagation(); onClose(); }
        if (event.key !== 'Tab') return;
        const controls = [...dialogRef.current.querySelectorAll('button:not(:disabled), input:not(:disabled)')];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
            event.preventDefault(); last?.focus();
        } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
            event.preventDefault(); first?.focus();
        }
    };

    return (
        <div className="fixed inset-0 z-[1200] flex items-center justify-center bg-black/70 p-4" onClick={() => !busy && onClose()}>
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="registration-team-title" aria-describedby="registration-team-description"
                tabIndex={-1} onKeyDown={handleKeyDown} onClick={(event) => event.stopPropagation()}
                className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0a0a0a] p-5 text-white focus:outline-none max-h-[90dvh] overflow-y-auto">
                <div className="flex items-start gap-3">
                    <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${splitting ? 'bg-violet-500/10 text-violet-300' : 'bg-sky-500/10 text-sky-400'}`}>
                        {splitting ? <Unlink size={18} /> : <GitMerge size={18} />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <h3 id="registration-team-title" className="font-bold">{splitting ? 'Split team' : 'Merge solo entries'}</h3>
                        <p className="mt-1 text-xs text-gray-400">{registration.division} · {registration.full_name}</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={busy} aria-label="Close team dialog" className="rounded-lg p-2 text-gray-400 hover:text-white focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50"><X size={18} /></button>
                </div>
                <p id="registration-team-description" className="mt-4 text-sm leading-relaxed text-gray-300">
                    {splitting ? `${registration.full_name} and ${teammate.full_name} will become two solo entries in this division.`
                        : 'Choose another solo entry in this division to form one team. Named partners who have not entered can be replaced.'}
                    {' '}Each player keeps their registration, payment and licence details.
                    {' '}{splitting ? 'Splitting needs one additional team place and is unavailable when the division is full.' : 'Joining two solo entries frees one team place.'}
                </p>
                {!splitting && <>
                    <label className="relative mt-4 block">
                        <span className="sr-only">Search solo entries</span>
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
                        <input value={search} onChange={(event) => setSearch(event.target.value)} disabled={busy} placeholder="Search name or email…"
                            className="w-full rounded-lg border border-white/10 bg-black/30 py-2 pl-9 pr-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-sky-400" />
                    </label>
                    <fieldset className="mt-3 max-h-64 space-y-2 overflow-y-auto" disabled={busy}>
                        <legend className="sr-only">Solo entries in this division</legend>
                        {matches.length === 0 && <p className="py-4 text-sm text-gray-400">{query ? 'No solo entries match your search.' : 'No other solo entries are available in this division.'}</p>}
                        {matches.map((candidate) => <label key={candidate.id} className={`flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-3 ${selectedId === candidate.id ? 'border-sky-500/50 bg-sky-500/10' : 'border-white/10 bg-white/5 hover:border-white/20'}`}>
                            <input type="radio" name="merge-partner" value={candidate.id} checked={selectedId === candidate.id} onChange={() => setSelectedId(candidate.id)} className="accent-sky-500" />
                            <span className="min-w-0"><span className="block text-sm font-semibold">{candidate.full_name}</span><span className="block truncate text-xs text-gray-400">{candidate.email}</span></span>
                        </label>)}
                    </fieldset>
                </>}
                {error && <p role="alert" className="mt-4 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                <div className="mt-5 flex gap-2">
                    <button type="button" onClick={onClose} disabled={busy} className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm font-semibold text-gray-300 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-sky-400 disabled:opacity-50">Cancel</button>
                    <button type="button" onClick={() => onConfirm(selected)} disabled={busy || !selected}
                        className={`flex flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-bold text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-50 ${splitting ? 'bg-violet-600 hover:bg-violet-500 focus-visible:outline-violet-400' : 'bg-sky-600 hover:bg-sky-500 focus-visible:outline-sky-400'}`}>
                        {busy && <Loader2 size={15} className="animate-spin" />}{splitting ? 'Split into solo entries' : 'Merge into team'}
                    </button>
                </div>
            </div>
        </div>
    );
}
