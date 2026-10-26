import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    AlertTriangle,
    ArrowDown,
    ArrowLeft,
    ArrowUp,
    CalendarClock,
    CheckCircle2,
    FlaskConical,
    Play,
    RefreshCcw,
    Save,
    ShieldCheck,
    Trophy,
    Users,
} from 'lucide-react';
import DrawBracketPreview from '../components/admin/DrawBracketPreview';
import { nextPowerOfTwo } from '../utils/nativeDrawGenerator';
import { placementPlayoffExplanation } from '../utils/drawBackplates';
import {
    DEFAULT_LAB_CONFIG,
    LAB_STORAGE_KEY,
    addLabElimination,
    areAllGroupsComplete,
    buildLabDraft,
    createFakePlayers,
    getLabStandings,
    pairFakePlayers,
    recordLabResult,
    scheduleLabMatches,
    simulateAllPlayable,
} from '../utils/drawLab';

const panel = 'rounded-2xl border border-white/10 bg-[#111]';
const input = 'mt-2 block w-full rounded-xl border border-white/10 bg-black/40 px-3 py-3 text-sm text-white outline-none focus:border-padel-green focus:ring-2 focus:ring-padel-green/20';
const label = 'block text-xs font-black uppercase tracking-[0.14em] text-gray-400';

function freshState(config = DEFAULT_LAB_CONFIG) {
    const players = createFakePlayers(Number(config.playerCount));
    const teams = pairFakePlayers(players);
    return { version: 2, config, players, teams, draft: buildLabDraft(teams, config), updatedAt: new Date().toISOString() };
}

function readSavedState() {
    try {
        const saved = JSON.parse(window.localStorage.getItem(LAB_STORAGE_KEY));
        if (saved?.version === 2 && saved?.draft && saved?.teams) return saved;
    } catch {
        // A corrupt lab snapshot should never prevent the isolated tester loading.
    }
    return freshState();
}

const score = (match) => (match.sets || []).map((set) => `${set.entry_one_games}-${set.entry_two_games}`).join(', ');

