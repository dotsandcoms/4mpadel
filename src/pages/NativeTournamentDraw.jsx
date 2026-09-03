import React, { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Activity, ArrowLeft, Brackets, CalendarDays, ChevronLeft, ChevronRight, Clock3, Loader2, MapPin, Megaphone, Radio, Share2, Sparkles, Trophy, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../supabaseClient';
import PlayerModal from '../components/PlayerModal';

const knockoutRoundLabel = (matchCount, fallbackLabel) => {
    if (matchCount === 1) return 'Final';
    if (matchCount === 2) return 'Semifinal';
    if (matchCount === 4) return 'Quarterfinal';
    const fieldSize = matchCount * 2;
    return fieldSize >= 8 ? `Round of ${fieldSize}` : fallbackLabel;
};

const NativeTournamentDraw = ({ event, preview = false }) => {
    const [searchParams, setSearchParams] = useSearchParams();
    const [draws, setDraws] = useState([]);
    const [entries, setEntries] = useState([]);
    const [matches, setMatches] = useState([]);
    const [matchSets, setMatchSets] = useState([]);
    const [groups, setGroups] = useState([]);
    const [standings, setStandings] = useState([]);
    const [playerProfiles, setPlayerProfiles] = useState(new Map());
    const [playerProfilesByName, setPlayerProfilesByName] = useState(new Map());
    const [announcements, setAnnouncements] = useState([]);
    const [selectedPlayer, setSelectedPlayer] = useState(null);
    const [openingPlayerKey, setOpeningPlayerKey] = useState('');
    const [selectedDrawId, setSelectedDrawId] = useState('');
    const [loading, setLoading] = useState(true);
    const [activeRoundIndex, setActiveRoundIndex] = useState(0);
    const [activeAnnouncementIndex, setActiveAnnouncementIndex] = useState(0);
    const [lastUpdated, setLastUpdated] = useState(null);
    const [refreshTick, setRefreshTick] = useState(0);
    const reduceMotion = useReducedMotion();
    const reveal = (delay = 0) => reduceMotion ? {} : ({
        initial: { opacity: 0, y: 16 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.12 },
        transition: { duration: 0.35, delay, ease: [0.2, 0, 0, 1] },
    });

    useEffect(() => {
        let active = true;
        const load = async () => {
            let query = supabase
                .from('draws')
                .select('id, division_id, draw_kind, format, status, generated_at, public_announcement, announcement_updated_at, tournament_divisions(name)')
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
            const requestedDrawId = searchParams.get('draw');
            setSelectedDrawId(nextDraws.some((draw) => draw.id === requestedDrawId) ? requestedDrawId : nextDraws[0]?.id || '');
            setLoading(false);
        };
        load();
        return () => { active = false; };
    }, [event.id, preview, refreshTick, searchParams]);

    useEffect(() => {
        let active = true;
        const loadAnnouncements = async () => {
            const { data, error } = await supabase
                .from('native_draw_announcements')
                .select('id, division_id, draw_id, title, message, is_pinned, created_at')
                .eq('event_id', event.id)
                .eq('is_active', true)
                .order('is_pinned', { ascending: false })
                .order('created_at', { ascending: false });
            if (error) {
                console.error('Failed to load native draw announcements', error);
                if (active) setAnnouncements([]);
                return;
            }
            if (active) setAnnouncements(data || []);
        };
        loadAnnouncements();
        return () => { active = false; };
    }, [event.id, refreshTick]);

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
            setLastUpdated(new Date());

            const playerIds = [...new Set((nextEntries || []).flatMap((entry) => [entry.player_one_id, entry.player_two_id]).filter(Boolean))];
            const playerNames = [...new Set((nextEntries || []).flatMap((entry) => [entry.player_one_name, entry.player_two_name]).filter(Boolean))];
            const matchIds = (nextMatches || []).map((match) => match.id);
            const profilesPromise = Promise.all([
                playerIds.length > 0 ? supabase.from('players').select('id, name, image_url').in('id', playerIds) : Promise.resolve({ data: [] }),
                playerNames.length > 0 ? supabase.from('players').select('id, name, image_url').in('name', playerNames) : Promise.resolve({ data: [] }),
            ]);
            const setsPromise = matchIds.length > 0
                ? supabase.from('draw_match_sets').select('*').in('match_id', matchIds).order('set_number')
                : Promise.resolve({ data: [] });
            const [[{ data: nextPlayerProfiles }, { data: nextPlayerProfilesByName }], { data: nextSets }] = await Promise.all([profilesPromise, setsPromise]);
            if (!active) return;
            setPlayerProfiles(new Map((nextPlayerProfiles || []).map((player) => [player.id, player])));
            setPlayerProfilesByName(new Map((nextPlayerProfilesByName || []).map((player) => [player.name.trim().toLowerCase(), player])));
            setMatchSets(nextSets || []);
        };
        load();
        return () => { active = false; };
    }, [selectedDrawId, refreshTick]);

    const entryById = useMemo(() => new Map(entries.map((entry) => [entry.id, entry])), [entries]);
    const rounds = useMemo(() => {
        const byRound = new Map();
        matches.filter((match) => match.stage === 'knockout').forEach((match) => {
            const round = byRound.get(match.round_number) || { number: match.round_number, label: match.round_label, matches: [] };
            round.matches.push(match);
            byRound.set(match.round_number, round);
        });
        return [...byRound.values()]
            .sort((a, b) => a.number - b.number)
            .map((round) => ({ ...round, label: knockoutRoundLabel(round.matches.length, round.label) }));
    }, [matches]);
    const placementMatches = useMemo(() => matches.filter((match) => match.stage === 'placement'), [matches]);
    const roundLabelForMatch = (match) => match.stage === 'placement' ? match.round_label : rounds.find((round) => round.number === match.round_number)?.label || match.round_label;
    const groupMatchesById = useMemo(() => groups.reduce((result, group) => ({
        ...result,
        [group.id]: matches.filter((match) => match.group_id === group.id).sort((a, b) => (
            a.round_number - b.round_number || a.bracket_position - b.bracket_position
        )),
    }), {}), [groups, matches]);
    const standingsForGroup = (groupId) => standings
        .filter((row) => row.group_id === groupId)
        .sort((a, b) => (a.position || 999) - (b.position || 999));
    const teamPlayers = (entryId) => {
        const entry = entryById.get(entryId);
        if (!entry) return [{ id: null, name: 'TBD' }];
        const players = [
            { id: entry.player_one_id, name: entry.player_one_name, imageUrl: entry.snapshot?.player_one_image_url || null },
            { id: entry.player_two_id, name: entry.player_two_name, imageUrl: entry.snapshot?.player_two_image_url || null },
        ].filter((player) => player.name);
        return players.length > 0 ? players : [{ id: null, name: entry.team_name }];
    };
    const teamLines = (entryId) => teamPlayers(entryId).map((player) => player.name);
    const teamName = (entryId) => entryById.get(entryId)?.team_name || teamLines(entryId).join(' / ');
    const playerInitials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();
    const profileForPlayer = (player) => (player.id ? playerProfiles.get(player.id) : null) || playerProfilesByName.get(player.name.trim().toLowerCase());
    const openPlayerProfile = async (player) => {
        const summary = profileForPlayer(player);
        const playerId = summary?.id || player.id;
        if (!playerId || openingPlayerKey) return;
        setOpeningPlayerKey(String(playerId));
        try {
            const { data, error } = await supabase
                .from('players_public')
                .select('id, name, image_url, rankedin_id, rankings, points, skill_rating, sponsors, additional_images, home_club, region, racket_brand, rank_label, category, active_ranking_label, level, bio, age, gender, nationality, win_rate, match_form')
                .eq('id', playerId)
                .maybeSingle();
            if (error) throw error;
            if (!data) {
                toast.message('No 4M profile found for this player');
                return;
            }
            setSelectedPlayer({ ...summary, ...data });
        } catch (error) {
            console.error('Could not load player profile', error);
            toast.error('Could not load player profile');
        } finally {
            setOpeningPlayerKey('');
        }
    };
    const renderPlayerAvatar = (player, sizeClass = 'h-6 w-6 text-[8px]') => {
        const profile = profileForPlayer(player);
        const imageUrl = profile?.image_url || player.imageUrl || null;
        return <span className={`relative flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-slate-700 font-black text-gray-200 ${sizeClass}`}><span aria-hidden="true">{playerInitials(player.name)}</span>{imageUrl && <img src={imageUrl} alt="" className="absolute inset-0 h-full w-full object-cover outline outline-1 outline-white/10" onError={(image) => { image.currentTarget.style.display = 'none'; }} />}</span>;
    };
    const renderPlayerLine = (player, className = '') => {
        const profile = profileForPlayer(player);
        const contents = <>{renderPlayerAvatar(player)}<span className="truncate"><span className="mr-1.5 text-xs">🇿🇦</span>{player.name}</span></>;
        return profile?.id || player.id
            ? <button key={`${player.id || 'unknown'}-${player.name}`} type="button" onClick={() => openPlayerProfile(player)} disabled={openingPlayerKey === String(profile?.id || player.id)} title={`View ${player.name}'s 4M profile`} className={`flex min-w-0 items-center gap-2 rounded-md text-left transition-colors hover:text-padel-green disabled:cursor-wait disabled:opacity-60 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green ${className}`}>{contents}</button>
            : <div key={`${player.id || 'unknown'}-${player.name}`} className={`flex min-w-0 items-center gap-2 ${className}`}>{contents}</div>;
    };
    const renderTeamProfileStack = (entryId) => <span className="flex shrink-0 -space-x-2">{teamPlayers(entryId).map((player, index) => {
        const profile = profileForPlayer(player);
        const avatar = <span className="rounded-full ring-2 ring-[#08101f]">{renderPlayerAvatar(player, 'h-7 w-7 text-[8px]')}</span>;
        return profile?.id || player.id ? <button type="button" key={`${player.id || player.name}-${index}`} onClick={() => openPlayerProfile(player)} disabled={openingPlayerKey === String(profile?.id || player.id)} title={`View ${player.name}'s 4M profile`} className="rounded-full transition-transform hover:z-10 hover:scale-110 disabled:cursor-wait disabled:opacity-60 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">{avatar}</button> : <span key={`${player.id || player.name}-${index}`}>{avatar}</span>;
    })}</span>;
    const resultSummary = (match) => {
        const winner = match.winner_entry_id ? teamName(match.winner_entry_id) : null;
        const loser = match.loser_entry_id ? teamName(match.loser_entry_id) : null;
        if (winner && loser && winner !== loser) return { primary: winner, secondary: `def. ${loser}` };
        return { primary: `${teamName(match.entry_one_id)} vs ${teamName(match.entry_two_id)}`, secondary: 'Result recorded' };
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
    const courtLabel = (match) => match.court_name || 'Court to be confirmed';
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
    const resolvedStatuses = ['completed', 'walkover', 'retired'];
    const playableMatches = useMemo(() => matches.filter((match) => match.entry_one_id && match.entry_two_id), [matches]);
    const completedMatchCount = useMemo(() => playableMatches.filter((match) => resolvedStatuses.includes(match.status)).length, [playableMatches]);
    const nextMatch = useMemo(() => playableMatches.find((match) => !resolvedStatuses.includes(match.status)) || null, [playableMatches]);
    const selectedDraw = useMemo(() => draws.find((draw) => draw.id === selectedDrawId) || null, [draws, selectedDrawId]);
    const divisionDrawGroups = useMemo(() => {
        const groupsByDivision = new Map();
        draws.forEach((draw) => {
            const key = draw.division_id || draw.tournament_divisions?.name || draw.id;
            const current = groupsByDivision.get(key) || {
                id: key,
                name: draw.tournament_divisions?.name || 'Division',
                draws: [],
            };
            current.draws.push(draw);
            groupsByDivision.set(key, current);
        });
        const drawOrder = { main: 0, silver: 1, bronze: 2 };
        return [...groupsByDivision.values()].map((group) => ({
            ...group,
            draws: [...group.draws].sort((a, b) => (drawOrder[a.draw_kind] ?? 99) - (drawOrder[b.draw_kind] ?? 99)),
        }));
    }, [draws]);
    const selectedDivisionGroup = useMemo(() => divisionDrawGroups.find((group) => group.draws.some((draw) => draw.id === selectedDrawId)) || null, [divisionDrawGroups, selectedDrawId]);
    const visibleAnnouncements = useMemo(() => {
        const scopedAnnouncements = announcements.filter((announcement) => (
            !announcement.division_id
            || announcement.draw_id === selectedDrawId
            || (announcement.division_id === selectedDraw?.division_id && !announcement.draw_id)
        ));
        const hasImportedLegacyAnnouncement = scopedAnnouncements.some((announcement) => (
            announcement.draw_id === selectedDraw?.id
            && announcement.message === selectedDraw?.public_announcement
        ));
        if (selectedDraw?.public_announcement && !hasImportedLegacyAnnouncement) {
            scopedAnnouncements.push({
                id: `legacy-${selectedDraw.id}`,
                title: null,
                message: selectedDraw.public_announcement,
                is_pinned: true,
                created_at: selectedDraw.announcement_updated_at || selectedDraw.generated_at || new Date(0).toISOString(),
                legacy: true,
            });
        }
        return scopedAnnouncements;
    }, [announcements, selectedDraw, selectedDrawId]);
    useEffect(() => {
        setActiveAnnouncementIndex(0);
    }, [selectedDrawId, visibleAnnouncements.length]);
    const activeAnnouncement = visibleAnnouncements[activeAnnouncementIndex] || null;
    const drawKindLabel = (drawKind) => drawKind === 'main' ? 'Main draw' : drawKind === 'silver' ? 'Silver plate' : drawKind === 'bronze' ? 'Bronze plate' : `${drawKind} draw`;
    const selectedMatch = useMemo(() => {
        const matchId = searchParams.get('match');
        return matches.find((match) => match.id === matchId) || null;
    }, [matches, searchParams]);
    const heroImage = event.custom_image_url || event.image_url || null;

    const drawUrl = (drawId = selectedDrawId, matchId = null) => {
        const params = new URLSearchParams();
        if (drawId) params.set('draw', drawId);
        if (matchId) params.set('match', matchId);
        const query = params.toString();
        return `/native-draws/${event.slug}${query ? `?${query}` : ''}`;
    };
    const shareDraw = async () => {
        const shareUrl = `${window.location.origin}${drawUrl(selectedDrawId, selectedMatch?.id || null)}`;
        const title = selectedMatch ? `${event.event_name} · ${roundLabelForMatch(selectedMatch)}` : `${event.event_name} draw`;
        try {
            if (navigator.share) {
                await navigator.share({ title, text: 'Follow the live 4M Padel draw.', url: shareUrl });
            } else if (navigator.clipboard) {
                await navigator.clipboard.writeText(shareUrl);
                toast.success('Share link copied');
            } else {
                window.prompt('Copy this draw link', shareUrl);
            }
        } catch (error) {
            if (error?.name !== 'AbortError') console.error('Could not share draw', error);
        }
    };
    const selectDraw = (drawId) => {
        setSelectedDrawId(drawId);
        setSearchParams(drawId ? { draw: drawId } : {});
    };
    const selectDivision = (divisionId) => {
        const division = divisionDrawGroups.find((group) => group.id === divisionId);
        const primaryDraw = division?.draws.find((draw) => draw.draw_kind === 'main') || division?.draws[0];
        if (primaryDraw) selectDraw(primaryDraw.id);
    };

    const latestResults = useMemo(() => playableMatches
        .filter((match) => resolvedStatuses.includes(match.status))
        .sort((a, b) => new Date(b.updated_at || 0) - new Date(a.updated_at || 0))
        .slice(0, 4), [playableMatches]);
    const topSeeds = useMemo(() => entries
        .filter((entry) => Number.isFinite(Number(entry.seed_number)))
        .sort((a, b) => Number(a.seed_number) - Number(b.seed_number))
        .slice(0, 4), [entries]);
    const allScheduledMatches = useMemo(() => playableMatches
        .filter((match) => match.scheduled_start && !resolvedStatuses.includes(match.status))
        .sort((a, b) => new Date(a.scheduled_start) - new Date(b.scheduled_start)), [playableMatches]);
    const scheduledMatches = useMemo(() => allScheduledMatches.slice(0, 4), [allScheduledMatches]);
    const matchesWithCourt = useMemo(() => playableMatches
        .filter((match) => match.court_name && !resolvedStatuses.includes(match.status))
        .sort((a, b) => {
            if (a.scheduled_start && b.scheduled_start) return new Date(a.scheduled_start) - new Date(b.scheduled_start);
            if (a.scheduled_start) return -1;
            if (b.scheduled_start) return 1;
            return (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0);
        }), [playableMatches]);
    const matchesByCourt = useMemo(() => matchesWithCourt.reduce((courts, match) => {
        const court = courtLabel(match);
        courts.set(court, [...(courts.get(court) || []), match]);
        return courts;
    }, new Map()), [matchesWithCourt]);
    const featuredMatches = useMemo(() => {
        const available = playableMatches.filter((match) => !resolvedStatuses.includes(match.status));
        const selected = available.filter((match) => match.is_featured);
        const automatic = available
            .filter((match) => !match.is_featured)
            .sort((a, b) => {
                if (a.scheduled_start && b.scheduled_start) return new Date(a.scheduled_start) - new Date(b.scheduled_start);
                if (a.scheduled_start) return -1;
                if (b.scheduled_start) return 1;
                return (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0);
            });
        return [...selected, ...automatic].slice(0, 4);
    }, [playableMatches]);
    const liveMatches = useMemo(() => playableMatches.filter((match) => match.status === 'in_progress'), [playableMatches]);
    const currentLiveMatch = liveMatches[0] || null;
    const upcomingMatch = scheduledMatches[0] || nextMatch;
    const matchHref = (match) => `${drawUrl(selectedDrawId, match.id)}#match-centre`;
    const eventDate = useMemo(() => {
        if (!event.start_date) return null;
        const start = new Date(event.start_date);
        const end = event.end_date ? new Date(event.end_date) : null;
        const formatter = new Intl.DateTimeFormat('en-ZA', { day: 'numeric', month: 'short', year: 'numeric' });
        return end && end.toDateString() !== start.toDateString() ? `${formatter.format(start)} – ${formatter.format(end)}` : formatter.format(start);
    }, [event.start_date, event.end_date]);

    useEffect(() => {
        if (preview || !selectedDrawId || selectedDraw?.status === 'completed') return undefined;
        const refreshTimer = window.setInterval(() => setRefreshTick((tick) => tick + 1), 20000);
        return () => window.clearInterval(refreshTimer);
    }, [preview, selectedDrawId, selectedDraw?.status]);
    const renderMatchCard = (match) => {
        const entryOneWon = match.winner_entry_id && match.winner_entry_id === match.entry_one_id;
        const entryTwoWon = match.winner_entry_id && match.winner_entry_id === match.entry_two_id;
        const active = match.entry_one_id && match.entry_two_id && !['completed', 'walkover', 'retired'].includes(match.status);
        const live = match.status === 'in_progress';
        return <article key={match.id} className={`relative overflow-hidden rounded-2xl border bg-[#111d32] shadow-xl ${live ? 'border-pink-400/60 ring-1 ring-pink-400/20' : active ? 'border-padel-green/60' : 'border-white/10'}`}>
            <div className="flex items-stretch">
                <div className="flex w-12 shrink-0 items-center justify-center border-r border-white/10 bg-black/20"><span className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-black ${entryOneWon || entryTwoWon ? 'bg-padel-green text-black' : 'bg-black/40 text-gray-300'}`}>{match.bracket_position}</span></div>
                <div className="min-w-0 flex-1">
                    {[['one', match.entry_one_id, entryOneWon], ['two', match.entry_two_id, entryTwoWon]].map(([side, entryId, won]) => (
                        <div key={side} className={`border-b border-white/10 px-4 py-3 last:border-b-0 ${won ? 'bg-padel-green/5' : ''}`}>
                            {teamPlayers(entryId).map((player) => renderPlayerLine(player, `text-sm ${won ? 'font-bold text-white' : (entryId ? 'text-gray-300' : 'text-gray-500')}`))}
                        </div>
                    ))}
                </div>
            </div>
            <div className="flex items-center justify-between border-t border-white/10 px-4 py-2">
                <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${match.status === 'completed' ? 'bg-padel-green text-black' : live ? 'bg-pink-400 text-black' : (active ? 'bg-amber-300 text-black' : 'bg-white/10 text-gray-400')}`}>{live && <Radio size={10} className="animate-pulse motion-reduce:animate-none" />}{live ? 'Live' : matchBadge(match)}</span>
                <Link to={matchHref(match)} className="inline-flex items-center gap-2 rounded-lg text-right transition-colors hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><span className={scoreLine(match) ? 'text-sm font-black tracking-wide text-white' : 'text-xs font-bold text-gray-400'}>{scoreLine(match) || resultLabel(match)}</span><span className="text-[10px] font-black uppercase tracking-wide text-gray-500">View</span></Link>
            </div>
        </article>;
    };
    const renderRoundMatchCard = (match) => {
        const entryOne = entryById.get(match.entry_one_id);
        const entryTwo = entryById.get(match.entry_two_id);
        const entryOneWon = match.winner_entry_id && match.winner_entry_id === match.entry_one_id;
        const entryTwoWon = match.winner_entry_id && match.winner_entry_id === match.entry_two_id;
        const sets = setsForMatch(match.id);
        const isResolved = resolvedStatuses.includes(match.status);
        const live = match.status === 'in_progress';
        return <article key={match.id} className={`overflow-hidden rounded-2xl border bg-[#0a1426] shadow-xl shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5 ${live ? 'border-pink-400/60 ring-1 ring-pink-400/20' : isResolved ? 'border-white/10' : 'border-padel-green/35'}`}>
            <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><span className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">{roundLabelForMatch(match)} · Match {match.bracket_position}</span><span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${isResolved ? 'bg-white/10 text-gray-300' : match.entry_one_id && match.entry_two_id ? 'bg-padel-green text-black' : 'bg-white/5 text-gray-500'}`}>{matchBadge(match)}</span></div>
            <div className="px-4 py-3"><div className={`rounded-xl px-3 py-2.5 ${entryOneWon ? 'bg-padel-green/10 ring-1 ring-inset ring-padel-green/25' : 'bg-white/[0.03]'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-1.5">{teamPlayers(match.entry_one_id).map((player) => renderPlayerLine(player, `text-sm ${entryOneWon ? 'font-bold text-white' : 'text-gray-300'}`))}</div>{entryOne?.seed_number && <span className="shrink-0 text-xs font-black text-amber-300">#{entryOne.seed_number}</span>}</div></div><div className="flex items-center gap-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-gray-600"><span className="h-px flex-1 bg-white/10" />vs<span className="h-px flex-1 bg-white/10" /></div><div className={`rounded-xl px-3 py-2.5 ${entryTwoWon ? 'bg-padel-green/10 ring-1 ring-inset ring-padel-green/25' : 'bg-white/[0.03]'}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0 space-y-1.5">{teamPlayers(match.entry_two_id).map((player) => renderPlayerLine(player, `text-sm ${entryTwoWon ? 'font-bold text-white' : 'text-gray-300'}`))}</div>{entryTwo?.seed_number && <span className="shrink-0 text-xs font-black text-amber-300">#{entryTwo.seed_number}</span>}</div></div></div>
            <footer className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/15 px-4 py-3"><span className="min-w-0 truncate text-xs font-semibold text-gray-400">{match.scheduled_start ? new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : resultLabel(match)}</span><div className="flex shrink-0 items-center gap-2">{sets.length > 0 && <div className="flex gap-1.5">{sets.map((set) => <span key={set.id} className="rounded-md border border-white/10 bg-white/[0.06] px-2 py-1 text-xs font-black tabular-nums text-white">{set.entry_one_games}–{set.entry_two_games}</span>)}</div>}<Link to={matchHref(match)} className="text-[10px] font-black uppercase tracking-wide text-padel-green transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Match</Link></div></footer>
        </article>;
    };
    const renderFeaturedMatch = (match) => {
        const entryOne = entryById.get(match.entry_one_id);
        const entryTwo = entryById.get(match.entry_two_id);
        const scheduled = match.scheduled_start ? new Date(match.scheduled_start) : null;
        const isScheduled = Boolean(scheduled);
        const live = match.status === 'in_progress';
        return <motion.article key={match.id} whileHover={reduceMotion ? undefined : { y: -3 }} className={`overflow-hidden rounded-2xl border bg-[#0b1730] shadow-xl shadow-black/25 ${live ? 'border-pink-400/75 ring-1 ring-pink-400/20' : isScheduled ? 'border-pink-400/45' : 'border-padel-green/35'}`}>
                <div className="p-4"><div className="flex items-start justify-between gap-3"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-gray-400">{roundLabelForMatch(match)} · Match {match.bracket_position}</p><span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-black ${live ? 'bg-pink-400 text-black' : isScheduled ? 'bg-pink-400/15 text-pink-200' : 'bg-padel-green text-black'}`}>{live && <Radio size={10} className="animate-pulse motion-reduce:animate-none" />}{live ? 'Live' : isScheduled ? 'Scheduled' : 'Up next'}</span></div><div className="mt-4 space-y-2.5">{teamPlayers(match.entry_one_id).map((player) => <div key={`${player.id || player.name}-one`} className="flex items-center justify-between gap-3">{renderPlayerLine(player, 'text-sm font-bold text-white')} {entryOne?.seed_number && <span className="text-xs font-black text-amber-300">#{entryOne.seed_number}</span>}</div>)}<div className="flex items-center gap-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500"><span className="h-px flex-1 bg-white/10" />vs<span className="h-px flex-1 bg-white/10" /></div>{teamPlayers(match.entry_two_id).map((player) => <div key={`${player.id || player.name}-two`} className="flex items-center justify-between gap-3">{renderPlayerLine(player, 'text-sm font-bold text-white')} {entryTwo?.seed_number && <span className="text-xs font-black text-amber-300">#{entryTwo.seed_number}</span>}</div>)}</div><div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-xs font-semibold text-gray-400"><span className="inline-flex min-w-0 items-center gap-1.5"><Clock3 size={13} className={live || isScheduled ? 'text-pink-300' : 'text-padel-green'} />{live ? 'Live now' : scheduled ? scheduled.toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ready to play'}</span><Link to={matchHref(match)} className="shrink-0 text-xs font-black text-padel-green transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">View match →</Link></div></div>
        </motion.article>;
    };
    const renderLiveMatch = (match) => {
        const sets = setsForMatch(match.id);
        return <motion.article key={match.id} layout="position" initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', duration: 0.3, bounce: 0 }} className="overflow-hidden rounded-2xl border border-pink-300/35 bg-black/15 shadow-lg shadow-black/20"><header className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-3"><div><p className="text-[10px] font-black uppercase tracking-[0.16em] text-pink-200">{roundLabelForMatch(match)} · Match {match.bracket_position}</p><p className="mt-1 text-xs font-semibold text-gray-400">{match.court_name || 'Court to be confirmed'}</p></div><span className="inline-flex items-center gap-1.5 rounded-full bg-pink-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black"><Radio size={10} className="animate-pulse motion-reduce:animate-none" /> Live</span></header><div className="p-4"><div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:items-center"><div className="min-w-0 space-y-2">{teamPlayers(match.entry_one_id).map((player) => renderPlayerLine(player, 'text-sm font-bold text-white'))}</div><span className="text-center text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">vs</span><div className="min-w-0 space-y-2">{teamPlayers(match.entry_two_id).map((player) => renderPlayerLine(player, 'text-sm font-bold text-white'))}</div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-3"><div className="flex flex-wrap gap-1.5">{sets.length > 0 ? sets.map((set) => <span key={set.id} className="rounded-lg border border-pink-300/25 bg-pink-400/10 px-2.5 py-1 text-sm font-black tabular-nums text-white">{set.entry_one_games}–{set.entry_two_games}</span>) : <span className="text-xs font-semibold text-gray-400">Score pending</span>}</div><Link to={matchHref(match)} className="shrink-0 text-xs font-black text-pink-200 transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Open match →</Link></div></div></motion.article>;
    };

    return (
        <main className="min-h-screen bg-[#06080d] px-4 pb-20 pt-20 text-white md:px-8 md:pt-24">
            <div className="mx-auto max-w-7xl">
                <Link to={`/calendar/${event.slug}`} className="mb-5 inline-flex items-center gap-2 text-sm font-bold text-gray-400 transition-colors hover:text-padel-green"><ArrowLeft size={16} /> Back to event</Link>
                <motion.section {...reveal()} className="relative mb-8 overflow-hidden rounded-[2rem] border border-white/10 bg-[#0b1220] shadow-2xl shadow-black/40">
                    {heroImage && <img src={heroImage} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover opacity-20" />}
                    {!reduceMotion && <motion.div aria-hidden="true" className="absolute -right-24 -top-24 h-72 w-72 rounded-full bg-pink-400/15 blur-3xl" animate={{ opacity: [0.2, 0.55, 0.2], scale: [0.92, 1.08, 0.92] }} transition={{ duration: 7, repeat: Infinity, ease: 'easeInOut' }} />}
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_10%,rgba(191,255,0,0.2),transparent_30%),radial-gradient(circle_at_15%_90%,rgba(14,165,233,0.18),transparent_34%),linear-gradient(115deg,rgba(5,8,14,0.98),rgba(8,16,31,0.84))]" />
                    <div className="relative px-5 py-6 sm:px-8 sm:py-8 lg:px-10 lg:py-10">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="inline-flex items-center gap-2 rounded-full border border-padel-green/35 bg-padel-green/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-padel-green"><Radio size={13} className="animate-pulse motion-reduce:animate-none" /> {preview ? 'Private draw preview' : selectedDraw?.status === 'completed' ? 'Final results' : 'Live tournament centre'}</div>
                            {!preview && <div className="flex items-center gap-3"><span className="inline-flex items-center gap-2 text-xs font-semibold text-gray-300"><Activity size={14} className="text-padel-green" /> {selectedDraw?.status === 'completed' ? 'Tournament complete' : 'Updates automatically'}</span><button type="button" onClick={shareDraw} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs font-black text-white transition-transform transition-colors hover:border-padel-green/50 hover:text-padel-green active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><Share2 size={14} /> Share draw</button></div>}
                        </div>
                        <div className="mt-7 grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
                            <div>
                                <p className="mb-3 flex items-center gap-2 text-xs font-black uppercase tracking-[0.2em] text-padel-green"><Brackets size={15} /> {selectedDraw?.tournament_divisions?.name || 'Tournament draw'}</p>
                                <h1 className="max-w-4xl text-balance text-4xl font-black leading-[0.98] tracking-tight text-white sm:text-5xl lg:text-6xl">{event.event_name}</h1>
                                <p className="mt-4 max-w-2xl text-sm leading-6 text-gray-300 sm:text-base">Follow every result, track the leaders and see who is next to take the court.</p>
                            </div>
                            <div className={`rounded-2xl border p-4 backdrop-blur-sm ${currentLiveMatch ? 'border-pink-400/40 bg-pink-400/10' : 'border-white/10 bg-black/25'}`}>
                                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-gray-400">{currentLiveMatch ? `Live now · ${liveMatches.length} ${liveMatches.length === 1 ? 'match' : 'matches'}` : upcomingMatch ? 'Up next' : 'Tournament status'}</p>
                                {currentLiveMatch ? <><div className="mt-3 space-y-2"><div className="flex min-w-0 items-center gap-2">{renderTeamProfileStack(currentLiveMatch.entry_one_id)}<span className="truncate text-sm font-bold text-white">{teamName(currentLiveMatch.entry_one_id)}</span></div><div className="flex min-w-0 items-center gap-2"><span className="w-16 shrink-0 text-center text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">vs</span><span className="h-px flex-1 bg-white/10" /></div><div className="flex min-w-0 items-center gap-2">{renderTeamProfileStack(currentLiveMatch.entry_two_id)}<span className="truncate text-sm font-bold text-white">{teamName(currentLiveMatch.entry_two_id)}</span></div></div><Link to={matchHref(currentLiveMatch)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-pink-200 transition-colors hover:text-white"><Radio size={13} className="animate-pulse motion-reduce:animate-none" /> Follow live match →</Link></> : upcomingMatch ? <><div className="mt-3 space-y-2"><div className="flex min-w-0 items-center gap-2">{renderTeamProfileStack(upcomingMatch.entry_one_id)}<span className="truncate text-sm font-bold text-white">{teamName(upcomingMatch.entry_one_id)}</span></div><div className="flex min-w-0 items-center gap-2"><span className="w-16 shrink-0 text-center text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">vs</span><span className="h-px flex-1 bg-white/10" /></div><div className="flex min-w-0 items-center gap-2">{renderTeamProfileStack(upcomingMatch.entry_two_id)}<span className="truncate text-sm font-bold text-white">{teamName(upcomingMatch.entry_two_id)}</span></div></div><Link to={matchHref(upcomingMatch)} className="mt-3 inline-flex items-center gap-1.5 text-xs font-bold text-padel-green transition-colors hover:text-white"><Clock3 size={13} /> {upcomingMatch.scheduled_start ? new Date(upcomingMatch.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ready to play'} →</Link></> : <><p className="mt-2 text-sm font-bold text-white">All current matches are complete</p><p className="mt-2 inline-flex items-center gap-1.5 text-xs font-bold text-padel-green"><Trophy size={13} /> Results locked in</p></>}
                            </div>
                        </div>
                        <div className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-4">
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"><Users size={15} className="mb-2 text-padel-green" /><p className="text-xl font-black tabular-nums text-white">{entries.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Teams</p></div>
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"><Activity size={15} className="mb-2 text-sky-300" /><p className="text-xl font-black tabular-nums text-white">{completedMatchCount}<span className="text-sm text-gray-500">/{playableMatches.length}</span></p><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Matches played</p></div>
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"><Trophy size={15} className="mb-2 text-amber-300" /><p className="text-xl font-black tabular-nums text-white">{groups.length || rounds.length}</p><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">{groups.length ? 'Groups' : 'Rounds'}</p></div>
                            <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-3"><CalendarDays size={15} className="mb-2 text-pink-300" /><p className="text-sm font-black text-white">{lastUpdated ? lastUpdated.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit' }) : '—'}</p><p className="text-[10px] font-bold uppercase tracking-wide text-gray-400">Last update</p></div>
                        </div>
                        <nav aria-label="Tournament sections" className="mt-5 flex gap-2 overflow-x-auto pb-1">
                            <a href="#overview" className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Overview</a>
                            <a href="#live-match-centre" className="shrink-0 rounded-full border border-pink-400/25 bg-pink-400/10 px-3 py-2 text-xs font-bold text-pink-100 transition-colors hover:border-pink-300/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Live centre</a>
                            <a href="#schedule" className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Court schedule</a>
                            {groups.length > 0 && <a href="#live-draw" className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Standings</a>}
                            {rounds.length > 0 && <a href="#matches" className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Matches by round</a>}
                            {rounds.length > 0 && <a href="#bracket" className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-bold text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Bracket</a>}
                        </nav>
                    </div>
                </motion.section>

                {divisionDrawGroups.length > 1 && <div className="mb-8 flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-bold text-white"><Sparkles size={15} className="text-padel-green" /> Follow a division</p><p className="mt-1 text-xs text-gray-400">Choose a division, then select its draw or plate below.</p></div><select aria-label="Select tournament division" value={selectedDivisionGroup?.id || ''} onChange={(item) => selectDivision(item.target.value)} className="w-full rounded-xl border border-white/10 bg-[#101827] px-4 py-3 text-sm font-bold text-white outline-none transition-colors focus-visible:border-padel-green sm:w-auto">
                    {divisionDrawGroups.map((division) => <option key={division.id} value={division.id} className="text-black">{division.name}</option>)}
                </select></div>}
                {selectedDivisionGroup?.draws.length > 1 && <section aria-label={`${selectedDivisionGroup.name} draws`} className="mb-8 overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-300/10 via-[#11182a] to-[#08101f] shadow-xl shadow-black/20"><div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="flex items-center gap-2 text-sm font-bold text-white"><Trophy size={15} className="text-amber-300" /> {selectedDivisionGroup.name}</p><p className="mt-1 text-xs text-gray-400">Main draw and back draws for this division.</p></div><div className="flex flex-wrap gap-2">{selectedDivisionGroup.draws.map((draw) => <button type="button" key={draw.id} onClick={() => selectDraw(draw.id)} aria-pressed={draw.id === selectedDrawId} className={`rounded-xl px-3 py-2 text-xs font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green ${draw.id === selectedDrawId ? 'bg-amber-300 text-black' : 'border border-white/10 bg-black/20 text-gray-300 hover:border-amber-300/40 hover:text-amber-100'}`}>{drawKindLabel(draw.draw_kind)}</button>)}</div></div></section>}

                {activeAnnouncement && <motion.section {...reveal(0.02)} aria-label="Tournament announcements" className="mb-8 overflow-hidden rounded-2xl border border-pink-300/30 bg-gradient-to-r from-pink-400/10 via-[#111226] to-[#09101e] shadow-xl shadow-black/20">
                    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-pink-300/15 px-5 py-4">
                        <div className="flex items-center gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pink-400/15 text-pink-200"><Megaphone size={19} /></span><div><p className="text-xs font-black uppercase tracking-[0.16em] text-pink-200">Tournament updates</p><p className="mt-1 text-xs text-gray-400">{visibleAnnouncements.length} {visibleAnnouncements.length === 1 ? 'announcement' : 'announcements'} for {selectedDraw?.tournament_divisions?.name || 'this draw'}.</p></div></div>
                        {visibleAnnouncements.length > 1 && <div className="flex items-center gap-2"><button type="button" aria-label="Previous announcement" onClick={() => setActiveAnnouncementIndex((index) => Math.max(0, index - 1))} disabled={activeAnnouncementIndex === 0} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-200 transition-colors hover:border-pink-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><ChevronLeft size={17} /></button><span className="min-w-10 text-center text-xs font-black text-pink-100">{activeAnnouncementIndex + 1} / {visibleAnnouncements.length}</span><button type="button" aria-label="Next announcement" onClick={() => setActiveAnnouncementIndex((index) => Math.min(visibleAnnouncements.length - 1, index + 1))} disabled={activeAnnouncementIndex === visibleAnnouncements.length - 1} className="flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-gray-200 transition-colors hover:border-pink-300/60 hover:text-white disabled:cursor-not-allowed disabled:opacity-35"><ChevronRight size={17} /></button></div>}
                    </header>
                    <AnimatePresence mode="wait">
                        <motion.article key={activeAnnouncement.id} initial={reduceMotion ? false : { opacity: 0, x: 18 }} animate={{ opacity: 1, x: 0 }} exit={reduceMotion ? undefined : { opacity: 0, x: -18 }} transition={{ duration: 0.2, ease: 'easeOut' }} className="px-5 py-4">
                            <div className="flex flex-wrap items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase tracking-wide ${activeAnnouncement.is_pinned ? 'bg-pink-400 text-black' : 'bg-white/10 text-gray-300'}`}>{activeAnnouncement.is_pinned ? 'Pinned' : activeAnnouncement.draw_id ? 'Draw update' : activeAnnouncement.division_id ? 'Division update' : 'Event update'}</span><time className="text-[10px] font-semibold text-gray-500">{new Date(activeAnnouncement.created_at).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</time></div>
                            {activeAnnouncement.title && <h2 className="mt-2 text-base font-black text-white">{activeAnnouncement.title}</h2>}<p className="mt-1 whitespace-pre-line text-sm font-medium leading-6 text-gray-100">{activeAnnouncement.message}</p>
                        </motion.article>
                    </AnimatePresence>
                    {visibleAnnouncements.length > 1 && <div className="flex items-center gap-1.5 px-5 pb-4" aria-label="Announcement position">{visibleAnnouncements.map((announcement, index) => <button key={announcement.id} type="button" aria-label={`Show announcement ${index + 1}`} aria-current={index === activeAnnouncementIndex ? 'true' : undefined} onClick={() => setActiveAnnouncementIndex(index)} className={`h-1.5 rounded-full transition-all ${index === activeAnnouncementIndex ? 'w-6 bg-pink-300' : 'w-1.5 bg-white/25 hover:bg-white/50'}`} />)}</div>}
                </motion.section>}

                {loading && <div className="flex justify-center py-20"><Loader2 className="animate-spin text-padel-green" /></div>}
                {!loading && draws.length === 0 && <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-10 text-center text-gray-400">{preview ? 'No private draft is available to your account.' : 'No published draws are available yet.'}</div>}
                {!loading && selectedDrawId && <>
                    <motion.section {...reveal(0.04)} id="live-match-centre" className="mb-10 scroll-mt-24">
                        <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-pink-300">Live match centre</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">On court and coming up</h2><p className="mt-1 max-w-2xl text-sm text-gray-400">Scores update automatically as the draw team records results.</p></div>{!preview && <button type="button" onClick={shareDraw} className="inline-flex min-h-10 w-fit items-center gap-2 rounded-xl border border-pink-300/35 bg-pink-400/10 px-3 py-2 text-xs font-black text-pink-100 transition-transform transition-colors hover:border-pink-300 hover:text-white active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><Share2 size={14} /> Share this division</button>}</div>
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(300px,0.8fr)]">
                            <article className={`overflow-hidden rounded-2xl border shadow-xl shadow-black/20 ${currentLiveMatch ? 'border-pink-400/55 bg-gradient-to-br from-pink-400/15 to-[#0a1426]' : 'border-white/10 bg-[#08101f]'}`}>
                                <header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><p className="flex items-center gap-2 font-bold text-white"><Radio size={16} className={currentLiveMatch ? 'animate-pulse text-pink-300 motion-reduce:animate-none' : 'text-gray-500'} /> {currentLiveMatch ? `${liveMatches.length} ${liveMatches.length === 1 ? 'match' : 'matches'} live now` : 'No match live right now'}</p><p className="mt-1 text-xs text-gray-400">{currentLiveMatch ? 'Follow every active court as scores are updated.' : 'The next live score will appear here.'}</p></div>{currentLiveMatch && <span className="rounded-full bg-pink-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black">Live</span>}</header>
                                {currentLiveMatch ? <div className="grid gap-3 p-4 sm:grid-cols-2">{liveMatches.map(renderLiveMatch)}</div> : <div className="p-5 text-sm text-gray-400">When a match is marked live, this panel shows the competing teams, profile photos and each set score.</div>}
                            </article>
                            <article className="overflow-hidden rounded-2xl border border-padel-green/25 bg-[#08101f] shadow-xl shadow-black/20"><header className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-4"><div><p className="flex items-center gap-2 font-bold text-white"><Clock3 size={16} className="text-padel-green" /> Up next</p><p className="mt-1 text-xs text-gray-400">The next playable match in this division.</p></div></header>{upcomingMatch ? <div className="p-5"><p className="text-[10px] font-black uppercase tracking-[0.16em] text-padel-green">{roundLabelForMatch(upcomingMatch)} · Match {upcomingMatch.bracket_position}</p><div className="mt-4 space-y-3"><div className="space-y-2">{teamPlayers(upcomingMatch.entry_one_id).map((player) => renderPlayerLine(player, 'text-sm font-bold text-white'))}</div><div className="flex items-center gap-3 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500"><span className="h-px flex-1 bg-white/10" />vs<span className="h-px flex-1 bg-white/10" /></div><div className="space-y-2">{teamPlayers(upcomingMatch.entry_two_id).map((player) => renderPlayerLine(player, 'text-sm font-bold text-white'))}</div></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-4"><span className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400"><CalendarDays size={13} className="text-padel-green" />{upcomingMatch.scheduled_start ? new Date(upcomingMatch.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Ready to play'}</span><Link to={matchHref(upcomingMatch)} className="text-xs font-black text-padel-green transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">View match →</Link></div></div> : <div className="p-5 text-sm text-gray-400">All currently generated matches have been completed.</div>}</article>
                        </div>
                    </motion.section>
                    {selectedMatch && <section id="match-centre" className="mb-10 scroll-mt-24 overflow-hidden rounded-[1.5rem] border border-pink-400/35 bg-gradient-to-br from-[#151129] via-[#0c1628] to-[#08101f] shadow-2xl shadow-black/30"><div className="flex flex-col gap-4 border-b border-white/10 px-5 py-5 sm:flex-row sm:items-start sm:justify-between sm:px-7"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-pink-300">Match centre</p><h2 className="mt-1 text-2xl font-black text-white">{roundLabelForMatch(selectedMatch)} · Match {selectedMatch.bracket_position}</h2><p className="mt-1 text-sm text-gray-400">Follow the score, seeds and route through the draw.</p></div><div className="flex items-center gap-2"><button type="button" onClick={shareDraw} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-xs font-black text-white transition-transform transition-colors hover:border-pink-300/60 hover:text-pink-100 active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><Share2 size={14} /> Share match</button><Link to={drawUrl(selectedDrawId)} className="inline-flex min-h-10 items-center rounded-xl border border-white/15 px-3 py-2 text-xs font-black text-gray-300 transition-colors hover:border-white/40 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Close</Link></div></div><div className="grid gap-5 p-5 lg:grid-cols-[minmax(0,1fr)_220px_minmax(0,1fr)] lg:items-center lg:p-7"><div className={`rounded-2xl border p-4 ${selectedMatch.winner_entry_id === selectedMatch.entry_one_id ? 'border-padel-green/40 bg-padel-green/10' : 'border-white/10 bg-black/15'}`}><p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Team one</p><div className="space-y-3">{teamPlayers(selectedMatch.entry_one_id).map((player) => renderPlayerLine(player, 'text-base font-bold text-white'))}</div>{entryById.get(selectedMatch.entry_one_id)?.seed_number && <p className="mt-4 text-xs font-black text-amber-300">Seed #{entryById.get(selectedMatch.entry_one_id).seed_number}</p>}</div><div className="text-center"><span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[10px] font-black uppercase tracking-wide ${selectedMatch.status === 'in_progress' ? 'bg-pink-400 text-black' : selectedMatch.status === 'completed' ? 'bg-padel-green text-black' : 'bg-white/10 text-gray-300'}`}>{selectedMatch.status === 'in_progress' && <Radio size={11} className="animate-pulse motion-reduce:animate-none" />}{selectedMatch.status === 'in_progress' ? 'Live' : matchBadge(selectedMatch)}</span><p className="my-4 text-xs font-black uppercase tracking-[0.16em] text-gray-500">vs</p><div className="flex flex-wrap justify-center gap-2">{setsForMatch(selectedMatch.id).length > 0 ? setsForMatch(selectedMatch.id).map((set) => <span key={set.id} className="rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm font-black tabular-nums text-white">{set.entry_one_games}–{set.entry_two_games}</span>) : <span className="text-sm font-semibold text-gray-400">{resultLabel(selectedMatch)}</span>}</div><p className="mt-4 text-xs text-gray-400">{selectedMatch.scheduled_start ? new Date(selectedMatch.scheduled_start).toLocaleString('en-ZA', { weekday: 'long', hour: '2-digit', minute: '2-digit' }) : 'Court and time to be confirmed'}</p></div><div className={`rounded-2xl border p-4 ${selectedMatch.winner_entry_id === selectedMatch.entry_two_id ? 'border-padel-green/40 bg-padel-green/10' : 'border-white/10 bg-black/15'}`}><p className="mb-3 text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Team two</p><div className="space-y-3">{teamPlayers(selectedMatch.entry_two_id).map((player) => renderPlayerLine(player, 'text-base font-bold text-white'))}</div>{entryById.get(selectedMatch.entry_two_id)?.seed_number && <p className="mt-4 text-xs font-black text-amber-300">Seed #{entryById.get(selectedMatch.entry_two_id).seed_number}</p>}</div></div><footer className="border-t border-white/10 px-5 py-4 text-sm text-gray-400 sm:px-7"><span className="font-bold text-white">Draw route: </span>{selectedMatch.winner_to_match_id ? 'The winner advances to the next scheduled bracket slot.' : selectedMatch.status === 'completed' ? 'This match is at the end of its current route.' : 'The result will determine the next step in the draw.'}</footer></section>}
                    <section id="schedule" className="mb-10 scroll-mt-24">
                        <div className="mb-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-sky-300">Court schedule</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Where to watch next</h2><p className="mt-1 text-sm text-gray-400">Matches appear by court once they have been scheduled.</p></div>
                        {matchesByCourt.size > 0 ? <div className="grid gap-4 lg:grid-cols-2">{[...matchesByCourt.entries()].map(([court, courtMatches]) => <article key={court} className="overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-xl shadow-black/20"><header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="font-bold text-white">{court}</p><p className="mt-1 text-xs text-gray-500">{courtMatches.length} {courtMatches.length === 1 ? 'match' : 'matches'} assigned to this court</p></div><CalendarDays size={17} className="text-sky-300" /></header><div className="divide-y divide-white/10">{courtMatches.map((match) => <Link key={match.id} to={matchHref(match)} className="flex items-center justify-between gap-4 px-5 py-3 transition-colors hover:bg-white/[0.04] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-padel-green"><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wide text-sky-200">{match.scheduled_start ? new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : 'Time to be confirmed'}</p><p className="mt-1 truncate text-sm font-semibold text-white">{teamName(match.entry_one_id)} <span className="text-gray-500">vs</span> {teamName(match.entry_two_id)}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-wide ${match.status === 'in_progress' ? 'bg-pink-400 text-black' : 'bg-padel-green/10 text-padel-green'}`}>{match.status === 'in_progress' ? 'Live' : 'Next'}</span></Link>)}</div></article>)}</div> : <div className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] p-6 text-sm text-gray-400">No courts have been assigned yet. Check the live centre for the next match ready to play.</div>}
                    </section>
                    <section id="overview" className="mb-10 scroll-mt-24">
                        <div className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-padel-green">Tournament centre</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Everything happening now</h2></div>{(eventDate || event.venue || event.city) && <p className="inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400"><MapPin size={14} className="text-padel-green" /> {[eventDate, event.venue || event.city].filter(Boolean).join(' · ')}</p>}</div>
                        {featuredMatches.length > 0 && <div className="mb-6"><div className="mb-4 flex items-end justify-between gap-4"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-pink-300">Featured matches</p><h3 className="mt-1 text-xl font-black text-white">Don’t miss these next</h3></div><a href="#matches" className="shrink-0 text-xs font-bold text-padel-green transition-colors hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">All matches →</a></div><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{featuredMatches.map(renderFeaturedMatch)}</div></div>}
                        <div className="grid gap-4 lg:grid-cols-[minmax(0,1.35fr)_minmax(260px,0.65fr)]">
                            <article className="overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-xl shadow-black/20"><header className="flex items-center justify-between border-b border-white/10 px-5 py-4"><div><p className="flex items-center gap-2 font-bold text-white"><Activity size={16} className="text-sky-300" /> Latest results</p><p className="mt-1 text-xs text-gray-500">The most recently completed matches in this division.</p></div>{latestResults.length > 0 && <span className="rounded-full bg-sky-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-200">Live feed</span>}</header><div className="divide-y divide-white/10">{latestResults.length > 0 ? latestResults.map((match) => { const summary = resultSummary(match); return <div key={match.id} className="grid gap-2 px-5 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-4"><div className="min-w-0"><div className="flex items-center gap-2"><div className="flex items-center gap-1.5 min-w-0">{renderTeamProfileStack(match.entry_one_id)}<span className="truncate text-sm font-bold text-white">{teamName(match.entry_one_id)}</span></div><span className="text-xs font-black text-gray-600">vs</span><div className="flex min-w-0 items-center gap-1.5">{renderTeamProfileStack(match.entry_two_id)}<span className="truncate text-sm font-bold text-white">{teamName(match.entry_two_id)}</span></div></div><p className="mt-1 truncate text-xs text-gray-500">{summary.secondary}</p></div><div className="flex items-center gap-3 sm:text-right"><span className="text-[10px] font-black uppercase tracking-wide text-gray-500">{roundLabelForMatch(match)}</span><span className="shrink-0 text-sm font-black text-white">{scoreLine(match) || resultLabel(match)}</span></div></div>; }) : <p className="px-5 py-8 text-sm text-gray-400">Results will appear here once the first match is completed.</p>}</div></article>
                            <article className="overflow-hidden rounded-2xl border border-amber-300/20 bg-gradient-to-br from-[#17160e] to-[#0b101b] shadow-xl shadow-black/20"><header className="border-b border-white/10 px-5 py-4"><p className="flex items-center gap-2 font-bold text-white"><Trophy size={16} className="text-amber-300" /> Top seeds</p><p className="mt-1 text-xs text-gray-500">Combined player-ranking points determine the original seeding.</p></header><ol className="divide-y divide-white/10">{topSeeds.length > 0 ? topSeeds.map((entry) => <li key={entry.id} className="flex items-center gap-3 px-5 py-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-300/15 text-xs font-black text-amber-200">{entry.seed_number}</span>{renderTeamProfileStack(entry.id)}<span className="min-w-0 truncate text-sm font-semibold text-white">{entry.team_name}</span></li>) : <li className="px-5 py-8 text-sm text-gray-400">Seeds are not available for this division.</li>}</ol></article>
                        </div>
                        {scheduledMatches.length > 0 && <article className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"><div className="mb-4 flex items-center gap-2"><CalendarDays size={16} className="text-padel-green" /><div><p className="font-bold text-white">Round schedule</p><p className="text-xs text-gray-500">Next scheduled matches</p></div></div><div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">{scheduledMatches.map((match) => <div key={match.id} className="rounded-xl border border-white/10 bg-[#0a1120] p-3"><p className="text-[10px] font-black uppercase tracking-wide text-padel-green">{new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}</p><p className="mt-2 truncate text-xs font-bold text-white">{entryById.get(match.entry_one_id)?.team_name || 'TBD'} <span className="text-gray-500">vs</span> {entryById.get(match.entry_two_id)?.team_name || 'TBD'}</p><p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">{roundLabelForMatch(match)}</p></div>)}</div></article>}
                    </section>
                    {rounds.length > 0 && <section id="matches" className="mb-10 scroll-mt-24"><div className="mb-5 rounded-2xl border border-white/10 bg-gradient-to-r from-[#111b31] to-[#0b1220] p-5"><p className="text-xs font-black uppercase tracking-[0.18em] text-padel-green">Matches by round</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">Every result, clearly scored</h2><p className="mt-1 max-w-2xl text-sm text-gray-400">Open a round to scan every fixture, including seeds, live status and individual set scores.</p><nav aria-label="Match rounds" className="mt-5 flex gap-2 overflow-x-auto pb-1">{rounds.map((round) => <a key={round.number} href={`#matches-round-${round.number}`} className="shrink-0 rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs font-black text-gray-300 transition-colors hover:border-padel-green/40 hover:text-padel-green focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">{round.label}</a>)}</nav></div><div className="space-y-4">{rounds.map((round, index) => <details key={round.number} id={`matches-round-${round.number}`} open={index === 0} className="group scroll-mt-24 overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-xl shadow-black/20"><summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-white marker:content-none"><span><span className="block text-xs font-black uppercase tracking-[0.18em] text-padel-green">{round.label}</span><span className="mt-1 block text-sm text-gray-400">{round.matches.length} {round.matches.length === 1 ? 'match' : 'matches'}</span></span><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-gray-300 transition-transform duration-200 group-open:rotate-180">⌄</span></summary><div className="grid gap-4 border-t border-white/10 p-4 md:grid-cols-2 xl:grid-cols-3">{round.matches.map(renderRoundMatchCard)}</div></details>)}</div></section>}
                    {groups.length > 0 && <section id="live-draw" className="mb-10 scroll-mt-24">
                        <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-[#111b31] to-[#0b1220] p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-padel-green">Group stage</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">The race to qualify</h2><p className="mt-1 max-w-2xl text-sm text-gray-400">The table updates as results are recorded. Group leaders glow green; tied positions are flagged for review.</p></div><div className="inline-flex w-fit items-center gap-2 rounded-full border border-sky-300/25 bg-sky-300/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-sky-200"><Radio size={13} className="animate-pulse motion-reduce:animate-none" /> Live standings</div></div>
                        <div className="grid gap-4 lg:grid-cols-2">
                            {groups.map((group) => {
                                const groupStandings = standingsForGroup(group.id);
                                const hasResults = groupStandings.some((row) => row.played > 0);
                                const fixtures = groupMatchesById[group.id] || [];
                                return <article key={group.id} className="overflow-hidden rounded-2xl border border-white/10 bg-[#08101f] shadow-xl shadow-black/20 transition-transform duration-200 hover:-translate-y-0.5">
                                    <header className="flex items-start justify-between gap-3 border-b border-white/10 bg-white/[0.02] px-5 py-4"><div><h3 className="font-bold text-white">{group.name}</h3><p className="mt-1 text-xs text-gray-500">{fixtures.length} round-robin fixtures</p></div>{hasResults && groupStandings[0] && <span className="rounded-full border border-padel-green/40 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">Leader</span>}</header>
                                    <div className="overflow-x-auto px-4 py-3"><table className="w-full min-w-[360px] text-left text-xs"><thead className="border-b border-white/10 text-gray-500"><tr><th className="pb-2">#</th><th className="pb-2">Team</th><th className="pb-2 text-center">P</th><th className="pb-2 text-center">W</th><th className="pb-2 text-center">+/-</th><th className="pb-2 text-right">Pts</th></tr></thead><tbody>{groupStandings.map((row) => { const isLeader = hasResults && row.position === 1 && !row.requires_manual_resolution; return <tr key={row.entry_id} className={row.requires_manual_resolution ? 'bg-amber-300/5 text-amber-200' : isLeader ? 'bg-padel-green/10 text-white' : 'text-gray-300'}><td className="py-2.5"><span className={`inline-flex min-w-6 justify-center rounded-full px-1.5 py-1 font-black ${isLeader ? 'bg-padel-green text-black' : 'text-gray-400'}`}>{row.position}</span></td><td className="py-2.5 pr-2 font-medium">{entryById.get(row.entry_id)?.team_name || 'Team'}{isLeader && <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-padel-green">Leading</span>}{row.requires_manual_resolution && <span className="ml-2 text-[10px] font-black uppercase tracking-wide text-amber-300">Tie</span>}</td><td className="py-2.5 text-center tabular-nums">{row.played}</td><td className="py-2.5 text-center tabular-nums">{row.won}</td><td className="py-2.5 text-center tabular-nums">{row.games_for - row.games_against}</td><td className="py-2.5 text-right font-bold tabular-nums">{row.standings_points}</td></tr>; })}</tbody></table></div>
                                    <details className="group border-t border-white/10"><summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 marker:content-none"><span><span className="block text-[10px] font-black uppercase tracking-[0.16em] text-gray-500">Fixtures</span><span className="mt-1 block text-xs text-gray-400">{fixtures.length} {fixtures.length === 1 ? 'fixture' : 'fixtures'} · view all group matches</span></span><span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-bold text-gray-300 transition-transform duration-200 group-open:rotate-180">⌄</span></summary><div className="space-y-2 border-t border-white/10 px-5 py-4">{fixtures.map((match) => <div key={match.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/[0.03] px-3 py-2 text-xs"><span className="min-w-0 truncate text-gray-300">{entryById.get(match.entry_one_id)?.team_name || 'TBD'} <span className="text-gray-600">vs</span> {entryById.get(match.entry_two_id)?.team_name || 'TBD'}</span><span className="shrink-0 font-bold text-white">{scoreLine(match) || resultLabel(match)}</span></div>)}</div></details>
                                </article>;
                            })}
                        </div>
                    </section>}
                    {rounds.length > 0 && <section id="bracket" className="scroll-mt-24">
                    <div className="mb-5 flex flex-col gap-4 rounded-2xl border border-white/10 bg-gradient-to-r from-[#101b31] to-[#0b1220] p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-padel-green">{groups.length ? 'Elimination stage' : 'Tournament bracket'}</p><h2 className="mt-1 text-2xl font-black text-white sm:text-3xl">{groups.length ? 'The knockout road' : 'Every match. One champion.'}</h2><p className="mt-1 max-w-2xl text-sm text-gray-400">Follow winners as they advance through the bracket to the final.</p></div><div className="inline-flex w-fit items-center gap-2 rounded-full border border-padel-green/30 bg-padel-green/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-wide text-padel-green"><Brackets size={13} /> {rounds.length} rounds</div></div>
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
                    </section>}
                    {placementMatches.length > 0 && <section className="mt-6 overflow-hidden rounded-2xl border border-amber-300/25 bg-gradient-to-r from-amber-300/[0.06] to-[#08101f]">
                        <header className="flex flex-col gap-2 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-xs font-black uppercase tracking-[0.18em] text-amber-200">Top 4 playoff</p><h2 className="mt-1 text-xl font-black text-white">Third place on the line</h2></div><p className="text-xs text-gray-400">The semifinal losers meet to decide third and fourth.</p></header>
                        <div className="grid gap-4 p-4 md:grid-cols-2 xl:grid-cols-3">{placementMatches.map(renderRoundMatchCard)}</div>
                    </section>}
                </>}
            </div>
            <AnimatePresence initial={false}>
                {selectedPlayer && <PlayerModal player={selectedPlayer} onClose={() => setSelectedPlayer(null)} />}
            </AnimatePresence>
        </main>
    );
};

export default NativeTournamentDraw;
