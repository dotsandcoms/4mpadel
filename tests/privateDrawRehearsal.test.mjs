import test from 'node:test';
import assert from 'node:assert/strict';
import { createRehearsalClient } from '../sandbox/private-draw-rehearsal/store.js';
import { canSeePrivateRehearsal, rehearsalStorageKey } from '../src/utils/privateDrawRehearsal.js';
import { generateAmericano } from '../src/utils/americano.js';

export function rehearsalFixture() {
    return { version: 1, owner_id: 'owner', copied_at: '2026-11-06T10:00:00Z',
        event: { id: 523, event_name: 'Weekend rehearsal', start_date: '2026-11-07', end_date: '2026-11-08', start_time: '08:00', end_time: '18:00', courts_count: 2 },
        divisions: [{ id: 'division', event_id: 523, name: 'Open', is_active: true, sort_order: 0, ranking_tier_id: 'tier', ranking_category: 1 }],
        registrations: Array.from({ length: 4 }, (_, index) => ({ id: `registration-${index}`, event_id: 523, division_id: 'division', full_name: `Player ${index * 2 + 1}`, email: `one-${index}@example.test`, partner_name: `Player ${index * 2 + 2}`, partner_email: `two-${index}@example.test`, payment_status: 'paid', status: 'registered' })),
        players: Array.from({ length: 8 }, (_, index) => ({ id: index + 1, name: `Player ${index + 1}`, email: `${index % 2 ? 'two' : 'one'}-${Math.floor(index / 2)}@example.test`, points: 800 - index * 50, license_type: 'full' })),
        play_days: [], ranking_tiers: [{ id: 'tier', code: 'test', name: 'Test tier' }],
        ranking_points_table: [{ id: 'rule', tier_id: 'tier', category: 1, round_code: 'winner', round_label: 'Winner', points: 100 }],
    };
}

test('rehearsal controls are limited to super admins and the approved tester', () => {
    assert.equal(canSeePrivateRehearsal('other@example.test', { role: 'custom' }), false);
    assert.equal(canSeePrivateRehearsal('greggogoski@gmail.com', { role: 'custom' }), false);
    assert.equal(canSeePrivateRehearsal('GREGGOGOSKI@gmail.com', { role: 'private_rehearsal' }), true);
    assert.equal(canSeePrivateRehearsal('admin@example.test', { role: 'super_admin' }), true);
    assert.notEqual(rehearsalStorageKey('a', 1), rehearsalStorageKey('b', 1));
    assert.notEqual(rehearsalStorageKey('a', 1), rehearsalStorageKey('a', 2));
});

test('full knockout scoring, progression and points remain local and survive reopening', async () => {
    const source = rehearsalFixture(), original = structuredClone(source);
    let saved;
    const client = createRehearsalClient(source, next => { saved = next; });
    const { data: draw } = await client.from('draws').insert({ event_id: 523, division_id: 'division', status: 'published' }).select().single();
    const { data: entries } = await client.from('draw_entries').insert(source.registrations.map((registration, index) => ({ draw_id: draw.id, source_registration_id: registration.id, team_name: registration.full_name, player_one_id: index * 2 + 1, player_two_id: index * 2 + 2 }))).select();
    const { data: final } = await client.from('draw_matches').insert({ draw_id: draw.id, stage: 'knockout', round_number: 2 }).select().single();
    const { data: semis } = await client.from('draw_matches').insert([0, 1].map((index) => ({ draw_id: draw.id, stage: 'knockout', round_number: 1, entry_one_id: entries[index * 2].id, entry_two_id: entries[index * 2 + 1].id, winner_to_match_id: final.id, winner_to_slot: index + 1 }))).select();
    for (const match of semis) assert.equal((await client.rpc('native_record_draw_result', { p_match: match.id, p_expected: match.updated_at, p_result: { kind: 'played', winner: match.entry_one_id, summary: [2, 0], sets: [{ games: [6, 4] }, { games: [6, 3] }] } })).error, null);
    const { data: playable } = await client.from('draw_matches').select().eq('id', final.id).single();
    assert.equal(playable.entry_one_id, entries[0].id); assert.equal(playable.entry_two_id, entries[2].id);
    assert.equal((await client.rpc('native_record_draw_result', { p_match: final.id, p_expected: playable.updated_at, p_result: { kind: 'walkover', winner: playable.entry_two_id } })).error, null);
    assert.equal((await client.from('player_ranking_points').insert({ event_id: 523, player_id: 5, points: 100 })).error, null);
    assert.deepEqual(source, original, 'live source object must not be mutated');
    const reopened = createRehearsalClient(saved);
    assert.equal((await reopened.from('draw_matches').select().eq('id', final.id).single()).data.winner_entry_id, entries[2].id);
    assert.equal((await reopened.from('player_ranking_points').select()).data.length, 1);
    assert.equal((await reopened.from('players').select().eq('id', 5).single()).data.points, original.players[4].points);
    assert.equal((await reopened.rpc('enqueue_push', {})).error.message.includes('disabled'), true);
    assert.equal((await reopened.from('push_outbox').insert({})).error.message.includes('disabled'), true);
    assert.equal((await reopened.from('players').update({ points: 9999 }).eq('id', 5)).error.message.includes('read-only'), true);
});

