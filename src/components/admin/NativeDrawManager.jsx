import React, { useEffect, useMemo, useState } from 'react';
import { Brackets, CheckCircle2, ChevronDown, ChevronUp, Eye, Loader2, RefreshCcw, Save, Send, Users } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '../../supabaseClient';
import { generateGroupStageDraft, generateKnockoutDraft, nextPowerOfTwo } from '../../utils/nativeDrawGenerator';
import { areGroupMatchesComplete, calculateGroupStandings } from '../../utils/nativeDrawStandings';

const isEligible = (registration) => (
    String(registration?.status || '').toLowerCase() !== 'withdrawn'
    && String(registration?.payment_status || '').toLowerCase() === 'paid'
);

const normaliseEmail = (value) => String(value || '').trim().toLowerCase();

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

const registrationToEntry = (registration, index, playersByEmail) => {
    const playerOne = registration.full_name || registration.email || `Entry ${index + 1}`;
    const playerTwo = registration.partner_name || null;
    const playerOneProfile = playersByEmail.get(normaliseEmail(registration.email));
    const playerTwoProfile = playersByEmail.get(normaliseEmail(registration.partner_email));
    const seedingValue = Number(playerOneProfile?.points || 0) + Number(playerTwoProfile?.points || 0);
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
            player_one_points: Number(playerOneProfile?.points || 0),
            player_two_points: Number(playerTwoProfile?.points || 0),
            pair_seeding_points: seedingValue,
        },
    };
};

const TeamLabel = ({ entry }) => {
    if (!entry) return <span className="text-amber-300">BYE</span>;
    const playerOnePoints = Number(entry.snapshot?.player_one_points || 0).toLocaleString('en-ZA');
    const playerTwoPoints = Number(entry.snapshot?.player_two_points || 0).toLocaleString('en-ZA');
    const pairPoints = Number(entry.seeding_value || 0).toLocaleString('en-ZA');
    return (
        <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-white">
                <span className="font-bold text-padel-green">#{entry.seed_number}</span>
                <span>{entry.player_one_name}</span>
                <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">{playerOnePoints}</span>
                {entry.player_two_name && <>
                    <span className="text-gray-500">/</span>
                    <span>{entry.player_two_name}</span>
                    <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold text-gray-300">{playerTwoPoints}</span>
                </>}
            </div>
            <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">Pair seeding total: {pairPoints}</p>
        </div>
    );
};

