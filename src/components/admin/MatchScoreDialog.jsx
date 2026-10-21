import React, { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2, RotateCcw, Trophy } from 'lucide-react';
import DrawActionDialog from './DrawActionDialog';
import { prepareMatchResult } from '../../utils/matchResult';

const emptySet = () => ({ games: ['', ''], tiebreak: ['', ''], duration: '' });
const inputClass = 'w-full min-h-12 rounded-lg border border-white/25 bg-[#1a2329] px-3 py-2 text-center text-lg font-semibold tabular-nums text-white [color-scheme:dark] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 disabled:opacity-60';
const focus = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300';

export default function MatchScoreDialog({ match, savedSets = [], scoringRules = {}, saving, onSave, onClose, drawCompleted = false }) {
    const formId = useId();
    const errorRef = useRef(null);
    const setsToWin = Number(scoringRules.sets_to_win || 2);
    const maxSets = setsToWin * 2 - 1;
    const existing = savedSets.filter(s => s.match_id === match.id).sort((a, b) => a.set_number - b.set_number);
    const correcting = ['completed', 'walkover', 'retired'].includes(match.status);
    const [kind, setKind] = useState(correcting ? match.result_type || 'played' : 'played');
    const [winner, setWinner] = useState(match.winner_entry_id ? match.winner_entry_id === match.entry_one.id ? 1 : 2 : '');
    const [detailed, setDetailed] = useState(existing.length > 0 || !match.result_summary);
    const [totals, setTotals] = useState(match.result_summary || ['', '']);
    const [sets, setSets] = useState(() => Array.from({ length: Math.max(setsToWin, existing.length) }, (_, i) => existing[i] ? { games: [existing[i].entry_one_games, existing[i].entry_two_games], tiebreak: [existing[i].entry_one_tiebreak ?? '', existing[i].entry_two_tiebreak ?? ''], duration: existing[i].duration_minutes ?? '' } : emptySet()));
    const [error, setError] = useState('');
    const [reason, setReason] = useState('');
    useEffect(() => {
        if (error) { errorRef.current?.focus(); errorRef.current?.scrollIntoView({ block: 'nearest' }); }
    }, [error]);
    const teams = [match.entry_one, match.entry_two];
    const noPlay = ['walkover', 'withdrawal'].includes(kind);
    const config = { kind, winner: kind === 'played' ? null : winner, totals, sets, detailed, setsToWin, matchTiebreak: Boolean(scoringRules.match_tiebreak) };
    let computed = null;
    try { computed = prepareMatchResult(config); } catch { /* Incomplete scores stay editable. */ }
    let progress = null;
    try { progress = prepareMatchResult({ ...config, kind: 'live', winner: null }); } catch { /* The final-result action takes over once a team wins. */ }
    const displayTotals = detailed ? (computed?.summary || progress?.summary || ['', '']) : totals;
    const selectedWinner = computed?.winner ? teams[computed.winner - 1] : null;
    const winnerChangeBlocked = Boolean(correcting && drawCompleted && selectedWinner && selectedWinner.id !== match.winner_entry_id);
    const updateSet = (index, property, side, value) => setSets(old => old.map((s, i) => i !== index ? s : { ...s, [property]: side == null ? value : s[property].map((v, j) => j === side ? value : v) }));
    const changeScoring = next => {
        if (!next && displayTotals.every(value => value !== '')) setTotals(displayTotals);
        setDetailed(next);
    };
    const clear = () => { setSets(Array.from({ length: setsToWin }, emptySet)); setTotals(['', '']); setWinner(''); setError(''); };
    const save = async (live = false) => {
        setError('');
        try {
            if (correcting && !reason.trim()) throw new Error('Enter a correction reason.');
            const result = prepareMatchResult({ ...config, kind: live ? 'live' : kind });
            result.winner = result.winner ? teams[result.winner - 1].id : null;
            if (winnerChangeBlocked) throw new Error('This draw is complete. Score corrections must keep the same winner.');
            if (correcting) result.reason = reason.trim();
            await onSave(match, result);
        } catch (err) { setError(err.message || 'The score could not be saved. Try again.'); }
    };
    const footer = <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1"><button disabled={saving} type="button" onClick={onClose} className={`min-h-11 rounded-lg px-3 py-2 text-sm text-gray-300 ${focus}`}>Cancel</button><button disabled={saving} type="button" onClick={clear} className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg px-3 py-2 text-xs text-gray-400 ${focus}`}><RotateCcw size={13} />Clear form</button></div>
        <div className="flex flex-wrap gap-2">{kind === 'played' && !correcting && <button disabled={saving} type="button" onClick={() => save(true)} className={`min-h-11 rounded-lg border border-sky-300/40 px-4 py-2.5 text-sm font-bold text-sky-200 disabled:opacity-50 ${focus}`}>Save live score</button>}<button disabled={saving || winnerChangeBlocked} form={formId} type="submit" className={`min-h-11 rounded-lg bg-padel-green px-5 py-2.5 text-sm font-bold text-black disabled:opacity-50 ${focus}`}>{saving ? 'Saving…' : correcting ? 'Save correction' : 'Save result'}</button></div>
    </div>;
    return <DrawActionDialog open wide title={correcting ? 'Edit match score' : 'Enter match score'} footer={footer} onClose={() => { if (!saving) onClose(); }}>
        <form id={formId} onSubmit={e => { e.preventDefault(); save(); }} className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm font-semibold text-gray-200">{match.round_label} <span className="mx-1 text-gray-500">/</span> Match {match.bracket_position}</p><span className="rounded-full bg-white/[0.07] px-3 py-1 text-xs text-gray-300">{correcting ? 'Score correction' : 'Best of '+maxSets+' sets'}</span></div>
            <fieldset disabled={saving} className="space-y-4">
                <legend className="sr-only">Match score</legend>
                <div className="grid grid-cols-2 gap-3">{teams.map((team, side) => <div key={team.id} className={`min-w-0 rounded-xl border p-3 ${selectedWinner?.id === team.id && !winnerChangeBlocked ? 'border-padel-green/50 bg-padel-green/[0.06]' : 'border-white/15 bg-white/[0.035]'}`}>
                    <div className="mb-2 flex items-center justify-between gap-2"><span className={`inline-flex items-center gap-2 text-xs font-bold ${side === 0 ? 'text-sky-200' : 'text-amber-200'}`}>TEAM {side === 0 ? 'A' : 'B'}{selectedWinner?.id === team.id && !winnerChangeBlocked && <span className="inline-flex items-center gap-1 text-[10px] text-padel-green"><CheckCircle2 size={14} />Winner</span>}</span>{!noPlay && <span className="text-[10px] uppercase tracking-wide text-gray-400">Sets won</span>}</div>
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1 space-y-1 text-sm font-semibold leading-5 text-white">{team.team_name.split(' / ').map((name, i) => <p key={i} className="break-words">{name}</p>)}</div>{!noPlay && <label className="flex shrink-0 flex-col items-center gap-1 text-[10px] font-medium uppercase tracking-wider text-gray-400"><span className="sr-only">Sets won</span><input aria-label={`${team.team_name} sets won`} type="number" inputMode="numeric" min="0" max={setsToWin} value={displayTotals[side]} readOnly={detailed} onChange={e => setTotals(old => old.map((v, i) => i === side ? e.target.value : v))} className={`min-h-14 w-16 rounded-lg border px-1 py-1 text-center text-3xl font-bold tabular-nums [color-scheme:dark] ${detailed ? 'border-transparent bg-transparent text-white' : 'border-sky-300/40 bg-[#1a2329] text-white'} ${focus}`} /></label>}</div>
                </div>)}</div>
                <div className="flex flex-wrap items-center justify-between gap-3"><label className="flex items-center gap-3 text-xs font-semibold text-gray-300">Match outcome<select value={kind} onChange={e => setKind(e.target.value)} className={`min-h-11 rounded-lg border border-white/25 bg-[#1a2329] px-3 py-2 text-sm text-white [color-scheme:dark] ${focus}`}><option value="played">Played</option><option value="walkover">Walkover</option><option value="retirement">Retirement</option><option value="withdrawal">Withdrawal</option></select></label>{!noPlay && <fieldset className="flex rounded-lg border border-white/20 bg-black/15 p-1"><legend className="sr-only">Scoring detail</legend>{[[true, 'Games per set'], [false, 'Set totals only']].map(([value, label]) => <label key={label} className={`relative cursor-pointer rounded-md px-3 py-2 text-xs font-semibold ${detailed === value ? 'bg-sky-300/15 text-sky-100' : 'text-gray-400'}`}><input className="peer sr-only" type="radio" name={`${formId}-scoring`} checked={detailed === value} onChange={() => changeScoring(value)} /><span className="pointer-events-none absolute inset-0 rounded-md peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-sky-300" />{label}</label>)}</fieldset>}</div>
                {!noPlay && (detailed ? <section aria-label="Games per set" className="rounded-xl border border-white/15 bg-black/15 p-3">
                    <div className="mb-2 grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] gap-3 text-center text-xs font-semibold"><span className="text-left text-gray-400">Games</span><span className="text-sky-200">Team A</span><span className="text-amber-200">Team B</span></div>
                    <div className="space-y-2">{sets.map((s, i) => <div key={i} className="grid grid-cols-[3rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-3"><span className="text-xs font-semibold text-gray-300">Set {i + 1}</span>{[0, 1].map(side => <input key={side} aria-label={`${teams[side].team_name} set ${i + 1} games`} type="number" inputMode="numeric" min="0" value={s.games[side]} onChange={e => updateSet(i, 'games', side, e.target.value)} className={inputClass} />)}</div>)}</div>
                    {sets.length < maxSets && (kind !== 'played' || !computed) && <button type="button" onClick={() => setSets(old => [...old, emptySet()])} className={`mt-2 min-h-11 rounded px-1 text-xs font-bold text-sky-200 hover:underline ${focus}`}>+ Add deciding set</button>}
                    <details className="mt-2 border-t border-white/10 pt-1 text-xs text-gray-400"><summary className={`cursor-pointer rounded py-2 ${focus}`}>Tiebreak points & duration</summary><div className="space-y-3 pb-2">{sets.map((s, i) => <fieldset key={i} className="rounded-lg border border-white/10 p-3"><legend className="px-1 text-gray-300">Set {i + 1}</legend><div className="grid grid-cols-3 gap-2">{[0, 1].map(side => <label key={side} className={side === 0 ? 'text-sky-200' : 'text-amber-200'}>Team {side === 0 ? 'A' : 'B'} tiebreak<input aria-label={`${teams[side].team_name} set ${i + 1} tiebreak`} type="number" inputMode="numeric" min="0" value={s.tiebreak[side]} onChange={e => updateSet(i, 'tiebreak', side, e.target.value)} className={`mt-2 ${inputClass}`} /></label>)}<label>Minutes<input aria-label={`Set ${i + 1} duration in minutes`} type="number" inputMode="numeric" min="0" value={s.duration} onChange={e => updateSet(i, 'duration', null, e.target.value)} className={`mt-2 ${inputClass}`} /></label></div></fieldset>)}</div></details>
                    {!correcting && <p className="mt-2 text-xs leading-5 text-gray-400">Leave unplayed sets blank. Set totals and the winner update automatically.</p>}
                </section> : <p className="text-xs leading-5 text-gray-400">Enter the overall set score in the team cards, such as 2–1. Game scores stay blank.</p>)}
                {kind !== 'played' && <label className="block text-sm font-semibold text-gray-300">Winning team<select value={winner} onChange={e => setWinner(e.target.value)} className={`mt-2 min-h-11 w-full rounded-lg border border-white/25 bg-[#1a2329] px-3 py-2 text-sm text-white ${focus}`}><option value="">Choose winner</option>{teams.map((team, i) => <option key={team.id} value={i + 1}>{team.team_name}</option>)}</select></label>}
            </fieldset>
            <div role="status" aria-live="polite" className={selectedWinner && !winnerChangeBlocked ? 'sr-only' : `flex items-start gap-3 rounded-lg border p-3 ${winnerChangeBlocked ? 'border-amber-300/30 bg-amber-300/5 text-amber-200' : selectedWinner ? 'border-padel-green/25 bg-padel-green/5 text-padel-green' : 'border-white/10 text-gray-400'}`}><Trophy size={18} className="mt-0.5 shrink-0" /><div>{winnerChangeBlocked ? <p className="text-sm">This draw is complete. Keep the original winner when correcting the score.</p> : selectedWinner ? <p className="text-sm leading-5"><strong>Winner: </strong>{selectedWinner.team_name}{kind === 'played' && <span className="sr-only"> · selected automatically</span>}</p> : <p className="text-xs leading-5">{kind === 'played' ? 'Enter scores to select the winner automatically. Live scores can be saved before the match ends.' : 'Select the winning team above.'}</p>}</div></div>
            {correcting && <div className="space-y-2"><label className="flex flex-col gap-2 text-sm font-semibold text-gray-200 sm:flex-row sm:items-center"><span className="shrink-0">Correction reason</span><input required aria-label="Correction reason" placeholder="e.g. Second set was entered incorrectly" value={reason} disabled={saving} onChange={e => setReason(e.target.value)} className={`min-h-11 min-w-0 flex-1 rounded-lg border border-white/25 bg-[#1a2329] px-3 py-2 text-sm text-white placeholder:text-gray-500 ${focus}`} /></label><p className="text-xs leading-5 text-gray-400">{drawCompleted ? 'Winner and points unchanged · correction saved to the audit history.' : 'Winner changes are allowed before dependent matches start. Corrections are logged.'}</p></div>}
            {error && <p ref={errorRef} role="alert" tabIndex={-1} className="rounded-lg border border-red-300/30 bg-red-300/10 p-3 text-sm text-red-200">{error}</p>}
        </form>
    </DrawActionDialog>;
}
