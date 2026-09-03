import React, { useEffect, useMemo, useState } from 'react';
import { Award, Brackets, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, Megaphone, Radio, RefreshCcw, Save, Send, Star, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { generateGroupStageDraft, generateKnockoutDraft, nextPowerOfTwo } from '../../utils/nativeDrawGenerator';
import { areGroupMatchesComplete, calculateGroupStandings } from '../../utils/nativeDrawStandings';
import { deriveKnockoutPlacementProposals } from '../../utils/nativeDrawPlacements';
import { listRankingCategories, listRankingOrganisations, resolvePlayerRanking } from '../../utils/playerRankingSelection';
import { extractRankedinId } from '../../utils/rankedinLink';
import { useRankedin } from '../../hooks/useRankedin';
import DrawBracketPreview from './DrawBracketPreview';

const isEligible = (registration) => (
    String(registration?.status || '').toLowerCase() !== 'withdrawn'
    && String(registration?.payment_status || '').toLowerCase() === 'paid'
);

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

const toLocalDateTimeInput = (value) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    const offset = date.getTimezoneOffset() * 60_000;
    return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};

// A pair can be represented by reciprocal registration rows: A names B as a
// partner and B names A. Draw generation must treat those as one team.
const dedupePairRegistrations = (registrations) => {
    const teams = new Map();
    registrations.forEach((registration) => {
        const playerEmail = normaliseEmail(registration.email);
        const partnerEmail = normaliseEmail(registration.partner_email);
        const pairEmails = [playerEmail, partnerEmail].filter(Boolean).sort();
        const key = pairEmails.length === 2
            ? `pair:${pairEmails.join(':')}`
            : `single:${registration.id}`;
        const existing = teams.get(key);
        // Prefer the row with complete partner information, otherwise retain a
        // stable oldest record so the preview does not reshuffle on refresh.
        const existingScore = Number(Boolean(existing?.partner_name)) + Number(Boolean(existing?.partner_email));
        const candidateScore = Number(Boolean(registration.partner_name)) + Number(Boolean(registration.partner_email));
        if (!existing || candidateScore > existingScore || (
            candidateScore === existingScore
            && String(registration.created_at || '') < String(existing.created_at || '')
        )) {
            teams.set(key, registration);
        }
    });
    return [...teams.values()];
};

const rankedInPairKey = (...players) => players
    .map((player) => String(player?.rankedin_id || '').trim())
    .filter(Boolean)
    .sort()
    .join(':');

const registrationToEntry = (registration, index, playersByEmail, rankingSource, rankedInClassSeedings) => {
    const playerOne = registration.full_name || registration.email || `Entry ${index + 1}`;
    const playerTwo = registration.partner_name || null;
    const playerOneProfile = playersByEmail.get(normaliseEmail(registration.email));
    const playerTwoProfile = playersByEmail.get(normaliseEmail(registration.partner_email));
    const playerOneRanking = resolvePlayerRanking(playerOneProfile, rankingSource);
    const playerTwoRanking = resolvePlayerRanking(playerTwoProfile, rankingSource);
    const linkedClassRanking = rankingSource === 'rankedin_class'
        ? rankedInClassSeedings.get(rankedInPairKey(playerOneProfile, playerTwoProfile))
        : null;
    const linkedClassPoints = linkedClassRanking?.ranking === '' || linkedClassRanking?.ranking == null
        ? null
        : Number(linkedClassRanking.ranking);
    const useLinkedClassPoints = Number.isFinite(linkedClassPoints);
    const seedingValue = useLinkedClassPoints
        ? linkedClassPoints
        : playerOneRanking.points + playerTwoRanking.points;
    return {
        source_registration_id: registration.id,
        player_one_id: playerOneProfile?.id || null,
        player_two_id: playerTwoProfile?.id || null,
        team_name: playerTwo ? `${playerOne} / ${playerTwo}` : playerOne,
        player_one_name: playerOne,
        player_two_name: playerTwo,
        seed_number: null,
        seeding_value: seedingValue,
        snapshot: {
            registration_email: registration.email || null,
            partner_email: registration.partner_email || null,
            payment_status: registration.payment_status || null,
            ranking_source: rankingSource,
            player_one_points: playerOneRanking.points,
            player_two_points: playerTwoRanking.points,
            player_one_ranking: playerOneRanking,
            player_two_ranking: playerTwoRanking,
            rankedin_class_ranking: linkedClassRanking || null,
            seeding_label: useLinkedClassPoints ? 'Linked RankedIn class snapshot' : `${playerOneRanking.label}${playerTwo ? ` + ${playerTwoRanking.label}` : ''}`,
            seeding_fallback: rankingSource === 'rankedin_class' && !useLinkedClassPoints,
            player_one_image_url: playerOneProfile?.image_url || null,
            player_two_image_url: playerTwoProfile?.image_url || null,
            pair_seeding_points: seedingValue,
        },
    };
};