const NativeDrawManager = ({ event, divisions, registrations, playersByEmail, onSaved }) => {
    const [divisionId, setDivisionId] = useState('');
    const [draft, setDraft] = useState(null);
    const [savedDraw, setSavedDraw] = useState(null);
    const [loadingSaved, setLoadingSaved] = useState(false);
    const [recordingMatchId, setRecordingMatchId] = useState(null);
    const [recordingWinnerId, setRecordingWinnerId] = useState('');
    const [recordingSets, setRecordingSets] = useState([['', ''], ['', '']]);
    const [matchSets, setMatchSets] = useState([]);
    const [savedGroups, setSavedGroups] = useState([]);
    const [standings, setStandings] = useState([]);
    const [showDrawSetup, setShowDrawSetup] = useState(true);
    const [drawFormat, setDrawFormat] = useState('knockout');
    const [groupCount, setGroupCount] = useState('4');
    const [advancersPerGroup, setAdvancersPerGroup] = useState('2');
    const [saving, setSaving] = useState(false);

    const division = divisions.find((item) => item.id === divisionId);
    const eligibleRegistrations = useMemo(() => registrations.filter((registration) => (
        registration.division_id === divisionId && isEligible(registration)
    )), [registrations, divisionId]);
    const teams = useMemo(() => dedupePairRegistrations(eligibleRegistrations), [eligibleRegistrations]);
    const entries = useMemo(() => teams.map((registration, index) => registrationToEntry(registration, index, playersByEmail)), [teams, playersByEmail]);

    useEffect(() => {
        let active = true;
        if (!divisionId) {
            setSavedDraw(null);
            return () => { active = false; };
        }
        const loadSavedDraft = async () => {
            setLoadingSaved(true);
            try {
                const { data: draw, error: drawError } = await supabase
                    .from('draws')
                    .select('id, status, format, advancers_per_group, generated_at')
                    .eq('division_id', divisionId)
                    .eq('draw_kind', 'main')
                    .maybeSingle();
                if (drawError) throw drawError;
                if (!draw) {
                    if (active) setSavedDraw(null);
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
                setAdvancersPerGroup(String(draw.advancers_per_group || 2));
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
    }, [divisionId]);

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
                setDraft({ ...generateKnockoutDraft(entries, { seedingMethod: 'native_ranking' }), format: 'knockout' });
            } else {
                setDraft(generateGroupStageDraft(entries, { format: drawFormat, groupCount: Number(groupCount), seedingMethod: 'native_ranking' }));
            }
        } catch (error) {
            toast.error(error.message);
        }
    };

    const moveSeed = (fromIndex, direction) => {
        if (!draft) return;
        const toIndex = fromIndex + direction;
        if (toIndex < 0 || toIndex >= draft.entries.length) return;
        const reordered = [...draft.entries];
        [reordered[fromIndex], reordered[toIndex]] = [reordered[toIndex], reordered[fromIndex]];
        setDraft(generateKnockoutDraft(
            reordered.map((entry, index) => ({ ...entry, seed_number: index + 1 })),
            { seedingMethod: 'manual' },
        ));
    };

    const saveDraft = async () => {
        if (!draft || !division) return;
        setSaving(true);
        try {
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
                    format: draft.format || 'knockout', group_count: draft.groups?.length || null, advancers_per_group: draft.format === 'group_knockout' ? Number(advancersPerGroup) : null, seeding_method: 'native_ranking', generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
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
                    group_count: draft.groups?.length || null,
                    advancers_per_group: draft.format === 'group_knockout' ? Number(advancersPerGroup) : null,
                        generated_at: new Date().toISOString(),
                    })
                    .select('id, status, format, advancers_per_group, generated_at')
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
                .select('id, round_number, bracket_position');
            if (matchesError) throw matchesError;

            const matchIdByPosition = new Map(savedMatches.map((match) => [`${match.round_number}:${match.bracket_position}`, match.id]));
            const links = draft.format === 'knockout' ? draft.matches.map((match) => {
                const nextRound = match.round_number + 1;
                const nextPosition = Math.ceil(match.bracket_position / 2);
                const winnerToMatchId = matchIdByPosition.get(`${nextRound}:${nextPosition}`);
                if (!winnerToMatchId) return null;
                return supabase.from('draw_matches').update({
                    winner_to_match_id: winnerToMatchId,
                    winner_to_slot: match.bracket_position % 2 === 1 ? 1 : 2,
                }).eq('id', matchIdByPosition.get(`${match.round_number}:${match.bracket_position}`));
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
                    id: matchIdByPosition.get(`${match.round_number}:${match.bracket_position}`),
                    key: matchIdByPosition.get(`${match.round_number}:${match.bracket_position}`),
                    entry_one: match.entry_one ? { ...match.entry_one, id: entryIdByRegistration.get(match.entry_one.source_registration_id) } : null,
                    entry_two: match.entry_two ? { ...match.entry_two, id: entryIdByRegistration.get(match.entry_two.source_registration_id) } : null,
                    winner: match.winner ? { ...match.winner, id: entryIdByRegistration.get(match.winner.source_registration_id) } : null,
                    winner_to_match_id: matchIdByPosition.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) || null,
                    winner_to_slot: matchIdByPosition.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`)
                        ? (match.bracket_position % 2 === 1 ? 1 : 2)
                        : null,
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
            toast.success(`${division.name} native draw is published at /native-draws/${event.slug}`);
        } catch (error) {
            console.error('Failed to publish native draw', error);
            toast.error(error.message || 'Could not publish the draw');
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
        if (recordingSets.some(([first, second]) => (first === '') !== (second === ''))) {
            toast.error('Enter both teams’ scores for a set, or leave that set blank');
            return;
        }
        const scoredSets = recordingSets
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
            const { error: resultError } = await supabase.from('draw_matches').update({
                winner_entry_id: winnerEntry,
                status: 'completed',
                result_type: 'played',
                updated_at: new Date().toISOString(),
            }).eq('id', match.id).eq('status', 'pending');
            if (resultError) throw resultError;
            if (scoredSets.length > 0) {
                const { error: setsError } = await supabase.from('draw_match_sets').insert(scoredSets);
                if (setsError) throw setsError;
            }
            const nextSets = [...matchSets, ...scoredSets];
            if (match.stage === 'group' && match.group_id) {
                const completedMatches = draft.matches.map((item) => item.id === match.id
                    ? { ...item, winner_entry_id: winnerEntry, status: 'completed' }
                    : item);
                const nextStandings = calculateGroupStandings({
                    entries: draft.entries,
                    matches: completedMatches,
                    matchSets: nextSets,
                    groupId: match.group_id,
                });
                const persistedRows = nextStandings.map(({ seed_number, ...row }) => ({ ...row, updated_at: new Date().toISOString() }));
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
            await supabase.from('draw_match_audit').insert({
                match_id: match.id,
                action: 'score_recorded',
                after_state: { winner_entry_id: winnerEntry, sets: scoredSets },
            });
            setDraft((current) => ({
                ...current,
                matches: current.matches.map((item) => {
                    if (item.id === match.id) return { ...item, winner_entry_id: winnerEntry, winner: current.entries.find((entry) => entry.id === winnerEntry), status: 'completed', result_type: 'played' };
                    if (item.id === match.winner_to_match_id) return { ...item, [match.winner_to_slot === 1 ? 'entry_one' : 'entry_two']: current.entries.find((entry) => entry.id === winnerEntry), [match.winner_to_slot === 1 ? 'entry_one_id' : 'entry_two_id']: winnerEntry };
                    return item;
                }),
            }));
            toast.success(match.stage === 'group' ? 'Result saved and group standings updated' : 'Result saved and winner advanced');
            setRecordingMatchId(null);
            setRecordingWinnerId('');
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
        const advancers = savedGroups.flatMap((group) => standingsForGroup(group.id)
            .slice(0, Number(advancersPerGroup))
            .map((row) => draft.entries.find((entry) => entry.id === row.entry_id))
            .filter(Boolean));
        if (advancers.length < 2) {
            toast.error('At least two teams must advance to create an elimination phase');
            return;
        }
        const knockout = generateKnockoutDraft(advancers, { seedingMethod: 'manual' });
        setSaving(true);
        try {
            const { data: inserted, error } = await supabase.from('draw_matches').insert(knockout.matches.map((match) => ({
                draw_id: savedDraw.id, stage: 'knockout', round_code: match.round_code, round_label: match.round_label,
                round_number: match.round_number, bracket_position: match.bracket_position,
                entry_one_id: match.entry_one?.id || null, entry_two_id: match.entry_two?.id || null,
                winner_entry_id: match.winner?.id || null, status: match.status, result_type: match.result_type,
            }))).select('id, round_number, bracket_position');
            if (error) throw error;
            const ids = new Map(inserted.map((match) => [`${match.round_number}:${match.bracket_position}`, match.id]));
            const links = await Promise.all(knockout.matches.map((match) => {
                const nextId = ids.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`);
                return nextId ? supabase.from('draw_matches').update({ winner_to_match_id: nextId, winner_to_slot: match.bracket_position % 2 === 1 ? 1 : 2 }).eq('id', ids.get(`${match.round_number}:${match.bracket_position}`)) : null;
            }).filter(Boolean));
            const linkError = links.find((result) => result.error)?.error;
            if (linkError) throw linkError;
            setDraft((current) => ({ ...current, matches: [...current.matches, ...knockout.matches.map((match) => ({
                ...match, id: ids.get(`${match.round_number}:${match.bracket_position}`), key: ids.get(`${match.round_number}:${match.bracket_position}`),
                winner_to_match_id: ids.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) || null,
                winner_to_slot: ids.get(`${match.round_number + 1}:${Math.ceil(match.bracket_position / 2)}`) ? (match.bracket_position % 2 === 1 ? 1 : 2) : null,
            }))] }));
            toast.success('Elimination phase created from the final group standings');
        } catch (error) {
            console.error('Failed to create elimination phase', error);
            toast.error(error.message || 'Could not create the elimination phase');
        } finally {
            setSaving(false);
        }
    };

    const standingsForGroup = (groupId) => standings
        .filter((row) => row.group_id === groupId)
        .sort((a, b) => (a.position || 999) - (b.position || 999));
    const groupStageComplete = savedGroups.length > 0
        && savedGroups.every((group) => areGroupMatchesComplete(draft?.matches || [], group.id));

    return (
        <div className="p-6 space-y-6">
            <div className="rounded-2xl border border-padel-green/20 bg-padel-green/5 p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <div className="flex items-center gap-2 text-padel-green font-bold"><Brackets size={18} /> Native Draws</div>
                    <p className="text-sm text-gray-400 mt-1">Create a private knockout draft from paid, active pair registrations. Pair seeds use the combined current player-ranking points.</p>
                </div>
                <span className="text-xs text-gray-500">Manual events only</span>
            </div>

            <div className="grid gap-4 md:grid-cols-[1fr_auto]">
                <select value={divisionId} onChange={(event) => { setDivisionId(event.target.value); setDraft(null); }} className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white outline-none">
                    <option value="" className="text-black">Select a division</option>
                    {divisions.map((item) => <option className="text-black" key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button type="button" onClick={previewDraft} disabled={!divisionId || loadingSaved || savedDraw?.status === 'published'} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 font-bold text-white hover:bg-white/15 disabled:opacity-40">
                    {loadingSaved ? <Loader2 size={16} className="animate-spin" /> : <RefreshCcw size={16} />} {savedDraw ? 'Regenerate preview' : 'Preview draw'}
                </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <label className="text-sm font-bold text-gray-300">Draw format<select value={drawFormat} onChange={(event) => { setDrawFormat(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"><option value="knockout" className="text-black">Elimination / knockout</option><option value="group_only" className="text-black">Groups only</option><option value="group_knockout" className="text-black">Groups + elimination</option></select></label>
                {drawFormat !== 'knockout' && <label className="text-sm font-bold text-gray-300">Number of groups<select value={groupCount} onChange={(event) => { setGroupCount(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none">{[2, 3, 4, 5, 6, 8].map((count) => <option key={count} value={count} className="text-black">{count} groups</option>)}</select></label>}
                {drawFormat === 'group_knockout' && <label className="text-sm font-bold text-gray-300">Advance from each group<select value={advancersPerGroup} onChange={(event) => { setAdvancersPerGroup(event.target.value); setDraft(null); }} className="mt-2 block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none"><option value="1" className="text-black">Top 1 team</option><option value="2" className="text-black">Top 2 teams</option></select></label>}
            </div>

            {divisionId && <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-sm text-gray-300 flex items-center gap-3">
                <Users size={18} className="text-padel-green" />
                <span><strong className="text-white">{teams.length}</strong> teams from {eligibleRegistrations.length} paid, active registration {eligibleRegistrations.length === 1 ? 'row' : 'rows'} ready for {division?.name}.</span>
            </div>}

            {draft && <div className="rounded-2xl border border-white/10 bg-[#101010] overflow-hidden">
                <button type="button" onClick={() => setShowDrawSetup((open) => !open)} className="flex w-full items-center justify-between gap-3 border-b border-white/10 px-5 py-4 text-left hover:bg-white/[0.03]">
                    <span><span className="block font-bold text-white">Draw setup &amp; seed preview</span><span className="block text-xs text-gray-400">{showDrawSetup ? 'Collapse this section to focus on score entry.' : 'Expand to review seeds and bracket placement.'}</span></span>
                    {showDrawSetup ? <ChevronUp className="text-padel-green" size={20} /> : <ChevronDown className="text-padel-green" size={20} />}
                </button>
                {showDrawSetup && <>
                <div className="p-5 border-b border-white/10 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    <div>
                        <p className="font-bold text-white">{(draft.format || 'knockout') === 'knockout' ? `${draft.draw_size}-slot knockout draft` : `${draft.groups?.length || 0} seeded groups draft`}</p>
                        <p className="text-sm text-gray-400">{(draft.format || 'knockout') === 'knockout' ? `${draft.entries.length} teams · ${draft.total_rounds} rounds · first-round byes are assigned to the highest-ranked pairs.` : `${draft.entries.length} teams are allocated using snake seeding. Group + elimination will generate its knockout phase once standings are confirmed.`}</p>
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
                {(draft.format || 'knockout') === 'knockout' && <div className="border-b border-white/10 p-5">
                    <div className="mb-3 flex items-center justify-between gap-3">
                        <div>
                            <p className="font-bold text-white">Seed review</p>
                            <p className="text-xs text-gray-400">Use the arrows to correct a seed before saving. The bracket updates immediately; no change is made to the event until you save.</p>
                        </div>
                    </div>
                    <div className="max-h-72 divide-y divide-white/5 overflow-y-auto rounded-xl border border-white/5 bg-black/20">
                        {draft.entries.map((entry, index) => (
                            <div key={entry.source_registration_id} className="flex items-center gap-3 px-3 py-2.5">
                                <span className="w-7 text-sm font-black text-padel-green">#{entry.seed_number}</span>
                                <div className="min-w-0 flex-1">
                                    <div className="truncate text-sm font-semibold text-white">{entry.team_name}</div>
                                    <div className="text-[10px] uppercase tracking-wide text-gray-500">Pair seeding total: {Number(entry.seeding_value || 0).toLocaleString('en-ZA')}</div>
                                </div>
                                <div className="flex gap-1">
                                    <button type="button" aria-label={`Move ${entry.team_name} up`} onClick={() => moveSeed(index, -1)} disabled={index === 0} className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-25"><ChevronUp size={15} /></button>
                                    <button type="button" aria-label={`Move ${entry.team_name} down`} onClick={() => moveSeed(index, 1)} disabled={index === draft.entries.length - 1} className="rounded-md p-1.5 text-gray-300 hover:bg-white/10 disabled:opacity-25"><ChevronDown size={15} /></button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>}
                {(draft.format || 'knockout') === 'knockout' ? <div className="divide-y divide-white/5">
                    {draft.matches.filter((match) => match.round_number === 1).map((match) => (
                        <div key={match.key} className="grid grid-cols-[4rem_1fr_1fr] gap-3 p-4 text-sm items-center">
                            <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Match {match.bracket_position}</span>
                            <TeamLabel entry={match.entry_one} />
                            <TeamLabel entry={match.entry_two} />
                        </div>
                    ))}
                </div> : <div className="grid gap-4 p-5 md:grid-cols-2">{(draft.groups || []).map((group) => { const groupRows = standingsForGroup(group.id || group.key); return <div key={group.key || group.id} className="rounded-xl border border-white/10 bg-black/20 p-4"><p className="mb-3 font-bold text-padel-green">{group.name}</p>{groupRows.length > 0 ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead className="border-b border-white/10 text-gray-500"><tr><th className="pb-2">#</th><th className="pb-2">Team</th><th className="pb-2 text-center">P</th><th className="pb-2 text-center">W</th><th className="pb-2 text-center">+/-</th><th className="pb-2 text-right">Pts</th></tr></thead><tbody>{groupRows.map((row) => { const entry = draft.entries.find((item) => item.id === row.entry_id); return <tr key={row.entry_id} className={row.requires_manual_resolution ? 'text-amber-300' : 'text-gray-200'}><td className="py-2 font-black text-padel-green">{row.position}</td><td className="py-2 pr-2">{entry?.team_name || 'Team'}</td><td className="py-2 text-center">{row.played}</td><td className="py-2 text-center">{row.won}</td><td className="py-2 text-center">{row.games_for - row.games_against}</td><td className="py-2 text-right font-bold">{row.standings_points}</td></tr>; })}</tbody></table></div> : <div className="space-y-2 text-sm text-gray-200">{group.entries.map((entry) => <p key={entry.source_registration_id || entry.id}>#{entry.seed_number} · {entry.team_name}</p>)}</div>}<p className="mt-4 text-xs text-gray-500">{group.fixtures?.length || draft.matches.filter((match) => match.group_id === (group.id || group.key)).length} round-robin fixtures generated</p></div>; })}</div>}
                </>}
            </div>}

            {savedDraw?.status === 'published' && draft && <div className="rounded-2xl border border-white/10 bg-[#101010] p-5">
                <div className="mb-4"><p className="font-bold text-white">Record results</p><p className="text-xs text-gray-400">Choose the winning team. The winner automatically moves into the next bracket slot.</p></div>
                {draft.format === 'group_knockout' && !draft.matches.some((match) => match.stage === 'knockout') && <div className="mb-5 rounded-xl border border-padel-green/30 bg-padel-green/5 p-4"><p className="font-bold text-white">Elimination phase</p><p className="mt-1 text-xs text-gray-400">{groupStageComplete ? `All group matches are complete. The top ${advancersPerGroup} from each group will advance.` : 'Complete every group match before creating the elimination phase.'}</p>{groupStageComplete && <button type="button" onClick={createKnockoutFromGroups} disabled={saving} className="mt-3 rounded-lg bg-padel-green px-3 py-2 text-sm font-bold text-black disabled:opacity-50">Create elimination phase</button>}</div>}
                <div className="space-y-3">
                    {draft.matches.filter((match) => match.status === 'pending' && match.entry_one && match.entry_two).map((match) => (
                        <div key={match.id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                            <p className="mb-3 text-xs font-black uppercase tracking-widest text-gray-500">{match.round_label} · Match {match.bracket_position}</p>
                            {recordingMatchId === match.id ? <div className="space-y-3">
                                {[match.entry_one, match.entry_two].map((entry) => <label key={entry.id} className="flex cursor-pointer items-center gap-3 rounded-lg border border-white/10 px-3 py-2 text-sm text-white"><input type="radio" name={`winner-${match.id}`} value={entry.id} checked={recordingWinnerId === entry.id} onChange={(event) => setRecordingWinnerId(event.target.value)} />{entry.team_name}</label>)}
                                <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
                                    <p className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">Set scores <span className="normal-case font-normal text-gray-500">(optional for now)</span></p>
                                    <div className="space-y-2">
                                        {recordingSets.map((set, index) => <div key={index} className="grid grid-cols-[3rem_1fr_1fr] items-center gap-2"><span className="text-xs font-bold text-gray-500">Set {index + 1}</span><input aria-label={`${match.entry_one.team_name} set ${index + 1} games`} inputMode="numeric" type="number" min="0" value={set[0]} onChange={(event) => setRecordingSets((sets) => sets.map((item, itemIndex) => itemIndex === index ? [event.target.value, item[1]] : item))} className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-padel-green" placeholder={match.entry_one.team_name} /><input aria-label={`${match.entry_two.team_name} set ${index + 1} games`} inputMode="numeric" type="number" min="0" value={set[1]} onChange={(event) => setRecordingSets((sets) => sets.map((item, itemIndex) => itemIndex === index ? [item[0], event.target.value] : item))} className="w-full rounded-md border border-white/10 bg-black/30 px-2 py-1.5 text-sm text-white outline-none focus:border-padel-green" placeholder={match.entry_two.team_name} /></div>)}
                                    </div>
                                    {recordingSets.length < 3 && <button type="button" onClick={() => setRecordingSets((sets) => [...sets, ['', '']])} className="mt-2 text-xs font-bold text-padel-green hover:underline">+ Add deciding set</button>}
                                </div>
                                <div className="flex gap-2"><button type="button" onClick={() => recordResult(match)} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-padel-green px-3 py-2 text-sm font-bold text-black disabled:opacity-50"><CheckCircle2 size={15} /> Confirm winner</button><button type="button" onClick={() => { setRecordingMatchId(null); setRecordingWinnerId(''); }} className="rounded-lg px-3 py-2 text-sm text-gray-400 hover:bg-white/5">Cancel</button></div>
                            </div> : <div className="flex items-center justify-between gap-3"><span className="text-sm text-white">{match.entry_one.team_name} <span className="text-gray-500">vs</span> {match.entry_two.team_name}</span><button type="button" onClick={() => { setRecordingMatchId(match.id); setRecordingWinnerId(''); setRecordingSets([['', ''], ['', '']]); }} className="rounded-lg border border-padel-green/40 px-3 py-2 text-xs font-bold text-padel-green hover:bg-padel-green/10">Record result</button></div>}
                        </div>
                    ))}
                </div>
            </div>}
        </div>
    );
};

export default NativeDrawManager;
