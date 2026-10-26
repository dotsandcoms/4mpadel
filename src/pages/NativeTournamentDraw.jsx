import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { ArrowLeft, CalendarDays, Check, Loader2, MapPin, Megaphone, RefreshCw, Share2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import PlayerModal from '../components/PlayerModal';
import DrawActionDialog from '../components/admin/DrawActionDialog';
import { EmptyView, GroupTables, MatchCard, OrderOfPlay, PublicBracket, PublicResults, PublicRoster, PublicRotation } from '../components/tournament/PublicTournamentViews';
import { bracketSections, drawKindLabel, finishedMatch, matchStatusLabel, playDayLabel, publicSchedule, publicRotations, publicTournamentTab, sastDay, sastTime, scoreColumns, tournamentDivisions, tournamentParams, tournamentTabs } from '../utils/publicTournament';
import { divisionColorMap } from '../utils/divisionColors';
import { planningSlotLabel } from '../utils/drawPlanning';
import '../components/tournament/public-tournament.css';

const emptyData = { ids: '', entries: [], matches: [], sets: [], groups: [], standings: [], profiles: [] };
async function publicRows(table, column, ids) {
    const rows = [];
    if (!ids.length) return rows;
    for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from(table).select('*').in(column, ids).order('id').range(offset, offset + 999);
        if (error) throw error;
        rows.push(...(data || []));
        if (!data || data.length < 1000) return rows;
    }
}

