import React, { useState } from 'react';
import { drawProgression, progressionTime } from '../../utils/drawProgression';

export default function DrawProgression({ matches, entries, divisionName }) {
    const [team, setTeam] = useState('');
    const [copied, setCopied] = useState(false);
    const rows = drawProgression(matches, entries).filter(row => !row.complete && (!team || row.sides.some(side => side.candidates.some(e => e.id === team))));
    const copy = async () => {
        const text = [`${divisionName} · Upcoming matches`, 'Possible opponents depend on results. Planned times may change.', ...rows.map(row => `M${row.number} · ${row.match.round_label}\n${row.sides.map(s => s.label).join(' vs ')}\n${progressionTime(row.match)} · ${row.match.court_name || 'Court to be confirmed'}`)].join('\n\n');
        try { await navigator.clipboard.writeText(text); setCopied(true); } catch { setCopied(false); }
    };
    return <details className="rounded-2xl border border-sky-300/35 bg-[#10191d] p-5" open>
        <summary className="cursor-pointer text-lg font-bold text-sky-200">Upcoming matches & possible progression</summary>
        <p className="mt-2 text-sm text-gray-300">See who could meet next and when. Choose a team to follow its possible main and back-draw routes. Opponents depend on results; planned times may change. This view uses saved court times.</p>
        <div className="my-4 flex flex-wrap items-end gap-3"><label className="text-sm text-gray-300">Follow a team<select value={team} onChange={e=>{setTeam(e.target.value);setCopied(false);}} className="mt-2 block max-w-full rounded-lg border border-white/20 bg-[#151515] p-3 text-white"><option value="">All teams</option>{entries.map(e=><option key={e.id} value={e.id}>{e.team_name}</option>)}</select></label><button type="button" onClick={copy} className="rounded-lg bg-sky-300 px-4 py-3 text-sm font-bold text-black">{copied?'Copied':'Copy match plan'}</button></div>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{rows.map(row=><article key={row.match.id || row.match.key} className="rounded-xl border border-white/15 bg-black/20 p-4"><p className="text-xs font-bold text-sky-200">M{row.number} · {row.match.round_label}</p><p className="my-3 text-sm font-bold text-white">{row.sides[0].label}<span className="my-1 block text-xs font-normal text-gray-400">vs</span>{row.sides[1].label}</p><p className="text-sm text-sky-100">{progressionTime(row.match)}</p><p className="mt-1 text-xs text-gray-400">{row.match.court_name || 'Court to be confirmed'} · {row.sides.every(s=>s.confirmed)?'Teams confirmed':'Possible matchup'}</p>{row.sides.some(s=>!s.confirmed&&s.candidates.length>2)&&<details className="mt-3 text-xs text-gray-300"><summary className="cursor-pointer">Possible teams</summary>{row.sides.map((side,i)=><p key={i} className="mt-2">Side {i+1}: {side.candidates.map(e=>e.team_name).join(' / ') || side.label}</p>)}</details>}</article>)}</div>
        {!rows.length&&<p className="text-sm text-gray-400">No upcoming matches in the current bracket for this selection. Later group-stage knockout rounds appear when that bracket is generated.</p>}
    </details>;
}
