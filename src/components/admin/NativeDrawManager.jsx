import './draw-workflow.css';
import DrawSideDrawer from './DrawSideDrawer';
import { DrawDivisionNavigation, DrawWorkflowOverview } from './DrawWorkflowNavigation';
import { divisionWorkflow } from '../../utils/drawWorkflow';
import { pairRegistrations } from '../../utils/drawPairing';
import DrawProgression from './DrawProgression';
import DrawPlayerReview from './DrawPlayerReview';
import { reviewFingerprint } from '../../utils/drawPlayerReview';
import { routeIds, placementRangeOptions, backDrawExplanation, placementPlayoffExplanation } from '../../utils/drawBackplates';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Award, Brackets, CalendarClock, CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, Megaphone, Radio, RefreshCcw, Save, Send, Star, Trash2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { generateGroupStageDraft, generateKnockoutDraft, nextPowerOfTwo } from '../../utils/nativeDrawGenerator';
import { moveDrawPreviewMatch, swapDrawPreviewPositions } from '../../utils/drawPreviewEditing';
import { areGroupMatchesComplete, calculateGroupStandings } from '../../utils/nativeDrawStandings';
import { deriveKnockoutPlacementProposals } from '../../utils/nativeDrawPlacements';
import { addEventPlayDay, mergeEventPlayDays, buildEventPlayDays } from '../../utils/nativeDrawScheduler';
import { listRankingCategories, listRankingOrganisations, resolvePlayerRanking } from '../../utils/playerRankingSelection';
import { extractRankedinId } from '../../utils/rankedinLink';
import { useRankedin } from '../../hooks/useRankedin';
import DrawBracketPreview from './DrawBracketPreview';
import MatchScoreDialog from './MatchScoreDialog';
import RecordedMatchResults from './RecordedMatchResults';
import { matchScoreText, pricePlacement, buildRankingAwardRows } from '../../utils/matchResult';
import DrawSchedulingBoard from './DrawSchedulingBoard';
import AmericanoDraw from './AmericanoDraw';
import DrawWorkspaceHeader from './DrawWorkspaceHeader';

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

const formatPlayDay = (value) => new Date(`${value}T00:00:00Z`).toLocaleDateString('en-ZA', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
});

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

