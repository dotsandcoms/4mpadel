import React, { useMemo, useState } from 'react';
import { ArrowUpRight, Check, ChevronLeft, ChevronRight, Search, Trophy } from 'lucide-react';
import { bracketRounds, finishedMatch, matchStatusLabel, playDayLabel, sastTime, scheduleCourts, scoreColumns } from '../../utils/publicTournament';
import { deriveKnockoutPlacementProposals } from '../../utils/nativeDrawPlacements';
import { americanoStandings } from '../../utils/americano';
import { teamAmericanoStandings } from '../../utils/teamAmericano';
import { matchScoreText } from '../../utils/matchResult';

export function EmptyView({ title, children }) {
    return <div className="pt-empty"><p>{title}</p>{children && <span>{children}</span>}</div>;
}

export function MatchCard({ match, sets, sideName, entryById, onOpen, division, showDivision = false, compact = false }) {
    const scores = scoreColumns(match, sets);
    const status = matchStatusLabel(match);
    return <button type="button" className={`pt-match ${compact ? 'pt-match-compact' : ''}`} style={{ '--division-color': division?.color || '#b9d930' }} onClick={() => onOpen(match)} aria-label={`${match.round_label}, Match ${match.bracket_position || '–'}, ${sideName(match, 1)} versus ${sideName(match, 2)}, ${status}. ${status === 'Bye' ? 'Automatic advance' : match.score_unit === 'points' ? `${match.result_summary?.join('–') || ''} points` : matchScoreText(match, sets)}. View match`}>
        <span className="pt-match-meta"><span className={showDivision ? 'pt-division-text' : ''}>{showDivision ? division?.name : compact ? `Match ${match.bracket_position || '–'}` : match.round_label}</span><span className={match.status === 'in_progress' ? 'pt-live' : ''}>{status}<ArrowUpRight size={13} aria-hidden="true" /></span></span>
        <span className="pt-scoreboard">
            {[1, 2].map((slot, index) => {
                const entryId = match[slot === 1 ? 'entry_one_id' : 'entry_two_id'];
                const entry = entryById.get(entryId);
                const winner = Boolean(entryId && match.winner_entry_id === entryId);
                const names = entry ? [entry.player_one_name, entry.player_two_name].filter(Boolean) : [];
                return <span key={slot} className={`pt-score-row ${winner ? 'pt-winner' : ''}`}>
                    <span className="pt-team"><span className="pt-seed">{entry?.seed_number ? `[${entry.seed_number}]` : ''}</span><span>{names.length ? names.map((name, i) => <span className="pt-player-name" key={i}>{name}</span>) : sideName(match, slot)}</span>{winner && <Check size={14} className="pt-winner-check" aria-label="Winner" />}</span>
                    <span className="pt-score-numbers">{scores[index].sets.map((set, i) => <span key={i} className={set.matchTiebreak ? 'pt-tiebreak-set' : ''}>{set.games ?? '–'}{set.tiebreak != null && <sup>{set.tiebreak}</sup>}</span>)}<strong title={match.score_unit === 'points' ? 'Points' : 'Sets won'}>{scores[index].total ?? '–'}</strong></span>
                </span>;
            })}
        </span>
        <span className="pt-match-footer"><span>{showDivision ? match.round_label : status === 'Bye' ? 'Automatic advance' : match.court_name || 'Court TBC'}</span><span>{showDivision ? `Match ${match.bracket_position || '–'}` : status === 'Bye' ? 'Next round' : sastTime(match.scheduled_start) || 'Time TBC'}</span></span>
    </button>;
}