export default function NativeTournamentDraw({ event, preview = false }) {
    const [searchParams, setSearchParams] = useSearchParams();
    const [draws, setDraws] = useState([]);
    const [data, setData] = useState(emptyData);
    const [announcements, setAnnouncements] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [detailError, setDetailError] = useState('');
    const [refreshTick, setRefreshTick] = useState(0);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [openingPlayerKey, setOpeningPlayerKey] = useState('');
    const [activeRoundIndex, setActiveRoundIndex] = useState(0);
    const realtimeRefreshRef = useRef(null);
    const tab = publicTournamentTab(searchParams);
    const drawIds = draws.map(draw => draw.id).sort().join(',');
    const divisions = useMemo(() => tournamentDivisions(draws), [draws]);
    const colors = useMemo(() => divisionColorMap(divisions), [divisions]);
    const selectedDrawId = draws.some(draw => draw.id === searchParams.get('draw')) ? searchParams.get('draw') : divisions[0]?.draws[0]?.id || '';
    const selectedDraw = draws.find(draw => draw.id === selectedDrawId);
    const division = divisions.find(item => item.draws.some(draw => draw.id === selectedDrawId));
    const title = event.title || event.event_name || event.name || 'Tournament';
    const changeParams = (changes, options) => setSearchParams(tournamentParams(searchParams, changes), options);

    useEffect(() => {
        let active = true;
        async function load() {
            setError('');
            try {
                let query = supabase.from('draws').select('id, division_id, draw_kind, format, status, scoring_rules, generated_at, public_announcement, announcement_updated_at, tournament_divisions(name)').eq('event_id', event.id).order('created_at');
                query = preview ? query.eq('status', 'draft') : query.in('status', ['published', 'in_progress', 'completed']);
                const { data: next, error: failure } = await query;
                if (failure) throw failure;
                if (active) setDraws(next || []);
            } catch (failure) {
                if (active) setError(failure.message || 'Please try again.');
            } finally {
                if (active) setLoading(false);
            }
        }
        load();
        return () => { active = false; };
    }, [event.id, preview, refreshTick]);

    useEffect(() => {
        let active = true;
        supabase.from('native_draw_announcements').select('id, division_id, draw_id, title, message, is_pinned, created_at').eq('event_id', event.id).eq('is_active', true).order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).then(({ data: next, error: failure }) => {
            if (active) setAnnouncements(failure ? [] : next || []);
        });
        return () => { active = false; };
    }, [event.id, refreshTick]);

    useEffect(() => {
        let active = true;
        if (!drawIds) return () => { active = false; };
        async function load() {
            setDetailError('');
            try {
                // Read only the draw IDs approved for this public/preview page.
                const ids = drawIds.split(',');
                const [entries, matches, groups, standings] = await Promise.all([
                    publicRows('draw_entries', 'draw_id', ids), publicRows('draw_matches', 'draw_id', ids),
                    publicRows('draw_groups', 'draw_id', ids), publicRows('draw_standings', 'draw_id', ids),
                ]);
                const playerIds = [...new Set(entries.flatMap(entry => [entry.player_one_id, entry.player_two_id]).filter(Boolean))];
                const names = [...new Set(entries.flatMap(entry => [entry.player_one_name, entry.player_two_name]).filter(Boolean))];
                const [sets, byId, byName] = await Promise.all([
                    publicRows('draw_match_sets', 'match_id', matches.map(match => match.id)),
                    playerIds.length ? supabase.from('players').select('id, name, image_url').in('id', playerIds) : { data: [] },
                    names.length ? supabase.from('players').select('id, name, image_url').in('name', names) : { data: [] },
                ]);
                if (!active) return;
                setData({ ids: drawIds, entries, matches, sets, groups, standings, profiles: [...(byId.data || []), ...(byName.data || [])] });
                setLastUpdated(new Date());
            } catch (failure) {
                if (active) setDetailError(failure.message || 'Please try again.');
            }
        }
        load();
        return () => { active = false; };
    }, [drawIds, refreshTick]);

    useEffect(() => {
        setActiveRoundIndex(0);
    }, [selectedDrawId]);

    useEffect(() => {
        if (preview || !selectedDrawId || typeof supabase.channel !== 'function') return undefined;
        const publicDrawIds = new Set(drawIds.split(','));
        const refresh = payload => {
            const row = payload.new || payload.old || {};
            if (row.draw_id && !publicDrawIds.has(row.draw_id)) return;
            clearTimeout(realtimeRefreshRef.current);
            realtimeRefreshRef.current = setTimeout(() => {
                if (document.visibilityState === 'visible') setRefreshTick(tick => tick + 1);
            }, 300);
        };
        const channel = supabase.channel(`public-draw-${event.id}`)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'draws', filter: `event_id=eq.${event.id}` }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'native_draw_announcements', filter: `event_id=eq.${event.id}` }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_matches' }, refresh)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'draw_standings' }, refresh).subscribe();
        return () => { clearTimeout(realtimeRefreshRef.current); supabase.removeChannel(channel); };
    }, [event.id, preview, selectedDrawId, drawIds]);

    const rotations = useMemo(() => publicRotations(draws), [draws]);
    useEffect(() => {
        const onVisible = () => {
            if (document.visibilityState === 'visible') setRefreshTick(tick => tick + 1);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, []);

    const entryById = useMemo(() => new Map([...data.entries, ...rotations.entries].map(entry => [entry.id, entry])), [data.entries, rotations.entries]);
    const drawById = useMemo(() => new Map(draws.map(draw => [draw.id, draw])), [draws]);
    const matches = useMemo(() => [...data.matches.filter(match => drawById.has(match.draw_id) && !drawById.get(match.draw_id).scoring_rules?.americano).map(match => ({ ...match, division_id: drawById.get(match.draw_id).division_id })), ...rotations.matches], [data.matches, drawById, rotations.matches]);
    const selectedMatches = useMemo(() => matches.filter(match => match.draw_id === selectedDrawId).sort((a, b) => a.round_number - b.round_number || a.bracket_position - b.bracket_position), [matches, selectedDrawId]);
    const entries = useMemo(() => data.entries.filter(entry => entry.draw_id === selectedDrawId), [data.entries, selectedDrawId]);
    const groups = data.groups.filter(group => group.draw_id === selectedDrawId).sort((a, b) => a.display_order - b.display_order);
    const standings = data.standings.filter(row => row.draw_id === selectedDrawId);
    const branches = useMemo(() => bracketSections(selectedMatches).map(item => item.id === 'main' ? { ...item, label: drawKindLabel(selectedDraw?.draw_kind || 'main') } : item), [selectedMatches, selectedDraw?.draw_kind]);
    const branch = branches.find(item => item.id === searchParams.get('bracket')) || branches[0];
    const selectedMatch = matches.find(match => match.id === searchParams.get('match'));
    const rotation = selectedDraw?.scoring_rules?.americano;
    const scheduled = useMemo(() => publicSchedule(matches).map(match => ({ ...match, play_day: sastDay(match.scheduled_start) })), [matches]);
    const days = [...new Set(scheduled.map(match => match.play_day))];
    const day = days.includes(searchParams.get('day')) ? searchParams.get('day') : days.includes(sastDay(new Date())) ? sastDay(new Date()) : days[0];
    const scheduleDivision = divisions.some(item => item.id === searchParams.get('division')) ? searchParams.get('division') : 'all';
    const visibleAnnouncements = announcements.filter(item => {
        if (tab === 'order-of-play') return scheduleDivision === 'all' || !item.division_id && !item.draw_id || item.division_id === scheduleDivision || drawById.get(item.draw_id)?.division_id === scheduleDivision;
        return !item.division_id && !item.draw_id || item.draw_id === selectedDrawId || item.division_id === division?.id && !item.draw_id;
    });
    const announcementDraws = tab === 'order-of-play' ? draws.filter(draw => scheduleDivision === 'all' || draw.division_id === scheduleDivision) : [selectedDraw].filter(Boolean);
    announcementDraws.forEach(draw => {
        if (draw.public_announcement && !visibleAnnouncements.some(item => item.message === draw.public_announcement)) visibleAnnouncements.push({ id: `legacy-${draw.id}`, title: draw.tournament_divisions?.name, message: draw.public_announcement });
    });
    const sideName = (match, slot) => {
        const entry = entryById.get(match[slot === 1 ? 'entry_one_id' : 'entry_two_id']);
        if (entry) return [entry.player_one_name, entry.player_two_name].filter(Boolean).join(' / ') || entry.team_name;
        const feeder = planningSlotLabel(matches, match, slot);
        if (feeder !== 'To be decided') return feeder;
        return finishedMatch(match) && (match.entry_one_id || match.entry_two_id) ? 'Bye' : 'To be decided';
    };
    const openMatch = match => changeParams({ tab, draw: match.draw_id, match: match.id });
    const card = (match, showDivision = false, compact = false) => <MatchCard key={match.id} match={match} sets={data.sets} entryById={entryById} sideName={sideName} division={colors.get(match.division_id)} onOpen={openMatch} showDivision={showDivision} compact={compact} />;

    const openPlayer = async player => {
        const summary = data.profiles.find(profile => profile.id === player.id || profile.name?.trim().toLowerCase() === player.name?.trim().toLowerCase());
        const id = summary?.id || player.id;
        if (!id || openingPlayerKey) return;
        if (selectedMatch) changeParams({ match: null }, { replace: true });
        setOpeningPlayerKey(String(id));
        try {
            const { data: profile, error: failure } = await supabase.from('players_public').select('id, name, image_url, rankedin_id, rankings, points, skill_rating, sponsors, additional_images, home_club, region, racket_brand, rank_label, category, active_ranking_label, level, bio, age, gender, nationality, win_rate, match_form').eq('id', id).maybeSingle();
            if (failure) throw failure;
            if (profile) setSelectedPlayer({ ...summary, ...profile });
            else toast.message('No 4M profile found for this player');
        } catch { toast.error('Could not load this player profile. Please try again.'); }
        finally { setOpeningPlayerKey(''); }
    };
    const renderPlayers = entry => {
        if (!entry) return <span>To be decided</span>;
        const players = [{ id: entry.player_one_id, name: entry.player_one_name }, { id: entry.player_two_id, name: entry.player_two_name }].filter(player => player.name);
        if (!players.length) return <span>{entry.team_name || 'Team'}</span>;
        return <span className="pt-player-links">{players.map((player, index) => {
            const profile = data.profiles.find(item => item.id === player.id || item.name?.trim().toLowerCase() === player.name.trim().toLowerCase());
            const content = <><span className="pt-avatar" aria-hidden="true">{player.name.split(/\s+/).slice(0, 2).map(part => part[0]).join('')}{profile?.image_url && <img loading="lazy" src={profile.image_url} alt="" onError={e => { e.currentTarget.style.display = 'none'; }} />}</span><span>{player.name}</span></>;
            return player.id || profile?.id ? <button key={index} type="button" title={`View ${player.name}'s profile`} disabled={Boolean(openingPlayerKey)} onClick={() => openPlayer(player)}>{content}<ArrowLeft className="pt-profile-arrow" size={13} aria-hidden="true" /></button> : <span key={index}>{content}</span>;
        })}</span>;
    };
    const share = async () => {
        const query = tournamentParams(searchParams, { tab, draw: tab === 'order-of-play' && !selectedMatch ? null : selectedDrawId });
        const url = `${window.location.origin}/${preview ? 'draws-preview' : 'native-draws'}/${event.slug}?${query}`;
        try {
            if (navigator.share) await navigator.share({ title, url });
            else { await navigator.clipboard.writeText(url); toast.success('Link copied'); }
        } catch (failure) { if (failure.name !== 'AbortError') toast.error('Could not copy the link. Please copy the page address.'); }
    };
    const chooseDraw = id => changeParams({ tab, draw: id, bracket: null, match: null });
    const dateLabel = value => value ? new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Johannesburg' }).format(new Date(value.length === 10 ? `${value}T12:00:00+02:00` : value)) : '';
    const completed = draws.length > 0 && draws.every(draw => draw.status === 'completed');
    const busy = loading || Boolean(drawIds && data.ids !== drawIds);
    const switchTab = id => changeParams({ tab: id, match: null });
    const tabKeys = e => {
        const direction = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (!direction && !['Home', 'End'].includes(e.key)) return;
        e.preventDefault();
        const index = e.key === 'Home' ? 0 : e.key === 'End' ? tournamentTabs.length - 1 : (tournamentTabs.findIndex(item => item.id === tab) + direction + tournamentTabs.length) % tournamentTabs.length;
        switchTab(tournamentTabs[index].id);
        document.getElementById(`tournament-tab-${tournamentTabs[index].id}`)?.focus();
    };

    return <main className="pt-page"><div className="pt-shell">
        <div className="pt-breadcrumb"><Link to={`/events/${event.slug}`}><ArrowLeft size={15} />Event details</Link><button type="button" onClick={share}><Share2 size={15} />Share</button></div>
        <header className="pt-event-header"><div><p className="pt-eyebrow">4M PADEL · TOURNAMENT CENTRE</p><h1>{title}</h1><div className="pt-event-meta">{event.start_date && <span><CalendarDays size={15} />{dateLabel(event.start_date)}{event.end_date && event.end_date !== event.start_date && ` – ${dateLabel(event.end_date)}`}</span>}{(event.location || event.venue_name || event.city) && <span><MapPin size={15} />{event.location || event.venue_name || event.city}</span>}</div></div><span className={`pt-event-status ${preview ? 'pt-preview-status' : ''}`}>{preview ? 'Draft preview' : loading ? 'Loading' : !draws.length ? 'Draws pending' : completed ? <><Check size={14} />Completed</> : draws.some(draw => draw.status === 'in_progress') ? 'In progress' : 'Published draws'}</span></header>
        <nav className="pt-tabs" role="tablist" aria-label="Tournament views" onKeyDown={tabKeys}>{tournamentTabs.map(item => <button type="button" role="tab" id={`tournament-tab-${item.id}`} key={item.id} aria-selected={tab === item.id} aria-controls={`tournament-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1} onClick={() => switchTab(item.id)}>{item.label}</button>)}</nav>
        <section className="pt-panel" role="tabpanel" id={`tournament-panel-${tab}`} aria-labelledby={`tournament-tab-${tab}`} tabIndex="0">
            {!loading && !error && draws.length > 0 && tab !== 'order-of-play' && <div className="pt-division-toolbar"><div className="pt-division-selector"><i style={{ background: colors.get(division?.id)?.color }} /><label>Division<select value={division?.id || ''} onChange={e => chooseDraw(divisions.find(item => item.id === e.target.value)?.draws[0]?.id)}>{divisions.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>{division?.draws.length > 1 && <label className="pt-filter-label">Draw<select value={selectedDrawId} onChange={e => chooseDraw(e.target.value)}>{division.draws.map(draw => <option key={draw.id} value={draw.id}>{drawKindLabel(draw.draw_kind)}</option>)}</select></label>}<label className={`pt-filter-label pt-bracket-filter ${tab !== 'draws' || !branches.length ? 'pt-hidden' : ''}`}>Bracket<select value={branch?.id || ''} onChange={e => { changeParams({ tab, bracket: e.target.value }); setActiveRoundIndex(0); }}>{branches.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label><span className="pt-division-status">{selectedDraw?.status === 'completed' ? 'Completed' : selectedDraw?.status === 'in_progress' ? 'In progress' : preview ? 'Draft' : 'Published'}</span></div>}
            {visibleAnnouncements.length > 0 && <details className="pt-announcements"><summary><Megaphone size={16} />Tournament updates <span>{visibleAnnouncements.length}</span></summary>{visibleAnnouncements.map(item => <div key={item.id}>{item.title && <strong>{item.title}</strong>}<p>{item.message}</p></div>)}</details>}
            {error || detailError ? <div className="pt-error" role="alert"><p>We couldn’t load the tournament.</p><span>{error || detailError}</span><button type="button" onClick={() => setRefreshTick(tick => tick + 1)}><RefreshCw size={16} />Try again</button></div> : busy ? <div className="pt-loading" role="status"><Loader2 size={22} className="animate-spin" />Loading tournament…</div> : !draws.length ? <EmptyView title={preview ? 'No draft draws yet.' : 'Draws will be published soon.'}>The player list, court times and results will appear here once available.</EmptyView> : <>
                {tab === 'order-of-play' && <OrderOfPlay scheduled={scheduled} divisions={divisions.map(item => colors.get(item.id))} day={day} setDay={value => changeParams({ tab, day: value })} division={scheduleDivision} setDivision={value => changeParams({ tab, division: value === 'all' ? null : value })} card={card} />}
                {tab === 'draws' && (rotation ? <PublicRotation key={selectedDrawId} state={rotation} /> : <><div className="pt-view-heading"><div><h2>{branch?.label || 'Group stage'}</h2><p>{division?.name} · {entries.length} teams · {selectedDraw?.format?.replaceAll('_', ' ')}</p></div></div>{groups.length > 0 && <><GroupTables groups={groups} standings={standings} entryById={entryById} /><details className="pt-result-matches"><summary>Group fixtures</summary><div className="pt-match-grid pt-results-body">{selectedMatches.filter(match => match.group_id).map(match => card(match))}</div></details></>}{branch ? <PublicBracket branch={branch} activeRoundIndex={activeRoundIndex} setActiveRoundIndex={setActiveRoundIndex} card={card} /> : !groups.length && <EmptyView title="The bracket will appear here once available." />}</>)}
                {tab === 'results' && (rotation ? <PublicRotation key={selectedDrawId} state={rotation} results /> : <PublicResults key={selectedDrawId} draw={selectedDraw} entries={entries} matches={selectedMatches} groups={groups} standings={standings} entryById={entryById} renderPlayers={renderPlayers} card={card} />)}
                {tab === 'players' && <PublicRoster key={selectedDrawId} entries={entries} renderPlayers={renderPlayers} rotation={rotation} />}
            </>}
        </section>
        {!busy && draws.length > 0 && <footer className="pt-page-footer"><span>4M Padel · {preview ? 'Unpublished preview' : 'Updates automatically'}</span><button type="button" onClick={() => setRefreshTick(tick => tick + 1)}><RefreshCw size={13} />Refresh{lastUpdated && <span> · {sastTime(lastUpdated)}</span>}</button></footer>}
    </div>
    {selectedMatch && <DrawActionDialog open title={`${selectedMatch.round_label || 'Match'} · Match ${selectedMatch.bracket_position || '–'}`} onClose={() => changeParams({ match: null }, { replace: true })} wide><div className="pt-match-detail"><div className="pt-detail-meta"><span style={{ color: colors.get(selectedMatch.division_id)?.color }}>{colors.get(selectedMatch.division_id)?.name}</span><span>{matchStatusLabel(selectedMatch)}</span></div><div className="pt-detail-legend"><span>Players</span><span className="pt-score-numbers">{scoreColumns(selectedMatch, data.sets)[0].sets.map((_, index) => <span key={index}>Set {index + 1}</span>)}<strong>{selectedMatch.score_unit === 'points' ? 'Points' : 'Sets'}</strong></span></div><div className="pt-detail-score">{[1, 2].map((slot, index) => {
        const id = selectedMatch[slot === 1 ? 'entry_one_id' : 'entry_two_id'];
        const score = scoreColumns(selectedMatch, data.sets)[index];
        return <div key={slot} className={id && selectedMatch.winner_entry_id === id ? 'pt-detail-winner' : ''}><div>{entryById.has(id) ? renderPlayers(entryById.get(id)) : sideName(selectedMatch, slot)}{id && selectedMatch.winner_entry_id === id && <span className="pt-winner-label"><Check size={13} />Winner</span>}</div><div className="pt-score-numbers">{score.sets.map((set, i) => <span key={i} title={`Set ${i + 1}`}>{set.games}{set.tiebreak != null && <sup>{set.tiebreak}</sup>}</span>)}<strong title={selectedMatch.score_unit === 'points' ? 'Points' : 'Sets won'}>{score.total ?? '–'}</strong></div></div>;
    })}</div><p className="pt-detail-schedule">{matchStatusLabel(selectedMatch) === 'Bye' ? 'Automatic advance · No match to be played' : <>{selectedMatch.scheduled_start ? `${playDayLabel(sastDay(selectedMatch.scheduled_start), true)} · ${sastTime(selectedMatch.scheduled_start)} SAST` : 'Time to be confirmed'} · {selectedMatch.court_name || 'Court to be confirmed'}</>}</p>{selectedMatch.result_type === 'retirement' && <p className="pt-table-note">Match ended by retirement. Only recorded set scores are shown.</p>}{finishedMatch(selectedMatch) && selectedMatch.entry_one_id && selectedMatch.entry_two_id && selectedMatch.score_unit !== 'points' && !data.sets.some(set => set.match_id === selectedMatch.id) && <p className="pt-table-note">Detailed set scores were not recorded for this match.</p>}<p className="pt-table-note">Select a player’s name to view their 4M profile.</p></div></DrawActionDialog>}
    <AnimatePresence initial={false}>{selectedPlayer && <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}</AnimatePresence>
    </main>;
}