const NativeDrawManager = ({ event, divisions, registrations, playersByEmail, onSaved, onDivisionRankingSourceChange }) => {
    const { getTournamentParticipants } = useRankedin();
    const [divisionId, setDivisionId] = useState('');
    const [draft, setDraft] = useState(null);
    const [savedDraw, setSavedDraw] = useState(null);
    const [loadingSaved, setLoadingSaved] = useState(false);
    const [recordingMatchId, setRecordingMatchId] = useState(null);
    const [recordingWinnerId, setRecordingWinnerId] = useState('');
    const [recordingResultType, setRecordingResultType] = useState('played');
    const [recordingSets, setRecordingSets] = useState([['', ''], ['', '']]);
    const [matchSets, setMatchSets] = useState([]);
    const [savedGroups, setSavedGroups] = useState([]);
    const [standings, setStandings] = useState([]);
    const [showDrawSetup, setShowDrawSetup] = useState(true);
    const [showDrawConfiguration, setShowDrawConfiguration] = useState(true);
    const [drawFormat, setDrawFormat] = useState('knockout');
    const [groupCount, setGroupCount] = useState('4');
    const [advancersPerGroup, setAdvancersPerGroup] = useState('2');
    const [plateMode, setPlateMode] = useState('none');
    const [playoffMode, setPlayoffMode] = useState('none');
    const [seedingTemplate, setSeedingTemplate] = useState('100');
    const [rankingSource, setRankingSource] = useState('active');
    const [rankedInClassSeedings, setRankedInClassSeedings] = useState(new Map());
    const [rankedInClassSeedingsLoading, setRankedInClassSeedingsLoading] = useState(false);
    const [silverPlate, setSilverPlate] = useState(null);
    const [bronzePlate, setBronzePlate] = useState(null);
    const [activeDrawKind, setActiveDrawKind] = useState('main');
    const [availableDraws, setAvailableDraws] = useState([]);
    const [saving, setSaving] = useState(false);
    const [drawReloadKey, setDrawReloadKey] = useState(0);
    const [rankingTier, setRankingTier] = useState(null);
    const [rankingPointsTable, setRankingPointsTable] = useState([]);
    const [rankingPointsLoading, setRankingPointsLoading] = useState(false);
    const [rankingAwards, setRankingAwards] = useState([]);
    const [rankingAwardsLoading, setRankingAwardsLoading] = useState(false);
    const [placementOverrides, setPlacementOverrides] = useState({});
    const [awardConfirmed, setAwardConfirmed] = useState(false);
    const [editingMatchId, setEditingMatchId] = useState(null);
    const [matchOperations, setMatchOperations] = useState({});
    const [announcements, setAnnouncements] = useState([]);
    const [announcementRefreshKey, setAnnouncementRefreshKey] = useState(0);
    const [announcementForm, setAnnouncementForm] = useState({ title: '', message: '', scope: 'division', isPinned: false });
    const [showPublicControls, setShowPublicControls] = useState(true);
    const [showAutoSchedule, setShowAutoSchedule] = useState(false);
    const [autoScheduling, setAutoScheduling] = useState(false);
    const [scheduleDefaults, setScheduleDefaults] = useState(() => ({
        date: String(event?.start_date || '').slice(0, 10),
        startTime: String(event?.start_time || '17:00').slice(0, 5),
        matchMinutes: '60',
        breakMinutes: '10',
    }));

    const division = divisions.find((item) => item.id === divisionId);

    const selectRankingSource = async (source) => {
        const previousSource = rankingSource;
        setRankingSource(source);
        setDraft(null);
        if (!division?.id || source === previousSource) return;

        onDivisionRankingSourceChange?.(division.id, source);
        const { error } = await supabase
            .from('tournament_divisions')
            .update({ seeding_ranking_source: source })
            .eq('id', division.id);
        if (error) {
            setRankingSource(previousSource);
            onDivisionRankingSourceChange?.(division.id, previousSource);
            toast.error('Could not save the division ranking source. Apply the latest database migration, then try again.');
        }
    };
    const availableCourts = useMemo(() => {
        const courtCount = Number(event?.courts_count);
        return Number.isInteger(courtCount) && courtCount > 0
            ? Array.from({ length: courtCount }, (_, index) => `Court ${index + 1}`)
            : [];
    }, [event?.courts_count]);
    const eligibleRegistrations = useMemo(() => registrations.filter((registration) => (
        registration.division_id === divisionId && isEligible(registration)
    )), [registrations, divisionId]);
    const teams = useMemo(() => dedupePairRegistrations(eligibleRegistrations), [eligibleRegistrations]);
    const participatingPlayers = useMemo(() => teams.flatMap((registration) => [
        playersByEmail.get(normaliseEmail(registration.email)),
        playersByEmail.get(normaliseEmail(registration.partner_email)),
    ]).filter(Boolean), [teams, playersByEmail]);
    const rankingOrganisations = useMemo(() => listRankingOrganisations(participatingPlayers), [participatingPlayers]);
    const rankingCategories = useMemo(() => listRankingCategories(participatingPlayers), [participatingPlayers]);
    const entries = useMemo(() => teams.map((registration, index) => (
        registrationToEntry(registration, index, playersByEmail, rankingSource, rankedInClassSeedings)
    )), [teams, playersByEmail, rankingSource, rankedInClassSeedings]);
    const selectedGroupCount = Math.max(1, Number(groupCount) || 1);
    const smallestGroupSize = selectedGroupCount > 0 ? Math.floor(entries.length / selectedGroupCount) : 0;
    const groupCountOptions = Array.from({ length: Math.max(1, Math.min(8, entries.length)) }, (_, index) => index + 1);
    const advancerOptions = Array.from({ length: Math.max(0, smallestGroupSize) }, (_, index) => index + 1)
        .filter((count) => selectedGroupCount > 1 || count >= 2);
    const linkedRankedinTournamentId = extractRankedinId(event?.rankedin_id) || extractRankedinId(event?.rankedin_url);
    const hasLinkedRankedinClass = Boolean(linkedRankedinTournamentId && division?.rankedin_class_id);
    const linkedSeedFallbackCount = useMemo(() => entries.filter((entry) => entry.snapshot?.seeding_fallback).length, [entries]);

    useEffect(() => {
        let active = true;
        if (!hasLinkedRankedinClass || rankingSource !== 'rankedin_class') {
            setRankedInClassSeedings(new Map());
            return () => { active = false; };
        }

        setRankedInClassSeedingsLoading(true);
        getTournamentParticipants(linkedRankedinTournamentId, division.rankedin_class_id, true)
            .then((rows) => {
                if (!active) return;
                const next = new Map();
                (rows || []).forEach((row) => {
                    const participant = row?.Participant || row;
                    const key = [participant?.FirstPlayer?.RankedinId, participant?.SecondPlayer?.RankedinId]
                        .map((value) => String(value || '').trim())
                        .filter(Boolean)
                        .sort()
                        .join(':');
                    if (key) next.set(key, {
                        ranking: row?.Ranking ?? participant?.Ranking ?? null,
                        seed: participant?.Seed ?? null,
                        tournament_player_id: participant?.TournamentPlayerId ?? null,
                    });
                });
                setRankedInClassSeedings(next);
            })
            .catch((error) => {
                console.error('Failed to load linked RankedIn class seedings', error);
                if (active) setRankedInClassSeedings(new Map());
            })
            .finally(() => {
                if (active) setRankedInClassSeedingsLoading(false);
            });
        return () => { active = false; };
    }, [division?.rankedin_class_id, getTournamentParticipants, hasLinkedRankedinClass, linkedRankedinTournamentId, rankingSource]);

    useEffect(() => {
        setScheduleDefaults((current) => ({
            ...current,
            date: current.date || String(event?.start_date || '').slice(0, 10),
            startTime: current.startTime || String(event?.start_time || '17:00').slice(0, 5),
        }));
    }, [event?.start_date, event?.start_time]);

    useEffect(() => {
        let active = true;
        const loadAnnouncements = async () => {
            const { data, error } = await supabase
                .from('native_draw_announcements')
                .select('id, division_id, draw_id, title, message, is_pinned, is_active, created_at, updated_at')
                .eq('event_id', event.id)
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
    }, [event.id, announcementRefreshKey]);

    useEffect(() => {
        let active = true;
        const loadRankingConfiguration = async () => {
            if (!division?.ranking_tier_id || !division?.ranking_category) {
                if (active) { setRankingTier(null); setRankingPointsTable([]); }
                return;
            }
            setRankingPointsLoading(true);
            try {
                const [{ data: tier, error: tierError }, { data: points, error: pointsError }] = await Promise.all([
                    supabase.from('ranking_tiers').select('id, code, name').eq('id', division.ranking_tier_id).maybeSingle(),
                    supabase.from('ranking_points_table').select('id, round_code, round_label, points, display_order').eq('tier_id', division.ranking_tier_id).eq('category', Number(division.ranking_category)).order('display_order'),
                ]);
                if (tierError) throw tierError;
                if (pointsError) throw pointsError;
                if (active) { setRankingTier(tier || null); setRankingPointsTable(points || []); }
            } catch (error) {
                console.error('Failed to load ranking-points configuration', error);
                if (active) { setRankingTier(null); setRankingPointsTable([]); }
            } finally {
                if (active) setRankingPointsLoading(false);
            }
        };
        loadRankingConfiguration();
        return () => { active = false; };
    }, [division?.ranking_tier_id, division?.ranking_category]);

    const hasKnockoutStage = useMemo(() => draft?.matches?.some((match) => match.stage === 'knockout') || false, [draft?.matches]);

    const rankingReview = useMemo(() => {
        if (activeDrawKind !== 'main' || savedDraw?.status !== 'completed' || !hasKnockoutStage) return [];
        const pointsByRound = new Map(rankingPointsTable.map((item) => [item.round_code, item]));
        return deriveKnockoutPlacementProposals({ entries: draft.entries, matches: draft.matches, tierCode: rankingTier?.code })
            .map((proposal) => {
                const selectedRoundCode = placementOverrides[proposal.entry_id] || proposal.roundCode || '';
                return { ...proposal, selectedRoundCode, pointsRule: selectedRoundCode ? pointsByRound.get(selectedRoundCode) || null : null };
            });
    }, [activeDrawKind, savedDraw?.status, draft, hasKnockoutStage, rankingPointsTable, rankingTier?.code, placementOverrides]);

    const rankingAwardsByPlayerId = useMemo(() => new Map(rankingAwards.map((award) => [String(award.player_id), award])), [rankingAwards]);
    const unpricedRankingReview = useMemo(() => rankingReview.filter((proposal) => !proposal.pointsRule || !proposal.selectedRoundCode), [rankingReview]);
    const missingPlayerProfiles = useMemo(() => rankingReview.flatMap((proposal) => [
        proposal.entry.player_one_name && !proposal.entry.player_one_id ? proposal.entry.player_one_name : null,
        proposal.entry.player_two_name && !proposal.entry.player_two_id ? proposal.entry.player_two_name : null,
    ].filter(Boolean)), [rankingReview]);
    const awardablePlayerRows = useMemo(() => rankingReview.flatMap((proposal) => {
        if (!proposal.pointsRule || !proposal.selectedRoundCode) return [];
        return [
            { id: proposal.entry.player_one_id, name: proposal.entry.player_one_name },
            { id: proposal.entry.player_two_id, name: proposal.entry.player_two_name },
        ].filter((player) => player.id).map((player) => ({ ...player, proposal }));
    }), [rankingReview]);
    const pendingAwardablePlayerRows = useMemo(() => awardablePlayerRows.filter((player) => !rankingAwardsByPlayerId.has(String(player.id))), [awardablePlayerRows, rankingAwardsByPlayerId]);

    useEffect(() => {
        let active = true;
        const loadRankingAwards = async () => {
            if (!event?.id || !divisionId) {
                if (active) setRankingAwards([]);
                return;
            }
            setRankingAwardsLoading(true);
            try {
                const { data, error } = await supabase
                    .from('player_ranking_points')
                    .select('id, player_id, round_code, points, date_awarded, config_snapshot, created_at')
                    .eq('event_id', event.id)
                    .eq('division_id', divisionId);
                if (error) throw error;
                if (active) setRankingAwards(data || []);
            } catch (error) {
                console.error('Failed to load native ranking awards', error);
                if (active) setRankingAwards([]);
            } finally {
                if (active) setRankingAwardsLoading(false);
            }
        };
        loadRankingAwards();
        return () => { active = false; };
    }, [event?.id, divisionId, drawReloadKey]);

    useEffect(() => {
        let active = true;
        if (!divisionId) {
            setSavedDraw(null);
            setSilverPlate(null);
            setBronzePlate(null);
            setAvailableDraws([]);
            return () => { active = false; };
        }
        const loadSavedDraft = async () => {
            setLoadingSaved(true);
            try {
                const { data: divisionDraws, error: drawError } = await supabase
                    .from('draws')
                    .select('id, draw_kind, status, format, group_count, advancers_per_group, generated_at, scoring_rules, public_announcement, announcement_updated_at')
                    .eq('division_id', divisionId)
                    .order('created_at');
                if (drawError) throw drawError;
                const draw = (divisionDraws || []).find((item) => item.draw_kind === activeDrawKind);
                if (active) setAvailableDraws(divisionDraws || []);
                if (!draw) {
                    if (active) { setSavedDraw(null); setSilverPlate(null); setBronzePlate(null); setDraft(null); }
                    return;
                }
                const [{ data: savedEntries, error: entriesError }, { data: savedMatches, error: matchesError }, { data: groups }, { data: savedStandings }] = await Promise.all([
                    supabase.from('draw_entries').select('*').eq('draw_id', draw.id).order('seed_number'),
                    supabase.from('draw_matches').select('*').eq('draw_id', draw.id).order('round_number').order('bracket_position'),
                    supabase.from('draw_groups').select('*').eq('draw_id', draw.id).order('display_order'),
                    supabase.from('draw_standings').select('*').eq('draw_id', draw.id).order('group_id').order('position'),
                ]);
                if (entriesError) throw entriesError;
                if (matchesError) throw matchesError;
                if (!active) return;
                const entryById = new Map((savedEntries || []).map((entry) => [entry.id, entry]));
                const matches = (savedMatches || []).map((match) => ({
                    ...match,
                    key: match.id,
                    entry_one: entryById.get(match.entry_one_id) || null,
                    entry_two: entryById.get(match.entry_two_id) || null,
                    winner: entryById.get(match.winner_entry_id) || null,
                }));
                const matchIds = (savedMatches || []).map((match) => match.id);
                const { data: savedSets } = matchIds.length
                    ? await supabase.from('draw_match_sets').select('*').in('match_id', matchIds).order('set_number')
                    : { data: [] };
                setSavedDraw(draw);
                setSavedGroups(groups || []);
                setStandings(savedStandings || []);
                setMatchSets(savedSets || []);
                setDrawFormat(draw.format || 'knockout');
                setGroupCount(String(draw.group_count || 1));
                setAdvancersPerGroup(String(draw.advancers_per_group || 2));
                setPlateMode(draw.scoring_rules?.plate_mode || 'none');
                setPlayoffMode(draw.scoring_rules?.playoff_mode || 'none');
                setSeedingTemplate(String(draw.scoring_rules?.seeding_template_percent ?? 100));
                setRankingSource(draw.scoring_rules?.ranking_source || 'active');
                setSilverPlate((divisionDraws || []).find((item) => item.draw_kind === 'silver') || null);
                setBronzePlate((divisionDraws || []).find((item) => item.draw_kind === 'bronze') || null);
                setDraft({
                    format: draw.format || 'knockout',
                    draw_size: nextPowerOfTwo((savedEntries || []).length),
                    total_rounds: Math.max(...matches.map((match) => match.round_number), 0),
                    entries: savedEntries || [],
                    matches,
                    groups: (groups || []).map((group) => ({ ...group, key: group.id, entries: (savedEntries || []).filter((entry) => entry.group_id === group.id) })),
                });
            } catch (error) {
                console.error('Failed to load native draw draft', error);
                if (active) toast.error('Could not load the saved draw');
            } finally {
                if (active) setLoadingSaved(false);
            }
        };
        loadSavedDraft();
        return () => { active = false; };
    }, [divisionId, activeDrawKind, drawReloadKey]);

    const previewDraft = () => {
        if (!divisionId) {
            toast.error('Select a division first');
            return;
        }
        if (savedDraw?.status === 'published') {
            toast.error('A published draw cannot be regenerated. Its entries and results are now locked.');
            return;
        }
        try {
            if (drawFormat === 'knockout') {
                setDraft({ ...generateKnockoutDraft(entries, {
                    seedingMethod: 'native_ranking',
                    seededPercentage: Number(seedingTemplate),
                    placementPlayoff: playoffMode,
                }), format: 'knockout' });
            } else {
                if (Number(groupCount) > entries.length) throw new Error('There must be at least one team per group');
                if (drawFormat === 'group_knockout' && Number(advancersPerGroup) > smallestGroupSize) {
                    throw new Error(`Only ${smallestGroupSize} ${smallestGroupSize === 1 ? 'team' : 'teams'} fit in the smallest group; reduce the number advancing`);
                }
                if (drawFormat === 'group_knockout' && Number(groupCount) * Number(advancersPerGroup) < 2) {
                    throw new Error('At least two teams must advance to the elimination phase');
                }
                setDraft(generateGroupStageDraft(entries, { format: drawFormat, groupCount: Number(groupCount), seedingMethod: 'native_ranking', seededPercentage: Number(seedingTemplate) }));
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    const moveSeedTo = (fromIndex, toIndex) => {
        if (!draft) return;
        const ordered = [...draft.entries].sort((a, b) => Number(a.seed_number || 999) - Number(b.seed_number || 999));
        if (toIndex < 0 || toIndex >= ordered.length || fromIndex === toIndex) return;
        const [moved] = ordered.splice(fromIndex, 1);
        ordered.splice(toIndex, 0, moved);
        const reordered = ordered.map((entry, index) => ({ ...entry, seed_number: index + 1 }));
        if (draft.format === 'knockout') {
            setDraft({ ...generateKnockoutDraft(reordered, {
                seedingMethod: 'manual',
                seededPercentage: Number(seedingTemplate),
                placementPlayoff: playoffMode,
            }), format: 'knockout' });
            return;
        }
        setDraft(generateGroupStageDraft(reordered, {
            format: draft.format,
            groupCount: draft.groups?.length || Number(groupCount),
            seedingMethod: 'manual',
            seededPercentage: Number(seedingTemplate),
        }));
    };

    const saveDraft = async () => {
        if (!draft || !division) return;
        setSaving(true);
        try {
            const hasElimination = ['knockout', 'group_knockout'].includes(draft.format);
            const scoringRules = { sets_to_win: 2, golden_point: true, match_tiebreak: false, plate_mode: hasElimination ? plateMode : 'none', playoff_mode: hasElimination ? playoffMode : 'none', seeding_template_percent: Number(seedingTemplate), ranking_source: rankingSource };
            const { data: existing, error: existingError } = await supabase
                .from('draws')
                .select('id, status')
                .eq('division_id', division.id)
                .eq('draw_kind', 'main')
                .maybeSingle();
            if (existingError) throw existingError;
            if (existing?.status && existing.status !== 'draft') {
                toast.error('A published draw already exists for this division.');
                return;
            }

            let draw = existing;
            if (draw) {
                const { error: deleteMatchesError } = await supabase.from('draw_matches').delete().eq('draw_id', draw.id);
                if (deleteMatchesError) throw deleteMatchesError;
                const { error: deleteEntriesError } = await supabase.from('draw_entries').delete().eq('draw_id', draw.id);
                if (deleteEntriesError) throw deleteEntriesError;
                const { error: deleteGroupsError } = await supabase.from('draw_groups').delete().eq('draw_id', draw.id);
                if (deleteGroupsError) throw deleteGroupsError;
                const { error: updateError } = await supabase.from('draws').update({
                    format: draft.format || 'knockout', group_count: draft.groups?.length || null, advancers_per_group: draft.format === 'group_knockout' ? Number(advancersPerGroup) : null, seeding_method: 'native_ranking', scoring_rules: scoringRules, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
                }).eq('id', draw.id);
                if (updateError) throw updateError;
            } else {
                const { data: newDraw, error: drawError } = await supabase
                    .from('draws')
                    .insert({
                        event_id: event.id,
                        division_id: division.id,
                        draw_kind: 'main',
                    format: draft.format || 'knockout',
                    status: 'draft',
                    seeding_method: 'native_ranking',
                    scoring_rules: scoringRules,
                    group_count: draft.groups?.length || null,
                    advancers_per_group: draft.format === 'group_knockout' ? Number(advancersPerGroup) : null,
                        generated_at: new Date().toISOString(),
                    })
                    .select('id, status, format, group_count, advancers_per_group, generated_at')
                    .single();
                if (drawError) throw drawError;
                draw = newDraw;
            }

            const { data: savedGroups, error: groupsError } = draft.groups?.length ? await supabase
                .from('draw_groups')
                .insert(draft.groups.map((group) => ({ draw_id: draw.id, name: group.name, display_order: group.display_order })))
                .select('id, name') : { data: [], error: null };
            if (groupsError) throw groupsError;
            const groupIdByKey = new Map((draft.groups || []).map((group) => [
                group.key,
                (savedGroups || []).find((savedGroup) => savedGroup.name === group.name)?.id,
            ]));

            const { data: savedEntries, error: entriesError } = await supabase
                .from('draw_entries')
                .insert(draft.entries.map(({ group_key, ...entry }, index) => ({
                    ...entry,
                    draw_id: draw.id,
                    seed_number: index + 1,
                    group_id: group_key ? groupIdByKey.get(group_key) : null,
                })))
                .select('id, source_registration_id');
            if (entriesError) throw entriesError;

            if (draft.groups?.length) {
                const standingsRows = savedEntries.map((entry) => {
                    const source = draft.entries.find((item) => item.source_registration_id === entry.source_registration_id);
                    return source?.group_key ? { draw_id: draw.id, group_id: groupIdByKey.get(source.group_key), entry_id: entry.id } : null;
                }).filter(Boolean);
                const { error: standingsError } = await supabase.from('draw_standings').upsert(standingsRows, { onConflict: 'group_id,entry_id' });
                if (standingsError) throw standingsError;
                setStandings(standingsRows);
            }

            const entryIdByRegistration = new Map(savedEntries.map((entry) => [entry.source_registration_id, entry.id]));
            const { data: savedMatches, error: matchesError } = await supabase
                .from('draw_matches')
                .insert(draft.matches.map((match) => {
                    const entryOneId = match.entry_one ? entryIdByRegistration.get(match.entry_one.source_registration_id) : null;
                    const entryTwoId = match.entry_two ? entryIdByRegistration.get(match.entry_two.source_registration_id) : null;
                    const winnerId = match.winner ? entryIdByRegistration.get(match.winner.source_registration_id) : null;
                    // A generated bye may carry a local entry object. Persist
                    // its winner only when it is one of this saved match's two
                    // participants; this mirrors the database invariant.
                    const validWinnerId = winnerId === entryOneId || winnerId === entryTwoId ? winnerId : null;
                    return {
                        draw_id: draw.id,
                        group_id: match.group_key ? groupIdByKey.get(match.group_key) : null,
                        stage: match.stage,
                        round_code: match.round_code,
                        round_label: match.round_label,
                        round_number: match.round_number,
                        bracket_position: match.bracket_position,
                        entry_one_id: entryOneId,
                        entry_two_id: entryTwoId,
                        winner_entry_id: validWinnerId,
                        status: validWinnerId ? match.status : (match.status === 'completed' ? 'pending' : match.status),
                        result_type: validWinnerId ? match.result_type : null,
                    };
                }))
                .select('id, stage, round_number, bracket_position');
            if (matchesError) throw matchesError;

            const matchIdByPosition = new Map(savedMatches.map((match) => [`${match.stage}:${match.round_number}:${match.bracket_position}`, match.id]));
            const idForMatch = (match) => matchIdByPosition.get(`${match.stage}:${match.round_number}:${match.bracket_position}`);
            const links = draft.format === 'knockout' ? draft.matches.map((match) => {
                if (match.stage !== 'knockout') return null;
                const nextRound = match.round_number + 1;
                const nextPosition = Math.ceil(match.bracket_position / 2);
                const winnerToMatchId = matchIdByPosition.get(`knockout:${nextRound}:${nextPosition}`);
                const loserToMatchId = match.loser_to_match_key
                    ? matchIdByPosition.get(`placement:${draft.total_rounds}:2`)
                    : null;
                if (!winnerToMatchId && !loserToMatchId) return null;
                return supabase.from('draw_matches').update({
                    winner_to_match_id: winnerToMatchId || null,
                    winner_to_slot: winnerToMatchId ? (match.bracket_position % 2 === 1 ? 1 : 2) : null,
                    loser_to_match_id: loserToMatchId,
                    loser_to_slot: loserToMatchId ? match.loser_to_slot : null,
                }).eq('id', idForMatch(match));
            }).filter(Boolean) : [];
            const linkResults = await Promise.all(links);
            const linkError = linkResults.find((result) => result.error)?.error;
            if (linkError) throw linkError;

            if (draft.format === 'knockout') setDraft((current) => ({
                ...current,
                entries: current.entries.map((entry) => ({
                    ...entry,
                    id: entryIdByRegistration.get(entry.source_registration_id),
                })),
                matches: current.matches.map((match) => ({
                    ...match,
                    id: idForMatch(match),
                    key: idForMatch(match),
                    entry_one: match.entry_one ? { ...match.entry_one, id: entryIdByRegistration.get(match.entry_one.source_registration_id) } : null,
                    entry_two: match.entry_two ? { ...match.entry_two, id: entryIdByRegistration.get(match.entry_two.source_registration_id) } : null,
                    winner: match.winner ? { ...match.winner, id: entryIdByRegistration.get(match.winner.source_registration_id) } : null,
                    winner_to_match_id: match.stage === 'knockout' ? matchIdByPosition.get(`knockout:${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) || null : null,
                    winner_to_slot: match.stage === 'knockout' && matchIdByPosition.get(`knockout:${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`)
                        ? (match.bracket_position % 2 === 1 ? 1 : 2)
                        : null,
                    loser_to_match_id: match.loser_to_match_key ? matchIdByPosition.get(`placement:${current.total_rounds}:2`) || null : null,
                    loser_to_slot: match.loser_to_match_key ? match.loser_to_slot : null,
                })),
            }));
            else {
                const matchIdByDraftKey = new Map(draft.matches.map((match, index) => [match.key, savedMatches[index]?.id]));
                setDraft((current) => ({
                    ...current,
                    entries: current.entries.map((entry) => ({ ...entry, id: entryIdByRegistration.get(entry.source_registration_id) })),
                    matches: current.matches.map((match) => ({
                        ...match,
                        id: matchIdByDraftKey.get(match.key),
                        key: matchIdByDraftKey.get(match.key),
                        group_id: match.group_key ? groupIdByKey.get(match.group_key) : null,
                        entry_one_id: match.entry_one ? entryIdByRegistration.get(match.entry_one.source_registration_id) : null,
                        entry_two_id: match.entry_two ? entryIdByRegistration.get(match.entry_two.source_registration_id) : null,
                        entry_one: match.entry_one ? { ...match.entry_one, id: entryIdByRegistration.get(match.entry_one.source_registration_id) } : null,
                        entry_two: match.entry_two ? { ...match.entry_two, id: entryIdByRegistration.get(match.entry_two.source_registration_id) } : null,
                    })),
                }));
                setSavedGroups((savedGroups || []).map((group) => ({ ...group, key: group.id })));
            }

            await supabase.from('draw_match_audit').insert({
                match_id: savedMatches[0].id,
                action: 'created',
                after_state: { entry_count: draft.entries.length, draw_size: draft.draw_size },
            });
            toast.success(`${division.name} draw ${existing ? 'updated' : 'saved'} as a draft`);
            setSavedDraw({ ...draw, status: 'draft' });
            onSaved?.();
        } catch (error) {
            console.error('Failed to save native draw draft', error);
            toast.error(error.message || 'Could not save the draw draft');
        } finally {
            setSaving(false);
        }
    };

    const publishDraft = async () => {
        if (!savedDraw?.id || savedDraw.status !== 'draft') {
            toast.error('Save the draft before publishing it');
            return;
        }
        setSaving(true);
        try {
            const { error } = await supabase.from('draws').update({
                status: 'published', published_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            }).eq('id', savedDraw.id).eq('status', 'draft');
            if (error) throw error;
            setSavedDraw({ ...savedDraw, status: 'published' });
            setShowDrawSetup(false);
            toast.success(`${division.name} event draw is published at /native-draws/${event.slug}`);
        } catch (error) {
            console.error('Failed to publish native draw', error);
            toast.error(error.message || 'Could not publish the draw');
        } finally {
            setSaving(false);
        }
    };

    const updateLocalMatch = (matchId, updates) => {
        setDraft((current) => current ? {
            ...current,
            matches: current.matches.map((item) => item.id === matchId ? { ...item, ...updates } : item),
        } : current);
    };

    const openMatchOperations = (match) => {
        setEditingMatchId(match.id);
        setMatchOperations((current) => ({
            ...current,
            [match.id]: current[match.id] || {
                court_name: match.court_name || '',
                scheduled_start: toLocalDateTimeInput(match.scheduled_start),
            },
        }));
    };

    const saveMatchOperations = async (match) => {
        const values = matchOperations[match.id] || {};
        const scheduledStart = values.scheduled_start ? new Date(values.scheduled_start) : null;
        if (values.scheduled_start && Number.isNaN(scheduledStart.getTime())) {
            toast.error('Enter a valid scheduled date and time');
            return;
        }
        setSaving(true);
        try {
            const updates = {
                court_name: String(values.court_name || '').trim() || null,
                scheduled_start: scheduledStart ? scheduledStart.toISOString() : null,
                updated_at: new Date().toISOString(),
            };
            const { error } = await supabase.from('draw_matches').update(updates).eq('id', match.id);
            if (error) throw error;
            updateLocalMatch(match.id, updates);
            setEditingMatchId(null);
            toast.success('Match schedule saved');
        } catch (error) {
            console.error('Failed to save native match schedule', error);
            toast.error(error.message || 'Could not save the match schedule. Apply the native draw match schedule migration first.');
        } finally {
            setSaving(false);
        }
    };

    const autoScheduleReadyMatches = async () => {
        if (!savedDraw?.id || availableCourts.length === 0) {
            toast.error('Set the event’s number of courts before auto-scheduling matches.');
            return;
        }
        if (!scheduleDefaults.date || !scheduleDefaults.startTime) {
            toast.error('Choose a schedule date and start time.');
            return;
        }
        const matchMinutes = Number(scheduleDefaults.matchMinutes);
        const breakMinutes = Number(scheduleDefaults.breakMinutes);
        if (!Number.isFinite(matchMinutes) || matchMinutes < 1 || !Number.isFinite(breakMinutes) || breakMinutes < 0) {
            toast.error('Enter a valid match duration and break.');
            return;
        }
        const baseStart = new Date(`${scheduleDefaults.date}T${scheduleDefaults.startTime}:00`);
        if (Number.isNaN(baseStart.getTime())) {
            toast.error('Choose a valid schedule date and start time.');
            return;
        }
        const slotDuration = (matchMinutes + breakMinutes) * 60_000;
        const candidates = (draft?.matches || [])
            .filter((match) => ['pending', 'scheduled'].includes(match.status) && match.entry_one && match.entry_two && (!match.court_name || !match.scheduled_start))
            .sort((a, b) => (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));
        if (candidates.length === 0) {
            toast.message('Every ready match already has a court and time.');
            return;
        }

        const nextAvailable = new Map(availableCourts.map((court) => [court, baseStart.getTime()]));
        (draft?.matches || []).filter((match) => match.court_name && match.scheduled_start).forEach((match) => {
            const start = new Date(match.scheduled_start).getTime();
            if (nextAvailable.has(match.court_name) && Number.isFinite(start)) {
                nextAvailable.set(match.court_name, Math.max(nextAvailable.get(match.court_name), start + slotDuration));
            }
        });

        const updates = candidates.map((match) => {
            const court = match.court_name || availableCourts.reduce((earliest, candidate) => (
                nextAvailable.get(candidate) < nextAvailable.get(earliest) ? candidate : earliest
            ), availableCourts[0]);
            const start = match.scheduled_start ? new Date(match.scheduled_start) : new Date(nextAvailable.get(court));
            nextAvailable.set(court, start.getTime() + slotDuration);
            return {
                id: match.id,
                court_name: match.court_name || court,
                scheduled_start: match.scheduled_start || start.toISOString(),
                updated_at: new Date().toISOString(),
            };
        });

        setAutoScheduling(true);
        try {
            const results = await Promise.all(updates.map(({ id, ...values }) => supabase.from('draw_matches').update(values).eq('id', id)));
            const failure = results.find(({ error }) => error)?.error;
            if (failure) throw failure;
            updates.forEach(({ id, ...values }) => updateLocalMatch(id, values));
            toast.success(`${updates.length} ready ${updates.length === 1 ? 'match' : 'matches'} scheduled without changing existing assignments.`);
        } catch (error) {
            console.error('Failed to auto-schedule native draw matches', error);
            toast.error(error.message || 'Could not auto-schedule matches.');
        } finally {
            setAutoScheduling(false);
        }
    };

    const setMatchLive = async (match, live) => {
        if (!match?.id || ['completed', 'walkover', 'retired'].includes(match.status)) return;
        const fallbackStatus = match.scheduled_start ? 'scheduled' : 'pending';
        const updates = { status: live ? 'in_progress' : fallbackStatus, updated_at: new Date().toISOString() };
        setSaving(true);
        try {
            const { error } = await supabase.from('draw_matches').update(updates).eq('id', match.id).in('status', ['pending', 'scheduled', 'in_progress']);
            if (error) throw error;
            updateLocalMatch(match.id, updates);
            toast.success(live ? 'Match is now live on the public draw' : 'Match removed from live status');
        } catch (error) {
            console.error('Failed to update native match status', error);
            toast.error(error.message || 'Could not update the live match status');
        } finally {
            setSaving(false);
        }
    };

    const toggleFeaturedMatch = async (match) => {
        if (!match?.id) return;
        const isFeatured = !match.is_featured;
        const featuredCount = (draft?.matches || []).filter((item) => item.is_featured).length;
        if (isFeatured && featuredCount >= 4) {
            toast.error('You can feature up to four matches at a time. Remove one before adding another.');
            return;
        }
        setSaving(true);
        try {
            const updates = { is_featured: isFeatured, updated_at: new Date().toISOString() };
            const { error } = await supabase.from('draw_matches').update(updates).eq('id', match.id);
            if (error) throw error;
            updateLocalMatch(match.id, updates);
            toast.success(isFeatured ? 'Match added to the public featured list' : 'Match removed from the public featured list');
        } catch (error) {
            console.error('Failed to update featured native match', error);
            toast.error(error.message || 'Could not update featured matches. Apply the public draw controls migration first.');
        } finally {
            setSaving(false);
        }
    };

    const createAnnouncement = async () => {
        const message = announcementForm.message.trim();
        if (!message) {
            toast.error('Add an announcement message first');
            return;
        }
        if (announcementForm.scope !== 'event' && !divisionId) {
            toast.error('Select a division before posting this announcement');
            return;
        }
        if (announcementForm.scope === 'draw' && !savedDraw?.id) {
            toast.error('Save or select a draw before posting a draw-specific announcement');
            return;
        }
        setSaving(true);
        try {
            const payload = {
                event_id: event.id,
                division_id: announcementForm.scope === 'event' ? null : divisionId,
                draw_id: announcementForm.scope === 'draw' ? savedDraw.id : null,
                title: announcementForm.title.trim() || null,
                message,
                is_pinned: announcementForm.isPinned,
            };
            const { error } = await supabase.from('native_draw_announcements').insert(payload);
            if (error) throw error;
            setAnnouncementForm({ title: '', message: '', scope: announcementForm.scope, isPinned: false });
            setAnnouncementRefreshKey((current) => current + 1);
            toast.success('Announcement published');
        } catch (error) {
            console.error('Failed to publish native draw announcement', error);
            toast.error(error.message || 'Could not publish the announcement. Apply the announcement-centre migration first.');
        } finally {
            setSaving(false);
        }
    };

    const removeAnnouncement = async (announcement) => {
        setSaving(true);
        try {
            const { error } = await supabase.from('native_draw_announcements').delete().eq('id', announcement.id);
            if (error) throw error;
            setAnnouncements((current) => current.filter((item) => item.id !== announcement.id));
            toast.success('Announcement removed');
        } catch (error) {
            console.error('Failed to remove native draw announcement', error);
            toast.error(error.message || 'Could not remove the announcement');
        } finally {
            setSaving(false);
        }
    };

    const recordResult = async (match) => {
        const matchEntryIds = [match?.entry_one?.id, match?.entry_two?.id].filter(Boolean);
        if (!match?.id || matchEntryIds.length !== 2) {
            toast.error('This match is not ready to record. Refresh the saved draw and try again.');
            return;
        }
        if (!recordingWinnerId || !matchEntryIds.includes(recordingWinnerId)) {
            toast.error('Select the winning team');
            return;
        }
        if (recordingResultType !== 'walkover' && recordingSets.some(([first, second]) => (first === '') !== (second === ''))) {
            toast.error('Enter both teams’ scores for a set, or leave that set blank');
            return;
        }
        const scoredSets = recordingResultType === 'walkover' ? [] : recordingSets
            .filter(([first, second]) => first !== '' || second !== '')
            .map(([first, second], index) => ({
                match_id: match.id,
                set_number: index + 1,
                entry_one_games: Number(first),
                entry_two_games: Number(second),
            }));
        if (scoredSets.some((set) => !Number.isInteger(set.entry_one_games) || !Number.isInteger(set.entry_two_games) || set.entry_one_games < 0 || set.entry_two_games < 0)) {
            toast.error('Enter a valid score for both teams in every set, or leave the set blank');
            return;
        }
        setSaving(true);
        try {
            const winnerEntry = recordingWinnerId;
            const loserEntry = match.entry_one.id === winnerEntry ? match.entry_two.id : match.entry_one.id;
            const matchStatus = recordingResultType === 'walkover'
                ? 'walkover'
                : recordingResultType === 'retirement' ? 'retired' : 'completed';
            const { error: resultError } = await supabase.from('draw_matches').update({
                winner_entry_id: winnerEntry,
                loser_entry_id: loserEntry,
                status: matchStatus,
                result_type: recordingResultType,
                updated_at: new Date().toISOString(),
            }).eq('id', match.id).in('status', ['pending', 'scheduled', 'in_progress']);
            if (resultError) throw resultError;
            if (scoredSets.length > 0) {
                const { error: setsError } = await supabase.from('draw_match_sets').insert(scoredSets);
                if (setsError) throw setsError;
            }
            const nextSets = [...matchSets, ...scoredSets];
            if (match.stage === 'group' && match.group_id) {
                const completedMatches = draft.matches.map((item) => item.id === match.id
                    ? { ...item, winner_entry_id: winnerEntry, status: matchStatus, result_type: recordingResultType }
                    : item);
                const nextStandings = calculateGroupStandings({
                    entries: draft.entries,
                    matches: completedMatches,
                    matchSets: nextSets,
                    groupId: match.group_id,
                });
                const persistedRows = nextStandings.map((standing) => {
                    const row = { ...standing };
                    delete row.seed_number;
                    return { ...row, updated_at: new Date().toISOString() };
                });
                const { error: standingsError } = await supabase
                    .from('draw_standings')
                    .upsert(persistedRows, { onConflict: 'group_id,entry_id' });
                if (standingsError) throw standingsError;
                setStandings((current) => [...current.filter((row) => row.group_id !== match.group_id), ...persistedRows]);
                setMatchSets(nextSets);
            }
            if (match.winner_to_match_id) {
                const field = match.winner_to_slot === 1 ? 'entry_one_id' : 'entry_two_id';
                const { error: advanceError } = await supabase.from('draw_matches').update({
                    [field]: winnerEntry,
                    updated_at: new Date().toISOString(),
                }).eq('id', match.winner_to_match_id);
                if (advanceError) throw advanceError;
            }
            if (match.loser_to_match_id) {
                const field = match.loser_to_slot === 1 ? 'entry_one_id' : 'entry_two_id';
                const { error: advanceLoserError } = await supabase.from('draw_matches').update({
                    [field]: loserEntry,
                    updated_at: new Date().toISOString(),
                }).eq('id', match.loser_to_match_id);
                if (advanceLoserError) throw advanceLoserError;
            }
            await supabase.from('draw_match_audit').insert({
                match_id: match.id,
                action: 'score_recorded',
                after_state: { winner_entry_id: winnerEntry, sets: scoredSets },
            });
            setDraft((current) => ({
                ...current,
                matches: current.matches.map((item) => {
                    if (item.id === match.id) return { ...item, winner_entry_id: winnerEntry, loser_entry_id: loserEntry, winner: current.entries.find((entry) => entry.id === winnerEntry), status: matchStatus, result_type: recordingResultType };
                    if (item.id === match.winner_to_match_id) return { ...item, [match.winner_to_slot === 1 ? 'entry_one' : 'entry_two']: current.entries.find((entry) => entry.id === winnerEntry), [match.winner_to_slot === 1 ? 'entry_one_id' : 'entry_two_id']: winnerEntry };
                    if (item.id === match.loser_to_match_id) return { ...item, [match.loser_to_slot === 1 ? 'entry_one' : 'entry_two']: current.entries.find((entry) => entry.id === loserEntry), [match.loser_to_slot === 1 ? 'entry_one_id' : 'entry_two_id']: loserEntry };
                    return item;
                }),
            }));
            toast.success(match.stage === 'group' ? 'Result saved and group standings updated' : match.loser_to_match_id ? 'Result saved; winner and Top 4 playoff routes updated' : 'Result saved and winner advanced');
            setRecordingMatchId(null);
            setRecordingWinnerId('');
            setRecordingResultType('played');
            setRecordingSets([['', ''], ['', '']]);
        } catch (error) {
            console.error('Failed to record native draw result', error);
            toast.error(error.message || 'Could not record the result');
        } finally {
            setSaving(false);
        }
    };

    const createKnockoutFromGroups = async () => {
        if (!savedDraw?.id || !draft || !groupStageComplete) return;
        if (draft.matches.some((match) => match.stage === 'knockout')) {
            toast.error('The elimination phase has already been created');
            return;
        }
        const advancers = Array.from({ length: Number(advancersPerGroup) }, (_, position) => position)
            .flatMap((position) => savedGroups.map((group) => {
                const row = standingsForGroup(group.id)[position];
                return row ? draft.entries.find((entry) => entry.id === row.entry_id) : null;
            }).filter(Boolean));
        if (advancers.length < 2) {
            toast.error('At least two teams must advance to create an elimination phase');
            return;
        }
        const knockout = generateKnockoutDraft(
            advancers.map((entry, index) => ({ ...entry, seed_number: index + 1 })),
            { seedingMethod: 'manual', placementPlayoff: playoffMode },
        );
        setSaving(true);
        try {
            const { data: inserted, error } = await supabase.from('draw_matches').insert(knockout.matches.map((match) => ({
                draw_id: savedDraw.id, stage: match.stage, round_code: match.round_code, round_label: match.round_label,
                round_number: match.round_number, bracket_position: match.bracket_position,
                entry_one_id: match.entry_one?.id || null, entry_two_id: match.entry_two?.id || null,
                winner_entry_id: match.winner?.id || null, status: match.status, result_type: match.result_type,
            }))).select('id, stage, round_number, bracket_position');
            if (error) throw error;
            const ids = new Map(inserted.map((match) => [`${match.stage}:${match.round_number}:${match.bracket_position}`, match.id]));
            const links = await Promise.all(knockout.matches.map((match) => {
                if (match.stage !== 'knockout') return null;
                const currentId = ids.get(`knockout:${match.round_number}:${match.bracket_position}`);
                const nextId = ids.get(`knockout:${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`);
                const loserId = match.loser_to_match_key ? ids.get(`placement:${knockout.total_rounds}:2`) : null;
                if (!nextId && !loserId) return null;
                return supabase.from('draw_matches').update({
                    winner_to_match_id: nextId || null,
                    winner_to_slot: nextId ? (match.bracket_position % 2 === 1 ? 1 : 2) : null,
                    loser_to_match_id: loserId || null,
                    loser_to_slot: loserId ? match.loser_to_slot : null,
                }).eq('id', currentId);
            }).filter(Boolean));
            const linkError = links.find((result) => result.error)?.error;
            if (linkError) throw linkError;
            setDraft((current) => ({ ...current, matches: [...current.matches, ...knockout.matches.map((match) => ({
                ...match, id: ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`), key: ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`),
                winner_to_match_id: match.stage === 'knockout' ? ids.get(`knockout:${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) || null : null,
                winner_to_slot: match.stage === 'knockout' && ids.get(`knockout:${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) ? (match.bracket_position % 2 === 1 ? 1 : 2) : null,
                loser_to_match_id: match.loser_to_match_key ? ids.get(`placement:${knockout.total_rounds}:2`) || null : null,
                loser_to_slot: match.loser_to_match_key ? match.loser_to_slot : null,
            }))] }));
            toast.success('Elimination phase created from the final group standings');
        } catch (error) {
            console.error('Failed to create elimination phase', error);
            toast.error(error.message || 'Could not create the elimination phase');
        } finally {
            setSaving(false);
        }
    };

    const createSilverPlate = async () => {
        if (!savedDraw?.id || !draft || !['double', 'triple'].includes(plateMode)) return;
        if (silverPlate) {
            toast.error('The Silver plate has already been created for this division.');
            return;
        }
        const knockoutMatches = draft.matches.filter((match) => match.stage === 'knockout');
        const openingRound = Math.min(...knockoutMatches.map((match) => match.round_number));
        const openingMatches = knockoutMatches.filter((match) => match.round_number === openingRound);
        const resolvedStatuses = ['completed', 'walkover', 'retired'];
        if (!openingMatches.length || openingMatches.some((match) => !match.winner_entry_id || !resolvedStatuses.includes(match.status))) {
            toast.error('Complete every opening-round main-draw match before creating the Silver plate.');
            return;
        }
        const loserIds = [...new Set(openingMatches
            .filter((match) => match.entry_one_id && match.entry_two_id)
            .map((match) => match.loser_entry_id || (match.winner_entry_id === match.entry_one_id ? match.entry_two_id : match.entry_one_id)))];
        const plateEntries = loserIds.map((id) => draft.entries.find((entry) => entry.id === id)).filter(Boolean);
        if (plateEntries.length < 2) {
            toast.error('At least two opening-round losers are needed to create a Silver plate.');
            return;
        }
        const plateDraft = generateKnockoutDraft(plateEntries, { seedingMethod: 'manual' });
        setSaving(true);
        try {
            const { data: existing, error: existingError } = await supabase
                .from('draws')
                .select('id, status')
                .eq('division_id', division.id)
                .eq('draw_kind', 'silver')
                .maybeSingle();
            if (existingError) throw existingError;
            if (existing) {
                setSilverPlate(existing);
                toast.error('The Silver plate has already been created for this division.');
                return;
            }
            const { data: silverDraw, error: drawError } = await supabase.from('draws').insert({
                event_id: event.id,
                division_id: division.id,
                draw_kind: 'silver',
                format: 'knockout',
                status: 'published',
                seeding_method: 'manual',
                scoring_rules: { ...(savedDraw.scoring_rules || {}), plate_mode: plateMode },
                generated_at: new Date().toISOString(),
                published_at: new Date().toISOString(),
            }).select('id, status').single();
            if (drawError) throw drawError;

            const { data: savedEntries, error: entriesError } = await supabase.from('draw_entries').insert(plateDraft.entries.map((entry, index) => ({
                draw_id: silverDraw.id,
                source_registration_id: entry.source_registration_id,
                player_one_id: entry.player_one_id,
                player_two_id: entry.player_two_id,
                team_name: entry.team_name,
                player_one_name: entry.player_one_name,
                player_two_name: entry.player_two_name,
                seed_number: index + 1,
                seeding_value: entry.seeding_value,
                snapshot: entry.snapshot || {},
            }))).select('id, source_registration_id');
            if (entriesError) throw entriesError;
            const entryIdByRegistration = new Map(savedEntries.map((entry) => [entry.source_registration_id, entry.id]));
            const { data: savedMatches, error: matchesError } = await supabase.from('draw_matches').insert(plateDraft.matches.map((match) => {
                const entryOneId = match.entry_one ? entryIdByRegistration.get(match.entry_one.source_registration_id) : null;
                const entryTwoId = match.entry_two ? entryIdByRegistration.get(match.entry_two.source_registration_id) : null;
                const winnerId = match.winner ? entryIdByRegistration.get(match.winner.source_registration_id) : null;
                const validWinnerId = winnerId && (winnerId === entryOneId || winnerId === entryTwoId) ? winnerId : null;
                return {
                    draw_id: silverDraw.id,
                    stage: 'knockout',
                    round_code: match.round_code,
                    round_label: match.round_label,
                    round_number: match.round_number,
                    bracket_position: match.bracket_position,
                    entry_one_id: entryOneId,
                    entry_two_id: entryTwoId,
                    winner_entry_id: validWinnerId,
                    status: validWinnerId ? match.status : 'pending',
                    result_type: validWinnerId ? match.result_type : null,
                };
            })).select('id, round_number, bracket_position');
            if (matchesError) throw matchesError;
            const matchIdByPosition = new Map(savedMatches.map((match) => [`${match.round_number}:${match.bracket_position}`, match.id]));
            const links = plateDraft.matches.map((match) => {
                const nextId = matchIdByPosition.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`);
                return nextId ? supabase.from('draw_matches').update({
                    winner_to_match_id: nextId,
                    winner_to_slot: match.bracket_position % 2 === 1 ? 1 : 2,
                }).eq('id', matchIdByPosition.get(`${match.round_number}:${match.bracket_position}`)) : null;
            }).filter(Boolean);
            const linkResults = await Promise.all(links);
            const linkError = linkResults.find((result) => result.error)?.error;
            if (linkError) throw linkError;
            await supabase.from('draw_match_audit').insert({
                match_id: savedMatches[0].id,
                action: 'created',
                after_state: { draw_kind: 'silver', source: 'main_opening_round_losers', entry_count: plateEntries.length },
            });
            setSilverPlate(silverDraw);
            setAvailableDraws((current) => [
                ...current.filter((item) => item.draw_kind !== 'silver'),
                { ...silverDraw, draw_kind: 'silver', format: 'knockout', scoring_rules: { ...(savedDraw.scoring_rules || {}), plate_mode: plateMode }, generated_at: new Date().toISOString() },
            ]);
            toast.success(`Silver plate created with ${plateEntries.length} teams.`);
            onSaved?.();
        } catch (error) {
            console.error('Failed to create Silver plate', error);
            toast.error(error.message || 'Could not create the Silver plate');
        } finally {
            setSaving(false);
        }
    };

    const createBronzePlate = async () => {
        if (!savedDraw?.id || !draft || activeDrawKind !== 'silver' || plateMode !== 'triple') return;
        if (bronzePlate) {
            toast.error('The Bronze plate has already been created for this division.');
            return;
        }
        const knockoutMatches = draft.matches.filter((match) => match.stage === 'knockout');
        const openingRound = Math.min(...knockoutMatches.map((match) => match.round_number));
        const openingMatches = knockoutMatches.filter((match) => match.round_number === openingRound);
        const resolvedStatuses = ['completed', 'walkover', 'retired'];
        if (!openingMatches.length || openingMatches.some((match) => !match.winner_entry_id || !resolvedStatuses.includes(match.status))) {
            toast.error('Complete every opening-round Silver plate match before creating the Bronze plate.');
            return;
        }
        const loserIds = [...new Set(openingMatches
            .filter((match) => match.entry_one_id && match.entry_two_id)
            .map((match) => match.loser_entry_id || (match.winner_entry_id === match.entry_one_id ? match.entry_two_id : match.entry_one_id)))];
        const plateEntries = loserIds.map((id) => draft.entries.find((entry) => entry.id === id)).filter(Boolean);
        if (plateEntries.length < 2) {
            toast.error('At least two opening-round losers are needed to create a Bronze plate.');
            return;
        }
        const plateDraft = generateKnockoutDraft(plateEntries, { seedingMethod: 'manual' });
        setSaving(true);
        try {
            const { data: existing, error: existingError } = await supabase
                .from('draws')
                .select('id, status')
                .eq('division_id', division.id)
                .eq('draw_kind', 'bronze')
                .maybeSingle();
            if (existingError) throw existingError;
            if (existing) {
                setBronzePlate(existing);
                toast.error('The Bronze plate has already been created for this division.');
                return;
            }
            const { data: bronzeDraw, error: drawError } = await supabase.from('draws').insert({
                event_id: event.id,
                division_id: division.id,
                draw_kind: 'bronze',
                format: 'knockout',
                status: 'published',
                seeding_method: 'manual',
                scoring_rules: { ...(savedDraw.scoring_rules || {}), plate_mode: 'triple' },
                generated_at: new Date().toISOString(),
                published_at: new Date().toISOString(),
            }).select('id, status').single();
            if (drawError) throw drawError;
            const { data: savedEntries, error: entriesError } = await supabase.from('draw_entries').insert(plateDraft.entries.map((entry, index) => ({
                draw_id: bronzeDraw.id,
                source_registration_id: entry.source_registration_id,
                player_one_id: entry.player_one_id,
                player_two_id: entry.player_two_id,
                team_name: entry.team_name,
                player_one_name: entry.player_one_name,
                player_two_name: entry.player_two_name,
                seed_number: index + 1,
                seeding_value: entry.seeding_value,
                snapshot: entry.snapshot || {},
            }))).select('id, source_registration_id');
            if (entriesError) throw entriesError;
            const entryIdByRegistration = new Map(savedEntries.map((entry) => [entry.source_registration_id, entry.id]));
            const { data: savedMatches, error: matchesError } = await supabase.from('draw_matches').insert(plateDraft.matches.map((match) => {
                const entryOneId = match.entry_one ? entryIdByRegistration.get(match.entry_one.source_registration_id) : null;
                const entryTwoId = match.entry_two ? entryIdByRegistration.get(match.entry_two.source_registration_id) : null;
                const winnerId = match.winner ? entryIdByRegistration.get(match.winner.source_registration_id) : null;
                const validWinnerId = winnerId && (winnerId === entryOneId || winnerId === entryTwoId) ? winnerId : null;
                return {
                    draw_id: bronzeDraw.id,
                    stage: 'knockout',
                    round_code: match.round_code,
                    round_label: match.round_label,
                    round_number: match.round_number,
                    bracket_position: match.bracket_position,
                    entry_one_id: entryOneId,
                    entry_two_id: entryTwoId,
                    winner_entry_id: validWinnerId,
                    status: validWinnerId ? match.status : 'pending',
                    result_type: validWinnerId ? match.result_type : null,
                };
            })).select('id, round_number, bracket_position');
            if (matchesError) throw matchesError;
            const matchIdByPosition = new Map(savedMatches.map((match) => [`${match.round_number}:${match.bracket_position}`, match.id]));
            const links = plateDraft.matches.map((match) => {
                const nextId = matchIdByPosition.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`);
                return nextId ? supabase.from('draw_matches').update({
                    winner_to_match_id: nextId,
                    winner_to_slot: match.bracket_position % 2 === 1 ? 1 : 2,
                }).eq('id', matchIdByPosition.get(`${match.round_number}:${match.bracket_position}`)) : null;
            }).filter(Boolean);
            const linkResults = await Promise.all(links);
            const linkError = linkResults.find((result) => result.error)?.error;
            if (linkError) throw linkError;
            await supabase.from('draw_match_audit').insert({
                match_id: savedMatches[0].id,
                action: 'created',
                after_state: { draw_kind: 'bronze', source: 'silver_opening_round_losers', entry_count: plateEntries.length },
            });
            setBronzePlate(bronzeDraw);
            setAvailableDraws((current) => [
                ...current.filter((item) => item.draw_kind !== 'bronze'),
                { ...bronzeDraw, draw_kind: 'bronze', format: 'knockout', scoring_rules: { ...(savedDraw.scoring_rules || {}), plate_mode: 'triple' }, generated_at: new Date().toISOString() },
            ]);
            toast.success(`Bronze plate created with ${plateEntries.length} teams.`);
            onSaved?.();
        } catch (error) {
            console.error('Failed to create Bronze plate', error);
            toast.error(error.message || 'Could not create the Bronze plate');
        } finally {
            setSaving(false);
        }
    };

    const enableSilverPlate = async () => {
        if (!savedDraw?.id) return;
        setSaving(true);
        try {
            const scoringRules = { ...(savedDraw.scoring_rules || {}), plate_mode: 'double' };
            const { error } = await supabase.from('draws').update({
                scoring_rules: scoringRules,
                updated_at: new Date().toISOString(),
            }).eq('id', savedDraw.id);
            if (error) throw error;
            setSavedDraw((current) => ({ ...current, scoring_rules: scoringRules }));
            setPlateMode('double');
            toast.success('Silver plate enabled. Complete the opening round to create it.');
        } catch (error) {
            console.error('Failed to enable Silver plate', error);
            toast.error(error.message || 'Could not enable the Silver plate');
        } finally {
            setSaving(false);
        }
    };

    const completeDraw = async () => {
        if (!savedDraw?.id || !draft) return;
        const playableMatches = draft.matches.filter((match) => match.entry_one_id && match.entry_two_id);
        const resolvedStatuses = ['completed', 'walkover', 'retired'];
        if (!playableMatches.length || playableMatches.some((match) => !resolvedStatuses.includes(match.status))) {
            toast.error('Enter every playable result before completing this draw.');
            return;
        }
        setSaving(true);
        try {
            const completedAt = new Date().toISOString();
            const { error } = await supabase.from('draws').update({
                status: 'completed',
                completed_at: completedAt,
                updated_at: completedAt,
            }).eq('id', savedDraw.id).eq('status', 'published');
            if (error) throw error;
            setSavedDraw((current) => ({ ...current, status: 'completed', completed_at: completedAt }));
            setAvailableDraws((current) => current.map((item) => item.id === savedDraw.id
                ? { ...item, status: 'completed', completed_at: completedAt }
                : item));
            // Reload the persisted draw straight away so completion, placement
            // review and any newly available ranking configuration appear in
            // the same flow without the organiser refreshing the page.
            setDrawReloadKey((key) => key + 1);
            toast.success(`${activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} marked complete.`);
            onSaved?.();
        } catch (error) {
            console.error('Failed to complete draw', error);
            toast.error(error.message || 'Could not complete this draw');
        } finally {
            setSaving(false);
        }
    };

    const awardRankingPoints = async () => {
        if (!savedDraw?.id || !division?.ranking_tier_id || !division?.ranking_category || !rankingTier) {
            toast.error('This division needs a valid ranking tier and category before points can be awarded.');
            return;
        }
        if (!rankingReview.length) {
            toast.error('No completed final placements are available to award.');
            return;
        }
        if (unpricedRankingReview.length) {
            toast.error('Choose an official placement for every team marked for review before awarding points.');
            return;
        }
        if (missingPlayerProfiles.length) {
            toast.error(`Cannot award points until these player profiles are linked: ${missingPlayerProfiles.join(', ')}.`);
            return;
        }
        if (!pendingAwardablePlayerRows.length) {
            toast.message('Every eligible player in this division already has a points award.');
            return;
        }
        if (!awardConfirmed) {
            toast.error('Confirm that the final placements have been checked before awarding points.');
            return;
        }

        const awardedAt = new Date().toISOString();
        const eventDate = String(event?.start_date || '').slice(0, 10) || null;
        const payload = pendingAwardablePlayerRows.map(({ id, name, proposal }) => ({
            player_id: id,
            event_id: event.id,
            division_id: divisionId,
            points_table_id: proposal.pointsRule.id,
            round_code: proposal.selectedRoundCode,
            points: proposal.pointsRule.points,
            event_date: eventDate,
            date_awarded: awardedAt.slice(0, 10),
            config_snapshot: {
                source: 'native_draw',
                draw_id: savedDraw.id,
                draw_kind: 'main',
                entry_id: proposal.entry_id,
                team_name: proposal.entry.team_name,
                player_name: name,
                final_placement: proposal.placement,
                ranking_tier: { id: rankingTier.id, code: rankingTier.code, name: rankingTier.name },
                ranking_category: Number(division.ranking_category),
                points_rule: {
                    id: proposal.pointsRule.id,
                    round_code: proposal.pointsRule.round_code,
                    round_label: proposal.pointsRule.round_label,
                    points: proposal.pointsRule.points,
                },
                awarded_at: awardedAt,
            },
        }));

        setSaving(true);
        try {
            const { data, error } = await supabase
                .from('player_ranking_points')
                .insert(payload)
                .select('id, player_id, round_code, points, date_awarded, config_snapshot, created_at');
            if (error) throw error;
            setRankingAwards((current) => [...current, ...(data || [])]);
            setAwardConfirmed(false);
            toast.success(`${payload.length} ${payload.length === 1 ? 'player award has' : 'player awards have'} been recorded.`);
            onSaved?.();
        } catch (error) {
            console.error('Failed to award native ranking points', error);
            toast.error(error.message || 'Could not award ranking points. No existing awards were changed.');
        } finally {
            setSaving(false);
        }
    };

    const standingsForGroup = (groupId) => standings
        .filter((row) => row.group_id === groupId)
        .sort((a, b) => (a.position || 999) - (b.position || 999));
    const groupStageComplete = savedGroups.length > 0
        && savedGroups.every((group) => areGroupMatchesComplete(draft?.matches || [], group.id));
    const settingsLocked = savedDraw?.status === 'published';
    const seedReviewEntries = [...(draft?.entries || [])]
        .sort((a, b) => Number(a.seed_number || 999) - Number(b.seed_number || 999));
    const mainKnockoutMatches = (draft?.matches || []).filter((match) => match.stage === 'knockout');
    const mainOpeningRound = mainKnockoutMatches.length ? Math.min(...mainKnockoutMatches.map((match) => match.round_number)) : null;
    const mainOpeningMatches = mainKnockoutMatches.filter((match) => match.round_number === mainOpeningRound);
    const silverPlateReady = mainOpeningMatches.length > 0 && mainOpeningMatches.every((match) => (
        match.winner_entry_id && ['completed', 'walkover', 'retired'].includes(match.status)
    ));
    const playableMatches = (draft?.matches || []).filter((match) => match.entry_one_id && match.entry_two_id);
    const drawReadyToComplete = playableMatches.length > 0 && playableMatches.every((match) => (
        ['completed', 'walkover', 'retired'].includes(match.status)
    ));

    return (
        <div className="p-6 space-y-6">
            <div className="rounded-2xl border border-padel-green/20 bg-padel-green/5 p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-padel-green font-bold"><Brackets size={18} /> Event draws</div>
                    <p className="mt-1 max-w-3xl text-sm text-gray-400">Create, review and run an event draw from paid, active pair registrations. Choose the ranking source used to calculate and freeze each pair’s seed.</p>
                </div>
                <span className="w-fit rounded-full border border-white/10 bg-black/20 px-3 py-1.5 text-xs font-bold text-gray-400">Manual events only</span>
            </div>

            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between"><button type="button" aria-expanded={showDrawConfiguration} onClick={() => setShowDrawConfiguration((open) => !open)} className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><span><h2 className="font-bold text-white">Draw configuration</h2><p className="mt-1 text-xs text-gray-400">{showDrawConfiguration ? 'Choose the division and competition format before generating the seeded preview.' : (division ? `${division.name} · ${drawFormat === 'knockout' ? 'Elimination' : drawFormat === 'group_only' ? 'Round robin only' : 'Round robin → elimination'}` : 'Expand to choose a division and format.')}</p></span>{showDrawConfiguration ? <ChevronUp className="shrink-0 text-padel-green" size={20} /> : <ChevronDown className="shrink-0 text-padel-green" size={20} />}</button>{settingsLocked && <span className="w-fit rounded-full border border-padel-green/40 bg-padel-green/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-padel-green">Published · settings locked</span>}</div>
                {showDrawConfiguration && <div className="space-y-5 p-5">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                        <label className="block text-sm font-bold text-gray-300">Division<select value={divisionId} onChange={(event) => { const nextId = event.target.value; const nextDivision = divisions.find((item) => item.id === nextId); const savedSource = nextDivision?.seeding_ranking_source || 'active'; setDivisionId(nextId); setActiveDrawKind('main'); setRankingSource(savedSource === 'rankedin_class' ? 'active' : savedSource); setDraft(null); }} className="mt-2 block w-full rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white outline-none focus-visible:border-padel-green focus-visible:ring-2 focus-visible:ring-padel-green/30"><option value="" className="text-black">Select a division</option>{divisions.map((item) => <option className="text-black" key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                        {settingsLocked ? <p className="pb-3 text-sm text-gray-400">To change the format, create a new draft before publishing.</p> : <button type="button" onClick={previewDraft} disabled={!divisionId || loadingSaved || (rankingSource === 'rankedin_class' && rankedInClassSeedingsLoading)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-padel-green px-4 py-3 font-bold text-black transition-transform hover:brightness-110 active:scale-95 disabled:opacity-40">{loadingSaved || (rankingSource === 'rankedin_class' && rankedInClassSeedingsLoading) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}{savedDraw ? 'Regenerate preview' : 'Generate preview'}</button>}
                    </div>
                    {availableDraws.length > 1 && <label className="block rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm font-bold text-gray-200">Manage draw<select value={activeDrawKind} onChange={(event) => setActiveDrawKind(event.target.value)} className="mt-2 block w-full rounded-lg border border-amber-300/20 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/30">{availableDraws.map((item) => <option className="text-black" key={item.id} value={item.draw_kind}>{item.draw_kind === 'main' ? 'Main draw' : item.draw_kind === 'silver' ? 'Silver plate' : `${item.draw_kind} plate`}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-400">Select the draw whose teams and results you want to manage.</span></label>}
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Draw format<select disabled={settingsLocked} value={drawFormat} onChange={(event) => { setDrawFormat(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="knockout" className="text-black">Elimination / knockout</option><option value="group_only" className="text-black">Round robin only</option><option value="group_knockout" className="text-black">Round robin → elimination</option></select></label>
                        <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Ranking source<select disabled={settingsLocked || rankedInClassSeedingsLoading} value={rankingSource} onChange={(event) => selectRankingSource(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="active" className="text-black">Each player’s active ranking</option>{rankingSource === 'rankedin_class' && <option value="rankedin_class" className="text-black">Legacy imported RankedIn snapshot</option>}{rankingOrganisations.map((organisation) => <option key={`main:${organisation}`} value={`organisation:${organisation}`} className="text-black">{organisation} · gendered Main divisions</option>)}{rankingCategories.map((category) => <option key={category.source} value={category.source} className="text-black">{category.organisation} · {category.age_group}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{rankedInClassSeedingsLoading ? 'Loading the legacy imported snapshot…' : 'New draws use ranking records stored in our database. Choose an exact category such as Mixed-Main when the division uses it; values are shared by player lists and event cards, then frozen when the draw is saved.'}</span>{rankingSource === 'rankedin_class' && linkedSeedFallbackCount > 0 && <span className="mt-2 block text-xs font-semibold leading-4 text-amber-200">{linkedSeedFallbackCount} {linkedSeedFallbackCount === 1 ? 'team was' : 'teams were'} not matched to the linked class and will use active profile points.</span>}</label>
                        <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Seeding template<select disabled={settingsLocked} value={seedingTemplate} onChange={(event) => { setSeedingTemplate(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="0" className="text-black">0% seeded · random draw</option><option value="25" className="text-black">25% seeded</option><option value="50" className="text-black">50% seeded</option><option value="100" className="text-black">100% seeded</option></select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">Protected teams follow native ranking order; remaining teams are shuffled when the preview is generated.</span></label>
                        {drawFormat !== 'knockout' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Round robin groups<select disabled={settingsLocked} value={groupCount} onChange={(event) => { const nextCount = event.target.value; const nextSmallestGroup = Math.floor(entries.length / Number(nextCount)); const minimumAdvancers = drawFormat === 'group_knockout' && Number(nextCount) === 1 ? 2 : 1; setGroupCount(nextCount); if (Number(advancersPerGroup) > nextSmallestGroup) setAdvancersPerGroup(String(nextSmallestGroup)); else if (Number(advancersPerGroup) < minimumAdvancers) setAdvancersPerGroup(String(minimumAdvancers)); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50">{groupCountOptions.map((count) => <option key={count} value={count} className="text-black">{count === 1 ? '1 group' : `${count} groups`}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{selectedGroupCount === 1 ? `${entries.length} teams play in one round robin.` : `${entries.length} teams are distributed across ${selectedGroupCount} groups.`}</span></label>}
                        {drawFormat === 'group_knockout' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Advance to elimination<select disabled={settingsLocked || advancerOptions.length === 0} value={advancersPerGroup} onChange={(event) => { setAdvancersPerGroup(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50">{advancerOptions.map((count) => <option key={count} value={count} className="text-black">Top {count} {count === 1 ? 'team' : 'teams'}{selectedGroupCount > 1 ? ' per group' : ''}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{selectedGroupCount === 1 && Number(advancersPerGroup) === 4 && plateMode === 'none' && playoffMode === 'none' ? 'Top 4 advance to semifinals. No back plate or third-place playoff.' : 'The elimination phase unlocks when every round-robin result is complete.'}</span></label>}
                        {drawFormat !== 'group_only' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Back draw<select disabled={settingsLocked} value={plateMode} onChange={(event) => { setPlateMode(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="none" className="text-black">No plate</option><option value="double" className="text-black">Double plate · Main + Silver</option><option value="triple" className="text-black">Triple plate · Main + Silver + Bronze</option></select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">Opening-round elimination losers enter Silver. With a triple plate, opening-round Silver losers then enter Bronze.</span></label>}
                        {drawFormat !== 'group_only' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Placement playoff<select disabled={settingsLocked} value={playoffMode} onChange={(event) => { setPlayoffMode(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="none" className="text-black">No placement playoff</option><option value="top4" className="text-black">Top 4 · 3rd place playoff</option></select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">Top 4 sends the two semifinal losers into a playoff for third and fourth place.</span></label>}
                    </div>
                    {divisionId && <div className="flex items-start gap-3 rounded-xl border border-padel-green/20 bg-padel-green/5 p-4 text-sm text-gray-300"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-padel-green/10 text-padel-green"><Users size={18} /></span><span><strong className="text-white">{teams.length} teams ready</strong><br /><span className="text-gray-400">Built from {eligibleRegistrations.length} paid, active registration {eligibleRegistrations.length === 1 ? 'row' : 'rows'} in {division?.name}.</span></span></div>}
                </div>}
            </section>

            {draft && <div className="rounded-2xl border border-white/10 bg-[#101010] overflow-hidden">
                <button type="button" onClick={() => setShowDrawSetup((open) => !open)} className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-left hover:bg-white/[0.03]">
                    <span><span className="block font-bold text-white">Draw setup &amp; seed preview</span><span className="block text-xs text-gray-400">{showDrawSetup ? 'Collapse this section to focus on score entry.' : 'Expand to review seeds and bracket placement.'}</span></span>
                    {showDrawSetup ? <ChevronUp className="text-padel-green" size={20} /> : <ChevronDown className="text-padel-green" size={20} />}
                </button>
                {showDrawSetup && <>
                <div className="p-5 border-b border-white/10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="font-bold text-white">{(draft.format || 'knockout') === 'knockout' ? `${draft.draw_size}-slot knockout draft` : `${draft.groups?.length || 0} seeded groups draft`}</p>
                        <p className="text-sm text-gray-400">{(draft.format || 'knockout') === 'knockout' ? `${draft.entries.length} teams · ${draft.total_rounds} rounds · ${seedingTemplate}% seeding template${playoffMode === 'top4' ? ' · Top 4 playoff' : ''}${plateMode === 'triple' ? ' · Triple plate' : plateMode === 'double' ? ' · Double plate' : ''}.` : draft.format === 'group_knockout' ? `${draft.entries.length} teams · ${draft.groups?.length || 0} round-robin ${draft.groups?.length === 1 ? 'group' : 'groups'} · top ${advancersPerGroup} ${Number(groupCount) > 1 ? 'per group ' : ''}advance${playoffMode === 'top4' ? ' · 3rd-place playoff' : ' · no placement playoff'}${plateMode === 'triple' ? ' · triple plate' : plateMode === 'double' ? ' · double plate' : ' · no plate'}.` : `${draft.entries.length} teams are allocated across ${draft.groups?.length || 0} round-robin ${draft.groups?.length === 1 ? 'group' : 'groups'} using a ${seedingTemplate}% seeded draw.`}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button type="button" onClick={saveDraft} disabled={saving || savedDraw?.status === 'published'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-padel-green px-4 py-3 text-sm font-black text-black hover:brightness-110 disabled:opacity-50">
                            {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {savedDraw ? 'Update draft' : 'Save as draft'}
                        </button>
                        {savedDraw?.status === 'draft' && <button type="button" onClick={publishDraft} disabled={saving} className="inline-flex items-center justify-center gap-2 rounded-xl border border-padel-green/40 px-4 py-3 text-sm font-black text-padel-green hover:bg-padel-green/10 disabled:opacity-50"><Send size={16} /> Publish draw</button>}
                        {savedDraw?.status === 'draft' && <a href={`/draws-preview/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white hover:bg-white/10"><Eye size={16} /> Open preview</a>}
                        {savedDraw?.status === 'published' && <a href={`/native-draws/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/15 px-4 py-3 text-sm font-black text-white hover:bg-white/10"><Eye size={16} /> Open public draw</a>}
                    </div>
                </div>
                <div className="border-b border-white/10 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="font-bold text-white">Seed review</p>
                            <p className="text-xs text-gray-400">Choose a seed position or use the arrows to match the intended draw. {draft.format === 'knockout' ? 'Bracket placement' : 'Group allocation and fixtures'} update immediately; no change is saved until you update the draft.</p>
                        </div>
                    </div>
                    <div className="max-h-72 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
                        {seedReviewEntries.map((entry, index) => {
                            const assignedGroup = draft.format === 'knockout' ? null : draft.groups?.find((group) => group.entries?.some((groupEntry) => groupEntry.source_registration_id === entry.source_registration_id));
                            return (
                            <div key={entry.source_registration_id} className="flex items-center gap-3 px-3 py-2.5">
                                <label className="flex shrink-0 items-center gap-1 text-xs font-black text-padel-green"><span className="sr-only">Seed position for {entry.team_name}</span>#<select value={index + 1} onChange={(event) => moveSeedTo(index, Number(event.target.value) - 1)} disabled={settingsLocked} className="rounded-md border border-padel-green/30 bg-[#151515] px-1.5 py-1 text-sm font-black text-padel-green outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50">{seedReviewEntries.map((_, position) => <option key={position + 1} value={position + 1} className="text-black">{position + 1}</option>)}</select></label>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-white">{entry.team_name}</div>
                                    <div className="text-[10px] uppercase tracking-wide text-gray-500">Pair seeding total: {Number(entry.seeding_value || 0).toLocaleString('en-ZA')} · {entry.snapshot?.seeding_label || 'Profile points'}{assignedGroup ? ` · ${assignedGroup.name}` : ''}</div>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" aria-label={`Move ${entry.team_name} up`} onClick={() => moveSeedTo(index, index - 1)} disabled={settingsLocked || index === 0} className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-25"><ChevronUp size={15} /></button>
                                    <button type="button" aria-label={`Move ${entry.team_name} down`} onClick={() => moveSeedTo(index, index + 1)} disabled={settingsLocked || index === seedReviewEntries.length - 1} className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-25"><ChevronDown size={15} /></button>
                                </div>
                            </div>
                            );
                        })}
                    </div>
                </div>
                {(draft.format || 'knockout') === 'knockout' ? <DrawBracketPreview matches={draft.matches} title={`${activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} bracket preview`} /> : <div className="grid gap-4 p-5 md:grid-cols-2">
                    {(draft.groups || []).map((group) => {
                        const groupRows = standingsForGroup(group.id || group.key);
                        const hasResults = groupRows.some((row) => row.played > 0);
                        const advancingCount = draft.format === 'group_knockout' ? Number(advancersPerGroup) : 1;
                        const fixtureCount = group.fixtures?.length || draft.matches.filter((match) => match.group_id === (group.id || group.key)).length;
                        return <div key={group.key || group.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="mb-4 flex items-start justify-between gap-3"><div><p className="font-bold text-padel-green">{group.name}</p><p className="mt-1 text-xs text-gray-500">{hasResults ? (draft.format === 'group_knockout' ? `Top ${advancingCount} currently qualify` : 'Current group leader shown') : 'Results will update the live table'}</p></div>{hasResults && groupRows[0] && <span className="shrink-0 rounded-full border border-padel-green/40 bg-padel-green/10 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">Leader: #{groupRows[0].position}</span>}</div>
                            {groupRows.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-white/10 text-gray-500"><tr><th className="pb-2">#</th><th className="pb-2">Team</th><th className="pb-2 text-center">P</th><th className="pb-2 text-center">W</th><th className="pb-2 text-center">+/-</th><th className="pb-2 text-right">Pts</th></tr></thead><tbody>{groupRows.map((row) => { const entry = draft.entries.find((item) => item.id === row.entry_id); const isLeader = hasResults && row.position === 1 && !row.requires_manual_resolution; const isQualifying = hasResults && row.position <= advancingCount && !row.requires_manual_resolution; return <tr key={row.entry_id} className={row.requires_manual_resolution ? 'bg-amber-300/5 text-amber-200' : isLeader ? 'bg-padel-green/10 text-white' : isQualifying ? 'bg-padel-green/[0.04] text-gray-100' : 'text-gray-300'}><td className="py-2.5 pl-2 font-black"><span className={`inline-flex min-w-6 justify-center rounded-full px-1.5 py-1 ${isLeader ? 'bg-padel-green text-black' : isQualifying ? 'bg-padel-green/15 text-padel-green' : 'text-gray-400'}`}>{row.position}</span></td><td className="py-2.5 pr-2"><div className="font-medium">{entry?.team_name || 'Team'}</div>{isLeader && <span className="mt-1 inline-block text-[10px] font-black uppercase tracking-wide text-padel-green">Leading group</span>}{isQualifying && !isLeader && <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-padel-green/80">Qualifying position</span>}{row.requires_manual_resolution && <span className="mt-1 inline-block text-[10px] font-bold uppercase tracking-wide text-amber-300">Tie to resolve</span>}</td><td className="py-2.5 text-center tabular-nums">{row.played}</td><td className="py-2.5 text-center tabular-nums">{row.won}</td><td className="py-2.5 text-center tabular-nums">{row.games_for - row.games_against}</td><td className="py-2.5 pr-2 text-right font-bold tabular-nums">{row.standings_points}</td></tr>; })}</tbody></table></div> : <div className="space-y-2 text-sm text-gray-200">{group.entries.map((entry) => <p key={entry.source_registration_id || entry.id}>#{entry.seed_number} · {entry.team_name}</p>)}</div>}
                            <p className="mt-4 text-xs text-gray-500">{fixtureCount} round-robin fixtures generated</p>
                        </div>;
                    })}
                </div>}
                </>}
            </div>}

            {savedDraw?.status === 'published' && draft && <div className="rounded-2xl border border-white/10 bg-[#101010] p-5">
                <div className="mb-4"><p className="font-bold text-white">Record results</p><p className="text-xs text-gray-400">Choose the winning team. The winner automatically moves into the next bracket slot.</p></div>
                <div className="mb-5 rounded-xl border border-sky-300/25 bg-sky-300/5 p-4"><div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-sky-300/10 text-sky-200"><CalendarClock size={18} /></span><div><p className="font-bold text-white">Run the live draw</p><p className="mt-1 text-xs leading-5 text-gray-400">Use <strong className="text-gray-200">Match setup</strong> to set a court and start time. Then select <strong className="text-pink-200">Mark live</strong> when the players take the court. These updates appear on the public draw automatically.</p></div></div></div>
                <div className="mb-5 overflow-hidden rounded-xl border border-sky-300/25 bg-sky-300/[0.04]">
                    <button type="button" onClick={() => setShowAutoSchedule((current) => !current)} aria-expanded={showAutoSchedule} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sky-300/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-padel-green"><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-300/10 text-sky-200"><CalendarClock size={16} /></span><span><span className="block text-sm font-bold text-white">Auto-schedule ready matches</span><span className="mt-0.5 block text-xs text-gray-400">Fill only missing courts or times; existing assignments are never overwritten.</span></span></span>{showAutoSchedule ? <ChevronUp size={18} className="text-sky-200" /> : <ChevronDown size={18} className="text-sky-200" />}</button>
                    {showAutoSchedule && <div className="border-t border-sky-300/15 p-4"><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><label className="block text-xs font-bold text-gray-300">Schedule date<input type="date" value={scheduleDefaults.date} onChange={(item) => setScheduleDefaults((current) => ({ ...current, date: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label><label className="block text-xs font-bold text-gray-300">First match<input type="time" value={scheduleDefaults.startTime} onChange={(item) => setScheduleDefaults((current) => ({ ...current, startTime: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label><label className="block text-xs font-bold text-gray-300">Match duration (minutes)<input inputMode="numeric" min="1" type="number" value={scheduleDefaults.matchMinutes} onChange={(item) => setScheduleDefaults((current) => ({ ...current, matchMinutes: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label><label className="block text-xs font-bold text-gray-300">Break (minutes)<input inputMode="numeric" min="0" type="number" value={scheduleDefaults.breakMinutes} onChange={(item) => setScheduleDefaults((current) => ({ ...current, breakMinutes: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label></div><div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs leading-5 text-gray-400">{availableCourts.length > 0 ? `${availableCourts.join(' · ')} will be filled in sequence.` : 'Set the event’s Number of courts to use auto-scheduling.'}</p><button type="button" onClick={autoScheduleReadyMatches} disabled={autoScheduling || availableCourts.length === 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 py-2.5 text-xs font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><CalendarClock size={14} />{autoScheduling ? 'Scheduling…' : 'Auto-schedule missing details'}</button></div></div>}
                </div>
                <div className="mb-5 overflow-hidden rounded-xl border border-pink-300/25 bg-pink-400/[0.04]">
                    <button type="button" onClick={() => setShowPublicControls((current) => !current)} aria-expanded={showPublicControls} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-pink-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-padel-green"><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-400/10 text-pink-200"><Megaphone size={16} /></span><span><span className="block text-sm font-bold text-white">Public tournament centre</span><span className="mt-0.5 block text-xs text-gray-400">Pin an announcement and select the matches spectators should not miss.</span></span></span>{showPublicControls ? <ChevronUp size={18} className="text-pink-200" /> : <ChevronDown size={18} className="text-pink-200" />}</button>
                    {showPublicControls && <div className="border-t border-pink-300/15 p-4"><div className="rounded-lg border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-amber-200"><Star size={16} fill="currentColor" /><p className="text-sm font-bold">Featured matches</p></div><p className="mt-2 text-2xl font-black tabular-nums text-white">{(draft.matches || []).filter((match) => match.is_featured).length}<span className="text-sm text-gray-500">/4</span></p><p className="mt-1 text-xs leading-5 text-gray-400">Use the feature button on a ready match below. Featured matches lead the public overview.</p></div></div>}
                </div>
                <section className="mb-5 rounded-xl border border-pink-300/25 bg-pink-400/[0.04] p-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="flex items-center gap-2 font-bold text-white"><Megaphone size={17} className="text-pink-200" /> Announcement centre</p><p className="mt-1 text-xs leading-5 text-gray-400">Post several updates for this event, its divisions, or the active draw/plate. Newest updates appear first.</p></div><span className="w-fit rounded-full border border-pink-300/25 bg-pink-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-pink-100">{announcements.length} posted</span></div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                        <label className="block text-xs font-bold text-gray-300">Audience<select value={announcementForm.scope} onChange={(item) => setAnnouncementForm((current) => ({ ...current, scope: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-pink-300"><option value="event">Whole event</option><option value="division">{division?.name || 'Current division'}</option><option value="draw">This {activeDrawKind === 'main' ? 'main draw' : `${activeDrawKind} plate`}</option></select></label>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]"><label className="block text-xs font-bold text-gray-300">Title <span className="font-normal text-gray-500">optional</span><input value={announcementForm.title} onChange={(item) => setAnnouncementForm((current) => ({ ...current, title: item.target.value.slice(0, 80) }))} maxLength={80} placeholder="e.g. Schedule update" className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-pink-300" /></label><label className="block text-xs font-bold text-gray-300">Message<textarea value={announcementForm.message} onChange={(item) => setAnnouncementForm((current) => ({ ...current, message: item.target.value.slice(0, 500) }))} maxLength={500} rows={2} placeholder="Share a court delay, match change or event notice…" className="mt-1.5 block w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-pink-300" /></label></div>
                        <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs font-bold text-pink-100"><input type="checkbox" checked={announcementForm.isPinned} onChange={(item) => setAnnouncementForm((current) => ({ ...current, isPinned: item.target.checked }))} className="h-4 w-4 accent-pink-400" /> Pin first</label><button type="button" onClick={createAnnouncement} disabled={saving || !announcementForm.message.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-400 px-3 py-2.5 text-xs font-black text-black transition-transform hover:bg-pink-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><Megaphone size={14} /> Post update</button></div>
                    </div>
                    <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-black/20">{announcements.length > 0 ? announcements.map((announcement) => { const scopeLabel = announcement.draw_id ? `${activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} only` : announcement.division_id ? 'Division' : 'Whole event'; return <div key={announcement.id} className="flex items-start justify-between gap-3 px-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-pink-200">{scopeLabel}</span>{announcement.is_pinned && <span className="rounded-full bg-pink-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-pink-100">Pinned</span>}</div>{announcement.title && <p className="mt-1 text-sm font-bold text-white">{announcement.title}</p>}<p className="mt-1 whitespace-pre-line text-xs leading-5 text-gray-300">{announcement.message}</p></div><button type="button" onClick={() => removeAnnouncement(announcement)} disabled={saving} aria-label="Remove announcement" className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"><Trash2 size={15} /></button></div>; }) : <p className="px-3 py-5 text-sm text-gray-500">No announcements have been posted yet.</p>}</div>
                </section>
                {activeDrawKind === 'main' && hasKnockoutStage && <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-white">Silver plate</p><p className="mt-1 text-xs text-gray-400">{!['double', 'triple'].includes(plateMode) ? 'This existing draw was published without a back draw. Enable a Silver plate to create one from its opening-round losers.' : silverPlate ? `The Silver plate is published${plateMode === 'triple' ? '; its opening-round losers can progress into Bronze.' : ''}` : silverPlateReady ? 'All opening-round main-draw matches are complete. Create the Silver plate from their losing teams.' : 'Complete every opening-round main-draw match to unlock the Silver plate.'}</p></div>{!['double', 'triple'].includes(plateMode) ? <button type="button" onClick={enableSilverPlate} disabled={saving} className="shrink-0 rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">Enable Silver plate</button> : silverPlate ? <a href={`/native-draws/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10">View Silver plate</a> : silverPlateReady && <button type="button" onClick={createSilverPlate} disabled={saving} className="shrink-0 rounded-lg bg-amber-300 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create Silver plate</button>}</div></div>}
                {activeDrawKind === 'silver' && draft.format === 'knockout' && plateMode === 'triple' && <div className="mb-5 rounded-xl border border-orange-400/30 bg-orange-400/5 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-white">Bronze plate</p><p className="mt-1 text-xs text-gray-400">{bronzePlate ? 'The Bronze plate is published and can now be managed separately.' : silverPlateReady ? 'All opening-round Silver plate matches are complete. Create the Bronze plate from their losing teams.' : 'Complete every opening-round Silver plate match to unlock the Bronze plate.'}</p></div>{bronzePlate ? <a href={`/native-draws/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-orange-400/40 px-3 py-2 text-sm font-bold text-orange-200 hover:bg-orange-400/10">View Bronze plate</a> : silverPlateReady && <button type="button" onClick={createBronzePlate} disabled={saving} className="shrink-0 rounded-lg bg-orange-400 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create Bronze plate</button>}</div></div>}
                {draft.format === 'group_knockout' && !draft.matches.some((match) => match.stage === 'knockout') && <div className="mb-5 rounded-xl border border-padel-green/30 bg-padel-green/5 p-4"><p className="font-bold text-white">Elimination phase</p><p className="mt-1 text-xs text-gray-400">{groupStageComplete ? `All group matches are complete. The top ${advancersPerGroup} from each group will advance.` : 'Complete every group match before creating the elimination phase.'}</p>{groupStageComplete && <button type="button" onClick={createKnockoutFromGroups} disabled={saving} className="mt-3 rounded-lg bg-padel-green px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create elimination phase</button>}</div>}
                <div className="space-y-3">
                    {draft.matches.filter((match) => ['pending', 'scheduled', 'in_progress'].includes(match.status) && match.entry_one && match.entry_two).map((match) => (
                        <div key={match.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-widest text-gray-500">{match.round_label} · Match {match.bracket_position}</p><div className="flex items-center gap-2">{match.status === 'in_progress' && <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black"><Radio size={10} className="animate-pulse motion-reduce:animate-none" /> Live</span>}{match.status === 'scheduled' && <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-200">Scheduled</span>}</div></div>
                            {editingMatchId === match.id && <div className="mb-4 rounded-xl border border-sky-300/20 bg-sky-300/[0.04] p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-bold text-white">Match setup</p><p className="mt-1 text-xs text-gray-400">Court and time are visible on the public draw. You can still change them later.</p></div><CalendarClock size={18} className="text-sky-200" /></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-gray-300">Court{availableCourts.length > 0 ? <select value={matchOperations[match.id]?.court_name ?? match.court_name ?? ''} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), court_name: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30"><option value="">Court to be confirmed</option>{!availableCourts.includes(matchOperations[match.id]?.court_name ?? match.court_name ?? '') && (matchOperations[match.id]?.court_name ?? match.court_name) && <option value={matchOperations[match.id]?.court_name ?? match.court_name}>{matchOperations[match.id]?.court_name ?? match.court_name}</option>}{availableCourts.map((court) => <option key={court} value={court}>{court}</option>)}</select> : <input value={matchOperations[match.id]?.court_name ?? match.court_name ?? ''} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), court_name: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" placeholder="e.g. Court 1" />}</label><label className="block text-xs font-bold text-gray-300">Scheduled start<input type="datetime-local" value={matchOperations[match.id]?.scheduled_start ?? toLocalDateTimeInput(match.scheduled_start)} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), scheduled_start: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label></div><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => saveMatchOperations(match)} disabled={saving} className="rounded-lg bg-sky-300 px-3 py-2 text-xs font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:opacity-50">Save match setup</button><button type="button" onClick={() => setEditingMatchId(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-gray-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Cancel</button></div></div>}
                            {recordingMatchId === match.id ? <div className="space-y-5">
                                <div>
                                    <div className="mb-2 flex items-center justify-between gap-3"><p className="text-xs font-black uppercase tracking-widest text-gray-400">1. Select winner</p>{recordingWinnerId && <span className="rounded-full bg-padel-green/15 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">Winner selected</span>}</div>
                                    <div className="grid gap-2 md:grid-cols-2">
                                        {[match.entry_one, match.entry_two].map((entry) => {
                                            const selected = recordingWinnerId === entry.id;
                                            return <button key={entry.id} type="button" aria-pressed={selected} onClick={() => setRecordingWinnerId(entry.id)} className={`rounded-xl border p-4 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green ${selected ? 'border-padel-green bg-padel-green/10 text-white' : 'border-white/10 bg-black/20 text-gray-300 hover:border-white/30'}`}><span className={`mb-2 inline-flex rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wide ${selected ? 'bg-padel-green text-black' : 'bg-white/10 text-gray-400'}`}>{selected ? 'Winner' : 'Select winner'}</span><span className="block text-sm font-semibold leading-5">{entry.team_name}</span></button>;
                                        })}
                                    </div>
                                </div>
                                <div>
                                    <p className="mb-2 text-xs font-black uppercase tracking-widest text-gray-400">2. Match outcome</p>
                                    <div className="grid gap-2 sm:grid-cols-3">
                                        {[['played', 'Played', 'Normal result'], ['walkover', 'Walkover', 'Opponent did not play'], ['retirement', 'Retirement', 'Match ended early']].map(([value, label, description]) => <button key={value} type="button" aria-pressed={recordingResultType === value} onClick={() => setRecordingResultType(value)} className={`rounded-xl border px-3 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green ${recordingResultType === value ? 'border-padel-green bg-padel-green/10 text-white' : 'border-white/10 bg-black/20 text-gray-300 hover:border-white/30'}`}><span className="block text-sm font-bold">{label}</span><span className="mt-1 block text-xs text-gray-500">{description}</span></button>)}
                                    </div>
                                </div>
                                {recordingResultType !== 'walkover' && <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
                                    <div className="mb-4"><p className="text-xs font-black uppercase tracking-widest text-gray-400">3. Set scores <span className="normal-case font-normal tracking-normal text-gray-500">Optional</span></p><p className="mt-1 text-xs text-gray-500">Leave a set blank if it was not played.</p></div>
                                    <div className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-end gap-2 border-b border-white/10 pb-2 text-xs font-semibold text-gray-500"><span></span><span className="truncate" title={match.entry_one.team_name}>{match.entry_one.team_name}</span><span className="truncate" title={match.entry_two.team_name}>{match.entry_two.team_name}</span></div>
                                    <div className="mt-2 space-y-2">
                                        {recordingSets.map((set, index) => <div key={index} className="grid grid-cols-[3.25rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2"><span className="text-xs font-bold text-gray-500">Set {index + 1}</span><input aria-label={`${match.entry_one.team_name} set ${index + 1} games`} inputMode="numeric" type="number" min="0" value={set[0]} onChange={(event) => setRecordingSets((sets) => sets.map((item, itemIndex) => itemIndex === index ? [event.target.value, item[1]] : item))} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white outline-none focus-visible:border-padel-green focus-visible:ring-2 focus-visible:ring-padel-green/30 sm:text-sm" placeholder="–" /><input aria-label={`${match.entry_two.team_name} set ${index + 1} games`} inputMode="numeric" type="number" min="0" value={set[1]} onChange={(event) => setRecordingSets((sets) => sets.map((item, itemIndex) => itemIndex === index ? [item[0], event.target.value] : item))} className="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-base text-white outline-none focus-visible:border-padel-green focus-visible:ring-2 focus-visible:ring-padel-green/30 sm:text-sm" placeholder="–" /></div>)}
                                    </div>
                                    {recordingSets.length < 3 && <button type="button" onClick={() => setRecordingSets((sets) => [...sets, ['', '']])} className="mt-3 text-xs font-bold text-padel-green hover:underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">+ Add deciding set</button>}
                                </div>}
                                <div className="flex flex-wrap items-center gap-3 border-t border-white/10 pt-4"><button type="button" onClick={() => recordResult(match)} disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-padel-green px-4 py-3 text-sm font-bold text-black transition-transform active:scale-95 disabled:opacity-50"><CheckCircle2 size={16} /> Confirm outcome</button><button type="button" onClick={() => { setRecordingMatchId(null); setRecordingWinnerId(''); setRecordingResultType('played'); }} className="rounded-xl px-4 py-3 text-sm text-gray-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Cancel</button></div>
                            </div> : <div className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><span className="text-sm text-white">{match.entry_one.team_name} <span className="text-gray-500">vs</span> {match.entry_two.team_name}</span><p className="mt-1 text-xs text-gray-500">{[match.court_name, match.scheduled_start ? new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null].filter(Boolean).join(' · ') || 'Court and time not set'}</p></div><div className="flex flex-wrap gap-2"><button type="button" onClick={() => openMatchOperations(match)} className="rounded-lg border border-sky-300/30 px-3 py-2 text-xs font-bold text-sky-200 transition-colors hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Match setup</button>{match.status === 'in_progress' ? <button type="button" onClick={() => setMatchLive(match, false)} disabled={saving} className="rounded-lg border border-pink-300/30 px-3 py-2 text-xs font-bold text-pink-200 transition-colors hover:bg-pink-400/10 disabled:opacity-50">End live</button> : <button type="button" onClick={() => setMatchLive(match, true)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-pink-300/45 px-3 py-2 text-xs font-bold text-pink-100 transition-colors hover:bg-pink-400/10 disabled:opacity-50"><Radio size={13} /> Mark live</button>}<button type="button" onClick={() => toggleFeaturedMatch(match)} disabled={saving} aria-pressed={Boolean(match.is_featured)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${match.is_featured ? 'border-amber-300/55 bg-amber-300/10 text-amber-200' : 'border-amber-300/30 text-amber-100 hover:bg-amber-300/10'}`}><Star size={13} fill={match.is_featured ? 'currentColor' : 'none'} />{match.is_featured ? 'Featured' : 'Feature'}</button><button type="button" onClick={() => { setRecordingMatchId(match.id); setRecordingWinnerId(''); setRecordingResultType('played'); setRecordingSets([['', ''], ['', '']]); }} className="rounded-lg border border-padel-green/40 px-3 py-2 text-xs font-bold text-padel-green hover:bg-padel-green/10">Record result</button></div></div></div>}
                        </div>
                    ))}
                </div>
                <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-white">Complete this draw</p><p className="mt-1 text-xs text-gray-400">{drawReadyToComplete ? 'All playable matches have a recorded outcome. Lock this draw before reviewing ranking points.' : 'Complete every playable match before finalising this draw.'}</p></div><button type="button" onClick={completeDraw} disabled={saving || !drawReadyToComplete} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-padel-green/40 px-4 py-3 text-sm font-black text-padel-green hover:bg-padel-green/10 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={16} /> Mark complete</button></div>
            </div>}

            {savedDraw?.status === 'completed' && draft && <>
                {activeDrawKind === 'main' && hasKnockoutStage && <section className="rounded-2xl border border-sky-400/30 bg-sky-400/5 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300"><Award size={20} /></span>
                            <div className="min-w-0"><p className="font-bold text-white">Ranking-points approval</p><p className="mt-1 text-sm text-gray-400">Check the final placements, then record the official award for every eligible player. Rankedin-synchronised profile data is not changed.</p></div>
                        </div>
                        {rankingAwards.length > 0 && <span className="w-fit rounded-full border border-padel-green/30 bg-padel-green/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-padel-green">{rankingAwards.length} awarded</span>}
                    </div>
                    {rankingPointsLoading || rankingAwardsLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" /> Loading points configuration…</div> : !division?.ranking_tier_id || !division?.ranking_category ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">Set this division’s ranking tier and category in Event Builder before its final placements can be priced.</div> : !rankingTier || rankingPointsTable.length === 0 ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">The selected ranking configuration could not be found. No points can be awarded.</div> : rankingReview.length === 0 ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">No complete knockout placements are available to review.</div> : <>
                        <div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500"><tr><th className="px-4 py-3">Team</th><th className="px-4 py-3">Final placement</th><th className="px-4 py-3">Players</th><th className="px-4 py-3 text-right">Points each</th><th className="px-4 py-3 text-right">Award status</th></tr></thead><tbody className="divide-y divide-white/10">{rankingReview.map((proposal) => {
                            const playerIds = [proposal.entry.player_one_id, proposal.entry.player_two_id].filter(Boolean);
                            const awardedCount = playerIds.filter((id) => rankingAwardsByPlayerId.has(String(id))).length;
                            return <tr key={proposal.entry_id}><td className="px-4 py-3 font-semibold text-white">{proposal.entry.team_name}</td><td className="px-4 py-3"><span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-gray-200">{proposal.placement}</span>{proposal.requiresManualPlacement ? <label className="mt-2 block max-w-xs text-xs font-semibold text-amber-100">Confirm official placement<select value={proposal.selectedRoundCode} onChange={(item) => { setPlacementOverrides((current) => ({ ...current, [proposal.entry_id]: item.target.value })); setAwardConfirmed(false); }} className="mt-1 block w-full rounded-lg border border-amber-300/30 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus-visible:border-amber-200"><option value="">Choose placement…</option>{rankingPointsTable.map((rule) => <option key={rule.id} value={rule.round_code}>{rule.round_label} · {rule.points.toLocaleString('en-ZA')} pts</option>)}</select></label> : proposal.note && <p className="mt-1 max-w-xs text-xs text-amber-200">{proposal.note}</p>}</td><td className="px-4 py-3 text-xs text-gray-400">{[proposal.entry.player_one_name, proposal.entry.player_two_name].filter(Boolean).join(' · ')}</td><td className="px-4 py-3 text-right font-black text-padel-green">{proposal.pointsRule ? proposal.pointsRule.points.toLocaleString('en-ZA') : 'Review needed'}</td><td className="px-4 py-3 text-right text-xs font-bold">{awardedCount === playerIds.length && playerIds.length > 0 ? <span className="text-padel-green">Awarded</span> : awardedCount > 0 ? <span className="text-amber-200">{awardedCount}/{playerIds.length} recorded</span> : <span className="text-gray-500">Pending</span>}</td></tr>;
                        })}</tbody></table></div>
                        {missingPlayerProfiles.length > 0 && <p className="mt-3 rounded-xl border border-red-300/30 bg-red-400/5 px-4 py-3 text-xs leading-5 text-red-100">Points cannot be awarded until these draw players have linked 4M profiles: <strong>{missingPlayerProfiles.join(' · ')}</strong>.</p>}
                        {unpricedRankingReview.length > 0 && <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100">{unpricedRankingReview.length} {unpricedRankingReview.length === 1 ? 'team needs' : 'teams need'} an official placement selected before points can be awarded.</p>}
                        <div className="mt-4 flex flex-col gap-4 rounded-xl border border-padel-green/25 bg-padel-green/[0.04] p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-white">Award verified points</p><p className="mt-1 text-xs leading-5 text-gray-400">This records {pendingAwardablePlayerRows.length} missing {pendingAwardablePlayerRows.length === 1 ? 'player award' : 'player awards'} in the audit ledger. Existing awards are never overwritten.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="flex items-center gap-2 text-xs font-bold text-padel-green"><input type="checkbox" checked={awardConfirmed} onChange={(item) => setAwardConfirmed(item.target.checked)} disabled={pendingAwardablePlayerRows.length === 0} className="h-4 w-4 accent-[#b6ff00]" /> I have checked the final placements</label><button type="button" onClick={awardRankingPoints} disabled={saving || !awardConfirmed || pendingAwardablePlayerRows.length === 0 || unpricedRankingReview.length > 0 || missingPlayerProfiles.length > 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-padel-green px-4 py-3 text-sm font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><Award size={16} />{pendingAwardablePlayerRows.length === 0 ? 'Points awarded' : `Award ${pendingAwardablePlayerRows.length} players`}</button></div></div>
                    </>}
                </section>}
                <div className="rounded-2xl border border-padel-green/30 bg-padel-green/5 p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-padel-green/15 text-padel-green"><CheckCircle2 size={20} /></span><div><p className="font-bold text-white">{activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} complete</p><p className="mt-1 text-sm text-gray-400">Results are locked for this draw. Review the final placements before any ranking points are awarded.</p></div></div></div>
            </>}
        </div>
    );
};

export default NativeDrawManager;
