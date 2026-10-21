import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check, Loader2, Search, User, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import { searchRegistrationPlayers } from '../utils/adminEventRegistration';

const normalize = (value) => String(value || '').trim().toLowerCase();

export default function ReplacePartnerDialog({ owner, onClose, onReplaced, dark = false }) {
    const dialogRef = useRef(null);
    const searchRef = useRef(null);
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [selected, setSelected] = useState(null);
    const [searching, setSearching] = useState(false);
    const [searched, setSearched] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const dialog = dialogRef.current;
        dialog.showModal();
        searchRef.current?.focus();
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
            const result = await searchRegistrationPlayers(supabase, query);
            if (!active) return;
            setSearching(false);
            setSearched(true);
            if (result.error) {
                setError('Could not search players. Please try again.');
                return;
            }
            setResults(result.data.filter((player) => ![normalize(owner.email), normalize(owner.partner_email)].includes(normalize(player.email))));
        }, 300);
        return () => { active = false; clearTimeout(timeout); };
    }, [query, selected, owner.email, owner.partner_email]);

    const submit = async (event) => {
        event.preventDefault();
        if (!selected || saving) return;
        setSaving(true);
        setError('');
        try {
            const { error: replacementError } = await supabase.rpc('replace_paid_partner', {
                p_owner_id: owner.id,
                p_expected_partner_email: owner.partner_email,
                p_new_player_id: selected.id,
            });
            if (replacementError) throw replacementError;
        } catch (err) {
            setError(err.message || 'Could not replace your partner. Please try again.');
            setSaving(false);
            return;
        }
        toast.success(`Partner replaced with ${selected.name}. No charge or refund.`);
        window.dispatchEvent(new CustomEvent('4m:registrations-changed'));
        window.dispatchEvent(new CustomEvent('4m:schedule-changed'));
        onClose();
        onReplaced?.();
    };

    const border = dark ? 'border-white/15' : 'border-slate-200';
    const muted = dark ? 'text-gray-400' : 'text-slate-500';
    const control = dark ? 'bg-white/5 border-white/15 text-white' : 'bg-white border-slate-300 text-slate-900';

    return (
        <dialog ref={dialogRef} aria-labelledby="replace-partner-title" aria-describedby="replace-partner-description"
            onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}
            className={`fixed inset-0 m-auto w-[calc(100%_-_2rem)] max-w-lg max-h-[90dvh] overflow-y-auto rounded-2xl border p-0 shadow-2xl backdrop:bg-black/60 ${border} ${dark ? 'bg-[#191919] text-white' : 'bg-white text-slate-900'}`}>
            <form onSubmit={submit} className="p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <h2 id="replace-partner-title" className="text-lg font-semibold flex items-center gap-2"><ArrowRightLeft size={19} /> Replace partner</h2>
                        <p className={`text-sm mt-1 ${muted}`}>{owner.division}</p>
                    </div>
                    <button type="button" onClick={onClose} disabled={saving} aria-label="Close replace partner"
                        className="p-2 rounded-lg hover:bg-gray-500/10 focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-40"><X size={20} /></button>
                </div>
                <p id="replace-partner-description" className={`mt-4 text-sm leading-relaxed ${muted}`}>
                    {owner.full_name} paid for both entries. Replace {owner.partner_name || 'the current partner'} using the existing paid spot. No payment or refund is needed.
                </p>
                <div className={`mt-4 rounded-xl border p-3 flex items-center justify-between gap-3 ${dark ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-300' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
                    <span className="text-sm font-medium flex items-center gap-2"><Check size={16} /> Entry fee covered</span>
                    <span className="text-lg font-semibold">R0</span>
                </div>
                <label htmlFor="replacement-player-search" className="block text-sm font-medium mt-5 mb-2">New partner</label>
                <div className="relative">
                    <Search size={17} className={`absolute left-3 top-3.5 ${muted}`} />
                    <input ref={searchRef} id="replacement-player-search" autoComplete="off" placeholder="Search 4M players by name or email"
                        value={query} disabled={saving} onChange={(event) => { setQuery(event.target.value); setSelected(null); setError(''); }}
                        className={`w-full rounded-xl border pl-10 pr-3 py-3 text-sm focus-visible:outline-2 focus-visible:outline-emerald-500 ${control}`} />
                </div>
                <div aria-live="polite">
                    {searching && <p className={`flex items-center gap-2 mt-3 text-sm ${muted}`}><Loader2 size={14} className="animate-spin" /> Searching players…</p>}
                    {searched && !results.length && !error && <p className={`mt-3 text-sm ${muted}`}>No matching players. Try another name or email.</p>}
                </div>
                {!!results.length && <ul aria-label="Matching players" className={`mt-2 max-h-48 overflow-y-auto rounded-xl border divide-y ${border} ${dark ? 'divide-white/10' : 'divide-slate-100'}`}>
                    {results.map((player) => <li key={player.id}>
                        <button type="button" onClick={() => { setSelected(player); setQuery(player.name); setResults([]); setError(''); }}
                            className="w-full text-left px-3 py-3 flex items-center gap-3 hover:bg-gray-500/10 focus-visible:outline-2 focus-visible:outline-emerald-500">
                            {player.image_url ? <img src={player.image_url} alt="" className="w-9 h-9 object-cover rounded-full" /> : <User size={24} className={muted} />}
                            <span className="min-w-0"><span className="block text-sm font-medium">{player.name}</span><span className={`block text-xs truncate ${muted}`}>{player.email}</span></span>
                        </button>
                    </li>)}
                </ul>}
                {selected && <div className={`mt-3 border rounded-xl p-3 text-sm ${border}`}>
                    <p className="font-medium">{owner.partner_name} <span className={muted}>→</span> {selected.name}</p>
                    <p className={`text-xs mt-1 ${muted}`}>The new partner stays paired with {owner.full_name}.</p>
                </div>}
                <p className={`mt-3 text-xs leading-relaxed ${muted}`}>The new partner needs a 4M profile. SAPA licence requirements still apply to their own profile.</p>
                {error && <p role="alert" className={`mt-4 text-sm rounded-xl p-3 ${dark ? 'bg-red-500/10 text-red-300' : 'bg-red-50 text-red-700'}`}>{error}</p>}
                <div className="flex justify-end gap-2 mt-6">
                    <button type="button" onClick={onClose} disabled={saving} className={`rounded-xl border px-4 py-2.5 text-sm font-medium disabled:opacity-40 ${control}`}>Cancel</button>
                    <button type="submit" disabled={!selected || saving} className="rounded-xl px-4 py-2.5 text-sm font-semibold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-40 flex items-center gap-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500">
                        {saving && <Loader2 size={16} className="animate-spin" />}{saving ? 'Replacing…' : 'Replace partner for free'}
                    </button>
                </div>
            </form>
        </dialog>
    );
}
