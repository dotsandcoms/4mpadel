import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EVENT_FIELD_TYPES, DIVISION_EDITOR_FIELDS, eventEditorDraft } from '../../src/pages/admin-preview/eventEditorFields.js';
import { eventDetailsPatch, divisionDetailsPatch } from '../../src/pages/admin-preview/saveEventDetails.js';
test('live builder formatted fields use rich-text controls without changing their HTML storage', () => {
  for (const field of ['description', 'points_breakdown', 'rules_regs', 'withdrawal_substitution']) assert.equal(EVENT_FIELD_TYPES[field], 'richtext');
  assert.equal(DIVISION_EDITOR_FIELDS.details, 'richtext');
  const event = { event_name: 'Open', description: '<p>Keep <strong>formatting</strong>.</p>' };
  assert.deepEqual(eventDetailsPatch(event, eventEditorDraft(event)), {});
  assert.deepEqual(eventDetailsPatch(event, { description: '<h3>Updated</h3><ul><li>Rule</li></ul>' }), { description: '<h3>Updated</h3><ul><li>Rule</li></ul>' });
  assert.deepEqual(divisionDetailsPatch({ details: '<p>Original</p>' }, { details: '<p><b>Updated</b></p>' }), { details: '<p><b>Updated</b></p>' });
});
