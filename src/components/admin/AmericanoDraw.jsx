import { teamAmericanoPlayers, generateTeamAmericano, teamAmericanoStandings } from '../../utils/teamAmericano';
import React, { useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { americanoPlayers, generateAmericano, scheduleAmericano, americanoStandings, validateAmericanoScore } from '../../utils/americano';

const field = 'mt-2 block w-full rounded-lg border border-white/20 bg-[#151515] p-3 text-white focus-visible:outline-padel-green';
const button = 'min-h-11 rounded-lg bg-padel-green px-5 py-3 font-bold text-black disabled:opacity-40';

export function AmericanoBoard({ state, onScore, disabled = false }) {
    const [round, setRound] = useState(1);
    const names = new Map(state.players.map(p => [p.id, p.name]));
    const isTeam = state.variant === 'team';
    const rows = isTeam ? teamAmericanoStandings(state) : americanoStandings(state);
    return <div className="space-y-6">
        <p className="text-sm text-gray-400">{isTeam ? `${state.teams.length} teams · ` : ''}{state.players.length} players · {state.rounds} rounds · {state.fixtures.length} matches · {state.courts} courts · {state.points} total points per match</p>
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1.3fr)_minmax(280px,1fr)]">
            <section className="space-y-4">
                <label className="block font-bold text-white">Round<select className={field} value={Math.min(round, state.rounds)} onChange={e => setRound(Number(e.target.value))}>{Array.from({ length: state.rounds }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</select></label>
                {isTeam && state.rests?.filter(r=>r.round===Math.min(round,state.rounds)).map(r=><p key={r.team_id} className="rounded-lg bg-sky-300/10 p-3 text-sm text-sky-200">Rest this round: {state.teams.find(t=>t.id===r.team_id)?.name}. No points awarded.</p>)}
                {state.fixtures.filter(m => m.round === Math.min(round, state.rounds)).map(m => <article key={m.id} className="rounded-xl border border-white/10 p-4">
                    <p className="mb-3 text-xs font-bold text-padel-green">Court {m.court}{state.courts < state.players.length / 4 && ` · Wave ${m.wave}`}{m.scheduled_start && ` · ${new Date(m.scheduled_start).toLocaleString('en-ZA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}`}</p>
                    <p className="text-white">{m.one.map(id => names.get(id)).join(' / ')}</p>
                    <p className="my-1 text-xs text-gray-500">versus</p>
                    <p className="text-white">{m.two.map(id => names.get(id)).join(' / ')}</p>
                    {onScore ? <ScoreForm key={`${m.id}-${m.score}`} match={m} points={state.points} onScore={onScore} disabled={disabled} /> : <p className="mt-3 font-bold text-padel-green">{m.score ? m.score.join(' – ') : 'Awaiting result'}</p>}
                </article>)}
            </section>
            <section><h3 className="mb-3 font-bold text-white">{isTeam?'Team standings':'Individual standings'}</h3><p className="mb-4 text-xs text-gray-400">Total points, then point difference, then wins. Equal records share a place.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm text-gray-300"><thead><tr className="border-b border-white/20"><th className="py-3">#</th><th>{isTeam?'Team':'Player'}</th><th title="Matches played">P</th><th title="Wins">W</th><th title="Point difference">+/−</th><th>Points</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="border-b border-white/10"><td className="py-3 pr-2">{row.played ? row.position : '—'}</td><td className="pr-3">{row.name}</td><td>{row.played}</td><td>{row.won}</td><td>{row.points - row.against}</td><td className="font-bold text-padel-green">{row.points}</td></tr>)}</tbody></table></div></section>
        </div>
    </div>;
}

function ScoreForm({ match, points, onScore, disabled }) {
    const [score, setScore] = useState(match.score?.map(String) || ['', '']);
    const valid = score.every(n => n.trim() !== '') && validateAmericanoScore(score.map(Number), points);
    return <form className="mt-4 flex flex-wrap items-end gap-3" onSubmit={e => { e.preventDefault(); if (valid) onScore(match.id, score.map(Number)); }}>
        {score.map((value, i) => <label key={i} className="text-xs text-gray-400">Pair {i + 1} points<input aria-label={`Pair ${i + 1} points for ${match.id}`} type="number" min="0" max={points} step="1" required className={`${field} !w-24`} value={value} disabled={disabled} onChange={e => setScore(score.map((v, j) => i === j ? e.target.value : v))} /></label>)}
        <button className={button} disabled={disabled || !valid}>Save score</button><p className="w-full text-xs text-gray-400">Both scores must add up to {points}. Tied matches are allowed.</p>
    </form>;
}

export default function AmericanoDraw({ event, division, registrations, savedDraw, playDays = [], onSaved, workspace = 'setup', onWorkspace, reviewValid = true, teamMode = false }) {
    const isTeam = savedDraw?.scoring_rules?.americano?.variant === 'team' || teamMode;
    let preparedPlayers=[], pairError='';
    try { preparedPlayers=isTeam?teamAmericanoPlayers(registrations):americanoPlayers(registrations); } catch(error){pairError=error.message;}
    const maximumRounds=isTeam ? Math.max(1,preparedPlayers.length/2-1+(preparedPlayers.length/2)%2) : Math.max(1,preparedPlayers.length-1);
    const [state, setState] = useState(savedDraw?.scoring_rules?.americano || null);
    const [record, setRecord] = useState(savedDraw);
    const [rounds, setRounds] = useState(String(savedDraw?.scoring_rules?.americano?.rounds || maximumRounds));
    const [points, setPoints] = useState(String(savedDraw?.scoring_rules?.americano?.points || 24));
    const [courts, setCourts] = useState(String(savedDraw?.scoring_rules?.americano?.courts || Math.max(1, Math.min(4, Number(event.courts_count) || 4, Math.floor(preparedPlayers.length / 4)))));
    const [minutes, setMinutes] = useState('15');
    const [restMinutes, setRestMinutes] = useState('5');
    const [busy, setBusy] = useState(false);
    const [dirty, setDirty] = useState(false);
    const [schedulePreview, setSchedulePreview] = useState(null);
    const finished = ['completed', 'archived'].includes(record?.status);
    const players = preparedPlayers;
    const locked = record && record.status !== 'draft';
    const persist = async (next, status) => {
        setBusy(true);
        try {
            const { data, error } = await supabase.rpc('save_americano_draw', { p_event_id: event.id, p_division_id: division.id, p_state: next, p_status: status, p_expected_updated_at: record?.updated_at || null });
            if (error) throw error;
            if (!data?.id) throw new Error('The draw was not saved. Please try again.');
            setRecord(data); setState(next); setSchedulePreview(null); setDirty(false); onSaved?.(data);
            toast.success(status === 'completed' ? 'Americano completed' : 'Americano saved');
        } catch (error) { toast.error(error.message || 'Could not save Americano'); }
        finally { setBusy(false); }
    };
    return <section className="space-y-6 rounded-2xl border border-white/10 bg-[#101010] p-5 sm:p-8">
        <div><p className="mb-2 text-xs font-bold uppercase tracking-widest text-padel-green">{record?.status?.replace('_', ' ') || 'Setup'} · {isTeam?'Fixed team event':'Individual event'}</p><h2 className="text-xl font-bold text-white">{division.name} · {isTeam?'Team Americano':'Americano'}</h2><p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">{isTeam?'Keep the same partner throughout. Each team plays every other team once. Rally points accumulate in the team standings; an odd team count gives each team one rest round.':'New partner every round. Each player keeps the points their pair wins. A full 16-player rotation takes 15 rounds; choose fewer rounds for a shorter event.'}</p></div>
        {!locked && record && record.format !== 'americano' && <p className="rounded-lg border border-amber-300/30 bg-amber-300/10 p-3 text-sm text-amber-100">Saving this Americano replaces the existing draft’s pairings and court bookings. Every participant needs their own paid registration.</p>}
        {!locked && workspace === 'setup' && <><p className="text-sm text-gray-300">{isTeam ? `${players.length/2} fixed teams ready. Confirm both players in each pair in Players.` : `${players.length} paid individual registrations ready. Each player needs their own paid registration; partner names alone are not entries.`}</p>
            {pairError && <p role="alert" className="text-amber-200">{pairError}</p>}<div className="grid gap-5 sm:grid-cols-3"><label className="text-sm text-gray-300">Rounds<input className={field} type="number" min="1" max={maximumRounds} disabled={isTeam} value={isTeam?maximumRounds:rounds} onChange={e => { setRounds(e.target.value); setState(null); }} /></label><label className="text-sm text-gray-300">Total rally points<input className={field} type="number" inputMode="numeric" min="1" max="2147483647" step="1" required value={points} onChange={e => { setPoints(e.target.value); setState(null); }} aria-describedby="americano-points-help" /><span id="americano-points-help" className="mt-2 block text-xs text-gray-400">Enter a positive whole number. Both pairs’ scores must add up to this total.</span></label><label className="text-sm text-gray-300">Available courts<input className={field} type="number" min="1" max={Math.max(1, Math.floor(players.length / 4))} value={courts} onChange={e => { setCourts(e.target.value); setState(null); }} /></label></div>
            <p className="text-xs text-gray-400">With fewer courts, each round runs in waves. Finish every wave before starting the next round. Serving: rotate between all four players in blocks of two rallies.</p>
            <button disabled={busy} className={button} onClick={() => { try { if (!reviewValid) { onWorkspace?.('players'); throw new Error('Confirm players and seedings in step 1 first.'); } if(pairError)throw new Error(pairError); setState(isTeam?generateTeamAmericano(players,{points:Number(points),courts:Number(courts)}):generateAmericano(players, { rounds: Number(rounds), points: Number(points), courts: Number(courts) })); setDirty(true); onWorkspace?.('review'); } catch (e) { toast.error(e.message); } }}>Generate rotation preview</button></>}
        {locked && workspace === 'setup' && <p className="text-sm text-gray-300">Players and rotation are frozen. Open Review for pairings or Run to enter scores.</p>}
        {workspace === 'schedule' && <div className="space-y-4"><p className="text-sm leading-6 text-gray-300">Assign each wave to the event’s available play days. Existing court bookings are respected, and every round finishes before the next starts.</p>{state && !finished && <><div className="grid gap-4 sm:grid-cols-2"><label className="text-sm text-gray-300">Americano match minutes<input className={field} type="number" min="1" value={minutes} onChange={e => setMinutes(e.target.value)} /></label><label className="text-sm text-gray-300">Rest between rounds<input className={field} type="number" min="0" value={restMinutes} onChange={e => setRestMinutes(e.target.value)} /></label></div><button className={button} disabled={busy} onClick={async () => { setBusy(true); try { const {data, error} = await supabase.from('draw_matches').select('court_name, scheduled_start, scheduled_end, status, draw_id, draws!inner(event_id)').eq('draws.event_id', event.id); if (error) throw error; setSchedulePreview(scheduleAmericano(state, playDays, (data || []).filter(m => m.draw_id !== record?.id), {minutes:Number(minutes), restMinutes:Number(restMinutes)})); toast.success('Court times ready to review. Save schedule to apply them.'); } catch(e) { toast.error(e.message); } finally { setBusy(false); } }}>Automatically assign courts & times</button>{schedulePreview && <div className="flex flex-wrap items-center gap-3"><button className={button} disabled={busy} onClick={() => persist(schedulePreview, record?.status || 'draft')}>Save schedule</button><button className="px-4 py-3 text-white" disabled={busy} onClick={() => setSchedulePreview(null)}>Discard preview</button><p className="text-sm text-gray-400">Preview only. Save to update the draw’s court bookings.</p></div>}</>}{finished && <p className="text-sm text-gray-400">This event is closed. Its schedule is read-only.</p>}</div>}

        {!state && workspace !== 'setup' && <p className="text-gray-400">Generate the rotation in Setup first.</p>}
        {state && workspace !== 'setup' && <><AmericanoBoard state={workspace === 'schedule' && schedulePreview ? schedulePreview : state} onScore={workspace === 'run' && locked && !finished ? (id, score) => persist({ ...state, fixtures: state.fixtures.map(m => m.id === id ? { ...m, score } : m) }, 'in_progress') : null} disabled={busy} />
            <div className="flex flex-wrap gap-3 border-t border-white/10 pt-5">{!locked && workspace === 'review' && <><button disabled={busy} className={button} onClick={() => persist(state, 'draft')}>Save draft</button><button disabled={busy || dirty || !record} className={button} onClick={() => persist(state, 'published')}>Publish rotation</button></>}{workspace === 'run' && locked && !finished && <button disabled={busy || state.fixtures.some(m => !m.score)} className={button} onClick={() => persist(state, 'completed')}>Complete event</button>}</div>
        </>}
    </section>;
}
