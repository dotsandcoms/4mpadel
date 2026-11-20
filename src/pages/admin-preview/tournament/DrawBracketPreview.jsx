import React, { useMemo } from 'react';
import { CalendarClock, Trophy } from 'lucide-react';

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

const DrawBracketPreview = ({ matches = [], title = 'Bracket preview', contextMatches = matches }) => {
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
        if (source?.source_match_key) {
            const number = matchNumberByKey.get(source.source_match_key);
            if (number) return `${source.type === 'loser' ? 'Loser' : 'Winner'} of M${number}`;
        }
        const loserFeeder = feederByTarget.get(`loser:${match.id}:${slotIndex + 1}`);
        if (loserFeeder) return `Loser of M${matchNumberByKey.get(loserFeeder.key || loserFeeder.id) || ''}`;
        const winnerFeeder = feederByTarget.get(`winner:${match.id}:${slotIndex + 1}`);
        if (winnerFeeder) return `Winner of M${matchNumberByKey.get(winnerFeeder.key || winnerFeeder.id) || ''}`;
        return match.round_number === 1 ? 'BYE' : 'To be decided';
    };

    return (
        <section aria-label={title} className="overflow-hidden border-t border-[#d7ddd5] bg-[#fafbf8]">
            <div className="flex flex-col gap-3 border-b border-[#d7ddd5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                    <p className="flex items-center gap-2 font-bold text-[#192019]"><Trophy size={17} className="text-[#456320]" /> {title}</p>
                    <p className="mt-1 text-xs text-[#626b62]">Scroll sideways to inspect every route, bye and potential final before publishing.</p>
                </div>
                <span className="w-fit rounded-full border border-padel-green/30 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#456320]">{rounds.length} rounds</span>
            </div>
            <div className="overflow-x-auto p-5">
                <div className="relative flex min-w-max" style={{ height: `${canvasHeight + 54}px` }}>
                    {rounds.map((round, roundIndex) => {
                        const scale = 2 ** roundIndex;
                        return (
                            <section key={round.number} className="relative shrink-0" style={{ width: `${COLUMN_WIDTH + (roundIndex < rounds.length - 1 ? CONNECTOR_WIDTH * 2 : 0)}px` }}>
                                <h3 className="absolute left-0 top-0 text-[11px] font-black uppercase tracking-[0.17em] text-[#456320]">{round.label}</h3>
                                {round.matches.map((match) => {
                                    const centerY = 54 + ((match.bracket_position - 0.5) * ROW_PITCH * scale);
                                    const top = centerY - (CARD_HEIGHT / 2);
                                    const number = matchNumberByKey.get(match.key || match.id);
                                    return (
                                        <div key={match.key || match.id} className="absolute left-0" style={{ top: `${top}px`, width: `${COLUMN_WIDTH}px`, height: `${CARD_HEIGHT}px` }}>
                                            <article className="h-full overflow-hidden rounded-xl border border-[#d7ddd5] bg-white shadow-sm">
                                                <div className="flex h-7 items-center justify-between border-b border-[#d7ddd5] bg-[#eef1eb] px-3 text-[9px] font-black uppercase tracking-wider text-[#626b62]">
                                                    <span>M{number}</span><span>{match.status === 'completed' || match.status === 'walkover' ? 'Complete' : 'Pending'}</span>
                                                </div>
                                                {[match.entry_one, match.entry_two].map((entry, slotIndex) => {
                                                    const winner = entry && (match.winner?.id === entry.id || match.winner_entry_id === entry.id);
                                                    return <div key={slotIndex} className={`flex h-[31px] items-center gap-2 border-b border-[#d7ddd5] px-3 ${winner ? 'bg-padel-green/10' : ''}`}><span className={`w-5 shrink-0 text-[10px] font-black ${entry?.seed_number ? 'text-[#456320]' : 'text-[#626b62]'}`}>{entry?.seed_number ? `#${entry.seed_number}` : '—'}</span><span className={`min-w-0 truncate text-xs ${entry ? 'font-semibold text-[#192019]' : 'font-medium text-[#626b62]'}`} title={teamName(entry, fallbackForSlot(match, slotIndex))}>{teamName(entry, fallbackForSlot(match, slotIndex))}</span></div>;
                                                })}
                                                <div className={`flex h-[30px] items-center gap-1.5 px-3 text-[9px] font-bold ${match.court_name || match.scheduled_start ? 'bg-sky-300/[0.07] text-[#28566a]' : 'text-[#626b62]'}`} title={scheduleLabel(match)}><CalendarClock size={11} className="shrink-0" /><span className="truncate">{scheduleLabel(match)}</span></div>
                                            </article>
                                            {roundIndex < rounds.length - 1 && <>
                                                <span aria-hidden="true" className="absolute bg-[#c2cbbd]" style={{ left: `${COLUMN_WIDTH}px`, top: `${CARD_HEIGHT / 2}px`, width: `${CONNECTOR_WIDTH}px`, height: '1px' }} />
                                                {match.bracket_position % 2 === 1 && <>
                                                    <span aria-hidden="true" className="absolute bg-[#c2cbbd]" style={{ left: `${COLUMN_WIDTH + CONNECTOR_WIDTH}px`, top: `${CARD_HEIGHT / 2}px`, width: '1px', height: `${ROW_PITCH * scale}px` }} />
                                                    <span aria-hidden="true" className="absolute bg-[#c2cbbd]" style={{ left: `${COLUMN_WIDTH + CONNECTOR_WIDTH}px`, top: `${(CARD_HEIGHT / 2) + ((ROW_PITCH * scale) / 2)}px`, width: `${CONNECTOR_WIDTH}px`, height: '1px' }} />
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
            {[...new Set(matches.filter(m=>m.stage==='placement' && m.round_code?.startsWith('places_')).map(m=>m.round_code.replace(/_r\d+$/, '')))].map(key=><DrawBracketPreview key={key} title={key.replace('places_', 'Places ').replace('_', '–')} contextMatches={contextMatches} matches={matches.filter(m=>m.round_code?.startsWith(`${key}_r`)).map(m=>({...m,stage:'knockout'}))} />)}
            {placementMatches.length > 0 && <div className="border-t border-amber-300/20 bg-amber-300/[0.04] p-5">
                <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#755300]">Top 4 playoff</p>
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{placementMatches.map((match) => <article key={match.key || match.id} className="overflow-hidden rounded-xl border border-amber-300/25 bg-[#faf5e8]"><div className="flex items-center justify-between border-b border-[#d7ddd5] px-3 py-2"><span className="text-xs font-bold text-[#192019]">{match.round_label}</span>{(match.scheduled_start || match.court_name) && <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#28566a]"><CalendarClock size={11} /> {scheduleLabel(match)}</span>}</div>{[match.entry_one, match.entry_two].map((entry, index) => <div key={index} className="border-b border-[#d7ddd5] px-3 py-2 text-xs font-semibold text-[#192019] last:border-0">{teamName(entry, fallbackForSlot(match, index))}</div>)}</article>)}</div>
            </div>}
        </section>
    );
};

export default DrawBracketPreview;
