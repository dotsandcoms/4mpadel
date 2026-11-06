import test from 'node:test';
import assert from 'node:assert/strict';
import { adminPlayerForm, adminPlayerPayload, privateProfileForm, privateProfileChanged } from '../src/utils/adminPlayerProfile.js';

test('editing preserves every player-editable field, legacy list formats and numeric zero', () => {
    const player = { id: 42, name: 'Sample Player', points: 0, win_rate: 0, level: 0,
        id_number: '0012345678901', instagram_link: '@sample', playing_hand: 'left', court_side: 'right',
        additional_images: '["https://example.com/gallery.jpg"]', sponsors: ['Sponsor A', 'Sponsor B'],
        club_id: 'club-1', home_club: 'Club One', email: 'player@example.com', age: 30 };
    const form = adminPlayerForm(player);
    assert.equal(form.id_number, '0012345678901');
    assert.equal(form.win_rate, 0);
    assert.equal(form.level, 0);
    assert.equal(form.sponsors, 'Sponsor A, Sponsor B');
    assert.deepEqual(form.additional_images, ['https://example.com/gallery.jpg']);
    const payload = adminPlayerPayload(form, [{ id: 'club-1', name: 'Club One' }]);
    for (const field of ['id_number', 'instagram_link', 'playing_hand', 'court_side']) assert.equal(payload[field], player[field]);
    assert.equal(payload.home_club, 'Club One');
    assert.equal(payload.additional_images, player.additional_images);
    assert.equal(payload.sponsors, '["Sponsor A","Sponsor B"]');
    assert.equal('age' in payload, false, 'Do not clear a legacy saved age when the birth date is unknown');
});

test('private details use separate state and never leak into public player updates', () => {
    const form = { ...adminPlayerForm({ name: 'Sample', email: 'sample@example.com' }),
        date_of_birth: '1990-02-01', playtomic_level: '0', playtomic_proof_path: '42/proof.jpg' };
    const payload = adminPlayerPayload(form);
    for (const field of ['date_of_birth', 'playtomic_level', 'playtomic_proof_path', 'playtomic_matches', 'playtomic_reliability_percent', 'playtomic_no_profile']) assert.equal(field in payload, false);
    assert.equal(typeof payload.age, 'number');
    assert.ok(payload.age > 0);
    assert.deepEqual(privateProfileForm({ date_of_birth: '1990-02-01', playtomic_level: 0, playtomic_proof_path: '42/proof.jpg' }),
        { date_of_birth: '1990-02-01', playtomic_level: 0, playtomic_proof_path: '42/proof.jpg', playtomic_no_profile:false, playtomic_extracted_level:null, playtomic_matches:null, playtomic_reliability_percent:null, playtomic_extracted_at:null });
});

test('legacy edits do not manufacture private details; clearing proof or changing DOB is detected', () => {
    const empty = adminPlayerForm();
    assert.equal(privateProfileChanged(empty, null), false);
    const original = { date_of_birth: '1990-02-01', playtomic_level: 0, playtomic_proof_path: '42/proof.jpg' };
    const form = { ...empty, ...privateProfileForm(original), playtomic_level: '0' };
    assert.equal(privateProfileChanged(form, original), false);
    assert.equal(privateProfileChanged({ ...form, playtomic_proof_path: '' }, original), true);
    assert.equal(privateProfileChanged({ ...form, date_of_birth: '1990-02-02' }, original), true);
});

test('cleared optional preferences and a custom club remain explicit on save', () => {
    const form = { ...adminPlayerForm(), name: ' Sample ', email: ' sample@example.com ', club_id: 'Other', home_club: 'My Club', playing_hand: '', court_side: '' };
    const payload = adminPlayerPayload(form);
    assert.equal(payload.name, 'Sample'); assert.equal(payload.email, 'sample@example.com');
    assert.equal(payload.home_club, 'My Club'); assert.equal(payload.club_id, null);
    assert.equal(payload.playing_hand, null); assert.equal(payload.court_side, null);
    assert.equal(payload.additional_images, '[]');
});
