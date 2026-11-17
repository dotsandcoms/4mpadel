import React, { useState } from 'react';
import { ArrowLeftRight, Lock, Undo2 } from 'lucide-react';
import { describeGroupEdit, drawTeamKey, editGroupTeams, groupSwapTargets, groupSwapWarnings, hasGroupPlayStarted } from '../../utils/drawGroupEditing';
import { groupSeedOrder } from '../../utils/nativeDrawGenerator';
import DrawTeamSwapDialog from './DrawTeamSwapDialog';

const dateFormat = new Intl.DateTimeFormat('en-ZA', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Africa/Johannesburg',
});

export default function DrawGroupPreview({ draft, standings, places, mode, editable, busy, minimumSize, clubsByPlayer, audit, lastEdit, onEdit, onUndo }) {
    const [source, setSource] = useState(null);
    const [error, setError] = useState('');
    const started = hasGroupPlayStarted(draft.matches);
    const canSwap = editable && draft.groups.filter(group => !hasGroupPlayStarted(draft.matches, [group.id || group.key])).length >= 2;
    const targets = source ? groupSwapTargets(draft, source, minimumSize) : [];
    const undo = async () => {
        setError('');
        try { await onUndo(lastEdit); } catch (failure) { setError(failure.message); }
    };

    return <div className="space-y-4 p-4 sm:p-5">
        {(editable || audit.length > 0) && <div className="flex flex-wrap items-center justify-between gap-3">
            {canSwap && <p className="text-sm text-gray-300">Select a team to swap groups or move to an open spot.</p>}
            {lastEdit && editable && <button type="button" onClick={undo} disabled={busy || started}
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/20 px-3 text-xs font-bold text-gray-200 disabled:opacity-45"><Undo2 size={15} /> Undo last group edit</button>}
            {started && lastEdit && editable && <p className="w-full text-xs text-gray-400">Undo is available until the first match starts.</p>}
            {error && <p role="alert" className="w-full text-sm text-red-200">{error}</p>}
        </div>}
        <div className="grid gap-4 md:grid-cols-2">
            {draft.groups.map(group => {
                const key = group.id || group.key;
                const rows = standings.filter(row => row.group_id === key && row.position).sort((a, b) => a.position - b.position);
                const played = rows.some(row => row.played);
                const locked = hasGroupPlayStarted(draft.matches, [key]);
                const fixtureCount = draft.matches.filter(match => (match.group_id || match.group_key) === key).length;
                return <section key={key} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 flex items-baseline justify-between gap-2">
                        <h3 className="font-bold text-padel-green">{group.name}</h3>
                        <span className="text-xs text-gray-400">{group.entries.length} teams · {fixtureCount} fixtures</span>
                    </div>
                    {locked && <p className="mb-2 flex items-center gap-1.5 text-xs text-gray-400"><Lock size={12} /> Lineup locked · play started</p>}
                    {played ? <div className="overflow-x-auto"><table className="w-full text-left text-xs">
                        <thead className="border-b border-white/10 text-gray-400"><tr>{['Place', 'Team', 'Played', 'Won', 'Games ±', 'Points'].map(label => <th key={label} scope="col" className="px-1.5 py-2">{label}</th>)}</tr></thead>
                        <tbody>{rows.map(row => {
                            const entry = group.entries.find(item => item.id === row.entry_id);
                            const advances = draft.format === 'group_knockout' && (mode === 'all' || row.position <= places);
                            return <tr key={row.entry_id} className={advances || row.position === 1 ? 'bg-padel-green/[0.06] text-white' : 'text-gray-300'}>
                                <td className="px-1.5 py-2 font-semibold">{row.position}</td>
                                <th scope="row" className="px-1.5 py-2 font-medium">{entry?.team_name || 'Team'}{row.requires_manual_resolution && <span className="block text-amber-200">Tied on results</span>}</th>
                                <td className="px-1.5 py-2">{row.played}</td><td className="px-1.5 py-2">{row.won}</td><td className="px-1.5 py-2">{row.games_for - row.games_against}</td><td className="px-1.5 py-2 font-semibold">{row.standings_points}</td>
                            </tr>;
                        })}</tbody>
                    </table></div> : <ul className="divide-y divide-white/10">
                        {[...group.entries].sort(groupSeedOrder).map(entry => <li key={drawTeamKey(entry)} className="py-1">
                            {canSwap && !locked
                                ? <button type="button" disabled={busy} aria-label={`Swap ${entry.team_name} in ${group.name}`}
                                    onClick={() => setSource({ entry, groupKey: key, position: group.name })}
                                    className="flex min-h-10 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-white hover:bg-white/10 focus-visible:outline-padel-green disabled:opacity-50">
                                    <span className="w-9 shrink-0 text-xs font-bold text-gray-400">{entry.seed_number ? `#${entry.seed_number}` : '—'}</span><span className="flex-1">{entry.team_name}</span><ArrowLeftRight size={16} className="shrink-0 text-padel-green" />
                                </button>
                                : <p className="flex min-h-10 items-center gap-3 px-2 text-sm text-gray-200"><span className="w-9 shrink-0 text-xs font-bold text-gray-400">{entry.seed_number ? `#${entry.seed_number}` : '—'}</span>{entry.team_name}</p>}
                        </li>)}
                    </ul>}
                </section>;
            })}
        </div>
        {audit.length > 0 && <details className="rounded-lg border border-white/10 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-gray-200">Group edit history · {audit.length}</summary>
            <ul className="mt-2 divide-y divide-white/10">{audit.map(edit => {
                const { source: from, target: to } = edit.details;
                return <li key={edit.id} className="py-2 text-sm text-gray-200">
                    <p>{edit.action === 'group_undo' ? 'Undo · ' : ''}{from.name} · {from.group} → {to.group}{to.name && ` · ${to.name} → ${from.group}`}</p>
                    <p className="mt-0.5 text-xs text-gray-400">{(edit.actor_email || edit.actor_id) && `${edit.actor_email || edit.actor_id} · `}{edit.created_at ? dateFormat.format(new Date(edit.created_at)) : 'Pending save'}</p>
                </li>;
            })}</ul>
        </details>}
        {source && <DrawTeamSwapDialog groups source={source} targets={targets} disabled={busy} onClose={() => setSource(null)}
            getWarnings={(from, to) => groupSwapWarnings(draft, editGroupTeams(draft, from, to, minimumSize), [from.groupKey, to.groupKey], clubsByPlayer)}
            onApply={(from, to) => onEdit(from, to, describeGroupEdit(from, to))} />}
    </div>;
}