const NativeDrawManager = ({ event, divisions, registrations, playersByEmail, onSaved, onDivisionRankingSourceChange, sandboxTesting = false, onRestartSandbox, onExpandTestCount }) => {
    const { getTournamentParticipants } = useRankedin();
    const [divisionId, setDivisionId] = useState('');
    const [overview, setOverview] = useState(true);
    const [drawer, setDrawer] = useState(null);
    const [workflowData, setWorkflowData] = useState({ reviews: {}, draws: [], matches: [], entries: [], awards: [] });
    const [workflowConfigs, setWorkflowConfigs] = useState({});
    const [workflowLoading, setWorkflowLoading] = useState(true);
    const [workflowError, setWorkflowError] = useState('');
    const [workflowRevision, setWorkflowRevision] = useState(0);
    useEffect(() => {
        let active = true;
        Promise.all([
            supabase.from('draw_player_reviews').select('division_id,state').eq('event_id', event.id),
            supabase.from('draws').select('id,division_id,draw_kind,status,format,scoring_rules').eq('event_id', event.id),
            supabase.from('draw_matches').select('id,draw_id,stage,round_number,round_code,entry_one_id,entry_two_id,winner_entry_id,loser_entry_id,winner_to_match_id,winner_to_slot,loser_to_match_id,loser_to_slot,result_type,status,scheduled_start,court_name,draws!inner(event_id)').eq('draws.event_id', event.id),
            supabase.from('draw_entries').select('id,draw_id,player_one_id,player_two_id,player_two_name,draws!inner(event_id)').eq('draws.event_id', event.id),
            supabase.from('player_ranking_points').select('division_id,player_id,points').eq('event_id', event.id),
        ]).then(([reviews, draws, matches, entries, awards]) => {
            if (!active) return;
            setWorkflowLoading(false);
            if (reviews.error || draws.error || matches.error || entries.error || awards.error) { setWorkflowError((reviews.error || draws.error || matches.error || entries.error || awards.error).message); return; }
            setWorkflowError('');
            const states = Object.fromEntries((reviews.data || []).map(r => [r.division_id, r.state]));
            setWorkflowData({reviews: states, draws: draws.data || [], matches: matches.data || [], entries: entries.data || [], awards: awards.data || []});
            setWorkflowConfigs(current => Object.fromEntries(divisions.map(d => [d.id, current[d.id] || states[d.id]?.workflow || {}])));
        }).catch(error => {if(active){setWorkflowError(error.message);setWorkflowLoading(false);}});
        return () => { active = false; };
    }, [event.id, workflowRevision, divisions]);

    const [restartConfirmed, setRestartConfirmed] = useState(false);
    const [restarting, setRestarting] = useState(false);
    const [workspace, setWorkspace] = useState('players');
    const [playerReview, setPlayerReview] = useState(null);
    const [reviewLoading, setReviewLoading] = useState(false);
    const [reviewError, setReviewError] = useState('');
    const [showFormatChoices, setShowFormatChoices] = useState(true);
    const [scheduleAlertHost, setScheduleAlertHost] = useState(null);
    const workspaceRef = useRef(null);
    useEffect(() => { workspaceRef.current?.scrollIntoView({ block: 'start' }); }, [workspace]);
    const [matchSearch, setMatchSearch] = useState('');
    const [matchRound, setMatchRound] = useState('all');
    const [draft, setDraft] = useState(null);
    const [savedDraw, setSavedDraw] = useState(null);
    const [loadingSaved, setLoadingSaved] = useState(false);
    const [recordingMatchId, setRecordingMatchId] = useState(null);
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
    const [seededTeamCount, setSeededTeamCount] = useState(null);
    const [rankingSource, setRankingSource] = useState('active');
    const [rankedInClassSeedings, setRankedInClassSeedings] = useState(new Map());
    const [rankedInClassSeedingsLoading, setRankedInClassSeedingsLoading] = useState(false);
    const [silverPlate, setSilverPlate] = useState(null);
    const [bronzePlate, setBronzePlate] = useState(null);
    const [activeDrawKind, setActiveDrawKind] = useState('main');
    const [availableDraws, setAvailableDraws] = useState([]);
    const [saving, setSaving] = useState(false);
    const [confirmReopen, setConfirmReopen] = useState(false);
    const [draftDirty, setDraftDirty] = useState(false);
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
    const [showPublicControls, setShowPublicControls] = useState(false);
    const [showBulkMatchSetup, setShowBulkMatchSetup] = useState(false);
    const [scheduleDirty, setScheduleDirty] = useState(false);
    const [bulkUpdating, setBulkUpdating] = useState(false);
    const [bulkMatchSetup, setBulkMatchSetup] = useState({
        scope: 'all',
        court_name: '',
        scheduled_start: '',
        interval_minutes: '30',
        overwrite_courts: false,
        overwrite_times: false,
    });
    const [playDays, setPlayDays] = useState(() => buildEventPlayDays(event));
    const [, setSelectedPlayDate] = useState(() => String(event?.start_date || '').slice(0, 10));
    const [playDaysLoading, setPlayDaysLoading] = useState(false);
    const [playDaysSaving, setPlayDaysSaving] = useState(false);
    const [newPlayDate, setNewPlayDate] = useState('');

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
        const courtCount = Math.max(Number(event?.courts_count) || 0, ...playDays.filter((day) => day.is_active).map((day) => Number(day.courts_count) || 0));
        return Number.isInteger(courtCount) && courtCount > 0
            ? Array.from({ length: courtCount }, (_, index) => `Court ${index + 1}`)
            : [];
    }, [event?.courts_count, playDays]);
    const divisionRegistrations = useMemo(() => registrations.filter(r => r.division_id === divisionId && String(r.status||'').toLowerCase() !== 'withdrawn'), [registrations,divisionId]);
    useEffect(() => {
        let active=true; setPlayerReview(null); setReviewError('');
        if (!divisionId) return;
        setReviewLoading(true);
        supabase.from('draw_player_reviews').select('state').eq('division_id',divisionId).maybeSingle().then(({data,error})=>{
            if(active){setPlayerReview(data?.state||null);setReviewError(error?.message||'');setReviewLoading(false);}
        });
        return ()=>{active=false;};
    },[divisionId]);
    const reviewValid = Boolean(playerReview && playerReview.fingerprint === reviewFingerprint(divisionRegistrations,playersByEmail,event));
    const eligibleRegistrations = useMemo(() => divisionRegistrations.filter(r => !playerReview?.excluded?.includes(r.id) && (isEligible(r) || playerReview?.exceptions?.[r.id]?.trim())).map(r=>({...r,draw_exception:playerReview?.exceptions?.[r.id]||null})), [divisionRegistrations,playerReview]);
    const teams = useMemo(() => { if(drawFormat !== 'americano' && playerReview?.pairs?.length){try{return pairRegistrations(eligibleRegistrations,playerReview.pairs);}catch{return dedupePairRegistrations(eligibleRegistrations);}}return dedupePairRegistrations(eligibleRegistrations); }, [eligibleRegistrations,drawFormat,playerReview]);
    const participatingPlayers = useMemo(() => teams.flatMap(r => [playersByEmail.get(normaliseEmail(r.email)),playersByEmail.get(normaliseEmail(r.partner_email))]).filter(Boolean), [teams,playersByEmail]);
    const rankingOrganisations = useMemo(() => listRankingOrganisations(participatingPlayers), [participatingPlayers]);
    const rankingCategories = useMemo(() => listRankingCategories(participatingPlayers), [participatingPlayers]);
    const allReviewEntries = useMemo(() => dedupePairRegistrations(divisionRegistrations).map((r,i)=>registrationToEntry(r,i,playersByEmail,rankingSource,rankedInClassSeedings)),[divisionRegistrations,playersByEmail,rankingSource,rankedInClassSeedings]);
    const entries = useMemo(() => teams.map((r,i) => {
        const entry=registrationToEntry(r,i,playersByEmail,rankingSource,rankedInClassSeedings);
        const seed=playerReview?.seeds?.indexOf(r.id) ?? -1;
        return {...entry,seed_number:seed>=0?seed+1:null,snapshot:{...entry.snapshot,draw_exception:playerReview?.exceptions?.[r.id]||null}};
    }), [teams,playersByEmail,rankingSource,rankedInClassSeedings,playerReview]);
    const eliminationSize = nextPowerOfTwo(drawFormat === 'group_knockout' ? Number(groupCount) * Number(advancersPerGroup) : entries.length);
    const backDrawHelp = backDrawExplanation(plateMode, eliminationSize);
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
        let active = true;
        const defaults = buildEventPlayDays(event);
        setPlayDaysLoading(true);
        supabase.from('event_play_days').select('id, play_date, start_time, end_time, courts_count, match_duration_minutes, minimum_break_minutes, is_active, is_removed').eq('event_id', event.id).order('play_date')
            .then(({ data, error }) => {
                if (!active) return;
                if (error) {
                    console.error('Failed to load event play days', error);
                    setPlayDays(defaults);
                } else {
                    const merged = mergeEventPlayDays(defaults, data || []);
                    setPlayDays(merged);
                    setSelectedPlayDate(current => merged.some(day => day.play_date === current) ? current : merged[0]?.play_date || '');
                }
                if (error) setSelectedPlayDate(defaults[0]?.play_date || '');
            })
            .finally(() => { if (active) setPlayDaysLoading(false); });
        return () => { active = false; };
    }, [event]);

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
                const priced = pricePlacement(proposal, rankingPointsTable, savedDraw.scoring_rules?.ranking_points);
                const selectedRoundCode = placementOverrides[proposal.entry_id] || priced.selectedRoundCode;
                return { ...priced, selectedRoundCode, pointsRule: selectedRoundCode === priced.selectedRoundCode ? priced.pointsRule : pointsByRound.get(selectedRoundCode) || null };
            });
    }, [activeDrawKind, savedDraw?.status, draft, hasKnockoutStage, rankingPointsTable, rankingTier?.code, placementOverrides, savedDraw?.scoring_rules]);

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
                    .select('id, draw_kind, status, format, group_count, advancers_per_group, generated_at, updated_at, scoring_rules, public_announcement, announcement_updated_at')
                    .eq('division_id', divisionId)
                    .order('created_at');
                if (drawError) throw drawError;
                const draw = (divisionDraws || []).find((item) => item.draw_kind === activeDrawKind);
                if (active) setAvailableDraws(divisionDraws || []);
                if (!draw) {
                    if (active) { setSavedDraw(null); setSilverPlate(null); setBronzePlate(null); setDraft(null); }
                    return;
                }
                if (draw.format === 'americano') {
                    if (active) { setShowFormatChoices(false); setSavedDraw(draw); setDrawFormat(draw.scoring_rules?.americano?.variant==='team'?'team_americano':'americano'); setDraft(null); }
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
                    group_key: match.group_id,
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
                setConfirmReopen(false);
                setDraftDirty(false);
                setSavedGroups(groups || []);
                setStandings(savedStandings || []);
                setMatchSets(savedSets || []);
                setShowFormatChoices(false);
                setDrawFormat(draw.format || 'knockout');
                setGroupCount(String(draw.group_count || 1));
                setAdvancersPerGroup(String(draw.advancers_per_group || 2));
                setPlateMode(draw.scoring_rules?.plate_mode || 'none');
                setPlayoffMode(draw.scoring_rules?.playoff_mode || 'none');
                setSeedingTemplate(String(draw.scoring_rules?.seeding_template_percent ?? 100));
                setSeededTeamCount(draw.scoring_rules?.seeded_team_count ?? null);
                setRankingSource(draw.scoring_rules?.ranking_source || 'active');
                setSilverPlate((divisionDraws || []).find((item) => item.draw_kind === 'silver') || null);
                setBronzePlate((divisionDraws || []).find((item) => item.draw_kind === 'bronze') || null);
                setDraft({
                    format: draw.format || 'knockout',
                    draw_size: nextPowerOfTwo((savedEntries || []).length),
                    total_rounds: Math.max(...matches.filter(match=>match.stage==='knockout').map((match) => match.round_number), 0),
                    entries: (savedEntries || []).map((entry) => ({ ...entry, group_key: entry.group_id })),
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
        if (!reviewValid) { toast.error('Confirm players and seedings in step 1 first.'); setWorkspace('players'); return; }
        if (!divisionId) {
            toast.error('Select a division first');
            return;
        }
        if (savedDraw && savedDraw.status !== 'draft') {
            toast.error('A published draw cannot be regenerated. Its entries and results are now locked.');
            return;
        }
        try {
            if (entries.some(entry => !entry.player_two_name)) { setWorkspace('players'); throw new Error('Select Create fixed pairs in Players, check the partners, then confirm players and seeds.'); }
            setDraftDirty(true);
            if (drawFormat === 'knockout') {
                setDraft({ ...generateKnockoutDraft(entries, {
                    seedingMethod: 'native_ranking',
                    seededCount: effectiveSeedCount,
                    placementPlayoff: playoffMode, plateMode,
                }), format: 'knockout' });
            } else {
                if (Number(groupCount) > entries.length) throw new Error('There must be at least one team per group');
                if (drawFormat === 'group_knockout' && Number(advancersPerGroup) > smallestGroupSize) {
                    throw new Error(`Only ${smallestGroupSize} ${smallestGroupSize === 1 ? 'team' : 'teams'} fit in the smallest group; reduce the number advancing`);
                }
                if (drawFormat === 'group_knockout' && Number(groupCount) * Number(advancersPerGroup) < 2) {
                    throw new Error('At least two teams must advance to the elimination phase');
                }
                setDraft(generateGroupStageDraft(entries, { format: drawFormat, groupCount: Number(groupCount), seedingMethod: 'native_ranking', seededCount: effectiveSeedCount }));
            }
            setWorkspace('review');
        } catch (error) {
            toast.error(error.message);
        }
    };

    const swapPreviewPositions = (from, to) => {
        if (!draft || saving || loadingSaved || (savedDraw && savedDraw.status !== 'draft')) {
            throw new Error('Only an editable draft can have its positions swapped.');
        }
        setDraft(swapDrawPreviewPositions(draft, from, to));
        setDraftDirty(true);
    };

    const movePreviewMatch = (fromKey, toKey) => {
        if (!draft || saving || loadingSaved || (savedDraw && savedDraw.status !== 'draft')) {
            throw new Error('Only an editable draft can have its matches moved.');
        }
        setDraft(moveDrawPreviewMatch(draft, fromKey, toKey));
        setDraftDirty(true);
    };

    const resolveSavedRoutes = async (drawId) => {
        const {error} = await supabase.rpc('resolve_draw_routes', {p_draw_id:drawId});
        if (error) throw error;
        const {data:matches,error:loadError} = await supabase.from('draw_matches').select('*').eq('draw_id',drawId).order('round_number').order('bracket_position');
        if (loadError) throw loadError;
        setDraft(current => current ? {...current,matches:matches.map(m=>({...m,key:m.id,entry_one:current.entries.find(e=>e.id===m.entry_one_id)||null,entry_two:current.entries.find(e=>e.id===m.entry_two_id)||null,winner:current.entries.find(e=>e.id===m.winner_entry_id)||null}))} : current);
    };

    const saveDraft = async () => {
        if (!draft || !division) return;
        setSaving(true);
        try {
            const hasElimination = ['knockout', 'group_knockout'].includes(draft.format);
            const scoringRules = { sets_to_win: 2, golden_point: true, match_tiebreak: false, plate_mode: hasElimination ? plateMode : 'none', playoff_mode: hasElimination ? playoffMode : 'none', seeding_template_percent: Number(seedingTemplate), seeded_team_count: effectiveSeedCount, seeding_placement: 'grouped', ranking_source: rankingSource, player_review: playerReview };
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
                if (!newDraw?.id) throw new Error('The database did not return the saved draw. Reload and try again.');
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
                .insert(draft.entries.map(({ group_key, ...entry }) => ({
                    ...entry,
                    draw_id: draw.id,
                    seed_number: entry.seed_number ?? null,
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
                        court_name: match.court_name || null,
                        scheduled_start: match.scheduled_start || null,
                        scheduled_end: match.scheduled_end || null,
                    };
                }))
                .select('id, stage, round_number, bracket_position');
            if (matchesError) throw matchesError;

            const matchIdByPosition = new Map(savedMatches.map((match) => [`${match.stage}:${match.round_number}:${match.bracket_position}`, match.id]));
            const idForMatch = (match) => matchIdByPosition.get(`${match.stage}:${match.round_number}:${match.bracket_position}`);
            const routes = routeIds(draft.matches, idForMatch);
            const links = draft.matches.map(match => supabase.from('draw_matches').update(routes.get(match.key)).eq('id', idForMatch(match)));
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
                    ...routes.get(match.key),
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
            await resolveSavedRoutes(draw.id);
            toast.success(`${division.name} draw ${existing ? 'updated' : 'saved'} as a draft`);
            const {data: savedRecord, error: savedRecordError} = await supabase.from('draws').select('*').eq('id', draw.id).single();
            if (savedRecordError) throw savedRecordError;
            setSavedDraw(savedRecord);
            setDraftDirty(false);
            onSaved?.();
            return savedRecord;
        } catch (error) {
            console.error('Failed to save native draw draft', error);
            toast.error(error.message || 'Could not save the draw draft');
        } finally {
            setSaving(false);
        }
    };

    const reopenForCorrections = async () => {
        if (!savedDraw?.id || savedDraw.status !== 'published' || activeDrawKind !== 'main') return;
        setSaving(true);
        try {
            const { error } = await supabase.rpc('reopen_native_draw_for_corrections', { p_draw_id: savedDraw.id });
            if (error) throw error;
            setSavedDraw((current) => ({ ...current, status: 'draft' }));
            setConfirmReopen(false);
            setShowDrawSetup(true);
            setShowDrawConfiguration(true);
            setDraftDirty(false);
            toast.success('Draw reopened. Adjust seeds, update the draft, then review and republish.');
            onSaved?.();
        } catch (error) {
            toast.error(error.code === 'PGRST202'
                ? 'Apply the reopen-draw SQL migration before using this action.'
                : error.message || 'Could not reopen this draw.');
        } finally {
            setSaving(false);
        }
    };

    const restartSandbox = async () => {
        if (!sandboxTesting || !onRestartSandbox || !restartConfirmed || restarting) return;
        setRestarting(true);
        try {
            await onRestartSandbox(divisionId);
            setSavedDraw(null); setDraft(null); setAvailableDraws([]); setMatchSets([]); setSavedGroups([]); setStandings([]);
            setActiveDrawKind('main'); setDrawFormat('knockout'); setPlateMode('none'); setPlayoffMode('none'); setDraftDirty(false);
            setRecordingMatchId(null); setShowFormatChoices(true); setShowDrawSetup(true); setShowDrawConfiguration(true);
            setRestartConfirmed(false); setWorkspace('setup');
            toast.success('Sandbox draw restarted. Choose a new format.');
        } catch (error) { toast.error(error.message || 'Could not restart the sandbox draw'); }
        finally { setRestarting(false); }
    };

    const publishDraft = async (destination = 'schedule') => {
        if (draftDirty) {
            toast.error('Update the draft to save your seed changes before publishing.');
            return;
        }
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
            setShowDrawSetup(true);
            setWorkspace(typeof destination === 'string' ? destination : 'schedule');
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
            const scheduledDay = values.scheduled_start ? playDays.find((day) => day.play_date === values.scheduled_start.slice(0, 10)) : null;
            const scheduledEnd = scheduledStart && scheduledDay
                ? new Date(scheduledStart.getTime() + Number(scheduledDay.match_duration_minutes) * 60_000)
                : null;
            const updates = {
                court_name: String(values.court_name || '').trim() || null,
                scheduled_start: scheduledStart ? scheduledStart.toISOString() : null,
                scheduled_end: scheduledEnd ? scheduledEnd.toISOString() : null,
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

    const updatePlayDay = (date, updates) => {
        setPlayDays((current) => current.map((day) => day.play_date === date ? { ...day, ...updates } : day));
    };

    const removePlayDay = async (date) => {
        setPlayDaysSaving(true);
        try {
            const {error} = await supabase.rpc('remove_event_play_day', {p_event_id:event.id,p_play_date:date});
            if (error) throw error;
            setPlayDays(current => current.filter(day => day.play_date !== date));
            setSelectedPlayDate(current => current === date ? '' : current);
            toast.success('Play day removed. You can add the date again if needed.');
        } catch(error) { toast.error(error.message || 'Could not remove the play day'); }
        finally { setPlayDaysSaving(false); }
    };

    const savePlayDaySettings = async () => {
        if (playDays.length === 0) {
            toast.error('Set the event start and end dates before configuring play days.');
            return;
        }
        const invalid = playDays.find((day) => (
            !day.play_date || !day.start_time || !day.end_time || day.end_time <= day.start_time
            || Number(day.courts_count) < 1 || Number(day.match_duration_minutes) < 1 || Number(day.minimum_break_minutes) < 0
        ));
        if (invalid) {
            toast.error(`Check the times and court settings for ${invalid.play_date}.`);
            return;
        }
        if (!playDays.some((day) => day.is_active)) {
            toast.error('Select at least one play day.');
            return;
        }
        setPlayDaysSaving(true);
        try {
            const rows = playDays.map((day) => ({
                event_id: event.id,
                play_date: day.play_date,
                start_time: day.start_time,
                end_time: day.end_time,
                courts_count: Number(day.courts_count),
                match_duration_minutes: Number(day.match_duration_minutes),
                minimum_break_minutes: Number(day.minimum_break_minutes),
                is_active: day.is_active,
                is_removed: false,
                updated_at: new Date().toISOString(),
            }));
            const { data, error } = await supabase.from('event_play_days').upsert(rows, { onConflict: 'event_id,play_date' }).select('id, play_date, start_time, end_time, courts_count, match_duration_minutes, minimum_break_minutes, is_active, is_removed');
            if (error) throw error;
            const savedByDate = new Map((data || []).map((day) => [day.play_date, day]));
            setPlayDays((current) => current.map((day) => ({ ...day, ...(savedByDate.get(day.play_date) || {}) })));
            toast.success('Event play days and court availability saved.');
        } catch (error) {
            console.error('Failed to save event play days', error);
            toast.error(error.message || 'Could not save play days. Apply the event play-days migration first.');
        } finally {
            setPlayDaysSaving(false);
        }
    };

    const bulkMatchCandidates = (draft?.matches || [])
        .filter((match) => ['pending', 'scheduled', 'in_progress'].includes(match.status) && match.entry_one && match.entry_two)
        .filter((match) => {
            if (bulkMatchSetup.scope === 'group') return match.stage === 'group';
            if (bulkMatchSetup.scope === 'elimination') return ['knockout', 'placement'].includes(match.stage);
            if (bulkMatchSetup.scope === 'missing') return !match.court_name || !match.scheduled_start;
            return true;
        })
        .sort((a, b) => (a.round_number || 0) - (b.round_number || 0) || (a.bracket_position || 0) - (b.bracket_position || 0));

    const bulkMatchTargets = bulkMatchCandidates.filter((match) => (
        (bulkMatchSetup.court_name && (bulkMatchSetup.overwrite_courts || !match.court_name))
        || (bulkMatchSetup.scheduled_start && (bulkMatchSetup.overwrite_times || !match.scheduled_start))
    ));

    const applyBulkMatchSetup = async () => {
        const courtName = String(bulkMatchSetup.court_name || '').trim();
        const firstStart = bulkMatchSetup.scheduled_start ? new Date(bulkMatchSetup.scheduled_start) : null;
        const intervalMinutes = Number(bulkMatchSetup.interval_minutes);
        if (!courtName && !bulkMatchSetup.scheduled_start) {
            toast.error('Choose a court or enter the first scheduled start time.');
            return;
        }
        if (bulkMatchSetup.scheduled_start && Number.isNaN(firstStart.getTime())) {
            toast.error('Enter a valid first scheduled start time.');
            return;
        }
        if (bulkMatchSetup.scheduled_start && (!Number.isFinite(intervalMinutes) || intervalMinutes < 1)) {
            toast.error('The interval between matches must be at least one minute.');
            return;
        }
        if (bulkMatchTargets.length === 0) {
            toast.message('No matches in this scope need the selected changes.');
            return;
        }

        setBulkUpdating(true);
        try {
            let scheduledIndex = 0;
            const updates = bulkMatchTargets.map((match) => {
                const values = { updated_at: new Date().toISOString() };
                if (courtName && (bulkMatchSetup.overwrite_courts || !match.court_name)) values.court_name = courtName;
                if (firstStart && (bulkMatchSetup.overwrite_times || !match.scheduled_start)) {
                    const scheduledStart = new Date(firstStart.getTime() + scheduledIndex * intervalMinutes * 60_000);
                    scheduledIndex += 1;
                    const localDate = toLocalDateTimeInput(scheduledStart).slice(0, 10);
                    const scheduledDay = playDays.find((day) => day.play_date === localDate);
                    const durationMinutes = Number(scheduledDay?.match_duration_minutes) || intervalMinutes;
                    values.scheduled_start = scheduledStart.toISOString();
                    values.scheduled_end = new Date(scheduledStart.getTime() + durationMinutes * 60_000).toISOString();
                }
                return { id: match.id, values };
            });
            const results = await Promise.all(updates.map(({ id, values }) => supabase.from('draw_matches').update(values).eq('id', id)));
            const failure = results.find(({ error }) => error)?.error;
            if (failure) throw failure;
            updates.forEach(({ id, values }) => updateLocalMatch(id, values));
            toast.success(`${updates.length} ${updates.length === 1 ? 'match' : 'matches'} updated in ${division?.name || 'this division'}.`);
        } catch (error) {
            console.error('Failed to bulk update native match setup', error);
            toast.error(error.message || 'Could not bulk update the match setup.');
        } finally {
            setBulkUpdating(false);
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

    const recordResult = async (match, result) => {
        setSaving(true);
        try {
            const { error } = await supabase.rpc('native_record_draw_result', {
                p_match: match.id, p_expected: match.updated_at, p_result: result,
            });
            if (error) throw error;
            const { data: sets, error: setsError } = await supabase.from('draw_match_sets').select('*').eq('match_id', match.id).order('set_number');
            if (setsError) throw setsError;
            const nextSets = [...matchSets.filter(s => s.match_id !== match.id), ...(sets || [])];
            setMatchSets(nextSets);
            if (match.stage === 'group' && result.kind !== 'live') {
                const completedMatches = draft.matches.map(item => item.id === match.id ? {
                    ...item, winner_entry_id: result.winner, result_summary: result.summary,
                    status: result.kind === 'retirement' ? 'retired' : ['walkover', 'withdrawal'].includes(result.kind) ? 'walkover' : 'completed',
                } : item);
                const rows = calculateGroupStandings({ entries: draft.entries, matches: completedMatches, matchSets: nextSets, groupId: match.group_id }).map(standing => {
                    const row = { ...standing }; delete row.seed_number;
                    return { ...row, updated_at: new Date().toISOString() };
                });
                const { error: standingsError } = await supabase.from('draw_standings').upsert(rows, { onConflict: 'group_id,entry_id' });
                if (standingsError) throw standingsError;
                setStandings(current => [...current.filter(row => row.group_id !== match.group_id), ...rows]);
            }
            setRecordingMatchId(null);
            setDrawReloadKey(key => key + 1);
            setWorkflowRevision(key => key + 1);
            toast.success(result.kind === 'live' ? 'Live score saved' : 'Result saved; bracket routes updated');
            onSaved?.();
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
            { seedingMethod: 'manual', placementPlayoff: playoffMode, plateMode },
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
            const routes = routeIds(knockout.matches, match => ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`));
            const links = await Promise.all(knockout.matches.map(match => supabase.from('draw_matches').update(routes.get(match.key)).eq('id', ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`))));
            const linkError = links.find((result) => result.error)?.error;
            if (linkError) throw linkError;
            setDraft((current) => ({ ...current, matches: [...current.matches, ...knockout.matches.map((match) => ({
                ...match, id: ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`), key: ids.get(`${match.stage}:${match.round_number}:${match.bracket_position}`),
                ...routes.get(match.key),
            }))] }));
            await resolveSavedRoutes(savedDraw.id);
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
        if (!playableMatches.length || draft.matches.some((match) => ![...resolvedStatuses, 'cancelled'].includes(match.status))) {
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
            }).eq('id', savedDraw.id).in('status', ['published', 'in_progress']).select('id').single();
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

        const payload = buildRankingAwardRows({ playerRows: pendingAwardablePlayerRows, event,
            divisionId, draw: savedDraw, tier: rankingTier, category: division.ranking_category });

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
    const settingsLocked = Boolean(savedDraw && savedDraw.status !== 'draft');
    const mainKnockoutMatches = (draft?.matches || []).filter((match) => match.stage === 'knockout');
    const mainOpeningRound = mainKnockoutMatches.length ? Math.min(...mainKnockoutMatches.map((match) => match.round_number)) : null;
    const mainOpeningMatches = mainKnockoutMatches.filter((match) => match.round_number === mainOpeningRound);
    const silverPlateReady = mainOpeningMatches.length > 0 && mainOpeningMatches.every((match) => (
        match.winner_entry_id && ['completed', 'walkover', 'retired'].includes(match.status)
    ));
    const playableMatches = (draft?.matches || []).filter((match) => match.entry_one_id && match.entry_two_id);
    const drawReadyToComplete = playableMatches.length > 0 && (draft?.matches || []).every((match) => (
        ['completed', 'walkover', 'retired', 'cancelled'].includes(match.status)
    ));

    const effectiveSeedCount = Math.min(entries.length, seededTeamCount ?? (savedDraw ? Math.floor(entries.length*Number(seedingTemplate)/100) : Math.min(8, entries.length)));
    const seedCountOptions = [...new Set([0, ...Array.from({length:9},(_,i)=>2**i).filter(n=>n<=entries.length),entries.length])].sort((a,b)=>a-b);
    const seedBands = [];
    for(let start=3;start<=effectiveSeedCount;start=(start-1)*2+1){const end=Math.min((start-1)*2,effectiveSeedCount);seedBands.push(`${start}–${end}`);}
    const rankingControls = <div className="grid gap-3 sm:grid-cols-2">                        <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Ranking source<select disabled={settingsLocked || rankedInClassSeedingsLoading} value={rankingSource} onChange={(event) => selectRankingSource(event.target.value)} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="active" className="text-black">Each player’s active ranking</option>{rankingSource === 'rankedin_class' && <option value="rankedin_class" className="text-black">Legacy imported RankedIn snapshot</option>}{rankingOrganisations.map((organisation) => <option key={`main:${organisation}`} value={`organisation:${organisation}`} className="text-black">{organisation} · gendered Main divisions</option>)}{rankingCategories.map((category) => <option key={category.source} value={category.source} className="text-black">{category.organisation} · {category.age_group}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{rankedInClassSeedingsLoading ? 'Loading the legacy imported snapshot…' : 'New draws use ranking records stored in our database. Choose an exact category such as Mixed-Main when the division uses it; values are shared by player lists and event cards, then frozen when the draw is saved.'}</span>{rankingSource === 'rankedin_class' && linkedSeedFallbackCount > 0 && <span className="mt-2 block text-xs font-semibold leading-4 text-amber-200">{linkedSeedFallbackCount} {linkedSeedFallbackCount === 1 ? 'team was' : 'teams were'} not matched to the linked class and will use active profile points.</span>}</label>
                        <div className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-gray-300">{['americano','team_americano'].includes(drawFormat)?<p>Americano uses a points leaderboard. Knockout seed protection does not apply.</p>:<><label className="font-bold">Number of seeded teams<select aria-label="Number of seeded teams" disabled={settingsLocked} value={effectiveSeedCount} onChange={e=>{setSeededTeamCount(Number(e.target.value));setDraft(null);}} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white">{seedCountOptions.map(n=><option key={n} value={n}>{n===0?'None · random draw':`${n} seeded teams`}</option>)}</select></label><p className="mt-3 text-xs text-sky-200">{effectiveSeedCount} seeded · {entries.length-effectiveSeedCount} unseeded</p>{savedDraw && savedDraw.scoring_rules?.seeded_team_count == null && <p className="mt-2 text-xs text-amber-200">This saved draw uses the earlier exact-order seeding. Grouped placement applies when you generate a new preview.</p>}{drawFormat==='knockout'?<div className="mt-3 space-y-2 text-xs font-normal leading-5"><p>{effectiveSeedCount>=2?'Seeds 1 and 2: opposite halves; can only meet in the final.':effectiveSeedCount===1?'Seed 1: fixed at the top of the draw.':'All teams are randomly placed.'}</p>{seedBands.map(band=><p key={band}>Seeds {band}: randomly drawn within this protected group.</p>)}{effectiveSeedCount>=4&&<p>Top 4 stay apart until the semifinals.{effectiveSeedCount>=8?' Top 8 stay apart until the quarterfinals.':''}</p>}<p>Unseeded teams are randomly placed in the remaining positions. Ranking order selects the seeded teams; it does not fix their position within a seed group.</p></div>:<p className="mt-3 text-xs font-normal leading-5">Seeded teams are distributed across groups using the group allocation order. Teams within seed groups are shuffled. Knockout round protection applies only to a knockout draw.</p>}</>}</div>
</div>;

    useEffect(()=>{setWorkflowRevision(n=>n+1);},[savedDraw?.id,savedDraw?.status,savedDraw?.updated_at,draft?.matches,rankingAwards]);

    const openDivision = (id, requestedStep) => {
        if (!id) { setDivisionId(''); setDrawer(null); return; }
        if (id !== divisionId) {
            setDivisionId(id); setDraftDirty(false); setSavedDraw(null); setDraft(null); setActiveDrawKind('main');
            setMatchSearch(''); setMatchRound('all'); setEditingMatchId(null); setRecordingMatchId(null);
            setConfirmReopen(false); setShowPublicControls(false); setShowBulkMatchSetup(false);
            setSeededTeamCount(null); setRestartConfirmed(false); setPlateMode('none'); setPlayoffMode('none');
            setRankingSource(divisions.find(d => d.id === id)?.seeding_ranking_source || 'active');
        }
        const existing=workflowData.draws.find(d=>d.division_id===id && d.draw_kind==='main');
        const step = requestedStep || workflowProgress.get(id)?.next || 'players';
        setDrawFormat(existing?.scoring_rules?.americano?.variant==='team'?'team_americano':existing?.format || workflowConfigs[id]?.format || 'knockout');
        setShowFormatChoices(false); setShowDrawSetup(true); setWorkspace(step);
        setOverview(false); setDrawer(null);
    };
    const saveDivisionSchedulePlan = async (edits) => {
        const ids = Object.keys(edits);
        if (!ids.length) return;
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('Sign in to save the division plan.');
        const latest = await supabase.from('draw_player_reviews').select('division_id,state').eq('event_id', event.id).in('division_id', ids);
        if (latest.error) throw latest.error;
        const states = new Map((latest.data || []).map(row => [row.division_id, row.state]));
        const rows = ids.map(id => {
            const state = states.get(id) || {};
            return { division_id: id, event_id: event.id, confirmed_by: user.id, updated_at: new Date().toISOString(),
                state: { ...state, workflow: { ...state.workflow, ...edits[id] } } };
        });
        const result = await supabase.from('draw_player_reviews').upsert(rows, { onConflict: 'division_id' });
        if (result.error) throw result.error;
        setWorkflowConfigs(current => ({ ...current, ...Object.fromEntries(rows.map(row => [row.division_id, { ...current[row.division_id], ...edits[row.division_id] }])) }));
        if (ids.includes(divisionId)) setPlayerReview(current => current ? { ...current, workflow: { ...current.workflow, ...edits[divisionId] } } : current);
        setWorkflowRevision(value => value + 1);
    };
    const workflowReviews = Object.fromEntries(divisions.map(d => {
        const state = d.id === divisionId && playerReview ? playerReview : workflowData.reviews[d.id];
        const rows = registrations.filter(r=>r.division_id===d.id && r.status!=='withdrawn');
        return [d.id, {...state, valid:Boolean(state?.confirmed_at && state.fingerprint===reviewFingerprint(rows,playersByEmail,event))}];
    }));
    const workflowProgress = new Map(divisions.map(item => [item.id, divisionWorkflow(item, { ...workflowData, reviews: workflowReviews })]));
    const currentProgress = workflowProgress.get(divisionId);
    const continueToSchedule = async () => {
        if (!savedDraw || draftDirty) { const record = await saveDraft(); if (!record) return; }
        setWorkspace(savedDraw?.status === 'completed' ? 'run' : 'schedule');
    };
    const playerPanel = division && <>{reviewError && <p role="alert" className="text-red-200">{reviewError}</p>}{reviewLoading ? <p className="text-gray-300">Loading player confirmation…</p> : <DrawPlayerReview key={`${divisionId}-${drawFormat}-${playerReview?.confirmed_at||'new'}`} event={event} division={division} registrations={divisionRegistrations} players={playersByEmail} entries={allReviewEntries} format={drawFormat} sandboxTesting={sandboxTesting} onExpandTestCount={onExpandTestCount} workflowConfig={workflowConfigs[divisionId]} rankingControls={rankingControls} review={playerReview} locked={settingsLocked} onConfirm={state=>{setPlayerReview(state);setDraftDirty(Boolean(savedDraw));setDraft(null);setDrawer(null);setWorkflowRevision(n=>n+1);setWorkspace('setup');}} />}</>;

    return (
        <div ref={workspaceRef} className="draw-workflow-root scroll-mt-20 p-4 space-y-6 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div><p className="text-xs font-bold uppercase tracking-[0.16em] text-padel-green">Tournament workspace</p><h1 className="mt-2 text-xl font-bold text-white">{event.title || event.name || event.event_name || 'Manage tournament'}</h1></div>
                <div className="flex flex-wrap gap-2">{savedDraw && !overview && <a href={`/${savedDraw.status === 'draft' ? 'draws-preview' : 'native-draws'}/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-white/20 px-3 py-2 text-sm text-gray-200"><Eye size={15} />{savedDraw.status === 'draft' ? 'Public preview' : 'Public draw'}</a>}<button type="button" onClick={()=>setDrawer('play-days')} className="min-h-11 rounded-lg border border-white/20 px-3 py-2 text-sm text-gray-200">Play days & courts</button><button type="button" onClick={()=>setDrawer('help')} className="min-h-11 rounded-lg px-3 py-2 text-sm text-gray-400 hover:text-white">Help</button></div>
            </div>
            <div ref={setScheduleAlertHost} className="sticky top-4 z-50 empty:hidden" />
            <div className={overview ? '' : 'draw-workflow-layout'}>
            {!overview && <DrawDivisionNavigation divisions={divisions} progress={workflowProgress} divisionId={divisionId} loading={workflowLoading || loadingSaved} onSelect={openDivision} onOverview={()=>{setOverview(true);setWorkflowRevision(n=>n+1);}} />}
            <div className="draw-workflow-main">
            {overview && <DrawWorkflowOverview divisions={divisions} progress={workflowProgress} days={playDays} loading={workflowLoading} error={workflowError} onSelect={openDivision} onEditPlayDays={()=>setDrawer('play-days')} />}
            <DrawSideDrawer open={Boolean(drawer)} title={drawer==='play-days'?'Play days & court availability':'Tournament guide'} onClose={()=>setDrawer(null)}>
                {drawer==='play-days' && (<section className="overflow-hidden rounded-2xl border border-sky-300/20 bg-[#101010]">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-300/10 text-sky-200"><CalendarClock size={19} /></span>
                        <div><h2 className="font-bold text-white">Play days &amp; court availability</h2><p className="mt-1 text-xs leading-5 text-gray-400">Add the days you need, then set hours and courts for each day. These availability dates do not change the public event dates.</p></div>
                    </div>
                    <button type="button" onClick={savePlayDaySettings} disabled={playDaysLoading || playDaysSaving || playDays.length === 0} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-sky-300 px-4 py-2.5 text-sm font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40">{playDaysSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}{playDaysSaving ? 'Saving…' : 'Save play days'}</button>
                </div>
                <form onSubmit={e => { e.preventDefault(); try { setPlayDays(addEventPlayDay(playDays, newPlayDate, event)); setSelectedPlayDate(newPlayDate); setNewPlayDate(''); toast.success('Play day added. Save play days to keep it.'); } catch (error) { toast.error(error.message); } }} className="flex flex-wrap items-end gap-3 border-b border-white/10 p-5"><label className="text-sm font-bold text-gray-300">Additional play date<input type="date" required value={newPlayDate} onChange={e => setNewPlayDate(e.target.value)} className="mt-2 block rounded-lg border border-white/15 bg-[#151515] p-3 text-white [color-scheme:dark]" /></label><button disabled={playDaysLoading || playDaysSaving || !newPlayDate} className="min-h-12 rounded-lg border border-sky-300/40 px-4 py-3 text-sm font-bold text-sky-200 disabled:opacity-40">Add play day</button><p className="pb-3 text-xs text-gray-400">New days copy the last day’s settings. Untick a day to exclude it.</p></form>
                {playDaysLoading ? <div className="flex items-center gap-2 p-5 text-sm text-gray-400"><Loader2 size={16} className="animate-spin" /> Loading event availability…</div> : playDays.length === 0 ? <p className="p-5 text-sm text-amber-200">Add your first play date above to configure court availability.</p> : <div className="space-y-5 p-5">
                    {playDays.map(day=><div key={day.play_date} className="flex flex-wrap items-end gap-3 border-b border-white/10 pb-4">
                        <label className="flex min-w-40 items-center gap-3 self-center text-sm text-white"><input type="checkbox" checked={day.is_active} onChange={e=>updatePlayDay(day.play_date,{is_active:e.target.checked})} className="h-4 w-4 accent-sky-300"/>{formatPlayDay(day.play_date)}</label>
                        {[['start_time','Start','time'],['end_time','End','time'],['courts_count','Courts','number']].map(([field,label,type])=><label key={field} className="text-xs text-gray-400">{label}<input aria-label={`${day.play_date} ${label}`} type={type} min="1" value={type==='time'?day[field].slice(0,5):day[field]} onChange={e=>updatePlayDay(day.play_date,{[field]:e.target.value})} className="mt-1 block w-28 rounded-lg border border-white/15 bg-black p-2 text-white [color-scheme:dark]"/></label>)}
                        <details className="self-center text-sm text-sky-200"><summary className="cursor-pointer p-2">Match timing</summary><div className="flex flex-wrap gap-3 p-2">{[['match_duration_minutes','Match minutes',1],['minimum_break_minutes','Rest minutes',0]].map(([field,label,min])=><label key={field} className="text-xs">{label}<input type="number" min={min} value={day[field]} onChange={e=>updatePlayDay(day.play_date,{[field]:e.target.value})} className="mt-1 block w-24 rounded border border-white/20 bg-black p-2 text-white"/></label>)}</div></details>
                        <button type="button" aria-label={`Remove ${day.play_date}`} onClick={()=>removePlayDay(day.play_date)} disabled={playDaysSaving||playDaysLoading} className="self-center rounded-lg p-3 text-red-200 hover:bg-red-300/10"><Trash2 size={18}/></button>
                    </div>)}
                </div>}
            </section>)}
                {drawer==='help' && <ol className="list-decimal space-y-5 pl-5 text-sm leading-6 text-gray-300"><li><strong className="text-white">Teams & seeds.</strong> Choose a division. Review payments, licences, pairs and seed order, then confirm.</li><li><strong className="text-white">Draw.</strong> Choose your format, plates and placement playoffs. Generate a preview, swap teams or move pairings, then save and continue.</li><li><strong className="text-white">Schedule & publish.</strong> Set play days and court availability. Assign courts and times, save the schedule, then publish.</li><li><strong className="text-white">Results & points.</strong> Enter scores as matches finish. Winners advance automatically. Complete the draw, review final placements and award points.</li></ol>}
            </DrawSideDrawer>
            <div hidden={overview} className="space-y-6">
            <DrawWorkspaceHeader division={division} savedDraw={savedDraw} workspace={workspace} onWorkspace={(step) => { setWorkspace(step); setShowDrawSetup(true); }} ready={Boolean(draft) || savedDraw?.format === 'americano'} loading={loadingSaved || reviewLoading} progress={currentProgress} />
            {workflowError && <p role="alert" className="rounded-lg border border-amber-300/30 p-3 text-sm text-amber-200">Progress could not be refreshed: {workflowError}</p>}
            {sandboxTesting && onRestartSandbox && savedDraw && <details key={divisionId} className="rounded-xl border border-amber-300/40 bg-amber-300/10 p-4">
                <summary className="cursor-pointer font-bold text-amber-200">Change format / restart sandbox draw</summary>
                <p className="mt-3 text-sm text-gray-200">Restart {division?.name} to choose another format. This permanently removes this division’s main draw, back draws, matches, results and court bookings. Your partner sees the same reset. Player registrations and event play days are kept.</p>
                <p className="mt-2 text-sm text-gray-300">Americano uses individual players. Knockout and round robin require fixed pairs in the player registrations before generating matches.</p>
                <label className="mt-4 flex items-center gap-2 text-sm text-amber-100"><input type="checkbox" checked={restartConfirmed} disabled={restarting} onChange={e=>setRestartConfirmed(e.target.checked)} />I understand that this division’s saved draws and results will be removed.</label>
                <button type="button" disabled={!restartConfirmed || restarting} onClick={restartSandbox} className="mt-3 rounded-lg bg-amber-300 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{restarting?'Restarting…':`Restart ${division?.name}`}</button>
            </details>}
            {workspace === 'players' && division && !loadingSaved && <>
                {!settingsLocked && <label className="block max-w-lg text-sm font-semibold text-gray-300">Playing format<select value={drawFormat} onChange={event=>{setDrawFormat(event.target.value);setDraft(null);setShowFormatChoices(false);setWorkflowConfigs(current=>({...current,[divisionId]:{...current[divisionId],format:event.target.value}}));}} className="mt-2 block min-h-11 w-full rounded-lg border border-white/20 bg-[#151515] p-3 text-white"><option value="knockout">Knockout · fixed pairs</option><option value="group_only">Round robin · fixed pairs</option><option value="group_knockout">Groups + knockout · fixed pairs</option><option value="team_americano">Team Americano · fixed pairs</option><option value="americano">Americano · rotating partners</option></select></label>}
                {playerPanel}
                {settingsLocked && <button type="button" onClick={()=>setWorkspace('review')} className="rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black">Continue to draw →</button>}
            </>}
            {availableDraws.length > 1 && <label className="block rounded-xl border border-amber-300/30 bg-amber-300/5 p-3 text-sm font-bold text-gray-200">Manage draw<select value={activeDrawKind} onChange={(event) => setActiveDrawKind(event.target.value)} className="mt-2 block w-full rounded-lg border border-amber-300/20 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-amber-300 focus-visible:ring-2 focus-visible:ring-amber-300/30">{availableDraws.map((item) => <option className="text-black" key={item.id} value={item.draw_kind}>{item.draw_kind === 'main' ? 'Main draw' : item.draw_kind === 'silver' ? 'Silver plate' : `${item.draw_kind} plate`}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-400">Select the draw whose teams and results you want to manage.</span></label>}

            {workspace !== 'players' && ['americano','team_americano'].includes(drawFormat) && division && (!showFormatChoices || settingsLocked) ? <>
                {!settingsLocked && workspace === 'setup' && <button className="text-sm font-bold text-padel-green" onClick={() => setShowFormatChoices(true)}>Change type</button>}
                {!loadingSaved && <AmericanoDraw key={`${divisionId}-${savedDraw?.id || 'new'}`} event={event} division={division} teamMode={drawFormat==='team_americano'} registrations={drawFormat==='team_americano'?teams:eligibleRegistrations} savedDraw={savedDraw} playDays={playDays.filter(day=>!workflowConfigs[divisionId]?.play_dates || workflowConfigs[divisionId].play_dates.includes(day.play_date))} onSaved={(record) => { setSavedDraw(record); onSaved?.(); }} workspace={workspace} onWorkspace={setWorkspace} reviewValid={reviewValid} />}
            </> : <>

            {workspace === 'review' && !settingsLocked && <button type="button" onClick={()=>setWorkspace('setup')} className="rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200">Edit draw options</button>}
            {workspace === 'review' && !draft && <p className="rounded-xl border border-white/10 p-6 text-gray-400">Generate a preview in Setup to review the draw.</p>}
            {workspace === 'schedule' && (!savedDraw?.id || draftDirty) && <div className="space-y-3 rounded-xl border border-white/10 p-6 text-gray-400"><p>{draft ? 'Save your draw to assign courts and times. You can schedule before publishing.' : 'Generate a draw in Setup first, then return here to schedule it.'}</p>{draft ? <button type="button" onClick={saveDraft} disabled={saving} className="rounded-lg bg-padel-green px-5 py-3 font-bold text-black disabled:opacity-40">{saving ? 'Saving…' : 'Save draft to enable scheduling'}</button> : <button type="button" onClick={() => setWorkspace('setup')} className="rounded-lg bg-padel-green px-5 py-3 font-bold text-black">Go to Setup</button>}</div>}
            {workspace === 'setup' && <>
            <section className="overflow-hidden rounded-2xl border border-white/10 bg-[#101010]">
                <div className="flex flex-col gap-3 border-b border-white/10 px-5 py-4 md:flex-row md:items-center md:justify-between"><button type="button" aria-expanded={showDrawConfiguration} onClick={() => setShowDrawConfiguration((open) => !open)} className="flex min-w-0 flex-1 items-center justify-between gap-4 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green"><span><h2 className="font-bold text-white">Draw configuration</h2><p className="mt-1 text-xs text-gray-400">{showDrawConfiguration ? 'Choose a format, check the field and generate a preview.' : (division ? `${division.name} · ${drawFormat === 'knockout' ? 'Elimination' : drawFormat === 'group_only' ? 'Round robin only' : 'Round robin → elimination'}` : 'Expand to choose a division and format.')}</p></span>{showDrawConfiguration ? <ChevronUp className="shrink-0 text-padel-green" size={20} /> : <ChevronDown className="shrink-0 text-padel-green" size={20} />}</button>{settingsLocked && <span className="w-fit rounded-full border border-padel-green/40 bg-padel-green/10 px-3 py-1.5 text-xs font-black uppercase tracking-wide text-padel-green">Published · settings locked</span>}</div>
                {showDrawConfiguration && <div className="space-y-5 p-5">
                    <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">


                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                        {(!showFormatChoices || settingsLocked) ? <div className="flex items-center justify-between gap-4 rounded-xl border border-padel-green/30 bg-padel-green/5 p-4 md:col-span-2"><div><p className="text-xs font-bold uppercase tracking-wide text-gray-400">Selected game type</p><p className="mt-1 font-bold text-white">{{knockout:'Knockout',group_only:'Round robin',group_knockout:'Groups + knockout',americano:'Americano',team_americano:'Team Americano'}[drawFormat]}</p></div>{!settingsLocked && <button type="button" onClick={() => setShowFormatChoices(true)} className="rounded-lg border border-padel-green/40 px-4 py-2 text-sm font-bold text-padel-green hover:bg-padel-green/10">Change type</button>}</div> : <fieldset className="md:col-span-2"><legend className="mb-4 text-base font-bold text-white">Choose how this division plays</legend><div className="grid gap-3 sm:grid-cols-2">{[
                            ['knockout', 'Knockout', 'Fixed pairs. Winners advance; optional plates and placement matches.'],
                            ['group_only', 'Round robin', 'Fixed pairs. Every pair plays the others in its group.'],
                            ['group_knockout', 'Groups + knockout', 'Round-robin groups followed by an elimination draw.'],
                            ['team_americano', 'Team Americano', 'Fixed partners. Play each team once and collect rally points as a team.'],
                            ['americano', 'Americano', 'Individual players. Rotating partners and a points leaderboard.'],
                        ].map(([value, title, description]) => <label key={value} className={`cursor-pointer rounded-xl border p-5 ${drawFormat === value ? 'border-padel-green bg-padel-green/5' : 'border-white/15 hover:border-white/40'}`}><span className="flex items-center gap-3"><input type="radio" name="draw-format" value={value} checked={drawFormat === value} disabled={!divisionId || settingsLocked || loadingSaved} onChange={() => { setDrawFormat(value); setShowFormatChoices(false); setDraft(null); }} onClick={() => { if (drawFormat === value) setShowFormatChoices(false); }} className="accent-padel-green" /><strong className="text-white">{title}</strong></span><span className="mt-2 block pl-6 text-sm leading-6 text-gray-400">{description}</span></label>)}</div></fieldset>}


                        {drawFormat !== 'knockout' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Round robin groups<select disabled={settingsLocked} value={groupCount} onChange={(event) => { const nextCount = event.target.value; const nextSmallestGroup = Math.floor(entries.length / Number(nextCount)); const minimumAdvancers = drawFormat === 'group_knockout' && Number(nextCount) === 1 ? 2 : 1; setGroupCount(nextCount); if (Number(advancersPerGroup) > nextSmallestGroup) setAdvancersPerGroup(String(nextSmallestGroup)); else if (Number(advancersPerGroup) < minimumAdvancers) setAdvancersPerGroup(String(minimumAdvancers)); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50">{groupCountOptions.map((count) => <option key={count} value={count} className="text-black">{count === 1 ? '1 group' : `${count} groups`}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{selectedGroupCount === 1 ? `${entries.length} teams play in one round robin.` : `${entries.length} teams are distributed across ${selectedGroupCount} groups.`}</span></label>}
                        {drawFormat === 'group_knockout' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Advance to elimination<select disabled={settingsLocked || advancerOptions.length === 0} value={advancersPerGroup} onChange={(event) => { setAdvancersPerGroup(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50">{advancerOptions.map((count) => <option key={count} value={count} className="text-black">Top {count} {count === 1 ? 'team' : 'teams'}{selectedGroupCount > 1 ? ' per group' : ''}</option>)}</select><span className="mt-2 block text-xs font-normal leading-4 text-gray-500">{selectedGroupCount === 1 && Number(advancersPerGroup) === 4 && plateMode === 'none' && playoffMode === 'none' ? 'Top 4 advance to semifinals. No back plate or third-place playoff.' : 'The elimination phase unlocks when every round-robin result is complete.'}</span></label>}


                    </div>
                    {divisionId && drawFormat !== 'knockout' && <p className="text-sm leading-6 text-gray-300">{entries.reduce((count, entry) => count + 1 + Number(Boolean(entry.player_two_name)), 0)} players · {entries.length} pairs · {selectedGroupCount} groups · {Array.from({ length: selectedGroupCount }, (_, i) => { const size = Math.floor(entries.length / selectedGroupCount) + (i < entries.length % selectedGroupCount ? 1 : 0); return size * (size - 1) / 2; }).reduce((a, b) => a + b, 0)} group matches</p>}
{drawFormat !== 'group_only' && <fieldset className="rounded-xl border border-white/15 p-4"><legend className="px-2 text-sm font-semibold text-white">Back draws & placements</legend><div className="grid gap-4 md:grid-cols-2">                        {drawFormat !== 'group_only' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Back draw<select aria-describedby="back-draw-explanation" disabled={settingsLocked} value={Array.isArray(plateMode) ? 'custom' : plateMode} onChange={(event) => { setPlateMode(event.target.value === 'custom' ? [] : event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="none" className="text-black">No plate</option><option value="double" className="text-black">Double plate · Main + Silver</option><option value="triple" className="text-black">Triple plate · Main + Silver + Bronze</option><option value="custom" className="text-black">Choose placement ranges</option><option value="all" className="text-black">Full placement · play for every position</option></select></label>}
                        {drawFormat !== 'group_only' && <label className="rounded-xl border border-white/10 bg-black/20 p-3 text-sm font-bold text-gray-300">Placement playoff<select disabled={settingsLocked} value={playoffMode} onChange={(event) => { setPlayoffMode(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-lg border border-white/10 bg-[#151515] px-3 py-2.5 text-white outline-none focus-visible:border-padel-green disabled:cursor-not-allowed disabled:opacity-50"><option value="none" className="text-black">No placement playoff</option><option value="top4" className="text-black">Top 4 · 3rd place playoff</option><option value="top8" disabled={eliminationSize < 8} className="text-black">Top 8 · places 3–8 playoffs</option></select></label>}</div><details className="mt-3 text-xs text-gray-400"><summary className="cursor-pointer py-2">How plates and placement playoffs work</summary><span id="back-draw-explanation" aria-live="polite" className="mt-3 block rounded-lg border border-sky-300/25 bg-sky-300/5 p-3 text-sm font-normal leading-6 text-gray-300"><strong className="block font-bold text-sky-200">{backDrawHelp.title}</strong><span className="mt-1 block">{backDrawHelp.description}</span><span className="mt-2 block text-xs leading-5 text-gray-400">{backDrawHelp.example}</span></span><p className="mt-3">{placementPlayoffExplanation(playoffMode)}</p></details>
</fieldset>}
                    {Array.isArray(plateMode) && drawFormat !== 'group_only' && <fieldset disabled={settingsLocked} className="rounded-xl border border-sky-300/30 bg-sky-300/5 p-4"><legend className="px-2 font-bold text-sky-200">Back draw · places to play for</legend><p className="mb-3 text-sm text-gray-400">Select the finishing ranges you need. Required feeder matches are included automatically; a round-of-32 opening loss feeds places 17–32.</p><div className="grid gap-3 sm:grid-cols-3">{placementRangeOptions(nextPowerOfTwo(drawFormat==='group_knockout'?Number(groupCount)*Number(advancersPerGroup):entries.length)).map(range=><label key={range} className="text-sm text-white"><input type="checkbox" checked={plateMode.includes(range)} onChange={e=>{setPlateMode(current=>e.target.checked?[...current,range]:current.filter(r=>r!==range));setDraft(null);}} /> Places {range.split('_').slice(1).join('–')}</label>)}</div></fieldset>}
                    {divisionId && <div className="flex items-start gap-3 rounded-xl border border-padel-green/20 bg-padel-green/5 p-4 text-sm text-gray-300"><span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-padel-green/10 text-padel-green"><Users size={18} /></span><span><strong className="text-white">{teams.length} teams ready</strong><br /><span className="text-gray-400">Built from {eligibleRegistrations.length} paid, active registration {eligibleRegistrations.length === 1 ? 'row' : 'rows'} in {division?.name}.</span></span></div>}
                    <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-5"><p className="text-sm text-gray-400">Review the draw before saving or publishing.</p>{settingsLocked ? <p className="pb-3 text-sm text-gray-400">To change the format, create a new draft before publishing.</p> : <button type="button" onClick={previewDraft} disabled={!divisionId || loadingSaved || (rankingSource === 'rankedin_class' && rankedInClassSeedingsLoading)} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-padel-green px-4 py-3 font-bold text-black transition-transform hover:brightness-110 active:scale-95 disabled:opacity-40">{loadingSaved || (rankingSource === 'rankedin_class' && rankedInClassSeedingsLoading) ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />}{savedDraw ? 'Regenerate preview' : 'Generate preview'}</button>}</div>
                </div>}
            </section>

            </>}
            {workspace === 'review' && savedDraw?.status === 'published' && activeDrawKind === 'main' && <details className="rounded-xl border border-white/10 p-4">
                <summary className="cursor-pointer text-sm font-semibold text-gray-300">Advanced · reopen draw for corrections</summary>
                <p className="mt-2 text-sm text-gray-400">Reopen this draw only before play or results have started. Existing plate draws also prevent reseeding.</p>
                {!confirmReopen ? <button type="button" onClick={() => setConfirmReopen(true)} disabled={saving} className="mt-3 rounded-lg border border-amber-300/40 px-4 py-3 text-sm font-bold text-amber-200 disabled:opacity-40">Reopen for corrections</button> : <div className="mt-4 space-y-3">
                    <p className="text-sm text-amber-100">This returns the draw to draft and hides it from the public until you republish. Changing seeds rebuilds the matchups; after updating the draft, reapply courts and times. If localhost uses your live database, this affects the live draw too.</p>
                    <div className="flex flex-wrap gap-3">
                        <button type="button" onClick={reopenForCorrections} disabled={saving} className="rounded-lg bg-amber-300 px-4 py-3 text-sm font-bold text-black disabled:opacity-40">{saving ? 'Checking and reopening…' : 'Confirm reopen'}</button>
                        <button type="button" onClick={() => setConfirmReopen(false)} disabled={saving} className="rounded-lg border border-white/15 px-4 py-3 text-sm text-gray-300">Cancel</button>
                    </div>
                </div>}
            </details>}

            {workspace === 'review' && draft && <p className="text-sm text-gray-400">{draft.entries.length} teams · {draft.format === 'knockout' ? `${draft.draw_size} slots · ${draft.total_rounds} rounds` : `${draft.groups?.length || 0} groups`}{playoffMode === 'top8' ? ' · Top 8 playoff' : playoffMode === 'top4' ? ' · Top 4 playoff' : ''}{plateMode === 'triple' ? ' · Triple plate' : plateMode === 'double' ? ' · Double plate' : ''}</p>}
            {workspace === 'review' && draft && <div className="sticky top-4 z-30 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-white/15 bg-[#101010] p-5"><div><p className="text-sm font-semibold text-white">{settingsLocked ? 'Draw confirmed' : draftDirty || !savedDraw ? 'Happy with the matchups?' : 'Draft saved'}</p><p className="mt-1 text-xs text-gray-400">{settingsLocked ? 'Continue to courts and times, or use Results & points to enter scores.' : 'Save your draw to continue. It stays private until you publish in the next stage.'}</p></div><button type="button" onClick={continueToSchedule} disabled={saving} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black disabled:opacity-40">{saving ? 'Saving…' : !savedDraw || draftDirty ? 'Save draw & continue →' : savedDraw.status === 'completed' ? 'View results & points →' : 'Continue to schedule →'}</button></div>}
            {workspace === 'review' && draft && <div className="rounded-2xl border border-white/10 bg-[#101010] overflow-hidden">
                <button type="button" onClick={() => setShowDrawSetup((open) => !open)} className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-left hover:bg-white/[0.03]">
                    <span><span className="block font-bold text-white">Review draw</span><span className="block text-xs text-gray-400">{showDrawSetup ? 'Check the matchups and back draws before saving or publishing.' : 'Expand to review the draw preview.'}</span></span>
                    {showDrawSetup ? <ChevronUp className="text-padel-green" size={20} /> : <ChevronDown className="text-padel-green" size={20} />}
                </button>
                {showDrawSetup && <>
                {(draft.format || 'knockout') === 'knockout' ? <div id="draw-bracket-preview" className="scroll-mt-64 md:scroll-mt-36"><DrawBracketPreview matchSets={matchSets} matches={draft.matches} onSwapPositions={!settingsLocked && activeDrawKind === 'main' ? swapPreviewPositions : undefined} onMoveMatch={!settingsLocked && activeDrawKind === 'main' ? movePreviewMatch : undefined} swapDisabled={saving || loadingSaved} title={`${activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} bracket preview`} /></div> : <div className="grid gap-4 p-5 md:grid-cols-2">
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

            {workspace === 'run' && (!savedDraw || savedDraw.status === 'draft') && savedDraw?.format !== 'americano' && <section className="rounded-xl border border-white/15 p-5"><p className="text-sm text-gray-300">Publish your draw in Schedule & publish before entering results.</p><button type="button" onClick={()=>setWorkspace(savedDraw && !draftDirty ? 'schedule' : 'review')} className="mt-4 rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black">{savedDraw && !draftDirty ? 'Continue to schedule & publish →' : 'Review and save draw →'}</button></section>}
            {workspace === 'schedule' && savedDraw?.status === 'completed' && <section className="rounded-xl border border-white/15 p-5"><h3 className="font-semibold text-white">This division has finished</h3><p className="mt-2 text-sm text-gray-400">{currentProgress?.scheduled} of {currentProgress?.playable} played matches have court times recorded. Results and final points are in the next stage.</p><button type="button" onClick={()=>setWorkspace('run')} className="mt-4 rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black">View results & points →</button></section>}
            {((workspace === 'schedule' && ['draft', 'published', 'in_progress'].includes(savedDraw?.status) && !draftDirty) || (workspace === 'run' && ['published', 'in_progress'].includes(savedDraw?.status))) && draft && <div className="rounded-2xl border border-white/10 bg-[#101010] p-5">
                {workspace === 'schedule' && <>
                <div className="mb-5 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-gray-400">{playDays.filter(day=>day.is_active).length} active play days · save bookings before publishing</p><button type="button" onClick={()=>setDrawer('play-days')} className="min-h-11 rounded-lg border border-white/20 px-4 py-2 text-sm text-gray-200">Edit play days & courts</button></div>
                <DrawSchedulingBoard onDirtyChange={setScheduleDirty} divisionConfigs={workflowConfigs} onSaveDivisionPlan={saveDivisionSchedulePlan} divisions={divisions} alertHost={scheduleAlertHost} key={savedDraw.id} eventId={event.id} drawId={savedDraw.id} playDays={playDays} onSaved={(updates) => updates.forEach(({ id, ...values }) => updateLocalMatch(id, values))} />
                <div className="mb-5 overflow-hidden rounded-xl border border-sky-300/25 bg-sky-300/[0.04]">
                    <button type="button" onClick={() => setShowBulkMatchSetup((current) => !current)} aria-expanded={showBulkMatchSetup} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-sky-300/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-padel-green">
                        <span className="flex items-center gap-2">
                            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-300/10 text-sky-200"><Save size={16} /></span>
                            <span><span className="block text-sm font-bold text-white">Bulk match setup</span><span className="mt-0.5 block text-xs text-gray-400">Assign a court or sequential times across {division?.name || 'the selected division'}.</span></span>
                        </span>
                        {showBulkMatchSetup ? <ChevronUp size={18} className="text-sky-200" /> : <ChevronDown size={18} className="text-sky-200" />}
                    </button>
                    {showBulkMatchSetup && <div className="border-t border-sky-300/15 p-4">
                        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                            <label className="block text-xs font-bold text-gray-300">Matches to update
                                <select value={bulkMatchSetup.scope} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, scope: event.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30">
                                    <option value="all">All playable matches</option>
                                    {(draft.matches || []).some((match) => match.stage === 'group') && <option value="group">Group stage only</option>}
                                    {(draft.matches || []).some((match) => ['knockout', 'placement'].includes(match.stage)) && <option value="elimination">Elimination stage only</option>}
                                    <option value="missing">Missing setup only</option>
                                </select>
                            </label>
                            <label className="block text-xs font-bold text-gray-300">Court
                                {availableCourts.length > 0 ? <select value={bulkMatchSetup.court_name} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, court_name: event.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30"><option value="">Do not change courts</option>{availableCourts.map((court) => <option key={court} value={court}>{court}</option>)}</select> : <input value={bulkMatchSetup.court_name} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, court_name: event.target.value }))} placeholder="e.g. Court 3" className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" />}
                            </label>
                            <label className="block text-xs font-bold text-gray-300">First start <span className="font-normal text-gray-500">optional</span>
                                <input type="datetime-local" value={bulkMatchSetup.scheduled_start} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, scheduled_start: event.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" />
                            </label>
                            <label className="block text-xs font-bold text-gray-300">Minutes between starts
                                <input type="number" min="1" step="5" value={bulkMatchSetup.interval_minutes} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, interval_minutes: event.target.value }))} disabled={!bulkMatchSetup.scheduled_start} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30 disabled:cursor-not-allowed disabled:opacity-40" />
                            </label>
                        </div>
                        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-white/10 bg-black/20 p-3 lg:flex-row lg:items-center lg:justify-between">
                            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:gap-5">
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-300"><input type="checkbox" checked={bulkMatchSetup.overwrite_courts} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, overwrite_courts: event.target.checked }))} className="h-4 w-4 accent-sky-300" /> Replace existing court assignments</label>
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-300"><input type="checkbox" checked={bulkMatchSetup.overwrite_times} onChange={(event) => setBulkMatchSetup((current) => ({ ...current, overwrite_times: event.target.checked }))} className="h-4 w-4 accent-sky-300" /> Replace existing start times</label>
                            </div>
                            <button type="button" onClick={applyBulkMatchSetup} disabled={bulkUpdating || bulkMatchTargets.length === 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg bg-sky-300 px-3 py-2.5 text-xs font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><Save size={14} />{bulkUpdating ? 'Updating…' : `Update ${bulkMatchTargets.length} ${bulkMatchTargets.length === 1 ? 'match' : 'matches'}`}</button>
                        </div>
                        <p className="mt-3 text-xs leading-5 text-gray-500">Existing values stay unchanged unless you allow replacement. Times are applied in round and match order using the interval above.</p>
                    </div>}
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 border-t border-white/15 pt-5"><div><p className="text-sm font-semibold text-white">{savedDraw.status === 'draft' ? 'Ready to publish?' : 'Draw published'}</p><p className="mt-1 text-xs text-gray-400">{savedDraw.status === 'draft' ? 'Save your schedule above. Publishing locks entrants and enables score entry.' : 'You can return here to adjust courts and times.'}</p></div><button type="button" onClick={()=>savedDraw.status === 'draft' ? publishDraft('run') : setWorkspace('run')} disabled={saving || scheduleDirty} className="min-h-11 rounded-lg bg-padel-green px-5 py-3 text-sm font-bold text-black disabled:opacity-40">{saving ? 'Publishing…' : scheduleDirty ? 'Save schedule changes first' : savedDraw.status === 'draft' ? 'Publish & continue to results →' : 'Continue to results →'}</button></div>
                </>}
                {workspace === 'run' && <>

                <div className="mb-4"><p className="font-bold text-white">Record results</p><p className="text-xs text-gray-400">Enter game scores or set totals. The winner is selected automatically; live scores do not advance the bracket.</p></div>
                {activeDrawKind === 'main' && hasKnockoutStage && !draft.matches.some(m => m.round_code?.startsWith('places_')) && <div className="mb-5 rounded-xl border border-amber-300/30 bg-amber-300/5 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-white">Silver plate</p><p className="mt-1 text-xs text-gray-400">{!['double', 'triple'].includes(plateMode) ? 'This existing draw was published without a back draw. Enable a Silver plate to create one from its opening-round losers.' : silverPlate ? `The Silver plate is published${plateMode === 'triple' ? '; its opening-round losers can progress into Bronze.' : ''}` : silverPlateReady ? 'All opening-round main-draw matches are complete. Create the Silver plate from their losing teams.' : 'Complete every opening-round main-draw match to unlock the Silver plate.'}</p></div>{!['double', 'triple'].includes(plateMode) ? <button type="button" onClick={enableSilverPlate} disabled={saving} className="shrink-0 rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10 disabled:opacity-50">Enable Silver plate</button> : silverPlate ? <a href={`/native-draws/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-amber-300/40 px-3 py-2 text-sm font-bold text-amber-200 hover:bg-amber-300/10">View Silver plate</a> : silverPlateReady && <button type="button" onClick={createSilverPlate} disabled={saving} className="shrink-0 rounded-lg bg-amber-300 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create Silver plate</button>}</div></div>}
                {activeDrawKind === 'silver' && draft.format === 'knockout' && plateMode === 'triple' && <div className="mb-5 rounded-xl border border-orange-400/30 bg-orange-400/5 p-4"><div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between"><div><p className="font-bold text-white">Bronze plate</p><p className="mt-1 text-xs text-gray-400">{bronzePlate ? 'The Bronze plate is published and can now be managed separately.' : silverPlateReady ? 'All opening-round Silver plate matches are complete. Create the Bronze plate from their losing teams.' : 'Complete every opening-round Silver plate match to unlock the Bronze plate.'}</p></div>{bronzePlate ? <a href={`/native-draws/${event.slug}`} target="_blank" rel="noreferrer" className="inline-flex shrink-0 items-center justify-center rounded-lg border border-orange-400/40 px-3 py-2 text-sm font-bold text-orange-200 hover:bg-orange-400/10">View Bronze plate</a> : silverPlateReady && <button type="button" onClick={createBronzePlate} disabled={saving} className="shrink-0 rounded-lg bg-orange-400 px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create Bronze plate</button>}</div></div>}
                {draft.format === 'group_knockout' && !draft.matches.some((match) => match.stage === 'knockout') && <div className="mb-5 rounded-xl border border-padel-green/30 bg-padel-green/5 p-4"><p className="font-bold text-white">Elimination phase</p><p className="mt-1 text-xs text-gray-400">{groupStageComplete ? `All group matches are complete. The top ${advancersPerGroup} from each group will advance.` : 'Complete every group match before creating the elimination phase.'}</p>{groupStageComplete && <button type="button" onClick={createKnockoutFromGroups} disabled={saving} className="mt-3 rounded-lg bg-padel-green px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create elimination phase</button>}</div>}
                <div className="mb-5 grid gap-4 sm:grid-cols-2"><label className="text-sm text-gray-300">Find a pair<input value={matchSearch} onChange={e => setMatchSearch(e.target.value)} placeholder="Search player or pair…" className="mt-2 w-full rounded-lg border border-white/15 bg-black/20 p-3 text-white" /></label><label className="text-sm text-gray-300">Round<select value={matchRound} onChange={e => setMatchRound(e.target.value)} className="mt-2 w-full rounded-lg border border-white/15 bg-[#151515] p-3 text-white"><option value="all">All rounds</option>{[...new Set(draft.matches.map(m => m.round_label))].map(label => <option key={label}>{label}</option>)}</select></label></div>
                <div className="space-y-3">
                    {draft.matches.filter((match) => (matchRound === 'all' || match.round_label === matchRound) && `${match.entry_one?.team_name} ${match.entry_two?.team_name}`.toLowerCase().includes(matchSearch.toLowerCase()) && ['pending', 'scheduled', 'in_progress'].includes(match.status) && match.entry_one && match.entry_two).map((match) => (
                        <div key={match.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <div className="mb-3 flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-black uppercase tracking-widest text-gray-500">{match.round_label} · Match {match.bracket_position}</p><div className="flex items-center gap-2">{match.status === 'in_progress' && <span className="inline-flex items-center gap-1.5 rounded-full bg-pink-400 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-black"><Radio size={10} className="animate-pulse motion-reduce:animate-none" /> Live</span>}{match.status === 'scheduled' && <span className="rounded-full border border-sky-300/25 bg-sky-300/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-sky-200">Scheduled</span>}</div></div>
                            {editingMatchId === match.id && <div className="mb-4 rounded-xl border border-sky-300/20 bg-sky-300/[0.04] p-4"><div className="mb-3 flex items-center justify-between gap-3"><div><p className="font-bold text-white">Match setup</p><p className="mt-1 text-xs text-gray-400">Court and time are visible on the public draw. You can still change them later.</p></div><CalendarClock size={18} className="text-sky-200" /></div><div className="grid gap-3 sm:grid-cols-2"><label className="block text-xs font-bold text-gray-300">Court{availableCourts.length > 0 ? <select value={matchOperations[match.id]?.court_name ?? match.court_name ?? ''} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), court_name: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30"><option value="">Court to be confirmed</option>{!availableCourts.includes(matchOperations[match.id]?.court_name ?? match.court_name ?? '') && (matchOperations[match.id]?.court_name ?? match.court_name) && <option value={matchOperations[match.id]?.court_name ?? match.court_name}>{matchOperations[match.id]?.court_name ?? match.court_name}</option>}{availableCourts.map((court) => <option key={court} value={court}>{court}</option>)}</select> : <input value={matchOperations[match.id]?.court_name ?? match.court_name ?? ''} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), court_name: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" placeholder="e.g. Court 1" />}</label><label className="block text-xs font-bold text-gray-300">Scheduled start<input type="datetime-local" value={matchOperations[match.id]?.scheduled_start ?? toLocalDateTimeInput(match.scheduled_start)} onChange={(event) => setMatchOperations((current) => ({ ...current, [match.id]: { ...(current[match.id] || {}), scheduled_start: event.target.value } }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-sky-300 focus-visible:ring-2 focus-visible:ring-sky-300/30" /></label></div><div className="mt-4 flex flex-wrap items-center gap-3"><button type="button" onClick={() => saveMatchOperations(match)} disabled={saving} className="rounded-lg bg-sky-300 px-3 py-2 text-xs font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:opacity-50">Save match setup</button><button type="button" onClick={() => setEditingMatchId(null)} className="rounded-lg px-3 py-2 text-xs font-bold text-gray-400 hover:bg-white/5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Cancel</button></div></div>}
                            <div className="space-y-3"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><span className="text-sm text-white">{match.entry_one.team_name} <span className="text-gray-500">vs</span> {match.entry_two.team_name}</span><p className="mt-1 text-xs text-gray-500">{[match.court_name, match.scheduled_start ? new Date(match.scheduled_start).toLocaleString('en-ZA', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : null].filter(Boolean).join(' · ') || 'Court and time not set'}</p></div><div className="flex flex-wrap items-start gap-2"><details className="relative"><summary className="cursor-pointer rounded-lg border border-white/20 px-3 py-2 text-xs text-gray-300">Match options</summary><div className="absolute right-0 top-full z-20 mt-2 flex w-44 flex-col gap-2 rounded-lg border border-white/20 bg-[#181c1e] p-2"><button type="button" onClick={() => openMatchOperations(match)} className="rounded-lg border border-sky-300/30 px-3 py-2 text-xs font-bold text-sky-200 transition-colors hover:bg-sky-300/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-padel-green">Match setup</button>{match.status === 'in_progress' ? <button type="button" onClick={() => setMatchLive(match, false)} disabled={saving} className="rounded-lg border border-pink-300/30 px-3 py-2 text-xs font-bold text-pink-200 transition-colors hover:bg-pink-400/10 disabled:opacity-50">End live</button> : <button type="button" onClick={() => setMatchLive(match, true)} disabled={saving} className="inline-flex items-center gap-1.5 rounded-lg border border-pink-300/45 px-3 py-2 text-xs font-bold text-pink-100 transition-colors hover:bg-pink-400/10 disabled:opacity-50"><Radio size={13} /> Mark live</button>}<button type="button" onClick={() => toggleFeaturedMatch(match)} disabled={saving} aria-pressed={Boolean(match.is_featured)} className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${match.is_featured ? 'border-amber-300/55 bg-amber-300/10 text-amber-200' : 'border-amber-300/30 text-amber-100 hover:bg-amber-300/10'}`}><Star size={13} fill={match.is_featured ? 'currentColor' : 'none'} />{match.is_featured ? 'Featured' : 'Feature'}</button></div></details><button type="button" onClick={() => setRecordingMatchId(match.id)} className="min-h-10 rounded-lg bg-padel-green px-4 py-2 text-xs font-bold text-black hover:brightness-110">Enter score / result</button></div></div><p className="mt-2 text-sm font-semibold text-sky-200">{matchScoreText(match, matchSets)}</p></div>
                        </div>
                    ))}
                </div>
                <div className="mt-5 flex flex-col gap-3 border-t border-white/10 pt-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-bold text-white">Complete this draw</p><p className="mt-1 text-xs text-gray-400">{drawReadyToComplete ? 'All playable matches have a recorded outcome. Lock this draw before reviewing ranking points.' : 'Complete every playable match before finalising this draw.'}</p></div><button type="button" onClick={completeDraw} disabled={saving || !drawReadyToComplete} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-padel-green/40 px-4 py-3 text-sm font-black text-padel-green hover:bg-padel-green/10 disabled:cursor-not-allowed disabled:opacity-40"><CheckCircle2 size={16} /> Mark complete</button></div>
                <div className="mb-5 overflow-hidden rounded-xl border border-pink-300/25 bg-pink-400/[0.04]">
                    <button type="button" onClick={() => setShowPublicControls((current) => !current)} aria-expanded={showPublicControls} className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-pink-400/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-padel-green"><span className="flex items-center gap-2"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-pink-400/10 text-pink-200"><Megaphone size={16} /></span><span><span className="block text-sm font-bold text-white">Public tournament centre</span><span className="mt-0.5 block text-xs text-gray-400">Pin an announcement and select the matches spectators should not miss.</span></span></span>{showPublicControls ? <ChevronUp size={18} className="text-pink-200" /> : <ChevronDown size={18} className="text-pink-200" />}</button>
                    {showPublicControls && <div className="border-t border-pink-300/15 p-4"><div className="rounded-lg border border-white/10 bg-black/20 p-4"><div className="flex items-center gap-2 text-amber-200"><Star size={16} fill="currentColor" /><p className="text-sm font-bold">Featured matches</p></div><p className="mt-2 text-2xl font-black tabular-nums text-white">{(draft.matches || []).filter((match) => match.is_featured).length}<span className="text-sm text-gray-500">/4</span></p><p className="mt-1 text-xs leading-5 text-gray-400">Use the feature button on a ready match below. Featured matches lead the public overview.</p></div></div>}
                </div>
                <details className="mb-5 rounded-xl border border-pink-300/25 bg-pink-400/[0.04] p-4"><summary className="cursor-pointer text-sm font-bold text-gray-300">Announcements · {announcements.length} posted</summary><div className="mt-4">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between"><div><p className="flex items-center gap-2 font-bold text-white"><Megaphone size={17} className="text-pink-200" /> Announcement centre</p><p className="mt-1 text-xs leading-5 text-gray-400">Post several updates for this event, its divisions, or the active draw/plate. Newest updates appear first.</p></div><span className="w-fit rounded-full border border-pink-300/25 bg-pink-400/10 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-pink-100">{announcements.length} posted</span></div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-[180px_minmax(0,1fr)_auto]">
                        <label className="block text-xs font-bold text-gray-300">Audience<select value={announcementForm.scope} onChange={(item) => setAnnouncementForm((current) => ({ ...current, scope: item.target.value }))} className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none focus-visible:border-pink-300"><option value="event">Whole event</option><option value="division">{division?.name || 'Current division'}</option><option value="draw">This {activeDrawKind === 'main' ? 'main draw' : `${activeDrawKind} plate`}</option></select></label>
                        <div className="grid gap-3 sm:grid-cols-[minmax(0,0.45fr)_minmax(0,1fr)]"><label className="block text-xs font-bold text-gray-300">Title <span className="font-normal text-gray-500">optional</span><input value={announcementForm.title} onChange={(item) => setAnnouncementForm((current) => ({ ...current, title: item.target.value.slice(0, 80) }))} maxLength={80} placeholder="e.g. Schedule update" className="mt-1.5 block w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-pink-300" /></label><label className="block text-xs font-bold text-gray-300">Message<textarea value={announcementForm.message} onChange={(item) => setAnnouncementForm((current) => ({ ...current, message: item.target.value.slice(0, 500) }))} maxLength={500} rows={2} placeholder="Share a court delay, match change or event notice…" className="mt-1.5 block w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2.5 text-sm text-white outline-none placeholder:text-gray-600 focus-visible:border-pink-300" /></label></div>
                        <div className="flex flex-col justify-end gap-2"><label className="flex items-center gap-2 text-xs font-bold text-pink-100"><input type="checkbox" checked={announcementForm.isPinned} onChange={(item) => setAnnouncementForm((current) => ({ ...current, isPinned: item.target.checked }))} className="h-4 w-4 accent-pink-400" /> Pin first</label><button type="button" onClick={createAnnouncement} disabled={saving || !announcementForm.message.trim()} className="inline-flex items-center justify-center gap-2 rounded-lg bg-pink-400 px-3 py-2.5 text-xs font-black text-black transition-transform hover:bg-pink-300 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><Megaphone size={14} /> Post update</button></div>
                    </div>
                    <div className="mt-4 divide-y divide-white/10 overflow-hidden rounded-lg border border-white/10 bg-black/20">{announcements.length > 0 ? announcements.map((announcement) => { const scopeLabel = announcement.draw_id ? `${activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} only` : announcement.division_id ? 'Division' : 'Whole event'; return <div key={announcement.id} className="flex items-start justify-between gap-3 px-3 py-3"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="text-[10px] font-black uppercase tracking-wide text-pink-200">{scopeLabel}</span>{announcement.is_pinned && <span className="rounded-full bg-pink-400/15 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-pink-100">Pinned</span>}</div>{announcement.title && <p className="mt-1 text-sm font-bold text-white">{announcement.title}</p>}<p className="mt-1 whitespace-pre-line text-xs leading-5 text-gray-300">{announcement.message}</p></div><button type="button" onClick={() => removeAnnouncement(announcement)} disabled={saving} aria-label="Remove announcement" className="shrink-0 rounded-lg p-2 text-gray-400 transition-colors hover:bg-red-400/10 hover:text-red-200 disabled:opacity-40"><Trash2 size={15} /></button></div>; }) : <p className="px-3 py-5 text-sm text-gray-500">No announcements have been posted yet.</p>}</div>
                </div></details>
                </>}
            </div>}

            {workspace === 'run' && savedDraw?.status === 'completed' && draft && <>
                {activeDrawKind === 'main' && hasKnockoutStage && <section className="rounded-2xl border border-sky-400/30 bg-sky-400/5 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-sky-400/15 text-sky-300"><Award size={20} /></span>
                            <div className="min-w-0"><p className="font-bold text-white">Final standings & points</p><p className="mt-1 text-sm text-gray-400">Check final placements and points per player. Award points once all results are confirmed.</p></div>
                        </div>
                        {rankingAwards.length > 0 && <span className="flex min-w-24 shrink-0 flex-col items-center justify-center rounded-full border border-padel-green/30 bg-padel-green/10 px-4 py-2 text-center text-[10px] font-black uppercase tracking-wide text-padel-green"><strong className="text-sm leading-5">{rankingAwards.length}</strong><span>Awarded</span></span>}
                    </div>
                    {rankingPointsLoading || rankingAwardsLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-gray-400"><Loader2 size={15} className="animate-spin" /> Loading points configuration…</div> : !division?.ranking_tier_id || !division?.ranking_category ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">Set this division’s ranking tier and category in Event Builder before its final placements can be priced.</div> : !rankingTier || rankingPointsTable.length === 0 ? <div className="mt-4 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-sm text-amber-100">The selected ranking configuration could not be found. No points can be awarded.</div> : rankingReview.length === 0 ? <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-gray-400">No complete knockout placements are available to review.</div> : <>
                        {savedDraw.scoring_rules?.ranking_points?.source_url && <p className="mt-4 text-sm text-sky-200">Event points schedule: {savedDraw.scoring_rules.ranking_points.basis} · <a className="underline" href={savedDraw.scoring_rules.ranking_points.source_url} target="_blank" rel="noreferrer">Official standings</a></p>}<div className="mt-4 overflow-x-auto rounded-xl border border-white/10 bg-black/20"><table className="w-full min-w-[560px] text-left text-sm"><thead className="border-b border-white/10 text-[10px] font-black uppercase tracking-widest text-gray-500"><tr><th className="px-4 py-3">Team</th><th className="px-4 py-3">Final placement</th><th className="px-4 py-3 text-right">Points each</th><th className="px-4 py-3 text-right">Award status</th></tr></thead><tbody className="divide-y divide-white/10">{rankingReview.map((proposal) => {
                            const playerIds = [proposal.entry.player_one_id, proposal.entry.player_two_id].filter(Boolean);
                            const awardedCount = playerIds.filter((id) => rankingAwardsByPlayerId.has(String(id))).length;
                            return <tr key={proposal.entry_id}><td className="px-4 py-3 font-semibold text-white">{proposal.entry.team_name}</td><td className="px-4 py-3"><span className="rounded-full bg-white/10 px-2 py-1 text-xs font-bold text-gray-200">{proposal.placement}</span>{proposal.requiresManualPlacement ? <label className="mt-2 block max-w-xs text-xs font-semibold text-amber-100">Confirm official placement<select value={proposal.selectedRoundCode} onChange={(item) => { setPlacementOverrides((current) => ({ ...current, [proposal.entry_id]: item.target.value })); setAwardConfirmed(false); }} className="mt-1 block w-full rounded-lg border border-amber-300/30 bg-black/30 px-2.5 py-2 text-xs text-white outline-none focus-visible:border-amber-200"><option value="">Choose placement…</option>{rankingPointsTable.map((rule) => <option key={rule.id} value={rule.round_code}>{rule.round_label} · {rule.points.toLocaleString('en-ZA')} pts</option>)}</select></label> : proposal.note && <p className="mt-1 max-w-xs text-xs text-amber-200">{proposal.note}</p>}</td><td className="px-4 py-3 text-right font-black text-padel-green">{proposal.pointsRule ? proposal.pointsRule.points.toLocaleString('en-ZA') : 'Review needed'}</td><td className="px-4 py-3 text-right text-xs font-bold">{awardedCount === playerIds.length && playerIds.length > 0 ? <span className="text-padel-green">Awarded</span> : awardedCount > 0 ? <span className="text-amber-200">{awardedCount}/{playerIds.length} recorded</span> : <span className="text-gray-500">Pending</span>}</td></tr>;
                        })}</tbody></table></div>
                        {missingPlayerProfiles.length > 0 && <p className="mt-3 rounded-xl border border-red-300/30 bg-red-400/5 px-4 py-3 text-xs leading-5 text-red-100">Points cannot be awarded until these draw players have linked 4M profiles: <strong>{missingPlayerProfiles.join(' · ')}</strong>.</p>}
                        {unpricedRankingReview.length > 0 && <p className="mt-3 rounded-xl border border-amber-300/30 bg-amber-300/5 px-4 py-3 text-xs leading-5 text-amber-100">{unpricedRankingReview.length} {unpricedRankingReview.length === 1 ? 'team needs' : 'teams need'} an official placement selected before points can be awarded.</p>}
                        {(pendingAwardablePlayerRows.length > 0 || missingPlayerProfiles.length > 0 || unpricedRankingReview.length > 0) && <div className="mt-4 flex flex-col gap-4 rounded-xl border border-padel-green/25 bg-padel-green/[0.04] p-4 lg:flex-row lg:items-center lg:justify-between"><div><p className="font-bold text-white">Award verified points</p><p className="mt-1 text-xs leading-5 text-gray-400">This records {pendingAwardablePlayerRows.length} missing {pendingAwardablePlayerRows.length === 1 ? 'player award' : 'player awards'} in the audit ledger. Existing awards are never overwritten.</p></div><div className="flex flex-col gap-3 sm:flex-row sm:items-center"><label className="flex items-center gap-2 text-xs font-bold text-padel-green"><input type="checkbox" checked={awardConfirmed} onChange={(item) => setAwardConfirmed(item.target.checked)} disabled={pendingAwardablePlayerRows.length === 0} className="h-4 w-4 accent-[#b6ff00]" /> I have checked the final placements</label><button type="button" onClick={awardRankingPoints} disabled={saving || !awardConfirmed || pendingAwardablePlayerRows.length === 0 || unpricedRankingReview.length > 0 || missingPlayerProfiles.length > 0} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-padel-green px-4 py-3 text-sm font-black text-black transition-transform hover:brightness-110 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"><Award size={16} />{pendingAwardablePlayerRows.length === 0 ? 'Points awarded' : `Award ${pendingAwardablePlayerRows.length} players`}</button></div></div>}
                    </>}
                </section>}
                <div className="rounded-2xl border border-padel-green/30 bg-padel-green/5 p-5"><div className="flex items-start gap-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-padel-green/15 text-padel-green"><CheckCircle2 size={20} /></span><div><p className="font-bold text-white">{activeDrawKind === 'main' ? 'Main draw' : activeDrawKind === 'silver' ? 'Silver plate' : 'Bronze plate'} complete</p><p className="mt-1 text-sm text-gray-400">Final placements are confirmed. Use Edit score in Recorded results below to correct a score while keeping the same winner and points.</p></div></div></div>
            </>}
            </>}
            {workspace === 'run' && draft && ['published', 'in_progress', 'completed'].includes(savedDraw?.status) && <RecordedMatchResults matches={draft.matches} entries={draft.entries} matchSets={matchSets} saving={saving} onEdit={match => setRecordingMatchId(match.id)} />}

            {['review', 'run'].includes(workspace) && draft?.matches?.length > 0 && <DrawProgression key={division?.id} matches={draft.matches} entries={draft.entries || []} divisionName={division?.name} />}
        {recordingMatchId && draft?.matches.find(m => m.id === recordingMatchId) && <MatchScoreDialog key={recordingMatchId} match={draft.matches.find(m => m.id === recordingMatchId)} savedSets={matchSets} scoringRules={savedDraw?.scoring_rules} drawCompleted={savedDraw?.status === 'completed'} saving={saving} onSave={recordResult} onClose={() => setRecordingMatchId(null)} />}
        </div>
        </div>
        </div>
        </div>
    );
};

export default NativeDrawManager;
