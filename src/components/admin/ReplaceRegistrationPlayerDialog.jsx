import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Loader2, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { searchRegistrationPlayers } from '../../utils/adminEventRegistration';

const normalize = value => String(value || '').trim().toLowerCase();

export default function ReplaceRegistrationPlayerDialog({ players, initialRegistrationId, onClose, onReplaced }) {
    const dialogRef = useRef(null);
    const [registrationId, setRegistrationId] = useState(initialRegistrationId || players[0].id);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const registration = players.find(player => player.id === registrationId);
    const teammate = players.find(player => player.id !== registrationId);

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        return () => dialog.close();
    }, []);

    useEffect(() => {
        let active = true;
        setResults([]);
        setSearched(false);
        setSearching(false);
        if (query.trim().length < 2 || selected) return;
        setSearching(true);
        const timeout = setTimeout(async () => {
            try {
                const result = await searchRegistrationPlayers(supabase, query);
                if (!active) return;
                if (result.error) throw result.error;
                setResults(result.data.filter(player => !players.some(entry => normalize(entry.email) === normalize(player.email))));
                setSearched(true);
            } catch {
                if (active) setError('Could not search players. Please try again.');
            } finally {
                if (active) setSearching(false);
            }
        }, 300);
        return () => { active = false; clearTimeout(timeout); };
    }, [query, selected, players]);

    const submit = async event => {
        event.preventDefault();
        if (!selected || saving) return;
        setSaving(true);
        setError('');
        try {
            const { error: replacementError } = await supabase.rpc('replace_registration_player', {
                p_registration_id: registration.id,
                p_expected_email: registration.email,
                p_expected_partner_email: registration.partner_email || null,
                p_new_player_id: selected.id,
            });
            if (replacementError) throw replacementError;
        } catch (err) {
            setError(err.message || 'Could not replace this player. Please try again.');
            setSaving(false);
            return;
        }
        toast.success(`${registration.full_name} replaced with ${selected.name}.`);
        window.dispatchEvent(new CustomEvent('4m:registrations-changed'));
        window.dispatchEvent(new CustomEvent('4m:schedule-changed'));
        onClose();
        onReplaced?.();
    };

    return (
        <dialog ref={dialogRef} aria-labelledby="replace-player-title" aria-describedby="replace-player-description"
            onCancel={event => { event.preventDefault(); if (!saving) onClose(); }}
            className="fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto overscroll-contain rounded-2xl border border-white/15 bg-[#191919] p-0 text-white shadow-2xl backdrop:bg-black/70">
            <form onSubmit={submit} className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="replace-player-title" className="flex items-center gap-2 text-lg font-semibold"><ArrowRightLeft size={19} /> Replace player</h2>
                        <p className="mt-1 text-sm text-gray-400">{registration.division}</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Close replace player"
                        className="rounded-lg p-2 hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-40"><X size={20} /></button>
                </div>
                <p id="replace-player-description" className="mt-4 text-sm leading-relaxed text-gray-400">
                    Choose the player leaving and their replacement. The entry keeps its payment status and division. No charge or refund is created.
                </p>
                <fieldset disabled={saving} className="mt-4 space-y-2">
                    <legend className="mb-2 text-sm font-medium">Player to replace</legend>
                    {players.map(player => <label key={player.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 ${registrationId === player.id ? 'border-emerald-500/40 bg-emerald-500/10' : 'border-white/15 hover:bg-white/5'}`}>
                        <input type="radio" name="outgoing-player" value={player.id} checked={registrationId === player.id}
                            onChange={() => { setRegistrationId(player.id); setError(''); }} className="accent-emerald-500" />
                        <span className="min-w-0"><span className="block text-sm font-medium">{player.full_name}</span><span className="block truncate text-xs text-gray-400">{player.email}</span></span>
                    </label>)}
                </fieldset>
                <label htmlFor="replacement-player-search" className="mb-2 mt-5 block text-sm font-medium">New player</label>
                <div className="relative">
                    <Search size={17} className="absolute left-3 top-3.5 text-gray-400" />
                    <input id="replacement-player-search" autoComplete="off" placeholder="Search 4M players by name or email…"
                        value={query} disabled={saving} onChange={event => { setQuery(event.target.value); setSelected(null); setError(''); }}
                        className="w-full rounded-xl border border-white/15 bg-white/5 py-3 pl-10 pr-3 text-sm text-white focus-visible:outline-2 focus-visible:outline-emerald-400" />
                </div>
                <div aria-live="polite">
                    {searching && <p className="mt-3 flex items-center gap-2 text-sm text-gray-400"><Loader2 size={14} className="animate-spin" /> Searching players…</p>}
                    {searched && !results.length && !selected && !error && <p className="mt-3 text-sm text-gray-400">No matching players. Try another name or email.</p>}
                </div>
                {!!results.length && <ul aria-label="Matching players" className="mt-2 max-h-48 divide-y divide-white/10 overflow-y-auto rounded-xl border border-white/15">
                    {results.map(player => <li key={player.id}>
                        <button type="button" disabled={saving} onClick={() => { setSelected(player); setQuery(player.name); setResults([]); setError(''); }}
                            className="flex w-full items-center gap-3 px-3 py-3 text-left hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-400">
                            {player.image_url ? <img src={player.image_url} alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" /> : <User size={24} className="text-gray-400" />}
                            <span className="min-w-0"><span className="block text-sm font-medium">{player.name}</span><span className="block truncate text-xs text-gray-400">{player.email}</span></span>
                        </button>
                    </li>)}
                </ul>}
                {selected && <div className="mt-3 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-sm">
                    <p className="font-medium">{registration.full_name} <span className="text-gray-400">→</span> {selected.name}</p>
                    {teammate && <p className="mt-1 text-xs text-gray-400">{selected.name} stays paired with {teammate.full_name}.</p>}
                </div>}
                <p className="mt-3 text-xs leading-relaxed text-gray-400">The new player needs a 4M profile and their own SAPA licence where required. A generated draw must be cleared or archived first.</p>
                {error && <p role="alert" className="mt-4 rounded-xl bg-red-500/10 p-3 text-sm text-red-300">{error}</p>}
                <div className="mt-6 flex justify-end gap-2">
                    <button type="button" onClick={onClose} disabled={saving} className="rounded-xl border border-white/15 px-4 py-2.5 text-sm font-medium hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-emerald-400 disabled:opacity-40">Cancel</button>
                    <button type="submit" disabled={!selected || saving} className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 disabled:opacity-40">
                        {saving && <Loader2 size={16} className="animate-spin" />}{saving ? 'Replacing…' : 'Replace player'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
