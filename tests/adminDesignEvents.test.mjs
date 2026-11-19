import test from 'node:test';
import assert from 'node:assert/strict';
import { loadCalendar } from '../src/pages/admin-preview/calendarData.js';
import { eventManagerListed } from '../src/pages/admin-preview/eventManagerData.js';
import { saveEventReplacement } from '../src/pages/admin-preview/saveEventReplacement.js';
import { currentGroupQualification, latestUndoableGroupEdit, prepareGroupElimination, previewNativeGroupEdit } from '../src/pages/admin-preview/nativeGroupDraw.js';
import { registrationCsv } from '../src/pages/admin-preview/registrationExports.js';
import { eventTournamentWorkspaces, tournamentDivisionForLink } from '../src/pages/admin-preview/tournament/utils/tournament/permissions.js';
import { registrationPaymentLink } from '../src/utils/provisionalEntry.js';

const ownEvent = { id: 11, organisation_id: 'org-a', event_name: 'Own event' };
const otherEvent = { id: 12, organisation_id: 'org-b', event_name: 'Other event' };
const owner = {
    role: 'org_owner', orgs: [{ id: 'org-a', member_role: 'owner' }],
    module_permissions: { 'event-mgmt': { allowedEvents: [11, 12] } },
};

function readFixture(tables) {
    const queries = [];
    const client = { from(table) {
        let data = tables[table] || [];
        const filters = [];
        const query = {
            select() { return query; }, order() { return query; },
            eq(key, value) { filters.push([key, value]); data = data.filter(row => row[key] === value); return query; },
            in(key, values) { filters.push([key, values]); data = data.filter(row => values.includes(row[key])); return query; },
            range(start, end) { queries.push({ table, filters }); return Promise.resolve({ data: data.slice(start, end + 1) }); },
        };
        return query;
    } };
    return { client, queries };
}

test('bespoke Calendar queries only the exact organisation and assigned IDs and reads related records only from its returned events', async () => {
    const { client, queries } = readFixture({
        calendar: [ownEvent, otherEvent], organisations: [{ id: 'org-a', name: 'Owner' }, { id: 'org-b', name: 'Other' }],
        event_creation_audit: [{ event_id: 11, creator_name: 'Own creator' }, { event_id: 12, creator_name: 'Other creator' }],
    });
    const result = await loadCalendar(client, undefined, { permissions: owner, scope: { id: 'org:org-a' } });
    assert.deepEqual(result.events.map(row => [row.id, row._organisation.name, row._audit.creator_name]), [[11, 'Owner', 'Own creator']]);
    assert.deepEqual(queries.find(query => query.table === 'calendar').filters, [['organisation_id', 'org-a'], ['id', [11, 12]]]);
    assert.deepEqual(queries.find(query => query.table === 'event_creation_audit').filters, [['event_id', [11]]]);
    const before = queries.length;
    await assert.rejects(loadCalendar(client, undefined, { permissions: owner, scope: { id: 'org:org-b' } }), /authorised Calendar/);
    assert.equal(queries.length, before);
});

test('Event Manager tier switch matches the published list and keeps unmanaged events excluded', () => {
    const bronze = { finance_managed: true, sapa_status: 'Bronze' };
    assert.equal(eventManagerListed(bronze, false), false);
    assert.equal(eventManagerListed(bronze, true), true);
    assert.equal(eventManagerListed({ ...bronze, sapa_status: 'S Gold' }, false), true);
    assert.equal(eventManagerListed({ ...bronze, finance_managed: false }, true), false);
});

test('staff checkout uses the saved pending-entry token and never builds an EFT or free payment URL', () => {
    const event = { id: 11, slug: 'own-event', payment_method: 'platform' };
    const url = new URL(registrationPaymentLink(event, { pay_token: 'test-token' }));
    assert.equal(url.origin + url.pathname, 'https://4mpadel.co.za/calendar/own-event');
    assert.equal(url.searchParams.get('pay_token'), 'test-token');
    assert.equal(registrationPaymentLink({ ...event, payment_method: 'eft' }, { pay_token: 'test-token' }), null);
    assert.equal(registrationPaymentLink(event, {}), null);
});

