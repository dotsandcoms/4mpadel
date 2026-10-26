import SearchableDropdown from '../../../components/SearchableDropdown';
import React, { useEffect, useRef, useState } from 'react';
import { Play, Plus, Trophy } from 'lucide-react';
import { tournamentFixtures, localTime } from './utils/tournament/scheduling';
import { RESOLVED, tournamentWorkflow } from './utils/tournament/workflow';
import { tournamentDivisionColors as divisionColorMap } from './utils/tournament/colors';
import { americanoStandings } from './utils/americano';
import { generateElimination } from './utils/tournament/draws';
import { teamAmericanoStandings } from './utils/teamAmericano';

export default function Results({ data, client, act, busy, saving, error }) {
    const [filter, setFilter] = useState('all');
    const [mode, setMode] = useState('live');
    const [selected, setSelected] = useState(null);
    const fixtures = tournamentFixtures(data).filter(f => !f.virtual && (filter === 'all' || f.division_id === filter));
    const colours = divisionColorMap(data.divisions, data.settings.divisionColors);
    const canEnter = data.capabilities.includes('results');
    const corrections = data.capabilities.includes('corrections');
    const row = f => <article key={f.id} className="tm-live-card" style={{ '--division-color': colours.get(f.division_id)?.color }}>
        <div className="tm-between"><strong>{f.court_name || 'Court TBC'}</strong><span className={'tm-status ' + (f.status === 'in_progress' ? 'done' : '')}>{f.status === 'in_progress' ? 'Live' : f.status.replaceAll('_', ' ')}</span></div>
        <div><small>{data.divisions.find(d => d.id === f.division_id)?.name} · {f.round_label}</small><h3 style={{ marginTop: 6 }}>{f.label}</h3></div>
        {RESOLVED.includes(f.status) && <strong>{data.sets.filter(s => s.match_id === f.id).sort((a, b) => a.set_number - b.set_number).map(s => `${s.entry_one_games}–${s.entry_two_games}`).join('  ·  ') || data.draws.find(d => d.id === f.draw_id)?.scoring_rules?.americano?.fixtures.find(m => m.id === f.americano_fixture_key)?.score?.join('–') || f.result_type}</strong>}
        <div className="tm-between"><small>{f.scheduled_start ? localTime(f.scheduled_start) + ' SAST' : 'Time TBC'}</small><div className="tm-actions">
            {canEnter && ['pending', 'scheduled'].includes(f.status) && (f.americano_fixture_key || f.entry_one_id && f.entry_two_id) && <button className="tm-button quiet" disabled={busy} onClick={() => act(() => client.result(data, f, { kind: 'live' }), 'Match started')}><Play size={12} />Start</button>}
            {(canEnter || corrections) && (f.americano_fixture_key || f.entry_one_id && f.entry_two_id) && (RESOLVED.includes(f.status) ? corrections : canEnter) && <button className="tm-button" disabled={busy} onClick={() => setSelected(f)}><Plus size={13} />{RESOLVED.includes(f.status) ? 'Correct result' : 'Enter result'}</button>}
        </div></div>
    </article>;
    return <div className="tm-stack">
        <div className="tm-between"><div><h2>Tournament live & results</h2><p className="muted">Enter a result once. Brackets and standings update together. Refreshes every 15 seconds.</p></div><div className="tm-actions"><button className={'tm-button ' + (mode === 'live' ? 'primary' : '')} onClick={() => setMode('live')}>Live courts</button><button className={'tm-button ' + (mode === 'results' ? 'primary' : '')} onClick={() => setMode('results')}>Results & standings</button><SearchableDropdown className="tm-input" aria-label="Filter results by division" value={filter} onChange={e => setFilter(e.target.value)}><option value="all">All divisions</option>{data.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</SearchableDropdown></div></div>
        {mode === 'live' ? <div className="tm-grid"><section className="tm-panel tm-stack"><h3>Now playing · {fixtures.filter(f => f.status === 'in_progress').length}</h3>{fixtures.filter(f => f.status === 'in_progress').map(row)}{!fixtures.some(f => f.status === 'in_progress') && <p className="muted">No matches are marked live.</p>}</section><section className="tm-panel tm-stack"><h3>Next up</h3>{fixtures.filter(f => ['pending', 'scheduled'].includes(f.status)).sort((a, b) => String(a.scheduled_start || 'z').localeCompare(String(b.scheduled_start || 'z'))).slice(0, 12).map(row)}</section></div> : <>
            <div className="tm-grid">{fixtures.filter(f => RESOLVED.includes(f.status) && f.status !== 'cancelled').map(row)}</div>
            {data.draws.filter(d => filter === 'all' || d.division_id === filter).map(draw => {
                const rotation = draw.scoring_rules?.americano;
                const standings = rotation ? (rotation.variant === 'team' ? teamAmericanoStandings(rotation) : americanoStandings(rotation)) : data.standings.filter(s => s.draw_id === draw.id);
                return standings.length > 0 && <section key={draw.id} className="tm-panel"><h3>{data.divisions.find(d => d.id === draw.division_id)?.name} · Standings</h3><div className="tm-table-wrap"><table><thead><tr><th>Position</th><th>Player / team</th><th>Played</th><th>Points</th></tr></thead><tbody>{standings.map(s => <tr key={s.id || s.entry_id}><td>{s.position}{s.requires_manual_resolution ? ' · Review tie' : ''}</td><td>{s.name || data.entries.find(e => e.id === s.entry_id)?.team_name}</td><td>{s.played}</td><td>{s.points ?? s.standings_points}</td></tr>)}</tbody></table></div></section>;
            })}
            {data.capabilities.includes('draws') && data.draws.filter(d => d.format === 'group_knockout' && !data.matches.some(m => m.draw_id === d.id && m.stage === 'knockout')).map(draw => <section className="tm-panel tm-stack" key={draw.id}><h3>{data.divisions.find(d => d.id === draw.division_id)?.name} · Elimination phase</h3><p className="muted">When all group matches are resolved, create the elimination bracket from the final standings. Reserved court times carry over.</p><button className="tm-button primary" disabled={busy || !data.matches.filter(m => m.draw_id === draw.id).every(m => RESOLVED.includes(m.status))} onClick={() => act(() => client.qualify(data, draw, generateElimination(data, draw)), 'Elimination matches created from group standings')}>Create elimination phase</button></section>)}
            {corrections && <section className="tm-panel"><h3>Review & finalise divisions</h3>{tournamentWorkflow(data).rows.map(r => <div className="tm-list-item" key={r.division.id}><div><strong>{r.division.name}</strong><p className="muted">{r.resolved} / {r.games.length} matches resolved</p></div><button className="tm-button" disabled={busy || !r.complete || r.finalised} onClick={() => { if (window.confirm('Confirm you have reviewed all results and placements for ' + r.division.name + '? Finalising locks this division.')) act(() => client.finalise(data, r.division.id), 'Division finalised'); }}><Trophy size={13} />{r.finalised ? 'Finalised' : 'Finalise division'}</button></div>)}</section>}
        </>}
        {selected && <ResultDialog error={error} data={data} match={selected} busy={busy} saving={saving} onClose={() => setSelected(null)} onSubmit={async result => { if (await act(() => client.result(data, selected, result), 'Result saved')) setSelected(null); }} />}
    </div>;
}
function ResultDialog({ data, match, busy, saving, error, onClose, onSubmit }) {
    const ref = useRef(null);
    const draw = data.draws.find(d => d.id === match.draw_id);
    const rotation = draw?.scoring_rules?.americano;
    const [kind, setKind] = useState('played');
    const [winner, setWinner] = useState(match.winner_entry_id || '');
    const [sets, setSets] = useState(() => {
        const saved = data.sets.filter(s => s.match_id === match.id).sort((a, b) => a.set_number - b.set_number).map(s => [s.entry_one_games, s.entry_two_games]);
        return Array.from({ length: Number(draw?.scoring_rules?.sets_to_win || 2) * 2 - 1 }, (_, i) => saved[i] || ['', '']);
    });
    const [score, setScore] = useState(['', '']);
    const [reason, setReason] = useState('');
    const [failed, setFailed] = useState(false);
    const correcting = RESOLVED.includes(match.status);
    useEffect(() => { const dialog = ref.current; const before = document.activeElement; dialog.showModal(); return () => { dialog.close(); before?.focus(); }; }, []);
    return <dialog ref={ref} className="tm-dialog" onCancel={event => { if (saving) event.preventDefault(); else onClose(); }} aria-labelledby="result-title"><form className="tm-stack" onSubmit={async e => { e.preventDefault(); setFailed(false); await onSubmit(rotation ? { kind: 'played', score: score.map(Number), reason } : { kind, winner, reason, sets: sets.filter(s => s.some(v => v !== '')).map(s => s.map(v => v === '' ? null : Number(v))) }); setFailed(true); }}>
        <div className="tm-between"><h2 id="result-title">{correcting ? 'Correct result' : 'Enter result'}</h2><button type="button" className="tm-button quiet" disabled={saving} onClick={onClose}>Close</button></div><p>{match.label}</p>
        {rotation ? <><p className="muted">Both scores must total {rotation.points} rally points.</p><div className="tm-score-fields">{[0, 1].map(i => <label key={i} className="tm-field">Pair {i + 1}<input className="tm-input" required type="number" min={0} max={rotation.points} value={score[i]} onChange={e => setScore(s => s.map((v, j) => j === i ? e.target.value : v))} /></label>)}</div></> : <>
            <label className="tm-field">Result type<SearchableDropdown className="tm-input" value={kind} onChange={e => setKind(e.target.value)}><option value="played">Played</option><option value="walkover">Walkover / no-show</option><option value="retirement">Retirement</option></SearchableDropdown></label>
            <label className="tm-field">Winner<SearchableDropdown className="tm-input" required value={winner} onChange={e => setWinner(e.target.value)}><option value="">Choose winner</option>{[match.entry_one_id, match.entry_two_id].map(id => <option key={id} value={id}>{data.entries.find(e => e.id === id)?.team_name}</option>)}</SearchableDropdown></label>
            {kind !== 'walkover' && sets.map((s, i) => <div className="tm-score-fields" key={i}><span style={{ alignSelf: 'end', paddingBottom: 10 }}>Set {i + 1}</span>{s.map((v, j) => <label className="tm-field" key={j}>Team {j + 1}<input className="tm-input" type="number" min={0} value={v} onChange={e => setSets(old => old.map((pair, k) => k === i ? pair.map((val, side) => side === j ? e.target.value : val) : pair))} /></label>)}</div>)}
        </>}
        {correcting && <label className="tm-field">Correction reason<input className="tm-input" required value={reason} onChange={e => setReason(e.target.value)} /></label>}
        {failed && <p role="alert" className="tm-notice">{error || 'The result was not saved. Check the scores and winner.'}</p>}
        <button className="tm-button primary" disabled={busy} type="submit">{busy ? 'Saving…' : 'Save result'}</button>
    </form></dialog>;
}
