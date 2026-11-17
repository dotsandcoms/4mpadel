import React, { useState } from 'react';
import { ArrowDown, ArrowUp, Brackets } from 'lucide-react';
import { qualificationRuleLabels } from '../../utils/drawQualification';

const selectClass = 'mt-2 block w-full rounded-lg border border-white/15 bg-[#151515] px-3 py-2.5 text-white focus-visible:border-padel-green disabled:opacity-50';

export function GroupQualificationSettings({ disabled, mode, places, extras, options, size, rules, onChange }) {
    const moveRule = (index, offset) => {
        const next = [...rules];
        [next[index], next[index + offset]] = [next[index + offset], next[index]];
        onChange({ rules: next });
    };
    return <div className="space-y-3 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-300">
        <label className="block font-bold">Advance to elimination
            <select disabled={disabled} value={mode === 'fixed' ? places : mode} className={selectClass}
                onChange={event => {
                    const value = event.target.value;
                    if (value === 'all') onChange({ mode: 'all' });
                    else if (value === 'best_placed') onChange({ mode: 'best_placed', places: Math.min(places, options.at(-1) || 1) });
                    else onChange({ mode: 'fixed', places: Number(value) });
                }}>
                {options.map(count => <option key={count} value={count}>Top {count} per group</option>)}
                <option value="all">All teams advance</option>
                <option value="best_placed" disabled={disabled ? false : !options.length}>Top teams + best-placed teams</option>
            </select>
        </label>
        {mode === 'all' && <p className="text-xs leading-5 text-gray-400">Group finish determines knockout seed. Winners seed first, followed by runners-up and subsequent places.</p>}
        {mode === 'best_placed' && <>
            <div className="grid grid-cols-2 gap-3">
                <label className="font-semibold">Places per group
                    <select disabled={disabled} value={places} className={selectClass} onChange={event => onChange({ places: Number(event.target.value) })}>
                        {options.map(count => <option key={count} value={count}>{count}</option>)}
                    </select>
                </label>
                <label className="font-semibold">Extra teams
                    <select disabled={disabled || size.candidates === 0} value={extras} className={selectClass}
                        onChange={event => onChange({ extras: Number(event.target.value) })}>
                        {size.candidates === 0 && <option value="0">None available</option>}
                        {Array.from({ length: size.candidates }, (_, index) => <option key={index} value={index + 1}>{index + 1}</option>)}
                    </select>
                </label>
            </div>
            <p className="text-xs leading-5 text-gray-400">Extra teams are compared at place {places + 1} across the groups.</p>
            <details className="rounded-lg border border-white/10 p-2.5">
                <summary className="cursor-pointer text-xs font-bold text-white">Cross-group tiebreak order</summary>
                <ol className="mt-2 space-y-1">
                    {rules.map((rule, index) => <li key={rule} className="flex min-h-9 items-center justify-between gap-2 rounded bg-white/5 px-2 text-xs">
                        <span>{index + 1}. {qualificationRuleLabels[rule]}</span>
                        {rule !== 'draw' && <span className="flex gap-1">
                            <button type="button" disabled={disabled || index === 0} aria-label={`Move ${qualificationRuleLabels[rule]} up`} onClick={() => moveRule(index, -1)} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ArrowUp size={15} /></button>
                            <button type="button" disabled={disabled || index >= rules.length - 2} aria-label={`Move ${qualificationRuleLabels[rule]} down`} onClick={() => moveRule(index, 1)} className="rounded p-1.5 hover:bg-white/10 disabled:opacity-30"><ArrowDown size={15} /></button>
                        </span>}
                    </li>)}
                </ol>
            </details>
        </>}
        <div aria-live="polite" className="flex items-start gap-2 rounded-lg bg-white/5 p-2.5 text-xs">
            <Brackets size={16} className="shrink-0 text-padel-green" />
            <div><p className="font-semibold text-white">{size.total} advancing · {size.bracket}-slot bracket{size.bracket > size.total ? ` · ${size.bracket - size.total} ${size.bracket - size.total === 1 ? 'bye' : 'byes'}` : ''}</p>
                {mode === 'best_placed' && (!size.clean || extras === 0) && <p className="mt-1 text-amber-200">{extras === 0 ? 'Choose fewer automatic places to leave a next-place team eligible.' : 'A full bracket needs 4, 8, 16 or 32 teams.'}</p>}
            </div>
        </div>
    </div>;
}

