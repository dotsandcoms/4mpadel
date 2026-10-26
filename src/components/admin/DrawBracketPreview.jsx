import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, ArrowRight, ArrowUpDown, CalendarClock, Trophy } from 'lucide-react';
import DrawActionDialog from './DrawActionDialog';
import { matchScoreText } from '../../utils/matchResult';
import { firstRoundDrawSlots } from '../../utils/drawPreviewEditing';

const CARD_HEIGHT = 120;
const ROW_PITCH = 142;
const COLUMN_WIDTH = 252;
const CONNECTOR_WIDTH = 36;

const teamName = (entry, fallback) => entry?.team_name || fallback;

const scheduleLabel = (match) => {
    if (!match.court_name && !match.scheduled_start) return 'Court & time TBC';
    const time = match.scheduled_start
        ? new Date(match.scheduled_start).toLocaleString('en-ZA', {
            timeZone: 'Africa/Johannesburg',
            weekday: 'short',
            day: '2-digit',
            month: 'short',
            hour: '2-digit',
            minute: '2-digit',
        })
        : 'Time TBC';
    return [match.court_name || 'Court TBC', time].join(' · ');
};

const DrawBracketPreview = ({ matches = [], title = 'Bracket preview', contextMatches = matches, matchSets = [], onSwapPositions, onMoveMatch, swapDisabled = false }) => {
    const [swapPosition, setSwapPosition] = useState(null);
    const [targetPosition, setTargetPosition] = useState('');
    const [swapError, setSwapError] = useState('');
    const [moveKey, setMoveKey] = useState(null);
    const [moveTargetKey, setMoveTargetKey] = useState('');
    const [moveError, setMoveError] = useState('');
    const drawSlots = useMemo(() => firstRoundDrawSlots(matches), [matches]);
    const openingMatches = useMemo(() => matches.filter(match => match.stage === 'knockout' && match.round_number === 1)
        .sort((a, b) => a.bracket_position - b.bracket_position), [matches]);
    const moveSource = openingMatches.find(match => (match.key || match.id) === moveKey);
    const closeMove = () => { setMoveKey(null); setMoveTargetKey(''); setMoveError(''); };
    const applyMove = () => {
        if (!moveSource || !moveTargetKey || swapDisabled) return;
        try { onMoveMatch(moveKey, moveTargetKey); closeMove(); }
        catch (error) { setMoveError(error.message || 'Could not move this match. Please try again.'); }
    };
    const swapSource = drawSlots.find(slot => slot.position === swapPosition);
    const swapTarget = drawSlots.find(slot => slot.position === Number(targetPosition));
    const slotLabel = slot => `Position ${slot.position} · ${slot.entry?.seed_number ? `#${slot.entry.seed_number} · ` : ''}${teamName(slot.entry, 'BYE')}`;
    const closeSwap = () => { setSwapPosition(null); setTargetPosition(''); setSwapError(''); };
    const applySwap = () => {
        if (!swapSource || !swapTarget || swapDisabled) return;
        try {
            onSwapPositions(swapSource, swapTarget);
            closeSwap();
        } catch (error) {
            setSwapError(error.message || 'Could not swap these positions. Please try again.');
        }
    };
    const knockoutMatches = useMemo(() => matches.filter((match) => match.stage === 'knockout'), [matches]);
    const placementMatches = useMemo(() => matches.filter((match) => match.stage === 'placement' && !match.round_code?.startsWith('places_')), [matches]);
    const rounds = useMemo(() => {
        const grouped = new Map();
        knockoutMatches.forEach((match) => {
            if (!grouped.has(match.round_number)) grouped.set(match.round_number, []);
            grouped.get(match.round_number).push(match);
        });
        return [...grouped.entries()]
            .sort(([a], [b]) => a - b)
            .map(([number, roundMatches]) => ({
                number,
                label: roundMatches[0]?.round_label || `Round ${number}`,
                matches: roundMatches.sort((a, b) => a.bracket_position - b.bracket_position),
            }));
    }, [knockoutMatches]);

    const matchNumberByKey = useMemo(() => new Map(contextMatches
        .slice()
        .sort((a, b) => a.round_number - b.round_number || a.bracket_position - b.bracket_position)
        .map((match, index) => [match.key || match.id, index + 1])), [contextMatches]);
    const matchByKey = useMemo(() => new Map(contextMatches.map(match => [match.key || match.id, match])), [contextMatches]);
    const feederByTarget = useMemo(() => {
        const feeders = new Map();
        contextMatches.forEach((match) => {
            if (match.winner_to_match_id) feeders.set(`winner:${match.winner_to_match_id}:${match.winner_to_slot}`, match);
            if (match.loser_to_match_id) feeders.set(`loser:${match.loser_to_match_id}:${match.loser_to_slot}`, match);
        });
        return feeders;
    }, [contextMatches]);

    if (rounds.length === 0) return null;

    const firstRoundCount = Math.max(1, rounds[0].matches.length);
    const canvasHeight = Math.max(220, firstRoundCount * ROW_PITCH);
    const fallbackForSlot = (match, slotIndex) => {
        if (match.status === 'cancelled' || (match.status === 'walkover' && !match[slotIndex === 0 ? 'entry_one' : 'entry_two'])) return 'BYE';
        const source = match.source_slots?.[slotIndex];
        if (source?.type === 'entry' && !source.entry) return 'BYE';
        const emptyOutcome = (feeder, loser) => feeder && (feeder.status === 'cancelled'
            || (loser && feeder.result_type === 'walkover' && (!feeder.entry_one || !feeder.entry_two)));
        if (source?.source_match_key) {
            if (emptyOutcome(matchByKey.get(source.source_match_key), source.type === 'loser')) return 'BYE';
            const number = matchNumberByKey.get(source.source_match_key);
            if (number) return `${source.type === 'loser' ? 'Loser' : 'Winner'} of M${number}`;
        }
        const loserFeeder = feederByTarget.get(`loser:${match.id}:${slotIndex + 1}`);
        if (emptyOutcome(loserFeeder, true)) return 'BYE';
        if (loserFeeder) return `Loser of M${matchNumberByKey.get(loserFeeder.key || loserFeeder.id) || ''}`;
        const winnerFeeder = feederByTarget.get(`winner:${match.id}:${slotIndex + 1}`);
        if (emptyOutcome(winnerFeeder, false)) return 'BYE';
        if (winnerFeeder) return `Winner of M${matchNumberByKey.get(winnerFeeder.key || winnerFeeder.id) || ''}`;
        return match.round_number === 1 ? 'BYE' : 'To be decided';
    };

    return (
        <section aria-label={title} className="overflow-hidden border-t border-white/10 bg-[#080d17]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 font-bold text-white"><Trophy size={17} className="text-padel-green" /> {title}</p>
                    <p className="mt-1 text-xs text-gray-400">Scroll sideways to inspect every route, bye and potential final before publishing.</p>
                    {onSwapPositions && <p className="mt-2 flex items-center gap-2 text-xs text-amber-200"><ArrowLeftRight size={14} className="shrink-0" /> Use the orange button beside a team or BYE to swap opening positions. Save the draft to keep your changes.</p>}
                    {onMoveMatch && <p className="mt-2 text-xs text-sky-200">Use Move in a first-round match header to move the whole pairing, including a BYE. Matches in between shift automatically.</p>}
                    {onSwapPositions && <p className="mt-2 text-xs font-semibold text-gray-300">{drawSlots.filter(slot => slot.entry).length} teams · {drawSlots.filter(slot => !slot.entry).length} BYEs · {drawSlots.length} opening positions</p>}
                </div>
                <span className="w-fit rounded-full border border-padel-green/30 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">{rounds.length} rounds</span>
            </div>
            <div className="overflow-x-auto p-5">
                <div className="relative flex min-w-max" style={{ height: `${canvasHeight + 54}px` }}>
                    {rounds.map((round, roundIndex) => {
                        const scale = 2 ** roundIndex;
                        return (
                            <section key={round.number} className="relative shrink-0" style={{ width: `${COLUMN_WIDTH + (roundIndex < rounds.length - 1 ? CONNECTOR_WIDTH * 2 : 0)}px` }}>
                                <h3 className="absolute left-0 top-0 text-[11px] font-black uppercase tracking-[0.17em] text-padel-green">{round.label}</h3>
                                {round.matches.map((match) => {
                                    const centerY = 54 + ((match.bracket_position - 0.5) * ROW_PITCH * scale);
                                    const top = centerY - (CARD_HEIGHT / 2);
                                    const number = matchNumberByKey.get(match.key || match.id);
                                    const automaticBye = match.result_type === 'walkover'
                                        && Boolean(match.entry_one) !== Boolean(match.entry_two);
                                    const nextMatchNumber = matchNumberByKey.get(match.winner_to_match_key || match.winner_to_match_id);
                                    const advancementLabel = nextMatchNumber ? `Advances automatically to M${nextMatchNumber}` : 'Advances automatically';
                                    return (
                                        <div key={match.key || match.id} className="absolute left-0" style={{ top: `${top}px`, width: `${COLUMN_WIDTH}px`, height: `${CARD_HEIGHT}px` }}>
                                            <article className="h-full overflow-hidden rounded-xl border border-white/15 bg-[#111a2a] shadow-lg shadow-black/30">
                                                <div className="flex h-7 items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 text-[9px] font-black uppercase tracking-wider text-gray-500">
                                                    <span className="flex items-center gap-2"><span>M{number}{onSwapPositions && round.number === 1 ? ` · ${(match.bracket_position - 1) * 2 + 1}–${match.bracket_position * 2}` : ''}</span>
                                                        {onMoveMatch && round.number === 1 && <button type="button" disabled={swapDisabled} aria-label={`Move opening match M${number}`} title="Move this whole pairing to another opening match"
                                                            onClick={() => { setMoveKey(match.key || match.id); setMoveTargetKey(''); setMoveError(''); }}
                                                            className="inline-flex h-6 items-center gap-1 rounded border border-sky-300/40 bg-sky-300/10 px-1.5 text-[9px] font-bold text-sky-200 hover:bg-sky-300/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-sky-300 disabled:opacity-40"><ArrowUpDown size={11} /> Move</button>}
                                                    </span><span className={automaticBye ? 'text-sky-200' : undefined}>{automaticBye || match.status === 'cancelled' ? 'BYE' : match.status === 'retired' ? 'Retired' : match.status === 'in_progress' ? 'Live' : match.status === 'completed' || match.status === 'walkover' ? 'Complete' : 'Pending'}</span>
                                                </div>
                                                {[match.entry_one, match.entry_two].map((entry, slotIndex) => {
                                                    const winner = entry && (match.winner === entry
                                                        || (entry.id && (match.winner?.id === entry.id || match.winner_entry_id === entry.id))
                                                        || (entry.source_registration_id && match.winner?.source_registration_id === entry.source_registration_id));
                                                    const position = (match.bracket_position - 1) * 2 + slotIndex + 1;
                                                    return <div key={slotIndex} className={`flex h-[31px] items-center gap-2 border-b border-white/10 px-2 ${winner ? 'bg-padel-green/10' : ''}`}>
                                                        {onSwapPositions && round.number === 1 && <button type="button" disabled={swapDisabled}
                                                            aria-label={`Swap position ${position}: ${teamName(entry, 'BYE')}`} title={`Swap position ${position}: ${teamName(entry, 'BYE')}`}
                                                            onClick={() => { setSwapPosition(position); setTargetPosition(''); setSwapError(''); }}
                                                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-orange-300/60 bg-orange-400 text-black hover:bg-orange-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-white disabled:opacity-40"><ArrowLeftRight size={15} /></button>}
                                                        <span className={`w-5 shrink-0 text-[10px] font-black ${entry?.seed_number ? 'text-padel-green' : 'text-gray-600'}`}>{entry?.seed_number ? `#${entry.seed_number}` : '—'}</span>
                                                        <span className={`min-w-0 flex-1 truncate text-xs ${entry ? 'font-semibold text-white' : 'font-medium text-gray-500'}`} title={teamName(entry, fallbackForSlot(match, slotIndex))}>{teamName(entry, fallbackForSlot(match, slotIndex))}</span>{match.result_summary && <span className="shrink-0 text-xs font-bold text-sky-200">{match.result_summary[slotIndex]}</span>}
                                                    </div>;
                                                })}
                                                {automaticBye ? <div className="flex h-[30px] items-center gap-1.5 bg-sky-300/[0.07] px-3 text-[9px] font-bold text-sky-200" title={`No match is played against a BYE. ${advancementLabel}.`}><ArrowRight size={11} className="shrink-0" /><span className="truncate">{advancementLabel}</span></div>
                                                    : <div className={`flex h-[30px] items-center gap-1.5 px-3 text-[9px] font-bold ${match.court_name || match.scheduled_start ? 'bg-sky-300/[0.07] text-sky-200' : 'text-gray-600'}`} title={matchScoreText(match, matchSets) || scheduleLabel(match)}><CalendarClock size={11} className="shrink-0" /><span className="truncate">{matchScoreText(match, matchSets) || scheduleLabel(match)}</span></div>}
                                            </article>
                                            {roundIndex < rounds.length - 1 && <>
                                                <span aria-hidden="true" className="absolute bg-white/20" style={{ left: `${COLUMN_WIDTH}px`, top: `${CARD_HEIGHT / 2}px`, width: `${CONNECTOR_WIDTH}px`, height: '1px' }} />
                                                {match.bracket_position % 2 === 1 && <>
                                                    <span aria-hidden="true" className="absolute bg-white/20" style={{ left: `${COLUMN_WIDTH + CONNECTOR_WIDTH}px`, top: `${CARD_HEIGHT / 2}px`, width: '1px', height: `${ROW_PITCH * scale}px` }} />
                                                    <span aria-hidden="true" className="absolute bg-white/20" style={{ left: `${COLUMN_WIDTH + CONNECTOR_WIDTH}px`, top: `${(CARD_HEIGHT / 2) + ((ROW_PITCH * scale) / 2)}px`, width: `${CONNECTOR_WIDTH}px`, height: '1px' }} />
                                                </>}
                                            </>}
                                        </div>
                                    );
                                })}
                            </section>
                        );
                    })}
                </div>
            </div>
            {[...new Set(matches.filter(m=>m.stage==='placement' && m.round_code?.startsWith('places_')).map(m=>m.round_code.replace(/_r\d+$/, '')))].map(key=><DrawBracketPreview key={key} title={key.replace('places_', 'Places ').replace('_', '–')} contextMatches={contextMatches} matchSets={matchSets} matches={matches.filter(m=>m.round_code?.startsWith(`${key}_r`)).map(m=>({...m,stage:'knockout'}))} />)}
            {placementMatches.length > 0 && <div className="border-t border-amber-300/20 bg-amber-300/[0.04] p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-amber-200">3rd place playoff</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{placementMatches.map((match) => <article key={match.key || match.id} className="overflow-hidden rounded-xl border border-amber-300/25 bg-black/20"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><span className="text-xs font-bold text-white">{match.round_label}</span>{(match.scheduled_start || match.court_name) && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-200"><CalendarClock size={11} /> {scheduleLabel(match)}</span>}</div>{[match.entry_one, match.entry_two].map((entry, index) => <div key={index} className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 last:border-0">{teamName(entry, fallbackForSlot(match, index))}{match.result_summary && <span className="float-right text-sky-200">{match.result_summary[index]}</span>}</div>)}{matchScoreText(match, matchSets) && <p className="border-t border-white/10 px-3 py-2 text-xs text-sky-200">{matchScoreText(match, matchSets)}</p>}</article>)}</div>
            </div>}
            <DrawActionDialog open={Boolean(swapSource)} title="Swap draw positions" onClose={closeSwap}>
                {swapSource && <>
                    <div className="rounded-lg border border-orange-300/30 bg-orange-300/10 p-3"><p className="text-xs font-bold text-amber-200">Selected position {swapSource.position}</p><p className="mt-1 text-sm font-semibold leading-6">{swapSource.entry?.seed_number ? `#${swapSource.entry.seed_number} · ` : ''}{teamName(swapSource.entry, 'BYE')}</p></div>
                    <label className="block text-sm font-bold">Swap with
                        <select value={targetPosition} onChange={event => { setTargetPosition(event.target.value); setSwapError(''); }} className="mt-2 w-full min-w-0 rounded-lg border border-white/20 bg-[#151515] p-3 text-sm font-normal text-white focus-visible:outline-sky-300">
                            <option value="">Choose a team or BYE position</option>
                            {drawSlots.filter(slot => slot.position !== swapSource.position && (swapSource.entry || slot.entry)).map(slot => <option key={slot.position} value={slot.position}>{slotLabel(slot)}</option>)}
                        </select>
                    </label>
                    {swapTarget && <p className="rounded-lg border border-white/15 p-3 text-sm leading-6 text-gray-200">{teamName(swapSource.entry, 'BYE')} moves to position {swapTarget.position}. {teamName(swapTarget.entry, 'BYE')} moves to position {swapSource.position}.</p>}
                    <p className="text-xs leading-5 text-gray-400">Seed numbers stay with their teams. Manual swaps can change seed protection. Byes and later-round placeholders update automatically.</p>
                    {swapError && <p role="alert" className="rounded-lg bg-red-300/10 p-3 text-sm text-red-200">{swapError}</p>}
                    <div className="flex justify-end gap-3"><button type="button" onClick={closeSwap} className="rounded-lg border border-white/20 px-4 py-3 text-sm font-bold hover:bg-white/5">Cancel</button><button type="button" onClick={applySwap} disabled={!swapTarget || swapDisabled} className="rounded-lg bg-orange-400 px-4 py-3 text-sm font-bold text-black hover:bg-orange-300 disabled:opacity-40">Swap positions</button></div>
                </>}
            </DrawActionDialog>
            <DrawActionDialog open={Boolean(moveSource)} title="Move opening match" onClose={closeMove}>
                {moveSource && <>
                    <div className="rounded-lg border border-sky-300/30 bg-sky-300/10 p-3"><p className="text-xs font-bold text-sky-200">M{moveSource.bracket_position} · positions {(moveSource.bracket_position - 1) * 2 + 1}–{moveSource.bracket_position * 2}</p><p className="mt-2 text-sm font-semibold leading-6">{teamName(moveSource.entry_one, 'BYE')}<br />{teamName(moveSource.entry_two, 'BYE')}</p></div>
                    <label className="block text-sm font-bold">Move to
                        <select aria-label="Move match to" value={moveTargetKey} onChange={event => { setMoveTargetKey(event.target.value); setMoveError(''); }} className="mt-2 w-full min-w-0 rounded-lg border border-white/20 bg-[#151515] p-3 text-sm font-normal text-white focus-visible:outline-sky-300">
                            <option value="">Choose an opening match position</option>
                            {openingMatches.filter(match => (match.key || match.id) !== moveKey).map(match => <option key={match.key || match.id} value={match.key || match.id}>M{match.bracket_position} · positions {(match.bracket_position - 1) * 2 + 1}–{match.bracket_position * 2}{match.bracket_position === openingMatches.length ? ' · Last match' : ''}</option>)}
                        </select>
                    </label>
                    <p className="text-sm leading-6 text-gray-300">Both positions move together. Matches in between shift by one place, keeping their pairings. Seed numbers stay with their teams and BYE advancement updates automatically.</p>
                    <p className="text-xs leading-5 text-gray-400">Courts and times stay with their match positions. Save the draft after moving matches.</p>
                    {moveError && <p role="alert" className="rounded-lg bg-red-300/10 p-3 text-sm text-red-200">{moveError}</p>}
                    <div className="flex justify-end gap-3"><button type="button" onClick={closeMove} className="rounded-lg border border-white/20 px-4 py-3 text-sm font-bold hover:bg-white/5">Cancel</button><button type="button" onClick={applyMove} disabled={!moveTargetKey || swapDisabled} className="rounded-lg bg-sky-300 px-4 py-3 text-sm font-bold text-black hover:bg-sky-200 disabled:opacity-40">Move match</button></div>
                </>}
            </DrawActionDialog>
        </section>
    );
};

export default DrawBracketPreview;
