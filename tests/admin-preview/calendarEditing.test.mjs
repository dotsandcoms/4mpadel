import test from 'node:test';
import assert from 'node:assert/strict';
import { calendarEditMode } from '../../src/pages/admin-preview/calendarEditing.js';

test('calendar uses the shared live editor only for authorised manual events', () => {
  const event = { id: 7, is_manual: true };
  assert.equal(calendarEditMode(event, true), 'live');
  assert.equal(calendarEditMode(event), null);
  assert.equal(calendarEditMode(event, false), null);
  assert.equal(calendarEditMode({ ...event, is_weekly: true }, true), 'live');
});
test('imported, cancelled and missing events cannot open manual editing', () => {
  for (const event of [null, {}, { id: 7 }, { id: 7, is_manual: false }, { id: 7, is_manual: true, event_status: 'cancelled' }]) {
    assert.equal(calendarEditMode(event, true), null);
  }
});
test('quick events and local drafts never enter the full live builder', () => {
  assert.equal(calendarEditMode({ id: 7, is_manual: true, is_quick_event: true }, true), 'live-quick');
  assert.equal(calendarEditMode({ id: 7, is_manual: true, is_quick_event: true }, false), null);
  assert.equal(calendarEditMode({ id: 'demo-7' }, true), 'preview');
  assert.equal(calendarEditMode({ id: 'demo-7' }, false), 'preview');
});
