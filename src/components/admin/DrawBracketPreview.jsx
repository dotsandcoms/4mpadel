import React, { useMemo } from 'react';
import { CalendarClock, Trophy } from 'lucide-react';

const CARD_HEIGHT = 94;
const ROW_PITCH = 118;
const COLUMN_WIDTH = 252;
const CONNECTOR_WIDTH = 36;

const teamName = (entry, fallback) => entry?.team_name || fallback;

const DrawBracketPreview = ({ matches = [], title = 'Bracket preview' }) => {
    const knockoutMatches = useMemo(() => matches.filter((match) => match.stage === 'knockout'), [matches]);
    const placementMatches = useMemo(() => matches.filter((match) => match.stage === 'placement'), [matches]);
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

    const matchNumberByKey = useMemo(() => new Map(knockoutMatches
        .slice()
        .sort((a, b) => a.round_number - b.round_number || a.bracket_position - b.bracket_position)
        .map((match, index) => [match.key || match.id, index + 1])), [knockoutMatches]);
    const feederByTarget = useMemo(() => {
        const feeders = new Map();
        knockoutMatches.forEach((match) => {
            if (match.winner_to_match_id) feeders.set(`winner:${match.winner_to_match_id}:${match.winner_to_slot}`, match);
            if (match.loser_to_match_id) feeders.set(`loser:${match.loser_to_match_id}:${match.loser_to_slot}`, match);
        });
        return feeders;
    }, [knockoutMatches]);

    if (rounds.length === 0) return null;

    const firstRoundCount = Math.max(1, rounds[0].matches.length);
    const canvasHeight = Math.max(220, firstRoundCount * ROW_PITCH);
    const fallbackForSlot = (match, slotIndex) => {
        const source = match.source_slots?.[slotIndex];
        if (source?.type === 'entry' && !source.entry) return 'BYE';
        if (source?.source_match_key) {
            const number = matchNumberByKey.get(source.source_match_key);
            return `${source.type === 'loser' ? 'Loser' : 'Winner'} of M${number || ''}`.trim();
        }
        const loserFeeder = feederByTarget.get(`loser:${match.id}:${slotIndex + 1}`);
        if (loserFeeder) return `Loser of M${matchNumberByKey.get(loserFeeder.key || loserFeeder.id) || ''}`;
        const winnerFeeder = feederByTarget.get(`winner:${match.id}:${slotIndex + 1}`);
        if (winnerFeeder) return `Winner of M${matchNumberByKey.get(winnerFeeder.key || winnerFeeder.id) || ''}`;
        return match.round_number === 1 ? 'BYE' : 'To be decided';
    };

    return (
        <section aria-label={title} className="overflow-hidden border-t border-white/10 bg-[#080d17]">
            <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 font-bold text-white"><Trophy size={17} className="text-padel-green" /> {title}</p>
                    <p className="mt-1 text-xs text-gray-400">Scroll sideways to inspect every route, bye and potential final before publishing.</p>
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
                                    return (
                                        <div key={match.key || match.id} className="absolute left-0" style={{ top: `${top}px`, width: `${COLUMN_WIDTH}px`, height: `${CARD_HEIGHT}px` }}>
                                            <article className="h-full overflow-hidden rounded-xl border border-white/15 bg-[#111a2a] shadow-lg shadow-black/30">
                                                <div className="flex h-7 items-center justify-between border-b border-white/10 bg-white/[0.03] px-3 text-[9px] font-black uppercase tracking-wider text-gray-500">
                                                    <span>M{number}</span><span>{match.status === 'completed' || match.status === 'walkover' ? 'Complete' : 'Pending'}</span>
                                                </div>
                                                {[match.entry_one, match.entry_two].map((entry, slotIndex) => {
                                                    const winner = entry && (match.winner?.id === entry.id || match.winner_entry_id === entry.id);
                                                    return <div key={slotIndex} className={`flex h-[33px] items-center gap-2 border-b border-white/10 px-3 last:border-0 ${winner ? 'bg-padel-green/10' : ''}`}><span className={`w-5 shrink-0 text-[10px] font-black ${entry?.seed_number ? 'text-padel-green' : 'text-gray-600'}`}>{entry?.seed_number ? `#${entry.seed_number}` : '—'}</span><span className={`min-w-0 truncate text-xs ${entry ? 'font-semibold text-white' : 'font-medium text-gray-500'}`} title={teamName(entry, fallbackForSlot(match, slotIndex))}>{teamName(entry, fallbackForSlot(match, slotIndex))}</span></div>;
                                                })}
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
            {placementMatches.length > 0 && <div className="border-t border-amber-300/20 bg-amber-300/[0.04] p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-amber-200">Top 4 playoff</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{placementMatches.map((match) => <article key={match.key || match.id} className="overflow-hidden rounded-xl border border-amber-300/25 bg-black/20"><div className="flex items-center justify-between border-b border-white/10 px-3 py-2"><span className="text-xs font-bold text-white">{match.round_label}</span>{match.scheduled_start && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-gray-400"><CalendarClock size={11} /> Scheduled</span>}</div>{[match.entry_one, match.entry_two].map((entry, index) => <div key={index} className="border-b border-white/10 px-3 py-2 text-xs font-semibold text-gray-200 last:border-0">{teamName(entry, fallbackForSlot(match, index))}</div>)}</article>)}</div>
            </div>}
        </section>
    );
};

export default DrawBracketPreview;