export function GroupQualificationReview({ ready, mode, places, extras, qualification, saved, saving, onCreate }) {
    const [manual, setManual] = useState(null);
    const [reason, setReason] = useState('');
    const comparison = saved?.comparison || qualification?.comparison || [];
    const selected = manual || qualification?.autoIds || [];
    const changed = manual && (manual.length !== qualification?.autoIds.length || manual.some(id => !qualification?.autoIds.includes(id)));
    const canCreate = ready && qualification && (!manual || (manual.length === extras && (!changed || reason.trim())));

    return <section className="mb-5 rounded-xl border border-padel-green/25 bg-padel-green/[0.04] p-4 sm:p-5">
        <h3 className="font-bold text-white">Elimination phase</h3>
        <p className="mt-1 text-sm text-gray-300">{saved
            ? `${saved.advancing.length} teams entered the ${saved.bracket}-slot knockout bracket.`
            : ready
                ? mode === 'all' ? 'All teams advance in order of group finish.' : `Top ${places} per group advance${mode === 'best_placed' ? `, plus ${extras} best-placed ${extras === 1 ? 'team' : 'teams'}` : ''}.`
                : 'Complete every group match to confirm who advances.'}</p>
        {comparison.length > 0 && <div className="mt-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <h4 className="text-sm font-bold text-white">Why they qualified</h4>
                {!saved && !manual && <button type="button" onClick={() => setManual([...selected])} disabled={saving} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-gray-200">Override selection</button>}
                {!saved && manual && <button type="button" onClick={() => { setManual(null); setReason(''); }} disabled={saving} className="rounded-lg border border-white/20 px-3 py-2 text-xs font-bold text-gray-200">Use automatic selection</button>}
            </div>
            <p className="mt-2 text-xs leading-5 text-gray-400">{(saved?.rules || qualification?.rules || []).map(rule => qualificationRuleLabels[rule]).join(' → ')}{comparison.some(row => row.excluded) && '. Figures exclude results against the lowest finishers in larger groups.'}</p>
            <div className="mt-3 overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full whitespace-nowrap text-left text-xs">
                    <thead className="bg-white/5 text-gray-400"><tr>{['Team', 'Played', 'Won', 'Points', 'Sets', 'Games', 'Decision'].map(label => <th key={label} scope="col" className="px-3 py-2">{label}</th>)}</tr></thead>
                    <tbody>{comparison.map(row => {
                        const qualifies = saved ? row.qualified : selected.includes(row.entry_id);
                        return <tr key={row.entry_id} className="border-t border-white/10">
                            <th scope="row" className="px-3 py-2 text-white"><span className="block">{row.team}</span><span className="font-normal text-gray-400">{row.group} · Place {row.position}{row.excluded > 0 && ` · ${row.excluded} excluded`}</span></th>
                            <td className="px-3 py-2">{row.played}</td><td className="px-3 py-2">{row.won}</td><td className="px-3 py-2">{row.standings_points}</td>
                            <td className="px-3 py-2">{row.sets_for}–{row.sets_against} ({row.set_difference > 0 ? '+' : ''}{row.set_difference})</td>
                            <td className="px-3 py-2">{row.games_for}–{row.games_against} ({row.game_difference > 0 ? '+' : ''}{row.game_difference})</td>
                            <td className="px-3 py-2">{!saved && manual
                                ? <label className="inline-flex items-center gap-2"><input type="checkbox" checked={qualifies} disabled={saving}
                                    aria-label={`Advance ${row.team}`} onChange={() => setManual(current => qualifies ? current.filter(id => id !== row.entry_id) : [...current, row.entry_id])} /> Advance</label>
                                : <span className={qualifies ? 'font-bold text-padel-green' : 'text-gray-400'}>{qualifies ? 'Advances' : 'Outside cutoff'}{row.qualified !== row.automatic ? ' · Override' : row.decidedByLot ? ' · Draw lots' : ''}</span>}</td>
                        </tr>;
                    })}</tbody>
                </table>
            </div>
            {manual && !saved && <label className="mt-3 block text-xs font-bold text-gray-300">Override reason · {manual.length} of {extras} selected
                <textarea value={reason} onChange={event => setReason(event.target.value)} disabled={saving} maxLength={500}
                    placeholder="Explain why the automatic selection should change" className={selectClass} />
            </label>}
            {saved?.reason && <p className="mt-3 text-sm text-amber-200">Override by {saved.actor} · {saved.reason}</p>}
        </div>}
        {!saved && ready && <button type="button" onClick={() => onCreate(changed ? manual : null, reason.trim())} disabled={!canCreate || saving}
            className="mt-4 min-h-11 rounded-lg bg-padel-green px-4 py-2 text-sm font-bold text-black disabled:opacity-40">Create elimination phase</button>}
    </section>;
}
