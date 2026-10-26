import React from 'react';
import { Pencil } from 'lucide-react';
import { matchScoreText } from '../../utils/matchResult';

export default function RecordedMatchResults({ matches = [], entries = [], matchSets = [], onEdit, saving = false }) {
    const byId = new Map(entries.map(e => [e.id, e]));
    const results = matches.filter(m => m.winner_entry_id).sort((a, b) => a.round_number - b.round_number || a.bracket_position - b.bracket_position);
    const name = id => byId.get(id)?.team_name || 'BYE';
    return <details className="rounded-xl border border-sky-300/25 p-4" open>
        <summary className="cursor-pointer font-bold text-sky-200">Recorded results & byes · {results.length}</summary>
        <div className="mt-3 space-y-2">{results.map(match => {
            const played = Boolean(match.entry_one_id && match.entry_two_id);
            return <article key={match.id} className="rounded-lg bg-white/5 p-3 text-sm text-gray-300">
                <div className="flex items-start justify-between gap-3"><p className="font-bold text-white">{match.round_label} · Match {match.bracket_position}</p>{played && onEdit && <button type="button" disabled={saving} aria-label={`Edit score: ${match.round_label} · Match ${match.bracket_position}`} onClick={() => onEdit(match)} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-sky-300/40 px-3 py-2 text-xs font-bold text-sky-200 hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-50"><Pencil size={13} />Edit score</button>}</div>
                {played && <p className="mt-1 text-xs text-gray-400">{name(match.entry_one_id)} <span className="text-gray-500">vs</span> {name(match.entry_two_id)}</p>}
                <p className="mt-1">{played ? `Winner: ${name(match.winner_entry_id)}` : `${name(match.winner_entry_id)} · BYE · advanced automatically`}</p>
                {played && <p className="mt-1 font-semibold text-sky-200">{matchScoreText(match, matchSets) || 'Result recorded'}</p>}
            </article>;
        })}</div>
        {!results.length && <p className="mt-3 text-sm text-gray-400">No results recorded yet.</p>}
    </details>;
}
