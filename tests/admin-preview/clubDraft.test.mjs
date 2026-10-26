import test from 'node:test';
import assert from 'node:assert/strict';
import { createClubDraft, reviewClubDraft, clubProfileSaveArguments } from '../../src/pages/admin-preview/clubDraft.js';
test('club draft only includes editable profile fields and preserves original', () => {
  const original = { name: 'Club', status: 'published', verified: true, contact_email: null };
  const draft = createClubDraft(original);
  assert.equal(draft.status, undefined); assert.equal(draft.verified, undefined);
  draft.name = 'New club';
  assert.deepEqual(reviewClubDraft(original, draft).changes, [{ key: 'name', label: 'Club name', before: 'Club', after: 'New club' }]);
  assert.equal(original.name, 'Club');
});
test('club draft validates required name, lengths and unsafe contact inputs', () => {
  const draft = { name: '', website_url: 'javascript:alert(1)', contact_email: 'invalid', about: 'x'.repeat(10001) };
  assert.deepEqual(Object.keys(reviewClubDraft({}, draft).errors), ['name', 'about', 'website_url', 'contact_email']);
  assert.equal(reviewClubDraft({ name: 'Club', address: 'Old address' }, { name: ' Club ', address: '' }).changes[0].after, '');
});
test('candidate save arguments retain exact original values and exclude protected fields', () => {
  const original = { id: 'club-id', name: ' Club ', city: null, status: 'pending' };
  const draft = { ...createClubDraft(original), name: 'New club', city: 'Cape Town', status: 'published' };
  assert.deepEqual(clubProfileSaveArguments(original, draft), {
    p_club_id: 'club-id', p_changes: { name: 'New club', city: 'Cape Town' }, p_expected: { name: ' Club ', city: null },
  });
  assert.throws(() => clubProfileSaveArguments(original, createClubDraft(original)), /valid changed/);
});