export function OrderOfPlay({ scheduled, divisions, day, setDay, division, setDivision, card }) {
    const days = [...new Set(scheduled.map(match => match.play_day))];
    const courts = scheduleCourts(scheduled, day, division);
    const count = courts.reduce((sum, court) => sum + court.matches.length, 0);
    return <>
        <h2 className="sr-only">Order of Play</h2>
        {!days.length ? <EmptyView title="The order of play will be announced soon.">Published court times will appear here.</EmptyView> : <>
            <div className="pt-schedule-toolbar"><div className="pt-day-list" aria-label="Play day">{days.map(value => <button key={value} type="button" aria-pressed={day === value} onClick={() => setDay(value)}>{playDayLabel(value)}</button>)}</div><label className="pt-filter-label">Division<select value={division} onChange={e => setDivision(e.target.value)}><option value="all">All divisions</option>{divisions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
            <div className="pt-section-line"><h3>{playDayLabel(day, true)}</h3><span>{count} {count === 1 ? 'match' : 'matches'} · {courts.length} {courts.length === 1 ? 'court' : 'courts'} · SAST</span></div>
            <div className="pt-division-key" aria-label="Division colours">{divisions.filter(item => division === 'all' || division === item.id).map(item => <span key={item.id}><i style={{ background: item.color }} />{item.name}</span>)}</div>
            {courts.length ? <div className="pt-courts">{courts.map(court => <section key={court.name} className="pt-court"><h4>{court.name}<span>{court.matches.length} {court.matches.length === 1 ? 'match' : 'matches'}</span></h4><div>{court.matches.map(match => <div key={match.id} className="pt-court-fixture"><time dateTime={match.scheduled_start}>{sastTime(match.scheduled_start)}</time>{card(match, true)}</div>)}</div></section>)}</div> : <EmptyView title="No matches for this division on this day.">Choose another division or play day.</EmptyView>}
        </>}
    </>;
}

export function PublicBracket({ branch, activeRoundIndex, setActiveRoundIndex, card }) {
    const rounds = bracketRounds(branch.matches);
    const selectedRound = Math.min(activeRoundIndex, rounds.length - 1);
    const pitch = 188, width = 352, gap = 40;
    const firstCount = Math.max(1, rounds[0]?.matches.length || 1);
    const height = firstCount * pitch;
    const top = (column, row) => (row + 0.5) * height / rounds[column].matches.length - 82;
    return <>
        <div className="pt-round-control"><button type="button" aria-label="Previous round" disabled={selectedRound <= 0} onClick={() => setActiveRoundIndex(selectedRound - 1)}><ChevronLeft size={18} /></button><label>Round<select value={selectedRound} onChange={e => setActiveRoundIndex(Number(e.target.value))}>{rounds.map((round, index) => <option key={round.number} value={index}>{round.label}</option>)}</select></label><button type="button" aria-label="Next round" disabled={selectedRound >= rounds.length - 1} onClick={() => setActiveRoundIndex(selectedRound + 1)}><ChevronRight size={18} /></button></div>
        <div className="pt-bracket-mobile">{rounds[selectedRound]?.matches.map(match => card(match))}</div>
        <div className="pt-bracket-scroll" role="region" aria-label={`${branch.label} bracket, scroll horizontally to see later rounds`} tabIndex="0">
            <div className="pt-bracket" style={{ width: rounds.length * (width + gap) - gap, height: height + 42 }}>
                <svg className="pt-bracket-lines" width="100%" height="100%" aria-hidden="true">{rounds.slice(0, -1).flatMap((round, column) => round.matches.map((match, row) => {
                    const nextRound = rounds[column + 1];
                    let nextRow = nextRound.matches.findIndex(next => next.id === match.winner_to_match_id);
                    if (nextRow < 0) nextRow = Math.min(nextRound.matches.length - 1, Math.floor(row / 2));
                    const x = column * (width + gap) + width, y = top(column, row) + 82 + 42, targetY = top(column + 1, nextRow) + 82 + 42;
                    return <path key={match.id} d={`M ${x} ${y} H ${x + gap / 2} V ${targetY} H ${x + gap}`} />;
                }))}</svg>
                {rounds.map((round, column) => <section key={round.number} className="pt-bracket-round" style={{ left: column * (width + gap), width }}><h3>{round.label}</h3>{round.matches.map((match, row) => <div key={match.id} className="pt-bracket-match" style={{ top: top(column, row) + 42 }}>{card(match, false, true)}</div>)}</section>)}
            </div>
        </div>
        <p className="pt-bracket-hint">Select any match to view the full score and player profiles.</p>
    </>;
}

export function GroupTables({ groups, standings, entryById }) {
    return <div className="pt-group-tables">{groups.map(group => <section key={group.id}><h3>{group.name}</h3><div className="pt-table-scroll"><table className="pt-table"><thead><tr><th scope="col">Pos.</th><th scope="col">Team</th><th scope="col" title="Played">P</th><th scope="col" title="Won">W</th><th scope="col" title="Game difference">+/−</th><th scope="col">Points</th></tr></thead><tbody>{standings.filter(row => row.group_id === group.id).sort((a, b) => a.position - b.position).map(row => <tr key={row.entry_id}><td>{row.position || '–'}</td><th scope="row">{entryById.get(row.entry_id)?.team_name || 'Team'}{row.requires_manual_resolution && <small>Tie under review</small>}</th><td>{row.played}</td><td>{row.won}</td><td>{row.games_for - row.games_against}</td><td>{row.standings_points}</td></tr>)}</tbody></table></div></section>)}</div>;
}

export function PublicResults({ draw, entries, matches, groups, standings, entryById, renderPlayers, card }) {
    const [round, setRound] = useState('all');
    const results = matches.filter(match => finishedMatch(match) && match.entry_one_id && match.entry_two_id);
    const proposals = useMemo(() => deriveKnockoutPlacementProposals({ entries, matches, tierCode: 'major' }), [entries, matches]);
    const complete = draw.status === 'completed';
    const points = draw.scoring_rules?.ranking_points;
    const labels = [...new Set(results.map(match => match.round_label))];
    return <>
        <div className="pt-view-heading"><div><h2>{complete ? 'Final results' : 'Results'}</h2><p>{complete ? 'Final positions and recorded match scores.' : 'Follow completed matches as the tournament progresses.'}</p></div><span className="pt-count">{results.length} results</span></div>
        {complete && proposals.length > 0 && <div className="pt-standings"><div className="pt-table-scroll"><table className="pt-table pt-final-table"><caption className="sr-only">{draw.tournament_divisions?.name} final standings</caption><thead><tr><th scope="col">Position</th><th scope="col">Players</th><th scope="col">Ranking points<small>per player</small></th></tr></thead><tbody>{proposals.map(row => <tr key={row.entry_id} className={row.placement === '1st' ? 'pt-champion' : ''}><td><span>{row.placement === '1st' && <Trophy size={17} aria-label="Winner" />}{row.placement}</span></td><th scope="row">{renderPlayers(entryById.get(row.entry_id))}</th><td>{points?.placements?.[row.placement] != null ? Number(points.placements[row.placement]).toLocaleString('en-ZA') : '—'}</td></tr>)}</tbody></table></div>{points && <p className="pt-table-note">{points.basis?.split(' · ')[0] || 'Event ranking points'}{points.source_url && <> · <a href={points.source_url} target="_blank" rel="noreferrer">Official standings <ArrowUpRight size={12} /></a></>}</p>}</div>}
        {groups.length > 0 && <GroupTables groups={groups} standings={standings} entryById={entryById} />}
        {!results.length ? <EmptyView title="No results recorded yet.">Match scores will appear here as play finishes.</EmptyView> : <details className="pt-result-matches" open={!complete}><summary>Match results <span>{results.length}</span></summary><div className="pt-results-body"><label className="pt-filter-label">Round<select value={round} onChange={e => setRound(e.target.value)}><option value="all">All rounds</option>{labels.map(label => <option key={label}>{label}</option>)}</select></label><div className="pt-match-grid">{results.filter(match => round === 'all' || match.round_label === round).sort((a, b) => a.round_number - b.round_number || a.bracket_position - b.bracket_position).map(match => card(match))}</div></div></details>}
    </>;
}

export function PublicRoster({ entries, renderPlayers, rotation }) {
    const [query, setQuery] = useState('');
    const roster = rotation ? rotation.players.map(player => ({ id: player.id, player_one_id: player.id, player_one_name: player.name })) : entries;
    const visible = [...roster].filter(entry => [entry.player_one_name, entry.player_two_name, entry.team_name].join(' ').toLowerCase().includes(query.trim().toLowerCase())).sort((a, b) => (a.seed_number || 9999) - (b.seed_number || 9999) || (a.player_one_name || a.team_name || '').localeCompare(b.player_one_name || b.team_name || ''));
    return <>
        <div className="pt-view-heading"><div><h2>Player List</h2><p>{rotation ? `${roster.length} players` : `${roster.length} teams · ${roster.reduce((sum, entry) => sum + [entry.player_one_name, entry.player_two_name].filter(Boolean).length, 0)} players`} entered in this division.</p></div><label className="pt-search"><Search size={17} aria-hidden="true" /><input aria-label="Search players" type="search" placeholder="Search players" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
        {visible.length ? <div className="pt-roster"><div className="pt-roster-heading"><span>Seed</span><span>{rotation ? 'Player' : 'Players'}</span></div>{visible.map(entry => <article key={entry.id}><span className="pt-roster-seed">{entry.seed_number || '–'}</span><div>{renderPlayers(entry)}</div></article>)}</div> : <EmptyView title={roster.length ? 'No players found.' : 'The player list will appear when the draw is published.'}>{roster.length ? 'Try another name.' : null}</EmptyView>}
    </>;
}

export function PublicRotation({ state, results = false }) {
    const [round, setRound] = useState(1);
    const names = new Map(state.players.map(player => [player.id, player.name]));
    const rows = state.variant === 'team' ? teamAmericanoStandings(state) : americanoStandings(state);
    return results ? <><div className="pt-view-heading"><div><h2>{state.variant === 'team' ? 'Team standings' : 'Player standings'}</h2><p>Total points, then point difference, then wins. Equal records share a place.</p></div></div><div className="pt-table-scroll"><table className="pt-table"><thead><tr><th>Position</th><th>{state.variant === 'team' ? 'Team' : 'Player'}</th><th>Played</th><th>Wins</th><th>+/−</th><th>Points</th></tr></thead><tbody>{rows.map(row => <tr key={row.id}><td>{row.played ? row.position : '–'}</td><th scope="row">{row.name}</th><td>{row.played}</td><td>{row.won}</td><td>{row.points - row.against}</td><td>{row.points}</td></tr>)}</tbody></table></div></> : <><div className="pt-view-heading"><div><h2>Round pairings</h2><p>{state.rounds} rounds · {state.courts} courts · {state.points} points per match</p></div><label className="pt-filter-label">Round<select value={round} onChange={e => setRound(Number(e.target.value))}>{Array.from({ length: state.rounds }, (_, i) => <option key={i} value={i + 1}>Round {i + 1}</option>)}</select></label></div><div className="pt-match-grid">{state.fixtures.filter(match => match.round === round).map(match => <article className="pt-rotation-match" key={match.id}><p>Court {match.court} {match.scheduled_start && `· ${sastTime(match.scheduled_start)}`}</p>{[match.one, match.two].map((side, i) => <div key={i}><span>{side.map(id => <span className="pt-player-name" key={id}>{names.get(id) || 'Player'}</span>)}</span><strong>{match.score?.[i] ?? '–'}</strong></div>)}</article>)}</div>{state.rests?.filter(rest => rest.round === round).map(rest => <p className="pt-table-note" key={rest.team_id}>Rest this round: {state.teams?.find(team => team.id === rest.team_id)?.name}</p>)}</>;
}