const fixtureSchedule = (match) => {
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

const GroupDrawPreview = ({ draft }) => (
    <section className={`${panel} mt-6 overflow-hidden`} aria-label="Round-robin draw preview">
        <header className="flex flex-col gap-2 border-b border-white/10 bg-[#080d17] px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="font-black text-white">Round-robin draw preview</p><p className="mt-1 text-xs text-gray-400">Teams, matchups, courts and times update as the local test changes.</p></div>
            <span className="w-fit rounded-full border border-padel-green/30 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">{draft.groups.length} {draft.groups.length === 1 ? 'group' : 'groups'}</span>
        </header>
        <div className="grid gap-4 p-5 xl:grid-cols-2">
            {draft.groups.map((group) => {
                const fixtures = draft.matches.filter((match) => match.group_id === group.id && match.stage === 'group');
                return <article key={group.id} className="overflow-hidden rounded-xl border border-white/10 bg-black/20"><div className="flex items-start justify-between gap-3 border-b border-white/10 px-4 py-3"><div><h3 className="font-black text-padel-green">{group.name}</h3><p className="mt-1 text-xs text-gray-500">{group.entries.length} teams · {fixtures.length} matches</p></div></div><div className="grid gap-px bg-white/10 sm:grid-cols-2">{fixtures.map((match) => <div key={match.key} className="bg-[#0d0d0d] p-3"><p className="text-[9px] font-black uppercase tracking-widest text-gray-600">Round {match.round_number} · Match {match.bracket_position}</p><p className="mt-2 truncate text-xs font-bold text-white" title={match.entry_one?.team_name}>{match.entry_one?.team_name}</p><p className="my-1 text-[9px] font-black uppercase text-gray-600">vs</p><p className="truncate text-xs font-bold text-white" title={match.entry_two?.team_name}>{match.entry_two?.team_name}</p><p className={`mt-3 flex items-center gap-1.5 truncate border-t border-white/10 pt-2 text-[10px] font-bold ${match.court_name || match.scheduled_start ? 'text-sky-200' : 'text-gray-600'}`} title={fixtureSchedule(match)}><CalendarClock size={11} className="shrink-0" />{fixtureSchedule(match)}</p></div>)}</div></article>;
            })}
        </div>
    </section>
);

const DrawLab = () => {
    const [lab, setLab] = useState(readSavedState);
    const [tab, setTab] = useState('setup');
    const [notice, setNotice] = useState('64 fake players are ready. Nothing here is connected to Supabase.');
    const [roundFilter, setRoundFilter] = useState('all');

    useEffect(() => {
        window.localStorage.setItem(LAB_STORAGE_KEY, JSON.stringify({ ...lab, updatedAt: new Date().toISOString() }));
    }, [lab]);

    const completed = lab.draft.matches.filter((match) => match.status === 'completed').length;
    const playable = lab.draft.matches.filter((match) => match.status === 'pending' && match.entry_one && match.entry_two).length;
    const groupComplete = areAllGroupsComplete(lab.draft);
    const knockoutExists = lab.draft.matches.some((match) => match.stage === 'knockout');
    const rounds = useMemo(() => [...new Set(lab.draft.matches.map((match) => `${match.stage}:${match.round_label}`))], [lab.draft.matches]);
    const visibleMatches = roundFilter === 'all'
        ? lab.draft.matches
        : lab.draft.matches.filter((match) => `${match.stage}:${match.round_label}` === roundFilter);

    const changeConfig = (key, value) => setLab((current) => ({ ...current, config: { ...current.config, [key]: value } }));

    const regenerate = () => {
        try {
            const next = freshState(lab.config);
            setLab(next);
            setNotice(`Fresh ${next.players.length}-player simulation generated. Previous lab results were cleared.`);
        } catch (error) {
            setNotice(error.message);
        }
    };

    const resetLab = () => {
        window.localStorage.removeItem(LAB_STORAGE_KEY);
        setLab(freshState());
        setTab('setup');
        setNotice('Draw Lab reset to 64 fake players and a 32-team knockout.');
    };

    const moveTeam = (index, direction) => {
        const target = index + direction;
        if (target < 0 || target >= lab.teams.length) return;
        const teams = [...lab.teams];
        [teams[index], teams[target]] = [teams[target], teams[index]];
        const reseeded = teams.map((team, teamIndex) => ({ ...team, seed_number: teamIndex + 1 }));
        setLab((current) => ({ ...current, teams: reseeded, draft: buildLabDraft(reseeded, current.config) }));
        setNotice('Seed order changed and the local draft regenerated.');
    };

    const recordWinner = (match, winnerId) => {
        try {
            setLab((current) => ({ ...current, draft: recordLabResult(current.draft, match.key, winnerId) }));
            setNotice('Result recorded in this browser only.');
        } catch (error) {
            setNotice(error.message);
        }
    };

    const simulate = () => {
        setLab((current) => ({ ...current, draft: simulateAllPlayable(current.draft) }));
        setNotice(lab.config.format === 'group_knockout' && !knockoutExists
            ? 'All group matches simulated. Review standings, then create the elimination phase.'
            : 'Every currently playable match has been simulated locally.');
    };

    const createElimination = () => {
        try {
            setLab((current) => ({ ...current, draft: addLabElimination(current.draft, current.config) }));
            setTab('matches');
            setNotice('Elimination phase created from the simulated group standings.');
        } catch (error) {
            setNotice(error.message);
        }
    };

    const autoSchedule = () => {
        setLab((current) => ({ ...current, draft: scheduleLabMatches(current.draft, current.config) }));
        setNotice(`${lab.draft.matches.length} matches placed across ${lab.config.courtCount} local test courts.`);
    };

    return (
        <main className="min-h-screen bg-[#080808] text-white">
            <div className="sticky top-0 z-50 border-b border-amber-300/30 bg-amber-300 px-4 py-2 text-center text-xs font-black uppercase tracking-[0.18em] text-black">
                Local Draw Lab · Browser data only · Zero Supabase writes
            </div>

            <div className="mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-10">
                <header className="mb-6 flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <Link to="/admin" className="mb-5 inline-flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-gray-400 hover:text-white">
                            <ArrowLeft size={15} /> Back to admin
                        </Link>
                        <div className="flex items-center gap-3">
                            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-padel-green text-black"><FlaskConical size={24} /></span>
                            <div>
                                <p className="text-xs font-black uppercase tracking-[0.2em] text-padel-green">Safe simulation environment</p>
                                <h1 className="text-3xl font-black tracking-tight md:text-5xl">Draw Lab</h1>
                            </div>
                        </div>
                        <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-400">Generate fake players, configure a full draw, adjust seeds, record results and test scheduling without touching a live event.</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={simulate} disabled={playable === 0} className="inline-flex items-center gap-2 rounded-xl bg-padel-green px-4 py-3 text-sm font-black text-black disabled:cursor-not-allowed disabled:opacity-40"><Play size={16} /> Simulate playable matches</button>
                        <button type="button" onClick={resetLab} className="inline-flex items-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-bold text-gray-200 hover:bg-white/5"><RefreshCcw size={16} /> Reset lab</button>
                    </div>
                </header>

                <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                        [Users, 'Fake players', lab.players.length, `${lab.teams.length} doubles teams`],
                        [Trophy, 'Draw matches', lab.draft.matches.length, `${completed} results complete`],
                        [Play, 'Playable now', playable, 'Ready for a test result'],
                        [ShieldCheck, 'Database writes', 0, 'Supabase is not imported'],
                    ].map(([icon, title, value, detail]) => <div key={title} className={`${panel} p-4`}><div className="flex items-start justify-between"><div><p className="text-xs font-bold uppercase tracking-widest text-gray-500">{title}</p><p className="mt-2 text-3xl font-black">{value}</p><p className="mt-1 text-xs text-gray-500">{detail}</p></div>{React.createElement(icon, { size: 19, className: 'text-padel-green' })}</div></div>)}
                </section>

                <div role="status" className="mb-6 flex items-start gap-3 rounded-xl border border-amber-300/20 bg-amber-300/[0.06] px-4 py-3 text-sm text-amber-100">
                    <AlertTriangle size={17} className="mt-0.5 shrink-0 text-amber-300" /><span>{notice}</span>
                </div>

                <nav className="mb-5 flex gap-1 overflow-x-auto border-b border-white/10" aria-label="Draw Lab sections">
                    {[
                        ['setup', '1. Setup'], ['seeds', '2. Seed order'], ['matches', '3. Matches & results'], ['standings', '4. Standings'], ['schedule', '5. Schedule'],
                    ].map(([value, text]) => <button key={value} type="button" onClick={() => setTab(value)} className={`whitespace-nowrap border-b-2 px-4 py-3 text-sm font-bold ${tab === value ? 'border-padel-green text-padel-green' : 'border-transparent text-gray-500 hover:text-white'}`}>{text}</button>)}
                </nav>

                {tab === 'setup' && <>
                <section className={`${panel} overflow-hidden`}>
                    <div className="border-b border-white/10 p-5 md:p-6"><h2 className="text-xl font-black">Test event configuration</h2><p className="mt-1 text-sm text-gray-500">Changes apply when you generate a fresh simulation.</p></div>
                    <div className="grid gap-5 p-5 md:grid-cols-2 md:p-6 xl:grid-cols-4">
                        <label className={label}>Fake players<select value={lab.config.playerCount} onChange={(event) => changeConfig('playerCount', Number(event.target.value))} className={input}>{[8, 16, 32, 64].map((count) => <option key={count} value={count}>{count} players · {count / 2} teams</option>)}</select></label>
                        <label className={label}>Draw format<select value={lab.config.format} onChange={(event) => changeConfig('format', event.target.value)} className={input}><option value="knockout">Elimination / knockout</option><option value="group_only">Round robin only</option><option value="group_knockout">Round robin → elimination</option></select></label>
                        <label className={label}>Seeding template<select value={lab.config.seededPercentage} onChange={(event) => changeConfig('seededPercentage', Number(event.target.value))} className={input}>{[0, 25, 50, 100].map((value) => <option key={value} value={value}>{value}% seeded</option>)}</select></label>
                        <label className={label}>Placement playoff<select value={lab.config.placementPlayoff} onChange={(event) => changeConfig('placementPlayoff', event.target.value)} className={input}><option value="none">No playoff</option><option value="top4">Top 4 · 3rd / 4th playoff</option><option value="top8" disabled={nextPowerOfTwo(lab.config.format === 'group_knockout' ? Number(lab.config.groupCount) * Number(lab.config.advancersPerGroup) : Number(lab.config.playerCount) / 2) < 8}>Top 8 · places 3–8 playoffs</option></select><span className="mt-2 block text-xs font-normal normal-case leading-5 tracking-normal text-gray-400">{placementPlayoffExplanation(lab.config.placementPlayoff)}</span></label>
                        {lab.config.format !== 'knockout' && <label className={label}>Round robin groups<select value={lab.config.groupCount} onChange={(event) => changeConfig('groupCount', Number(event.target.value))} className={input}>{[1, 2, 4, 8].filter((value) => value <= lab.config.playerCount / 4).map((value) => <option key={value} value={value}>{value} {value === 1 ? 'group' : 'groups'}</option>)}</select></label>}
                        {lab.config.format === 'group_knockout' && <label className={label}>Advance per group<select value={lab.config.advancersPerGroup} onChange={(event) => changeConfig('advancersPerGroup', Number(event.target.value))} className={input}>{[1, 2, 4].map((value) => <option key={value} value={value}>Top {value}</option>)}</select></label>}
                    </div>
                    <div className="flex flex-col gap-3 border-t border-white/10 p-5 sm:flex-row sm:items-center sm:justify-between md:px-6"><p className="text-xs text-gray-500">Generating clears only this browser’s current lab results.</p><button type="button" onClick={regenerate} className="inline-flex items-center justify-center gap-2 rounded-xl bg-padel-green px-5 py-3 text-sm font-black text-black"><RefreshCcw size={16} /> Generate fresh simulation</button></div>
                </section>
                {lab.draft.matches.some((match) => match.stage === 'knockout') && <div className={`${panel} mt-6 max-h-[820px] overflow-auto`}><DrawBracketPreview matches={lab.draft.matches} title="Test bracket preview" /></div>}
                {lab.draft.groups?.length > 0 && <GroupDrawPreview draft={lab.draft} />}
                </>}

                {tab === 'seeds' && <section className={panel}>
                    <div className="border-b border-white/10 p-5 md:p-6"><h2 className="text-xl font-black">Manual seed review</h2><p className="mt-1 text-sm text-gray-500">Move a team before testing. Reordering regenerates the local draft and clears its results.</p></div>
                    <div className="divide-y divide-white/[0.07]">
                        {lab.teams.map((team, index) => <div key={team.id} className="grid grid-cols-[3.5rem_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3 md:px-6"><span className="text-lg font-black text-padel-green">#{index + 1}</span><div className="min-w-0"><p className="truncate text-sm font-bold text-white">{team.team_name}</p><p className="mt-0.5 text-xs text-gray-500">{team.seeding_value.toLocaleString('en-ZA')} combined test points</p></div><div className="flex gap-1"><button type="button" aria-label={`Move ${team.team_name} up`} onClick={() => moveTeam(index, -1)} disabled={index === 0} className="rounded-lg border border-white/10 p-2 text-gray-300 hover:border-padel-green hover:text-padel-green disabled:opacity-20"><ArrowUp size={15} /></button><button type="button" aria-label={`Move ${team.team_name} down`} onClick={() => moveTeam(index, 1)} disabled={index === lab.teams.length - 1} className="rounded-lg border border-white/10 p-2 text-gray-300 hover:border-padel-green hover:text-padel-green disabled:opacity-20"><ArrowDown size={15} /></button></div></div>)}
                    </div>
                </section>}

                {tab === 'matches' && <section className={panel}>
                    <div className="flex flex-col gap-4 border-b border-white/10 p-5 md:flex-row md:items-end md:justify-between md:p-6"><div><h2 className="text-xl font-black">Matches & result simulator</h2><p className="mt-1 text-sm text-gray-500">Pick either team to record a standard 6–4, 6–3 test result.</p></div><label className="text-xs font-bold text-gray-400">Round<select value={roundFilter} onChange={(event) => setRoundFilter(event.target.value)} className="ml-2 rounded-lg border border-white/10 bg-black px-3 py-2 text-white"><option value="all">All rounds</option>{rounds.map((round) => <option key={round} value={round}>{round.split(':')[1]}</option>)}</select></label></div>
                    {lab.config.format === 'group_knockout' && groupComplete && !knockoutExists && <div className="m-5 flex flex-col gap-3 rounded-xl border border-padel-green/30 bg-padel-green/[0.06] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold">Group stage complete</p><p className="text-xs text-gray-400">Use the configured top {lab.config.advancersPerGroup} per group to build the bracket.</p></div><button type="button" onClick={createElimination} className="rounded-xl bg-padel-green px-4 py-3 text-sm font-black text-black">Create elimination phase</button></div>}
                    <div className="divide-y divide-white/[0.07]">
                        {visibleMatches.map((match) => {
                            const ready = match.entry_one && match.entry_two;
                            return <article key={match.key} className="p-4 md:p-5"><div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-[11px] font-black uppercase tracking-[0.15em] text-gray-500">{match.group_id ? `${match.group_id.replace('group-', 'Group ')} · ` : ''}{match.round_label} · Match {match.bracket_position}</p><span className={`rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider ${match.status === 'completed' ? 'bg-padel-green/10 text-padel-green' : ready ? 'bg-sky-300/10 text-sky-200' : 'bg-white/5 text-gray-600'}`}>{match.status === 'completed' ? match.result_type === 'walkover' ? 'Bye' : 'Complete' : ready ? 'Ready' : 'Waiting'}</span></div><div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] lg:items-center"><button type="button" disabled={!ready || match.status === 'completed'} onClick={() => recordWinner(match, match.entry_one.id)} className="min-h-14 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-bold hover:border-padel-green disabled:cursor-default disabled:opacity-60">{match.entry_one?.team_name || 'Winner pending'}</button><span className="text-center text-xs font-black text-gray-600">VS</span><button type="button" disabled={!ready || match.status === 'completed'} onClick={() => recordWinner(match, match.entry_two.id)} className="min-h-14 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-left text-sm font-bold hover:border-padel-green disabled:cursor-default disabled:opacity-60">{match.entry_two?.team_name || 'Winner pending'}</button></div>{match.status === 'completed' && match.result_type !== 'walkover' && <p className="mt-3 flex items-center gap-2 text-xs text-gray-400"><CheckCircle2 size={14} className="text-padel-green" /> Winner: <strong className="text-white">{match.winner?.team_name}</strong> · {score(match)}</p>}</article>;
                        })}
                    </div>
                </section>}

                {tab === 'standings' && <section className="space-y-4">
                    {lab.draft.groups?.length ? lab.draft.groups.map((group) => {
                        const standings = getLabStandings(lab.draft, group.id);
                        return <div key={group.id} className={panel}><div className="border-b border-white/10 px-5 py-4"><h2 className="font-black">{group.name}</h2></div><div className="overflow-x-auto"><table className="w-full min-w-[600px] text-left text-sm"><thead className="text-[10px] font-black uppercase tracking-widest text-gray-500"><tr><th className="px-5 py-3">#</th><th className="px-5 py-3">Team</th><th className="px-5 py-3 text-center">Played</th><th className="px-5 py-3 text-center">Won</th><th className="px-5 py-3 text-center">Set +/-</th><th className="px-5 py-3 text-right">Pts</th></tr></thead><tbody className="divide-y divide-white/[0.06]">{standings.map((row) => { const entry = lab.draft.entries.find((item) => item.id === row.entry_id); return <tr key={row.entry_id}><td className="px-5 py-3 font-black text-padel-green">{row.position}</td><td className="px-5 py-3 font-semibold">{entry?.team_name}</td><td className="px-5 py-3 text-center text-gray-400">{row.played}</td><td className="px-5 py-3 text-center text-gray-400">{row.won}</td><td className="px-5 py-3 text-center text-gray-400">{row.sets_for - row.sets_against}</td><td className="px-5 py-3 text-right font-black">{row.standings_points}</td></tr>; })}</tbody></table></div></div>;
                    }) : <div className={`${panel} p-8 text-center`}><Trophy className="mx-auto text-gray-600" /><h2 className="mt-3 font-black">No group standings in a knockout draw</h2><p className="mt-1 text-sm text-gray-500">Choose a round-robin format in Setup to test live standings.</p></div>}
                </section>}

                {tab === 'schedule' && <section className={panel}>
                    <div className="border-b border-white/10 p-5 md:p-6"><div className="flex items-center gap-3"><CalendarClock className="text-sky-300" /><div><h2 className="text-xl font-black">Local schedule test</h2><p className="mt-1 text-sm text-gray-500">Assign every generated match across fake courts and times.</p></div></div></div>
                    <div className="grid gap-5 p-5 sm:grid-cols-2 lg:grid-cols-3 md:p-6"><label className={label}>Courts<input type="number" min="1" max="12" value={lab.config.courtCount} onChange={(event) => changeConfig('courtCount', Number(event.target.value))} className={input} /></label><label className={label}>First play day<input type="date" value={lab.config.firstDay} onChange={(event) => changeConfig('firstDay', event.target.value)} className={input} /></label><label className={label}>Match duration<input type="number" min="15" step="15" value={lab.config.matchDuration} onChange={(event) => changeConfig('matchDuration', Number(event.target.value))} className={input} /></label><label className={label}>Day starts<input type="time" value={lab.config.startTime} onChange={(event) => changeConfig('startTime', event.target.value)} className={input} /></label><label className={label}>Day ends<input type="time" value={lab.config.endTime} onChange={(event) => changeConfig('endTime', event.target.value)} className={input} /></label><div className="flex items-end"><button type="button" onClick={autoSchedule} className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-3 text-sm font-black text-black"><Save size={16} /> Auto-schedule locally</button></div></div>
                    <div className="max-h-[720px] divide-y divide-white/[0.06] overflow-y-auto border-t border-white/10">{lab.draft.matches.map((match) => <div key={match.key} className="grid gap-2 px-5 py-3 text-sm md:grid-cols-[8rem_10rem_minmax(0,1fr)] md:items-center"><span className="font-black text-sky-200">{match.court_name || 'Not scheduled'}</span><span className="text-xs text-gray-400">{match.scheduled_start ? new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time not set'}</span><span className="truncate text-gray-300">{match.entry_one?.team_name || 'TBD'} <span className="text-gray-600">vs</span> {match.entry_two?.team_name || 'TBD'}</span></div>)}</div>
                </section>}
            </div>
        </main>
    );
};

export default DrawLab;
