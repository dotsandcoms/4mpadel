import { generateKnockoutDraft } from '../../src/utils/nativeDrawGenerator.js';
import { persistableDraft } from '../../src/utils/tournament/draws.js';
import { defaultSettings } from '../../src/utils/tournament/workflow.js';
import { CAPABILITIES } from '../../src/utils/tournament/permissions.js';
export function sampleTournament(scenario = 'schedule') {
    const stamp = '2026-09-16T08:00:00Z';
    const data = { event: { id: 90000002, event_name: 'SA Grand Cape Town Open', start_date: '2026-10-21', end_date: '2026-10-23', venue: 'Padel 365, Cape Town', slug: 'local-tournament', is_manual: true },
        capabilities: Object.keys(CAPABILITIES), divisions: [], registrations: [], players: [], draws: [], entries: [], matches: [], sets: [], standings: [], confirmations: [], audit: [], access: [], finalisations: [], schedule: null, settingsRevision: 0, sourceFingerprint: 'demo-source-1' };
    for (const [index, name] of ["Ladies Open", "Men’s Open", "Men’s Advanced"].entries()) {
        const division = { id: crypto.randomUUID(), name, event_id: data.event.id, is_active: true, sort_order: index };
        data.divisions.push(division);
        const entries = Array.from({ length: 8 }, (_, i) => {
            const reg = { id: crypto.randomUUID(), event_id: data.event.id, division_id: division.id, full_name: ['Alex', 'Jordan', 'Taylor', 'Morgan', 'Robin', 'Sam', 'Casey', 'Drew'][i] + ' ' + ['Daniels', 'Smith', 'Adams'][index],
                email: 'player-' + index + '-' + i + '@example.test', partner_name: ['Jamie', 'Cameron', 'Avery', 'Charlie', 'Riley', 'Skyler', 'Quinn', 'Blake'][i] + ' ' + ['Jacobs', 'Brown', 'Williams'][index], partner_email: 'partner-' + index + '-' + i + '@example.test', payment_status: 'paid', status: 'registered' };
            data.registrations.push(reg);
            for (const [email, name, side] of [[reg.email, reg.full_name, 0], [reg.partner_email, reg.partner_name, 1]]) data.players.push({ id: index * 100 + i * 2 + side + 1, name, email, license_type: 'full', points: 1200 - i * 100 });
            return { id: reg.id, source_registration_id: reg.id, team_name: reg.full_name + ' / ' + reg.partner_name, player_one_name: reg.full_name, player_two_name: reg.partner_name,
                player_one_id: index * 100 + i * 2 + 1, player_two_id: index * 100 + i * 2 + 2, seed_number: i + 1, seeding_value: 2400 - i * 200, snapshot: { registration_email: reg.email, partner_email: reg.partner_email } };
        });
        const draw = { id: crypto.randomUUID(), event_id: data.event.id, division_id: division.id, draw_kind: 'main', format: 'knockout', status: 'published', scoring_rules: { sets_to_win: 2 }, updated_at: stamp };
        const generated = persistableDraft(generateKnockoutDraft(entries), 'knockout');
        data.draws.push(draw);
        data.entries.push(...generated.entries.map(e => ({ ...e, draw_id: draw.id })));
        data.matches.push(...generated.matches.map(m => ({ ...m, draw_id: draw.id, updated_at: stamp })));
        data.confirmations.push({ division_id: division.id, revision: 3, review: { excluded: [], exceptions: {}, seeds: entries.map(e => e.source_registration_id) }, configuration: { format: 'knockout', groups: 1, advancers: 2, points: 24, sets_to_win: 2 }, players_confirmed_at: stamp, seeds_confirmed_at: stamp, format_confirmed_at: stamp, players_valid: true });
    }
    data.playDays = ['2026-10-21', '2026-10-22', '2026-10-23'].map(play_date => ({ id: crypto.randomUUID(), play_date, start_time: '08:00', end_time: '21:00', courts_count: 4, minimum_break_minutes: 10, match_duration_minutes: 60, is_active: true }));
    data.settings = defaultSettings(data.divisions);
    if (scenario === 'prepare') { data.draws = []; data.entries = []; data.matches = []; data.confirmations = []; }
    return data;
}