test('substitution uses the atomic replacement RPC with both original teammate fields and rejects out-of-scope input before writes', async () => {
    const calls = [];
    const client = { async rpc(name, input) { calls.push({ name, input }); return { data: { registration_id: 'reg-a', new_email: 'new@example.invalid' } }; } };
    const args = {
        client, event: { id: 11 }, registration: { id: 'reg-a', event_id: 11, email: 'old@example.invalid', partner_email: 'mate@example.invalid' },
        replacement: { id: 22, email: 'new@example.invalid' }, expectedUserId: 'owner', scopeId: 'org:org-a',
        verifyAccess: async ({ scopeId }) => { assert.equal(scopeId, 'org:org-a'); return { event: { id: 11, is_manual: true } }; },
    };
    await saveEventReplacement(args);
    assert.deepEqual(calls, [{ name: 'replace_registration_player', input: {
        p_registration_id: 'reg-a', p_expected_email: 'old@example.invalid', p_expected_partner_email: 'mate@example.invalid', p_new_player_id: 22,
    } }]);
    await assert.rejects(saveEventReplacement({ ...args, registration: { ...args.registration, event_id: 12 } }), /active entry/);
    await assert.rejects(saveEventReplacement({ ...args, isCurrent: () => false }), /workspace changed/);
    assert.equal(calls.length, 1);
});

function groupSnapshot(status = 'pending') {
    const groups = [{ id: 'ga', name: 'Group A' }, { id: 'gb', name: 'Group B' }].map((group, index) => ({
        ...group, entries: [0, 1].map(offset => ({ id: `team-${index * 2 + offset + 1}`, team_name: `Team ${index * 2 + offset + 1}`, group_id: group.id, seed_number: index * 2 + offset + 1 })),
    }));
    const matches = groups.map((group, index) => ({
        id: `match-${index}`, group_id: group.id, stage: 'group', round_number: 1, round_code: 'group', round_label: 'Group', bracket_position: 1,
        updated_at: 'version', entry_one: group.entries[0], entry_two: group.entries[1],
        entry_one_id: group.entries[0].id, entry_two_id: group.entries[1].id,
        winner_entry_id: status === 'completed' ? group.entries[0].id : null, status,
    }));
    return {
        draw: { id: 'draw-1', status: status === 'completed' ? 'published' : 'draft', format: 'group_knockout', advancers_per_group: 1, updated_at: 'draw-version', generated_at: 'generation' },
        groups, matches, entries: groups.flatMap(group => group.entries), audit: [], matchSets: [],
    };
}

test('group edits carry expected draw and fixture revisions and lock after scores have been entered', () => {
    const data = groupSnapshot();
    const [from, to] = data.groups.map(group => ({ entry: group.entries[0], groupKey: group.id, position: group.name }));
    const { args } = previewNativeGroupEdit(data, from, to);
    assert.deepEqual(args.p_two_groups, ['ga', 'gb']);
    assert.equal(args.p_expected, 'draw-version');
    assert.deepEqual(args.p_versions, { 'match-0': 'version', 'match-1': 'version' });
    assert.equal(args.p_fixtures.find(row => row.id === 'match-0').entry_one_id, 'team-3');
    assert.throws(() => previewNativeGroupEdit(groupSnapshot('completed'), from, to), /no recorded play/);
    assert.equal(latestUndoableGroupEdit(groupSnapshot('completed')), null);
});

test('the reviewed group qualifiers feed only the current draw elimination bracket with the latest fixture versions', () => {
    const data = groupSnapshot('completed');
    const qualification = currentGroupQualification(data);
    const args = prepareGroupElimination(data, qualification, null, () => 'final-match');
    assert.deepEqual(args.p_qualification.advancing, ['team-1', 'team-3']);
    assert.deepEqual(args.p_versions, { 'match-0': 'version', 'match-1': 'version' });
    assert.equal(args.p_matches.length, 1);
    assert.equal(args.p_matches[0].stage, 'knockout');
    assert.equal(currentGroupQualification(groupSnapshot()), null);
});

test('registration exports escape both CSV quoting and spreadsheet formulas', () => {
    const content = registrationCsv([{ id: 'r1', full_name: '=1+1', partner_name: 'Player "B"' }]);
    assert.match(content, /"'=1\+1"/);
    assert.match(content, /"Player ""B"""/);
});

test('Tournament links use exact verified capabilities for the selected event and all-workspaces scope', () => {
    const event = { ...ownEvent, is_manual: true };
    const assigned = { tournamentAssignments: [{ id: String(event.id), capabilities: ['schedule', 'corrections'] }, { id: otherEvent.id, capabilities: ['draws'] }] };
    assert.deepEqual(eventTournamentWorkspaces(assigned, 'all', event), ['schedule', 'results']);
    assert.deepEqual(eventTournamentWorkspaces(assigned, 'org:org-a', event), []);
    assert.deepEqual(eventTournamentWorkspaces(assigned, 'all', { id: 99, is_manual: true }), []);
    assert.deepEqual(eventTournamentWorkspaces({ role: 'super_admin' }, 'all', event), ['draws', 'schedule', 'results']);
    assert.deepEqual(eventTournamentWorkspaces({ role: 'super_admin' }, 'all', ownEvent), []);
    assert.equal(tournamentDivisionForLink([{ id: 51 }], '51'), 51);
    assert.equal(tournamentDivisionForLink([{ id: 'own-division' }], 'other-division'), undefined);
});