test('joins scope schedule bookings, upserts are unique, and deleting a draw cascades only locally', async () => {
    const client = createRehearsalClient(rehearsalFixture());
    const { data: draw } = await client.from('draws').insert({ event_id: 523, division_id: 'division' }).select().single();
    const { data: match } = await client.from('draw_matches').insert({ draw_id: draw.id, court_name: 'Court 1' }).select().single();
    await client.from('draw_match_sets').insert({ match_id: match.id, set_number: 1 });
    await client.from('draw_player_reviews').upsert({ division_id: 'division', state: { seeds: [1] } });
    await client.from('draw_player_reviews').upsert({ division_id: 'division', state: { seeds: [2] } });
    assert.equal((await client.from('draw_player_reviews').select()).data.length, 1);
    assert.equal((await client.from('draw_matches').select('*,draws!inner(event_id)').eq('draws.event_id', 523)).data[0].draws.event_id, 523);
    assert.equal((await client.from('draw_matches').select().eq('draws.event_id', 999)).data.length, 0);
    await client.from('draws').delete().eq('id', draw.id);
    assert.equal((await client.from('draw_matches').select()).data.length, 0);
    assert.equal((await client.from('draw_match_sets').select()).data.length, 0);
});

test('invalid or stale results roll back and do not emit a saved snapshot', async () => {
    let saves = 0;
    const client = createRehearsalClient(rehearsalFixture(), () => saves++);
    const { data: draw } = await client.from('draws').insert({ event_id: 523, status: 'published' }).select().single();
    const { data: match } = await client.from('draw_matches').insert({ draw_id: draw.id, entry_one_id: 'one', entry_two_id: 'two' }).select().single();
    const before = client.exportSnapshot(), count = saves;
    for (const payload of [{ p_expected: 'stale', p_result: { kind: 'walkover', winner: 'one' } }, { p_expected: match.updated_at, p_result: { kind: 'played', winner: 'two', summary: [2, 0] } }]) assert.ok((await client.rpc('native_record_draw_result', { p_match: match.id, ...payload })).error);
    assert.deepEqual(client.exportSnapshot(), before); assert.equal(saves, count);
});

test('Americano publication, scores and court reservations remain inside the rehearsal', async () => {
    const client = createRehearsalClient(rehearsalFixture());
    const rotation = generateAmericano(Array.from({ length: 4 }, (_, index) => ({ id: `p${index}`, name: `Player ${index}` })), { rounds: 3, courts: 1, points: 24 });
    const args = { p_event_id: 523, p_division_id: 'division', p_state: rotation, p_status: 'draft', p_expected_updated_at: null };
    const draft = await client.rpc('save_americano_draw', args);
    assert.equal(draft.error, null);
    assert.equal((await client.from('draw_matches').select()).data.length, 0);
    const published = await client.rpc('save_americano_draw', { ...args, p_status: 'published', p_expected_updated_at: draft.data.updated_at });
    assert.equal(published.error, null);
    assert.equal((await client.from('draw_matches').select()).data.length, rotation.fixtures.length);
    const scored = structuredClone(rotation); scored.fixtures[0].score = [15, 9];
    assert.equal((await client.rpc('save_americano_draw', { ...args, p_state: scored, p_status: 'in_progress', p_expected_updated_at: published.data.updated_at })).error, null);
    assert.equal((await client.from('draw_matches').select()).data.filter(match => match.status === 'completed').length, 1);
    assert.equal((await client.from('player_ranking_points').select()).data.length, 0);
});
