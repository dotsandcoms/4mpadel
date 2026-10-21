import { generateKnockoutDraft, generateGroupStageDraft } from '../nativeDrawGenerator.js';
import { generateAmericano, americanoPlayers } from '../americano.js';
import { generateTeamAmericano, teamAmericanoPlayers } from '../teamAmericano.js';
import { resolvePlayerRanking } from '../playerRankingSelection.js';

export function divisionEntries(data, divisionId, review = {}, rankingSource = 'active') {
    const profiles = new Map((data.players || []).map(p => [p.email?.toLowerCase(), p]));
    const rows = data.registrations.filter(r => r.division_id === divisionId && r.status !== 'withdrawn' && !review.excluded?.includes(r.id));
    const seenPairs = new Set();
    const entries = [];
    for (const r of rows) {
        const pairKey = [r.email, r.partner_email].filter(Boolean).map(s => s.trim().toLowerCase()).sort().join(':');
        if (r.partner_email && seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const one = profiles.get(r.email?.toLowerCase());
        const two = profiles.get(r.partner_email?.toLowerCase());
        entries.push({ id: r.id, source_registration_id: r.id,
            team_name: [r.full_name, r.partner_name].filter(Boolean).join(' / '), player_one_name: r.full_name, player_two_name: r.partner_name || null,
            player_one_id: one?.id || null, player_two_id: two?.id || null,
            seeding_value: resolvePlayerRanking(one, rankingSource).points + resolvePlayerRanking(two, rankingSource).points,
            snapshot: { registration_email: r.email, partner_email: r.partner_email },
        });
    }
    return entries.sort((a, b) => {
        const ai = review.seeds?.indexOf(a.source_registration_id) ?? -1;
        const bi = review.seeds?.indexOf(b.source_registration_id) ?? -1;
        return (ai < 0 ? 99999 : ai) - (bi < 0 ? 99999 : bi) || b.seeding_value - a.seeding_value || a.team_name.localeCompare(b.team_name);
    }).map((e, i) => ({ ...e, seed_number: i + 1 }));
}

export function generateDivisionDraw(data, divisionId, configuration, review, uuid = () => crypto.randomUUID()) {
    const format = configuration.format;
    const rows = data.registrations.filter(r => r.division_id === divisionId && r.status !== 'withdrawn' && !review.excluded?.includes(r.id)).map(r => ({ ...r, draw_exception: review.exceptions?.[r.id] }));
    if (['americano', 'team_americano'].includes(format)) {
        const source = format === 'americano' ? rows : divisionEntries(data, divisionId, review, configuration.ranking_source || 'active').map(e => rows.find(r => r.id === e.source_registration_id));
        const players = (format === 'americano' ? americanoPlayers(source) : teamAmericanoPlayers(source)).map(p => {
            const r = source.find(r => String(r.id) === p.id.replace(':partner', ''));
            return { ...p, email: p.id.endsWith(':partner') ? r?.partner_email : r?.email };
        });
        const options = { points: Number(configuration.points || 24), courts: Math.max(1, Math.min(Number(configuration.courts || 1), Math.floor(players.length / 4))) };
        const rotation = format === 'americano' ? generateAmericano(players, { ...options, ...(configuration.rounds ? { rounds: Number(configuration.rounds) } : {}) }) : generateTeamAmericano(players, options);
        return { format: 'americano', rotation, entries: [], groups: [], matches: [] };
    }
    const entries = divisionEntries(data, divisionId, review, configuration.ranking_source || 'active');
    const seen = new Set();
    for (const e of entries) {
        if (!e.player_two_name || !e.snapshot.partner_email) throw new Error(`${e.team_name}: add a partner in Players first.`);
        for (const email of [e.snapshot.registration_email, e.snapshot.partner_email]) {
            const key = email?.trim().toLowerCase();
            if (!key || seen.has(key)) throw new Error('Each player must belong to exactly one team in this division.');
            seen.add(key);
        }
    }
    const draft = format === 'knockout'
        ? generateKnockoutDraft(entries, { seedingMethod: 'manual', seededCount: configuration.seeded_team_count ?? Math.min(8, entries.length), plateMode: configuration.plate_mode || 'none', placementPlayoff: configuration.playoff_mode || 'none' })
        : generateGroupStageDraft(entries, { format, groupCount: Number(configuration.groups || 1), seedingMethod: 'manual', seededCount: configuration.seeded_team_count ?? Math.min(8, entries.length) });
    if (format === 'group_knockout' && (Number(configuration.advancers) < 1 || Number(configuration.advancers) > Math.floor(entries.length / Number(configuration.groups)))) throw new Error('The qualifier count must fit the smallest group.');
    return persistableDraft(draft, format, uuid);
}

export function persistableDraft(draft, format, uuid = () => crypto.randomUUID()) {
    const groupIds = new Map((draft.groups || []).map(g => [g.key, uuid()]));
    const entryIds = new Map(draft.entries.map(e => [e.source_registration_id || e.id, uuid()]));
    const matchKey = m => m.group_key ? m.group_key + ":" + m.key : m.key;
    const matchIds = new Map(draft.matches.map(m => [matchKey(m), uuid()]));
    const id = e => e ? entryIds.get(e.source_registration_id || e.id) : null;
    const entries = draft.entries.map(e => ({ ...e, id: id(e), group_id: groupIds.get(e.group_key) || groupIds.get((draft.groups || []).find(g => g.entries.some(x => (x.source_registration_id || x.id) === (e.source_registration_id || e.id)))?.key) || null }));
    const matches = draft.matches.map(m => ({ id: matchIds.get(matchKey(m)), key: matchKey(m), stage: m.stage, round_code: m.round_code || `r${m.round_number}`, round_label: m.round_label || `Round ${m.round_number}`, round_number: m.round_number,
        bracket_position: m.bracket_position, group_id: groupIds.get(m.group_key) || null,
        entry_one_id: id(m.entry_one), entry_two_id: id(m.entry_two), winner_entry_id: id(m.winner),
        status: m.result_type === 'walkover' ? 'walkover' : 'pending', result_type: m.result_type,
        winner_to_match_id: matchIds.get(m.winner_to_match_key) || null, winner_to_slot: m.winner_to_slot || null,
        loser_to_match_id: matchIds.get(m.loser_to_match_key) || null, loser_to_slot: m.loser_to_slot || null,
    }));
    return { format, entries, matches, groups: (draft.groups || []).map((g, i) => ({ id: groupIds.get(g.key), name: g.name, display_order: i })) };
}

/** Use final group positions; retain entrant IDs and provisional scheduling keys. */
export function generateElimination(data, draw) {
    const groups = [...new Set(data.entries.filter(e => e.draw_id === draw.id && e.group_id).map(e => e.group_id))].sort();
    const qualifiers = Array.from({ length: Number(draw.advancers_per_group) }, (_, position) => groups.map(group => {
        const standing = data.standings.find(s => s.draw_id === draw.id && s.group_id === group && s.position === position + 1);
        if (!standing || standing.requires_manual_resolution) throw new Error('Resolve tied group standings before creating elimination matches.');
        return data.entries.find(e => e.id === standing.entry_id);
    })).flat();
    const draft = generateKnockoutDraft(qualifiers.map((e, i) => ({ ...e, seed_number: i + 1 })), { seedingMethod: 'manual', plateMode: draw.scoring_rules?.plate_mode || 'none', placementPlayoff: draw.scoring_rules?.playoff_mode || 'none' });
    const ids = new Map(draft.matches.map(m => [m.key, crypto.randomUUID()]));
    return draft.matches.map(m => ({ id: ids.get(m.key), key: m.key, stage: m.stage, round_code: m.round_code, round_label: m.round_label, round_number: m.round_number, bracket_position: m.bracket_position,
        entry_one_id: m.entry_one?.id || null, entry_two_id: m.entry_two?.id || null, winner_entry_id: m.winner?.id || null, status: m.status, result_type: m.result_type,
        winner_to_match_id: ids.get(m.winner_to_match_key) || null, winner_to_slot: m.winner_to_slot || null, loser_to_match_id: ids.get(m.loser_to_match_key) || null, loser_to_slot: m.loser_to_slot || null }));
}
