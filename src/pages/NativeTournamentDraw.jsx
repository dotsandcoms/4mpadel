import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Brackets, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { supabase } from '../supabaseClient';

const NativeTournamentDraw = ({ event, preview = false }) => {
    const [draws, setDraws] = useState([]);
    const [entries, setEntries] = useState([]);
    const [matches, setMatches] = useState([]);
    const [matchSets, setMatchSets] = useState([]);
    const [groups, setGroups] = useState([]);
    const [standings, setStandings] = useState([]);
    const [selectedDrawId, setSelectedDrawId] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeRoundIndex, setActiveRoundIndex] = useState(0);

    useEffect(() => {
        let active = true;
        const load = async () => {
            setLoading(true);
            let query = supabase
                .from('draws')
                .select('id, division_id, draw_kind, format, status, tournament_divisions(name)')
                .eq('event_id', event.id)
                .order('created_at');
            query = preview
                ? query.eq('status', 'draft')
                : query.in('status', ['published', 'in_progress', 'completed']);
            const { data: publishedDraws, error } = await query;
            if (error) console.error('Failed to load native draws', error);
            if (!active) return;
            const nextDraws = publishedDraws || [];
            setDraws(nextDraws);
            setSelectedDrawId(nextDraws[0]?.id || '');
            setLoading(false);
        };
        load();
        return () => { active = false; };
    }, [event.id, preview]);

    useEffect(() => {
        let active = true;
        if (!selectedDrawId) {
            return () => { active = false; };
        }
        const load = async () => {
            const [{ data: nextEntries }, { data: nextMatches }, { data: nextGroups }, { data: nextStandings }] = await Promise.all([
                supabase.from('draw_entries').select('*').eq('draw_id', selectedDrawId).order('seed_number'),
                supabase.from('draw_matches').select('*').eq('draw_id', selectedDrawId).order('round_number').order('bracket_position'),
                supabase.from('draw_groups').select('*').eq('draw_id', selectedDrawId).order('display_order'),
                supabase.from('draw_standings').select('*').eq('draw_id', selectedDrawId).order('group_id').order('position'),
            ]);
            if (!active) return;
            setEntries(nextEntries || []);
            setMatches(nextMatches || []);
            setGroups(nextGroups || []);
            setStandings(nextStandings || []);
            setActiveRoundIndex(0);
            const matchIds = (nextMatches || []).map((match) => match.id);
            if (matchIds.length > 0) {
                const { data: nextSets } = await supabase.from('draw_match_sets').select('*').in('match_id', matchIds).order('set_number');
                if (active) setMatchSets(nextSets || []);
            } else if (active) {
                setMatchSets([]);
            }
        };
        load();
        return () => { active = false; };
    }, [selectedDrawId]);

    const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
    const rounds = useMemo(() => {
        const byRound = new Map();
        matches.filter((match) => match.stage !== 'group').forEach((match) => {
            const round = byRound.get(match.round_number) || { number: match.round_number, label: match.round_label, matches: [] };
            round.matches.push(match);
            byRound.set(match.round_number, round);
        });
        return [...byRound.values()].sort((a, b) => a.number - b.number);
    }, [matches]);
    const groupMatchesById = useMemo(() => groups.reduce((result, group) => ({
        ...result,
        [group.id]: matches.filter((match) => match.group_id === group.id).sort((a, b) => (
            a.round_number - b.round_number || a.bracket_position - b.bracket_position
        )),
    }), {}), [groups, matches]);
    const standingsForGroup = (groupId) => standings
        .filter((row) => row.group_id === groupId)
        .sort((a, b) => (a.position || 999) - (b.position || 999));
    const teamLines = (entryId) => {
        const entry = entryById.get(entryId);
        if (!entry) return ['TBD'];
        return [entry.player_one_name, entry.player_two_name].filter(Boolean).length > 0
            ? [entry.player_one_name, entry.player_two_name].filter(Boolean)
            : [entry.team_name];
    };
    const setsForMatch = (matchId) => matchSets.filter((set) => set.match_id === matchId);
    const resultLabel = (match) => {
        const sets = setsForMatch(match.id);
        if (sets.length > 0) return sets.map((set) => `${set.entry_one_games}-${set.entry_two_games}`).join(', ');
        if (match.status === 'completed' && (!match.entry_one_id || !match.entry_two_id)) return 'Bye';
        if (match.result_type === 'walkover') return 'Walkover';
        if (match.result_type === 'retirement') return 'Retirement';
        if (match.status === 'completed') return 'Completed';
        if (match.entry_one_id && match.entry_two_id) return 'Next · ready to play';
        return 'Awaiting opponent';
    };
    const scoreLine = (match) => {
        const sets = setsForMatch(match.id);
        return sets.length > 0 ? sets.map((set) => `${set.entry_one_games}–${set.entry_two_games}`).join('  ·  ') : null;
    };
    const matchBadge = (match) => {
        if (match.status === 'completed' && (!match.entry_one_id || !match.entry_two_id)) return 'BYE';
        if (match.result_type === 'walkover') return 'WALKOVER';
        if (match.result_type === 'retirement') return 'RETIRED';
        if (match.status === 'completed') return 'PLAYED';
        if (match.entry_one_id && match.entry_two_id) return 'NEXT';
        return 'TBD';
    };
    const renderMatchCard = (match) => {
        const entryOneWon = match.winner_entry_id && match.winner_entry_id === match.entry_one_id;
        const entryTwoWon = match.winner_entry_id && match.winner_entry_id === match.entry_two_id;
        const active = match.entry_one_id && match.entry_two_id && !['completed', 'walkover', 'retired'].includes(match.status);
        return <article key={match.id} className={`relative overflow-hidden rounded-2xl border bg-[#111d32] shadow-xl ${active ? 'border-padel-green/60' : 'border-white/10'}`}>
            <div className="flex items-stretch">
                <div className="flex w-12 shrink-0 items-center justify-center border-r border-white/10 bg-black/20"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${entryOneWon || entryTwoWon ? 'bg-padel-green text-black' : 'bg-black/40 text-gray-300'}`}>{match.bracket_position}</span></div>
                <div className="min-w-0 flex-1">
                    {[['one', match.entry_one_id, entryOneWon], ['two', match.entry_two_id, entryTwoWon]].map(([side, entryId, won]) => (
                        <div key={side} className={`border-b border-white/10 px-4 py-3 last:border-b-0 ${won ? 'bg-padel-green/5' : ''}`}>
                            {teamLines(entryId).map((name, index) => <div key={`${side}-${index}`} className={`truncate text-sm ${won ? 'font-bold text-white' : (entryId ? 'text-gray-300' : 'text-gray-500')}`}><span className="mr-2 text-xs">🇿🇦</span>{name}</div>)}
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${match.status === 'completed' ? 'bg-padel-green text-black' : (active ? 'bg-amber-300 text-black' : 'bg-white/10 text-gray-400')}`}>{matchBadge(match)}</span>
                <span className={scoreLine(match) ? 'text-sm font-black tracking-wide text-white' : 'text-xs font-bold text-gray-400'}>{scoreLine(match) || resultLabel(match)}</span>
            </div>
        </article>;
    };

    return (
        <main className="min-h-screen bg-[#0a0a0a] px-4 pb-20 pt-24 text-white md:px-8">
            <div className="mx-auto max-w-7xl">
                <Link to={`/calendar/${event.slug}`} className="mb-6 inline-flex items-center gap-2 text-sm font-bold text-gray-400 hover:text-padel-green"><ArrowLeft size={16} /> Back to event</Link>
                <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <div className="mb-2 flex items-center gap-2 text-padel-green"><Brackets size={20} /><span className="text-xs font-black uppercase tracking-[0.2em]">{preview ? 'Private Draw Preview' : 'Live event draws'}</span></div>
                        <h1 className="text-3xl font-black md:text-5xl">{event.event_name}</h1>
                    </div>
                    {draws.length > 1 && <select value={selectedDrawId} onChange={(item) => setSelectedDrawId(item.target.value)} className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-bold text-white outline-none">
                        {draws.map((draw) => <option key={draw.id} value={draw.id} className="text-black">{draw.tournament_divisions?.name || 'Division'}{draw.draw_kind !== 'main' ? ` · ${draw.draw_kind}` : ''}</option>)}
                    </select>}
                </div>

                {loading && <div className="flex justify-center py-20"><Loader2 className="animate-spin text-padel-green" /></div>}
                {!loading && draws.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-400">{preview ? 'No private draft is available to your account.' : 'No published draws are available yet.'}</div>}
                {!loading && selectedDrawId && <>
                    {groups.length > 0 && <section className="mb-8">
                        <div className="mb-4"><p className="text-xs font-black uppercase tracking-[0.18em] text-padel-green">Group stage</p><h2 className="mt-1 text-2xl font-black text-white">Live group standings</h2><p className="mt-1 text-sm text-gray-400">Results and qualification positions update as matches are completed.</p></div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {groups.map((group) => {
                                const groupStandings = standingsForGroup(group.id);
                                const hasResults = groupStandings.some((row) => row.played > 0);
                                const fixtures = groupMatchesById[group.id] || [];
                                return <article key={group.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-xl">
                                    <header className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4"><div><h3 className="font-bold text-white">{group.name}</h3><p className="mt-1 text-xs text-gray-500">{fixtures.length} round-robin fixtures</p></div>{hasResults && groupStandings[0] && <span className="rounded-full border border-padel-green/40 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">Leader</span>}</header>
                                    <div className="overflow-x-auto px-4 py-3"><table className="w-full min-w-[360px] text-left text-xs"><thead className="border-b border-white/10 text-gray-500"><tr><th className="pb-2">#</th><th className="pb-2">Team</th><th className="pb-2 text-center">P</th><th className="pb-2 text-center">W</th><th className="pb-2 text-center">+/-</th><th className="pb-2 text-right">Pts</th></tr></thead><tbody>{groupStandings.map((row) => { const isLeader = hasResults && row.position === 1 && !row.requires_manual_resolution; return <tr key={row.entry_id} className={row.requires_manual_resolution ? 'bg-amber-300/5 text-amber-200' : isLeader ? 'bg-padel-green/10 text-white' : 'text-gray-300'}><td className="py-2.5"><span className={`inline-flex min-w-6 justify-center rounded-full px-1.5 py-1 font-black ${isLeader ? 'bg-padel-green text-black' : 'text-gray-400'}`}>{row.position}</span></td><td className="py-2.5 pr-2 font-medium">{entryById.get(row.entry_id)?.team_name || 'Team'}{isLeader && <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-padel-green">Leading</span>}{row.requires_manual_resolution && <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-amber-300">Tie</span>}</td><td className="py-2.5 text-center tabular-nums">{row.played}</td><td className="py-2.5 text-center tabular-nums">{row.won}</td><td className="py-2.5 text-center tabular-nums">{row.games_for - row.games_against}</td><td className="py-2.5 text-right font-bold tabular-nums">{row.standings_points}</td></tr>; })}</tbody></table></div>
                                    <div className="border-t border-white/10 px-5 py-4"><p className="mb-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Fixtures</p><div className="space-y-2">{fixtures.map((match) => <div key={match.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs"><span className="min-w-0 truncate text-gray-300">{entryById.get(match.entry_one_id)?.team_name || 'TBD'} <span className="text-gray-600">vs</span> {entryById.get(match.entry_two_id)?.team_name || 'TBD'}</span><span className="shrink-0 font-bold text-white">{scoreLine(match) || resultLabel(match)}</span></div>)}</div></div>
                                </article>;
                            })}
                        </div>
                    </section>}
                    {rounds.length > 0 && <>
                    <div className="mb-4 rounded-2xl border border-white/10 bg-[#08101f] p-3 md:hidden">
                        <div className="flex items-center justify-between gap-2">
                            <button type="button" aria-label="Previous round" onClick={() => setActiveRoundIndex((index) => Math.max(0, index - 1))} disabled={activeRoundIndex === 0} className="rounded-xl p-3 text-padel-green hover:bg-white/5 disabled:opacity-25"><ChevronLeft size={20} /></button>
                            <div className="min-w-0 text-center"><p className="text-[10px] font-black uppercase tracking-[0.18em] text-padel-green">Round {activeRoundIndex + 1} of {rounds.length}</p><p className="truncate text-sm font-bold text-white">{rounds[activeRoundIndex]?.label}</p></div>
                            <button type="button" aria-label="Next round" onClick={() => setActiveRoundIndex((index) => Math.min(rounds.length - 1, index + 1))} disabled={activeRoundIndex >= rounds.length - 1} className="rounded-xl p-3 text-padel-green hover:bg-white/5 disabled:opacity-25"><ChevronRight size={20} /></button>
                        </div>
                        <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                            {rounds.map((round, index) => <button type="button" key={round.number} onClick={() => setActiveRoundIndex(index)} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${index === activeRoundIndex ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-400'}`}>{round.label}</button>)}
                        </div>
                    </div>
                    <div className="space-y-4 md:hidden">
                        {(rounds[activeRoundIndex]?.matches || []).map(renderMatchCard)}
                    </div>
                    <div className="hidden overflow-x-auto rounded-2xl border border-white/10 bg-[#08101f] p-8 md:block">
                    <div className="flex min-w-[1120px] gap-16">
                        {rounds.map((round) => <section key={round.number} className="w-80 shrink-0" style={{ paddingTop: `${(round.number - 1) * 72}px` }}>
                            <h2 className="mb-8 px-1 text-xs font-black uppercase tracking-[0.18em] text-padel-green">{round.label}</h2>
                            <div className="flex flex-col" style={{ rowGap: `${Math.max(40, 32 * (2 ** (round.number - 1)))}px` }}>
                                {round.matches.map(renderMatchCard)}
                            </div>
                        </section>)}
                    </div>
                    </div>
                    </>}
                </>}
            </div>
        </main>
    );
};

export default NativeTournamentDraw;
