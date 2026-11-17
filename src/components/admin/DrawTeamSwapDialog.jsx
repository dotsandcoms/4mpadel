import React, { useEffect, useId, useRef, useState } from 'react';
import { ArrowLeftRight, Check, Search } from 'lucide-react';
import DrawActionDialog from './DrawActionDialog';

const team = (slot, empty) => slot.entry?.team_name || empty;
const seed = entry => entry?.seed_number ? `Seed #${entry.seed_number}` : entry ? 'Unseeded' : '';
const players = (entry, empty) => [entry?.player_one_name, entry?.player_two_name].filter(Boolean).join(' / ') || entry?.team_name || empty;
const normalize = value => String(value || '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

export default function DrawTeamSwapDialog({ source, targets, onClose, onApply, getWarnings, groups = false, disabled = false }) {
    const [query, setQuery] = useState('');
    const [active, setActive] = useState(-1);
    const [selected, setSelected] = useState(null);
    const [applying, setApplying] = useState(false);
    const [error, setError] = useState('');
    const search = useRef(null);
    const resultsId = useId();
    const empty = groups ? 'Open spot' : 'BYE';
    const position = slot => groups ? slot.position : `Bracket slot ${slot.position}`;
    const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
    const options = targets.filter(slot => terms.every(term => normalize([
        slot.entry?.player_one_name, slot.entry?.player_two_name, team(slot, empty), seed(slot.entry), position(slot),
    ].join(' ')).includes(term)));
    const optionKey = slot => groups ? `${slot.groupKey}:${slot.entry?.id || slot.entry?.source_registration_id || 'open'}` : slot.position;
    const target = options.find(slot => optionKey(slot) === selected);
    const moving = groups && target && !target.entry;
    const action = moving ? 'Move team' : groups ? 'Swap teams' : 'Swap positions';

    useEffect(() => {
        if (active >= 0) document.getElementById(`${resultsId}-${active}`)?.scrollIntoView({ block: 'nearest' });
    }, [active, resultsId]);

    const apply = async () => {
        if (!target || disabled || applying) return;
        setError('');
        setApplying(true);
        try {
            await onApply(source, target);
            onClose();
        } catch (failure) {
            setError(failure.message || 'The draw changed. Close this window and try again.');
            setApplying(false);
        }
    };
    const select = (option, index) => {
        setSelected(optionKey(option));
        setActive(index);
        setError('');
        search.current?.focus();
    };
    const onKeyDown = event => {
        if (['ArrowDown', 'ArrowUp'].includes(event.key) && options.length) {
            event.preventDefault();
            setActive(index => index === -1
                ? (event.key === 'ArrowDown' ? 0 : options.length - 1)
                : Math.max(0, Math.min(options.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1))));
        }
        if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
            event.preventDefault();
            const option = options[active] || options[0];
            if (option && option === target) apply();
            else if (option) select(option, Math.max(active, 0));
        }
    };
    const warnings = target ? getWarnings?.(source, target) || [] : [];

    return <DrawActionDialog open title={groups ? 'Swap or move a team' : 'Swap draw positions'} initialFocusRef={search}
        onClose={() => { if (!applying) onClose(); }}
        footer={<div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-gray-400">↑ ↓ Navigate · Enter Select · Esc Close</p><button type="button" onClick={apply}
            disabled={!target || disabled || applying} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-padel-green px-4 py-2 text-sm font-bold text-black disabled:opacity-40"><ArrowLeftRight size={16} />{applying ? 'Saving…' : action}</button></div>}>
        <div className="rounded-lg border border-white/15 bg-white/5 px-3 py-2.5">
            <p className="text-xs text-gray-400">Selected · {position(source)}{seed(source.entry) && ` · ${seed(source.entry)}`}</p>
            <p className="mt-1 text-sm font-semibold">{players(source.entry, empty)}</p>
        </div>
        <label className="block text-sm font-bold">Find a destination
            <span className="relative mt-2 block"><Search size={17} className="pointer-events-none absolute left-3 top-3.5 text-gray-400" />
                <input ref={search} role="combobox" aria-autocomplete="list" aria-expanded="true" aria-controls={resultsId}
                    aria-activedescendant={options[active] ? `${resultsId}-${active}` : undefined} value={query}
                    placeholder={groups ? 'Search player, team or group' : 'Search player, team or slot'}
                    onChange={event => { setQuery(event.target.value); setActive(-1); setSelected(null); setError(''); }}
                    onKeyDown={onKeyDown} className="min-h-11 w-full rounded-lg border border-white/20 bg-[#151515] py-2 pl-10 pr-3 text-base font-normal focus:border-padel-green focus:outline-none" />
            </span>
        </label>
        <div role="listbox" aria-label="Available destinations" id={resultsId} className="max-h-52 overflow-y-auto rounded-lg border border-white/15">
            {options.map((slot, index) => <div role="option" aria-selected={slot === target} id={`${resultsId}-${index}`}
                key={optionKey(slot)}
                onMouseDown={event => event.preventDefault()} onClick={() => select(slot, index)}
                className={`flex cursor-pointer items-center justify-between gap-2 border-b border-white/10 px-3 py-2.5 last:border-0 hover:bg-white/10 ${index === active ? 'bg-white/10 ring-1 ring-inset ring-padel-green/60' : ''}`}>
                <div><p className="text-sm font-semibold">{players(slot.entry, empty)}</p>
                    {slot.entry?.team_name && slot.entry.team_name !== players(slot.entry, empty) && <p className="text-xs text-gray-400">{slot.entry.team_name}</p>}
                    <p className="mt-0.5 text-xs text-gray-400">{position(slot)}{seed(slot.entry) && ` · ${seed(slot.entry)}`}</p></div>
                {slot === target && <Check size={17} className="shrink-0 text-padel-green" />}
            </div>)}
            {!options.length && <p role="status" className="p-3 text-sm text-gray-400">{query ? 'No matches. Try a shorter search.' : 'There are no available destinations.'}</p>}
        </div>
        {target && <p className="text-sm text-gray-300">{team(source, empty)} → {position(target)}{!moving && <> · {team(target, empty)} → {position(source)}</>}</p>}
        {target && groups && <p className="text-xs leading-5 text-gray-400">{moving
            ? 'Fixtures update automatically. Schedule the new matchups in Schedule & publish.'
            : 'Fixtures update automatically. Any court times that conflict will need to be rebooked.'}</p>}
        {warnings.length > 0 && <ul className="list-disc space-y-1 rounded-lg border border-amber-300/30 bg-amber-300/10 py-2 pl-7 pr-3 text-sm text-amber-200">{warnings.map(warning => <li key={warning}>{warning}</li>)}</ul>}
        {error && <p role="alert" className="rounded-lg bg-red-300/10 p-3 text-sm text-red-200">{error}</p>}
    </DrawActionDialog>;
}
